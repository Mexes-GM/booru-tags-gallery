#!/usr/bin/env node
// Script para scrapear tag groups desde Danbooru y guardarlos en public/data/tag-groups.json
// Ejecutar con: node scripts/fetch-tag-groups.cjs
// Nota: usa fetch nativo de Node >=18.

const fs = require('fs');
const path = require('path');

const ROOT_WIKI = 'https://danbooru.donmai.us/wiki_pages/tag_groups';
const WIKI_BASE = 'https://danbooru.donmai.us/wiki_pages/';
const OUTPUT_PATH = path.join(__dirname, '..', 'public', 'data', 'tag-groups.json');

/**
 * Contrato de salida:
 * {
 *   fetchedAt: string ISO,
 *   source: string,
 *   groups: Array<{
 *     id: string; // slug después de 'tag_group:' (decoded)
 *     title: string; // texto del link
 *     url: string; // url absoluta
 *     parents: string[]; // ids ancestros (si aplica)
 *     children: string[]; // ids hijos directos
 *   }>
 * }
 */

/** Util: espera */
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Limpia HTML simple para extraer enlaces */
function extractLinks(html) {
  // Captura href y texto del enlace.
  const linkRegex = /<a\s+[^>]*href=\"([^\"]+)\"[^>]*>([\s\S]*?)<\/a>/gi;
  const links = [];
  let m;
  while ((m = linkRegex.exec(html)) !== null) {
    const href = m[1];
    // Limpia el texto (quita etiquetas internas)
    const text = m[2].replace(/<[^>]+>/g, '').trim();
    links.push({ href, text });
  }
  return links;
}

function decodeWikiSlug(urlPath) {
  try {
    const last = urlPath.split('/').pop();
    return decodeURIComponent(last).replace(/^tag_group:/i, '').trim();
  } catch {
    return null;
  }
}

function isTagGroupHref(href) {
  if (!href) return false;
  const abs = toAbsoluteWikiUrl(href);
  try {
    const u = new URL(abs);
    if (u.hostname !== 'danbooru.donmai.us') return false;
    // Debe ser una ruta bajo /wiki_pages/
    if (!u.pathname.startsWith('/wiki_pages/')) return false;
    const slug = decodeURIComponent(u.pathname.split('/').pop() || '');
    // Acepta solo slugs exactos que comiencen con tag_group:
    return /^tag_group:/i.test(slug);
  } catch {
    return false;
  }
}

function toAbsoluteWikiUrl(href) {
  if (href.startsWith('http')) return href;
  let cleaned = href;
  if (cleaned.startsWith('/')) cleaned = cleaned.slice(1);
  return `https://danbooru.donmai.us/${cleaned}`;
}

async function fetchText(url) {
  const res = await fetch(url, { headers: { 'User-Agent': 'BooruTagsGallery/1.0 (+https://example.com)' } });
  if (!res.ok) throw new Error(`HTTP ${res.status} al obtener ${url}`);
  return res.text();
}

async function crawlTagGroup(url, visited) {
  const abs = toAbsoluteWikiUrl(url);
  if (visited.has(abs)) return null;
  visited.add(abs);

  const html = await fetchText(abs);
  const links = extractLinks(html);
  const groupLinks = links.filter(l => isTagGroupHref(l.href));

  // Derivar id principal
  const id = decodeWikiSlug(abs);
  // Título visible si existe
  const selfLink = links.find(l => toAbsoluteWikiUrl(l.href) === abs);
  const title = selfLink?.text && selfLink.text.length > 0 ? selfLink.text : `tag_group:${id}`;

  // Hijos son otros tag_group encontrados dentro del contenido
  const children = Array.from(new Set(groupLinks.map(l => {
    const absL = toAbsoluteWikiUrl(l.href);
    try {
      const u = new URL(absL);
      const slug = decodeURIComponent(u.pathname.split('/').pop() || '');
      return slug.replace(/^tag_group:/i, '').trim();
    } catch { return null; }
  }).filter(Boolean)));

  return { id, title, url: abs, children };
}

async function main() {
  console.log('↳ Obteniendo índice de tag groups raíz…');
  const rootHtml = await fetchText(ROOT_WIKI);
  const rootLinks = extractLinks(rootHtml);
  const rootGroupLinks = rootLinks.filter(l => isTagGroupHref(l.href));
  const queue = Array.from(new Set(rootGroupLinks.map(l => toAbsoluteWikiUrl(l.href))));

  const visited = new Set();
  const nodes = new Map();

  // BFS con limitador básico
  while (queue.length) {
    const url = queue.shift();
    try {
      const node = await crawlTagGroup(url, visited);
      if (!node) continue;
      nodes.set(node.id, node);

      // Agregar hijos a la cola
      for (const childId of node.children) {
        // Construir url del hijo
        const childUrl = `${WIKI_BASE}${encodeURIComponent('tag_group:' + childId)}`;
        if (!visited.has(childUrl)) queue.push(childUrl);
      }

      // Respetar un pequeño delay para no abusar
      await sleep(250);
    } catch (e) {
      console.warn('Aviso: fallo al procesar', url, e.message);
    }
  }

  // Construir relaciones de padres
  const parentMap = new Map(); // childId -> Set<parentId>
  for (const node of nodes.values()) {
    for (const child of node.children) {
      if (!parentMap.has(child)) parentMap.set(child, new Set());
      parentMap.get(child).add(node.id);
    }
  }

  // Ensamblar salida
  const groups = Array.from(nodes.values()).map(n => ({
    id: n.id,
    title: n.title,
    url: n.url,
    parents: Array.from(parentMap.get(n.id) || []),
    children: n.children.filter(id => nodes.has(id)),
  })).sort((a, b) => a.id.localeCompare(b.id));

  // Asegurar carpeta
  fs.mkdirSync(path.dirname(OUTPUT_PATH), { recursive: true });
  fs.writeFileSync(OUTPUT_PATH, JSON.stringify({ fetchedAt: new Date().toISOString(), source: ROOT_WIKI, count: groups.length, groups }, null, 2));
  console.log(`✅ Guardado ${groups.length} tag groups en ${path.relative(process.cwd(), OUTPUT_PATH)}`);
}

main().catch(err => {
  console.error('❌ Error fatal:', err.stack || err.message);
  process.exit(1);
});
