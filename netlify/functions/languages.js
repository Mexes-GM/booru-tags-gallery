/**
 * Netlify Function to retrieve supported DeepL languages
 * Returns the list of available source and target languages from DeepL API
 */

const DEEPL_API_KEY = process.env.DEEPL_API_KEY;
const DEEPL_API_URL_FREE = 'https://api-free.deepl.com/v2/languages';
const DEEPL_API_URL_PRO = 'https://api.deepl.com/v2/languages';

// Get the appropriate API URL based on the API key (Free or Pro)
const getDeepLApiUrl = () => {
  // Free API keys usually end with ':fx'
  return DEEPL_API_KEY?.endsWith(':fx') ? DEEPL_API_URL_FREE : DEEPL_API_URL_PRO;
};

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Access-Control-Max-Age': '86400'
};

const jsonHeaders = {
  ...corsHeaders,
  'Content-Type': 'application/json'
};

export const handler = async (event) => {
  // Handle CORS preflight requests
  if (event.httpMethod === 'OPTIONS') {
    return {
      statusCode: 200,
      headers: corsHeaders,
      body: ''
    };
  }

  if (event.httpMethod !== 'GET') {
    return {
      statusCode: 405,
      headers: jsonHeaders,
      body: JSON.stringify({ error: 'Method not allowed' })
    };
  }

  if (!DEEPL_API_KEY) {
    console.error('[languages.fn] DEEPL_API_KEY not configured');
    return {
      statusCode: 500,
      headers: jsonHeaders,
      body: JSON.stringify({ error: 'Translation service not configured' })
    };
  }

  try {
    const type = event.queryStringParameters?.type || 'source'; // 'source' or 'target'
    const apiUrl = getDeepLApiUrl();

    console.log(`[languages.fn] Fetching ${type} languages from DeepL API`);

    const response = await fetch(`${apiUrl}?type=${type}`, {
      method: 'GET',
      headers: {
        'Authorization': `DeepL-Auth-Key ${DEEPL_API_KEY}`,
        'User-Agent': 'BooruTagsGallery/1.0'
      }
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('DeepL API Error:', response.status, errorText);
      
      let errorMessage = 'Language service temporarily unavailable';
      if (response.status === 403) {
        errorMessage = 'Translation service access denied';
      } else if (response.status === 429) {
        errorMessage = 'Translation service rate limited';
      }

      return {
        statusCode: response.status >= 500 ? 503 : 400,
        headers: jsonHeaders,
        body: JSON.stringify({ 
          error: 'Failed to fetch languages', 
          message: errorMessage 
        })
      };
    }

    const languages = await response.json();

    console.log(`[languages.fn] Successfully fetched ${languages?.length || 0} ${type} languages`);

    return {
      statusCode: 200,
      headers: { 
        ...jsonHeaders, 
        'Cache-Control': 'public, max-age=86400' // Cache for 24 hours
      },
      body: JSON.stringify({ 
        success: true, 
        data: languages,
        type: type
      })
    };

  } catch (error) {
    console.error('Languages function error:', error);
    
    return {
      statusCode: 500,
      headers: jsonHeaders,
      body: JSON.stringify({ 
        error: 'Internal server error', 
        message: 'An unexpected error occurred while fetching languages' 
      })
    };
  }
};