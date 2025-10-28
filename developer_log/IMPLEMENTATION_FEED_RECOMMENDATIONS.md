# Feed Recommendations with ML - Implementation Plan

**Feature**: ML-Based Feed Content Personalization  
**Status**: PLANNING  
**Priority**: MEDIUM-LOW (Advanced Feature)  
**Estimated Effort**: 20-30 hours (Basic: 20h, Advanced: +10-20h)  
**Target Completion**: December 2025 - January 2026

---

## Table of Contents

1. [Executive Summary](#executive-summary)
2. [Goals & Success Metrics](#goals--success-metrics)
3. [ML Strategy Overview](#ml-strategy-overview)
4. [Phase 1: Data-Driven Search Terms](#phase-1-data-driven-search-terms)
5. [Phase 2: Content Ranking & Filtering](#phase-2-content-ranking--filtering)
6. [Phase 3: Advanced ML (Optional)](#phase-3-advanced-ml-optional)
7. [Technical Architecture](#technical-architecture)
8. [Implementation Roadmap](#implementation-roadmap)
9. [Privacy & Ethics](#privacy--ethics)
10. [Testing & Evaluation](#testing--evaluation)

---

## Executive Summary

The Feed Recommendations system uses machine learning to personalize feed content based on user interaction patterns. Instead of static, manually-configured search terms, the system learns what content users find valuable and automatically generates relevant feed items.

**Core Concept**: Learn from user behavior (stash/trash actions, view time) to:
1. Generate better search terms automatically
2. Rank and filter generated content by relevance
3. Balance exploration (new topics) with exploitation (known interests)
4. Continuously adapt to changing user preferences

**Approach**: Start simple (TF-IDF + heuristics), then optionally add advanced ML (embeddings, neural networks) if needed.

**Key Differentiator**: Privacy-first, client-side ML - all learning happens on the user's device, no data sent to servers.

---

## Goals & Success Metrics

### Primary Goals

1. **Increase Engagement**
   - Target: +20% stash rate vs manual search terms
   - Target: -30% trash rate vs manual search terms
   - Target: +15% average time spent per item

2. **Reduce Manual Configuration**
   - Auto-generate 80% of search terms from user history
   - Require minimal user input for good results
   - Adapt to changing interests over time

3. **Improve Content Relevance**
   - Match content to user's demonstrated interests
   - Avoid repetitive or low-quality suggestions
   - Maintain topic diversity (avoid filter bubbles)

4. **Enable Discovery**
   - 20% of content should be exploratory (new topics)
   - Introduce related topics user hasn't seen
   - Surface trending or high-quality content

### Success Metrics

- ✅ Stash rate increases by 20%+ (baseline: current manual rate)
- ✅ Trash rate decreases by 30%+
- ✅ Average session length increases by 15%+
- ✅ User satisfaction score > 4/5 (survey)
- ✅ Recommendation generation time < 2 seconds
- ✅ Storage overhead < 5MB
- ✅ Model update time < 500ms

### Key Assumptions

- Users have completed at least 10 feed generations (training data)
- Users stash/trash items consistently (signal quality)
- Topics can be extracted from content with reasonable accuracy
- User preferences change slowly (not day-to-day)

---

## ML Strategy Overview

### Three-Phase Approach

```
┌─────────────────────────────────────────────────────────────┐
│ Phase 1: Data-Driven Search Terms (Simple, High ROI)       │
│ • Extract keywords from stashed items (TF-IDF)             │
│ • Weight by recency and frequency                          │
│ • Generate dynamic search terms                            │
│ Complexity: LOW | Impact: HIGH | Time: 8 hours             │
└─────────────────────────────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────────┐
│ Phase 2: Content Ranking & Filtering (Medium Complexity)   │
│ • Score generated items by similarity to user preferences  │
│ • Filter low-quality or repetitive content                 │
│ • Balance exploration vs exploitation                      │
│ Complexity: MEDIUM | Impact: MEDIUM | Time: 12 hours       │
└─────────────────────────────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────────┐
│ Phase 3: Advanced ML (Optional, Long-term)                 │
│ • Sentence embeddings for semantic similarity              │
│ • Neural network for preference prediction                 │
│ • Collaborative filtering (if multi-user)                  │
│ Complexity: HIGH | Impact: LOW-MEDIUM | Time: 20+ hours    │
└─────────────────────────────────────────────────────────────┘
```

### Why This Approach?

1. **Incremental Value**: Each phase delivers value independently
2. **Risk Mitigation**: Start simple, add complexity only if needed
3. **Fast Iteration**: Phase 1 can ship in 1 week
4. **User Feedback**: Test each phase before investing in next
5. **Performance**: Simple methods often work well enough

---

## Phase 1: Data-Driven Search Terms

**Goal**: Automatically generate search terms based on user's stashed content

**Estimated Effort**: 8 hours

### 1.1 Overview

Instead of manually configuring search terms like ["AI", "machine learning"], the system:
1. Analyzes titles and content of stashed feed items
2. Extracts important keywords using TF-IDF
3. Weights keywords by recency and frequency
4. Generates 5-10 search terms automatically
5. Falls back to manual terms if insufficient data

### 1.2 Implementation

**File**: `ui-new/src/services/FeedRecommendationEngine.ts`

```typescript
import { feedAnalyticsDb } from '../db/feedAnalyticsDb';
import { ItemInteraction } from '../types/feedAnalytics';

export class FeedRecommendationEngine {
  
  /**
   * Generate personalized search terms based on user history
   */
  async generateSearchTerms(options: {
    count?: number;           // Number of terms to generate (default: 5)
    includeManual?: boolean;  // Include user's manual search terms (default: true)
    diversityFactor?: number; // 0-1, higher = more diverse (default: 0.3)
  } = {}): Promise<string[]> {
    
    const {
      count = 5,
      includeManual = true,
      diversityFactor = 0.3
    } = options;
    
    // Get stashed items from last 30 days
    const thirtyDaysAgo = Date.now() - (30 * 24 * 60 * 60 * 1000);
    const stashedInteractions = await feedAnalyticsDb.itemInteractions
      .where('action')
      .equals('stash')
      .and(item => item.timestamp >= thirtyDaysAgo)
      .toArray();
    
    if (stashedInteractions.length < 3) {
      // Not enough data, use defaults or manual terms
      console.log('Insufficient data for personalized recommendations');
      return this.getDefaultSearchTerms(count);
    }
    
    // Extract and score keywords
    const keywordScores = this.extractKeywordsWithTFIDF(stashedInteractions);
    
    // Apply recency weighting (newer items get higher weight)
    const weightedScores = this.applyRecencyWeighting(keywordScores, stashedInteractions);
    
    // Apply diversity (avoid too similar terms)
    const diverseTerms = this.selectDiverseTerms(weightedScores, count, diversityFactor);
    
    // Optionally mix with manual search terms
    if (includeManual) {
      const manualTerms = await this.getUserManualSearchTerms();
      return this.mergeTerms(diverseTerms, manualTerms, count);
    }
    
    return diverseTerms.slice(0, count);
  }
  
  /**
   * Extract keywords using TF-IDF
   */
  private extractKeywordsWithTFIDF(interactions: ItemInteraction[]): Map<string, number> {
    // Build document corpus (each stashed item is a document)
    const documents = interactions.map(i => this.tokenize(i.title));
    
    // Calculate term frequency for each document
    const termFrequencies = documents.map(doc => {
      const tf = new Map<string, number>();
      doc.forEach(term => {
        tf.set(term, (tf.get(term) || 0) + 1);
      });
      // Normalize by document length
      doc.forEach(term => {
        tf.set(term, tf.get(term)! / doc.length);
      });
      return tf;
    });
    
    // Calculate inverse document frequency
    const allTerms = new Set<string>();
    documents.forEach(doc => doc.forEach(term => allTerms.add(term)));
    
    const idf = new Map<string, number>();
    allTerms.forEach(term => {
      const docsWithTerm = documents.filter(doc => doc.includes(term)).length;
      idf.set(term, Math.log(documents.length / docsWithTerm));
    });
    
    // Calculate TF-IDF scores
    const tfidfScores = new Map<string, number>();
    termFrequencies.forEach((tf, docIdx) => {
      tf.forEach((tfValue, term) => {
        const tfidfScore = tfValue * (idf.get(term) || 0);
        tfidfScores.set(term, (tfidfScores.get(term) || 0) + tfidfScore);
      });
    });
    
    return tfidfScores;
  }
  
  /**
   * Apply recency weighting (exponential decay)
   */
  private applyRecencyWeighting(
    scores: Map<string, number>, 
    interactions: ItemInteraction[]
  ): Map<string, number> {
    
    const now = Date.now();
    const halfLife = 7 * 24 * 60 * 60 * 1000; // 7 days in milliseconds
    
    const weightedScores = new Map<string, number>();
    
    interactions.forEach(interaction => {
      const age = now - interaction.timestamp;
      const recencyWeight = Math.exp(-age / halfLife); // Exponential decay
      
      const terms = this.tokenize(interaction.title);
      terms.forEach(term => {
        const baseScore = scores.get(term) || 0;
        const weighted = baseScore * recencyWeight;
        weightedScores.set(term, (weightedScores.get(term) || 0) + weighted);
      });
    });
    
    return weightedScores;
  }
  
  /**
   * Select diverse terms (avoid redundancy)
   */
  private selectDiverseTerms(
    scores: Map<string, number>, 
    count: number, 
    diversityFactor: number
  ): string[] {
    
    // Sort by score
    const sorted = Array.from(scores.entries())
      .sort((a, b) => b[1] - a[1]);
    
    const selected: string[] = [];
    const selectedSet = new Set<string>();
    
    for (const [term, score] of sorted) {
      if (selected.length >= count) break;
      
      // Check diversity (avoid very similar terms)
      const isDiverse = selected.every(existingTerm => 
        this.calculateSimilarity(term, existingTerm) < diversityFactor
      );
      
      if (isDiverse || selected.length === 0) {
        selected.push(term);
        selectedSet.add(term);
      }
    }
    
    return selected;
  }
  
  /**
   * Tokenize text (simple word splitting + filtering)
   */
  private tokenize(text: string): string[] {
    const stopWords = new Set([
      'the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for',
      'is', 'are', 'was', 'were', 'be', 'been', 'being', 'have', 'has', 'had',
      'do', 'does', 'did', 'will', 'would', 'could', 'should', 'may', 'might',
      'can', 'this', 'that', 'these', 'those', 'i', 'you', 'he', 'she', 'it',
      'we', 'they', 'what', 'which', 'who', 'when', 'where', 'why', 'how'
    ]);
    
    return text
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, ' ')  // Remove punctuation
      .split(/\s+/)
      .filter(word => 
        word.length > 3 &&           // Min 4 characters
        !stopWords.has(word) &&      // Not a stop word
        !/^\d+$/.test(word)          // Not pure numbers
      );
  }
  
  /**
   * Calculate term similarity (Jaccard similarity on character n-grams)
   */
  private calculateSimilarity(term1: string, term2: string): number {
    const ngrams1 = this.getNGrams(term1, 2);
    const ngrams2 = this.getNGrams(term2, 2);
    
    const intersection = ngrams1.filter(ng => ngrams2.includes(ng)).length;
    const union = new Set([...ngrams1, ...ngrams2]).size;
    
    return union > 0 ? intersection / union : 0;
  }
  
  /**
   * Get character n-grams
   */
  private getNGrams(text: string, n: number): string[] {
    const grams: string[] = [];
    for (let i = 0; i <= text.length - n; i++) {
      grams.push(text.substring(i, i + n));
    }
    return grams;
  }
  
  /**
   * Get user's manual search terms from settings
   */
  private async getUserManualSearchTerms(): Promise<string[]> {
    // This would come from FeedContext or user settings
    // For now, return empty array
    return [];
  }
  
  /**
   * Merge generated and manual terms
   */
  private mergeTerms(
    generatedTerms: string[], 
    manualTerms: string[], 
    maxCount: number
  ): string[] {
    
    // Take top 60% from generated, 40% from manual
    const generatedCount = Math.ceil(maxCount * 0.6);
    const manualCount = Math.floor(maxCount * 0.4);
    
    const merged = [
      ...generatedTerms.slice(0, generatedCount),
      ...manualTerms.slice(0, manualCount)
    ];
    
    // Remove duplicates, preserve order
    return Array.from(new Set(merged)).slice(0, maxCount);
  }
  
  /**
   * Get default search terms when insufficient data
   */
  private getDefaultSearchTerms(count: number): string[] {
    const defaults = [
      'technology',
      'science',
      'artificial intelligence',
      'programming',
      'web development',
      'machine learning',
      'history',
      'psychology',
      'business',
      'innovation'
    ];
    
    return defaults.slice(0, count);
  }
  
  /**
   * Get recommended topics user should explore
   */
  async getRecommendedTopics(count: number = 5): Promise<{
    topic: string;
    reason: string;
    confidence: number;
  }[]> {
    
    // Get user's stashed topics
    const stashedTopics = await this.getUserStashedTopics();
    
    // Get related topics (simple approach: find topics that co-occur with user's interests)
    const relatedTopics = this.findRelatedTopics(stashedTopics);
    
    // Get trending topics (from search term performance)
    const trendingTopics = await this.getTrendingTopics();
    
    // Combine and rank
    const recommendations = [
      ...relatedTopics.map(t => ({
        topic: t,
        reason: 'Related to your interests',
        confidence: 0.8
      })),
      ...trendingTopics.map(t => ({
        topic: t,
        reason: 'Popular topic',
        confidence: 0.6
      }))
    ];
    
    return recommendations.slice(0, count);
  }
  
  /**
   * Get topics from user's stashed items
   */
  private async getUserStashedTopics(): Promise<string[]> {
    const stashed = await feedAnalyticsDb.itemInteractions
      .where('action')
      .equals('stash')
      .toArray();
    
    const topicCounts = new Map<string, number>();
    stashed.forEach(item => {
      topicCounts.set(item.topic, (topicCounts.get(item.topic) || 0) + 1);
    });
    
    return Array.from(topicCounts.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([topic]) => topic);
  }
  
  /**
   * Find topics related to user's interests (simple co-occurrence)
   */
  private findRelatedTopics(userTopics: string[]): string[] {
    // This is a simplified version
    // In production, you'd use a topic graph or knowledge base
    
    const topicRelations: Record<string, string[]> = {
      'javascript': ['typescript', 'react', 'node.js', 'web development'],
      'python': ['data science', 'machine learning', 'django', 'flask'],
      'ai': ['machine learning', 'deep learning', 'neural networks', 'nlp'],
      'web': ['html', 'css', 'javascript', 'frontend', 'backend']
    };
    
    const related = new Set<string>();
    userTopics.forEach(topic => {
      const relatedList = topicRelations[topic] || [];
      relatedList.forEach(r => related.add(r));
    });
    
    // Remove topics user already knows
    userTopics.forEach(topic => related.delete(topic));
    
    return Array.from(related).slice(0, 5);
  }
  
  /**
   * Get trending topics (from search term performance)
   */
  private async getTrendingTopics(): Promise<string[]> {
    const searchTerms = await feedAnalyticsDb.searchTermPerformance
      .orderBy('effectivenessScore')
      .reverse()
      .limit(10)
      .toArray();
    
    return searchTerms.map(st => st.searchTerm);
  }
}

export const feedRecommendationEngine = new FeedRecommendationEngine();
```

### 1.3 Integration with FeedContext

**File**: `ui-new/src/contexts/FeedContext.tsx` (modifications)

```typescript
import { feedRecommendationEngine } from '../services/FeedRecommendationEngine';

// Add state for personalized mode
const [usePersonalizedTerms, setUsePersonalizedTerms] = useState(true);

// Modify feed generation
const generateFeed = async () => {
  let searchTerms: string[];
  
  if (usePersonalizedTerms) {
    // Use ML-generated search terms
    searchTerms = await feedRecommendationEngine.generateSearchTerms({
      count: 5,
      includeManual: true,
      diversityFactor: 0.3
    });
    
    console.log('🤖 Using personalized search terms:', searchTerms);
  } else {
    // Use manual search terms (existing behavior)
    searchTerms = manualSearchTerms;
  }
  
  // Rest of existing feed generation logic...
  // Call backend with searchTerms
};

// Add UI toggle
<button onClick={() => setUsePersonalizedTerms(!usePersonalizedTerms)}>
  {usePersonalizedTerms ? '🤖 Personalized' : '✍️ Manual'}
</button>
```

### 1.4 Testing Phase 1

**Success Criteria**:
- ✅ Generates 5 search terms in < 2 seconds
- ✅ Terms are relevant to user's stashed content
- ✅ No duplicate or very similar terms
- ✅ Falls back gracefully when insufficient data
- ✅ Stash rate improves by 10%+ vs manual

---

## Phase 2: Content Ranking & Filtering

**Goal**: Score and filter generated feed items by relevance

**Estimated Effort**: 12 hours

### 2.1 Overview

After generating feed content (using Phase 1 search terms), rank items by:
1. **Similarity** to user's stashed content
2. **Diversity** (avoid too similar items in same feed)
3. **Novelty** (prefer new topics, not repetitive)
4. **Quality** signals (length, structure, etc.)

Then filter out:
- Items too similar to previously trashed content
- Duplicate or near-duplicate items
- Low-quality items (too short, poor structure)

### 2.2 Implementation

**File**: `ui-new/src/services/FeedRecommendationEngine.ts` (additions)

```typescript
/**
 * Rank and filter feed items by relevance
 */
async rankFeedItems(items: any[]): Promise<any[]> {
  // Build user preference profile
  const userProfile = await this.buildUserProfile();
  
  // Score each item
  const scoredItems = items.map(item => ({
    ...item,
    relevanceScore: this.calculateRelevanceScore(item, userProfile),
    diversityPenalty: 0,  // Will be calculated after sorting
    noveltyBonus: this.calculateNoveltyBonus(item, userProfile)
  }));
  
  // Sort by relevance
  scoredItems.sort((a, b) => 
    (b.relevanceScore + b.noveltyBonus) - 
    (a.relevanceScore + a.noveltyBonus)
  );
  
  // Apply diversity constraint (penalize similar consecutive items)
  const diverseItems = this.ensureDiversity(scoredItems);
  
  // Filter out low-quality and trash-similar items
  const filtered = diverseItems.filter(item => 
    item.relevanceScore > 0.3 &&  // Minimum relevance threshold
    !this.isSimilarToTrashedContent(item, userProfile)
  );
  
  return filtered;
}

/**
 * Build user preference profile from history
 */
private async buildUserProfile(): Promise<{
  preferredKeywords: Map<string, number>;
  trashedKeywords: Map<string, number>;
  preferredTopics: string[];
  trashedTopics: string[];
  averageLength: number;
}> {
  
  const stashed = await feedAnalyticsDb.itemInteractions
    .where('action')
    .equals('stash')
    .toArray();
  
  const trashed = await feedAnalyticsDb.itemInteractions
    .where('action')
    .equals('trash')
    .toArray();
  
  // Extract preferred keywords (from stashed)
  const preferredKeywords = new Map<string, number>();
  stashed.forEach(item => {
    this.tokenize(item.title).forEach(keyword => {
      preferredKeywords.set(keyword, (preferredKeywords.get(keyword) || 0) + 1);
    });
  });
  
  // Extract trashed keywords
  const trashedKeywords = new Map<string, number>();
  trashed.forEach(item => {
    this.tokenize(item.title).forEach(keyword => {
      trashedKeywords.set(keyword, (trashedKeywords.get(keyword) || 0) + 1);
    });
  });
  
  return {
    preferredKeywords,
    trashedKeywords,
    preferredTopics: this.extractTopics(stashed),
    trashedTopics: this.extractTopics(trashed),
    averageLength: this.calculateAverageLength(stashed)
  };
}

/**
 * Calculate relevance score for an item
 */
private calculateRelevanceScore(item: any, userProfile: any): number {
  const itemKeywords = this.tokenize(item.title + ' ' + item.content);
  
  // Cosine similarity with user's preferred keywords
  let score = 0;
  let totalPreferredWeight = 0;
  
  userProfile.preferredKeywords.forEach((weight: number, keyword: string) => {
    if (itemKeywords.includes(keyword)) {
      score += weight;
    }
    totalPreferredWeight += weight;
  });
  
  // Normalize
  if (totalPreferredWeight > 0) {
    score = score / totalPreferredWeight;
  }
  
  // Penalize if contains trashed keywords
  userProfile.trashedKeywords.forEach((weight: number, keyword: string) => {
    if (itemKeywords.includes(keyword)) {
      score -= weight * 0.5;  // 50% penalty
    }
  });
  
  return Math.max(0, Math.min(1, score));  // Clamp to [0, 1]
}

/**
 * Calculate novelty bonus (prefer new topics)
 */
private calculateNoveltyBonus(item: any, userProfile: any): number {
  const itemTopic = item.topic || 'general';
  
  // If topic is completely new, give bonus
  if (!userProfile.preferredTopics.includes(itemTopic) &&
      !userProfile.trashedTopics.includes(itemTopic)) {
    return 0.2;  // 20% bonus
  }
  
  return 0;
}

/**
 * Ensure diversity in feed (no consecutive similar items)
 */
private ensureDiversity(items: any[]): any[] {
  const result: any[] = [];
  const usedTopics = new Set<string>();
  
  // First pass: pick one item per topic
  items.forEach(item => {
    if (!usedTopics.has(item.topic)) {
      result.push(item);
      usedTopics.add(item.topic);
    }
  });
  
  // Second pass: fill remaining slots with best items
  const remaining = items.filter(item => !result.includes(item));
  result.push(...remaining);
  
  return result;
}

/**
 * Check if item is similar to trashed content
 */
private isSimilarToTrashedContent(item: any, userProfile: any): boolean {
  const itemKeywords = new Set(this.tokenize(item.title));
  
  // If > 50% overlap with trashed keywords, reject
  let trashedOverlap = 0;
  let totalTrashedWeight = 0;
  
  userProfile.trashedKeywords.forEach((weight: number, keyword: string) => {
    totalTrashedWeight += weight;
    if (itemKeywords.has(keyword)) {
      trashedOverlap += weight;
    }
  });
  
  return totalTrashedWeight > 0 && 
         (trashedOverlap / totalTrashedWeight) > 0.5;
}
```

### 2.3 Testing Phase 2

**Success Criteria**:
- ✅ Ranking completes in < 500ms for 20 items
- ✅ Top-ranked items have higher stash rate
- ✅ Diversity: No more than 2 items from same topic in top 5
- ✅ Filters out 80%+ of trash-similar content

---

## Phase 3: Advanced ML (Optional)

**Note**: This phase is OPTIONAL and should only be pursued if Phase 1+2 results are insufficient.

**Estimated Effort**: 20+ hours

### 3.1 Sentence Embeddings

Use pre-trained models to embed content as vectors, then use cosine similarity for ranking.

**Library**: `@xenova/transformers` (ONNX runtime for browser)

**Model**: `all-MiniLM-L6-v2` (lightweight, 80MB)

**Pros**:
- Better semantic understanding
- Captures meaning beyond keywords
- Pre-trained, no training needed

**Cons**:
- Large download (80MB model)
- Slower (200-500ms per inference)
- More complex integration

### 3.2 Implementation (High-Level)

```typescript
import { pipeline } from '@xenova/transformers';

// Load model once
const embedder = await pipeline('feature-extraction', 'Xenova/all-MiniLM-L6-v2');

// Embed user profile (stashed content)
const userProfileEmbedding = await this.embedUserProfile(embedder);

// Embed each feed item
const itemEmbeddings = await Promise.all(
  items.map(item => embedder(item.title + ' ' + item.content))
);

// Calculate cosine similarity
const scores = itemEmbeddings.map(itemEmb => 
  this.cosineSimilarity(userProfileEmbedding, itemEmb)
);
```

---

## Implementation Roadmap

### Sprint 1: Phase 1 - Data-Driven Search Terms (1 week)

**Days 1-2**: Setup & Data Layer
- Create `FeedRecommendationEngine.ts`
- Implement TF-IDF keyword extraction
- Add recency weighting

**Days 3-4**: Integration
- Integrate with `FeedContext`
- Add UI toggle (personalized vs manual)
- Test with real user data

**Day 5**: Testing & Refinement
- A/B test personalized vs manual
- Measure stash/trash rates
- Collect user feedback

### Sprint 2: Phase 2 - Content Ranking (1.5 weeks)

**Days 1-3**: Ranking System
- Build user profile from history
- Implement relevance scoring
- Add diversity constraints

**Days 4-5**: Filtering
- Filter trash-similar content
- Quality checks
- Testing

**Days 6-7**: Optimization
- Performance tuning
- Edge case handling
- Documentation

### Sprint 3: Phase 3 - Advanced ML (Optional, 3+ weeks)

Only pursue if Phase 1+2 results show room for improvement.

---

## Privacy & Ethics

### Privacy-First Principles

1. **All Data Local**: No user data sent to servers
2. **No Tracking**: No cross-user data collection
3. **User Control**: Easy opt-out, clear explanations
4. **Data Export**: Users can export all their data
5. **Data Deletion**: Users can delete all ML models/data

### Filter Bubble Mitigation

1. **Exploration Rate**: 20% of content is exploratory
2. **Topic Diversity**: Max 30% of feed from one topic
3. **Novelty Bonus**: Prefer new topics user hasn't seen
4. **Manual Override**: Users can always use manual search terms

### Transparency

- Show users what the ML system learned (top keywords, topics)
- Explain why each feed item was recommended
- Allow users to provide feedback on recommendations

---

## Testing & Evaluation

### A/B Testing

**Metrics**:
- Stash rate (personalized vs manual)
- Trash rate
- Time spent per item
- User satisfaction (survey)

**Method**:
- 50/50 split: half users get personalized, half get manual
- Track for 2 weeks
- Analyze statistical significance (p < 0.05)

### User Feedback

**Survey Questions**:
1. How relevant was the feed content? (1-5 scale)
2. Did you discover new topics you liked? (Yes/No)
3. How often did you use personalized vs manual? (%)
4. What could be improved?

---

**Document Status**: COMPLETE  
**Last Updated**: October 28, 2025  
**Related Documents**: 
- `IMPLEMENTATION_FEED_ANALYTICS.md` (prerequisite)
- `LONG_TERM_FEATURE_PLANS.md` (overview)
