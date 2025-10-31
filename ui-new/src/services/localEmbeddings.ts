/**
 * Local Browser-Based Embedding Service
 * 
 * Uses Transformers.js to run embedding models entirely in the browser.
 * Features:
 * - Lazy loading (only loads when needed)
 * - Progress callbacks for model download
 * - Model caching via IndexedDB (automatic with Transformers.js)
 * - WebGPU acceleration when available
 * - Zero API costs, offline capable, no authentication required
 * 
 * Trade-offs vs API embeddings:
 * - Speed: 2-5 seconds vs <1 second
 * - Quality: 384 dimensions vs 1536 dimensions
 * - Privacy: Completely local vs API calls
 * - Cost: Free vs API costs
 */

import { pipeline, env } from '@xenova/transformers';

// Configure Transformers.js
env.allowLocalModels = false; // Use remote models from HuggingFace CDN
env.allowRemoteModels = true;

export interface LoadProgress {
  status: 'loading' | 'ready' | 'error';
  progress: number; // 0-100
  message: string;
}

export class LocalEmbeddingService {
  private pipeline: any = null;
  private currentModel: string | null = null;
  private isLoading: boolean = false;
  private loadPromise: Promise<void> | null = null;

  /**
   * Load a model with optional progress callback
   * @param modelId - HuggingFace model ID (e.g., 'Xenova/all-MiniLM-L6-v2')
   * @param onProgress - Optional callback for load progress updates
   */
  async loadModel(modelId: string, onProgress?: (_loadProgress: LoadProgress) => void): Promise<void> {
    // If already loading this model, return existing promise
    if (this.isLoading && this.currentModel === modelId && this.loadPromise) {
      return this.loadPromise;
    }

    // If model already loaded, return immediately
    if (this.pipeline && this.currentModel === modelId) {
      onProgress?.({ status: 'ready', progress: 100, message: 'Model ready' });
      return Promise.resolve();
    }

    // Start loading
    this.isLoading = true;
    this.currentModel = modelId;

    this.loadPromise = (async () => {
      try {
        onProgress?.({ status: 'loading', progress: 0, message: 'Initializing...' });

        // Create progress callback for Transformers.js
        const progressCallback = (progress: any) => {
          if (progress.status === 'progress' && progress.progress !== undefined) {
            // Transformers.js returns progress as 0-1, convert to 0-100
            const percent = Math.round(progress.progress * 100);
            onProgress?.({
              status: 'loading',
              progress: percent,
              message: `Downloading model... ${percent}%`
            });
          } else if (progress.status === 'ready') {
            onProgress?.({
              status: 'loading',
              progress: 90,
              message: 'Loading into memory...'
            });
          }
        };

        // Load pipeline with progress tracking
        console.log(`🧠 Loading embedding model: ${modelId}`);
        this.pipeline = await pipeline('feature-extraction', modelId, {
          progress_callback: progressCallback,
        });

        console.log(`✅ Model loaded: ${modelId}`);
        onProgress?.({ status: 'ready', progress: 100, message: 'Model ready!' });
      } catch (error) {
        console.error('❌ Failed to load embedding model:', error);
        this.pipeline = null;
        this.currentModel = null;
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        onProgress?.({
          status: 'error',
          progress: 0,
          message: `Failed to load model: ${errorMessage}`
        });
        throw error;
      } finally {
        this.isLoading = false;
      }
    })();

    return this.loadPromise;
  }

  /**
   * Generate embedding for a single text
   * @param text - Input text
   * @returns Array of embedding values
   */
  async generateEmbedding(text: string): Promise<number[]> {
    if (!this.pipeline) {
      throw new Error('Model not loaded. Call loadModel() first.');
    }

    try {
      // Generate embedding
      const output = await this.pipeline(text, {
        pooling: 'mean', // Mean pooling
        normalize: true,  // L2 normalization
      });

      // Extract data from tensor
      // Transformers.js returns a tensor object, need to convert to array
      const embedding = Array.from(output.data) as number[];
      
      return embedding;
    } catch (error) {
      console.error('❌ Failed to generate embedding:', error);
      throw error;
    }
  }

  /**
   * Generate embeddings for multiple texts (batch processing)
   * @param texts - Array of input texts
   * @returns Array of embedding arrays
   */
  async generateEmbeddings(texts: string[]): Promise<number[][]> {
    if (!this.pipeline) {
      throw new Error('Model not loaded. Call loadModel() first.');
    }

    try {
      // Process texts one by one (Transformers.js batching is limited in browser)
      const embeddings: number[][] = [];
      
      for (const text of texts) {
        const embedding = await this.generateEmbedding(text);
        embeddings.push(embedding);
      }
      
      return embeddings;
    } catch (error) {
      console.error('❌ Failed to generate batch embeddings:', error);
      throw error;
    }
  }

  /**
   * Check if a model is currently loaded
   */
  isModelLoaded(): boolean {
    return this.pipeline !== null;
  }

  /**
   * Get the currently loaded model ID
   */
  getCurrentModel(): string | null {
    return this.currentModel;
  }

  /**
   * Unload the current model to free memory
   */
  unloadModel(): void {
    if (this.pipeline) {
      console.log(`🗑️ Unloading model: ${this.currentModel}`);
      this.pipeline = null;
      this.currentModel = null;
      this.loadPromise = null;
    }
  }
}

// Singleton instance
let instance: LocalEmbeddingService | null = null;

/**
 * Get singleton instance of LocalEmbeddingService
 */
export function getLocalEmbeddingService(): LocalEmbeddingService {
  if (!instance) {
    instance = new LocalEmbeddingService();
  }
  return instance;
}
