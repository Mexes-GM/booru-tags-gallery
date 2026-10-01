<p align="center">
  <img src="public/favicon.png" width="128" alt="Booru Tag Gallery">
</p>

<h1 align="center">Booru Tag Gallery</h1>

<p align="center">
  <img src="https://img.shields.io/badge/TypeScript-3178C6?logo=typescript&logoColor=white" alt="TypeScript">
  <img src="https://img.shields.io/badge/React-18-61DAFB?logo=react" alt="React 18">
  <img src="https://img.shields.io/badge/Vite-7-646CFF?logo=vite" alt="Vite 7">
  <img src="https://img.shields.io/badge/License-MIT-green" alt="MIT License">
  <img src="https://img.shields.io/badge/Tailwind-4-06B6D4?logo=tailwindcss" alt="Tailwind 4">
</p>

<p align="center">
  A modern web app to explore and search 93,000+ Danbooru tags with instant offline search, <br>
  fuzzy matching, tag details with wiki integration, and multi-language support.
</p>

---

## Features

- **93,000+ tags** with local instant search — no network needed for tag lookup
- **Fuzzy search** with typo tolerance and alias matching
- **Autocomplete** with real-time suggestions
- **Tag detail pages** with wiki excerpts, related tags, and post galleries
- **Category filters** — General, Artist, Copyright, Character, Meta
- **Tag groups** — curated thematic collections
- **Smart tag conflict detection** — 180+ trigger rules across 43 families
- **i18n** — English and Spanish, with DeepL integration for tag translations
- **Dark mode** with system preference detection
- **NSFW filtering** — content-aware toggle
- **Infinite scroll** with optimized Danbooru API rate limiting
- **SEO** with Open Graph, JSON-LD, and auto-generated sitemaps
- **PWA-ready** with service worker and offline support

## Screenshots

<p align="center">
  <img src="public/screenshots/homepage.png" width="800" alt="Booru Tag Gallery">
</p>

## Quick Start

```bash
git clone https://github.com/Mexes-GM/booru-tags-gallery.git
cd Booru-tags-gallery
npm install
npm run dev
```

Open [http://localhost:5173](http://localhost:5173).

## Build

```bash
npm run build          # type-check + production build
npm run preview        # preview production build locally
```

## Project Structure

```
src/
├── components/
│   ├── common/         # Shared: TagModal, ImageModal, InfinitePostGallery, etc.
│   ├── analytics/      # Vercel Analytics custom event tracking
│   ├── HomePage.tsx    # Main gallery + search
│   ├── TagDetailPage.tsx  # Full tag detail with wiki, posts, related
│   ├── TagCard.tsx     # Category-colored card with dynamic preview
│   ├── SearchBar.tsx   # Autocomplete with fuzzy matching
│   └── ...
├── hooks/              # useTagSearch, useInfiniteTagScroll, useDanbooruRateLimitedScroll
├── services/           # danbooruApi — centralized API with rate limiting
├── utils/              # Normalization, caching, formatting, query parsing
├── config/             # App, performance, image optimization, Fuse.js config
├── context/            # DarkMode, NSFWFilter, TagModal, ImageModal contexts
├── i18n/               # locales/ for en + es
├── workers/            # tagSearch.worker — Web Worker for offline search
└── types/              # TypeScript type definitions
api/                    # Netlify Functions (proxy + DeepL translate)
scripts/                # Build, audit, sitemap, and data generation scripts
public/data/            # tags.json (93k+ tags), fuse-index.json, tag-groups.json
```

## Data

- **tags.json** — 93,908 Danbooru tags with categories, post counts, and aliases, plus an optional prompt taxonomy (`promptCategory` / `subcategory`, e.g. `clothing` / `headwear`) on ~14k of them
- **fuse-index.json** — pre-built Fuse.js index for instant fuzzy search
- **tag-groups.json** — curated thematic tag groups

### Syncing the prompt taxonomy

`promptCategory` and `subcategory` come from the `auto_suggest_tags` table that [Booru Prompt Gallery](https://booru-prompt-gallery.vercel.app) keeps in Supabase. Refresh them with:

```bash
npm run sync-tags -- --env ../booru-prompt-gallery/.env.local
```

Or put `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` in `.env.local` and run `npm run sync-tags`. Add `--dry-run` to preview. The script runs locally only; the site never talks to Supabase. It deliberately leaves names, counts and aliases untouched, because that table's copy of them lags behind Danbooru.

## Tech Stack

- [React 18](https://react.dev) + [TypeScript](https://www.typescriptlang.org/)
- [Vite 7](https://vitejs.dev) — fast dev server and build tooling
- [Tailwind CSS 4](https://tailwindcss.com) — utility-first styling
- [Fuse.js](https://fusejs.io) — fuzzy search engine
- [react-i18next](https://react.i18next.com) — internationalization
- [react-router-dom](https://reactrouter.com) — client-side routing
- [react-window](https://react-window.vercel.app) — virtualized lists
- [react-infinite-scroll-component](https://www.npmjs.com/package/react-infinite-scroll-component)
- [lucide-react](https://lucide.dev) — icons
- [axios](https://axios-http.com) — HTTP client

## Deployment

Deployed on **Netlify** with serverless functions for API proxying and translation. Also compatible with **Vercel**.

```bash
npm run deploy:netlify    # production deploy
npm run deploy:preview    # preview deploy
```

### Site URL (`VITE_SITE_URL`)

Set `VITE_SITE_URL` to the public origin of the deployment (e.g. `https://booru-tags.example.com`) in `.env` or in the host's build environment. It is used for canonical URLs, Open Graph and JSON-LD (`src/config/site.ts`); without it the app falls back to the URL the visitor is on.

The sitemap also needs it: `VITE_SITE_URL=https://your-domain npm run generate-sitemap` writes `public/sitemap.xml` (a sitemap index) plus `sitemap-N.xml` files with every tag ordered by post count, split into files of 45,000 URLs, and adds the `Sitemap:` line to `public/robots.txt`. With no URL configured, the script prints a notice and writes nothing.

## License

MIT — see [LICENSE](LICENSE).
