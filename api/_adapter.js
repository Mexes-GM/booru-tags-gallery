// Adapts the shared DeepL handlers (server/deepl.js) to Vercel's Node (req, res) signature.
export function toVercel(handle) {
  return async function handler(req, res) {
    const result = await handle({ method: req.method, headers: req.headers, body: req.body, query: req.query });
    for (const [key, value] of Object.entries(result.headers)) res.setHeader(key, value);
    if (result.body === null) return res.status(result.status).end();
    return res.status(result.status).json(result.body);
  };
}
