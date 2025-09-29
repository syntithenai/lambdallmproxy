/**
 * Test enhanced weighted scoring system
 */

const { DuckDuckGoSearcher } = require('../../src/search');

describe('Enhanced Weighted Scoring System', () => {
    
    let searcher;
    
    beforeEach(() => {
        searcher = new DuckDuckGoSearcher();
    });
    
    describe('calculateRelevanceScore', () => {
        test('should give higher scores for exact phrase matches', () => {
            const query = 'javascript tutorial';
            
            const exactTitleMatch = searcher.calculateRelevanceScore(
                'JavaScript Tutorial for Beginners',
                'Learn programming basics',
                'https://example.com/js-tutorial',
                query,
                50
            );
            
            const partialMatch = searcher.calculateRelevanceScore(
                'Learn JavaScript Programming',
                'Comprehensive tutorial coverage',
                'https://example.com/programming',
                query,
                50
            );
            
            expect(exactTitleMatch).toBeGreaterThan(partialMatch);
        });
        
        test('should score authoritative domains higher', () => {
            const query = 'machine learning';
            
            const eduScore = searcher.calculateRelevanceScore(
                'Machine Learning Course',
                'University course on ML',
                'https://university.edu/ml-course',
                query,
                50
            );
            
            const comScore = searcher.calculateRelevanceScore(
                'Machine Learning Course',
                'Commercial course on ML',
                'https://example.com/ml-course',
                query,
                50
            );
            
            expect(eduScore).toBeGreaterThan(comScore);
        });
        
        test('should reward term frequency', () => {
            const query = 'python programming';
            
            const highFrequency = searcher.calculateRelevanceScore(
                'Python Programming: Python for Programming',
                'Learn Python programming with Python examples and Python tutorials',
                'https://example.com/python',
                query,
                50
            );
            
            const lowFrequency = searcher.calculateRelevanceScore(
                'Python Programming Guide',
                'Learn coding basics',
                'https://example.com/guide',
                query,
                50
            );
            
            expect(highFrequency).toBeGreaterThan(lowFrequency);
        });
        
        test('should give position bonuses for early term appearances', () => {
            const query = 'web development';
            
            const earlyPosition = searcher.calculateRelevanceScore(
                'Web Development Guide to Modern Techniques',
                'Web development is important for modern applications',
                'https://example.com/web-dev',
                query,
                50
            );
            
            const latePosition = searcher.calculateRelevanceScore(
                'Modern Techniques and Best Practices for Web Development',
                'Learn important concepts and then focus on web development',
                'https://example.com/techniques',
                query,
                50
            );
            
            expect(earlyPosition).toBeGreaterThan(latePosition);
        });
        
        test('should reward term proximity', () => {
            const query = 'artificial intelligence';
            
            const closeTerms = searcher.calculateRelevanceScore(
                'Artificial Intelligence Research',
                'Study artificial intelligence applications and AI methods',
                'https://example.com/ai',
                query,
                50
            );
            
            const separateTerms = searcher.calculateRelevanceScore(
                'Artificial Networks and Machine Intelligence',
                'Study artificial networks in computer systems with focus on intelligence',
                'https://example.com/networks',
                query,
                50
            );
            
            expect(closeTerms).toBeGreaterThan(separateTerms);
        });
        
        test('should penalize suspicious URL patterns', () => {
            const query = 'data science';
            
            const cleanUrl = searcher.calculateRelevanceScore(
                'Data Science Tutorial',
                'Learn data science fundamentals',
                'https://example.com/data-science',
                query,
                50
            );
            
            const suspiciousUrl = searcher.calculateRelevanceScore(
                'Data Science Tutorial',
                'Learn data science fundamentals',
                'https://proxy.redirect.cache.com/amp/data-science',
                query,
                50
            );
            
            expect(cleanUrl).toBeGreaterThan(suspiciousUrl);
        });
        
        test('should reward complete query coverage', () => {
            const query = 'react native mobile development';
            
            const fullCoverage = searcher.calculateRelevanceScore(
                'React Native Mobile Development Guide',
                'Complete react native tutorial for mobile development',
                'https://example.com/react-native-mobile-development',
                query,
                50
            );
            
            const partialCoverage = searcher.calculateRelevanceScore(
                'React Development',
                'Learn react programming',
                'https://example.com/react',
                query,
                50
            );
            
            expect(fullCoverage).toBeGreaterThan(partialCoverage);
        });
        
        test('should boost DuckDuckGo native scores appropriately', () => {
            const query = 'blockchain technology';
            
            const highDDGScore = searcher.calculateRelevanceScore(
                'Blockchain Technology',
                'Learn about blockchain',
                'https://example.com/blockchain',
                query,
                100
            );
            
            const lowDDGScore = searcher.calculateRelevanceScore(
                'Blockchain Technology',
                'Learn about blockchain',
                'https://example.com/blockchain',
                query,
                20
            );
            
            // High DDG score should result in significantly higher total score
            expect(highDDGScore - lowDDGScore).toBeGreaterThan(80); // 80 point difference boosted by 20%
        });
        
    });
    
    describe('helper methods', () => {
        test('calculateTermFrequency should count term occurrences', () => {
            const tokens = ['javascript', 'programming'];
            const text = 'javascript programming with javascript libraries for programming';
            
            const frequency = searcher.calculateTermFrequency(text, tokens);
            expect(frequency).toBe(4); // 2 javascript + 2 programming
        });
        
        test('calculatePositionScore should favor early positions', () => {
            const tokens = ['react'];
            const earlyText = 'react development guide for beginners';
            const lateText = 'development guide for beginners using react';
            
            const earlyScore = searcher.calculatePositionScore(earlyText, tokens, 10);
            const lateScore = searcher.calculatePositionScore(lateText, tokens, 10);
            
            expect(earlyScore).toBeGreaterThan(lateScore);
        });
        
        test('calculateProximityScore should reward close terms', () => {
            const tokens = ['machine', 'learning'];
            const closeText = 'machine learning algorithms';
            const separateText = 'machine intelligence and deep learning techniques';
            
            const closeScore = searcher.calculateProximityScore(closeText, tokens, 10);
            const separateScore = searcher.calculateProximityScore(separateText, tokens, 10);
            
            expect(closeScore).toBeGreaterThan(separateScore);
        });
        
        test('calculateDomainAuthorityScore should rank domains correctly', () => {
            const eduScore = searcher.calculateDomainAuthorityScore('https://university.edu/course');
            const govScore = searcher.calculateDomainAuthorityScore('https://agency.gov/info');
            const orgScore = searcher.calculateDomainAuthorityScore('https://nonprofit.org/article');
            const comScore = searcher.calculateDomainAuthorityScore('https://company.com/page');
            
            expect(eduScore).toBeGreaterThan(govScore);
            expect(govScore).toBeGreaterThan(orgScore);
            expect(orgScore).toBeGreaterThan(comScore);
        });
        
        test('calculateUrlStructureScore should penalize suspicious patterns', () => {
            const tokens = ['test'];
            
            const cleanScore = searcher.calculateUrlStructureScore('https://example.com/test', tokens);
            const suspiciousScore = searcher.calculateUrlStructureScore('https://redirect.proxy.com/cache/amp/test?param=value', tokens);
            
            expect(cleanScore).toBeGreaterThan(suspiciousScore);
        });
    });
});