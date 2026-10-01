/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Public origin of the deployed site, e.g. https://booru-tags.example.com (no trailing slash needed). */
  readonly VITE_SITE_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

/** True only when the bundle was built on Vercel (see vite.config.ts define). */
declare const __ON_VERCEL__: boolean;
