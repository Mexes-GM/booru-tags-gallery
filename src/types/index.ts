// Tipos para la API de Danbooru
export interface DanbooruTag {
  id: number;
  name: string;
  category: number;
  post_count: number;
  created_at: string;
  updated_at: string;
  is_deprecated: boolean;
  is_locked: boolean;
  version: number;
  words: string[];
}

export interface DanbooruPost {
  id: number;
  tag_string: string;
  tag_string_general: string;
  tag_string_artist: string;
  tag_string_copyright: string;
  tag_string_character: string;
  tag_string_meta: string;
  rating: string;
  score: number;
  preview_file_url: string;
  large_file_url?: string;
  file_url?: string;
  image_width?: number;
  image_height?: number;
  created_at: string;
  updated_at: string;
  file_ext: string;
  file_size: number;
  up_score: number;
  down_score: number;
  fav_count: number;
  source?: string;
  uploader_name?: string;
  is_rating_locked: boolean;
  is_note_locked: boolean;
  is_status_locked: boolean;
  is_pending: boolean;
  is_flagged: boolean;
  is_deleted: boolean;
  uploader_id: number;
  approver_id: number | null;
  parent_id: number | null;
  has_children: boolean;
  has_active_children: boolean;
  is_b_favorited: boolean;
  has_visible_children: boolean;
  bit_flags: number;
  tag_count_general: number;
  tag_count_artist: number;
  tag_count_character: number;
  tag_count_copyright: number;
  tag_count_meta: number;
  media_asset: {
    id: number;
    file_key: string;
    file_ext: string;
    file_size: number;
    image_width: number;
    image_height: number;
    duration: number | null;
  };
}

export interface DanbooruWikiPage {
  id: number;
  title: string;
  body: string;
  created_at: string;
  updated_at: string;
  is_deleted: boolean;
  category_name?: string;
  other_names: string[];
  reason: string | null;
  version: number;
}

export interface DanbooruWikiInfo {
  title: string;
  body: string;
  firstParagraph: string;
  formattedFirstParagraph: string;
  categoryName?: string;
  isDeleted: boolean;
  createdAt: string;
  updatedAt: string;
  examplePosts?: number[];
  categorizedExamplePosts?: Record<string, number[]>;
}

export interface DanbooruPreviewImage {
  preview_url: string;
  large_url: string;
  post_id: number;
  rating: string;
  score: number;
  dimensions: { width: number; height: number };
  source: string;
  rotation_index: number;
  total_examples: number;
}

export interface SearchParams {
  search?: {
    name_matches?: string;
    category?: number;
    order?: string;
    hide_empty?: boolean;
  };
  limit?: number;
  page?: number;
  only?: string;
}

export interface PostSearchParams {
  search?: {
    tags?: string;
    rating?: string;
    score?: string;
    file_ext?: string;
    width?: string;
    height?: string;
    order?: string;
  };
  limit?: number;
  page?: number;
  only?: string;
}

export interface WikiSearchParams {
  search?: {
    title_matches?: string;
    body_matches?: string;
    category_name?: string;
  };
  limit?: number;
  page?: number;
  only?: string;
}

// Tipos para el contexto NSFW
export interface NSFWContextType {
  isNSFWFilterEnabled: boolean;
  toggleNSFWFilter: () => void;
  applyFilterToTags: (tags?: string) => string;
  getRatingParams: () => { allowedRatings?: string[] };
  isToggling: boolean;
  resetToggle: () => void;
}

// Tipos para los hooks
export interface UseTagSearchReturn {
  searchTerm: string;
  selectedCategory: string;
  searchResults: LocalTagData[];
  suggestions: LocalTagData[];
  synonymSuggestions: string[];
  isLoading: boolean;
  isTransitioning: boolean;
  setSearchTerm: (term: string) => void;
  setSelectedCategory: (category: string) => void;
  getPopularTags: (limit?: number) => LocalTagData[];
  getCategoryStats: () => { [key: string]: number };
  findExactTag: (tagName: string) => LocalTagData | undefined;
  getRelatedTags: (tagName: string, limit?: number) => LocalTagData[];
  getSynonymForTerm: (term: string) => string;
  expandSearchTerm: (term: string) => string[];
  totalTags: number;
}

export interface UseDanbooruApiReturn {
  searchTags: (params?: SearchParams) => Promise<DanbooruTag[]>;
  getTag: (tagName: string) => Promise<DanbooruTag | null>;
  getPostsForTag: (tagName: string, limit?: number, order?: string) => Promise<DanbooruPost[]>;
  getTagPreviewImage: (tagName: string, preferredRatio?: number | null, element?: HTMLElement | null, priority?: number, filteredTagName?: string | null) => Promise<string | null>;
  getTagWikiInfo: (tagName: string) => Promise<DanbooruWikiPage | null>;
  getWikiExamplePreview: (tagName: string, rotationIndex?: number, searchParams?: Record<string, any>) => Promise<string | null>;
  loading: boolean;
  error: string | null;
}

// Tipos para DeepL Translation
export interface DeepLLanguage {
  language: string;
  name: string;
}

// Tipos para los componentes
export interface TagCardProps {
  tag: DanbooruTag;
  searchTerm?: string;
  isTransitioning?: boolean;
  onTagClick?: (tag: DanbooruTag) => void;
  showPreview?: boolean;
  className?: string;
  translatedTerm?: string;
  lastTranslatedFor?: string;
}

export interface SearchBarProps {
  onSearch: (query: string) => void;
  placeholder?: string;
  className?: string;
}

export interface SearchInfoProps {
  totalResults: number;
  searchTime: number;
  query: string;
}

export interface ApiStatusIndicatorProps {
  status: 'idle' | 'loading' | 'error' | 'success';
  message?: string;
}

// Tipos para utilidades
export interface CacheStats {
  wikiPages: number;
  exampleImages: number;
  pendingRequests: number;
}

export interface RateLimitInfo {
  limit: number;
  remaining: number;
  reset: number;
}

export interface PerformanceStats {
  totalRequests: number;
  averageResponseTime: number;
  cacheHitRate: number;
}

// Tipos para el sistema de cache
export interface CacheEntry<T> {
  data: T;
  timestamp: number;
  ttl: number;
}

export interface ImageLoadRequest {
  tagName: string;
  fetchFunction: () => Promise<string | null>;
  priority: number;
  isVisible: boolean;
  timestamp: number;
}

// Tipos para el formateo de DText
export interface DTextNode {
  type: string;
  content?: string;
  children?: DTextNode[];
  attributes?: Record<string, string>;
}

// Tipos para los datos locales (diferentes a la API de Danbooru)
export interface LocalTagData {
  id: number;
  name: string;
  category: number;
  postCount: number;
  aliases: string[];
  displayName: string;
  searchText: string;
}

// Tipos para las categorías de tags
export interface TagCategory {
  id: number;
  name: string;
  color: string;
  description: string;
}

// Tipos para el sistema de filtros
export interface FilterOptions {
  category?: number;
  rating?: string;
  score?: string;
  fileExt?: string;
  width?: string;
  height?: string;
}

// Tipos para el sistema de búsqueda
export interface SearchResult {
  tags: DanbooruTag[];
  totalCount: number;
  searchTime: number;
  query: string;
}

// Tipos para el sistema de paginación
export interface PaginationInfo {
  currentPage: number;
  totalPages: number;
  totalItems: number;
  itemsPerPage: number;
  hasNextPage: boolean;
  hasPrevPage: boolean;
}

// Tipos para Tag Groups
export interface TagGroupItem {
  id: string; // slug sin el prefijo tag_group:
  title: string; // texto amigable del grupo
  url: string; // URL absoluta
  parents: string[];
  children: string[];
}

export interface TagGroupsFile {
  fetchedAt: string;
  source: string;
  count: number;
  groups: TagGroupItem[];
}