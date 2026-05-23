/**
 * Configuration and regex patterns for DText formatting
 */

// Types
export interface PostImageMap {
  [postId: number]: string;
}

export interface DTextBlock {
  type: 'text' | 'list' | 'header';
  content: string;
}

export interface CategoryPosts {
  [category: string]: number[];
}

// Emoji mapping
export const emojiMap: { [key: string]: string } = {
  'smile': '😊',
  'wink': '😉',
  'laugh': '😂',
  'heart': '❤️',
  'thumbsup': '👍',
  'thumbsdown': '👎',
  'fire': '🔥',
  'star': '⭐',
  'warning': '⚠️',
  'info': 'ℹ️',
  'question': '❓',
  'exclamation': '❗',
  'check': '✅',
  'cross': '❌'
};

// DText Regular Expressions
export const DTextRegex = {
  // Links
  DIRECT_LINK: /<(https?:\/\/[^\s>]+)>/g,
  CUSTOM_LINK: /"([^"]+)":\[([^\]]+)\]/g,
  CUSTOM_LINK_ALT: /"([^"]+)":([^\s\[\]]+)/g,
  MARKDOWN_LINK: /\[([^\]]+)\]\(([^)]+)\)/g,
  URL_PLAIN: /(^|[^"\[])((https?:\/\/|www\.)\S+)/g,
  EXTERNAL_LINK: /"([^"]+)":\[([^\]]+)\]/g,
  EXTERNAL_URL_PLAIN: /(^|\s)(https?:\/\/[^\s]+)/g,
  
  // Text formatting
  BOLD: /\*\*([^*]+)\*\*/g,
  ITALIC: /\*([^*]+)\*/g,
  UNDERLINE: /_([^_]+)_/g,
  STRIKETHROUGH: /~~([^~]+)~~/g,
  TRANSLATION: /\[tn\]([^\[]+)\[\/tn\]/gi,
  
  // Tags and links
  TAG_LINK: /\{\{([^}]+)\}\}/g,
  WIKI_LINK: /\[\[([^\]|]+)(\|([^\]]+))?\]\]/g,
  USER_MENTION: /@([a-zA-Z0-9_-]+)/g,
  USER_MENTION_HTML: /@([a-zA-Z0-9_-]+)/g,
  
  // Structure
  QUOTE: /\[quote\]([\s\S]*?)\[\/quote\]/gi,
  CODE: /\[code\]([\s\S]*?)\[\/code\]/gi,
  SPOILER: /\[spoiler\]([\s\S]*?)\[\/spoiler\]/gi,
  EXPAND: /\[expand(?:=([^\]]+))?\]([\s\S]*?)\[\/expand\]/gi,
  TABLE: /\[table\]([\s\S]*?)\[\/table\]/gi,
  
  // Lists
  BULLET_ITEM: /^(\*+)\s+(.+)$/,
  
  // Posts and media
  POST_INDIVIDUAL: /(?:!post|post)\s+#(\d+)/g,
  POST_REFERENCE: /(?:!post|post)\s+#\d+/g,
  POST_PATTERN: /(?:!post|post)\s+#(\d+)/g,
  POST_SIMPLE: /(?:!post|post)\s+#\d+/g,
  ASSET_REFERENCE: /asset\s+#\d+/gi,
  
  // Headers
  HEADER_PATTERN: /^(h[1-6])(?:#([a-zA-Z0-9_\-]+))?\.\s+(.*)$/gm,
  CATEGORY_HEADER: /^(h[1-6])(?:#([a-zA-Z0-9_\-]+))?\.\s+(.*)$/,
  
  // Special sections
  UNWANTED_SECTIONS: /^(Examples?|See also|External links?)\s*$/gmi,
  EXAMPLES_HEADER: /^Examples?\s*$/gmi,
  SEE_ALSO_HEADER: /^See also\s*$/gmi,
  
  // Tag requests
  TAG_REQUEST: /(bur|alias|implication)\s+#(\d+)/gi,
  
  // Emojis
  EMOJI: /:([a-zA-Z0-9_]+):/g,
  
  // Cleanup
  LINE_BREAK: /\n/g,
  LINEBREAKS: /\n\s*\n/g,
  MULTIPLE_SPACES: /\s+/g,
  REMAINING_TAGS: /\[[^\]]+\]/g,
  
  // HTML Security patterns
  SCRIPT_TAG: /<script[^>]*>[\s\S]*?<\/script>/gi,
  IFRAME_TAG: /<iframe[^>]*>[\s\S]*?<\/iframe>/gi,
  OBJECT_TAG: /<object[^>]*>[\s\S]*?<\/object>/gi,
  EMBED_TAG: /<embed[^>]*\/?>/gi,
  FORM_TAG: /<form[^>]*>[\s\S]*?<\/form>/gi,
  INPUT_TAG: /<input[^>]*\/?>/gi,
  TEXTAREA_TAG: /<textarea[^>]*>[\s\S]*?<\/textarea>/gi,
  SELECT_TAG: /<select[^>]*>[\s\S]*?<\/select>/gi,
  BUTTON_TAG: /<button[^>]*>[\s\S]*?<\/button>/gi,
  EVENT_HANDLER_QUOTED: /on\w+=["'][^"']*["']/gi,
  EVENT_HANDLER_UNQUOTED: /on\w+=[^\s>]+/gi,
  JAVASCRIPT_URL: /javascript:/gi,
  VBSCRIPT_URL: /vbscript:/gi,
  DATA_URL: /data:/gi,
  STYLE_TAG: /<style[^>]*>[\s\S]*?<\/style>/gi,
  HTML_TAG: /<(\/?\w+)([^>]*)>/g,
  
  // HTML entities and safety
  HTML_ENTITIES: /(<[^>]+>)|([<>&])/g,
  AMP_ENTITY: /&amp;/g,
  LT_ENTITY: /&lt;/g,
  GT_ENTITY: /&gt;/g,
  SAFE_URL: /^https?:\/\/[^\s<>"']+$/,
  SAFE_PATH: /^#[a-zA-Z0-9_\-]+$/,
  ATTRIBUTE_PATTERN: /(\w+)=["']([^"']*)["']/g,
  STYLE_ATTR_QUOTED: /style=["'][^"']*["']/gi,
  STYLE_ATTR_UNQUOTED: /style=[^\s>]+/gi,
  
  // Line type patterns
  REQUEST_LINE: /^\s*request\s*:/i,
  MENTION_LINE: /^\s*@\w+/,
  ALPHABETIC: /^[a-zA-Z]/,
  HEADER_LINE: /^h[1-6]\./,
  BULLET_LINE: /^\*+\s/,
  MEDIA_REFERENCE: /(?:asset|media)\s+#\d+/gi,
  LINE_SPLIT: /\n/,
  CLOSE_CURLIES: /\}\}/g,
  OPEN_CURLIES: /\{\{/g,
  OPEN_BRACKETS: /\[/g,
  CLOSE_BRACKETS: /\]/g,
  SPACE: /\s/g,
  SENTENCE_END: /[.!?]\s/g,
  SEMICOLON_COLON: /[;:]\s/g,
  COMMA: /,\s/g,
  SMART_LINEBREAK: /(\S)\n(?=\S)/g,
  PARAGRAPH_SPLIT: /\n\s*\n/,
  SECTION_HEADERS: /^(Examples?|See also|External links?)\s*$/gmi
};

// DText Configuration
export const DTextConfig = {
  // CSS Classes
  CSS_CLASSES: {
    EXTERNAL_LINK: 'text-blue-500 hover:text-blue-700 underline',
    TAG_LINK: 'text-purple-500 hover:text-purple-700 underline font-medium',
    WIKI_LINK: 'text-green-500 hover:text-green-700 underline',
    USER_MENTION: 'text-orange-500 font-medium',
    LINK: 'text-blue-500 hover:text-blue-700 underline',
    QUOTE: 'border-l-4 border-gray-300 pl-4 italic text-gray-600 dark:text-gray-400 my-2',
    CODE_BLOCK: 'bg-gray-100 dark:bg-gray-800 p-3 rounded font-mono text-sm overflow-x-auto',
    SPOILER: 'bg-gray-800 text-gray-800 hover:text-white cursor-pointer transition-colors',
    LIST_CONTAINER: 'dtext-list-container list-disc list-inside space-y-1',
    LIST_ITEM: 'dtext-list-item',
    MEDIA_EMBED: 'dtext-media-embed inline-block max-w-full',
    MEDIA_IMAGE: 'dtext-media-image',
    MEDIA_CAPTION: 'dtext-media-caption text-xs text-gray-600 dark:text-gray-400 mt-1',
    MEDIA_GALLERY: 'dtext-media-gallery grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4',
    TAG_REQUEST: 'inline-flex items-center px-2 py-1 rounded text-xs font-medium bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200'
  },
  
  // Format tags
  FORMAT_TAGS: {
    bold: { class: 'font-bold' },
    italic: { class: 'italic' },
    underline: { class: 'underline' },
    strikethrough: { class: 'line-through' },
    translation: { class: 'text-blue-600 dark:text-blue-400 cursor-help' }
  },
  
  // Headers
  HEADERS: {
    h1: {
      pattern: /^h1(?:#([a-zA-Z0-9_\-]+))?\.\s+(.*)$/gm,
      class: 'text-3xl font-bold mb-4 text-gray-900 dark:text-white'
    },
    h2: {
      pattern: /^h2(?:#([a-zA-Z0-9_\-]+))?\.\s+(.*)$/gm,
      class: 'text-2xl font-bold mb-3 text-gray-900 dark:text-white'
    },
    h3: {
      pattern: /^h3(?:#([a-zA-Z0-9_\-]+))?\.\s+(.*)$/gm,
      class: 'text-xl font-bold mb-2 text-gray-900 dark:text-white'
    },
    h4: {
      pattern: /^h4(?:#([a-zA-Z0-9_\-]+))?\.\s+(.*)$/gm,
      class: 'text-lg font-bold mb-2 text-gray-900 dark:text-white'
    },
    h5: {
      pattern: /^h5(?:#([a-zA-Z0-9_\-]+))?\.\s+(.*)$/gm,
      class: 'text-base font-bold mb-1 text-gray-900 dark:text-white'
    },
    h6: {
      pattern: /^h6(?:#([a-zA-Z0-9_\-]+))?\.\s+(.*)$/gm,
      class: 'text-sm font-bold mb-1 text-gray-900 dark:text-white'
    }
  },
  
  // Request tags
  REQUEST_TAGS: {
    bur: { label: 'BUR', class: 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200' },
    alias: { label: 'Alias', class: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200' },
    implication: { label: 'Implication', class: 'bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200' }
  },
  
  // Limits and thresholds
  MAX_EXTRACT_LENGTH: 500,
  MIN_PARAGRAPH_LENGTH: 50,
  MIN_WORD_COUNT: 5,
  MIN_LINE_LENGTH: 10,
  LAST_SPACE_RATIO: 0.8,
  TRUNCATE_TARGET_RATIO: 0.75,
  TRUNCATE_RANGE_RATIO: 0.25,
  MIN_TRUNCATE_RATIO: 0.5,
  TRUNCATE_TOLERANCE: 10
};