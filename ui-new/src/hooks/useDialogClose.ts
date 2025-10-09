import { useEffect, useCallback, useRef } from 'react';

/**
 * Hook to handle dialog closing on Escape key press and click outside
 * @param isOpen - Whether the dialog is currently open
 * @param onClose - Callback to close the dialog
 * @param closeOnClickOutside - Whether to close on clicking outside (default: true)
 */
export function useDialogClose(
  isOpen: boolean,
  onClose: () => void,
  closeOnClickOutside: boolean = true
) {
  const dialogRef = useRef<HTMLDivElement>(null);

  // Handle Escape key
  const handleEscape = useCallback((event: KeyboardEvent) => {
    if (event.key === 'Escape') {
      onClose();
    }
  }, [onClose]);

  // Handle click outside
  const handleClickOutside = useCallback((event: MouseEvent) => {
    if (!closeOnClickOutside) return;
    
    // Check if click is on the backdrop (not the dialog content)
    if (dialogRef.current && event.target === dialogRef.current) {
      onClose();
    }
  }, [onClose, closeOnClickOutside]);

  useEffect(() => {
    if (!isOpen) return;

    // Add event listeners
    document.addEventListener('keydown', handleEscape);
    document.addEventListener('mousedown', handleClickOutside);

    // Cleanup
    return () => {
      document.removeEventListener('keydown', handleEscape);
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen, handleEscape, handleClickOutside]);

  return dialogRef;
}
