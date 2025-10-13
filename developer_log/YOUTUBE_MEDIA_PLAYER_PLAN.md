# YouTube Media Player - Implementation Plan

**Date:** October 14, 2025  
**Status:** 📋 Planning  
**Related Features:** Chromecast Integration, YouTube Search, Playlist Context

---

## Table of Contents

1. [Overview](#overview)
2. [Requirements Summary](#requirements-summary)
3. [Architecture](#architecture)
4. [Component Breakdown](#component-breakdown)
5. [Implementation Phases](#implementation-phases)
6. [Technical Specifications](#technical-specifications)
7. [UI/UX Design](#uiux-design)
8. [Database Schema](#database-schema)
9. [Integration Points](#integration-points)
10. [Testing Strategy](#testing-strategy)
11. [Timeline](#timeline)

---

## Overview

Implement a comprehensive YouTube media player system with:
- Compact header-based player controls
- Full-featured playlist dialog with video player
- IndexedDB persistence for playlists
- Automatic playlist population from YouTube searches
- Chromecast integration for fullscreen TV playback
- Grouping by date added
- Rich metadata display

**Key Philosophy**: Progressive disclosure - compact controls in header, full details in dialog.

---

## Requirements Summary

### Core Features

1. ✅ **Existing**: Playlist context already implemented (`PlaylistContext.tsx`)
2. ✅ **Existing**: Basic playlist dialog exists (`PlaylistDialog.tsx`)
3. 🆕 **New**: Compact player controls in header
4. 🆕 **New**: Enhanced playlist dialog with embedded video player
5. 🆕 **New**: IndexedDB persistence (replace localStorage)
6. 🆕 **New**: Play buttons in YouTube search results
7. 🆕 **New**: Date-based grouping in playlist
8. 🆕 **New**: Chromecast integration for fullscreen video
9. 🆕 **New**: Video metadata display
10. 🆕 **New**: Auto-add from searches at playlist start

### User Requirements

- **Visibility**: Only show player when playlist has items
- **Auto-add**: YouTube/web searches → automatic playlist addition
- **Persistence**: Save/load playlists via IndexedDB
- **Grouping**: Display tracks grouped by date added
- **Seamless**: Continue playing when new tracks added
- **Confirmation**: Delete tracks with confirmation dialog
- **Casting**: Fullscreen YouTube video on TV when casting
- **Metadata**: Show title, channel, duration, description

---

## Architecture

### Component Hierarchy

```
App.tsx
├── PlaylistProvider (Context - already exists)
├── GoogleLoginButton (Header)
│   ├── Cast Button (existing)
│   ├── MediaPlayerButton (NEW - compact controls)
│   └── Sign Out Button
└── ChatTab
    ├── YouTube Search Results (NEW - add play buttons)
    └── MediaPlayerDialog (ENHANCED)
        ├── Video Player (embedded YouTube iframe)
        ├── Video Metadata Display
        ├── Playlist Controls (clear, save, load)
        └── Playlist Items (grouped by date)
```

### Data Flow

```
YouTube Search Result
  ↓
Add to Playlist (automatic)
  ↓
PlaylistContext State Update
  ↓
IndexedDB Persistence
  ↓
UI Updates (Header Button, Dialog)
  ↓
Video Player (iframe or Chromecast)
```

### State Management

**Existing Context** (`PlaylistContext`):
- ✅ Playlist tracks array
- ✅ Current track index
- ✅ Play/pause state
- ✅ Add/remove/clear operations
- ✅ Next/previous navigation
- 🔄 **Update**: Add IndexedDB persistence
- 🔄 **Update**: Add save/load named playlists

**New State Needed**:
- Dialog open/close state (local component state)
- Video player ready state
- Saved playlists list

---

## Component Breakdown

### Phase 1: Compact Header Player Button

**File**: `ui-new/src/components/MediaPlayerButton.tsx` (NEW)

**Purpose**: Compact player controls in header next to Cast button

**Features**:
- Only visible when `playlist.length > 0`
- Shows current track title (truncated)
- Play/pause button
- Previous/next track buttons
- Button to open full playlist dialog
- Compact design to save header space

**UI Mockup**:
```
┌─────────────────────────────────────────────┐
│ [◀] [▶️] "Video Title..." [📋]              │
└─────────────────────────────────────────────┘
 Prev Play  Current Track    Open Dialog
      Pause (truncated)
```

**Props**:
```typescript
interface MediaPlayerButtonProps {
  // No props - uses PlaylistContext
}
```

**State**:
```typescript
const [showDialog, setShowDialog] = useState(false);
const { playlist, currentTrack, isPlaying, togglePlayPause, nextTrack, previousTrack } = usePlaylist();
```

**Layout Integration**:
Insert between Cast button and Sign Out button in `GoogleLoginButton.tsx`

---

### Phase 2: Enhanced Playlist Dialog

**File**: `ui-new/src/components/MediaPlayerDialog.tsx` (REPLACE PlaylistDialog.tsx)

**Purpose**: Full-featured playlist manager with video player

**Features**:
- Embedded YouTube video player at top
- Video metadata below player
- Grouped playlist items by date
- Delete with confirmation
- Save/load playlists
- Clear playlist
- Click track to play
- Keyboard shortcuts

**UI Layout**:
```
┌────────────────────────────────────────────────────────┐
│ YouTube Playlist                              [Clear] [×]│
├────────────────────────────────────────────────────────┤
│                                                         │
│  ┌─────────────────────────────────────────────────┐  │
│  │                                                  │  │
│  │         YouTube Video Player (16:9)             │  │
│  │              (iframe embed)                      │  │
│  │                                                  │  │
│  └─────────────────────────────────────────────────┘  │
│                                                         │
│  ┌─────────────────────────────────────────────────┐  │
│  │ 🎬 Video Title                                   │  │
│  │ 👤 Channel Name  •  ⏱️ Duration  •  📅 Added    │  │
│  │ 📝 Description text here...                      │  │
│  └─────────────────────────────────────────────────┘  │
│                                                         │
│  ┌─────────────────────────────────────────────────┐  │
│  │ Controls                                         │  │
│  │ [Save Playlist] [Load Playlist] [Clear All]     │  │
│  └─────────────────────────────────────────────────┘  │
│                                                         │
├────────────────────────────────────────────────────────┤
│ Playlist (12 videos)                                   │
├────────────────────────────────────────────────────────┤
│ 📅 Today                                               │
│  ┌────────────────────────────────────────┐          │
│  │ [▶️] Video Title 1         [×] Delete   │ ◀ Playing│
│  │      Channel Name • 5:23                │          │
│  └────────────────────────────────────────┘          │
│  ┌────────────────────────────────────────┐          │
│  │ [▶️] Video Title 2         [×] Delete   │          │
│  │      Channel Name • 3:45                │          │
│  └────────────────────────────────────────┘          │
│                                                         │
│ 📅 Yesterday                                           │
│  ┌────────────────────────────────────────┐          │
│  │ [▶️] Video Title 3         [×] Delete   │          │
│  │      Channel Name • 7:12                │          │
│  └────────────────────────────────────────┘          │
│                                                         │
│  ... (scrollable list)                                 │
└────────────────────────────────────────────────────────┘
```

**Components Structure**:
```typescript
<MediaPlayerDialog>
  <DialogHeader />
  <VideoPlayer />
  <VideoMetadata />
  <PlaylistControls />
  <PlaylistItems>
    <DateGroup date="Today">
      <PlaylistItem />
      <PlaylistItem />
    </DateGroup>
    <DateGroup date="Yesterday">
      <PlaylistItem />
    </DateGroup>
  </PlaylistItems>
</MediaPlayerDialog>
```

---

### Phase 3: YouTube Search Integration

**File**: `ui-new/src/components/ChatTab.tsx` (MODIFY)

**Current Behavior**:
- YouTube search results displayed in message
- Videos automatically added to playlist (lines 909-923)

**New Feature**:
Add play button to each video in search results

**UI Addition**:
```
YouTube Search Results:
┌────────────────────────────────────────┐
│ [▶️ Play] Video Title 1                │
│           Channel • Duration            │
├────────────────────────────────────────┤
│ [▶️ Play] Video Title 2                │
│           Channel • Duration            │
└────────────────────────────────────────┘
```

**Implementation**:
1. Detect YouTube results in assistant message
2. Parse video data from tool results
3. Render play buttons next to each video link
4. On play button click:
   - Find video in playlist
   - Set as current track
   - Start playback
   - Open player dialog (optional)

---

### Phase 4: IndexedDB Persistence

**File**: `ui-new/src/utils/playlistDB.ts` (NEW)

**Purpose**: Replace localStorage with IndexedDB for better storage

**Schema**:
```typescript
interface PlaylistDB {
  currentPlaylist: {
    tracks: PlaylistTrack[];
    currentIndex: number | null;
    isPlaying: boolean;
  };
  savedPlaylists: {
    id: string;
    name: string;
    tracks: PlaylistTrack[];
    createdAt: number;
    updatedAt: number;
  }[];
}
```

**API**:
```typescript
class PlaylistDatabase {
  // Current playlist
  async saveCurrentPlaylist(playlist: PlaylistTrack[], currentIndex: number | null): Promise<void>
  async loadCurrentPlaylist(): Promise<{ tracks: PlaylistTrack[], currentIndex: number | null }>
  
  // Named playlists
  async savePlaylist(name: string, tracks: PlaylistTrack[]): Promise<string> // returns id
  async loadPlaylist(id: string): Promise<PlaylistTrack[]>
  async deletePlaylist(id: string): Promise<void>
  async listPlaylists(): Promise<Array<{ id: string, name: string, trackCount: number, createdAt: number }>>
  
  // Utility
  async clearCurrentPlaylist(): Promise<void>
}
```

**Migration Strategy**:
1. Check localStorage for existing playlist
2. If exists, migrate to IndexedDB
3. Keep localStorage as backup for 1 version
4. Remove localStorage code in next version

---

### Phase 5: Chromecast Video Integration

**File**: `ui-new/src/contexts/CastContext.tsx` (MODIFY)

**Current Behavior**:
- Casts chat messages to TV
- Custom namespace: `urn:x-cast:com.lambdallmproxy.chat`

**New Feature**:
Cast YouTube video fullscreen to TV

**Implementation Options**:

#### Option A: YouTube iFrame Cast (Recommended)
Use existing Chromecast receiver, send YouTube embed URL

**Pros**:
- Simpler implementation
- Uses existing receiver
- YouTube handles playback

**Cons**:
- Less control over player
- May have YouTube branding

**Message Protocol**:
```typescript
interface CastMessage {
  type: 'MESSAGES_UPDATE' | 'VIDEO_PLAY' | 'VIDEO_PAUSE' | 'VIDEO_STOP';
  messages?: Message[];
  videoId?: string;
  videoUrl?: string;
}
```

#### Option B: Use Default Media Receiver
Switch to default media receiver for video, custom for messages

**Pros**:
- Better video controls
- Standard Chromecast UX

**Cons**:
- More complex session management
- Need to switch between receivers

**Recommendation**: Option A - simpler and cleaner

---

### Phase 6: Video Metadata Component

**File**: `ui-new/src/components/VideoMetadata.tsx` (NEW)

**Purpose**: Display rich video information below player

**Data Displayed**:
- Video title
- Channel name
- Duration
- View count (if available)
- Upload date (if available)
- Description (truncated, expand button)
- Tags (if available)
- Date added to playlist

**UI Design**:
```
┌─────────────────────────────────────────────────┐
│ 🎬 How to Build a React App from Scratch       │
│ 👤 CodeMaster  •  ⏱️ 15:32  •  👁️ 1.2M views  │
│ 📅 Uploaded 2 weeks ago  •  Added Today 3:45pm │
│                                                  │
│ 📝 Description:                                 │
│    Learn how to build a complete React app...   │
│    [Read more ▼]                                │
│                                                  │
│ 🏷️ react • javascript • tutorial • beginner    │
└─────────────────────────────────────────────────┘
```

**Props**:
```typescript
interface VideoMetadataProps {
  track: PlaylistTrack;
}
```

---

## Implementation Phases

### Phase 1: Foundation & Header Button (2-3 hours)

**Goals**:
- Create MediaPlayerButton component
- Integrate into GoogleLoginButton
- Basic play/pause/next/prev controls
- Show current track title
- Only visible when playlist has items

**Tasks**:
1. Create `MediaPlayerButton.tsx`
2. Implement compact UI design
3. Wire up PlaylistContext hooks
4. Add to `GoogleLoginButton.tsx` layout
5. Test visibility logic
6. Test controls functionality

**Acceptance Criteria**:
- ✅ Button appears only when playlist has items
- ✅ Shows current track title (truncated)
- ✅ Play/pause button works
- ✅ Next/previous buttons work
- ✅ Opens dialog when clicked
- ✅ Mobile responsive

---

### Phase 2: Enhanced Playlist Dialog (4-5 hours)

**Goals**:
- Replace/enhance PlaylistDialog
- Add embedded YouTube player
- Add metadata display
- Add date grouping
- Add save/load/clear controls

**Tasks**:
1. Create `MediaPlayerDialog.tsx` (or enhance existing)
2. Implement YouTube iframe player
3. Add video metadata component
4. Implement date-based grouping logic
5. Add playlist control buttons
6. Add confirmation dialogs for delete/clear
7. Test video playback
8. Test playlist navigation

**Acceptance Criteria**:
- ✅ Video player embedded and functional
- ✅ Metadata displays correctly
- ✅ Playlist items grouped by date
- ✅ Click track to play works
- ✅ Delete with confirmation works
- ✅ Clear playlist with confirmation works
- ✅ Dialog keyboard shortcuts work (Esc to close)

---

### Phase 3: IndexedDB Persistence (3-4 hours)

**Goals**:
- Create PlaylistDatabase utility
- Migrate from localStorage
- Implement save/load named playlists
- Auto-save current playlist

**Tasks**:
1. Create `playlistDB.ts` utility
2. Define IndexedDB schema
3. Implement CRUD operations
4. Add migration from localStorage
5. Update PlaylistContext to use IndexedDB
6. Add save/load UI in dialog
7. Test persistence across sessions
8. Test named playlist save/load

**Acceptance Criteria**:
- ✅ Current playlist persists across sessions
- ✅ Can save named playlists
- ✅ Can load saved playlists
- ✅ Can delete saved playlists
- ✅ Migration from localStorage works
- ✅ No data loss during migration

---

### Phase 4: YouTube Search Play Buttons (2-3 hours)

**Goals**:
- Add play buttons to YouTube search results
- Wire up playlist navigation
- Optional: open dialog on play

**Tasks**:
1. Modify YouTube result rendering in ChatTab
2. Add play button to each video
3. Implement click handler (find in playlist, play)
4. Style play buttons
5. Test with multiple videos
6. Handle edge cases (video not in playlist)

**Acceptance Criteria**:
- ✅ Play buttons appear on all YouTube results
- ✅ Clicking play button starts playback
- ✅ Current track updates correctly
- ✅ Player dialog opens (optional behavior)
- ✅ Works with multiple videos in one response

---

### Phase 5: Auto-add from Searches (1-2 hours)

**Goals**:
- Add YouTube videos to playlist start (not end)
- Group by date added
- Continue current playback

**Tasks**:
1. Modify addTracks to support prepend option
2. Update ChatTab to prepend new videos
3. Test playlist order
4. Test playback continuation
5. Verify date grouping

**Acceptance Criteria**:
- ✅ New videos added at playlist start
- ✅ Current playback uninterrupted
- ✅ Date grouping works correctly
- ✅ No duplicate videos

---

### Phase 6: Chromecast Video Integration (3-4 hours)

**Goals**:
- Cast YouTube video fullscreen to TV
- Sync play/pause state
- Switch between chat and video modes

**Tasks**:
1. Update CastContext with video messages
2. Modify chromecast-receiver.html for video
3. Implement video play/pause/stop casting
4. Test on real Chromecast device
5. Handle mode switching (chat ↔ video)

**Acceptance Criteria**:
- ✅ Video casts fullscreen to TV
- ✅ Play/pause syncs with sender
- ✅ Can switch back to chat mode
- ✅ Video quality acceptable on TV
- ✅ No audio sync issues

---

### Phase 7: Polish & Testing (2-3 hours)

**Goals**:
- Fix bugs
- Improve UX
- Add loading states
- Error handling
- Performance optimization

**Tasks**:
1. Add loading indicators
2. Add error messages
3. Optimize re-renders
4. Test edge cases
5. Mobile testing
6. Dark mode testing
7. Accessibility testing

**Acceptance Criteria**:
- ✅ No console errors
- ✅ Smooth animations
- ✅ Loading states visible
- ✅ Error messages helpful
- ✅ Works on mobile
- ✅ Dark mode works
- ✅ Keyboard accessible

---

## Technical Specifications

### YouTube Player Integration

**Embed Options**:

#### Option 1: Simple iframe (Recommended for MVP)
```tsx
<iframe
  src={`https://www.youtube.com/embed/${videoId}?autoplay=1&enablejsapi=1`}
  allow="autoplay; encrypted-media"
  allowFullScreen
  className="w-full aspect-video"
/>
```

**Pros**: Simple, reliable, no API key needed  
**Cons**: Less control, YouTube branding

#### Option 2: YouTube IFrame API (Advanced)
```tsx
import { useEffect, useRef } from 'react';

const player = useRef<YT.Player | null>(null);

useEffect(() => {
  // Load YouTube IFrame API
  if (!window.YT) {
    const tag = document.createElement('script');
    tag.src = 'https://www.youtube.com/iframe_api';
    document.head.appendChild(tag);
  }
  
  window.onYouTubeIframeAPIReady = () => {
    player.current = new YT.Player('player', {
      videoId: currentTrack.videoId,
      events: {
        onReady: onPlayerReady,
        onStateChange: onPlayerStateChange
      }
    });
  };
}, [currentTrack]);
```

**Pros**: Full control, events, custom UI  
**Cons**: More complex, needs API setup

**Recommendation**: Start with Option 1, upgrade to Option 2 if needed

---

### Date Grouping Logic

```typescript
function groupPlaylistByDate(playlist: PlaylistTrack[]) {
  const groups: Map<string, PlaylistTrack[]> = new Map();
  
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);
  
  playlist.forEach(track => {
    const trackDate = new Date(track.addedAt);
    trackDate.setHours(0, 0, 0, 0);
    
    let label: string;
    if (trackDate.getTime() === today.getTime()) {
      label = 'Today';
    } else if (trackDate.getTime() === yesterday.getTime()) {
      label = 'Yesterday';
    } else if (trackDate > new Date(today.getTime() - 7 * 24 * 60 * 60 * 1000)) {
      label = 'This Week';
    } else {
      label = trackDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    }
    
    if (!groups.has(label)) {
      groups.set(label, []);
    }
    groups.get(label)!.push(track);
  });
  
  return Array.from(groups.entries());
}
```

---

### PlaylistContext Updates

**Add to existing context**:

```typescript
interface PlaylistContextType {
  // ... existing properties
  
  // NEW: Named playlists
  savedPlaylists: Array<{ id: string, name: string, trackCount: number }>;
  savePlaylistAs: (name: string) => Promise<void>;
  loadPlaylist: (id: string) => Promise<void>;
  deletePlaylist: (id: string) => Promise<void>;
  
  // NEW: Prepend option
  addTracksToStart: (tracks: Omit<PlaylistTrack, 'id' | 'addedAt'>[]) => void;
  
  // NEW: Find and play
  playTrackByVideoId: (videoId: string) => boolean; // returns true if found
}
```

---

## UI/UX Design

### Header Player Button Design

**Compact Layout**:
```
Mobile (< 640px):
[◀] [▶️] [...] [📋]

Tablet (640px - 1024px):
[◀] [▶️] "Current Track Ti..." [📋]

Desktop (> 1024px):
[◀] [▶️] "Current Track Title Here..." [📋 Playlist]
```

**Color Scheme**:
- Play button: Green (`bg-green-500`)
- Pause button: Blue (`bg-blue-500`)
- Prev/Next: Gray (`bg-gray-500`)
- Playlist button: Purple (`bg-purple-500`)

**Hover Effects**:
- Darken on hover
- Scale slightly (1.05x)
- Smooth transitions

---

### Dialog Layout Responsive Design

**Desktop (> 1024px)**:
- Video player: 16:9 aspect ratio, max-width 800px
- Playlist: Scrollable, max-height 400px
- Two columns where appropriate

**Tablet (768px - 1024px)**:
- Video player: Full width
- Playlist: Scrollable, max-height 300px
- Single column

**Mobile (< 768px)**:
- Video player: Full width, smaller height
- Playlist: Most of screen, scrollable
- Compact controls

---

### Dark Mode Support

All components must support dark mode using Tailwind's `dark:` prefix.

**Color Palette**:
```typescript
const colors = {
  light: {
    background: 'bg-white',
    text: 'text-gray-900',
    border: 'border-gray-200',
    hover: 'hover:bg-gray-100'
  },
  dark: {
    background: 'dark:bg-gray-800',
    text: 'dark:text-gray-100',
    border: 'dark:border-gray-700',
    hover: 'dark:hover:bg-gray-700'
  }
};
```

---

## Database Schema

### IndexedDB Structure

**Database Name**: `youtube-playlist-db`  
**Version**: 1

**Object Stores**:

#### 1. `currentPlaylist` (keyPath: 'id')
```typescript
{
  id: 'current',
  tracks: PlaylistTrack[],
  currentIndex: number | null,
  isPlaying: boolean,
  updatedAt: number
}
```

#### 2. `savedPlaylists` (keyPath: 'id', autoIncrement: true)
```typescript
{
  id: number,
  name: string,
  tracks: PlaylistTrack[],
  createdAt: number,
  updatedAt: number
}
```

**Indexes**:
- `savedPlaylists.name` (unique: false)
- `savedPlaylists.createdAt` (unique: false)

---

## Integration Points

### 1. ChatTab Integration

**Current Code** (lines 885-923):
```typescript
// Extract YouTube videos from tool results
const youtubeResults: any[] = [];
// ... parsing logic ...

// Add to playlist
if (youtubeResults.length > 0) {
  const tracks = youtubeResults.map((video: any) => ({ ... }));
  addTracks(tracks); // Currently adds to end
  showSuccess(`Added ${tracks.length} video(s) to playlist`);
}
```

**New Code**:
```typescript
// Add to playlist START instead of end
if (youtubeResults.length > 0) {
  const tracks = youtubeResults.map((video: any) => ({ ... }));
  addTracksToStart(tracks); // NEW: Add to start
  showSuccess(`Added ${tracks.length} video(s) to playlist`);
}

// Also add play buttons in YouTube result rendering
// Detect YouTube results in assistant message content
// For each video link, add a play button
```

### 2. GoogleLoginButton Integration

**Current Layout**:
```tsx
<div className="flex items-center gap-2 sm:gap-3">
  <img src={user.picture} ... />
  <div>...</div>
  {isAvailable && <CastButton />}
  <SignOutButton />
</div>
```

**New Layout**:
```tsx
<div className="flex items-center gap-2 sm:gap-3">
  <img src={user.picture} ... />
  <div>...</div>
  {playlist.length > 0 && <MediaPlayerButton />} {/* NEW */}
  {isAvailable && <CastButton />}
  <SignOutButton />
</div>
```

### 3. CastContext Integration

**Add Video Casting Messages**:
```typescript
// NEW message types
type CastMessageType = 
  | 'MESSAGES_UPDATE'   // existing
  | 'VIDEO_PLAY'        // NEW
  | 'VIDEO_PAUSE'       // NEW
  | 'VIDEO_STOP';       // NEW

interface CastMessage {
  type: CastMessageType;
  messages?: Message[];
  videoId?: string;
  videoUrl?: string;
}

// NEW: Send video to cast device
const castVideo = (videoId: string) => {
  if (!session) return;
  session.sendMessage(NAMESPACE, {
    type: 'VIDEO_PLAY',
    videoId,
    videoUrl: `https://www.youtube.com/watch?v=${videoId}`
  });
};
```

### 4. PlaylistContext Integration

**Update Context**:
```typescript
// Add to PlaylistContext
const addTracksToStart = useCallback((tracks: Omit<PlaylistTrack, 'id' | 'addedAt'>[]) => {
  const newTracks = tracks.map(track => ({
    ...track,
    id: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
    addedAt: Date.now()
  }));
  setPlaylist(prev => [...newTracks, ...prev]);
  // Note: Don't change currentTrackIndex if playing
  // Prepending shifts indices, so adjust currentTrackIndex
  if (currentTrackIndex !== null) {
    setCurrentTrackIndex(prev => prev !== null ? prev + newTracks.length : null);
  }
}, [currentTrackIndex]);
```

---

## Testing Strategy

### Unit Tests

**Components to Test**:
1. `MediaPlayerButton.tsx`
   - Renders only when playlist has items
   - Shows current track title
   - Play/pause toggle works
   - Next/previous navigation works

2. `MediaPlayerDialog.tsx`
   - Video player renders
   - Metadata displays
   - Date grouping correct
   - Delete confirmation works

3. `playlistDB.ts`
   - Save/load operations
   - Migration from localStorage
   - Error handling

**Test Files**:
- `tests/unit/components/MediaPlayerButton.test.tsx`
- `tests/unit/components/MediaPlayerDialog.test.tsx`
- `tests/unit/utils/playlistDB.test.ts`

### Integration Tests

**Scenarios**:
1. YouTube search → auto-add to playlist → play from results
2. Save playlist → reload page → load playlist → verify tracks
3. Cast session → play video → verify fullscreen on TV
4. Add tracks while playing → verify playback continues
5. Group by date → verify grouping logic

### Manual Testing Checklist

**Header Button**:
- [ ] Appears when playlist has items
- [ ] Hides when playlist empty
- [ ] Shows current track title
- [ ] Play/pause button works
- [ ] Next/previous buttons work
- [ ] Opens dialog on click
- [ ] Mobile responsive
- [ ] Dark mode works

**Playlist Dialog**:
- [ ] Video player loads and plays
- [ ] Metadata displays correctly
- [ ] Date grouping correct
- [ ] Click track to play works
- [ ] Delete with confirmation works
- [ ] Clear playlist with confirmation works
- [ ] Save playlist works
- [ ] Load playlist works
- [ ] Keyboard shortcuts work (Esc)
- [ ] Scrolling works smoothly
- [ ] Mobile responsive
- [ ] Dark mode works

**YouTube Search Integration**:
- [ ] Play buttons appear on videos
- [ ] Clicking play starts playback
- [ ] Videos auto-added to playlist
- [ ] New videos added at start
- [ ] No duplicate videos

**Chromecast Integration**:
- [ ] Video casts to TV
- [ ] Video displays fullscreen
- [ ] Play/pause syncs
- [ ] Can switch back to chat
- [ ] No audio lag

**Persistence**:
- [ ] Playlist persists across sessions
- [ ] Current track remembered
- [ ] Play state remembered
- [ ] Named playlists save correctly
- [ ] Named playlists load correctly

---

## Timeline

### Total Estimated Time: 20-25 hours

**Phase 1**: Foundation & Header Button (2-3 hours)  
**Phase 2**: Enhanced Playlist Dialog (4-5 hours)  
**Phase 3**: IndexedDB Persistence (3-4 hours)  
**Phase 4**: YouTube Search Play Buttons (2-3 hours)  
**Phase 5**: Auto-add from Searches (1-2 hours)  
**Phase 6**: Chromecast Video Integration (3-4 hours)  
**Phase 7**: Polish & Testing (2-3 hours)  
**Phase 8**: Documentation (1-2 hours)

### Recommended Schedule

**Day 1** (6-8 hours):
- Phase 1: Header button
- Phase 2: Dialog enhancements (start)

**Day 2** (6-8 hours):
- Phase 2: Dialog enhancements (finish)
- Phase 3: IndexedDB persistence

**Day 3** (6-8 hours):
- Phase 4: Search play buttons
- Phase 5: Auto-add logic
- Phase 6: Chromecast video

**Day 4** (2-4 hours):
- Phase 7: Polish & testing
- Phase 8: Documentation

**Total**: 3-4 days of focused work

---

## File Structure

### New Files to Create

```
ui-new/src/
├── components/
│   ├── MediaPlayerButton.tsx         (NEW - Phase 1)
│   ├── MediaPlayerDialog.tsx         (NEW - Phase 2, replaces PlaylistDialog)
│   ├── VideoMetadata.tsx             (NEW - Phase 2)
│   └── PlaylistItem.tsx              (NEW - Phase 2, extracted component)
├── utils/
│   └── playlistDB.ts                 (NEW - Phase 3)
├── hooks/
│   └── useVideoPlayer.ts             (NEW - Phase 2, optional)
└── types/
    └── playlist.ts                   (NEW - centralized types)

tests/unit/
├── components/
│   ├── MediaPlayerButton.test.tsx    (NEW)
│   ├── MediaPlayerDialog.test.tsx    (NEW)
│   └── VideoMetadata.test.tsx        (NEW)
└── utils/
    └── playlistDB.test.ts            (NEW)
```

### Files to Modify

```
ui-new/src/
├── components/
│   ├── GoogleLoginButton.tsx         (MODIFY - add MediaPlayerButton)
│   └── ChatTab.tsx                   (MODIFY - add play buttons to results)
├── contexts/
│   ├── PlaylistContext.tsx           (MODIFY - add IndexedDB, named playlists)
│   └── CastContext.tsx               (MODIFY - add video casting)
└── chromecast-receiver.html          (MODIFY - add video player mode)
```

---

## Code Examples

### MediaPlayerButton Component

```tsx
import React, { useState } from 'react';
import { usePlaylist } from '../contexts/PlaylistContext';
import { MediaPlayerDialog } from './MediaPlayerDialog';

export const MediaPlayerButton: React.FC = () => {
  const [showDialog, setShowDialog] = useState(false);
  const { 
    playlist, 
    currentTrack, 
    isPlaying, 
    togglePlayPause, 
    nextTrack, 
    previousTrack 
  } = usePlaylist();

  // Don't render if no tracks
  if (playlist.length === 0) return null;

  return (
    <>
      <div className="flex items-center gap-1 bg-gray-100 dark:bg-gray-700 rounded-lg px-2 py-1">
        {/* Previous Button */}
        <button
          onClick={previousTrack}
          className="p-1 hover:bg-gray-200 dark:hover:bg-gray-600 rounded transition-colors"
          title="Previous Track"
        >
          <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
            <path d="M6 6h2v12H6zm3.5 6l8.5 6V6z"/>
          </svg>
        </button>

        {/* Play/Pause Button */}
        <button
          onClick={togglePlayPause}
          className={`p-1 rounded transition-colors ${
            isPlaying 
              ? 'bg-blue-500 hover:bg-blue-600 text-white' 
              : 'bg-green-500 hover:bg-green-600 text-white'
          }`}
          title={isPlaying ? 'Pause' : 'Play'}
        >
          {isPlaying ? (
            <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
              <path d="M6 4h4v16H6V4zm8 0h4v16h-4V4z"/>
            </svg>
          ) : (
            <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
              <path d="M8 5v14l11-7z"/>
            </svg>
          )}
        </button>

        {/* Next Button */}
        <button
          onClick={nextTrack}
          className="p-1 hover:bg-gray-200 dark:hover:bg-gray-600 rounded transition-colors"
          title="Next Track"
        >
          <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
            <path d="M6 18l8.5-6L6 6v12zM16 6v12h2V6h-2z"/>
          </svg>
        </button>

        {/* Current Track Title */}
        <span className="hidden sm:inline text-sm text-gray-700 dark:text-gray-300 truncate max-w-[150px] md:max-w-[200px]">
          {currentTrack?.title || 'No track'}
        </span>

        {/* Open Dialog Button */}
        <button
          onClick={() => setShowDialog(true)}
          className="p-1 bg-purple-500 hover:bg-purple-600 text-white rounded transition-colors ml-1"
          title="Open Playlist"
        >
          <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
            <path d="M15 6H3v2h12V6zm0 4H3v2h12v-2zM3 16h8v-2H3v2zM17 6v8.18c-.31-.11-.65-.18-1-.18-1.66 0-3 1.34-3 3s1.34 3 3 3 3-1.34 3-3V8h3V6h-5z"/>
          </svg>
          <span className="hidden md:inline ml-1 text-xs">Playlist</span>
        </button>
      </div>

      <MediaPlayerDialog isOpen={showDialog} onClose={() => setShowDialog(false)} />
    </>
  );
};
```

---

### PlaylistDB Utility

```typescript
import { openDB, DBSchema, IDBPDatabase } from 'idb';
import { PlaylistTrack } from '../contexts/PlaylistContext';

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

class PlaylistDatabase {
  private db: IDBPDatabase<PlaylistDBSchema> | null = null;

  async init() {
    if (this.db) return;

    this.db = await openDB<PlaylistDBSchema>('youtube-playlist-db', 1, {
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
          store.createIndex('by-name', 'name');
          store.createIndex('by-date', 'createdAt');
        }
      },
    });

    // Migrate from localStorage if exists
    await this.migrateFromLocalStorage();
  }

  private async migrateFromLocalStorage() {
    const legacyPlaylist = localStorage.getItem('youtube_playlist');
    const legacyIndex = localStorage.getItem('youtube_current_track');

    if (legacyPlaylist) {
      try {
        const tracks = JSON.parse(legacyPlaylist);
        const currentIndex = legacyIndex ? parseInt(legacyIndex, 10) : null;
        
        await this.saveCurrentPlaylist(tracks, currentIndex);
        
        // Keep legacy data for one more version
        // localStorage.removeItem('youtube_playlist');
        // localStorage.removeItem('youtube_current_track');
      } catch (error) {
        console.error('Migration from localStorage failed:', error);
      }
    }
  }

  async saveCurrentPlaylist(tracks: PlaylistTrack[], currentIndex: number | null) {
    await this.init();
    await this.db!.put('currentPlaylist', {
      id: 'current',
      tracks,
      currentIndex,
      isPlaying: false, // Don't persist play state
      updatedAt: Date.now()
    });
  }

  async loadCurrentPlaylist(): Promise<{ tracks: PlaylistTrack[], currentIndex: number | null }> {
    await this.init();
    const data = await this.db!.get('currentPlaylist', 'current');
    return {
      tracks: data?.tracks || [],
      currentIndex: data?.currentIndex || null
    };
  }

  async savePlaylist(name: string, tracks: PlaylistTrack[]): Promise<number> {
    await this.init();
    const id = await this.db!.add('savedPlaylists', {
      id: 0, // Will be auto-incremented
      name,
      tracks,
      createdAt: Date.now(),
      updatedAt: Date.now()
    });
    return id;
  }

  async loadPlaylist(id: number): Promise<PlaylistTrack[]> {
    await this.init();
    const playlist = await this.db!.get('savedPlaylists', id);
    return playlist?.tracks || [];
  }

  async listPlaylists() {
    await this.init();
    const playlists = await this.db!.getAll('savedPlaylists');
    return playlists.map(p => ({
      id: p.id,
      name: p.name,
      trackCount: p.tracks.length,
      createdAt: p.createdAt
    }));
  }

  async deletePlaylist(id: number) {
    await this.init();
    await this.db!.delete('savedPlaylists', id);
  }

  async clearCurrentPlaylist() {
    await this.init();
    await this.db!.delete('currentPlaylist', 'current');
  }
}

export const playlistDB = new PlaylistDatabase();
```

---

## Success Criteria

### MVP (Minimum Viable Product)

- ✅ Header player button shows when playlist has items
- ✅ Play/pause/next/previous controls work
- ✅ Dialog shows video player and playlist
- ✅ Can click tracks to play
- ✅ Can delete tracks with confirmation
- ✅ Playlist persists across sessions
- ✅ YouTube searches auto-add to playlist
- ✅ Play buttons in YouTube results work

### Full Feature Set

- ✅ All MVP features
- ✅ IndexedDB persistence working
- ✅ Save/load named playlists
- ✅ Date-based grouping in playlist
- ✅ Video metadata display
- ✅ Chromecast video casting
- ✅ Mobile responsive
- ✅ Dark mode support
- ✅ Keyboard shortcuts
- ✅ Loading states
- ✅ Error handling
- ✅ All tests passing

---

## Risk Assessment

### High Risk

1. **Chromecast Video Casting Complexity**
   - Mitigation: Start with simple iframe casting, upgrade if needed
   - Fallback: Desktop-only video player

2. **YouTube Embed Restrictions**
   - Mitigation: Test with various videos, handle errors gracefully
   - Fallback: External link if embed blocked

3. **IndexedDB Browser Support**
   - Mitigation: Check browser support, fallback to localStorage
   - Fallback: localStorage for unsupported browsers

### Medium Risk

1. **Mobile Performance**
   - Mitigation: Optimize re-renders, use React.memo
   - Fallback: Simplified mobile UI

2. **Date Grouping Logic**
   - Mitigation: Thorough testing with various dates
   - Fallback: Flat list without grouping

### Low Risk

1. **UI/UX Polish**
   - Mitigation: Iterative improvements based on testing
   - Fallback: Functional but less polished UI

---

## Future Enhancements

### Phase 2 Features (Post-MVP)

1. **Shuffle & Repeat Modes**
   - Shuffle playlist order
   - Repeat one/repeat all

2. **Playlist Search/Filter**
   - Search within playlist
   - Filter by channel/duration

3. **Video Quality Control**
   - Select video quality (720p, 1080p)
   - Auto-quality based on bandwidth

4. **Mini Player Mode**
   - Picture-in-picture
   - Floating player widget

5. **Playlist Sharing**
   - Export playlist as JSON
   - Share URL with playlist

6. **Advanced Grouping**
   - Group by channel
   - Group by duration
   - Custom groups

7. **Playback Speed Control**
   - 0.5x, 1x, 1.5x, 2x speeds
   - Remember preference

8. **Video Chapters Support**
   - Show chapters in metadata
   - Jump to chapters

9. **Keyboard Shortcuts**
   - Space: play/pause
   - N: next track
   - P: previous track
   - M: mute
   - F: fullscreen

10. **Analytics**
    - Track most played videos
    - Playback history
    - Listening statistics

---

## Questions to Resolve

### Before Starting Implementation

1. **Video Player Library**: Use simple iframe or YouTube IFrame API?
   - **Recommendation**: Start with iframe, upgrade if needed

2. **Cast Mode**: Dedicated video receiver or enhanced chat receiver?
   - **Recommendation**: Enhanced chat receiver with video mode

3. **Mobile Layout**: Separate mobile dialog or responsive single dialog?
   - **Recommendation**: Responsive single dialog

4. **Prepend vs Append**: Add new videos to start or end?
   - **Requirement**: Start (specified in requirements)

5. **Auto-play**: Auto-play first video when added to empty playlist?
   - **Recommendation**: No, manual play only

6. **Duplicate Handling**: What if same video added twice?
   - **Recommendation**: Allow duplicates (user might want to replay)

---

## Documentation Deliverables

1. **Implementation Guide** (this document)
2. **User Guide** (how to use the player)
3. **API Documentation** (PlaylistContext, PlaylistDB)
4. **Chromecast Video Guide** (how to cast videos)
5. **Troubleshooting Guide** (common issues)

---

## Conclusion

This implementation plan provides a comprehensive roadmap for building a full-featured YouTube media player for the LLM Proxy application. The phased approach allows for iterative development and testing, with each phase building on the previous one.

**Key Success Factors**:
- Start with MVP features (phases 1-4)
- Test thoroughly at each phase
- Optimize performance early
- Maintain existing functionality
- Follow existing code patterns

**Estimated Delivery**: 3-4 days of focused development work

---

**Document Version**: 1.0  
**Last Updated**: October 14, 2025  
**Author**: AI Assistant  
**Status**: ✅ Ready for Implementation
