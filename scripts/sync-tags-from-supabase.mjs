#!/usr/bin/env node
// Enriches public/data/tags.json with the prompt taxonomy that Booru Prompt
// Gallery keeps in Supabase (`auto_suggest_tags.category_name` / `subcategory`:
// clothing > headwear, appearance > eyes, equipment > weapon…).
//
// Only that taxonomy is taken from Supabase. Tag names, post counts, Danbooru
// categories and aliases stay as they are: the table's copy of them lags behind
// Danbooru (e.g. it still lists the deprecated `black_footwear` and points
// `black_shoes` at it), so using it as the source of truth would replace valid
// tags with dead ones.
//
// The site stays static: this runs on your machine, reads Supabase once and
// rewrites the JSON snapshot. Nothing in the browser talks to Supabase.
//
// Usage:
//   npm run sync-tags -- [options]
//
// Options:
//   --env <path>   Extra .env file to read (e.g. ../booru-prompt-gallery/.env.local)
//   --dry-run      Fetch and report, but do not write any file
//
// Credentials (first match wins), from the environment, .env.local, .env or --env:
//   SUPABASE_URL | NEXT_PUBLIC_SUPABASE_URL
//   SUPABASE_SERVICE_ROLE_KEY | SUPABASE_SECRET_KEY | SUPABASE_ANON_KEY | NEXT_PUBLIC_SUPABASE_ANON_KEY
// The key never leaves this script; it is not bundled into the site.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const TAGS_PATH = path.join(ROOT, 'public/data/tags.json');
const PAGE_SIZE = 1000; // PostgREST's default max-rows
const MIN_SANE_ROWS = 1000; // below this the query is probably wrong (RLS, wrong project…)

// Labels that add nothing beyond the Danbooru category the tag already has.
const FILLER_LABELS = ['other', 'unclassified', 'general', 'artist', 'character', 'copyright', 'meta'];

// ---------------------------------------------------------------------------
// CLI + env
// ---------------------------------------------------------------------------

function parseArgs(argv) {
  const opts = { env: null, dryRun: false };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--dry-run') opts.dryRun = true;
    else if (arg === '--env') {
      opts.env = argv[++i];
      if (!opts.env) throw new Error('Missing value for --env');
    } else throw new Error(`Unknown option: ${arg}`);
  }
  return opts;
}

/** Minimal .env parser: KEY=value, optional quotes, # comments. Never overrides existing vars. */
function loadEnvFile(file) {
  if (!fs.existsSync(file)) return false;
  for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    const match = line.match(/^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
    if (!match) continue;
    const [, key, raw] = match;
    if (process.env[key] !== undefined) continue;
    process.env[key] = raw.replace(/^(['"])(.*)\1$/, '$2');
  }
  return true;
}

function resolveCredentials() {
  const pick = (...names) => names.map((n) => process.env[n]).find(Boolean);
  const url = pick('SUPABASE_URL', 'NEXT_PUBLIC_SUPABASE_URL');
  const key = pick('SUPABASE_SERVICE_ROLE_KEY', 'SUPABASE_SECRET_KEY', 'SUPABASE_ANON_KEY', 'NEXT_PUBLIC_SUPABASE_ANON_KEY');
  if (!url || !key) {
    throw new Error(
      'Supabase credentials not found. Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY (or an anon key) ' +
      'in .env.local, or pass --env ../booru-prompt-gallery/.env.local'
    );
  }
  return { url: url.replace(/\/+$/, ''), key };
}

// ---------------------------------------------------------------------------
// Supabase (PostgREST over fetch; no extra dependency)
// ---------------------------------------------------------------------------

async function fetchPage({ url, key }, from) {
  const filler = `(${FILLER_LABELS.join(',')})`;
  const params = new URLSearchParams({
    select: 'name,category_name,subcategory',
    // Only rows that carry a real prompt label; NOT IN also skips NULLs.
    or: `(category_name.not.in.${filler},subcategory.not.in.${filler})`,
    order: 'name.asc',
  });
  const res = await fetch(`${url}/rest/v1/auto_suggest_tags?${params}`, {
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      Range: `${from}-${from + PAGE_SIZE - 1}`,
      'Range-Unit': 'items',
      Prefer: from === 0 ? 'count=exact' : 'count=none',
    },
  });
  if (!res.ok) throw new Error(`Supabase ${res.status}: ${(await res.text()).slice(0, 300)}`);
  const total = Number(res.headers.get('content-range')?.split('/')[1]);
  return { rows: await res.json(), total: Number.isFinite(total) ? total : null };
}

async function fetchTaxonomy(creds) {
  const rows = [];
  let total = null;
  for (let from = 0; ; from += PAGE_SIZE) {
    const page = await fetchPage(creds, from);
    if (from === 0) total = page.total;
    rows.push(...page.rows);
    const done = page.rows.length < PAGE_SIZE;
    const progress = `  · fetched ${rows.length.toLocaleString('en')}${total ? ` / ${total.toLocaleString('en')}` : ''} rows`;
    if (process.stdout.isTTY) process.stdout.write(`\r${progress}`);
    else if (done) console.log(progress);
    if (done) break;
  }
  if (process.stdout.isTTY) process.stdout.write('\n');
  return rows;
}

// ---------------------------------------------------------------------------
// Merge
// ---------------------------------------------------------------------------

const normalizeName = (name) => String(name ?? '').trim().toLowerCase().replace(/\s+/g, '_');

const cleanLabel = (value) => {
  const s = typeof value === 'string' ? value.trim().toLowerCase() : '';
  return s && !FILLER_LABELS.includes(s) ? s : undefined;
};

function enrich(tags, rows) {
  const taxonomy = new Map();
  for (const row of rows) {
    const name = normalizeName(row.name);
    if (!name || taxonomy.has(name)) continue;
    taxonomy.set(name, { promptCategory: cleanLabel(row.category_name), subcategory: cleanLabel(row.subcategory) });
  }

  const stats = { matched: 0, changed: 0, cleared: 0 };
  for (const tag of tags) {
    const key = normalizeName(tag.name);
    const next = taxonomy.get(key) ?? {};
    if (taxonomy.has(key)) stats.matched++;
    const before = `${tag.promptCategory ?? ''}/${tag.subcategory ?? ''}`;
    // Rebuilt every run, so labels removed in Supabase disappear here too.
    delete tag.promptCategory;
    delete tag.subcategory;
    if (next.promptCategory) tag.promptCategory = next.promptCategory;
    if (next.subcategory) tag.subcategory = next.subcategory;
    const after = `${tag.promptCategory ?? ''}/${tag.subcategory ?? ''}`;
    if (before !== after) {
      if (after === '/') stats.cleared++;
      else stats.changed++;
    }
  }
  return { stats, unmatched: taxonomy.size - stats.matched };
}

function countBy(items, key) {
  const counts = {};
  for (const item of items) if (item[key]) counts[item[key]] = (counts[item[key]] || 0) + 1;
  return Object.entries(counts).sort((a, b) => b[1] - a[1]);
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  const opts = parseArgs(process.argv.slice(2));

  loadEnvFile(path.join(ROOT, '.env.local'));
  loadEnvFile(path.join(ROOT, '.env'));
  if (opts.env && !loadEnvFile(path.resolve(opts.env))) throw new Error(`--env file not found: ${opts.env}`);
  const creds = resolveCredentials();

  console.log(`Reading prompt taxonomy from ${new URL(creds.url).host}`);
  const rows = await fetchTaxonomy(creds);
  if (rows.length < MIN_SANE_ROWS) {
    throw new Error(`Only ${rows.length} rows came back. Check the key has read access (RLS) and the URL points to the right project.`);
  }

  const raw = fs.readFileSync(TAGS_PATH, 'utf8');
  const eol = raw.includes('\r\n') ? '\r\n' : '\n'; // keep the file's line endings
  const tags = JSON.parse(raw);
  const { stats, unmatched } = enrich(tags, rows);

  console.log(`\nSupabase rows with a prompt label: ${rows.length.toLocaleString('en')}`);
  console.log(`tags.json: ${tags.length.toLocaleString('en')} tags · ${stats.matched.toLocaleString('en')} labelled ` +
    `· ${stats.changed} changed · ${stats.cleared} cleared · ${unmatched} Supabase names not in tags.json`);
  console.log(`  prompt categories: ${countBy(tags, 'promptCategory').map(([k, n]) => `${k} (${n})`).join(', ')}`);
  console.log(`  top subcategories: ${countBy(tags, 'subcategory').slice(0, 15).map(([k, n]) => `${k} (${n})`).join(', ')}`);

  if (opts.dryRun) {
    console.log('\nDry run: nothing written.');
    return;
  }
  if (stats.changed === 0 && stats.cleared === 0) {
    console.log('\nAlready up to date.');
    return;
  }

  // Minified (the browser downloads this file; pretty-printing added ~40%),
  // written atomically. Order and ids are untouched, so the Fuse index (built
  // from the keys in src/config/fuseKeys.json) stays valid.
  writeFileAtomic(TAGS_PATH, JSON.stringify(tags) + eol);
  console.log(`\nWrote ${path.relative(ROOT, TAGS_PATH)}`);
}

/**
 * Write to a temp file, then swap it in. On Windows the rename can fail with
 * EPERM/EBUSY while a dev server or antivirus holds the target open, so retry
 * briefly and, as a last resort, copy over the target.
 */
function writeFileAtomic(target, contents) {
  const tmp = `${target}.tmp`;
  fs.writeFileSync(tmp, contents);
  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      fs.renameSync(tmp, target);
      return;
    } catch (error) {
      if (error.code !== 'EPERM' && error.code !== 'EBUSY' && error.code !== 'EACCES') throw error;
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 200 * (attempt + 1));
    }
  }
  fs.copyFileSync(tmp, target);
  fs.rmSync(tmp, { force: true });
}

main().catch((error) => {
  console.error(`\n✖ ${error.message}`);
  process.exit(1);
});
