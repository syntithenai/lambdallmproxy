/**
 * Image Storage Service
 * Stores base64 images separately in IndexedDB with reference URLs
 * Prevents UI lockups by keeping markdown content lightweight
 */

interface ImageMetadata {
  id: string;
  data: string; // base64 data URL
  size: number;
  mimeType: string;
  width?: number;
  height?: number;
  createdAt: number;
}

class ImageStorageService {
  private dbName = 'swag-images';
  private storeName = 'images';
  private db: IDBDatabase | null = null;
  private dbReady: Promise<void>;

  constructor() {
    this.dbReady = this.initDB();
  }

  /**
   * Initialize IndexedDB
   */
  private async initDB(): Promise<void> {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(this.dbName, 1);

      request.onerror = () => {
        console.error('❌ Failed to open IndexedDB:', request.error);
        reject(request.error);
      };

      request.onsuccess = () => {
        this.db = request.result;
        console.log('✅ IndexedDB initialized');
        resolve();
      };

      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result;
        
        // Create object store if it doesn't exist
        if (!db.objectStoreNames.contains(this.storeName)) {
          const objectStore = db.createObjectStore(this.storeName, { keyPath: 'id' });
          objectStore.createIndex('createdAt', 'createdAt', { unique: false });
          console.log('📦 Created IndexedDB object store');
        }
      };
    });
  }

  /**
   * Wait for DB to be ready
   */
  private async ensureReady(): Promise<void> {
    await this.dbReady;
  }

  /**
   * Save image to IndexedDB and return reference URL
   * @param imageData - Base64 data URL (e.g., "data:image/png;base64,...")
   * @returns Reference URL (e.g., "swag-image://img_123456")
   */
  async saveImage(imageData: string): Promise<string> {
    await this.ensureReady();

    if (!this.db) {
      throw new Error('IndexedDB not initialized');
    }

    // Extract metadata from data URL
    const mimeMatch = imageData.match(/data:([^;]+);base64,/);
    const mimeType = mimeMatch ? mimeMatch[1] : 'image/png';
    const size = imageData.length;

    // Generate unique ID
    const id = `img_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    // Get image dimensions if possible
    let width: number | undefined;
    let height: number | undefined;
    try {
      const dimensions = await this.getImageDimensions(imageData);
      width = dimensions.width;
      height = dimensions.height;
    } catch (e) {
      console.warn('Could not extract image dimensions:', e);
    }

    const metadata: ImageMetadata = {
      id,
      data: imageData,
      size,
      mimeType,
      width,
      height,
      createdAt: Date.now()
    };

    // Store in IndexedDB
    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([this.storeName], 'readwrite');
      const objectStore = transaction.objectStore(this.storeName);
      const request = objectStore.put(metadata);

      request.onsuccess = () => {
        console.log(`💾 Saved image: ${id} (${(size / 1024).toFixed(2)} KB)`);
        resolve(`swag-image://${id}`);
      };

      request.onerror = () => {
        console.error('❌ Failed to save image:', request.error);
        reject(request.error);
      };
    });
  }

  /**
   * Update an existing image in IndexedDB
   * @param imageId - The image ID (without swag-image:// prefix)
   * @param imageData - New base64 data URL
   */
  async updateImage(imageId: string, imageData: string): Promise<void> {
    await this.ensureReady();

    if (!this.db) {
      throw new Error('IndexedDB not initialized');
    }

    // Extract metadata from data URL
    const mimeMatch = imageData.match(/data:([^;]+);base64,/);
    const mimeType = mimeMatch ? mimeMatch[1] : 'image/png';
    const size = imageData.length;

    // Get image dimensions if possible
    let width: number | undefined;
    let height: number | undefined;
    try {
      const dimensions = await this.getImageDimensions(imageData);
      width = dimensions.width;
      height = dimensions.height;
    } catch (e) {
      console.warn('Could not extract image dimensions:', e);
    }

    const metadata: ImageMetadata = {
      id: imageId,
      data: imageData,
      size,
      mimeType,
      width,
      height,
      createdAt: Date.now()
    };

    // Update in IndexedDB
    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([this.storeName], 'readwrite');
      const objectStore = transaction.objectStore(this.storeName);
      const request = objectStore.put(metadata);

      request.onsuccess = () => {
        console.log(`💾 Updated image: ${imageId} (${(size / 1024).toFixed(2)} KB)`);
        resolve();
      };

      request.onerror = () => {
        console.error('❌ Failed to update image:', request.error);
        reject(request.error);
      };
    });
  }

  /**
   * Get image data from IndexedDB by reference URL
   * @param refUrl - Reference URL (e.g., "swag-image://img_123456")
   * @returns Base64 data URL
   */
  async getImage(refUrl: string): Promise<string> {
    await this.ensureReady();

    if (!this.db) {
      throw new Error('IndexedDB not initialized');
    }

    const id = refUrl.replace('swag-image://', '');

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([this.storeName], 'readonly');
      const objectStore = transaction.objectStore(this.storeName);
      const request = objectStore.get(id);

      request.onsuccess = () => {
        const metadata = request.result as ImageMetadata | undefined;
        if (metadata) {
          resolve(metadata.data);
        } else {
          console.warn(`⚠️ Image not found: ${id}`);
          reject(new Error(`Image not found: ${id}`));
        }
      };

      request.onerror = () => {
        console.error('❌ Failed to get image:', request.error);
        reject(request.error);
      };
    });
  }

  /**
   * Get image metadata without loading full data
   */
  async getImageMetadata(refUrl: string): Promise<Omit<ImageMetadata, 'data'> | null> {
    await this.ensureReady();

    if (!this.db) {
      return null;
    }

    const id = refUrl.replace('swag-image://', '');

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([this.storeName], 'readonly');
      const objectStore = transaction.objectStore(this.storeName);
      const request = objectStore.get(id);

      request.onsuccess = () => {
        const metadata = request.result as ImageMetadata | undefined;
        if (metadata) {
          const { data, ...rest } = metadata;
          resolve(rest);
        } else {
          resolve(null);
        }
      };

      request.onerror = () => {
        reject(request.error);
      };
    });
  }

  /**
   * Delete image from IndexedDB
   */
  async deleteImage(refUrl: string): Promise<void> {
    await this.ensureReady();

    if (!this.db) {
      throw new Error('IndexedDB not initialized');
    }

    const id = refUrl.replace('swag-image://', '');

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([this.storeName], 'readwrite');
      const objectStore = transaction.objectStore(this.storeName);
      const request = objectStore.delete(id);

      request.onsuccess = () => {
        console.log(`🗑️ Deleted image: ${id}`);
        resolve();
      };

      request.onerror = () => {
        console.error('❌ Failed to delete image:', request.error);
        reject(request.error);
      };
    });
  }

  /**
   * Get all stored images
   */
  async getAllImages(): Promise<ImageMetadata[]> {
    await this.ensureReady();

    if (!this.db) {
      return [];
    }

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([this.storeName], 'readonly');
      const objectStore = transaction.objectStore(this.storeName);
      const request = objectStore.getAll();

      request.onsuccess = () => {
        resolve(request.result as ImageMetadata[]);
      };

      request.onerror = () => {
        reject(request.error);
      };
    });
  }

  /**
   * Get total storage size
   */
  async getStorageSize(): Promise<number> {
    const images = await this.getAllImages();
    return images.reduce((total, img) => total + img.size, 0);
  }

  /**
   * Clear all images (use with caution!)
   */
  async clearAll(): Promise<void> {
    await this.ensureReady();

    if (!this.db) {
      throw new Error('IndexedDB not initialized');
    }

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([this.storeName], 'readwrite');
      const objectStore = transaction.objectStore(this.storeName);
      const request = objectStore.clear();

      request.onsuccess = () => {
        console.log('🗑️ Cleared all images');
        resolve();
      };

      request.onerror = () => {
        reject(request.error);
      };
    });
  }

  /**
   * Get image dimensions from base64 data URL
   */
  private getImageDimensions(dataUrl: string): Promise<{ width: number; height: number }> {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => {
        resolve({ width: img.width, height: img.height });
      };
      img.onerror = reject;
      img.src = dataUrl;
    });
  }

  /**
   * Process snippet content: Extract base64 images and replace with references
   * @param content - Original content with base64 images
   * @returns Processed content with reference URLs
   */
  async processContentForSave(content: string): Promise<string> {
    // Match all base64 data URLs (in markdown and HTML)
    const base64Regex = /(data:image\/[^;]+;base64,[A-Za-z0-9+/=]+)/g;
    const matches = content.match(base64Regex) || [];

    if (matches.length === 0) {
      return content; // No images to process
    }

    console.log(`📦 Processing ${matches.length} images for storage...`);
    const firstMatch = matches[0];
    if (firstMatch) {
      console.log(`📦 First image preview:`, firstMatch.substring(0, 100) + '...');
    }

    let processedContent = content;
    const uniqueMatches = [...new Set(matches)]; // Deduplicate

    // Process images sequentially to avoid race conditions
    for (const base64 of uniqueMatches) {
      try {
        console.log(`📦 Saving image (${(base64.length / 1024).toFixed(1)} KB)...`);
        const imageRef = await this.saveImage(base64);
        console.log(`✅ Saved as: ${imageRef}`);
        // Replace all occurrences of this base64 string
        processedContent = processedContent.split(base64).join(imageRef);
      } catch (error) {
        console.error('Failed to save image, keeping original:', error);
        // Keep original base64 if save fails
      }
    }

    return processedContent;
  }

  /**
   * Process snippet content: Replace image references with base64 data
   * @param content - Content with image references
   * @returns Content with loaded base64 images
   */
  async processContentForDisplay(content: string): Promise<string> {
    // Match all swag-image:// references
    const refRegex = /(swag-image:\/\/[A-Za-z0-9_]+)/g;
    const matches = content.match(refRegex) || [];

    if (matches.length === 0) {
      return content; // No references to process
    }

    console.log(`🔄 processContentForDisplay: Found ${matches.length} image references to load`);
    console.log(`🔄 References:`, matches);

    let processedContent = content;
    const uniqueMatches = [...new Set(matches)]; // Deduplicate

    // Load images in parallel for better performance
    const loadPromises = uniqueMatches.map(async (ref) => {
      try {
        console.log(`📥 Loading image from IndexedDB: ${ref}`);
        const base64 = await this.getImage(ref);
        console.log(`✅ Loaded image ${ref}: ${(base64.length / 1024).toFixed(1)} KB`);
        return { ref, base64 };
      } catch (error) {
        console.error(`❌ Failed to load image ${ref}:`, error);
        // Return placeholder for broken images
        return { ref, base64: 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMjAwIiBoZWlnaHQ9IjIwMCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48cmVjdCB3aWR0aD0iMjAwIiBoZWlnaHQ9IjIwMCIgZmlsbD0iI2VlZSIvPjx0ZXh0IHg9IjUwJSIgeT0iNTAlIiBkb21pbmFudC1iYXNlbGluZT0ibWlkZGxlIiB0ZXh0LWFuY2hvcj0ibWlkZGxlIiBmb250LWZhbWlseT0ic2Fucy1zZXJpZiIgZm9udC1zaXplPSIxNiIgZmlsbD0iIzk5OSI+SW1hZ2UgTm90IEZvdW5kPC90ZXh0Pjwvc3ZnPg==' };
      }
    });

    const loadedImages = await Promise.all(loadPromises);

    // Replace all references with loaded data
    for (const { ref, base64 } of loadedImages) {
      processedContent = processedContent.split(ref).join(base64);
    }


    console.log(`✅ processContentForDisplay: Replaced ${uniqueMatches.length} references with base64 data`);

    return processedContent;
  }

  /**
   * Garbage collection: Remove images not referenced by any snippet
   * @param allSnippetContents - Array of all snippet contents
   */
  async garbageCollect(allSnippetContents: string[]): Promise<number> {
    const allImages = await this.getAllImages();
    const allContent = allSnippetContents.join('\n');
    
    let deletedCount = 0;
    
    for (const image of allImages) {
      const ref = `swag-image://${image.id}`;
      if (!allContent.includes(ref)) {
        try {
          await this.deleteImage(ref);
          deletedCount++;
        } catch (error) {
          console.error(`Failed to delete orphaned image ${image.id}:`, error);
        }
      }
    }

    if (deletedCount > 0) {
      console.log(`🗑️ Garbage collected ${deletedCount} orphaned images`);
    }

    return deletedCount;
  }
}

// Export singleton instance
export const imageStorage = new ImageStorageService();

// Export types
export type { ImageMetadata };
