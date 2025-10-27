/**
 * JavaScript Sandbox
 * 
 * Executes JavaScript code in an isolated Web Worker
 */

export class JavaScriptSandbox {
  private worker: Worker | null = null;
  private timeout = 10000; // 10 seconds max

  constructor() {
    // Create inline worker with sandboxed environment
    const workerCode = `
      // Whitelist of safe globals
      const safeGlobals = {
        console,
        Math,
        Date,
        JSON,
        Array,
        Object,
        String,
        Number,
        Boolean,
        Promise,
        setTimeout: (fn, ms) => {
          if (ms > 5000) throw new Error('setTimeout limited to 5 seconds');
          return setTimeout(fn, ms);
        },
        fetch: (url, options) => {
          // Only allow GET requests
          if (options?.method && options.method !== 'GET') {
            throw new Error('Only GET requests allowed');
          }
          return fetch(url, { ...options, method: 'GET' });
        }
      };

      // Message handler
      self.onmessage = async (e) => {
        const { id, code } = e.data;
        
        try {
          // Create function with limited scope
          const fn = new Function(...Object.keys(safeGlobals), code);
          
          // Execute with timeout protection
          const result = await Promise.race([
            fn(...Object.values(safeGlobals)),
            new Promise((_, reject) => 
              setTimeout(() => reject(new Error('Execution timeout')), 5000)
            )
          ]);
          
          // Limit result size
          const resultStr = JSON.stringify(result);
          if (resultStr.length > 10240) { // 10KB
            throw new Error('Result too large (max 10KB)');
          }
          
          self.postMessage({ id, success: true, result });
        } catch (error) {
          self.postMessage({ 
            id, 
            success: false, 
            error: error instanceof Error ? error.message : String(error)
          });
        }
      };
    `;

    const blob = new Blob([workerCode], { type: 'application/javascript' });
    this.worker = new Worker(URL.createObjectURL(blob));
  }

  async execute(code: string): Promise<any> {
    if (!this.worker) {
      throw new Error('Worker not initialized');
    }

    return new Promise((resolve, reject) => {
      const id = Math.random().toString(36);
      const timeout = setTimeout(() => {
        reject(new Error('Execution timeout'));
        this.destroy();
      }, this.timeout);

      const handler = (e: MessageEvent) => {
        if (e.data.id === id) {
          clearTimeout(timeout);
          this.worker?.removeEventListener('message', handler);
          
          if (e.data.success) {
            resolve(e.data.result);
          } else {
            reject(new Error(e.data.error));
          }
        }
      };

      if (!this.worker) {
        reject(new Error('Worker not available'));
        return;
      }

      this.worker.addEventListener('message', handler);
      this.worker.postMessage({ id, code });
    });
  }

  destroy(): void {
    if (this.worker) {
      this.worker.terminate();
      this.worker = null;
    }
  }
}
