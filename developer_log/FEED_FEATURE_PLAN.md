# Feed Feature - Implementation Plan

**Created**: October 28, 2025  
**Status**: Planning  
**Priority**: Medium  

## Overview

A personalized "Did You Know" feed that generates interesting facts, questions, and answers using LLM analysis of the user's Swag content combined with web search results. Features infinite scroll, interactive quizzes, and swipe gestures for content management.

---

## Feature Requirements

### Core Functionality

1. **Feed Page**
   - New route: `/feed`
   - Navigation button next to Swag button (same visibility rules)
   - Scrollable feed of generated content items
   - Infinite scroll (10 items at a time)
   - Loading indicator when generating more items

2. **Feed Items**
   - **Content Types**:
     - "Did You Know" facts
     - Question & Answer format
     - Informative summaries
   - **Components**:
     - Title/headline
     - Summary text
     - Image (from web search or proxy)
     - Metadata (timestamp, source hints)
   - **Actions**:
     - Stash to Swag button
     - Generate Quiz button (10 questions)
     - Swipe gestures (left = trash, right = stash)

3. **Content Generation**
   - **Input Sources**:
     - User's Swag snippets content
     - Web search results (configurable search terms)
     - User preferences (liked/disliked topics)
   - **LLM Processing**:
     - Analyze Swag content for topics of interest
     - Combine with search results
     - Generate engaging facts/Q&A
     - Create search terms for images
   - **Image Handling**:
     - Extract images from web search results
     - Fallback: Generate image search terms from fact
     - Download via proxy and convert to base64
     - Cache to avoid re-downloads

4. **Interactive Quiz**
   - Triggered by "Quiz" button on feed item
   - Search for more information about the topic
   - Generate 10 question multiple-choice quiz
   - Replace card content with quiz UI
   - Track answers and show score
   - Return to feed item after completion/cancel

5. **Settings Integration**
   - New "Feed" tab in Settings
   - **Search Terms Management**:
     - List of search terms to inject into feed
     - Add/remove terms
     - Default: "latest world news"
     - If empty: Skip web search, use only Swag content
   - **Preferences** (tracked from swipe gestures):
     - Topics user likes (stashed)
     - Topics user dislikes (trashed)
     - Use for future content filtering

6. **Swipe Gestures**
   - **Swipe Right**: Stash to Swag + mark topic as liked
   - **Swipe Left**: Trash + mark topic as disliked
   - Visual feedback during swipe
   - Undo option (brief toast with undo button)

---

## Architecture

### File Structure

```
ui-new/src/
├── components/
│   ├── FeedPage.tsx                    (NEW - Main feed page)
│   ├── FeedItem.tsx                    (NEW - Single feed item card)
│   ├── FeedQuiz.tsx                    (NEW - Quiz overlay for feed items)
│   ├── FeedSettings.tsx                (NEW - Settings tab for feed)
│   ├── GitHubLink.tsx                  (MODIFY - Add Feed button)
│   └── SettingsDialog.tsx              (MODIFY - Add Feed tab)
├── contexts/
│   └── FeedContext.tsx                 (NEW - Feed state management)
├── db/
│   └── feedDb.ts                       (NEW - IndexedDB for feed items & preferences)
├── services/
│   ├── feedGenerator.ts                (NEW - LLM feed generation logic)
│   └── imageProxy.ts                   (NEW - Image download & base64 conversion)
├── hooks/
│   ├── useFeedItems.ts                 (NEW - Feed data fetching)
│   ├── useFeedPreferences.ts           (NEW - User preferences management)
│   └── useSwipeGesture.ts              (NEW - Swipe gesture detection)
└── types/
    └── feed.ts                         (NEW - TypeScript interfaces)

src/endpoints/
└── feed.js                             (NEW - Backend feed generation endpoint)
```

### Data Models

#### FeedItem
```typescript
interface FeedItem {
  id: string;                    // UUID
  type: 'did-you-know' | 'qa';   // Content type
  title: string;                 // Headline
  content: string;               // Main text/summary
  image?: string;                // Base64 image data
  imageSource?: string;          // Image source URL/attribution
  topics: string[];              // Extracted topics/tags
  sources: string[];             // Source URLs from search
  createdAt: string;             // ISO timestamp
  viewed: boolean;               // User has seen it
  stashed: boolean;              // Stashed to Swag
  trashed: boolean;              // User dismissed
}
```

#### FeedPreferences
```typescript
interface FeedPreferences {
  searchTerms: string[];         // Search queries for content
  likedTopics: string[];         // Topics from stashed items
  dislikedTopics: string[];      // Topics from trashed items
  lastGenerated: string;         // Last generation timestamp
}
```

#### FeedQuiz
```typescript
interface FeedQuiz {
  itemId: string;                // Related feed item
  title: string;                 // Quiz title
  questions: QuizQuestion[];     // 10 questions
  sources: string[];             // Research sources
  generatedAt: string;           // ISO timestamp
}

interface QuizQuestion {
  id: string;
  prompt: string;
  choices: QuizChoice[];
  correctChoiceId: string;
  explanation: string;
}

interface QuizChoice {
  id: string;
  text: string;
}
```

---

## Implementation Tasks

### Phase 1: Backend Infrastructure (6 hours)

#### Task 1.1: Feed Generation Endpoint
**File**: `src/endpoints/feed.js`

**Functionality**:
- POST `/feed/generate` - Generate feed items
- Input: 
  - `swagContent`: Array of snippet texts
  - `searchTerms`: Array of search queries
  - `count`: Number of items to generate (default: 10)
  - `preferences`: User preferences (liked/disliked topics)
- Output (SSE stream):
  - `status`: Progress updates
  - `search_result`: Web search results
  - `item_generated`: Individual feed item
  - `complete`: Generation complete

**LLM Prompt Strategy**:
```javascript
const systemPrompt = `You are a content curator generating interesting "Did You Know" facts and Q&A items.

INPUT CONTEXT:
- User's saved content (Swag): ${swagSummary}
- Recent news/searches: ${searchSummary}
- Liked topics: ${likedTopics}
- Disliked topics: ${dislikedTopics}

TASK: Generate ${count} engaging items mixing:
1. "Did You Know" facts (70%)
2. Question & Answer pairs (30%)

REQUIREMENTS:
- Each item should be surprising, educational, or thought-provoking
- Connect to user's interests when possible
- Avoid topics user has disliked
- Include specific topics/keywords for image search
- Cite sources when using search data

OUTPUT FORMAT (JSON):
{
  "items": [
    {
      "type": "did-you-know",
      "title": "Brief headline",
      "content": "Engaging 2-3 sentence summary",
      "topics": ["topic1", "topic2"],
      "imageSearchTerms": "specific search query for image",
      "sources": ["url1", "url2"]
    }
  ]
}`;
```

**Integration**:
- Use `llmResponsesWithTools` for generation
- Use `performDuckDuckGoSearch` for web searches
- Image search via DuckDuckGo image search
- Download images via `/scrape` endpoint (proxy)
- Convert to base64 for storage

**Registration**:
```javascript
// In src/index.js
if (method === 'POST' && path === '/feed/generate') {
  console.log('Routing to feed generation endpoint');
  const response = await feedEndpoint.handler(event);
  // Handle SSE streaming response
}
```

#### Task 1.2: Image Proxy Enhancement
**File**: `src/endpoints/scrape.js` (MODIFY)

**Add Image Download Mode**:
- Accept `mode=image` query parameter
- Download image from URL
- Convert to base64
- Return: `{ success: true, base64: "data:image/jpeg;base64,...", contentType: "image/jpeg" }`
- Cache results to avoid re-downloads

---

### Phase 2: Database Layer (4 hours)

#### Task 2.1: Feed Database
**File**: `ui-new/src/db/feedDb.ts`

**Schema**:
```typescript
// IndexedDB Database: 'feed_data', version 1
// Stores: 'items', 'preferences', 'quizzes'

class FeedDatabase {
  private db: IDBDatabase | null = null;
  
  async init(): Promise<void> {
    const request = indexedDB.open('feed_data', 1);
    
    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;
      
      // Feed items store
      if (!db.objectStoreNames.contains('items')) {
        const itemStore = db.createObjectStore('items', { keyPath: 'id' });
        itemStore.createIndex('createdAt', 'createdAt');
        itemStore.createIndex('viewed', 'viewed');
        itemStore.createIndex('stashed', 'stashed');
        itemStore.createIndex('trashed', 'trashed');
        itemStore.createIndex('topics', 'topics', { multiEntry: true });
      }
      
      // Preferences store (single record)
      if (!db.objectStoreNames.contains('preferences')) {
        db.createObjectStore('preferences', { keyPath: 'id' });
      }
      
      // Quizzes store
      if (!db.objectStoreNames.contains('quizzes')) {
        const quizStore = db.createObjectStore('quizzes', { keyPath: 'itemId' });
        quizStore.createIndex('generatedAt', 'generatedAt');
      }
    };
  }
  
  // CRUD operations for items
  async saveItems(items: FeedItem[]): Promise<void>
  async getItems(limit: number, offset: number): Promise<FeedItem[]>
  async getItemById(id: string): Promise<FeedItem | null>
  async updateItem(id: string, updates: Partial<FeedItem>): Promise<void>
  async deleteItem(id: string): Promise<void>
  async clearTrashed(): Promise<void>
  
  // Preferences
  async getPreferences(): Promise<FeedPreferences>
  async updatePreferences(prefs: Partial<FeedPreferences>): Promise<void>
  async addLikedTopic(topic: string): Promise<void>
  async addDislikedTopic(topic: string): Promise<void>
  
  // Quizzes
  async saveQuiz(quiz: FeedQuiz): Promise<void>
  async getQuiz(itemId: string): Promise<FeedQuiz | null>
  async deleteQuiz(itemId: string): Promise<void>
}

export const feedDB = new FeedDatabase();
```

**Default Preferences**:
```typescript
const defaultPreferences: FeedPreferences = {
  searchTerms: ['latest world news'],
  likedTopics: [],
  dislikedTopics: [],
  lastGenerated: new Date().toISOString()
};
```

---

### Phase 3: Frontend Components (12 hours)

#### Task 3.1: Feed Context
**File**: `ui-new/src/contexts/FeedContext.tsx`

**State Management**:
```typescript
interface FeedContextType {
  items: FeedItem[];
  preferences: FeedPreferences;
  loading: boolean;
  hasMore: boolean;
  
  // Actions
  loadMore: () => Promise<void>;
  refresh: () => Promise<void>;
  stashItem: (itemId: string) => Promise<void>;
  trashItem: (itemId: string) => Promise<void>;
  updatePreferences: (prefs: Partial<FeedPreferences>) => Promise<void>;
}

export const FeedProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [items, setItems] = useState<FeedItem[]>([]);
  const [preferences, setPreferences] = useState<FeedPreferences>(defaultPreferences);
  const [loading, setLoading] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [offset, setOffset] = useState(0);
  
  const { getToken } = useAuth();
  const { snippets } = useSwag(); // Access Swag content
  
  const loadMore = async () => {
    if (loading || !hasMore) return;
    
    setLoading(true);
    try {
      // Load from IndexedDB first
      const cachedItems = await feedDB.getItems(10, offset);
      
      if (cachedItems.length > 0) {
        setItems(prev => [...prev, ...cachedItems]);
        setOffset(prev => prev + cachedItems.length);
      } else {
        // Generate new items
        const token = await getToken();
        const swagContent = snippets.map(s => s.content).slice(0, 20); // Limit context
        
        const newItems = await generateFeedItems(
          swagContent,
          preferences.searchTerms,
          10,
          preferences,
          token
        );
        
        // Save to IndexedDB
        await feedDB.saveItems(newItems);
        
        setItems(prev => [...prev, ...newItems]);
        setOffset(prev => prev + newItems.length);
        
        if (newItems.length < 10) {
          setHasMore(false);
        }
      }
    } catch (error) {
      console.error('Failed to load feed items:', error);
      showError('Failed to load feed items');
    } finally {
      setLoading(false);
    }
  };
  
  const stashItem = async (itemId: string) => {
    const item = items.find(i => i.id === itemId);
    if (!item) return;
    
    // Add to Swag
    await swagDB.addSnippet({
      content: item.content,
      title: item.title,
      tags: item.topics,
      source: 'feed'
    });
    
    // Update item
    await feedDB.updateItem(itemId, { stashed: true });
    
    // Add topics to liked
    for (const topic of item.topics) {
      await feedDB.addLikedTopic(topic);
    }
    
    // Update UI
    setItems(prev => prev.map(i => 
      i.id === itemId ? { ...i, stashed: true } : i
    ));
    
    showSuccess('Stashed to Swag!');
  };
  
  const trashItem = async (itemId: string) => {
    const item = items.find(i => i.id === itemId);
    if (!item) return;
    
    // Update item
    await feedDB.updateItem(itemId, { trashed: true });
    
    // Add topics to disliked
    for (const topic of item.topics) {
      await feedDB.addDislikedTopic(topic);
    }
    
    // Remove from UI
    setItems(prev => prev.filter(i => i.id !== itemId));
    
    showSuccess('Item removed', {
      action: {
        label: 'Undo',
        onClick: async () => {
          await feedDB.updateItem(itemId, { trashed: false });
          // Reload items
          await refresh();
        }
      }
    });
  };
  
  // ... other methods
};
```

#### Task 3.2: Feed Page
**File**: `ui-new/src/components/FeedPage.tsx`

**Layout**:
```tsx
export const FeedPage: React.FC = () => {
  const { items, loading, hasMore, loadMore, stashItem, trashItem } = useFeed();
  const scrollRef = useRef<HTMLDivElement>(null);
  const [activeQuiz, setActiveQuiz] = useState<string | null>(null);
  
  // Infinite scroll detection
  const handleScroll = useCallback(() => {
    if (!scrollRef.current || loading || !hasMore) return;
    
    const { scrollTop, scrollHeight, clientHeight } = scrollRef.current;
    const scrollPercentage = (scrollTop + clientHeight) / scrollHeight;
    
    if (scrollPercentage > 0.8) {
      loadMore();
    }
  }, [loading, hasMore, loadMore]);
  
  useEffect(() => {
    const ref = scrollRef.current;
    if (!ref) return;
    
    ref.addEventListener('scroll', handleScroll);
    return () => ref.removeEventListener('scroll', handleScroll);
  }, [handleScroll]);
  
  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      {/* Header */}
      <div className="sticky top-0 z-10 bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700">
        <div className="max-w-4xl mx-auto px-4 py-4">
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
            Feed
          </h1>
          <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
            Personalized insights from your content and the world
          </p>
        </div>
      </div>
      
      {/* Feed Content */}
      <div 
        ref={scrollRef}
        className="max-w-4xl mx-auto px-4 py-6 overflow-y-auto"
        style={{ maxHeight: 'calc(100vh - 120px)' }}
      >
        {items.length === 0 && !loading ? (
          <div className="text-center py-12">
            <div className="text-gray-400 dark:text-gray-600 mb-4">
              <svg className="w-16 h-16 mx-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
            </div>
            <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-2">
              No feed items yet
            </h3>
            <p className="text-gray-600 dark:text-gray-400 mb-4">
              Add some content to your Swag to get started
            </p>
            <button
              onClick={loadMore}
              className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700"
            >
              Generate Feed
            </button>
          </div>
        ) : (
          <>
            {items.map((item) => (
              <FeedItem
                key={item.id}
                item={item}
                onStash={() => stashItem(item.id)}
                onTrash={() => trashItem(item.id)}
                onQuiz={() => setActiveQuiz(item.id)}
                showQuiz={activeQuiz === item.id}
                onQuizClose={() => setActiveQuiz(null)}
              />
            ))}
            
            {loading && (
              <div className="text-center py-8">
                <div className="inline-block animate-spin rounded-full h-8 w-8 border-4 border-indigo-600 border-t-transparent"></div>
                <p className="mt-2 text-gray-600 dark:text-gray-400">
                  Generating more insights...
                </p>
              </div>
            )}
            
            {!hasMore && items.length > 0 && (
              <div className="text-center py-8 text-gray-500 dark:text-gray-400">
                No more items to load
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
};
```

#### Task 3.3: Feed Item Card
**File**: `ui-new/src/components/FeedItem.tsx`

**Features**:
- Swipe gesture detection
- Image display
- Action buttons
- Quiz overlay

```tsx
interface FeedItemProps {
  item: FeedItem;
  onStash: () => void;
  onTrash: () => void;
  onQuiz: () => void;
  showQuiz: boolean;
  onQuizClose: () => void;
}

export const FeedItem: React.FC<FeedItemProps> = ({
  item,
  onStash,
  onTrash,
  onQuiz,
  showQuiz,
  onQuizClose
}) => {
  const { swipeProps, swipeDirection, swipeProgress } = useSwipeGesture({
    onSwipeLeft: onTrash,
    onSwipeRight: onStash,
    threshold: 100 // pixels
  });
  
  const getSwipeStyles = () => {
    if (swipeDirection === 'left') {
      return {
        transform: `translateX(${-swipeProgress}px)`,
        backgroundColor: `rgba(239, 68, 68, ${swipeProgress / 200})` // red
      };
    } else if (swipeDirection === 'right') {
      return {
        transform: `translateX(${swipeProgress}px)`,
        backgroundColor: `rgba(34, 197, 94, ${swipeProgress / 200})` // green
      };
    }
    return {};
  };
  
  if (showQuiz) {
    return (
      <div className="mb-6 bg-white dark:bg-gray-800 rounded-lg shadow-lg overflow-hidden">
        <FeedQuiz itemId={item.id} onClose={onQuizClose} />
      </div>
    );
  }
  
  return (
    <div
      {...swipeProps}
      className="mb-6 bg-white dark:bg-gray-800 rounded-lg shadow-lg overflow-hidden transition-all"
      style={getSwipeStyles()}
    >
      {/* Swipe indicators */}
      {swipeDirection === 'left' && (
        <div className="absolute right-4 top-1/2 -translate-y-1/2 text-white">
          <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
          </svg>
        </div>
      )}
      {swipeDirection === 'right' && (
        <div className="absolute left-4 top-1/2 -translate-y-1/2 text-white">
          <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z" />
          </svg>
        </div>
      )}
      
      {/* Image */}
      {item.image && (
        <img
          src={item.image}
          alt={item.title}
          className="w-full h-48 object-cover"
        />
      )}
      
      {/* Content */}
      <div className="p-6">
        {/* Type badge */}
        <div className="flex items-center gap-2 mb-3">
          <span className={`px-2 py-1 text-xs font-medium rounded ${
            item.type === 'did-you-know' 
              ? 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200'
              : 'bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200'
          }`}>
            {item.type === 'did-you-know' ? '💡 Did You Know' : '❓ Q&A'}
          </span>
          <span className="text-xs text-gray-500 dark:text-gray-400">
            {new Date(item.createdAt).toLocaleDateString()}
          </span>
        </div>
        
        {/* Title */}
        <h3 className="text-lg font-bold text-gray-900 dark:text-white mb-2">
          {item.title}
        </h3>
        
        {/* Content */}
        <p className="text-gray-700 dark:text-gray-300 mb-4 leading-relaxed">
          {item.content}
        </p>
        
        {/* Topics */}
        {item.topics.length > 0 && (
          <div className="flex flex-wrap gap-2 mb-4">
            {item.topics.map((topic, idx) => (
              <span
                key={idx}
                className="px-2 py-1 text-xs bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded"
              >
                #{topic}
              </span>
            ))}
          </div>
        )}
        
        {/* Actions */}
        <div className="flex gap-2">
          <button
            onClick={onStash}
            disabled={item.stashed}
            className={`flex-1 px-4 py-2 rounded-lg font-medium transition-colors ${
              item.stashed
                ? 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200 cursor-not-allowed'
                : 'bg-green-600 text-white hover:bg-green-700'
            }`}
          >
            {item.stashed ? '✓ Stashed' : 'Stash to Swag'}
          </button>
          
          <button
            onClick={onQuiz}
            className="flex-1 px-4 py-2 bg-indigo-600 text-white rounded-lg font-medium hover:bg-indigo-700 transition-colors"
          >
            📝 Take Quiz
          </button>
          
          <button
            onClick={onTrash}
            className="px-4 py-2 bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-300 dark:hover:bg-gray-600 transition-colors"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
            </svg>
          </button>
        </div>
      </div>
    </div>
  );
};
```

#### Task 3.4: Feed Quiz Component
**File**: `ui-new/src/components/FeedQuiz.tsx`

**Features**:
- Generate quiz from feed item
- Interactive quiz UI (reuse QuizCard logic)
- Return to feed item after completion

```tsx
interface FeedQuizProps {
  itemId: string;
  onClose: () => void;
}

export const FeedQuiz: React.FC<FeedQuizProps> = ({ itemId, onClose }) => {
  const [quiz, setQuiz] = useState<FeedQuiz | null>(null);
  const [loading, setLoading] = useState(true);
  const [currentQuestion, setCurrentQuestion] = useState(0);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [showResults, setShowResults] = useState(false);
  
  const { getToken } = useAuth();
  const { settings } = useSettings();
  
  useEffect(() => {
    loadOrGenerateQuiz();
  }, [itemId]);
  
  const loadOrGenerateQuiz = async () => {
    setLoading(true);
    try {
      // Check cache first
      let cachedQuiz = await feedDB.getQuiz(itemId);
      
      if (!cachedQuiz) {
        // Generate new quiz
        const item = await feedDB.getItemById(itemId);
        if (!item) return;
        
        const token = await getToken();
        cachedQuiz = await generateFeedQuiz(item, token, settings.enabledProviders);
        
        // Save to cache
        await feedDB.saveQuiz(cachedQuiz);
      }
      
      setQuiz(cachedQuiz);
    } catch (error) {
      console.error('Failed to generate quiz:', error);
      showError('Failed to generate quiz');
    } finally {
      setLoading(false);
    }
  };
  
  // ... quiz interaction logic (similar to QuizCard)
  
  return (
    <div className="p-6">
      {loading ? (
        <div className="text-center py-8">
          <div className="inline-block animate-spin rounded-full h-8 w-8 border-4 border-indigo-600 border-t-transparent"></div>
          <p className="mt-2 text-gray-600 dark:text-gray-400">
            Generating quiz questions...
          </p>
        </div>
      ) : quiz ? (
        <>
          {/* Quiz UI - reuse QuizCard component */}
          <QuizCard
            quiz={quiz}
            onClose={onClose}
            onComplete={(score, total) => {
              showSuccess(`Quiz completed! Score: ${score}/${total}`);
              onClose();
            }}
          />
        </>
      ) : (
        <div className="text-center py-8">
          <p className="text-gray-600 dark:text-gray-400">
            Failed to load quiz
          </p>
          <button
            onClick={onClose}
            className="mt-4 px-4 py-2 bg-gray-200 dark:bg-gray-700 rounded-lg"
          >
            Close
          </button>
        </div>
      )}
    </div>
  );
};
```

#### Task 3.5: Feed Settings
**File**: `ui-new/src/components/FeedSettings.tsx`

**UI**:
```tsx
export const FeedSettings: React.FC = () => {
  const { preferences, updatePreferences } = useFeed();
  const [searchTerms, setSearchTerms] = useState<string[]>(preferences.searchTerms);
  const [newTerm, setNewTerm] = useState('');
  
  const handleAddTerm = () => {
    if (!newTerm.trim()) return;
    const updated = [...searchTerms, newTerm.trim()];
    setSearchTerms(updated);
    setNewTerm('');
  };
  
  const handleRemoveTerm = (index: number) => {
    const updated = searchTerms.filter((_, i) => i !== index);
    setSearchTerms(updated);
  };
  
  const handleSave = async () => {
    await updatePreferences({ searchTerms });
    showSuccess('Feed settings saved');
  };
  
  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-4">
          Feed Settings
        </h3>
        <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
          Configure search terms to inject into your feed content. Leave empty to use only your Swag content.
        </p>
      </div>
      
      {/* Search Terms */}
      <div>
        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
          Search Terms
        </label>
        
        {/* Add new term */}
        <div className="flex gap-2 mb-3">
          <input
            type="text"
            value={newTerm}
            onChange={(e) => setNewTerm(e.target.value)}
            onKeyPress={(e) => e.key === 'Enter' && handleAddTerm()}
            placeholder="e.g., latest world news, technology trends"
            className="flex-1 px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
          />
          <button
            onClick={handleAddTerm}
            className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700"
          >
            Add
          </button>
        </div>
        
        {/* Search terms list */}
        {searchTerms.length === 0 ? (
          <div className="text-center py-6 bg-gray-50 dark:bg-gray-800 rounded-lg border-2 border-dashed border-gray-300 dark:border-gray-600">
            <p className="text-gray-500 dark:text-gray-400">
              No search terms configured. Feed will use only your Swag content.
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            {searchTerms.map((term, idx) => (
              <div
                key={idx}
                className="flex items-center justify-between px-4 py-3 bg-gray-50 dark:bg-gray-800 rounded-lg"
              >
                <span className="text-gray-900 dark:text-white">{term}</span>
                <button
                  onClick={() => handleRemoveTerm(idx)}
                  className="text-red-600 hover:text-red-700 dark:text-red-400 dark:hover:text-red-300"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
      
      {/* Preferences Summary */}
      <div className="pt-4 border-t border-gray-200 dark:border-gray-700">
        <h4 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
          Learned Preferences
        </h4>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <p className="text-xs text-gray-500 dark:text-gray-400 mb-1">Liked Topics</p>
            <div className="flex flex-wrap gap-1">
              {preferences.likedTopics.slice(0, 5).map((topic, idx) => (
                <span key={idx} className="px-2 py-1 text-xs bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200 rounded">
                  {topic}
                </span>
              ))}
              {preferences.likedTopics.length > 5 && (
                <span className="px-2 py-1 text-xs text-gray-500">
                  +{preferences.likedTopics.length - 5} more
                </span>
              )}
            </div>
          </div>
          <div>
            <p className="text-xs text-gray-500 dark:text-gray-400 mb-1">Disliked Topics</p>
            <div className="flex flex-wrap gap-1">
              {preferences.dislikedTopics.slice(0, 5).map((topic, idx) => (
                <span key={idx} className="px-2 py-1 text-xs bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200 rounded">
                  {topic}
                </span>
              ))}
              {preferences.dislikedTopics.length > 5 && (
                <span className="px-2 py-1 text-xs text-gray-500">
                  +{preferences.dislikedTopics.length - 5} more
                </span>
              )}
            </div>
          </div>
        </div>
      </div>
      
      {/* Save button */}
      <div className="flex justify-end">
        <button
          onClick={handleSave}
          className="px-6 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700"
        >
          Save Settings
        </button>
      </div>
    </div>
  );
};
```

#### Task 3.6: Navigation Integration
**File**: `ui-new/src/components/GitHubLink.tsx` (MODIFY)

Add Feed button next to Swag button:
```tsx
{/* Feed Button - Same visibility as Swag */}
{isAuthenticated && (
  <button
    onClick={() => navigate('/feed')}
    className="p-3 bg-orange-600 hover:bg-orange-500 text-white rounded-full shadow-lg transition-all duration-200 hover:scale-110"
    title="Feed"
  >
    <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 20H5a2 2 0 01-2-2V6a2 2 0 012-2h10a2 2 0 012 2v1m2 13a2 2 0 01-2-2V7m2 13a2 2 0 002-2V9a2 2 0 00-2-2h-2m-4-3H9M7 16h6M7 8h6v4H7V8z" />
    </svg>
  </button>
)}
```

**File**: `ui-new/src/App.tsx` (MODIFY)

Add route:
```tsx
import { FeedPage } from './components/FeedPage';

// In routes
<Route path="/feed" element={<FeedPage />} />
```

**File**: `ui-new/src/components/SettingsDialog.tsx` (MODIFY)

Add Feed tab:
```tsx
const tabs = [
  { id: 'general', label: 'General' },
  { id: 'providers', label: 'Providers' },
  { id: 'advanced', label: 'Advanced' },
  { id: 'feed', label: 'Feed' } // NEW
];

// In tab content
{activeTab === 'feed' && <FeedSettings />}
```

---

### Phase 4: Services & Utilities (8 hours)

#### Task 4.1: Feed Generator Service
**File**: `ui-new/src/services/feedGenerator.ts`

```typescript
import { feedDB } from '../db/feedDb';
import { performSearch, chatCompletion } from '../utils/api';
import { downloadAndConvertImage } from './imageProxy';

export async function generateFeedItems(
  swagContent: string[],
  searchTerms: string[],
  count: number,
  preferences: FeedPreferences,
  token: string
): Promise<FeedItem[]> {
  const items: FeedItem[] = [];
  
  // 1. Prepare context
  const swagSummary = swagContent.slice(0, 20).join('\n\n');
  const likedTopics = preferences.likedTopics.join(', ');
  const dislikedTopics = preferences.dislikedTopics.join(', ');
  
  // 2. Perform web searches (if search terms configured)
  let searchResults: any[] = [];
  if (searchTerms.length > 0) {
    for (const term of searchTerms) {
      const results = await performSearch(
        [term],
        token,
        { maxResults: 5, includeContent: true },
        () => {}, // onEvent
        () => {}  // onComplete
      );
      searchResults.push(...results);
    }
  }
  
  const searchSummary = searchResults
    .map(r => `${r.title}: ${r.snippet}`)
    .join('\n');
  
  // 3. Generate items via LLM
  const systemPrompt = `You are a content curator generating interesting "Did You Know" facts and Q&A items.

INPUT CONTEXT:
${swagSummary ? `User's saved content:\n${swagSummary}\n\n` : ''}
${searchSummary ? `Recent news/searches:\n${searchSummary}\n\n` : ''}
${likedTopics ? `Liked topics: ${likedTopics}\n` : ''}
${dislikedTopics ? `Disliked topics (AVOID): ${dislikedTopics}\n` : ''}

TASK: Generate ${count} engaging items mixing:
- "Did You Know" facts (70%)
- Question & Answer pairs (30%)

REQUIREMENTS:
- Each item should be surprising, educational, or thought-provoking
- Connect to user's interests when possible
- Avoid disliked topics
- Include specific topics/keywords for image search
- Keep content concise (2-3 sentences)

OUTPUT FORMAT (JSON):
{
  "items": [
    {
      "type": "did-you-know" | "qa",
      "title": "Brief headline",
      "content": "Engaging 2-3 sentence summary",
      "topics": ["topic1", "topic2"],
      "imageSearchTerms": "specific search query for image"
    }
  ]
}`;

  const response = await chatCompletion(
    [{ role: 'user', content: systemPrompt }],
    token,
    { temperature: 0.8, maxTokens: 2000 }
  );
  
  const parsed = JSON.parse(response.content);
  
  // 4. Process items and fetch images
  for (const itemData of parsed.items) {
    const item: FeedItem = {
      id: generateUUID(),
      type: itemData.type,
      title: itemData.title,
      content: itemData.content,
      topics: itemData.topics || [],
      sources: searchResults.map(r => r.url).slice(0, 3),
      createdAt: new Date().toISOString(),
      viewed: false,
      stashed: false,
      trashed: false
    };
    
    // Fetch image
    try {
      // Try to find image from search results first
      let imageUrl = searchResults.find(r => r.image)?.image;
      
      // Fallback: Image search for the topic
      if (!imageUrl && itemData.imageSearchTerms) {
        const imageResults = await performSearch(
          [itemData.imageSearchTerms],
          token,
          { maxResults: 1, includeContent: false, type: 'image' }
        );
        imageUrl = imageResults[0]?.image;
      }
      
      if (imageUrl) {
        const base64Image = await downloadAndConvertImage(imageUrl, token);
        item.image = base64Image;
        item.imageSource = imageUrl;
      }
    } catch (error) {
      console.error('Failed to fetch image:', error);
      // Continue without image
    }
    
    items.push(item);
  }
  
  return items;
}

export async function generateFeedQuiz(
  item: FeedItem,
  token: string,
  enabledProviders: any[]
): Promise<FeedQuiz> {
  // 1. Search for more information
  const searchResults = await performSearch(
    item.topics,
    token,
    { maxResults: 5, includeContent: true }
  );
  
  const context = `
Topic: ${item.title}
Content: ${item.content}

Additional Information:
${searchResults.map(r => `${r.title}\n${r.content}`).join('\n\n')}
`;

  // 2. Generate quiz using existing generateQuiz function
  const quiz = await generateQuiz(context, true, enabledProviders, token);
  
  return {
    itemId: item.id,
    title: `Quiz: ${item.title}`,
    questions: quiz.questions,
    sources: searchResults.map(r => r.url),
    generatedAt: new Date().toISOString()
  };
}

function generateUUID(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = Math.random() * 16 | 0;
    const v = c === 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
}
```

#### Task 4.2: Image Proxy Service
**File**: `ui-new/src/services/imageProxy.ts`

```typescript
import { getCachedApiBase } from '../utils/api';

const imageCache = new Map<string, string>();

export async function downloadAndConvertImage(
  imageUrl: string,
  token: string
): Promise<string> {
  // Check cache first
  if (imageCache.has(imageUrl)) {
    return imageCache.get(imageUrl)!;
  }
  
  const apiBase = await getCachedApiBase();
  
  try {
    const response = await fetch(
      `${apiBase}/scrape?mode=image&url=${encodeURIComponent(imageUrl)}`,
      {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${token}`
        }
      }
    );
    
    if (!response.ok) {
      throw new Error('Failed to download image');
    }
    
    const data = await response.json();
    const base64Image = data.base64;
    
    // Cache the result
    imageCache.set(imageUrl, base64Image);
    
    return base64Image;
  } catch (error) {
    console.error('Image download failed:', error);
    throw error;
  }
}
```

#### Task 4.3: Swipe Gesture Hook
**File**: `ui-new/src/hooks/useSwipeGesture.ts`

```typescript
import { useState, useRef, useCallback } from 'react';

interface SwipeGestureOptions {
  onSwipeLeft?: () => void;
  onSwipeRight?: () => void;
  threshold?: number; // pixels
}

interface SwipeGestureReturn {
  swipeProps: {
    onTouchStart: (e: React.TouchEvent) => void;
    onTouchMove: (e: React.TouchEvent) => void;
    onTouchEnd: () => void;
    onMouseDown: (e: React.MouseEvent) => void;
    onMouseMove: (e: React.MouseEvent) => void;
    onMouseUp: () => void;
    onMouseLeave: () => void;
  };
  swipeDirection: 'left' | 'right' | null;
  swipeProgress: number; // 0-threshold
}

export function useSwipeGesture(options: SwipeGestureOptions): SwipeGestureReturn {
  const { onSwipeLeft, onSwipeRight, threshold = 100 } = options;
  
  const [swipeDirection, setSwipeDirection] = useState<'left' | 'right' | null>(null);
  const [swipeProgress, setSwipeProgress] = useState(0);
  
  const startX = useRef(0);
  const currentX = useRef(0);
  const isSwiping = useRef(false);
  
  const handleStart = useCallback((clientX: number) => {
    startX.current = clientX;
    currentX.current = clientX;
    isSwiping.current = true;
  }, []);
  
  const handleMove = useCallback((clientX: number) => {
    if (!isSwiping.current) return;
    
    currentX.current = clientX;
    const diff = currentX.current - startX.current;
    
    if (Math.abs(diff) > 10) {
      setSwipeDirection(diff > 0 ? 'right' : 'left');
      setSwipeProgress(Math.min(Math.abs(diff), threshold));
    }
  }, [threshold]);
  
  const handleEnd = useCallback(() => {
    if (!isSwiping.current) return;
    
    const diff = currentX.current - startX.current;
    
    if (Math.abs(diff) >= threshold) {
      if (diff > 0 && onSwipeRight) {
        onSwipeRight();
      } else if (diff < 0 && onSwipeLeft) {
        onSwipeLeft();
      }
    }
    
    // Reset state
    isSwiping.current = false;
    setSwipeDirection(null);
    setSwipeProgress(0);
  }, [threshold, onSwipeLeft, onSwipeRight]);
  
  return {
    swipeProps: {
      onTouchStart: (e) => handleStart(e.touches[0].clientX),
      onTouchMove: (e) => handleMove(e.touches[0].clientX),
      onTouchEnd: handleEnd,
      onMouseDown: (e) => handleStart(e.clientX),
      onMouseMove: (e) => handleMove(e.clientX),
      onMouseUp: handleEnd,
      onMouseLeave: handleEnd
    },
    swipeDirection,
    swipeProgress
  };
}
```

---

### Phase 5: Testing & Polish (4 hours)

#### Task 5.1: Error Handling
- Network failures during generation
- Image download failures
- LLM API errors
- Empty Swag content edge case
- Offline mode (use cached items only)

#### Task 5.2: Performance Optimization
- Image lazy loading
- Virtual scrolling for large feeds
- Debounce scroll events
- Cache LLM responses
- Optimize IndexedDB queries

#### Task 5.3: Accessibility
- Keyboard navigation (arrow keys to navigate items)
- Screen reader support (ARIA labels)
- Focus management
- Swipe alternatives for keyboard users

#### Task 5.4: Mobile Responsiveness
- Touch-friendly button sizes
- Responsive layout
- Smooth swipe animations
- Mobile image optimization

---

## User Experience Flow

### First-Time User
1. Navigate to Feed page
2. See empty state with "Generate Feed" button
3. Click button → Loading indicator
4. Feed items appear with images
5. Can immediately swipe/interact
6. Go to Settings → Configure search terms

### Returning User
1. Navigate to Feed page
2. Cached items load instantly
3. Scroll to bottom → Auto-generates more
4. Preferences applied (no disliked topics)
5. Personalized based on Swag content

### Quiz Interaction
1. Click "Take Quiz" on feed item
2. Loading indicator while generating
3. Quiz replaces card content
4. Answer questions interactively
5. See score and explanations
6. Click "Close" to return to feed item

### Swipe Gestures
1. Start swiping feed item
2. Visual feedback (color change, icon)
3. Release at threshold → Action triggered
4. Toast with undo option
5. Preferences updated in background

---

## Technical Considerations

### Performance
- **IndexedDB**: Fast local storage for offline support
- **Image Caching**: Prevent re-downloads
- **Lazy Loading**: Load images as needed
- **Virtual Scroll**: Handle 1000+ items efficiently

### Security
- **Image Proxy**: All images via backend (prevents CORS, malicious content)
- **Content Sanitization**: Clean LLM-generated HTML
- **Rate Limiting**: Prevent abuse of generation endpoint

### Scalability
- **Batch Generation**: Generate 10 items per request
- **Incremental Loading**: Load more as needed
- **Preference Learning**: Track topics without server storage
- **Offline First**: Works without network (cached items)

### Cost Management
- **Efficient Prompts**: Minimize token usage
- **Batch Requests**: Generate multiple items per LLM call
- **Image Optimization**: Compress images before base64
- **Cache Aggressively**: Avoid redundant API calls

---

## Estimated Development Time

| Phase | Tasks | Hours |
|-------|-------|-------|
| 1. Backend Infrastructure | Feed endpoint, image proxy | 6 |
| 2. Database Layer | IndexedDB schema, CRUD | 4 |
| 3. Frontend Components | Page, items, quiz, settings | 12 |
| 4. Services & Utilities | Generator, proxy, hooks | 8 |
| 5. Testing & Polish | Error handling, optimization | 4 |
| **TOTAL** | | **34 hours** |

---

## Success Metrics

### User Engagement
- Time spent on Feed page
- Items stashed vs trashed ratio
- Quiz completion rate
- Feed refresh frequency

### Content Quality
- User satisfaction (implicit via stash/trash)
- Topic diversity
- Image relevance
- Quiz difficulty balance

### Performance
- Generation time < 5 seconds per batch
- Image load time < 2 seconds
- Smooth scrolling (60 FPS)
- Offline capability

---

## Future Enhancements

### Phase 2 Features
1. **Social Sharing**: Share interesting feed items
2. **Collaborative Feed**: See items from community
3. **Topic Following**: Subscribe to specific topics
4. **Smart Notifications**: Alert on interesting new items
5. **Feed Analytics**: Track learning progress
6. **Custom Templates**: User-defined item formats
7. **Audio Narration**: TTS for feed items
8. **Bookmarks**: Save items without stashing
9. **Search**: Find items by keyword
10. **Export**: Download feed as PDF/markdown

### Advanced Features
- **AI Summarization**: Weekly digest of feed
- **Cross-Feed Linking**: Connect related items
- **Feed Personas**: Multiple feed configurations
- **Collaborative Filtering**: Recommendations from similar users
- **Multi-Language**: Support multiple languages
- **Feed Scheduling**: Generate at specific times

---

## Dependencies

### New Dependencies
- None (uses existing libraries)

### Existing Dependencies Used
- React, TypeScript, Tailwind CSS
- IndexedDB API (native)
- Fetch API (native)
- QuizCard component (reused)
- SwagContext (for content access)
- AuthContext (for authentication)
- Settings system (for configuration)

---

## Risk Mitigation

### Technical Risks
1. **LLM Generation Quality**: 
   - Mitigation: Prompt engineering, user feedback loop
2. **Image Copyright**: 
   - Mitigation: Attribution, fair use, user-generated opt-out
3. **Storage Limits**: 
   - Mitigation: Auto-cleanup old items, user controls
4. **Performance**: 
   - Mitigation: Virtual scroll, lazy loading, caching

### UX Risks
1. **Information Overload**: 
   - Mitigation: Limit items, quality over quantity
2. **Irrelevant Content**: 
   - Mitigation: Preference learning, manual controls
3. **Addictive Design**: 
   - Mitigation: No infinite scroll by default, intentional limits

---

## Conclusion

The Feed feature provides a personalized, engaging way for users to discover new information related to their interests (Swag content) and current events (web search). The combination of LLM generation, web search integration, interactive quizzes, and swipe gestures creates a modern, mobile-friendly experience that encourages learning and exploration.

**Status**: ✅ Plan Complete - Ready for Implementation

**Next Steps**: 
1. Review plan with stakeholders
2. Begin Phase 1 implementation
3. Iterate based on user feedback
