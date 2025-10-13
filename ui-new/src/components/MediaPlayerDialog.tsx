import React, { useRef, useEffect, useState, useMemo } from 'react';
import ReactPlayer from 'react-player';
import { usePlaylist } from '../contexts/PlaylistContext';
import type { PlaylistTrack } from '../contexts/PlaylistContext';
import { useDialogClose } from '../hooks/useDialogClose';
import { useCast } from '../contexts/CastContext';

interface MediaPlayerDialogProps {
  isOpen: boolean;
  onClose: () => void;
}

/**
 * Full-featured media player dialog with:
 * - Embedded YouTube video player
 * - Video metadata display
 * - Date-grouped playlist
 * - Save/load playlist functionality
 */
export const MediaPlayerDialog: React.FC<MediaPlayerDialogProps> = ({ isOpen, onClose }) => {
  const dialogRef = useDialogClose(isOpen, onClose);
  const { 
    playlist, 
    currentTrackIndex, 
    isPlaying,
    playTrack, 
    removeTrack, 
    clearPlaylist,
    currentTrack,
    savedPlaylists,
    savePlaylistAs,
    loadPlaylist,
    deletePlaylist,
    nextTrack,
    play,
    pause,
    shuffleMode,
    toggleShuffle,
    repeatMode,
    setRepeatMode,
    playbackRate,
    setPlaybackRate,
    volume,
    setVolume
  } = usePlaylist();

  const {
    isAvailable: isCastAvailable,
    deviceName: castDeviceName,
    castVideo,
    sendVideoCommand,
    isCastingVideo
  } = useCast();

  const playerRef = useRef<any>(null);
  const [showSaveDialog, setShowSaveDialog] = useState(false);
  const [showLoadDialog, setShowLoadDialog] = useState(false);
  const [playlistName, setPlaylistName] = useState('');
  const [searchQuery, setSearchQuery] = useState('');

  // Keyboard shortcuts
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  // Filter playlist by search query
  const filteredPlaylist = useMemo(() => {
    if (!searchQuery.trim()) return playlist;
    
    const query = searchQuery.toLowerCase();
    return playlist.filter(track => 
      track.title.toLowerCase().includes(query) ||
      track.channel?.toLowerCase().includes(query) ||
      track.description?.toLowerCase().includes(query)
    );
  }, [playlist, searchQuery]);

  // Group filtered playlist by date
  const groupedPlaylist = groupByDate(filteredPlaylist);
  
  const matchCount = filteredPlaylist.length;

  return (
    <div 
      ref={dialogRef} 
      className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50 p-2 sm:p-4"
    >
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-2xl w-full max-w-4xl max-h-[95vh] sm:max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex justify-between items-center p-3 sm:p-4 border-b border-gray-200 dark:border-gray-700">
          <h2 className="text-lg sm:text-xl font-bold text-gray-900 dark:text-gray-100">
            🎵 YouTube Playlist
            <span className="ml-2 text-sm font-normal text-gray-600 dark:text-gray-400">
              {searchQuery ? (
                <>({matchCount} of {playlist.length} {playlist.length === 1 ? 'video' : 'videos'})</>
              ) : (
                <>({playlist.length} {playlist.length === 1 ? 'video' : 'videos'})</>
              )}
            </span>
          </h2>
          <div className="flex items-center gap-2">
            {playlist.length > 0 && (
              <button
                onClick={() => {
                  if (confirm('Clear entire playlist? This cannot be undone.')) {
                    clearPlaylist();
                  }
                }}
                className="px-2 sm:px-3 py-1 sm:py-1.5 text-xs sm:text-sm text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 rounded transition-colors"
              >
                Clear All
              </button>
            )}
            <button
              onClick={onClose}
              className="text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 p-1"
              title="Close (Esc)"
            >
              <svg className="w-5 h-5 sm:w-6 sm:h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        {/* Video Player */}
        {currentTrack && (
          <div className="w-full bg-black flex-shrink-0 relative">
            <div className={`aspect-video w-full ${isCastingVideo ? 'opacity-30' : ''}`}>
              {React.createElement(ReactPlayer as any, {
                ref: playerRef,
                url: currentTrack.url,
                playing: isPlaying && !isCastingVideo,
                controls: false,
                width: '100%',
                height: '100%',
                volume: volume,
                playbackRate: playbackRate,
                onPlay: () => play(),
                onPause: () => pause(),
                onEnded: () => nextTrack(),
                onError: (error: any) => console.error('Player error:', error)
              })}
            </div>
            
            {/* Casting Overlay */}
            {isCastingVideo && (
              <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/50 backdrop-blur-sm">
                <div className="text-center p-6">
                  <div className="text-6xl mb-4 animate-pulse">📺</div>
                  <h3 className="text-white text-xl font-semibold mb-2">Casting to {castDeviceName}</h3>
                  <p className="text-gray-300 text-sm mb-4">{currentTrack.title}</p>
                  <div className="flex gap-3 justify-center">
                    <button
                      onClick={() => sendVideoCommand(isPlaying ? 'pause' : 'play')}
                      className="px-4 py-2 bg-white/20 hover:bg-white/30 text-white rounded transition-colors"
                    >
                      {isPlaying ? '⏸ Pause' : '▶ Play'}
                    </button>
                    <button
                      onClick={() => sendVideoCommand('stop')}
                      className="px-4 py-2 bg-red-500/80 hover:bg-red-600/80 text-white rounded transition-colors"
                    >
                      ⏹ Stop Casting
                    </button>
                  </div>
                </div>
              </div>
            )}
            
            {/* Video Metadata */}
            <div className="p-3 sm:p-4 bg-gray-900 text-white">
              <h3 className="font-semibold text-base sm:text-lg mb-1">{currentTrack.title}</h3>
              <div className="flex flex-wrap items-center gap-2 text-xs sm:text-sm text-gray-300">
                {currentTrack.channel && (
                  <>
                    <span className="flex items-center gap-1">
                      👤 {currentTrack.channel}
                    </span>
                    <span>•</span>
                  </>
                )}
                {currentTrack.duration && (
                  <>
                    <span className="flex items-center gap-1">
                      ⏱️ {currentTrack.duration}
                    </span>
                    <span>•</span>
                  </>
                )}
                <span className="flex items-center gap-1">
                  📅 Added {formatDate(currentTrack.addedAt)}
                </span>
              </div>
              {currentTrack.description && (
                <p className="mt-2 text-xs sm:text-sm text-gray-400 line-clamp-2">
                  {currentTrack.description}
                </p>
              )}
            </div>
          </div>
        )}

        {/* Playlist Controls */}
        {playlist.length > 0 && (
          <div className="p-3 sm:p-4 border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900/50">
            {/* Search and Controls Row */}
            <div className="flex flex-wrap items-center gap-2 mb-3">
              {/* Search Input */}
              <div className="flex-1 min-w-[200px] flex items-center gap-2">
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="🔍 Search playlist..."
                  className="flex-1 px-3 py-1.5 text-xs sm:text-sm border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
                />
                {searchQuery && (
                  <button
                    onClick={() => setSearchQuery('')}
                    className="px-2 py-1 text-xs text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100"
                    title="Clear search"
                  >
                    ✕
                  </button>
                )}
              </div>
            </div>

            {/* Playback Controls Row */}
            <div className="flex flex-wrap items-center gap-2">
              {/* Shuffle Button */}
              <button
                onClick={() => toggleShuffle()}
                className={`px-3 py-1.5 text-xs sm:text-sm rounded transition-colors ${
                  shuffleMode
                    ? 'bg-purple-500 hover:bg-purple-600 text-white'
                    : 'bg-gray-200 hover:bg-gray-300 dark:bg-gray-700 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-300'
                }`}
                title="Toggle shuffle"
              >
                🔀 Shuffle
              </button>

              {/* Repeat Button */}
              <button
                onClick={() => {
                  const modes: Array<'none' | 'all' | 'one'> = ['none', 'all', 'one'];
                  const currentIndex = modes.indexOf(repeatMode);
                  const nextMode = modes[(currentIndex + 1) % modes.length];
                  setRepeatMode(nextMode);
                }}
                className="px-3 py-1.5 text-xs sm:text-sm bg-gray-200 hover:bg-gray-300 dark:bg-gray-700 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-300 rounded transition-colors"
                title={`Repeat: ${repeatMode}`}
              >
                {repeatMode === 'none' && '↻ Repeat: Off'}
                {repeatMode === 'all' && '🔁 Repeat: All'}
                {repeatMode === 'one' && '🔂 Repeat: One'}
              </button>

              {/* Playback Speed */}
              <select
                value={playbackRate}
                onChange={(e) => setPlaybackRate(parseFloat(e.target.value))}
                className="px-3 py-1.5 text-xs sm:text-sm bg-gray-200 hover:bg-gray-300 dark:bg-gray-700 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-300 rounded transition-colors"
                title="Playback speed"
              >
                <option value={0.25}>⚡ 0.25x</option>
                <option value={0.5}>⚡ 0.5x</option>
                <option value={0.75}>⚡ 0.75x</option>
                <option value={1}>⚡ 1x</option>
                <option value={1.25}>⚡ 1.25x</option>
                <option value={1.5}>⚡ 1.5x</option>
                <option value={1.75}>⚡ 1.75x</option>
                <option value={2}>⚡ 2x</option>
              </select>

              {/* Volume */}
              <div className="flex items-center gap-2">
                <span className="text-xs sm:text-sm text-gray-600 dark:text-gray-400">🔊</span>
                <input
                  type="range"
                  min="0"
                  max="1"
                  step="0.1"
                  value={volume}
                  onChange={(e) => setVolume(parseFloat(e.target.value))}
                  className="w-16 sm:w-24"
                  title="Volume"
                />
              </div>

              {/* Chromecast Button */}
              {isCastAvailable && currentTrack && (
                <button
                  onClick={() => {
                    if (isCastingVideo) {
                      sendVideoCommand('stop');
                    } else {
                      const position = playerRef.current?.getCurrentTime() || 0;
                      castVideo({
                        videoId: currentTrack.videoId,
                        url: currentTrack.url,
                        title: currentTrack.title,
                        channel: currentTrack.channel,
                        thumbnail: currentTrack.thumbnail,
                        duration: currentTrack.duration
                      }, position);
                    }
                  }}
                  className={`px-3 py-1.5 text-xs sm:text-sm rounded transition-colors ${
                    isCastingVideo
                      ? 'bg-blue-500 hover:bg-blue-600 text-white'
                      : 'bg-gray-200 hover:bg-gray-300 dark:bg-gray-700 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-300'
                  }`}
                  title={isCastingVideo ? `Stop casting to ${castDeviceName}` : `Cast to ${castDeviceName}`}
                >
                  📺 {isCastingVideo ? 'Stop Cast' : 'Cast'}
                </button>
              )}
            </div>

            {/* Save/Load Row */}
            <div className="flex flex-wrap items-center gap-2 mt-3">
              <button
                className="px-3 py-1.5 text-xs sm:text-sm bg-blue-500 hover:bg-blue-600 text-white rounded transition-colors"
                onClick={() => setShowSaveDialog(true)}
              >
                💾 Save Playlist
              </button>
              <button
                className="px-3 py-1.5 text-xs sm:text-sm bg-green-500 hover:bg-green-600 text-white rounded transition-colors"
                onClick={() => setShowLoadDialog(true)}
              >
                📂 Load Playlist
              </button>
            </div>
          </div>
        )}

        {/* Save Playlist Dialog */}
        {showSaveDialog && (
          <div className="absolute inset-0 bg-black bg-opacity-50 flex items-center justify-center z-10 p-4">
            <div className="bg-white dark:bg-gray-800 rounded-lg p-4 sm:p-6 max-w-md w-full">
              <h3 className="text-lg font-bold mb-4 text-gray-900 dark:text-gray-100">Save Playlist</h3>
              <input
                type="text"
                placeholder="Enter playlist name..."
                value={playlistName}
                onChange={(e) => setPlaylistName(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded mb-4 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
                autoFocus
              />
              <div className="flex gap-2">
                <button
                  onClick={async () => {
                    if (playlistName.trim()) {
                      try {
                        await savePlaylistAs(playlistName);
                        setPlaylistName('');
                        setShowSaveDialog(false);
                        alert('Playlist saved successfully!');
                      } catch (error) {
                        alert('Failed to save playlist: ' + (error as Error).message);
                      }
                    }
                  }}
                  className="flex-1 px-4 py-2 bg-blue-500 hover:bg-blue-600 text-white rounded transition-colors"
                  disabled={!playlistName.trim()}
                >
                  Save
                </button>
                <button
                  onClick={() => {
                    setPlaylistName('');
                    setShowSaveDialog(false);
                  }}
                  className="flex-1 px-4 py-2 bg-gray-500 hover:bg-gray-600 text-white rounded transition-colors"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Load Playlist Dialog */}
        {showLoadDialog && (
          <div className="absolute inset-0 bg-black bg-opacity-50 flex items-center justify-center z-10 p-4">
            <div className="bg-white dark:bg-gray-800 rounded-lg p-4 sm:p-6 max-w-md w-full">
              <h3 className="text-lg font-bold mb-4 text-gray-900 dark:text-gray-100">Load Playlist</h3>
              {savedPlaylists.length === 0 ? (
                <p className="text-gray-600 dark:text-gray-400 mb-4">No saved playlists found.</p>
              ) : (
                <div className="space-y-2 mb-4 max-h-64 overflow-y-auto">
                  {savedPlaylists.map((p) => (
                    <div
                      key={p.id}
                      className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-700 rounded hover:bg-gray-100 dark:hover:bg-gray-600"
                    >
                      <div className="flex-1 min-w-0">
                        <h4 className="font-medium text-gray-900 dark:text-gray-100 truncate">{p.name}</h4>
                        <p className="text-xs text-gray-600 dark:text-gray-400">
                          {p.trackCount} tracks • {new Date(p.updatedAt).toLocaleDateString()}
                        </p>
                      </div>
                      <div className="flex gap-2">
                        <button
                          onClick={async () => {
                            try {
                              await loadPlaylist(p.id);
                              setShowLoadDialog(false);
                            } catch (error) {
                              alert('Failed to load playlist: ' + (error as Error).message);
                            }
                          }}
                          className="px-3 py-1 text-xs bg-green-500 hover:bg-green-600 text-white rounded"
                        >
                          Load
                        </button>
                        <button
                          onClick={async () => {
                            if (confirm(`Delete "${p.name}"?`)) {
                              try {
                                await deletePlaylist(p.id);
                              } catch (error) {
                                alert('Failed to delete playlist: ' + (error as Error).message);
                              }
                            }
                          }}
                          className="px-3 py-1 text-xs bg-red-500 hover:bg-red-600 text-white rounded"
                        >
                          Delete
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
              <button
                onClick={() => setShowLoadDialog(false)}
                className="w-full px-4 py-2 bg-gray-500 hover:bg-gray-600 text-white rounded transition-colors"
              >
                Close
              </button>
            </div>
          </div>
        )}

        {/* Playlist Items */}
        <div className="flex-1 overflow-y-auto p-3 sm:p-4">
          {playlist.length === 0 ? (
            <div className="text-center py-12 text-gray-500 dark:text-gray-400">
              <svg className="w-16 h-16 mx-auto mb-4 opacity-50" fill="currentColor" viewBox="0 0 24 24">
                <path d="M15 6H3v2h12V6zm0 4H3v2h12v-2zM3 16h8v-2H3v2zM17 6v8.18c-.31-.11-.65-.18-1-.18-1.66 0-3 1.34-3 3s1.34 3 3 3 3-1.34 3-3V8h3V6h-5z"/>
              </svg>
              <p className="text-lg font-medium">Playlist is empty</p>
              <p className="text-sm mt-2">Search for YouTube videos using the chat to add tracks</p>
            </div>
          ) : (
            <div className="space-y-4">
              {groupedPlaylist.map(([dateLabel, tracks]) => (
                <div key={dateLabel}>
                  {/* Date Header */}
                  <div className="sticky top-0 bg-white dark:bg-gray-800 py-2 mb-2 border-b border-gray-200 dark:border-gray-700">
                    <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 flex items-center gap-2">
                      📅 {dateLabel}
                      <span className="text-xs font-normal text-gray-500 dark:text-gray-400">
                        ({tracks.length} {tracks.length === 1 ? 'video' : 'videos'})
                      </span>
                    </h3>
                  </div>

                  {/* Tracks in this date group */}
                  <div className="space-y-2">
                    {tracks.map((track) => {
                      const trackIndex = playlist.findIndex(t => t.id === track.id);
                      const isCurrentTrack = trackIndex === currentTrackIndex;
                      
                      return (
                        <div
                          key={track.id}
                          className={`flex items-center gap-2 sm:gap-3 p-2 sm:p-3 rounded-lg transition-all ${
                            isCurrentTrack
                              ? 'bg-blue-50 dark:bg-blue-900/20 border-2 border-blue-500 shadow-md'
                              : 'bg-gray-50 dark:bg-gray-700 hover:bg-gray-100 dark:hover:bg-gray-600 border-2 border-transparent'
                          }`}
                        >
                          {/* Play Button / Track Number */}
                          <button
                            onClick={() => playTrack(trackIndex)}
                            className="flex-shrink-0 w-8 h-8 sm:w-10 sm:h-10 flex items-center justify-center rounded-full hover:bg-white dark:hover:bg-gray-800 transition-colors"
                            title="Play this track"
                          >
                            {isCurrentTrack && isPlaying ? (
                              <svg className="w-4 h-4 sm:w-5 sm:h-5 text-blue-600 dark:text-blue-400" fill="currentColor" viewBox="0 0 24 24">
                                <path d="M6 4h4v16H6V4zm8 0h4v16h-4V4z"/>
                              </svg>
                            ) : (
                              <svg className="w-4 h-4 sm:w-5 sm:h-5 text-gray-600 dark:text-gray-300" fill="currentColor" viewBox="0 0 24 24">
                                <path d="M8 5v14l11-7z"/>
                              </svg>
                            )}
                          </button>

                          {/* Thumbnail */}
                          {track.thumbnail && (
                            <img
                              src={track.thumbnail}
                              alt={track.title}
                              className="w-16 h-10 sm:w-20 sm:h-12 object-cover rounded flex-shrink-0"
                              loading="lazy"
                            />
                          )}

                          {/* Track Info */}
                          <div className="flex-1 min-w-0">
                            <h4 className="font-medium text-sm sm:text-base text-gray-900 dark:text-gray-100 truncate">
                              {track.title}
                            </h4>
                            <div className="flex items-center gap-1 sm:gap-2 text-xs sm:text-sm text-gray-600 dark:text-gray-400">
                              {track.channel && <span className="truncate">{track.channel}</span>}
                              {track.duration && (
                                <>
                                  <span className="hidden sm:inline">•</span>
                                  <span className="hidden sm:inline">{track.duration}</span>
                                </>
                              )}
                            </div>
                          </div>

                          {/* Delete Button */}
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              if (confirm(`Remove "${track.title}" from playlist?`)) {
                                removeTrack(track.id);
                              }
                            }}
                            className="flex-shrink-0 p-1.5 sm:p-2 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 rounded transition-colors"
                            title="Remove from playlist"
                          >
                            <svg className="w-4 h-4 sm:w-5 sm:h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                            </svg>
                          </button>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

/**
 * Group playlist tracks by date added
 */
function groupByDate(playlist: PlaylistTrack[]): Array<[string, PlaylistTrack[]]> {
  const groups = new Map<string, PlaylistTrack[]>();
  
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);
  
  const weekAgo = new Date(today);
  weekAgo.setDate(weekAgo.getDate() - 7);
  
  playlist.forEach(track => {
    const trackDate = new Date(track.addedAt);
    trackDate.setHours(0, 0, 0, 0);
    
    let label: string;
    if (trackDate.getTime() === today.getTime()) {
      label = 'Today';
    } else if (trackDate.getTime() === yesterday.getTime()) {
      label = 'Yesterday';
    } else if (trackDate > weekAgo) {
      label = 'This Week';
    } else {
      label = trackDate.toLocaleDateString('en-US', { 
        month: 'short', 
        day: 'numeric',
        year: trackDate.getFullYear() !== today.getFullYear() ? 'numeric' : undefined
      });
    }
    
    if (!groups.has(label)) {
      groups.set(label, []);
    }
    groups.get(label)!.push(track);
  });
  
  return Array.from(groups.entries());
}

/**
 * Format timestamp for display
 */
function formatDate(timestamp: number): string {
  const date = new Date(timestamp);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);
  
  if (diffMins < 1) return 'just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;
  
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

// Export alias for backward compatibility
export const PlaylistDialog = MediaPlayerDialog;
