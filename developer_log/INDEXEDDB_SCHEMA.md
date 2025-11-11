# IndexedDB Schema

**Date**: 2025-11-11  
**Status**: Planning Document  
**Scope**: Complete database schema, indexes, and TypeScript interfaces

---

## 1. Database Overview

**Database Name**: `UnifiedDB`  
**Version**: 1  
**Library**: Dexie.js (IndexedDB wrapper)

---

## 2. Schema Definition

```typescript
import Dexie, { Table } from 'dexie';

class UnifiedDB extends Dexie {
  // Synchronized tables
  settings!: Table<Settings>;
  snippets!: Table<Snippet>;
  ragData!: Table<RAGData>;
  quizzes!: Table<Quiz>;
  quizProgress!: Table<QuizProgress>;
  quizAnalytics!: Table<QuizAnalytics>;
  plans!: Table<Plan>;
  playlists!: Table<Playlist>;
  projects!: Table<Project>;
  chatHistory!: Table<ChatMessage>;
  images!: Table<ImageRecord>;
  
  // Local-only tables
  feedItems!: Table<FeedItem>;
  
  // UI State tables (user-scoped, not synced)
  uiState_recentTags!: Table<UIStateRecentTags>;
  uiState_lastActiveChat!: Table<UIStateLastActiveChat>;
  uiState_imageEditor!: Table<UIStateImageEditor>;
  uiState_scrollPosition!: Table<UIStateScrollPosition>;

  constructor() {
    super('UnifiedDB');
    
    this.version(1).stores({
      // Synchronized tables
      settings: 'userId',
      snippets: 'id, userId, createdAt, updatedAt, projectId, [userId+projectId]',
      ragData: 'id, userId, createdAt, updatedAt, [userId+createdAt]',
      quizzes: 'id, userId, createdAt, updatedAt, projectId, [userId+projectId]',
      quizProgress: 'id, userId, quizId, updatedAt, [userId+quizId]',
      quizAnalytics: 'id, userId, quizId, createdAt, [userId+quizId]',
      plans: 'id, userId, createdAt, updatedAt, projectId, status, [userId+projectId], [userId+status]',
      playlists: 'id, userId, createdAt, updatedAt, projectId, [userId+projectId]',
      projects: 'id, userId, createdAt, updatedAt, [userId+createdAt]',
      chatHistory: 'id, userId, createdAt, projectId, [userId+projectId], [userId+createdAt]',
      images: 'id, userId, createdAt, source, [userId+source]',
      
      // Local-only tables
      feedItems: 'id, userId, createdAt, updatedAt, projectId, [userId+createdAt]',
      
      // UI State tables
      uiState_recentTags: 'userId',
      uiState_lastActiveChat: 'userId',
      uiState_imageEditor: 'userId',
      uiState_scrollPosition: 'userId',
    });
  }
}

export const db = new UnifiedDB();
```

---

## 3. TypeScript Interfaces

### 3.1. Base Interfaces

```typescript
// All user records extend this
interface BaseUserRecord {
  id: string;           // UUID
  userId: string;       // User's email from Google OAuth
  createdAt: number;    // Unix timestamp (milliseconds)
  updatedAt: number;    // Unix timestamp (milliseconds)
}
```

### 3.2. Settings

```typescript
interface Settings {
  userId: string;       // PRIMARY KEY - user's email
  version: string;      // Settings schema version (e.g., "2.0.0")
  
  // App settings
  language: string;     // "en", "es", "fr", etc.
  theme: 'light' | 'dark' | 'auto';
  
  // Provider settings
  providers: ProviderConfig[];
  defaultProvider?: string;
  
  // Voice settings
  voice: VoiceSettings;
  
  // Proxy settings
  proxy: ProxySettings;
  
  // RAG settings
  rag?: RAGSettings;
  
  // Timestamps
  createdAt: number;
  updatedAt: number;
}

interface ProviderConfig {
  id: string;
  type: 'openai' | 'anthropic' | 'groq' | 'google' | 'cohere' | 'deepseek';
  apiKey: string;
  model?: string;
  priority?: number;
  enabled?: boolean;
}

interface VoiceSettings {
  hotword: string;              // "Hey Google", "Alexa", etc.
  sensitivity: number;          // 0.0 - 1.0
  speechTimeout: number;        // seconds (float)
  conversationTimeout: number;  // milliseconds (int)
  useLocalWhisper: boolean;     // Try local Whisper first?
  localWhisperUrl: string;      // Default: "http://localhost:8000"
}

interface ProxySettings {
  enabled: boolean;
  username: string;
  password: string;
  useServerProxy: boolean;  // Use server's proxy instead of user's
}

interface RAGSettings {
  enabled: boolean;
  topK: number;
  scoreThreshold: number;
  embeddingProvider?: string;
}
```

### 3.3. Snippets

```typescript
interface Snippet extends BaseUserRecord {
  content: string;
  tags: string[];
  type: 'text' | 'code' | 'markdown' | 'html';
  title?: string;
  projectId?: string;
  source?: string;      // URL or source identifier
  language?: string;    // For code snippets
  metadata?: Record<string, any>;
}
```

### 3.4. Feed Items

```typescript
interface FeedItem extends BaseUserRecord {
  title: string;
  content: string;
  url?: string;
  image?: string;           // Image URL or data URI
  imageSource?: string;     // 'generated' | 'scraped' | 'manual'
  projectId?: string;
  tags?: string[];
  score?: number;           // Relevance score
  source: string;           // 'search' | 'manual' | 'rss'
}
```

### 3.5. RAG Data

```typescript
interface RAGData extends BaseUserRecord {
  content: string;
  embedding: number[];      // Vector embedding
  metadata: {
    source?: string;        // URL or source identifier
    title?: string;
    tags?: string[];
    snippetId?: string;     // Link to original snippet
  };
}
```

### 3.6. Quizzes

```typescript
interface Quiz extends BaseUserRecord {
  title: string;
  description?: string;
  snippetIds: string[];     // Snippets this quiz covers
  questions: QuizQuestion[];
  projectId?: string;
  status: 'draft' | 'active' | 'archived';
  difficulty?: 'easy' | 'medium' | 'hard';
}

interface QuizQuestion {
  id: string;
  question: string;
  options: string[];
  correctAnswer: number;    // Index of correct option
  explanation?: string;
  tags?: string[];
}
```

### 3.7. Quiz Progress

```typescript
interface QuizProgress extends BaseUserRecord {
  quizId: string;           // Quiz being taken
  currentQuestionIndex: number;
  answers: QuizAnswer[];
  score: number;
  status: 'in-progress' | 'completed';
  startedAt: number;
  completedAt?: number;
}

interface QuizAnswer {
  questionId: string;
  selectedAnswer: number;
  isCorrect: boolean;
  timeSpent: number;        // milliseconds
}
```

### 3.8. Quiz Analytics

```typescript
interface QuizAnalytics extends BaseUserRecord {
  quizId: string;
  totalAttempts: number;
  averageScore: number;
  questionStats: QuestionStats[];
  lastAttempt: number;      // timestamp
}

interface QuestionStats {
  questionId: string;
  timesAsked: number;
  timesCorrect: number;
  averageTimeSpent: number;
}
```

### 3.9. Plans

```typescript
interface Plan extends BaseUserRecord {
  title: string;
  description: string;
  steps: PlanStep[];
  projectId?: string;
  status: 'active' | 'completed' | 'archived';
  tags?: string[];
  priority?: 'low' | 'medium' | 'high';
}

interface PlanStep {
  id: string;
  title: string;
  description?: string;
  status: 'pending' | 'in-progress' | 'completed';
  dueDate?: number;
  completedAt?: number;
  subtasks?: string[];
}
```

### 3.10. Playlists

```typescript
interface Playlist extends BaseUserRecord {
  title: string;
  description?: string;
  items: PlaylistItem[];
  projectId?: string;
  tags?: string[];
  isPublic?: boolean;
}

interface PlaylistItem {
  id: string;
  type: 'video' | 'audio' | 'document' | 'link';
  url: string;
  title: string;
  duration?: number;        // seconds
  completed?: boolean;
  notes?: string;
}
```

### 3.11. Projects

```typescript
interface Project extends BaseUserRecord {
  title: string;
  description?: string;
  color?: string;           // Hex color code
  icon?: string;            // Emoji or icon name
  tags?: string[];
  archived?: boolean;
}
```

### 3.12. Chat History

```typescript
interface ChatMessage extends BaseUserRecord {
  role: 'user' | 'assistant' | 'system';
  content: string;
  projectId?: string;
  conversationId?: string;  // Group messages into conversations
  metadata?: {
    model?: string;
    tokens?: number;
    duration?: number;
  };
}
```

### 3.13. Images

```typescript
interface ImageRecord extends BaseUserRecord {
  blob: Blob;               // Image data
  mimeType: string;         // 'image/jpeg', 'image/png', etc.
  size: number;             // bytes
  source: 'generated' | 'uploaded' | 'scraped';
  sourceUrl?: string;       // If scraped or downloaded
  width?: number;
  height?: number;
  metadata?: Record<string, any>;
}
```

### 3.14. UI State

```typescript
interface UIStateRecentTags {
  userId: string;           // PRIMARY KEY
  tags: string[];
  updatedAt: number;
}

interface UIStateLastActiveChat {
  userId: string;           // PRIMARY KEY
  conversationId: string;
  messageId?: string;
  scrollPosition?: number;
  updatedAt: number;
}

interface UIStateImageEditor {
  userId: string;           // PRIMARY KEY
  imageId?: string;
  tool?: string;
  history?: any[];          // Undo/redo stack
  updatedAt: number;
}

interface UIStateScrollPosition {
  userId: string;           // PRIMARY KEY
  positions: Record<string, number>;  // { 'page-key': scrollY }
  updatedAt: number;
}
```

---

## 4. Indexes Explained

### 4.1. Simple Indexes

**Purpose**: Fast queries on single field

```typescript
snippets: 'id, userId, createdAt, updatedAt, projectId'
```

- `id`: Primary key (unique)
- `userId`: Filter by user
- `createdAt`: Sort by creation date
- `updatedAt`: Sort by modification date
- `projectId`: Filter by project

### 4.2. Compound Indexes

**Purpose**: Fast queries on multiple fields

```typescript
snippets: '[userId+projectId]'
```

**Enables Efficient Query**:
```typescript
// Get all snippets for user in specific project
const snippets = await db.snippets
  .where('[userId+projectId]')
  .equals([user.email, projectId])
  .toArray();
```

**Other Compound Indexes**:
- `[userId+createdAt]`: User's items sorted by date
- `[userId+quizId]`: Quiz-specific user data
- `[userId+status]`: User's plans by status

### 4.3. Index Selection Strategy

**Include userId in All Queries**:
- Every compound index starts with `userId`
- Ensures user filtering is always efficient
- Prevents accidental cross-user data leaks

**Common Query Patterns**:
```typescript
// Pattern 1: All user's data
db.snippets.where('userId').equals(user.email).toArray()

// Pattern 2: User's data in project
db.snippets.where('[userId+projectId]').equals([user.email, projectId]).toArray()

// Pattern 3: User's data sorted by date
db.snippets.where('userId').equals(user.email).sortBy('createdAt')
```

---

## 5. Database Operations

### 5.1. Initialization

```typescript
// Initialize database
import { db } from './db';

// Check if database is ready
await db.open();
console.log('Database ready');

// Get database version
console.log('DB version:', db.verno);
```

### 5.2. CRUD Operations

**Create/Update (Put)**:
```typescript
const snippet: Snippet = {
  id: crypto.randomUUID(),
  userId: user.email,
  content: 'My note',
  tags: ['research', 'ai'],
  type: 'text',
  createdAt: Date.now(),
  updatedAt: Date.now(),
};

await db.snippets.put(snippet);
```

**Read (Get by ID)**:
```typescript
const snippet = await db.snippets.get('snippet-id');
```

**Read (Query by userId)**:
```typescript
const mySnippets = await db.snippets
  .where('userId')
  .equals(user.email)
  .toArray();
```

**Update**:
```typescript
await db.snippets.update('snippet-id', {
  content: 'Updated content',
  updatedAt: Date.now(),
});
```

**Delete**:
```typescript
await db.snippets.delete('snippet-id');
```

### 5.3. Batch Operations

**Bulk Insert**:
```typescript
const snippets: Snippet[] = [...];
await db.snippets.bulkPut(snippets);
```

**Bulk Delete**:
```typescript
const ids = ['id1', 'id2', 'id3'];
await db.snippets.bulkDelete(ids);
```

**Clear User's Data**:
```typescript
await db.snippets
  .where('userId')
  .equals(user.email)
  .delete();
```

### 5.4. Transactions

```typescript
await db.transaction('rw', [db.snippets, db.quizzes], async () => {
  // Create snippet
  const snippet = { ... };
  await db.snippets.put(snippet);
  
  // Create quiz referencing snippet
  const quiz = {
    ...
    snippetIds: [snippet.id],
  };
  await db.quizzes.put(quiz);
});
```

---

## 6. Data Cleanup Rules

### 6.1. Feed Items

**Rule**: Keep only most recent 100 items per user

```typescript
async function cleanupOldFeedItems(userId: string): Promise<void> {
  const items = await db.feedItems
    .where('userId')
    .equals(userId)
    .sortBy('createdAt');
  
  if (items.length > 100) {
    const toDelete = items.slice(0, items.length - 100);
    const ids = toDelete.map(item => item.id);
    await db.feedItems.bulkDelete(ids);
  }
}
```

### 6.2. Orphaned Images

**Rule**: Delete images not referenced by any content

```typescript
async function cleanupOrphanedImages(userId: string): Promise<void> {
  const images = await db.images
    .where('userId')
    .equals(userId)
    .toArray();
  
  for (const image of images) {
    const isReferenced = await isImageReferenced(image.id, userId);
    if (!isReferenced) {
      await db.images.delete(image.id);
    }
  }
}

async function isImageReferenced(imageId: string, userId: string): Promise<boolean> {
  // Check snippets
  const snippetsWithImage = await db.snippets
    .where('userId')
    .equals(userId)
    .filter(s => s.content.includes(imageId))
    .count();
  
  if (snippetsWithImage > 0) return true;
  
  // Check feed items
  const feedItemsWithImage = await db.feedItems
    .where('userId')
    .equals(userId)
    .filter(f => f.image?.includes(imageId))
    .count();
  
  return feedItemsWithImage > 0;
}
```

### 6.3. Old Chat History

**Rule**: Keep chat history for 30 days

```typescript
async function cleanupOldChatHistory(userId: string): Promise<void> {
  const thirtyDaysAgo = Date.now() - (30 * 24 * 60 * 60 * 1000);
  
  await db.chatHistory
    .where('[userId+createdAt]')
    .between([userId, 0], [userId, thirtyDaysAgo])
    .delete();
}
```

---

## 7. Database Versioning

### 7.1. Schema Migrations

When schema changes, increment version:

```typescript
class UnifiedDB extends Dexie {
  constructor() {
    super('UnifiedDB');
    
    // Version 1
    this.version(1).stores({
      snippets: 'id, userId, createdAt',
      // ...
    });
    
    // Version 2 - Add new index
    this.version(2).stores({
      snippets: 'id, userId, createdAt, projectId', // Added projectId index
      // ...
    });
    
    // Version 3 - Add new table
    this.version(3).stores({
      snippets: 'id, userId, createdAt, projectId',
      images: 'id, userId, createdAt, source',  // NEW TABLE
      // ...
    });
  }
}
```

### 7.2. Data Migrations

Transform existing data when schema changes:

```typescript
this.version(2)
  .stores({
    snippets: 'id, userId, createdAt, projectId',
  })
  .upgrade(async tx => {
    // Migrate existing snippets to add projectId
    const snippets = await tx.table('snippets').toArray();
    for (const snippet of snippets) {
      if (!snippet.projectId) {
        snippet.projectId = 'default-project';
        await tx.table('snippets').put(snippet);
      }
    }
  });
```

---

## 8. Performance Considerations

### 8.1. Index Usage

**Good**:
```typescript
// Uses userId index
await db.snippets.where('userId').equals(user.email).toArray();
```

**Bad**:
```typescript
// Full table scan (no index on 'tags')
await db.snippets.filter(s => s.tags.includes('ai')).toArray();
```

**Better**:
```typescript
// Add index for common filters
this.version(4).stores({
  snippets: 'id, userId, createdAt, projectId, *tags', // Multi-entry index on tags
});
```

### 8.2. Pagination

For large result sets, use pagination:

```typescript
const PAGE_SIZE = 50;

async function getSnippetsPage(userId: string, page: number): Promise<Snippet[]> {
  return await db.snippets
    .where('userId')
    .equals(userId)
    .offset(page * PAGE_SIZE)
    .limit(PAGE_SIZE)
    .toArray();
}
```

### 8.3. Count Without Loading

```typescript
// Efficient
const count = await db.snippets.where('userId').equals(user.email).count();

// Inefficient
const count = (await db.snippets.where('userId').equals(user.email).toArray()).length;
```

---

## 9. Testing

### 9.1. Test Database

Use separate database for tests:

```typescript
class TestDB extends Dexie {
  constructor() {
    super('TestDB'); // Different name
    // Same schema as UnifiedDB
  }
}

beforeEach(async () => {
  const testDb = new TestDB();
  await testDb.delete(); // Clear before each test
  await testDb.open();
});
```

### 9.2. Mock Data

```typescript
const mockUser = { email: 'test@example.com' };

const mockSnippet: Snippet = {
  id: 'test-snippet-1',
  userId: mockUser.email,
  content: 'Test content',
  tags: ['test'],
  type: 'text',
  createdAt: Date.now(),
  updatedAt: Date.now(),
};

await db.snippets.put(mockSnippet);
```

---

## Next Steps

1. **Review**: `GOOGLE_SYNC_STRATEGY.md` - Cloud sync implementation
2. **Review**: `SETTINGS_PERSISTENCE.md` - Unified settings structure
3. **Review**: `LOCALSTORAGE_MIGRATION.md` - Migrating from localStorage
4. **Implement**: Create `ui-new/src/services/db.ts` with this schema
