// Shared Tag Data Loader
// Objetivo: Evitar múltiples descargas redundantes de /data/tags.json en distintas partes
// Estrategia: Singleton en memoria + BroadcastChannel para reciclar datos entre pestañas

import type { LocalTagData } from '../types';

let inMemory: LocalTagData[] | null = null;
let loadingPromise: Promise<LocalTagData[]> | null = null;
let lastFetchTs = 0;
const TTL = 1000 * 60 * 30; // 30 minutos

let channel: BroadcastChannel | null = null;
try {
  if (typeof BroadcastChannel !== 'undefined') {
    channel = new BroadcastChannel('tags_json_channel');
    channel.onmessage = (ev) => {
      if (ev?.data?.type === 'TAGS_JSON_UPDATE' && Array.isArray(ev.data.payload)) {
        inMemory = ev.data.payload;
        lastFetchTs = Date.now();
      }
    };
  }
} catch { /* silencioso */ }

async function fetchTags(): Promise<LocalTagData[]> {
  const res = await fetch('/data/tags.json', { cache: 'force-cache' });
  if (!res.ok) throw new Error('Failed to load tags.json');
  const data = await res.json();
  if (Array.isArray(data)) return data as LocalTagData[];
  return [];
}

export async function loadTagsData(force = false): Promise<LocalTagData[]> {
  const now = Date.now();
  if (!force && inMemory && now - lastFetchTs < TTL) {
    return inMemory;
  }
  if (loadingPromise) return loadingPromise;
  loadingPromise = fetchTags()
    .then(data => {
      inMemory = data;
      lastFetchTs = Date.now();
      if (channel) channel.postMessage({ type: 'TAGS_JSON_UPDATE', payload: data });
      return data;
    })
    .catch(() => inMemory || [])
    .finally(() => { loadingPromise = null; });
  return loadingPromise;
}

export function getCachedTags(): LocalTagData[] | null { return inMemory; }
export function clearTagsCache() { inMemory = null; lastFetchTs = 0; }
