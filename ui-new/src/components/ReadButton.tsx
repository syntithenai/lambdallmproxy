/**
 * ReadButton Component
 * 
 * Provides read-aloud functionality for text content
 * Supports multiple variants: icon, button, and floating action button (FAB)
 */

import React, { useCallback, useEffect, useState } from 'react';
import { useTTS } from '../contexts/TTSContext';
import { TTS_FEATURE_ENABLED } from '../types/tts';

interface ReadButtonProps {
  text: string;
  variant?: 'icon' | 'button' | 'fab';
  size?: 'sm' | 'md' | 'lg';
  onStart?: () => void;
  onEnd?: () => void;
  className?: string;
}

export const ReadButton: React.FC<ReadButtonProps> = ({
  text,
  variant = 'icon',
  size = 'md',
  onStart,
  onEnd,
  className = ''
}) => {
  // Don't render if TTS is disabled
  if (!TTS_FEATURE_ENABLED) {
    return null;
  }

  const { state, speak, stop } = useTTS();
  
  // Local state for additional safety
  const [localIsReading, setLocalIsReading] = useState(false);
  
  // Use global TTS state but with local override capability
  const isReading = state.isPlaying || localIsReading;
  const [isTransitioning, setIsTransitioning] = React.useState(false);
  
  // Debug logging
  console.log('ReadButton render - isReading:', isReading, 'state.isPlaying:', state.isPlaying, 'localIsReading:', localIsReading, 'isTransitioning:', isTransitioning);

  // Watch for state changes and sync local state
  useEffect(() => {
    setLocalIsReading(state.isPlaying);
  }, [state.isPlaying]);

  // Fallback mechanism - force reset local state after speech should have finished
  useEffect(() => {
    if (localIsReading && !state.isPlaying) {
      // If local state thinks we're reading but global state says we're not, reset local state
      console.log('ReadButton: Syncing local state with global state');
      setLocalIsReading(false);
    }
  }, [localIsReading, state.isPlaying]);

  const handleClick = useCallback(async () => {
    // Prevent double-clicks during state transition
    if (isTransitioning) {
      console.log('ReadButton: Ignoring click during transition');
      return;
    }
    
    if (isReading) {
      console.log('ReadButton: Stop clicked');
      setIsTransitioning(true);
      setLocalIsReading(false); // Immediately update local state
      stop();
      // Reset transition flag after a short delay
      setTimeout(() => setIsTransitioning(false), 500);
      // DO NOT call onEnd - that's only for natural completion, not manual stop
    } else {
      console.log('ReadButton: Start clicked, text length:', text.length);
      setIsTransitioning(true);
      setLocalIsReading(true); // Immediately update local state
      onStart?.();
      
      try {
        console.log('ReadButton: Calling speak()...');
        await speak(text, { 
          onStart: () => {
            console.log('TTS started - setting localIsReading to true');
            setLocalIsReading(true);
            setIsTransitioning(false); // Clear transition flag once speech starts
          },
          onEnd: () => {
            console.log('TTS ended - setting localIsReading to false');
            setLocalIsReading(false); // Reset local state
            setIsTransitioning(false);
            onEnd?.();
          },
          onError: (error) => {
            console.error('TTS error in callback:', error);
            setLocalIsReading(false); // Reset local state on error
            setIsTransitioning(false);
            // DO NOT call onEnd on error - errors include intentional stops
          }
        });
        console.log('ReadButton: speak() promise resolved');
        setIsTransitioning(false); // Reset after speak completes
      } catch (error) {
        console.error('TTS error:', error);
        setLocalIsReading(false); // Reset local state on error
        setIsTransitioning(false);
        // DO NOT call onEnd on error - errors include intentional stops
      }
    }
  }, [isReading, isTransitioning, text, speak, stop, onStart, onEnd]);

  // Don't render if TTS is disabled
  if (!state.isEnabled) return null;

  // Size classes - Made larger for better visibility
  const sizeClasses = {
    sm: {
      icon: 'w-4 h-4',
      button: 'px-2 py-1 text-xs',
      fab: 'w-10 h-10'
    },
    md: {
      icon: 'w-5 h-5', // Increased from w-4 h-4
      button: 'px-3 py-1.5 text-sm',
      fab: 'w-12 h-12'
    },
    lg: {
      icon: 'w-6 h-6', // Increased from w-5 h-5
      button: 'px-4 py-2 text-base',
      fab: 'w-16 h-16' // Increased from w-14 h-14
    }
  };

  const iconSize = sizeClasses[size].icon;

  // Play/Stop icons
  const PlayIcon = () => (
    <svg className={iconSize} fill="currentColor" viewBox="0 0 24 24">
      <path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02z"/>
    </svg>
  );

  const StopIcon = () => (
    <svg className={iconSize} fill="currentColor" viewBox="0 0 24 24">
      <rect x="6" y="6" width="12" height="12" />
    </svg>
  );

  // Icon variant (minimal)
  if (variant === 'icon') {
    return (
      <button
        onClick={handleClick}
        className={`p-2 rounded-md hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors ${className}`}
        title={isReading ? 'Stop reading (If stuck, wait 30s or refresh page)' : 'Read aloud'}
        disabled={isTransitioning || (state.isPlaying && !isReading)}
      >
        {isReading ? (
          <StopIcon />
        ) : (
          <PlayIcon />
        )}
      </button>
    );
  }

  // Button variant (with text)
  if (variant === 'button') {
    return (
      <button
        onClick={handleClick}
        className={`${sizeClasses[size].button} rounded-lg flex items-center gap-2 transition-colors ${
          isReading 
            ? 'bg-red-600 text-white hover:bg-red-700'
            : 'bg-blue-600 text-white hover:bg-blue-700'
        } ${className}`}
        title={isReading ? 'Stop reading (If stuck, wait 30s or refresh page)' : 'Read aloud'}
        disabled={isTransitioning || (state.isPlaying && !isReading)}
      >
        {isReading ? (
          <>
            <StopIcon />
            Stop
          </>
        ) : (
          <>
            <PlayIcon />
            Read
          </>
        )}
      </button>
    );
  }

  // FAB variant (floating action button)
  if (variant === 'fab') {
    return (
      <button
        onClick={handleClick}
        className={`${sizeClasses[size].fab} fixed bottom-20 right-6 rounded-full shadow-lg flex items-center justify-center z-40 transition-colors ${
          isReading
            ? 'bg-red-600 hover:bg-red-700'
            : 'bg-blue-600 hover:bg-blue-700'
        } text-white ${className}`}
        title={isReading ? 'Stop reading' : 'Read aloud'}
        disabled={isTransitioning || (state.isPlaying && !isReading)}
      >
        {isReading ? <StopIcon /> : <PlayIcon />}
      </button>
    );
  }

  return null;
};

/**
 * Global Stop Button Component
 * 
 * Shows in the header when any TTS is playing
 */
export { GlobalTTSStopButton } from './TTSStopButton';