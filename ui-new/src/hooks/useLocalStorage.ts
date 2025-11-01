import { useState } from 'react';
import * as userStorage from '../utils/userStorage';

export function useLocalStorage<T>(key: string, initialValue: T) {
  // State to store our value
  const [storedValue, setStoredValue] = useState<T>(() => {
    try {
      // SECURITY: Use user-scoped storage
      const item = userStorage.getItem(key);
      return item ? JSON.parse(item) : initialValue;
    } catch (error) {
      console.error(`Error loading localStorage key "${key}":`, error);
      return initialValue;
    }
  });

  // Return a wrapped version of useState's setter function that persists to localStorage
  const setValue = (value: T | ((val: T) => T)) => {
    try {
      // Use the functional form of setStoredValue to ensure we always work with the latest state
      setStoredValue((currentValue) => {
        const valueToStore = value instanceof Function ? value(currentValue) : value;
        
        try {
          // SECURITY: Use user-scoped storage
          userStorage.setItem(key, JSON.stringify(valueToStore));
        } catch (storageError: any) {
          // Handle QuotaExceededError
          if (storageError?.name === 'QuotaExceededError') {
            console.warn(`localStorage quota exceeded for key "${key}". Attempting cleanup...`);
            
            // Try to free up space by removing old data
            try {
              // Remove old chat history items (keep only last 5)
              const chatKeys = getAllKeys('chat_history_');
              if (chatKeys.length > 5) {
                const sortedKeys = chatKeys.sort().slice(0, chatKeys.length - 5);
                sortedKeys.forEach(k => window.localStorage.removeItem(k));
                console.log(`Removed ${sortedKeys.length} old chat history items`);
              }
              
              // Try again after cleanup
              userStorage.setItem(key, JSON.stringify(valueToStore));
              console.log(`Successfully saved after cleanup`);
            } catch (retryError) {
              console.error(`Failed to save even after cleanup:`, retryError);
              // If still failing, save a minimal version
              if (key === 'app_settings') {
                const minimal = { 
                  version: (valueToStore as any).version,
                  providers: [], 
                  tavilyApiKey: '' 
                };
                userStorage.setItem(key, JSON.stringify(minimal));
                console.warn('Saved minimal settings due to quota');
              }
            }
          } else {
            throw storageError;
          }
        }
        
        return valueToStore;
      });
    } catch (error) {
      console.error(`Error saving localStorage key "${key}":`, error);
    }
  };

  return [storedValue, setValue] as const;
}

export function removeFromLocalStorage(key: string) {
  try {
    // SECURITY: Use user-scoped storage
    userStorage.removeItem(key);
  } catch (error) {
    console.error(`Error removing localStorage key "${key}":`, error);
  }
}

export function getAllKeys(prefix: string): string[] {
  try {
    return Object.keys(localStorage).filter(key => key.startsWith(prefix));
  } catch (error) {
    console.error('Error getting localStorage keys:', error);
    return [];
  }
}

export function getLocalStorageSize(): { total: number; byKey: Record<string, number> } {
  const byKey: Record<string, number> = {};
  let total = 0;
  
  try {
    for (const key in localStorage) {
      if (localStorage.hasOwnProperty(key)) {
        const value = localStorage.getItem(key) || '';
        const size = new Blob([value]).size;
        byKey[key] = size;
        total += size;
      }
    }
  } catch (error) {
    console.error('Error calculating localStorage size:', error);
  }
  
  return { total, byKey };
}

export function cleanupOldChatHistory(keepCount: number = 5) {
  try {
    const chatKeys = getAllKeys('chat_history_');
    if (chatKeys.length > keepCount) {
      const sortedKeys = chatKeys.sort().slice(0, chatKeys.length - keepCount);
      sortedKeys.forEach(k => window.localStorage.removeItem(k));
      console.log(`Cleaned up ${sortedKeys.length} old chat history items`);
      return sortedKeys.length;
    }
    return 0;
  } catch (error) {
    console.error('Error cleaning up chat history:', error);
    return 0;
  }
}

