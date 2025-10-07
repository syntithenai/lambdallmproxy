import React, { useRef, useEffect } from 'react';
import { usePlaylist } from '../contexts/PlaylistContext';

interface PlaylistDialogProps {
  isOpen: boolean;
  onClose: () => void;
}

export const PlaylistDialog: React.FC<PlaylistDialogProps> = ({ isOpen, onClose }) => {
  const { 
    playlist, 
    currentTrackIndex, 
    isPlaying,
    playTrack, 
    removeTrack, 
    clearPlaylist,
    currentTrack
  } = usePlaylist();

  const playerRef = useRef<HTMLIFrameElement>(null);

  // Load YouTube IFrame API
  useEffect(() => {
    if (!isOpen || !currentTrack) return;

    // The YouTube player will be embedded via iframe
    // The iframe src will be updated based on current track
  }, [isOpen, currentTrack]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50 p-4">
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-2xl w-full max-w-4xl max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex justify-between items-center p-4 border-b border-gray-200 dark:border-gray-700">
          <h2 className="text-xl font-bold text-gray-900 dark:text-gray-100">
            YouTube Playlist ({playlist.length} {playlist.length === 1 ? 'video' : 'videos'})
          </h2>
          <div className="flex items-center gap-2">
            {playlist.length > 0 && (
              <button
                onClick={() => {
                  if (confirm('Clear entire playlist?')) {
                    clearPlaylist();
                  }
                }}
                className="px-3 py-1.5 text-sm text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 rounded transition-colors"
              >
                Clear All
              </button>
            )}
            <button
              onClick={onClose}
              className="text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 p-1"
            >
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        {/* Video Player */}
        {currentTrack && (
          <div className="w-full bg-black">
            <div className="aspect-video w-full">
              <iframe
                ref={playerRef}
                width="100%"
                height="100%"
                src={`https://www.youtube.com/embed/${currentTrack.videoId}?${isPlaying ? 'autoplay=1&' : ''}rel=0&modestbranding=1`}
                title={currentTrack.title}
                frameBorder="0"
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                allowFullScreen
                className="w-full h-full"
              />
            </div>
            <div className="p-3 bg-gray-900 text-white">
              <h3 className="font-semibold text-lg">{currentTrack.title}</h3>
              {currentTrack.channel && (
                <p className="text-sm text-gray-300">{currentTrack.channel}</p>
              )}
            </div>
          </div>
        )}

        {/* Playlist */}
        <div className="flex-1 overflow-y-auto p-4">
          {playlist.length === 0 ? (
            <div className="text-center py-12 text-gray-500 dark:text-gray-400">
              <svg className="w-16 h-16 mx-auto mb-4 opacity-50" fill="currentColor" viewBox="0 0 24 24">
                <path d="M15 6H3v2h12V6zm0 4H3v2h12v-2zM3 16h8v-2H3v2zM17 6v8.18c-.31-.11-.65-.18-1-.18-1.66 0-3 1.34-3 3s1.34 3 3 3 3-1.34 3-3V8h3V6h-5z"/>
              </svg>
              <p className="text-lg font-medium">Playlist is empty</p>
              <p className="text-sm mt-2">Search for YouTube videos using the chat to add tracks</p>
            </div>
          ) : (
            <div className="space-y-2">
              {playlist.map((track, index) => (
                <div
                  key={track.id}
                  className={`flex items-center gap-3 p-3 rounded-lg transition-colors ${
                    index === currentTrackIndex
                      ? 'bg-blue-50 dark:bg-blue-900/20 border-2 border-blue-500'
                      : 'bg-gray-50 dark:bg-gray-700 hover:bg-gray-100 dark:hover:bg-gray-600'
                  }`}
                >
                  {/* Track Number / Play Button */}
                  <button
                    onClick={() => playTrack(index)}
                    className="flex-shrink-0 w-10 h-10 flex items-center justify-center rounded-full hover:bg-white dark:hover:bg-gray-800 transition-colors"
                    title="Play this track"
                  >
                    {index === currentTrackIndex && isPlaying ? (
                      <svg className="w-5 h-5 text-blue-600 dark:text-blue-400" fill="currentColor" viewBox="0 0 24 24">
                        <path d="M6 4h4v16H6V4zm8 0h4v16h-4V4z"/>
                      </svg>
                    ) : (
                      <span className="text-sm font-medium text-gray-600 dark:text-gray-300">
                        {index + 1}
                      </span>
                    )}
                  </button>

                  {/* Thumbnail */}
                  {track.thumbnail && (
                    <img
                      src={track.thumbnail}
                      alt={track.title}
                      className="w-20 h-12 object-cover rounded flex-shrink-0"
                    />
                  )}

                  {/* Track Info */}
                  <div className="flex-1 min-w-0">
                    <h4 className="font-medium text-gray-900 dark:text-gray-100 truncate">
                      {track.title}
                    </h4>
                    <div className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400">
                      {track.channel && <span className="truncate">{track.channel}</span>}
                      {track.duration && (
                        <>
                          <span>•</span>
                          <span>{track.duration}</span>
                        </>
                      )}
                    </div>
                  </div>

                  {/* Delete Button */}
                  <button
                    onClick={() => removeTrack(track.id)}
                    className="flex-shrink-0 p-2 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 rounded transition-colors"
                    title="Remove from playlist"
                  >
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                    </svg>
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-gray-200 dark:border-gray-700">
          <button
            onClick={onClose}
            className="w-full btn-primary"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
