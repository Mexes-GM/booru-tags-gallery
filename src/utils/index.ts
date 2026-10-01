/**
 * Barrel exports for commonly used utilities.
 * Only re-export what is actually consumed through '../utils'.
 */

export { getCategoryClass, getCategoryLabel } from './categoryUtils';
export { highlightShortMatch, highlightSearchMatch } from './highlightUtils';
export { formatPostCount } from './formatUtils';
export { normalizeForComparison, normalize } from './stringUtils';
export { copyToClipboard } from './copyUtils';
export { showCopyFeedbackBubble } from './copyFeedbackBubble';
export { formatDTextAdvanced, extractExamplePosts } from './dtextFormatter';
export { tagSearchWorker } from './workerUtils';
export { IMAGE_MODAL_EVENT, type ImageClickEvent } from './imageLinkHandler';
