/**
 * Request Queue Manager
 * Limits concurrent requests to prevent AWS Lambda concurrency issues
 */

interface QueuedRequest {
  execute: () => Promise<any>;
  resolve: (value: any) => void;
  reject: (error: any) => void;
}

class RequestQueue {
  private queue: QueuedRequest[] = [];
  private activeRequests = 0;
  private maxConcurrent: number;

  constructor(maxConcurrent: number = 5) {
    this.maxConcurrent = maxConcurrent;
  }

  async add<T>(requestFn: () => Promise<T>): Promise<T> {
    return new Promise((resolve, reject) => {
      this.queue.push({
        execute: requestFn,
        resolve,
        reject
      });
      this.processQueue();
    });
  }

  private async processQueue() {
    // If we're at max capacity or queue is empty, don't process
    if (this.activeRequests >= this.maxConcurrent || this.queue.length === 0) {
      return;
    }

    const request = this.queue.shift();
    if (!request) return;

    this.activeRequests++;

    try {
      const result = await request.execute();
      request.resolve(result);
    } catch (error) {
      request.reject(error);
    } finally {
      this.activeRequests--;
      // Process next item in queue
      this.processQueue();
    }
  }

  getQueueLength(): number {
    return this.queue.length;
  }

  getActiveRequests(): number {
    return this.activeRequests;
  }
}

// Create a singleton instance
// Set to 5 to leave headroom (account limit is 10)
export const requestQueue = new RequestQueue(5);

/**
 * Wrapper for API calls that need concurrency limiting
 */
export async function queuedRequest<T>(requestFn: () => Promise<T>): Promise<T> {
  return requestQueue.add(requestFn);
}
