// Vercel route for /api/languages. Logic lives in server/deepl.js (shared with Netlify).
import { handleLanguages } from '../server/deepl.js';
import { toVercel } from './_adapter.js';

export default toVercel(handleLanguages);
