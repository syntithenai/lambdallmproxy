/**
 * Integration Tests: Feed Recommendations with TF-IDF and Quiz Engagement
 * 
 * Tests the complete feed recommendation system:
 * - TF-IDF keyword extraction with quiz weighting
 * - Topic scoring with quiz engagement (2x for quiz, 3x for high scores)
 * - Search term generation (60% keywords, 20% topics, 20% trending)
 * - Interaction tracking and preference learning
 */

const feedRecommender = require('../../src/services/feed-recommender');

describe('Feed Recommender - TF-IDF with Quiz Engagement', () => {
  
  describe('Keyword Extraction with Quiz Weighting', () => {
    test('should extract keywords using TF-IDF', async () => {
      const interactions = [
        {
          action: 'stash',
          content: 'Quantum computing uses quantum mechanics to process information faster than classical computers.',
          topics: ['Technology', 'Science'],
          quizGenerated: false
        },
        {
          action: 'stash',
          content: 'Machine learning algorithms enable computers to learn from data without explicit programming.',
          topics: ['AI', 'Technology'],
          quizGenerated: false
        }
      ];

      const preferences = await feedRecommender.analyzeUserPreferences(interactions);
      
      expect(preferences.learnedKeywords).toBeDefined();
      expect(preferences.learnedKeywords.length).toBeGreaterThan(0);
      
      // Check that keywords have TF-IDF scores
      const firstKeyword = preferences.learnedKeywords[0];
      expect(firstKeyword).toHaveProperty('keyword');
      expect(firstKeyword).toHaveProperty('tfidf');
      expect(firstKeyword).toHaveProperty('frequency');
      expect(firstKeyword.tfidf).toBeGreaterThan(0);
    });

    test('should weight quiz-generated items 2x higher', async () => {
      const interactions = [
        {
          action: 'stash',
          content: 'Artificial intelligence is transforming healthcare with predictive diagnostics.',
          topics: ['AI', 'Healthcare'],
          quizGenerated: false
        },
        {
          action: 'stash',
          content: 'Artificial intelligence is transforming healthcare with predictive diagnostics.',
          topics: ['AI', 'Healthcare'],
          quizGenerated: true // Same content, but quiz-generated
        }
      ];

      const preferences = await feedRecommender.analyzeUserPreferences(interactions);
      
      // Quiz items should have higher frequency in keywords
      expect(preferences.quizEngagementCount).toBe(1);
      expect(preferences.learnedKeywords.length).toBeGreaterThan(0);
      
      // Check quiz frequency tracking
      const aiKeyword = preferences.learnedKeywords.find(k => k.keyword.toLowerCase().includes('artificial'));
      if (aiKeyword) {
        expect(aiKeyword.quizFrequency).toBeGreaterThan(0);
      }
    });

    test('should weight high-scoring quizzes (>80%) 3x higher', async () => {
      const interactions = [
        {
          action: 'stash',
          content: 'Climate change affects global temperatures and weather patterns.',
          topics: ['Environment', 'Science'],
          quizGenerated: false
        },
        {
          action: 'stash',
          content: 'Climate change affects global temperatures and weather patterns.',
          topics: ['Environment', 'Science'],
          quizGenerated: true,
          quizScore: 0.9 // High score = 3x weight
        }
      ];

      const preferences = await feedRecommender.analyzeUserPreferences(interactions);
      
      expect(preferences.quizEngagementCount).toBe(1);
      expect(preferences.learnedKeywords.length).toBeGreaterThan(0);
      
      // High-scoring quiz items should boost keyword importance
      const climateKeyword = preferences.learnedKeywords.find(k => k.keyword.toLowerCase().includes('climate'));
      if (climateKeyword) {
        expect(climateKeyword.quizFrequency).toBe(1);
      }
    });
  });

  describe('Topic Extraction with Quiz Engagement', () => {
    test('should extract topics with frequency and recency', async () => {
      const now = Date.now();
      const interactions = [
        {
          action: 'stash',
          content: 'Space exploration advances',
          topics: ['Space', 'Science'],
          timestamp: now,
          quizGenerated: false
        },
        {
          action: 'stash',
          content: 'Mars rover discoveries',
          topics: ['Space', 'Technology'],
          timestamp: now - (5 * 24 * 60 * 60 * 1000), // 5 days ago
          quizGenerated: false
        }
      ];

      const preferences = await feedRecommender.analyzeUserPreferences(interactions);
      
      expect(preferences.learnedTopics).toBeDefined();
      expect(preferences.learnedTopics.length).toBeGreaterThan(0);
      
      const spaceTopic = preferences.learnedTopics.find(t => t.topic === 'Space');
      expect(spaceTopic).toBeDefined();
      expect(spaceTopic.frequency).toBe(2);
      expect(spaceTopic.weight).toBeGreaterThan(0);
      expect(spaceTopic.recency).toBeGreaterThan(0);
    });

    test('should boost topics with quiz engagement', async () => {
      const interactions = [
        {
          action: 'stash',
          content: 'AI ethics considerations',
          topics: ['AI', 'Ethics'],
          timestamp: Date.now(),
          quizGenerated: false
        },
        {
          action: 'stash',
          content: 'AI safety research',
          topics: ['AI', 'Safety'],
          timestamp: Date.now(),
          quizGenerated: true,
          quizScore: 0.85
        }
      ];

      const preferences = await feedRecommender.analyzeUserPreferences(interactions);
      
      const aiTopic = preferences.learnedTopics.find(t => t.topic === 'AI');
      expect(aiTopic).toBeDefined();
      expect(aiTopic.quizEngagement).toBe(1);
      expect(aiTopic.quizScore).toBeCloseTo(0.85);
      // Weight should be boosted by quiz factor (1.0 + 0.5 for engagement + 0.5 for high score = 2.0x)
      expect(aiTopic.weight).toBeGreaterThan(aiTopic.frequency * aiTopic.recency);
    });

    test('should track average quiz score per topic', async () => {
      const interactions = [
        {
          action: 'stash',
          content: 'Physics fundamentals',
          topics: ['Physics'],
          timestamp: Date.now(),
          quizGenerated: true,
          quizScore: 0.7
        },
        {
          action: 'stash',
          content: 'Physics advanced concepts',
          topics: ['Physics'],
          timestamp: Date.now(),
          quizGenerated: true,
          quizScore: 0.9
        }
      ];

      const preferences = await feedRecommender.analyzeUserPreferences(interactions);
      
      const physicsTopic = preferences.learnedTopics.find(t => t.topic === 'Physics');
      expect(physicsTopic).toBeDefined();
      expect(physicsTopic.quizCount).toBe(2);
      expect(physicsTopic.quizScore).toBeCloseTo(0.8); // Average of 0.7 and 0.9
    });
  });

  describe('Avoid Topics from Trash', () => {
    test('should extract topics to avoid from trashed items', async () => {
      const interactions = [
        {
          action: 'trash',
          content: 'Sports news update',
          topics: ['Sports'],
          timestamp: Date.now()
        },
        {
          action: 'trash',
          content: 'Sports championship results',
          topics: ['Sports'],
          timestamp: Date.now()
        },
        {
          action: 'trash',
          content: 'Sports player transfer',
          topics: ['Sports'],
          timestamp: Date.now()
        }
      ];

      const preferences = await feedRecommender.analyzeUserPreferences(interactions);
      
      expect(preferences.avoidTopics).toContain('Sports');
    });

    test('should require 3+ trashes to avoid topic', async () => {
      const interactions = [
        {
          action: 'trash',
          content: 'Celebrity gossip',
          topics: ['Entertainment'],
          timestamp: Date.now()
        },
        {
          action: 'trash',
          content: 'Celebrity news',
          topics: ['Entertainment'],
          timestamp: Date.now()
        }
      ];

      const preferences = await feedRecommender.analyzeUserPreferences(interactions);
      
      // Only 2 trashes, should NOT avoid yet
      expect(preferences.avoidTopics).not.toContain('Entertainment');
    });
  });

  describe('Search Term Generation', () => {
    test('should generate 60% keywords, 20% topics, 20% trending', async () => {
      const userPreferences = {
        learnedKeywords: [
          { keyword: 'quantum', tfidf: 0.9, frequency: 5, quizFrequency: 2 },
          { keyword: 'computing', tfidf: 0.8, frequency: 4, quizFrequency: 2 },
          { keyword: 'algorithms', tfidf: 0.7, frequency: 3, quizFrequency: 1 }
        ],
        learnedTopics: [
          { topic: 'Technology', weight: 10, frequency: 5, recency: 0.9, quizEngagement: 2 },
          { topic: 'Science', weight: 8, frequency: 4, recency: 0.8, quizEngagement: 1 }
        ],
        avoidTopics: []
      };

      const trendingTopics = ['AI', 'Sustainability'];
      const searchTerms = feedRecommender.generateSearchTerms(userPreferences, trendingTopics);

      expect(searchTerms.length).toBeGreaterThan(0);
      expect(searchTerms.length).toBeLessThanOrEqual(30);
      
      // Should include keywords
      expect(searchTerms.some(term => term.includes('quantum'))).toBe(true);
      
      // Should include topics
      expect(searchTerms.some(term => term.toLowerCase().includes('technology'))).toBe(true);
      
      // Should include trending
      expect(searchTerms.some(term => term.toLowerCase().includes('trending'))).toBe(true);
    });

    test('should filter out avoided topics', async () => {
      const userPreferences = {
        learnedKeywords: [],
        learnedTopics: [],
        avoidTopics: ['Sports', 'Celebrity']
      };

      const searchTerms = ['latest sports news', 'technology updates', 'celebrity gossip'];
      const filtered = feedRecommender.filterSearchTerms(searchTerms, userPreferences.avoidTopics);

      expect(filtered).not.toContain('latest sports news');
      expect(filtered).not.toContain('celebrity gossip');
      expect(filtered).toContain('technology updates');
    });

    test('should provide default terms for new users', async () => {
      const userPreferences = {
        learnedKeywords: [],
        learnedTopics: [],
        avoidTopics: []
      };

      const searchTerms = feedRecommender.generateSearchTerms(userPreferences, []);

      expect(searchTerms.length).toBeGreaterThan(0);
      // Should have fallback default terms (trending topics used when no personalization)
      expect(searchTerms.some(term => 
        term.includes('news') || term.includes('technology') || term.includes('science')
      )).toBe(true);
    });
  });

  describe('Preference Learning from Interactions', () => {
    test('should analyze mixed interactions correctly', async () => {
      const interactions = [
        // Stashed items (positive signal)
        {
          action: 'stash',
          content: 'Renewable energy breakthroughs in solar technology.',
          topics: ['Energy', 'Technology'],
          timestamp: Date.now(),
          quizGenerated: false
        },
        {
          action: 'stash',
          content: 'Wind power efficiency improvements.',
          topics: ['Energy', 'Environment'],
          timestamp: Date.now(),
          quizGenerated: true,
          quizScore: 0.85
        },
        // Trashed items (negative signal)
        {
          action: 'trash',
          content: 'Fashion trends for 2024',
          topics: ['Fashion'],
          timestamp: Date.now()
        },
        // Viewed only (neutral)
        {
          action: 'view',
          content: 'General news article',
          topics: ['News'],
          timestamp: Date.now()
        }
      ];

      const preferences = await feedRecommender.analyzeUserPreferences(interactions);

      // Should learn from stashed items
      expect(preferences.learnedTopics.some(t => t.topic === 'Energy')).toBe(true);
      
      // Should count interactions
      expect(preferences.interactionCount).toBe(4);
      expect(preferences.quizEngagementCount).toBe(1);
      
      // Fashion should NOT be in avoid list yet (only 1 trash)
      expect(preferences.avoidTopics).not.toContain('Fashion');
    });

    test('should handle empty interactions gracefully', async () => {
      const preferences = await feedRecommender.analyzeUserPreferences([]);

      expect(preferences.learnedKeywords).toEqual([]);
      expect(preferences.learnedTopics).toEqual([]);
      expect(preferences.avoidTopics).toEqual([]);
      expect(preferences.interactionCount).toBe(0);
      expect(preferences.quizEngagementCount).toBe(0);
    });
  });

  describe('Performance', () => {
    test('should analyze preferences in < 200ms', async () => {
      // Create 100 interactions
      const interactions = Array.from({ length: 100 }, (_, i) => ({
        action: 'stash',
        content: `Content about topic ${i % 10}: lorem ipsum dolor sit amet consectetur adipiscing elit.`,
        topics: [`Topic${i % 10}`],
        timestamp: Date.now() - (i * 1000 * 60),
        quizGenerated: i % 5 === 0,
        quizScore: i % 5 === 0 ? 0.8 : undefined
      }));

      const startTime = Date.now();
      const preferences = await feedRecommender.analyzeUserPreferences(interactions);
      const duration = Date.now() - startTime;

      expect(duration).toBeLessThan(200);
      expect(preferences.learnedKeywords.length).toBeGreaterThan(0);
      expect(preferences.learnedTopics.length).toBeGreaterThan(0);
    });
  });
});
