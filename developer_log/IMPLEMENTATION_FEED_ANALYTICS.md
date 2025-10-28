# Feed Usage Analytics - Implementation Plan

**Feature**: Feed Usage Analytics & Engagement Tracking  
**Status**: PLANNING  
**Priority**: MEDIUM  
**Estimated Effort**: 12-14 hours  
**Target Completion**: November 2025

---

## Table of Contents

1. [Executive Summary](#executive-summary)
2. [Goals & Success Metrics](#goals--success-metrics)
3. [Current State Analysis](#current-state-analysis)
4. [Architecture Overview](#architecture-overview)
5. [Data Models](#data-models)
6. [Implementation Phases](#implementation-phases)
7. [Analytics Dashboard](#analytics-dashboard)
8. [Backend Integration](#backend-integration)
9. [Privacy & Data Retention](#privacy--data-retention)
10. [Testing Strategy](#testing-strategy)

---

## Executive Summary

Feed Usage Analytics tracks how users interact with the Feed feature, providing insights into:
- Feed generation patterns (frequency, time of day, search terms)
- Content engagement (stash vs trash rates, time spent viewing)
- Image search performance (sources used, relevance)
- User preferences and behavior patterns

This data enables:
1. **Personalized Recommendations** - Better feed content based on user behavior
2. **Feature Optimization** - Identify what works and what doesn't
3. **User Insights** - Help users understand their learning patterns
4. **Performance Monitoring** - Track API costs and quota usage

**Key Principle**: Privacy-first, local-first analytics (data stays on user's device)

---

## Goals & Success Metrics

### Primary Goals

1. **Track Feed Generation**
   - Count: How many feeds generated per day/week/month
   - Timing: When users generate feeds (time of day patterns)
   - Sources: Which search terms/topics are most popular

2. **Measure Content Engagement**
   - Stash rate: % of items saved
   - Trash rate: % of items dismissed
   - View duration: Time spent reading each item
   - Click-through: External links clicked

3. **Monitor Image Search**
   - Provider usage: Unsplash vs Pexels
   - Success rate: % of items with images
   - Attribution tracking: Download tracking compliance
   - Rate limit monitoring: API quota usage

4. **Identify User Patterns**
   - Preferred content types (didYouKnow vs questionAnswer)
   - Topic preferences (which topics get stashed most)
   - Session patterns (how long between feeds)
   - Device usage (mobile vs desktop)

### Success Metrics

- ✅ Track 100% of feed generations with < 10ms overhead
- ✅ Engagement data captured for 95%+ of feed items
- ✅ Analytics dashboard loads in < 1 second
- ✅ Storage usage < 5MB for 1000 feed generations
- ✅ Zero data sent to backend (privacy-first)
- ✅ Users can export all analytics data as JSON/CSV

### Key Performance Indicators (KPIs)

**Engagement KPIs**:
- Average stash rate (target: > 30%)
- Average trash rate (target: < 20%)
- Average time per item (target: > 15 seconds)
- Feed regeneration rate (target: < 10% same-day regenerations)

**Technical KPIs**:
- Image search success rate (target: > 95%)
- API rate limit warnings (target: 0 per week)
- Average feed generation time (target: < 5 seconds)

---

## Current State Analysis

### Existing Feed System

**Location**: `ui-new/src/contexts/FeedContext.tsx`

**Current Capabilities**:
- ✅ Feed generation with customizable search terms
- ✅ Content type selection (didYouKnow, questionAnswer)
- ✅ Stash/trash actions
- ✅ Feed history storage
- ✅ Search term management

**Current Limitations**:
- ❌ No engagement tracking (stash/trash counts, timing)
- ❌ No analytics on search term effectiveness
- ❌ No time-based usage patterns
- ❌ No image search performance metrics
- ❌ No user behavior insights
- ❌ No visualization of usage statistics

### Existing Storage

**IndexedDB Stores** (via `FeedContext`):
```typescript
// Currently stored:
interface FeedItem {
  id: string;
  title: string;
  content: string;
  type: 'didYouKnow' | 'questionAnswer';
  source?: string;
  image?: string;
  imageAttribution?: string;
  timestamp?: number;
  stashed?: boolean;
  trashed?: boolean;
}

// Missing analytics fields:
// - Generation metadata (search terms, provider, cost)
// - Engagement timestamps (viewed, stashed, trashed)
// - Time spent viewing
// - Image search details
```

---

## Architecture Overview

### High-Level Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                      FeedContext.tsx                        │
│  ┌───────────────────────────────────────────────────────┐ │
│  │ Feed Generation   │   User Actions   │   Analytics    │ │
│  │ • Generate feed   │  • Stash item    │  • Track event │ │
│  │ • Fetch images    │  • Trash item    │  • Update stats│ │
│  │ • Save to DB      │  • View item     │  • Log metrics │ │
│  └───────────────────────────────────────────────────────┘ │
└────────────────────────┬────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────────┐
│            FeedAnalyticsService.ts                          │
│  ┌───────────────────────────────────────────────────────┐ │
│  │ • Track feed generation events                        │ │
│  │ • Track item interactions (stash/trash/view)          │ │
│  │ • Track image search performance                      │ │
│  │ • Calculate engagement metrics                        │ │
│  │ • Generate insights & recommendations                 │ │
│  │ • Export analytics data (CSV/JSON)                    │ │
│  └───────────────────────────────────────────────────────┘ │
└────────────────────────┬────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────────┐
│            feedAnalyticsDb.ts (IndexedDB)                   │
│  ┌──────────────────┐  ┌──────────────────┐               │
│  │ feed_generations │  │ item_interactions│               │
│  │ ─────────────── │  │ ──────────────── │               │
│  │ • id             │  │ • itemId         │               │
│  │ • timestamp      │  │ • action         │               │
│  │ • searchTerms[]  │  │ • timestamp      │               │
│  │ • itemCount      │  │ • timeSpent      │               │
│  │ • imagesFound    │  │ • feedGenId      │               │
│  │ • provider       │  │ • topic          │               │
│  │ • cost           │  └──────────────────┘               │
│  └──────────────────┘                                      │
│  ┌──────────────────┐  ┌──────────────────┐               │
│  │ search_term_perf │  │ usage_stats      │               │
│  │ ─────────────── │  │ ──────────────── │               │
│  │ • searchTerm     │  │ • date           │               │
│  │ • usageCount     │  │ • feedsGenerated │               │
│  │ • avgStashRate   │  │ • itemsStashed   │               │
│  │ • avgTrashRate   │  │ • itemsTrashed   │               │
│  │ • lastUsed       │  │ • timeSpent      │               │
│  └──────────────────┘  └──────────────────┘               │
└─────────────────────────────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────────┐
│          FeedAnalyticsDashboard.tsx                         │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐     │
│  │ Usage Stats  │  │ Engagement   │  │ Search Terms │     │
│  │  Overview    │  │   Metrics    │  │ Performance  │     │
│  └──────────────┘  └──────────────┘  └──────────────┘     │
└─────────────────────────────────────────────────────────────┘
```

---

## Data Models

### 1. FeedGeneration Schema

```typescript
// Location: ui-new/src/types/feedAnalytics.ts

export interface FeedGeneration {
  // Identity
  id: string;                          // UUID v4
  timestamp: number;                   // Unix timestamp (ms)
  
  // Generation Parameters
  searchTerms: string[];               // ["AI", "machine learning"]
  contentTypes: ('didYouKnow' | 'questionAnswer')[];
  itemCount: number;                   // 10
  
  // LLM Details
  provider: string;                    // "groq", "openai"
  model: string;                       // "llama-3.1-8b-instant"
  cost: number;                        // USD cost
  
  // Image Search
  imagesRequested: number;             // 10
  imagesFound: number;                 // 8
  unsplashUsed: number;                // 6
  pexelsUsed: number;                  // 2
  imageSearchFailed: number;           // 0
  
  // Performance
  generationTimeMs: number;            // Time to generate feed
  imageSearchTimeMs: number;           // Time to fetch images
  totalTimeMs: number;                 // Total time
  
  // User Context
  deviceType?: 'mobile' | 'tablet' | 'desktop';
  timeOfDay: 'morning' | 'afternoon' | 'evening' | 'night';  // 0-6, 6-12, 12-18, 18-24
  
  // Engagement Summary (updated as user interacts)
  itemsStashed: number;                // Count of stashed items
  itemsTrashed: number;                // Count of trashed items
  itemsViewed: number;                 // Count of viewed items
  averageViewTime: number;             // Average time spent per item (ms)
}
```

### 2. ItemInteraction Schema

```typescript
export interface ItemInteraction {
  // Identity
  id: string;                          // UUID v4
  itemId: string;                      // Feed item ID
  feedGenerationId: string;            // Parent feed generation ID
  timestamp: number;                   // Unix timestamp (ms)
  
  // Item Details
  title: string;                       // For later analysis
  type: 'didYouKnow' | 'questionAnswer';
  topic: string;                       // Extracted topic
  hasImage: boolean;                   // Did item have image?
  imageSource?: 'unsplash' | 'pexels';
  
  // Interaction
  action: 'view' | 'stash' | 'trash' | 'click_link' | 'generate_quiz';
  timeSpentMs?: number;                // Time spent viewing (for 'view' action)
  
  // Context
  position: number;                    // Position in feed (0-9)
  deviceType?: 'mobile' | 'tablet' | 'desktop';
}
```

### 3. SearchTermPerformance Schema

```typescript
export interface SearchTermPerformance {
  searchTerm: string;                  // "artificial intelligence"
  
  // Usage
  usageCount: number;                  // Times used
  lastUsed: number;                    // Unix timestamp
  firstUsed: number;                   // Unix timestamp
  
  // Engagement
  totalItemsGenerated: number;         // Total items created with this term
  totalItemsStashed: number;           // Items stashed
  totalItemsTrashed: number;           // Items trashed
  
  // Metrics
  averageStashRate: number;            // Percentage (0-100)
  averageTrashRate: number;            // Percentage (0-100)
  averageViewTime: number;             // Milliseconds
  
  // Image Performance
  imageSuccessRate: number;            // % of items that got images
  
  // Effectiveness Score (calculated)
  effectivenessScore: number;          // 0-100 (based on stash rate, view time)
}
```

### 4. UsageStats Schema (Daily Aggregates)

```typescript
export interface UsageStats {
  date: string;                        // "2025-10-28" (ISO date)
  
  // Feed Generation
  feedsGenerated: number;              // 5
  totalItems: number;                  // 50
  
  // Engagement
  itemsStashed: number;                // 15
  itemsTrashed: number;                // 10
  itemsViewed: number;                 // 40
  
  // Time
  totalTimeSpent: number;              // Milliseconds
  averageSessionDuration: number;      // Milliseconds
  
  // Cost
  totalCost: number;                   // USD
  
  // Image Search
  totalImagesRequested: number;        // 50
  totalImagesFound: number;            // 45
  unsplashImages: number;              // 30
  pexelsImages: number;                // 15
}
```

---

## Implementation Phases

### Phase 1: Data Layer & Tracking (4 hours)

#### 1.1 Create IndexedDB Schema

**File**: `ui-new/src/db/feedAnalyticsDb.ts`

```typescript
import Dexie, { Table } from 'dexie';
import { 
  FeedGeneration, 
  ItemInteraction, 
  SearchTermPerformance, 
  UsageStats 
} from '../types/feedAnalytics';

class FeedAnalyticsDatabase extends Dexie {
  feedGenerations!: Table<FeedGeneration, string>;
  itemInteractions!: Table<ItemInteraction, string>;
  searchTermPerformance!: Table<SearchTermPerformance, string>;
  usageStats!: Table<UsageStats, string>;

  constructor() {
    super('FeedAnalyticsDB');
    
    this.version(1).stores({
      feedGenerations: 'id, timestamp, *searchTerms, timeOfDay, provider',
      itemInteractions: 'id, itemId, feedGenerationId, action, timestamp, topic',
      searchTermPerformance: 'searchTerm, usageCount, effectivenessScore, lastUsed',
      usageStats: 'date, feedsGenerated'
    });
  }
}

export const feedAnalyticsDb = new FeedAnalyticsDatabase();
```

#### 1.2 Create Analytics Service

**File**: `ui-new/src/services/FeedAnalyticsService.ts`

```typescript
import { feedAnalyticsDb } from '../db/feedAnalyticsDb';
import { 
  FeedGeneration, 
  ItemInteraction, 
  SearchTermPerformance, 
  UsageStats 
} from '../types/feedAnalytics';
import { v4 as uuidv4 } from 'uuid';
import { format } from 'date-fns';

export class FeedAnalyticsService {
  
  /**
   * Track feed generation
   */
  async trackFeedGeneration(feed: {
    searchTerms: string[];
    contentTypes: string[];
    items: any[];
    provider: string;
    model: string;
    cost: number;
    generationTimeMs: number;
    imageSearchTimeMs: number;
    imagesFound: number;
    unsplashUsed: number;
    pexelsUsed: number;
  }): Promise<string> {
    
    const feedGenId = uuidv4();
    const now = Date.now();
    
    const generation: FeedGeneration = {
      id: feedGenId,
      timestamp: now,
      searchTerms: feed.searchTerms,
      contentTypes: feed.contentTypes as any,
      itemCount: feed.items.length,
      provider: feed.provider,
      model: feed.model,
      cost: feed.cost,
      imagesRequested: feed.items.length,
      imagesFound: feed.imagesFound,
      unsplashUsed: feed.unsplashUsed,
      pexelsUsed: feed.pexelsUsed,
      imageSearchFailed: feed.items.length - feed.imagesFound,
      generationTimeMs: feed.generationTimeMs,
      imageSearchTimeMs: feed.imageSearchTimeMs,
      totalTimeMs: feed.generationTimeMs + feed.imageSearchTimeMs,
      deviceType: this.getDeviceType(),
      timeOfDay: this.getTimeOfDay(now),
      itemsStashed: 0,
      itemsTrashed: 0,
      itemsViewed: 0,
      averageViewTime: 0
    };
    
    // Save to IndexedDB
    await feedAnalyticsDb.feedGenerations.add(generation);
    
    // Update search term performance
    await this.updateSearchTermPerformance(feed.searchTerms);
    
    // Update daily usage stats
    await this.updateUsageStats(generation);
    
    return feedGenId;
  }
  
  /**
   * Track item interaction (view, stash, trash)
   */
  async trackItemInteraction(interaction: {
    itemId: string;
    feedGenerationId: string;
    title: string;
    type: string;
    action: 'view' | 'stash' | 'trash' | 'click_link' | 'generate_quiz';
    timeSpentMs?: number;
    position: number;
    hasImage: boolean;
    imageSource?: string;
  }) {
    
    const interactionRecord: ItemInteraction = {
      id: uuidv4(),
      itemId: interaction.itemId,
      feedGenerationId: interaction.feedGenerationId,
      timestamp: Date.now(),
      title: interaction.title,
      type: interaction.type as any,
      topic: this.extractTopic(interaction.title),
      hasImage: interaction.hasImage,
      imageSource: interaction.imageSource as any,
      action: interaction.action,
      timeSpentMs: interaction.timeSpentMs,
      position: interaction.position,
      deviceType: this.getDeviceType()
    };
    
    // Save interaction
    await feedAnalyticsDb.itemInteractions.add(interactionRecord);
    
    // Update feed generation engagement summary
    if (interaction.action === 'stash' || interaction.action === 'trash' || interaction.action === 'view') {
      await this.updateFeedEngagement(interaction.feedGenerationId, interaction.action, interaction.timeSpentMs);
    }
  }
  
  /**
   * Update feed generation engagement metrics
   */
  private async updateFeedEngagement(
    feedGenId: string, 
    action: 'view' | 'stash' | 'trash',
    timeSpentMs?: number
  ) {
    const generation = await feedAnalyticsDb.feedGenerations.get(feedGenId);
    if (!generation) return;
    
    const updates: Partial<FeedGeneration> = {};
    
    if (action === 'stash') {
      updates.itemsStashed = generation.itemsStashed + 1;
    } else if (action === 'trash') {
      updates.itemsTrashed = generation.itemsTrashed + 1;
    } else if (action === 'view' && timeSpentMs) {
      const totalViews = generation.itemsViewed + 1;
      const totalTime = (generation.averageViewTime * generation.itemsViewed) + timeSpentMs;
      updates.itemsViewed = totalViews;
      updates.averageViewTime = totalTime / totalViews;
    }
    
    await feedAnalyticsDb.feedGenerations.update(feedGenId, updates);
  }
  
  /**
   * Update search term performance metrics
   */
  private async updateSearchTermPerformance(searchTerms: string[]) {
    for (const term of searchTerms) {
      const existing = await feedAnalyticsDb.searchTermPerformance.get(term);
      
      if (existing) {
        await feedAnalyticsDb.searchTermPerformance.update(term, {
          usageCount: existing.usageCount + 1,
          lastUsed: Date.now()
        });
      } else {
        await feedAnalyticsDb.searchTermPerformance.add({
          searchTerm: term,
          usageCount: 1,
          lastUsed: Date.now(),
          firstUsed: Date.now(),
          totalItemsGenerated: 0,
          totalItemsStashed: 0,
          totalItemsTrashed: 0,
          averageStashRate: 0,
          averageTrashRate: 0,
          averageViewTime: 0,
          imageSuccessRate: 0,
          effectivenessScore: 0
        });
      }
    }
  }
  
  /**
   * Update daily usage statistics
   */
  private async updateUsageStats(generation: FeedGeneration) {
    const dateKey = format(new Date(generation.timestamp), 'yyyy-MM-dd');
    const existing = await feedAnalyticsDb.usageStats.get(dateKey);
    
    if (existing) {
      await feedAnalyticsDb.usageStats.update(dateKey, {
        feedsGenerated: existing.feedsGenerated + 1,
        totalItems: existing.totalItems + generation.itemCount,
        totalCost: existing.totalCost + generation.cost,
        totalImagesRequested: existing.totalImagesRequested + generation.imagesRequested,
        totalImagesFound: existing.totalImagesFound + generation.imagesFound,
        unsplashImages: existing.unsplashImages + generation.unsplashUsed,
        pexelsImages: existing.pexelsImages + generation.pexelsUsed
      });
    } else {
      await feedAnalyticsDb.usageStats.add({
        date: dateKey,
        feedsGenerated: 1,
        totalItems: generation.itemCount,
        itemsStashed: 0,
        itemsTrashed: 0,
        itemsViewed: 0,
        totalTimeSpent: 0,
        averageSessionDuration: 0,
        totalCost: generation.cost,
        totalImagesRequested: generation.imagesRequested,
        totalImagesFound: generation.imagesFound,
        unsplashImages: generation.unsplashUsed,
        pexelsImages: generation.pexelsUsed
      });
    }
  }
  
  /**
   * Calculate search term effectiveness
   */
  async calculateSearchTermEffectiveness() {
    const searchTerms = await feedAnalyticsDb.searchTermPerformance.toArray();
    
    for (const term of searchTerms) {
      // Get all interactions for items with this search term
      const generations = await feedAnalyticsDb.feedGenerations
        .where('searchTerms')
        .equals(term.searchTerm)
        .toArray();
      
      if (generations.length === 0) continue;
      
      // Calculate aggregates
      const totalItems = generations.reduce((sum, g) => sum + g.itemCount, 0);
      const totalStashed = generations.reduce((sum, g) => sum + g.itemsStashed, 0);
      const totalTrashed = generations.reduce((sum, g) => sum + g.itemsTrashed, 0);
      const totalViewed = generations.reduce((sum, g) => sum + g.itemsViewed, 0);
      const avgViewTime = generations.reduce((sum, g) => sum + g.averageViewTime, 0) / generations.length;
      
      const stashRate = totalItems > 0 ? (totalStashed / totalItems) * 100 : 0;
      const trashRate = totalItems > 0 ? (totalTrashed / totalItems) * 100 : 0;
      
      // Effectiveness score: weighted combination of metrics
      // High stash rate (50%), low trash rate (30%), high view time (20%)
      const effectivenessScore = 
        (stashRate * 0.5) +
        ((100 - trashRate) * 0.3) +
        (Math.min(avgViewTime / 1000, 60) / 60 * 100 * 0.2);  // Max 60 seconds
      
      await feedAnalyticsDb.searchTermPerformance.update(term.searchTerm, {
        totalItemsGenerated: totalItems,
        totalItemsStashed: totalStashed,
        totalItemsTrashed: totalTrashed,
        averageStashRate: stashRate,
        averageTrashRate: trashRate,
        averageViewTime: avgViewTime,
        effectivenessScore: Math.round(effectivenessScore)
      });
    }
  }
  
  /**
   * Get usage statistics for date range
   */
  async getUsageStats(startDate: Date, endDate: Date): Promise<UsageStats[]> {
    const startKey = format(startDate, 'yyyy-MM-dd');
    const endKey = format(endDate, 'yyyy-MM-dd');
    
    return await feedAnalyticsDb.usageStats
      .where('date')
      .between(startKey, endKey, true, true)
      .toArray();
  }
  
  /**
   * Get top performing search terms
   */
  async getTopSearchTerms(limit: number = 10): Promise<SearchTermPerformance[]> {
    return await feedAnalyticsDb.searchTermPerformance
      .orderBy('effectivenessScore')
      .reverse()
      .limit(limit)
      .toArray();
  }
  
  /**
   * Get engagement summary
   */
  async getEngagementSummary(): Promise<{
    totalFeeds: number;
    totalItems: number;
    stashRate: number;
    trashRate: number;
    averageViewTime: number;
  }> {
    const generations = await feedAnalyticsDb.feedGenerations.toArray();
    
    if (generations.length === 0) {
      return {
        totalFeeds: 0,
        totalItems: 0,
        stashRate: 0,
        trashRate: 0,
        averageViewTime: 0
      };
    }
    
    const totalFeeds = generations.length;
    const totalItems = generations.reduce((sum, g) => sum + g.itemCount, 0);
    const totalStashed = generations.reduce((sum, g) => sum + g.itemsStashed, 0);
    const totalTrashed = generations.reduce((sum, g) => sum + g.itemsTrashed, 0);
    const avgViewTime = generations.reduce((sum, g) => sum + g.averageViewTime, 0) / totalFeeds;
    
    return {
      totalFeeds,
      totalItems,
      stashRate: totalItems > 0 ? (totalStashed / totalItems) * 100 : 0,
      trashRate: totalItems > 0 ? (totalTrashed / totalItems) * 100 : 0,
      averageViewTime: avgViewTime
    };
  }
  
  /**
   * Export analytics to CSV
   */
  async exportToCSV(): Promise<string> {
    const generations = await feedAnalyticsDb.feedGenerations
      .orderBy('timestamp')
      .reverse()
      .toArray();
    
    const headers = [
      'Date',
      'Search Terms',
      'Provider',
      'Model',
      'Items',
      'Images Found',
      'Stashed',
      'Trashed',
      'Stash Rate %',
      'Avg View Time (s)',
      'Cost (USD)',
      'Generation Time (s)'
    ];
    
    const rows = generations.map(g => [
      new Date(g.timestamp).toISOString(),
      g.searchTerms.join('; '),
      g.provider,
      g.model,
      g.itemCount,
      g.imagesFound,
      g.itemsStashed,
      g.itemsTrashed,
      g.itemCount > 0 ? ((g.itemsStashed / g.itemCount) * 100).toFixed(1) : '0',
      (g.averageViewTime / 1000).toFixed(1),
      g.cost.toFixed(4),
      (g.totalTimeMs / 1000).toFixed(2)
    ]);
    
    return [headers, ...rows].map(row => row.join(',')).join('\n');
  }
  
  // Helper methods
  private getDeviceType(): 'mobile' | 'tablet' | 'desktop' {
    const width = window.innerWidth;
    if (width < 768) return 'mobile';
    if (width < 1024) return 'tablet';
    return 'desktop';
  }
  
  private getTimeOfDay(timestamp: number): 'morning' | 'afternoon' | 'evening' | 'night' {
    const hour = new Date(timestamp).getHours();
    if (hour >= 6 && hour < 12) return 'morning';
    if (hour >= 12 && hour < 18) return 'afternoon';
    if (hour >= 18 && hour < 24) return 'evening';
    return 'night';
  }
  
  private extractTopic(title: string): string {
    // Simple topic extraction from title
    const words = title.toLowerCase().split(/\s+/);
    const stopWords = ['the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for'];
    const keywords = words.filter(w => w.length > 4 && !stopWords.includes(w));
    return keywords[0] || 'general';
  }
}

export const feedAnalyticsService = new FeedAnalyticsService();
```

---

## Continue to Part 2

This plan is getting long. I'll create Part 2 covering:
- Integration with FeedContext
- Analytics Dashboard UI
- Visualization components
- Testing strategy

---

**Document Status**: PART 1 COMPLETE  
**Last Updated**: October 28, 2025  
**Next Document**: `IMPLEMENTATION_FEED_ANALYTICS_PART2.md`
