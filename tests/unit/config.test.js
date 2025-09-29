/**
 * Tests for configuration modules
 */

const { 
    MAX_TOKENS_PLANNING,
    MAX_TOKENS_LOW_COMPLEXITY,
    MAX_TOKENS_MEDIUM_COMPLEXITY,
    MAX_TOKENS_HIGH_COMPLEXITY,
    getTokensForComplexity
} = require('../../src/config/tokens');

const {
    LAMBDA_MEMORY_LIMIT_MB,
    MEMORY_SAFETY_BUFFER_MB,
    MAX_CONTENT_SIZE_MB,
    BYTES_PER_MB
} = require('../../src/config/memory');

const {
    MAX_TOOL_ITERATIONS,
    DEFAULT_REASONING_EFFORT,
    COMPREHENSIVE_RESEARCH_SYSTEM_PROMPT
} = require('../../src/config/prompts');

describe('Configuration Modules', () => {
    describe('Token Configuration', () => {
        test('should export token constants', () => {
            expect(typeof MAX_TOKENS_PLANNING).toBe('number');
            expect(typeof MAX_TOKENS_LOW_COMPLEXITY).toBe('number');
            expect(typeof MAX_TOKENS_MEDIUM_COMPLEXITY).toBe('number');
            expect(typeof MAX_TOKENS_HIGH_COMPLEXITY).toBe('number');
        });

        test('should provide complexity-based token allocation', () => {
            expect(getTokensForComplexity('low')).toBe(MAX_TOKENS_LOW_COMPLEXITY);
            expect(getTokensForComplexity('medium')).toBe(MAX_TOKENS_MEDIUM_COMPLEXITY);
            expect(getTokensForComplexity('high')).toBe(MAX_TOKENS_HIGH_COMPLEXITY);
            expect(getTokensForComplexity('unknown')).toBe(MAX_TOKENS_MEDIUM_COMPLEXITY);
        });
    });

    describe('Memory Configuration', () => {
        test('should export memory constants', () => {
            expect(typeof LAMBDA_MEMORY_LIMIT_MB).toBe('number');
            expect(typeof MEMORY_SAFETY_BUFFER_MB).toBe('number');
            expect(typeof MAX_CONTENT_SIZE_MB).toBe('number');
            expect(typeof BYTES_PER_MB).toBe('number');
        });

        test('should calculate max content size correctly', () => {
            expect(MAX_CONTENT_SIZE_MB).toBe(LAMBDA_MEMORY_LIMIT_MB - MEMORY_SAFETY_BUFFER_MB);
        });
    });

    describe('Prompts Configuration', () => {
        test('should export prompt constants', () => {
            expect(typeof MAX_TOOL_ITERATIONS).toBe('number');
            expect(typeof DEFAULT_REASONING_EFFORT).toBe('string');
            expect(typeof COMPREHENSIVE_RESEARCH_SYSTEM_PROMPT).toBe('string');
        });

        test('should have reasonable defaults', () => {
            expect(MAX_TOOL_ITERATIONS).toBeGreaterThan(0);
            expect(DEFAULT_REASONING_EFFORT).toMatch(/low|medium|high/);
            expect(COMPREHENSIVE_RESEARCH_SYSTEM_PROMPT).toContain('TOOL USAGE GUIDELINES');
        });
    });
});