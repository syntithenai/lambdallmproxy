/**
 * Swipe Gesture Hook - Touch and Mouse Swipe Detection
 */

import { useState, useRef, useCallback, useEffect } from 'react';

export type SwipeDirection = 'left' | 'right' | null;

export interface SwipeState {
  direction: SwipeDirection;
  progress: number; // 0-1 (threshold = 0.3 typically)
  isSwiping: boolean;
}

export interface SwipeOptions {
  threshold?: number;        // Minimum distance in pixels to trigger (default: 100)
  onSwipeStart?: () => void;
  onSwipeEnd?: (direction: SwipeDirection) => void;
  onSwipeProgress?: (progress: number, direction: SwipeDirection) => void;
}

/**
 * Hook for detecting swipe gestures on an element
 */
export function useSwipeGesture(options: SwipeOptions = {}) {
  const {
    threshold = 100,
    onSwipeStart,
    onSwipeEnd,
    onSwipeProgress
  } = options;

  const [swipeState, setSwipeState] = useState<SwipeState>({
    direction: null,
    progress: 0,
    isSwiping: false
  });

  const startX = useRef<number>(0);
  const currentX = useRef<number>(0);
  const startY = useRef<number>(0);
  const isSwiping = useRef<boolean>(false);
  const elementRef = useRef<HTMLElement | null>(null);

  /**
   * Handle swipe start (touch or mouse)
   */
  const handleStart = useCallback((clientX: number, clientY: number) => {
    startX.current = clientX;
    startY.current = clientY;
    currentX.current = clientX;
    isSwiping.current = false;

    setSwipeState({
      direction: null,
      progress: 0,
      isSwiping: false
    });

    if (onSwipeStart) {
      onSwipeStart();
    }
  }, [onSwipeStart]);

  /**
   * Handle swipe move (touch or mouse)
   */
  const handleMove = useCallback((clientX: number, clientY: number) => {
    if (startX.current === 0) return;

    currentX.current = clientX;

    const deltaX = clientX - startX.current;
    const deltaY = clientY - startY.current;

    // Check if horizontal swipe (ignore vertical scrolling)
    if (!isSwiping.current && Math.abs(deltaX) > Math.abs(deltaY) && Math.abs(deltaX) > 10) {
      isSwiping.current = true;
    }

    if (isSwiping.current) {
      const direction: SwipeDirection = deltaX > 0 ? 'right' : 'left';
      const progress = Math.min(Math.abs(deltaX) / threshold, 1);

      setSwipeState({
        direction,
        progress,
        isSwiping: true
      });

      if (onSwipeProgress) {
        onSwipeProgress(progress, direction);
      }
    }
  }, [threshold, onSwipeProgress]);

  /**
   * Handle swipe end (touch or mouse)
   */
  const handleEnd = useCallback(() => {
    if (!isSwiping.current) {
      startX.current = 0;
      startY.current = 0;
      return;
    }

    const deltaX = currentX.current - startX.current;
    const direction: SwipeDirection = deltaX > 0 ? 'right' : 'left';
    const distance = Math.abs(deltaX);

    // Reset state
    isSwiping.current = false;
    startX.current = 0;
    startY.current = 0;
    currentX.current = 0;

    setSwipeState({
      direction: null,
      progress: 0,
      isSwiping: false
    });

    // Trigger callback if threshold met
    if (distance >= threshold && onSwipeEnd) {
      onSwipeEnd(direction);
    } else if (onSwipeEnd) {
      onSwipeEnd(null); // Swipe cancelled
    }
  }, [threshold, onSwipeEnd]);

  /**
   * Touch event handlers
   */
  const handleTouchStart = useCallback((e: TouchEvent) => {
    const touch = e.touches[0];
    handleStart(touch.clientX, touch.clientY);
  }, [handleStart]);

  const handleTouchMove = useCallback((e: TouchEvent) => {
    const touch = e.touches[0];
    handleMove(touch.clientX, touch.clientY);

    // Prevent default scroll when swiping horizontally
    if (isSwiping.current) {
      e.preventDefault();
    }
  }, [handleMove]);

  const handleTouchEnd = useCallback(() => {
    handleEnd();
  }, [handleEnd]);

  /**
   * Mouse event handlers
   */
  const handleMouseDown = useCallback((e: MouseEvent) => {
    handleStart(e.clientX, e.clientY);
  }, [handleStart]);

  const handleMouseMove = useCallback((e: MouseEvent) => {
    handleMove(e.clientX, e.clientY);
  }, [handleMove]);

  const handleMouseUp = useCallback(() => {
    handleEnd();
  }, [handleEnd]);

  /**
   * Attach/detach event listeners
   */
  const attachListeners = useCallback((element: HTMLElement) => {
    elementRef.current = element;

    // Touch events
    element.addEventListener('touchstart', handleTouchStart, { passive: true });
    element.addEventListener('touchmove', handleTouchMove, { passive: false });
    element.addEventListener('touchend', handleTouchEnd, { passive: true });

    // Mouse events
    element.addEventListener('mousedown', handleMouseDown);
    
    // Mouse move/up on document (to handle dragging outside element)
    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
  }, [handleTouchStart, handleTouchMove, handleTouchEnd, handleMouseDown, handleMouseMove, handleMouseUp]);

  const detachListeners = useCallback(() => {
    const element = elementRef.current;
    if (!element) return;

    // Touch events
    element.removeEventListener('touchstart', handleTouchStart);
    element.removeEventListener('touchmove', handleTouchMove);
    element.removeEventListener('touchend', handleTouchEnd);

    // Mouse events
    element.removeEventListener('mousedown', handleMouseDown);
    document.removeEventListener('mousemove', handleMouseMove);
    document.removeEventListener('mouseup', handleMouseUp);
  }, [handleTouchStart, handleTouchMove, handleTouchEnd, handleMouseDown, handleMouseMove, handleMouseUp]);

  /**
   * Cleanup on unmount
   */
  useEffect(() => {
    return () => {
      detachListeners();
    };
  }, [detachListeners]);

  return {
    swipeState,
    attachListeners,
    detachListeners
  };
}
