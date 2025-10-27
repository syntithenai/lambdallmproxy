/**
 * Share Feature Utilities
 * 
 * Handles compression, truncation, and encoding of chat conversations for URL sharing.
 * Uses LZ-String compression to fit conversations into Chrome's 32K URL limit.
 */

import LZString from 'lz-string';

const CHROME_URL_LIMIT = 32000; // Chrome's URL length limit (conservative estimate)
const VERSION = 1;

export interface ShareMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp?: number;
}

export interface ShareMetadata {
  title?: string;
  truncated: boolean;
  originalMessageCount: number;
  includedMessageCount: number;
  truncationNotice?: string;
}

export interface ShareData {
  version: number;
  timestamp: number;
  shareType: 'conversation' | 'plan';
  metadata: ShareMetadata;
  messages: ShareMessage[];
  plan?: any; // Optional plan data
}

/**
 * Compress and encode share data for URL embedding
 */
export function encodeShareData(data: ShareData): string {
  const json = JSON.stringify(data);
  return LZString.compressToEncodedURIComponent(json);
}

/**
 * Decode and decompress share data from URL
 */
export function decodeShareData(encoded: string): ShareData | null {
  try {
    const decompressed = LZString.decompressFromEncodedURIComponent(encoded);
    if (!decompressed) return null;
    
    const data = JSON.parse(decompressed) as ShareData;
    
    // Validate structure
    if (!data.version || !data.messages || !Array.isArray(data.messages)) {
      console.error('Invalid share data structure');
      return null;
    }
    
    return data;
  } catch (error) {
    console.error('Failed to decode share data:', error);
    return null;
  }
}

/**
 * Smart truncation: Always preserve first user message + last assistant message
 * Fill middle messages working backwards until under 32K limit
 */
export function handleLargeShare(data: ShareData): string {
  const messages = data.messages;
  
  // If no messages or only 1-2 messages, no truncation needed
  if (messages.length <= 2) {
    return encodeShareData(data);
  }
  
  const firstMessage = messages[0];
  const lastMessage = messages[messages.length - 1];
  
  // Start with first + last
  let truncatedMessages = [firstMessage, lastMessage];
  let currentData = {
    ...data,
    messages: truncatedMessages,
    metadata: {
      ...data.metadata,
      truncated: true,
      originalMessageCount: messages.length,
      includedMessageCount: 2,
      truncationNotice: `Conversation truncated to fit URL limits. Showing first and last messages.`
    }
  };
  
  let compressed = encodeShareData(currentData);
  
  // Try to fit as many middle messages as possible, working backwards
  for (let i = messages.length - 2; i > 0; i--) {
    const testMessages = [firstMessage, ...messages.slice(i, messages.length - 1), lastMessage];
    const testData = {
      ...data,
      messages: testMessages,
      metadata: {
        ...data.metadata,
        truncated: true,
        originalMessageCount: messages.length,
        includedMessageCount: testMessages.length,
        truncationNotice: `Conversation truncated to fit URL limits. Showing ${testMessages.length} of ${messages.length} messages.`
      }
    };
    
    const testCompressed = encodeShareData(testData);
    
    if (testCompressed.length > CHROME_URL_LIMIT) {
      // Stop, previous iteration was the max
      break;
    }
    
    // This fits, keep it
    compressed = testCompressed;
    currentData = testData;
  }
  
  return compressed;
}

/**
 * Create shareable data from current chat state
 */
export function createShareData(
  messages: ShareMessage[],
  options: {
    title?: string;
    plan?: any;
    shareType?: 'conversation' | 'plan';
  } = {}
): string {
  const shareData: ShareData = {
    version: VERSION,
    timestamp: Date.now(),
    shareType: options.shareType || 'conversation',
    metadata: {
      title: options.title,
      truncated: false,
      originalMessageCount: messages.length,
      includedMessageCount: messages.length
    },
    messages,
    plan: options.plan
  };
  
  // Try full compression first
  const fullCompressed = encodeShareData(shareData);
  
  if (fullCompressed.length <= CHROME_URL_LIMIT) {
    return fullCompressed;
  }
  
  // Need to truncate
  console.warn(`Share data exceeds ${CHROME_URL_LIMIT} chars (${fullCompressed.length}), applying smart truncation`);
  return handleLargeShare(shareData);
}

/**
 * Generate full share URL
 */
export function generateShareUrl(compressed: string): string {
  const baseUrl = window.location.origin + window.location.pathname;
  return `${baseUrl}?share=${compressed}`;
}

/**
 * Check if current URL has share data
 */
export function hasShareData(): boolean {
  const params = new URLSearchParams(window.location.search);
  return params.has('share');
}

/**
 * Extract share data from current URL
 */
export function getShareDataFromUrl(): ShareData | null {
  const params = new URLSearchParams(window.location.search);
  const encoded = params.get('share');
  
  if (!encoded) return null;
  
  return decodeShareData(encoded);
}

/**
 * Clear share data from URL (without page reload)
 */
export function clearShareDataFromUrl(): void {
  const url = new URL(window.location.href);
  url.searchParams.delete('share');
  window.history.replaceState({}, '', url.toString());
}
