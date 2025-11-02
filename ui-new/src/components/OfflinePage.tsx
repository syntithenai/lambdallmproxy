import { useEffect, useState } from 'react';
import { WifiOff, RefreshCw, Cloud, AlertCircle } from 'lucide-react';

interface ConnectionStatus {
  isOnline: boolean;
  backendAvailable: boolean;
  checking: boolean;
}

export default function OfflinePage() {
  const [status, setStatus] = useState<ConnectionStatus>({
    isOnline: navigator.onLine,
    backendAvailable: false,
    checking: false
  });
  const [retrying, setRetrying] = useState(false);

  const checkConnection = async () => {
    setStatus(prev => ({ ...prev, checking: true }));
    
    // Check if we have internet
    const isOnline = navigator.onLine;
    
    // Check if backend is available
    let backendAvailable = false;
    if (isOnline) {
      try {
        // Try to reach the backend health endpoint
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 5000);
        
        const response = await fetch('/health', {
          method: 'GET',
          signal: controller.signal
        }).catch(() => null);
        
        clearTimeout(timeout);
        backendAvailable = response?.ok || false;
      } catch (error) {
        backendAvailable = false;
      }
    }
    
    setStatus({
      isOnline,
      backendAvailable,
      checking: false
    });
    
    return { isOnline, backendAvailable };
  };

  const handleRetry = async () => {
    setRetrying(true);
    const { isOnline, backendAvailable } = await checkConnection();
    
    if (isOnline && backendAvailable) {
      // Both internet and backend are available - reload the page
      window.location.reload();
    } else {
      setRetrying(false);
    }
  };

  useEffect(() => {
    checkConnection();
    
    // Listen for online/offline events
    const handleOnline = () => checkConnection();
    const handleOffline = () => setStatus(prev => ({ ...prev, isOnline: false, backendAvailable: false }));
    
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    
    // Periodic check every 30 seconds
    const interval = setInterval(checkConnection, 30000);
    
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      clearInterval(interval);
    };
  }, []);

  const getStatusMessage = () => {
    if (!status.isOnline) {
      return {
        icon: WifiOff,
        title: 'No Internet Connection',
        message: 'You appear to be offline. Please check your internet connection and try again.',
        color: 'text-red-600 dark:text-red-400'
      };
    }
    
    if (!status.backendAvailable) {
      return {
        icon: Cloud,
        title: 'Backend Unavailable',
        message: 'Unable to reach the server. The service may be temporarily unavailable.',
        color: 'text-orange-600 dark:text-orange-400'
      };
    }
    
    return {
      icon: AlertCircle,
      title: 'Connection Issue',
      message: 'Having trouble connecting. Please try again.',
      color: 'text-yellow-600 dark:text-yellow-400'
    };
  };

  const statusInfo = getStatusMessage();
  const StatusIcon = statusInfo.icon;

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 flex items-center justify-center p-4">
      <div className="max-w-md w-full bg-white dark:bg-gray-800 rounded-lg shadow-lg p-8 text-center">
        {/* Icon */}
        <div className={`inline-flex items-center justify-center w-20 h-20 rounded-full bg-gray-100 dark:bg-gray-700 mb-6 ${statusInfo.color}`}>
          <StatusIcon size={40} />
        </div>
        
        {/* Title */}
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white mb-3">
          {statusInfo.title}
        </h1>
        
        {/* Message */}
        <p className="text-gray-600 dark:text-gray-400 mb-8">
          {statusInfo.message}
        </p>
        
        {/* Connection Status */}
        <div className="bg-gray-50 dark:bg-gray-700 rounded-lg p-4 mb-6 space-y-2 text-sm">
          <div className="flex items-center justify-between">
            <span className="text-gray-600 dark:text-gray-400">Internet:</span>
            <span className={`font-medium ${status.isOnline ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
              {status.isOnline ? '✓ Connected' : '✗ Offline'}
            </span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-gray-600 dark:text-gray-400">Backend:</span>
            <span className={`font-medium ${status.backendAvailable ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
              {status.checking ? '⋯ Checking' : status.backendAvailable ? '✓ Available' : '✗ Unavailable'}
            </span>
          </div>
        </div>
        
        {/* Retry Button */}
        <button
          onClick={handleRetry}
          disabled={retrying || status.checking}
          className="w-full btn-primary px-6 py-3 rounded-lg font-medium flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <RefreshCw className={retrying || status.checking ? 'animate-spin' : ''} size={20} />
          {retrying || status.checking ? 'Checking Connection...' : 'Retry Connection'}
        </button>
        
        {/* Help Text */}
        <p className="mt-6 text-sm text-gray-500 dark:text-gray-400">
          {!status.isOnline && (
            <>Check your WiFi or mobile data connection</>
          )}
          {status.isOnline && !status.backendAvailable && (
            <>The server may be under maintenance. Please try again in a few moments.</>
          )}
        </p>
      </div>
    </div>
  );
}
