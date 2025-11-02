# Long-Term Feature Plans

**Date**: October 28, 2025  
**Status**: PLANNING

NOTES: use unsplash and pexels round robin style.


## Overview

This document outlines detailed plans for three long-term feature enhancements:
1. Image Search Integration for Feed
2. Quiz Analytics & Performance Tracking
3. Feed Recommendations with ML-based Personalization

---

## 1. Image Search Integration for Feed Items

### Goal
Enhance feed items with relevant, high-quality images from external image search APIs instead of placeholder images.

### Current State
- Feed generates `imageSearchTerms` for each item
- Images are placeholders or not displayed
- `image-proxy.js` can download and convert external images to base64

### Proposed Solution

#### Option A: Unsplash API (Recommended)
**Pros**:
- Free tier: 50 requests/hour
- High-quality curated photos
- Simple REST API
- No attribution required for most use cases
- Good search relevance

**Cons**:
- Rate limits (50/hour = ~1200/day)
- Requires API key registration

**Implementation**:
```javascript
// New file: src/tools/image-search.js
async function searchUnsplash(query, count = 1) {
  const response = await fetch(
    `https://api.unsplash.com/search/photos?query=${encodeURIComponent(query)}&per_page=${count}`,
    {
      headers: {
        'Authorization': `Client-ID ${process.env.UNSPLASH_ACCESS_KEY}`
      }
    }
  );
  const data = await response.json();
  return data.results.map(img => ({
    url: img.urls.small,
    thumb: img.urls.thumb,
    author: img.user.name,
    authorUrl: img.user.links.html
  }));
}
```

#### Option B: Pexels API
**Pros**:
- Free tier: 200 requests/hour
- Higher rate limit than Unsplash
- Good quality stock photos
- Simple API

**Cons**:
- Requires attribution
- Slightly less curated than Unsplash

#### Option C: Bing Image Search API (Microsoft Azure)
**Pros**:
- 1000 transactions/month free
- Most comprehensive search results
- Returns diverse sources

**Cons**:
- Requires Azure account
- More complex pricing structure
- Potential copyright issues with results

### Implementation Plan

**Phase 1: Backend Integration** (4 hours)
1. Create `src/tools/image-search.js` module
   - Implement Unsplash API client
   - Add caching layer (store results in memory for 1 hour)
   - Handle rate limiting gracefully
2. Update `src/endpoints/feed.js`:
   - Call image search for each feed item's `imageSearchTerms`
   - Include image URLs in feed item response
   - Fall back to placeholder if search fails
3. Add environment variables:
   - `UNSPLASH_ACCESS_KEY`
   - `IMAGE_SEARCH_CACHE_TTL=3600`

**Phase 2: Frontend Integration** (2 hours)
1. Update `FeedItem.tsx`:
   - Display actual images from search results
   - Add loading state for images
   - Show image attribution (required by Unsplash)
   - Fall back to placeholder on error
2. Add image optimization:
   - Use `loading="lazy"` for images
   - Serve appropriate image size (small vs full)

**Phase 3: Testing & Optimization** (2 hours)
1. Test with various search terms
2. Monitor rate limit usage
3. Implement fallback strategies:
   - Try multiple search terms if first fails
   - Cache popular search results
   - Use placeholder if quota exceeded

**Total Estimate**: 8 hours

### Success Metrics
- 90%+ of feed items have relevant images
- Image load time < 500ms
- No Unsplash rate limit errors
- User satisfaction with image relevance

### Future Enhancements
- Allow users to choose image provider (Unsplash, Pexels, etc.)
- Cache images in S3 to reduce API calls
- Add user option to disable images for faster load times

---

## 2. Quiz Analytics & Performance Tracking

### Goal
Provide detailed performance insights to help users track learning progress across topics and over time.

### Current State
- Quiz results stored in IndexedDB locally
- No aggregation or visualization
- No topic-based tracking
- No historical trends

### Proposed Solution

#### Data Model Enhancement

**New IndexedDB Structure** (`quiz_analytics`):
```typescript
interface QuizAnalytics {
  id: string;                    // quiz ID
  timestamp: number;             // completion time
  sourceSnippetId?: string;      // if generated from snippet
  sourceFeedItemId?: string;     // if generated from feed
  title: string;                 // quiz title
  topics: string[];              // extracted topics/keywords
  totalQuestions: number;        // 10
  correctAnswers: number;        // 0-10
  score: number;                 // percentage 0-100
  timeSpent: number;             // milliseconds
  questionStats: {
    questionId: string;
    correct: boolean;
    timeSpent: number;
    attempts: number;            // if retry enabled
  }[];
}

interface TopicPerformance {
  topic: string;
  quizzesTaken: number;
  averageScore: number;
  bestScore: number;
  worstScore: number;
  lastQuizDate: number;
  totalTimeSpent: number;
}
```

#### Analytics Dashboard Components

**1. Overview Stats** (similar to Billing page layout)
- Total quizzes taken
- Overall average score
- Total questions answered
- Study streak (days in a row)
- Total time spent

**2. Performance by Topic**
- Bar chart showing average score per topic
- Table with detailed stats per topic
- Click to see all quizzes for a topic

**3. Score Trends Over Time**
- Line chart showing score trends
- Filters: Last 7 days, 30 days, All time
- Trend indicator (improving/declining)

**4. Question-Level Insights**
- Most difficult questions (lowest success rate)
- Topics needing improvement (< 70% average)
- Recommended quiz topics based on performance

**5. Achievements/Milestones**
- Badges for milestones (10 quizzes, 100% score, etc.)
- Streak tracking
- Leaderboard (if multi-user)

### Implementation Plan

**Phase 1: Data Collection** (3 hours)
1. Update `QuizPage.tsx`:
   - Track quiz start time
   - Track time per question
   - Extract topics from quiz title and content
   - Store detailed analytics in IndexedDB
2. Create `src/db/quizAnalyticsDb.ts`:
   - CRUD operations for analytics
   - Aggregation queries (by topic, by time)
   - Data export functionality

**Phase 2: Analytics Dashboard UI** (6 hours)
1. Create `QuizAnalytics.tsx` component:
   - Overview cards with key metrics
   - Topic performance table
   - Score trend chart (using Chart.js or recharts)
2. Integrate with existing `QuizPage.tsx`:
   - Add "Analytics" tab/button
   - Show quick stats in quiz list view
3. Add data visualization:
   - Install `recharts` library
   - Create reusable chart components

**Phase 3: Insights & Recommendations** (4 hours)
1. Create recommendation engine:
   - Identify weak topics (< 70% score)
   - Suggest re-taking specific quizzes
   - Generate new quizzes for weak topics
2. Add insights panel:
   - "You're improving in X"
   - "Consider reviewing Y"
   - "Your best topic is Z"

**Phase 4: Export & Sync** (3 hours)
1. Add CSV export functionality
2. Optional: Sync analytics to Google Sheets
3. Add data privacy controls (clear history)

**Total Estimate**: 16 hours

### Success Metrics
- Users can see performance trends over time
- Users can identify weak topics < 1 minute
- Analytics load time < 500ms
- Data export completes in < 2 seconds

### Future Enhancements
- Spaced repetition scheduling
- AI-generated study plans
- Social features (compare with friends)
- Integration with external study tools

---

## 3. Feed Recommendations with ML-based Personalization

### Goal
Use machine learning techniques to personalize feed content based on user interaction patterns, improving relevance and engagement.

### Current State
- Feed uses static preferences (liked/disliked topics)
- Manual search terms configuration
- No learning from user behavior
- Simple stash/trash actions

### Proposed Solution

#### ML Approach: Collaborative Filtering + Content-Based

**Data Collection**:
```typescript
interface UserInteraction {
  feedItemId: string;
  action: 'stash' | 'trash' | 'view' | 'quiz' | 'skip';
  timestamp: number;
  itemType: 'didYouKnow' | 'questionAnswer';
  topics: string[];
  source: string;              // search result, swag snippet, etc.
  timeSpent: number;           // milliseconds viewing
}
```

**Recommendation Model**:
1. **Simple TF-IDF + Cosine Similarity** (Phase 1)
   - Extract keywords from stashed items
   - Weight by recency and frequency
   - Generate new content similar to liked items
   
2. **Neural Embedding** (Phase 2 - Advanced)
   - Use sentence-transformers to embed item content
   - Find similar items in embedding space
   - Cluster topics for diversity

#### Implementation Approach

**Phase 1: Data Collection & Simple Recommendations** (6 hours)

1. Create `src/services/feed-recommender.js`:
```javascript
class FeedRecommender {
  // Analyze user interaction history
  async analyzeUserPreferences(userId) {
    const interactions = await getFeedInteractions(userId);
    
    // Extract keywords from stashed items
    const stashedItems = interactions.filter(i => i.action === 'stash');
    const keywords = this.extractKeywords(stashedItems);
    
    // Weight by recency and frequency
    const topKeywords = this.rankKeywords(keywords);
    
    return {
      preferredTopics: topKeywords.slice(0, 10),
      avoidTopics: this.getTrash edTopics(interactions),
      timeOfDayPreference: this.analyzeTimePattern(interactions),
      contentTypePreference: this.analyzeTypePreference(interactions)
    };
  }
  
  // Extract keywords using TF-IDF
  extractKeywords(items) {
    const documents = items.map(i => i.content);
    const tfidf = new TfIdf();
    documents.forEach(doc => tfidf.addDocument(doc));
    
    // Get top keywords across all documents
    const keywords = [];
    tfidf.listTerms(0).slice(0, 50).forEach(term => {
      keywords.push({ term: term.term, score: term.tfidf });
    });
    
    return keywords;
  }
  
  // Generate search terms from preferences
  async generateSearchTerms(preferences) {
    const { preferredTopics, avoidTopics } = preferences;
    
    // Combine user preferences with trending topics
    const searchTerms = [
      ...preferredTopics.slice(0, 3),
      ...await this.getTrendingTopics()
    ];
    
    // Filter out avoided topics
    return searchTerms.filter(term => 
      !avoidTopics.some(avoid => term.includes(avoid))
    );
  }
}
```

2. Update `src/endpoints/feed.js`:
   - Use recommender to generate dynamic search terms
   - Rank feed items by relevance score
   - Track user interactions (views, time spent)

3. Update `FeedContext.tsx`:
   - Track detailed interactions
   - Send interaction data to backend for analysis
   - Update preferences incrementally

**Phase 2: Content Diversity & Exploration** (4 hours)

1. Implement exploration vs exploitation:
   - 80% content based on learned preferences
   - 20% diverse content for discovery
   
2. Add topic clustering:
   - Group similar topics together
   - Ensure feed has diverse topic coverage
   - Avoid showing too many items from same cluster

3. Add time-based preferences:
   - Learn preferred content types by time of day
   - Adjust content difficulty by engagement patterns

**Phase 3: Advanced ML (Optional - Long-term)** (20+ hours)

1. Implement sentence embeddings:
   - Use lightweight model (e.g., all-MiniLM-L6-v2)
   - Run on Lambda or use external API (Cohere, OpenAI)
   - Store embeddings in vector database

2. Build collaborative filtering:
   - Find similar users based on interaction patterns
   - Recommend items liked by similar users
   - Privacy-preserving (hash user IDs)

3. Add reinforcement learning:
   - Treat recommendations as multi-armed bandit problem
   - Use Thompson sampling for exploration
   - Update model based on feedback

### Implementation Plan

**Phase 1: Data Collection & Basic ML** (6 hours)
1. Create interaction tracking system
2. Implement TF-IDF-based keyword extraction
3. Build preference analyzer
4. Integrate with feed generation

**Phase 2: Smart Search Terms** (4 hours)
1. Auto-generate search terms from preferences
2. Implement topic diversity algorithm
3. Add trending topics discovery

**Phase 3: Continuous Learning** (6 hours)
1. Update preferences incrementally on each interaction
2. Add feedback mechanism (thumbs up/down on items)
3. Implement A/B testing framework for recommendation strategies

**Total Estimate**: 16 hours (basic), 36+ hours (advanced ML)

### Technical Considerations

**Libraries Needed**:
- `natural` (NLP, TF-IDF) - Node.js
- `compromise` (keyword extraction) - Node.js
- Optional: `@tensorflow/tfjs-node` for advanced ML
- Optional: Vector database (Pinecone, Weaviate) for embeddings

**Privacy & Ethics**:
- All ML happens on user's own data
- No cross-user data sharing without consent
- Option to disable personalization
- Clear data deletion controls

**Performance**:
- ML computations run async (don't block feed generation)
- Cache recommendations for 1 hour
- Incremental updates (not full retraining each time)

### Success Metrics
- Stash rate increases by 20%+
- Trash rate decreases by 30%+
- Average time spent per item increases
- User satisfaction score improves

### Future Enhancements
- Multi-modal learning (text + images)
- Social recommendations (friends' preferences)
- Topic evolution tracking (interests change over time)
- External knowledge graph integration

---

## Priority Ranking

Based on implementation complexity and user value:

1. **Image Search Integration** (High Value, Low Complexity) - 8 hours
   - Immediate visual improvement
   - Relatively simple to implement
   - Low maintenance overhead

2. **Quiz Analytics** (High Value, Medium Complexity) - 16 hours
   - Provides clear learning insights
   - No external dependencies
   - Good user engagement driver

3. **Feed Recommendations** (Medium Value, High Complexity) - 16-36 hours
   - Requires ongoing tuning
   - Benefits increase over time
   - Complex to test and validate

## Next Steps

1. **Immediate** (this week):
   - Register for Unsplash API key
   - Implement image search integration (Task #6)

2. **Short-term** (next 2 weeks):
   - Build quiz analytics dashboard (Task #7)
   - Add data collection infrastructure

3. **Long-term** (next month):
   - Start Phase 1 of feed recommendations (Task #8)
   - Test and iterate based on user feedback

---

## Resources Required

**API Keys**:
- Unsplash Access Key (free tier)
- Optional: Pexels API Key (backup)

**npm Packages**:
- `recharts` - Data visualization (Quiz Analytics)
- `natural` - NLP/TF-IDF (Feed Recommendations)
- `compromise` - Keyword extraction (Feed Recommendations)

**Infrastructure**:
- IndexedDB for local analytics storage
- Optional: S3 bucket for image caching
- Optional: Vector database for advanced ML

**Time Investment**:
- Image Search: 8 hours
- Quiz Analytics: 16 hours  
- Feed Recommendations: 16-36 hours
- **Total**: 40-60 hours

---

## Risk Assessment

**Image Search**:
- Risk: API rate limits
- Mitigation: Caching, fallback providers

**Quiz Analytics**:
- Risk: IndexedDB storage limits (50MB-100MB typical)
- Mitigation: Data retention policies, export/archive old data

**Feed Recommendations**:
- Risk: Poor recommendation quality
- Mitigation: A/B testing, user feedback, manual override option
- Risk: Privacy concerns
- Mitigation: Local-first ML, transparent data usage

---

**Document Version**: 1.0  
**Last Updated**: October 28, 2025
