# Persistence Strategy - Overview

**Date**: 2025-11-11  
**Status**: Planning Document  
**Version**: 2.0 (Split from monolithic plan)

---

## Document Structure

This persistence strategy has been split into focused documents for clarity:

### 1. [PERSISTENCE_ARCHITECTURE.md](./PERSISTENCE_ARCHITECTURE.md)
**Core Concepts & Authentication**

- Authentication requirements (all persistence requires Google OAuth)
- User-scoped data model (every record includes userId)
- Data classification (synchronized vs local-only vs ephemeral)
- Storage layers (IndexedDB, Google Drive, Google Sheets)
- Security & privacy considerations

**Read this first** to understand the overall architecture.

---

### 2. [INDEXEDDB_SCHEMA.md](./INDEXEDDB_SCHEMA.md)
**Database Structure & Interfaces**

- Complete IndexedDB schema (16 tables)
- TypeScript interfaces for all data types
- Indexes for efficient queries
- CRUD operations
- Data cleanup rules
- Database versioning & migrations

**Reference this** when implementing database operations.

---

### 3. [GOOGLE_SYNC_STRATEGY.md](./GOOGLE_SYNC_STRATEGY.md)
**Cloud Synchronization**

- Google Drive sync (Settings, Plans, Playlists, Images)
- Google Sheets sync (Snippets, RAG, Quizzes, Quiz Analytics)
- Sharding strategy for large individual objects (45k char limit per row)
- Strip userId on upload, restore on download
- Sync triggers (automatic vs manual vs periodic)
- Conflict resolution
- Error handling

**Reference this** when implementing cloud sync.

---

### 4. [SETTINGS_PERSISTENCE.md](./SETTINGS_PERSISTENCE.md)
**Unified Settings Structure**

- Complete Settings interface (app, voice, proxy, RAG, TTS)
- Settings storage (IndexedDB + Google Drive sync)
- SettingsContext (React context provider)
- Default settings factory
- Migration from scattered localStorage keys

**Reference this** when working with settings.

---

### 5. [LOCALSTORAGE_MIGRATION.md](./LOCALSTORAGE_MIGRATION.md)
**Step-by-Step localStorage Removal**

- Complete localStorage audit (147 occurrences)
- Component-by-component migration guide
- Exact before/after code for each component
- Migration script implementation
- Testing procedures
- Rollback plan
- **Guarantees no parameters lost, no side effects**

**Follow this** when updating components.

---

### 6. [IMPLEMENTATION_PHASES.md](./IMPLEMENTATION_PHASES.md)
**Week-by-Week Implementation Plan**

- Phase 1 (Week 1): IndexedDB foundation
- Phase 2 (Week 2): Settings consolidation
- Phase 3 (Week 3): Google Sheets sync
- Phase 4 (Week 4): Google Drive sync
- Phase 5 (Week 5): Component updates & testing
- Risk mitigation
- Success criteria
- Rollout plan

**Follow this** for project planning and execution.

---

## Key Architectural Decisions

### 1. Authentication-Required Persistence
- **ALL** persistence operations require valid Google OAuth token
- No anonymous/guest mode for data storage
- Prevents data mixing on shared devices

### 2. User-Scoped Data
- Every record includes `userId` (user's email)
- All queries filter by `userId`
- Ensures data isolation between users

### 3. Single-User Google Documents
- Each user has their own Google Sheets/Drive documents
- **No multi-user shared spreadsheets**
- No need to store `user_email` column in Sheets (stripped on upload, restored on download)

### 4. Feed Items Local-Only
- Persist to IndexedDB to survive page reload
- **Never sync to cloud** (high volume, regenerable)
- Cleanup: Keep most recent 100 items per user

### 5. Sharding for Large Objects
- Google Sheets cell limit: ~50,000 chars
- **Sharding splits large individual records across multiple rows**
- Not about spreadsheet row limits, but about oversized content in single records
- Applies to: Snippets, RAG data, Quizzes, any large content

### 6. Ephemeral UI State
- User-scoped but **not synchronized**
- Examples: recent tags, scroll position, editor state
- Stored in IndexedDB, not synced to cloud

### 7. Settings Unification
- All settings (app, voice, proxy, RAG, TTS) in single `Settings` object
- Stored in IndexedDB, synced to Google Drive
- Migrated from scattered localStorage keys

---

## Data Flow Summary

```
┌─────────────────────────────────────────────────────────────┐
│                     User Authentication                      │
│                   (Google OAuth - REQUIRED)                  │
└──────────────────────────┬──────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────────┐
│                     UnifiedStorage API                       │
│  save() | get() | query() | delete() | sync() | pull()     │
└──────────────┬────────────────────────┬─────────────────────┘
               │                        │
               ▼                        ▼
┌──────────────────────────┐  ┌──────────────────────────────┐
│   IndexedDB (Primary)    │  │   Google Cloud (Optional)    │
│                          │  │                              │
│  • Settings              │  │  Drive:                      │
│  • Snippets              │◄─┼─ • settings.json            │
│  • Feed Items (local)    │  │  • plans/*.json              │
│  • RAG Data              │  │  • playlists/*.json          │
│  • Quizzes               │  │  • images/*                  │
│  • Quiz Analytics        │  │                              │
│  • Plans                 │  │  Sheets:                     │
│  • Playlists             │  │  • Snippets (with sharding)  │
│  • Projects              │◄─┼─ • RAG (with sharding)       │
│  • Chat History          │  │  • Quizzes (with sharding)   │
│  • Images                │  │  • QuizAnalytics             │
│  • UI State (ephemeral)  │  │                              │
└──────────────────────────┘  └──────────────────────────────┘
```

---

## Migration Path

### Current State (Before)
- Settings scattered across localStorage (10+ keys)
- Voice settings in 6+ localStorage keys
- Proxy settings in separate JSON object
- No cloud sync for most data
- Inconsistent data access patterns

### Target State (After)
- All settings unified in single `Settings` object
- All data in IndexedDB with userId
- Selective cloud sync (Sheets for tabular, Drive for blobs/JSON)
- Feed items local-only
- Consistent UnifiedStorage API
- No localStorage usage (except auth tokens and runtime cache)

### Migration Script
- Reads scattered localStorage keys
- Merges into unified Settings object
- Saves to IndexedDB
- Cleans up old localStorage keys
- Preserves all parameters (zero data loss)
- One-time automatic execution on app startup

---

## Quick Reference

### Common Operations

**Save Settings**:
```typescript
const { settings, updateSettings } = useSettings();
await updateSettings({ theme: 'dark' });
// Automatically saves to IndexedDB + syncs to Google Drive
```

**Save Snippet**:
```typescript
await unifiedStorage.save('snippets', {
  id: 'snippet_123',
  content: 'My note',
  tags: ['ai'],
  type: 'text',
});
// Automatically adds userId and timestamps
```

**Query Snippets**:
```typescript
const snippets = await unifiedStorage.query('snippets', {
  projectId: 'project_abc',
});
// Automatically filters by current userId
```

**Sync to Cloud**:
```typescript
await syncSnippetsToSheets(user.email);
// Uploads all user's snippets to Google Sheets (with sharding if needed)
```

---

## Implementation Checklist

### Phase 1: IndexedDB Foundation
- [ ] Create `ui-new/src/services/db.ts` (schema)
- [ ] Create `ui-new/src/services/unifiedStorage.ts` (API)
- [ ] Create TypeScript interfaces
- [ ] Write unit tests

### Phase 2: Settings Consolidation
- [ ] Create `ui-new/src/services/settings.ts`
- [ ] Create `ui-new/src/contexts/SettingsContext.tsx`
- [ ] Create `ui-new/src/services/migrateFromLocalStorage.ts`
- [ ] Test migration script

### Phase 3: Google Sheets Sync
- [ ] Create `ui-new/src/services/googleSheets.ts`
- [ ] Create `ui-new/src/services/sharding.ts`
- [ ] Implement snippet sync with sharding
- [ ] Implement RAG sync with sharding

### Phase 4: Google Drive Sync
- [ ] Create `ui-new/src/services/googleDrive.ts`
- [ ] Implement settings sync
- [ ] Implement plans/playlists sync
- [ ] Implement image sync

### Phase 5: Component Updates
- [ ] Update `VoiceSettings.tsx`
- [ ] Update `SettingsPage.tsx`
- [ ] Update `VoiceInputDialog.tsx`
- [ ] Update `ChatTab.tsx`
- [ ] Update `ContinuousVoiceMode.tsx`
- [ ] Update `SettingsModal.tsx`

---

## Questions & Answers

**Q: Why require authentication for all persistence?**  
A: Prevents data mixing on shared devices, ensures data integrity, simplifies security model.

**Q: Why not use multi-user shared spreadsheets?**  
A: User privacy, data isolation, simpler security model. Each user owns their data in their Google Drive.

**Q: Why not sync feed items?**  
A: High volume (regenerable), low long-term value, would consume quota unnecessarily.

**Q: What is sharding and when is it used?**  
A: Splitting large individual records across multiple rows. Used when a single record's content exceeds Google Sheets cell limit (~50k chars). Applies to snippets, RAG data, quizzes.

**Q: Will any parameters be lost during migration?**  
A: No. Migration script explicitly maps every localStorage key to Settings fields. See LOCALSTORAGE_MIGRATION.md for detailed verification.

**Q: What if migration fails?**  
A: Rollback procedure documented in LOCALSTORAGE_MIGRATION.md. Old localStorage keys preserved for 30 days as backup.

---

## Related Documentation

- `.github/copilot-instructions.md` - Development workflow guidelines
- `developer_log/FEATURE_SNIPPETS_EMBEDDINGS_SYNC.md` - Previous sync implementation
- `developer_log/FEED_FEATURE_IMPLEMENTATION.md` - Feed persistence details
- `developer_log/FEATURE_LOCAL_BROWSER_EMBEDDINGS_COMPLETE.md` - Local embeddings

---

## Change Log

### Version 2.0 (2025-11-11)
- Split monolithic plan into 6 focused documents
- Clarified sharding strategy (for large individual objects, not spreadsheet limits)
- Removed multi-user shared spreadsheet architecture
- Clarified feed items as local-only (no sync)
- Unified voice and proxy settings into main Settings object
- Added explicit localStorage migration steps
- Removed migration strategy section (no need for backward compatibility)
- Emphasized authentication requirement for all persistence

### Version 1.0 (2025-11-10)
- Initial monolithic unified persistence plan
- User-scoped data architecture
- Multi-user shared spreadsheet design (now removed)
- Migration checklist (now removed)

---

## Next Steps

1. **Review**: Read all 6 documents in order
2. **Understand**: Core architecture and constraints
3. **Plan**: Schedule 5-week implementation
4. **Execute**: Follow IMPLEMENTATION_PHASES.md
5. **Test**: Verify no data loss, no regressions
6. **Deploy**: Staged rollout with monitoring

---

**For implementation, start with**: [IMPLEMENTATION_PHASES.md](./IMPLEMENTATION_PHASES.md)
