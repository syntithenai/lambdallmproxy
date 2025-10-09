/**
 * Chat History Cache Utility
 * Caches chat conversations in localStorage with first user message as title
 */

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

const CHAT_CACHE_KEY = 'llm_proxy_chat_history';

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
 * Get all cached chats
 */
export function getAllCachedChats(): CachedChat[] {
  try {
    const cached = localStorage.getItem(CHAT_CACHE_KEY);
    if (!cached) return [];
    
    const chats = JSON.parse(cached);
    return Array.isArray(chats) ? chats : [];
  } catch (error) {
    console.error('Error reading chat cache:', error);
    return [];
  }
}

/**
 * Save or update a chat conversation
 */
export function saveCachedChat(chatId: string | null, messages: ChatMessage[]): string {
  try {
    if (messages.length === 0) {
      console.log('No messages to save');
      return chatId || '';
    }

    const chats = getAllCachedChats();
    
    // Find first user message for title
    const firstUserMessage = messages.find(m => m.role === 'user');
    if (!firstUserMessage) {
      console.log('No user messages found');
      return chatId || '';
    }

    const title = generateTitle(firstUserMessage.content);
    const now = Date.now();

    if (chatId) {
      // Update existing chat
      const existingIndex = chats.findIndex(c => c.id === chatId);
      if (existingIndex >= 0) {
        chats[existingIndex] = {
          ...chats[existingIndex],
          messages,
          lastUpdated: now
        };
        localStorage.setItem(CHAT_CACHE_KEY, JSON.stringify(chats));
        return chatId;
      }
    }

    // Create new chat
    const newChatId = generateChatId();
    const newChat: CachedChat = {
      id: newChatId,
      title,
      messages,
      timestamp: now,
      lastUpdated: now
    };

    // Add to beginning of array (most recent first)
    chats.unshift(newChat);

    // Limit to 100 most recent chats
    const limitedChats = chats.slice(0, 100);

    localStorage.setItem(CHAT_CACHE_KEY, JSON.stringify(limitedChats));
    return newChatId;
  } catch (error) {
    console.error('Error saving chat to cache:', error);
    return chatId || '';
  }
}

/**
 * Delete a cached chat by ID
 */
export function deleteCachedChat(chatId: string): void {
  try {
    const chats = getAllCachedChats();
    const filtered = chats.filter(c => c.id !== chatId);
    localStorage.setItem(CHAT_CACHE_KEY, JSON.stringify(filtered));
  } catch (error) {
    console.error('Error deleting cached chat:', error);
  }
}

/**
 * Get a specific cached chat by ID
 */
export function getCachedChat(chatId: string): CachedChat | null {
  const chats = getAllCachedChats();
  return chats.find(c => c.id === chatId) || null;
}

/**
 * Clear all cached chats
 */
export function clearAllCachedChats(): void {
  try {
    localStorage.removeItem(CHAT_CACHE_KEY);
  } catch (error) {
    console.error('Error clearing chat cache:', error);
  }
}
