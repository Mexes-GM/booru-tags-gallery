#!/usr/bin/env node
/*
  Genera sitemap.xml a partir de los tags locales.
  Uso: node scripts/generate-sitemap.cjs
*/
const fs = require('fs');
const path = require('path');

const BASE_URL = process.env.SITE_URL || 'https://danbooru-tags-explorer.netlify.app';
const DIST_DIR = path.join(process.cwd(), 'public');
const TAGS_PATH = path.join(process.cwd(), 'public', 'data', 'tags.json');

function isoDate() { return new Date().toISOString(); }

function escapeXml(str) {
  return str.replace(/[<>&"']/g, c => ({'<':'&lt;','>':'&gt;','&':'&amp;','"':'&quot;','\'':'&apos;'}[c]));
}

async function run() {
  if (!fs.existsSync(TAGS_PATH)) {
    console.error('No se encontró public/data/tags.json');
    process.exit(1);
  }
  const raw = fs.readFileSync(TAGS_PATH, 'utf8');
  let tags = [];
  try { tags = JSON.parse(raw); } catch(e){ console.error('Error parseando tags.json', e); }

  // Limitar a primeros 5000 para mantener tamaño razonable
  const limited = tags.slice(0, 5000);

  const urls = [
    { loc: `${BASE_URL}/`, changefreq: 'daily', priority: '1.0' },
    ...limited.map(t => ({
      loc: `${BASE_URL}/tags/${encodeURIComponent(t.name)}`,
      changefreq: 'weekly',
      priority: '0.7'
    }))
  ];

  const xml = `<?xml version="1.0" encoding="UTF-8"?>\n` +
  `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n` +
  urls.map(u => `  <url>\n    <loc>${escapeXml(u.loc)}</loc>\n    <lastmod>${isoDate()}</lastmod>\n    <changefreq>${u.changefreq}</changefreq>\n    <priority>${u.priority}</priority>\n  </url>`).join('\n') + '\n</urlset>';

  if (!fs.existsSync(DIST_DIR)) fs.mkdirSync(DIST_DIR, { recursive: true });
  fs.writeFileSync(path.join(DIST_DIR, 'sitemap.xml'), xml, 'utf8');
  console.log('sitemap.xml generado con', urls.length, 'URLs');
}

run();
