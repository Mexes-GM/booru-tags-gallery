type MessageHandler<T = unknown> = (data: T) => void;

/**
 * Manages communication with a Web Worker, handling request-response cycles and event subscriptions.
 */
export class WorkerManager<T = unknown> {
  private worker: Worker;
  private messageHandlers: Map<string, Set<MessageHandler>> = new Map();
  private requestCounter = 0;
  private pendingRequests: Map<string, { resolve: (data: T) => void; reject: (error: Error) => void }> = new Map();

  /**
   * @param worker The worker instance to manage.
   */
  constructor(worker: Worker) {
    this.worker = worker;
    this.worker.onmessage = this.handleMessage.bind(this);
    this.worker.onerror = this.handleError.bind(this);
  }

  private handleMessage(event: MessageEvent<WorkerMessage<T>>) {
    const { type, payload, requestId } = event.data;

    // Handle responses to specific requests
    if (requestId && this.pendingRequests.has(requestId)) {
      const pending = this.pendingRequests.get(requestId)!;
      this.pendingRequests.delete(requestId);
      if (type === 'ERROR') {
        const info = payload as unknown as { message?: string; error?: string } | undefined;
        pending.reject(new Error([info?.message, info?.error].filter(Boolean).join(': ') || 'Worker error'));
      } else {
        pending.resolve(payload as T);
      }
      return;
    }

    // Handle broadcast messages
    const handlers = this.messageHandlers.get(type);
    if (handlers) {
      handlers.forEach(handler => handler(payload as T));
    }
  }

  private handleError(event: ErrorEvent) {
    const handlers = this.messageHandlers.get('error');
    if (handlers) {
      handlers.forEach(handler => handler(event as unknown as T));
    }
  }

  /**
   * Posts a message to the worker and returns a Promise that resolves with the response.
   * @param type The message type/command for the worker.
   * @param payload The data to send to the worker.
   * @param transfer An array of Transferable objects to transfer ownership of.
   * @returns A Promise that resolves with the worker's response.
   */
  public postMessage<K = T>(
    type: string, 
    payload?: unknown,
    transfer: Transferable[] = []
  ): Promise<K> {
    const requestId = `req_${this.requestCounter++}`;
    
    return new Promise<K>((resolve, reject) => {
      // Generous timeout: the first request waits for tags.json to download in the worker.
      const timeoutId = setTimeout(() => {
        this.pendingRequests.delete(requestId);
        reject(new Error(`Worker request timed out after 60s for type '${type}'`));
      }, 60000);

      this.pendingRequests.set(requestId, {
        resolve: (data: T) => {
          clearTimeout(timeoutId);
          resolve(data as unknown as K);
        },
        reject: (error: Error) => {
          clearTimeout(timeoutId);
          reject(error);
        }
      });
      
      try {
        this.worker.postMessage({ type, payload, requestId }, transfer);
      } catch (error) {
        this.pendingRequests.delete(requestId);
        clearTimeout(timeoutId);
        reject(error);
      }
    });
  }

  /**
   * Subscribes to a specific type of message from the worker.
   * @param type The message type to listen for.
   * @param handler The callback function to execute when the message is received.
   * @returns A function to unsubscribe the handler.
   */
  public on<K = T>(type: string, handler: MessageHandler<K>): () => void {
    if (!this.messageHandlers.has(type)) {
      this.messageHandlers.set(type, new Set());
    }
    
    const handlers = this.messageHandlers.get(type)!;
    handlers.add(handler as MessageHandler<unknown>);
    
    return () => {
      handlers.delete(handler as MessageHandler<unknown>);
    };
  }

  /**
   * Terminates the worker and cleans up pending requests.
   */
  public terminate() {
    this.worker.terminate();
    this.messageHandlers.clear();
    
    this.pendingRequests.forEach(pending => pending.reject(new Error('Worker terminated')));
    this.pendingRequests.clear();
  }

  /**
   * Convenience method to search for tags.
   * @param term The search term.
   * @param category The category to search in.
   * @param limit The max number of results.
   * @returns A promise that resolves with an array of tags.
   */
  public async searchTags(term: string, category: string, limit = 50): Promise<T[]> {
    return this.postMessage<T[]>('SEARCH_TAGS', { term, category, limit });
  }

  /**
   * Convenience method to get search suggestions.
   * @param term The search term.
   * @param category The category to search in.
   * @param limit The max number of results.
   * @returns A promise that resolves with an array of suggested tags.
   */
  public async getSuggestions(term: string, category: string, limit = 5): Promise<T[]> {
    return this.postMessage<T[]>('GET_SUGGESTIONS', { term, category, limit });
  }
}

// Create and export a singleton instance of the worker manager
export const createTagSearchWorker = (): Worker => {
  if (import.meta.env.DEV) {
    return new Worker(new URL('@/workers/tagSearch.worker.ts', import.meta.url), {
      type: 'module'
    });
  }
  return new Worker(new URL('@/workers/tagSearch.worker.js', import.meta.url), {
    type: 'module'
  });
};

export const tagSearchWorker = new WorkerManager(createTagSearchWorker());

tagSearchWorker.postMessage('INIT').catch(() => {
  // Silently handle worker initialization error
});

if (typeof window !== 'undefined') {
  window.addEventListener('beforeunload', () => {
    tagSearchWorker.terminate();
  });
}

// Local type definition to avoid circular dependencies
type WorkerMessage<T = unknown> = {
  type: string;
  payload?: T;
  requestId?: string;
};