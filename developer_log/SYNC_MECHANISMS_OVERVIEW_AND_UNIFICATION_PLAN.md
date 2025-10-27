# Sync Mechanisms Overview & Unification Plan

**Created**: October 27, 2025  
**Status**: Analysis Complete - Planning Phase

## Executive Summary

The application currently has **7 distinct sync mechanisms** operating independently with inconsistent patterns, naming conventions, and storage strategies. This document provides a comprehensive overview of each system and proposes a unified architecture to consolidate, standardize, and improve sync operations across the application.

**Key Finding**: `auto_sync_enabled` currently defaults to `false` - this should be `true` by default to provide seamless user experience.

---

## Part 1: Current Sync Mechanisms Inventory

### 1. Plans & Playlists Sync (Google Drive)

**Location**: `ui-new/src/services/googleDriveSync.ts` + `ui-new/src/hooks/useBackgroundSync.ts`

**What It Syncs**:
- Research plans (from Planning tab)
- Audio playlists (from Chromecast player)

**Storage**:
- **Local**: localStorage (`llm_proxy_planning_cache`), IndexedDB (`PlaylistsDB`)
- **Remote**: Google Drive files (`saved_plans.json`, `saved_playlists.json`, `sync_metadata.json`)
- **Folder**: `LLM Proxy App Data/` in user's Drive

**Sync Strategy**:
- **Trigger**: Interval-based (every 5 minutes) + debounced on change (30 seconds)
- **Direction**: Bidirectional (conflict detection via timestamps)
- **Method**: REST API to Google Drive v3
- **Auto-sync**: Controlled by `auto_sync_enabled` localStorage flag (currently **defaults to false** ⚠️)

**Conflict Resolution**:
```typescript
if (remoteTimestamp > localTimestamp) {
  action = 'downloaded'; // Remote wins (newer)
} else if (localTimestamp > remoteTimestamp) {
  action = 'uploaded'; // Local wins (newer)
} else {
  action = 'no-change'; // Identical
}
```

**Current Status**: ✅ Working, but auto-sync disabled by default

**Code Example**:
```typescript
// App.tsx (lines 56-69)
const autoSyncEnabled = localStorage.getItem('auto_sync_enabled') === 'true'; // ⚠️ Defaults to false!
useBackgroundSync({
  enabled: autoSyncEnabled,
  onSyncComplete: (result) => { ... },
  onSyncError: (error) => { ... }
});
```

---

### 2. RAG Snippets & Embeddings Sync (Google Sheets)

**Location**: `ui-new/src/services/ragSyncService.ts` + `ui-new/src/contexts/SwagContext.tsx`

**What It Syncs**:
- Knowledge base snippets (content captured from conversations)
- Vector embeddings (generated from snippets for semantic search)

**Storage**:
- **Local**: IndexedDB (`ragDB`, `snippets`)
- **Remote**: Google Sheets (user-specific spreadsheet with `Snippets` and `Embeddings` tabs)

**Sync Strategy**:
- **Trigger**: 
  - Automatic after every snippet add/update/delete (queued)
  - Background auto-sync (every 1 minute when authenticated)
- **Direction**: Bidirectional (pull on init, push on changes)
- **Method**: 
  - **Client-side**: Direct Google Sheets API (preferred, avoids Lambda concurrency)
  - **Fallback**: Backend `/rag-sync` endpoint
- **Auto-sync**: Always enabled when authenticated

**Conflict Resolution**:
- Uses `deviceId` + `timestamp` to track changes
- Newer timestamp wins
- Maintains `lastModified` field per snippet

**Current Status**: ✅ Working, auto-sync enabled by default

**Code Example**:
```typescript
// SwagContext.tsx (lines 295-356)
await ragSyncService.initialize({
  spreadsheetId,
  autoSync: true,  // ✅ Always enabled
  syncInterval: 60000, // 1 minute
  retryAttempts: 3,
  deviceId: ragSyncService.getDeviceId(),
});
ragSyncService.startAutoSync();
```

---

### 3. Provider Credentials Sync (Google Drive)

**Location**: `ui-new/src/utils/googleDocs.ts` + `ui-new/src/components/ProviderList.tsx`

**What It Syncs**:
- API keys and credentials for LLM providers (OpenAI, Groq, Anthropic, etc.)

**Storage**:
- **Local**: localStorage (`provider_credentials`, `openai_api_key`, `groq_api_key`, etc.)
- **Remote**: Google Drive file (`settings.json` in `Research Agent` folder)

**Sync Strategy**:
- **Trigger**: Manual only (Load/Save buttons in Provider Settings)
- **Direction**: Bidirectional (user-initiated)
- **Method**: Google Drive Files API v3
- **Auto-sync**: ❌ Not available (manual buttons only)

**Current Status**: ⚠️ Manual only, no auto-sync

**Code Example**:
```typescript
// ProviderList.tsx (lines 113-130)
const handleSaveToDrive = async () => {
  const credentials = { /* all provider keys */ };
  await saveSettingsToDrive(JSON.stringify(credentials, null, 2));
  showSuccess('Provider credentials saved to Google Drive');
};

const handleLoadFromDrive = async () => {
  const settingsJson = await loadSettingsFromDrive();
  if (settingsJson) {
    const settings = JSON.parse(settingsJson);
    // Restore to localStorage
  }
};
```

---

### 4. Chat History (IndexedDB Only)

**Location**: `ui-new/src/utils/chatHistory.ts` + `ui-new/src/utils/chatHistoryDB.ts`

**What It "Syncs"**:
- Chat conversation history
- System prompts and planning context
- Selected snippet IDs and todo states

**Storage**:
- **Local**: IndexedDB (`ChatHistoryDB`)
- **Remote**: ❌ None (local-only storage)

**Sync Strategy**:
- **No cloud sync** - purely local persistence
- **Migration**: Migrated from localStorage to IndexedDB for capacity
- **Cross-device**: ❌ Not available

**Current Status**: ⚠️ Local-only, no cross-device sync

**Potential Issues**:
- Users lose chat history when switching browsers/devices
- No backup if browser data is cleared
- Could benefit from Google Drive sync (similar to Plans)

---

### 5. Usage Logs & Billing (Backend Only)

**Location**: Backend Google Sheets integration (`src/services/usage-logger.js`)

**What It "Syncs"**:
- Token usage per request
- Cost calculations
- Provider usage breakdown
- Transaction history (credit purchases)

**Storage**:
- **Local**: ❌ None (except temporary display in UI)
- **Remote**: Google Sheets (user-specific spreadsheet with `Usage Logs` tab)

**Sync Strategy**:
- **Trigger**: Backend writes to Sheets after every `/chat` request
- **Direction**: Unidirectional (backend → Sheets)
- **Method**: Backend Google Sheets API via service account
- **Auto-sync**: ✅ Automatic (on every request)

**Current Status**: ✅ Working, backend-driven

**Note**: This is **not** a sync in the traditional sense - it's pure logging/append-only writes

---

### 6. Application Settings (localStorage Only)

**Location**: `ui-new/src/contexts/SettingsContext.tsx`

**What It Stores**:
- UI preferences (dark mode, language, font size)
- LLM model selections (default models per provider)
- Tool enable/disable flags (search_web, ask_llm, etc.)
- System prompt templates
- RAG settings (auto-embed, similarity threshold)

**Storage**:
- **Local**: localStorage (`app_settings`)
- **Remote**: ⚠️ Partially synced via `googleDocs.ts` provider credentials sync

**Sync Strategy**:
- **No dedicated sync** - settings are included in provider credentials sync
- **Issue**: Conflates API keys (sensitive) with preferences (non-sensitive)

**Current Status**: ⚠️ Inconsistent, bundled with credentials

---

### 7. Chromecast Conversation Sync (Real-time)

**Location**: `ui-new/src/components/ChatTab.tsx`

**What It Syncs**:
- Chat messages to Chromecast display
- Scroll position for synchronized reading

**Storage**:
- **Local**: React state (`messages`)
- **Remote**: Chromecast receiver app (temporary, in-memory)

**Sync Strategy**:
- **Trigger**: Real-time on message updates
- **Direction**: Unidirectional (browser → Chromecast)
- **Method**: Cast SDK messaging
- **Auto-sync**: ✅ Automatic when connected

**Current Status**: ✅ Working

**Code Example**:
```typescript
// ChatTab.tsx (lines 794-800)
useEffect(() => {
  if (isCasting && castSession) {
    console.log('Syncing messages to Chromecast:', messages.length);
    castSession.sendMessage('urn:x-cast:com.example.research-agent', 
      { type: 'UPDATE_MESSAGES', messages });
  }
}, [messages, isCasting, castSession]);
```

---

## Part 2: Sync Mechanism Comparison Matrix

| Mechanism | Data | Local Storage | Remote Storage | Sync Type | Auto-Sync | Conflict Resolution | Status |
|-----------|------|--------------|----------------|-----------|-----------|---------------------|--------|
| **Plans & Playlists** | Research plans, audio playlists | localStorage + IndexedDB | Google Drive files | Bidirectional | ⚠️ Off by default | Timestamp (newer wins) | ✅ Working |
| **RAG Snippets** | Knowledge base, embeddings | IndexedDB | Google Sheets | Bidirectional | ✅ On by default | deviceId + timestamp | ✅ Working |
| **Provider Credentials** | API keys | localStorage | Google Drive file | Bidirectional | ❌ Manual only | Manual (user overwrites) | ⚠️ Manual |
| **Chat History** | Conversations | IndexedDB | ❌ None | ❌ Local only | ❌ N/A | ❌ N/A | ⚠️ No cloud |
| **Usage Logs** | Billing, token usage | ❌ None | Google Sheets | Unidirectional | ✅ On by default | ❌ Append-only | ✅ Working |
| **Settings** | UI prefs, model config | localStorage | ⚠️ Bundled w/ creds | ⚠️ Bundled | ❌ Manual only | Manual (user overwrites) | ⚠️ Inconsistent |
| **Chromecast** | Live messages | React state | Chromecast receiver | Unidirectional | ✅ When connected | ❌ Overwrite | ✅ Working |

---

## Part 3: Pain Points & Issues

### Issue 1: ⚠️ Auto-Sync Disabled by Default
**Problem**: `auto_sync_enabled` localStorage key defaults to `false`
```typescript
// App.tsx line 57
const autoSyncEnabled = localStorage.getItem('auto_sync_enabled') === 'true'; // false if not set!
```

**Impact**:
- Users don't get automatic backup of plans/playlists
- Cross-device sync doesn't work until manually enabled
- New users don't benefit from cloud features

**Fix Required**: Change to `localStorage.getItem('auto_sync_enabled') !== 'false'` (opt-out instead of opt-in)

---

### Issue 2: Inconsistent Storage Strategies
**Problem**: Same type of data uses different storage backends

**Examples**:
- Plans: localStorage
- Playlists: IndexedDB
- Chat history: IndexedDB
- Settings: localStorage
- RAG snippets: IndexedDB

**Impact**:
- Confusing codebase with multiple storage APIs
- Different quota limits and performance characteristics
- Migration complexity (already had to migrate playlists)

---

### Issue 3: No Chat History Cloud Sync
**Problem**: Chat conversations are local-only (IndexedDB)

**User Impact**:
- Cannot access chat history on different devices
- No backup if browser data cleared
- Loses valuable conversation context

**Comparison**:
- Plans/playlists: Synced ✅
- RAG snippets: Synced ✅
- **Chat history**: Not synced ❌

---

### Issue 4: Conflated Settings & Credentials
**Problem**: Application settings bundled with API keys in provider sync

**Security Concern**:
- UI preferences (non-sensitive) mixed with API keys (highly sensitive)
- Same file stores both, reducing separation of concerns

**Better Approach**:
- Separate files: `settings.json` (preferences) + `credentials.json` (API keys)
- Different sync schedules (settings: frequent, credentials: on-demand)

---

### Issue 5: Multiple Sync Services with Duplicate Code
**Problem**: `googleDriveSync.ts` and `googleDocs.ts` both interact with Google Drive API

**Overlap**:
- Both authenticate with Google OAuth
- Both create/update files in Drive
- Both handle token refresh
- Slightly different error handling

**Impact**:
- Code duplication (~300 lines duplicated)
- Inconsistent behavior (one uses caching, one doesn't)
- Double maintenance burden

---

### Issue 6: No Unified Sync Status Indicator
**Problem**: Each sync system has its own status tracking

**Current State**:
- Plans/playlists: `useBackgroundSync` hook returns status
- RAG sync: `SyncStatus` object in `ragSyncService`
- Provider sync: No status (fire-and-forget)
- Chat history: N/A (no sync)

**User Impact**:
- No global "syncing..." indicator
- Can't tell if data is backed up
- No way to view last sync time across all systems

---

### Issue 7: Conflicting Sync Intervals
**Problem**: Different sync frequencies for different data

**Current**:
- Plans/playlists: Every 5 minutes
- RAG snippets: Every 1 minute
- Provider credentials: Manual
- Usage logs: Real-time (per request)

**Issues**:
- RAG syncing 5x more frequently than plans (why?)
- Potential API quota issues with too frequent requests
- No coordination between sync operations

---

## Part 4: Unified Sync Architecture Plan

### Goal: One Sync Service to Rule Them All

Create a **unified sync service** that handles all cloud synchronization with consistent patterns, efficient batching, and clear status reporting.

---

### Architecture: Modular Sync Manager

```typescript
// ui-new/src/services/unifiedSync.ts

interface SyncAdapter {
  name: string;
  pull(): Promise<any>;    // Download from cloud
  push(data: any): Promise<void>;  // Upload to cloud
  getLocalData(): Promise<any>;     // Read from local storage
  setLocalData(data: any): Promise<void>;  // Write to local storage
  getLastModified(): Promise<number>;  // Get local timestamp
  shouldSync(): Promise<boolean>;  // Check if sync needed
}

class UnifiedSyncService {
  private adapters: Map<string, SyncAdapter> = new Map();
  private syncStatus: GlobalSyncStatus = { ... };
  
  registerAdapter(adapter: SyncAdapter): void {
    this.adapters.set(adapter.name, adapter);
  }
  
  async syncAll(): Promise<SyncReport> {
    const results: Record<string, SyncResult> = {};
    
    for (const [name, adapter] of this.adapters) {
      if (await adapter.shouldSync()) {
        results[name] = await this.syncAdapter(adapter);
      }
    }
    
    return this.generateReport(results);
  }
  
  private async syncAdapter(adapter: SyncAdapter): Promise<SyncResult> {
    // Unified conflict resolution logic
    const localData = await adapter.getLocalData();
    const localTimestamp = await adapter.getLastModified();
    
    const remoteData = await adapter.pull();
    const remoteTimestamp = remoteData.lastModified;
    
    if (remoteTimestamp > localTimestamp) {
      // Remote wins - download
      await adapter.setLocalData(remoteData);
      return { action: 'downloaded', itemCount: remoteData.items.length };
    } else if (localTimestamp > remoteTimestamp) {
      // Local wins - upload
      await adapter.push(localData);
      return { action: 'uploaded', itemCount: localData.items.length };
    } else {
      return { action: 'no-change', itemCount: 0 };
    }
  }
}

export const unifiedSync = new UnifiedSyncService();
```

---

### Sync Adapters (Pluggable Modules)

#### 1. Plans & Playlists Adapter
```typescript
class PlansAdapter implements SyncAdapter {
  name = 'plans';
  
  async getLocalData() {
    return await getAllCachedPlans();
  }
  
  async setLocalData(data: CachedPlan[]) {
    await clearAllCachedPlans();
    for (const plan of data) {
      await saveCachedPlan(plan);
    }
  }
  
  async pull() {
    return await googleDrive.downloadFile('saved_plans.json');
  }
  
  async push(data: any) {
    await googleDrive.uploadFile('saved_plans.json', data);
  }
  
  async getLastModified() {
    const plans = await this.getLocalData();
    return Math.max(...plans.map(p => p.timestamp || 0));
  }
  
  async shouldSync() {
    // Only sync if user authenticated
    return await googleDrive.isAuthenticated();
  }
}

unifiedSync.registerAdapter(new PlansAdapter());
unifiedSync.registerAdapter(new PlaylistsAdapter());
```

#### 2. RAG Snippets Adapter
```typescript
class RAGSnippetsAdapter implements SyncAdapter {
  name = 'rag-snippets';
  
  async getLocalData() {
    return await snippetDB.getAllSnippets();
  }
  
  async pull() {
    return await googleSheets.readRange('Snippets!A:Z');
  }
  
  async push(data: ContentSnippet[]) {
    await googleSheets.writeRange('Snippets!A:Z', data);
  }
  
  // ... other methods
}
```

#### 3. Chat History Adapter (NEW!)
```typescript
class ChatHistoryAdapter implements SyncAdapter {
  name = 'chat-history';
  
  async getLocalData() {
    return await chatHistoryDB.getAllChats();
  }
  
  async pull() {
    return await googleDrive.downloadFile('chat_history.json');
  }
  
  async push(data: ChatHistoryEntry[]) {
    await googleDrive.uploadFile('chat_history.json', data);
  }
  
  async getLastModified() {
    const chats = await this.getLocalData();
    return Math.max(...chats.map(c => c.timestamp));
  }
  
  async shouldSync() {
    // Only sync chats created in last 30 days (size limitation)
    const recentChats = (await this.getLocalData())
      .filter(c => c.timestamp > Date.now() - 30 * 24 * 60 * 60 * 1000);
    return recentChats.length > 0;
  }
}
```

#### 4. Settings Adapter (NEW - Separated from Credentials)
```typescript
class SettingsAdapter implements SyncAdapter {
  name = 'settings';
  
  async getLocalData() {
    return {
      theme: localStorage.getItem('theme'),
      language: localStorage.getItem('language'),
      modelDefaults: JSON.parse(localStorage.getItem('model_defaults') || '{}'),
      toolsEnabled: JSON.parse(localStorage.getItem('tools_enabled') || '{}'),
      ragSettings: JSON.parse(localStorage.getItem('rag_settings') || '{}'),
    };
  }
  
  async setLocalData(data: any) {
    localStorage.setItem('theme', data.theme);
    localStorage.setItem('language', data.language);
    localStorage.setItem('model_defaults', JSON.stringify(data.modelDefaults));
    localStorage.setItem('tools_enabled', JSON.stringify(data.toolsEnabled));
    localStorage.setItem('rag_settings', JSON.stringify(data.ragSettings));
  }
  
  async pull() {
    return await googleDrive.downloadFile('settings.json');
  }
  
  async push(data: any) {
    await googleDrive.uploadFile('settings.json', data);
  }
}
```

#### 5. Credentials Adapter (Separated, More Secure)
```typescript
class CredentialsAdapter implements SyncAdapter {
  name = 'credentials';
  
  async getLocalData() {
    return {
      openaiKey: localStorage.getItem('openai_api_key'),
      groqKey: localStorage.getItem('groq_api_key'),
      anthropicKey: localStorage.getItem('anthropic_api_key'),
      // ... all provider keys
    };
  }
  
  async pull() {
    return await googleDrive.downloadFile('credentials.json');
  }
  
  async push(data: any) {
    await googleDrive.uploadFile('credentials.json', data);
  }
  
  async shouldSync() {
    // Only sync if explicitly enabled (opt-in for security)
    return localStorage.getItem('sync_credentials') === 'true';
  }
}
```

---

### Unified Configuration

```typescript
// Single source of truth for all sync settings
interface UnifiedSyncConfig {
  enabled: boolean;            // Master switch (default: true)
  interval: number;            // Global interval (default: 5 minutes)
  adapters: {
    plans: { enabled: boolean; interval?: number };
    playlists: { enabled: boolean; interval?: number };
    ragSnippets: { enabled: boolean; interval?: number };
    chatHistory: { enabled: boolean; interval?: number; maxAge?: number };
    settings: { enabled: boolean; interval?: number };
    credentials: { enabled: boolean; interval?: number }; // Default: false for security
  };
}

const defaultConfig: UnifiedSyncConfig = {
  enabled: true,  // ✅ Auto-sync ON by default
  interval: 5 * 60 * 1000, // 5 minutes
  adapters: {
    plans: { enabled: true },
    playlists: { enabled: true },
    ragSnippets: { enabled: true, interval: 2 * 60 * 1000 }, // 2 min (faster for active use)
    chatHistory: { enabled: true, maxAge: 30 * 24 * 60 * 60 * 1000 }, // 30 days
    settings: { enabled: true },
    credentials: { enabled: false }, // ⚠️ Opt-in only for security
  }
};
```

---

### Global Sync Status UI

```typescript
interface GlobalSyncStatus {
  syncing: boolean;
  lastSyncTime: number | null;
  nextSyncTime: number | null;
  adapterStatuses: Record<string, {
    lastSync: number;
    status: 'idle' | 'syncing' | 'success' | 'error';
    error: string | null;
    itemCount: number;
  }>;
}

// Global status indicator component
export function GlobalSyncIndicator() {
  const { syncStatus } = useUnifiedSync();
  
  if (syncStatus.syncing) {
    return (
      <div className="sync-indicator syncing">
        <span className="spinner"></span>
        <span>Syncing...</span>
      </div>
    );
  }
  
  if (syncStatus.lastSyncTime) {
    return (
      <div className="sync-indicator success">
        <span>✓</span>
        <span>Synced {formatTimeAgo(syncStatus.lastSyncTime)}</span>
      </div>
    );
  }
  
  return null;
}
```

---

### Sync Scheduling & Batching

**Problem**: Currently, each sync system operates independently, causing:
- Multiple concurrent API calls to Google Drive/Sheets
- Inefficient quota usage
- Confusing logs with overlapping operations

**Solution**: Centralized scheduler

```typescript
class SyncScheduler {
  private queue: SyncOperation[] = [];
  private batchInterval: number = 30000; // 30 seconds
  private batchTimer: NodeJS.Timeout | null = null;
  
  /**
   * Queue a sync operation (debounced)
   */
  queueSync(adapterName: string, priority: 'high' | 'normal' = 'normal'): void {
    this.queue.push({ adapterName, priority, timestamp: Date.now() });
    
    if (priority === 'high') {
      // Execute immediately
      this.executeBatch();
    } else {
      // Debounce - execute after batch interval
      if (this.batchTimer) {
        clearTimeout(this.batchTimer);
      }
      this.batchTimer = setTimeout(() => {
        this.executeBatch();
      }, this.batchInterval);
    }
  }
  
  /**
   * Execute all queued syncs in a single batch
   */
  private async executeBatch(): Promise<void> {
    if (this.queue.length === 0) return;
    
    // Deduplicate queue
    const uniqueAdapters = [...new Set(this.queue.map(op => op.adapterName))];
    this.queue = [];
    
    console.log(`🔄 Executing batch sync for: ${uniqueAdapters.join(', ')}`);
    
    // Execute all adapters in parallel (but controlled)
    const results = await Promise.allSettled(
      uniqueAdapters.map(name => unifiedSync.syncAdapter(name))
    );
    
    // Log results
    results.forEach((result, i) => {
      if (result.status === 'fulfilled') {
        console.log(`✅ ${uniqueAdapters[i]}: ${result.value.action}`);
      } else {
        console.error(`❌ ${uniqueAdapters[i]}: ${result.reason}`);
      }
    });
  }
}
```

---

## Part 5: Implementation Plan

### Phase 1: Foundation (Week 1)
**Goal**: Create unified sync infrastructure without breaking existing systems

- [ ] Create `ui-new/src/services/unifiedSync.ts` with core architecture
- [ ] Define `SyncAdapter` interface and base classes
- [ ] Implement `SyncScheduler` for batching
- [ ] Create `GlobalSyncStatus` state management
- [ ] Build `GlobalSyncIndicator` component

**Deliverables**:
- Core sync infrastructure (no adapters yet)
- Global status UI component
- Test suite for sync logic

---

### Phase 2: Migrate Existing Adapters (Week 2)
**Goal**: Wrap existing sync systems in unified adapters

- [ ] Create `PlansAdapter` wrapping `googleDriveSync.ts` plans logic
- [ ] Create `PlaylistsAdapter` wrapping `googleDriveSync.ts` playlists logic
- [ ] Create `RAGSnippetsAdapter` wrapping `ragSyncService.ts`
- [ ] Create `SettingsAdapter` (new - extract from provider sync)
- [ ] Create `CredentialsAdapter` (separate from settings)
- [ ] **Update `auto_sync_enabled` default to `true`** ⚠️ CRITICAL

**Deliverables**:
- 5 working adapters
- Migration from old services to new adapters
- Backward compatibility maintained

---

### Phase 3: New Sync Features (Week 3)
**Goal**: Add previously unsupported sync capabilities

- [ ] Create `ChatHistoryAdapter` for conversation sync
- [ ] Implement chat history pruning (only last 30 days)
- [ ] Add conflict resolution UI for chat history
- [ ] Implement separate credentials sync (opt-in)
- [ ] Add settings-only sync (opt-out)

**Deliverables**:
- Chat history cloud backup ✅
- Separated credentials/settings sync
- User controls for sync preferences

---

### Phase 4: Optimization & Cleanup (Week 4)
**Goal**: Remove duplicate code and optimize performance

- [ ] Deprecate `googleDriveSync.ts` (logic moved to adapters)
- [ ] Deprecate `ragSyncService.ts` (logic moved to adapter)
- [ ] Consolidate Google Drive auth in single module
- [ ] Implement sync batching and debouncing
- [ ] Add quota monitoring and rate limiting
- [ ] Optimize sync intervals (reduce RAG to match plans)

**Deliverables**:
- ~500 lines of code removed (duplicates)
- Single source of truth for sync logic
- Better performance and quota usage

---

### Phase 5: UX Improvements (Week 5)
**Goal**: Make sync visible and controllable

- [ ] Add global sync indicator to app header
- [ ] Create comprehensive sync settings panel
- [ ] Show per-adapter sync status
- [ ] Add manual sync buttons for each data type
- [ ] Implement sync conflict resolution UI
- [ ] Add sync history log (last 10 operations)

**Deliverables**:
- `SyncSettings.tsx` component
- Global sync status in header
- User-friendly sync controls

---

### Phase 6: Testing & Documentation (Week 6)
**Goal**: Ensure reliability and maintainability

- [ ] Unit tests for each adapter
- [ ] Integration tests for conflict resolution
- [ ] Test sync with slow/failing network
- [ ] Test cross-device sync scenarios
- [ ] Document adapter creation guide
- [ ] Update user documentation

**Deliverables**:
- Comprehensive test suite
- Developer guide for adding new adapters
- Updated user documentation

---

## Part 6: Immediate Actions

### Action 1: Fix Auto-Sync Default ⚠️ CRITICAL

**Problem**: `auto_sync_enabled` defaults to `false`

**Fix**:
```typescript
// ui-new/src/App.tsx line 57

// BEFORE (current):
const autoSyncEnabled = localStorage.getItem('auto_sync_enabled') === 'true';

// AFTER (fixed):
const autoSyncEnabled = localStorage.getItem('auto_sync_enabled') !== 'false';
// Or more explicitly:
const autoSyncEnabled = localStorage.getItem('auto_sync_enabled') === null 
  ? true  // Default to enabled
  : localStorage.getItem('auto_sync_enabled') === 'true';
```

**Impact**: All new users get automatic backup by default

---

### Action 2: Clarify Sync Scope in CloudSyncSettings UI

**Problem**: UI says "automatically synced" but doesn't specify WHAT is synced

**Current**:
```tsx
// CloudSyncSettings.tsx line 210
<p>Connect your Google account to enable automatic cloud synchronization of your 
   settings, API keys, SWAG content, and usage logs.</p>
```

**Improved**:
```tsx
<div className="sync-scope-explainer">
  <h3>What Gets Synced?</h3>
  <ul>
    <li>
      <strong>✅ Plans & Playlists</strong> - Research plans and audio playlists 
      (every 5 minutes)
    </li>
    <li>
      <strong>✅ RAG Content</strong> - Knowledge base snippets and embeddings 
      (every 1 minute)
    </li>
    <li>
      <strong>✅ Usage Logs</strong> - Billing and token usage history 
      (real-time, backend-managed)
    </li>
    <li>
      <strong>⚠️ Provider Credentials</strong> - API keys 
      (manual sync only - use Load/Save buttons in Provider Settings)
    </li>
    <li>
      <strong>❌ Chat History</strong> - Conversations 
      (local-only, not synced)
    </li>
    <li>
      <strong>❌ Application Settings</strong> - UI preferences 
      (bundled with credentials, manual sync)
    </li>
  </ul>
</div>
```

---

### Action 3: Document Current Sync Limitations

Create user-facing documentation about what is/isn't synced:

**File**: `ui-new/src/components/HelpPage.tsx` (add to Storage & Sync section)

```tsx
<div className="sync-limitations">
  <h4>⚠️ What's NOT Synced (Yet)</h4>
  <ul>
    <li><strong>Chat History</strong>: Conversations are stored locally only. 
        Clearing browser data will lose chat history.</li>
    <li><strong>UI Preferences</strong>: Dark mode, language, etc. are local-only. 
        Use provider sync to manually backup.</li>
  </ul>
  <p>
    <em>Coming soon: Automatic chat history and settings sync!</em>
  </p>
</div>
```

---

## Part 7: Benefits of Unified Sync

### Developer Benefits
1. **Single API**: One `unifiedSync.syncAll()` instead of managing multiple services
2. **Consistent Patterns**: All adapters follow same interface
3. **Easier Testing**: Mock one service instead of many
4. **Less Code**: Remove ~500 lines of duplication
5. **Better Debugging**: Centralized logging and error handling

### User Benefits
1. **Auto-Sync by Default**: Data backed up automatically ✅
2. **Comprehensive Backup**: Chat history now included
3. **Clear Status**: Global indicator shows sync state
4. **Cross-Device Sync**: All data types consistent across devices
5. **Granular Control**: Enable/disable sync per data type

### System Benefits
1. **Better Performance**: Batched sync reduces API calls
2. **Quota Management**: Centralized rate limiting
3. **Conflict Resolution**: Consistent strategy across all data
4. **Error Resilience**: Retry logic and fallback strategies
5. **Future-Proof**: Easy to add new data types

---

## Part 8: Migration Strategy

### Backward Compatibility
**Requirement**: Existing users must not lose data during migration

**Approach**:
1. **Dual Operation Period**: Run old and new sync side-by-side for 2 weeks
2. **Data Migration**: One-time migration from old format to new
3. **Gradual Rollout**: Enable unified sync for 10% → 50% → 100% of users
4. **Rollback Plan**: Keep old services available for emergency rollback

### Migration Steps
```typescript
// 1. Detect if migration needed
async function needsMigration(): Promise<boolean> {
  return localStorage.getItem('sync_migration_v1_complete') !== 'true';
}

// 2. Perform migration
async function migrateToUnifiedSync(): Promise<void> {
  console.log('🔄 Migrating to unified sync...');
  
  // Migrate plans (no change needed - already in correct format)
  const plans = await getAllCachedPlans();
  console.log(`✓ Migrated ${plans.length} plans`);
  
  // Migrate playlists (no change needed - already in IndexedDB)
  const playlists = await playlistDB.listPlaylists();
  console.log(`✓ Migrated ${playlists.length} playlists`);
  
  // Mark migration complete
  localStorage.setItem('sync_migration_v1_complete', 'true');
  console.log('✅ Migration complete');
}

// 3. Run on app initialization
useEffect(() => {
  (async () => {
    if (await needsMigration()) {
      await migrateToUnifiedSync();
    }
    
    // Start unified sync
    await unifiedSync.start();
  })();
}, []);
```

---

## Part 9: Updated Requirements (October 27, 2025)

### Requirement 1: Plans & Playlists Auto-Sync on Save/Delete
**Status**: ✅ APPROVED FOR IMPLEMENTATION

**Current Behavior**:
- Plans/playlists sync via interval (every 5 minutes) + debounced on change (30 seconds)

**Required Behavior**:
- **Immediate sync on save**: When user saves a plan or playlist, sync to Drive immediately
- **Immediate sync on delete**: When user deletes a plan or playlist, sync deletion to Drive immediately
- **Keep debouncing**: For rapid changes, maintain 30-second debounce to avoid excessive API calls

**Implementation**:
```typescript
// In planningCache.ts / playlistDB.ts
export async function saveCachedPlan(plan: CachedPlan): Promise<void> {
  // Save to localStorage
  const plans = await getAllCachedPlans();
  const index = plans.findIndex(p => p.id === plan.id);
  if (index >= 0) {
    plans[index] = plan;
  } else {
    plans.push(plan);
  }
  localStorage.setItem('llm_proxy_planning_cache', JSON.stringify(plans));
  
  // Trigger immediate sync (debounced)
  if (unifiedSync.isEnabled()) {
    unifiedSync.queueSync('plans', 'high'); // High priority = immediate
  }
}

export async function deleteCachedPlan(planId: string): Promise<void> {
  const plans = await getAllCachedPlans();
  const filtered = plans.filter(p => p.id !== planId);
  localStorage.setItem('llm_proxy_planning_cache', JSON.stringify(filtered));
  
  // Trigger immediate sync
  if (unifiedSync.isEnabled()) {
    unifiedSync.queueSync('plans', 'high');
  }
}
```

---

### Requirement 2: Provider Credentials Auto-Sync When Cloud Sync Enabled
**Status**: ✅ APPROVED FOR IMPLEMENTATION

**Current Behavior**:
- Credentials sync is manual only (Load/Save buttons)
- No automatic sync

**Required Behavior**:
- **Auto-sync when cloud sync enabled**: If user has cloud sync enabled, automatically sync provider credentials
- **Debounced sync**: Use 30-second debounce after credential changes
- **Security consideration**: Still default to opt-out for security, but make it easy to enable

**Implementation**:
```typescript
// In ProviderList.tsx or unifiedSync credentials adapter
function handleProviderCredentialChange(providerName: string, apiKey: string): void {
  // Save to localStorage
  localStorage.setItem(`${providerName}_api_key`, apiKey);
  
  // Trigger auto-sync if enabled
  const autoSyncCredentials = localStorage.getItem('auto_sync_credentials') === 'true';
  if (autoSyncCredentials && unifiedSync.isEnabled()) {
    unifiedSync.queueSync('credentials', 'normal'); // Normal priority = debounced
  }
}

// In CloudSyncSettings.tsx - Add toggle for credential sync
<div className="credential-sync-toggle">
  <label>
    <input
      type="checkbox"
      checked={autoSyncCredentials}
      onChange={(e) => {
        localStorage.setItem('auto_sync_credentials', e.target.checked ? 'true' : 'false');
        setAutoSyncCredentials(e.target.checked);
      }}
    />
    <span>Automatically sync provider credentials to Google Drive</span>
  </label>
  <p className="warning">
    ⚠️ Credentials are encrypted, but only enable this if you trust Google Drive security
  </p>
</div>
```

---

### Requirement 3: Chat History Google Docs Sync with 30s Debounce
**Status**: ✅ APPROVED FOR IMPLEMENTATION

**Current Behavior**:
- Chat history stored in IndexedDB only
- No cloud sync

**Required Behavior**:
- **Sync to Google Docs**: Store chat history in a Google Docs document named "Chat History"
- **Format**: Raw JSON (not formatted text)
- **Debounced sync**: Save changes with 30-second debounce
- **Bidirectional**: Pull on load, push on change

**Implementation**:
```typescript
// New adapter: ChatHistoryAdapter
class ChatHistoryAdapter implements SyncAdapter {
  name = 'chat-history';
  private syncDebounce: NodeJS.Timeout | null = null;
  
  async getLocalData(): Promise<ChatHistoryEntry[]> {
    return await chatHistoryDB.getAllChats();
  }
  
  async setLocalData(data: ChatHistoryEntry[]): Promise<void> {
    // Clear existing and restore from cloud
    await chatHistoryDB.clear();
    for (const chat of data) {
      await chatHistoryDB.saveChat(chat);
    }
  }
  
  async pull(): Promise<any> {
    // Download from Google Docs
    const docContent = await googleDocs.downloadDocument('Chat History');
    return JSON.parse(docContent.text);
  }
  
  async push(data: ChatHistoryEntry[]): Promise<void> {
    // Upload to Google Docs as raw JSON
    const jsonContent = JSON.stringify(data, null, 2);
    await googleDocs.uploadDocument('Chat History', jsonContent, 'application/json');
  }
  
  queueDebouncedSync(): void {
    if (this.syncDebounce) {
      clearTimeout(this.syncDebounce);
    }
    
    this.syncDebounce = setTimeout(() => {
      unifiedSync.queueSync('chat-history', 'normal');
    }, 30000); // 30 seconds
  }
}

// In chatHistory.ts - trigger sync on changes
export async function saveChat(chat: ChatHistoryEntry): Promise<void> {
  await chatHistoryDB.saveChat(chat);
  
  // Trigger debounced sync
  if (unifiedSync.isEnabled()) {
    chatHistoryAdapter.queueDebouncedSync();
  }
}
```

---

### Requirement 4: Synchronize All Settings to Google Sheets
**Status**: ✅ APPROVED FOR IMPLEMENTATION

**Current Behavior**:
- Settings stored in localStorage only
- Bundled with credentials in Drive sync

**Required Behavior**:
- **Sync to Google Sheets**: Store application settings in Google Sheets (separate from credentials)
- **Consistent with providers**: Same sync pattern as provider configuration
- **Auto-sync**: Automatically sync when cloud sync enabled
- **Debounced**: 30-second debounce after changes

**Implementation**:
```typescript
// New adapter: SettingsAdapter using Google Sheets
class SettingsSheetsAdapter implements SyncAdapter {
  name = 'settings';
  
  async getLocalData(): Promise<AppSettings> {
    return {
      theme: localStorage.getItem('theme') || 'dark',
      language: localStorage.getItem('language') || 'en',
      fontSize: localStorage.getItem('fontSize') || 'medium',
      modelDefaults: JSON.parse(localStorage.getItem('model_defaults') || '{}'),
      toolsEnabled: JSON.parse(localStorage.getItem('tools_enabled') || '{}'),
      ragSettings: JSON.parse(localStorage.getItem('rag_settings') || '{}'),
      ttsSettings: JSON.parse(localStorage.getItem('tts_settings') || '{}'),
      castSettings: JSON.parse(localStorage.getItem('cast_settings') || '{}'),
    };
  }
  
  async setLocalData(data: AppSettings): Promise<void> {
    localStorage.setItem('theme', data.theme);
    localStorage.setItem('language', data.language);
    localStorage.setItem('fontSize', data.fontSize);
    localStorage.setItem('model_defaults', JSON.stringify(data.modelDefaults));
    localStorage.setItem('tools_enabled', JSON.stringify(data.toolsEnabled));
    localStorage.setItem('rag_settings', JSON.stringify(data.ragSettings));
    localStorage.setItem('tts_settings', JSON.stringify(data.ttsSettings));
    localStorage.setItem('cast_settings', JSON.stringify(data.castSettings));
  }
  
  async pull(): Promise<AppSettings> {
    // Read from Google Sheets (user-specific spreadsheet)
    const spreadsheetId = await getOrCreateUserSpreadsheet();
    const rows = await googleSheets.readRange(`${spreadsheetId}!Settings!A:B`);
    
    // Convert rows to settings object
    const settings: Record<string, any> = {};
    rows.forEach(([key, value]) => {
      settings[key] = value;
    });
    
    return {
      theme: settings.theme || 'dark',
      language: settings.language || 'en',
      fontSize: settings.fontSize || 'medium',
      modelDefaults: JSON.parse(settings.modelDefaults || '{}'),
      toolsEnabled: JSON.parse(settings.toolsEnabled || '{}'),
      ragSettings: JSON.parse(settings.ragSettings || '{}'),
      ttsSettings: JSON.parse(settings.ttsSettings || '{}'),
      castSettings: JSON.parse(settings.castSettings || '{}'),
    };
  }
  
  async push(data: AppSettings): Promise<void> {
    const spreadsheetId = await getOrCreateUserSpreadsheet();
    
    // Convert settings to rows
    const rows = [
      ['theme', data.theme],
      ['language', data.language],
      ['fontSize', data.fontSize],
      ['modelDefaults', JSON.stringify(data.modelDefaults)],
      ['toolsEnabled', JSON.stringify(data.toolsEnabled)],
      ['ragSettings', JSON.stringify(data.ragSettings)],
      ['ttsSettings', JSON.stringify(data.ttsSettings)],
      ['castSettings', JSON.stringify(data.castSettings)],
    ];
    
    await googleSheets.writeRange(`${spreadsheetId}!Settings!A:B`, rows);
  }
}

// In SettingsContext.tsx - trigger sync on changes
export function updateSetting(key: string, value: any): void {
  localStorage.setItem(key, typeof value === 'string' ? value : JSON.stringify(value));
  
  // Trigger debounced sync
  if (unifiedSync.isEnabled()) {
    unifiedSync.queueSync('settings', 'normal'); // Debounced
  }
}
```

---

### Requirement 5: Store Plans in IndexedDB
**Status**: ✅ APPROVED FOR IMPLEMENTATION

**Current Behavior**:
- Plans stored in localStorage (`llm_proxy_planning_cache`)
- Subject to 5-10MB localStorage limits

**Required Behavior**:
- **Migrate to IndexedDB**: Store plans in IndexedDB to avoid localStorage quotas
- **Backward compatibility**: Migrate existing localStorage plans to IndexedDB
- **Same API**: Keep the same `saveCachedPlan` / `getAllCachedPlans` interface

**Implementation**:
```typescript
// New file: ui-new/src/utils/planningDB.ts
import { openDB, DBSchema, IDBPDatabase } from 'idb';

interface PlanningDBSchema extends DBSchema {
  plans: {
    key: string;
    value: CachedPlan;
    indexes: { 'by-timestamp': number };
  };
}

class PlanningDB {
  private db: IDBPDatabase<PlanningDBSchema> | null = null;
  
  async init(): Promise<void> {
    this.db = await openDB<PlanningDBSchema>('PlanningDB', 1, {
      upgrade(db) {
        const planStore = db.createObjectStore('plans', { keyPath: 'id' });
        planStore.createIndex('by-timestamp', 'timestamp');
      },
    });
    
    // One-time migration from localStorage
    await this.migrateFromLocalStorage();
  }
  
  private async migrateFromLocalStorage(): Promise<void> {
    const migrated = localStorage.getItem('plans_migrated_to_idb');
    if (migrated === 'true') return;
    
    // Read from localStorage
    const oldPlansStr = localStorage.getItem('llm_proxy_planning_cache');
    if (oldPlansStr) {
      const oldPlans: CachedPlan[] = JSON.parse(oldPlansStr);
      
      // Write to IndexedDB
      for (const plan of oldPlans) {
        await this.db!.put('plans', plan);
      }
      
      console.log(`✅ Migrated ${oldPlans.length} plans from localStorage to IndexedDB`);
    }
    
    localStorage.setItem('plans_migrated_to_idb', 'true');
  }
  
  async savePlan(plan: CachedPlan): Promise<void> {
    await this.db!.put('plans', plan);
  }
  
  async getAllPlans(): Promise<CachedPlan[]> {
    return await this.db!.getAll('plans');
  }
  
  async getPlan(id: string): Promise<CachedPlan | undefined> {
    return await this.db!.get('plans', id);
  }
  
  async deletePlan(id: string): Promise<void> {
    await this.db!.delete('plans', id);
  }
  
  async clear(): Promise<void> {
    await this.db!.clear('plans');
  }
}

export const planningDB = new PlanningDB();

// Update planningCache.ts to use IndexedDB instead of localStorage
export async function saveCachedPlan(plan: CachedPlan): Promise<void> {
  await planningDB.savePlan(plan);
  
  // Trigger immediate sync
  if (unifiedSync.isEnabled()) {
    unifiedSync.queueSync('plans', 'high');
  }
}

export async function getAllCachedPlans(): Promise<CachedPlan[]> {
  return await planningDB.getAllPlans();
}

export async function deleteCachedPlan(planId: string): Promise<void> {
  await planningDB.deletePlan(planId);
  
  // Trigger immediate sync
  if (unifiedSync.isEnabled()) {
    unifiedSync.queueSync('plans', 'high');
  }
}
```

---

## Part 10: Updated Implementation Plan

### Phase 1: Foundation & Critical Fixes (Week 1)
- [ ] **Fix auto-sync default** to `true` (CRITICAL)
- [ ] Create `ui-new/src/services/unifiedSync.ts` with core architecture
- [ ] Define `SyncAdapter` interface and base classes
- [ ] Implement `SyncScheduler` with debouncing
- [ ] Create `GlobalSyncStatus` state management

### Phase 2: Plans Migration to IndexedDB (Week 2)
- [ ] Create `ui-new/src/utils/planningDB.ts` with IndexedDB schema
- [ ] Implement one-time migration from localStorage
- [ ] Update all plan CRUD operations to use IndexedDB
- [ ] Test migration with existing plans
- [ ] **Add immediate sync on plan save/delete**

### Phase 3: Provider Credentials Auto-Sync (Week 2)
- [ ] Create `CredentialsAdapter` for unified sync
- [ ] Add `auto_sync_credentials` toggle in CloudSyncSettings
- [ ] Implement 30-second debounced sync on credential changes
- [ ] Test credential sync across devices
- [ ] **Add playlist immediate sync on save/delete**

### Phase 4: Chat History Google Docs Sync (Week 3)
- [ ] Create `ChatHistoryAdapter` with Google Docs backend
- [ ] Implement raw JSON upload/download to "Chat History" document
- [ ] Add 30-second debounced sync on chat changes
- [ ] Implement bidirectional sync (pull on load, push on change)
- [ ] Add conflict resolution for chat history

### Phase 5: Settings Google Sheets Sync (Week 3)
- [ ] Create `SettingsSheetsAdapter` (separate from credentials)
- [ ] Create `Settings` tab in user's Google Sheets spreadsheet
- [ ] Implement settings read/write to Sheets
- [ ] Add 30-second debounced sync on setting changes
- [ ] Separate settings from credentials completely

### Phase 6: Testing & Polish (Week 4)
- [ ] Test all sync adapters with slow/failing network
- [ ] Test cross-device sync for all data types
- [ ] Add comprehensive error handling
- [ ] Create user documentation for new sync features
- [ ] Performance optimization (batching, quota management)

---

## Part 11: Summary of Required Changes

### ✅ Approved Requirements (October 27, 2025)

1. **Plans & Playlists Auto-Sync on Save/Delete**
   - Immediate sync when user saves/deletes (high priority queue)
   - Maintains 30-second debounce for rapid changes
   - Implementation: Modify `saveCachedPlan`, `deleteCachedPlan`, `playlistDB` functions

2. **Provider Credentials Auto-Sync When Cloud Sync Enabled**
   - Auto-sync credentials when `auto_sync_credentials` is enabled
   - 30-second debounce after changes
   - Opt-in for security (default disabled)
   - Implementation: Add `CredentialsAdapter` + toggle in CloudSyncSettings

3. **Chat History Sync to Google Docs with 30s Debounce**
   - Store in Google Docs document named "Chat History"
   - Format: Raw JSON (not formatted text)
   - Bidirectional sync (pull on load, push on change)
   - 30-second debounce on changes
   - Implementation: Create `ChatHistoryAdapter` + Google Docs API integration

4. **Settings Sync to Google Sheets**
   - Separate from credentials
   - Store in `Settings` tab of user's spreadsheet
   - Same sync pattern as provider configuration
   - 30-second debounce
   - Implementation: Create `SettingsSheetsAdapter`

5. **Store Plans in IndexedDB**
   - Migrate from localStorage to avoid quotas
   - One-time migration preserves existing plans
   - Maintains same API interface
   - Implementation: Create `planningDB.ts` with IndexedDB schema

### Key Technical Decisions

**Debounce Strategy**: All user-initiated changes use 30-second debounce
- Plans save/delete: 30s
- Provider credentials: 30s
- Chat history: 30s
- Settings: 30s

**Storage Backends**:
- Plans: IndexedDB (migrating from localStorage)
- Playlists: IndexedDB (existing)
- Chat history: IndexedDB (local) + Google Docs (cloud)
- RAG snippets: IndexedDB (local) + Google Sheets (cloud)
- Settings: localStorage (local) + Google Sheets (cloud)
- Credentials: localStorage (local) + Google Drive (cloud, opt-in)

**Sync Priorities**:
- High priority (immediate): Plan save/delete, Playlist save/delete
- Normal priority (debounced): Credentials, Chat history, Settings

---

## Related Documentation

### Quantitative Metrics
- **Auto-sync adoption rate**: % of users with sync enabled (target: >90%)
- **Cross-device usage**: % of users accessing from multiple devices (target: >30%)
- **Sync reliability**: % of successful syncs (target: >99%)
- **API quota usage**: Reduction in API calls vs current (target: -30%)
- **Code size**: Lines of sync-related code (target: -500 lines)

### Qualitative Metrics
- **User feedback**: Sentiment about sync reliability
- **Support tickets**: Reduction in data loss complaints
- **Developer feedback**: Ease of adding new sync adapters

---

## Conclusion

The application currently has **7 distinct sync mechanisms** with inconsistent patterns, creating confusion, duplicate code, and missing features. The proposed **Unified Sync Architecture** consolidates all sync operations into a single, extensible system with:

✅ **Auto-sync enabled by default**  
✅ **Consistent conflict resolution** across all data types  
✅ **Comprehensive backup** (including chat history)  
✅ **Reduced code complexity** (~500 lines removed)  
✅ **Better user visibility** (global sync status)  
✅ **Future-proof extensibility** (easy to add new adapters)

**Immediate action required**: Change `auto_sync_enabled` default from `false` to `true` to provide seamless backup for all users.

**Implementation timeline**: 6 weeks for full migration and optimization.

---

## Related Documentation
- **Background Sync**: `ui-new/src/hooks/useBackgroundSync.ts`
- **Google Drive Sync**: `ui-new/src/services/googleDriveSync.ts`
- **RAG Sync**: `ui-new/src/services/ragSyncService.ts`
- **Chat History**: `ui-new/src/utils/chatHistory.ts`
- **Cloud Sync Settings**: `ui-new/src/components/CloudSyncSettings.tsx`
