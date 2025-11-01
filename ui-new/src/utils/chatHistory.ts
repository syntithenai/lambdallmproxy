/**
 * Chat history management utilities
 * Uses IndexedDB for large storage capacity (vs localStorage's 5-10MB limit)
 * Now uses chatHistoryDB for consistent storage
 */

import { chatHistoryDB } from './chatHistoryDB';

// Helper to extract text from multimodal content
function getMessageText(content: any): string {
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) {
    return content
      .filter(part => part.type === 'text' && part.text)
      .map(part => part.text)
      .join('\n');
  }
  return '';
}

export interface ChatHistoryEntry {
  id: string;
  timestamp: number;
  firstUserPrompt: string;
  messages: any[]; // Full message array including tool calls and results
}

/**
 * Generate a unique ID for a chat session
 */
function generateChatId(): string {
  return `chat_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

/**
 * Get all chat history entries from IndexedDB
 */
export async function getAllChatHistory(): Promise<ChatHistoryEntry[]> {
  try {
    const chats = await chatHistoryDB.getAllChats();
    // Sort by timestamp descending
    return chats.sort((a, b) => b.timestamp - a.timestamp).map(chat => ({
      id: chat.id,
      timestamp: chat.timestamp,
      firstUserPrompt: chat.title || 'New chat',
      messages: chat.messages
    }));
  } catch (error) {
    console.error('Error loading chat history from IndexedDB:', error);
    return [];
  }
}

/**
 * Save current chat session to IndexedDB
 * Automatically creates a new entry or updates if an ID is provided
 */
export async function saveChatToHistory(
  messages: any[], 
  chatId?: string,
  metadata?: {
    systemPrompt?: string;
    planningQuery?: string;
    generatedSystemPrompt?: string;
    generatedUserQuery?: string;
    selectedSnippetIds?: string[];
    todosState?: any;
    projectId?: string;  // Associated project for filtering
  }
): Promise<string> {
  try {
    // Find first user message for the preview (title)
    const firstUserMessage = messages.find(m => m.role === 'user');
    const messageText = firstUserMessage ? getMessageText(firstUserMessage.content) : '';
    const title = messageText 
      ? messageText.substring(0, 100)
      : 'New chat';
    
    if (!chatId) {
      chatId = generateChatId();
    }
    
    // Use the new chatHistoryDB
  await chatHistoryDB.saveChat(chatId, messages, title, metadata);
    
    return chatId;
  } catch (error) {
    console.error('Error saving chat to history:', error);
    return chatId || generateChatId();
  }
}

/**
 * Load a specific chat from IndexedDB (messages only, for backward compatibility)
 */
export async function loadChatFromHistory(chatId: string): Promise<any[] | null> {
  try {
    return await chatHistoryDB.getChat(chatId);
  } catch (error) {
    console.error('Error loading chat from IndexedDB:', error);
    return null;
  }
}

/**
 * Load a specific chat with full metadata from IndexedDB
 */
export async function loadChatWithMetadata(chatId: string): Promise<{
  messages: any[];
  systemPrompt?: string;
  planningQuery?: string;
  generatedSystemPrompt?: string;
  generatedUserQuery?: string;
  selectedSnippetIds?: string[];
  todosState?: any;
} | null> {
  try {
    const entry = await chatHistoryDB.getChatWithMetadata(chatId);
    if (!entry) return null;
    
    return {
      messages: entry.messages,
      systemPrompt: entry.systemPrompt,
      planningQuery: entry.planningQuery,
      generatedSystemPrompt: entry.generatedSystemPrompt,
      generatedUserQuery: entry.generatedUserQuery,
      selectedSnippetIds: entry.selectedSnippetIds,
      todosState: entry.todosState
    };
  } catch (error) {
    console.error('Error loading chat with metadata from IndexedDB:', error);
    return null;
  }
}

/**
 * Delete a chat from IndexedDB
 */
export async function deleteChatFromHistory(chatId: string): Promise<void> {
  try {
    await chatHistoryDB.deleteChat(chatId);
  } catch (error) {
    console.error('Error deleting chat from IndexedDB:', error);
  }
}

/**
 * Clear all chat history from IndexedDB
 */
export async function clearAllChatHistory(): Promise<void> {
  try {
    await chatHistoryDB.clearAllChats();
  } catch (error) {
    console.error('Error clearing chat history from IndexedDB:', error);
  }
}
