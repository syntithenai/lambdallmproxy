import React, { useState } from 'react';
import { usePlaylist } from '../contexts/PlaylistContext';
import { MediaPlayerDialog } from './MediaPlayerDialog';

/**
 * Compact media player controls for the header.
 * Shows play/pause/next/prev controls and current track title.
 * Only visible when playlist has items.
 */
export const MediaPlayerButton: React.FC = () => {
  const { playlist, isPlaying, currentTrack, togglePlayPause, nextTrack, previousTrack } = usePlaylist();
  const [showDialog, setShowDialog] = useState(false);

  if (playlist.length === 0) {
    return null; // Don't show button if playlist is empty
  }

  return (
    <>
      <div className="flex items-center gap-0.5 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-lg overflow-hidden shadow-sm">
        {/* Previous Track Button */}
        <button
          onClick={previousTrack}
          className="p-1.5 sm:p-2 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
          title="Previous track"
        >
          <svg className="w-4 h-4 sm:w-5 sm:h-5 text-gray-700 dark:text-gray-300" fill="currentColor" viewBox="0 0 24 24">
            <path d="M6 6h2v12H6V6zm3.5 6l8.5 6V6l-8.5 6z"/>
          </svg>
        </button>

        {/* Play/Pause Button */}
        <button
          onClick={togglePlayPause}
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
          onClick={nextTrack}
          className="p-1.5 sm:p-2 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
          title="Next track"
        >
          <svg className="w-4 h-4 sm:w-5 sm:h-5 text-gray-700 dark:text-gray-300" fill="currentColor" viewBox="0 0 24 24">
            <path d="M16 18h2V6h-2v12zM6 18l8.5-6L6 6v12z"/>
          </svg>
        </button>

        {/* Current Track Title - Hidden on mobile */}
        <div className="hidden sm:flex items-center px-2 py-1 min-w-0 max-w-[150px] md:max-w-[250px]">
          <span className="text-xs text-gray-700 dark:text-gray-300 truncate">
            {currentTrack?.title || 'No track'}
          </span>
        </div>

        {/* Open Playlist Dialog Button */}
        <button
          onClick={() => setShowDialog(true)}
          className="p-1.5 sm:p-2 bg-purple-500 hover:bg-purple-600 text-white transition-colors flex items-center gap-1"
          title="View playlist"
        >
          <svg className="w-4 h-4 sm:w-5 sm:h-5" fill="currentColor" viewBox="0 0 24 24">
            <path d="M15 6H3v2h12V6zm0 4H3v2h12v-2zM3 16h8v-2H3v2zM17 6v8.18c-.31-.11-.65-.18-1-.18-1.66 0-3 1.34-3 3s1.34 3 3 3 3-1.34 3-3V8h3V6h-5z"/>
          </svg>
          <span className="hidden md:inline text-xs font-medium">
            {playlist.length}
          </span>
        </button>
      </div>

      {/* Media Player Dialog */}
      <MediaPlayerDialog isOpen={showDialog} onClose={() => setShowDialog(false)} />
    </>
  );
};

// Export alias for backward compatibility
export const PlaylistButton = MediaPlayerButton;
