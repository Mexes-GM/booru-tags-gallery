/**
 * Translation Filters Utility
 * Provides intelligent filtering to avoid unnecessary translations
 */

// Common English words that don't need translation
const COMMON_ENGLISH_WORDS = new Set([
  // Articles
  'a', 'an', 'the',
  // Prepositions
  'in', 'on', 'at', 'by', 'for', 'with', 'from', 'to', 'of', 'and', 'or',
  // Common adjectives
  'big', 'small', 'new', 'old', 'good', 'bad', 'hot', 'cold', 'long', 'short',
  'high', 'low', 'fast', 'slow', 'hard', 'soft', 'light', 'dark', 'heavy',
  // Colors
  'red', 'blue', 'green', 'yellow', 'black', 'white', 'brown', 'pink', 'purple', 'orange',
  // Body parts
  'eye', 'eyes', 'hair', 'hand', 'hands', 'foot', 'feet', 'head', 'face', 'body',
  'arm', 'arms', 'leg', 'legs', 'mouth', 'nose', 'ear', 'ears',
  // Common nouns
  'girl', 'boy', 'man', 'woman', 'person', 'people', 'cat', 'dog', 'house', 'car',
  'book', 'water', 'food', 'time', 'day', 'night', 'year', 'month', 'week',
  // Common verbs
  'is', 'are', 'was', 'were', 'have', 'has', 'had', 'do', 'does', 'did',
  'go', 'goes', 'went', 'come', 'comes', 'came', 'get', 'gets', 'got',
  // Booru-specific common terms
  'solo', 'duo', 'group', 'male', 'female', 'rating', 'safe', 'explicit',
  'questionable', 'general', 'sensitive', 'artist', 'character', 'copyright',
  'meta', 'tag', 'tags', 'post', 'posts', 'image', 'images', 'anime', 'manga'
]);

// Note: Removed unused ENGLISH_PATTERNS and TAG_PATTERNS constants
// Pattern matching is now done inline in the respective functions

/**
 * Check if text appears to be in English
 */
export function isLikelyEnglish(text: string): boolean {
  const trimmed = text.trim().toLowerCase();
  
  // First check if it's a single common English word
  if (COMMON_ENGLISH_WORDS.has(trimmed)) {
    return true;
  }
  
  // Check against common English words for multi-word phrases
  const words = trimmed.split(/\s+/);
  if (words.length > 1) {
    const englishWordCount = words.filter(word => COMMON_ENGLISH_WORDS.has(word)).length;
    // If more than 50% of words are common English words, consider it English
    if (englishWordCount / words.length > 0.5) {
      return true;
    }
  }
  
  // Check against specific English patterns (but not the generic ASCII pattern)
  const specificEnglishPatterns = [
    /\b(the|and|or|in|on|at|by|for|with|from|to|of)\b/i, // Common English words
    /\b(is|are|was|were|have|has|had|do|does|did)\b/i, // Common English verbs
  ];
  
  return specificEnglishPatterns.some(pattern => pattern.test(trimmed));
}

/**
 * Check if text looks like a tag
 */
export function isLikelyTag(text: string): boolean {
  const trimmed = text.trim();
  
  // More specific tag patterns - avoid false positives for regular words
  const specificTagPatterns = [
    /^\d+[a-zA-Z]+$/, // Numbers followed by letters (1girl, 2boys, etc.)
    /^[a-zA-Z]+_[a-zA-Z0-9_]+$/, // Words connected with underscores (red_hair, long_hair)
    /_\([^)]+\)$/, // Tags with parentheses (character_(series))
    /^[a-zA-Z0-9_]+_[a-zA-Z0-9_]+_[a-zA-Z0-9_]+$/, // Multiple underscores (very_long_hair)
  ];
  
  return specificTagPatterns.some(pattern => pattern.test(trimmed));
}

/**
 * Check if text is only numbers
 */
export function isOnlyNumbers(text: string): boolean {
  return /^\d+$/.test(text.trim());
}

/**
 * Check if text is too short to be worth translating
 */
export function isTooShort(text: string, minLength: number = 3): boolean {
  return text.trim().length < minLength;
}

/**
 * Check if text contains only special characters or symbols
 */
export function isOnlySymbols(text: string): boolean {
  return /^[^a-zA-Z0-9\u00C0-\u017F\u0400-\u04FF\u4e00-\u9fff\u3040-\u309f\u30a0-\u30ff]+$/.test(text.trim());
}

/**
 * Check if text is a common abbreviation or acronym
 */
export function isCommonAbbreviation(text: string): boolean {
  const trimmed = text.trim().toUpperCase();
  const commonAbbreviations = new Set([
    'OK', 'LOL', 'OMG', 'WTF', 'BRB', 'ASAP', 'FAQ', 'DIY', 'CEO', 'USA', 'UK',
    'TV', 'PC', 'AI', 'API', 'URL', 'HTML', 'CSS', 'JS', 'PHP', 'SQL', 'XML',
    'HTTP', 'HTTPS', 'FTP', 'SSH', 'VPN', 'DNS', 'IP', 'TCP', 'UDP', 'OS'
  ]);
  
  return commonAbbreviations.has(trimmed);
}

/**
 * Main filter function to determine if text should be translated
 */
export function shouldTranslate(
  text: string,
  options: {
    minLength?: number;
    skipEnglish?: boolean;
    skipTags?: boolean;
    skipNumbers?: boolean;
    skipSymbols?: boolean;
    skipAbbreviations?: boolean;
  } = {}
): boolean {
  const {
    minLength = 3,
    skipEnglish = true,
    skipTags = true,
    skipNumbers = true,
    skipSymbols = true,
    skipAbbreviations = true
  } = options;
  
  const trimmed = text.trim();
  
  // Empty or too short
  if (!trimmed || isTooShort(trimmed, minLength)) {
    return false;
  }
  
  // Only numbers
  if (skipNumbers && isOnlyNumbers(trimmed)) {
    return false;
  }
  
  // Only symbols
  if (skipSymbols && isOnlySymbols(trimmed)) {
    return false;
  }
  
  // Common abbreviations
  if (skipAbbreviations && isCommonAbbreviation(trimmed)) {
    return false;
  }
  
  // Tag-like patterns
  const isTag = isLikelyTag(trimmed);
  if (skipTags && isTag) {
    return false;
  }
  
  // English text
  const isEnglish = isLikelyEnglish(trimmed);
  if (skipEnglish && isEnglish) {
    return false;
  }
  return true;
}

/**
 * Get reason why text should not be translated (for debugging)
 */
export function getSkipReason(text: string): string | null {
  const trimmed = text.trim();
  
  if (!trimmed) return 'empty';
  if (isTooShort(trimmed)) return 'too_short';
  if (isOnlyNumbers(trimmed)) return 'only_numbers';
  if (isOnlySymbols(trimmed)) return 'only_symbols';
  if (isCommonAbbreviation(trimmed)) return 'common_abbreviation';
  if (isLikelyTag(trimmed)) return 'likely_tag';
  if (isLikelyEnglish(trimmed)) return 'likely_english';
  
  return null;
}