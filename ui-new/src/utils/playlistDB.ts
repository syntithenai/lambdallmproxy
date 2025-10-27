import { openDB } from 'idb';
import type { DBSchema, IDBPDatabase } from 'idb';
import type { PlaylistTrack } from '../contexts/PlaylistContext';
import { unifiedSync } from '../services/unifiedSync';

/**
 * IndexedDB schema for playlist storage
 */
interface PlaylistDBSchema extends DBSchema {
  currentPlaylist: {
    key: string;
    value: {
      id: string;
      tracks: PlaylistTrack[];
      currentIndex: number | null;
      isPlaying: boolean;
      updatedAt: number;
    };
  };
  savedPlaylists: {
    key: number;
    value: {
      id: number;
      name: string;
      tracks: PlaylistTrack[];
      createdAt: number;
      updatedAt: number;
    };
    indexes: {
      'by-name': string;
      'by-date': number;
    };
  };
}

/**
 * Database utility for managing YouTube playlist persistence
 */
class PlaylistDatabase {
  private db: IDBPDatabase<PlaylistDBSchema> | null = null;
  private readonly DB_NAME = 'youtube-playlist-db';
  private readonly DB_VERSION = 1;

  /**
   * Initialize the database connection
   */
  async init(): Promise<void> {
    if (this.db) return;

    try {
      this.db = await openDB<PlaylistDBSchema>(this.DB_NAME, this.DB_VERSION, {
        upgrade(db) {
          // Current playlist store
          if (!db.objectStoreNames.contains('currentPlaylist')) {
            db.createObjectStore('currentPlaylist', { keyPath: 'id' });
          }

          // Saved playlists store
          if (!db.objectStoreNames.contains('savedPlaylists')) {
            const store = db.createObjectStore('savedPlaylists', { 
              keyPath: 'id', 
              autoIncrement: true 
            });
            store.createIndex('by-name', 'name', { unique: false });
            store.createIndex('by-date', 'createdAt', { unique: false });
          }
        },
      });

      // Migrate from localStorage if exists
      await this.migrateFromLocalStorage();
    } catch (error) {
      console.error('Failed to initialize playlist database:', error);
      throw error;
    }
  }

  /**
   * Migrate data from localStorage to IndexedDB
   */
  private async migrateFromLocalStorage(): Promise<void> {
    try {
      const legacyPlaylist = localStorage.getItem('youtube_playlist');
      const legacyIndex = localStorage.getItem('youtube_current_track');

      if (legacyPlaylist) {
        const tracks = JSON.parse(legacyPlaylist) as PlaylistTrack[];
        const currentIndex = legacyIndex ? parseInt(legacyIndex, 10) : null;
        
        // Check if already migrated
        const existing = await this.db!.get('currentPlaylist', 'current');
        if (!existing || existing.tracks.length === 0) {
          await this.saveCurrentPlaylist(tracks, currentIndex);
          console.log('✅ Migrated playlist from localStorage to IndexedDB');
        }
        
        // Keep legacy data for now (remove in future version)
        // localStorage.removeItem('youtube_playlist');
        // localStorage.removeItem('youtube_current_track');
      }
    } catch (error) {
      console.error('Failed to migrate from localStorage:', error);
    }
  }

  /**
   * Save current playlist state
   */
  async saveCurrentPlaylist(tracks: PlaylistTrack[], currentIndex: number | null): Promise<void> {
    await this.init();
    await this.db!.put('currentPlaylist', {
      id: 'current',
      tracks,
      currentIndex,
      isPlaying: false, // Don't persist play state
      updatedAt: Date.now()
    });
  }

  /**
   * Load current playlist state
   */
  async loadCurrentPlaylist(): Promise<{ tracks: PlaylistTrack[], currentIndex: number | null }> {
    await this.init();
    const data = await this.db!.get('currentPlaylist', 'current');
    
    if (!data) {
      return { tracks: [], currentIndex: null };
    }
    
    return {
      tracks: data.tracks || [],
      currentIndex: data.currentIndex
    };
  }

  /**
   * Clear current playlist
   */
  async clearCurrentPlaylist(): Promise<void> {
    await this.init();
    await this.db!.delete('currentPlaylist', 'current');
  }

  /**
   * Save a named playlist
   */
  async savePlaylist(name: string, tracks: PlaylistTrack[]): Promise<number> {
    await this.init();
    
    if (!name || name.trim().length === 0) {
      throw new Error('Playlist name cannot be empty');
    }
    
    const id = await this.db!.add('savedPlaylists', {
      id: 0, // Will be auto-incremented
      name: name.trim(),
      tracks,
      createdAt: Date.now(),
      updatedAt: Date.now()
    });
    
    // Trigger immediate sync if unified sync is enabled
    if (unifiedSync.isEnabled()) {
      unifiedSync.queueSync('playlists', 'high');
    }
    
    return id;
  }

  /**
   * Update an existing saved playlist
   */
  async updatePlaylist(id: number, name: string, tracks: PlaylistTrack[]): Promise<void> {
    await this.init();
    
    const existing = await this.db!.get('savedPlaylists', id);
    if (!existing) {
      throw new Error('Playlist not found');
    }
    
    await this.db!.put('savedPlaylists', {
      ...existing,
      name: name.trim(),
      tracks,
      updatedAt: Date.now()
    });
    
    // Trigger immediate sync if unified sync is enabled
    if (unifiedSync.isEnabled()) {
      unifiedSync.queueSync('playlists', 'high');
    }
  }

  /**
   * Load a saved playlist by ID
   */
  async loadPlaylist(id: number): Promise<PlaylistTrack[]> {
    await this.init();
    const playlist = await this.db!.get('savedPlaylists', id);
    return playlist?.tracks || [];
  }

  /**
   * Get a saved playlist with metadata
   */
  async getPlaylist(id: number) {
    await this.init();
    return await this.db!.get('savedPlaylists', id);
  }

  /**
   * List all saved playlists (with summary info)
   */
  async listPlaylists() {
    await this.init();
    const playlists = await this.db!.getAll('savedPlaylists');
    
    return playlists
      .map(p => ({
        id: p.id,
        name: p.name,
        trackCount: p.tracks.length,
        createdAt: p.createdAt,
        updatedAt: p.updatedAt
      }))
      .sort((a, b) => b.updatedAt - a.updatedAt); // Most recent first
  }

  /**
   * Delete a saved playlist
   */
  async deletePlaylist(id: number): Promise<void> {
    await this.init();
    await this.db!.delete('savedPlaylists', id);
    
    // Trigger immediate sync if unified sync is enabled
    if (unifiedSync.isEnabled()) {
      unifiedSync.queueSync('playlists', 'high');
    }
  }

  /**
   * Check if a playlist name already exists
   */
  async playlistExists(name: string): Promise<boolean> {
    await this.init();
    const playlists = await this.db!.getAllFromIndex('savedPlaylists', 'by-name', name.trim());
    return playlists.length > 0;
  }

  /**
   * Search playlists by name
   */
  async searchPlaylists(query: string) {
    await this.init();
    const allPlaylists = await this.db!.getAll('savedPlaylists');
    const lowerQuery = query.toLowerCase();
    
    return allPlaylists
      .filter(p => p.name.toLowerCase().includes(lowerQuery))
      .map(p => ({
        id: p.id,
        name: p.name,
        trackCount: p.tracks.length,
        createdAt: p.createdAt,
        updatedAt: p.updatedAt
      }))
      .sort((a, b) => b.updatedAt - a.updatedAt);
  }

  /**
   * Export playlist as JSON
   */
  async exportPlaylist(id: number): Promise<string> {
    await this.init();
    const playlist = await this.db!.get('savedPlaylists', id);
    
    if (!playlist) {
      throw new Error('Playlist not found');
    }
    
    return JSON.stringify({
      name: playlist.name,
      tracks: playlist.tracks,
      exportedAt: Date.now(),
      version: 1
    }, null, 2);
  }

  /**
   * Import playlist from JSON
   */
  async importPlaylist(jsonData: string): Promise<number> {
    await this.init();
    
    try {
      const data = JSON.parse(jsonData);
      
      if (!data.name || !Array.isArray(data.tracks)) {
        throw new Error('Invalid playlist format');
      }
      
      // Validate tracks have required fields
      const validTracks = data.tracks.filter((track: any) => 
        track.videoId && track.url && track.title
      );
      
      if (validTracks.length === 0) {
        throw new Error('No valid tracks found in playlist');
      }
      
      // Create new playlist with imported data
      return await this.savePlaylist(data.name, validTracks);
    } catch (error) {
      if (error instanceof SyntaxError) {
        throw new Error('Invalid JSON format');
      }
      throw error;
    }
  }

  /**
   * Get database statistics
   */
  async getStats() {
    await this.init();
    
    const currentPlaylist = await this.db!.get('currentPlaylist', 'current');
    const savedPlaylists = await this.db!.getAll('savedPlaylists');
    
    const totalTracks = savedPlaylists.reduce((sum, p) => sum + p.tracks.length, 0);
    
    return {
      currentPlaylistSize: currentPlaylist?.tracks.length || 0,
      savedPlaylistCount: savedPlaylists.length,
      totalSavedTracks: totalTracks,
      databaseSize: await this.estimateSize()
    };
  }

  /**
   * Estimate database size (rough approximation)
   */
  private async estimateSize(): Promise<string> {
    await this.init();
    
    try {
      if ('estimate' in navigator.storage) {
        const estimate = await navigator.storage.estimate();
        const usageInMB = (estimate.usage || 0) / (1024 * 1024);
        return `~${usageInMB.toFixed(2)} MB`;
      }
    } catch {
      // Ignore errors
    }
    
    return 'Unknown';
  }

  /**
   * Export all saved playlists for sync
   */
  async exportAllPlaylists(): Promise<Array<{
    id: number;
    name: string;
    tracks: PlaylistTrack[];
    createdAt: number;
    updatedAt: number;
  }>> {
    await this.init();
    return await this.db!.getAll('savedPlaylists');
  }

  /**
   * Import and merge playlists from cloud
   * Deduplicates by name, keeps newer timestamp
   */
  async importAndMergePlaylists(remotePlaylists: Array<{
    id: number;
    name: string;
    tracks: PlaylistTrack[];
    createdAt: number;
    updatedAt: number;
  }>): Promise<number> {
    await this.init();
    
    const localPlaylists = await this.db!.getAll('savedPlaylists');
    const localByName = new Map(localPlaylists.map(p => [p.name.toLowerCase(), p]));
    
    let importedCount = 0;
    
    for (const remotePlaylist of remotePlaylists) {
      const key = remotePlaylist.name.toLowerCase();
      const localPlaylist = localByName.get(key);
      
      if (!localPlaylist) {
        // New playlist - add it
        await this.db!.add('savedPlaylists', {
          id: 0, // Will be auto-incremented
          name: remotePlaylist.name,
          tracks: remotePlaylist.tracks,
          createdAt: remotePlaylist.createdAt,
          updatedAt: remotePlaylist.updatedAt
        });
        importedCount++;
      } else if (remotePlaylist.updatedAt > localPlaylist.updatedAt) {
        // Remote is newer - update local
        await this.db!.put('savedPlaylists', {
          id: localPlaylist.id,
          name: remotePlaylist.name,
          tracks: remotePlaylist.tracks,
          createdAt: localPlaylist.createdAt, // Keep original creation time
          updatedAt: remotePlaylist.updatedAt
        });
        importedCount++;
      }
      // If local is newer or same, skip (local wins)
    }
    
    return importedCount;
  }

  /**
   * Get playlists modified after timestamp
   */
  async getPlaylistsModifiedSince(timestamp: number): Promise<Array<{
    id: number;
    name: string;
    tracks: PlaylistTrack[];
    createdAt: number;
    updatedAt: number;
  }>> {
    await this.init();
    const allPlaylists = await this.db!.getAll('savedPlaylists');
    return allPlaylists.filter(p => p.updatedAt > timestamp);
  }

  /**
   * Get last modified timestamp
   */
  async getLastModified(): Promise<number> {
    await this.init();
    const playlists = await this.db!.getAll('savedPlaylists');
    if (playlists.length === 0) return 0;
    return Math.max(...playlists.map(p => p.updatedAt));
  }

  /**
   * Close database connection
   */
  close(): void {
    if (this.db) {
      this.db.close();
      this.db = null;
    }
  }
}

// Export singleton instance
export const playlistDB = new PlaylistDatabase();
