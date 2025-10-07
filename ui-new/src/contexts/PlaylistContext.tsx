import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import type { ReactNode } from 'react';

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

interface PlaylistContextType {
  playlist: PlaylistTrack[];
  currentTrackIndex: number | null;
  isPlaying: boolean;
  addTrack: (track: Omit<PlaylistTrack, 'id' | 'addedAt'>) => void;
  addTracks: (tracks: Omit<PlaylistTrack, 'id' | 'addedAt'>[]) => void;
  removeTrack: (id: string) => void;
  clearPlaylist: () => void;
  playTrack: (index: number) => void;
  nextTrack: () => void;
  previousTrack: () => void;
  togglePlayPause: () => void;
  play: () => void;
  pause: () => void;
  currentTrack: PlaylistTrack | null;
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
  const [playlist, setPlaylist] = useState<PlaylistTrack[]>(() => {
    try {
      const saved = localStorage.getItem('youtube_playlist');
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });

  const [currentTrackIndex, setCurrentTrackIndex] = useState<number | null>(() => {
    try {
      const saved = localStorage.getItem('youtube_current_track');
      return saved ? parseInt(saved, 10) : null;
    } catch {
      return null;
    }
  });

  const [isPlaying, setIsPlaying] = useState(false);

  // Save playlist to localStorage whenever it changes
  useEffect(() => {
    localStorage.setItem('youtube_playlist', JSON.stringify(playlist));
  }, [playlist]);

  // Save current track index
  useEffect(() => {
    if (currentTrackIndex !== null) {
      localStorage.setItem('youtube_current_track', String(currentTrackIndex));
    } else {
      localStorage.removeItem('youtube_current_track');
    }
  }, [currentTrackIndex]);

  const addTrack = useCallback((track: Omit<PlaylistTrack, 'id' | 'addedAt'>) => {
    const newTrack: PlaylistTrack = {
      ...track,
      id: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      addedAt: Date.now()
    };
    setPlaylist(prev => [...prev, newTrack]);
  }, []);

  const addTracks = useCallback((tracks: Omit<PlaylistTrack, 'id' | 'addedAt'>[]) => {
    const newTracks: PlaylistTrack[] = tracks.map(track => ({
      ...track,
      id: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      addedAt: Date.now()
    }));
    setPlaylist(prev => [...prev, ...newTracks]);
  }, []);

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

  const nextTrack = useCallback(() => {
    if (playlist.length === 0) return;
    
    if (currentTrackIndex === null) {
      setCurrentTrackIndex(0);
      setIsPlaying(true);
    } else {
      const nextIndex = (currentTrackIndex + 1) % playlist.length;
      setCurrentTrackIndex(nextIndex);
      setIsPlaying(true);
    }
  }, [playlist.length, currentTrackIndex]);

  const previousTrack = useCallback(() => {
    if (playlist.length === 0) return;
    
    if (currentTrackIndex === null) {
      setCurrentTrackIndex(playlist.length - 1);
      setIsPlaying(true);
    } else {
      const prevIndex = currentTrackIndex === 0 ? playlist.length - 1 : currentTrackIndex - 1;
      setCurrentTrackIndex(prevIndex);
      setIsPlaying(true);
    }
  }, [playlist.length, currentTrackIndex]);

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
        removeTrack,
        clearPlaylist,
        playTrack,
        nextTrack,
        previousTrack,
        togglePlayPause,
        play,
        pause,
        currentTrack
      }}
    >
      {children}
    </PlaylistContext.Provider>
  );
};
