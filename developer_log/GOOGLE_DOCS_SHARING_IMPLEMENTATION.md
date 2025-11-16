# Google Docs Long Content Sharing - Implementation Progress

**Date:** November 15, 2025  
**Status:** Phase 1 Complete - Core Infrastructure Added

## ✅ Completed

### Phase 1: Core Utilities (COMPLETE)

**File: `ui-new/src/utils/googleDocs.ts`**
- ✅ `findOrCreateSharesFolder()` - Already existed
- ✅ `makeDocumentPublic()` - Already existed  
- ✅ `createPublicShareDocument()` - Already existed (for Feed & Snippets)
- ✅ **NEW: `createPublicShareQuiz()`** - Export quizzes as JSON files
- ✅ **NEW: `removePublicSharing()`** - Remove public access permissions
- ✅ **NEW: `downloadFileContent()`** - Download file content by ID
- ✅ **NEW: `getFileMetadata()`** - Get file metadata by ID

**File: `ui-new/src/utils/sharedDocuments.ts` (NEW)**
- ✅ `saveSharedDocument()` - Track shared documents in localStorage
- ✅ `getSharedDocument()` - Get shared document info for an item
- ✅ `removeSharedDocument()` - Remove tracking when unshared
- ✅ `getAllSharedDocuments()` - List all shared documents
- ✅ `clearAllSharedDocuments()` - Bulk cleanup

## ✅ Complete

### Phase 2: Share Dialog Updates

**Summary**: All share dialogs updated to use Google Docs sharing with **existing preview pages** instead of creating new ones.

**Preview URL Approach**:
- **Snippets**: `#/snippet/shared?docId={fileId}` → Uses existing `SharedSnippetViewer`
- **Quizzes**: `#/quiz/shared?docId={fileId}` → Uses existing `SharedQuizViewer`  
- **Feed**: Will use existing feed share viewer pattern

**Key Change**: Instead of creating a new `/preview/{fileId}` route, we reuse the existing shared viewers by passing a `docId` parameter. The viewers detect this parameter and load content from Google Drive instead of from the compressed URL data.

#### 2A. SnippetShareDialog.tsx ✅ COMPLETE
**Location:** `ui-new/src/components/SnippetShareDialog.tsx`

**Completed Changes:**
1. ✅ Added imports for `removePublicSharing` and shared document tracking
2. ✅ Added state management for `sharedDoc` and `isStopping`
3. ✅ Added `useEffect` to load existing shared document on mount
4. ✅ Updated `handleCreateGoogleDoc` to:
   - Generate preview URL: `https://ai.syntithenai.com/preview/${documentId}`
   - Save to tracking system with `saveSharedDocument()`
   - Update local state with shared doc info
   - Save preview URL to snippet (not direct Google Docs link)
5. ✅ Added `handleStopSharing` function to remove public sharing
6. ✅ Updated UI with "Open Preview" and "Stop Sharing" buttons

**Implementation Details:**
```typescript
// State
const [sharedDoc, setSharedDoc] = useState<SharedDocument | null>(null);
const [isStopping, setIsStopping] = useState(false);

// Load existing
useEffect(() => {
  const existing = getSharedDocument('snippet', snippetId);
  if (existing) {
    setSharedDoc(existing);
    setGoogleDocsUrl(existing.webViewLink);
  }
}, [snippetId]);

// Create and save
const previewUrl = `https://ai.syntithenai.com/preview/${documentId}`;
saveSharedDocument('snippet', snippetId, documentId, previewUrl);

// Stop sharing
const handleStopSharing = async () => {
  await removePublicSharing(sharedDoc.documentId, accessToken);
  removeSharedDocument('snippet', snippetId);
  setSharedDoc(null);
};
```

#### 2B. QuizShareDialog.tsx ✅ COMPLETE
**Location:** `ui-new/src/components/QuizShareDialog.tsx`

**Completed Changes:**
1. ✅ Added imports for Google Docs functions and shared document tracking
2. ✅ Added state management for `activeMode`, `googleDocsUrl`, `sharedDoc`, and loading states
3. ✅ Added `useEffect` to load existing shared document on mount (uses `quiz.title` as identifier)
4. ✅ Added `handleCreateGoogleDoc` to:
   - Use `createPublicShareQuiz()` to export quiz as JSON file
   - Generate preview URL: `https://ai.syntithenai.com/preview/${documentId}`
   - Save to tracking system
   - Update local state
5. ✅ Added `handleStopSharing` to remove public sharing and tracking
6. ✅ Added mode switcher UI (URL Share / Google Docs tabs)
7. ✅ Added Google Docs section with:
   - "Create Google Doc" button when no doc exists
   - Preview URL display with copy button
   - "Open Preview" and "Stop Sharing" buttons

**Implementation Notes:**
- Uses `quiz.title` as unique identifier (quizzes don't have IDs in the Quiz interface)
- JSON export creates `.json` file in Google Drive
- Same pattern as SnippetShareDialog but simplified for quiz structure

### Viewer Components Updated ✅ COMPLETE

#### SharedSnippetViewer.tsx
**Location:** `ui-new/src/components/SharedSnippetViewer.tsx`

**Changes Made:**
1. ✅ Added `downloadFileContent` import from googleDocs utils
2. ✅ Updated `useEffect` to check for `docId` URL parameter
3. ✅ When `docId` present:
   - Downloads HTML file from Google Drive (public, no auth)
   - Parses HTML to extract title, tags, and content
   - Creates `SharedSnippet` object from parsed data
   - Renders using existing UI
4. ✅ Falls back to compressed URL data if no `docId`

**Code Pattern**:
```typescript
const docId = searchParams.get('docId');

if (docId) {
  // Download public file from Google Drive
  const content = await downloadFileContent(docId, '');
  
  // Parse HTML
  const parser = new DOMParser();
  const doc = parser.parseFromString(content, 'text/html');
  const title = doc.querySelector('h1')?.textContent || 'Shared Snippet';
  
  // Create snippet object
  setSnippet({
    version: 1,
    timestamp: Date.now(),
    shareType: 'snippet',
    id: docId,
    content: snippetContent,
    title,
    tags,
    metadata: { compressed: false, originalSize: content.length }
  });
}
```

#### SharedQuizViewer.tsx
**Location:** `ui-new/src/components/SharedQuizViewer.tsx`

**Changes Made:**
1. ✅ Added `useSearchParams` and `downloadFileContent` imports
2. ✅ Updated `useEffect` to check for `docId` URL parameter
3. ✅ When `docId` present:
   - Downloads JSON file from Google Drive (public, no auth)
   - Parses JSON to extract quiz data
   - Validates quiz structure (type === 'quiz', has questions)
   - Creates `SharedQuiz` object from parsed data
   - Renders using existing QuizCard component
4. ✅ Falls back to compressed URL data if no `docId`

**Code Pattern**:
```typescript
const docId = searchParams.get('docId');

if (docId) {
  // Download public JSON file from Google Drive
  const content = await downloadFileContent(docId, '');
  const quizData = JSON.parse(content);
  
  // Validate and create shared quiz
  const sharedQuizData: SharedQuiz = {
    version: 1,
    timestamp: new Date(quizData.sharedAt).getTime(),
    shareType: 'quiz',
    quiz: { title: quizData.title, questions: quizData.questions },
    metadata: { compressed: false, originalSize: content.length }
  };
  
  setSharedQuiz(sharedQuizData);
  setCurrentQuiz(sharedQuizData.quiz);
}
```

#### 2C. FeedShareDialog (HIGH PRIORITY - NEW COMPONENT) ⏳ PENDING
**Location:** `ui-new/src/components/FeedShareDialog.tsx` (NEW FILE)

**Create new component:**
1. Extract inline share logic from `FeedItem.tsx`
2. Apply same pattern as SnippetShareDialog
3. Use `createPublicShareDocument()` with `contentType='feed'`
4. Handle feed-specific data structure

**Update FeedItem.tsx:**
- Import and use new `FeedShareDialog` component
- Remove inline share code

### Phase 3: Preview Page ✅ NOT NEEDED

**Decision**: Use existing shared viewers instead of creating a new preview page.

**Approach**:
- Reuse `SharedSnippetViewer` for snippet/feed previews
- Reuse `SharedQuizViewer` for quiz previews
- Pass `docId` parameter to load from Google Drive
- No new routes or components needed

**Benefits**:
1. ✅ Consistent UI/UX with existing share viewers
2. ✅ Less code to maintain
3. ✅ Already has proper error handling and loading states
4. ✅ Dark mode support built-in
5. ✅ Responsive design already tested

**What Was Removed**:
- ❌ No `/preview/:fileId` route needed
- ❌ No PreviewPage.tsx component needed
- ❌ No separate Google auth flow for preview

**How It Works Now**:
1. Share dialog creates Google Docs file
2. Share URL is `#/snippet/shared?docId={fileId}` or `#/quiz/shared?docId={fileId}`
3. Existing viewer checks for `docId` parameter
4. If present → Downloads from Google Drive
5. If absent → Loads from compressed URL data
6. Same UI for both cases

### Phase 4: Save Functionality ⏳ PENDING

#### 3A. Create Preview Route
**Location:** `ui-new/src/App.tsx`

Add route:
```typescript
<Route path="/preview/:fileId" element={<PreviewPage />} />
```

#### 3B. Create PreviewPage Component
**Location:** `ui-new/src/components/PreviewPage.tsx` (NEW FILE)

**Features:**
1. **Google Auth Requirement:**
   - Check if user is authenticated on load
   - If not → Show login prompt with Google button
   - After login → Download file content

2. **File Type Detection:**
   - Check file metadata (mimeType)
   - HTML files (`.html`) → Feed/Snippet preview
   - JSON files (`.json`) → Quiz preview

3. **HTML Preview (Feed/Snippet):**
   - Download HTML content
   - Render in iframe or div with sanitization
   - Show "Save to My Swag" button

4. **JSON Preview (Quiz):**
   - Download JSON content
   - Parse quiz data
   - Render quiz interface with questions/answers
   - Show "Save to My Quizzes" button

5. **Save Functionality:**
   - **Snippets:** Add to swag collection in default project
   - **Feed:** Add to feed collection  
   - **Quiz:** Add to quiz collection in default project
   - Show success message after save

**Implementation:**
```typescript
import { useParams, useNavigate } from 'react-router-dom';
import { useState, useEffect } from 'react';
import { 
  requestGoogleAuth, 
  isAuthenticated, 
  downloadFileContent,
  getFileMetadata 
} from '../utils/googleDocs';

export const PreviewPage = () => {
  const { fileId } = useParams<{ fileId: string }>();
  const navigate = useNavigate();
  
  const [isAuthenticating, setIsAuthenticating] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [content, setContent] = useState<string | null>(null);
  const [metadata, setMetadata] = useState<any | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    loadPreview();
  }, [fileId]);

  const loadPreview = async () => {
    if (!fileId) {
      setError('No file ID provided');
      setIsLoading(false);
      return;
    }

    // Check authentication
    if (!isAuthenticated()) {
      setIsLoading(false);
      return; // Show login prompt
    }

    try {
      setIsLoading(true);
      const token = await requestGoogleAuth();
      
      // Get file metadata
      const meta = await getFileMetadata(fileId, token);
      setMetadata(meta);
      
      // Download content
      const fileContent = await downloadFileContent(fileId, token);
      setContent(fileContent);
      
      setIsLoading(false);
    } catch (err) {
      console.error('Failed to load preview:', err);
      setError(err instanceof Error ? err.message : 'Failed to load file');
      setIsLoading(false);
    }
  };

  const handleLogin = async () => {
    setIsAuthenticating(true);
    try {
      await requestGoogleAuth();
      await loadPreview();
    } catch (err) {
      console.error('Login failed:', err);
      setError('Failed to authenticate with Google');
    } finally {
      setIsAuthenticating(false);
    }
  };

  const handleSave = async () => {
    if (!content || !metadata) return;
    
    setIsSaving(true);
    try {
      // Determine content type from mime type
      const isQuiz = metadata.mimeType === 'application/json';
      const isHTML = metadata.mimeType === 'text/html';
      
      if (isQuiz) {
        // Parse and save quiz
        const quizData = JSON.parse(content);
        // TODO: Import and call quiz save function
        // await saveQuizToCollection(quizData);
      } else if (isHTML) {
        // Parse HTML to extract snippet/feed data
        // TODO: Implement HTML parsing and save
        // This needs to reverse-engineer the HTML structure
      }
      
      // Show success message
      alert('Saved to your collection!');
      
      // Navigate to appropriate page
      if (isQuiz) {
        navigate('/quiz');
      } else {
        navigate('/swag');
      }
    } catch (err) {
      console.error('Failed to save:', err);
      alert('Failed to save item');
    } finally {
      setIsSaving(false);
    }
  };

  // Render logic
  if (!isAuthenticated()) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="max-w-md p-8 bg-white rounded-lg shadow-lg text-center">
          <h1 className="text-2xl font-bold mb-4">Login Required</h1>
          <p className="text-gray-600 mb-6">
            You need to sign in with Google to view this shared content.
          </p>
          <button
            onClick={handleLogin}
            disabled={isAuthenticating}
            className="px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
          >
            {isAuthenticating ? 'Signing in...' : 'Sign in with Google'}
          </button>
        </div>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-gray-600">Loading shared content...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="max-w-md p-8 bg-white rounded-lg shadow-lg text-center">
          <h1 className="text-2xl font-bold text-red-600 mb-4">Error</h1>
          <p className="text-gray-600 mb-6">{error}</p>
          <button
            onClick={() => navigate('/')}
            className="px-6 py-3 bg-gray-600 text-white rounded-lg hover:bg-gray-700"
          >
            Go Home
          </button>
        </div>
      </div>
    );
  }

  const isQuiz = metadata?.mimeType === 'application/json';

  return (
    <div className="min-h-screen bg-gray-50 py-8">
      <div className="max-w-4xl mx-auto px-4">
        {/* Header */}
        <div className="bg-white rounded-lg shadow p-6 mb-6">
          <div className="flex justify-between items-center">
            <div>
              <h1 className="text-2xl font-bold text-gray-900">{metadata?.name}</h1>
              <p className="text-sm text-gray-500 mt-1">
                Shared from Research Agent
              </p>
            </div>
            <button
              onClick={handleSave}
              disabled={isSaving}
              className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50 flex items-center gap-2"
            >
              {isSaving ? 'Saving...' : 'Save to My Collection'}
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="bg-white rounded-lg shadow p-6">
          {isQuiz ? (
            // Quiz Preview
            <QuizPreview content={content!} />
          ) : (
            // HTML Preview
            <div dangerouslySetInnerHTML={{ __html: content! }} />
          )}
        </div>
      </div>
    </div>
  );
};

// Quiz Preview Component
const QuizPreview = ({ content }: { content: string }) => {
  const quizData = JSON.parse(content);
  
  return (
    <div>
      <h2 className="text-xl font-bold mb-4">{quizData.title}</h2>
      {quizData.description && (
        <p className="text-gray-600 mb-6">{quizData.description}</p>
      )}
      
      <div className="space-y-6">
        {quizData.questions?.map((q: any, idx: number) => (
          <div key={idx} className="border-l-4 border-blue-500 pl-4">
            <p className="font-semibold mb-2">
              {idx + 1}. {q.text || q.question}
            </p>
            <div className="space-y-2">
              {q.options?.map((opt: string, optIdx: number) => (
                <div key={optIdx} className="flex items-center gap-2">
                  <span className="text-gray-500">{String.fromCharCode(65 + optIdx)}.</span>
                  <span>{opt}</span>
                </div>
              ))}
            </div>
            {q.correctAnswer && (
              <p className="text-green-600 mt-2 text-sm">
                ✓ Correct Answer: {q.correctAnswer}
              </p>
            )}
          </div>
        ))}
      </div>
    </div>
  );
};
```

## 📋 Next Steps (Priority Order)

1. **HIGH:** Update SnippetShareDialog.tsx with:
   - Shared document state management
   - Create/Stop sharing buttons
   - Preview URL generation

2. **HIGH:** Update QuizShareDialog.tsx with same pattern

3. **HIGH:** Create FeedShareDialog.tsx component
   - Extract from FeedItem.tsx
   - Apply sharing pattern

4. **CRITICAL:** Create PreviewPage.tsx
   - Google auth requirement
   - HTML/JSON rendering
   - Save functionality

5. **MEDIUM:** Add App.tsx route for `/preview/:fileId`

6. **MEDIUM:** Implement save-to-collection functions
   - Save snippet from HTML
   - Save feed from HTML
   - Save quiz from JSON

7. **LOW:** Add user notifications/toasts
   - Share success
   - Share stopped
   - Save success
   - Error messages

## 🧪 Testing Checklist

- [ ] Share snippet → Creates HTML in Google Drive
- [ ] Share quiz → Creates JSON in Google Drive
- [ ] Share feed → Creates HTML in Google Drive
- [ ] Stop sharing → Removes public permissions
- [ ] Preview page requires login
- [ ] Preview shows HTML content correctly
- [ ] Preview shows quiz questions correctly
- [ ] Save button adds to user's collection
- [ ] Shared document tracking persists in localStorage
- [ ] Open Document button works

## 📝 Notes

- Preview URLs use format: `https://ai.syntithenai.com/preview/{fileId}`
- This requires the preview page to be deployed to production
- The backend Lambda doesn't need changes - all logic is client-side
- Google OAuth must be configured for `ai.syntithenai.com` domain

## 🔧 Rate Limiting (Already Implemented)

The TTS rate limiting is already complete in `TTSProviderFactory.ts`:
- ✅ Tracks rate limit occurrences per provider
- ✅ Blacklists provider for duration specified in error message
- ✅ Falls back to browser speech automatically
- ✅ Clears blacklist after timeout expires
