/**
 * Vercel API Route to retrieve supported DeepL languages
 * Mirrors logic from Netlify function (netlify/functions/languages.js)
 */

const DEEPL_API_KEY = process.env.DEEPL_API_KEY;
const DEEPL_API_URL_FREE = 'https://api-free.deepl.com/v2/languages';
const DEEPL_API_URL_PRO = 'https://api.deepl.com/v2/languages';

const getDeepLApiUrl = () => (DEEPL_API_KEY?.endsWith(':fx') ? DEEPL_API_URL_FREE : DEEPL_API_URL_PRO);

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Access-Control-Max-Age': '86400'
};

export default async function handler(req, res) {
  // CORS preflight
  if (req.method === 'OPTIONS') {
    Object.entries(corsHeaders).forEach(([k, v]) => res.setHeader(k, v));
    return res.status(200).end();
  }

  Object.entries(corsHeaders).forEach(([k, v]) => res.setHeader(k, v));
  res.setHeader('Content-Type', 'application/json');

  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  if (!DEEPL_API_KEY) {
    console.error('[languages.api] DEEPL_API_KEY not configured');
    return res.status(500).json({ error: 'Translation service not configured' });
  }

  try {
    const type = (req.query?.type || 'source');
    const apiUrl = getDeepLApiUrl();
    console.log(`[languages.api] Fetching ${type} languages from DeepL API`);

    const response = await fetch(`${apiUrl}?type=${type}`, {
      method: 'GET',
      headers: {
        'Authorization': `DeepL-Auth-Key ${DEEPL_API_KEY}`,
        'User-Agent': 'BooruTagsGallery/1.0'
      }
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('[languages.api] DeepL API Error:', response.status, errorText);
      let errorMessage = 'Language service temporarily unavailable';
      if (response.status === 403) errorMessage = 'Translation service access denied';
      else if (response.status === 429) errorMessage = 'Translation service rate limited';
      return res
        .status(response.status >= 500 ? 503 : 400)
        .json({ error: 'Failed to fetch languages', message: errorMessage });
    }

    const languages = await response.json();
    console.log(`[languages.api] Successfully fetched ${languages?.length || 0} ${type} languages`);
    res.setHeader('Cache-Control', 'public, max-age=86400');
    return res.status(200).json({ success: true, data: languages, type });
  } catch (error) {
    console.error('[languages.api] Unexpected error:', error);
    return res.status(500).json({ error: 'Internal server error', message: 'An unexpected error occurred while fetching languages' });
  }
}
