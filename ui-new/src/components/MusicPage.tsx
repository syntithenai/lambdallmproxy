/**
 * Music Page - Full-page music management interface
 * Lists saved playlists in left column, current playlist in right column
 */

import { useState, useEffect } from 'react';
import { usePlaylist } from '../contexts/PlaylistContext';
import { usePlayer } from '../contexts/PlayerContext';
import { useAuth } from '../contexts/AuthContext';
import { Music, Plus, Trash2, Play, Pause, SkipForward, SkipBack, Loader2 } from 'lucide-react';
import { useToast } from './ToastManager';
import { getCurrentApiBase } from '../utils/api';
import { playlistDB } from '../utils/playlistDB';
import type { PlaylistTrack } from '../contexts/PlaylistContext';

// Format seconds to MM:SS
function formatTime(seconds: number): string {
  if (!seconds || !isFinite(seconds)) return '0:00';
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

export default function MusicPage() {
  const { 
    playlist, 
    savedPlaylists, 
    currentTrack,
    isPlaying, 
    togglePlayPause, 
    nextTrack, 
    previousTrack,
    loadPlaylist,
    deletePlaylist,
    refreshSavedPlaylists
  } = usePlaylist();
  
  const { currentTime, duration, isLoading } = usePlayer();
  const { getToken } = useAuth();
  const { showSuccess, showError, showWarning } = useToast();
  
  const [playlistInput, setPlaylistInput] = useState('');
  const [isCreating, setIsCreating] = useState(false);
  const [creatingStatus, setCreatingStatus] = useState('');

  // Load playlists on mount
  useEffect(() => {
    refreshSavedPlaylists();
  }, [refreshSavedPlaylists]);

  /**
   * Create a new playlist using YouTube search via LLM
   */
  const handleCreatePlaylist = async () => {
    const query = playlistInput.trim();
    if (!query) {
      showWarning('Please enter a playlist description');
      return;
    }

    setIsCreating(true);
    setCreatingStatus('Searching for videos...');
    try {
      const token = await getToken();
      if (!token) {
        showError('Please sign in to create playlists');
        setIsCreating(false);
        setCreatingStatus('');
        return;
      }

      console.log('🎵 Creating playlist from query:', query);
      
      // Get API base URL
      const apiUrl = await getCurrentApiBase();
      
      // Call LLM with YouTube search tool to find videos
      const messages = [
        {
          role: 'system' as const,
          content: 'You are a helpful assistant that finds YouTube videos based on user requests. Use the search_youtube tool to find videos. Return a brief response acknowledging the search.'
        },
        {
          role: 'user' as const,
          content: `Find YouTube videos for a playlist about: ${query}. Please search for around 10 relevant videos.`
        }
      ];

      setCreatingStatus('Contacting API...');

      const response = await fetch(`${apiUrl}/chat`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          messages,
          stream: true,
          tools: ['search_youtube'], // Enable YouTube search tool
          temperature: 0.7,
          max_tokens: 2000
        })
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`API request failed: ${response.statusText} - ${errorText}`);
      }

      // Process streaming response
      const reader = response.body?.getReader();
      const decoder = new TextDecoder();
      let foundVideos: PlaylistTrack[] = [];
      let buffer = '';

      if (!reader) {
        throw new Error('No response body reader available');
      }

      setCreatingStatus('Processing results...');

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (!line.trim() || !line.startsWith('data: ')) continue;
          
          const data = line.slice(6);
          if (data === '[DONE]') continue;

          try {
            const parsed = JSON.parse(data);

            // Look for tool call results with YouTube videos
            if (parsed.type === 'tool_result' && parsed.tool === 'search_youtube' && parsed.result) {
              console.log('🎬 Received YouTube search results');
              
              const resultData = typeof parsed.result === 'string' 
                ? JSON.parse(parsed.result) 
                : parsed.result;

              if (resultData.videos && Array.isArray(resultData.videos)) {
                foundVideos = resultData.videos.map((video: any) => ({
                  id: Date.now() + Math.random(),
                  videoId: video.videoId,
                  url: video.url,
                  title: video.title || 'Untitled',
                  description: video.description || '',
                  channel: video.channel || 'Unknown',
                  thumbnail: video.thumbnail || '',
                  addedAt: Date.now()
                }));
                
                console.log(`✅ Found ${foundVideos.length} videos for playlist`);
              }
            }
          } catch (parseError) {
            console.error('Failed to parse SSE data:', parseError);
          }
        }
      }

      // Check if we found any videos
      if (foundVideos.length === 0) {
        showWarning('No videos found for that search. Try a different query.');
        setIsCreating(false);
        setCreatingStatus('');
        return;
      }

      // Save the playlist
      setCreatingStatus(`Saving ${foundVideos.length} videos...`);
      const playlistName = query.length > 50 ? query.substring(0, 50) + '...' : query;
      
      await playlistDB.savePlaylist(playlistName, foundVideos);

      showSuccess(`Created playlist with ${foundVideos.length} videos!`);
      setPlaylistInput('');
      setCreatingStatus('');
      
      // Refresh the playlists list
      await refreshSavedPlaylists();
      
    } catch (error) {
      console.error('Failed to create playlist:', error);
      showError('Failed to create playlist: ' + (error as Error).message);
    } finally {
      setIsCreating(false);
      setCreatingStatus('');
    }
  };

  /**
   * Load a saved playlist
   */
  const handleLoadPlaylist = async (playlistId: number) => {
    try {
      await loadPlaylist(playlistId);
      showSuccess('Playlist loaded');
    } catch (error) {
      console.error('Failed to load playlist:', error);
      showError('Failed to load playlist');
    }
  };

  /**
   * Delete a saved playlist
   */
  const handleDeletePlaylist = async (playlistId: number, playlistName: string) => {
    if (!window.confirm(`Delete playlist "${playlistName}"?`)) return;
    
    try {
      await deletePlaylist(playlistId);
      showSuccess('Playlist deleted');
    } catch (error) {
      console.error('Failed to delete playlist:', error);
      showError('Failed to delete playlist');
    }
  };

  return (
    <div className="flex h-full flex-col md:flex-row gap-4 p-4 bg-gray-50 dark:bg-gray-900">
      {/* Left Column - Saved Playlists */}
      <div className="w-full md:w-1/3 bg-white dark:bg-gray-800 rounded-lg shadow-lg p-4 overflow-auto">
        <div className="flex items-center gap-2 mb-4">
          <Music className="w-6 h-6 text-purple-600" />
          <h2 className="text-xl font-bold text-gray-900 dark:text-gray-100">
            My Playlists
          </h2>
        </div>

        {/* Create Playlist Section */}
        <div className="mb-4 p-3 bg-gray-50 dark:bg-gray-700 rounded-lg">
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
            Create New Playlist
          </label>
          <div className="flex gap-2">
            <input
              type="text"
              value={playlistInput}
              onChange={(e) => setPlaylistInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !isCreating) {
                  handleCreatePlaylist();
                }
              }}
              placeholder="e.g., 80s rock classics, relaxing jazz..."
              className="flex-1 px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-purple-500"
              disabled={isCreating}
            />
            <button
              onClick={handleCreatePlaylist}
              disabled={!playlistInput.trim() || isCreating}
              className="px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-lg disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 transition-colors"
            >
              {isCreating ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Plus className="w-4 h-4" />
              )}
              Create
            </button>
          </div>
          
          {/* Creating status */}
          {isCreating && creatingStatus && (
            <div className="mt-2 text-sm text-purple-600 dark:text-purple-400 flex items-center gap-2">
              <Loader2 className="w-3 h-3 animate-spin" />
              {creatingStatus}
            </div>
          )}
        </div>

        {/* Saved Playlists List */}
        <div className="space-y-2">
          {savedPlaylists.length === 0 ? (
            <p className="text-sm text-gray-500 dark:text-gray-400 text-center py-8">
              No saved playlists yet. Create one above!
            </p>
          ) : (
            savedPlaylists.map((pl) => (
              <div
                key={pl.id}
                className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-700 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-600 transition-colors"
              >
                <button
                  onClick={() => handleLoadPlaylist(pl.id)}
                  className="flex-1 text-left"
                >
                  <div className="font-medium text-gray-900 dark:text-gray-100">
                    {pl.name}
                  </div>
                  <div className="text-xs text-gray-500 dark:text-gray-400">
                    {pl.trackCount} tracks
                  </div>
                </button>
                <button
                  onClick={() => handleDeletePlaylist(pl.id, pl.name)}
                  className="p-2 text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 rounded transition-colors"
                  title="Delete playlist"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            ))
          )}
        </div>
      </div>

      {/* Right Column - Current Playlist */}
      <div className="flex-1 bg-white dark:bg-gray-800 rounded-lg shadow-lg p-4 overflow-auto">
        <h2 className="text-xl font-bold text-gray-900 dark:text-gray-100 mb-4">
          Current Playlist
        </h2>

        {/* Playback Controls */}
        {playlist.length > 0 && (
          <div className="mb-6 p-4 bg-gradient-to-r from-purple-500 to-purple-600 rounded-lg text-white">
            <div className="mb-3">
              <h3 className="font-semibold text-lg truncate">
                {currentTrack?.title || 'No track selected'}
              </h3>
              {currentTrack?.channel && (
                <p className="text-sm text-purple-100 truncate">
                  {currentTrack.channel}
                </p>
              )}
            </div>

            {/* Progress Bar */}
            {duration > 0 && (
              <div className="mb-3">
                <div className="w-full bg-purple-700 rounded-full h-2">
                  <div
                    className="bg-white h-2 rounded-full transition-all"
                    style={{ width: `${(currentTime / duration) * 100}%` }}
                  />
                </div>
                <div className="flex justify-between text-xs text-purple-100 mt-1">
                  <span>{formatTime(currentTime)}</span>
                  <span>{formatTime(duration)}</span>
                </div>
              </div>
            )}

            {/* Control Buttons */}
            <div className="flex items-center justify-center gap-4">
              <button
                onClick={previousTrack}
                className="p-2 hover:bg-purple-600 rounded-full transition-colors"
                title="Previous"
              >
                <SkipBack className="w-6 h-6" />
              </button>
              
              <button
                onClick={togglePlayPause}
                className="p-3 bg-white text-purple-600 hover:bg-purple-50 rounded-full transition-colors"
                title={isPlaying ? 'Pause' : 'Play'}
              >
                {isLoading ? (
                  <Loader2 className="w-8 h-8 animate-spin" />
                ) : isPlaying ? (
                  <Pause className="w-8 h-8" />
                ) : (
                  <Play className="w-8 h-8" />
                )}
              </button>

              <button
                onClick={nextTrack}
                className="p-2 hover:bg-purple-600 rounded-full transition-colors"
                title="Next"
              >
                <SkipForward className="w-6 h-6" />
              </button>
            </div>
          </div>
        )}

        {/* Playlist Tracks */}
        {playlist.length === 0 ? (
          <div className="text-center py-16">
            <Music className="w-16 h-16 text-gray-400 mx-auto mb-4" />
            <p className="text-gray-500 dark:text-gray-400">
              No tracks in playlist. Create or load a playlist to get started!
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            {playlist.map((track) => (
              <div
                key={track.id}
                className={`p-3 rounded-lg transition-colors ${
                  currentTrack?.id === track.id
                    ? 'bg-purple-50 dark:bg-purple-900/20 border-2 border-purple-500'
                    : 'bg-gray-50 dark:bg-gray-700 hover:bg-gray-100 dark:hover:bg-gray-600'
                }`}
              >
                <div className="flex items-start gap-3">
                  {/* Thumbnail */}
                  {track.thumbnail && (
                    <img
                      src={track.thumbnail}
                      alt={track.title}
                      className="w-20 h-14 object-cover rounded"
                    />
                  )}
                  
                  {/* Track Info */}
                  <div className="flex-1 min-w-0">
                    <h4 className="font-medium text-gray-900 dark:text-gray-100 truncate">
                      {track.title}
                    </h4>
                    {track.channel && (
                      <p className="text-sm text-gray-600 dark:text-gray-400 truncate">
                        {track.channel}
                      </p>
                    )}
                    {track.duration && (
                      <p className="text-xs text-gray-500 dark:text-gray-500 mt-1">
                        {track.duration}
                      </p>
                    )}
                  </div>

                  {/* Playing Indicator */}
                  {currentTrack?.id === track.id && isPlaying && (
                    <div className="flex items-center gap-1">
                      <div className="w-1 h-3 bg-purple-500 animate-pulse" />
                      <div className="w-1 h-4 bg-purple-500 animate-pulse" style={{ animationDelay: '0.2s' }} />
                      <div className="w-1 h-3 bg-purple-500 animate-pulse" style={{ animationDelay: '0.4s' }} />
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
