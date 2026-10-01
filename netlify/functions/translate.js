// Netlify function for /.netlify/functions/translate. Logic lives in server/deepl.js (shared with Vercel).
import { handleTranslate } from '../../server/deepl.js';
import { toNetlify } from '../lib/adapter.js';

export const handler = toNetlify(handleTranslate);
