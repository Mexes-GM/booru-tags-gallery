/// <reference types="vite/client" />

export {};

declare global {
  // Extend the Window interface
  interface Window {
    tagSearchWorker?: Worker;
  }

  // Base types for worker messages
  interface WorkerMessage<T = unknown> {
    type: string;
    payload?: T;
    requestId?: string;
  }

  // Specific message types for the worker
  type WorkerMessageType = 
    | 'INIT'
    | 'SEARCH_TAGS'
    | 'GET_SUGGESTIONS'
    | 'GET_STATS'
    | 'FIND_EXACT_TAG'
    | 'GET_RELATED_TAGS'
    | 'GET_POPULAR_TAGS'
    | 'GET_SYNONYM'
    | 'SET_RANKING_WEIGHTS'
    // Light lookups (main thread never parses tags.json itself)
    | 'GET_TAGS_BY_NAMES'   // { names: string[] } -> (tag | null)[]
    | 'GET_CATEGORIES'      // { names: string[] } -> number[] (-1 = unknown)
    | 'GET_TAGS_COMPACT';   // full list as joined strings + transferable typed arrays

  interface WorkerRequest<T = unknown> extends WorkerMessage<T> {
    type: WorkerMessageType;
  }

  // Worker response types
  interface WorkerResponse<T = unknown> {
    type: string;
    payload: T;
    requestId?: string;
  }

  // Tag data types
  interface LocalTagData {
    id: number;
    name: string;
    category: string;
    postCount: number;
    displayName?: string;
    aliases?: string[];
    searchText?: string;
  }

  // Category statistics
  interface CategoryStats {
    [key: string]: number;
  }

  // Search worker interface
  interface TagSearchWorker {
    postMessage<T>(type: string, payload?: unknown): Promise<T>;
    searchTags(term: string, category: string, limit?: number): Promise<LocalTagData[]>;
    getSuggestions(term: string, category: string, limit?: number): Promise<LocalTagData[]>;
    findExactTag(term: string): Promise<LocalTagData | null>;
    getRelatedTags(term: string, limit?: number): Promise<LocalTagData[]>;
    getPopularTags(category?: string, limit?: number): Promise<LocalTagData[]>;
    getCategoryStats(): Promise<CategoryStats>;
    getSynonymForTerm(term: string): Promise<string>;
    expandSearchTerm(term: string): Promise<string[]>;
  }
}