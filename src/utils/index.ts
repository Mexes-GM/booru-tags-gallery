/**
 * Barrel exports para utilidades comunes
 * Consolida imports frecuentemente usados para optimizar tree-shaking
 */

// Category utilities
export { 
  getCategoryClass, 
  getCategoryLabel, 
  getCategoryName, 
  getCategoryColor 
} from './categoryUtils';

// Highlight utilities
export { 
  highlightShortMatch, 
  highlightSearchMatch 
} from './highlightUtils';

// Format utilities
export { 
  formatPostCount 
} from './formatUtils';

// String utilities
export { 
  normalizeForComparison, 
  normalize 
} from './stringUtils';

// Copy utilities
export { 
  copyToClipboard 
} from './copyUtils';

export { 
  showCopyFeedbackBubble 
} from './copyFeedbackBubble';

// DText formatter utilities
export { 
  formatDTextSafe, 
  extractFirstParagraph, 
  formatDTextAdvanced,
  extractExamplePosts,
  extractCategorizedExamplePosts
} from './dtextFormatter';

// Container tag utilities
export { 
  detectContainerTag 
} from './containerTagUtils';

// Worker utilities
export { 
  tagSearchWorker 
} from './workerUtils';

// Image link handler
export { 
  setupImageLinkHandler,
  IMAGE_MODAL_EVENT,
  type ImageClickEvent
} from './imageLinkHandler';