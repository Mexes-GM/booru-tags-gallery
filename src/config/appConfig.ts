interface AppConfig {
  useLocalData: boolean;
  useDanbooruApi: boolean;
  preferredAspectRatio: string;
  maxSearchResults: number;
  maxSuggestions: number;
  maxRelatedTags: number;
  apiRateLimit: {
    requestsPerSecond: number;
    burstPoolSize: number;
  };
  cache: {
    imageUrls: {
      maxAge: number;
      maxEntries: number;
    };
    wikiPages: {
      maxAge: number;
      maxEntries: number;
    };
    tagDetails: {
      maxAge: number;
      maxEntries: number;
    };
  };
}

interface CategoryMapping {
  [key: string]: number | null;
}

interface CategoryNames {
  [key: number]: string;
}

interface CategoryColors {
  [key: number]: string;
  default: string;
}

interface DanbooruEndpoints {
  base: string;
  tags: string;
  posts: string;
  wikiPages: string;
  artists: string;
  relatedTags: string;
}

interface DataStrategy {
  search: string;
  images: string;
  tagDetails: string;
  posts: string;
  artists: string;
}

interface AspectRatio {
  name: string;
  description: string;
  cardHeight: string;
  aspectClass: string;
}

interface AspectRatios {
  [key: string]: AspectRatio;
}

export const APP_CONFIG: AppConfig = {
  useLocalData: true,
  useDanbooruApi: true,
  preferredAspectRatio: '9:16',
  maxSearchResults: 100,
  maxSuggestions: 8,
  maxRelatedTags: 20,
  apiRateLimit: {
    requestsPerSecond: 10,
    burstPoolSize: 5
  },
  cache: {
    imageUrls: {
      maxAge: 1000 * 60 * 30,
      maxEntries: 500
    },
    wikiPages: {
      maxAge: 1000 * 60 * 60,
      maxEntries: 100
    },
    tagDetails: {
      maxAge: 1000 * 60 * 60 * 24,
      maxEntries: 1000
    }
  }
}

export const CATEGORY_MAPPING: CategoryMapping = {
  'all': null,
  'general': 0,
  'artist': 1,
  'copyright': 3,
  'character': 4,
  'meta': 5
}

export const CATEGORY_NAMES: CategoryNames = {
  0: 'General',
  1: 'Artista',
  3: 'Copyright',
  4: 'Personaje',
  5: 'Meta'
}

export const CATEGORY_COLORS: CategoryColors = {
  0: 'cat-badge cat-general',
  1: 'cat-badge cat-artist',
  3: 'cat-badge cat-copyright',
  4: 'cat-badge cat-character',
  5: 'cat-badge cat-meta',
  default: 'cat-badge cat-default'
}

export const DANBOORU_ENDPOINTS: DanbooruEndpoints = {
  base: 'https://danbooru.donmai.us',
  tags: '/tags.json',
  posts: '/posts.json',
  wikiPages: '/wiki_pages.json',
  artists: '/artists.json',
  relatedTags: '/related_tag.json'
}

export const DATA_STRATEGY: DataStrategy = {
  search: 'local',
  images: 'api',
  tagDetails: 'hybrid',
  posts: 'api',
  artists: 'api'
}

export const ASPECT_RATIOS: AspectRatios = {
  '9:16': {
    name: 'Vertical (9:16)',
    description: 'Formato vertical ideal para móviles',
    cardHeight: 'h-80',
    aspectClass: 'aspect-[9/16]'
  },
  '16:9': {
    name: 'Horizontal (16:9)',
    description: 'Formato horizontal estándar',
    cardHeight: 'h-48',
    aspectClass: 'aspect-[16/9]'
  },
  '1:1': {
    name: 'Cuadrado (1:1)',
    description: 'Formato cuadrado',
    cardHeight: 'h-64',
    aspectClass: 'aspect-square'
  }
}