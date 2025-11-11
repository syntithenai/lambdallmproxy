import React, { createContext, useContext, useState, useCallback, useEffect } from 'react';

interface Toast {
  id: string;
  message: string;
  type: 'success' | 'error' | 'warning' | 'info';
  duration?: number;
  progress?: number; // 0-100 for progress bar
  action?: {
    label: string;
    onClick: () => void;
  };
}

interface ToastContextType {
  showToast: (message: string, type?: Toast['type'], duration?: number) => void;
  showPersistentToast: (message: string, type?: Toast['type'], action?: Toast['action']) => string;
  removeToast: (id: string) => void;
  updateToast: (id: string, message: string, progress?: number) => void;
  showError: (message: string) => void;
  showSuccess: (message: string) => void;
  showWarning: (message: string) => void;
  showInfo: (message: string) => void;
  clearAllToasts: () => void;
}

const ToastContext = createContext<ToastContextType | undefined>(undefined);

export const useToast = () => {
  const context = useContext(ToastContext);
  if (!context) {
    throw new Error('useToast must be used within a ToastProvider');
  }
  return context;
};

export const ToastProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const removeToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((toast) => toast.id !== id));
  }, []);

  const updateToast = useCallback((id: string, message: string, progress?: number) => {
    setToasts((prev) => prev.map((toast) => 
      toast.id === id ? { ...toast, message, ...(progress !== undefined && { progress }) } : toast
    ));
  }, []);

  const clearAllToasts = useCallback(() => {
    setToasts([]);
  }, []);

  const showToast = useCallback((message: string, type: Toast['type'] = 'info', duration: number = 5000) => {
    const id = `toast-${Date.now()}-${Math.random()}`;
    const toast: Toast = { id, message, type, duration };
    
    setToasts((prev) => [...prev, toast]);

    if (duration > 0) {
      setTimeout(() => removeToast(id), duration);
    }
  }, [removeToast]);

  const showPersistentToast = useCallback((message: string, type: Toast['type'] = 'info', action?: Toast['action']): string => {
    const id = `toast-${Date.now()}-${Math.random()}`;
    const toast: Toast = { id, message, type, duration: 0, action };
    
    setToasts((prev) => [...prev, toast]);
    
    return id; // Return ID so caller can remove it later
  }, []);

  const showError = useCallback((message: string) => showToast(message, 'error', 7000), [showToast]);
  const showSuccess = useCallback((message: string) => showToast(message, 'success', 3000), [showToast]);
  const showWarning = useCallback((message: string) => showToast(message, 'warning', 5000), [showToast]);
  const showInfo = useCallback((message: string) => showToast(message, 'info', 4000), [showToast]);

  // Listen for global toast events from non-React code (e.g., googleDriveSync)
  useEffect(() => {
    const handleShowToast = (event: Event) => {
      const customEvent = event as CustomEvent;
      const { message, type = 'info', duration = 5000, persistent = false, id } = customEvent.detail;
      
      if (persistent && id) {
        // For persistent toasts with specific ID, check if already exists
        setToasts((prev) => {
          const exists = prev.find(t => t.id === id);
          if (exists) return prev; // Don't add duplicate
          
          const toast: Toast = { id, message, type, duration: 0 };
          return [...prev, toast];
        });
      } else {
        showToast(message, type, duration);
      }
    };

    const handleRemoveToast = (event: Event) => {
      const customEvent = event as CustomEvent;
      const { id } = customEvent.detail;
      if (id) {
        removeToast(id);
      }
    };

    window.addEventListener('show-toast', handleShowToast);
    window.addEventListener('remove-toast', handleRemoveToast);

    return () => {
      window.removeEventListener('show-toast', handleShowToast);
      window.removeEventListener('remove-toast', handleRemoveToast);
    };
  }, [showToast, removeToast]);

  const getToastStyles = (type: Toast['type']) => {
    const baseStyles = 'flex items-start gap-3 p-4 rounded-lg shadow-lg border backdrop-blur-sm transition-all duration-300 animate-slide-in';
    const typeStyles = {
      success: 'bg-green-50/95 dark:bg-green-900/95 border-green-200 dark:border-green-700 text-green-800 dark:text-green-100',
      error: 'bg-red-50/95 dark:bg-red-900/95 border-red-200 dark:border-red-700 text-red-800 dark:text-red-100',
      warning: 'bg-yellow-50/95 dark:bg-yellow-900/95 border-yellow-200 dark:border-yellow-700 text-yellow-800 dark:text-yellow-100',
      info: 'bg-blue-50/95 dark:bg-blue-900/95 border-blue-200 dark:border-blue-700 text-blue-800 dark:text-blue-100'
    };
    return `${baseStyles} ${typeStyles[type]}`;
  };

  const getIcon = (type: Toast['type']) => {
    const icons = {
      success: '✓',
      error: '✕',
      warning: '⚠',
      info: 'ℹ'
    };
    return icons[type];
  };

  return (
    <ToastContext.Provider value={{ showToast, showPersistentToast, removeToast, updateToast, showError, showSuccess, showWarning, showInfo, clearAllToasts }}>
      {children}
      
      {/* Toast Container */}
      <div className="fixed top-4 right-4 z-50 flex flex-col gap-2 max-w-md">
        {toasts.map((toast) => (
          <div key={toast.id} className={getToastStyles(toast.type)}>
            <span className="text-xl font-bold">{getIcon(toast.type)}</span>
            <div className="flex-1">
              <p className="text-sm font-medium">{toast.message}</p>
              {toast.progress !== undefined && (
                <div className="mt-2 w-full bg-current/20 rounded-full h-2 overflow-hidden">
                  <div 
                    className="bg-current h-full transition-all duration-300 ease-out rounded-full"
                    style={{ width: `${Math.min(100, Math.max(0, toast.progress))}%` }}
                  />
                </div>
              )}
            </div>
            {toast.action && (
              <button
                onClick={toast.action.onClick}
                className="px-3 py-1 text-xs font-semibold rounded bg-current/10 hover:bg-current/20 transition-colors"
              >
                {toast.action.label}
              </button>
            )}
            <button
              onClick={() => removeToast(toast.id)}
              className="text-current opacity-50 hover:opacity-100 transition-opacity"
            >
              ✕
            </button>
          </div>
        ))}
      </div>
      
      <style>{`
        @keyframes slide-in {
          from {
            transform: translateX(100%);
            opacity: 0;
          }
          to {
            transform: translateX(0);
            opacity: 1;
          }
        }
        .animate-slide-in {
          animation: slide-in 0.3s ease-out;
        }
      `}</style>
    </ToastContext.Provider>
  );
};
