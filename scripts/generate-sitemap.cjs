#!/usr/bin/env node
/*
  Generates the sitemap from the local tag list (public/data/tags.json).

  Usage:
    VITE_SITE_URL=https://your-domain.example node scripts/generate-sitemap.cjs [--out <dir>]

  Site URL: VITE_SITE_URL or SITE_URL from the environment, otherwise from
  .env.production.local / .env.local / .env.production / .env (first match wins).
  If no URL is configured the script prints a notice and exits 0 WITHOUT writing
  anything, so a sitemap never points at a wrong or dead domain.

  Output (default dir: public/, so Vite copies it into dist/):
    sitemap.xml        sitemap index referencing the files below
    sitemap-N.xml      urlsets with the home page + one URL per tag
  All ~94k tags are included, ordered by postCount (most popular first) and split
  into files of at most MAX_URLS_PER_FILE URLs (protocol limit is 50,000 per file).
  Stale sitemap-N.xml files from a previous run are removed.
  If <out>/robots.txt exists, its "Sitemap:" line is set to <site>/sitemap.xml.
*/
const fs = require('fs');
const path = require('path');

const ROOT = process.cwd();
const TAGS_PATH = path.join(ROOT, 'public', 'data', 'tags.json');
const MAX_URLS_PER_FILE = 45000;

function parseArgs(argv) {
  const args = { out: path.join(ROOT, 'public') };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--out' && argv[i + 1]) args.out = path.resolve(argv[++i]);
  }
  return args;
}

// Minimal .env reader: KEY=VALUE lines, optional quotes, # comments.
function readEnvFile(file) {
  const vars = {};
  if (!fs.existsSync(file)) return vars;
  for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
    if (!m) continue;
    let value = m[2].trim();
    if (/^(["']).*\1$/.test(value)) value = value.slice(1, -1);
    else value = value.replace(/\s+#.*$/, '');
    vars[m[1]] = value;
  }
  return vars;
}

function resolveSiteUrl() {
  const fromProcess = process.env.VITE_SITE_URL || process.env.SITE_URL;
  if (fromProcess) return fromProcess;
  for (const name of ['.env.production.local', '.env.local', '.env.production', '.env']) {
    const vars = readEnvFile(path.join(ROOT, name));
    if (vars.VITE_SITE_URL || vars.SITE_URL) return vars.VITE_SITE_URL || vars.SITE_URL;
  }
  return '';
}

function escapeXml(str) {
  return str.replace(/[<>&"']/g, c => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;', "'": '&apos;' }[c]));
}

function urlset(locs) {
  return '<?xml version="1.0" encoding="UTF-8"?>\n' +
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' +
    locs.map(loc => `  <url><loc>${escapeXml(loc)}</loc></url>`).join('\n') +
    '\n</urlset>\n';
}

function sitemapIndex(locs, lastmod) {
  return '<?xml version="1.0" encoding="UTF-8"?>\n' +
    '<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' +
    locs.map(loc => `  <sitemap><loc>${escapeXml(loc)}</loc><lastmod>${lastmod}</lastmod></sitemap>`).join('\n') +
    '\n</sitemapindex>\n';
}

function run() {
  const { out } = parseArgs(process.argv.slice(2));
  const rawSite = resolveSiteUrl().trim();

  if (!rawSite) {
    console.log('[sitemap] VITE_SITE_URL / SITE_URL is not set: skipping sitemap generation.');
    console.log('[sitemap] Set it (e.g. VITE_SITE_URL=https://your-domain.example in .env) and re-run.');
    process.exit(0);
  }

  let base;
  try {
    const u = new URL(rawSite);
    if (!/^https?:$/.test(u.protocol)) throw new Error('protocol must be http(s)');
    base = `${u.origin}${u.pathname}`.replace(/\/+$/, '');
  } catch (e) {
    console.error(`[sitemap] Invalid site URL "${rawSite}": ${e.message}`);
    process.exit(1);
  }

  if (!fs.existsSync(TAGS_PATH)) {
    console.error('[sitemap] public/data/tags.json not found');
    process.exit(1);
  }
  let tags;
  try {
    tags = JSON.parse(fs.readFileSync(TAGS_PATH, 'utf8'));
  } catch (e) {
    console.error('[sitemap] Could not parse tags.json:', e.message);
    process.exit(1);
  }

  const seen = new Set();
  const tagLocs = tags
    .filter(t => t && typeof t.name === 'string' && t.name && (t.postCount ?? 0) > 0)
    .sort((a, b) => (b.postCount ?? 0) - (a.postCount ?? 0))
    .filter(t => (seen.has(t.name) ? false : (seen.add(t.name), true)))
    .map(t => `${base}/tags/${encodeURIComponent(t.name)}`);
  const locs = [`${base}/`, ...tagLocs];

  fs.mkdirSync(out, { recursive: true });
  for (const f of fs.readdirSync(out)) {
    if (/^sitemap-\d+\.xml$/.test(f)) fs.unlinkSync(path.join(out, f));
  }

  const files = [];
  for (let i = 0; i * MAX_URLS_PER_FILE < locs.length; i++) {
    const name = `sitemap-${i}.xml`;
    fs.writeFileSync(path.join(out, name), urlset(locs.slice(i * MAX_URLS_PER_FILE, (i + 1) * MAX_URLS_PER_FILE)), 'utf8');
    files.push(name);
  }
  const lastmod = new Date().toISOString().slice(0, 10);
  fs.writeFileSync(path.join(out, 'sitemap.xml'), sitemapIndex(files.map(f => `${base}/${f}`), lastmod), 'utf8');

  const robotsPath = path.join(out, 'robots.txt');
  if (fs.existsSync(robotsPath)) {
    const robots = fs.readFileSync(robotsPath, 'utf8').split(/\r?\n/).filter(l => !/^\s*Sitemap:/i.test(l));
    while (robots.length && robots[robots.length - 1].trim() === '') robots.pop();
    robots.push('', `Sitemap: ${base}/sitemap.xml`, '');
    fs.writeFileSync(robotsPath, robots.join('\n'), 'utf8');
  }

  console.log(`[sitemap] ${locs.length} URLs for ${base} -> ${path.relative(ROOT, out) || '.'}/sitemap.xml (index) + ${files.join(', ')}`);
}

run();
