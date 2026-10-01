import { useState, useEffect, useRef, useCallback } from 'react'
import { LocalTagData, DeepLLanguage } from '../types'
import { tagSearchWorker, normalize } from '../utils'
import { translationCache } from '../utils/translationCache'
import { shouldTranslate, getSkipReason } from '../utils/translationFilters'
import { cacheSearch } from '../utils/aggressiveCache'
import { AGGRESSIVE_CACHE_CONFIG } from '../config/aggressiveCacheConfig'

type TagData = LocalTagData;

interface UseTagSearchReturn {
  searchTerm: string;
  setSearchTerm: (term: string) => void;
  selectedCategory: string;
  setSelectedCategory: (category: string) => void;
  searchResults: LocalTagData[];
  suggestions: LocalTagData[];
  synonymSuggestions: string[];
  isLoading: boolean;
  isSuggestionsLoading: boolean;
  isTransitioning: boolean;
  isWorkerReady: boolean;
  isWorkerInitializing: boolean;
  hasSearched: boolean;
  isTranslating: boolean;
  // Translation settings
  resolvedCanonicalTerm: string;
  originalInputTerm: string;
  translatedTerm: string;
  lastTranslatedFor: string;
  autoTranslateEnabled: boolean;
  setAutoTranslateEnabled: (enabled: boolean) => void;
  inputLanguage: string; // Changed from 'auto' | 'es' | 'en' to string
  setInputLanguage: (lang: string) => void;
  availableLanguages: DeepLLanguage[];
  isLoadingLanguages: boolean;
  getPopularTags: (limit?: number, category?: string) => Promise<LocalTagData[]>;
  getCategoryStats: () => Promise<Record<string, number>>;
  findExactTag: (tagName: string) => Promise<LocalTagData | undefined>;
  getRelatedTags: (term: string, limit?: number) => Promise<LocalTagData[]>;
  totalTags: number;
  aliasResolverEnabled: boolean;
  setAliasResolverEnabled: (enabled: boolean) => void;
}





// Worker readiness survives remounts (e.g. navigating Home -> Tag -> Home)
let _workerReady = false;
let _totalTags = 0;

// --- Serverless backend (translation / languages) ---------------------------
// The site deploys to Vercel (/api/*) and Netlify (/.netlify/functions/*).
// Hostname sniffing broke on custom domains, so try /api first, fall back to
// the Netlify path, and remember whichever answered for the rest of the session.
const SERVERLESS_BASES = ['/api', '/.netlify/functions'];
const SERVERLESS_BASE_KEY = 'serverlessBase';
let resolvedServerlessBase: string | null = (() => {
  try {
    const saved = sessionStorage.getItem(SERVERLESS_BASE_KEY);
    return saved && SERVERLESS_BASES.includes(saved) ? saved : null;
  } catch {
    return null;
  }
})();

/** A real function answered (not a 404 page or the SPA's index.html fallback). */
const isFunctionResponse = (res: Response) =>
  res.status !== 404 && (res.headers.get('content-type') || '').includes('application/json');

// Module-level promises so the language lists are fetched at most once per page load,
// no matter how many effects / hook instances (or StrictMode double-invocations) ask for them.
let staticLanguagesPromise: Promise<DeepLLanguage[]> | null = null;
function loadStaticLanguages(): Promise<DeepLLanguage[]> {
  if (!staticLanguagesPromise) {
    staticLanguagesPromise = fetch('/data/deepl-languages.json', { cache: 'force-cache' })
      .then(res => (res.ok ? (res.json() as Promise<DeepLLanguage[]>) : []))
      .then(list => list.filter(l => l.language !== 'EN'))
      .catch(() => {
        staticLanguagesPromise = null; // allow a retry later
        return [];
      });
  }
  return staticLanguagesPromise;
}

let remoteLanguagesPromise: Promise<DeepLLanguage[]> | null = null;
function loadRemoteLanguages(): Promise<DeepLLanguage[]> {
  if (!remoteLanguagesPromise) {
    remoteLanguagesPromise = (async () => {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 6000);
      try {
        const response = await fetchServerless('/languages?type=source', { signal: controller.signal });
        if (!response.ok) return [];
        const data = await response.json() as { success?: boolean; data?: DeepLLanguage[] };
        return data.success && Array.isArray(data.data) ? data.data.filter(l => l.language !== 'EN') : [];
      } finally {
        clearTimeout(timeout);
      }
    })().catch(() => {
      remoteLanguagesPromise = null; // allow a retry later
      return [];
    });
  }
  return remoteLanguagesPromise;
}

export async function fetchServerless(path: string, init?: RequestInit): Promise<Response> {
  const order = resolvedServerlessBase
    ? [resolvedServerlessBase, ...SERVERLESS_BASES.filter(b => b !== resolvedServerlessBase)]
    : SERVERLESS_BASES;
  let lastResponse: Response | null = null;
  let lastError: unknown = null;
  for (const base of order) {
    try {
      const res = await fetch(`${base}${path}`, init);
      if (isFunctionResponse(res)) {
        if (resolvedServerlessBase !== base) {
          resolvedServerlessBase = base;
          try { sessionStorage.setItem(SERVERLESS_BASE_KEY, base); } catch { /* storage unavailable */ }
        }
        return res;
      }
      lastResponse = res;
    } catch (error) {
      if (init?.signal?.aborted) throw error;
      lastError = error; // network error: try the next backend
    }
  }
  if (lastResponse) return lastResponse;
  throw lastError instanceof Error ? lastError : new Error('No serverless backend available');
}

export interface UseTagSearchOptions {
  /** Initial search term (e.g. from the ?q= URL parameter). */
  initialTerm?: string;
  /** Initial category (e.g. from the ?cat= URL parameter). */
  initialCategory?: string;
}

const useTagSearch = (options: UseTagSearchOptions = {}): UseTagSearchReturn => {
  const [searchTerm, setSearchTerm] = useState(options.initialTerm ?? '')
  const [selectedCategory, setSelectedCategory] = useState(options.initialCategory ?? 'all')
  const [searchResults, setSearchResults] = useState<LocalTagData[]>([])
  // Latest result count, read by the search effect without making it re-run whenever results change
  const searchResultsLengthRef = useRef(0)
  searchResultsLengthRef.current = searchResults.length
  const [suggestions, setSuggestions] = useState<LocalTagData[]>([])
  const [synonymSuggestions, setSynonymSuggestions] = useState<string[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [isSuggestionsLoading, setIsSuggestionsLoading] = useState(false)
  const [isTransitioning] = useState(false)
  const [isWorkerReady, setIsWorkerReady] = useState(_workerReady)
  const [isWorkerInitializing, setIsWorkerInitializing] = useState(!_workerReady)
  const [hasSearched, setHasSearched] = useState(false)
  const [isTranslating, setIsTranslating] = useState(false);
  const [lastTranslatedFor, setLastTranslatedFor] = useState<string>('');
  const [translatedTerm, setTranslatedTerm] = useState<string>('');
  const [resolvedCanonicalTerm, setResolvedCanonicalTerm] = useState<string>('');
  const [originalInputTerm, setOriginalInputTerm] = useState<string>('');
  const [totalTags, setTotalTags] = useState<number>(_totalTags);
  const [aliasResolverEnabled, setAliasResolverEnabled] = useState<boolean>(() => {
    const saved = localStorage.getItem('aliasResolverEnabled');
    return saved !== null ? saved === 'true' : true; // por defecto activado
  });
  
  const [autoTranslateEnabled, setAutoTranslateEnabled] = useState<boolean>(() => {
    const saved = localStorage.getItem('autoTranslateEnabled');
  // Default is now FALSE unless user previously enabled it (persisted in localStorage)
  const defaultValue = saved !== null ? saved === 'true' : false;
  // Debug log removed for production cleanliness
    return defaultValue;
  });
  const [inputLanguage, setInputLanguage] = useState<string>(() => {
    const saved = localStorage.getItem('inputLanguage');
    if (saved && saved !== 'EN') return saved; // Reset if EN is saved
    
    // Default to Spanish instead of auto-detecting
    return 'ES';
  });

  const [availableLanguages, setAvailableLanguages] = useState<DeepLLanguage[]>([]);
  const [isLoadingLanguages, setIsLoadingLanguages] = useState<boolean>(false);

  const searchTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const suggestionsTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const translateTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  const prevAutoTranslateEnabledRef = useRef<boolean>(autoTranslateEnabled);
  const prevInputLanguageRef = useRef<string>(inputLanguage);

  // Persist settings
  useEffect(() => {
    localStorage.setItem('autoTranslateEnabled', String(autoTranslateEnabled));
  }, [autoTranslateEnabled]);

  useEffect(() => {
    localStorage.setItem('aliasResolverEnabled', String(aliasResolverEnabled));
  }, [aliasResolverEnabled]);

  // When user disables auto-translate, immediately clear any stale translated term/highlighting
  useEffect(() => {
    if (!autoTranslateEnabled) {
      setTranslatedTerm('');
      setLastTranslatedFor('');
    }
  }, [autoTranslateEnabled]);

  useEffect(() => {
    localStorage.setItem('inputLanguage', inputLanguage);
  }, [inputLanguage]);

  // Fetch available languages from DeepL API
  const fetchLanguages = useCallback(async () => {
    if (isLoadingLanguages || availableLanguages.length > 0) return;
    setIsLoadingLanguages(true);
    try {
      let current = availableLanguages;
      const staticData = await loadStaticLanguages();
      if (staticData.length > 0) {
        current = staticData;
        setAvailableLanguages(staticData);
      }
      if (!autoTranslateEnabled) return; // Lazy: solo si está habilitado
      const already = new Set(current.map(l => l.language));
      const needImportant = ['ES','JA','KO','ZH','FR','DE'];
      const missingImportant = needImportant.some(c => !already.has(c));
      if (!missingImportant) return;
      const remoteLanguages = await loadRemoteLanguages();
      if (remoteLanguages.length > 0) {
        const mergedMap: Record<string, DeepLLanguage> = {};
        [...remoteLanguages, ...current].forEach(l => { mergedMap[l.language] = l; });
        setAvailableLanguages(Object.values(mergedMap));
      }
    } finally {
      setIsLoadingLanguages(false);
    }
  }, [autoTranslateEnabled, availableLanguages, isLoadingLanguages]);

  // Wait for the worker dataset. The worker queues every command until
  // tags.json is loaded, so INIT resolves exactly when searches can run.
  useEffect(() => {
    let cancelled = false;

    const initWorker = async (attempt = 0) => {
      if (cancelled) return;
      if (_workerReady) {
        setTotalTags(_totalTags);
        setIsWorkerReady(true);
        setIsWorkerInitializing(false);
        return;
      }
      try {
        await tagSearchWorker.postMessage('INIT');
        const stats = await tagSearchWorker.postMessage('GET_STATS') as { total: number; categories: Record<string, number> };
        if (stats && typeof stats.total === 'number') {
          _workerReady = true;
          _totalTags = stats.total;
          if (cancelled) return;
          setTotalTags(stats.total);
          setIsWorkerReady(true);
          setIsWorkerInitializing(false);
          return;
        }
        throw new Error('Invalid worker stats');
      } catch {
        if (cancelled) return;
        if (attempt < 5) {
          setTimeout(() => initWorker(attempt + 1), 1000 + attempt * 500);
        } else {
          setIsWorkerInitializing(false);
        }
      }
    };

    initWorker();

    return () => {
      cancelled = true;
      if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current);
      if (suggestionsTimeoutRef.current) clearTimeout(suggestionsTimeoutRef.current);
      if (abortControllerRef.current) abortControllerRef.current.abort();
    };
  }, []);

  // Cargar idiomas cuando cambian dependencias relevantes (sin reiniciar worker)
  useEffect(() => {
    fetchLanguages();
  }, [fetchLanguages]);

  // Translate the search term using Netlify Function before searching
  const translateTerm = useCallback(async (term: string): Promise<string> => {
  // Removed detailed translateTerm call log
    
    // Skip translation if disabled
    if (!autoTranslateEnabled) {
  // Removed skip log
      return term;
    }

    const trimmed = term.trim();
    if (!trimmed) {
  // Removed empty term log
      return '';
    }

    // Skip if input language is explicitly English
    if (inputLanguage === 'EN') {
  // Removed EN skip log
      return trimmed;
    }

    // Apply improved filters to avoid unnecessary translations
    const shouldTranslateResult = shouldTranslate(trimmed);
  // Removed filter result log
    
    if (!shouldTranslateResult) {
  // Skip reason computed but not logged (previously for debugging)
  getSkipReason(trimmed);
      return trimmed;
    }
    
    // Check cache first
    const cachedTranslation = translationCache.get(trimmed, inputLanguage, 'EN');
    if (cachedTranslation) {
  // Removed cache hit log
      return cachedTranslation;
    }

    // Mapa global en módulo para colapsar solicitudes (adjunto a window para reutilización entre hooks si existiera)
    const globalAny = ((typeof window !== 'undefined') ? window : {}) as { __inFlightTranslations?: Map<string, Promise<string>> };
    const inFlight = (globalAny.__inFlightTranslations ??= new Map<string, Promise<string>>());
    const key = `${inputLanguage || 'auto'}::${trimmed}`;
    if (inFlight.has(key)) {
      return inFlight.get(key)!; // reutiliza la misma promesa
    }

    setIsTranslating(true);
  // Removed requesting translation log
    try {
      const payload: { text: string; target_lang: string; source_lang?: string } = { text: trimmed, target_lang: 'EN' };
      // Set source_lang if not auto
      if (inputLanguage !== 'auto') {
        payload.source_lang = inputLanguage;
      }

      const doFetch = () => fetchServerless('/translate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      // Registrar promesa antes de ejecutar para colapsar subsiguientes
      const p = (async () => {
        let attempt = 0;
        let res: Response | null = null;
        while (attempt < 2) { // 1 retry básico para fallos transitorios
          res = await doFetch();
          if (res.ok || res.status < 500) break; // no reintentar errores cliente
          attempt++;
          await new Promise(r => setTimeout(r, 400 * attempt));
        }
        if (!res!.ok) {
          return trimmed;
        }
        const data = await res!.json();
        const t = data?.data?.translatedText || trimmed;
        if (t !== trimmed) {
          translationCache.set(trimmed, t, inputLanguage, 'EN');
        }
        return t;
      })();
      inFlight.set(key, p);
      const t = await p.finally(() => {
        inFlight.delete(key);
      });
      return t;
  } catch {
      return trimmed;
    } finally {
      setIsTranslating(false);
    }
  }, [autoTranslateEnabled, inputLanguage]);
  const searchTags = useCallback(async (term: string, category: string, limit = 50): Promise<TagData[]> => {
    if (!isWorkerReady) {
      return [];
    }
    
    // Crear clave de caché para búsquedas
    const cacheKey = `search_${term}_${category}_${limit}`;
    
    // Verificar caché agresivo primero
    const cachedResults = cacheSearch.get<LocalTagData[]>(cacheKey);
    if (cachedResults) {
      return cachedResults;
    }
    
    try {
      const results = await tagSearchWorker.postMessage<LocalTagData[]>('SEARCH_TAGS', { 
        term, 
        category, 
        limit 
      });
      
      // Guardar en caché agresivo si hay resultados
      if (results && results.length > 0) {
        cacheSearch.set(cacheKey, results, AGGRESSIVE_CACHE_CONFIG.CACHE_DURATIONS.SEARCH_RESULTS);
      }
      
      return results || [];
  } catch {
      return [];
    }
  }, [isWorkerReady]);

  const getSuggestions = useCallback(async (term: string, category: string, limit = 5): Promise<TagData[]> => {
    if (!isWorkerReady) {
      return [];
    }
    
    // Crear clave de caché para sugerencias
    const cacheKey = `suggestions_${term}_${category}_${limit}`;
    
    // Verificar caché agresivo primero
    const cachedSuggestions = cacheSearch.get<LocalTagData[]>(cacheKey);
    if (cachedSuggestions) {
      return cachedSuggestions;
    }
    
    try {
      const results = await tagSearchWorker.postMessage<LocalTagData[]>('GET_SUGGESTIONS', { 
        term, 
        category, 
        limit 
      });
      
      // Guardar en caché agresivo si hay resultados
      if (results && results.length > 0) {
        cacheSearch.set(cacheKey, results, AGGRESSIVE_CACHE_CONFIG.CACHE_DURATIONS.SEARCH_RESULTS);
      }
      
      return results || [];
  } catch {
      return [];
    }
  }, [isWorkerReady]);



  
  const findExactTag = useCallback(async (tagName: string): Promise<LocalTagData | undefined> => {
    try {
      const results = await searchTags(tagName, 'all', 1);
      return results.find(tag => tag.name.toLowerCase() === tagName.toLowerCase());
    } catch {
      // Silently handle exact tag search error
      return undefined;
    }
  }, [searchTags]);

  const getRealSynonyms = useCallback(async (term: string): Promise<string[]> => {
    try {
      if (!isWorkerReady || !term.trim()) return [];
      // Usando función normalize del utilitario común
      const q = normalize(term);
      // Buscar el tag exacto por nombre normalizado
      const exactTag = await findExactTag(term.replace(/\s+/g, '_'));
      if (exactTag) {
        return [];
      }
      try {
        const aliasResult = await tagSearchWorker.postMessage<{name: string, aliases: string[]}>('GET_SYNONYM', { term });
        if (aliasResult) {
          // Normalizados para comparación
          const canonicalNormalized = normalize(aliasResult.name || '');
          // Si el usuario ya escribió el nombre canónico, NO sugerir alias inverso (evita sugerir 'fuck' cuando ya es 'sex')
          if (canonicalNormalized === q) {
            return [];
          }
          // Usuario escribió un alias: sugerir únicamente el canónico primero y opcionalmente otros alias útiles
          const out: string[] = [];
          if (aliasResult.name) out.push(aliasResult.name);
          if (aliasResult.aliases && aliasResult.aliases.length > 0) {
            for (const a of aliasResult.aliases) {
              const na = normalize(a);
              // No incluir el alias que el usuario escribió ni duplicados ni el canónico repetido
              if (na !== q && na !== canonicalNormalized && !out.includes(a)) {
                out.push(a);
              }
              if (out.length >= 3) break;
            }
          }
          return out.slice(0, 3);
        }
      } catch {
        // Silently handle worker synonym error
      }
      const similarTags = await getSuggestions(term, 'all', 20);
      const synonyms: string[] = [];
      for (const tag of similarTags) {
        if (tag.aliases && tag.aliases.some(alias => alias.replace(/\s+/g, '_').toLowerCase() === q)) {
          synonyms.push(tag.name);
          if (synonyms.length >= 3) break;
        }
      }
      return synonyms;
    } catch {
      // Silently handle real synonyms error
      return [];
    }
  }, [isWorkerReady, findExactTag, getSuggestions]);

  // Suggestions (debounced). Declared after getRealSynonyms so it can list it as a dependency;
  // both callbacks only change when isWorkerReady changes, so this does not add extra runs.
  useEffect(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    
    abortControllerRef.current = new AbortController();
    
    const fetchSuggestions = async () => {
      const currentTerm = searchTerm.trim();
      
      if (!currentTerm) {
        setSuggestions([]);
        setSynonymSuggestions([]);
        setIsSuggestionsLoading(false);
        return;
      }
      
      if (!isWorkerReady) {
        return;
      }
      
      try {
        setIsSuggestionsLoading(true);
        setSuggestions([]);
        
        // Use translated term if available, similar to main search function
        const effectiveTerm = (lastTranslatedFor === currentTerm && translatedTerm)
          ? translatedTerm
          : currentTerm;
        
        const suggestionResults = await getSuggestions(effectiveTerm, selectedCategory, 5);
        
        if (!abortControllerRef.current?.signal.aborted) {
          setSuggestions(suggestionResults || []);
          
          if (currentTerm.length > 2) {
            // Buscar sinónimos reales solo si no hay coincidencias exactas
            const hasExactMatch = suggestionResults.some(tag => 
              tag.name.toLowerCase() === currentTerm.toLowerCase()
            );
            
            if (!hasExactMatch) {
              const realSynonyms = await getRealSynonyms(effectiveTerm);
              setSynonymSuggestions(realSynonyms);
            } else {
              setSynonymSuggestions([]);
            }
          } else {
            setSynonymSuggestions([]);
          }
        }
      } catch {
        if (!abortControllerRef.current?.signal.aborted) {
          // Silently handle suggestions error
          setSuggestions([]);
          setSynonymSuggestions([]);
        }
      } finally {
        if (!abortControllerRef.current?.signal.aborted) {
          setIsSuggestionsLoading(false);
        }
      }
    };
    
    if (suggestionsTimeoutRef.current) {
      clearTimeout(suggestionsTimeoutRef.current);
    }
    
    suggestionsTimeoutRef.current = setTimeout(() => {
      fetchSuggestions();
    }, 150);
    
    return () => {
      if (suggestionsTimeoutRef.current) {
        clearTimeout(suggestionsTimeoutRef.current);
      }
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    };
  }, [searchTerm, selectedCategory, isWorkerReady, lastTranslatedFor, translatedTerm, getSuggestions, getRealSynonyms]);
  
  const getRelatedTags = useCallback(async (term: string, limit = 5): Promise<LocalTagData[]> => {
    try {
      return await getSuggestions(term, 'all', limit);
    } catch {
      // Silently handle related tags error
      return [];
    }
  }, [getSuggestions]);
  
  const getPopularTags = useCallback(async (limit = 10, category = 'all'): Promise<LocalTagData[]> => {
    // Crear clave de caché para tags populares
    const cacheKey = `popular_tags_${category}_${limit}`;
    
    // Verificar caché agresivo primero
    const cachedPopular = cacheSearch.get<LocalTagData[]>(cacheKey);
    if (cachedPopular) {
      return cachedPopular;
    }
    
    try {
      const results = await tagSearchWorker.postMessage<LocalTagData[]>('GET_POPULAR_TAGS', { 
        category, 
        limit 
      });
      
      // Guardar en caché agresivo si hay resultados
      if (results && results.length > 0) {
        cacheSearch.set(cacheKey, results, AGGRESSIVE_CACHE_CONFIG.CACHE_DURATIONS.TAGS);
      }
      
      return results || [];
    } catch {
      // Silently handle popular tags error
      return [];
    }
  }, []);
  
  const getCategoryStats = useCallback(async (): Promise<Record<string, number>> => {
    try {
      const stats = await tagSearchWorker.postMessage<{categories: Record<string, number>}>('GET_STATS');
      return stats?.categories || {};
    } catch {
      // Silently handle category stats error
      return {};
    }
  }, []);
  

  
  useEffect(() => {
    const search = async () => {
      if (!isWorkerReady) {
        return;
      }
      
      if (searchTerm.trim() === '') {
        setHasSearched(false);
        setIsLoading(true);
        
        try {
          const popularResults = await getPopularTags(
            selectedCategory === 'tag_groups' ? 5000 : 50,
            selectedCategory
          );
          setSearchResults(popularResults);
        } catch {
          // Silently handle popular tags loading error
          setSearchResults([]);
        } finally {
          setIsLoading(false);
        }
        return;
      }
      
      setHasSearched(true);
      
      const shouldShowLoading = searchResultsLengthRef.current === 0;
      if (shouldShowLoading) {
        setIsLoading(true);
      }
      
      try {
        // Starting search
        let effectiveTerm = (lastTranslatedFor === searchTerm && translatedTerm)
          ? translatedTerm
          : searchTerm;
        
        // Track original input for user feedback
        setOriginalInputTerm(searchTerm);
        
        // Si el término efectivo es un alias, usar el nombre canónico automáticamente
  if (aliasResolverEnabled && selectedCategory !== 'tag_groups' && effectiveTerm) {
          try {
            const aliasResult = await tagSearchWorker.postMessage<{name: string, aliases: string[]}>('GET_SYNONYM', { term: effectiveTerm });
            if (aliasResult && aliasResult.name) {
              // Si encontramos un tag canónico, usar ese en lugar del alias
              // Usando función normalize del utilitario común
              if (normalize(aliasResult.name) !== normalize(effectiveTerm)) {
                // Resolving alias
                effectiveTerm = aliasResult.name;
                setResolvedCanonicalTerm(aliasResult.name);
              } else {
                setResolvedCanonicalTerm('');
              }
            } else {
              setResolvedCanonicalTerm('');
            }
          } catch {
            // Silently handle alias resolution error
            setResolvedCanonicalTerm('');
          }
  } else {
          setResolvedCanonicalTerm('');
        }
        
        // Normalize spaces to underscores for tag matching (e.g., "red eyes" -> "red_eyes")
        const queryTerm = selectedCategory === 'tag_groups'
          ? effectiveTerm
          : effectiveTerm.replace(/\s+/g, '_').toLowerCase();
        // Using search terms
        const results = await searchTags(
          queryTerm,
          selectedCategory,
          selectedCategory === 'tag_groups' ? 5000 : 50
        );
        // Search completed
        setSearchResults(results);
      } catch {
        // Silently handle search error
        setSearchResults([]);
      } finally {
        setIsLoading(false);
      }
     };
    
    if (searchTimeoutRef.current) {
      clearTimeout(searchTimeoutRef.current);
    }
    
    searchTimeoutRef.current = setTimeout(() => {
      search();
    }, 300);
    
    return () => {
      if (searchTimeoutRef.current) {
        clearTimeout(searchTimeoutRef.current);
      }
    };
  }, [searchTerm, selectedCategory, searchTags, isWorkerReady, getPopularTags, lastTranslatedFor, translatedTerm, aliasResolverEnabled, autoTranslateEnabled, inputLanguage]);

  // Orchestrate translation: when searchTerm OR autoTranslate settings change
  useEffect(() => {
    // Clear previous translation debounce
    if (translateTimeoutRef.current) clearTimeout(translateTimeoutRef.current);

    const term = searchTerm.trim();
  const justEnabled = autoTranslateEnabled && !prevAutoTranslateEnabledRef.current;
  const languageChanged = prevInputLanguageRef.current !== inputLanguage;

    // If disabled now, clear translated state
    if (!autoTranslateEnabled) {
      setTranslatedTerm('');
      setLastTranslatedFor('');
      prevAutoTranslateEnabledRef.current = autoTranslateEnabled;
      return;
    }

    if (!term) {
      setTranslatedTerm('');
      setLastTranslatedFor('');
      prevAutoTranslateEnabledRef.current = autoTranslateEnabled;
      return;
    }

    // Force re-translate if language changed or we just enabled
  const needRetranslate = justEnabled || languageChanged || lastTranslatedFor !== term || !translatedTerm;
    if (!needRetranslate) {
      prevAutoTranslateEnabledRef.current = autoTranslateEnabled;
      return; // nothing to do
    }

    const run = async () => {
      const t = await translateTerm(term);
      setTranslatedTerm(t);
      setLastTranslatedFor(term);
    };

    // If just enabled, run immediately; else debounce as usual
  if (justEnabled || languageChanged) {
      run();
    } else {
      translateTimeoutRef.current = setTimeout(run, 800);
    }

    prevAutoTranslateEnabledRef.current = autoTranslateEnabled;
  prevInputLanguageRef.current = inputLanguage;

    return () => {
      if (translateTimeoutRef.current) clearTimeout(translateTimeoutRef.current);
    };
  }, [searchTerm, autoTranslateEnabled, inputLanguage, translateTerm, lastTranslatedFor, translatedTerm]);

  // Disparar carga diferida de idiomas cuando el usuario active la traducción automática
  useEffect(() => {
    if (autoTranslateEnabled && availableLanguages.length === 0) {
      fetchLanguages();
    }
  }, [autoTranslateEnabled, availableLanguages.length, fetchLanguages]);

  // Pre-carga oportuna (bajo prioridad) tras idle para usuarios que quizá activen la función
  useEffect(() => {
    if ('requestIdleCallback' in window) {
      const id = window.requestIdleCallback(() => fetchLanguages());
      return () => window.cancelIdleCallback(id);
    }
    const id = setTimeout(() => fetchLanguages(), 3000);
    return () => clearTimeout(id);
  }, [fetchLanguages]);
  
  return {
    searchTerm,
    setSearchTerm,
    selectedCategory,
    setSelectedCategory,
    searchResults,
    suggestions,
    synonymSuggestions,
    isLoading,
    isSuggestionsLoading,
    isTransitioning,
    isWorkerReady,
    isWorkerInitializing,
    hasSearched,
    isTranslating,
    autoTranslateEnabled,
    setAutoTranslateEnabled,
    inputLanguage,
    setInputLanguage,
    availableLanguages,
    isLoadingLanguages,
    findExactTag,
    getRelatedTags,
    getPopularTags: (limit = 10, category = 'all') => getPopularTags(limit, category),
    getCategoryStats,
    totalTags,
  aliasResolverEnabled,
  setAliasResolverEnabled,
    // feedback fields
    translatedTerm,
    lastTranslatedFor,
    resolvedCanonicalTerm,
    originalInputTerm,
  };
};

export default useTagSearch;