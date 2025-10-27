/**
 * Chat History Cache Utility
 * Caches chat conversations in IndexedDB with first user message as title
 */

import { chatHistoryDB } from './chatHistoryDB';

export interface ChatMessage {
  role: 'user' | 'assistant' | 'system' | 'tool';
  content: string;
  timestamp?: number;
  tool_calls?: Array<{
    id: string;
    type: 'function';
    function: {
      name: string;
      arguments: string;
    };
  }>;
  tool_call_id?: string;
  name?: string;
  isStreaming?: boolean;
  llmApiCalls?: Array<{
    phase: string;
    model: string;
    request: any;
    response?: any;
    httpHeaders?: any;    // HTTP response headers from LLM API
    httpStatus?: number;  // HTTP status code from LLM API
    timestamp: string;
  }>;
  toolResults?: Array<{   // Tool execution results embedded in assistant message
    role: 'tool';
    content: string;
    tool_call_id: string;
    name: string;
    llmApiCalls?: any[];
  }>;
  extractedContent?: {
    sources?: Array<{
      title: string;
      url: string;
      snippet?: string;
    }>;
    images?: Array<{
      src: string;
      alt: string;
      source: string;
    }>;
    youtubeVideos?: Array<{
      src: string;
      title: string;
      source: string;
    }>;
    otherVideos?: Array<{
      src: string;
      title: string;
      source: string;
    }>;
    media?: Array<{
      src: string;
      type: string;
      source: string;
    }>;
  };
}

export interface CachedChat {
  id: string;
  title: string;
  messages: ChatMessage[];
  timestamp: number;
  lastUpdated: number;
}

/**
 * Generate a unique ID for a chat
 */
function generateChatId(): string {
  return `chat_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

/**
 * Generate a title from the first user message (max 60 chars)
 */
function generateTitle(firstUserMessage: string): string {
  const cleaned = firstUserMessage.trim();
  if (cleaned.length <= 60) return cleaned;
  return cleaned.substring(0, 57) + '...';
}

/**
 * Get all cached chats from IndexedDB
 */
export async function getAllCachedChats(): Promise<CachedChat[]> {
  try {
    const chats = await chatHistoryDB.getAllChats();
    // Convert to CachedChat format
    return chats.map(chat => ({
      id: chat.id,
      title: chat.title || 'Untitled Chat',
      messages: chat.messages,
      timestamp: chat.timestamp,
      lastUpdated: chat.timestamp
    }));
  } catch (error) {
    console.error('Error reading chat cache:', error);
    return [];
  }
}

/**
 * Save or update a chat conversation in IndexedDB
 */
export async function saveCachedChat(chatId: string | null, messages: ChatMessage[]): Promise<string> {
  try {
    if (messages.length === 0) {
      console.log('No messages to save');
      return chatId || '';
    }

    // Find first user message for title
    const firstUserMessage = messages.find(m => m.role === 'user');
    if (!firstUserMessage) {
      console.log('No user messages found');
      return chatId || '';
    }

    const title = generateTitle(firstUserMessage.content);

    if (chatId) {
      // Update existing chat
      await chatHistoryDB.saveChat(chatId, messages, title);
      return chatId;
    }

    // Create new chat
    const newChatId = generateChatId();
    await chatHistoryDB.saveChat(newChatId, messages, title);
    
    // Cleanup old chats (keep 100 most recent)
    await chatHistoryDB.cleanupOldChats(100);
    
    return newChatId;
  } catch (error) {
    console.error('Error saving chat to cache:', error);
    return chatId || '';
  }
}

/**
 * Delete a cached chat by ID from IndexedDB
 */
export async function deleteCachedChat(chatId: string): Promise<void> {
  try {
    await chatHistoryDB.deleteChat(chatId);
  } catch (error) {
    console.error('Error deleting cached chat:', error);
  }
}

/**
 * Get a specific cached chat by ID from IndexedDB
 */
export async function getCachedChat(chatId: string): Promise<CachedChat | null> {
  try {
    const messages = await chatHistoryDB.getChat(chatId);
    if (!messages) return null;
    
    const chat = await chatHistoryDB.getAllChats();
    const found = chat.find(c => c.id === chatId);
    if (!found) return null;
    
    return {
      id: found.id,
      title: found.title || 'Untitled Chat',
      messages: found.messages,
      timestamp: found.timestamp,
      lastUpdated: found.timestamp
    };
  } catch (error) {
    console.error('Error getting cached chat:', error);
    return null;
  }
}

/**
 * Clear all cached chats from IndexedDB
 */
export async function clearAllCachedChats(): Promise<void> {
  try {
    const chats = await chatHistoryDB.getAllChats();
    for (const chat of chats) {
      await chatHistoryDB.deleteChat(chat.id);
    }
  } catch (error) {
    console.error('Error clearing chat cache:', error);
  }
}
