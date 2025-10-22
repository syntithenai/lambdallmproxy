# RAG Google Sheets Sync Implementation Plan

## 🎯 Objective

Implement comprehensive Google Sheets backup and sync for all RAG data (snippets, embeddings, documents) enabling cross-browser and cross-device synchronization for users logged in with the same Google account.

## 📋 Current State Analysis

### What Exists
1. **Backend Storage** (`src/rag/sheets-storage.js`)
   - ✅ Google Sheets API integration
   - ✅ Schema for embeddings (`RAG_Embeddings_v1`)
   - ✅ Schema for metadata (`RAG_Metadata`)
   - ✅ Functions to save/load embeddings
   - ✅ 807 lines of working code

2. **Frontend Snippet Storage** (`ui-new/src/contexts/SwagContext.tsx`)
   - ✅ Snippets stored in localStorage via `storage` utility
   - ✅ Add, update, delete, merge operations
   - ✅ Tagging system
   - ✅ Embedding status tracking
   - ❌ No Google Sheets sync

3. **RAG Configuration**
   - ✅ Stored in localStorage as `rag_config`
   - ✅ Has `enabled` and `autoEmbed` flags
   - ❌ No sync configuration

### What's Missing
1. **Snippets Sheet** - Need new Google Sheet tab for snippets
2. **Sync Service** - Background sync orchestration
3. **Conflict Resolution** - Handle updates from multiple devices
4. **UI Controls** - Toggle in RAG settings
5. **Sync Status** - Visual feedback during sync
6. **Initial Sync** - Pull data on first login

## 🏗️ Architecture Design

### Data Flow

```
┌─────────────────────────────────────────────────────────────┐
│                        User Action                          │
│  (Add Snippet, Generate Embedding, Update Tag, etc.)       │
└─────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────┐
│                   Local Storage (IndexedDB)                 │
│  - Immediate save for fast UI response                     │
│  - Acts as cache and offline storage                       │
└─────────────────────────────────────────────────────────────┘
                              ↓ (if sync enabled)
┌─────────────────────────────────────────────────────────────┐
│                   Background Sync Queue                     │
│  - Batches changes to reduce API calls                     │
│  - Retries on failure                                       │
│  - Preserves order of operations                           │
└─────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────┐
│                Google Sheets (Cloud Storage)                │
│  - RAG_Snippets_v1 (new)                                   │
│  - RAG_Embeddings_v1 (exists)                              │
│  - RAG_Metadata (exists)                                   │
│  - RAG_SyncLog (new)                                       │
└─────────────────────────────────────────────────────────────┘
                              ↓ (on login / periodic)
┌─────────────────────────────────────────────────────────────┐
│                Background Pull Sync (New Browser)           │
│  - Compare timestamps                                       │
│  - Merge remote changes                                     │
│  - Resolve conflicts (last-write-wins with timestamps)     │
└─────────────────────────────────────────────────────────────┘
```

## 📊 Google Sheets Schema

### 1. RAG_Snippets_v1 (New Sheet)

| Column | Type | Description |
|--------|------|-------------|
| id | string | UUID of snippet |
| content | text | HTML/Markdown content |
| title | string | Snippet title |
| timestamp | number | Creation timestamp (ms) |
| update_date | number | Last update timestamp (ms) |
| source_type | string | 'user' \| 'assistant' \| 'tool' |
| tags_json | string | JSON array of tags |
| has_embedding | boolean | Whether embedding exists |
| user_email | string | Owner email (for multi-user support) |
| device_id | string | Last device that updated |
| sync_version | number | Version counter for conflict resolution |
| created_at | string | ISO timestamp |
| updated_at | string | ISO timestamp |
| synced_at | string | ISO timestamp of last sync |

### 2. RAG_Embeddings_v1 (Existing - Enhance)

Add columns:
- `user_email` - Link embeddings to user
- `device_id` - Track device that created embedding
- `sync_version` - Version tracking

### 3. RAG_Metadata (Existing - Enhance)

Store sync metadata:
- `last_full_sync_{user_email}` - Timestamp of last full sync per user
- `sync_enabled_{user_email}` - Whether sync is enabled per user
- `device_registry_{device_id}` - List of known devices

### 4. RAG_SyncLog (New Sheet)

| Column | Type | Description |
|--------|------|-------------|
| id | string | Log entry ID |
| user_email | string | User who triggered sync |
| device_id | string | Device that synced |
| operation | string | 'push' \| 'pull' \| 'conflict' |
| entity_type | string | 'snippet' \| 'embedding' |
| entity_id | string | ID of affected entity |
| timestamp | string | ISO timestamp |
| status | string | 'success' \| 'failed' \| 'conflict' |
| details | string | JSON with operation details |

## 🔧 Implementation Plan

### Phase 1: Backend Google Sheets Storage (2-3 hours)

**File: `src/rag/sheets-storage.js`**

Add new functions:

```javascript
// Snippets
async function saveSnippetToSheets(sheets, spreadsheetId, snippet, userEmail)
async function loadSnippetsFromSheets(sheets, spreadsheetId, userEmail)
async function updateSnippetInSheets(sheets, spreadsheetId, snippetId, updates, userEmail)
async function deleteSnippetFromSheets(sheets, spreadsheetId, snippetId, userEmail)
async function bulkSaveSnippetsToSheets(sheets, spreadsheetId, snippets, userEmail)

// Sync operations
async function getLastSyncTimestamp(sheets, spreadsheetId, userEmail, entityType)
async function setLastSyncTimestamp(sheets, spreadsheetId, userEmail, entityType, timestamp)
async function getChangesSince(sheets, spreadsheetId, userEmail, timestamp, entityType)
async function logSyncOperation(sheets, spreadsheetId, operation)

// Conflict resolution
async function resolveConflict(localItem, remoteItem, strategy = 'last-write-wins')
```

**Tasks:**
- [ ] Add `RAG_Snippets_v1` sheet creation
- [ ] Add `RAG_SyncLog` sheet creation
- [ ] Implement snippet CRUD operations
- [ ] Implement sync timestamp tracking
- [ ] Implement conflict resolution logic
- [ ] Add batch operations for efficiency
- [ ] Add error handling and retry logic

### Phase 2: Frontend Sync Service (3-4 hours)

**New File: `ui-new/src/services/ragSyncService.ts`**

```typescript
export interface SyncConfig {
  enabled: boolean;
  autoSync: boolean; // Sync on every change
  syncInterval: number; // Background sync interval (ms)
  batchSize: number; // Number of items to sync at once
  retryAttempts: number;
}

export interface SyncStatus {
  inProgress: boolean;
  lastSync: number | null;
  lastError: string | null;
  pendingChanges: number;
  conflictsResolved: number;
}

class RAGSyncService {
  private config: SyncConfig;
  private status: SyncStatus;
  private syncQueue: SyncOperation[];
  private syncInterval: NodeJS.Timeout | null;
  
  // Initialize sync service
  async initialize(config: SyncConfig): Promise<void>
  
  // Push local changes to Sheets
  async pushSnippets(snippets: ContentSnippet[]): Promise<void>
  async pushEmbeddings(embeddings: Embedding[]): Promise<void>
  
  // Pull remote changes from Sheets
  async pullSnippets(): Promise<ContentSnippet[]>
  async pullEmbeddings(): Promise<Embedding[]>
  
  // Full bidirectional sync
  async fullSync(): Promise<SyncResult>
  
  // Queue operations for batching
  queueSync(operation: SyncOperation): void
  
  // Process sync queue
  private async processSyncQueue(): Promise<void>
  
  // Start/stop background sync
  startAutoSync(): void
  stopAutoSync(): void
  
  // Conflict resolution
  private resolveConflicts(local: any[], remote: any[]): any[]
  
  // Event emitters
  onSyncStart(callback: () => void): void
  onSyncComplete(callback: (result: SyncResult) => void): void
  onSyncError(callback: (error: Error) => void): void
}

export const ragSyncService = new RAGSyncService();
```

**Tasks:**
- [ ] Create sync service class
- [ ] Implement queue system for batching
- [ ] Add background sync timer
- [ ] Implement push operations
- [ ] Implement pull operations
- [ ] Add conflict resolution (last-write-wins)
- [ ] Add event system for UI updates
- [ ] Add retry logic with exponential backoff
- [ ] Add offline detection

### Phase 3: Backend API Endpoint (1-2 hours)

**File: `src/endpoints/rag-sync.js`**

```javascript
/**
 * RAG Sync Endpoint
 * Handles bidirectional sync between client and Google Sheets
 */

exports.handler = async (event, responseStream) => {
  const body = JSON.parse(event.body);
  const { operation, userEmail, data, lastSync } = body;
  
  switch (operation) {
    case 'push-snippets':
      // Save snippets to Sheets
      break;
    case 'pull-snippets':
      // Get snippets from Sheets
      break;
    case 'push-embeddings':
      // Save embeddings to Sheets
      break;
    case 'pull-embeddings':
      // Get embeddings from Sheets
      break;
    case 'full-sync':
      // Bidirectional sync with conflict resolution
      break;
    case 'get-sync-status':
      // Return last sync timestamp and pending changes
      break;
  }
};
```

**Route in `src/index.js`:**
```javascript
if (method === 'POST' && path === '/rag/sync') {
  await ragSyncEndpoint.handler(event, responseStream);
  return;
}
```

**Tasks:**
- [ ] Create endpoint file
- [ ] Add route to main router
- [ ] Implement push handlers
- [ ] Implement pull handlers
- [ ] Implement full sync with merge
- [ ] Add authentication checks
- [ ] Add rate limiting
- [ ] Add error handling

### Phase 4: Frontend Integration (2-3 hours)

**File: `ui-new/src/contexts/SwagContext.tsx`**

Enhance with sync support:

```typescript
export const SwagProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [snippets, setSnippets] = useState<ContentSnippet[]>([]);
  const [syncStatus, setSyncStatus] = useState<SyncStatus>({ ... });
  const { user } = useAuth(); // Get Google user email
  
  // Initialize sync on mount if enabled
  useEffect(() => {
    const initSync = async () => {
      const config = getRagConfig();
      if (config.syncEnabled && user?.email) {
        await ragSyncService.initialize({
          enabled: true,
          autoSync: config.autoSync,
          syncInterval: 60000, // 1 minute
          batchSize: 50,
          retryAttempts: 3,
        });
        
        // Initial pull on login
        console.log('🔄 Starting initial sync...');
        const result = await ragSyncService.fullSync();
        console.log('✅ Initial sync complete:', result);
        
        // Start background sync
        ragSyncService.startAutoSync();
      }
    };
    
    initSync();
    
    return () => {
      ragSyncService.stopAutoSync();
    };
  }, [user?.email]);
  
  // Enhanced addSnippet with sync
  const addSnippet = async (content: string, sourceType: ContentSnippet['sourceType'], title?: string) => {
    const snippet = { /* create snippet */ };
    
    // Save locally first (fast)
    setSnippets(prev => [snippet, ...prev]);
    
    // Queue sync if enabled
    const config = getRagConfig();
    if (config.syncEnabled && user?.email) {
      ragSyncService.queueSync({
        type: 'push-snippet',
        data: snippet,
        userEmail: user.email,
      });
    }
  };
  
  // Similar for update, delete, etc.
};
```

**Tasks:**
- [ ] Integrate sync service into SwagContext
- [ ] Add initial sync on login
- [ ] Queue syncs on data changes
- [ ] Handle sync status updates
- [ ] Add offline handling
- [ ] Add sync conflict UI

### Phase 5: RAG Settings UI (1-2 hours)

**File: `ui-new/src/components/RAGSettings.tsx`** (New Component)

```typescript
export const RAGSettings: React.FC = () => {
  const [config, setConfig] = useState(getRagConfig());
  const { user } = useAuth();
  const { syncStatus } = useSwag();
  
  const handleToggleSync = async (enabled: boolean) => {
    if (enabled && !user) {
      showError('Please sign in with Google to enable sync');
      return;
    }
    
    setConfig({ ...config, syncEnabled: enabled });
    saveRagConfig({ ...config, syncEnabled: enabled });
    
    if (enabled) {
      // Start initial sync
      await ragSyncService.fullSync();
      ragSyncService.startAutoSync();
    } else {
      ragSyncService.stopAutoSync();
    }
  };
  
  return (
    <div className="rag-settings">
      <h3>🔍 RAG Search Settings</h3>
      
      {/* Existing RAG enabled toggle */}
      <label>
        <input type="checkbox" checked={config.enabled} onChange={...} />
        Enable RAG Search
      </label>
      
      {config.enabled && (
        <>
          {/* Google Sheets Sync Section */}
          <div className="sync-section">
            <h4>☁️ Cloud Backup & Sync</h4>
            
            <label>
              <input 
                type="checkbox" 
                checked={config.syncEnabled} 
                onChange={(e) => handleToggleSync(e.target.checked)}
                disabled={!user}
              />
              Enable Google Sheets Backup
              {!user && <span className="warning"> (Sign in required)</span>}
            </label>
            
            {config.syncEnabled && (
              <>
                <div className="sync-info">
                  <p>✅ All snippets and embeddings will be backed up to Google Sheets</p>
                  <p>🔄 Sync across devices using the same Google account</p>
                </div>
                
                {syncStatus.inProgress && (
                  <div className="sync-progress">
                    🔄 Syncing... {syncStatus.pendingChanges} items pending
                  </div>
                )}
                
                {syncStatus.lastSync && (
                  <div className="last-sync">
                    ✅ Last synced: {formatTimestamp(syncStatus.lastSync)}
                  </div>
                )}
                
                {syncStatus.lastError && (
                  <div className="sync-error">
                    ❌ Sync error: {syncStatus.lastError}
                  </div>
                )}
                
                <button onClick={() => ragSyncService.fullSync()}>
                  🔄 Sync Now
                </button>
              </>
            )}
          </div>
          
          {/* Auto-embed toggle */}
          <label>
            <input type="checkbox" checked={config.autoEmbed} onChange={...} />
            Auto-generate embeddings
          </label>
        </>
      )}
    </div>
  );
};
```

**Update `ui-new/src/components/ProviderList.tsx`:**
- [ ] Remove Google Drive sync section (or move to separate Settings Backup page)
- [ ] Add `<RAGSettings />` component in appropriate section
- [ ] Style sync UI components

**Tasks:**
- [ ] Create RAGSettings component
- [ ] Add sync toggle with Google auth check
- [ ] Add sync status display
- [ ] Add manual sync button
- [ ] Add last sync timestamp
- [ ] Add error display
- [ ] Style with CSS
- [ ] Integrate into ProviderList or Settings page

### Phase 6: Testing & Polish (2-3 hours)

**Test Scenarios:**
1. **Initial Sync**
   - [ ] New user enables sync → empty Sheets created
   - [ ] User with existing data → data uploaded
   - [ ] User on new browser → data downloaded

2. **Ongoing Sync**
   - [ ] Add snippet → syncs to Sheets
   - [ ] Update snippet → updates in Sheets
   - [ ] Delete snippet → removes from Sheets
   - [ ] Generate embedding → saves to Sheets

3. **Cross-Browser Sync**
   - [ ] Change on Browser A → appears on Browser B after sync
   - [ ] Change on Browser B → appears on Browser A after sync
   - [ ] Simultaneous changes → conflict resolved correctly

4. **Offline Handling**
   - [ ] Offline changes queue locally
   - [ ] Online again → syncs queued changes
   - [ ] No data loss during offline period

5. **Error Handling**
   - [ ] Sheets API error → retry logic works
   - [ ] Network error → queues for later
   - [ ] Quota exceeded → shows helpful error
   - [ ] Auth expired → prompts re-auth

**Polish:**
- [ ] Add loading spinners during sync
- [ ] Add success/error toast notifications
- [ ] Add sync progress indicator
- [ ] Add "Last synced" timestamps
- [ ] Add offline indicator
- [ ] Add conflict resolution UI (if needed)
- [ ] Add sync queue viewer (debug mode)
- [ ] Add sync logs viewer (debug mode)

## 📝 Configuration Storage

### RAG Config Schema (Enhanced)

```typescript
interface RAGConfig {
  // Existing
  enabled: boolean;
  autoEmbed: boolean;
  
  // New
  syncEnabled: boolean;
  autoSync: boolean; // Sync on every change vs manual/periodic
  syncInterval: number; // Background sync interval (ms)
  lastSync: number | null; // Timestamp of last successful sync
  deviceId: string; // UUID for this browser/device
  conflictStrategy: 'last-write-wins' | 'manual'; // How to handle conflicts
}
```

Stored in: `localStorage['rag_config']`

## 🔒 Security Considerations

1. **Authentication**: All sync operations require valid Google OAuth token
2. **User Isolation**: All queries filter by `user_email` column
3. **Rate Limiting**: Limit sync API calls to prevent abuse
4. **Data Validation**: Sanitize all data before saving to Sheets
5. **Quota Management**: Track API usage and warn users
6. **Device Trust**: Track device IDs to detect suspicious activity

## 🚀 Deployment Steps

1. **Backend**:
   ```bash
   # No changes to deployment - just code updates
   npm run deploy
   ```

2. **Frontend**:
   ```bash
   cd ui-new
   npm run build
   # Deploy to hosting (already set up)
   ```

3. **Google Sheets**:
   - No manual setup needed
   - Sheets created automatically on first sync

4. **Environment Variables**:
   - Ensure `GOOGLE_SHEETS_CREDENTIALS` is set
   - Ensure `GOOGLE_SHEETS_SPREADSHEET_ID` is set

## 📊 Success Metrics

- ✅ User enables sync → data appears in Google Sheets
- ✅ User logs in on new browser → data syncs down automatically
- ✅ Changes on one browser → appear on other browser within sync interval
- ✅ Offline changes → sync when back online
- ✅ No data loss during network issues
- ✅ Conflicts resolved automatically without user intervention (90% of cases)

## 🗓️ Timeline Estimate

- **Phase 1** (Backend Storage): 2-3 hours
- **Phase 2** (Sync Service): 3-4 hours  
- **Phase 3** (API Endpoint): 1-2 hours
- **Phase 4** (Frontend Integration): 2-3 hours
- **Phase 5** (UI): 1-2 hours
- **Phase 6** (Testing): 2-3 hours

**Total: 11-17 hours** (1.5-2 days of focused development)

## 🎯 Next Steps

1. **Review and approve this plan**
2. **Start with Phase 1** (Backend Storage) - foundational work
3. **Incremental testing** after each phase
4. **Deploy to production** after Phase 6 complete

## 📚 Related Files

- `src/rag/sheets-storage.js` - Core storage logic
- `ui-new/src/contexts/SwagContext.tsx` - Snippet management
- `ui-new/src/components/ProviderList.tsx` - Settings UI
- `src/endpoints/rag.js` - RAG endpoints
- `src/index.js` - Main router

---

**Ready to implement?** Let me know if you'd like me to start with Phase 1 or if you have any questions about the plan!
