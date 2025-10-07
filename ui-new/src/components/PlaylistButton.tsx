import React, { useState } from 'react';
import { usePlaylist } from '../contexts/PlaylistContext';
import { PlaylistDialog } from './PlaylistDialog';

export const PlaylistButton: React.FC = () => {
  const { playlist, isPlaying, currentTrack, togglePlayPause, nextTrack, previousTrack } = usePlaylist();
  const [showDialog, setShowDialog] = useState(false);

  if (playlist.length === 0) {
    return null; // Don't show button if playlist is empty
  }

  return (
    <>
      <div className="flex items-center gap-1 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-lg overflow-hidden">
        {/* Previous Track Button */}
        <button
          onClick={previousTrack}
          className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
          title="Previous track"
        >
          <svg className="w-5 h-5 text-gray-700 dark:text-gray-300" fill="currentColor" viewBox="0 0 24 24">
            <path d="M6 6h2v12H6V6zm3.5 6l8.5 6V6l-8.5 6z"/>
          </svg>
        </button>

        {/* Play/Pause Button with Track Info */}
        <button
          onClick={togglePlayPause}
          className="flex items-center gap-2 px-3 py-2 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors min-w-[200px]"
          title={isPlaying ? 'Pause' : 'Play'}
        >
          {isPlaying ? (
            <svg className="w-5 h-5 text-gray-700 dark:text-gray-300" fill="currentColor" viewBox="0 0 24 24">
              <path d="M6 4h4v16H6V4zm8 0h4v16h-4V4z"/>
            </svg>
          ) : (
            <svg className="w-5 h-5 text-gray-700 dark:text-gray-300" fill="currentColor" viewBox="0 0 24 24">
              <path d="M8 5v14l11-7z"/>
            </svg>
          )}
          <div className="flex flex-col items-start flex-1 min-w-0">
            <span className="text-xs font-medium text-gray-900 dark:text-gray-100 truncate w-full">
              {currentTrack ? currentTrack.title : 'No track selected'}
            </span>
            {currentTrack?.channel && (
              <span className="text-xs text-gray-500 dark:text-gray-400 truncate w-full">
                {currentTrack.channel}
              </span>
            )}
          </div>
        </button>

        {/* Next Track Button */}
        <button
          onClick={nextTrack}
          className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
          title="Next track"
        >
          <svg className="w-5 h-5 text-gray-700 dark:text-gray-300" fill="currentColor" viewBox="0 0 24 24">
            <path d="M16 18h2V6h-2v12zM6 18l8.5-6L6 6v12z"/>
          </svg>
        </button>

        {/* Open Playlist Dialog Button */}
        <button
          onClick={() => setShowDialog(true)}
          className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors border-l border-gray-300 dark:border-gray-600"
          title="View playlist"
        >
          <div className="flex items-center gap-1">
            <svg className="w-5 h-5 text-gray-700 dark:text-gray-300" fill="currentColor" viewBox="0 0 24 24">
              <path d="M15 6H3v2h12V6zm0 4H3v2h12v-2zM3 16h8v-2H3v2zM17 6v8.18c-.31-.11-.65-.18-1-.18-1.66 0-3 1.34-3 3s1.34 3 3 3 3-1.34 3-3V8h3V6h-5z"/>
            </svg>
            <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
              {playlist.length}
            </span>
          </div>
        </button>
      </div>

      {/* Playlist Dialog */}
      <PlaylistDialog isOpen={showDialog} onClose={() => setShowDialog(false)} />
    </>
  );
};
