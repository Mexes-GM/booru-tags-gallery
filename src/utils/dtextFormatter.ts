/**
 * Utilidades unificadas para formatear texto DText de Danbooru
 * Convierte DText a HTML/React-friendly manteniendo la seguridad
 * 
 * Basado en la documentación oficial de Danbooru DText:
 * https://deepwiki.com/danbooru/danbooru/7-text-processing
 *
 * SEGURIDAD: el texto de las wikis es editable por cualquier usuario (no confiable).
 * 1) La entrada se escapa (& < >) antes de convertir DText a HTML.
 * 2) Las URLs se validan (solo http(s), rutas relativas y anchors) y los atributos se escapan.
 * 3) Todo HTML devuelto pasa por DOMPurify (sanitizeHtml) como última barrera.
 */

import DOMPurify from 'dompurify';

// ===== TIPOS Y INTERFACES =====

interface PostImageMap { [postId: number]: string; }
interface DTextBlock { type: 'header' | 'list' | 'text'; content: string; }
interface CutPoint { pattern: RegExp; preference: number; }
interface CategoryPosts { [category: string]: number[]; }

// ===== CONSTANTES Y CONFIGURACIÓN (restaurado tras refactor) =====
const DTextConfig = {
  MAX_EXTRACT_LENGTH: 280,
  MIN_PARAGRAPH_LENGTH: 30,
  MIN_WORD_COUNT: 5,
  MIN_LINE_LENGTH: 15,
  MIN_LINE_WORD_COUNT: 3,
  TRUNCATE_TOLERANCE: 50,
  TRUNCATE_TARGET_RATIO: 0.9,
  TRUNCATE_RANGE_RATIO: 0.1,
  MIN_TRUNCATE_RATIO: 0.5,
  LAST_SPACE_RATIO: 0.7,
  CSS_CLASSES: {
    LINK: 'underline decoration-primary-text/40 underline-offset-[3px] text-primary-text hover:decoration-primary-text',
    TAG_LINK: 'cat-badge cat-default cursor-pointer mr-1',
    WIKI_LINK: 'cat-badge cat-default cursor-pointer mr-1',
    EXTERNAL_LINK: 'cat-badge cat-default cursor-pointer mr-1',
    USER_MENTION: 'cat-badge cat-default',
    TAG_REQUEST: 'cat-badge mr-1',
    SPOILER: 'spoiler-inline',
    NOTE: 'text-xs bg-muted text-muted-foreground px-1 rounded',
    CODE_BLOCK: 'bg-muted border border-border rounded-lg p-3 text-sm font-mono overflow-x-auto my-2 text-foreground',
    QUOTE: 'border-l border-border pl-4 italic text-muted-foreground my-2',
    LIST_ITEM: 'text-foreground/85 text-sm whitespace-normal h-auto flex items-start leading-snug',
    LIST_CONTAINER: 'flex flex-wrap gap-1.5 my-2 items-center',
    MEDIA_GALLERY: 'media-gallery grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3 mb-4 h-full',
    MEDIA_EMBED: 'dtext-media-embed flex flex-col bg-card rounded-xl overflow-hidden',
    MEDIA_IMAGE: 'flex-1 flex items-center justify-center min-h-[120px] media-embed-image p-2 bg-muted/50',
    MEDIA_CAPTION: 'media-embed-caption mt-auto p-2 text-xs text-center text-muted-foreground text-balance',
    POST_BADGE: 'cat-badge cat-default cursor-pointer mr-1 font-mono tabular-nums'
  },
  HEADERS: {
    h1: { class: 'text-xl font-semibold tracking-tight mb-3 text-foreground', pattern: /^h1(?:#([a-zA-Z0-9_\-]+))?\.\s+(.*)$/gm },
    h2: { class: 'text-lg font-semibold tracking-tight mb-2 text-foreground', pattern: /^h2(?:#([a-zA-Z0-9_\-]+))?\.\s+(.*)$/gm },
    h3: { class: 'text-base font-semibold mb-2 text-foreground', pattern: /^h3(?:#([a-zA-Z0-9_\-]+))?\.\s+(.*)$/gm },
    h4: { class: 'text-sm font-semibold mt-4 mb-2 text-foreground', pattern: /^h4(?:#([a-zA-Z0-9_\-]+))?\.\s+(.*)$/gm },
    h5: { class: 'text-sm font-semibold mb-1 text-foreground', pattern: /^h5(?:#([a-zA-Z0-9_\-]+))?\.\s+(.*)$/gm },
    h6: { class: 'text-xs font-semibold mb-1 text-foreground', pattern: /^h6(?:#([a-zA-Z0-9_\-]+))?\.\s+(.*)$/gm }
  },
  FORMAT_TAGS: {
    bold: { tag: 'strong', class: 'font-semibold' },
    italic: { tag: 'em', class: 'italic' },
    underline: { tag: 'u', class: 'underline' },
    strikethrough: { tag: 's', class: 'line-through' },
    translation: { tag: 'span', class: 'text-xs bg-muted text-muted-foreground px-1 rounded', title: 'Nota de traducción' }
  },
  REQUEST_TAGS: {
    ta: { class: 'cat-general', label: 'Tag Alias' },
    ti: { class: 'cat-meta', label: 'Tag Implication' },
    bur: { class: 'cat-artist', label: 'BUR' }
  }
} as const;

// ===== REGEX COMPILADOS (para mejor performance) =====

const DTextRegex = {
  // Enlaces
  DIRECT_LINK: /&lt;(https?:\/\/[^&\s]+)&gt;/g,
  CUSTOM_LINK: /"([^"]+)":\[([^\]]+)\]/g,
  CUSTOM_LINK_ALT: /"([^"]+)":(https?:\/\/[^\s\]<>&"']+)/g,
  MARKDOWN_LINK: /\[([^\]]+)\]\((https?:\/\/(?:[^\s()<>]|\([^\s()<>]+\))+)\)/g,
  URL_PLAIN: /(^|[^"'=])(https?:\/\/(?:[^\s()<>]|\([^\s()<>]+\))+)/g,
  
  // Tags de formato
  BOLD: /\[b\](.*?)\[\/b\]/g,
  ITALIC: /\[i\](.*?)\[\/i\]/g,
  UNDERLINE: /\[u\](.*?)\[\/u\]/g,
  STRIKETHROUGH: /\[s\](.*?)\[\/s\]/g,
  TRANSLATION: /\[tn\](.*?)\[\/tn\]/g,
  LINE_BREAK: /\[br\]/g,
  
  // Bloques complejos
  EXPAND: /\[expand[^]]*\][\s\S]*?\[\/expand\]/gi,
  TABLE: /\[table\][\s\S]*?\[\/table\]/gi,
  QUOTE: /\[quote\]([\s\S]*?)\[\/quote\]/gi,
  CODE: /\[code\]([\s\S]*?)\[\/code\]/gi,
  SPOILER: /\[spoilers?\]([\s\S]*?)\[\/spoilers?\]/gi,
  
  // Menciones y enlaces
  USER_MENTION_HTML: /&lt;@([a-zA-Z0-9_-]+)&gt;/g,
  USER_MENTION: /@([a-zA-Z0-9_-]+)/g,
  TAG_LINK: /\{\{([^}]+)\}\}/g,
  WIKI_LINK: /\[\[([^\]|]+)(\|([^\]]*))?\]\]/g,
  EXTERNAL_LINK: /"([^"]+)":\[(https?:\/\/[^\]]+)\]/g,
  NUMBERED_REFERENCE: /"(\[\d+\])":\[(#[^[\]]+)\]/g,
  NUMBERED_LINK_DEFINITION: /^\s*\[(\d+)\]\s+(https?:\/\/[^\s]+)\s*$/gm,
  
  // Listas
  BULLET_ITEM: /^(\*+)\s+(.+)$/,
  
  // Requests
  TAG_REQUEST: /\[(ta|ti|bur):(\d+)\]/g,
  
  // Media
  POST_REFERENCE: /(?:!post|post)\s+#\d+[:\s]?[^.]*\./g,
  POST_SIMPLE: /(?:!post|post)\s+#\d+/g,
  ASSET_REFERENCE: /!asset\s+#\d+/g,
  POST_EXAMPLE: /^\s*\*+\s*(?:!post|post)\s+#(\d+)(:?\s*(.*))?$/gm,
  POST_INDIVIDUAL: /(?:!post|post)\s+#(\d+)(:)?/g,
  
  // Emojis
  EMOJI: /:([a-zA-Z0-9_+-]+):/g,
  
  // Limpieza
  UNWANTED_SECTIONS: /^\*\s+(?:!post|post).*$/gm,
  EXAMPLES_HEADER: /^Examples?\s*$/gim,
  SEE_ALSO_HEADER: /^See also\s*$/gim,
  REMAINING_TAGS: /\[(?!\[|\/|b\]|i\]|u\]|s\]|tn\]|br\]|ta:|ti:|bur:)([^\]]+)\]/g,
  
  // Espacios y normalización
  MULTIPLE_SPACES: /\s+/g,
  MULTIPLE_LINEBREAKS: /\n\s*\n/g,
  LINEBREAKS: /\n/g,
  
  // Headers para parsing
  // Soporta encabezados con o sin id (h4. Title o h4#about. Title)
  HEADER_PATTERN: /^\s*(h[1-6](?:#[a-zA-Z0-9_\-]+)?)\.\s*(.*)$/gm,
  POST_LIST_PATTERN: /^\s*\*.*(?:!post|post)\s*#\d+/m,
  
  // Puntos de corte inteligente
  SENTENCE_END: /[.!?]\s+(?![^[]*])/g,
  SEMICOLON_COLON: /[;:]\s+(?![^[]*])/g,
  COMMA: /,\s+(?![^[]*])/g,
  SPACE: /\s+(?![^[]*])/g,
  
  // Brackets counting
  OPEN_BRACKETS: /\[/g,
  CLOSE_BRACKETS: /\]/g,
  OPEN_CURLIES: /\{\{/g,
  CLOSE_CURLIES: /\}\}/g,
  
  // Validación de líneas
  HEADER_LINE: /^h[1-6]\./,
  BULLET_LINE: /^\*+\s/,
  MEDIA_REFERENCE: /^(?:!)?(?:post|asset)/,
  SECTION_HEADERS: /^(Examples?|See also|Related)/i,
  REQUEST_LINE: /^\[(?:ta|ti|bur):\d+\]/,
  MENTION_LINE: /^@/,
  ALPHABETIC: /[a-zA-Z]/,
  
  // Párrafos
  PARAGRAPH_SPLIT: /\r?\n\s*\r?\n/,
  LINE_SPLIT: /\r?\n/,
  
  // Posts de ejemplo
  POST_PATTERN: /(?:!post|post)\s+#(\d+)/g,
  CATEGORY_HEADER: /^h([4-6])\.\s+(.+)$/,
  
  // URLs seguras
  SAFE_URL: /^https?:\/\//i,
  SAFE_PATH: /^\/[^/]/,
  
  // HTML peligroso
  SCRIPT_TAG: /<script[\s\S]*?<\/script>/gi,
  IFRAME_TAG: /<iframe[\s\S]*?<\/iframe>/gi,
  OBJECT_TAG: /<object[\s\S]*?<\/object>/gi,
  EMBED_TAG: /<embed[\s\S]*?<\/embed>/gi,
  FORM_TAG: /<form[\s\S]*?<\/form>/gi,
  INPUT_TAG: /<input[\s\S]*?\/?>/gi,
  TEXTAREA_TAG: /<textarea[\s\S]*?<\/textarea>/gi,
  SELECT_TAG: /<select[\s\S]*?<\/select>/gi,
  BUTTON_TAG: /<button[\s\S]*?<\/button>/gi,
  EVENT_HANDLER_QUOTED: /on\w+\s*=\s*["'][^"']*["']/gi,
  EVENT_HANDLER_UNQUOTED: /on\w+\s*=\s*[^\s>]+/gi,
  JAVASCRIPT_URL: /javascript\s*:/gi,
  VBSCRIPT_URL: /vbscript\s*:/gi,
  DATA_URL: /data\s*:/gi,
  STYLE_TAG: /<style[\s\S]*?<\/style>/gi,
  STYLE_ATTR_QUOTED: /style\s*=\s*["'][^"']*["']/gi,
  STYLE_ATTR_UNQUOTED: /style\s*=\s*[^\s>]+/gi,
  HTML_TAG: /<\/?(\w+)([^>]*)>/g,
  ATTRIBUTE_PATTERN: /(\w+)\s*=\s*["']([^"']*)["']/g,
  HTML_ENTITIES: /(<[^>]*>)|([<>&])/g,
  
  // Entidades HTML
  AMP_ENTITY: /&amp;/g,
  LT_ENTITY: /&lt;/g,
  GT_ENTITY: /&gt;/g,
  
  // Enlaces externos en texto plano
  EXTERNAL_URL_PLAIN: /(^|>)(https?:\/\/[^\s<>"]+)(?=<|$)/g,
  
  // Line breaks inteligentes
  SMART_LINEBREAK: /(?<!<\/h[1-6]>)(?<!<\/ul>)(?<!<\/ol>)(?<!<\/div>)(?<!<\/table>)(?<!<\/blockquote>)(?<!<\/pre>)([^>])\n(?=[^<])/g
} as const;

// ===== FUNCIONES UTILITARIAS =====

// Diccionario de emojis comunes
const emojiMap: Record<string, string> = {
  heart: '❤️',
  star: '⭐',
  smile: '😄',
  wink: '😉',
  thumbsup: '👍',
  fire: '🔥',
  eyes: '👀',
  check: '✅',
  x: '❌',
  warning: '⚠️',
  info: 'ℹ️',
  question: '❓',
  arrow_right: '➡️',
  arrow_left: '⬅️',
  arrow_up: '⬆️',
  arrow_down: '⬇️',
  // Agrega más según necesidad
};

/**
 * Valida que el input sea una cadena válida
 */
const validateStringInput = (input: unknown): input is string => {
  return typeof input === 'string' && input.length > 0;
};

// '&' que NO inicia una entidad ya existente (permite escapar de forma idempotente)
const BARE_AMPERSAND = /&(?!(?:[a-zA-Z][a-zA-Z0-9]{1,31}|#\d{1,7}|#[xX][0-9a-fA-F]{1,6});)/g;

/**
 * Escapa caracteres HTML básicos (idempotente: no re-escapa entidades existentes,
 * por lo que es seguro aplicarlo sobre texto ya escapado)
 */
const escapeHtml = (text: string): string => {
  return text
    .replace(BARE_AMPERSAND, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
};

/**
 * Escapa un valor para usarlo dentro de un atributo HTML entre comillas dobles
 */
const escapeAttr = (value: string): string => {
  return escapeHtml(String(value))
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
};

/**
 * Decodifica entidades HTML numéricas y las básicas con nombre (para validar URLs
 * tal y como las interpretará el navegador)
 */
const decodeEntitiesForUrlCheck = (value: string): string => {
  return value
    .replace(/&#[xX]([0-9a-fA-F]+);?/g, (_m, hex) => {
      const cp = parseInt(hex, 16);
      return cp > 0 && cp <= 0x10ffff ? String.fromCodePoint(cp) : '';
    })
    .replace(/&#(\d+);?/g, (_m, dec) => {
      const cp = parseInt(dec, 10);
      return cp > 0 && cp <= 0x10ffff ? String.fromCodePoint(cp) : '';
    })
    .replace(/&quot;?/gi, '"')
    .replace(/&apos;?/gi, "'")
    .replace(/&lt;?/gi, '<')
    .replace(/&gt;?/gi, '>')
    .replace(/&amp;?/gi, '&');
};

/**
 * Valida un valor de URL YA DECODIFICADO (tal como lo ve el DOM).
 * Permite: http:, https:, rutas relativas, '#anchor', '?query'. Rechaza cualquier otro esquema
 * (javascript:, data:, vbscript:, etc.).
 */
const isAllowedUrlValue = (decoded: string): boolean => {
  // Los navegadores ignoran espacios/controles al resolver el esquema → eliminarlos para validar
  const v = decoded.replace(/[\u0000- \u007f-\u009f]/g, '');
  if (v === '') return true;
  if (/^https?:/i.test(v)) return true;
  // Sin esquema: no debe haber ':' antes del primer '/', '?' o '#'
  return !/^[^/?#]*:/.test(v);
};

/**
 * Valida una URL tal como aparece en el HTML generado (puede contener entidades)
 */
const isSafeUrl = (url: string): boolean => {
  if (typeof url !== 'string') return false;
  const decoded = decodeEntitiesForUrlCheck(url);
  if (/^\s*https?:/i.test(decoded)) return isAllowedUrlValue(decoded);
  // URL no-http: rechazar si quedan entidades con nombre desconocidas (p.ej. &colon;)
  if (/&[a-zA-Z]/.test(decoded)) return false;
  return isAllowedUrlValue(decoded);
};

/**
 * Escapa texto para usar dentro de atributos HTML (title) y contenido visible de notas de traducción.
 * Además elimina/reemplaza cualquier referencia a posts dentro de la nota para evitar que se procesen luego.
 */
const sanitizeTranslationNote = (raw: string): { title: string; visible: string } => {
  let cleaned = (raw || '').trim();
  // El patrón a veces viene con pipes delimitadores: | texto | (post #123)
  cleaned = cleaned.replace(/^\|/, '').replace(/\|$/,'').trim();
  // Quitar paréntesis envolventes totales
  if (cleaned.startsWith('(') && cleaned.endsWith(')')) {
    cleaned = cleaned.slice(1, -1).trim();
  }
  // Colapsar espacios alrededor de pipes intermedios
  cleaned = cleaned.replace(/\s*\|\s*/g, ' | ');

  // Placeholder para badges
  const badgeRegex = /(?:!post|post)\s*#(\d+)/gi;
  cleaned = cleaned.replace(/\((?:!post|post)\s*#(\d+)\)/gi, (_m, id) => `__POST_BADGE_${id}__`); // dentro de paréntesis solos
  cleaned = cleaned.replace(badgeRegex, (_m, id) => `__POST_BADGE_${id}__`);
  // Eliminar paréntesis que sólo envuelven un placeholder
  cleaned = cleaned.replace(/\(__POST_BADGE_\d+__\)/g, (m) => m.slice(1,-1));

  // Versión para title: reemplazar placeholders por texto plano
  const titleVersion = cleaned.replace(/__POST_BADGE_(\d+)__/g, (_m, id) => `Post #${id}`);
  const titleEscaped = escapeHtml(titleVersion).replace(/"/g, '&quot;');

  // Visible: escapar, luego reinyectar badges seguros
  let visible = escapeHtml(cleaned);
  visible = visible.replace(/__POST_BADGE_(\d+)__/g, (_m, id) => {
    return `<span class="${DTextConfig.CSS_CLASSES.POST_BADGE}" data-post-badge data-post-id="${id}" title="Post #${id}">Post #${id}</span>`;
  });

  // Limpiar pipes sobrantes al inicio / final y espacios duplicados
  visible = visible.replace(/^(\|\s)+/, '').replace(/(\|\s)+$/, '').trim();
  visible = visible.replace(/\s{2,}/g, ' ');

  return { title: titleEscaped, visible };
};

/**
 * Normaliza espacios y saltos de línea
 */
const normalizeWhitespace = (text: string): string => {
  return text
    .replace(DTextRegex.MULTIPLE_SPACES, ' ')
    .replace(DTextRegex.MULTIPLE_LINEBREAKS, '\n')
    .trim();
};

/**
 * Cuenta brackets para validar estructura DText
 */
// Función comentada para evitar errores de TypeScript
// const countBrackets = (text: string): { brackets: boolean; curlies: boolean } => {
//   const openBrackets = (text.match(DTextRegex.OPEN_BRACKETS) || []).length;
//   const closeBrackets = (text.match(DTextRegex.CLOSE_BRACKETS) || []).length;
//   const openCurlies = (text.match(DTextRegex.OPEN_CURLIES) || []).length;
//   const closeCurlies = (text.match(DTextRegex.CLOSE_CURLIES) || []).length;
//   
//   return {
//     brackets: openBrackets === closeBrackets,
//     curlies: openCurlies === closeCurlies
//   };
// };

/**
 * Genera marcador único para enlaces
 */
const generateLinkMarker = (counter: number): string => `__LINK_${counter}__`;

/**
 * Crea enlace HTML seguro
 */
const createSafeLink = (url: string, text: string, className: string): string => {
  // Esquema no permitido (javascript:, data:, ...) → solo texto, sin enlace
  if (!isSafeUrl(url)) return escapeHtml(text);
  return `<a href="${escapeAttr(url)}" target="_blank" rel="noopener noreferrer" class="${escapeAttr(className)}">${text}</a>`;
};

/**
 * Crea enlace de tag/wiki con evento personalizado
 */
const createTagLink = (tagName: string, displayName: string, className: string): string => {
  const normalizedName = tagName.trim().replace(/\s+/g, '_');
  // Usar data attributes en lugar de onclick inline para mayor compatibilidad
  return `<a href="#" data-tag-name="${escapeAttr(normalizedName)}" class="${escapeAttr(className)} tag-link">${displayName}</a>`;
};

/**
 * Cache simple para operaciones costosas
 */
const memoize = <T extends (...args: never[]) => unknown>(fn: T): T => {
  const cache = new Map<string, ReturnType<T>>();
  
  return ((...args: Parameters<T>): ReturnType<T> => {
    const key = JSON.stringify(args);
    if (cache.has(key)) {
      return cache.get(key)!;
    }
    const result = fn(...args) as ReturnType<T>;
    cache.set(key, result);
    return result;
  }) as T;
};

// ===== HELPERS DE FORMATEO (Refactor para limpieza) =====
const formatTranslationNote = (note: string): string => {
  const { title, visible } = sanitizeTranslationNote(note);
  return `<span class="${DTextConfig.FORMAT_TAGS.translation.class}" title="Nota de traducción: ${title}">🛈 ${visible}</span>`;
};

const applyBasicFormatting = (text: string, withClasses = false): string => {
  if (!text) return '';
  const bold = withClasses ? `<strong class="${DTextConfig.FORMAT_TAGS.bold.class}">$1</strong>` : '<strong>$1</strong>';
  const italic = withClasses ? `<em class="${DTextConfig.FORMAT_TAGS.italic.class}">$1</em>` : '<em>$1</em>';
  const underline = withClasses ? `<u class="${DTextConfig.FORMAT_TAGS.underline.class}">$1</u>` : '<u>$1</u>';
  const strike = withClasses ? `<s class="${DTextConfig.FORMAT_TAGS.strikethrough.class}">$1</s>` : '<s>$1</s>';
  return text
    .replace(DTextRegex.BOLD, bold)
    .replace(DTextRegex.ITALIC, italic)
    .replace(DTextRegex.UNDERLINE, underline)
    .replace(DTextRegex.STRIKETHROUGH, strike)
    .replace(DTextRegex.TRANSLATION, (_m, note) => formatTranslationNote(note));
};

const applyTagAndWikiLinks = (text: string): string => {
  return text
    .replace(DTextRegex.WIKI_LINK, (_m: string, page: string, _c: string, custom: string) => {
      const normalizedPage = page.trim();
      const display = custom ? custom : normalizedPage.replace(/_/g, ' ');
      return createTagLink(normalizedPage, display, DTextConfig.CSS_CLASSES.WIKI_LINK);
    })
    .replace(DTextRegex.TAG_LINK, (_m: string, tag: string) => {
      const tagName = tag.trim();
      return createTagLink(tagName, tagName.replace(/_/g, ' '), DTextConfig.CSS_CLASSES.TAG_LINK);
    });
};

/**
 * Procesa bloques de tabla DText ([table]...[/table]) y los convierte en HTML <table>
 */
const processTables = (content: string): string => {
  return content.replace(DTextRegex.TABLE, (match: string) => {
    // Extraer el contenido de la tabla
    const inner = match.replace(/^\[table\]/i, '').replace(/\[\/table\]$/i, '').trim();
    const rows = inner.split(/\r?\n/).filter(row => row.trim().length > 0);
    const htmlRows = rows.map(row => {
      // Separar celdas por |
      const cells = row.split('|').map(cell => `<td>${processLinks(cell.trim())}</td>`).join('');
      return `<tr>${cells}</tr>`;
    }).join('');
    return `<table class="min-w-full border border-border my-2">${htmlRows}</table>`;
  });
};

/**
 * Procesa bloques expand DText ([expand]...[/expand]) y los convierte en <details><summary>...</summary>...</details>
 */
const processExpandBlocks = (content: string): string => {
  return content.replace(/\[expand(=([^\]]+))?\]([\s\S]*?)\[\/expand\]/gi, (_m, _eq, title, inner) => {
    const safeTitle = title ? escapeHtml(title.trim()) : 'Expand';
    // Procesar contenido interno con procesadores de inline para preservar formato
    let innerHtml = inner.trim();
    // Aplicar enlaces, tags, listas, tablas, etc. de forma básica
    innerHtml = applyBasicFormatting(innerHtml);
    innerHtml = applyTagAndWikiLinks(innerHtml)
      // Fallback al URL si el texto está vacío para evitar anchors vacíos
      .replace(DTextRegex.EXTERNAL_LINK, (_wm: string, text: string, url: string) => {
        const display = text && text.trim().length > 0 ? text : url;
        return createSafeLink(url, display, DTextConfig.CSS_CLASSES.EXTERNAL_LINK);
      });
    innerHtml = processNumberedReferences(innerHtml);
    innerHtml = processTables(innerHtml);
    innerHtml = processLists(innerHtml);
    return `<details class="my-2"><summary class="cursor-pointer font-semibold">${safeTitle}</summary><div class="pl-4 mt-2">${innerHtml}</div></details>`;
  });
};

/**
 * Procesa secciones especiales (See also, Examples) y las convierte en <section>
 */
const processSpecialSections = (content: string): string => {
  // Procesar 'See also'
  content = content.replace(/(^|\n)(See also)\s*\n([\s\S]*?)(?=\n\w|$)/gi, (_m, pre, header, body) => {
    return `${pre}<section class="bg-muted/50 border border-border rounded-lg p-3 my-2"><h4 class="font-semibold text-foreground mb-1">${header}</h4><div>${body.trim()}</div></section>`;
  });
  // Procesar 'Examples'
  content = content.replace(/(^|\n)(Examples?)\s*\n([\s\S]*?)(?=\n\w|$)/gi, (_m, pre, header, body) => {
    // Reemplazar referencias a posts (post #123 o !post #123) por badges interactivos
  const bodyWithBadges = body.replace(/(?:!post|post)\s*#(\d+)/gi, (_pm: string, id: string) => {
      const num = Number(id);
      if (!num) return _pm;
      return `<span class="${DTextConfig.CSS_CLASSES.POST_BADGE}" data-post-badge data-post-id="${num}" title="Post #${num}">Post #${num}</span>`;
    });
    return `${pre}<section class="bg-muted/50 border border-border rounded-lg p-3 my-2"><h4 class="font-semibold text-foreground mb-1">${header}</h4><div>${bodyWithBadges.trim()}</div></section>`;
  });
  return content;
};

/**
 * Procesa referencias numeradas en formato DText "[1]":[#anchor]
 * Convierte referencias a badges clickeables y formatea las definiciones de enlaces
 * 
 * @param content - Contenido DText a procesar
 * @returns Contenido HTML con referencias numeradas procesadas
 */
const processNumberedReferences = (content: string): string => {
  // Extraer definiciones de enlaces numerados para mapeo eficiente
  const linkDefinitions = new Map<string, string>();
  const definitionMatches = Array.from(content.matchAll(DTextRegex.NUMBERED_LINK_DEFINITION));
  
  // Construir mapa de definiciones una sola vez
  definitionMatches.forEach(([, number, url]) => {
    linkDefinitions.set(number, url);
  });
  
  // Procesar referencias numeradas con badges estilo tag
  let processed = content.replace(DTextRegex.NUMBERED_REFERENCE, (_match, numberText) => {
    const numberMatch = numberText.match(/\[(\d+)\]/);
    if (!numberMatch) return _match;
    
    const number = numberMatch[1];
    const url = linkDefinitions.get(number);
    
    if (url && isSafeUrl(url)) {
      // Badge activo con enlace
      return `<a href="${escapeAttr(url)}" target="_blank" rel="noopener noreferrer" class="cat-badge cat-default font-mono tabular-nums mr-1">${escapeHtml(numberText)}</a>`;
    } else {
      // Badge inactivo sin enlace
      return `<span class="cat-badge cat-default font-mono tabular-nums mr-1">${escapeHtml(numberText)}</span>`;
    }
  });
  
  // Formatear definiciones como tarjetas clickeables
  processed = processed.replace(DTextRegex.NUMBERED_LINK_DEFINITION, (_match, number, url) => {
    if (!isSafeUrl(url)) return `[${escapeHtml(number)}] ${escapeHtml(url)}`;
    return `<div class="flex items-center gap-2 text-sm text-muted-foreground mt-2 p-2 bg-muted/50 border border-border rounded-lg">
      <span class="cat-badge cat-default font-mono tabular-nums">[${escapeHtml(number)}]</span>
      <a href="${escapeAttr(url)}" target="_blank" rel="noopener noreferrer" class="text-primary-text underline underline-offset-[3px] flex-1 truncate">${escapeHtml(url)}</a>
    </div>`;
  });
  
  return processed;
};

/**
 * Cierra tags DText básicos abiertos para evitar HTML roto
 */
const sanitizeUnclosedTags = (content: string): string => {
  const tags = ['b', 'i', 'u', 's', 'tn'];
  for (const tag of tags) {
    const open = new RegExp(`\\[${tag}\\]`, 'g');
    const close = new RegExp(`\\[/${tag}\\]`, 'g');
    const openCount = (content.match(open) || []).length;
    const closeCount = (content.match(close) || []).length;
    if (openCount > closeCount) {
      // Cerrar con el tag DText correspondiente (se convertirá a HTML después)
      content += `[/${tag}]`.repeat(openCount - closeCount);
    }
  }
  return content;
};

// ===== FUNCIONES PRINCIPALES =====

/**
 * Procesa enlaces de forma segura para evitar anidación
 */
const processLinks = memoize((text: string): string => {
  let processed = text;
  const linkMap = new Map<string, string>();
  let linkCounter = 0;
  
  // 1. Enlaces directos <http://example.com>
  processed = processed.replace(
    DTextRegex.DIRECT_LINK,
    (_match: string, url: string) => {
      const marker = generateLinkMarker(linkCounter++);
  linkMap.set(marker, createSafeLink(url, url, DTextConfig.CSS_CLASSES.EXTERNAL_LINK));
      return marker;
    }
  );
  
  // 2. Enlaces con texto personalizado: "text":[url]
  processed = processed.replace(
    DTextRegex.CUSTOM_LINK,
    (_match: string, text: string, url: string) => {
      const marker = generateLinkMarker(linkCounter++);
  const display = text && text.trim().length > 0 ? text : url; // evitar anchors vacíos
  linkMap.set(marker, createSafeLink(url, display, DTextConfig.CSS_CLASSES.EXTERNAL_LINK));
      return marker;
    }
  );
  
  // 3. Enlaces con texto personalizado: "text":url
  processed = processed.replace(
    DTextRegex.CUSTOM_LINK_ALT,
    (_match: string, text: string, url: string) => {
      const marker = generateLinkMarker(linkCounter++);
  const display = text && text.trim().length > 0 ? text : url;
  linkMap.set(marker, createSafeLink(url, display, DTextConfig.CSS_CLASSES.EXTERNAL_LINK));
      return marker;
    }
  );
  
  // 4. Enlaces Markdown style
  processed = processed.replace(
    DTextRegex.MARKDOWN_LINK,
    (_match: string, text: string, url: string) => {
  const marker = generateLinkMarker(linkCounter++);
  linkMap.set(marker, createSafeLink(url, text, DTextConfig.CSS_CLASSES.EXTERNAL_LINK));
      return marker;
    }
  );
  
  // 5. URLs directas (solo si no están precedidas por href= o dentro de otros enlaces)
  processed = processed.replace(
    DTextRegex.URL_PLAIN,
    (match: string, before: string, url: string, offset: number, full: string) => {
      // Evitar volver a envolver URLs que ya están dentro de un <a> existente (causa el enlace vacío + otro enlace separado)
      // Heurística: si antes de esta coincidencia hay un <a ...> sin su correspondiente </a> todavía, estamos dentro de un enlace.
      const upto = full.slice(0, offset);
      const lastOpenA = upto.lastIndexOf('<a ');
      const lastCloseA = upto.lastIndexOf('</a>');
      const insideExistingAnchor = lastOpenA !== -1 && lastOpenA > lastCloseA;
      if (insideExistingAnchor) return match; // Ya dentro de un enlace, no envolver de nuevo

      if (before.includes('__LINK_')) return match;
      // No envolver en <a> si es una imagen
      if (url.match(/\.(jpg|jpeg|png|gif|webp|svg|bmp|apng|avif|ico)(\?.*)?$/i)) {
        return before + url;
      }
      const marker = generateLinkMarker(linkCounter++);
  linkMap.set(marker, createSafeLink(url, url, DTextConfig.CSS_CLASSES.EXTERNAL_LINK));
      return before + marker;
    }
  );
  
  // Restaurar todos los enlaces procesados
  for (const [marker, link] of linkMap) {
    processed = processed.replace(marker, link);
  }
  // No logs in production
  
  return processed;
});

/**
 * Procesa listas DText con soporte para listas anidadas (*, **, ***)
 */
const processLists = (content: string): string => {
  const lines = content.split('\n');
  const stack: { level: number; items: string[] }[] = [];
  let currentLevel = 0;
  let html = '';

  const flush = () => {
    while (stack.length > 0) {
      const { items } = stack.pop()!;
      html += `<ul class="${DTextConfig.CSS_CLASSES.LIST_CONTAINER}">${items.join('')}</ul>`;
    }
  };

  for (const line of lines) {
    const trimmed = line.trim();
    const bulletMatch = trimmed.match(DTextRegex.BULLET_ITEM);
    if (bulletMatch) {
      const level = bulletMatch[1].length;
      let itemContent = bulletMatch[2];
  itemContent = processLinks(itemContent);
      if (level > currentLevel) {
        stack.push({ level, items: [] });
        currentLevel = level;
      } else if (level < currentLevel) {
        while (stack.length > 0 && stack[stack.length - 1].level >= level) {
          const { items } = stack.pop()!;
          if (stack.length > 0) {
            stack[stack.length - 1].items.push(`<ul class="${DTextConfig.CSS_CLASSES.LIST_CONTAINER}">${items.join('')}</ul>`);
          } else {
            html += `<ul class="${DTextConfig.CSS_CLASSES.LIST_CONTAINER}">${items.join('')}</ul>`;
          }
        }
        currentLevel = level;
      }
      if (stack.length === 0 || stack[stack.length - 1].level !== level) {
        stack.push({ level, items: [] });
      }
      stack[stack.length - 1].items.push(`<li class="${DTextConfig.CSS_CLASSES.LIST_ITEM}">${itemContent}</li>`);
    } else {
      flush();
      html += line + '\n';
      currentLevel = 0;
    }
  }
  flush();
  // Limpieza defensiva inmediata de anchors duplicados dentro de listas
  html = html.replace(/<a([^>]*href="([^"]+)"[^>]*)><\/a>(?=\s*<a[^>]*href="\2")/g, '');
  return html.trim();
};

/**
 * Procesa posts de ejemplo en formato de galería
 */
const processExamplePosts = (content: string, postImageMap: PostImageMap = {}, nsfwBlockedPosts: Set<number> = new Set()): string => {
  // Split by lines to ensure each post is processed independently
  // Updated for dark mode support
  const lines = content.split(/\r?\n/);
  const processedPosts: string[] = [];

  lines.forEach(line => {
    // Extraer todos los IDs de post en la línea, soportando 'post #id' y '!post #id'
    const postIdMatches = Array.from(line.matchAll(/(?:!post|post)\s*#(\d+)/g));
    if (!postIdMatches.length) return;
    
    postIdMatches.forEach(match => {
      const id = Number(match[1]);
      if (!id) return;
      
      // Extraer el contexto después del post (después de los dos puntos si existen)
      let caption = '';
      const postPattern = new RegExp(`(?:!post|post)\\s*#${id}(?::\\s*(.*))?`, 'i');
      const captionMatch = line.match(postPattern);
      if (captionMatch && captionMatch[1]) {
        caption = captionMatch[1].trim();
        // Procesar el contexto para convertir DText a HTML
  caption = processLinks(caption);
  caption = applyBasicFormatting(caption);
  caption = applyTagAndWikiLinks(caption);
      }
      
      // Verificar si el post está bloqueado por NSFW
      if (nsfwBlockedPosts.has(id)) {
        // Mostrar sólo badge bloqueado; la vista detallada/tooltip gestionará el mensaje.
        const blockedBadge = `<span class="${DTextConfig.CSS_CLASSES.POST_BADGE}" data-post-badge data-post-id="${id}" data-nsfw-blocked="true" title="Post #${id}">Post #${id}</span>`;
        processedPosts.push(`<article data-type="post" data-id="${id}" class="${DTextConfig.CSS_CLASSES.MEDIA_EMBED}"><div class="${DTextConfig.CSS_CLASSES.MEDIA_IMAGE}">${blockedBadge}</div><div class="${DTextConfig.CSS_CLASSES.MEDIA_CAPTION}">${caption}</div></article>`);
        return;
      }

      // Si tenemos la URL de imagen (map pre-cargado) incrustamos directamente la miniatura
      const imgUrl = postImageMap[id];
      if (imgUrl && isSafeUrl(imgUrl)) {
        const img = `<img src="${escapeAttr(imgUrl)}" alt="Post #${id}" class="w-full h-auto max-h-48 object-contain rounded-lg cursor-pointer transition-opacity hover:opacity-90" data-post-id="${id}" loading="lazy" decoding="async" />`;
        processedPosts.push(`<article data-type="post" data-id="${id}" class="${DTextConfig.CSS_CLASSES.MEDIA_EMBED}"><div class="${DTextConfig.CSS_CLASSES.MEDIA_IMAGE}">${img}</div><div class="${DTextConfig.CSS_CLASSES.MEDIA_CAPTION}">${caption}</div></article>`);
        return;
      }

      // Fallback: badge + tooltip (cuando aún no se ha cargado la imagen en el map)
      const badge = `<span class="${DTextConfig.CSS_CLASSES.POST_BADGE}" data-post-badge data-post-id="${id}" title="Post #${id}">Post #${id}</span>`;
      processedPosts.push(`<article data-type="post" data-id="${id}" class="${DTextConfig.CSS_CLASSES.MEDIA_EMBED}"><div class="${DTextConfig.CSS_CLASSES.MEDIA_IMAGE}">${badge}</div><div class="${DTextConfig.CSS_CLASSES.MEDIA_CAPTION}">${caption}</div></article>`);
      return; // continuar siguiente match
    });
  });

  return processedPosts.join('');
};

/**
 * Convierte texto DText a HTML seguro (versión básica)
 * @param dtextContent - Contenido en formato DText
 * @returns HTML seguro formateado
 */
export const formatDTextSafe = (dtextContent: string): string => {
  if (!validateStringInput(dtextContent)) return '';

  // SEGURIDAD: escapar HTML crudo ANTES de generar cualquier markup (la entrada no es confiable).
  // Las regex de DText no dependen de < > & (DIRECT_LINK/USER_MENTION_HTML ya esperan &lt; &gt;).
  let formatted = escapeHtml(sanitizeUnclosedTags(dtextContent));

  // ===== HEADERS (h1., h2., h3., h4., h5., h6. y con IDs tipo h4#about.) =====
  // Soporte para hX#id. Header con id
  formatted = formatted.replace(/^(h[1-6])#([a-zA-Z0-9_\-]+)\.\s+(.*)$/gm, (_m, h, id, content) => {
    const tag = h.toLowerCase() as keyof typeof DTextConfig.HEADERS;
    const formattedContent = applyTagAndWikiLinks(content);
    return `<${tag} id="${id}" class="${DTextConfig.HEADERS[tag].class}">${formattedContent}</${tag}>`;
  });
  formatted = formatted.replace(DTextConfig.HEADERS.h1.pattern, (_m, id, content) => `<h1${id ? ` id="${id}"` : ''} class="${DTextConfig.HEADERS.h1.class}">${applyTagAndWikiLinks(content)}</h1>`);
  formatted = formatted.replace(DTextConfig.HEADERS.h2.pattern, (_m, id, content) => `<h2${id ? ` id="${id}"` : ''} class="${DTextConfig.HEADERS.h2.class}">${applyTagAndWikiLinks(content)}</h2>`);
  formatted = formatted.replace(DTextConfig.HEADERS.h3.pattern, (_m, id, content) => `<h3${id ? ` id="${id}"` : ''} class="${DTextConfig.HEADERS.h3.class}">${applyTagAndWikiLinks(content)}</h3>`);
  formatted = formatted.replace(DTextConfig.HEADERS.h4.pattern, (_m, id, content) => `<h4${id ? ` id="${id}"` : ''} class="${DTextConfig.HEADERS.h4.class}">${applyTagAndWikiLinks(content)}</h4>`);
  formatted = formatted.replace(DTextConfig.HEADERS.h5.pattern, (_m, id, content) => `<h5${id ? ` id="${id}"` : ''} class="${DTextConfig.HEADERS.h5.class}">${applyTagAndWikiLinks(content)}</h5>`);
  formatted = formatted.replace(DTextConfig.HEADERS.h6.pattern, (_m, id, content) => `<h6${id ? ` id="${id}"` : ''} class="${DTextConfig.HEADERS.h6.class}">${applyTagAndWikiLinks(content)}</h6>`);

  // ===== PROCESAMIENTO DE BLOQUES COMPLEJOS =====
  // Eliminar bloques expand completos (los procesaremos mejor abajo)
  // formatted = formatted.replace(DTextRegex.EXPAND, '');
  // Eliminar bloques table (no soportados en este formato simplificado)
  formatted = formatted.replace(DTextRegex.TABLE, '');

  // Procesar tablas DText
  formatted = processTables(formatted);

  // ===== BLOQUES EXPAND MEJORADOS =====
  formatted = formatted.replace(/\[expand(=([^\]]+))?\]([\s\S]*?)\[\/expand\]/gi, (_m, _eq, title, inner) => {
    const safeTitle = title ? escapeHtml(title.trim()) : 'Expand';
    return `<details class="my-2"><summary class="cursor-pointer font-semibold">${safeTitle}</summary><div class="pl-4 mt-2">${inner.trim()}</div></details>`;
  });

  // ===== QUOTES =====
  formatted = formatted.replace(DTextRegex.QUOTE, '<blockquote class="' + DTextConfig.CSS_CLASSES.QUOTE + '">$1</blockquote>');

  // ===== CODE BLOCKS =====
  formatted = formatted.replace(DTextRegex.CODE, '<pre class="' + DTextConfig.CSS_CLASSES.CODE_BLOCK + '"><code>$1</code></pre>');

  // ===== SPOILERS =====
  formatted = formatted.replace(DTextRegex.SPOILER, '<span class="' + DTextConfig.CSS_CLASSES.SPOILER + '" title="Spoiler - hover para ver">$1</span>');

  // ===== MENCIONES DE USUARIOS =====
  formatted = formatted.replace(DTextRegex.USER_MENTION_HTML, '<span class="' + DTextConfig.CSS_CLASSES.USER_MENTION + '">@$1</span>');
  formatted = formatted.replace(DTextRegex.USER_MENTION, '<span class="' + DTextConfig.CSS_CLASSES.USER_MENTION + '">@$1</span>');

  // ===== EMOJIS (procesar antes que los enlaces para evitar conflictos) =====
  // Solo emojis conocidos: un fallback genérico convertía ":https:" de los enlaces en 😊
  formatted = formatted.replace(DTextRegex.EMOJI, (match, name) => {
    const emoji = emojiMap[name];
    if (!emoji) return match;
    return `<span class="inline-block text-lg" title=":${name}:">${emoji}</span>`;
  });

  // ===== ENLACES DE TAGS Y WIKI =====
  formatted = formatted.replace(DTextRegex.TAG_LINK, (_match, tagName) => {
    const normalizedTagName = tagName.trim().replace(/\s+/g, '_');
    const displayName = tagName.replace(/_/g, ' ');
    return createTagLink(normalizedTagName, displayName, DTextConfig.CSS_CLASSES.TAG_LINK);
  });
  formatted = formatted.replace(DTextRegex.WIKI_LINK, (_match, wikiPage, _custom, customText) => {
    const normalizedPage = wikiPage.trim().replace(/\s+/g, '_');
    let display;
    if (typeof customText !== 'undefined') {
      display = customText ? customText : wikiPage.replace(/ *\(.*\)/, '').replace(/_/g, ' ').trim();
    } else {
      display = wikiPage.replace(/_/g, ' ');
    }
    return createTagLink(normalizedPage, display, DTextConfig.CSS_CLASSES.WIKI_LINK);
  });
  formatted = formatted.replace(DTextRegex.EXTERNAL_LINK, (_match, text, url) => {
    const display = text && text.trim().length > 0 ? text : url;
    return createSafeLink(url, display, DTextConfig.CSS_CLASSES.EXTERNAL_LINK);
  });

  // ===== ENLACES INTERNOS (anchors tipo #dtext-...) =====
  formatted = formatted.replace(/\"([^\"]+)\":#([a-zA-Z0-9_\-]+)/g, (_m, text, anchor) => {
    return `<a href="#${anchor}" class="${DTextConfig.CSS_CLASSES.LINK}">${text}</a>`;
  });

  // ===== LISTAS ANIDADAS MEJORADAS =====
  const processNestedLists = (content: string): string => {
    const lines = content.split('\n');
    let html = '';
    let prevLevel = 0;
    let openLists = 0;
    for (const line of lines) {
      const match = line.match(/^(\*+|\-+)\s+(.+)/);
      if (match) {
        const level = match[1].length;
        const item = processLinks(match[2]);
        if (level > prevLevel) {
          for (let i = prevLevel; i < level; i++) {
            html += '<ul class="' + DTextConfig.CSS_CLASSES.LIST_CONTAINER + '">';
            openLists++;
          }
        } else if (level < prevLevel) {
          for (let i = level; i < prevLevel; i++) {
            html += '</ul>';
            openLists--;
          }
        }
        html += `<li class="${DTextConfig.CSS_CLASSES.LIST_ITEM}">${item}</li>`;
        prevLevel = level;
      } else {
        while (openLists > 0) {
          html += '</ul>';
          openLists--;
        }
        html += line + '\n';
        prevLevel = 0;
      }
    }
    while (openLists > 0) {
      html += '</ul>';
      openLists--;
    }
  html = html.replace(/<a([^>]*href="([^"]+)"[^>]*)><\/a>(?=\s*<a[^>]*href="\2")/g, '');
  return html.trim();
  };
  formatted = processNestedLists(formatted);

  // ===== TAG REQUESTS =====
  formatted = formatted.replace(DTextRegex.TAG_REQUEST, (_match, type, id) => {
    const requestType = DTextConfig.REQUEST_TAGS[type as keyof typeof DTextConfig.REQUEST_TAGS];
    return `<span class="${requestType.class} ${DTextConfig.CSS_CLASSES.TAG_REQUEST}">${requestType.label} #${id}</span>`;
  });

  // ===== MEDIA EMBEDS =====
  formatted = formatted.replace(DTextRegex.POST_INDIVIDUAL, (_m, postId) => {
    const id = Number(postId);
  return `<a href="/posts/${id}" class="text-primary-text underline underline-offset-[3px]">Post #${id}</a>`;
  });
  formatted = formatted.replace(DTextRegex.ASSET_REFERENCE, () => {
    return `<span class="text-muted-foreground">[Asset]</span>`;
  });

  // ===== FORMATO BÁSICO =====
  formatted = formatted
    .replace(DTextRegex.BOLD, '<strong class="' + DTextConfig.FORMAT_TAGS.bold.class + '">$1</strong>')
    .replace(DTextRegex.ITALIC, '<em class="' + DTextConfig.FORMAT_TAGS.italic.class + '">$1</em>')
    .replace(DTextRegex.UNDERLINE, '<u class="' + DTextConfig.FORMAT_TAGS.underline.class + '">$1</u>')
    .replace(DTextRegex.STRIKETHROUGH, '<s class="' + DTextConfig.FORMAT_TAGS.strikethrough.class + '">$1</s>')
    .replace(DTextRegex.TRANSLATION, (_m: string, note: string) => {
      const { title, visible } = sanitizeTranslationNote(note);
      return '<span class="' + DTextConfig.FORMAT_TAGS.translation.class + '" title="Nota de traducción: ' + title + '">🛈 ' + visible + '</span>';
    });

  // ===== ENLACES EXTERNOS (usando función auxiliar) =====
  formatted = processLinks(formatted);

  // ===== ENLACES WIKI Y PARENTESIS (mantener paréntesis con enlaces) =====
  formatted = formatted.replace(/\(([^\(\)\[]*\[\[[^\]]+\]\][^\(\)]*)\)/g, (_m, inside) => {
    return `<span class="text-muted-foreground">(${inside})</span>`;
  });

  // ===== LÍNEAS Y ESPACIOS =====
  formatted = formatted.replace(DTextRegex.LINE_BREAK, '<br>');

  // ===== LIMPIAR SECCIONES NO DESEADAS =====
  formatted = formatted.replace(DTextRegex.UNWANTED_SECTIONS, '');
  formatted = formatted.replace(DTextRegex.EXAMPLES_HEADER, '');
  formatted = formatted.replace(DTextRegex.SEE_ALSO_HEADER, '');

  // ===== LIMPIAR TAGS RESTANTES =====
  formatted = formatted.replace(DTextRegex.REMAINING_TAGS, '');

  // ===== NORMALIZAR ESPACIOS =====
  formatted = normalizeWhitespace(formatted);

  // Convertir saltos de línea simples a espacios para mejor presentación en párrafos
  formatted = formatted.replace(DTextRegex.LINEBREAKS, ' ');

  // ===== SECCIONES ESPECIALES COMO SEE ALSO =====
  formatted = formatted.replace(/(^|\n)(See also)\s*\n([\s\S]*?)(?=\n\w|$)/gi, (_m, pre, header, body) => {
    return `${pre}<section class="bg-muted/50 border border-border rounded-lg p-3 my-2"><h4 class="font-semibold text-foreground mb-1">${header}</h4><div>${body.trim()}</div></section>`;
  });

  // Eliminar/normalizar anchors duplicados y rellenar badges vacíos para evitar botones sin texto
  return sanitizeHtml(fillEmptyBadgeAnchors(unifyDuplicateAnchors(dedupeDuplicateLinks(formatted))));
};

/**
 * Convierte texto DText a HTML con soporte avanzado para galerías de posts
 * @param dtextContent - Contenido en formato DText
 * @param postImageMap - Mapa opcional de IDs de post a URLs de imagen
 * @param nsfwBlockedPosts - Set opcional de IDs de posts bloqueados por NSFW
 * @returns HTML formateado con galerías
 */
export const formatDTextAdvanced = (dtextContent: string, postImageMap: PostImageMap = {}, nsfwBlockedPosts: Set<number> = new Set()): string => {
  if (!validateStringInput(dtextContent)) return '';

  // SEGURIDAD: escapar HTML crudo antes de convertir DText a markup (la entrada no es confiable)
  dtextContent = escapeHtml(sanitizeUnclosedTags(dtextContent));

  // Procesar referencias numeradas en todo el contenido antes de dividir en bloques
  dtextContent = processNumberedReferences(dtextContent);

  // Paso 1: Separar en bloques por headers (h1-h6) o líneas vacías
  const headerRegex = DTextRegex.HEADER_PATTERN;
  const blocks: DTextBlock[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  // Encontrar headers y dividir el texto
  while ((match = headerRegex.exec(dtextContent)) !== null) {
    if (match.index > lastIndex) {
      const prev = dtextContent.slice(lastIndex, match.index);
      // Mejorar: Si alguna línea del bloque es un ejemplo de post, tratar como 'list'
      // Solo considerar como lista si contiene posts reales, no solo texto con formato
      const lines = prev.split('\n');
      const hasRealPosts = lines.some(line => {
        const trimmed = line.trim();
        // Buscar patrones específicos de posts de ejemplo, no solo cualquier línea con post #
        return /^\s*\*+\s*(?:!post|post)\s+#\d+/.test(trimmed) || 
               /^\s*(?:!post|post)\s+#\d+/.test(trimmed);
      });
      
      if (hasRealPosts) {
        blocks.push({ type: 'list', content: prev });
      } else if (prev.trim()) {
        blocks.push({ type: 'text', content: prev });
      }
    }
    blocks.push({ type: 'header', content: match[0] });
    lastIndex = match.index + match[0].length;
  }
  // Agregar el bloque final
  if (lastIndex < dtextContent.length) {
    const rest = dtextContent.slice(lastIndex);
    const lines = rest.split('\n');
    const hasRealPosts = lines.some(line => {
      const trimmed = line.trim();
      // Buscar patrones específicos de posts de ejemplo, no solo cualquier línea con post #
      return /^\s*\*+\s*(?:!post|post)\s+#\d+/.test(trimmed) || 
             /^\s*(?:!post|post)\s+#\d+/.test(trimmed);
    });
    
    if (hasRealPosts) {
      blocks.push({ type: 'list', content: rest });
    } else if (rest.trim()) {
      blocks.push({ type: 'text', content: rest });
    }
  }

  // Si no se encontraron bloques (contenido sin headers), tratar todo como texto
  if (blocks.length === 0 && dtextContent.trim()) {
    blocks.push({ type: 'text', content: dtextContent });
  }



  // Revisar: si un bloque 'header' es seguido por un bloque 'text' que contiene ejemplos de post, convertir ese bloque a 'list'
  for (let i = 0; i < blocks.length - 1; i++) {
    if (
      blocks[i].type === 'header' &&
      blocks[i + 1].type === 'text'
    ) {
      const lines = blocks[i + 1].content.split('\n');
      const hasRealPosts = lines.some(line => {
        const trimmed = line.trim();
        // Buscar patrones específicos de posts de ejemplo, no solo cualquier línea con post #
        return /^\s*\*+\s*(?:!post|post)\s+#\d+/.test(trimmed) || 
               /^\s*(?:!post|post)\s+#\d+/.test(trimmed);
      });
      
      if (hasRealPosts) {
        blocks[i + 1].type = 'list';
      }
    }
  }

  // Paso 2: Procesar cada bloque
  const htmlBlocks = blocks.map((block) => {
    if (block.type === 'header') {
      // Formatear header (permitir espacios antes)
      return block.content
        .replace(DTextConfig.HEADERS.h1.pattern, (_m, id, content) => `<h1${id ? ` id="${id}"` : ''} class="${DTextConfig.HEADERS.h1.class}">${applyTagAndWikiLinks(content)}</h1>`)
        .replace(DTextConfig.HEADERS.h2.pattern, (_m, id, content) => `<h2${id ? ` id="${id}"` : ''} class="${DTextConfig.HEADERS.h2.class}">${applyTagAndWikiLinks(content)}</h2>`)
        .replace(DTextConfig.HEADERS.h3.pattern, (_m, id, content) => `<h3${id ? ` id="${id}"` : ''} class="${DTextConfig.HEADERS.h3.class}">${applyTagAndWikiLinks(content)}</h3>`)
        .replace(DTextConfig.HEADERS.h4.pattern, (_m, id, content) => `<h4${id ? ` id="${id}"` : ''} class="${DTextConfig.HEADERS.h4.class}">${applyTagAndWikiLinks(content)}</h4>`)
        .replace(DTextConfig.HEADERS.h5.pattern, (_m, id, content) => `<h5${id ? ` id="${id}"` : ''} class="${DTextConfig.HEADERS.h5.class}">${applyTagAndWikiLinks(content)}</h5>`)
        .replace(DTextConfig.HEADERS.h6.pattern, (_m, id, content) => `<h6${id ? ` id="${id}"` : ''} class="${DTextConfig.HEADERS.h6.class}">${applyTagAndWikiLinks(content)}</h6>`);
    }
    
    if (block.type === 'list') {
      // Procesar posts de ejemplo en formato de galería
  const processedContent = processExamplePosts(block.content, postImageMap, nsfwBlockedPosts);
      if (processedContent && processedContent.includes('dtext-media-embed')) {
        return `<div class=\"${DTextConfig.CSS_CLASSES.MEDIA_GALLERY}\">${processedContent}</div>`;
      }
      // Si no hay posts, procesar como lista normal
      return processLists(block.content);
    }
    
    // Texto normal: procesar DText básico
    let html = block.content;
    // 1) Procesar primero notas de traducción para aislar referencias a posts dentro de ellas
    html = html.replace(DTextRegex.TRANSLATION, (_m: string, note: string) => {
      const { title, visible } = sanitizeTranslationNote(note);
      return '<span class="' + DTextConfig.FORMAT_TAGS.translation.class + '" title="Nota de traducción: ' + title + '">🛈 ' + visible + '</span>';
    });
    // 2) Buscar posts sólo fuera de notas ya procesadas
    const postMatches = Array.from(html.matchAll(/(?:!post|post)\s+#(\d+)/g));
    
    if (postMatches.length > 0) {
      // Extraer los posts del texto y reemplazarlos con marcadores temporales
      const postsToShow: Array<{id: number, originalText: string, replacement: string}> = [];
      let postCounter = 0;
      
      // Reemplazar referencias de posts con marcadores temporales
  html = html.replace(/(?:!post|post)\s+#(\d+)/g, (match, postId) => {
        const id = Number(postId);
        const marker = `__POST_MARKER_${postCounter}__`;
        postsToShow.push({
          id,
          originalText: match,
          replacement: marker
        });
        postCounter++;
        return marker;
      });
      
      // Procesar el texto normalmente (sin posts)
      // Bold, italic, underline, strike - PROCESAR PRIMERO
      html = html.replace(DTextRegex.BOLD, '<strong>$1</strong>');
      html = html.replace(DTextRegex.ITALIC, '<em>$1</em>');
      html = html.replace(DTextRegex.UNDERLINE, '<u>$1</u>');
      html = html.replace(DTextRegex.STRIKETHROUGH, '<s>$1</s>');
      
  // (Notas ya procesadas al inicio)
      
      // Wiki links [[page]] y [[page|text]]
      html = html.replace(DTextRegex.WIKI_LINK, (_m, page, _c, text) => {
        const normalizedPage = page.trim();
        const display = text ? text : normalizedPage.replace(/_/g, ' ');
        return createTagLink(normalizedPage, display, DTextConfig.CSS_CLASSES.TAG_LINK);
      });
      
      // Tag links {{tag}}
      html = html.replace(DTextRegex.TAG_LINK, (_m, tag) => {
        const tagName = tag.trim();
        return createTagLink(tagName, tagName.replace(/_/g, ' '), DTextConfig.CSS_CLASSES.TAG_LINK);
      });
      
      // Enlaces externos con formato DText "texto":[url]
      html = html.replace(DTextRegex.EXTERNAL_LINK, (_m, text, url) => {
        const display = text && text.trim().length > 0 ? text : url;
        return createSafeLink(url, display, DTextConfig.CSS_CLASSES.EXTERNAL_LINK);
      });

      // Enlaces internos a anchors "texto":#anchor
      html = html.replace(/\"([^\"]+)\":#([a-zA-Z0-9_\-]+)/g, (_m, text, anchor) => {
        return `<a href="#${anchor}" class="${DTextConfig.CSS_CLASSES.LINK}">${text}</a>`;
      });
      
      // Procesar referencias numeradas "[1]":[#dtext-external-links]
      html = processNumberedReferences(html);
      
      // Lists (bullets) - procesamiento mejorado
      html = processLists(html);
  // (Primera pasada EXTERNAL_URL_PLAIN eliminada para evitar duplicados)
      
      // Line breaks SOLO en texto plano (no después de headers, listas, grids, ni otros bloques)
      html = html.replace(DTextRegex.SMART_LINEBREAK, '$1<br/>');
      
      // Procesar tablas DText
      html = processTables(html);

      // Procesar bloques expand DText
      html = processExpandBlocks(html);
      
      // Procesar secciones especiales (See also, Examples)
      html = processSpecialSections(html);

      // Aplicar reemplazo de headers
      html = html
        .replace(DTextConfig.HEADERS.h1.pattern, (_m, id, content) => `<h1${id ? ` id=\"${id}\"` : ''} class=\"${DTextConfig.HEADERS.h1.class}\">${content}</h1>`)
        .replace(DTextConfig.HEADERS.h2.pattern, (_m, id, content) => `<h2${id ? ` id=\"${id}\"` : ''} class=\"${DTextConfig.HEADERS.h2.class}\">${content}</h2>`)
        .replace(DTextConfig.HEADERS.h3.pattern, (_m, id, content) => `<h3${id ? ` id=\"${id}\"` : ''} class=\"${DTextConfig.HEADERS.h3.class}\">${content}</h3>`)
        .replace(DTextConfig.HEADERS.h4.pattern, (_m, id, content) => `<h4${id ? ` id=\"${id}\"` : ''} class=\"${DTextConfig.HEADERS.h4.class}\">${content}</h4>`)
        .replace(DTextConfig.HEADERS.h5.pattern, (_m, id, content) => `<h5${id ? ` id=\"${id}\"` : ''} class=\"${DTextConfig.HEADERS.h5.class}\">${content}</h5>`)
        .replace(DTextConfig.HEADERS.h6.pattern, (_m, id, content) => `<h6${id ? ` id=\"${id}\"` : ''} class=\"${DTextConfig.HEADERS.h6.class}\">${content}</h6>`);

      // Ahora reemplazar los marcadores con las imágenes de posts
      postsToShow.forEach((post, index) => {
        const marker = `__POST_MARKER_${index}__`;
        let postHtml = '';
        
        if (nsfwBlockedPosts.has(post.id)) {
          // Mostrar un badge compacto uniforme para evitar parpadeos; bloqueo visual detallado se maneja en tooltip/modal.
          postHtml = `<span class=\"${DTextConfig.CSS_CLASSES.POST_BADGE}\" data-post-badge data-post-id=\"${post.id}\" data-nsfw-blocked=\"true\" title=\"Post #${post.id}\">Post #${post.id}</span>`;
        } else {
          // Forzamos siempre badge (previsualización solo via tooltip hover)
          postHtml = `<span class=\"${DTextConfig.CSS_CLASSES.POST_BADGE}\" data-post-badge data-post-id=\"${post.id}\" title=\"Post #${post.id}\">Post #${post.id}</span>`;
        }
        
        html = html.replace(marker, postHtml);
      });
      
      return html;
    }

  // (Notas ya procesadas al inicio)
    
    // Wiki links [[page]] y [[page|text]]
    html = html.replace(DTextRegex.WIKI_LINK, (_m, page, _c, text) => {
      const normalizedPage = page.trim();
      const display = text ? text : normalizedPage.replace(/_/g, ' ');
      return createTagLink(normalizedPage, display, DTextConfig.CSS_CLASSES.TAG_LINK);
    });
    
    // Tag links {{tag}}
    html = html.replace(DTextRegex.TAG_LINK, (_m, tag) => {
      const tagName = tag.trim();
      return createTagLink(tagName, tagName.replace(/_/g, ' '), DTextConfig.CSS_CLASSES.TAG_LINK);
    });
    
    // Enlaces externos con formato DText "texto":[url]
    html = html.replace(DTextRegex.EXTERNAL_LINK, (_m, text, url) => {
      const display = text && text.trim().length > 0 ? text : url;
      return createSafeLink(url, display, DTextConfig.CSS_CLASSES.EXTERNAL_LINK);
    });

    // Enlaces internos a anchors "texto":#anchor
    html = html.replace(/\"([^\"]+)\":#([a-zA-Z0-9_\-]+)/g, (_m, text, anchor) => {
      return `<a href="#${anchor}" class="${DTextConfig.CSS_CLASSES.LINK}">${text}</a>`;
    });
    
    // Procesar referencias numeradas "[1]":[#dtext-external-links]
    html = processNumberedReferences(html);
    
    // Bold, italic, underline, strike
    html = html.replace(DTextRegex.BOLD, '<strong>$1</strong>');
    html = html.replace(DTextRegex.ITALIC, '<em>$1</em>');
    html = html.replace(DTextRegex.UNDERLINE, '<u>$1</u>');
    html = html.replace(DTextRegex.STRIKETHROUGH, '<s>$1</s>');
    
    // Lists (bullets) - procesamiento mejorado
    html = processLists(html);
    
    // !post #123 o post #123 (posts individuales que no fueron agrupados)
    html = html.replace(DTextRegex.POST_INDIVIDUAL, (_m, postId) => {
      const id = Number(postId);
      const imgUrl = postImageMap[id];
      if (imgUrl && isSafeUrl(imgUrl)) {
        return `<div class="my-2 max-w-full overflow-hidden"><img src="${escapeAttr(imgUrl)}" alt="Post #${id}" class="rounded-lg w-full h-auto max-h-96 object-contain cursor-pointer transition-opacity hover:opacity-90" data-post-id="${id}" /><div class="text-xs text-muted-foreground mt-1 font-mono tabular-nums">Post #${id}</div></div>`;
      }
              return `<span class=\"${DTextConfig.CSS_CLASSES.POST_BADGE}\" data-post-badge data-post-id=\"${id}\" title=\"Post #${id}\">Post #${id}</span>`;
    });
    
  // (Segunda pasada EXTERNAL_URL_PLAIN eliminada para evitar duplicados)
  // duplicate sequence check removed
    
    // Line breaks SOLO en texto plano (no después de headers, listas, grids, ni otros bloques)
    html = html.replace(DTextRegex.SMART_LINEBREAK, '$1<br/>');
    
    // Procesar tablas DText
    html = processTables(html);

    // Procesar bloques expand DText
    html = processExpandBlocks(html);
    
    // Procesar secciones especiales (See also, Examples)
    html = processSpecialSections(html);

    // Antes de devolver html, aplica el reemplazo de headers a todos los bloques (header, text, list):
    html = html
      .replace(DTextConfig.HEADERS.h1.pattern, (_m, id, content) => `<h1${id ? ` id=\"${id}\"` : ''} class=\"${DTextConfig.HEADERS.h1.class}\">${content}</h1>`)
      .replace(DTextConfig.HEADERS.h2.pattern, (_m, id, content) => `<h2${id ? ` id=\"${id}\"` : ''} class=\"${DTextConfig.HEADERS.h2.class}\">${content}</h2>`)
      .replace(DTextConfig.HEADERS.h3.pattern, (_m, id, content) => `<h3${id ? ` id=\"${id}\"` : ''} class=\"${DTextConfig.HEADERS.h3.class}\">${content}</h3>`)
      .replace(DTextConfig.HEADERS.h4.pattern, (_m, id, content) => `<h4${id ? ` id=\"${id}\"` : ''} class=\"${DTextConfig.HEADERS.h4.class}\">${content}</h4>`)
      .replace(DTextConfig.HEADERS.h5.pattern, (_m, id, content) => `<h5${id ? ` id=\"${id}\"` : ''} class=\"${DTextConfig.HEADERS.h5.class}\">${content}</h5>`)
      .replace(DTextConfig.HEADERS.h6.pattern, (_m, id, content) => `<h6${id ? ` id=\"${id}\"` : ''} class=\"${DTextConfig.HEADERS.h6.class}\">${content}</h6>`);

    return html;
  });

  const joined = htmlBlocks.join('');
  return sanitizeHtml(fillEmptyBadgeAnchors(unifyDuplicateAnchors(dedupeDuplicateLinks(joined))));
};

/**
 * Extrae el primer párrafo significativo de un texto DText de forma inteligente
 * Evita cortar palabras, preserva el formato DText y maneja mejor la estructura
 * @param dtextBody - Contenido completo en formato DText
 * @returns Primer párrafo extraído preservando formato DText
 */
export const extractFirstParagraph = (dtextBody: string): string => {
  if (!validateStringInput(dtextBody)) return '';

  // Función auxiliar para truncar texto de forma inteligente preservando formato DText
  const smartTruncate = (text: string, maxLength: number = DTextConfig.MAX_EXTRACT_LENGTH): string => {
    if (text.length <= maxLength) return text;
    
    // Buscar puntos de corte inteligentes evitando romper formato DText
    const cutPoints: CutPoint[] = [
      { pattern: DTextRegex.SENTENCE_END, preference: 1 }, // Final de oración (no dentro de tags)
      { pattern: DTextRegex.SEMICOLON_COLON, preference: 2 },   // Punto y coma, dos puntos
      { pattern: DTextRegex.COMMA, preference: 3 },      // Comas
      { pattern: DTextRegex.SPACE, preference: 4 }        // Espacios (último recurso)
    ];
    
    let bestCut: number | null = null;
    let bestScore = 0;
    
    for (const { pattern, preference } of cutPoints) {
      const matches = [...text.matchAll(pattern)];
      
      for (const match of matches) {
        const cutIndex = match.index! + match[0].length;
        
        if (cutIndex >= maxLength - DTextConfig.TRUNCATE_TOLERANCE && cutIndex <= maxLength) {
          // Verificar que no estamos cortando dentro de un tag DText
          const beforeCut = text.substring(0, cutIndex);
          const openBrackets = (beforeCut.match(DTextRegex.OPEN_BRACKETS) || []).length;
          const closeBrackets = (beforeCut.match(DTextRegex.CLOSE_BRACKETS) || []).length;
          const openCurlies = (beforeCut.match(DTextRegex.OPEN_CURLIES) || []).length;
          const closeCurlies = (beforeCut.match(DTextRegex.CLOSE_CURLIES) || []).length;
          
          // Solo considerar puntos de corte que no dejen tags incompletos
          if (openBrackets === closeBrackets && openCurlies === closeCurlies) {
            // Calcular score: preferencia más cercanía al límite ideal
            const proximityScore = 1 - Math.abs(cutIndex - (maxLength * DTextConfig.TRUNCATE_TARGET_RATIO)) / (maxLength * DTextConfig.TRUNCATE_RANGE_RATIO);
            const score = (5 - preference) * 10 + proximityScore * 5;
            
            if (score > bestScore) {
              bestScore = score;
              bestCut = cutIndex;
            }
          }
        }
      }
    }
    
    if (bestCut) {
      return text.substring(0, bestCut).trim();
    }
    
    // Si no se encuentra un buen punto de corte, truncar en palabra completa sin romper tags
    let truncated = text.substring(0, maxLength - 3);
    
    // Verificar que no hemos cortado un tag a la mitad
    while (truncated.length > maxLength * DTextConfig.MIN_TRUNCATE_RATIO) {
      const openBrackets = (truncated.match(DTextRegex.OPEN_BRACKETS) || []).length;
      const closeBrackets = (truncated.match(DTextRegex.CLOSE_BRACKETS) || []).length;
      const openCurlies = (truncated.match(DTextRegex.OPEN_CURLIES) || []).length;
      const closeCurlies = (truncated.match(DTextRegex.CLOSE_CURLIES) || []).length;
      
      if (openBrackets === closeBrackets && openCurlies === closeCurlies) {
        break;
      }
      
      // Retroceder hasta el último espacio seguro
      const lastSpace = truncated.lastIndexOf(' ');
      if (lastSpace > 0) {
        truncated = truncated.substring(0, lastSpace);
      } else {
        break;
      }
    }
    
    const lastSpace = truncated.lastIndexOf(' ');
    return (lastSpace > maxLength * DTextConfig.LAST_SPACE_RATIO ? truncated.substring(0, lastSpace) : truncated) + '...';
  };

  // Función auxiliar para limpiar solo elementos problemáticos preservando formato DText
  const cleanDText = (text: string): string => {
    return text
      // Solo eliminar elementos que no deben aparecer en extractos
      .replace(DTextRegex.TAG_REQUEST, '')   // Requests de tags
      .replace(DTextRegex.USER_MENTION_HTML, '')                // Menciones con formato  
      .replace(DTextRegex.USER_MENTION, '')     // Menciones simples
      .replace(DTextRegex.EMOJI, '')                   // Emojis
      .replace(DTextRegex.LINE_BREAK, ' ')                 // Saltos de línea a espacios
      .replace(DTextRegex.MULTIPLE_SPACES, ' ')                    // Normalizar espacios
      .trim();
  };

  // Paso 1: Eliminar bloques complejos que interfieren con la extracción
  const preprocessed = dtextBody
    .replace(DTextRegex.EXPAND, '') // Bloques expandibles
    .replace(DTextRegex.QUOTE, '')         // Citas
    .replace(DTextRegex.TABLE, '')         // Tablas  
    .replace(DTextRegex.CODE, '')           // Código
    .replace(DTextRegex.SPOILER, '') // Spoilers
    .replace(DTextRegex.POST_REFERENCE, '') // Referencias a posts (tanto !post como post)
    .replace(DTextRegex.ASSET_REFERENCE, '') // Referencias a assets
    .replace(DTextRegex.UNWANTED_SECTIONS, '')                       // Líneas de ejemplo con posts
    .trim();

  // Paso 2: Dividir en secciones por headers y párrafos
  const sections = preprocessed.split(DTextRegex.HEADER_PATTERN).filter(section => section.trim());
  
  // Paso 3: Buscar en cada sección el primer párrafo válido
  for (const section of sections) {
    // Dividir la sección en párrafos (dobles saltos de línea)
    const paragraphs = section.split(DTextRegex.PARAGRAPH_SPLIT).filter(p => p.trim());
    
    for (const paragraph of paragraphs) {
      // Limpiar el párrafo preservando el formato DText
      const lines = paragraph.split(DTextRegex.LINE_SPLIT).map(line => line.trim()).filter(line => {
        // Filtrar líneas que no aportan contenido sustancial
        return line && 
               line.length > DTextConfig.MIN_LINE_LENGTH &&
               !line.match(DTextRegex.SECTION_HEADERS) &&
               !line.match(DTextRegex.REQUEST_LINE) &&
               !line.match(DTextRegex.MENTION_LINE) &&
               line.match(DTextRegex.ALPHABETIC); // Debe contener letras
      });
      
      if (lines.length === 0) continue;
      
      // Unir líneas válidas preservando el formato DText
      let content = lines.join(' ');
      
      // Solo limpiar elementos problemáticos, no el formato DText
      content = cleanDText(content);
      
      // Verificar que el párrafo resultante es sustancial
      if (content.length >= DTextConfig.MIN_PARAGRAPH_LENGTH && 
          !content.match(/^[[{<].*[\]}>]$/) && // No solo enlaces/tags
          !content.match(/^\*+\s/) && // No líneas de lista
          content.split(/\s+/).length >= DTextConfig.MIN_WORD_COUNT) { // Al menos 5 palabras (considerando formato DText)
        
        // Truncar de forma inteligente si es necesario
        return smartTruncate(content);
      }
    }
  }

  // Paso 4: Si no se encontró párrafo válido, intentar con líneas individuales
  const allLines = preprocessed.split(DTextRegex.LINE_SPLIT).map(line => line.trim()).filter(line => {
    return line && 
           line.length > DTextConfig.MIN_LINE_LENGTH &&
           !line.match(DTextRegex.HEADER_LINE) &&
           !line.match(DTextRegex.BULLET_LINE) &&
           !line.match(DTextRegex.MEDIA_REFERENCE) &&
           !line.match(DTextRegex.REQUEST_LINE) &&
           !line.match(DTextRegex.MENTION_LINE) &&
           line.match(DTextRegex.ALPHABETIC) &&
           line.split(' ').length >= DTextConfig.MIN_LINE_WORD_COUNT; // Al menos 3 palabras
  });
  
  if (allLines.length > 0) {
    // Tomar las primeras 2-3 líneas que formen un párrafo coherente
    let combined = '';
    let lineCount = 0;
    
    for (const line of allLines) {
      const cleanLine = cleanDText(line);
      
      if (lineCount === 0 || (combined + ' ' + cleanLine).length <= DTextConfig.MAX_EXTRACT_LENGTH) {
        combined += (combined ? ' ' : '') + cleanLine;
        lineCount++;
        
        // Si ya tenemos suficiente contenido o 3 líneas, parar
        if (combined.length >= DTextConfig.MAX_EXTRACT_LENGTH * 0.5 || lineCount >= 3) break;
      } else {
        break;
      }
    }
    
    if (combined.length >= DTextConfig.MIN_PARAGRAPH_LENGTH) {
      return smartTruncate(combined);
    }
  }

  return '';
};

// ===== SANITIZACIÓN (DOMPurify) =====

// Tags que el formateador genera legítimamente
const PURIFY_ALLOWED_TAGS = [
  'a', 'strong', 'b', 'em', 'i', 'u', 's', 'span', 'br', 'p', 'div',
  'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
  'ul', 'ol', 'li',
  'blockquote', 'pre', 'code',
  'table', 'thead', 'tbody', 'tr', 'td', 'th',
  'details', 'summary', 'section', 'article', 'img'
];

// Atributos permitidos (data-* se permiten vía ALLOW_DATA_ATTR: data-tag-name, data-post-id, ...)
const PURIFY_ALLOWED_ATTR = [
  'class', 'id', 'title', 'href', 'target', 'rel', 'src', 'alt', 'loading', 'decoding'
];

const PURIFY_CONFIG = {
  ALLOWED_TAGS: PURIFY_ALLOWED_TAGS,
  ALLOWED_ATTR: PURIFY_ALLOWED_ATTR,
  ALLOW_DATA_ATTR: true,
  ALLOW_UNKNOWN_PROTOCOLS: false,
  FORBID_TAGS: ['script', 'style', 'iframe', 'object', 'embed', 'form', 'input', 'textarea', 'select', 'button', 'svg', 'math', 'link', 'meta', 'base'],
  FORBID_ATTR: ['style', 'srcset', 'action', 'formaction', 'xlink:href'],
  RETURN_TRUSTED_TYPE: false as const
};

type Purifier = ReturnType<typeof DOMPurify>;
let purifierInstance: Purifier | null = null;

/**
 * Instancia propia de DOMPurify (los hooks no afectan a otros usos globales de DOMPurify)
 */
const getPurifier = (): Purifier | null => {
  if (purifierInstance) return purifierInstance;
  if (typeof window === 'undefined') return null;
  const instance = DOMPurify(window);
  if (!instance.isSupported) return null;

  instance.addHook('afterSanitizeAttributes', (node: Element) => {
    if (typeof node.hasAttribute !== 'function') return;
    // href/src: solo http(s), rutas relativas y anchors
    for (const attr of ['href', 'src']) {
      if (node.hasAttribute(attr) && !isAllowedUrlValue(node.getAttribute(attr) || '')) {
        node.removeAttribute(attr);
      }
    }
    // target: solo _blank, y siempre con rel="noopener noreferrer"
    if (node.hasAttribute('target')) {
      if (node.getAttribute('target') === '_blank') {
        node.setAttribute('rel', 'noopener noreferrer');
      } else {
        node.removeAttribute('target');
      }
    }
  });

  purifierInstance = instance;
  return purifierInstance;
};

/**
 * Limpia y valida contenido HTML para prevenir XSS (wrapper de DOMPurify)
 * @param htmlContent - Contenido HTML
 * @returns HTML limpio y seguro
 */
export const sanitizeHtml = (htmlContent: string): string => {
  if (!validateStringInput(htmlContent)) return '';

  const purifier = getPurifier();
  if (!purifier) {
    // Sin DOM (SSR/entorno no soportado): degradar a texto plano escapado, nunca devolver HTML sin sanear
    return escapeHtml(htmlContent.replace(/<[^>]*>/g, '')).trim();
  }

  return String(purifier.sanitize(htmlContent, PURIFY_CONFIG)).trim();
};

/**
 * Función auxiliar para limpiar solo el texto de DText sin generar HTML
 * @param dtextContent - Contenido en formato DText
 * @returns Texto plano limpio
 */
export const stripDText = (dtextContent: string): string => {
  if (!validateStringInput(dtextContent)) return '';

  return dtextContent
    // Eliminar bloques complejos
    .replace(DTextRegex.EXPAND, '')
    .replace(DTextRegex.QUOTE, '')
    .replace(DTextRegex.TABLE, '')
    .replace(DTextRegex.CODE, '')
    .replace(DTextRegex.SPOILER, '')
    // Eliminar todos los tags de formato
    .replace(/\[[^\]]+\]/g, '')
    // Eliminar referencias (tanto !post como post)
    .replace(DTextRegex.POST_SIMPLE, '')
    .replace(DTextRegex.ASSET_REFERENCE, '')
    .replace(/\{\{[^}]+\}\}/g, '')
    .replace(/\[\[[^]]+\]\]/g, '')
    // Eliminar menciones y emojis
    .replace(DTextRegex.USER_MENTION_HTML, '')
    .replace(DTextRegex.USER_MENTION, '')
    .replace(DTextRegex.EMOJI, '')
    // Limpiar espacios múltiples
    .replace(DTextRegex.MULTIPLE_SPACES, ' ')
    .trim();
};

/**
 * Extrae los posts de ejemplo de una wiki page de Danbooru
 * @param dtextBody - Contenido del body de la wiki page
 * @returns Array de IDs de posts de ejemplo
 */
export const extractExamplePosts = (dtextBody: string): number[] => {
  if (!validateStringInput(dtextBody)) return [];

  const examplePosts: number[] = [];
  
  // Buscar patrones de posts de ejemplo en DText
  // Patrón: !post #123456
  const postPattern = DTextRegex.POST_PATTERN;
  let match;
  
  while ((match = postPattern.exec(dtextBody)) !== null) {
    const postId = parseInt(match[1], 10);
    if (postId && !examplePosts.includes(postId)) {
      examplePosts.push(postId);
    }
  }
  
  return examplePosts;
};

/**
 * Extrae posts de ejemplo organizados por categorías de una wiki page
 * @param dtextBody - Contenido del body de la wiki page
 * @returns Objeto con categorías y sus posts de ejemplo
 */
export const extractCategorizedExamplePosts = (dtextBody: string): CategoryPosts => {
  if (!validateStringInput(dtextBody)) return {};

  const categories: CategoryPosts = {};
  const lines = dtextBody.split('\n');
  let currentCategory = 'general';
  let currentPosts: number[] = [];

  for (const line of lines) {
    const trimmed = line.trim();
    
    // Detectar headers de categorías (h4., h5., h6.)
    const headerMatch = trimmed.match(DTextRegex.CATEGORY_HEADER);
    if (headerMatch) {
      // Guardar posts de la categoría anterior si existen
      if (currentPosts.length > 0) {
        categories[currentCategory] = currentPosts;
      }
      
      // Iniciar nueva categoría
      currentCategory = headerMatch[2].toLowerCase().replace(/[^a-z0-9\s]/g, '').replace(/\s+/g, '_');
      currentPosts = [];
      continue;
    }
    
    // Buscar posts de ejemplo en la línea actual
    const postPattern = DTextRegex.POST_PATTERN;
    let match;
    const linePosts: number[] = [];
    
    while ((match = postPattern.exec(trimmed)) !== null) {
      const postId = parseInt(match[1], 10);
      if (postId) {
        linePosts.push(postId);
      }
    }
    
    // Si encontramos posts en esta línea, agregarlos a la categoría actual
    if (linePosts.length > 0) {
      currentPosts.push(...linePosts);
    }
  }
  
  // Agregar la última categoría si tiene posts
  if (currentPosts.length > 0) {
    categories[currentCategory] = currentPosts;
  }
  
  return categories;
};

export function formatPostCaption(caption: string): string {
  if (!caption) return '';
  // SEGURIDAD: escapar HTML crudo antes de generar markup
  let formatted = applyBasicFormatting(escapeHtml(caption));
  formatted = applyTagAndWikiLinks(formatted);
  formatted = replaceExternalLinks(formatted);
  return sanitizeHtml(finalizeAnchors(formatted));
}

export default {
  formatDTextSafe,
  formatDTextAdvanced,
  extractFirstParagraph,
  sanitizeHtml,
  stripDText,
  extractExamplePosts,
  extractCategorizedExamplePosts,
  // Exportar helpers por si otros módulos quieren formateo granular
  _helpers: { applyBasicFormatting, applyTagAndWikiLinks, formatTranslationNote }
};

/**
 * Elimina patrones de enlaces duplicados donde queda un <a> vacío seguido del mismo enlace con texto
 */
const dedupeDuplicateLinks = (html: string): string => {
  // Caso: <a ...></a><a ...>URL</a> (mismo href)
  return html.replace(/<a([^>]*href=\"([^\"]+)\"[^>]*)><\/a>\s*(?=<a[^>]*href=\"\2\")/g, '');
};

/**
 * Rellena anchors vacíos (sin texto) con su href si tienen clase de badge
 */
const fillEmptyBadgeAnchors = (html: string): string => {
  return html.replace(/<a([^>]*)><\/a>/g, (full, attrs) => {
    if (!/cat-badge/.test(attrs)) return full; // solo badges
    const hrefMatch = attrs.match(/href=\"([^\"]+)\"/);
    if (!hrefMatch) return full;
    const url = hrefMatch[1];
    // Evitar inyectar query muy larga: truncar visual
    const display = url.length > 80 ? url.slice(0,77) + '…' : url;
    return `<a${attrs}>${display}</a>`;
  });
};

/**
 * Unifica patrones de anchors duplicados consecutivos con el mismo href:
 * <a ...></a><a ...>texto</a>  -> <a ...>texto</a>
 * <a ...>texto</a><a ...>texto</a> -> <a ...>texto</a>
 */
const unifyDuplicateAnchors = (html: string): string => {
  // Caso 1: primero vacío, segundo con texto
  html = html.replace(/<a([^>]*href=\"([^\"]+)\"[^>]*)><\/a>\s*<a([^>]*href=\"\2\"[^>]*)>([\s\S]*?)<\/a>/g,
    (_m, _a1Attrs, _href, a2Attrs, inner) => `<a${a2Attrs}>${inner}</a>`);
  // Caso 2: dos anchors con mismo href y contenido (o diferente) -> mantener el primero con contenido no vacío
  html = html.replace(/<a([^>]*href=\"([^\"]+)\"[^>]*)>([\s\S]*?)<\/a>\s*<a([^>]*href=\"\2\"[^>]*)>([\s\S]*?)<\/a>/g,
    (_m, a1Attrs, _href, inner1, _a2Attrs, inner2) => {
      const chosen = inner1 && inner1.trim().length > 0 ? inner1 : inner2;
      return `<a${a1Attrs}>${chosen}</a>`;
    });
  return html;
};

// ===== ENLACES (sistema centralizado) =====
const replaceExternalLinks = memoize((input: string): string => {
  let text = input;
  const replacements: Array<{ marker: string; html: string }> = [];
  let counter = 0;
  const inject = (url: string, label?: string) => {
    const display = label && label.trim() ? label.trim() : url;
    const marker = generateLinkMarker(counter++);
    replacements.push({ marker, html: createSafeLink(url, display, DTextConfig.CSS_CLASSES.EXTERNAL_LINK) });
    return marker;
  };
  text = text.replace(DTextRegex.DIRECT_LINK, (_m, url) => inject(url));
  text = text.replace(DTextRegex.CUSTOM_LINK, (_m, txt, url) => inject(url, txt));
  text = text.replace(DTextRegex.CUSTOM_LINK_ALT, (_m, txt, url) => inject(url, txt));
  text = text.replace(DTextRegex.MARKDOWN_LINK, (_m, txt, url) => inject(url, txt));
  text = text.replace(DTextRegex.URL_PLAIN, (m, before, url, offset: number, full: string) => {
    const upto = full.slice(0, offset);
    const lastOpen = upto.lastIndexOf('<a ');
    const lastClose = upto.lastIndexOf('</a>');
    if (lastOpen !== -1 && lastOpen > lastClose) return m; // dentro de anchor existente
    if (/\.(jpg|jpeg|png|gif|webp|svg|bmp|apng|avif|ico)(\?.*)?$/i.test(url)) return before + url; // no envolver imágenes
    return before + inject(url);
  });
  replacements.forEach(r => { text = text.replace(r.marker, r.html); });
  return text;
});

const finalizeAnchors = (html: string): string => {
  const before = html;
  const dupRegex = /<a([^>]*href="([^"]+)"[^>]*)><\/a>(?=\s*<a[^>]*href="\2")/g;
  // eliminar anchors vacíos consecutivos antes de duplicados
  html = html.replace(dupRegex, '');
  html = html.replace(/<a([^>]*href="([^"]+)"[^>]*)>([\s\S]*?)<\/a>\s*<a([^>]*href="\2"[^>]*)>([\s\S]*?)<\/a>/g,
    (_m, a1Attrs, _href, inner1, _a2Attrs, inner2) => `<a${a1Attrs}>${(inner1 && inner1.trim()) ? inner1 : inner2}</a>`);
  html = html.replace(/<a([^>]*)><\/a>/g, (full, attrs) => {
    if (!/cat-badge/.test(attrs)) return full;
    const hrefMatch = attrs.match(/href="([^"]+)"/);
    if (!hrefMatch) return full;
    const url = hrefMatch[1];
    const display = url.length > 80 ? url.slice(0,77) + '…' : url;
  // filled empty badge anchor
    return `<a${attrs}>${display}</a>`;
  });
  if (before !== html) {
  // no remaining debug checks
  }
  return html;
};