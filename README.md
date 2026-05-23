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

- **tags.json** — 93,908 Danbooru tags with categories, post counts, and aliases
- **fuse-index.json** — pre-built Fuse.js index for instant fuzzy search
- **tag-groups.json** — curated thematic tag groups

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

## License

MIT — see [LICENSE](LICENSE).
