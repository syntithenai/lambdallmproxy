/**
 * TTS Stop Button with Voice Settings
 * 
 * A split button that:
 * - Primary action: Stop TTS playback
 * - Secondary action (arrow): Open voice settings dialog
 */

import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTTS } from '../contexts/TTSContext';
import { TTSPlaybackDialog } from './TTSPlaybackDialog';

interface TTSStopButtonProps {
  className?: string;
  showLabel?: boolean;
  variant?: 'fixed' | 'inline';
}

export const TTSStopButton: React.FC<TTSStopButtonProps> = ({ 
  className = '', 
  showLabel = true,
  variant = 'inline'
}) => {
  const { state, stop } = useTTS();
  const [showDialog, setShowDialog] = useState(false);
  const navigate = useNavigate();

  if (!state.isPlaying) return null;

  const handleStop = () => {
    console.log('🛑 TTSStopButton: Stop button clicked');
    console.log('   - state.isPlaying:', state.isPlaying);
    stop();
    console.log('🛑 TTSStopButton: stop() function called');
  };

  // Check if using browser speech provider
  const activeProviderName = state.activeProvider?.toLowerCase() || '';
  const currentProviderName = state.currentProvider?.toLowerCase() || '';
  const isBrowserProvider = 
    activeProviderName.includes('browser') || 
    activeProviderName.includes('speech') ||
    currentProviderName === 'browser';

  const handleOpenSettings = () => {
    if (isBrowserProvider) {
      // For browser: stop playback, navigate to settings, and scroll to TTS section
      stop();
      navigate('/settings?tab=tts');
      // Scroll to bottom after navigation
      setTimeout(() => {
        window.scrollTo({ top: document.body.scrollHeight, behavior: 'smooth' });
      }, 100);
    } else {
      // For other providers: show voice settings dialog
      setShowDialog(true);
    }
  };

  const baseClasses = variant === 'fixed'
    ? "fixed top-4 right-20 z-[60] shadow-lg"
    : "shadow-md";

  return (
    <>
      <div className={`${baseClasses} ${className}`}>
        <div className="flex items-center bg-red-600 hover:bg-red-700 transition-colors animate-pulse rounded-lg">
          {/* Stop Button */}
          <button
            onClick={handleStop}
            className="flex items-center gap-2 px-4 py-2 text-white"
            title="Stop reading aloud"
            aria-label="Stop Reading"
          >
            {state.isLoadingAudio ? (
              // Loading spinner while waiting for first audio chunk
              <svg className="w-4 h-4 md:w-5 md:h-5 animate-spin" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
              </svg>
            ) : (
              // Stop icon once audio is playing
              <svg className="w-4 h-4 md:w-5 md:h-5" fill="currentColor" viewBox="0 0 24 24">
                <rect x="6" y="6" width="12" height="12" />
              </svg>
            )}
            {showLabel && (
              <span className="hidden md:inline">
                {state.isLoadingAudio ? 'Loading...' : 'Stop Reading'}
              </span>
            )}
          </button>

          {/* Settings Button (Cog) - Always visible, behavior depends on provider */}
          <button
            onClick={handleOpenSettings}
            className="px-2 py-2 text-white border-l border-red-700 hover:bg-red-700"
            title={isBrowserProvider ? "TTS settings" : "Voice settings"}
            aria-label={isBrowserProvider ? "Open TTS settings" : "Open voice settings"}
          >
            <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M11.49 3.17c-.38-1.56-2.6-1.56-2.98 0a1.532 1.532 0 01-2.286.948c-1.372-.836-2.942.734-2.106 2.106.54.886.061 2.042-.947 2.287-1.561.379-1.561 2.6 0 2.978a1.532 1.532 0 01.947 2.287c-.836 1.372.734 2.942 2.106 2.106a1.532 1.532 0 012.287.947c.379 1.561 2.6 1.561 2.978 0a1.533 1.533 0 012.287-.947c1.372.836 2.942-.734 2.106-2.106a1.533 1.533 0 01.947-2.287c1.561-.379 1.561-2.6 0-2.978a1.532 1.532 0 01-.947-2.287c.836-1.372-.734-2.942-2.106-2.106a1.532 1.532 0 01-2.287-.947zM10 13a3 3 0 100-6 3 3 0 000 6z" clipRule="evenodd" />
            </svg>
          </button>
        </div>
      </div>

      {/* Playback Settings Dialog - Only for providers with real-time controls */}
      <TTSPlaybackDialog 
        isOpen={showDialog} 
        onClose={() => setShowDialog(false)} 
      />
    </>
  );
};

/**
 * Global TTS Stop Button
 * 
 * Fixed position button that appears in the header when TTS is playing
 */
export const GlobalTTSStopButton: React.FC = () => {
  return <TTSStopButton variant="fixed" showLabel={true} />;
};
