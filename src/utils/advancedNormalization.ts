/** Advanced normalization & variant generation */

export interface NormalizationOutput {
  primary: string;
  variants: string[]; // includes primary
  debug?: Record<string, any>;
}

const TRANSLITERATION_MAP: Record<string,string> = {
  'ñ':'n','á':'a','à':'a','ä':'a','â':'a','ã':'a','å':'a','ç':'c','é':'e','è':'e','ë':'e','ê':'e','í':'i','ì':'i','ï':'i','î':'i','ó':'o','ò':'o','ö':'o','ô':'o','õ':'o','ú':'u','ù':'u','ü':'u','û':'u','ý':'y','ÿ':'y','ß':'ss','æ':'ae','œ':'oe'
};

function stripDiacritics(str: string){
  return str.normalize('NFD').replace(/[\u0300-\u036f]/g,'');
}

function transliterate(str: string){
  return str.split('').map(ch => TRANSLITERATION_MAP[ch] || ch).join('');
}

function pluralSingularVariants(word: string): string[]{
  const v = new Set<string>([word]);
  if (word.length >=3){
    if (word.endsWith('ies')) v.add(word.slice(0,-3)+'y');
    if (word.endsWith('ves')){ v.add(word.slice(0,-3)+'f'); v.add(word.slice(0,-3)+'fe'); }
    if (/(ses|ches|shes|xes)$/.test(word)) v.add(word.slice(0,-2));
    if (word.endsWith('s') && !word.endsWith('ss')) v.add(word.slice(0,-1));
    if (word.endsWith('y') && !/[aeiou]/.test(word[word.length-2])) v.add(word.slice(0,-1)+'ies');
    if (word.endsWith('f')) v.add(word.slice(0,-1)+'ves');
    if (word.endsWith('fe')) v.add(word.slice(0,-2)+'ves');
    if (/(s|ch|sh|x|z)$/.test(word) && !word.endsWith('es')) v.add(word+'es');
    if (!word.endsWith('s')) v.add(word+'s');
  }
  return [...v];
}

export function advancedNormalize(term: string, maxVariants = 25): NormalizationOutput {
  const debug: Record<string,any> = {};
  const base = term.trim().toLowerCase();
  const stripped = stripDiacritics(base);
  const translit = transliterate(stripped);
  debug.base = base; debug.stripped = stripped; debug.translit = translit;

  const initial = new Set<string>([base, stripped, translit]);
  // space/underscore/hyphen variants
  const swapChars = (s:string) => {
    if (/[ \-_]/.test(s)){
      initial.add(s.replace(/[ \-]+/g,'_'));
      initial.add(s.replace(/[ _]+/g,'-'));
      initial.add(s.replace(/[ \-_]+/g,' '));
      initial.add(s.replace(/[ \-_]+/g,''));
    }
  };
  [...initial].forEach(swapChars);

  // remove parentheses content
  [...initial].forEach(v=>{ initial.add(v.replace(/\([^)]*\)/g,'').trim()); });

  // plural/singular per token
  [...initial].forEach(v=>{
    v.split(/[_\-\s]+/).forEach(w=> pluralSingularVariants(w).forEach(pw=>{
      if (pw!==w){ initial.add(v.replace(w,pw)); }
    }));
  });

  const variants = [...initial].filter(Boolean).slice(0,maxVariants);
  const primary = variants[0];
  return { primary, variants, debug };
}
