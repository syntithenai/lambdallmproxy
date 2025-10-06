/**
 * Chat history management utilities
 * Stores multiple chat sessions in localStorage
 */

const CHAT_HISTORY_KEY = 'chat_history';

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
 * Get all chat history entries
 */
export function getAllChatHistory(): ChatHistoryEntry[] {
  try {
    const stored = localStorage.getItem(CHAT_HISTORY_KEY);
    if (!stored) return [];
    return JSON.parse(stored);
  } catch (error) {
    console.error('Error loading chat history:', error);
    return [];
  }
}

/**
 * Save current chat session to history
 * Automatically creates a new entry or updates if an ID is provided
 */
export function saveChatToHistory(messages: any[], chatId?: string): string {
  try {
    const history = getAllChatHistory();
    
    // Find first user message for the preview
    const firstUserMessage = messages.find(m => m.role === 'user');
    const firstUserPrompt = firstUserMessage 
      ? (firstUserMessage.content || 'Empty message').substring(0, 100)
      : 'New chat';
    
    if (chatId) {
      // Update existing chat
      const index = history.findIndex(h => h.id === chatId);
      if (index !== -1) {
        history[index] = {
          id: chatId,
          timestamp: Date.now(),
          firstUserPrompt,
          messages
        };
      } else {
        // ID not found, create new entry
        history.unshift({
          id: chatId,
          timestamp: Date.now(),
          firstUserPrompt,
          messages
        });
      }
    } else {
      // Create new chat entry
      const newId = generateChatId();
      history.unshift({
        id: newId,
        timestamp: Date.now(),
        firstUserPrompt,
        messages
      });
      chatId = newId;
    }
    
    // Limit to 100 most recent chats
    const limitedHistory = history.slice(0, 100);
    
    localStorage.setItem(CHAT_HISTORY_KEY, JSON.stringify(limitedHistory));
    return chatId;
  } catch (error) {
    console.error('Error saving chat to history:', error);
    return chatId || generateChatId();
  }
}

/**
 * Load a specific chat from history
 */
export function loadChatFromHistory(chatId: string): any[] | null {
  const history = getAllChatHistory();
  const entry = history.find(h => h.id === chatId);
  return entry ? entry.messages : null;
}

/**
 * Delete a chat from history
 */
export function deleteChatFromHistory(chatId: string): void {
  try {
    const history = getAllChatHistory();
    const filtered = history.filter(h => h.id !== chatId);
    localStorage.setItem(CHAT_HISTORY_KEY, JSON.stringify(filtered));
  } catch (error) {
    console.error('Error deleting chat from history:', error);
  }
}

/**
 * Clear all chat history
 */
export function clearAllChatHistory(): void {
  try {
    localStorage.removeItem(CHAT_HISTORY_KEY);
  } catch (error) {
    console.error('Error clearing chat history:', error);
  }
}
