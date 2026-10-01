// Tag name -> Danbooru category, used to colour tag links inside wiki HTML.
//
// Categories are asked to the search worker for just the names on screen
// (GET_CATEGORIES), so colouring links never downloads or parses tags.json on
// the main thread. If the full list is already in memory (sharedTagDataLoader),
// it is used directly.

import { tagSearchWorker } from './workerUtils';
import { getCachedTags } from './sharedTagDataLoader';

const UNKNOWN = -1;
const NORMALIZE = (s: string) => s.trim().toLowerCase().replace(/\s+/g, '_');

/** name -> category (UNKNOWN when the worker does not know the tag). */
const tagCategoryMap = new Map<string, number>();
let seededFromCache = false;

function seedFromCache() {
  if (seededFromCache) return;
  const cached = getCachedTags();
  if (!cached) return;
  for (const tag of cached) tagCategoryMap.set(NORMALIZE(tag.name), tag.category ?? 0);
  seededFromCache = true;
}

let readyPromise: Promise<void> | null = null;

/** Resolves once the worker can answer category lookups. Safe to call often. */
export async function ensureTagCategoryMap(): Promise<void> {
  seedFromCache();
  if (!readyPromise) {
    readyPromise = tagSearchWorker.postMessage('INIT').then(() => undefined).catch(() => { readyPromise = null; });
  }
  await readyPromise;
}

/** Resolves categories for the given names (batched in one worker request). */
export async function loadTagCategories(names: string[]): Promise<void> {
  seedFromCache();
  const missing = [...new Set(names.map(NORMALIZE))].filter(n => n && !tagCategoryMap.has(n));
  if (missing.length === 0) return;
  try {
    const categories = await tagSearchWorker.postMessage<number[]>('GET_CATEGORIES', { names: missing });
    missing.forEach((name, i) => {
      const cat = Array.isArray(categories) ? categories[i] : undefined;
      tagCategoryMap.set(name, typeof cat === 'number' ? cat : UNKNOWN);
    });
  } catch { /* silencioso: links keep their default colour */ }
}

export function getTagCategory(name: string): number | undefined {
  const cat = tagCategoryMap.get(NORMALIZE(name));
  return cat === undefined || cat === UNKNOWN ? undefined : cat;
}

function applyClass(link: Element, cat: number) {
  // Limpiar clases cat-default si existen y aplicar cat específica
  link.classList.remove('cat-default');
  link.classList.add('cat-badge');
  switch (cat) {
    case 0: link.classList.add('cat-general'); break;
    case 1: link.classList.add('cat-artist'); break;
    case 3: link.classList.add('cat-copyright'); break;
    case 4: link.classList.add('cat-character'); break;
    case 5: link.classList.add('cat-meta'); break;
    default: link.classList.add('cat-default');
  }
}

/**
 * Colours `a.tag-link[data-tag-name]` links in `container`. Known names are
 * coloured immediately; unknown ones after a single batched worker lookup.
 */
export function applyCategoryClassesToLinks(container: HTMLElement) {
  if (!container) return;
  seedFromCache();
  const links = Array.from(container.querySelectorAll('a.tag-link[data-tag-name]'));
  const pending: Element[] = [];
  links.forEach(link => {
    const tagName = link.getAttribute('data-tag-name');
    if (!tagName) return;
    const key = NORMALIZE(tagName);
    if (!tagCategoryMap.has(key)) { pending.push(link); return; }
    const cat = getTagCategory(tagName);
    if (cat !== undefined) applyClass(link, cat);
  });
  if (pending.length === 0) return;
  const names = pending.map(l => l.getAttribute('data-tag-name') || '');
  loadTagCategories(names).then(() => {
    pending.forEach(link => {
      if (!link.isConnected) return;
      const cat = getTagCategory(link.getAttribute('data-tag-name') || '');
      if (cat !== undefined) applyClass(link, cat);
    });
  });
}
