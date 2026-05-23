/**
 * Vercel API Route for DeepL Translation
 * Mirrors logic from Netlify function (netlify/functions/translate.js)
 */

const DEEPL_API_KEY = process.env.DEEPL_API_KEY;
const DEEPL_API_URL = 'https://api-free.deepl.com/v2/translate';

// In-memory rate limiter (ephemeral per lambda instance)
const rateLimitMap = new Map();
const RATE_LIMIT_WINDOW = 60 * 1000; // 1 minute
const MAX_REQUESTS_PER_WINDOW = 10; // per IP

function isRateLimited(ip) {
  const now = Date.now();
  const windowStart = now - RATE_LIMIT_WINDOW;
  if (!rateLimitMap.has(ip)) rateLimitMap.set(ip, []);
  const requests = rateLimitMap.get(ip).filter(ts => ts > windowStart);
  if (requests.length >= MAX_REQUESTS_PER_WINDOW) return true;
  requests.push(now);
  rateLimitMap.set(ip, requests);
  return false;
}

const setCors = (res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
};

export default async function handler(req, res) {
  // Lightweight method log (removed verbose header dump after debugging)
  try { console.log('[translate.api] Method:', req.method); } catch {}
  setCors(res);

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
  return res.status(405).json({ error: 'Method not allowed', message: 'Only POST requests are supported' });
  }

  if (!DEEPL_API_KEY) {
    return res.status(500).json({ error: 'Server misconfiguration', message: 'Translation service API key not configured' });
  }

  try {
    const clientIPRaw = (req.headers['x-forwarded-for'] || req.headers['x-real-ip'] || req.headers['client-ip'] || 'unknown');
    const clientIP = Array.isArray(clientIPRaw) ? clientIPRaw[0] : String(clientIPRaw).split(',')[0].trim();

    if (isRateLimited(clientIP)) {
      return res.status(429).json({ error: 'Rate limit exceeded', message: 'Too many translation requests. Please wait before trying again.' });
    }

    let payload = {};
    try {
      payload = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
    } catch {
      return res.status(400).json({ error: 'Invalid JSON', message: 'Request body must be valid JSON' });
    }

    let { text, target_lang = 'EN', source_lang } = payload;
    if (!text || typeof text !== 'string') {
      return res.status(400).json({ error: 'Invalid input', message: 'Text parameter is required and must be a string' });
    }
    if (text.length > 500) {
      return res.status(400).json({ error: 'Text too long', message: 'Text must be 500 characters or less' });
    }

    console.log('[translate.api] Incoming request', { text, target_lang, source_lang: source_lang || 'auto', fromIP: clientIP });

    const callDeepL = async (opts) => {
      const formData = new URLSearchParams();
      formData.append('text', opts.text);
      formData.append('target_lang', opts.target_lang);
      if (opts.source_lang) formData.append('source_lang', opts.source_lang);

      return fetch(DEEPL_API_URL, {
        method: 'POST',
        headers: {
          'Authorization': `DeepL-Auth-Key ${DEEPL_API_KEY}`,
          'Content-Type': 'application/x-www-form-urlencoded',
          'User-Agent': 'BooruTagsGallery/1.0'
        },
        body: formData
      });
    };

    let response = await callDeepL({ text, target_lang, source_lang });
    if (!response.ok) {
      const errorText = await response.text();
      console.error('[translate.api] DeepL API Error:', response.status, errorText);
      let errorMessage = 'Translation service temporarily unavailable';
      if (response.status === 403) errorMessage = 'Translation quota exceeded';
      else if (response.status === 429) errorMessage = 'Translation service rate limited';
      return res.status(response.status >= 500 ? 503 : 400).json({ error: 'Translation failed', message: errorMessage });
    }

    let data = await response.json();
    let translatedText = data.translations?.[0]?.text;
    let detectedSourceLang = data.translations?.[0]?.detected_source_language;
    const equalIgnoringCase = (a, b) => (a || '').trim().toLowerCase() === (b || '').trim().toLowerCase();

    if (!translatedText || equalIgnoringCase(translatedText, text)) {
      try {
        console.log('[translate.api] Fallback attempt with source_lang=ES');
        const fb = await callDeepL({ text, target_lang, source_lang: 'ES' });
        if (fb.ok) {
          const fbData = await fb.json();
          const fbText = fbData.translations?.[0]?.text;
          if (fbText && !equalIgnoringCase(fbText, text)) {
            translatedText = fbText;
            detectedSourceLang = fbData.translations?.[0]?.detected_source_language || detectedSourceLang;
          }
        } else {
          console.warn('[translate.api] Fallback failed', fb.status);
        }
      } catch (e) {
        console.warn('[translate.api] Fallback error', e);
      }
    }

    if (!translatedText) {
      return res.status(500).json({ error: 'Translation failed', message: 'No translation returned from service' });
    }

    res.setHeader('Cache-Control', 'public, max-age=3600');
    return res.status(200).json({ success: true, data: { translatedText, detectedSourceLang, originalText: text, targetLang: target_lang } });
  } catch (error) {
    console.error('[translate.api] Unexpected error:', error);
    return res.status(500).json({ error: 'Internal server error', message: 'An unexpected error occurred during translation' });
  }
}
