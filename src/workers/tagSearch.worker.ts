// src/workers/tagSearch.worker.ts

import Fuse from 'fuse.js';
import type { IFuseOptions, Expression } from 'fuse.js';
// Note: using relative paths (no TS path alias configured)
import { baseTagFuseOptions, tagGroupFuseOptions, defaultRankingWeights, type RankingWeights } from '../config/fuseOptions';
import { advancedNormalize } from '../utils/advancedNormalization';
import { parseQuery } from '../utils/queryParser';

// --- TYPES ---
interface TagData {
  id: number;
  name: string;
  category: number;
  postCount: number;
  aliases?: string[];
}

interface WorkerRequest {
  type: string;
  payload?: any;
  requestId?: string;
}

// --- WORKER STATE & CONSTANTS ---
let fuse: Fuse<TagData>;
let tagsData: TagData[] = [];
// Tag groups index (simple text search)
interface TagGroupItem { id: string; title: string; url: string; parents: string[]; children: string[] }
let tagGroups: TagGroupItem[] = [];
let fuseTagGroups: Fuse<TagGroupItem> | null = null;
let rankingWeights: RankingWeights = { ...defaultRankingWeights };
let isInitialized = false;

const CATEGORY_MAP: { [key: string]: number } = {
  'general': 0,
  'artist': 1,
  'copyright': 3,
  'character': 4,
  'meta': 5
};

const REVERSE_CATEGORY_MAP: { [key: number]: string } = Object.fromEntries(
  Object.entries(CATEGORY_MAP).map(([key, value]) => [value, key])
);

// --- INITIALIZATION ---

/**
 * Initializes the Fuse.js instance with the provided tag data.
 * @param tags The array of tag data to index.
 * @returns A new Fuse.js instance.
 */
function initializeFuse(tags: TagData[]): Fuse<TagData> {
  // Building fresh index
  return new Fuse(tags, { ...baseTagFuseOptions });
}

/**
 * Fetches tag data and initializes the worker's state.
 * Posts an 'INITIALIZED' message on success or 'ERROR' on failure.
 */
async function init(): Promise<void> {
  if (isInitialized) return;
  try {
    const response = await fetch('/data/tags.json');
    if (!response.ok) throw new Error(`Failed to load tags.json: ${response.statusText}`);
    
    const data = await response.json();
    if (!Array.isArray(data)) throw new Error('Invalid data format: expected an array');
    
    tagsData = data;
  // Intentar cargar índice preconstruido
    try {
      const idxRes = await fetch('/data/fuse-index.json');
      if (idxRes.ok) {
        const idxJson = await idxRes.json();
    const prebuilt = Fuse.parseIndex<TagData>(idxJson);
    fuse = new Fuse(tagsData, { ...baseTagFuseOptions }, prebuilt);
    // Prebuilt tag index loaded
      } else {
        fuse = initializeFuse(tagsData);
      }
    } catch {
      fuse = initializeFuse(tagsData);
    }
    // Cargar tag-groups.json en paralelo (no bloqueante para Fuse)
    try {
      const tgRes = await fetch('/data/tag-groups.json');
      if (tgRes.ok) {
        const tg = await tgRes.json();
        if (tg && Array.isArray(tg.groups)) {
          tagGroups = tg.groups.map((g: any) => ({
            id: String(g.id), title: String(g.title), url: String(g.url),
            parents: Array.isArray(g.parents) ? g.parents.map(String) : [],
            children: Array.isArray(g.children) ? g.children.map(String) : []
          }));
          // Inicializar Fuse para tag groups
          try {
            const tgOptions: IFuseOptions<TagGroupItem> = { ...tagGroupFuseOptions };
            // Intentar cargar índice preconstruido para tag groups
            try {
              const tgIdxRes = await fetch('/data/fuse-index-tag-groups.json');
              if (tgIdxRes.ok) {
                const tgIdxJson = await tgIdxRes.json();
                const prebuiltTg = Fuse.parseIndex<TagGroupItem>(tgIdxJson);
                fuseTagGroups = new Fuse(tagGroups, tgOptions, prebuiltTg);
                // Prebuilt tag groups index loaded
              } else {
                fuseTagGroups = new Fuse(tagGroups, tgOptions);
              }
            } catch {
              fuseTagGroups = new Fuse(tagGroups, tgOptions);
            }
          } catch {
            // Silently handle Fuse initialization error for tag groups
            fuseTagGroups = null;
          }
        }
      }
    } catch {
      // Silently handle tag-groups.json loading error
      tagGroups = [];
      fuseTagGroups = null;
    }
    isInitialized = true;
    
    const categories = [...new Set(tagsData.map(t => t.category))].sort();
    
  self.postMessage({ type: 'INITIALIZED', payload: { tagCount: tagsData.length, categories } });
  } catch (error) {
    self.postMessage({ 
      type: 'ERROR', 
      payload: { 
        message: 'Error initializing search worker',
        error: error instanceof Error ? error.message : 'Unknown error'
      } 
    });
  }
}

// --- SEARCH & SUGGESTION LOGIC ---

/**
 * Normalizes search terms by converting spaces to underscores and vice versa,
 * and handles English plural/singular forms intelligently
 * @param term The search term to normalize
 * @returns Array of normalized variants
 */
function getNormalizedSearchTerms(term: string): string[] {
  const normalized = term.trim().toLowerCase();
  const variants = new Set<string>([normalized]);
  
  // Add space/underscore variants
  if (normalized.includes(' ')) {
    variants.add(normalized.replace(/\s+/g, '_'));
  }
  if (normalized.includes('_')) {
    variants.add(normalized.replace(/_/g, ' '));
  }
  // Add hyphen variants (treat hyphen as another interchangeable separator like space/underscore)
  if (/[ _]/.test(normalized) && !normalized.includes('-')) {
    variants.add(normalized.replace(/[ _]+/g, '-'));
  }
  if (normalized.includes('-')) {
    // Provide underscore and space replacements if user typed hyphen
    variants.add(normalized.replace(/-/g, ' '));
    variants.add(normalized.replace(/-/g, '_'));
  }
  // Add collapsed variant (remove spaces/underscores) to catch tags like 'lipgloss' when searching 'lip gloss'
  if (/[_\s]/.test(normalized)) {
    const collapsed = normalized.replace(/[_\s]+/g, '');
    if (collapsed.length > 0) variants.add(collapsed);
  }
  // Also add collapsed variant removing hyphens (covers 'straighton' for 'straight-on')
  if (/-/.test(normalized)) {
    const collapsedHyphen = normalized.replace(/-/g, '');
    if (collapsedHyphen.length > 0) variants.add(collapsedHyphen);
  }
  
  // Variantes de spelling comunes (grey/gray, blond/blonde)
  if (normalized.includes('grey')) {
    variants.add(normalized.replace(/grey/g, 'gray'));
  }
  if (normalized.includes('gray')) {
    variants.add(normalized.replace(/gray/g, 'grey'));
  }
  if (normalized.includes('blond') && !normalized.includes('blonde')) {
    variants.add(normalized.replace(/blond/g, 'blonde'));
  }
  if (normalized.includes('blonde')) {
    variants.add(normalized.replace(/blonde/g, 'blond'));
  }
  
  // Separación inteligente para términos colapsados (ej: "redeyes" -> "red_eyes")
  if (!/[_\s-]/.test(normalized) && normalized.length > 4) {
    const separatedVariants = generateSeparatedVariants(normalized);
    separatedVariants.forEach(v => variants.add(v));
  }
  
  // Helper function to get plural/singular variants of a single word
  function getPluralSingularVariants(word: string): string[] {
    const wordVariants = [word];
    
    if (word.length >= 3) {
      // Handle plural to singular
      if (word.endsWith('ies')) {
        // parties -> party, berries -> berry
        wordVariants.push(word.slice(0, -3) + 'y');
      } else if (word.endsWith('ves')) {
        // knives -> knife, wolves -> wolf
        wordVariants.push(word.slice(0, -3) + 'f');
        wordVariants.push(word.slice(0, -3) + 'fe');
      } else if (word.endsWith('ses') || word.endsWith('ches') || word.endsWith('shes') || word.endsWith('xes')) {
        // glasses -> glass, watches -> watch, brushes -> brush, boxes -> box
        wordVariants.push(word.slice(0, -2));
      } else if (word.endsWith('s') && !word.endsWith('ss')) {
        // nipples -> nipple, cats -> cat (but not glass -> glas)
        wordVariants.push(word.slice(0, -1));
      }
      
      // Handle singular to plural
      if (word.endsWith('y') && word.length > 2 && !'aeiou'.includes(word[word.length - 2])) {
        // party -> parties, berry -> berries
        wordVariants.push(word.slice(0, -1) + 'ies');
      } else if (word.endsWith('f')) {
        // knife -> knives, wolf -> wolves
        wordVariants.push(word.slice(0, -1) + 'ves');
      } else if (word.endsWith('fe')) {
        // life -> lives
        wordVariants.push(word.slice(0, -2) + 'ves');
      } else if (word.endsWith('s') || word.endsWith('ch') || word.endsWith('sh') || word.endsWith('x') || word.endsWith('z')) {
        // glass -> glasses, watch -> watches, brush -> brushes, box -> boxes
        wordVariants.push(word + 'es');
      } else if (!word.endsWith('s')) {
        // nipple -> nipples, cat -> cats
        wordVariants.push(word + 's');
      }
    }
    
    return wordVariants;
  }
  
  // Apply plural/singular variants to each normalized term
  Array.from(variants).forEach(variant => {
    // Handle multi-word terms
    if (/[ _-]/.test(variant)) {
  // Split by any separator, but remember original separator for reconstruction
  const words = variant.split(/[ _-]+/);
  const originalSeparators = variant.includes(' ') ? (variant.includes('_') ? '_' : ' ') : (variant.includes('-') ? '-' : '_');
      
      // Generate variants for each word position
      for (let i = 0; i < words.length; i++) {
        const wordVariants = getPluralSingularVariants(words[i]);
        wordVariants.forEach(wordVariant => {
          if (wordVariant !== words[i]) {
            const newWords = [...words];
            newWords[i] = wordVariant;
    variants.add(newWords.join(originalSeparators));
          }
        });
      }
  // Additionally add each token alone to allow matching partials ("straight_ahead" -> "straight", "ahead")
  words.forEach(w => { if (w.length > 1) variants.add(w); });
    } else {
      // Handle single words
      const wordVariants = getPluralSingularVariants(variant);
      wordVariants.forEach(wordVariant => variants.add(wordVariant));
    }
  });
  
  return Array.from(variants);
}

/**
 * Genera variantes separadas para términos colapsados
 * @param term Término colapsado (ej: "redeyes")
 * @returns Array de variantes separadas
 */
function generateSeparatedVariants(term: string): string[] {
  const variants: string[] = [];
  
  // Patrones comunes de separación
  const commonSeparations = [
    // Color + body part patterns
    /^(red|blue|green|brown|black|white|pink|purple|yellow|orange|grey|gray|blonde?)(eyes?|hair|lips?)$/,
    /^(long|short|curly|straight|wavy)(hair)$/,
    /^(big|small|large|huge|tiny)(eyes?|breasts?|ass)$/,
    // Action + object patterns
    /^(hand|finger)(job|ing)$/,
    /^(blow|foot)(job)$/,
    // Common compound words
    /^(school|swim|night|day)(girl|boy|wear|suit|dress)$/,
    /^(cat|dog|fox|wolf)(girl|boy|ears?|tail)$/,
    /^(under|over)(wear|shirt|dress)$/,
  ];
  
  // Aplicar patrones de separación
  for (const pattern of commonSeparations) {
    const match = term.match(pattern);
    if (match) {
      const [, part1, part2] = match;
      variants.push(`${part1}_${part2}`);
      variants.push(`${part1} ${part2}`);
      variants.push(`${part1}-${part2}`);
      break; // Solo aplicar el primer patrón que coincida
    }
  }
  
  // Separación genérica para términos largos (dividir en mitades)
  if (variants.length === 0 && term.length >= 6) {
    const mid = Math.floor(term.length / 2);
    const part1 = term.substring(0, mid);
    const part2 = term.substring(mid);
    
    // Solo agregar si ambas partes tienen al menos 2 caracteres
    if (part1.length >= 2 && part2.length >= 2) {
      variants.push(`${part1}_${part2}`);
      variants.push(`${part1} ${part2}`);
    }
  }
  
  return variants;
}

/**
 * Calculates match level based on how the search term matches the tag name
 * @param tagName The tag name to check
 * @param searchTerms Array of search term variants
 * @returns Match level (1-3, lower is better)
 */
function calculateMatchLevel(tagName: string, searchTerms: string[]): number {
  const name = tagName.toLowerCase();
  const words = name.split(/[\s_-]+/);
  const searchQuery = searchTerms.join(' ').toLowerCase();

  // Level 0: Exact full tag match (either as complete query or individual term)
  if (name === searchQuery) return 0;
  for (const term of searchTerms) {
    if (!term) continue;
    if (name === term) return 0;
  }

  // Count how many search terms are found in the tag
  let matchingTerms = 0;
  let hasStartMatch = false;
  let hasWordMatch = false;

  for (const term of searchTerms) {
    if (!term) continue;
    
    // Check if tag starts with this term
    if (name.startsWith(term) || name.startsWith(term + '_') || name.startsWith(term + ' ') || name.startsWith(term + '-')) {
      hasStartMatch = true;
      matchingTerms++;
    }
    // Check if first word equals term
    else if (words.length > 1 && words[0] === term) {
      hasStartMatch = true;
      matchingTerms++;
    }
    // Check if any word matches or starts with term
    else if (words.some(w => w === term || w.startsWith(term))) {
      hasWordMatch = true;
      matchingTerms++;
    }
    // Check if term is contained as substring
    else if (name.includes(term)) {
      matchingTerms++;
    }
  }

  // Special priority for multi-term matches that form coherent phrases
  if (matchingTerms >= 2) {
    if (hasStartMatch) return 0; // Multiple terms with start match gets highest priority
    if (hasWordMatch) return 1; // Multiple terms with word match
    return 2; // Multiple terms substring match
  }
  
  // Single term matches
  if (hasStartMatch) return 1; // Single term start match
  if (hasWordMatch) return 2; // Single term word match
  if (matchingTerms >= 1) return 3; // Single term substring match

  // Level 4: Fuzzy only
  return 4;
}

/**
 * Searches tags based on a term, category, and limit.
 * Implements a 3-level priority system for relevance.
 * @param term The search term.
 * @param category The category to filter by.
 * @param limit The maximum number of results to return.
 * @returns A sorted array of matching tags.
 */
function handleSearch(term: string, category: string = 'all', limit: number = 50): TagData[] {
  if (!isInitialized || !fuse) return [];
  const original = term;
  const parsed = parseQuery(original || '');
  if (parsed.category && category === 'all') category = parsed.category; // override if provided
  const searchTerm = parsed.includes.concat(parsed.phrases).join(' ').trim().toLowerCase() || term.trim().toLowerCase();
  const advNorm = advancedNormalize(searchTerm);
  const variants = advNorm.variants;
  // Performing search

  // Modo Tag Groups primero: cubrir caso de término vacío y con término
  if (category === 'tag_groups') {
    const sorted = [...tagGroups].sort((a, b) => (b.children.length + b.parents.length) - (a.children.length + a.parents.length));
    const mapGroup = (g: TagGroupItem, idx: number): TagData => ({
      id: 100000000 + idx,
      name: `tag_group:${g.id}`,
      category: 5,
      postCount: (g.children?.length || 0) + (g.parents?.length || 0),
      aliases: [g.title]
    });
    const pick = (items: TagGroupItem[]) => items.slice(0, limit).map(mapGroup);

    if (!searchTerm) {
      return pick(sorted);
    }
    // Fuzzy en tag groups usando fuseTagGroups, con refuerzo por prefix
    if (fuseTagGroups) {
      const tgQueries: Expression[] = [{ id: `'${searchTerm}` }, { title: `'${searchTerm}` }];
      const tgResults = tgQueries.flatMap(q => fuseTagGroups!.search(q, { limit: limit * 2 }));
      // Dedupe por id y promueve los que empiezan con el término
      const seen = new Set<string>();
      const ranked: Array<{ g: TagGroupItem; level: number; score: number }> = [];
      tgResults.forEach(r => {
        const g = r.item;
        if (seen.has(g.id)) return;
        seen.add(g.id);
        const starts = g.id.toLowerCase().startsWith(searchTerm) || g.title.toLowerCase().startsWith(searchTerm);
        ranked.push({ g, level: starts ? 1 : 3, score: r.score ?? 0 });
      });
      ranked.sort((a, b) => a.level - b.level || a.score - b.score || ((b.g.children.length + b.g.parents.length) - (a.g.children.length + a.g.parents.length)));
      return ranked.slice(0, limit).map((r, idx) => mapGroup(r.g, idx));
    }
    // Fallback simple si no hay fuseTagGroups
    const termLc = searchTerm;
    const matches = sorted.filter(g => g.id.toLowerCase().includes(termLc) || g.title.toLowerCase().includes(termLc));
    return pick(matches);
  }

  // Return popular tags if search term is empty
  if (!searchTerm) {
    // For 'all' include tag groups mixed with popular tags
    if (category === 'all') {
      const popularTags = [...tagsData].sort((a, b) => b.postCount - a.postCount);
      const popularGroups = [...tagGroups]
        .sort((a, b) => (b.children.length + b.parents.length) - (a.children.length + a.parents.length));

      // Interleave: favor tags but inject some groups
      const maxGroupTake = Math.max(1, Math.min(popularGroups.length, Math.ceil(limit / 4)));
      const mappedGroups: TagData[] = popularGroups.slice(0, maxGroupTake).map((g, idx) => ({
        id: 400000000 + idx,
        name: `tag_group:${g.id}`,
        category: 5,
        postCount: (g.children?.length || 0) + (g.parents?.length || 0),
        aliases: [g.title]
      }));

      const output: TagData[] = [];
      let t = 0, g = 0;
      // Pattern: 3 tags, 1 group
      while (output.length < limit && (t < popularTags.length || g < mappedGroups.length)) {
        for (let i = 0; i < 3 && output.length < limit && t < popularTags.length; i++) {
          output.push(popularTags[t++]);
        }
        if (output.length < limit && g < mappedGroups.length) {
          output.push(mappedGroups[g++]);
        }
      }
      return output.slice(0, limit);
    }

    let popularTags = tagsData;
    if (CATEGORY_MAP[category] !== undefined) {
      popularTags = tagsData.filter(tag => tag.category === CATEGORY_MAP[category]);
    }
    return popularTags.sort((a, b) => b.postCount - a.postCount).slice(0, limit);
  }

  const searchTerms = getNormalizedSearchTerms(searchTerm).concat(variants).slice(0,30);
  const allResults: Array<{ item: TagData; score: number; level: number; viaAlias?: boolean }> = [];

  // Pre-calculate query tokens for tag group boosting (split original FULL term, not reduced)
  const queryTokens = new Set<string>();
  original.split(/[_\-\s]+/).forEach(tok => { const t = tok.trim().toLowerCase(); if (t.length > 1) queryTokens.add(t); });
  // Also include parsed includes/phrases individually
  parsed.includes.forEach(i => { if (i.length>1) queryTokens.add(i); });
  parsed.phrases.forEach(p => p.split(/[_\-\s]+/).forEach(w => { if (w.length>1) queryTokens.add(w); }));

  // Filter by category if needed
  const filteredTags = category === 'all' 
    ? tagsData 
    : tagsData.filter(tag => tag.category === CATEGORY_MAP[category]);

  // 1. Direct search by match levels
  filteredTags.forEach(tag => {
    const level = calculateMatchLevel(tag.name, searchTerms);
    if (level <= 2) {
      const viaAlias = tag.aliases?.some(a => a.toLowerCase() === searchTerm);
      allResults.push({ item: tag, score: 0, level, viaAlias });
    }
  });

  // Include Tag Groups in 'all' when searching using Fuse for groups
  if (category === 'all' && tagGroups.length) {
    // First: manual token-based inclusion (ensures presence & priority)
    if (queryTokens.size) {
      const tokenArray = Array.from(queryTokens);
      const manualMatched: TagData[] = [];
      tagGroups.forEach((g, idx) => {
        const gid = g.id.toLowerCase();
        const title = g.title.toLowerCase();
        
        // Split group id and title into words for whole word matching
        const gidWords = gid.split(/[_\-\s]+/);
        const titleWords = title.split(/[_\-\s]+/);
        
        // Check if any search token matches a complete word in group id or title
        const matched = tokenArray.some(t => {
          // Exact match or starts with (for prefix matching)
          if (gid === t || gid.startsWith(t) || title === t || title.startsWith(t)) {
            return true;
          }
          // Whole word match in group id or title
          return gidWords.includes(t) || titleWords.includes(t);
        });
        
        if (matched) {
          manualMatched.push({
            id: 700000000 + idx,
            name: `tag_group:${g.id}`,
            category: 5,
            postCount: (g.children?.length || 0) + (g.parents?.length || 0),
            aliases: [g.title]
          });
        }
      });
      // Insert manual matches with highest priority (level=0)
  manualMatched.forEach((tg) => {
        if (!allResults.some(r => r.item.name === tg.name)) {
          allResults.push({ item: tg, score: 0, level: 0 });
        }
      });
    }
  // Track existing group names to avoid duplicates across passes
  const existingGroupNames = new Set(allResults.filter(r => r.item.name.startsWith('tag_group:')).map(r => r.item.name));
    if (fuseTagGroups) {
      const tgQueries: Expression[] = [{ id: `'${searchTerm}` }, { title: `'${searchTerm}` }];
      const tgResults = tgQueries.flatMap(q => fuseTagGroups!.search(q, { limit: limit }));
      const seen = new Set<string>();
      tgResults.forEach((r, idx) => {
        const g = r.item;
        if (seen.has(g.id)) return;
        seen.add(g.id);
        const starts = g.id.toLowerCase().startsWith(searchTerm) || g.title.toLowerCase().startsWith(searchTerm);
        const level = starts ? 1 : 3; // starts → 1, fuzzy → 3
    const groupName = `tag_group:${g.id}`;
    if (existingGroupNames.has(groupName)) return; // skip duplicate already inserted manually
    existingGroupNames.add(groupName);
        allResults.push({
          item: {
            id: 410000000 + idx,
      name: groupName,
            category: 5,
            postCount: (g.children?.length || 0) + (g.parents?.length || 0),
            aliases: [g.title]
          },
          score: r.score ?? 0,
          level
        });
      });
    } else {
      const termLc = searchTerm;
      const grpSorted = [...tagGroups].sort((a, b) => (b.children.length + b.parents.length) - (a.children.length + a.parents.length));
      grpSorted.filter(g => g.id.toLowerCase().includes(termLc) || g.title.toLowerCase().includes(termLc)).forEach((g, idx) => {
        const starts = g.id.toLowerCase().startsWith(termLc) || g.title.toLowerCase().startsWith(termLc);
        const level = starts ? 1 : 2;
    const groupName = `tag_group:${g.id}`;
    if (existingGroupNames.has(groupName)) return;
    existingGroupNames.add(groupName);
        allResults.push({
          item: {
            id: 410000000 + idx,
      name: groupName,
            category: 5,
            postCount: (g.children?.length || 0) + (g.parents?.length || 0),
            aliases: [g.title]
          },
          score: 0,
          level
        });
      });
    }
  }

  // 2. Fuzzy search with Fuse.js for partial matches (Level 3)
  // Create multiple queries for better coverage
  const fuseQueries: Expression[] = [];
  
  // Main query with original term
  fuseQueries.push({ name: `'${searchTerm}` });
  
  // Additional queries for normalized variants
  searchTerms.forEach(variant => {
    if (variant !== searchTerm) {
      fuseQueries.push({ name: `'${variant}` });
    }
  });

  // Execute fuzzy searches
  const fuseAugmented: Array<{ item: TagData; score: number; level: number; viaAlias?: boolean }> = [];
  fuseQueries.forEach(query => {
    let fuseQuery: Expression = query;
    
    if (category !== 'all' && CATEGORY_MAP[category] !== undefined) {
      fuseQuery = {
        $and: [
          { category: `=${CATEGORY_MAP[category]}` },
          query
        ]
      };
    }

    const fuseResults = fuse.search(fuseQuery, { limit: limit * 2 });
    fuseResults.forEach(result => {
      const viaAlias = result.item.aliases?.some(a => a.toLowerCase() === searchTerm);
      fuseAugmented.push({ item: result.item, score: result.score ?? 1, level: 3, viaAlias });
    });
  });
  const seen = new Set(allResults.map(r => r.item.id));
  fuseAugmented.forEach(r => { if (!seen.has(r.item.id)) { seen.add(r.item.id); allResults.push(r); } });

  // 3. Sort and return results
  const baseExactTerm = searchTerm; // original normalized searchTerm (without variant expansion)
  const baseTokensArr = baseExactTerm.split(/[_\-\s]+/).filter(Boolean);
  const baseTokens = new Set(baseTokensArr);
  const multiTokenQuery = baseTokens.size > 1;

  // Heuristic: treat first token as most generic (e.g. 'red'), others as more specific (e.g. 'eyes')
  const primaryToken = baseTokensArr[0] || '';
  const secondaryTokens = baseTokensArr.slice(1);

  const scored = allResults.map(r => {
    const popularity = Math.log10((r.item.postCount || 0) + 1);
    const isGroup = r.item.name.startsWith('tag_group:');
    const aliasPenalty = r.viaAlias ? rankingWeights.aliasPenalty : 0;
    // Extra hard boost for tag groups whose id/title tokens appear in the query tokens
    let hardGroupBoost = 0;
    if (isGroup) {
      const groupId = r.item.name.replace('tag_group:','').toLowerCase();
      const title = (r.item.aliases?.[0] || '').toLowerCase();
      // Build token set from original searchTerm and variants (limited)
      const queryTokens = new Set<string>();
      searchTerms.forEach(t => t.split(/[_\s\-]+/).forEach(w => { if (w.length>0) queryTokens.add(w); }));
      // If any query token fully matches group id OR title word -> strong boost
      const titleWords = title.split(/[_\s\-]+/);
      let matches = false;
      for (const qt of queryTokens) {
        if (groupId === qt || groupId.startsWith(qt) || titleWords.includes(qt)) { matches = true; break; }
      }
      if (matches) {
        hardGroupBoost = -10; // big negative to bubble to top
      }
    }
    // Strong boost for exact tag name match (ensure appears very top)
    let exactBoost = 0;
    if (!isGroup) {
      const tagLower = r.item.name.toLowerCase();
      if (tagLower === baseExactTerm) {
        exactBoost = -12; // strong negative to surface exact even if low popularity
      }
    }
    // Base composite prior to custom ordering
    let composite = (r.level * r.level * rankingWeights.level)
      + ((r.score ?? 1) * rankingWeights.fuseScore)
      + (popularity * rankingWeights.popularity)
      + (isGroup ? rankingWeights.groupBoost : 0)
      + aliasPenalty + hardGroupBoost + exactBoost;

    // Additional ordering: groups always first, then exact tag, then by matched token count desc
    // Compute matched token count vs original query tokens
    const tagTokens = r.item.name.toLowerCase().split(/[_\-\s]+/);
    const matchedTokenSet = new Set<string>();
    tagTokens.forEach(t => { if (baseTokens.has(t)) matchedTokenSet.add(t); });
    const matchedTokenCount = matchedTokenSet.size;

    // New: check if tag matches any secondary (less generic) token
    let matchesSecondary = false;
    if (multiTokenQuery && secondaryTokens.length) {
      matchesSecondary = tagTokens.some(t => secondaryTokens.includes(t));
    }
    // Also, check if tag matches only the primary token (e.g. only 'red')
    let matchesOnlyPrimary = false;
    if (multiTokenQuery && primaryToken) {
      matchesOnlyPrimary = matchedTokenSet.size === 1 && matchedTokenSet.has(primaryToken);
    }

    // Apply ordering weights (large negative to prioritize)
    if (isGroup) {
      composite -= 60; // groups always top
    } else if (exactBoost) {
      composite -= 45; // exact tag after groups
    } else if (multiTokenQuery && matchedTokenCount === baseTokens.size) {
      composite -= 30; // strong boost for full intersection of all tokens
    } else if (multiTokenQuery && matchesSecondary) {
      composite -= 18; // boost for matching any secondary token (e.g. 'eyes')
    } else if (matchedTokenCount > 0) {
      composite -= matchedTokenCount * 4;
      if (multiTokenQuery && matchesOnlyPrimary) {
        composite += 8; // stronger penalty for only matching the generic token
      } else if (multiTokenQuery && matchedTokenCount === 1) {
        composite += 2; // small penalty for only one token (not primary)
      }
    }

    return { r, composite, hardGroupBoostApplied: hardGroupBoost !== 0, exactBoostApplied: exactBoost !== 0, matchedTokenCount };
  });
  scored.sort((a,b)=> a.composite - b.composite);
  return scored.slice(0, limit).map(s => s.r.item);
}

/**
 * Gets search suggestions based on a partial term.
 * @param term The partial term for suggestions.
 * @param category The category to filter by.
 * @param limit The maximum number of suggestions.
 * @returns An array of suggested tags.
 */
function handleSuggestions(term: string, category: string = 'all', limit: number = 5): TagData[] {
  if (!isInitialized || !fuse || term.trim().length < 1) return [];

  const searchTerm = term.trim().toLowerCase();
  const collapsedTerm = searchTerm.replace(/[\s_]+/g, '');

  if (category === 'tag_groups') {
    // Fuzzy + prefix para tag groups
    if (fuseTagGroups) {
      const tgResults = fuseTagGroups.search({ title: `^${searchTerm}` }, { limit });
      const fallback = fuseTagGroups.search({ id: `^${searchTerm}` }, { limit });
      const combined = [...tgResults, ...fallback];
      const seen = new Set<string>();
      const items = combined.filter(r => !seen.has(r.item.id) && seen.add(r.item.id)).slice(0, limit).map((r, idx) => ({
        id: 200000000 + idx,
        name: `tag_group:${r.item.id}`,
        category: 5,
        postCount: (r.item.children?.length || 0) + (r.item.parents?.length || 0),
        aliases: [r.item.title]
      }));
      return items;
    }
    const termLc = searchTerm;
    const matches = tagGroups.filter(g => g.id.toLowerCase().startsWith(termLc) || g.title.toLowerCase().startsWith(termLc)).slice(0, limit);
    return matches.map((g, idx) => ({
      id: 200000000 + idx,
      name: `tag_group:${g.id}`,
      category: 5,
      postCount: (g.children?.length || 0) + (g.parents?.length || 0),
      aliases: [g.title]
    }));
  }

  const fuseQuery: Expression = {
    $and: [
      { $or: [{ name: `^${searchTerm}` }, { aliases: `^${searchTerm}` }] },
      { name: `!=${searchTerm}` } // Exclude exact matches
    ]
  };

  if (category !== 'all' && CATEGORY_MAP[category] !== undefined) {
    (fuseQuery.$and as Expression[]).push({ category: `=${CATEGORY_MAP[category]}` });
  }

  // For 'all', also include tag group suggestions (prefix match) and merge
  if (category === 'all') {
    // Tag group suggestions via Fuse prefix on title/id
    let groupPrefix: TagData[] = [];
    if (fuseTagGroups) {
      const tgResults = fuseTagGroups.search({ title: `^${searchTerm}` }, { limit: Math.min(limit, 10) });
      const fallback = fuseTagGroups.search({ id: `^${searchTerm}` }, { limit: Math.min(limit, 10) });
      const combined = [...tgResults, ...fallback];
      const seenIds = new Set<string>();
      groupPrefix = combined
        .filter(r => !seenIds.has(r.item.id) && seenIds.add(r.item.id))
        .map((r, idx) => ({
          id: 420000000 + idx,
          name: `tag_group:${r.item.id}`,
          category: 5,
          postCount: (r.item.children?.length || 0) + (r.item.parents?.length || 0),
          aliases: [r.item.title]
        }));
    } else {
      groupPrefix = tagGroups
        .filter(g => g.id.toLowerCase().startsWith(searchTerm) || g.title.toLowerCase().startsWith(searchTerm))
        .slice(0, Math.min(limit, 10))
        .map((g, idx) => ({
          id: 420000000 + idx,
          name: `tag_group:${g.id}`,
          category: 5,
          postCount: (g.children?.length || 0) + (g.parents?.length || 0),
          aliases: [g.title]
        }));
    }

    const results = fuse.search(fuseQuery, { limit: limit * 2 });
    const tagItems = results.map(r => r.item);

    const combined: TagData[] = [];
    const seen = new Set<string>();
    const add = (item: TagData) => { if (!seen.has(item.name)) { combined.push(item); seen.add(item.name); } };

  // Poner primero los tag groups que hacen prefix match
  groupPrefix.forEach(add);
  // Luego rellenar con tags
  tagItems.forEach(add);
    return combined.slice(0, limit);
  }

  const results = fuse.search(fuseQuery, { limit });
  let items = results.map(r => r.item);

  // Extra prefix search using collapsed term when user typed spaces (e.g. 'lip gloss' -> 'lipgloss')
  if (collapsedTerm !== searchTerm && collapsedTerm.length > 1) {
    const collapsedQuery: Expression = {
      $and: [
        { $or: [{ name: `^${collapsedTerm}` }, { aliases: `^${collapsedTerm}` }] },
        { name: `!=${collapsedTerm}` }
      ]
    };
    if (category !== 'all' && CATEGORY_MAP[category] !== undefined) {
      (collapsedQuery.$and as Expression[]).push({ category: `=${CATEGORY_MAP[category]}` });
    }
    const collapsedResults = fuse.search(collapsedQuery, { limit });
    const seen = new Set(items.map(i => i.id));
    collapsedResults.forEach(r => { if (!seen.has(r.item.id)) { items.push(r.item); seen.add(r.item.id); } });
  }

  return items
    .sort((a, b) => b.postCount - a.postCount)
    .slice(0, limit);
}

// --- MESSAGE HANDLER ---

/**
 * Handles incoming messages from the main thread.
 */
self.onmessage = async (e: MessageEvent<WorkerRequest>) => {
  const { type, payload, requestId } = e.data;

  const postError = (message: string, error: unknown) => {
    self.postMessage({
      type: 'ERROR',
      payload: { message, error: error instanceof Error ? error.message : 'Unknown error' },
      requestId
    });
  };

  if (type !== 'INIT' && !isInitialized) {
    return postError('Worker not initialized', new Error('Received command before initialization.'));
  }

  try {
    switch (type) {
      case 'INIT':
        await init();
        self.postMessage({ type: 'INIT_SUCCESS', payload: { success: true }, requestId });
        break;
        
      case 'SEARCH_TAGS': {
        const { term = '', category = 'all', limit = 50 } = payload || {};
        const results = handleSearch(term, category, limit);
        // NOTE: Previously we posted a DID_YOU_MEAN message WITH the same requestId
        // before sending SEARCH_RESULTS. The WorkerManager resolves the pending
        // promise on the FIRST message carrying that requestId, so the hook
        // received an object {original, suggestions} instead of an array and later
        // attempted to spread it causing: "TypeError: searchResultsToShow is not iterable".
        // Fix: emit DID_YOU_MEAN as a broadcast (no requestId) so the original
        // request resolves with the actual results array.
        if (results.length === 0 && term) {
          const alt = fuse.search(term, { limit: 5 })
            .filter(r => (r.score ?? 1) < 0.85)
            .map(r => r.item.name)
            .slice(0, 3);
          if (alt.length) {
            self.postMessage({ type: 'DID_YOU_MEAN', payload: { original: term, suggestions: alt } });
          }
        }
        self.postMessage({ type: 'SEARCH_RESULTS', payload: results, requestId });
        break;
      }
      case 'SET_RANKING_WEIGHTS': {
        const { weights } = payload || {};
        if (weights) {
          rankingWeights = { ...rankingWeights, ...weights };
        }
        self.postMessage({ type: 'RANKING_WEIGHTS', payload: rankingWeights, requestId });
        break;
      }
        
      case 'GET_SUGGESTIONS': {
        const { term, category, limit } = payload;
        const suggestions = handleSuggestions(term, category, limit);
        self.postMessage({ type: 'SUGGESTIONS', payload: suggestions, requestId });
        break;
      }
        
      case 'GET_STATS': {
  const stats = tagsData.reduce((acc, tag) => {
            const catName = REVERSE_CATEGORY_MAP[tag.category] || 'unknown';
            acc[catName] = (acc[catName] || 0) + 1;
            return acc;
        }, {} as Record<string, number>);
  // Agregar conteo de tag_groups
  stats['tag_groups'] = tagGroups.length;
        self.postMessage({ type: 'STATS', payload: { total: tagsData.length, categories: stats }, requestId });
        break;
      }
        
      case 'FIND_EXACT_TAG': {
        const { term } = payload;
        const tag = tagsData.find(t => t.name.toLowerCase() === term.toLowerCase());
        self.postMessage({ type: 'EXACT_TAG', payload: tag || null, requestId });
        break;
      }

      case 'GET_POPULAR_TAGS': {
        const { category = 'all', limit = 10 } = payload;
        if (category === 'tag_groups') {
          const popularGroups = [...tagGroups]
            .sort((a, b) => (b.children.length + b.parents.length) - (a.children.length + a.parents.length))
            .slice(0, limit)
            .map((g, idx) => ({
              id: 300000000 + idx,
              name: `tag_group:${g.id}`,
              category: 5,
              postCount: (g.children?.length || 0) + (g.parents?.length || 0),
              aliases: [g.title]
            }));
          self.postMessage({ type: 'POPULAR_TAGS', payload: popularGroups, requestId });
        } else {
          let popular = tagsData;
          if (category !== 'all' && CATEGORY_MAP[category] !== undefined) {
              popular = popular.filter(tag => tag.category === CATEGORY_MAP[category]);
          }
          const result = popular.sort((a, b) => b.postCount - a.postCount).slice(0, limit);
          self.postMessage({ type: 'POPULAR_TAGS', payload: result, requestId });
        }
        break;
      }

      case 'GET_RELATED_TAGS': {
        const { term: relatedTerm, limit: relatedLimit = 10 } = payload;
        const relatedTag = tagsData.find(t => t.name.toLowerCase() === relatedTerm.toLowerCase());
        let relatedTags: TagData[] = [];
        if (relatedTag) {
          relatedTags = tagsData
            .filter(t => t.category === relatedTag.category && t.name !== relatedTag.name)
            .sort((a, b) => b.postCount - a.postCount)
            .slice(0, relatedLimit);
        }
        self.postMessage({ type: 'RELATED_TAGS', payload: relatedTags, requestId });
        break;
      }

      case 'GET_SYNONYM': {
        const { term: synonymTerm } = payload;
        const norm = (s: string) => s.replace(/\s+/g, '_').toLowerCase();
        const q = norm(synonymTerm || '');
        const synonymTag = tagsData.find(t => {
          if (norm(t.name) === q) return true;
          if (!t.aliases || t.aliases.length === 0) return false;
          return t.aliases.some(a => norm(a) === q);
        });
        const result = synonymTag ? { name: synonymTag.name, aliases: synonymTag.aliases || [] } : null;
        self.postMessage({ type: 'SYNONYM', payload: result, requestId });
        break;
      }

      default:
        postError(`Unknown message type: ${type}`, new Error('Unknown type'));
        break;
    }
  } catch (error) {
    postError(`Error handling '${type}'`, error);
  }
};
