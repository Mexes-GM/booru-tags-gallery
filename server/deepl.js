/**
 * DeepL proxy logic shared by the Vercel routes (api/*.js) and the Netlify
 * functions (netlify/functions/*.js). Each host file only adapts its own
 * request/response shape; everything else lives here so both deploys behave
 * the same.
 *
 * Handlers take { method, headers, body, query } and return
 * { status, headers, body } where body is a plain object (or null for an empty body).
 */

const MAX_TEXT_LENGTH = 500;
const RATE_LIMIT_WINDOW = 60 * 1000; // 1 minute
const MAX_REQUESTS_PER_WINDOW = 10; // per IP, per warm instance
const LANGUAGE_TYPES = new Set(['source', 'target']);
const LANG_CODE = /^[A-Za-z]{2}(-[A-Za-z]{2,4})?$/;

// The browser only calls these endpoints from the same origin, so no CORS
// headers are sent: other sites must not be able to spend the DeepL quota.
const JSON_HEADERS = { 'Content-Type': 'application/json' };

// In-memory limiter: per warm instance only, but enough to stop casual abuse.
const rateLimitMap = new Map();

function isRateLimited(ip) {
  const now = Date.now();
  const recent = (rateLimitMap.get(ip) || []).filter((ts) => ts > now - RATE_LIMIT_WINDOW);
  if (recent.length >= MAX_REQUESTS_PER_WINDOW) {
    rateLimitMap.set(ip, recent);
    return true;
  }
  recent.push(now);
  rateLimitMap.set(ip, recent);
  // Keep the map from growing without bound on long-lived instances.
  if (rateLimitMap.size > 5000) {
    for (const [key, stamps] of rateLimitMap) {
      if (!stamps.some((ts) => ts > now - RATE_LIMIT_WINDOW)) rateLimitMap.delete(key);
    }
  }
  return false;
}

function header(headers, name) {
  const value = headers?.[name] ?? headers?.[name.toLowerCase()];
  return Array.isArray(value) ? value[0] : value;
}

function clientIp(headers) {
  const raw = header(headers, 'x-nf-client-connection-ip')
    || header(headers, 'x-forwarded-for')
    || header(headers, 'x-real-ip')
    || 'unknown';
  return String(raw).split(',')[0].trim();
}

// Free API keys end in ":fx" and must use the api-free host.
function deeplBase(apiKey) {
  return apiKey.endsWith(':fx') ? 'https://api-free.deepl.com/v2' : 'https://api.deepl.com/v2';
}

function deeplHeaders(apiKey) {
  return {
    Authorization: `DeepL-Auth-Key ${apiKey}`,
    'User-Agent': 'BooruTagsGallery/1.0'
  };
}

function upstreamError(status, fallback) {
  let message = fallback;
  if (status === 403) message = 'Translation service access denied or quota exceeded';
  else if (status === 429 || status === 456) message = 'Translation service rate limited';
  return { status: status >= 500 ? 503 : 502, headers: JSON_HEADERS, body: { error: 'Upstream error', message } };
}

const json = (status, body, extraHeaders = {}) => ({ status, headers: { ...JSON_HEADERS, ...extraHeaders }, body });

export async function handleTranslate({ method, headers, body }, apiKey = process.env.DEEPL_API_KEY) {
  if (method === 'OPTIONS') return { status: 204, headers: {}, body: null };
  if (method !== 'POST') {
    return json(405, { error: 'Method not allowed', message: 'Only POST requests are supported' }, { Allow: 'POST' });
  }
  if (!apiKey) {
    return json(500, { error: 'Server misconfiguration', message: 'Translation service API key not configured' });
  }
  if (isRateLimited(clientIp(headers))) {
    return json(429, { error: 'Rate limit exceeded', message: 'Too many translation requests. Please wait before trying again.' }, { 'Retry-After': '60' });
  }

  let payload;
  try {
    payload = typeof body === 'string' ? JSON.parse(body || '{}') : (body || {});
  } catch {
    return json(400, { error: 'Invalid JSON', message: 'Request body must be valid JSON' });
  }

  const { text, target_lang = 'EN', source_lang } = payload;
  if (!text || typeof text !== 'string') {
    return json(400, { error: 'Invalid input', message: 'Text parameter is required and must be a string' });
  }
  if (text.length > MAX_TEXT_LENGTH) {
    return json(400, { error: 'Text too long', message: `Text must be ${MAX_TEXT_LENGTH} characters or less` });
  }
  if (!LANG_CODE.test(String(target_lang)) || (source_lang && !LANG_CODE.test(String(source_lang)))) {
    return json(400, { error: 'Invalid language', message: 'Language codes must look like "EN" or "EN-US"' });
  }

  const callDeepL = (sourceLang) => {
    const form = new URLSearchParams({ text, target_lang: String(target_lang) });
    if (sourceLang) form.append('source_lang', String(sourceLang));
    return fetch(`${deeplBase(apiKey)}/translate`, {
      method: 'POST',
      headers: { ...deeplHeaders(apiKey), 'Content-Type': 'application/x-www-form-urlencoded' },
      body: form
    });
  };

  try {
    const response = await callDeepL(source_lang);
    if (!response.ok) {
      console.error('[translate] DeepL error', response.status);
      return upstreamError(response.status, 'Translation service temporarily unavailable');
    }

    const data = await response.json();
    let translatedText = data.translations?.[0]?.text;
    let detectedSourceLang = data.translations?.[0]?.detected_source_language;

    // DeepL sometimes echoes short Spanish words back untranslated; retry forcing ES.
    const same = (a, b) => (a || '').trim().toLowerCase() === (b || '').trim().toLowerCase();
    if (!source_lang && (!translatedText || same(translatedText, text))) {
      const retry = await callDeepL('ES');
      if (retry.ok) {
        const retryData = await retry.json();
        const retryText = retryData.translations?.[0]?.text;
        if (retryText && !same(retryText, text)) {
          translatedText = retryText;
          detectedSourceLang = retryData.translations?.[0]?.detected_source_language || detectedSourceLang;
        }
      }
    }

    if (!translatedText) {
      return json(502, { error: 'Translation failed', message: 'No translation returned from service' });
    }
    return json(200, {
      success: true,
      data: { translatedText, detectedSourceLang, originalText: text, targetLang: target_lang }
    });
  } catch (error) {
    console.error('[translate] Unexpected error', error instanceof Error ? error.message : error);
    return json(500, { error: 'Internal server error', message: 'An unexpected error occurred during translation' });
  }
}

export async function handleLanguages({ method, query }, apiKey = process.env.DEEPL_API_KEY) {
  if (method === 'OPTIONS') return { status: 204, headers: {}, body: null };
  if (method !== 'GET') return json(405, { error: 'Method not allowed' }, { Allow: 'GET' });
  if (!apiKey) return json(500, { error: 'Translation service not configured' });

  const type = query?.type || 'source';
  if (!LANGUAGE_TYPES.has(type)) {
    return json(400, { error: 'Invalid type', message: 'type must be "source" or "target"' });
  }

  try {
    const response = await fetch(`${deeplBase(apiKey)}/languages?type=${type}`, { headers: deeplHeaders(apiKey) });
    if (!response.ok) {
      console.error('[languages] DeepL error', response.status);
      return upstreamError(response.status, 'Language service temporarily unavailable');
    }
    const languages = await response.json();
    return json(200, { success: true, data: languages, type }, { 'Cache-Control': 'public, max-age=86400' });
  } catch (error) {
    console.error('[languages] Unexpected error', error instanceof Error ? error.message : error);
    return json(500, { error: 'Internal server error', message: 'An unexpected error occurred while fetching languages' });
  }
}
