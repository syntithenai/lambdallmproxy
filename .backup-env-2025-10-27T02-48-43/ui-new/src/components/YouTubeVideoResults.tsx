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
  const { playTrack, addTracksToStart } = usePlaylist();

  const handlePlayVideo = (video: YouTubeVideo) => {
    // Add the video to the start of the playlist (or move it there if it already exists)
    addTracksToStart([{
      videoId: video.videoId,
      title: video.title,
      url: video.url,
      thumbnail: video.thumbnail,
      channel: video.channel,
      duration: video.duration
    }]);
    
    // Play the first track (which is now the video we just added/moved)
    // Use setTimeout to ensure state update has completed
    setTimeout(() => {
      playTrack(0);
      
      // Optionally open the player dialog
      if (onOpenPlayer) {
        onOpenPlayer();
      }
    }, 0);
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
          onClick={() => handlePlayVideo(video)}
          className="flex gap-3 p-3 bg-gray-50 dark:bg-gray-800 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-750 transition-colors cursor-pointer"
        >
          {/* Thumbnail */}
          {video.thumbnail && (
            <div className="flex-shrink-0 relative">
              <img
                src={video.thumbnail}
                alt={video.title}
                className="w-32 h-20 object-cover rounded"
              />
              {/* Play icon overlay on thumbnail */}
              <div className="absolute inset-0 flex items-center justify-center">
                <div className="bg-black bg-opacity-60 rounded-full p-2">
                  <span className="text-white text-2xl">▶️</span>
                </div>
              </div>
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
              onClick={(e) => {
                e.stopPropagation(); // Prevent card click when clicking button
                handlePlayVideo(video);
              }}
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
