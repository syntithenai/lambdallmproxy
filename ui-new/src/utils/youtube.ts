/**
 * YouTube API utilities for searching and creating playlists
 * Uses the backend's /youtube-search endpoint which wraps the YouTube Data API
 */

import type { PlaylistTrack } from '../contexts/PlaylistContext';
import { getCurrentApiBase } from './api';

export interface YouTubeSearchResult {
  videoId: string;
  url: string;
  title: string;
  description: string;
  channel: string;
  thumbnail: string;
}

export interface YouTubeSearchResponse {
  query: string;
  count: number;
  videos: YouTubeSearchResult[];
}

/**
 * Search YouTube for videos
 * @param query - Search query
 * @param limit - Max results (default 10, max 50)
 * @param order - Sort order: relevance, date, viewCount, rating
 */
export async function searchYouTube(
  query: string,
  limit: number = 10,
  order: 'relevance' | 'date' | 'viewCount' | 'rating' = 'relevance'
): Promise<YouTubeSearchResponse> {
  const apiBase = await getCurrentApiBase();
  
  const response = await fetch(`${apiBase}/youtube-search`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      query,
      limit: Math.min(Math.max(limit, 1), 50),
      order
    })
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`YouTube search failed: ${error}`);
  }

  return response.json();
}

/**
 * Convert YouTube search results to playlist tracks
 */
export function youtubeResultsToTracks(results: YouTubeSearchResult[]): PlaylistTrack[] {
  return results.map((video) => ({
    id: `${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
    videoId: video.videoId,
    url: video.url,
    title: video.title || 'Untitled',
    description: video.description || '',
    channel: video.channel || 'Unknown',
    thumbnail: video.thumbnail || '',
    addedAt: Date.now()
  }));
}
