// Netlify function for /.netlify/functions/languages. Logic lives in server/deepl.js (shared with Vercel).
import { handleLanguages } from '../../server/deepl.js';
import { toNetlify } from '../lib/adapter.js';

export const handler = toNetlify(handleLanguages);
