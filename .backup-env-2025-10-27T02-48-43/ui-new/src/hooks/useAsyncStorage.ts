import { useState, useEffect, useCallback } from 'react';
import { storage, StorageError } from '../utils/storage';

/**
 * Hook for async storage (IndexedDB with localStorage fallback)
 * Similar to useLocalStorage but handles async operations
 */
export function useAsyncStorage<T>(key: string, initialValue: T) {
  const [storedValue, setStoredValue] = useState<T>(initialValue);
  const [isLoaded, setIsLoaded] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  // Load initial value from storage
  useEffect(() => {
    const loadValue = async () => {
      try {
        const item = await storage.getItem<T>(key);
        if (item !== null) {
          setStoredValue(item);
        }
        setIsLoaded(true);
      } catch (err) {
        console.error(`Error loading storage key "${key}":`, err);
        setError(err instanceof Error ? err : new Error(String(err)));
        setIsLoaded(true);
        // Keep initialValue on error
      }
    };

    loadValue();
  }, [key]);

  // Wrapped setter that persists to storage
  const setValue = useCallback(async (value: T | ((val: T) => T)) => {
    try {
      // If value is a function, call it with current state
      const valueToStore = value instanceof Function ? value(storedValue) : value;
      
      // Update state immediately for responsive UI
      setStoredValue(valueToStore);
      
      // Persist to storage asynchronously
      try {
        await storage.setItem(key, valueToStore);
        setError(null);
      } catch (storageErr) {
        if (storageErr instanceof StorageError) {
          console.error(`Storage error for "${key}":`, storageErr.message);
          console.error(`  Estimated size: ${storageErr.estimatedSize} bytes`);
          console.error(`  Limit: ${storageErr.limit} bytes`);
          
          // If quota exceeded, try to provide helpful error
          if (storageErr.code === 'QUOTA_EXCEEDED') {
            const sizeInMB = ((storageErr.estimatedSize || 0) / 1024 / 1024).toFixed(2);
            const limitInMB = ((storageErr.limit || 0) / 1024 / 1024).toFixed(2);
            throw new Error(
              `Storage quota exceeded: ${sizeInMB}MB / ${limitInMB}MB. ` +
              `Please clear some data or use a smaller dataset.`
            );
          }
        }
        throw storageErr;
      }
    } catch (err) {
      console.error(`Error saving storage key "${key}":`, err);
      setError(err instanceof Error ? err : new Error(String(err)));
      throw err; // Re-throw so caller can handle
    }
  }, [key, storedValue]);

  // Clear function
  const clearValue = useCallback(async () => {
    try {
      await storage.removeItem(key);
      setStoredValue(initialValue);
      setError(null);
    } catch (err) {
      console.error(`Error clearing storage key "${key}":`, err);
      setError(err instanceof Error ? err : new Error(String(err)));
      throw err;
    }
  }, [key, initialValue]);

  return {
    value: storedValue,
    setValue,
    clearValue,
    isLoaded,
    error
  } as const;
}
