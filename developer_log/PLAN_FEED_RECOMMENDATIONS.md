# Plan: Feed Recommendations with ML-based Personalization

**Date**: 2025-10-28  
**Status**: 📋 PLANNING  
**Priority**: MEDIUM (Medium value, high complexity)  
**Estimated Implementation Time**: 16-36 hours (Basic: 16 hours, Advanced ML: 36+ hours)

## Executive Summary

Use TF-IDF keyword extraction to personalize feed content based on user interaction patterns, improving relevance and engagement. This includes collecting user interaction data (including quiz engagements), implementing TF-IDF-based keyword extraction, and generating dynamic search terms from learned preferences.

**Quiz Engagement Tracking**: Quiz generation from feed items is a strong positive signal (2x weight), and high quiz scores (>80%) indicate deep interest (3x weight). Quiz topics are incorporated into user preference learning.

## Current State Analysis

### Existing Feed System

**Feed Generation** (`src/endpoints/feed.js`):
- Static search terms configured in settings
- Manual preferences (liked/disliked topics in settings)
- No learning from user behavior
- Simple stash/trash actions

**User Preferences** (`ui-new/src/context/FeedContext.tsx`):
```typescript
interface FeedPreferences {
  searchTerms: string[];    // Manual input
  likedTopics: string[];    // Manual selection
  dislikedTopics: string[]; // Manual selection
}
```

**Feed Actions**:
- **Stash**: Save item for later (stored in IndexedDB)
- **Trash**: Remove item (not shown again)
- **View**: Implicit signal (time spent viewing)
- **Quiz**: Generate quiz from feed item
- **Skip**: Scroll past without interaction

**Limitations**:
- ❌ No automatic learning from user behavior
- ❌ All users see same content (no personalization)
- ❌ No topic discovery (stuck in filter bubble)
- ❌ Manual search term configuration
- ❌ No diversity in recommendations

## Requirements

### Functional Requirements

1. **User Interaction Tracking**:
   - Track all feed actions (stash, trash, view, quiz, skip)
   - Record time spent viewing each item
   - Store item metadata (topics, source, type)
   - Link interactions to user profile

2. **Preference Learning**:
   - Extract keywords from stashed items
   - Weight by recency and frequency
   - Identify patterns in user behavior
   - Detect topic preferences automatically

3. **Dynamic Search Term Generation**:
   - Generate search terms from learned preferences
   - Combine user preferences with trending topics
   - Filter out disliked topics
   - Ensure diversity (avoid filter bubble)

4. **Content Personalization**:
   - Rank feed items by relevance to user
   - Balance exploration vs exploitation (80/20 rule)
   - Provide topic diversity
   - Time-based preferences (morning vs evening content)

5. **Feedback Loop**:
   - Update preferences incrementally on each interaction
   - A/B testing framework for recommendation strategies
   - User control (disable personalization, reset preferences)

### Non-Functional Requirements

1. **Performance**:
   - Recommendation generation < 200ms
   - ML inference < 100ms
   - Feed personalization doesn't slow down generation

2. **Privacy**:
   - All ML happens on user's own data
   - No cross-user data sharing without consent
   - Option to disable personalization
   - Clear data deletion controls

3. **Scalability**:
   - ML computations run async (don't block feed)
   - Cache recommendations for 1 hour
   - Incremental updates (not full retraining)

## ML Approach: TF-IDF + Collaborative Filtering

### Phase 1: Simple TF-IDF-based Recommendations

**TF-IDF (Term Frequency-Inverse Document Frequency)**:
- Extract keywords from stashed items
- Weight keywords by how often they appear
- Penalize common words (the, and, is)
- Result: List of important keywords per user

**Algorithm**:
```
1. Collect all stashed items for user
2. Extract text content (title + body)
3. Apply TF-IDF to get keyword weights
4. Rank keywords by TF-IDF score
5. Use top 10 keywords as search terms
```

### Phase 2: Collaborative Filtering (Optional)

**Concept**:
- Find users with similar interaction patterns
- Recommend items liked by similar users
- Privacy-preserving (hash user IDs)

**Algorithm**:
```
1. Create user-item interaction matrix (sparse)
2. Compute user similarity (cosine similarity)
3. Find top 5 similar users
4. Recommend items they stashed (but you haven't seen)
```

## Data Model

### UserInteraction (IndexedDB)

```typescript
interface UserInteraction {
  id: string;                     // interaction ID (UUID)
  timestamp: number;              // interaction time
  feedItemId: string;             // which feed item
  action: FeedAction;             // stash, trash, view, quiz, skip
  timeSpent: number;              // milliseconds viewing item
  itemType: 'didYouKnow' | 'questionAnswer';
  topics: string[];               // extracted topics
  source: string;                 // search result, swag snippet, etc.
  content: string;                // item text (for TF-IDF)
  
  // Quiz engagement tracking
  quizGenerated?: boolean;        // true if quiz was created from this item
  quizId?: string;                // reference to quiz if generated
  quizScore?: number;             // quiz score (0-100) if completed
  quizTopics?: string[];          // topics extracted from quiz questions
}

type FeedAction = 'stash' | 'trash' | 'view' | 'quiz' | 'skip';

interface UserPreferences {
  userId: string;
  learnedTopics: TopicWeight[];   // automatically learned
  learnedKeywords: KeywordWeight[]; // TF-IDF keywords
  avoidTopics: string[];          // trashed topics
  lastUpdated: number;            // last preference update
  interactionCount: number;       // total interactions
  quizEngagementCount: number;    // total quizzes generated from feed
}

interface TopicWeight {
  topic: string;
  weight: number;                 // 0-1 (higher = more interested)
  recency: number;                // timestamp of last interaction
  frequency: number;              // how many times seen
  quizEngagement: boolean;        // true if quiz was generated for this topic
  quizScore?: number;             // average quiz score for this topic
}

interface KeywordWeight {
  keyword: string;
  tfidf: number;                  // TF-IDF score
  frequency: number;              // appearances in stashed items
  quizFrequency: number;          // appearances in quiz-generated items (weighted higher)
}

interface RecommendationCache {
  userId: string;
  searchTerms: string[];          // generated search terms
  generatedAt: number;            // cache timestamp
  ttl: number;                    // time to live (1 hour)
}
```

## Architecture

### Feed Recommender Service

**File**: `src/services/feed-recommender.js`

```javascript
const natural = require('natural');
const TfIdf = natural.TfIdf;

class FeedRecommender {
  constructor() {
    this.tfidf = new TfIdf();
    this.cache = new Map(); // recommendation cache
  }

  /**
   * Analyze user interaction history and extract preferences
   */
  async analyzeUserPreferences(userId) {
    const interactions = await this.getFeedInteractions(userId);
    
    if (interactions.length === 0) {
      return this.getDefaultPreferences();
    }

    // Filter stashed items (positive signal)
    const stashedItems = interactions.filter(i => i.action === 'stash');
    const trashedItems = interactions.filter(i => i.action === 'trash');
    const quizItems = interactions.filter(i => i.quizGenerated === true);

    // Extract keywords using TF-IDF (with quiz weighting)
    const learnedKeywords = this.extractKeywords(stashedItems, quizItems);
    
    // Extract topics with weighting (including quiz engagement)
    const learnedTopics = this.extractTopics(stashedItems, quizItems);
    
    // Extract avoided topics
    const avoidTopics = this.extractTopics(trashedItems, []).map(t => t.topic);

    return {
      userId,
      learnedTopics,
      learnedKeywords,
      avoidTopics,
      lastUpdated: Date.now(),
      interactionCount: interactions.length,
      quizEngagementCount: quizItems.length
    };
  }

  /**
   * Extract keywords using TF-IDF (with quiz engagement weighting)
   */
  extractKeywords(stashedItems, quizItems) {
    if (stashedItems.length === 0 && quizItems.length === 0) return [];

    // Reset TF-IDF
    this.tfidf = new TfIdf();

    // Add stashed items as documents
    stashedItems.forEach(item => {
      this.tfidf.addDocument(item.content);
    });

    // Add quiz items (they'll get higher weight later)
    quizItems.forEach(item => {
      this.tfidf.addDocument(item.content);
    });

    // Get top keywords across all documents
    const keywordMap = new Map();

    // Aggregate TF-IDF scores from stashed items (1x weight)
    for (let i = 0; i < stashedItems.length; i++) {
      this.tfidf.listTerms(i).forEach(term => {
        if (term.term.length > 3) { // Ignore short words
          const existing = keywordMap.get(term.term) || { tfidf: 0, frequency: 0, quizFrequency: 0 };
          existing.tfidf += term.tfidf;
          existing.frequency++;
          keywordMap.set(term.term, existing);
        }
      });
    }

    // Aggregate TF-IDF scores from quiz items (2x weight)
    for (let i = stashedItems.length; i < stashedItems.length + quizItems.length; i++) {
      this.tfidf.listTerms(i).forEach(term => {
        if (term.term.length > 3) {
          const existing = keywordMap.get(term.term) || { tfidf: 0, frequency: 0, quizFrequency: 0 };
          existing.tfidf += term.tfidf * 2; // 2x weight for quiz items
          existing.quizFrequency++;
          keywordMap.set(term.term, existing);
        }
      });
    }

    // Apply additional 3x weight to keywords from high-scoring quizzes (>80%)
    quizItems.forEach((item, idx) => {
      if (item.quizScore && item.quizScore > 80) {
        const docIndex = stashedItems.length + idx;
        this.tfidf.listTerms(docIndex).forEach(term => {
          if (term.term.length > 3) {
            const existing = keywordMap.get(term.term);
            if (existing) {
              existing.tfidf += term.tfidf * 1.5; // Additional 1.5x weight (total 3.5x for high-scoring quizzes)
            }
          }
        });
      }
    });

    // Sort by TF-IDF score and return top 20
    const totalItems = stashedItems.length + quizItems.length;
    return Array.from(keywordMap.entries())
      .map(([keyword, data]) => ({
        keyword,
        tfidf: data.tfidf / totalItems, // normalize
        frequency: data.frequency,
        quizFrequency: data.quizFrequency
      }))
      .sort((a, b) => b.tfidf - a.tfidf)
      .slice(0, 20);
  }

  /**
   * Extract topics with frequency, recency, and quiz engagement weighting
   */
  extractTopics(stashedItems, quizItems) {
    const topicMap = new Map();
    const now = Date.now();
    const oneDay = 24 * 60 * 60 * 1000;

    // Process stashed items (1x weight)
    stashedItems.forEach(item => {
      item.topics.forEach(topic => {
        const existing = topicMap.get(topic);
        
        if (existing) {
          existing.frequency++;
          existing.recency = Math.max(existing.recency, item.timestamp);
        } else {
          topicMap.set(topic, {
            topic,
            frequency: 1,
            recency: item.timestamp,
            weight: 0,
            quizEngagement: false,
            quizScore: undefined
          });
        }
      });
    });

    // Process quiz items (2x weight, track engagement)
    quizItems.forEach(item => {
      // Use quiz topics if available (from quiz questions), otherwise fall back to item topics
      const topics = item.quizTopics && item.quizTopics.length > 0 ? item.quizTopics : item.topics;
      
      topics.forEach(topic => {
        const existing = topicMap.get(topic);
        
        if (existing) {
          existing.frequency += 2; // 2x weight for quiz-generated items
          existing.recency = Math.max(existing.recency, item.timestamp);
          existing.quizEngagement = true;
          
          // Track average quiz score for this topic
          if (item.quizScore !== undefined) {
            if (existing.quizScore === undefined) {
              existing.quizScore = item.quizScore;
              existing.quizCount = 1;
            } else {
              existing.quizScore = (existing.quizScore * existing.quizCount + item.quizScore) / (existing.quizCount + 1);
              existing.quizCount++;
            }
          }
        } else {
          topicMap.set(topic, {
            topic,
            frequency: 2, // Start with 2x weight
            recency: item.timestamp,
            weight: 0,
            quizEngagement: true,
            quizScore: item.quizScore,
            quizCount: item.quizScore !== undefined ? 1 : 0
          });
        }
      });
    });

    // Calculate weight: frequency * recency_factor * quiz_factor
    // Recent items get more weight
    // Topics with quiz engagement and high scores get even more weight
    return Array.from(topicMap.values()).map(t => {
      const daysSince = (now - t.recency) / oneDay;
      const recencyFactor = Math.exp(-daysSince / 30); // decay over 30 days
      
      // Quiz factor: 1x for no quiz, 2x for quiz generated, 3x for high-scoring quiz (>80%)
      let quizFactor = 1;
      if (t.quizEngagement) {
        quizFactor = 2;
        if (t.quizScore !== undefined && t.quizScore > 80) {
          quizFactor = 3;
        }
      }
      
      t.weight = t.frequency * recencyFactor * quizFactor;
      return t;
    }).sort((a, b) => b.weight - a.weight);
  }

  /**
   * Generate search terms from user preferences
   */
  async generateSearchTerms(preferences, count = 10) {
    // Check cache first
    const cacheKey = preferences.userId;
    const cached = this.cache.get(cacheKey);
    if (cached && Date.now() - cached.generatedAt < 3600000) { // 1 hour cache
      return cached.searchTerms;
    }

    const searchTerms = [];

    // 1. Use top learned keywords (60%)
    const keywordTerms = preferences.learnedKeywords
      .slice(0, Math.ceil(count * 0.6))
      .map(k => k.keyword);
    searchTerms.push(...keywordTerms);

    // 2. Use top learned topics (20%)
    const topicTerms = preferences.learnedTopics
      .slice(0, Math.ceil(count * 0.2))
      .map(t => t.topic);
    searchTerms.push(...topicTerms);

    // 3. Add trending topics for exploration (20%)
    const trendingTerms = await this.getTrendingTopics(Math.ceil(count * 0.2));
    searchTerms.push(...trendingTerms);

    // Filter out avoided topics
    const filtered = searchTerms.filter(term => 
      !preferences.avoidTopics.some(avoid => 
        term.toLowerCase().includes(avoid.toLowerCase())
      )
    );

    // Deduplicate and limit
    const unique = [...new Set(filtered)].slice(0, count);

    // Cache result
    this.cache.set(cacheKey, {
      userId: preferences.userId,
      searchTerms: unique,
      generatedAt: Date.now(),
      ttl: 3600000
    });

    return unique;
  }

  /**
   * Get trending topics (for exploration)
   */
  async getTrendingTopics(count = 5) {
    // TODO: Implement trending topics from external source
    // For now, return static popular topics
    const popularTopics = [
      'artificial intelligence',
      'machine learning',
      'quantum computing',
      'climate change',
      'renewable energy',
      'space exploration',
      'biotechnology',
      'cryptocurrency',
      'neural networks',
      'data science'
    ];

    // Shuffle and return random subset
    return popularTopics
      .sort(() => Math.random() - 0.5)
      .slice(0, count);
  }

  /**
   * Get default preferences for new users
   */
  getDefaultPreferences() {
    return {
      userId: 'default',
      learnedTopics: [],
      learnedKeywords: [],
      avoidTopics: [],
      lastUpdated: Date.now(),
      interactionCount: 0
    };
  }

  /**
   * Get feed interactions from IndexedDB (stub)
   */
  async getFeedInteractions(userId) {
    // TODO: Implement IndexedDB query
    // For now, return empty array
    return [];
  }

  /**
   * Track new interaction and update preferences incrementally
   */
  async trackInteraction(userId, interaction) {
    // Store interaction in IndexedDB
    await this.storeInteraction(interaction);

    // Invalidate recommendation cache
    this.cache.delete(userId);

    // Optionally: Update preferences incrementally (not full recompute)
    // This is faster for real-time updates
  }

  /**
   * Store interaction in IndexedDB (stub)
   */
  async storeInteraction(interaction) {
    // TODO: Implement IndexedDB insert
    console.log('Storing interaction:', interaction);
  }
}

module.exports = new FeedRecommender();
```

### Integration with Feed Endpoint

**Update**: `src/endpoints/feed.js`

```javascript
const feedRecommender = require('../services/feed-recommender');

async function generateFeed(userId, options = {}) {
  const count = options.count || 10;
  
  // 1. Analyze user preferences
  const preferences = await feedRecommender.analyzeUserPreferences(userId);
  
  // 2. Generate personalized search terms
  const searchTerms = await feedRecommender.generateSearchTerms(preferences, count);
  
  console.log(`Generated ${searchTerms.length} personalized search terms:`, searchTerms);
  
  // 3. Generate feed items using personalized search terms
  const items = await Promise.all(
    searchTerms.map(async (term) => {
      return await generateFeedItem('didYouKnow', term, { userId });
    })
  );
  
  // 4. Rank items by relevance (simple scoring)
  const rankedItems = items.map(item => ({
    ...item,
    relevanceScore: calculateRelevance(item, preferences)
  }))
  .sort((a, b) => b.relevanceScore - a.relevanceScore);
  
  return {
    items: rankedItems.slice(0, count),
    searchTerms,
    personalized: preferences.interactionCount > 0
  };
}

/**
 * Calculate relevance score for a feed item
 */
function calculateRelevance(item, preferences) {
  let score = 0;
  
  // Match with learned topics (high weight)
  item.topics?.forEach(topic => {
    const learned = preferences.learnedTopics.find(t => 
      t.topic.toLowerCase() === topic.toLowerCase()
    );
    if (learned) {
      score += learned.weight * 2; // 2x weight for exact topic match
    }
  });
  
  // Match with learned keywords (medium weight)
  preferences.learnedKeywords.forEach(kw => {
    if (item.content?.toLowerCase().includes(kw.keyword.toLowerCase())) {
      score += kw.tfidf;
    }
  });
  
  // Penalize avoided topics (negative weight)
  item.topics?.forEach(topic => {
    if (preferences.avoidTopics.includes(topic.toLowerCase())) {
      score -= 10; // strong penalty
    }
  });
  
  return score;
}
```

### Frontend Integration

**Update**: `ui-new/src/components/FeedItem.tsx`

```tsx
import { feedDb } from '../db/feedDb';

export function FeedItem({ item, onStash, onTrash }: FeedItemProps) {
  const [viewStartTime] = useState(Date.now());

  // Track when item is viewed
  useEffect(() => {
    trackInteraction('view', 0);
    return () => {
      const timeSpent = Date.now() - viewStartTime;
      trackInteraction('view', timeSpent);
    };
  }, []);

  async function trackInteraction(action: FeedAction, timeSpent: number = 0) {
    const interaction: UserInteraction = {
      id: crypto.randomUUID(),
      timestamp: Date.now(),
      feedItemId: item.id,
      action,
      timeSpent,
      itemType: item.type,
      topics: item.topics || [],
      source: item.source || 'unknown',
      content: `${item.title} ${item.content}`,
      
      // Quiz engagement tracking
      quizGenerated: action === 'quiz',
      quizId: action === 'quiz' ? undefined : undefined, // Set when quiz is created
      quizScore: undefined, // Set when quiz is completed
      quizTopics: [] // Set from quiz questions
    };

    await feedDb.interactions.add(interaction);
    
    // Send to backend for preference update
    if (action === 'stash' || action === 'trash' || action === 'quiz') {
      await fetch('/api/feed/interaction', {
        method: 'POST',
        body: JSON.stringify(interaction)
      });
    }
  }

  // Track quiz generation
  async function handleQuizGeneration(quiz: Quiz) {
    // Update interaction with quiz details
    const interaction = await feedDb.interactions
      .where('feedItemId')
      .equals(item.id)
      .and(i => i.action === 'quiz')
      .first();
    
    if (interaction) {
      await feedDb.interactions.update(interaction.id, {
        quizId: quiz.id,
        quizTopics: quiz.topics // Extract from quiz questions
      });
    }
  }

  // Track quiz completion
  async function handleQuizCompletion(quizId: string, score: number) {
    // Find the interaction for this quiz
    const interaction = await feedDb.interactions
      .where('quizId')
      .equals(quizId)
      .first();
    
    if (interaction) {
      await feedDb.interactions.update(interaction.id, {
        quizScore: score
      });
      
      // Trigger preference update (high-scoring quizzes get 3x weight)
      await fetch('/api/feed/interaction', {
        method: 'POST',
        body: JSON.stringify({ ...interaction, quizScore: score })
      });
    }
  }
      });
    }
  }

  async function handleStash() {
    await trackInteraction('stash');
    onStash(item);
  }

  async function handleTrash() {
    await trackInteraction('trash');
    onTrash(item);
  }

  return (
    <div className="feed-item">
      {/* ... existing UI ... */}
      <button onClick={handleStash}>💾 Stash</button>
      <button onClick={handleTrash}>🗑️ Trash</button>
    </div>
  );
}
```

**Update**: `ui-new/src/db/feedDb.ts`

```typescript
import Dexie, { Table } from 'dexie';

class FeedDB extends Dexie {
  interactions!: Table<UserInteraction, string>;
  preferences!: Table<UserPreferences, string>;

  constructor() {
    super('FeedDB');
    
    this.version(1).stores({
      interactions: 'id, timestamp, feedItemId, action, *topics',
      preferences: 'userId, lastUpdated'
    });
  }
}

export const feedDb = new FeedDB();
```

## Implementation Plan

### Phase 1: Data Collection & TF-IDF (6 hours)

**Deliverables**:
- [ ] Create interaction tracking system
  - `UserInteraction` IndexedDB schema with quiz engagement fields
  - Track stash/trash/view/quiz/skip actions
  - Store item content and metadata
  - Track quiz generation, quiz ID, quiz score, quiz topics
- [ ] Implement TF-IDF keyword extraction
  - Install `natural` npm package
  - Create `feed-recommender.js` service
  - Extract keywords from stashed items with quiz weighting (2x for quiz, 3x for high scores)
- [ ] Build preference analyzer
  - Aggregate interactions
  - Calculate topic weights (frequency × recency × quiz_factor)
  - Identify avoided topics
  - Track quiz engagement count

**Testing**:
- Stash 10 items with different topics
- Generate quizzes from 3 items, complete with scores >80%
- Verify TF-IDF keywords are extracted with proper weighting
- Check quiz topics get 3x weight in preferences

### Phase 2: Dynamic Search Terms with Quiz Integration (4 hours)

**Deliverables**:
- [ ] Auto-generate search terms from preferences
  - Use top 6 keywords (60%) - prioritize quiz keywords
  - Use top 2 topics (20%) - prioritize quiz topics with high scores
  - Add 2 trending topics (20%)
- [ ] Implement topic diversity algorithm
  - Ensure topics span multiple domains
  - Balance quiz-heavy topics with exploration
- [ ] Add trending topics discovery
  - Hardcode popular topics initially
  - Optional: Fetch from external API
- [ ] Quiz completion tracking
  - Update interactions when quiz is completed
  - Trigger preference update for high-scoring quizzes

**Testing**:
- Generate feed with personalized search terms
- Verify quiz-generated topics appear more frequently
- Check high-scoring quiz topics get prioritized
- Verify diversity (not all same topic)

## Success Metrics

### Engagement
- **Target**: Stash rate increases by 20%+
- **Metric**: Stashed items / total items shown
- **Quiz metric**: Quiz generation rate > 10% of stashed items

### Relevance
- **Target**: Trash rate decreases by 30%+
- **Metric**: Trashed items / total items shown
- **Quiz metric**: Topics from high-scoring quizzes appear 2x more often

### Time Spent
- **Target**: Average time per item increases 15%+
- **Metric**: Time spent viewing / item count

### User Satisfaction
- **Target**: 70%+ users rate recommendations as "helpful"
- **Metric**: User survey responses

## Privacy & Ethics

### Data Usage
- **All ML on user's own data**: No cross-user data sharing
- **Opt-in personalization**: Users must enable explicitly
- **Transparent recommendations**: Show why item was recommended (including "Based on quiz score")
- **Easy opt-out**: Disable personalization at any time

### Data Deletion
- **Clear all interactions**: Delete all tracking data including quiz history
- **Reset preferences**: Start fresh
- **Export before delete**: Download interaction history with quiz data

### Bias Mitigation
- **Filter bubble avoidance**: 20% exploration (trending topics)
- **Diversity requirement**: Max 30% items from same topic
- **Avoid negative feedback loops**: Don't over-penalize
- **Quiz bias**: Even high-scoring quizzes don't eliminate topic diversity

## Testing Plan

### Unit Tests

```javascript
// tests/services/feed-recommender.test.js
describe('Feed Recommender', () => {
  it('should extract keywords using TF-IDF with quiz weighting', async () => {
    const stashedItems = [
      { content: 'Machine learning is a subset of artificial intelligence' }
    ];
    const quizItems = [
      { content: 'Machine learning algorithms learn from data', quizScore: 85 }
    ];

    const keywords = recommender.extractKeywords(stashedItems, quizItems);
    
    // 'machine' should have higher weight due to quiz
    const machineKeyword = keywords.find(k => k.keyword === 'machine');
    expect(machineKeyword.quizFrequency).toBe(1);
    expect(machineKeyword.tfidf).toBeGreaterThan(0.5); // High TF-IDF due to 3x weight
  });

  it('should weight topics by quiz engagement', async () => {
    const stashedItems = [
      { topics: ['AI'], timestamp: Date.now() }
    ];
    const quizItems = [
      { topics: ['Machine Learning'], timestamp: Date.now(), quizScore: 90 }
    ];

    const topics = recommender.extractTopics(stashedItems, quizItems);
    
    // ML should have higher weight (quiz with high score = 3x factor)
    expect(topics[0].topic).toBe('Machine Learning');
    expect(topics[0].quizEngagement).toBe(true);
    expect(topics[0].quizScore).toBe(90);
  });

  it('should track quiz completion in interactions', async () => {
    const feedItem = { id: 'item-1', content: 'AI content' };
    
    // Generate quiz
    await trackInteraction('quiz', feedItem);
    
    // Complete quiz
    await handleQuizCompletion('quiz-123', 85);
    
    // Check interaction updated
    const interaction = await feedDb.interactions
      .where('feedItemId')
      .equals('item-1')
      .first();
    
    expect(interaction.quizGenerated).toBe(true);
    expect(interaction.quizScore).toBe(85);
  });
});
```

## Dependencies

### Required
- `natural`: ^6.10.0 (TF-IDF keyword extraction)
- `dexie`: ^3.2.4 (IndexedDB wrapper)

### Not Used (Removed from plan)
- ❌ `@xenova/transformers` - Advanced ML removed, TF-IDF is sufficient

## Future Enhancements (Out of Scope)

### Phase 3+: Advanced Features (Not Planned)
The following features are intentionally excluded to keep the implementation simple and focused on TF-IDF:

- ❌ Neural embeddings (sentence transformers)
- ❌ Multi-modal learning (text + images)  
- ❌ Social recommendations (friends' preferences)
- ❌ Graph neural networks
- ❌ Transformer-based ranking
- ❌ Reinforcement learning (multi-armed bandit)

**Rationale**: TF-IDF with quiz engagement weighting provides sufficient personalization while remaining simple, fast, and maintainable. Advanced ML adds complexity without proportional benefit for this use case.

## Success Metrics

### Engagement
- **Target**: Stash rate increases by 20%+
- **Metric**: Stashed items / total items shown

### Relevance
- **Target**: Trash rate decreases by 30%+
- **Metric**: Trashed items / total items shown

### Time Spent
- **Target**: Average time per item increases 15%+
- **Metric**: Time spent viewing / item count

### User Satisfaction
- **Target**: 70%+ users rate recommendations as "helpful"
- **Metric**: User survey responses

## Privacy & Ethics

### Data Usage
- **All ML on user's own data**: No cross-user data sharing
- **Opt-in personalization**: Users must enable explicitly
- **Transparent recommendations**: Show why item was recommended
- **Easy opt-out**: Disable personalization at any time

### Data Deletion
- **Clear all interactions**: Delete all tracking data
- **Reset preferences**: Start fresh
- **Export before delete**: Download interaction history

### Bias Mitigation
- **Filter bubble avoidance**: 20% exploration (trending topics)
- **Diversity requirement**: Max 30% items from same topic
- **Avoid negative feedback loops**: Don't over-penalize

## Testing Plan

### Unit Tests

```javascript
// tests/services/feed-recommender.test.js
describe('Feed Recommender', () => {
  it('should extract keywords using TF-IDF', async () => {
    const items = [
      { content: 'Machine learning is a subset of artificial intelligence' },
      { content: 'Machine learning algorithms learn from data' },
      { content: 'Artificial intelligence is transforming industries' }
    ];

    const keywords = recommender.extractKeywords(items);
    
    expect(keywords).toContainEqual(
      expect.objectContaining({ keyword: 'machine' })
    );
    expect(keywords).toContainEqual(
      expect.objectContaining({ keyword: 'learning' })
    );
  });

  it('should weight topics by recency', async () => {
    const now = Date.now();
    const items = [
      { topics: ['AI'], timestamp: now - 86400000 }, // 1 day ago
      { topics: ['AI'], timestamp: now - 172800000 }, // 2 days ago
      { topics: ['ML'], timestamp: now } // today
    ];

    const topics = recommender.extractTopics(items);
    
    // ML should have higher weight (more recent)
    expect(topics[0].topic).toBe('ML');
  });

  it('should filter avoided topics', async () => {
    const preferences = {
      learnedKeywords: [
        { keyword: 'ai', tfidf: 0.8 },
        { keyword: 'blockchain', tfidf: 0.6 }
      ],
      avoidTopics: ['cryptocurrency', 'blockchain']
    };

    const searchTerms = await recommender.generateSearchTerms(preferences, 10);
    
    expect(searchTerms).not.toContain('blockchain');
    expect(searchTerms).toContain('ai');
  });
});
```

### Integration Tests

```javascript
// tests/integration/personalized-feed.test.js
describe('Personalized Feed', () => {
  it('should generate personalized feed after interactions', async () => {
    const userId = 'test-user';

    // Simulate interactions
    await trackInteraction({
      userId,
      action: 'stash',
      content: 'Deep learning neural networks',
      topics: ['AI', 'Machine Learning']
    });

    await trackInteraction({
      userId,
      action: 'stash',
      content: 'Convolutional neural networks for image recognition',
      topics: ['AI', 'Computer Vision']
    });

    // Generate feed
    const feed = await generateFeed(userId, { count: 10 });

    // Should be personalized
    expect(feed.personalized).toBe(true);
    
    // Should contain AI-related terms
    const hasAITerms = feed.searchTerms.some(term => 
      term.toLowerCase().includes('neural') || 
      term.toLowerCase().includes('ai') ||
      term.toLowerCase().includes('learning')
    );
    expect(hasAITerms).toBe(true);
  });
});
```

## Future Enhancements

### Phase 5: Advanced Features
- [ ] Multi-modal learning (text + images)
- [ ] Social recommendations (friends' preferences)
- [ ] Topic evolution tracking (interests change over time)
- [ ] External knowledge graph integration

### Phase 6: Optimization
- [ ] Pre-compute embeddings (cache)
- [ ] Use approximate nearest neighbors (FAISS)
- [ ] Batch embedding inference
- [ ] Edge ML (run in browser with WASM)

### Phase 7: Advanced Algorithms
- [ ] Reinforcement learning (multi-armed bandit)
- [ ] Deep learning recommendation models
- [ ] Graph neural networks (relationship modeling)
- [ ] Transformer-based ranking

---

**Status**: Ready for implementation  
**Next Step**: Create interaction tracking schema  
**Estimated Launch**: 2-4 weeks (basic), 6-8 weeks (advanced ML)

**Dependencies**:
- `natural`: ^6.10.0 (NLP, TF-IDF)
- `compromise`: ^14.10.0 (optional, keyword extraction)
- `@xenova/transformers`: ^2.10.0 (optional, advanced ML)

**Performance Budget**:
- TF-IDF keyword extraction: < 50ms for 100 items
- Search term generation: < 100ms
- Embedding inference (optional): < 100ms per item
- Total recommendation overhead: < 200ms
