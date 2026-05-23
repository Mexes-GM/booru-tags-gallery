// Utilidad para cargar y consultar categorías de tags
// Carga perezosa de /data/tags.json y construye un mapa nombre->categoría

interface LocalTagEntry { name: string; category: number; }

let loadingPromise: Promise<void> | null = null;
let tagCategoryMap: Record<string, number> = {};

const NORMALIZE = (s: string) => s.trim().toLowerCase();

async function loadIfNeeded() {
  if (loadingPromise) return loadingPromise;
  loadingPromise = fetch('/data/tags.json')
    .then(r => r.json())
    .then((data: LocalTagEntry[]) => {
      const map: Record<string, number> = {};
      for (const entry of data) {
        if (entry && typeof entry.name === 'string') {
          map[NORMALIZE(entry.name)] = entry.category ?? 0;
        }
      }
      tagCategoryMap = map;
    })
    .catch(() => { /* silencioso */ })
    .finally(() => { /* mantener cache */ });
  return loadingPromise;
}

export async function ensureTagCategoryMap() { await loadIfNeeded(); }

export function getTagCategory(name: string): number | undefined {
  return tagCategoryMap[NORMALIZE(name)];
}

export function applyCategoryClassesToLinks(container: HTMLElement) {
  if (!container) return;
  const links = container.querySelectorAll('a.tag-link[data-tag-name]');
  links.forEach(link => {
    const tagName = link.getAttribute('data-tag-name');
    if (!tagName) return;
    const cat = getTagCategory(tagName);
    if (cat === undefined) return;
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
  });
}
