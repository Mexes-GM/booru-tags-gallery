/**
 * Netlify Function for DeepL Translation
 * Handles translation requests while keeping the API key secure
 */

const DEEPL_API_KEY = process.env.DEEPL_API_KEY;
const DEEPL_API_URL = 'https://api-free.deepl.com/v2/translate';

// Rate limiting storage (in production, use a proper cache like Redis)
const rateLimitMap = new Map();
const RATE_LIMIT_WINDOW = 60 * 1000; // 1 minute
const MAX_REQUESTS_PER_WINDOW = 10; // 10 requests per minute per IP

// Simple rate limiting
function isRateLimited(ip) {
  const now = Date.now();
  const windowStart = now - RATE_LIMIT_WINDOW;
  
  if (!rateLimitMap.has(ip)) {
    rateLimitMap.set(ip, []);
  }
  
  const requests = rateLimitMap.get(ip);
  // Clean old requests
  const recentRequests = requests.filter(timestamp => timestamp > windowStart);
  rateLimitMap.set(ip, recentRequests);
  
  if (recentRequests.length >= MAX_REQUESTS_PER_WINDOW) {
    return true;
  }
  
  // Add current request
  recentRequests.push(now);
  return false;
}

const jsonHeaders = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type'
};

export async function handler(event) {
  // Handle CORS preflight
  if (event.httpMethod === 'OPTIONS') {
    return {
      statusCode: 200,
      headers: jsonHeaders,
      body: ''
    };
  }

  // Only allow POST requests
  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      headers: jsonHeaders,
      body: JSON.stringify({ error: 'Method not allowed', message: 'Only POST requests are supported' })
    };
  }

  // Security: ensure API key is present server-side only
  if (!DEEPL_API_KEY) {
    return {
      statusCode: 500,
      headers: jsonHeaders,
      body: JSON.stringify({ error: 'Server misconfiguration', message: 'Translation service API key not configured' })
    };
  }

  try {
    // Get client IP for rate limiting
    const headers = event.headers || {};
    const clientIP = headers['x-forwarded-for'] || headers['x-real-ip'] || headers['client-ip'] || 'unknown';

    // Check rate limiting
    if (isRateLimited(clientIP)) {
      return {
        statusCode: 429,
        headers: jsonHeaders,
        body: JSON.stringify({ error: 'Rate limit exceeded', message: 'Too many translation requests. Please wait before trying again.' })
      };
    }

    // Parse request body
    let payload = {};
    try {
      payload = JSON.parse(event.body || '{}');
    } catch {
      return {
        statusCode: 400,
        headers: jsonHeaders,
        body: JSON.stringify({ error: 'Invalid JSON', message: 'Request body must be valid JSON' })
      };
    }

    let { text, target_lang = 'EN', source_lang } = payload;

    // Validate input
    if (!text || typeof text !== 'string') {
      return {
        statusCode: 400,
        headers: jsonHeaders,
        body: JSON.stringify({ error: 'Invalid input', message: 'Text parameter is required and must be a string' })
      };
    }

    // Limit text length to prevent abuse
    if (text.length > 500) {
      return {
        statusCode: 400,
        headers: jsonHeaders,
        body: JSON.stringify({ error: 'Text too long', message: 'Text must be 500 characters or less' })
      };
    }

    // Log incoming (non-sensitive) request info
    try {
      console.log('[translate.fn] Incoming request:', {
        text,
        target_lang,
        source_lang: source_lang || 'auto',
        fromIP: clientIP
      });
    } catch {
      // Ignore logging errors - not critical
    }

    // Helper to call DeepL
    const callDeepL = async (opts) => {
      const formData = new URLSearchParams();
      formData.append('text', opts.text);
      formData.append('target_lang', opts.target_lang);
      if (opts.source_lang) {
        formData.append('source_lang', opts.source_lang);
      }

      const response = await fetch(DEEPL_API_URL, {
        method: 'POST',
        headers: {
          'Authorization': `DeepL-Auth-Key ${DEEPL_API_KEY}`,
          'Content-Type': 'application/x-www-form-urlencoded',
          'User-Agent': 'BooruTagsGallery/1.0'
        },
        body: formData
      });
      return response;
    };

    // First attempt (auto-detect source language)
    let response = await callDeepL({ text, target_lang, source_lang });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('DeepL API Error:', response.status, errorText);
      
      let errorMessage = 'Translation service temporarily unavailable';
      if (response.status === 403) {
        errorMessage = 'Translation quota exceeded';
      } else if (response.status === 429) {
        errorMessage = 'Translation service rate limited';
      }

      return {
        statusCode: response.status >= 500 ? 503 : 400,
        headers: jsonHeaders,
        body: JSON.stringify({ error: 'Translation failed', message: errorMessage })
      };
    }

    let translationData = await response.json();

    // Extract translated text
    let translatedText = translationData.translations?.[0]?.text;
    let detectedSourceLang = translationData.translations?.[0]?.detected_source_language;

    try {
      console.log('[translate.fn] DeepL response (first attempt):', {
        detectedSourceLang,
        translatedText
      });
    } catch {
      // Ignore logging errors - not critical
    }

    // Fallback: If translation equals input (ignoring case/trim), try forcing Spanish as source
    const equalIgnoringCase = (a, b) => (a || '').trim().toLowerCase() === (b || '').trim().toLowerCase();
    if (!translatedText || equalIgnoringCase(translatedText, text)) {
      try {
        console.log('[translate.fn] Fallback attempt with source_lang=ES because translated text equals input');
        const fallbackResp = await callDeepL({ text, target_lang, source_lang: 'ES' });
        if (fallbackResp.ok) {
          const fbData = await fallbackResp.json();
          const fbText = fbData.translations?.[0]?.text;
          const fbDetected = fbData.translations?.[0]?.detected_source_language;
          console.log('[translate.fn] Fallback DeepL response:', { detectedSourceLang: fbDetected, translatedText: fbText });
          if (fbText && !equalIgnoringCase(fbText, text)) {
            translatedText = fbText;
            detectedSourceLang = fbDetected || detectedSourceLang;
          }
        } else {
          const fbErr = await fallbackResp.text();
          console.warn('[translate.fn] Fallback request failed:', fallbackResp.status, fbErr);
        }
      } catch (fbErr) {
        console.warn('[translate.fn] Fallback call error:', fbErr);
      }
    }

    if (!translatedText) {
      return {
        statusCode: 500,
        headers: jsonHeaders,
        body: JSON.stringify({ error: 'Translation failed', message: 'No translation returned from service' })
      };
    }

    return {
      statusCode: 200,
      headers: { ...jsonHeaders, 'Cache-Control': 'public, max-age=3600' },
      body: JSON.stringify({ success: true, data: { translatedText, detectedSourceLang, originalText: text, targetLang: target_lang } })
    };

  } catch (error) {
    console.error('Translation function error:', error);
    
    return {
      statusCode: 500,
      headers: jsonHeaders,
      body: JSON.stringify({ error: 'Internal server error', message: 'An unexpected error occurred during translation' })
    };
  }
}