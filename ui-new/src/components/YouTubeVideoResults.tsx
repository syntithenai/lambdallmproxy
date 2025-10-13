/**
 * YouTube Video Result Component
 * Displays YouTube video search results with play buttons
 */

import React from 'react';
import { usePlaylist } from '../contexts/PlaylistContext';

interface YouTubeVideo {
  videoId: string;
  url: string;
  title: string;
  description?: string;
  duration?: string;
  channel?: string;
  thumbnail?: string;
}

interface YouTubeVideoResultsProps {
  videos: YouTubeVideo[];
  onOpenPlayer?: () => void;
}

export const YouTubeVideoResults: React.FC<YouTubeVideoResultsProps> = ({
  videos,
  onOpenPlayer
}) => {
  const { playTrack, playlist } = usePlaylist();

  const handlePlayVideo = (video: YouTubeVideo) => {
    // Find the video in the playlist
    const trackIndex = playlist.findIndex(track => track.videoId === video.videoId);
    
    if (trackIndex !== -1) {
      // Play the track
      playTrack(trackIndex);
      
      // Open the player dialog
      if (onOpenPlayer) {
        onOpenPlayer();
      }
    }
  };

  if (videos.length === 0) {
    return null;
  }

  return (
    <div className="youtube-video-results my-4 space-y-3">
      <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-3">
        🎬 YouTube Videos ({videos.length})
      </h3>
      
      {videos.map((video, idx) => (
        <div
          key={video.videoId || idx}
          className="flex gap-3 p-3 bg-gray-50 dark:bg-gray-800 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-750 transition-colors"
        >
          {/* Thumbnail */}
          {video.thumbnail && (
            <div className="flex-shrink-0">
              <img
                src={video.thumbnail}
                alt={video.title}
                className="w-32 h-20 object-cover rounded"
              />
            </div>
          )}
          
          {/* Video Info */}
          <div className="flex-1 min-w-0">
            <h4 className="font-medium text-gray-900 dark:text-gray-100 truncate mb-1">
              {video.title}
            </h4>
            
            {video.channel && (
              <p className="text-sm text-gray-600 dark:text-gray-400 mb-1">
                {video.channel}
              </p>
            )}
            
            {video.description && (
              <p className="text-sm text-gray-600 dark:text-gray-400 line-clamp-2">
                {video.description}
              </p>
            )}
            
            {video.duration && (
              <span className="inline-block text-xs text-gray-500 dark:text-gray-500 mt-1">
                ⏱ {video.duration}
              </span>
            )}
          </div>
          
          {/* Play Button */}
          <div className="flex-shrink-0 flex items-center">
            <button
              onClick={() => handlePlayVideo(video)}
              className="flex items-center gap-2 px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg transition-colors"
              title="Play video"
            >
              <span className="text-lg">▶️</span>
              <span className="text-sm font-medium">Play</span>
            </button>
          </div>
        </div>
      ))}
      
      <p className="text-sm text-gray-500 dark:text-gray-400 italic">
        💡 All videos have been added to your playlist
      </p>
    </div>
  );
};
