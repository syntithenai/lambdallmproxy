import React, { useEffect } from 'react';
import { useDialogClose } from '../hooks/useDialogClose';

interface ConfirmDialogProps {
  isOpen: boolean;
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  onConfirm: () => void;
  onCancel: () => void;
  variant?: 'danger' | 'warning' | 'info';
}

/**
 * Reusable confirmation dialog component
 * Features:
 * - Keyboard support (Enter to confirm, Esc to cancel)
 * - Click outside to cancel
 * - Color variants for different contexts
 * - Focus management
 */
export const ConfirmDialog: React.FC<ConfirmDialogProps> = ({
  isOpen,
  title,
  message,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  onConfirm,
  onCancel,
  variant = 'warning'
}) => {
  const dialogRef = useDialogClose(isOpen, onCancel);

  // Keyboard event handler
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        onConfirm();
      } else if (e.key === 'Escape') {
        e.preventDefault();
        onCancel();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onConfirm, onCancel]);

  if (!isOpen) return null;

  // Variant-specific button styles
  const variantStyles = {
    danger: 'bg-red-600 hover:bg-red-700 focus:ring-red-500',
    warning: 'bg-yellow-600 hover:bg-yellow-700 focus:ring-yellow-500',
    info: 'bg-blue-600 hover:bg-blue-700 focus:ring-blue-500'
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
      <div 
        ref={dialogRef}
        className="bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-md w-full"
        role="dialog"
        aria-labelledby="confirm-dialog-title"
        aria-describedby="confirm-dialog-description"
      >
        <div className="p-6">
          {/* Title */}
          <h3 
            id="confirm-dialog-title"
            className="text-lg font-semibold text-gray-900 dark:text-white mb-2"
          >
            {title}
          </h3>
          
          {/* Message */}
          <p 
            id="confirm-dialog-description"
            className="text-gray-600 dark:text-gray-400 mb-6"
          >
            {message}
          </p>
          
          {/* Action Buttons */}
          <div className="flex justify-end gap-3">
            <button
              onClick={onCancel}
              className="px-4 py-2 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors focus:outline-none focus:ring-2 focus:ring-gray-400"
              aria-label={cancelLabel}
            >
              {cancelLabel}
            </button>
            <button
              onClick={onConfirm}
              className={`px-4 py-2 text-white rounded-lg transition-colors focus:outline-none focus:ring-2 ${variantStyles[variant]}`}
              aria-label={confirmLabel}
              autoFocus
            >
              {confirmLabel}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
