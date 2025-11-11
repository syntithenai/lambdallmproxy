import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { usePlaylist } from '../contexts/PlaylistContext';
import { usePlayer } from '../contexts/PlayerContext';

// Format seconds to MM:SS
function formatTime(seconds: number): string {
  if (!seconds || !isFinite(seconds)) return '0:00';
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

/**
 * Compact media player controls for the header.
 * Shows play/pause/next/prev controls and current track title.
 * Only visible when playlist has items.
 */
export const MediaPlayerButton: React.FC = () => {
  const { playlist, isPlaying, currentTrack, togglePlayPause, nextTrack, previousTrack } = usePlaylist();
  const { isLoading, currentTime, duration } = usePlayer();
  const navigate = useNavigate();

  if (playlist.length === 0) {
    return null; // Don't show button if playlist is empty
  }

  // Handle play/pause - just toggle play state (BackgroundPlayer handles playback)
  const handlePlayPause = () => {
    console.log('[PlaylistButton] Play/Pause clicked - current isPlaying:', isPlaying);
    togglePlayPause();
  };

  // Handle previous track
  const handlePrevious = () => {
    previousTrack();
  };

  // Handle next track
  const handleNext = () => {
    nextTrack();
  };

  return (
    <>
      <div className="flex items-center gap-0.5 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-lg overflow-hidden shadow-sm">
        {/* Previous Track Button */}
        <button
          onClick={handlePrevious}
          className="p-1.5 sm:p-2 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
          title="Previous track"
        >
          <svg className="w-4 h-4 sm:w-5 sm:h-5 text-gray-700 dark:text-gray-300" fill="currentColor" viewBox="0 0 24 24">
            <path d="M6 6h2v12H6V6zm3.5 6l8.5 6V6l-8.5 6z"/>
          </svg>
        </button>

        {/* Play/Pause Button */}
        <button
          onClick={handlePlayPause}
          className={`p-1.5 sm:p-2 transition-colors ${
            isPlaying 
              ? 'bg-blue-500 hover:bg-blue-600 text-white' 
              : 'bg-green-500 hover:bg-green-600 text-white'
          }`}
          title={isPlaying ? 'Pause' : 'Play'}
        >
          {isPlaying ? (
            <svg className="w-4 h-4 sm:w-5 sm:h-5" fill="currentColor" viewBox="0 0 24 24">
              <path d="M6 4h4v16H6V4zm8 0h4v16h-4V4z"/>
            </svg>
          ) : (
            <svg className="w-4 h-4 sm:w-5 sm:h-5" fill="currentColor" viewBox="0 0 24 24">
              <path d="M8 5v14l11-7z"/>
            </svg>
          )}
        </button>

        {/* Next Track Button */}
        <button
          onClick={handleNext}
          className="p-1.5 sm:p-2 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
          title="Next track"
        >
          <svg className="w-4 h-4 sm:w-5 sm:h-5 text-gray-700 dark:text-gray-300" fill="currentColor" viewBox="0 0 24 24">
            <path d="M16 18h2V6h-2v12zM6 18l8.5-6L6 6v12z"/>
          </svg>
        </button>

        {/* Current Track Title and Time - Hidden on mobile */}
        <div className="hidden sm:flex flex-col items-start px-2 py-1 min-w-0 max-w-[150px] md:max-w-[250px]">
          {isLoading && isPlaying ? (
            <div className="flex items-center gap-1">
              <svg className="animate-spin h-3 w-3 text-gray-700 dark:text-gray-300" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
              </svg>
              <span className="text-xs text-gray-500 dark:text-gray-400">Loading...</span>
            </div>
          ) : (
            <>
              <span className="text-xs text-gray-700 dark:text-gray-300 truncate w-full">
                {currentTrack?.title ? currentTrack.title.slice(0, 10) : 'No track'}
              </span>
              {duration > 0 && (
                <span className="text-[10px] text-gray-500 dark:text-gray-400 font-mono">
                  {formatTime(currentTime)} / {formatTime(duration)}
                </span>
              )}
            </>
          )}
        </div>

        {/* Open Music Page Button */}
        <button
          onClick={(e) => {
            e.stopPropagation();
            console.log('[PlaylistButton] Opening music page, playlist size:', playlist.length);
            navigate('/music');
          }}
          className="p-1.5 sm:p-2 bg-purple-500 hover:bg-purple-600 text-white transition-colors flex items-center gap-1"
          title="View full music page"
        >
          <svg className="w-4 h-4 sm:w-5 sm:h-5" fill="currentColor" viewBox="0 0 24 24">
            <path d="M15 6H3v2h12V6zm0 4H3v2h12v-2zM3 16h8v-2H3v2zM17 6v8.18c-.31-.11-.65-.18-1-.18-1.66 0-3 1.34-3 3s1.34 3 3 3 3-1.34 3-3V8h3V6h-5z"/>
          </svg>
          <span className="hidden md:inline text-xs font-medium">
            {playlist.length}
          </span>
        </button>
      </div>
    </>
  );
};

// Export alias for backward compatibility
export const PlaylistButton = MediaPlayerButton;
