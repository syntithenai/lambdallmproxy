/**
 * Snippet Share Utilities
 * 
 * Handles compression, encoding, and sharing of individual snippets via URL.
 * Complements the chat share feature with snippet-specific functionality.
 * Embeds base64 images from localStorage for complete sharing.
 */

import LZString from 'lz-string';
import { imageStorage } from './imageStorage';

const CHROME_URL_LIMIT = 32000;
const VERSION = 1;

export interface SharedSnippet {
  version: number;
  timestamp: number;
  shareType: 'snippet';
  id: string;
  content: string;
  title?: string;
  tags?: string[];
  sourceType?: 'user' | 'assistant' | 'tool';
  metadata?: {
    compressed: boolean;
    originalSize: number;
    compressedSize?: number;
  };
}

/**
 * Encode snippet data for URL sharing
 */
export function encodeSnippetData(data: SharedSnippet): string {
  const json = JSON.stringify(data);
  return LZString.compressToEncodedURIComponent(json);
}

/**
 * Decode snippet data from URL
 */
export function decodeSnippetData(encoded: string): SharedSnippet | null {
  try {
    const decompressed = LZString.decompressFromEncodedURIComponent(encoded);
    if (!decompressed) return null;
    
    const data = JSON.parse(decompressed) as SharedSnippet;
    
    // Validate structure
    if (!data.version || data.shareType !== 'snippet' || !data.content) {
      console.error('Invalid snippet share data structure');
      return null;
    }
    
    return data;
  } catch (error) {
    console.error('Failed to decode snippet share data:', error);
    return null;
  }
}

/**
 * Convert HTTP URL to base64 data URI
 */
async function fetchImageAsBase64(url: string): Promise<string> {
  try {
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }
    const blob = await response.blob();
    
    // Convert blob to base64
    const base64 = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result as string);
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
    
    return base64;
  } catch (error) {
    console.error(`Failed to fetch image from ${url}:`, error);
    throw error;
  }
}

/**
 * Create shareable snippet data
 * Converts image references and HTTP URLs to embedded base64 for complete sharing
 */
export async function createSnippetShareData(
  id: string,
  content: string,
  title?: string,
  tags?: string[],
  sourceType?: 'user' | 'assistant' | 'tool'
): Promise<string> {
  let contentWithImages = content;
  
  // Step 1: Convert swag-image:// references to base64
  try {
    contentWithImages = await imageStorage.processContentForDisplay(contentWithImages);
    console.log('📤 Embedded swag-image references in snippet share data');
  } catch (error) {
    console.error('Failed to embed swag-image references:', error);
  }
  
  // Step 2: Convert HTTP/HTTPS URLs in markdown images to base64
  const httpImageRegex = /!\[([^\]]*)\]\((https?:\/\/[^\)]+)\)/g;
  const httpMatches = [...contentWithImages.matchAll(httpImageRegex)];
  
  if (httpMatches.length > 0) {
    console.log(`📤 Found ${httpMatches.length} HTTP image URLs, converting to base64...`);
    
    const urlMap = new Map<string, string>();
    
    for (const match of httpMatches) {
      const [, , url] = match;
      
      // Skip if already processed
      if (urlMap.has(url)) {
        continue;
      }
      
      try {
        const base64 = await fetchImageAsBase64(url);
        urlMap.set(url, base64);
        console.log(`✅ Converted HTTP image to base64: ${url.substring(0, 50)}...`);
      } catch (error) {
        console.warn(`⚠️ Could not convert image, keeping URL: ${url}`);
        urlMap.set(url, url); // Keep original URL if fetch fails
      }
    }
    
    // Replace all HTTP URLs with base64
    urlMap.forEach((base64, url) => {
      const urlRegex = new RegExp(`!\\[([^\\]]*)\\]\\(${url.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\)`, 'g');
      contentWithImages = contentWithImages.replace(urlRegex, `![$1](${base64})`);
    });
    
    console.log(`✅ Converted ${urlMap.size} HTTP image URLs to base64 for sharing`);
  }

  const shareData: SharedSnippet = {
    version: VERSION,
    timestamp: Date.now(),
    shareType: 'snippet',
    id,
    content: contentWithImages, // Now includes embedded base64 images
    title,
    tags,
    sourceType,
    metadata: {
      compressed: true,
      originalSize: contentWithImages.length
    }
  };
  
  const compressed = encodeSnippetData(shareData);
  shareData.metadata!.compressedSize = compressed.length;
  
  if (compressed.length > CHROME_URL_LIMIT) {
    console.warn(`Snippet share data exceeds ${CHROME_URL_LIMIT} chars (${compressed.length})`);
    // Could truncate content here if needed, but snippets should generally be small enough
  }
  
  return compressed;
}

/**
 * Generate full share URL for snippet
 */
export function generateSnippetShareUrl(compressed: string): string {
  // Use VITE_SHARE_BASE_URL if defined, otherwise use current origin
  const shareBaseUrl = import.meta.env.VITE_SHARE_BASE_URL;
  const baseUrl = shareBaseUrl 
    ? shareBaseUrl + window.location.pathname
    : window.location.origin + window.location.pathname;
  return `${baseUrl}#/snippet/shared?data=${compressed}`;
}

/**
 * Check if current URL has snippet share data
 */
export function hasSnippetShareData(): boolean {
  const params = new URLSearchParams(window.location.search);
  const hash = window.location.hash;
  return params.has('snippet') || hash.includes('/snippet/shared?data=');
}

/**
 * Extract snippet share data from current URL
 */
export function getSnippetShareDataFromUrl(): SharedSnippet | null {
  // Check hash-based routing (e.g., #/snippet/shared?data=...)
  const hash = window.location.hash;
  if (hash.includes('/snippet/shared?data=')) {
    const match = hash.match(/data=([^&]+)/);
    if (match) {
      return decodeSnippetData(match[1]);
    }
  }
  
  // Check query parameter (fallback)
  const params = new URLSearchParams(window.location.search);
  const encoded = params.get('snippet');
  if (!encoded) return null;
  
  return decodeSnippetData(encoded);
}
