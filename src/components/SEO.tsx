import React from 'react';
import { Helmet } from 'react-helmet-async';

interface SEOProps {
  title?: string;
  description?: string;
  canonical?: string;
  image?: string;
  noIndex?: boolean;
  lang?: string;
  jsonLd?: Record<string, any> | Record<string, any>[];
}

export const SEO: React.FC<SEOProps> = ({
  title,
  description,
  canonical,
  image = '/favicon.png',
  noIndex = false,
  lang = 'en',
  jsonLd
}) => {
  const fullTitle = title ? `${title} | Danbooru Tag Explorer` : 'Danbooru Tag Explorer';
  const metaDescription = description || 'Search and quickly discover the tag you need for your image generation.';
  // Dominio base configurable vía variable de entorno para que coincida con la plataforma de despliegue
  const envSiteUrl = (import.meta as any).env?.VITE_SITE_URL || (typeof window !== 'undefined' ? `${window.location.origin}/` : '');
  const normalizedBase = envSiteUrl.endsWith('/') ? envSiteUrl : envSiteUrl + '/';
  const canonicalUrl = canonical; // Solo usar canonical si se pasa explícitamente (evitar fijar dominio en Netlify)
  const absoluteImage = image.startsWith('http') ? image : normalizedBase + image.replace(/^\//, '');

  return (
    <Helmet htmlAttributes={{ lang }}>
      <title>{fullTitle}</title>
      <meta name="description" content={metaDescription} />
      {noIndex && <meta name="robots" content="noindex,nofollow" />}
  {canonicalUrl && <link rel="canonical" href={canonicalUrl} />}
  {/* Open Graph mínimo (igual que index.html en Netlify) */}
  <meta property="og:title" content={fullTitle} />
  <meta property="og:description" content={metaDescription} />
  <meta property="og:image" content={absoluteImage} />
  <meta property="og:image:width" content="64" />
  <meta property="og:image:height" content="64" />
      {jsonLd && (
        <script type="application/ld+json">
          {JSON.stringify(jsonLd)}
        </script>
      )}
    </Helmet>
  );
};

export default SEO;
