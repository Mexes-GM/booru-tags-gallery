// Public origin of the site, used for canonical URLs and structured data.
// Set VITE_SITE_URL (e.g. https://booru-tags.example.com) at build time; without it
// the URL the visitor is actually on is used, so nothing points at a dead domain.
const configured = (import.meta.env.VITE_SITE_URL as string | undefined)?.replace(/\/+$/, '');

export const SITE_URL: string =
  configured || (typeof window !== 'undefined' ? window.location.origin : '');

export const absoluteUrl = (path = '/'): string =>
  `${SITE_URL}${path.startsWith('/') ? path : `/${path}`}`;
