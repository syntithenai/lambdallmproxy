/**
 * Feed Recommender Service
 * 
 * TF-IDF-based personalized feed recommendations with quiz engagement weighting.
 * 
 * Architecture:
 * - Privacy-first: All ML runs on user's own data only
 * - TF-IDF: Extract keywords from stashed items
 * - Quiz Weighting: 2x for quiz-generated items, 3x for high scores (>80%)
 * - Search Term Generation: 60% keywords, 20% topics, 20% trending
 * - Performance: < 200ms recommendation generation
 */

const natural = require('natural');
const TfIdf = natural.TfIdf;

class FeedRecommender {
  constructor() {
    this.tfidf = new TfIdf();
    this.stopWords = new Set([
      'the', 'be', 'to', 'of', 'and', 'a', 'in', 'that', 'have', 'i',
      'it', 'for', 'not', 'on', 'with', 'he', 'as', 'you', 'do', 'at',
      'this', 'but', 'his', 'by', 'from', 'they', 'we', 'say', 'her', 'she',
      'or', 'an', 'will', 'my', 'one', 'all', 'would', 'there', 'their', 'what'
    ]);
  }

  /**
   * Analyze user interactions and generate personalized preferences
   * 
   * @param {Array} interactions - User interactions from feedDb
   * @returns {Object} UserPreferences object with learned topics/keywords
   */
  async analyzeUserPreferences(interactions) {
    if (!interactions || interactions.length === 0) {
      return this._getDefaultPreferences();
    }

    // Filter stashed items (positive signal)
    const stashedItems = interactions.filter(i => i.action === 'stash');
    
    // Filter trashed items (negative signal)
    const trashedItems = interactions.filter(i => i.action === 'trash');

    // Extract keywords using TF-IDF
    const learnedKeywords = await this._extractKeywords(stashedItems);

    // Extract topics with quiz engagement weighting
    const learnedTopics = this._extractTopics(stashedItems);

    // Extract topics to avoid (from trash)
    const avoidTopics = this._extractAvoidTopics(trashedItems);

    // Count quiz engagements
    const quizEngagementCount = interactions.filter(i => i.quizGenerated).length;

    return {
      userId: 'default',
      learnedTopics,
      learnedKeywords,
      avoidTopics,
      lastUpdated: Date.now(),
      interactionCount: interactions.length,
      quizEngagementCount
    };
  }

  /**
   * Extract keywords using TF-IDF with quiz engagement weighting
   * 
   * Quiz weighting:
   * - Regular stashed item: 1x weight
   * - Quiz-generated item: 2x weight (strong positive signal)
   * - High-scoring quiz (>80%): 3x weight (indicates mastery and deep interest)
   */
  async _extractKeywords(stashedItems) {
    if (stashedItems.length === 0) {
      return [];
    }

    // Create new TF-IDF instance for this analysis
    const tfidf = new TfIdf();

    // Add documents with quiz weighting
    stashedItems.forEach(item => {
      const content = item.content || '';
      
      // Calculate quiz weight
      let weight = 1;
      if (item.quizGenerated) {
        weight = 2; // Quiz generation = strong interest
        if (item.quizScore && item.quizScore > 0.8) {
          weight = 3; // High score = mastery and deep interest
        }
      }

      // Add document multiple times based on weight (simple weighting)
      for (let i = 0; i < weight; i++) {
        tfidf.addDocument(content);
      }
    });

    // Extract top keywords across all documents
    const keywordMap = new Map();
    const docCount = tfidf.documents.length;

    for (let docIndex = 0; docIndex < docCount; docIndex++) {
      tfidf.listTerms(docIndex).forEach(item => {
        const term = item.term;
        
        // Skip stop words and short terms
        if (this.stopWords.has(term.toLowerCase()) || term.length < 3) {
          return;
        }

        // Aggregate TF-IDF scores
        if (keywordMap.has(term)) {
          keywordMap.set(term, {
            keyword: term,
            tfidf: keywordMap.get(term).tfidf + item.tfidf,
            frequency: keywordMap.get(term).frequency + 1,
            quizFrequency: keywordMap.get(term).quizFrequency
          });
        } else {
          keywordMap.set(term, {
            keyword: term,
            tfidf: item.tfidf,
            frequency: 1,
            quizFrequency: 0
          });
        }
      });
    }

    // Calculate quiz frequency for each keyword
    stashedItems.forEach(item => {
      if (item.quizGenerated) {
        const content = item.content || '';
        const words = this._tokenize(content);
        
        words.forEach(word => {
          if (keywordMap.has(word)) {
            const kw = keywordMap.get(word);
            kw.quizFrequency = (kw.quizFrequency || 0) + 1;
          }
        });
      }
    });

    // Sort by TF-IDF score and return top 30
    const keywords = Array.from(keywordMap.values())
      .sort((a, b) => b.tfidf - a.tfidf)
      .slice(0, 30);

    return keywords;
  }

  /**
   * Extract topics with frequency, recency, and quiz engagement weighting
   * 
   * Topic weight = frequency × recency_factor × quiz_factor
   * 
   * Quiz engagement:
   * - Base frequency: Count of topic appearances
   * - Quiz engagement: Bonus from quiz-generated items
   * - Quiz score: Average score for quizzes on this topic
   */
  _extractTopics(stashedItems) {
    if (stashedItems.length === 0) {
      return [];
    }

    const topicMap = new Map();
    const now = Date.now();

    stashedItems.forEach(item => {
      const topics = item.topics || [];
      const timestamp = item.timestamp || now;
      const age = now - timestamp;
      
      // Recency factor: 1.0 for today, decreases over time
      const recencyFactor = Math.max(0.1, 1 - (age / (30 * 24 * 60 * 60 * 1000))); // 30 days decay

      topics.forEach(topic => {
        if (!topicMap.has(topic)) {
          topicMap.set(topic, {
            topic,
            weight: 0,
            frequency: 0,
            recency: 0,
            quizEngagement: 0,
            quizScore: null,
            quizCount: 0
          });
        }

        const topicData = topicMap.get(topic);
        topicData.frequency += 1;
        topicData.recency = Math.max(topicData.recency, recencyFactor);

        // Quiz engagement tracking
        if (item.quizGenerated) {
          topicData.quizEngagement += 1;
          topicData.quizCount += 1;

          // Track quiz scores for this topic
          if (item.quizScore !== undefined && item.quizScore !== null) {
            if (topicData.quizScore === null) {
              topicData.quizScore = item.quizScore;
            } else {
              // Running average
              topicData.quizScore = (topicData.quizScore * (topicData.quizCount - 1) + item.quizScore) / topicData.quizCount;
            }
          }
        }
      });
    });

    // Calculate final weights
    topicMap.forEach((data, topic) => {
      // Quiz factor: 1.0 base, +0.5 for quiz engagement, +0.5 for high scores
      let quizFactor = 1.0;
      if (data.quizEngagement > 0) {
        quizFactor += 0.5; // Bonus for quiz engagement
        if (data.quizScore !== null && data.quizScore > 0.8) {
          quizFactor += 0.5; // Bonus for high scores
        }
      }

      data.weight = data.frequency * data.recency * quizFactor;
    });

    // Sort by weight and return top 20
    const topics = Array.from(topicMap.values())
      .sort((a, b) => b.weight - a.weight)
      .slice(0, 20);

    return topics;
  }

  /**
   * Extract topics to avoid from trashed items
   */
  _extractAvoidTopics(trashedItems) {
    if (trashedItems.length === 0) {
      return [];
    }

    const topicFrequency = new Map();

    trashedItems.forEach(item => {
      const topics = item.topics || [];
      topics.forEach(topic => {
        topicFrequency.set(topic, (topicFrequency.get(topic) || 0) + 1);
      });
    });

    // Topics trashed 3+ times are avoided
    const avoidTopics = Array.from(topicFrequency.entries())
      .filter(([topic, count]) => count >= 3)
      .map(([topic, count]) => topic)
      .slice(0, 10); // Limit to top 10 avoided topics

    return avoidTopics;
  }

  /**
   * Generate personalized search terms from learned preferences
   * 
   * Strategy:
   * - 60% from learned keywords (TF-IDF)
   * - 20% from learned topics
   * - 20% from trending topics (exploration)
   * 
   * @param {Object} userPreferences - UserPreferences from feedDb
   * @param {Array} trendingTopics - Current trending topics for exploration
   * @returns {Array<string>} Personalized search terms
   */
  generateSearchTerms(userPreferences, trendingTopics = []) {
    const searchTerms = [];

    // 60% keywords (18 out of 30 total terms)
    const keywordTerms = this._generateKeywordTerms(userPreferences.learnedKeywords, 18);
    searchTerms.push(...keywordTerms);

    // 20% topics (6 terms)
    const topicTerms = this._generateTopicTerms(userPreferences.learnedTopics, 6);
    searchTerms.push(...topicTerms);

    // 20% trending (6 terms) - exploration
    const trendingTerms = this._generateTrendingTerms(trendingTopics, 6);
    searchTerms.push(...trendingTerms);

    // Fallback if not enough personalized terms
    if (searchTerms.length < 5) {
      searchTerms.push('latest world news', 'science discoveries', 'technology trends');
    }

    // Deduplicate and limit to 30 terms
    const uniqueTerms = [...new Set(searchTerms)].slice(0, 30);

    return uniqueTerms;
  }

  /**
   * Generate search terms from keywords
   */
  _generateKeywordTerms(learnedKeywords, count) {
    if (!learnedKeywords || learnedKeywords.length === 0) {
      return [];
    }

    // Take top keywords by TF-IDF score
    const topKeywords = learnedKeywords
      .sort((a, b) => b.tfidf - a.tfidf)
      .slice(0, count);

    // Create search terms:
    // - Single keywords
    // - Pairs of related keywords (for quiz-related keywords)
    const terms = [];
    
    topKeywords.forEach((kw, index) => {
      terms.push(kw.keyword);

      // Pair quiz-related keywords
      if (kw.quizFrequency > 0 && index < topKeywords.length - 1) {
        const nextKw = topKeywords[index + 1];
        if (nextKw.quizFrequency > 0) {
          terms.push(`${kw.keyword} ${nextKw.keyword}`);
        }
      }
    });

    return terms.slice(0, count);
  }

  /**
   * Generate search terms from topics
   */
  _generateTopicTerms(learnedTopics, count) {
    if (!learnedTopics || learnedTopics.length === 0) {
      return [];
    }

    // Take top topics by weight
    const topTopics = learnedTopics
      .sort((a, b) => b.weight - a.weight)
      .slice(0, count);

    // Create search terms:
    // - "latest [topic]"
    // - "recent [topic]"
    // - "[topic] news"
    const terms = [];
    
    topTopics.forEach((topic, index) => {
      const topicName = topic.topic.toLowerCase();
      
      if (index % 3 === 0) {
        terms.push(`latest ${topicName}`);
      } else if (index % 3 === 1) {
        terms.push(`recent ${topicName}`);
      } else {
        terms.push(`${topicName} news`);
      }
    });

    return terms.slice(0, count);
  }

  /**
   * Generate search terms from trending topics (exploration)
   */
  _generateTrendingTerms(trendingTopics, count) {
    if (!trendingTopics || trendingTopics.length === 0) {
      // Default trending topics
      return [
        'breaking news today',
        'latest technology',
        'science discoveries',
        'world events',
        'trending topics',
        'popular culture'
      ].slice(0, count);
    }

    return trendingTopics
      .slice(0, count)
      .map(topic => `trending ${topic.toLowerCase()}`);
  }

  /**
   * Tokenize text for analysis
   */
  _tokenize(text) {
    const tokenizer = new natural.WordTokenizer();
    return tokenizer.tokenize(text.toLowerCase());
  }

  /**
   * Get default preferences for new users
   */
  _getDefaultPreferences() {
    return {
      userId: 'default',
      learnedTopics: [],
      learnedKeywords: [],
      avoidTopics: [],
      lastUpdated: Date.now(),
      interactionCount: 0,
      quizEngagementCount: 0
    };
  }

  /**
   * Filter search terms to avoid disliked topics
   */
  filterSearchTerms(searchTerms, avoidTopics) {
    if (!avoidTopics || avoidTopics.length === 0) {
      return searchTerms;
    }

    const avoidSet = new Set(avoidTopics.map(t => t.toLowerCase()));

    return searchTerms.filter(term => {
      const termLower = term.toLowerCase();
      return !Array.from(avoidSet).some(avoid => termLower.includes(avoid));
    });
  }
}

// Export singleton instance
module.exports = new FeedRecommender();
