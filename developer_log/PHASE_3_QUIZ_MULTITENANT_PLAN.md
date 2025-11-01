# Phase 3: Quiz Multi-Tenancy Implementation Plan

**Status**: 🔄 READY TO START  
**Prerequisites**: Phase 1.1 ✅, Phase 1.2 ✅, Phase 5 ✅  
**Estimated Time**: 4-6 hours

## Overview

Implement complete multi-tenancy for quiz storage and sync, similar to the feed items implementation. This will allow users to store quizzes in Google Sheets with proper user/project isolation.

## Current State

**Quiz Storage**:
- Frontend: IndexedDB (`ui-new/src/db/quizDb.ts`)
- Backend: No persistent storage (quizzes only generated, not stored)
- Analytics: Logged to Google Sheets via `logToGoogleSheets()` (no user isolation)

**Quiz Flow**:
1. User generates quiz via `/quiz` endpoint
2. Quiz returned to frontend
3. Frontend saves to IndexedDB
4. Quiz analytics synced via `/quiz/sync` endpoint
5. ❌ **No persistent backend storage**
6. ❌ **No user/project isolation**

## Goals

1. Create Google Sheets service for quiz storage
2. Implement CRUD operations with multi-tenancy
3. Update `/quiz` endpoint to auto-save quizzes
4. Create `/quiz/items` CRUD endpoints
5. Implement frontend sync service
6. Update QuizContext to use sync service

## Architecture

### Backend Components

#### 1. `src/services/google-sheets-quiz.js` (NEW)
Multi-tenant quiz storage service.

**Schema** (columns A:L, 12 columns):
- A: id (unique quiz ID)
- B: user_email (owner email)
- C: project_id (project context)
- D: created_at (timestamp)
- E: updated_at (timestamp)
- F: quiz_title (quiz title)
- G: source_content (original content)
- H: questions (JSON array)
- I: total_questions (count)
- J: completed (boolean)
- K: score (percentage or null)
- L: completed_at (timestamp or empty)

**Functions**:
- `getOrCreateQuizSheet(userEmail, accessToken)` - Create/find "Research Agent/Quizzes" spreadsheet
- `insertQuiz(params, userEmail, projectId, accessToken)` - Save new quiz
- `getQuizzes(userEmail, projectId, accessToken)` - Get user's quizzes (with optional project filter)
- `getQuiz(id, userEmail, projectId, accessToken)` - Get specific quiz
- `updateQuiz(id, updates, userEmail, projectId, accessToken)` - Update quiz (score, completed)
- `deleteQuiz(id, userEmail, projectId, accessToken)` - Delete quiz

**Security**:
- Every function validates `userEmail` via `validateUserEmail()`
- Every function filters results with `filterByUserAndProject()`
- Every function logs access with `logUserAccess()`
- Update/delete operations verify ownership

#### 2. `src/endpoints/quiz.js` (MODIFY)
Update existing endpoint to save quizzes.

**Changes**:
1. Import quiz service and extractProjectId
2. After successful quiz generation, save to Google Sheets
3. Handle errors gracefully (generation succeeds even if save fails)

**New Endpoints**:
```javascript
// Get quizzes
GET /quiz/items
Query params: project_id (optional)
Returns: Array of user's quizzes

// Save/update quiz
POST /quiz/items
Body: { id?, quiz_title, source_content, questions, completed?, score?, completed_at? }
Returns: Saved quiz object

// Delete quiz
DELETE /quiz/items/:id
Returns: Deleted quiz object

// Get specific quiz
GET /quiz/items/:id
Returns: Quiz object
```

### Frontend Components

#### 1. `ui-new/src/services/quizSyncService.ts` (NEW)
Bidirectional sync between IndexedDB and Google Sheets.

**Pattern**: Same as `feedSyncService.ts`

**Functions**:
- `downloadQuizzes(projectId?)` - GET /quiz/items
- `uploadQuiz(quiz)` - POST /quiz/items
- `deleteQuiz(id)` - DELETE /quiz/items/:id
- `fullSync(projectId?)` - Merge local + remote
- `saveQuiz(quiz)` - Save to both local and remote
- `updateQuizProgress(id, score, completed)` - Update completion

**Merge Strategy**:
- Backend as source of truth
- Upload local-only quizzes
- Update local with remote changes
- Conflict resolution: most recent wins

#### 2. `ui-new/src/contexts/QuizContext.tsx` (MODIFY)
Replace IndexedDB-only with sync service.

**Changes**:
1. Import quizSyncService
2. Background sync on load (non-blocking)
3. Auto-save generated quizzes to backend
4. Auto-sync after completion
5. Reload from IndexedDB after sync

#### 3. `ui-new/src/types/quiz.ts` (MODIFY)
Add backend fields.

**Add**:
```typescript
interface Quiz {
  id: string;
  user_email?: string;      // NEW
  project_id?: string;       // NEW
  quiz_title: string;
  source_content?: string;   // NEW
  questions: Question[];
  created_at?: string;       // NEW
  updated_at?: string;       // NEW
  completed?: boolean;
  score?: number;
  completed_at?: string;
}
```

## Implementation Steps

### Step 1: Backend Service (2-3 hours)

1. Create `src/services/google-sheets-quiz.js`:
   - Copy structure from `google-sheets-feed.js` as template
   - Define schema (A:L, 12 columns)
   - Implement getOrCreateQuizSheet()
   - Implement insertQuiz() with multi-tenancy
   - Implement getQuizzes() with filtering
   - Implement getQuiz() with filtering
   - Implement updateQuiz() with ownership check
   - Implement deleteQuiz() with ownership check

2. Update `src/endpoints/quiz.js`:
   - Import quiz service and extractProjectId
   - Add auto-save logic after generation
   - Create handler: getQuizzesHandler()
   - Create handler: saveQuizHandler()
   - Create handler: deleteQuizHandler()
   - Create handler: getQuizHandler()

3. Update `src/index.js`:
   - Add route: GET /quiz/items → getQuizzesHandler
   - Add route: POST /quiz/items → saveQuizHandler
   - Add route: DELETE /quiz/items/:id → deleteQuizHandler
   - Add route: GET /quiz/items/:id → getQuizHandler

### Step 2: Frontend Service (1-2 hours)

1. Create `ui-new/src/services/quizSyncService.ts`:
   - Copy structure from `feedSyncService.ts` as template
   - Implement downloadQuizzes()
   - Implement uploadQuiz()
   - Implement deleteQuiz()
   - Implement fullSync() with merge logic
   - Implement saveQuiz() (local + remote)
   - Implement updateQuizProgress()

2. Update `ui-new/src/types/quiz.ts`:
   - Add user_email, project_id fields
   - Add created_at, updated_at fields
   - Add source_content field
   - Update Quiz interface

### Step 3: Frontend Integration (1 hour)

1. Update `ui-new/src/contexts/QuizContext.tsx`:
   - Replace quizDb direct calls with quizSyncService
   - Add background sync on mount
   - Auto-sync after quiz generation
   - Auto-sync after quiz completion
   - Handle sync errors gracefully

2. Test UI:
   - Generate quiz → verify saved to backend
   - Complete quiz → verify progress synced
   - Refresh page → verify quizzes restored
   - Multiple projects → verify isolation

### Step 4: Testing (1 hour)

#### Backend Tests
1. Create quiz (User A, Project X)
2. Verify User B cannot see it
3. Verify User A in Project Y cannot see it
4. Update quiz (User A, Project X) → success
5. Update quiz (User B, Project X) → fail
6. Delete quiz (owner) → success
7. Delete quiz (non-owner) → fail

#### Frontend Tests
1. Generate quiz → verify in IndexedDB and backend
2. Offline mode → generate quiz → sync when online
3. Multiple tabs → sync updates
4. Switch projects → see different quizzes
5. Complete quiz → verify progress synced

## Migration Notes

**IMPORTANT**: Existing quizzes in IndexedDB need migration:
1. Export all quizzes from IndexedDB
2. For each quiz:
   - Add user_email from auth context
   - Add project_id from current project
   - Upload to backend via POST /quiz/items
3. Verify all quizzes accessible after migration

Migration can be manual (one-time sync button) or automatic (background upload on first login).

## Code Templates

### Backend Service Template

```javascript
const { google } = require('googleapis');
const { validateUserEmail, filterByUserAndProject, logUserAccess } = require('./user-isolation');

async function getOrCreateQuizSheet(userEmail, accessToken) {
  // Similar to getOrCreateFeedSheet
  // Spreadsheet: "Research Agent/Quizzes"
  // Sheet: "Quizzes"
  // Headers: ID, User Email, Project ID, Created At, Updated At, Quiz Title, Source Content, Questions, Total Questions, Completed, Score, Completed At
}

async function insertQuiz(params, userEmail, projectId, accessToken) {
  validateUserEmail(userEmail);
  
  const { quiz_title, source_content, questions } = params;
  // ... implementation similar to insertFeedItem
  
  logUserAccess('created', 'quiz', id, userEmail, projectId);
  return quiz;
}

async function getQuizzes(userEmail, projectId, accessToken) {
  validateUserEmail(userEmail);
  
  // ... fetch from Google Sheets
  const filtered = filterByUserAndProject(parsed, userEmail, projectId);
  
  logUserAccess('listed', 'quizzes', 'all', userEmail, projectId);
  return filtered;
}

// ... other functions
```

### Frontend Service Template

```typescript
import { getApiEndpoint } from '../utils/api';
import { getCurrentProjectId } from '../utils/api';

async function downloadQuizzes(projectId?: string) {
  const endpoint = await getApiEndpoint();
  const token = localStorage.getItem('googleToken');
  const pid = projectId || getCurrentProjectId();
  
  const params = new URLSearchParams();
  if (pid) params.append('project_id', pid);
  
  const response = await fetch(`${endpoint}/quiz/items?${params}`, {
    headers: {
      'Authorization': `Bearer ${token}`,
      'X-Project-ID': pid || ''
    }
  });
  
  return response.json();
}

async function fullSync(projectId?: string) {
  // 1. Download from backend
  const remote = await downloadQuizzes(projectId);
  
  // 2. Get local quizzes
  const local = await quizDb.getAllQuizzes();
  
  // 3. Merge: backend as source of truth
  // ... merge logic
  
  // 4. Upload local-only quizzes
  // ... upload logic
  
  // 5. Save to IndexedDB
  // ... save logic
}
```

## Success Criteria

- ✅ All quizzes stored in Google Sheets with user/project isolation
- ✅ User A cannot see User B's quizzes
- ✅ User A in Project X cannot see quizzes from Project Y
- ✅ Quiz generation auto-saves to backend
- ✅ Quiz completion syncs progress
- ✅ Offline support via IndexedDB
- ✅ Multi-tab sync working
- ✅ Project switching shows correct quizzes
- ✅ All audit logs captured

## Related Files

- `src/services/google-sheets-feed.js` - Reference implementation
- `src/services/google-sheets-snippets.js` - Reference implementation
- `ui-new/src/services/feedSyncService.ts` - Reference implementation
- `developer_log/PHASE_1_2_SNIPPETS_MULTITENANT_COMPLETE.md` - Similar phase
- `developer_log/MULTI_TENANCY_PLAN.md` - Overall plan

## Next Phase

After Phase 3 completion:
- **Phase 4**: RAG/Embeddings isolation
  - Update vector store metadata with user_email/project_id
  - Filter embeddings queries by user/project
  - Isolate document chunks by user/project
