/**
 * Utilidades unificadas para formatear texto DText de Danbooru
 * Convierte DText a HTML/React-friendly manteniendo la seguridad
 * 
 * Basado en la documentación oficial de Danbooru DText:
 * https://deepwiki.com/danbooru/danbooru/7-text-processing
 */

// ===== TIPOS Y INTERFACES =====

interface PostImageMap { [postId: number]: string; }
interface DTextBlock { type: 'header' | 'list' | 'text'; content: string; }
interface CutPoint { pattern: RegExp; preference: number; }
interface CategoryPosts { [category: string]: number[]; }
interface AllowedAttributes { [tagName: string]: string[]; }

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
    LINK: 'underline accent hover:opacity-80',
    TAG_LINK: 'cat-badge cat-default hover:opacity-80 transition-colors cursor-pointer mr-1',
    WIKI_LINK: 'cat-badge cat-default hover:opacity-80 transition-colors cursor-pointer mr-1',
    EXTERNAL_LINK: 'cat-badge cat-default hover:opacity-80 transition-colors cursor-pointer mr-1',
    USER_MENTION: 'inline-block bg-purple-100 dark:bg-purple-900 text-purple-800 dark:text-purple-200 px-2 py-1 rounded text-sm font-medium',
    TAG_REQUEST: 'inline-block px-2 py-1 rounded text-xs font-medium mr-1',
    SPOILER: 'spoiler-inline',
    NOTE: 'text-xs bg-surface-alt dark:bg-surface-alt text-text-secondary dark:text-text-secondary px-1 rounded',
    CODE_BLOCK: 'bg-surface-alt dark:bg-surface-alt border border-subtle dark:border-subtle rounded p-3 text-sm font-mono overflow-x-auto my-2 text-text-secondary dark:text-text-secondary',
    QUOTE: 'border-l-4 border-subtle dark:border-subtle pl-4 italic text-text-secondary dark:text-text-secondary my-2',
    LIST_ITEM: 'text-text-secondary dark:text-text-secondary text-sm whitespace-normal h-auto flex items-start leading-snug',
    LIST_CONTAINER: 'flex flex-wrap gap-2 my-2 items-center',
    MEDIA_GALLERY: 'media-gallery grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 mb-4 h-full',
    MEDIA_EMBED: 'dtext-media-embed flex flex-col bg-surface-alt dark:bg-surface rounded shadow overflow-hidden border border-subtle dark:border-subtle',
    MEDIA_IMAGE: 'flex-1 flex items-center justify-center min-h-[120px] media-embed-image p-2 bg-surface-alt dark:bg-surface',
    MEDIA_CAPTION: 'media-embed-caption mt-auto p-2 text-xs text-center text-text-subtle dark:text-text-subtle text-balance',
    POST_BADGE: 'cat-badge cat-default hover:opacity-80 transition-colors cursor-pointer mr-1'
  },
  HEADERS: {
    h1: { class: 'text-2xl font-bold mb-4 text-primary', pattern: /^h1(?:#([a-zA-Z0-9_\-]+))?\.\s+(.*)$/gm },
    h2: { class: 'text-xl font-bold mb-3 text-primary', pattern: /^h2(?:#([a-zA-Z0-9_\-]+))?\.\s+(.*)$/gm },
    h3: { class: 'text-lg font-bold mb-2 text-primary', pattern: /^h3(?:#([a-zA-Z0-9_\-]+))?\.\s+(.*)$/gm },
    h4: { class: 'text-base font-bold mb-2 text-primary', pattern: /^h4(?:#([a-zA-Z0-9_\-]+))?\.\s+(.*)$/gm },
    h5: { class: 'text-sm font-bold mb-1 text-primary', pattern: /^h5(?:#([a-zA-Z0-9_\-]+))?\.\s+(.*)$/gm },
    h6: { class: 'text-xs font-bold mb-1 text-primary', pattern: /^h6(?:#([a-zA-Z0-9_\-]+))?\.\s+(.*)$/gm }
  },
  FORMAT_TAGS: {
    bold: { tag: 'strong', class: 'font-bold' },
    italic: { tag: 'em', class: 'italic' },
    underline: { tag: 'u', class: 'underline' },
    strikethrough: { tag: 's', class: 'line-through' },
    translation: { tag: 'span', class: 'text-xs bg-gray-200 dark:bg-gray-700 text-gray-800 dark:text-gray-200 px-1 rounded', title: 'Nota de traducción' }
  },
  REQUEST_TAGS: {
    ta: { class: 'bg-yellow-100 dark:bg-yellow-900 text-yellow-800 dark:text-yellow-200', label: 'Tag Alias' },
    ti: { class: 'bg-orange-100 dark:bg-orange-900 text-orange-800 dark:text-orange-200', label: 'Tag Implication' },
    bur: { class: 'bg-red-100 dark:bg-red-900 text-red-800 dark:text-red-200', label: 'BUR' }
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

/**
 * Escapa caracteres HTML básicos
 */
const escapeHtml = (text: string): string => {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
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
  return `<a href="${url}" target="_blank" rel="noopener noreferrer" class="${className}">${text}</a>`;
};

/**
 * Crea enlace de tag/wiki con evento personalizado
 */
const createTagLink = (tagName: string, displayName: string, className: string): string => {
  const normalizedName = tagName.trim().replace(/\s+/g, '_');
  // Usar data attributes en lugar de onclick inline para mayor compatibilidad
  return `<a href="#" data-tag-name="${normalizedName}" class="${className} tag-link">${displayName}</a>`;
};

/**
 * Cache simple para operaciones costosas
 */
const memoize = <T extends (...args: any[]) => any>(fn: T): T => {
  const cache = new Map<string, ReturnType<T>>();
  
  return ((...args: Parameters<T>): ReturnType<T> => {
    const key = JSON.stringify(args);
    if (cache.has(key)) {
      return cache.get(key)!;
    }
    const result = fn(...args);
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
    return `<table class="min-w-full border border-gray-300 my-2">${htmlRows}</table>`;
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
    return `${pre}<section class="bg-green-50 border-l-4 border-green-400 p-2 my-2"><h4 class="font-bold">${header}</h4><div>${body.trim()}</div></section>`;
  });
  // Procesar 'Examples'
  content = content.replace(/(^|\n)(Examples?)\s*\n([\s\S]*?)(?=\n\w|$)/gi, (_m, pre, header, body) => {
    // Reemplazar referencias a posts (post #123 o !post #123) por badges interactivos
  const bodyWithBadges = body.replace(/(?:!post|post)\s*#(\d+)/gi, (_pm: string, id: string) => {
      const num = Number(id);
      if (!num) return _pm;
      return `<span class="${DTextConfig.CSS_CLASSES.POST_BADGE}" data-post-badge data-post-id="${num}" title="Post #${num}">Post #${num}</span>`;
    });
    return `${pre}<section class="bg-blue-50 border-l-4 border-blue-400 p-2 my-2"><h4 class="font-bold">${header}</h4><div>${bodyWithBadges.trim()}</div></section>`;
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
    
    if (url) {
      // Badge activo con enlace
      return `<a href="${escapeHtml(url)}" target="_blank" rel="noopener noreferrer" class="inline-block bg-orange-100 dark:bg-orange-900/30 text-orange-800 dark:text-orange-300 border border-orange-200 dark:border-orange-700 px-2 py-1 rounded-md text-xs font-medium mr-1 hover:bg-orange-200 dark:hover:bg-orange-800 hover:text-orange-900 dark:hover:text-orange-100 transition-colors cursor-pointer shadow-sm">${escapeHtml(numberText)}</a>`;
    } else {
      // Badge inactivo sin enlace
      return `<span class="inline-block bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400 border border-gray-200 dark:border-gray-600 px-2 py-1 rounded-md text-xs font-medium mr-1 shadow-sm">${escapeHtml(numberText)}</span>`;
    }
  });
  
  // Formatear definiciones como tarjetas clickeables
  processed = processed.replace(DTextRegex.NUMBERED_LINK_DEFINITION, (_match, number, url) => {
    return `<div class="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400 mt-2 p-2 bg-gray-50 dark:bg-gray-800/50 border border-gray-200 dark:border-gray-700 rounded-lg">
      <span class="inline-block bg-orange-100 dark:bg-orange-900/30 text-orange-800 dark:text-orange-300 border border-orange-200 dark:border-orange-700 px-2 py-1 rounded-md text-xs font-semibold shadow-sm">[${escapeHtml(number)}]</span>
      <a href="${escapeHtml(url)}" target="_blank" rel="noopener noreferrer" class="text-blue-600 hover:text-blue-800 dark:text-blue-400 dark:hover:text-blue-300 underline hover:no-underline transition-colors flex-1 truncate">${escapeHtml(url)}</a>
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
      content += '</' + tag + '>'.repeat(openCount - closeCount);
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
      if (imgUrl) {
        const img = `<img src="${imgUrl}" alt="Post #${id}" class="w-full h-auto max-h-48 object-contain rounded cursor-pointer hover:opacity-80 transition-opacity" data-post-id="${id}" loading="lazy" decoding="async" />`;
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

  let formatted = sanitizeUnclosedTags(dtextContent);

  // ===== HEADERS (h1., h2., h3., h4., h5., h6. y con IDs tipo h4#about.) =====
  // IMPORTANTE: Procesar headers ANTES del escape HTML para que los wiki links funcionen
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

  // Escapar HTML básico para seguridad (después de procesar headers)
  formatted = formatted
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');

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
  formatted = formatted.replace(DTextRegex.EMOJI, (_m, name) => {
    const emoji = emojiMap[name] || '😊';
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
  return `<a href="/posts/${id}" class="text-blue-500 underline">Post #${id}</a>`;
  });
  formatted = formatted.replace(DTextRegex.ASSET_REFERENCE, () => {
    return `<span class="text-gray-400 dark:text-gray-500">[Asset]</span>`;
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
    return `<span class="text-gray-500 dark:text-gray-400">(${inside})</span>`;
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
    return `${pre}<section class="bg-green-50 border-l-4 border-green-400 p-2 my-2"><h4 class="font-bold">${header}</h4><div>${body.trim()}</div></section>`;
  });

  // Eliminar/normalizar anchors duplicados y rellenar badges vacíos para evitar botones sin texto
  return fillEmptyBadgeAnchors(unifyDuplicateAnchors(dedupeDuplicateLinks(formatted)));
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

  dtextContent = sanitizeUnclosedTags(dtextContent);
  
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
      if (imgUrl) {
        return `<div class="my-2 max-w-full overflow-hidden"><img src="${imgUrl}" alt="Post #${id}" class="rounded shadow w-full h-auto max-h-96 object-contain cursor-pointer hover:opacity-80 transition-opacity" data-post-id="${id}" /><div class="text-xs text-gray-500 dark:text-gray-400 mt-1">Post #${id}</div></div>`;
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
  return fillEmptyBadgeAnchors(unifyDuplicateAnchors(dedupeDuplicateLinks(joined)));
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

/**
 * Limpia y valida contenido HTML para prevenir XSS
 * @param htmlContent - Contenido HTML
 * @returns HTML limpio y seguro
 */
export const sanitizeHtml = (htmlContent: string): string => {
  if (!validateStringInput(htmlContent)) return '';

  // Lista de tags permitidos basada en las características de DText
  const allowedTags = [
    'strong', 'em', 'u', 's', 'span', 'a', 'br', 'p', 'div',
    'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
    'ul', 'ol', 'li',
    'blockquote', 'pre', 'code', 'table', 'tr', 'td', 'details', 'summary', 'section'
  ];
  
  const allowedAttributes: AllowedAttributes = {
    'span': ['class', 'title'],
    'a': ['href', 'target', 'rel', 'class', 'data-tag-name'],
    'h1': ['class', 'id'],
    'h2': ['class', 'id'],
    'h3': ['class', 'id'],
    'h4': ['class', 'id'],
    'h5': ['class', 'id'],
    'h6': ['class', 'id'],
    'ul': ['class'],
    'ol': ['class'],
    'li': ['class'],
    'blockquote': ['class'],
    'pre': ['class'],
    'code': ['class'],
    'p': ['class'],
    'div': ['class'],
    'strong': ['class'],
    'em': ['class'],
    'table': ['class'],
    'tr': [],
    'td': [],
    'details': ['class'],
    'summary': ['class'],
    'section': ['class']
  };

  // Remover cualquier script o tag peligroso
  let cleaned = htmlContent
    .replace(DTextRegex.SCRIPT_TAG, '') // Scripts
    .replace(DTextRegex.IFRAME_TAG, '') // iFrames
    .replace(DTextRegex.OBJECT_TAG, '') // Objects
    .replace(DTextRegex.EMBED_TAG, '') // Embeds
    .replace(DTextRegex.FORM_TAG, '') // Forms
    .replace(DTextRegex.INPUT_TAG, '') // Inputs
    .replace(DTextRegex.TEXTAREA_TAG, '') // Textareas
    .replace(DTextRegex.SELECT_TAG, '') // Selects
    .replace(DTextRegex.BUTTON_TAG, '') // Buttons
    .replace(DTextRegex.EVENT_HANDLER_QUOTED, '') // Event handlers
    .replace(DTextRegex.EVENT_HANDLER_UNQUOTED, '') // Event handlers sin comillas
    .replace(DTextRegex.JAVASCRIPT_URL, 'blocked:') // JavaScript URLs
    .replace(DTextRegex.VBSCRIPT_URL, 'blocked:') // VBScript URLs
    .replace(DTextRegex.DATA_URL, 'blocked:') // Data URLs (pueden ser peligrosos)
    .replace(DTextRegex.STYLE_TAG, '') // Estilos inline (pueden contener CSS malicioso)
    .replace(DTextRegex.STYLE_ATTR_QUOTED, '') // Atributos style
    .replace(DTextRegex.STYLE_ATTR_UNQUOTED, ''); // Atributos style sin comillas

  // Función auxiliar para limpiar atributos no permitidos
  const cleanAttributes = (tagName: string, attributes: string): string => {
    const allowed = allowedAttributes[tagName.toLowerCase()] || [];
    return attributes.replace(DTextRegex.ATTRIBUTE_PATTERN, (match: string, attr: string, value: string) => {
      if (allowed.includes(attr.toLowerCase())) {
        // Validar que los valores de href sean seguros
        if (attr.toLowerCase() === 'href') {
          if (value.match(DTextRegex.SAFE_URL) || value.match(DTextRegex.SAFE_PATH)) {
            return match;
          }
          return ''; // Eliminar hrefs no seguros
        }
        return match;
      }
      return ''; // Eliminar atributos no permitidos
    });
  };

  // Limpiar tags no permitidos pero preservar el contenido
  cleaned = cleaned.replace(DTextRegex.HTML_TAG, (_match: string, tagName: string, attributes: string) => {
    if (allowedTags.includes(tagName.toLowerCase())) {
      if (attributes.trim()) {
        const cleanAttrs = cleanAttributes(tagName, attributes);
        return `<${tagName}${cleanAttrs ? ' ' + cleanAttrs : ''}>`;
      }
      return `<${tagName}>`;
    }
    return ''; // Eliminar tags no permitidos
  });

  // Decodificar entidades HTML básicas que fueron codificadas previamente para procesamiento
  cleaned = cleaned
    .replace(DTextRegex.AMP_ENTITY, '&')
    .replace(DTextRegex.LT_ENTITY, '<')
    .replace(DTextRegex.GT_ENTITY, '>');

  // Recodificar caracteres peligrosos que no están en tags
  cleaned = cleaned.replace(DTextRegex.HTML_ENTITIES, (_match: string, tag?: string, char?: string) => {
    if (tag) return tag; // Preservar tags válidos
    if (char === '<') return '&lt;';
    if (char === '>') return '&gt;';
    if (char === '&') return '&amp;';
    return char || '';
  });

  return cleaned.trim();
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
  let formatted = applyBasicFormatting(caption);
  formatted = applyTagAndWikiLinks(formatted);
  formatted = replaceExternalLinks(formatted);
  return finalizeAnchors(formatted);
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
  let before = html;
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