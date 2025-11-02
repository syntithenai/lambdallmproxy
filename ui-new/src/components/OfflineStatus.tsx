import { useState, useEffect } from 'react';
import { WifiOff, RefreshCw, Cloud } from 'lucide-react';
import { getCachedApiBase } from '../utils/api';

interface ConnectionStatus {
  hasInternet: boolean;
  backendAvailable: boolean;
}

/**
 * OfflineStatus Component
 * 
 * Displays an overlay when the user is offline or backend is unavailable:
 * - Detects internet connectivity
 * - Checks backend availability
 * - Clear offline/backend unavailable message
 * - Retry button to check connection
 * - Auto-detection of connection restoration
 */
export function OfflineStatus() {
  const [status, setStatus] = useState<ConnectionStatus>({
    hasInternet: navigator.onLine,
    backendAvailable: true
  });
  const [isRetrying, setIsRetrying] = useState(false);

  const checkConnectivity = async () => {
    const hasInternet = navigator.onLine;
    let backendAvailable = false;

    if (hasInternet) {
      try {
        // Check if backend is reachable
        const apiBase = await getCachedApiBase();
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 5000);
        
        const response = await fetch(`${apiBase}/health`, {
          method: 'GET',
          signal: controller.signal
        }).catch(() => null);
        
        clearTimeout(timeout);
        backendAvailable = response?.ok || false;
      } catch {
        backendAvailable = false;
      }
    }

    setStatus({ hasInternet, backendAvailable });
    return { hasInternet, backendAvailable };
  };

  useEffect(() => {
    const handleOnline = () => {
      console.log('🌐 Internet connection restored');
      checkConnectivity();
      setIsRetrying(false);
    };

    const handleOffline = () => {
      console.log('📴 Internet connection lost');
      setStatus({ hasInternet: false, backendAvailable: false });
    };

    // Listen for online/offline events
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    // Initial check
    checkConnectivity();

    // Periodic check every 30 seconds if offline
    const interval = setInterval(() => {
      if (!status.hasInternet || !status.backendAvailable) {
        checkConnectivity();
      }
    }, 30000);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      clearInterval(interval);
    };
  }, [status.hasInternet, status.backendAvailable]);

  const handleRetry = async () => {
    setIsRetrying(true);
    const { hasInternet, backendAvailable } = await checkConnectivity();
    
    if (hasInternet && backendAvailable) {
      // Both are available, reload the page
      window.location.reload();
    } else {
      setIsRetrying(false);
    }
  };

  // Don't render anything if fully online
  if (status.hasInternet && status.backendAvailable) {
    return null;
  }

  const isFullyOffline = !status.hasInternet;
  const Icon = isFullyOffline ? WifiOff : Cloud;
  const title = isFullyOffline ? "You're Offline" : "Backend Unavailable";
  const message = isFullyOffline 
    ? "It looks like you've lost your internet connection. Please check your network settings and try again."
    : "Unable to reach the server. The backend may be temporarily unavailable or under maintenance.";

  return (
    <div className="fixed inset-0 bg-gray-900 bg-opacity-95 flex items-center justify-center z-50 p-4">
      <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl max-w-md w-full p-8 text-center">
        {/* Icon */}
        <div className="flex justify-center mb-6">
          <div className={`${isFullyOffline ? 'bg-orange-100 dark:bg-orange-900' : 'bg-yellow-100 dark:bg-yellow-900'} rounded-full p-6`}>
            <Icon className={`h-16 w-16 ${isFullyOffline ? 'text-orange-600 dark:text-orange-400' : 'text-yellow-600 dark:text-yellow-400'}`} />
          </div>
        </div>

        {/* Message */}
        <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-3">
          {title}
        </h2>
        <p className="text-gray-600 dark:text-gray-400 mb-4">
          {message}
        </p>

        {/* Connection Status Details */}
        <div className="bg-gray-50 dark:bg-gray-700 rounded-lg p-4 mb-6 space-y-2 text-sm">
          <div className="flex items-center justify-between">
            <span className="text-gray-600 dark:text-gray-400">Internet:</span>
            <span className={`font-medium ${status.hasInternet ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
              {status.hasInternet ? '✓ Connected' : '✗ Offline'}
            </span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-gray-600 dark:text-gray-400">Backend:</span>
            <span className={`font-medium ${status.backendAvailable ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
              {status.backendAvailable ? '✓ Available' : '✗ Unavailable'}
            </span>
          </div>
        </div>

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
