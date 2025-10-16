import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import type { ReactNode } from 'react';
import { playlistDB } from '../utils/playlistDB';

export interface PlaylistTrack {
  id: string;
  videoId: string;
  url: string;
  title: string;
  description?: string;
  duration?: string;
  channel?: string;
  thumbnail?: string;
  addedAt: number;
}

interface SavedPlaylistInfo {
  id: number;
  name: string;
  trackCount: number;
  createdAt: number;
  updatedAt: number;
}

interface PlaylistContextType {
  playlist: PlaylistTrack[];
  currentTrackIndex: number | null;
  isPlaying: boolean;
  addTrack: (track: Omit<PlaylistTrack, 'id' | 'addedAt'>) => void;
  addTracks: (tracks: Omit<PlaylistTrack, 'id' | 'addedAt'>[]) => void;
  addTracksToStart: (tracks: Omit<PlaylistTrack, 'id' | 'addedAt'>[]) => void;
  removeTrack: (id: string) => void;
  clearPlaylist: () => void;
  playTrack: (index: number) => void;
  playTrackByVideoId: (videoId: string) => boolean;
  nextTrack: () => void;
  previousTrack: () => void;
  togglePlayPause: () => void;
  play: () => void;
  pause: () => void;
  currentTrack: PlaylistTrack | null;
  
  // Named playlists
  savedPlaylists: SavedPlaylistInfo[];
  savePlaylistAs: (name: string) => Promise<void>;
  loadPlaylist: (id: number) => Promise<void>;
  deletePlaylist: (id: number) => Promise<void>;
  refreshSavedPlaylists: () => Promise<void>;
  
  // Playback controls
  shuffleMode: boolean;
  toggleShuffle: () => void;
  repeatMode: 'none' | 'all' | 'one';
  setRepeatMode: (mode: 'none' | 'all' | 'one') => void;
  playbackRate: number;
  setPlaybackRate: (rate: number) => void;
  volume: number;
  setVolume: (volume: number) => void;
  videoQuality: string;
  setVideoQuality: (quality: string) => void;
}

const PlaylistContext = createContext<PlaylistContextType | undefined>(undefined);

export const usePlaylist = () => {
  const context = useContext(PlaylistContext);
  if (!context) {
    throw new Error('usePlaylist must be used within PlaylistProvider');
  }
  return context;
};

interface PlaylistProviderProps {
  children: ReactNode;
}

export const PlaylistProvider: React.FC<PlaylistProviderProps> = ({ children }) => {
  const [playlist, setPlaylist] = useState<PlaylistTrack[]>([]);
  const [currentTrackIndex, setCurrentTrackIndex] = useState<number | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [savedPlaylists, setSavedPlaylists] = useState<SavedPlaylistInfo[]>([]);
  const [isInitialized, setIsInitialized] = useState(false);
  
  // Playback controls state
  const [shuffleMode, setShuffleMode] = useState(false);
  const [shuffleIndices, setShuffleIndices] = useState<number[]>([]);
  const [repeatMode, setRepeatModeState] = useState<'none' | 'all' | 'one'>('none');
  const [playbackRate, setPlaybackRateState] = useState(1);
  const [volume, setVolumeState] = useState(1);
  const [videoQuality, setVideoQualityState] = useState('auto');

  // Load preferences from localStorage
  useEffect(() => {
    try {
      const savedRate = localStorage.getItem('playbackRate');
      if (savedRate) setPlaybackRateState(parseFloat(savedRate));
      
      const savedVolume = localStorage.getItem('volume');
      if (savedVolume) setVolumeState(parseFloat(savedVolume));
      
      const savedRepeat = localStorage.getItem('repeatMode');
      if (savedRepeat && (savedRepeat === 'none' || savedRepeat === 'all' || savedRepeat === 'one')) {
        setRepeatModeState(savedRepeat);
      }
      
      const savedShuffle = localStorage.getItem('shuffleMode');
      if (savedShuffle) setShuffleMode(savedShuffle === 'true');
      
      const savedQuality = localStorage.getItem('videoQuality');
      if (savedQuality) setVideoQualityState(savedQuality);
    } catch (error) {
      console.error('Failed to load preferences:', error);
    }
  }, []);

  // Load playlist from IndexedDB on mount
  useEffect(() => {
    const loadPlaylist = async () => {
      try {
        const { tracks, currentIndex } = await playlistDB.loadCurrentPlaylist();
        setPlaylist(tracks);
        setCurrentTrackIndex(currentIndex);
        setIsInitialized(true);
      } catch (error) {
        console.error('Failed to load playlist:', error);
        setIsInitialized(true);
      }
    };
    
    loadPlaylist();
  }, []);

  // Load saved playlists list on mount
  useEffect(() => {
    refreshSavedPlaylists();
  }, []);

  // Save playlist to IndexedDB whenever it changes (after initialization)
  // Debounced to avoid excessive writes
  useEffect(() => {
    if (!isInitialized) return;
    
    const savePlaylist = async () => {
      try {
        // Only use IndexedDB - localStorage has quota limits
        await playlistDB.saveCurrentPlaylist(playlist, currentTrackIndex);
      } catch (error) {
        console.error('Failed to save playlist:', error);
      }
    };
    
    // Debounce saves by 500ms to avoid excessive writes
    const timeoutId = setTimeout(() => {
      savePlaylist();
    }, 500);
    
    return () => clearTimeout(timeoutId);
  }, [playlist, currentTrackIndex, isInitialized]);

  const addTrack = useCallback((track: Omit<PlaylistTrack, 'id' | 'addedAt'>) => {
    const newTrack: PlaylistTrack = {
      ...track,
      id: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      addedAt: Date.now()
    };
    setPlaylist(prev => [...prev, newTrack]);
  }, []);

  const addTracks = useCallback((tracks: Omit<PlaylistTrack, 'id' | 'addedAt'>[]) => {
    setPlaylist(prev => {
      const result: PlaylistTrack[] = [];
      const existingVideoIds = new Set(prev.map(t => t.videoId));
      const newVideoIds = new Set<string>();
      
      // Process new tracks
      tracks.forEach((track, index) => {
        // Skip if already in playlist or already processed in this batch
        if (existingVideoIds.has(track.videoId) || newVideoIds.has(track.videoId)) {
          return;
        }
        
        newVideoIds.add(track.videoId);
        result.push({
          ...track,
          id: `${Date.now()}-${index}-${Math.random().toString(36).substr(2, 9)}`,
          addedAt: Date.now()
        });
      });
      
      // Add new tracks at top, then existing tracks
      const combined = [...result, ...prev];
      
      // Limit playlist to 400 items to prevent UI lockup
      return combined.slice(0, 400);
    });
  }, []);

  const addTracksToStart = useCallback((tracks: Omit<PlaylistTrack, 'id' | 'addedAt'>[]) => {
    setPlaylist(prev => {
      const movedTracks: PlaylistTrack[] = [];
      const newTracks: PlaylistTrack[] = [];
      const remainingTracks: PlaylistTrack[] = [];
      const processedVideoIds = new Set<string>();
      
      // Separate tracks into: existing (to move), new, and remaining
      tracks.forEach((track, index) => {
        if (processedVideoIds.has(track.videoId)) {
          return; // Skip duplicates within the new batch
        }
        processedVideoIds.add(track.videoId);
        
        const existingIndex = prev.findIndex(t => t.videoId === track.videoId);
        if (existingIndex !== -1) {
          // Track exists - move it to top with updated timestamp
          movedTracks.push({
            ...prev[existingIndex],
            addedAt: Date.now() // Update timestamp to show it was re-added
          });
        } else {
          // New track
          newTracks.push({
            ...track,
            id: `${Date.now()}-${index}-${Math.random().toString(36).substr(2, 9)}`,
            addedAt: Date.now()
          });
        }
      });
      
      // Get remaining tracks (not moved to top)
      prev.forEach(track => {
        if (!processedVideoIds.has(track.videoId)) {
          remainingTracks.push(track);
        }
      });
      
      // Combine: moved tracks (existing ones re-added) + new tracks + remaining
      const combined = [...movedTracks, ...newTracks, ...remainingTracks];
      
      // Limit playlist to 400 items to prevent UI lockup
      const limited = combined.slice(0, 400);
      
      // Adjust current track index if playing
      if (currentTrackIndex !== null && prev[currentTrackIndex]) {
        const currentVideoId = prev[currentTrackIndex].videoId;
        const newIndex = limited.findIndex(t => t.videoId === currentVideoId);
        if (newIndex !== -1) {
          setCurrentTrackIndex(newIndex);
        } else {
          setCurrentTrackIndex(null);
          setIsPlaying(false);
        }
      }
      
      return limited;
    });
  }, [currentTrackIndex]);

  const removeTrack = useCallback((id: string) => {
    setPlaylist(prev => {
      const index = prev.findIndex(t => t.id === id);
      if (index === -1) return prev;

      // Adjust current track index if needed
      if (currentTrackIndex !== null) {
        if (index === currentTrackIndex) {
          // Removing current track - pause
          setIsPlaying(false);
          setCurrentTrackIndex(null);
        } else if (index < currentTrackIndex) {
          // Removing track before current - adjust index
          setCurrentTrackIndex(currentTrackIndex - 1);
        }
      }

      return prev.filter(t => t.id !== id);
    });
  }, [currentTrackIndex]);

  const clearPlaylist = useCallback(() => {
    setPlaylist([]);
    setCurrentTrackIndex(null);
    setIsPlaying(false);
  }, []);

  const playTrack = useCallback((index: number) => {
    if (index >= 0 && index < playlist.length) {
      setCurrentTrackIndex(index);
      setIsPlaying(true);
    }
  }, [playlist.length]);

  // Generate shuffle indices
  const generateShuffleIndices = useCallback(() => {
    const indices = playlist.map((_, i) => i);
    
    // Keep current track at current position if playing
    if (currentTrackIndex !== null) {
      indices.splice(indices.indexOf(currentTrackIndex), 1);
    }
    
    // Fisher-Yates shuffle
    for (let i = indices.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [indices[i], indices[j]] = [indices[j], indices[i]];
    }
    
    // Insert current track at beginning if playing
    if (currentTrackIndex !== null) {
      indices.unshift(currentTrackIndex);
    }
    
    return indices;
  }, [playlist, currentTrackIndex]);

  // Regenerate shuffle indices when shuffle is enabled or playlist changes
  useEffect(() => {
    if (shuffleMode) {
      setShuffleIndices(generateShuffleIndices());
    }
  }, [shuffleMode, playlist, generateShuffleIndices]);

  const nextTrack = useCallback(() => {
    if (playlist.length === 0) return;
    
    if (currentTrackIndex === null) {
      setCurrentTrackIndex(0);
      setIsPlaying(true);
      return;
    }
    
    // Handle repeat one
    if (repeatMode === 'one') {
      // Stay on same track, just restart
      setIsPlaying(true);
      return;
    }
    
    // Get indices array (shuffled or normal)
    const indices = shuffleMode ? shuffleIndices : playlist.map((_, i) => i);
    const currentPos = indices.indexOf(currentTrackIndex);
    
    if (currentPos < indices.length - 1) {
      // Play next track
      setCurrentTrackIndex(indices[currentPos + 1]);
      setIsPlaying(true);
    } else if (repeatMode === 'all') {
      // Loop to beginning
      setCurrentTrackIndex(indices[0]);
      setIsPlaying(true);
    } else {
      // Stop at end
      setIsPlaying(false);
    }
  }, [playlist, currentTrackIndex, shuffleMode, shuffleIndices, repeatMode]);

  const previousTrack = useCallback(() => {
    if (playlist.length === 0) return;
    
    if (currentTrackIndex === null) {
      setCurrentTrackIndex(playlist.length - 1);
      setIsPlaying(true);
      return;
    }
    
    // Get indices array (shuffled or normal)
    const indices = shuffleMode ? shuffleIndices : playlist.map((_, i) => i);
    const currentPos = indices.indexOf(currentTrackIndex);
    
    if (currentPos > 0) {
      // Play previous track
      setCurrentTrackIndex(indices[currentPos - 1]);
      setIsPlaying(true);
    } else {
      // Loop to end or stay at beginning
      setCurrentTrackIndex(indices[indices.length - 1]);
      setIsPlaying(true);
    }
  }, [playlist, currentTrackIndex, shuffleMode, shuffleIndices]);

  const togglePlayPause = useCallback(() => {
    if (playlist.length === 0) return;
    
    if (currentTrackIndex === null) {
      setCurrentTrackIndex(0);
      setIsPlaying(true);
    } else {
      setIsPlaying(prev => !prev);
    }
  }, [playlist.length, currentTrackIndex]);

  const play = useCallback(() => {
    if (playlist.length === 0) return;
    
    if (currentTrackIndex === null) {
      setCurrentTrackIndex(0);
    }
    setIsPlaying(true);
  }, [playlist.length, currentTrackIndex]);

  const pause = useCallback(() => {
    setIsPlaying(false);
  }, []);

  const playTrackByVideoId = useCallback((videoId: string): boolean => {
    const index = playlist.findIndex(track => track.videoId === videoId);
    if (index !== -1) {
      setCurrentTrackIndex(index);
      setIsPlaying(true);
      return true;
    }
    return false;
  }, [playlist]);

  // Named playlists management
  const refreshSavedPlaylists = useCallback(async () => {
    try {
      const playlists = await playlistDB.listPlaylists();
      setSavedPlaylists(playlists);
    } catch (error) {
      console.error('Failed to load saved playlists:', error);
    }
  }, []);

  const savePlaylistAs = useCallback(async (name: string) => {
    try {
      await playlistDB.savePlaylist(name, playlist);
      await refreshSavedPlaylists();
    } catch (error) {
      console.error('Failed to save playlist:', error);
      throw error;
    }
  }, [playlist, refreshSavedPlaylists]);

  const loadPlaylist = useCallback(async (id: number) => {
    try {
      const tracks = await playlistDB.loadPlaylist(id);
      setPlaylist(tracks);
      setCurrentTrackIndex(null);
      setIsPlaying(false);
    } catch (error) {
      console.error('Failed to load playlist:', error);
      throw error;
    }
  }, []);

  const deletePlaylist = useCallback(async (id: number) => {
    try {
      await playlistDB.deletePlaylist(id);
      await refreshSavedPlaylists();
    } catch (error) {
      console.error('Failed to delete playlist:', error);
      throw error;
    }
  }, [refreshSavedPlaylists]);

  // Playback control methods
  const toggleShuffle = useCallback(() => {
    const newShuffleMode = !shuffleMode;
    setShuffleMode(newShuffleMode);
    localStorage.setItem('shuffleMode', String(newShuffleMode));
    
    if (newShuffleMode) {
      setShuffleIndices(generateShuffleIndices());
    }
  }, [shuffleMode, generateShuffleIndices]);

  const setRepeatMode = useCallback((mode: 'none' | 'all' | 'one') => {
    setRepeatModeState(mode);
    localStorage.setItem('repeatMode', mode);
  }, []);

  const setPlaybackRate = useCallback((rate: number) => {
    setPlaybackRateState(rate);
    localStorage.setItem('playbackRate', String(rate));
  }, []);

  const setVolume = useCallback((vol: number) => {
    setVolumeState(vol);
    localStorage.setItem('volume', String(vol));
  }, []);

  const setVideoQuality = useCallback((quality: string) => {
    setVideoQualityState(quality);
    localStorage.setItem('videoQuality', quality);
  }, []);

  const currentTrack = currentTrackIndex !== null && playlist[currentTrackIndex] 
    ? playlist[currentTrackIndex] 
    : null;

  return (
    <PlaylistContext.Provider
      value={{
        playlist,
        currentTrackIndex,
        isPlaying,
        addTrack,
        addTracks,
        addTracksToStart,
        removeTrack,
        clearPlaylist,
        playTrack,
        playTrackByVideoId,
        nextTrack,
        previousTrack,
        togglePlayPause,
        play,
        pause,
        currentTrack,
        savedPlaylists,
        savePlaylistAs,
        loadPlaylist,
        deletePlaylist,
        refreshSavedPlaylists,
        shuffleMode,
        toggleShuffle,
        repeatMode,
        setRepeatMode,
        playbackRate,
        setPlaybackRate,
        volume,
        setVolume,
        videoQuality,
        setVideoQuality
      }}
    >
      {children}
    </PlaylistContext.Provider>
  );
};
