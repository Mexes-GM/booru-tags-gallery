export interface ParsedQuery {
  raw: string;
  includes: string[]; // normal tokens
  phrases: string[]; // quoted
  excludes: string[]; // -token
  category?: string;
  aliasLookup?: string; // alias:term
  debug?: Record<string, unknown>;
}

const CATEGORY_KEYS = ['general','artist','copyright','character','meta','tag_groups'];

export function parseQuery(q: string): ParsedQuery {
  const debug: Record<string, unknown> = {};
  const includes: string[] = [];
  const phrases: string[] = [];
  const excludes: string[] = [];
  let category: string | undefined;
  let aliasLookup: string | undefined;

  const tokenRe = /"([^"]+)"|(\S+)/g;
  let m: RegExpExecArray | null;
  while((m = tokenRe.exec(q))){
    const phrase = m[1];
    const raw = phrase ?? m[2];
    if (!raw) continue;
    if (phrase){
      phrases.push(phrase.toLowerCase());
      continue;
    }
    if (raw.startsWith('-')){
      const ex = raw.slice(1).toLowerCase();
      if (ex) excludes.push(ex);
      continue;
    }
    const kv = raw.split(':');
    if (kv.length === 2){
      const [k,v] = kv;
      if (k === 'category' && CATEGORY_KEYS.includes(v)) { category = v; continue; }
      if (k === 'alias'){ aliasLookup = v.toLowerCase(); continue; }
    }
    includes.push(raw.toLowerCase());
  }
  debug.tokens = {includes:[...includes], phrases:[...phrases], excludes:[...excludes], category, aliasLookup};
  return { raw: q, includes, phrases, excludes, category, aliasLookup, debug };
}
