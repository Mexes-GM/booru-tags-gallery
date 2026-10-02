#!/usr/bin/env node
// Rebuilds public/data/tags.json from Booru Prompt Gallery's `auto_suggest_tags`
// table in Supabase: tag names, Danbooru categories, post counts, aliases and
// the prompt taxonomy (`category_name` / `subcategory`: clothing > headwear,
// appearance > eyes, equipment > weapon…).
//
// That table is kept current with Danbooru by booru-prompt-gallery's
// scripts/refresh-danbooru-tags.ts. It deliberately keeps tags under the names
// image models were trained on: a tag Danbooru renamed keeps its old name and
// lists the new one among its aliases (`china_dress` -> alias `qipao`), and
// post counts are never lowered, so searching finds a tag by either name.
//
// The site stays static: this runs on your machine, reads Supabase once and
// rewrites the JSON snapshot. Nothing in the browser talks to Supabase.
//
// Usage:
//   npm run sync-tags -- [options]
//
// Options:
//   --env <path>        Extra .env file to read (e.g. ../booru-prompt-gallery/.env.local)
//   --min-posts <n>     Leave out tags with fewer posts (default 50)
//   --dry-run           Fetch and report, but do not write any file
//
// Credentials (first match wins), from the environment, .env.local, .env or --env:
//   SUPABASE_URL | NEXT_PUBLIC_SUPABASE_URL
//   SUPABASE_ANON_KEY | NEXT_PUBLIC_SUPABASE_ANON_KEY | SUPABASE_PUBLISHABLE_KEY | NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
// Only the public (anon) key is used: the table is world-readable already, and
// a service-role key would bypass RLS, which this read-only script never needs.
// The key never leaves this script; it is not bundled into the site.
//
// Afterwards run `npm run generate-fuse-index`: the search index is built from
// tags.json and must be regenerated whenever it changes.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const TAGS_PATH = path.join(ROOT, 'public/data/tags.json');
const PAGE_SIZE = 1000; // PostgREST's default max-rows
const MIN_SANE_ROWS = 10000; // below this the query is probably wrong (RLS, wrong project…)

// Labels that add nothing beyond the Danbooru category the tag already has.
const FILLER_LABELS = ['other', 'unclassified', 'general', 'artist', 'character', 'copyright', 'meta'];

// ---------------------------------------------------------------------------
// CLI + env
// ---------------------------------------------------------------------------

function parseArgs(argv) {
  const opts = { env: null, dryRun: false, minPosts: 50 };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--dry-run') opts.dryRun = true;
    else if (arg === '--env') {
      opts.env = argv[++i];
      if (!opts.env) throw new Error('Missing value for --env');
    } else if (arg === '--min-posts') {
      opts.minPosts = Number(argv[++i]);
      if (!Number.isInteger(opts.minPosts) || opts.minPosts < 0) throw new Error('--min-posts needs a whole number');
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
  const key = pick('SUPABASE_ANON_KEY', 'NEXT_PUBLIC_SUPABASE_ANON_KEY', 'SUPABASE_PUBLISHABLE_KEY', 'NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY');
  if (!url || !key) {
    throw new Error(
      'Supabase credentials not found. Set SUPABASE_URL and SUPABASE_ANON_KEY ' +
      'in .env.local, or pass --env ../booru-prompt-gallery/.env.local'
    );
  }
  return { url: url.replace(/\/+$/, ''), key };
}

// ---------------------------------------------------------------------------
// Supabase (PostgREST over fetch; no extra dependency)
// ---------------------------------------------------------------------------

async function fetchPage({ url, key }, minPosts, from) {
  const params = new URLSearchParams({
    select: 'name,category,post_count,aliases,category_name,subcategory',
    post_count: `gte.${minPosts}`,
    // Stable order so pages neither skip nor repeat rows.
    order: 'post_count.desc,name.asc',
  });
  const res = await fetch(`${url}/rest/v1/auto_suggest_tags?${params}`, {
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      Range: `${from}-${from + PAGE_SIZE - 1}`,
      'Range-Unit': 'items',
      Prefer: 'count=exact',
    },
  });
  if (!res.ok) throw new Error(`Supabase ${res.status}: ${(await res.text()).slice(0, 300)}`);
  const total = Number(res.headers.get('content-range')?.split('/')[1]);
  return { rows: await res.json(), total: Number.isFinite(total) ? total : null };
}

async function fetchTags(creds, minPosts) {
  const rows = [];
  let total = null;
  for (let from = 0; ; from += PAGE_SIZE) {
    const page = await fetchPage(creds, minPosts, from);
    if (from === 0) total = page.total;
    rows.push(...page.rows);
    const done = page.rows.length < PAGE_SIZE;
    const progress = `  · fetched ${rows.length.toLocaleString('en')}${total ? ` / ${total.toLocaleString('en')}` : ''} rows`;
    if (process.stdout.isTTY) process.stdout.write(`\r${progress}`);
    else if (done) console.log(progress);
    if (done) break;
  }
  if (process.stdout.isTTY) process.stdout.write('\n');
  if (total !== null && rows.length !== total) {
    throw new Error(`Expected ${total} rows but got ${rows.length}; the table changed while reading, run again.`);
  }
  return rows;
}

// ---------------------------------------------------------------------------
// Build
// ---------------------------------------------------------------------------

const cleanLabel = (value) => {
  const s = typeof value === 'string' ? value.trim().toLowerCase() : '';
  return s && !FILLER_LABELS.includes(s) ? s : undefined;
};

function buildTags(rows) {
  const seen = new Set();
  const tags = [];
  for (const row of rows) {
    const name = String(row.name ?? '').trim();
    if (!name || seen.has(name)) continue;
    seen.add(name);
    const tag = {
      id: tags.length,
      name,
      category: row.category,
      postCount: row.post_count,
      aliases: [...new Set((row.aliases ?? []).filter((a) => a && a !== name))],
    };
    const promptCategory = cleanLabel(row.category_name);
    const subcategory = cleanLabel(row.subcategory);
    if (promptCategory) tag.promptCategory = promptCategory;
    if (subcategory) tag.subcategory = subcategory;
    tags.push(tag);
  }
  return tags;
}

function countBy(items, key) {
  const counts = {};
  for (const item of items) if (item[key] !== undefined) counts[item[key]] = (counts[item[key]] || 0) + 1;
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

  console.log(`Reading tags with ${opts.minPosts}+ posts from ${new URL(creds.url).host}`);
  const rows = await fetchTags(creds, opts.minPosts);
  if (rows.length < MIN_SANE_ROWS) {
    throw new Error(`Only ${rows.length} rows came back. Check the key has read access (RLS) and the URL points to the right project.`);
  }

  const tags = buildTags(rows);
  const raw = fs.existsSync(TAGS_PATH) ? fs.readFileSync(TAGS_PATH, 'utf8') : '';
  const eol = raw.includes('\r\n') ? '\r\n' : '\n'; // keep the file's line endings
  const before = raw ? new Set(JSON.parse(raw).map((t) => t.name)) : new Set();
  const added = tags.filter((t) => !before.has(t.name)).length;
  const removed = before.size - (tags.length - added);

  console.log(`\ntags.json: ${tags.length.toLocaleString('en')} tags (was ${before.size.toLocaleString('en')}: +${added.toLocaleString('en')} / -${removed.toLocaleString('en')})`);
  console.log(`  Danbooru categories: ${countBy(tags, 'category').map(([k, n]) => `${k} (${n})`).join(', ')}`);
  console.log(`  prompt categories: ${countBy(tags, 'promptCategory').map(([k, n]) => `${k} (${n})`).join(', ')}`);

  if (opts.dryRun) {
    console.log('\nDry run: nothing written.');
    return;
  }

  // Minified (the browser downloads this file; pretty-printing added ~40%),
  // written atomically.
  const contents = JSON.stringify(tags) + eol;
  if (contents === raw) {
    console.log('\nAlready up to date.');
    return;
  }
  writeFileAtomic(TAGS_PATH, contents);
  console.log(`\nWrote ${path.relative(ROOT, TAGS_PATH)}. Now run: npm run generate-fuse-index`);
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
