// Adapts the shared DeepL handlers (server/deepl.js) to Netlify's (event) => response signature.
export function toNetlify(handle) {
  return async function handler(event) {
    const result = await handle({
      method: event.httpMethod,
      headers: event.headers,
      body: event.isBase64Encoded && event.body ? Buffer.from(event.body, 'base64').toString('utf8') : event.body,
      query: event.queryStringParameters
    });
    return {
      statusCode: result.status,
      headers: result.headers,
      body: result.body === null ? '' : JSON.stringify(result.body)
    };
  };
}
