import React, { createContext, useContext, useRef, useCallback, useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import { usePlaylist } from './PlaylistContext';

interface PlayerContextType {
  playerRef: React.RefObject<any>;
  registerPlayer: (player: any) => void;
  unregisterPlayer: () => void;
  playVideo: () => void;
  pauseVideo: () => void;
  seekTo: (seconds: number) => void;
  getCurrentTime: () => number;
  getDuration: () => number;
  isLoading: boolean;
  setIsLoading: (loading: boolean) => void;
  currentTime: number;
  duration: number;
  setCurrentTime: (time: number) => void;
  setDuration: (duration: number) => void;
}

const PlayerContext = createContext<PlayerContextType | undefined>(undefined);

export const usePlayer = () => {
  const context = useContext(PlayerContext);
  if (!context) {
    throw new Error('usePlayer must be used within PlayerProvider');
  }
  return context;
};

interface PlayerProviderProps {
  children: ReactNode;
}

/**
 * PlayerContext maintains a reference to the ReactPlayer instance
 * across the entire application, allowing playback control from any component.
 * 
 * This solves the problem where header buttons try to control playback
 * but the player only exists in the MediaPlayerDialog when it's open.
 */
export const PlayerProvider: React.FC<PlayerProviderProps> = ({ children }) => {
  const playerRef = useRef<any>(null);
  const { isPlaying, currentTrack, play, pause } = usePlaylist();
  const [isLoading, setIsLoading] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);

  // Register player instance (called by MediaPlayerDialog when ReactPlayer mounts)
  const registerPlayer = useCallback((player: any) => {
    console.log('[PlayerContext] Registering player:', player);
    playerRef.current = player;
  }, []);

  // Unregister player (called when ReactPlayer unmounts)
  const unregisterPlayer = useCallback(() => {
    console.log('[PlayerContext] Unregistering player');
    playerRef.current = null;
  }, []);

  // Play video
  const playVideo = useCallback(() => {
    if (playerRef.current) {
      console.log('[PlayerContext] Playing video via ref');
      // ReactPlayer doesn't have a play() method directly
      // We'll rely on the playing prop in MediaPlayerDialog
      play();
    } else {
      console.warn('[PlayerContext] Cannot play - no player registered');
      // Still update state so it plays when dialog opens
      play();
    }
  }, [play]);

  // Pause video
  const pauseVideo = useCallback(() => {
    if (playerRef.current) {
      console.log('[PlayerContext] Pausing video via ref');
      pause();
    } else {
      console.warn('[PlayerContext] Cannot pause - no player registered');
      pause();
    }
  }, [pause]);

  // Seek to position
  const seekTo = useCallback((seconds: number) => {
    if (playerRef.current && playerRef.current.seekTo) {
      console.log('[PlayerContext] Seeking to:', seconds);
      playerRef.current.seekTo(seconds, 'seconds');
    } else {
      console.warn('[PlayerContext] Cannot seek - no player registered');
    }
  }, []);

  // Get current playback time
  const getCurrentTime = useCallback((): number => {
    if (playerRef.current && playerRef.current.getCurrentTime) {
      return playerRef.current.getCurrentTime();
    }
    return 0;
  }, []);

  // Get video duration
  const getDuration = useCallback((): number => {
    if (playerRef.current && playerRef.current.getDuration) {
      return playerRef.current.getDuration();
    }
    return 0;
  }, []);

  // Sync PlaylistContext state with player
  useEffect(() => {
    if (!playerRef.current) return;

    console.log('[PlayerContext] Syncing player state - isPlaying:', isPlaying, 'currentTrack:', currentTrack?.title);

    // Note: ReactPlayer uses the 'playing' prop to control playback
    // The MediaPlayerDialog will handle this via the isPlaying state
  }, [isPlaying, currentTrack]);

  return (
    <PlayerContext.Provider
      value={{
        playerRef,
        registerPlayer,
        unregisterPlayer,
        playVideo,
        pauseVideo,
        seekTo,
        getCurrentTime,
        getDuration,
        isLoading,
        setIsLoading,
        currentTime,
        duration,
        setCurrentTime,
        setDuration
      }}
    >
      {children}
    </PlayerContext.Provider>
  );
};
