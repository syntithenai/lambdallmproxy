import { useState, useEffect } from 'react';
import { WifiOff, RefreshCw } from 'lucide-react';

/**
 * OfflineStatus Component
 * 
 * Displays an overlay when the user is offline with:
 * - Clear offline message
 * - Retry button to check connection
 * - Auto-detection of connection restoration
 */
export function OfflineStatus() {
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [isRetrying, setIsRetrying] = useState(false);

  useEffect(() => {
    const handleOnline = () => {
      console.log('🌐 Connection restored');
      setIsOnline(true);
      setIsRetrying(false);
    };

    const handleOffline = () => {
      console.log('📴 Connection lost');
      setIsOnline(false);
    };

    // Listen for online/offline events
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    // Initial check
    setIsOnline(navigator.onLine);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  const handleRetry = async () => {
    setIsRetrying(true);
    
    try {
      // Try to fetch a lightweight endpoint to verify connectivity
      // Use a small image or endpoint that's likely to be cached
      const response = await fetch('/favicon.svg', { 
        method: 'HEAD',
        cache: 'no-cache'
      });
      
      if (response.ok) {
        console.log('✅ Connection verified');
        setIsOnline(true);
      } else {
        console.log('❌ Connection check failed');
        setIsOnline(false);
      }
    } catch (error) {
      console.log('❌ Still offline:', error);
      setIsOnline(false);
    } finally {
      setIsRetrying(false);
    }
  };

  // Don't render anything if online
  if (isOnline) {
    return null;
  }

  return (
    <div className="fixed inset-0 bg-gray-900 bg-opacity-95 flex items-center justify-center z-50 p-4">
      <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl max-w-md w-full p-8 text-center">
        {/* Icon */}
        <div className="flex justify-center mb-6">
          <div className="bg-orange-100 dark:bg-orange-900 rounded-full p-6">
            <WifiOff className="h-16 w-16 text-orange-600 dark:text-orange-400" />
          </div>
        </div>

        {/* Message */}
        <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-3">
          You're Offline
        </h2>
        <p className="text-gray-600 dark:text-gray-400 mb-6">
          It looks like you've lost your internet connection. Please check your network settings and try again.
        </p>

        {/* Retry Button */}
        <button
          onClick={handleRetry}
          disabled={isRetrying}
          className="w-full btn-primary py-3 px-6 rounded-lg font-medium flex items-center justify-center gap-2 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <RefreshCw className={`h-5 w-5 ${isRetrying ? 'animate-spin' : ''}`} />
          {isRetrying ? 'Checking Connection...' : 'Retry Connection'}
        </button>

        {/* Additional Info */}
        <p className="text-xs text-gray-500 dark:text-gray-500 mt-6">
          Some features may be unavailable while offline. Cached content will remain accessible.
        </p>
      </div>
    </div>
  );
}
