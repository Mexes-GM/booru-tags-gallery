// Pre-generates the Fuse.js index for public/data/tags.json.
// (Tag groups are small and indexed at runtime by the worker, so no prebuilt index is needed.)
// Run with: node scripts/generate-fuse-index.cjs   (npm run generate-fuse-index)
//
// IMPORTANT: the keys come from src/config/fuseKeys.json, the same file the
// runtime (src/config/fuseOptions.ts) reads. A prebuilt index stores one slot
// per key in key order, so index keys and runtime keys MUST be identical.
// Regenerate the index whenever tags.json or fuseKeys.json changes.
// Output is minified JSON.

const fs = require('fs');
const path = require('path');
const Fuse = require('fuse.js');

const ROOT = path.join(__dirname, '..');
const TAGS_PATH = path.join(ROOT, 'public/data/tags.json');
const INDEX_PATH = path.join(ROOT, 'public/data/fuse-index.json');
const FUSE_KEYS = require(path.join(ROOT, 'src/config/fuseKeys.json'));

const sizeMB = (file) => (fs.statSync(file).size / (1024 * 1024)).toFixed(2);

function main() {
  const startTime = Date.now();
  const tags = JSON.parse(fs.readFileSync(TAGS_PATH, 'utf8'));
  if (!Array.isArray(tags)) throw new Error('tags.json must be an array of objects');

  const tagIndex = Fuse.createIndex(FUSE_KEYS.tags, tags);
  fs.writeFileSync(INDEX_PATH, JSON.stringify(tagIndex.toJSON()));

  // Sanity check: the prebuilt index must answer alias queries with the runtime keys.
  const fuse = new Fuse(tags, { keys: FUSE_KEYS.tags, includeScore: true, useExtendedSearch: true }, Fuse.parseIndex(JSON.parse(fs.readFileSync(INDEX_PATH, 'utf8'))));
  const probe = tags.find((t) => Array.isArray(t.aliases) && t.aliases.length > 0);
  if (probe) {
    const hit = fuse.search({ aliases: `=${probe.aliases[0]}` }, { limit: 5 }).some((r) => r.item.name === probe.name);
    if (!hit) throw new Error(`Index sanity check failed: alias "${probe.aliases[0]}" did not find "${probe.name}"`);
  }
  console.log(`fuse-index.json: ${tags.length.toLocaleString('en')} tags, ${sizeMB(INDEX_PATH)} MB, keys [${FUSE_KEYS.tags.map((k) => k.name).join(', ')}]`);

  console.log(`Done in ${Date.now() - startTime} ms`);
}

try {
  main();
} catch (error) {
  console.error('Error:', error.message);
  process.exit(1);
}
