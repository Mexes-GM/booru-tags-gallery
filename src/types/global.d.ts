// Declaraciones de tipos para archivos JavaScript que aún no han sido migrados
declare module '*.js' {
  const content: any;
  export default content;
}

declare module '*.jsx' {
  const content: any;
  export default content;
}

// Declaraciones para archivos de datos JSON
declare module '*.json' {
  const content: any;
  export default content;
}

// Declaraciones para archivos CSS
declare module '*.css' {
  const content: { [className: string]: string };
  export default content;
}

// Declaraciones para archivos de imagen
declare module '*.png' {
  const content: string;
  export default content;
}

declare module '*.jpg' {
  const content: string;
  export default content;
}

declare module '*.jpeg' {
  const content: string;
  export default content;
}

declare module '*.gif' {
  const content: string;
  export default content;
}

declare module '*.svg' {
  const content: string;
  export default content;
}

// Declaraciones para archivos de configuración
declare module '../config/performanceConfig' {
  export const PERFORMANCE_CONFIG: any;
  export const scheduleIdleWork: (callback: () => void) => void;
}

// Declaraciones para servicios
declare module '../services/danbooruApi' {
  import { DanbooruTag, DanbooruPost, DanbooruWikiPage, SearchParams, PostSearchParams, WikiSearchParams, CacheStats } from '../types';
  
  interface DanbooruApiService {
    searchTags(params?: SearchParams): Promise<DanbooruTag[]>;
    getTags(tagNames: string[]): Promise<DanbooruTag[]>;
    getTag(tagName: string): Promise<DanbooruTag | null>;
    searchWikiPages(params?: WikiSearchParams): Promise<DanbooruWikiPage[]>;
    searchPosts(params?: PostSearchParams): Promise<DanbooruPost[]>;
    getPostsForTag(tagName: string, limit?: number, order?: string): Promise<DanbooruPost[]>;
    getTagPreviewImage(tagName: string, preferredRatio?: number | null, element?: HTMLElement | null, priority?: number, filteredTagName?: string | null): Promise<string | null>;
    getTagWikiInfo(tagName: string): Promise<DanbooruWikiPage | null>;
    getWikiExamplePreview(tagName: string, rotationIndex?: number, searchParams?: Record<string, any>): Promise<string | null>;
    clearFilterChangeCache(): void;
    getWikiPageManager(): any;
    getWikiPageCacheStats(): CacheStats;
  }
  
  const danbooruApi: DanbooruApiService;
  export default danbooruApi;
}

// Declaraciones para hooks
declare module '../hooks/useAspectRatio' {
  export function useAspectRatio(): {
    aspectRatio: string;
    setAspectRatio: (ratio: string) => void;
  };
}

// Declaraciones para utilidades
declare module '../utils/dtextFormatter' {
  export const extractFirstParagraph: (dtext: string) => string;
  export const formatDTextSafe: (dtext: string) => string;
  export const extractExamplePosts: (dtext: string) => number[];
  export const extractCategorizedExamplePosts: (dtext: string) => { [key: string]: number[] };
}

declare module '../utils/cacheUtils' {
  export const clearCache: () => void;
  export const getCacheStats: () => any;
}

// Declaraciones para componentes
declare module '../components/HomePage' {
  import React from 'react';
  const HomePage: React.FC;
  export default HomePage;
}

declare module '../components/TagDetailPage' {
  import React from 'react';
  const TagDetailPage: React.FC;
  export default TagDetailPage;
}

declare module '../components/TagCard' {
  import React from 'react';
  import { TagCardProps } from '../types';
  const TagCard: React.FC<TagCardProps>;
  export default TagCard;
}

declare module '../components/NSFWFilterToggle' {
  import React from 'react';
  const NSFWFilterToggle: React.FC;
  export default NSFWFilterToggle;
}

declare module '../components/SearchInfo' {
  import React from 'react';
  import { SearchInfoProps } from '../types';
  const SearchInfo: React.FC<SearchInfoProps>;
  export default SearchInfo;
}

declare module '../components/ApiStatusIndicator' {
  import React from 'react';
  import { ApiStatusIndicatorProps } from '../types';
  const ApiStatusIndicator: React.FC<ApiStatusIndicatorProps>;
  export default ApiStatusIndicator;
}

declare module '../components/DTextTest' {
  import React from 'react';
  const DTextTest: React.FC;
  export default DTextTest;
}

declare module '../components/WikiCacheTest' {
  import React from 'react';
  const WikiCacheTest: React.FC;
  export default WikiCacheTest;
}

declare module '../components/NSFWTest' {
  import React from 'react';
  const NSFWTest: React.FC;
  export default NSFWTest;
} 