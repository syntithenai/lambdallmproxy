/**
 * Shared Documents Tracking
 * Manages localStorage tracking of shared Google Drive documents for Feed, Quiz, and Snippet items
 */

export interface SharedDocument {
  documentId: string;
  webViewLink: string;
  sharedAt: string;
  contentType: 'feed' | 'quiz' | 'snippet';
}

const STORAGE_KEY_PREFIX = 'shared_doc_';

/**
 * Get the storage key for a content item
 */
const getStorageKey = (contentType: 'feed' | 'quiz' | 'snippet', itemId: string): string => {
  return `${STORAGE_KEY_PREFIX}${contentType}_${itemId}`;
};

/**
 * Save shared document info for an item
 */
export const saveSharedDocument = (
  contentType: 'feed' | 'quiz' | 'snippet',
  itemId: string,
  documentId: string,
  webViewLink: string
): void => {
  const sharedDoc: SharedDocument = {
    documentId,
    webViewLink,
    sharedAt: new Date().toISOString(),
    contentType
  };

  const key = getStorageKey(contentType, itemId);
  localStorage.setItem(key, JSON.stringify(sharedDoc));
  
  console.log(`💾 Saved shared document for ${contentType} ${itemId}:`, sharedDoc);
};

/**
 * Get shared document info for an item
 */
export const getSharedDocument = (
  contentType: 'feed' | 'quiz' | 'snippet',
  itemId: string
): SharedDocument | null => {
  const key = getStorageKey(contentType, itemId);
  const stored = localStorage.getItem(key);
  
  if (!stored) {
    return null;
  }

  try {
    return JSON.parse(stored) as SharedDocument;
  } catch (error) {
    console.error(`❌ Failed to parse shared document for ${contentType} ${itemId}:`, error);
    return null;
  }
};

/**
 * Remove shared document info for an item
 */
export const removeSharedDocument = (
  contentType: 'feed' | 'quiz' | 'snippet',
  itemId: string
): void => {
  const key = getStorageKey(contentType, itemId);
  localStorage.removeItem(key);
  
  console.log(`🗑️ Removed shared document for ${contentType} ${itemId}`);
};

/**
 * Get all shared documents of a specific type
 */
export const getAllSharedDocuments = (
  contentType?: 'feed' | 'quiz' | 'snippet'
): Array<{ itemId: string; doc: SharedDocument }> => {
  const results: Array<{ itemId: string; doc: SharedDocument }> = [];
  
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    
    if (!key || !key.startsWith(STORAGE_KEY_PREFIX)) {
      continue;
    }

    // Parse key to get content type and item ID
    const keyParts = key.replace(STORAGE_KEY_PREFIX, '').split('_');
    if (keyParts.length < 2) {
      continue;
    }

    const docContentType = keyParts[0] as 'feed' | 'quiz' | 'snippet';
    const itemId = keyParts.slice(1).join('_');

    // Filter by content type if specified
    if (contentType && docContentType !== contentType) {
      continue;
    }

    const stored = localStorage.getItem(key);
    if (!stored) {
      continue;
    }

    try {
      const doc = JSON.parse(stored) as SharedDocument;
      results.push({ itemId, doc });
    } catch (error) {
      console.error(`❌ Failed to parse shared document at key ${key}:`, error);
    }
  }

  return results;
};

/**
 * Clear all shared documents (optional: filter by content type)
 */
export const clearAllSharedDocuments = (
  contentType?: 'feed' | 'quiz' | 'snippet'
): number => {
  const keys: string[] = [];
  
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    
    if (!key || !key.startsWith(STORAGE_KEY_PREFIX)) {
      continue;
    }

    // Parse key to get content type
    const keyParts = key.replace(STORAGE_KEY_PREFIX, '').split('_');
    if (keyParts.length < 2) {
      continue;
    }

    const docContentType = keyParts[0];

    // Filter by content type if specified
    if (contentType && docContentType !== contentType) {
      continue;
    }

    keys.push(key);
  }

  // Remove all matching keys
  keys.forEach(key => localStorage.removeItem(key));
  
  console.log(`🗑️ Cleared ${keys.length} shared documents${contentType ? ` (${contentType})` : ''}`);
  
  return keys.length;
};
