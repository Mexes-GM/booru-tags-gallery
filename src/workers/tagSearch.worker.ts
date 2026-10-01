// src/workers/tagSearch.worker.ts
//
// Single owner of the tag dataset: this worker is the only place that downloads
// and parses /data/tags.json. The main thread asks it for search results, single
// lookups (categories, exact tags) or, when a screen truly needs the whole list,
// a compact transferable copy (GET_TAGS_COMPACT).

import Fuse from 'fuse.js';
// Note: using relative paths (no TS path alias configured)
import { baseTagFuseOptions, defaultRankingWeights, type RankingWeights } from '../config/fuseOptions';
import { parseQuery } from '../utils/queryParser';

// --- TYPES ---
interface TagData {
  id: number;
  name: string;
  category: number;
  postCount: number;
  aliases?: string[];
  displayName?: string;
  searchText?: string;
  promptCategory?: string;
  subcategory?: string;
}

interface WorkerRequest {
  type: string;
  payload?: any;
  requestId?: string;
}

interface TagGroupItem { id: string; title: string; url: string; parents: string[]; children: string[] }

// --- WORKER STATE & CONSTANTS ---
let tagsData: TagData[] = [];
/** Lower-cased names, parallel to tagsData. */
let namesLc: string[] = [];
/** Name tokens (split on _ - and parentheses), parallel to tagsData. */
let nameTokens: string[][] = [];
/** Lower-cased aliases, parallel to tagsData. */
let aliasesLc: string[][] = [];
/** name -> index */
const nameIndex = new Map<string, number>();
/** alias -> index of the canonical tag */
const aliasIndex = new Map<string, number>();
/** Indices sorted by postCount desc. */
let popularOrder: number[] = [];

let tagGroups: TagGroupItem[] = [];
let fuse: Fuse<TagData> | null = null;
let fuseLoading: Promise<void> | null = null;
let rankingWeights: RankingWeights = { ...defaultRankingWeights };
let isInitialized = false;
let initPromise: Promise<void> | null = null;

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

const TOKEN_SPLIT = /[_\-\s()]+/;

/** "Blue Hair " -> "blue_hair" (the form tags are stored in). */
const toTagForm = (s: string) => s.trim().toLowerCase().replace(/\s+/g, '_').replace(/^_+|_+$/g, '');
const tokenize = (s: string) => s.split(TOKEN_SPLIT).filter(Boolean);

// --- INITIALIZATION ---

async function init(): Promise<void> {
  if (isInitialized) return;
  if (!initPromise) {
    initPromise = doInit().catch(error => {
      initPromise = null; // allow a retry
      throw error;
    });
  }
  return initPromise;
}

async function doInit(): Promise<void> {
  const [tagsRes, groupsRes] = await Promise.all([
    fetch('/data/tags.json'),
    fetch('/data/tag-groups.json').catch(() => null)
  ]);
  if (!tagsRes.ok) throw new Error(`Failed to load tags.json: ${tagsRes.status} ${tagsRes.statusText}`);
  const data = await tagsRes.json();
  if (!Array.isArray(data)) throw new Error('Invalid data format: expected an array');

  tagsData = data as TagData[];
  const n = tagsData.length;
  namesLc = new Array(n);
  nameTokens = new Array(n);
  aliasesLc = new Array(n);
  nameIndex.clear();
  aliasIndex.clear();
  for (let i = 0; i < n; i++) {
    const tag = tagsData[i];
    const lc = String(tag.name).toLowerCase();
    namesLc[i] = lc;
    nameTokens[i] = tokenize(lc);
    const aliases = Array.isArray(tag.aliases) ? tag.aliases : [];
    tag.aliases = aliases;
    aliasesLc[i] = aliases.map(a => String(a).toLowerCase());
    // displayName / searchText are derived; tags.json no longer ships them.
    if (tag.displayName === undefined) tag.displayName = tag.name.replace(/_/g, ' ');
    if (tag.searchText === undefined) tag.searchText = `${tag.name} ${aliases.join(',')}`;
    if (!nameIndex.has(lc)) nameIndex.set(lc, i);
  }
  // Aliases after names, so a name always wins over someone else's alias.
  for (let i = 0; i < n; i++) {
    for (const a of aliasesLc[i]) {
      if (!nameIndex.has(a) && !aliasIndex.has(a)) aliasIndex.set(a, i);
    }
  }
  popularOrder = Array.from({ length: n }, (_, i) => i).sort((a, b) => tagsData[b].postCount - tagsData[a].postCount);

  try {
    if (groupsRes && groupsRes.ok) {
      const tg = await groupsRes.json();
      if (tg && Array.isArray(tg.groups)) {
        type RawTagGroup = { id: unknown; title: unknown; url: unknown; parents?: unknown; children?: unknown };
        tagGroups = (tg.groups as RawTagGroup[]).map((g) => ({
          id: String(g.id), title: String(g.title), url: String(g.url),
          parents: Array.isArray(g.parents) ? g.parents.map(String) : [],
          children: Array.isArray(g.children) ? g.children.map(String) : []
        }));
      }
    }
  } catch {
    tagGroups = [];
  }

  isInitialized = true;
  const categories = [...new Set(tagsData.map(t => t.category))].sort();
  self.postMessage({ type: 'INITIALIZED', payload: { tagCount: tagsData.length, categories } });

  // Fuse is only needed for typo tolerance (fuzzy fallback / "did you mean"),
  // so it is loaded after the worker is already answering searches.
  setTimeout(() => { ensureFuse(); }, 0);
}

/** Loads the prebuilt Fuse index (or builds one) in the background. */
function ensureFuse(): Promise<void> {
  if (fuse) return Promise.resolve();
  if (!fuseLoading) {
    fuseLoading = (async () => {
      try {
        const idxRes = await fetch('/data/fuse-index.json');
        if (!idxRes.ok) throw new Error('no prebuilt index');
        const prebuilt = Fuse.parseIndex<TagData>(await idxRes.json());
        fuse = new Fuse(tagsData, { ...baseTagFuseOptions }, prebuilt);
      } catch {
        fuse = new Fuse(tagsData, { ...baseTagFuseOptions });
      }
    })();
  }
  return fuseLoading;
}

// Tag groups are only ~90 entries: plain string matching is enough (no Fuse).

const groupToTag = (g: TagGroupItem, id: number): TagData => ({
  id,
  name: `tag_group:${g.id}`,
  category: 5,
  postCount: (g.children?.length || 0) + (g.parents?.length || 0),
  aliases: [g.title],
  displayName: `tag_group:${g.id.replace(/_/g, ' ')}`,
  searchText: `tag_group:${g.id} ${g.title}`
});

const groupSize = (g: TagGroupItem) => g.children.length + g.parents.length;

// --- QUERY VARIANTS ---

function pluralSingular(word: string): string[] {
  const out = new Set<string>();
  if (word.length < 3) return [];
  if (word.endsWith('ies')) out.add(word.slice(0, -3) + 'y');
  else if (word.endsWith('ves')) { out.add(word.slice(0, -3) + 'f'); out.add(word.slice(0, -3) + 'fe'); }
  else if (/(ses|ches|shes|xes)$/.test(word)) out.add(word.slice(0, -2));
  if (word.endsWith('s') && !word.endsWith('ss')) out.add(word.slice(0, -1));
  if (word.endsWith('y') && !'aeiou'.includes(word[word.length - 2])) out.add(word.slice(0, -1) + 'ies');
  if (/(s|ch|sh|x|z)$/.test(word)) out.add(word + 'es');
  if (!word.endsWith('s')) out.add(word + 's');
  out.delete(word);
  return [...out];
}

/** Collapsed compound words typed without separator: "redeyes" -> "red_eyes". */
const COMPOUND_PATTERNS = [
  /^(red|blue|green|brown|black|white|pink|purple|yellow|orange|grey|gray|blonde?|silver|aqua)(eyes?|hair|lips?)$/,
  /^(long|short|curly|straight|wavy|very_long)(hair)$/,
  /^(big|small|large|huge|tiny)(eyes?|breasts?|ass)$/,
  /^(school|swim|night|day)(girl|boy|wear|suit|dress)$/,
  /^(cat|dog|fox|wolf)(girl|boy|ears?|tail)$/,
  /^(under|over)(wear|shirt|dress)$/,
];

/**
 * Exact-name alternatives for the query: separators (_ - none), spelling
 * (grey/gray, blond/blonde), plural/singular of each word, split compounds.
 * Used only for exact-name equality, so it cannot pull in unrelated tags.
 */
function exactVariants(q: string): Set<string> {
  const out = new Set<string>();
  const base = new Set<string>([q, q.replace(/_/g, '-'), q.replace(/-/g, '_'), q.replace(/[_-]+/g, '')]);
  for (const pattern of COMPOUND_PATTERNS) {
    const m = q.match(pattern);
    if (m) { base.add(`${m[1]}_${m[2]}`); break; }
  }
  for (const v of [...base]) {
    if (v.includes('grey')) base.add(v.replace(/grey/g, 'gray'));
    if (v.includes('gray')) base.add(v.replace(/gray/g, 'grey'));
    if (/blond(?!e)/.test(v)) base.add(v.replace(/blond(?!e)/g, 'blonde'));
    if (v.includes('blonde')) base.add(v.replace(/blonde/g, 'blond'));
  }
  for (const v of base) {
    out.add(v);
    const words = v.split('_');
    words.forEach((w, i) => {
      for (const alt of pluralSingular(w)) {
        const copy = [...words];
        copy[i] = alt;
        out.add(copy.join('_'));
      }
    });
  }
  out.delete('');
  return out;
}

/** Does a tag token satisfy a query token? The last query token may still be being typed. */
function tokenMatches(tagToken: string, queryToken: string, allowPrefix: boolean): boolean {
  if (tagToken === queryToken) return true;
  if (allowPrefix && queryToken.length >= 2 && tagToken.startsWith(queryToken)) return true;
  if (queryToken.length >= 3) {
    // light plural tolerance: hair/hairs, ribbon/ribbons, dress/dresses
    if (tagToken === queryToken + 's' || tagToken === queryToken + 'es') return true;
    if (queryToken.endsWith('s') && tagToken === queryToken.slice(0, -1)) return true;
  }
  return false;
}

/** Number of query tokens matched by any tag token (each query token counted once). */
function countTokenMatches(tagToks: string[], queryToks: string[]): number {
  let matched = 0;
  const last = queryToks.length - 1;
  for (let q = 0; q < queryToks.length; q++) {
    const qt = queryToks[q];
    for (let t = 0; t < tagToks.length; t++) {
      if (tokenMatches(tagToks[t], qt, q === last)) { matched++; break; }
    }
  }
  return matched;
}

// --- RANKING ---
//
// Lower tier = better. Inside a tier, more popular tags come first.
//  0   exact name ("blue hair" -> blue_hair)
//  1   exact alias (sole_female -> 1girl)
//  1.5 tag group whose id is the query (hair -> tag_group:hair)
//  2   exact name of a spelling/plural/compound variant (grey_hair -> gray_hair)
//  2.5 tag group whose id starts with the query
//  3   name starts with the query (blue_hair_ornament)
//  4   an alias starts with the query
//  5   every query word appears as a word of the name (light_blue_hair)
//  5.5 tag group containing every query word
//  6   name contains the query as a substring
//  7   only some query words match (multi-word queries; ranked by words matched)
//  8   fuzzy (typo) hit from Fuse, only when the strict tiers found little
const TIER = {
  EXACT: 0, ALIAS_EXACT: 1, GROUP_EXACT: 1.5, VARIANT_EXACT: 2, GROUP_PREFIX: 2.5,
  PREFIX: 3, ALIAS_PREFIX: 4, ALL_TOKENS: 5, GROUP_ALL_TOKENS: 5.5, SUBSTRING: 6, PARTIAL: 7, FUZZY: 8
} as const;

interface Ranked { item: TagData; tier: number; matched: number; pop: number; score: number }

interface RankOptions {
  category: string;
  limit: number;
  /** Lowest-quality tier allowed. */
  maxTier: number;
  excludes?: string[];
  /** Name to leave out (suggestions don't repeat exactly what was typed). */
  skipName?: string;
  maxGroups?: number;
}

function rankTags(rawQuery: string, opts: RankOptions): TagData[] {
  const q = toTagForm(rawQuery);
  if (!q) return [];
  const qToks = tokenize(q);
  const multi = qToks.length > 1;
  const variants = exactVariants(q);
  const catNum = opts.category !== 'all' ? CATEGORY_MAP[opts.category] : undefined;
  const excludes = (opts.excludes || []).map(toTagForm).filter(Boolean);
  const candidates = new Map<number, Ranked>();

  const consider = (i: number, tier: number, matched = 0, score = 0) => {
    if (tier > opts.maxTier) return;
    const prev = candidates.get(i);
    if (prev && prev.tier <= tier) return;
    candidates.set(i, { item: tagsData[i], tier, matched, pop: tagsData[i].postCount || 0, score });
  };

  const aliasExact = aliasIndex.get(q);
  if (aliasExact !== undefined) consider(aliasExact, TIER.ALIAS_EXACT);

  const allowSubstring = q.length >= 3;
  const allowAliasPrefix = q.length >= 3 && opts.maxTier >= TIER.ALIAS_PREFIX;
  for (let i = 0; i < tagsData.length; i++) {
    if (catNum !== undefined && tagsData[i].category !== catNum) continue;
    const name = namesLc[i];
    if (name === q) { consider(i, TIER.EXACT); continue; }
    if (variants.has(name)) { consider(i, TIER.VARIANT_EXACT); continue; }
    if (name.startsWith(q)) { consider(i, TIER.PREFIX); continue; }
    if (allowAliasPrefix) {
      const al = aliasesLc[i];
      let hit = false;
      for (let a = 0; a < al.length; a++) { if (al[a].startsWith(q)) { hit = true; break; } }
      if (hit) { consider(i, TIER.ALIAS_PREFIX); continue; }
    }
    const matched = countTokenMatches(nameTokens[i], qToks);
    if (matched === qToks.length) { consider(i, TIER.ALL_TOKENS, matched); continue; }
    if (allowSubstring && name.includes(q)) { consider(i, TIER.SUBSTRING); continue; }
    if (multi && matched > 0) consider(i, TIER.PARTIAL, matched);
  }

  // Tag groups (only in "all")
  const groupRanked: Ranked[] = [];
  if (opts.category === 'all' && tagGroups.length) {
    tagGroups.forEach((g, idx) => {
      const gid = g.id.toLowerCase();
      let tier: number | null = null;
      let matched = 0;
      if (gid === q) tier = TIER.GROUP_EXACT;
      else if (gid.startsWith(q)) tier = TIER.GROUP_PREFIX;
      else {
        matched = countTokenMatches(tokenize(gid), qToks);
        if (matched === qToks.length) tier = TIER.GROUP_ALL_TOKENS;
        else if (multi && matched > 0) tier = TIER.PARTIAL;
      }
      if (tier === null || tier > opts.maxTier) return;
      groupRanked.push({ item: groupToTag(g, 700000000 + idx), tier, matched, pop: groupSize(g), score: 0 });
    });
  }

  let ranked = [...candidates.values()];
  if (excludes.length) {
    ranked = ranked.filter(r => !excludes.some(ex => r.item.name.toLowerCase().includes(ex)));
  }
  if (opts.skipName) {
    const skip = opts.skipName.toLowerCase();
    ranked = ranked.filter(r => r.item.name.toLowerCase() !== skip);
  }
  const groups = groupRanked.slice(0, opts.maxGroups ?? groupRanked.length);
  const all = ranked.concat(groups);

  // Fuzzy fallback (typos): a full Fuse scan costs ~80 ms, so only run it when
  // nothing matched exactly and the strict tiers found very little.
  const strictCount = all.filter(r => r.tier < TIER.PARTIAL).length;
  const hasExact = all.some(r => r.tier <= TIER.VARIANT_EXACT);
  if (fuse && opts.maxTier >= TIER.FUZZY && !hasExact && strictCount < Math.min(5, opts.limit)) {
    const seen = new Set(all.map(r => r.item.name));
    const fuzzy = fuse.search(q.length > 32 ? q.slice(0, 32) : q, { limit: 30 });
    for (const r of fuzzy) {
      const score = r.score ?? 1;
      if (score > 0.35) continue;
      if (seen.has(r.item.name)) continue;
      if (catNum !== undefined && r.item.category !== catNum) continue;
      seen.add(r.item.name);
      all.push({ item: r.item, tier: TIER.FUZZY, matched: 0, pop: r.item.postCount || 0, score });
    }
  }

  all.sort((a, b) => {
    if (a.tier !== b.tier) return a.tier - b.tier;
    if (a.tier === TIER.PARTIAL && a.matched !== b.matched) return b.matched - a.matched;
    if (a.tier === TIER.FUZZY && a.score !== b.score) return a.score - b.score;
    return b.pop - a.pop;
  });
  return all.slice(0, opts.limit).map(r => r.item);
}

// --- SEARCH & SUGGESTIONS ---

function searchTagGroups(term: string, limit: number): TagData[] {
  const sorted = [...tagGroups].sort((a, b) => groupSize(b) - groupSize(a));
  const q = toTagForm(term);
  if (!q) return sorted.slice(0, limit).map((g, idx) => groupToTag(g, 100000000 + idx));
  const qToks = tokenize(q);
  const ranked = sorted
    .map(g => {
      const gid = g.id.toLowerCase();
      const title = g.title.toLowerCase().replace(/^tag_group:/, '');
      let tier = -1;
      if (gid === q || title === q) tier = 0;
      else if (gid.startsWith(q) || title.startsWith(q)) tier = 1;
      else if (countTokenMatches(tokenize(gid), qToks) === qToks.length) tier = 2;
      else if (gid.includes(q) || title.includes(q)) tier = 3;
      return { g, tier };
    })
    .filter(r => r.tier >= 0)
    .sort((a, b) => a.tier - b.tier); // stable: keeps size order inside a tier
  return ranked.slice(0, limit).map((r, idx) => groupToTag(r.g, 100000000 + idx));
}

function popularTags(category: string, limit: number): TagData[] {
  if (category === 'tag_groups') return searchTagGroups('', limit);
  const catNum = CATEGORY_MAP[category];
  const out: TagData[] = [];
  for (const i of popularOrder) {
    if (catNum !== undefined && tagsData[i].category !== catNum) continue;
    out.push(tagsData[i]);
    if (out.length >= limit) break;
  }
  return out;
}

/**
 * Searches tags based on a term, category, and limit.
 * Ranking: exact > alias > prefix > all words > substring > partial > fuzzy.
 */
function handleSearch(term: string, category: string = 'all', limit: number = 50): TagData[] {
  if (!isInitialized) return [];
  const parsed = parseQuery(term || '');
  if (parsed.category && category === 'all') category = parsed.category;
  const searchTerm = parsed.includes.concat(parsed.phrases).join(' ').trim() || (term || '').trim();

  if (category === 'tag_groups') return searchTagGroups(searchTerm, limit);

  if (!searchTerm) {
    if (category === 'all') {
      // Popular tags with a few popular tag groups mixed in (3 tags, 1 group)
      const tags = popularTags('all', limit);
      const groups = searchTagGroups('', Math.max(1, Math.ceil(limit / 4))).map((g, idx) => ({ ...g, id: 400000000 + idx }));
      const output: TagData[] = [];
      let t = 0, g = 0;
      while (output.length < limit && (t < tags.length || g < groups.length)) {
        for (let i = 0; i < 3 && output.length < limit && t < tags.length; i++) output.push(tags[t++]);
        if (output.length < limit && g < groups.length) output.push(groups[g++]);
      }
      return output;
    }
    return popularTags(category, limit);
  }

  return rankTags(searchTerm, { category, limit, maxTier: TIER.FUZZY, excludes: parsed.excludes });
}

/**
 * Suggestions for the dropdown: only strong matches (exact, alias, prefix, all
 * words). Fuzzy hits are used only when nothing strong exists.
 */
function handleSuggestions(term: string, category: string = 'all', limit: number = 5): TagData[] {
  if (!isInitialized || !term || term.trim().length < 1) return [];
  if (category === 'tag_groups') return searchTagGroups(term, limit);

  const typed = term.trim().toLowerCase();
  const strong = rankTags(term, { category, limit, maxTier: TIER.ALL_TOKENS, skipName: typed, maxGroups: 2 });
  if (strong.length > 0 || !fuse) return strong;

  // Nothing strong: offer close typo matches only (never partial-word noise).
  const q = toTagForm(term).slice(0, 32);
  const catNum = category !== 'all' ? CATEGORY_MAP[category] : undefined;
  return fuse.search(q, { limit: limit * 4 })
    .filter(r => (r.score ?? 1) <= 0.3 && (catNum === undefined || r.item.category === catNum) && r.item.name !== typed)
    .slice(0, limit)
    .map(r => r.item);
}

function findTagIndex(term: string): number | undefined {
  const q = toTagForm(term || '');
  if (!q) return undefined;
  return nameIndex.get(q);
}

// --- COMPACT EXPORT (main-thread consumers that need the full list) ---

function buildCompactPayload() {
  const n = tagsData.length;
  const ids = new Uint32Array(n);
  const categories = new Uint8Array(n);
  const postCounts = new Float64Array(n);
  const promptCats = new Uint16Array(n);
  const subcats = new Uint16Array(n);
  const promptDict: string[] = [];
  const subDict: string[] = [];
  const promptMap = new Map<string, number>();
  const subMap = new Map<string, number>();
  const names: string[] = new Array(n);
  const aliases: string[] = new Array(n);
  const dictId = (map: Map<string, number>, dict: string[], v?: string) => {
    if (!v) return 0;
    let id = map.get(v);
    if (id === undefined) { dict.push(v); id = dict.length; map.set(v, id); }
    return id;
  };
  for (let i = 0; i < n; i++) {
    const t = tagsData[i];
    ids[i] = t.id;
    categories[i] = t.category;
    postCounts[i] = t.postCount || 0;
    promptCats[i] = dictId(promptMap, promptDict, t.promptCategory);
    subcats[i] = dictId(subMap, subDict, t.subcategory);
    names[i] = t.name;
    aliases[i] = (t.aliases || []).join('\t');
  }
  const payload = {
    count: n,
    names: names.join('\n'),
    aliases: aliases.join('\n'),
    ids, categories, postCounts, promptCats, subcats, promptDict, subDict
  };
  const transfer = [ids.buffer, categories.buffer, postCounts.buffer, promptCats.buffer, subcats.buffer];
  return { payload, transfer };
}

// --- MESSAGE HANDLER ---

self.onmessage = async (e: MessageEvent<WorkerRequest>) => {
  const { type, payload, requestId } = e.data;

  const postError = (message: string, error: unknown) => {
    self.postMessage({
      type: 'ERROR',
      payload: { message, error: error instanceof Error ? error.message : 'Unknown error' },
      requestId
    });
  };

  // Every command waits for the dataset instead of failing while it loads.
  try {
    await init();
  } catch (error) {
    self.postMessage({ type: 'ERROR', payload: { message: 'Error initializing search worker', error: error instanceof Error ? error.message : 'Unknown error' } });
    return postError('Worker not initialized', error);
  }

  try {
    switch (type) {
      case 'INIT':
        self.postMessage({ type: 'INIT_SUCCESS', payload: { success: true }, requestId });
        break;

      case 'SEARCH_TAGS': {
        const { term = '', category = 'all', limit = 50 } = payload || {};
        const results = handleSearch(term, category, limit);
        // DID_YOU_MEAN is a broadcast (no requestId) so the request resolves
        // with the results array, not with this object.
        if (results.length === 0 && term && fuse) {
          const alt = fuse.search(toTagForm(term).slice(0, 32), { limit: 5 })
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
        if (weights) rankingWeights = { ...rankingWeights, ...weights };
        self.postMessage({ type: 'RANKING_WEIGHTS', payload: rankingWeights, requestId });
        break;
      }

      case 'GET_SUGGESTIONS': {
        const { term = '', category = 'all', limit = 5 } = payload || {};
        self.postMessage({ type: 'SUGGESTIONS', payload: handleSuggestions(term, category, limit), requestId });
        break;
      }

      case 'GET_STATS': {
        const stats: Record<string, number> = {};
        for (const tag of tagsData) {
          const catName = REVERSE_CATEGORY_MAP[tag.category] || 'unknown';
          stats[catName] = (stats[catName] || 0) + 1;
        }
        stats['tag_groups'] = tagGroups.length;
        self.postMessage({ type: 'STATS', payload: { total: tagsData.length, categories: stats }, requestId });
        break;
      }

      case 'FIND_EXACT_TAG': {
        const idx = findTagIndex(payload?.term);
        self.postMessage({ type: 'EXACT_TAG', payload: idx !== undefined ? tagsData[idx] : null, requestId });
        break;
      }

      // Light lookups for main-thread consumers (no full dataset transfer).
      case 'GET_TAGS_BY_NAMES': {
        const names: string[] = Array.isArray(payload?.names) ? payload.names : [];
        const result = names.map(name => {
          const idx = findTagIndex(name);
          return idx !== undefined ? tagsData[idx] : null;
        });
        self.postMessage({ type: 'TAGS_BY_NAMES', payload: result, requestId });
        break;
      }

      case 'GET_CATEGORIES': {
        // names -> category number, or -1 when the tag is unknown
        const names: string[] = Array.isArray(payload?.names) ? payload.names : [];
        const result = names.map(name => {
          const idx = findTagIndex(name);
          return idx !== undefined ? tagsData[idx].category : -1;
        });
        self.postMessage({ type: 'CATEGORIES', payload: result, requestId });
        break;
      }

      case 'GET_TAGS_COMPACT': {
        const { payload: compact, transfer } = buildCompactPayload();
        (self as unknown as Worker).postMessage({ type: 'TAGS_COMPACT', payload: compact, requestId }, transfer);
        break;
      }

      case 'GET_POPULAR_TAGS': {
        const { category = 'all', limit = 10 } = payload || {};
        const result = popularTags(category, limit).map((t, idx) => category === 'tag_groups' ? { ...t, id: 300000000 + idx } : t);
        self.postMessage({ type: 'POPULAR_TAGS', payload: result, requestId });
        break;
      }

      case 'GET_RELATED_TAGS': {
        const { term: relatedTerm = '', limit: relatedLimit = 10 } = payload || {};
        const idx = findTagIndex(relatedTerm);
        let relatedTags: TagData[] = [];
        if (idx !== undefined) {
          const base = tagsData[idx];
          relatedTags = popularTags(REVERSE_CATEGORY_MAP[base.category] || 'all', relatedLimit + 1)
            .filter(t => t.name !== base.name)
            .slice(0, relatedLimit);
        }
        self.postMessage({ type: 'RELATED_TAGS', payload: relatedTags, requestId });
        break;
      }

      case 'GET_SYNONYM': {
        const q = toTagForm(payload?.term || '');
        let idx = q ? nameIndex.get(q) : undefined;
        if (idx === undefined && q) idx = aliasIndex.get(q);
        const tag = idx !== undefined ? tagsData[idx] : null;
        const result = tag ? { name: tag.name, aliases: tag.aliases || [] } : null;
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
