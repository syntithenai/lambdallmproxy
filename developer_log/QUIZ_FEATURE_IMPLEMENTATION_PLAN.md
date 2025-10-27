# Quiz Feature Implementation Plan

**Created**: 2025-10-27  
**Status**: Planning Phase  
**Priority**: Medium

---

## 📋 Table of Contents

1. [Environment Configuration Fix](#1-environment-configuration-fix)
2. [Quiz Feature Overview](#2-quiz-feature-overview)
3. [Architecture & Components](#3-architecture--components)
4. [Implementation Phases](#4-implementation-phases)
5. [Data Schema](#5-data-schema)
6. [Technical Details](#6-technical-details)
7. [Testing Strategy](#7-testing-strategy)
8. [Deployment Plan](#8-deployment-plan)

---

## 1. Environment Configuration Fix

### Problem Analysis

**Current Issues**:
```
❌ VITE_PAYPAL_CLIENT_ID not found in environment - PayPal integration disabled
❌ Local Lambda not available at https://ai.syntithenai.com:3000
❌ VITE_GOOGLE_CLIENT_ID not configured in ui-new/.env
```

**Root Cause**:
- UI environment variables are defined in root `.env` but not in `ui-new/.env`
- Vite requires `VITE_*` prefixed variables to be in the UI's `.env` file
- Local Lambda detection is checking HTTPS when it should check HTTP

### Solution

#### 1.1. Create `ui-new/.env` File

**File**: `ui-new/.env`

```bash
# ================================================================
# UI Environment Configuration
# ================================================================

# ----------------------------------------------------------------
# API ENDPOINT CONFIGURATION
# ----------------------------------------------------------------

# Base URL for Lambda API endpoint
VITE_API_BASE=https://nrw7pperjjdswbmqgmigbwsbyi0rwdqf.lambda-url.us-east-1.on.aws

# ----------------------------------------------------------------
# AUTHENTICATION
# ----------------------------------------------------------------

# Google OAuth Client ID (for Google Sign-In)
# Get from: https://console.cloud.google.com/apis/credentials
VITE_GOOGLE_CLIENT_ID=548179877633-cfvhlc5roj9prus33jlarcm540i495qi.apps.googleusercontent.com

# ----------------------------------------------------------------
# PAYMENT INTEGRATION
# ----------------------------------------------------------------

# PayPal Client ID (for credit purchases)
# Production: Live PayPal credentials
# Development: Sandbox credentials
VITE_PAYPAL_CLIENT_ID=AU9cY15vsAcz4tWwm5U0O-nMBqYTP3cT0dOHTpHqPCCD1n9fwdcD-xNcuzMv_eP-UtaB3PFHTuHoXeCW

# ================================================================
# IMPORTANT NOTES
# ================================================================
# 
# - Only VITE_* prefixed variables are exposed to the browser
# - Never store sensitive server-side secrets here
# - Rebuild required after changes: npm run build
# - Development server auto-reloads on changes
# 
# ================================================================
```

#### 1.2. Fix Local Lambda Detection

**File**: `ui-new/src/utils/api.ts`

**Problem**: Checking `https://ai.syntithenai.com:3000` instead of `http://localhost:3000`

**Fix**:
```typescript
// Before
const localLambdaUrl = 'https://ai.syntithenai.com:3000';

// After
const localLambdaUrl = 'http://localhost:3000';
```

#### 1.3. Update `.env.example`

**File**: `ui-new/.env.example`

Add PayPal configuration:
```bash
# PayPal Client ID for credit purchases
# VITE_PAYPAL_CLIENT_ID=your-paypal-client-id
```

#### 1.4. Update `.gitignore`

Ensure `ui-new/.env` is ignored:
```gitignore
# Environment files
.env
.env.local
.env.*.local
ui-new/.env
ui-new/.env.local
```

**Files to Modify**:
1. Create `ui-new/.env` (new file)
2. Fix `ui-new/src/utils/api.ts` (local Lambda URL)
3. Update `ui-new/.env.example` (add VITE_PAYPAL_CLIENT_ID)
4. Verify `.gitignore` contains `ui-new/.env`

**Testing**:
```bash
# 1. Create ui-new/.env with proper values
# 2. Restart Vite dev server
cd ui-new && npm run dev

# 3. Check browser console - should see:
# ✅ VITE_GOOGLE_CLIENT_ID configured
# ✅ VITE_PAYPAL_CLIENT_ID configured
# ✅ Using local Lambda server at http://localhost:3000 (if running)
```

---

## 2. Quiz Feature Overview

### Feature Summary

**Purpose**: Generate interactive multiple-choice quizzes from selected snippets and track user performance.

**User Workflow**:
1. Select snippets containing learning material
2. Bulk operation: "Generate Quiz Questions"
3. LLM generates 10 multiple-choice questions with clear markdown markers
4. Quiz renderer detects quiz markdown format
5. Single-card quiz UI with score tracking
6. Statistics stored in IndexedDB + synced to Google Sheets

### Key Components

1. **Quiz Generation** (Bulk Operation)
   - LLM prompt to generate quiz from snippet content
   - Markdown format with clear delimiters
   - 10 multiple-choice questions per quiz
   - Automatic saving as new snippet

2. **Quiz Renderer** (Markdown Extension)
   - Detects quiz markdown pattern
   - Single-card UI with question navigation
   - Radio buttons for answer selection
   - Score display on completion
   - Quit/Reset controls

3. **Statistics Tracking** (IndexedDB + Google Sheets)
   - Quiz completion data
   - Success rates per quiz
   - Time spent per quiz
   - Individual question accuracy
   - Sync to Google Drive sheet: "Quiz Statistics"

4. **Quiz Page** (/quiz)
   - Overview statistics dashboard
   - List of available quizzes
   - Start new quiz button
   - View past quiz results
   - Performance trends

5. **Navigation Integration**
   - Button below Images Editor on SwagPage
   - Opens Quiz page
   - Badge showing available quizzes count

---

## 3. Architecture & Components

### 3.1. Component Hierarchy

```
SwagPage
├── Bulk Operations Dropdown
│   └── "📝 Generate Quiz Questions" (NEW)
│
└── Bottom Right Actions
    └── "🎯 Quiz" Button (NEW)
        └── Opens QuizPage

QuizPage (NEW)
├── QuizStatsDashboard
│   ├── Total Quizzes
│   ├── Completed Count
│   ├── Average Score
│   └── Recent Activity
│
├── QuizList
│   ├── QuizCard (for each quiz snippet)
│   │   ├── Title
│   │   ├── Preview
│   │   ├── Best Score
│   │   ├── "Start Quiz" Button
│   │   └── "View Results" Button
│   │
│   └── EmptyState (if no quizzes)
│
└── CreateQuizButton
    └── Opens snippet selection dialog

MarkdownRenderer
└── QuizRenderer (NEW)
    ├── QuizCard
    │   ├── QuestionDisplay
    │   ├── AnswerOptions (radio buttons)
    │   ├── Navigation (prev/next)
    │   ├── Progress Indicator
    │   └── Score Display
    │
    └── QuizControls
        ├── Submit Answer
        ├── Quit Quiz
        └── Reset Quiz
```

### 3.2. New Files to Create

**Components**:
```
ui-new/src/components/
├── quiz/
│   ├── QuizPage.tsx                    # Main quiz page
│   ├── QuizStatsDashboard.tsx          # Statistics overview
│   ├── QuizList.tsx                    # List of available quizzes
│   ├── QuizCard.tsx                    # Individual quiz item in list
│   ├── QuizRenderer.tsx                # Quiz UI within markdown
│   ├── QuizControls.tsx                # Quit/Reset/Submit buttons
│   └── CreateQuizDialog.tsx            # Snippet selection for quiz creation
```

**Utilities**:
```
ui-new/src/utils/
├── quizParser.ts                       # Parse quiz markdown format
├── quizStatistics.ts                   # IndexedDB storage for quiz stats
└── quizSync.ts                         # Sync stats to Google Sheets
```

**Types**:
```
ui-new/src/types/
└── quiz.ts                             # TypeScript interfaces for quiz data
```

**Database**:
```
ui-new/src/db/
└── quizStatsDB.ts                      # IndexedDB schema and operations
```

### 3.3. Modified Files

**Existing Components**:
1. `ui-new/src/components/SwagPage.tsx`
   - Add "📝 Generate Quiz Questions" to bulk operations
   - Add "🎯 Quiz" button below Images Editor button
   - Implement `handleGenerateQuiz()` function

2. `ui-new/src/components/MarkdownRenderer.tsx`
   - Add quiz pattern detection
   - Integrate `QuizRenderer` component
   - Pass quiz state management props

3. `ui-new/src/App.tsx`
   - Add `/quiz` route
   - Import `QuizPage` component

**Context Updates**:
4. `ui-new/src/contexts/SwagContext.tsx`
   - Add `generateQuiz()` function
   - Add quiz-related state management

**API Integration**:
5. `ui-new/src/utils/api.ts`
   - Add `generateQuizQuestions()` API call (optional - may use LLM directly)

---

## 4. Implementation Phases

### Phase 1: Environment Configuration Fix (1 hour)

**Priority**: BLOCKER - Must be done first

**Tasks**:
- [x] Create `ui-new/.env` with proper VITE_* variables
- [x] Fix local Lambda URL in `ui-new/src/utils/api.ts`
- [x] Update `ui-new/.env.example` with VITE_PAYPAL_CLIENT_ID
- [x] Verify `.gitignore` includes `ui-new/.env`
- [x] Test local dev server with environment variables
- [x] Rebuild and deploy UI to verify production

**Acceptance Criteria**:
- ✅ No console errors about missing environment variables
- ✅ Local Lambda detection works at `http://localhost:3000`
- ✅ Google Client ID available for OAuth
- ✅ PayPal Client ID available for payments

---

### Phase 2: Quiz Markdown Format & Parser (2 hours)

**Define Quiz Markdown Format**:

```markdown
# QUIZ: JavaScript Fundamentals

## Q1: What is a closure?
- [ ] A function that returns another function
- [x] A function that has access to outer function's variables
- [ ] A method for creating private variables
- [ ] A way to close event listeners

## Q2: What does `===` do?
- [ ] Assigns a value
- [x] Checks equality without type coercion
- [ ] Checks equality with type coercion
- [ ] Concatenates strings

## Q3: What is hoisting?
- [x] Variables and functions are moved to the top of their scope
- [ ] Moving elements in the DOM
- [ ] A type of data structure
- [ ] A method for async operations

<!-- Continue for Q4-Q10 -->
```

**Markers**:
- Quiz title: `# QUIZ: {title}`
- Question: `## Q{number}: {question}`
- Options: `- [ ]` (incorrect) or `- [x]` (correct)
- Must have exactly 10 questions
- Exactly 1 correct answer per question

**Parser Implementation**:

**File**: `ui-new/src/utils/quizParser.ts`

```typescript
export interface QuizQuestion {
  number: number;
  question: string;
  options: string[];
  correctIndex: number;
}

export interface Quiz {
  title: string;
  questions: QuizQuestion[];
  isValid: boolean;
}

export function parseQuizMarkdown(content: string): Quiz | null {
  // 1. Check for "# QUIZ:" marker
  // 2. Extract title
  // 3. Parse questions (## Q1-Q10)
  // 4. Parse options and identify correct answer ([x])
  // 5. Validate 10 questions, each with 1 correct answer
  // 6. Return Quiz object or null if invalid
}

export function isQuizContent(content: string): boolean {
  return /^#\s*QUIZ:/im.test(content);
}
```

**Testing**:
- Unit tests for `parseQuizMarkdown()`
- Test valid quiz markdown
- Test invalid formats (missing markers, wrong number of questions)
- Test edge cases (multiple correct answers, no correct answer)

---

### Phase 3: Quiz Generation Bulk Operation (3 hours)

**Implementation**:

**File**: `ui-new/src/components/SwagPage.tsx`

```typescript
// Add to handleBulkOperation switch
case 'generate-quiz':
  console.log('📝 Generate quiz case triggered');
  await handleGenerateQuiz();
  break;

// New handler function
const handleGenerateQuiz = async () => {
  const selected = getSelectedSnippets();
  
  if (selected.length === 0) {
    showWarning('No snippets selected');
    return;
  }
  
  try {
    setLoading(true);
    
    // Combine selected snippet content
    const combinedContent = selected
      .map(s => s.content)
      .join('\n\n---\n\n');
    
    // Generate quiz via LLM
    const quizMarkdown = await generateQuiz({
      content: combinedContent,
      numQuestions: 10,
      title: selected.length === 1 && selected[0].title 
        ? `${selected[0].title} Quiz` 
        : 'Knowledge Quiz'
    });
    
    // Create new snippet with quiz
    const now = Date.now();
    const quizSnippet: ContentSnippet = {
      id: `quiz-${now}-${Math.random().toString(36).substr(2, 9)}`,
      content: quizMarkdown,
      title: quizMarkdown.match(/# QUIZ: (.+)/)?.[1] || 'Quiz',
      sourceType: 'quiz',
      tags: ['quiz', ...selected.flatMap(s => s.tags || [])],
      timestamp: now,
      updateDate: now,
      selected: false
    };
    
    // Add to snippets
    addSnippet(quizSnippet);
    
    // Deselect and show success
    selectNone();
    showSuccess(`Quiz "${quizSnippet.title}" generated from ${selected.length} snippet(s)`);
    
  } catch (error) {
    console.error('Quiz generation error:', error);
    showError('Failed to generate quiz. Please try again.');
  } finally {
    setLoading(false);
  }
};
```

**LLM Prompt Design**:

**File**: `ui-new/src/utils/quizGenerator.ts`

```typescript
export async function generateQuiz(params: {
  content: string;
  numQuestions: number;
  title: string;
}): Promise<string> {
  const { content, numQuestions, title } = params;
  
  const prompt = `You are a quiz generation expert. Create a multiple-choice quiz from the following content.

CONTENT:
${content}

REQUIREMENTS:
1. Generate exactly ${numQuestions} questions
2. Each question must have 4 answer options
3. Exactly ONE correct answer per question
4. Use ONLY this markdown format:

# QUIZ: ${title}

## Q1: [Question text here]
- [ ] Incorrect option
- [x] Correct option (marked with [x])
- [ ] Incorrect option
- [ ] Incorrect option

## Q2: [Question text here]
...continue for all ${numQuestions} questions

IMPORTANT:
- Use "# QUIZ:" prefix for title
- Use "## Q{number}:" for each question
- Mark correct answer with [x], incorrect with [ ]
- Questions should test understanding, not just recall
- Avoid ambiguous questions
- Keep options concise (1-2 lines max)

Generate the quiz now:`;

  // Call LLM API (use existing chat endpoint)
  const response = await fetch('/api/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      messages: [{ role: 'user', content: prompt }],
      model: 'gpt-4o-mini', // Fast and cheap for quiz generation
      temperature: 0.7 // Some creativity but not too random
    })
  });
  
  const data = await response.json();
  return data.choices[0].message.content;
}
```

**UI Update**:

Add to bulk operations dropdown in `SwagPage.tsx`:

```tsx
<optgroup label="AI Operations">
  <option value="generate-quiz">📝 Generate Quiz Questions</option>
  <option value="generate-embeddings">🧠 Generate Embeddings</option>
</optgroup>
```

**Testing**:
- Select 1 snippet, generate quiz
- Select multiple snippets, generate quiz
- Verify quiz markdown format is correct
- Verify quiz is added as new snippet with 'quiz' tag

---

### Phase 4: Quiz Renderer in Markdown (4 hours)

**Implementation**:

**File**: `ui-new/src/components/quiz/QuizRenderer.tsx`

```typescript
import React, { useState, useEffect } from 'react';
import { Quiz, QuizQuestion } from '../../types/quiz';
import { saveQuizAttempt } from '../../utils/quizStatistics';

interface QuizRendererProps {
  quiz: Quiz;
  snippetId: string;
}

export function QuizRenderer({ quiz, snippetId }: QuizRendererProps) {
  const [currentQuestion, setCurrentQuestion] = useState(0);
  const [answers, setAnswers] = useState<number[]>(Array(quiz.questions.length).fill(-1));
  const [showResults, setShowResults] = useState(false);
  const [startTime] = useState(Date.now());
  
  const question = quiz.questions[currentQuestion];
  const answered = answers[currentQuestion] !== -1;
  const allAnswered = answers.every(a => a !== -1);
  
  const handleAnswer = (optionIndex: number) => {
    const newAnswers = [...answers];
    newAnswers[currentQuestion] = optionIndex;
    setAnswers(newAnswers);
  };
  
  const handleNext = () => {
    if (currentQuestion < quiz.questions.length - 1) {
      setCurrentQuestion(currentQuestion + 1);
    }
  };
  
  const handlePrevious = () => {
    if (currentQuestion > 0) {
      setCurrentQuestion(currentQuestion - 1);
    }
  };
  
  const handleSubmit = async () => {
    const correct = answers.filter((a, i) => a === quiz.questions[i].correctIndex).length;
    const score = Math.round((correct / quiz.questions.length) * 100);
    const duration = Date.now() - startTime;
    
    // Save attempt to IndexedDB
    await saveQuizAttempt({
      quizId: snippetId,
      quizTitle: quiz.title,
      answers,
      correctAnswers: quiz.questions.map(q => q.correctIndex),
      score,
      duration,
      completedAt: Date.now()
    });
    
    setShowResults(true);
  };
  
  const handleReset = () => {
    setAnswers(Array(quiz.questions.length).fill(-1));
    setCurrentQuestion(0);
    setShowResults(false);
  };
  
  const handleQuit = () => {
    if (confirm('Are you sure you want to quit? Your progress will be lost.')) {
      handleReset();
    }
  };
  
  if (showResults) {
    const correct = answers.filter((a, i) => a === quiz.questions[i].correctIndex).length;
    const score = Math.round((correct / quiz.questions.length) * 100);
    
    return (
      <div className="quiz-results p-6 bg-gray-50 dark:bg-gray-800 rounded-lg">
        <h3 className="text-2xl font-bold mb-4">Quiz Complete! 🎉</h3>
        <div className="text-4xl font-bold text-blue-600 dark:text-blue-400 mb-2">
          {score}%
        </div>
        <p className="text-gray-600 dark:text-gray-400 mb-6">
          You got {correct} out of {quiz.questions.length} questions correct
        </p>
        
        {/* Show which questions were correct/incorrect */}
        <div className="space-y-2 mb-6">
          {quiz.questions.map((q, i) => {
            const isCorrect = answers[i] === q.correctIndex;
            return (
              <div key={i} className="flex items-center gap-2">
                {isCorrect ? (
                  <span className="text-green-600">✅</span>
                ) : (
                  <span className="text-red-600">❌</span>
                )}
                <span className="text-sm">Q{i + 1}: {q.question.substring(0, 50)}...</span>
              </div>
            );
          })}
        </div>
        
        <div className="flex gap-3">
          <button
            onClick={handleReset}
            className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
          >
            🔄 Retake Quiz
          </button>
          <button
            onClick={() => window.history.back()}
            className="px-4 py-2 bg-gray-600 text-white rounded hover:bg-gray-700"
          >
            ← Back
          </button>
        </div>
      </div>
    );
  }
  
  return (
    <div className="quiz-container p-6 bg-white dark:bg-gray-900 rounded-lg shadow-lg">
      {/* Header */}
      <div className="flex justify-between items-center mb-4">
        <h3 className="text-xl font-bold">{quiz.title}</h3>
        <button
          onClick={handleQuit}
          className="text-sm text-gray-500 hover:text-gray-700 dark:hover:text-gray-300"
        >
          ❌ Quit
        </button>
      </div>
      
      {/* Progress */}
      <div className="mb-6">
        <div className="flex justify-between text-sm text-gray-600 dark:text-gray-400 mb-2">
          <span>Question {currentQuestion + 1} of {quiz.questions.length}</span>
          <span>{answers.filter(a => a !== -1).length} answered</span>
        </div>
        <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2">
          <div
            className="bg-blue-600 h-2 rounded-full transition-all"
            style={{ width: `${((currentQuestion + 1) / quiz.questions.length) * 100}%` }}
          />
        </div>
      </div>
      
      {/* Question Card */}
      <div className="question-card mb-6">
        <h4 className="text-lg font-semibold mb-4">
          {question.question}
        </h4>
        
        {/* Answer Options */}
        <div className="space-y-3">
          {question.options.map((option, i) => (
            <label
              key={i}
              className={`
                flex items-center p-4 border-2 rounded-lg cursor-pointer transition-all
                ${answers[currentQuestion] === i
                  ? 'border-blue-600 bg-blue-50 dark:bg-blue-900/20'
                  : 'border-gray-300 dark:border-gray-600 hover:border-blue-400'
                }
              `}
            >
              <input
                type="radio"
                name={`question-${currentQuestion}`}
                checked={answers[currentQuestion] === i}
                onChange={() => handleAnswer(i)}
                className="mr-3 w-5 h-5"
              />
              <span className="flex-1">{option}</span>
            </label>
          ))}
        </div>
      </div>
      
      {/* Navigation */}
      <div className="flex justify-between items-center">
        <button
          onClick={handlePrevious}
          disabled={currentQuestion === 0}
          className="px-4 py-2 bg-gray-200 dark:bg-gray-700 rounded disabled:opacity-50"
        >
          ← Previous
        </button>
        
        <div className="flex gap-2">
          {quiz.questions.map((_, i) => (
            <button
              key={i}
              onClick={() => setCurrentQuestion(i)}
              className={`
                w-8 h-8 rounded-full text-sm font-medium
                ${i === currentQuestion
                  ? 'bg-blue-600 text-white'
                  : answers[i] !== -1
                  ? 'bg-green-500 text-white'
                  : 'bg-gray-300 dark:bg-gray-600 text-gray-700 dark:text-gray-300'
                }
              `}
            >
              {i + 1}
            </button>
          ))}
        </div>
        
        {currentQuestion < quiz.questions.length - 1 ? (
          <button
            onClick={handleNext}
            className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
          >
            Next →
          </button>
        ) : (
          <button
            onClick={handleSubmit}
            disabled={!allAnswered}
            className="px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700 disabled:opacity-50"
          >
            Submit Quiz ✓
          </button>
        )}
      </div>
    </div>
  );
}
```

**Integration into MarkdownRenderer**:

**File**: `ui-new/src/components/MarkdownRenderer.tsx`

```typescript
import { QuizRenderer } from './quiz/QuizRenderer';
import { parseQuizMarkdown, isQuizContent } from '../utils/quizParser';

export function MarkdownRenderer({ content, snippetId, ... }: MarkdownRendererProps) {
  // Check if content is a quiz
  if (isQuizContent(content)) {
    const quiz = parseQuizMarkdown(content);
    if (quiz && quiz.isValid && snippetId) {
      return <QuizRenderer quiz={quiz} snippetId={snippetId} />;
    }
    // If quiz is invalid, fall through to regular markdown rendering
  }
  
  // ... existing markdown rendering code
}
```

**Testing**:
- Render quiz snippet in SwagPage
- Verify single-card UI displays
- Test answer selection
- Test navigation (prev/next, question dots)
- Test submit functionality
- Test reset/quit functionality
- Verify score calculation

---

### Phase 5: Quiz Statistics Storage (3 hours)

**IndexedDB Schema**:

**File**: `ui-new/src/db/quizStatsDB.ts`

```typescript
import { openDB, DBSchema, IDBPDatabase } from 'idb';

interface QuizAttempt {
  id?: number;
  quizId: string;
  quizTitle: string;
  answers: number[];
  correctAnswers: number[];
  score: number;
  duration: number; // milliseconds
  completedAt: number;
  synced: boolean;
}

interface QuizStatsDB extends DBSchema {
  'quiz-attempts': {
    key: number;
    value: QuizAttempt;
    indexes: {
      'by-quiz': string;
      'by-date': number;
      'by-synced': boolean;
    };
  };
}

let dbPromise: Promise<IDBPDatabase<QuizStatsDB>> | null = null;

export async function getQuizStatsDB() {
  if (!dbPromise) {
    dbPromise = openDB<QuizStatsDB>('quiz-statistics', 1, {
      upgrade(db) {
        const store = db.createObjectStore('quiz-attempts', {
          keyPath: 'id',
          autoIncrement: true
        });
        store.createIndex('by-quiz', 'quizId');
        store.createIndex('by-date', 'completedAt');
        store.createIndex('by-synced', 'synced');
      }
    });
  }
  return dbPromise;
}

export async function saveQuizAttempt(attempt: Omit<QuizAttempt, 'id' | 'synced'>) {
  const db = await getQuizStatsDB();
  const id = await db.add('quiz-attempts', {
    ...attempt,
    synced: false
  });
  
  // Trigger background sync
  syncQuizStatistics().catch(console.error);
  
  return id;
}

export async function getQuizAttempts(quizId?: string): Promise<QuizAttempt[]> {
  const db = await getQuizStatsDB();
  if (quizId) {
    return db.getAllFromIndex('quiz-attempts', 'by-quiz', quizId);
  }
  return db.getAll('quiz-attempts');
}

export async function getQuizStatistics() {
  const attempts = await getQuizAttempts();
  
  const totalQuizzes = new Set(attempts.map(a => a.quizId)).size;
  const totalAttempts = attempts.length;
  const completedQuizzes = attempts.filter(a => a.score === 100).length;
  const avgScore = attempts.length > 0
    ? attempts.reduce((sum, a) => sum + a.score, 0) / attempts.length
    : 0;
  
  return {
    totalQuizzes,
    totalAttempts,
    completedQuizzes,
    avgScore: Math.round(avgScore),
    recentAttempts: attempts
      .sort((a, b) => b.completedAt - a.completedAt)
      .slice(0, 10)
  };
}

export async function getUnsyncedAttempts(): Promise<QuizAttempt[]> {
  const db = await getQuizStatsDB();
  return db.getAllFromIndex('quiz-attempts', 'by-synced', false);
}

export async function markAttemptsSynced(ids: number[]) {
  const db = await getQuizStatsDB();
  const tx = db.transaction('quiz-attempts', 'readwrite');
  
  await Promise.all(
    ids.map(async (id) => {
      const attempt = await tx.store.get(id);
      if (attempt) {
        attempt.synced = true;
        await tx.store.put(attempt);
      }
    })
  );
  
  await tx.done;
}
```

**Google Sheets Sync**:

**File**: `ui-new/src/utils/quizSync.ts`

```typescript
import { getUnsyncedAttempts, markAttemptsSynced } from '../db/quizStatsDB';
import { useAuth } from '../contexts/AuthContext';

export async function syncQuizStatistics() {
  const unsynced = await getUnsyncedAttempts();
  
  if (unsynced.length === 0) {
    console.log('No unsynced quiz attempts');
    return;
  }
  
  try {
    // Get access token
    const token = await useAuth.getState().getAccessToken();
    
    // Format for Google Sheets
    const rows = unsynced.map(attempt => [
      attempt.quizId,
      attempt.quizTitle,
      attempt.score,
      attempt.duration,
      new Date(attempt.completedAt).toISOString(),
      attempt.answers.join(','),
      attempt.correctAnswers.join(',')
    ]);
    
    // Append to "Quiz Statistics" sheet
    const response = await fetch('/api/google-sheets/append', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({
        sheetName: 'Quiz Statistics',
        rows
      })
    });
    
    if (!response.ok) {
      throw new Error('Failed to sync quiz statistics');
    }
    
    // Mark as synced
    await markAttemptsSynced(unsynced.map(a => a.id!));
    
    console.log(`✅ Synced ${unsynced.length} quiz attempts to Google Sheets`);
    
  } catch (error) {
    console.error('Quiz sync error:', error);
    // Will retry on next attempt
  }
}

// Auto-sync every 5 minutes
setInterval(syncQuizStatistics, 5 * 60 * 1000);
```

**Testing**:
- Complete quiz, verify attempt saved to IndexedDB
- Check IndexedDB in browser dev tools
- Verify sync to Google Sheets
- Test statistics aggregation
- Test offline storage (disconnect network)

---

### Phase 6: Quiz Page Dashboard (4 hours)

**Implementation**:

**File**: `ui-new/src/components/quiz/QuizPage.tsx`

```typescript
import React, { useState, useEffect } from 'react';
import { useSwag } from '../../contexts/SwagContext';
import { getQuizStatistics, getQuizAttempts } from '../../db/quizStatsDB';
import { QuizStatsDashboard } from './QuizStatsDashboard';
import { QuizList } from './QuizList';

export function QuizPage() {
  const { snippets } = useSwag();
  const [statistics, setStatistics] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  
  // Get all quiz snippets
  const quizSnippets = snippets.filter(s => 
    s.tags?.includes('quiz') || s.sourceType === 'quiz'
  );
  
  useEffect(() => {
    loadStatistics();
  }, []);
  
  const loadStatistics = async () => {
    try {
      const stats = await getQuizStatistics();
      setStatistics(stats);
    } catch (error) {
      console.error('Failed to load quiz statistics:', error);
    } finally {
      setLoading(false);
    }
  };
  
  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="text-gray-600 dark:text-gray-400">Loading quiz data...</div>
      </div>
    );
  }
  
  return (
    <div className="quiz-page max-w-7xl mx-auto p-6">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-3xl font-bold mb-2">🎯 Quiz Center</h1>
        <p className="text-gray-600 dark:text-gray-400">
          Test your knowledge and track your progress
        </p>
      </div>
      
      {/* Statistics Dashboard */}
      <QuizStatsDashboard statistics={statistics} />
      
      {/* Quiz List */}
      <div className="mt-8">
        <h2 className="text-2xl font-bold mb-4">Available Quizzes</h2>
        {quizSnippets.length > 0 ? (
          <QuizList quizzes={quizSnippets} onRefresh={loadStatistics} />
        ) : (
          <div className="text-center py-12 bg-gray-50 dark:bg-gray-800 rounded-lg">
            <p className="text-gray-600 dark:text-gray-400 mb-4">
              No quizzes available yet
            </p>
            <button
              onClick={() => window.location.href = '/#/swag'}
              className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
            >
              Create Your First Quiz
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
```

**File**: `ui-new/src/components/quiz/QuizStatsDashboard.tsx`

```typescript
import React from 'react';

interface QuizStatsDashboardProps {
  statistics: {
    totalQuizzes: number;
    totalAttempts: number;
    completedQuizzes: number;
    avgScore: number;
    recentAttempts: any[];
  };
}

export function QuizStatsDashboard({ statistics }: QuizStatsDashboardProps) {
  if (!statistics) return null;
  
  return (
    <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
      {/* Total Quizzes */}
      <div className="stat-card p-4 bg-white dark:bg-gray-800 rounded-lg shadow">
        <div className="text-sm text-gray-600 dark:text-gray-400 mb-1">
          Total Quizzes
        </div>
        <div className="text-3xl font-bold text-blue-600 dark:text-blue-400">
          {statistics.totalQuizzes}
        </div>
      </div>
      
      {/* Total Attempts */}
      <div className="stat-card p-4 bg-white dark:bg-gray-800 rounded-lg shadow">
        <div className="text-sm text-gray-600 dark:text-gray-400 mb-1">
          Attempts
        </div>
        <div className="text-3xl font-bold text-purple-600 dark:text-purple-400">
          {statistics.totalAttempts}
        </div>
      </div>
      
      {/* Completed (100% score) */}
      <div className="stat-card p-4 bg-white dark:bg-gray-800 rounded-lg shadow">
        <div className="text-sm text-gray-600 dark:text-gray-400 mb-1">
          Perfect Scores
        </div>
        <div className="text-3xl font-bold text-green-600 dark:text-green-400">
          {statistics.completedQuizzes}
        </div>
      </div>
      
      {/* Average Score */}
      <div className="stat-card p-4 bg-white dark:bg-gray-800 rounded-lg shadow">
        <div className="text-sm text-gray-600 dark:text-gray-400 mb-1">
          Average Score
        </div>
        <div className="text-3xl font-bold text-orange-600 dark:text-orange-400">
          {statistics.avgScore}%
        </div>
      </div>
    </div>
  );
}
```

**File**: `ui-new/src/components/quiz/QuizList.tsx`

```typescript
import React from 'react';
import { ContentSnippet } from '../../types';
import { QuizCard } from './QuizCard';

interface QuizListProps {
  quizzes: ContentSnippet[];
  onRefresh: () => void;
}

export function QuizList({ quizzes, onRefresh }: QuizListProps) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
      {quizzes.map(quiz => (
        <QuizCard key={quiz.id} quiz={quiz} onComplete={onRefresh} />
      ))}
    </div>
  );
}
```

**File**: `ui-new/src/components/quiz/QuizCard.tsx`

```typescript
import React, { useState, useEffect } from 'react';
import { ContentSnippet } from '../../types';
import { getQuizAttempts } from '../../db/quizStatsDB';

interface QuizCardProps {
  quiz: ContentSnippet;
  onComplete: () => void;
}

export function QuizCard({ quiz, onComplete }: QuizCardProps) {
  const [attempts, setAttempts] = useState<any[]>([]);
  const [bestScore, setBestScore] = useState<number | null>(null);
  
  useEffect(() => {
    loadAttempts();
  }, [quiz.id]);
  
  const loadAttempts = async () => {
    const quizAttempts = await getQuizAttempts(quiz.id);
    setAttempts(quizAttempts);
    
    if (quizAttempts.length > 0) {
      const best = Math.max(...quizAttempts.map(a => a.score));
      setBestScore(best);
    }
  };
  
  const handleStart = () => {
    // Navigate to snippet viewer with quiz snippet
    window.location.href = `/#/snippet/${quiz.id}`;
  };
  
  return (
    <div className="quiz-card p-4 bg-white dark:bg-gray-800 rounded-lg shadow hover:shadow-lg transition">
      {/* Title */}
      <h3 className="text-lg font-bold mb-2">{quiz.title}</h3>
      
      {/* Stats */}
      <div className="flex gap-4 text-sm text-gray-600 dark:text-gray-400 mb-4">
        <span>📝 {attempts.length} attempt{attempts.length !== 1 ? 's' : ''}</span>
        {bestScore !== null && (
          <span className="font-semibold text-green-600 dark:text-green-400">
            🏆 {bestScore}%
          </span>
        )}
      </div>
      
      {/* Preview */}
      <p className="text-sm text-gray-600 dark:text-gray-400 mb-4 line-clamp-2">
        {quiz.content.split('\n').find(line => line.startsWith('## Q1:'))?.substring(7) || 'Quiz questions available'}
      </p>
      
      {/* Actions */}
      <div className="flex gap-2">
        <button
          onClick={handleStart}
          className="flex-1 px-3 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 text-sm"
        >
          {attempts.length > 0 ? '🔄 Retake' : '▶️ Start Quiz'}
        </button>
        {attempts.length > 0 && (
          <button
            onClick={() => {/* Show results modal */}}
            className="px-3 py-2 bg-gray-200 dark:bg-gray-700 rounded hover:bg-gray-300 dark:hover:bg-gray-600 text-sm"
          >
            📊 Results
          </button>
        )}
      </div>
    </div>
  );
}
```

**Route Setup**:

**File**: `ui-new/src/App.tsx`

```typescript
import { QuizPage } from './components/quiz/QuizPage';

// In routes
<Route path="/quiz" element={<QuizPage />} />
```

**Navigation Button**:

**File**: `ui-new/src/components/SwagPage.tsx`

Add button below Images Editor button:

```tsx
{/* Quiz Page Button (NEW) */}
<button
  onClick={() => navigate('/quiz')}
  className="px-4 py-2 bg-gradient-to-r from-orange-500 to-red-500 text-white rounded-lg shadow hover:shadow-lg transition flex items-center gap-2"
  title="Open Quiz Center"
>
  <span>🎯</span>
  <span>Quiz</span>
  {quizCount > 0 && (
    <span className="px-2 py-0.5 bg-white text-orange-600 rounded-full text-xs font-bold">
      {quizCount}
    </span>
  )}
</button>
```

**Testing**:
- Navigate to /quiz
- Verify statistics display correctly
- Verify quiz list shows all quiz snippets
- Test "Start Quiz" button
- Test "View Results" button
- Verify badge shows quiz count

---

### Phase 7: Integration & Polish (2 hours)

**Tasks**:
1. Add quiz icon/badge to snippet cards with 'quiz' tag
2. Implement keyboard shortcuts (arrow keys for navigation)
3. Add animations for quiz transitions
4. Add sound effects (optional)
5. Implement quiz sharing (generate shareable link)
6. Add quiz export (PDF/markdown)
7. Performance optimization
8. Accessibility improvements (ARIA labels, keyboard nav)

**Testing**:
- End-to-end workflow testing
- Mobile responsiveness
- Dark mode compatibility
- Performance profiling
- Cross-browser testing

---

## 5. Data Schema

### 5.1. Quiz Snippet Schema

```typescript
interface ContentSnippet {
  id: string;
  content: string;              // Quiz markdown
  title: string;                 // Quiz title
  sourceType: 'quiz';            // Identifier
  tags: string[];                // Always includes 'quiz'
  timestamp: number;
  updateDate: number;
  selected: boolean;
}
```

### 5.2. Quiz Markdown Schema

```markdown
# QUIZ: {title}

## Q{number}: {question}
- [ ] Option 1 (incorrect)
- [x] Option 2 (correct)
- [ ] Option 3 (incorrect)
- [ ] Option 4 (incorrect)

... (repeat for 10 questions)
```

### 5.3. Quiz Attempt Schema (IndexedDB)

```typescript
interface QuizAttempt {
  id?: number;                   // Auto-increment
  quizId: string;                // Reference to snippet ID
  quizTitle: string;             // Quiz title
  answers: number[];             // User's answer indices [0,2,1,...]
  correctAnswers: number[];      // Correct answer indices [1,2,0,...]
  score: number;                 // Percentage (0-100)
  duration: number;              // Time in milliseconds
  completedAt: number;           // Timestamp
  synced: boolean;               // Synced to Google Sheets
}
```

### 5.4. Google Sheets Schema

**Sheet Name**: "Quiz Statistics"

| Column | Type | Description |
|--------|------|-------------|
| Quiz ID | string | Snippet ID |
| Quiz Title | string | Quiz name |
| Score | number | Percentage (0-100) |
| Duration | number | Time in milliseconds |
| Completed At | datetime | ISO 8601 timestamp |
| Answers | string | Comma-separated indices |
| Correct Answers | string | Comma-separated indices |

---

## 6. Technical Details

### 6.1. Quiz Detection Algorithm

```typescript
function isQuizContent(content: string): boolean {
  // Must start with "# QUIZ:"
  if (!/^#\s*QUIZ:/im.test(content)) return false;
  
  // Must have exactly 10 questions
  const questions = content.match(/^##\s*Q\d+:/gm);
  if (!questions || questions.length !== 10) return false;
  
  // Each question must have options
  const optionBlocks = content.split(/^##\s*Q\d+:/m).slice(1);
  for (const block of optionBlocks) {
    const options = block.match(/^-\s*\[(x| )\]/gm);
    if (!options || options.length < 2) return false;
    
    // Must have exactly 1 correct answer
    const correct = block.match(/^-\s*\[x\]/gm);
    if (!correct || correct.length !== 1) return false;
  }
  
  return true;
}
```

### 6.2. Score Calculation

```typescript
function calculateScore(answers: number[], correctAnswers: number[]): number {
  const correct = answers.filter((a, i) => a === correctAnswers[i]).length;
  return Math.round((correct / correctAnswers.length) * 100);
}
```

### 6.3. Performance Considerations

**Optimization Strategies**:
1. **Lazy Loading**: Load quiz attempts only when needed
2. **Memoization**: Cache parsed quiz data
3. **Debouncing**: Debounce sync operations
4. **IndexedDB Indexing**: Use indexes for fast queries
5. **Batch Operations**: Batch Google Sheets syncs

**Memory Management**:
- Limit stored attempts per quiz (keep last 100)
- Auto-archive old attempts (>90 days) to compressed format
- Clear synced attempts after 30 days

### 6.4. Error Handling

**Quiz Generation Errors**:
- LLM API timeout → Retry with exponential backoff
- Invalid markdown → Show validation errors
- Network failure → Save draft locally

**Statistics Errors**:
- IndexedDB unavailable → Fallback to localStorage
- Google Sheets sync failure → Queue for retry
- Corrupt data → Skip and log error

---

## 7. Testing Strategy

### 7.1. Unit Tests

**Quiz Parser** (`quizParser.test.ts`):
```typescript
describe('parseQuizMarkdown', () => {
  it('should parse valid quiz markdown', () => {
    const markdown = `# QUIZ: Test\n\n## Q1: Question?\n- [ ] A\n- [x] B\n...`;
    const result = parseQuizMarkdown(markdown);
    expect(result).toBeDefined();
    expect(result.questions.length).toBe(10);
  });
  
  it('should reject invalid format', () => {
    const markdown = `# QUIZ: Test\n\n## Question?\n- A\n- B`;
    const result = parseQuizMarkdown(markdown);
    expect(result).toBeNull();
  });
});
```

**Statistics** (`quizStatistics.test.ts`):
```typescript
describe('Quiz Statistics', () => {
  it('should save quiz attempt to IndexedDB', async () => {
    const attempt = { /* ... */ };
    const id = await saveQuizAttempt(attempt);
    expect(id).toBeDefined();
  });
  
  it('should calculate correct average score', async () => {
    const stats = await getQuizStatistics();
    expect(stats.avgScore).toBe(75);
  });
});
```

### 7.2. Integration Tests

**Quiz Generation Flow**:
1. Select snippet
2. Trigger bulk operation
3. Verify LLM called with correct prompt
4. Verify quiz snippet created
5. Verify quiz tagged correctly

**Quiz Completion Flow**:
1. Render quiz
2. Answer all questions
3. Submit
4. Verify attempt saved to IndexedDB
5. Verify sync triggered
6. Verify Google Sheets updated

### 7.3. E2E Tests (Playwright)

```typescript
test('Quiz generation and completion', async ({ page }) => {
  // Login
  await page.goto('/');
  await page.click('button:has-text("Sign In")');
  
  // Create quiz
  await page.goto('/#/swag');
  await page.click('[data-testid="snippet-1"]');
  await page.selectOption('select', 'generate-quiz');
  await page.waitForSelector('.quiz-renderer');
  
  // Take quiz
  for (let i = 0; i < 10; i++) {
    await page.click(`input[name="question-${i}"][value="0"]`);
    if (i < 9) await page.click('button:has-text("Next")');
  }
  await page.click('button:has-text("Submit")');
  
  // Verify results
  await expect(page.locator('.quiz-results')).toBeVisible();
  await expect(page.locator('.quiz-results')).toContainText('%');
});
```

### 7.4. Manual Testing Checklist

- [ ] Generate quiz from 1 snippet
- [ ] Generate quiz from multiple snippets
- [ ] Verify quiz markdown format
- [ ] Render quiz in markdown viewer
- [ ] Answer questions and navigate
- [ ] Submit quiz and view results
- [ ] Retry quiz
- [ ] Quit quiz mid-way
- [ ] View quiz statistics page
- [ ] Verify Google Sheets sync
- [ ] Test offline mode
- [ ] Test dark mode
- [ ] Test mobile responsiveness
- [ ] Test keyboard navigation
- [ ] Test accessibility (screen reader)

---

## 8. Deployment Plan

### 8.1. Phase 1: Environment Fix (IMMEDIATE)

**Priority**: BLOCKER

```bash
# 1. Create ui-new/.env
cd ui-new
cat > .env << 'EOF'
VITE_GOOGLE_CLIENT_ID=548179877633-cfvhlc5roj9prus33jlarcm540i495qi.apps.googleusercontent.com
VITE_PAYPAL_CLIENT_ID=AU9cY15vsAcz4tWwm5U0O-nMBqYTP3cT0dOHTpHqPCCD1n9fwdcD-xNcuzMv_eP-UtaB3PFHTuHoXeCW
VITE_API_BASE=https://nrw7pperjjdswbmqgmigbwsbyi0rwdqf.lambda-url.us-east-1.on.aws
EOF

# 2. Fix local Lambda URL
# Edit ui-new/src/utils/api.ts
# Change: https://ai.syntithenai.com:3000 → http://localhost:3000

# 3. Test locally
npm run dev

# 4. Build and deploy
npm run build
cd ..
make deploy-ui
```

**Verification**:
- [ ] No console errors about missing env vars
- [ ] Local Lambda detection works
- [ ] Google OAuth works
- [ ] PayPal integration works

### 8.2. Phase 2: Quiz Feature (Incremental)

**Week 1**: Parser + Generator
- Implement quiz parser
- Implement quiz generator
- Add bulk operation
- Deploy and test

**Week 2**: Renderer + Storage
- Implement quiz renderer
- Implement IndexedDB storage
- Add Google Sheets sync
- Deploy and test

**Week 3**: Dashboard + Polish
- Implement quiz page
- Add statistics dashboard
- Polish UI/UX
- Deploy and test

**Week 4**: Testing + Documentation
- Comprehensive testing
- Fix bugs
- Write user documentation
- Final deployment

### 8.3. Rollback Plan

**If issues occur**:

1. **Disable quiz generation**:
   - Comment out bulk operation in `SwagPage.tsx`
   - Redeploy UI

2. **Disable quiz rendering**:
   - Comment out quiz detection in `MarkdownRenderer.tsx`
   - Existing quiz snippets render as markdown

3. **Disable sync**:
   - Comment out `syncQuizStatistics()` call
   - Statistics still stored locally

4. **Full rollback**:
   ```bash
   git revert HEAD
   make deploy-ui
   ```

### 8.4. Monitoring

**Metrics to Track**:
- Quiz generation success rate
- Quiz completion rate
- Average quiz score
- Sync failures
- User engagement (quizzes per user)

**Alerts**:
- Quiz generation failures > 5%
- Sync failures > 10%
- IndexedDB errors
- Google Sheets quota exceeded

---

## 9. Success Metrics

### 9.1. Technical Metrics

- [ ] Quiz generation success rate > 95%
- [ ] Quiz parsing accuracy = 100%
- [ ] Sync reliability > 99%
- [ ] Page load time < 2s
- [ ] Quiz render time < 500ms
- [ ] IndexedDB operations < 100ms

### 9.2. User Metrics

- [ ] Average quizzes created per user > 2
- [ ] Quiz completion rate > 70%
- [ ] Average score > 60%
- [ ] User retention (return to quiz) > 50%

### 9.3. Quality Metrics

- [ ] Zero breaking bugs in production
- [ ] Mobile responsiveness score > 90
- [ ] Accessibility score > 90
- [ ] Code coverage > 80%

---

## 10. Risk Analysis

### 10.1. Technical Risks

| Risk | Probability | Impact | Mitigation |
|------|-------------|--------|------------|
| LLM generates invalid quiz format | Medium | High | Strict validation + retry logic |
| IndexedDB not supported | Low | Medium | Fallback to localStorage |
| Google Sheets quota exceeded | Medium | Low | Batch operations + caching |
| Sync failures | Medium | Low | Retry queue + error handling |

### 10.2. UX Risks

| Risk | Probability | Impact | Mitigation |
|------|-------------|--------|------------|
| Quiz generation too slow | Medium | Medium | Show progress indicator |
| Confusing quiz UI | Low | High | User testing + iteration |
| Loss of quiz progress | Low | High | Auto-save every answer |

---

## 11. Future Enhancements

### 11.1. V2 Features

- **Quiz Templates**: Pre-defined question types
- **Difficulty Levels**: Easy, Medium, Hard
- **Time Limits**: Timed quizzes
- **Leaderboards**: Compete with other users
- **Quiz Sharing**: Public quiz links
- **Quiz Export**: PDF, printable format
- **Spaced Repetition**: Smart quiz scheduling
- **Adaptive Learning**: Adjust difficulty based on performance

### 11.2. V3 Features

- **Collaborative Quizzes**: Multi-player mode
- **Quiz Editor**: Manual question editing
- **Image Questions**: Include images in questions
- **Audio Questions**: Pronunciation quizzes
- **Fill-in-the-Blank**: Different question types
- **Essay Questions**: LLM-graded responses
- **Quiz Analytics**: Detailed performance insights
- **Gamification**: Badges, achievements, streaks

---

## 12. Documentation Requirements

### 12.1. User Documentation

**Help Article**: "Creating and Taking Quizzes"
- How to generate quizzes from snippets
- How to take a quiz
- Understanding quiz statistics
- Tips for better quizzes

**Video Tutorial**: 3-minute walkthrough

### 12.2. Developer Documentation

**Quiz Markdown Format Specification**
**IndexedDB Schema Documentation**
**Google Sheets Integration Guide**
**Testing Guide**

### 12.3. API Documentation

**Quiz Generator Endpoint** (if backend)
**Quiz Statistics Sync Endpoint**

---

## 13. Timeline Summary

| Phase | Duration | Deliverable |
|-------|----------|-------------|
| Phase 1: Env Config | 1 hour | Environment variables fixed |
| Phase 2: Parser | 2 hours | Quiz parser + tests |
| Phase 3: Generator | 3 hours | Bulk operation + LLM integration |
| Phase 4: Renderer | 4 hours | Interactive quiz UI |
| Phase 5: Storage | 3 hours | IndexedDB + Google Sheets sync |
| Phase 6: Dashboard | 4 hours | Quiz page + statistics |
| Phase 7: Polish | 2 hours | Final touches + testing |

**Total Estimated Time**: 19 hours (~2.5 days)

---

## 14. Conclusion

This plan provides a comprehensive roadmap for implementing quiz functionality in the LambdaLLMProxy UI. The implementation follows a phased approach, starting with fixing critical environment configuration issues, then building the quiz feature incrementally.

**Key Benefits**:
- ✅ Interactive learning experience
- ✅ Automatic quiz generation from content
- ✅ Progress tracking and statistics
- ✅ Cloud sync for data persistence
- ✅ Mobile-friendly design

**Next Steps**:
1. Review and approve this plan
2. Fix environment configuration (Phase 1)
3. Begin implementation starting with Phase 2

---

**Document Version**: 1.0  
**Last Updated**: 2025-10-27  
**Status**: Ready for Implementation
