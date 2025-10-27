/**
 * Snippet Share Utilities
 * 
 * Handles compression, encoding, and sharing of individual snippets via URL.
 * Complements the chat share feature with snippet-specific functionality.
 */

import LZString from 'lz-string';

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
 * Create shareable snippet data
 */
export function createSnippetShareData(
  id: string,
  content: string,
  title?: string,
  tags?: string[],
  sourceType?: 'user' | 'assistant' | 'tool'
): string {
  const shareData: SharedSnippet = {
    version: VERSION,
    timestamp: Date.now(),
    shareType: 'snippet',
    id,
    content,
    title,
    tags,
    sourceType,
    metadata: {
      compressed: true,
      originalSize: content.length
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
  const baseUrl = window.location.origin + window.location.pathname;
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
