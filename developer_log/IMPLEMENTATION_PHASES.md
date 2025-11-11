# Implementation Phases

**Date**: 2025-11-11  
**Status**: Planning Document  
**Scope**: Week-by-week implementation plan for unified persistence system

---

## Executive Summary

**Timeline**: 5 weeks  
**Team Size**: 1-2 developers  
**Risk Level**: Medium (requires careful testing)

**Phases**:
1. **Week 1**: IndexedDB schema + UnifiedStorage service
2. **Week 2**: Settings consolidation + migration
3. **Week 3**: Google Sheets sync + sharding
4. **Week 4**: Google Drive sync + images
5. **Week 5**: Component updates + testing

---

## Phase 1: IndexedDB Foundation (Week 1)

### Goals
- Create IndexedDB schema with all tables
- Implement UnifiedStorage service
- Set up TypeScript interfaces
- Test basic CRUD operations

### Tasks

**Day 1-2: Database Schema**

**File**: `ui-new/src/services/db.ts`

```typescript
import Dexie, { Table } from 'dexie';
import {
  Settings,
  Snippet,
  FeedItem,
  RAGData,
  Quiz,
  QuizProgress,
  QuizAnalytics,
  Plan,
  Playlist,
  Project,
  ChatMessage,
  ImageRecord,
} from './types';

class UnifiedDB extends Dexie {
  // Tables
  settings!: Table<Settings>;
  snippets!: Table<Snippet>;
  feedItems!: Table<FeedItem>;
  ragData!: Table<RAGData>;
  quizzes!: Table<Quiz>;
  quizProgress!: Table<QuizProgress>;
  quizAnalytics!: Table<QuizAnalytics>;
  plans!: Table<Plan>;
  playlists!: Table<Playlist>;
  projects!: Table<Project>;
  chatHistory!: Table<ChatMessage>;
  images!: Table<ImageRecord>;
  
  // UI State tables
  uiState_recentTags!: Table<any>;
  uiState_lastActiveChat!: Table<any>;
  uiState_imageEditor!: Table<any>;
  uiState_scrollPosition!: Table<any>;

  constructor() {
    super('UnifiedDB');
    
    this.version(1).stores({
      settings: 'userId',
      snippets: 'id, userId, createdAt, updatedAt, projectId, [userId+projectId]',
      feedItems: 'id, userId, createdAt, updatedAt, projectId, [userId+createdAt]',
      ragData: 'id, userId, createdAt, updatedAt, [userId+createdAt]',
      quizzes: 'id, userId, createdAt, updatedAt, projectId, [userId+projectId]',
      quizProgress: 'id, userId, quizId, updatedAt, [userId+quizId]',
      quizAnalytics: 'id, userId, quizId, createdAt, [userId+quizId]',
      plans: 'id, userId, createdAt, updatedAt, projectId, status, [userId+projectId], [userId+status]',
      playlists: 'id, userId, createdAt, updatedAt, projectId, [userId+projectId]',
      projects: 'id, userId, createdAt, updatedAt, [userId+createdAt]',
      chatHistory: 'id, userId, createdAt, projectId, [userId+projectId], [userId+createdAt]',
      images: 'id, userId, createdAt, source, [userId+source]',
      
      uiState_recentTags: 'userId',
      uiState_lastActiveChat: 'userId',
      uiState_imageEditor: 'userId',
      uiState_scrollPosition: 'userId',
    });
  }
}

export const db = new UnifiedDB();
```

**Day 3-4: UnifiedStorage Service**

**File**: `ui-new/src/services/unifiedStorage.ts`

(Use implementation from LOCALSTORAGE_MIGRATION.md)

**Day 5: Testing**

```typescript
// test/unifiedStorage.test.ts
describe('UnifiedStorage', () => {
  it('saves and retrieves snippet', async () => {
    const snippet = {
      id: 'test-1',
      content: 'Test content',
      tags: ['test'],
      type: 'text',
    };
    
    await unifiedStorage.save('snippets', snippet);
    const retrieved = await unifiedStorage.get('snippets', 'test-1');
    
    expect(retrieved.content).toBe('Test content');
    expect(retrieved.userId).toBe(testUserId);
  });
  
  it('filters by userId', async () => {
    // Create snippets for different users
    await unifiedStorage.save('snippets', { id: '1', content: 'User1' });
    
    // Switch user
    const snippets = await unifiedStorage.query('snippets');
    expect(snippets.length).toBe(1);
    expect(snippets[0].id).toBe('1');
  });
});
```

### Deliverables
- ✅ IndexedDB schema created
- ✅ UnifiedStorage service implemented
- ✅ Unit tests passing
- ✅ TypeScript interfaces defined

---

## Phase 2: Settings Consolidation (Week 2)

### Goals
- Create unified Settings interface
- Implement SettingsContext
- Create migration script
- Test migration with real localStorage data

### Tasks

**Day 1-2: Settings Structure**

**File**: `ui-new/src/services/settings.ts`

(Use implementation from SETTINGS_PERSISTENCE.md)

**Day 3: SettingsContext**

**File**: `ui-new/src/contexts/SettingsContext.tsx`

(Use implementation from SETTINGS_PERSISTENCE.md)

**Day 4: Migration Script**

**File**: `ui-new/src/services/migrateFromLocalStorage.ts`

(Use implementation from LOCALSTORAGE_MIGRATION.md)

**Day 5: Integration & Testing**

```typescript
// In App.tsx
useEffect(() => {
  async function initSettings() {
    if (!user?.email) return;
    
    // Check if migration needed
    const settings = await db.settings.get(user.email);
    if (!settings) {
      await migrateFromLocalStorage(user.email);
    }
  }
  
  initSettings();
}, [user]);
```

### Deliverables
- ✅ Settings unified
- ✅ SettingsContext working
- ✅ Migration script tested
- ✅ localStorage cleaned up

---

## Phase 3: Google Sheets Sync (Week 3)

### Goals
- Implement Google Sheets API integration
- Implement sharding for large content
- Test sync with Snippets and RAG data
- Handle quota limits and errors

### Tasks

**Day 1-2: Sheets API Integration**

**File**: `ui-new/src/services/googleSheets.ts`

```typescript
export class GoogleSheetsSync {
  async ensureSpreadsheet(): Promise<string> {
    // Implementation from GOOGLE_SYNC_STRATEGY.md
  }
  
  async uploadRows(tabName: string, rows: any[][]): Promise<void> {
    // Implementation from GOOGLE_SYNC_STRATEGY.md
  }
  
  async downloadRows(tabName: string): Promise<any[][]> {
    // Implementation from GOOGLE_SYNC_STRATEGY.md
  }
}
```

**Day 3: Sharding Implementation**

**File**: `ui-new/src/services/sharding.ts`

```typescript
export function shardContent(record: any, maxChars: number = 45000): any[] {
  // Implementation from GOOGLE_SYNC_STRATEGY.md
}

export function reassembleShards(rows: any[]): any[] {
  // Implementation from GOOGLE_SYNC_STRATEGY.md
}
```

**Day 4-5: Sync Implementation**

```typescript
// ui-new/src/services/syncSnippets.ts
export async function syncSnippetsToSheets(userId: string): Promise<void> {
  const snippets = await db.snippets.where('userId').equals(userId).toArray();
  
  const rows: any[][] = [];
  for (const snippet of snippets) {
    const { userId: _, ...snippetWithoutUserId } = snippet;
    const shardedRows = shardContent(snippetWithoutUserId);
    
    for (const shard of shardedRows) {
      rows.push([
        shard.id,
        shard.content || '',
        shard.tags?.join(',') || '',
        // ...other fields
        shard._shardCount || '',
        shard._shardIndex || '',
      ]);
    }
  }
  
  await googleSheets.uploadRows('Snippets', rows);
}

export async function loadSnippetsFromSheets(userId: string): Promise<void> {
  const rows = await googleSheets.downloadRows('Snippets');
  const snippets = reassembleShards(rows.map(parseSnippetRow));
  
  // Add userId back
  const snippetsWithUserId = snippets.map(s => ({ ...s, userId }));
  
  // Save to IndexedDB
  await db.snippets.bulkPut(snippetsWithUserId);
}
```

### Deliverables
- ✅ Google Sheets sync working
- ✅ Sharding tested with large content (100k+ chars)
- ✅ Error handling implemented
- ✅ Quota limits handled

---

## Phase 4: Google Drive Sync (Week 4)

### Goals
- Implement Google Drive API integration
- Sync Settings, Plans, Playlists, Projects
- Sync Images as blobs
- Test cross-device sync

### Tasks

**Day 1-2: Drive API Integration**

**File**: `ui-new/src/services/googleDrive.ts`

```typescript
export class GoogleDriveSync {
  async ensureRootFolder(): Promise<string> {
    // Implementation from GOOGLE_SYNC_STRATEGY.md
  }
  
  async uploadJSONFile(fileName: string, data: any, folderId?: string): Promise<string> {
    // Implementation from GOOGLE_SYNC_STRATEGY.md
  }
  
  async downloadJSONFile(fileName: string, folderId?: string): Promise<any> {
    // Implementation from GOOGLE_SYNC_STRATEGY.md
  }
  
  async uploadBlob(fileName: string, blob: Blob, folderId?: string): Promise<string> {
    // Implementation from GOOGLE_SYNC_STRATEGY.md
  }
  
  async downloadBlob(fileName: string, folderId?: string): Promise<Blob> {
    // Implementation from GOOGLE_SYNC_STRATEGY.md
  }
}
```

**Day 3: Settings Sync**

```typescript
// ui-new/src/services/syncSettings.ts
export async function syncSettingsToDrive(settings: Settings): Promise<void> {
  const { userId, ...settingsWithoutUserId } = settings;
  const rootFolderId = await googleDrive.ensureRootFolder();
  await googleDrive.uploadJSONFile('settings.json', settingsWithoutUserId, rootFolderId);
}

export async function loadSettingsFromDrive(userId: string): Promise<Settings | null> {
  const rootFolderId = await googleDrive.ensureRootFolder();
  const data = await googleDrive.downloadJSONFile('settings.json', rootFolderId);
  if (!data) return null;
  return { ...data, userId };
}
```

**Day 4: Plans/Playlists/Projects Sync**

```typescript
// ui-new/src/services/syncPlans.ts
export async function syncPlanToDrive(plan: Plan): Promise<void> {
  const { userId, ...planWithoutUserId } = plan;
  const rootFolderId = await googleDrive.ensureRootFolder();
  const plansFolder = await googleDrive.ensureFolder('plans', rootFolderId);
  await googleDrive.uploadJSONFile(`${plan.id}.json`, planWithoutUserId, plansFolder);
}
```

**Day 5: Image Sync**

```typescript
// ui-new/src/services/syncImages.ts
export async function syncImageToDrive(image: ImageRecord): Promise<void> {
  const rootFolderId = await googleDrive.ensureRootFolder();
  const imagesFolder = await googleDrive.ensureFolder('images', rootFolderId);
  const ext = image.mimeType.split('/')[1];
  await googleDrive.uploadBlob(`${image.id}.${ext}`, image.blob, imagesFolder);
}
```

### Deliverables
- ✅ Google Drive sync working
- ✅ Settings sync to Drive
- ✅ Plans/Playlists/Projects sync
- ✅ Images sync as blobs
- ✅ Cross-device sync tested

---

## Phase 5: Component Updates & Testing (Week 5)

### Goals
- Update all components to use unified API
- Test all features end-to-end
- Fix bugs and edge cases
- Deploy to production

### Tasks

**Day 1: Component Updates**

Update components (see LOCALSTORAGE_MIGRATION.md for detailed steps):
- `VoiceSettings.tsx`
- `SettingsPage.tsx`
- `VoiceInputDialog.tsx`
- `ChatTab.tsx`
- `ContinuousVoiceMode.tsx`
- `SettingsModal.tsx`

**Day 2: Feature Testing**

Test all features:
- [ ] Voice settings persist
- [ ] Proxy settings persist
- [ ] Provider settings persist
- [ ] Snippets save and sync
- [ ] Feed items save (local only)
- [ ] Quizzes save and sync
- [ ] Plans save and sync
- [ ] Images save and sync
- [ ] Settings sync across devices
- [ ] Migration from localStorage works
- [ ] No parameters lost

**Day 3: Edge Case Testing**

Test edge cases:
- [ ] User switches accounts
- [ ] Offline mode (IndexedDB only)
- [ ] Online mode (sync enabled)
- [ ] Large snippets (100k+ chars) shard correctly
- [ ] Quota errors handled
- [ ] Network errors handled
- [ ] Concurrent updates handled

**Day 4: Performance Testing**

Test performance:
- [ ] Load time with 1000+ snippets
- [ ] Sync time with 1000+ snippets
- [ ] IndexedDB query performance
- [ ] Memory usage
- [ ] Network bandwidth

**Day 5: Deployment**

- [ ] Deploy to staging
- [ ] Smoke test on staging
- [ ] Deploy to production
- [ ] Monitor error logs
- [ ] Verify migration completion rate

### Deliverables
- ✅ All components updated
- ✅ All tests passing
- ✅ Deployed to production
- ✅ No regressions

---

## Risk Mitigation

### Risk 1: Migration Failures

**Mitigation**:
- Test migration script thoroughly
- Implement rollback procedure
- Monitor migration completion rate
- Provide manual migration tool in settings

### Risk 2: Data Loss

**Mitigation**:
- Backup localStorage before migration
- Keep old localStorage keys for 30 days
- Implement recovery tool
- Test with real user data in staging

### Risk 3: Performance Issues

**Mitigation**:
- Test with large datasets
- Implement pagination
- Add loading indicators
- Monitor performance metrics

### Risk 4: Google API Quota Limits

**Mitigation**:
- Implement exponential backoff
- Cache API responses
- Batch operations
- Monitor quota usage

---

## Success Criteria

**Technical**:
- [ ] All data types stored in IndexedDB
- [ ] Settings synced to Google Drive
- [ ] Snippets/RAG synced to Google Sheets
- [ ] Images synced to Google Drive
- [ ] Feed items local-only
- [ ] No localStorage usage (except auth tokens)
- [ ] Sharding works for large content
- [ ] Migration script tested
- [ ] All tests passing
- [ ] No performance regressions

**User Experience**:
- [ ] Settings persist across sessions
- [ ] Settings sync across devices
- [ ] No data loss
- [ ] Fast load times
- [ ] Clear error messages
- [ ] Smooth migration (no user action needed)

**Business**:
- [ ] 95%+ migration success rate
- [ ] < 1% error rate
- [ ] User satisfaction maintained
- [ ] No support tickets related to data loss

---

## Rollout Plan

### Stage 1: Internal Testing (Week 1-4)

- Test with development accounts
- Fix bugs and edge cases
- Refine migration script

### Stage 2: Beta Testing (Week 5)

- Deploy to 10% of users
- Monitor error logs
- Gather feedback
- Fix critical issues

### Stage 3: Full Rollout (Week 6)

- Deploy to all users
- Monitor migration completion rate
- Provide support for migration issues
- Keep rollback plan ready

---

## Monitoring & Metrics

### Key Metrics

**Migration**:
- Migration completion rate (target: 95%+)
- Migration failure rate (target: < 5%)
- Migration duration (target: < 5 seconds)

**Performance**:
- IndexedDB query time (target: < 100ms)
- Google Sheets sync time (target: < 5 seconds for 100 items)
- Google Drive sync time (target: < 2 seconds for settings)
- Page load time (target: no regression)

**Reliability**:
- Error rate (target: < 1%)
- Data loss incidents (target: 0)
- Rollback rate (target: < 1%)

### Monitoring Tools

- Browser console logs
- Sentry error tracking
- Google Analytics events
- Custom metrics in SettingsContext

---

## Documentation

### User Documentation

- [ ] Settings sync guide
- [ ] Cross-device setup
- [ ] Troubleshooting guide
- [ ] FAQ

### Developer Documentation

- [ ] API reference
- [ ] Schema documentation
- [ ] Migration guide
- [ ] Testing guide

---

## Next Steps

1. **Review all planning documents**:
   - PERSISTENCE_ARCHITECTURE.md
   - INDEXEDDB_SCHEMA.md
   - GOOGLE_SYNC_STRATEGY.md
   - SETTINGS_PERSISTENCE.md
   - LOCALSTORAGE_MIGRATION.md
   - IMPLEMENTATION_PHASES.md (this doc)

2. **Set up development environment**:
   - Install Dexie.js
   - Configure Google API credentials
   - Set up test database

3. **Begin Phase 1**:
   - Create IndexedDB schema
   - Implement UnifiedStorage service
   - Write unit tests

4. **Iterate through phases**:
   - Follow weekly plan
   - Test thoroughly at each stage
   - Document issues and solutions
