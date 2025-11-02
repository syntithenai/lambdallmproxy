/**
 * Unit Tests for Memory Tracker
 * 
 * CRITICAL INFRASTRUCTURE - Tests memory overflow protection
 */

const { MemoryTracker, TokenAwareMemoryTracker } = require('../../src/memory-tracker');

describe('MemoryTracker', () => {
    let tracker;

    beforeEach(() => {
        tracker = new MemoryTracker();
    });

    describe('getMemoryUsage', () => {
        test('should return memory usage statistics', () => {
            const usage = tracker.getMemoryUsage();
            
            expect(usage).toHaveProperty('rss');
            expect(usage).toHaveProperty('heapUsed');
            expect(usage).toHaveProperty('heapTotal');
            expect(usage).toHaveProperty('rssMB');
            expect(usage).toHaveProperty('heapUsedMB');
            expect(usage).toHaveProperty('contentSizeMB');
            
            expect(typeof usage.rssMB).toBe('number');
            expect(typeof usage.heapUsedMB).toBe('number');
        });

        test('should track content size', () => {
            tracker.addContentSize(1024 * 1024); // 1MB
            
            const usage = tracker.getMemoryUsage();
            expect(usage.contentSizeMB).toBeCloseTo(1, 2);
        });
    });

    describe('checkMemoryLimit', () => {
        test('should allow small content additions', () => {
            const result = tracker.checkMemoryLimit(1024); // 1KB
            
            expect(result.allowed).toBe(true);
            expect(result.reason).toBe('OK');
        });

        test('should reject very large content additions', () => {
            const veryLargeSize = 200 * 1024 * 1024; // 200MB
            const result = tracker.checkMemoryLimit(veryLargeSize);
            
            expect(result.allowed).toBe(false);
            expect(result.reason).toContain('limit');
        });

        test('should provide detailed size information', () => {
            const result = tracker.checkMemoryLimit(1024 * 1024); // 1MB
            
            expect(result).toHaveProperty('currentContentSizeMB');
            expect(result).toHaveProperty('additionalSizeMB');
            expect(result).toHaveProperty('newContentSizeMB');
            expect(result).toHaveProperty('maxAllowedMB');
        });
    });

    describe('addContentSize', () => {
        test('should track accumulated content size', () => {
            tracker.addContentSize(1024);
            tracker.addContentSize(2048);
            tracker.addContentSize(512);
            
            expect(tracker.totalContentSize).toBe(3584);
        });
    });

    describe('getMemorySummary', () => {
        test('should return formatted summary string', () => {
            const summary = tracker.getMemorySummary();
            
            expect(summary).toContain('Memory:');
            expect(summary).toContain('RSS=');
            expect(summary).toContain('Heap=');
            expect(summary).toContain('Content=');
        });
    });
});

describe('TokenAwareMemoryTracker', () => {
    let tracker;

    beforeEach(() => {
        tracker = new TokenAwareMemoryTracker();
    });

    describe('estimateTokens', () => {
        test('should estimate tokens from text (4 chars = 1 token)', () => {
            const text = 'Hello World!'; // 12 chars
            const tokens = tracker.estimateTokens(text);
            
            expect(tokens).toBe(3);
        });

        test('should handle empty strings', () => {
            expect(tracker.estimateTokens('')).toBe(0);
        });

        test('should handle long text', () => {
            const longText = 'a'.repeat(4000);
            const tokens = tracker.estimateTokens(longText);
            
            expect(tokens).toBe(1000);
        });
    });

    describe('canAddContent', () => {
        test('should allow content within token limit', () => {
            const smallContent = 'Hello World!';
            expect(tracker.canAddContent(smallContent)).toBe(true);
        });

        test('should reject content exceeding token limit', () => {
            const largeContent = 'a'.repeat(200000); // 50K tokens
            expect(tracker.canAddContent(largeContent)).toBe(false);
        });

        test('should track accumulated tokens', () => {
            tracker.currentTokens = 30000;
            const moreContent = 'a'.repeat(10000); // 2.5K tokens
            
            expect(tracker.canAddContent(moreContent)).toBe(false);
        });
    });

    describe('addContent', () => {
        test('should add content and track tokens', () => {
            const content = 'Test content here';
            const result = tracker.addContent(content);
            
            expect(result).toBe(content);
            expect(tracker.currentTokens).toBeGreaterThan(0);
        });

        test('should truncate content exceeding token limit', () => {
            tracker.currentTokens = 31000; // Near limit
            const content = 'a'.repeat(10000);
            
            const result = tracker.addContent(content);
            
            expect(result.length).toBeLessThan(content.length);
            expect(tracker.currentTokens).toBeLessThanOrEqual(tracker.maxTokens);
        });

        test('should handle content at exact token limit', () => {
            tracker.currentTokens = tracker.maxTokens - 10;
            const content = 'a'.repeat(40); // 10 tokens
            
            const result = tracker.addContent(content);
            expect(result).toBe(content);
        });
    });

    describe('cleanContent', () => {
        test('should remove extra whitespace', () => {
            const content = 'Hello    World\n\n\n\nTest';
            const cleaned = tracker.cleanContent(content);
            
            expect(cleaned).not.toContain('    ');
            expect(cleaned).not.toContain('\n\n\n');
        });

        test('should handle null content', () => {
            expect(tracker.cleanContent(null)).toBe('');
        });

        test('should handle undefined content', () => {
            expect(tracker.cleanContent(undefined)).toBe('');
        });

        test('should handle non-string content', () => {
            expect(tracker.cleanContent(123)).toBe('');
        });

        test('should trim leading and trailing whitespace', () => {
            const content = '   Test Content   ';
            const cleaned = tracker.cleanContent(content);
            
            expect(cleaned).toBe('Test Content');
        });
    });

    describe('Integration Tests', () => {
        test('should manage content lifecycle', () => {
            const content1 = 'First piece of content';
            const content2 = 'Second piece of content';
            
            expect(tracker.canAddContent(content1)).toBe(true);
            tracker.addContent(content1);
            
            expect(tracker.canAddContent(content2)).toBe(true);
            tracker.addContent(content2);
            
            expect(tracker.currentTokens).toBeGreaterThan(0);
        });

        test('should prevent memory overflow', () => {
            const maxTokens = tracker.maxTokens;
            const largeContent = 'a'.repeat(maxTokens * 4 * 2); // Double the limit
            
            const result = tracker.addContent(largeContent);
            
            expect(result.length).toBeLessThan(largeContent.length);
            expect(tracker.currentTokens).toBeLessThanOrEqual(maxTokens);
        });
    });
});
