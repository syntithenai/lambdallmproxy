import React, { useRef, useEffect } from 'react';
import ReactDOM from 'react-dom';
import ReactPlayer from 'react-player';
import { usePlaylist } from '../contexts/PlaylistContext';
import { usePlayer } from '../contexts/PlayerContext';
import { useCast } from '../contexts/CastContext';
import './react-player-hide-controls.css';

/**
 * BackgroundPlayer - Always-mounted ReactPlayer for continuous audio playback.
 * 
 * This component:
 * 1. Stays mounted in the DOM at all times (hidden when dialog closed)
 * 2. Enables audio playback without opening the dialog
 * 3. Can be "portaled" into the dialog when user wants to see the video
 * 4. Registers itself with PlayerContext for control from anywhere
 */
export const BackgroundPlayer: React.FC = () => {
  const playerRef = useRef<any>(null);
  
  const {
    currentTrack,
    isPlaying,
    nextTrack,
    play,
    pause
  } = usePlaylist();  const { registerPlayer, unregisterPlayer, setIsLoading, setCurrentTime, setDuration } = usePlayer();
  
  const { isCastingVideo } = useCast();

  // Register player on mount, unregister on unmount
  useEffect(() => {
    if (playerRef.current) {
      console.log('[BackgroundPlayer] Registering player');
      registerPlayer(playerRef.current);
    }
    
    return () => {
      console.log('[BackgroundPlayer] Unregistering player');
      unregisterPlayer();
    };
  }, [registerPlayer, unregisterPlayer]);

  // Set loading state when track changes AND playing
  useEffect(() => {
    console.log('[BackgroundPlayer] Track or playing state changed - isPlaying:', isPlaying, 'currentTrack:', currentTrack?.title);
    // Set loading state only when track changes and we're playing
    if (currentTrack && isPlaying) {
      setIsLoading(true);
    } else if (!isPlaying) {
      // Clear loading state when paused
      setIsLoading(false);
    }
  }, [currentTrack, isPlaying, setIsLoading]);

  // Check if dialog is open
  const [isDialogOpen, setIsDialogOpen] = React.useState(false);
  const lastPositionRef = React.useRef(0);
  const wasPlayingRef = React.useRef(false);
  
  React.useEffect(() => {
    const checkDialog = () => {
      const dialogElement = document.getElementById('dialog-player-container');
      const wasOpen = isDialogOpen;
      const isNowOpen = !!dialogElement;
      
      if (wasOpen !== isNowOpen) {
        // Dialog state is changing
        console.log('[BackgroundPlayer] Dialog opening, last tracked position:', lastPositionRef.current, 'isPlaying:', isPlaying);
        wasPlayingRef.current = isPlaying;
      }
      
      setIsDialogOpen(isNowOpen);
    };
    
    checkDialog();
    const observer = new MutationObserver(() => {
      setTimeout(checkDialog, 10);
    });
    observer.observe(document.body, { childList: true, subtree: true });
    
    return () => observer.disconnect();
  }, [isDialogOpen, isPlaying]);

  // Early return AFTER all hooks to comply with Rules of Hooks
  if (!currentTrack) {
    return null; // No track to play
  }

  // Render player in the correct location based on dialog state
  // This avoids moving the DOM element which destroys the YouTube iframe
  // Use stable key based on video URL to prevent re-mounting when switching locations
  const playerElement = (
    <ReactPlayer
      key={`player-${currentTrack.videoId}`}
      ref={(player) => {
        playerRef.current = player;
        if (player) {
          console.log('[BackgroundPlayer] ReactPlayer ref set, registering player, dialogOpen:', isDialogOpen);
          registerPlayer(player);
        }
      }}
      src={currentTrack.url}
      playing={isPlaying && !isCastingVideo}
      controls={true}
      width="100%"
      height="100%"
      style={{ position: 'absolute', top: 0, left: 0 }}
      className="react-player-hide-controls"
      onReady={() => {
        console.log('[BackgroundPlayer] ReactPlayer ready, URL:', currentTrack.url, 'isPlaying:', isPlaying, 'dialogOpen:', isDialogOpen, 'savedPosition:', lastPositionRef.current);
        // Get duration when ready
        const videoElement = playerRef.current as unknown as HTMLVideoElement;
        if (videoElement && videoElement.duration) {
          setDuration(videoElement.duration);
        }
      }}
      onTimeUpdate={(event: React.SyntheticEvent<HTMLVideoElement>) => {
        // onTimeUpdate is called when the media's current time changes
        const time = event.currentTarget.currentTime;
        const dur = event.currentTarget.duration;
        if (time > 0) {
          lastPositionRef.current = time;
          setCurrentTime(time); // Update PlayerContext
          console.log('[BackgroundPlayer] Position:', time.toFixed(2));
        }
        if (dur > 0) {
          setDuration(dur); // Update duration as well (in case it wasn't available in onReady)
        }
      }}
      onPlay={() => {
        console.log('[BackgroundPlayer] Playback started - syncing play state');
        // Sync with PlaylistContext when user clicks play on the video
        if (!isPlaying) {
          play();
        }
        setTimeout(() => setIsLoading(false), 500);
      }}
      onStart={() => {
        console.log('[BackgroundPlayer] Media started, savedPosition:', lastPositionRef.current);
        
        // If we have a saved position, seek to it using the video element directly
        if (lastPositionRef.current > 1) { // More than 1 second
          const savedPos = lastPositionRef.current;
          console.log('[BackgroundPlayer] Will seek to saved position:', savedPos);
          
          // Seek using the video element's currentTime property
          setTimeout(() => {
            const videoElement = playerRef.current as unknown as HTMLVideoElement;
            if (videoElement && typeof videoElement.currentTime === 'number') {
              console.log('[BackgroundPlayer] Setting currentTime from', videoElement.currentTime, 'to', savedPos);
              videoElement.currentTime = savedPos;
              lastPositionRef.current = 0; // Clear after seeking
            } else {
              console.log('[BackgroundPlayer] ❌ Cannot seek - video element not ready');
            }
          }, 300); // Increased delay to ensure player is fully ready
        }
        
        setTimeout(() => setIsLoading(false), 500);
      }}
      onPause={() => {
        console.log('[BackgroundPlayer] ⏸ PLAYBACK PAUSED - syncing pause state, isPlaying:', isPlaying);
        // Sync with PlaylistContext when user clicks pause on the video
        if (isPlaying) {
          pause();
        }
      }}
      onEnded={nextTrack}
      onError={(error) => {
        console.error('[BackgroundPlayer] Playback error:', error);
        setIsLoading(false);
      }}
    />
  );

  // Always render via Portal to a stable container
  // Create or get the mount point
  let mountPoint = document.getElementById('background-player-mount');
  if (!mountPoint) {
    mountPoint = document.createElement('div');
    mountPoint.id = 'background-player-mount';
    mountPoint.className = 'fixed bottom-0 left-0';
    mountPoint.style.cssText = 'width: 1px; height: 1px; overflow: hidden; pointer-events: none; z-index: -1; opacity: 0;';
    document.body.appendChild(mountPoint);
  }
  
  const targetContainer = isDialogOpen 
    ? document.getElementById('dialog-player-container')
    : mountPoint;
  
  if (!targetContainer) {
    // Fallback if neither container exists yet
    return null;
  }
  
  // Render via Portal to maintain the same React instance
  return ReactDOM.createPortal(
    <div className="w-full h-full relative bg-black" style={{ aspectRatio: '16/9' }}>
      {playerElement}
    </div>,
    targetContainer
  );
};
