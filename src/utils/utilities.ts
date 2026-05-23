/**
 * Utility functions for DText formatting
 */

import { DTextConfig } from './config';

// Memoization utility
export function memoize<T extends (...args: any[]) => any>(fn: T): T {
  const cache = new Map();
  return ((...args: any[]) => {
    const key = JSON.stringify(args);
    if (cache.has(key)) {
      return cache.get(key);
    }
    const result = fn(...args);
    cache.set(key, result);
    return result;
  }) as T;
}

// Generate unique link marker
export function generateLinkMarker(): string {
  return `__LINK_${Math.random().toString(36).substr(2, 9)}__`;
}

// Create safe external link
export function createSafeLink(url: string, text?: string): string {
  const displayText = text || url;
  const safeUrl = escapeHtml(url);
  const safeText = escapeHtml(displayText);
  
  // Validate URL
  if (!isValidUrl(url)) {
    return safeText;
  }
  
  return `<a href="${safeUrl}" class="${DTextConfig.CSS_CLASSES.EXTERNAL_LINK}" target="_blank" rel="noopener noreferrer">${safeText}</a>`;
}

// Create tag link
export function createTagLink(tagName: string, displayText?: string): string {
  const cleanTag = tagName.trim().toLowerCase().replace(/\s+/g, '_');
  const display = displayText || tagName;
  const safeDisplay = escapeHtml(display);
  
  return `<a href="/tags/${encodeURIComponent(cleanTag)}" class="${DTextConfig.CSS_CLASSES.TAG_LINK}">${safeDisplay}</a>`;
}

// Create wiki link
export function createWikiLink(pageName: string, displayText?: string): string {
  const cleanPage = pageName.trim().replace(/\s+/g, '_');
  const display = displayText || pageName;
  const safeDisplay = escapeHtml(display);
  
  return `<a href="/wiki/${encodeURIComponent(cleanPage)}" class="${DTextConfig.CSS_CLASSES.WIKI_LINK}">${safeDisplay}</a>`;
}

// Create user mention link
export function createUserMention(username: string): string {
  const safeUsername = escapeHtml(username);
  return `<a href="/users/${encodeURIComponent(username)}" class="${DTextConfig.CSS_CLASSES.USER_MENTION}">@${safeUsername}</a>`;
}

// Validate string input
export function validateStringInput(input: any): string {
  if (typeof input !== 'string') {
    return '';
  }
  return input;
}

// Sanitize unclosed tags
export function sanitizeUnclosedTags(text: string): string {
  const openTags: string[] = [];
  const tagPattern = /<\/?([a-zA-Z][a-zA-Z0-9]*)\b[^>]*>/g;
  let match;
  
  while ((match = tagPattern.exec(text)) !== null) {
    const tagName = match[1].toLowerCase();
    const isClosing = match[0].startsWith('</');
    
    if (isClosing) {
      const lastOpenIndex = openTags.lastIndexOf(tagName);
      if (lastOpenIndex !== -1) {
        openTags.splice(lastOpenIndex, 1);
      }
    } else {
      // Self-closing tags don't need to be tracked
      if (!match[0].endsWith('/>')) {
        openTags.push(tagName);
      }
    }
  }
  
  // Close any remaining open tags
  let result = text;
  for (let i = openTags.length - 1; i >= 0; i--) {
    result += `</${openTags[i]}>`;
  }
  
  return result;
}

// Process numbered references
export function processNumberedReferences(text: string): string {
  return text.replace(/\[(\d+)\]/g, '<sup class="text-xs text-blue-600">[$1]</sup>');
}

// Process tables
export function processTables(text: string): string {
  return text.replace(/\[table\]([\s\S]*?)\[\/table\]/gi, (_, content) => {
    const rows = content.trim().split('\n').filter((row: string) => row.trim());
    if (rows.length === 0) return '';
    
    const tableRows = rows.map((row: string) => {
      const cells = row.split('|').map((cell: string) => cell.trim());
      const cellElements = cells.map((cell: string) => `<td class="border border-gray-300 px-2 py-1">${escapeHtml(cell)}</td>`).join('');
      return `<tr>${cellElements}</tr>`;
    }).join('');
    
    return `<table class="border-collapse border border-gray-300 my-2">${tableRows}</table>`;
  });
}

// Process special sections
export function processSpecialSections(text: string): string {
  // Remove unwanted sections like "Examples", "See also", "External links"
  return text.replace(/^(Examples?|See also|External links?)\s*$/gmi, '')
             .replace(/\n\s*\n\s*\n/g, '\n\n'); // Clean up extra line breaks
}

// Normalize whitespace
export function normalizeWhitespace(text: string): string {
  return text
    .replace(/\r\n/g, '\n') // Normalize line endings
    .replace(/\r/g, '\n')   // Handle old Mac line endings
    .replace(/\t/g, '    ') // Convert tabs to spaces
    .replace(/[ \t]+$/gm, '') // Remove trailing whitespace
    .replace(/\n{3,}/g, '\n\n') // Limit consecutive line breaks
    .trim();
}

// Escape HTML entities
export function escapeHtml(text: string): string {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

// Smart truncate with word boundaries
export function smartTruncate(text: string, maxLength: number = DTextConfig.MAX_EXTRACT_LENGTH): string {
  if (text.length <= maxLength) {
    return text;
  }
  
  const truncated = text.substring(0, maxLength);
  const lastSpaceIndex = truncated.lastIndexOf(' ');
  
  // If we found a space and it's not too far back, truncate at the space
  if (lastSpaceIndex > maxLength * DTextConfig.LAST_SPACE_RATIO) {
    return truncated.substring(0, lastSpaceIndex) + '...';
  }
  
  return truncated + '...';
}

// Validate URL
export function isValidUrl(url: string): boolean {
  try {
    const urlObj = new URL(url);
    return urlObj.protocol === 'http:' || urlObj.protocol === 'https:';
  } catch {
    return false;
  }
}

// Extract text content from HTML
export function extractTextContent(html: string): string {
  const div = document.createElement('div');
  div.innerHTML = html;
  return div.textContent || div.innerText || '';
}

// Generate post embed HTML
export function generatePostEmbed(postId: number, imageUrl?: string): string {
  const embedClass = DTextConfig.CSS_CLASSES.MEDIA_EMBED;
  const imageClass = DTextConfig.CSS_CLASSES.MEDIA_IMAGE;
  const captionClass = DTextConfig.CSS_CLASSES.MEDIA_CAPTION;
  
  if (imageUrl) {
    return `
      <div class="${embedClass} border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden">
        <div class="${imageClass}">
          <img src="${escapeHtml(imageUrl)}" alt="Post #${postId}" class="max-w-full max-h-64 object-contain" loading="lazy" />
        </div>
        <div class="${captionClass}">
          <a href="/posts/${postId}" class="${DTextConfig.CSS_CLASSES.LINK}">Post #${postId}</a>
        </div>
      </div>
    `;
  }
  
  return `<a href="/posts/${postId}" class="${DTextConfig.CSS_CLASSES.LINK}">Post #${postId}</a>`;
}

// Generate request tag HTML
export function generateRequestTag(type: string, id: number): string {
  const requestConfig = DTextConfig.REQUEST_TAGS[type as keyof typeof DTextConfig.REQUEST_TAGS];
  if (!requestConfig) {
    return `${type} #${id}`;
  }
  
  const baseClass = DTextConfig.CSS_CLASSES.TAG_REQUEST;
  const typeClass = requestConfig.class;
  
  return `<a href="/${type}s/${id}" class="${baseClass} ${typeClass}">${requestConfig.label} #${id}</a>`;
}



// CutPoint interface for text truncation
export interface CutPoint {
  pattern: RegExp;
  preference: number;
}

// Process expand blocks in DText
export const processExpandBlocks = (html: string): string => {
  return html.replace(/\[expand(=([^\]]+))?\]([\s\S]*?)\[\/expand\]/gi, (_m, _eq, title, inner) => {
    const safeTitle = title ? escapeHtml(title.trim()) : 'Expand';
    const safeInner = inner ? inner.trim() : '';
    return `<details class="my-2 border border-gray-200 dark:border-gray-700 rounded-lg">
      <summary class="cursor-pointer p-3 bg-gray-50 dark:bg-gray-800 hover:bg-gray-100 dark:hover:bg-gray-700 font-medium">${safeTitle}</summary>
      <div class="p-3">${safeInner}</div>
    </details>`;
  });
};