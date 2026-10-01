// Vercel route for /api/translate. Logic lives in server/deepl.js (shared with Netlify).
import { handleTranslate } from '../server/deepl.js';
import { toVercel } from './_adapter.js';

export default toVercel(handleTranslate);
