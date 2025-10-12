/**
 * Image utility functions for converting URLs to base64 and handling image operations
 */

/**
 * Convert an image URL to a base64 data URI
 * Handles CORS by using backend proxy endpoint with Webshare proxy
 * Falls back to direct fetch if proxy fails
 * @param url - The image URL to convert
 * @param maxSize - Maximum dimension (width or height) to resize to (default: 1200px)
 * @returns Promise<string> - Base64 data URI or original URL if conversion fails
 */
export async function imageUrlToBase64(url: string, maxSize: number = 1200): Promise<string> {
  try {
    // Handle data URIs - already base64
    if (url.startsWith('data:')) {
      return url;
    }

    // Try backend proxy first (uses Webshare proxy if available)
    try {
      const backendUrl = import.meta.env.VITE_BACKEND_URL || '';
      const proxyResponse = await fetch(`${backendUrl}/proxy-image`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ url, format: 'base64' })
      });

      if (proxyResponse.ok) {
        const data = await proxyResponse.json();
        if (data.success && data.dataUri) {
          console.log(`✅ Image fetched via backend proxy (proxy: ${data.usedProxy})`);
          // Now resize if needed
          const response = await fetch(data.dataUri);
          const blob = await response.blob();
          return await blobToBase64WithResize(blob, maxSize);
        }
      }
    } catch (proxyError) {
      console.warn('Backend proxy fetch failed, trying direct:', proxyError);
    }

    // Fallback to direct fetch
    console.log('ℹ️ Falling back to direct image fetch');
    const response = await fetch(url, {
      mode: 'cors',
      credentials: 'omit'
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch image: ${response.status}`);
    }

    const blob = await response.blob();
    
    // Convert blob to base64
    return await blobToBase64WithResize(blob, maxSize);
  } catch (error) {
    console.warn(`Failed to convert image to base64: ${url}`, error);
    // Return original URL as fallback
    return url;
  }
}

/**
 * Convert a blob to base64 with optional resizing
 * @param blob - The image blob
 * @param maxSize - Maximum dimension to resize to
 * @returns Promise<string> - Base64 data URI
 */
export async function blobToBase64WithResize(blob: Blob, maxSize: number = 1200): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        // Calculate new dimensions
        let width = img.width;
        let height = img.height;
        
        if (width > maxSize || height > maxSize) {
          if (width > height) {
            height = Math.round((height * maxSize) / width);
            width = maxSize;
          } else {
            width = Math.round((width * maxSize) / height);
            height = maxSize;
          }
        }
        
        // Create canvas and resize
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          reject(new Error('Failed to get canvas context'));
          return;
        }
        
        ctx.drawImage(img, 0, 0, width, height);
        
        // Convert to base64 with quality optimization
        const base64 = canvas.toDataURL('image/jpeg', 0.85);
        resolve(base64);
      };
      
      img.onerror = () => reject(new Error('Failed to load image'));
      img.src = reader.result as string;
    };
    
    reader.onerror = () => reject(new Error('Failed to read blob'));
    reader.readAsDataURL(blob);
  });
}

/**
 * Convert multiple image URLs to base64 in parallel with rate limiting
 * @param urls - Array of image URLs
 * @param maxConcurrent - Maximum concurrent conversions (default: 3)
 * @param maxSize - Maximum dimension for resizing
 * @returns Promise<string[]> - Array of base64 data URIs (or original URLs if conversion fails)
 */
export async function convertImagesToBase64(
  urls: string[],
  maxConcurrent: number = 3,
  maxSize: number = 1200
): Promise<string[]> {
  const results: string[] = new Array(urls.length);
  let currentIndex = 0;
  
  // Process images with concurrency limit
  const processNext = async (): Promise<void> => {
    if (currentIndex >= urls.length) return;
    
    const index = currentIndex++;
    const url = urls[index];
    
    try {
      results[index] = await imageUrlToBase64(url, maxSize);
    } catch (error) {
      console.warn(`Failed to convert image ${index}:`, error);
      results[index] = url; // Fallback to original URL
    }
    
    // Process next image
    await processNext();
  };
  
  // Start concurrent processors
  const workers = Array.from({ length: Math.min(maxConcurrent, urls.length) }, () => processNext());
  await Promise.all(workers);
  
  return results;
}

/**
 * Extract image URLs from HTML content
 * @param html - HTML string
 * @returns string[] - Array of image URLs
 */
export function extractImageUrls(html: string): string[] {
  const urls: string[] = [];
  const imgRegex = /<img[^>]+src=["']([^"']+)["']/gi;
  let match;
  
  while ((match = imgRegex.exec(html)) !== null) {
    urls.push(match[1]);
  }
  
  return urls;
}

/**
 * Replace image URLs in HTML with base64 data URIs
 * @param html - HTML string with image tags
 * @param urlToBase64Map - Map of URL to base64 data URI
 * @returns string - HTML with replaced image URLs
 */
export function replaceImageUrlsWithBase64(html: string, urlToBase64Map: Map<string, string>): string {
  let result = html;
  
  urlToBase64Map.forEach((base64, url) => {
    // Escape special regex characters in URL
    const escapedUrl = url.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const regex = new RegExp(`src=["']${escapedUrl}["']`, 'gi');
    result = result.replace(regex, `src="${base64}"`);
  });
  
  return result;
}

/**
 * Convert all images in HTML content to base64
 * @param html - HTML string with image tags
 * @param maxConcurrent - Maximum concurrent conversions
 * @param maxSize - Maximum dimension for resizing
 * @returns Promise<string> - HTML with base64 images
 */
export async function convertHtmlImagesToBase64(
  html: string,
  maxConcurrent: number = 3,
  maxSize: number = 1200
): Promise<string> {
  const imageUrls = extractImageUrls(html);
  
  if (imageUrls.length === 0) {
    return html;
  }
  
  const base64Images = await convertImagesToBase64(imageUrls, maxConcurrent, maxSize);
  
  const urlToBase64Map = new Map<string, string>();
  imageUrls.forEach((url, index) => {
    urlToBase64Map.set(url, base64Images[index]);
  });
  
  return replaceImageUrlsWithBase64(html, urlToBase64Map);
}
