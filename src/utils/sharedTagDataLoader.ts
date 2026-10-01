// Shared Tag Data Loader
//
// The search worker (src/workers/tagSearch.worker.ts) is the only code that
// downloads and parses /data/tags.json. Screens that need the whole tag list
// get it from the worker as a compact, transferable payload (a couple of joined
// strings + typed arrays), decoded here once and kept in memory for the session.
// Prefer the worker's light lookups (tagCategoryMap, FIND_EXACT_TAG, ...) when
// you only need a few tags.

import type { LocalTagData } from '../types';
import { tagSearchWorker } from './workerUtils';

interface CompactTags {
  count: number;
  names: string;
  aliases: string;
  ids: Uint32Array;
  categories: Uint8Array;
  postCounts: Float64Array;
  promptCats: Uint16Array;
  subcats: Uint16Array;
  promptDict: string[];
  subDict: string[];
}

/**
 * Tag decoded from the compact payload. `displayName` and `searchText` are
 * derived on demand (tags.json no longer ships them) to keep memory low.
 */
class DecodedTag {
  id: number;
  name: string;
  category: number;
  postCount: number;
  aliases: string[];
  promptCategory?: string;
  subcategory?: string;

  constructor(id: number, name: string, category: number, postCount: number, aliases: string[]) {
    this.id = id;
    this.name = name;
    this.category = category;
    this.postCount = postCount;
    this.aliases = aliases;
  }

  get displayName(): string { return this.name.replace(/_/g, ' '); }
  get searchText(): string { return `${this.name} ${this.aliases.join(',')}`; }
}

const NO_ALIASES: string[] = [];

function decode(c: CompactTags): LocalTagData[] {
  const names = c.names ? c.names.split('\n') : [];
  const aliases = c.aliases.split('\n');
  const out: LocalTagData[] = new Array(c.count);
  for (let i = 0; i < c.count; i++) {
    const a = aliases[i];
    const tag = new DecodedTag(c.ids[i], names[i], c.categories[i], c.postCounts[i], a ? a.split('\t') : NO_ALIASES);
    if (c.promptCats[i]) tag.promptCategory = c.promptDict[c.promptCats[i] - 1];
    if (c.subcats[i]) tag.subcategory = c.subDict[c.subcats[i] - 1];
    out[i] = tag;
  }
  return out;
}

let inMemory: LocalTagData[] | null = null;
let loadingPromise: Promise<LocalTagData[]> | null = null;

async function fetchFromWorker(): Promise<LocalTagData[]> {
  const compact = await tagSearchWorker.postMessage<CompactTags>('GET_TAGS_COMPACT');
  if (!compact || typeof compact.count !== 'number') return [];
  return decode(compact);
}

/**
 * Full tag list (same order as tags.json). Resolved once per session and
 * shared by every caller; `force` re-reads it from the worker.
 */
export async function loadTagsData(force = false): Promise<LocalTagData[]> {
  if (!force && inMemory) return inMemory;
  if (loadingPromise) return loadingPromise;
  loadingPromise = fetchFromWorker()
    .then(data => {
      inMemory = data;
      return data;
    })
    .catch(() => inMemory || [])
    .finally(() => { loadingPromise = null; });
  return loadingPromise;
}

export function getCachedTags(): LocalTagData[] | null { return inMemory; }
export function clearTagsCache() { inMemory = null; }
