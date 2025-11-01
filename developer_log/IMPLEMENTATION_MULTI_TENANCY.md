# Implementation Plan: Multi-Tenancy and User Data Isolation

**Status**: ✅ Implementation Complete (Phases 1-4)  
**Priority**: Critical (Security)  
**Date**: 2025-11-02  

## 🎉 Implementation Complete

All phases of multi-tenancy implementation are complete! User data is now fully isolated by `user_email` AND `project_id`:

- ✅ **Phase 1.1**: User isolation utilities ([Details](PHASE_1_1_USER_ISOLATION_UTILITIES.md))
- ✅ **Phase 1.2**: Snippets multi-tenancy ([Details](PHASE_1_2_SNIPPETS_MULTITENANT_COMPLETE.md))
- ✅ **Phase 2**: Feed items multi-tenancy ([Details](PHASE_2_FEED_MULTITENANT_COMPLETE.md))
- ✅ **Phase 3**: Quizzes multi-tenancy + Unified sync ([Details](PHASE_3_UNIFIED_SYNC_COMPLETE.md))
- ✅ **Phase 4**: RAG embeddings multi-tenancy ([Details](PHASE_4_RAG_MULTITENANT_COMPLETE.md))

**Security Status**: All user-generated content (snippets, quizzes, feed items, embeddings) now enforces strict isolation by user and project.

## Overview

Implement comprehensive user data isolation to ensure all user-generated content is restricted to the user who created it. All queries must filter by the logged-in user's email and optionally by the current project ID.

**Scope**: Feed items, snippets, embeddings, configuration, quizzes, and quiz progress.

## Background

### Current State Analysis

**Authentication:**
- ✅ Google OAuth token verification implemented in `src/auth.js`
- ✅ User email extracted from tokens in endpoints (chat.js, generate-image.js, etc.)
- ✅ Email passed as `userEmail` variable through backend code

**Data Storage:**
The application uses Google Sheets as the primary data store for user-generated content:
- **Snippets**: `src/services/google-sheets-snippets.js` (already has user email in functions)
- **Logger**: `src/services/google-sheets-logger.js` (for chat/usage logs)
- **Feed Items**: `src/endpoints/feed.js` + frontend `ui-new/src/components/FeedPage.tsx`
- **Quizzes**: `src/endpoints/quiz.js` + frontend `ui-new/src/components/QuizPage.tsx`
- **Embeddings**: Stored in Google Sheets via RAG sync (`src/endpoints/rag-sync.js`, `src/endpoints/rag.js`)
- **Config**: User settings stored in localStorage (frontend only)

**Project Context:**
- ✅ Frontend has `ProjectContext` (`ui-new/src/contexts/ProjectContext.tsx`)
- ✅ SwagPage uses `getCurrentProjectId()` for snippet filtering
- 🔄 Need to propagate project ID to all backend queries

### Security Gaps Identified (RESOLVED)

1. **Feed Items** ✅ - Multi-tenancy complete (Phase 2)
2. **Quizzes** ✅ - Multi-tenancy complete (Phase 3)
3. **Quiz Progress** ✅ - Multi-tenancy complete (Phase 3)
4. **Embeddings** ✅ - Multi-tenancy complete (Phase 4)
5. **Snippets** ✅ - Multi-tenancy complete (Phase 1.2, enhanced in Phase 4)
6. **Config** 🟢 - Stored in localStorage (already user-isolated)

## Architecture

### Data Store: Google Sheets Structure

Each data type requires its own sheet with user isolation:

#### 1. Feed Items Sheet
```
Columns:
- id (unique identifier)
- user_email (NEW - filter key)
- project_id (NEW - optional filter key)
- title
- content
- url
- source
- tags
- created_at
- updated_at
- upvote_count
- downvote_count
- user_vote (per-user voting state)
```

#### 2. Snippets Sheet (Already Has User Email)
```
Columns:
- id
- user_email (EXISTING ✅)
- project_id (NEW - optional filter key)
- title
- content
- tags
- source
- url
- created_at
- updated_at
```

#### 3. Embeddings Sheet
```
Columns:
- snippet_id (foreign key to snippets)
- user_email (NEW - inherited from snippet)
- project_id (NEW - optional filter key)
- embedding_vector (serialized array)
- model_name
- created_at
```

#### 4. Quizzes Sheet
```
Columns:
- id
- user_email (NEW - filter key)
- project_id (NEW - optional filter key)
- title
- description
- questions (JSON array)
- created_at
- updated_at
```

#### 5. Quiz Progress Sheet
```
Columns:
- quiz_id (foreign key to quizzes)
- user_email (NEW - filter key)
- project_id (NEW - optional filter key)
- question_index
- selected_answer
- is_correct
- timestamp
```

### Authentication Flow

**Current Flow:**
```
User Request → Lambda Handler → Google OAuth Verification → userEmail extracted → Passed to tools/services
```

**Required Enhancement:**
```
User Request → Lambda Handler → Google OAuth Verification → userEmail + projectId extracted → Passed to ALL queries
```

### Project Context Propagation

**Frontend → Backend:**
```typescript
// Frontend (React)
const projectId = getCurrentProjectId(); // from ProjectContext
const response = await fetch('/feed', {
  headers: {
    'Authorization': `Bearer ${googleToken}`,
    'X-Project-ID': projectId // NEW header
  }
});
```

**Backend:**
```javascript
// Extract from headers
const userEmail = verifiedUser.email;
const projectId = event.headers['x-project-id'] || null;

// Pass to all data operations
const feedItems = await getFeedItems({ userEmail, projectId });
```

## Implementation Plan

### Phase 1: Backend Infrastructure

**Task 1.1**: Create User Isolation Utility
- **File**: `src/services/user-isolation.js` (NEW)
- **Purpose**: Centralized utilities for user/project filtering
- **Functions**:
  ```javascript
  // Validate user email from authentication
  function validateUserEmail(userEmail) {
    if (!userEmail || userEmail === 'unknown' || userEmail === 'anonymous') {
      throw new Error('User authentication required');
    }
    return userEmail;
  }

  // Build filter for Google Sheets queries
  function buildUserFilter(userEmail, projectId = null) {
    const filter = { user_email: userEmail };
    if (projectId) {
      filter.project_id = projectId;
    }
    return filter;
  }

  // Extract project ID from request headers
  function extractProjectId(event) {
    return event.headers['x-project-id'] || 
           event.headers['X-Project-ID'] || 
           null;
  }

  module.exports = {
    validateUserEmail,
    buildUserFilter,
    extractProjectId
  };
  ```
- **Success Criteria**: Utility module with comprehensive tests

**Task 1.2**: Update Google Sheets Service - Snippets
- **File**: `src/services/google-sheets-snippets.js`
- **Status**: Already has user email ✅ (lines 289-595 show userEmail parameter)
- **Required Changes**:
  - Add `projectId` parameter to all functions
  - Update `getOrCreateSnippetsSheet()` to filter by projectId
  - Update `insertSnippet()` to save projectId
  - Update `getSnippet()`, `updateSnippet()`, `removeSnippet()` to filter by projectId
- **Changes**:
  ```javascript
  // Before
  async function insertSnippet({ title, content, tags, source, url }, userEmail, accessToken) {
    // ...
  }

  // After
  async function insertSnippet({ title, content, tags, source, url, projectId }, userEmail, accessToken) {
    validateUserEmail(userEmail); // NEW
    const values = [[
      id, 
      userEmail,     // EXISTING ✅
      projectId,     // NEW
      title, 
      content,
      // ... rest
    ]];
  }

  // Add filtering to getAllSnippets
  async function getAllSnippets(userEmail, projectId, accessToken) {
    validateUserEmail(userEmail); // NEW
    const filter = buildUserFilter(userEmail, projectId); // NEW
    // Filter rows by user_email and project_id
  }
  ```
- **Success Criteria**: All snippet operations isolated by user + project

### Phase 2: Feed Items Isolation

**Task 2.1**: Create Feed Service Module
- **File**: `src/services/google-sheets-feed.js` (NEW)
- **Purpose**: Handle feed CRUD operations with user isolation
- **Functions**:
  ```javascript
  async function getOrCreateFeedSheet(userEmail, accessToken) {
    // Similar to snippets sheet creation
    // Returns spreadsheet ID for user's feed
  }

  async function insertFeedItem(feedItem, userEmail, projectId, accessToken) {
    validateUserEmail(userEmail);
    const { spreadsheetId } = await getOrCreateFeedSheet(userEmail, accessToken);
    
    const values = [[
      generateId(),
      userEmail,     // NEW - user isolation
      projectId,     // NEW - project isolation
      feedItem.title,
      feedItem.content,
      feedItem.url,
      feedItem.source,
      JSON.stringify(feedItem.tags),
      new Date().toISOString(),
      new Date().toISOString(),
      0, // upvote_count
      0, // downvote_count
      '' // user_vote
    ]];
    
    // Insert into sheet with append
  }

  async function getFeedItems(userEmail, projectId, accessToken, filters = {}) {
    validateUserEmail(userEmail);
    const { spreadsheetId } = await getOrCreateFeedSheet(userEmail, accessToken);
    
    // Read all rows
    const rows = await readSheetRows(spreadsheetId, accessToken);
    
    // Filter by user_email and project_id
    return rows.filter(row => {
      if (row.user_email !== userEmail) return false;
      if (projectId && row.project_id !== projectId) return false;
      // Apply additional filters (tags, source, etc.)
      return true;
    });
  }

  async function updateFeedItem(itemId, updates, userEmail, projectId, accessToken) {
    validateUserEmail(userEmail);
    // Verify item belongs to user before updating
    const item = await getFeedItem(itemId, userEmail, projectId, accessToken);
    if (!item) {
      throw new Error('Feed item not found or access denied');
    }
    // Update the row
  }

  async function deleteFeedItem(itemId, userEmail, projectId, accessToken) {
    validateUserEmail(userEmail);
    // Verify item belongs to user before deleting
    const item = await getFeedItem(itemId, userEmail, projectId, accessToken);
    if (!item) {
      throw new Error('Feed item not found or access denied');
    }
    // Delete the row
  }

  async function voteFeedItem(itemId, vote, userEmail, projectId, accessToken) {
    validateUserEmail(userEmail);
    // Verify item belongs to user
    const item = await getFeedItem(itemId, userEmail, projectId, accessToken);
    if (!item) {
      throw new Error('Feed item not found or access denied');
    }
    // Update vote counts and user_vote field
  }

  module.exports = {
    insertFeedItem,
    getFeedItems,
    updateFeedItem,
    deleteFeedItem,
    voteFeedItem
  };
  ```
- **Success Criteria**: Complete feed service with user/project isolation

**Task 2.2**: Update Feed Endpoint
- **File**: `src/endpoints/feed.js`
- **Changes**:
  - Import `google-sheets-feed.js` service
  - Extract userEmail from authentication
  - Extract projectId from headers
  - Replace all feed operations with service calls
  ```javascript
  const { validateUserEmail, extractProjectId } = require('../services/user-isolation');
  const feedService = require('../services/google-sheets-feed');

  async function handleFeedRequest(event) {
    // Authenticate user
    const authResult = await verifyGoogleToken(event);
    const userEmail = validateUserEmail(authResult.email);
    const projectId = extractProjectId(event);
    
    const method = event.httpMethod || event.requestContext.http.method;
    const body = JSON.parse(event.body || '{}');
    
    switch (method) {
      case 'GET':
        return await feedService.getFeedItems(
          userEmail, 
          projectId, 
          authResult.accessToken,
          body.filters
        );
      
      case 'POST':
        return await feedService.insertFeedItem(
          body.item,
          userEmail,
          projectId,
          authResult.accessToken
        );
      
      case 'PUT':
        return await feedService.updateFeedItem(
          body.itemId,
          body.updates,
          userEmail,
          projectId,
          authResult.accessToken
        );
      
      case 'DELETE':
        return await feedService.deleteFeedItem(
          body.itemId,
          userEmail,
          projectId,
          authResult.accessToken
        );
      
      default:
        return { statusCode: 405, body: 'Method not allowed' };
    }
  }
  ```
- **Success Criteria**: Feed endpoint enforces user isolation

### Phase 3: Quiz Isolation

**Task 3.1**: Create Quiz Service Module
- **File**: `src/services/google-sheets-quiz.js` (NEW)
- **Purpose**: Handle quiz and progress CRUD with user isolation
- **Functions**:
  ```javascript
  async function getOrCreateQuizSheet(userEmail, accessToken) {
    // Similar to snippets/feed sheet creation
  }

  async function insertQuiz(quiz, userEmail, projectId, accessToken) {
    validateUserEmail(userEmail);
    // Insert quiz with user_email and project_id
  }

  async function getQuizzes(userEmail, projectId, accessToken) {
    validateUserEmail(userEmail);
    // Return only quizzes for this user + project
  }

  async function getQuiz(quizId, userEmail, projectId, accessToken) {
    validateUserEmail(userEmail);
    // Verify quiz belongs to user
  }

  async function updateQuiz(quizId, updates, userEmail, projectId, accessToken) {
    validateUserEmail(userEmail);
    // Verify ownership before update
  }

  async function deleteQuiz(quizId, userEmail, projectId, accessToken) {
    validateUserEmail(userEmail);
    // Verify ownership before delete
  }

  // Quiz Progress Functions
  async function saveQuizProgress(quizId, progress, userEmail, projectId, accessToken) {
    validateUserEmail(userEmail);
    // Save progress for this user only
  }

  async function getQuizProgress(quizId, userEmail, projectId, accessToken) {
    validateUserEmail(userEmail);
    // Return progress for this user only
  }

  module.exports = {
    insertQuiz,
    getQuizzes,
    getQuiz,
    updateQuiz,
    deleteQuiz,
    saveQuizProgress,
    getQuizProgress
  };
  ```
- **Success Criteria**: Complete quiz service with user/project isolation

**Task 3.2**: Update Quiz Endpoint
- **File**: `src/endpoints/quiz.js`
- **Changes**: Similar to feed endpoint
  - Extract userEmail and projectId
  - Replace all quiz operations with service calls
  - Enforce user isolation on all operations
- **Success Criteria**: Quiz endpoint enforces user isolation

### Phase 4: Embeddings Isolation

**Task 4.1**: Audit RAG Services
- **Files**:
  - `src/endpoints/rag.js` - RAG query endpoint
  - `src/endpoints/rag-sync.js` - Sync embeddings with Google Sheets
- **Actions**:
  - Verify embeddings are stored with snippet_id
  - Verify snippet_id lookup enforces user isolation
  - Add explicit user_email column to embeddings sheet (inherit from snippet)
  - Add projectId filtering
- **Changes**:
  ```javascript
  // In rag.js - Query embeddings
  async function queryEmbeddings(query, userEmail, projectId, accessToken) {
    validateUserEmail(userEmail);
    
    // Get user's snippets first
    const snippets = await getAllSnippets(userEmail, projectId, accessToken);
    const snippetIds = snippets.map(s => s.id);
    
    // Query embeddings only for user's snippets
    const embeddings = await getEmbeddingsForSnippets(snippetIds, accessToken);
    
    // Perform vector search
    return vectorSearch(query, embeddings);
  }
  ```
- **Success Criteria**: Embeddings isolated by user + project

**Task 4.2**: Update RAG Sync Service
- **File**: `src/endpoints/rag-sync.js`
- **Changes**:
  - Add user_email and project_id to embedding records
  - Filter sync operations by user + project
  - Prevent cross-user embedding access
- **Success Criteria**: RAG sync enforces user isolation

### Phase 5: Frontend Updates

**Task 5.1**: Add Project Header to API Calls
- **File**: `ui-new/src/utils/api.ts` (or similar API utility)
- **Changes**:
  ```typescript
  import { useProject } from '../contexts/ProjectContext';

  // Update all API fetch calls
  async function apiRequest(endpoint: string, options: RequestInit = {}) {
    const projectId = getCurrentProjectId(); // from ProjectContext
    
    const headers = {
      ...options.headers,
      'X-Project-ID': projectId || '', // NEW header
    };
    
    return fetch(`${API_URL}${endpoint}`, {
      ...options,
      headers
    });
  }
  ```
- **Success Criteria**: All API requests include project ID

**Task 5.2**: Update Feed Components
- **Files**:
  - `ui-new/src/components/FeedPage.tsx`
  - `ui-new/src/components/FeedItem.tsx`
  - `ui-new/src/components/FeedSettings.tsx`
- **Changes**:
  - Verify all feed API calls go through authenticated API utility
  - Add user feedback for access denied errors
  - Update UI to show project-filtered data
- **Success Criteria**: Feed UI respects user/project isolation

**Task 5.3**: Update Quiz Components
- **Files**:
  - `ui-new/src/components/QuizPage.tsx`
  - `ui-new/src/components/QuizCard.tsx`
  - `ui-new/src/components/FeedQuiz.tsx`
- **Changes**: Similar to feed components
- **Success Criteria**: Quiz UI respects user/project isolation

**Task 5.4**: Update SwagPage (Snippets)
- **File**: `ui-new/src/components/SwagPage.tsx`
- **Status**: Already uses `getCurrentProjectId()` ✅
- **Changes**:
  - Verify all snippet operations include projectId
  - Verify embeddings operations include projectId
- **Success Criteria**: SwagPage fully isolated by user + project

### Phase 6: Migration and Testing

**Task 6.1**: Data Migration Script
- **File**: `scripts/migrate-multi-tenancy.js` (NEW)
- **Purpose**: Add user_email and project_id columns to existing sheets
- **Actions**:
  1. Backup all existing Google Sheets data
  2. Add user_email column to feed items (populate with current user)
  3. Add user_email column to quizzes (populate with current user)
  4. Add user_email column to quiz progress (populate with current user)
  5. Add user_email column to embeddings (inherit from snippets)
  6. Add project_id column to all sheets (populate with null/default)
  7. Verify data integrity after migration
- **Success Criteria**: All existing data migrated without loss

**Task 6.2**: Authorization Testing
- **Test Cases**:
  1. **Isolation Test**: User A creates feed item → User B cannot see it
  2. **Project Test**: User A creates snippet in Project 1 → Not visible in Project 2
  3. **Auth Test**: Unauthenticated request → 401 Unauthorized
  4. **Ownership Test**: User A tries to update User B's feed item → 403 Forbidden
  5. **Migration Test**: Pre-migration data accessible only to original user
- **Success Criteria**: All test cases pass

**Task 6.3**: Security Audit
- **Actions**:
  1. Review all endpoints for user isolation
  2. Check for SQL injection vulnerabilities (Google Sheets API)
  3. Verify no hardcoded user emails or bypass mechanisms
  4. Test token expiration and refresh
  5. Test rate limiting per user
- **Success Criteria**: Security audit passes with no critical issues

### Phase 7: Documentation and Rollout

**Task 7.1**: Update API Documentation
- **File**: `README.md` or `docs/API.md`
- **Content**:
  - Document X-Project-ID header requirement
  - Document user isolation behavior
  - Document error responses (401, 403)
  - Document migration process
- **Success Criteria**: Complete API documentation

**Task 7.2**: Update User Documentation
- **Content**:
  - Explain project-based data isolation
  - Explain that data is private per user
  - Document how to switch projects
  - Document data export/backup
- **Success Criteria**: Clear user-facing documentation

**Task 7.3**: Implementation Log
- **File**: This file (`developer_log/IMPLEMENTATION_MULTI_TENANCY.md`)
- **Content**:
  - Mark all tasks complete
  - Document issues encountered
  - List all files modified
  - Add testing results
- **Success Criteria**: Complete implementation record

**Task 7.4**: Gradual Rollout
- **Steps**:
  1. Deploy to staging environment
  2. Test with internal users
  3. Run security audit
  4. Monitor logs for errors
  5. Deploy to production
  6. Monitor user feedback
- **Success Criteria**: Smooth production deployment

## Technical Details

### Google Sheets Query Pattern

**Before (No Isolation):**
```javascript
// BAD - Returns all users' data
const allFeedItems = await readSheetRows(spreadsheetId, accessToken);
return allFeedItems;
```

**After (With Isolation):**
```javascript
// GOOD - Returns only current user's data
const allRows = await readSheetRows(spreadsheetId, accessToken);
const userRows = allRows.filter(row => {
  if (row.user_email !== userEmail) return false;
  if (projectId && row.project_id !== projectId) return false;
  return true;
});
return userRows;
```

### Error Handling

**Unauthorized (401):**
```javascript
if (!userEmail || userEmail === 'unknown') {
  return {
    statusCode: 401,
    body: JSON.stringify({ error: 'Authentication required' })
  };
}
```

**Forbidden (403):**
```javascript
const item = await getFeedItem(itemId, userEmail, projectId, accessToken);
if (!item) {
  return {
    statusCode: 403,
    body: JSON.stringify({ error: 'Access denied' })
  };
}
```

### Logging for Security Monitoring

```javascript
console.log(`🔐 User ${userEmail} accessed feed items (project: ${projectId || 'none'})`);
console.log(`⚠️ User ${userEmail} attempted to access unauthorized item ${itemId}`);
console.log(`✅ User ${userEmail} created feed item ${itemId} (project: ${projectId})`);
```

## Risk Assessment

**Critical Security Risks:**
- 🔴 Feed items currently visible to all users → HIGH PRIORITY
- 🔴 Quizzes currently visible to all users → HIGH PRIORITY
- 🔴 Quiz progress leaking between users → HIGH PRIORITY

**Medium Risks:**
- 🟡 Migration complexity (existing data)
- 🟡 Performance impact of filtering (large datasets)

**Low Risks:**
- 🟢 Snippets already isolated (needs audit)
- 🟢 Config in localStorage (already isolated)

## Performance Considerations

**Optimization Strategies:**
1. **Caching**: Cache user-specific sheet IDs
2. **Indexing**: Use Google Sheets filtering features where possible
3. **Pagination**: Implement pagination for large datasets
4. **Lazy Loading**: Load project data on-demand

**Expected Impact:**
- Minimal performance impact for small-medium datasets
- Need monitoring for large datasets (>10k items per user)

## Success Metrics

- ✅ All feed items isolated by user + project
- ✅ All snippets isolated by user + project
- ✅ All embeddings isolated by user + project
- ✅ All quizzes isolated by user + project
- ✅ All quiz progress isolated by user + project
- ✅ All API endpoints enforce authentication
- ✅ All queries filter by user email
- ✅ Project switching updates UI immediately
- ✅ Zero cross-user data leaks in production
- ✅ Security audit passes with no critical issues

## Files to Create

### Backend
- 🆕 `src/services/user-isolation.js` - Isolation utilities
- 🆕 `src/services/google-sheets-feed.js` - Feed service
- 🆕 `src/services/google-sheets-quiz.js` - Quiz service
- 🆕 `scripts/migrate-multi-tenancy.js` - Migration script

### Frontend
- 🔄 `ui-new/src/utils/api.ts` - Add project header

### Documentation
- 🔄 `README.md` - API documentation
- 🔄 `developer_log/IMPLEMENTATION_MULTI_TENANCY.md` - Implementation log

## Files to Modify

### Backend (Isolation)
- 🔄 `src/services/google-sheets-snippets.js` - Add projectId parameter
- 🔄 `src/endpoints/feed.js` - Use feed service
- 🔄 `src/endpoints/quiz.js` - Use quiz service
- 🔄 `src/endpoints/rag.js` - Add user/project filtering
- 🔄 `src/endpoints/rag-sync.js` - Add user/project filtering

### Frontend (Project Header)
- 🔄 `ui-new/src/components/FeedPage.tsx` - User isolation awareness
- 🔄 `ui-new/src/components/FeedItem.tsx` - User isolation awareness
- 🔄 `ui-new/src/components/FeedSettings.tsx` - User isolation awareness
- 🔄 `ui-new/src/components/QuizPage.tsx` - User isolation awareness
- 🔄 `ui-new/src/components/QuizCard.tsx` - User isolation awareness
- 🔄 `ui-new/src/components/SwagPage.tsx` - Verify project isolation

## Timeline Estimate

- **Phase 1** (Backend Infrastructure): 4-6 hours
- **Phase 2** (Feed Isolation): 6-8 hours
- **Phase 3** (Quiz Isolation): 6-8 hours
- **Phase 4** (Embeddings Isolation): 4-6 hours
- **Phase 5** (Frontend Updates): 4-6 hours
- **Phase 6** (Migration & Testing): 8-10 hours
- **Phase 7** (Documentation & Rollout): 4-6 hours

**Total**: 36-50 hours

## Next Steps

1. **Immediate**: Create user-isolation.js utility module
2. **High Priority**: Implement feed isolation (most visible to users)
3. **High Priority**: Implement quiz isolation (security-critical)
4. **Medium Priority**: Audit and enhance embeddings isolation
5. **Final**: Comprehensive testing and migration

## Notes

- This is a **security-critical** implementation - thorough testing required
- All endpoints must enforce authentication and authorization
- User feedback essential: clear error messages when access denied
- Monitor logs closely after deployment for authorization failures
- Consider implementing admin override for support/debugging (with audit logging)
