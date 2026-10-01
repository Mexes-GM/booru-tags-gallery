import React, { useEffect } from 'react';
import { Helmet } from 'react-helmet-async';
import { absoluteUrl } from '../config/site';

export const SITE_NAME = 'Booru Tag Gallery';
const DEFAULT_DESCRIPTION = 'Search and quickly discover the tag you need for your image generation.';

type JsonLd = Record<string, unknown>;

interface SEOProps {
  title?: string;
  description?: string;
  canonical?: string;
  image?: string;
  noIndex?: boolean;
  lang?: string;
  jsonLd?: JsonLd | JsonLd[];
}

// Site-wide WebSite schema. Built at runtime from VITE_SITE_URL (or the current origin)
// so it never points at a hard-coded, possibly dead, domain.
const buildWebsiteJsonLd = (): JsonLd => ({
  '@context': 'https://schema.org',
  '@type': 'WebSite',
  name: SITE_NAME,
  url: absoluteUrl('/'),
  description: 'Explore over 93,000 Danbooru tags with instant search, wiki and visual examples.',
  inLanguage: 'en',
  author: { '@type': 'Person', name: 'Mexes' },
  potentialAction: {
    '@type': 'SearchAction',
    target: absoluteUrl('/?q={search_term}'),
    'query-input': 'required name=search_term'
  }
});

export const SEO: React.FC<SEOProps> = ({
  title,
  description,
  canonical,
  image = '/favicon.png',
  noIndex = false,
  lang = 'en',
  jsonLd
}) => {
  const fullTitle = title && title !== SITE_NAME ? `${title} | ${SITE_NAME}` : SITE_NAME;
  const metaDescription = description || DEFAULT_DESCRIPTION;
  const absoluteImage = /^https?:\/\//.test(image) ? image : absoluteUrl(image);
  const pageJsonLd = jsonLd ? (Array.isArray(jsonLd) ? jsonLd : [jsonLd]) : [];

  // index.html trae Open Graph estático para bots sin JS (Discord, etc.); una vez que
  // Helmet toma el control se retiran para no dejar etiquetas duplicadas.
  useEffect(() => {
    document.head
      .querySelectorAll('meta[property^="og:"]:not([data-rh])')
      .forEach((el) => el.remove());
  }, []);

  return (
    <Helmet htmlAttributes={{ lang }}>
      <title>{fullTitle}</title>
      <meta name="description" content={metaDescription} />
      {noIndex && <meta name="robots" content="noindex,nofollow" />}
      {canonical && <link rel="canonical" href={canonical} />}
      {canonical && <meta property="og:url" content={canonical} />}
      <meta property="og:site_name" content={SITE_NAME} />
      <meta property="og:title" content={fullTitle} />
      <meta property="og:description" content={metaDescription} />
      <meta property="og:image" content={absoluteImage} />
      <meta property="og:image:width" content="64" />
      <meta property="og:image:height" content="64" />
      <script type="application/ld+json">{JSON.stringify(buildWebsiteJsonLd())}</script>
      {pageJsonLd.map((data, i) => (
        <script key={i} type="application/ld+json">{JSON.stringify(data)}</script>
      ))}
    </Helmet>
  );
};

export default SEO;
