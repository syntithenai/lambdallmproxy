import React, { createContext, useContext, useState, useCallback } from 'react';

interface Toast {
  id: string;
  message: string;
  type: 'success' | 'error' | 'warning' | 'info';
  duration?: number;
}

interface ToastContextType {
  showToast: (message: string, type?: Toast['type'], duration?: number) => void;
  showError: (message: string) => void;
  showSuccess: (message: string) => void;
  showWarning: (message: string) => void;
  showInfo: (message: string) => void;
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

  const showToast = useCallback((message: string, type: Toast['type'] = 'info', duration: number = 5000) => {
    const id = `toast-${Date.now()}-${Math.random()}`;
    const toast: Toast = { id, message, type, duration };
    
    setToasts((prev) => [...prev, toast]);

    if (duration > 0) {
      setTimeout(() => removeToast(id), duration);
    }
  }, [removeToast]);

  const showError = useCallback((message: string) => showToast(message, 'error', 7000), [showToast]);
  const showSuccess = useCallback((message: string) => showToast(message, 'success', 3000), [showToast]);
  const showWarning = useCallback((message: string) => showToast(message, 'warning', 5000), [showToast]);
  const showInfo = useCallback((message: string) => showToast(message, 'info', 4000), [showToast]);

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
    <ToastContext.Provider value={{ showToast, showError, showSuccess, showWarning, showInfo }}>
      {children}
      
      {/* Toast Container */}
      <div className="fixed top-4 right-4 z-50 flex flex-col gap-2 max-w-md">
        {toasts.map((toast) => (
          <div key={toast.id} className={getToastStyles(toast.type)}>
            <span className="text-xl font-bold">{getIcon(toast.type)}</span>
            <div className="flex-1">
              <p className="text-sm font-medium">{toast.message}</p>
            </div>
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
