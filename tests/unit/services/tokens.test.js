/**
 * Tests for Token Configuration Service
 * 
 * Coverage:
 * - Default constant values
 * - Token limit calculations
 * - Complexity-based token allocation
 * - Constant relationships
 */

const tokensConfig = require('../../../src/config/tokens');

describe('Token Configuration Service', () => {
    beforeEach(() => {
        // No setup needed since constants are evaluated at import time
    });
    
    describe('Configuration Constants (Default Values)', () => {
        it('should have default MAX_TOKENS_PLANNING value', () => {
            expect(tokensConfig.MAX_TOKENS_PLANNING).toBe(4096);
        });
        
        it('should have default MAX_TOKENS_TOOL_SYNTHESIS value', () => {
            expect(tokensConfig.MAX_TOKENS_TOOL_SYNTHESIS).toBe(1024);
        });
        
        it('should have default MAX_TOKENS_LOW_COMPLEXITY value', () => {
            expect(tokensConfig.MAX_TOKENS_LOW_COMPLEXITY).toBe(2048);
        });
        
        it('should have default MAX_TOKENS_MEDIUM_COMPLEXITY value', () => {
            expect(tokensConfig.MAX_TOKENS_MEDIUM_COMPLEXITY).toBe(4096);
        });
        
        it('should have default MAX_TOKENS_HIGH_COMPLEXITY value', () => {
            expect(tokensConfig.MAX_TOKENS_HIGH_COMPLEXITY).toBe(8192);
        });
        
        it('should have default MAX_TOKENS_MATH_RESPONSE value', () => {
            expect(tokensConfig.MAX_TOKENS_MATH_RESPONSE).toBe(1024);
        });
        
        it('should have default MAX_TOKENS_FINAL_RESPONSE value', () => {
            // Should default to MAX_TOKENS_MEDIUM_COMPLEXITY
            expect(tokensConfig.MAX_TOKENS_FINAL_RESPONSE).toBe(4096);
        });
    });
    
    describe('getTokensForComplexity Function', () => {
        it('should return correct token limits for low complexity', () => {
            const result = tokensConfig.getTokensForComplexity('low');
            expect(result).toBe(tokensConfig.MAX_TOKENS_LOW_COMPLEXITY);
        });
        
        it('should return correct token limits for high complexity', () => {
            const result = tokensConfig.getTokensForComplexity('high');
            expect(result).toBe(tokensConfig.MAX_TOKENS_HIGH_COMPLEXITY);
        });
        
        it('should return medium complexity as default', () => {
            const result = tokensConfig.getTokensForComplexity('medium');
            expect(result).toBe(tokensConfig.MAX_TOKENS_MEDIUM_COMPLEXITY);
        });
        
        it('should return medium complexity for unknown complexity levels', () => {
            const result = tokensConfig.getTokensForComplexity('unknown');
            expect(result).toBe(tokensConfig.MAX_TOKENS_MEDIUM_COMPLEXITY);
        });
    });
    
    describe('Token Calculations and Relationships', () => {
        it('should maintain correct relationships between constants', () => {
            // MAX_TOKENS_FINAL_RESPONSE should default to MAX_TOKENS_MEDIUM_COMPLEXITY
            expect(tokensConfig.MAX_TOKENS_FINAL_RESPONSE).toBe(tokensConfig.MAX_TOKENS_MEDIUM_COMPLEXITY);
        });
        
        it('should have reasonable values for all token limits', () => {
            // All values should be positive numbers
            expect(tokensConfig.MAX_TOKENS_PLANNING).toBeGreaterThan(0);
            expect(tokensConfig.MAX_TOKENS_TOOL_SYNTHESIS).toBeGreaterThan(0);
            expect(tokensConfig.MAX_TOKENS_LOW_COMPLEXITY).toBeGreaterThan(0);
            expect(tokensConfig.MAX_TOKENS_MEDIUM_COMPLEXITY).toBeGreaterThan(0);
            expect(tokensConfig.MAX_TOKENS_HIGH_COMPLEXITY).toBeGreaterThan(0);
            expect(tokensConfig.MAX_TOKENS_MATH_RESPONSE).toBeGreaterThan(0);
            expect(tokensConfig.MAX_TOKENS_FINAL_RESPONSE).toBeGreaterThan(0);
        });
        
        it('should have increasing values for complexity levels', () => {
            // Low should be less than medium, which should be less than high
            expect(tokensConfig.MAX_TOKENS_LOW_COMPLEXITY).toBeLessThan(tokensConfig.MAX_TOKENS_MEDIUM_COMPLEXITY);
            expect(tokensConfig.MAX_TOKENS_MEDIUM_COMPLEXITY).toBeLessThan(tokensConfig.MAX_TOKENS_HIGH_COMPLEXITY);
        });
    });
    
    describe('Integration Tests', () => {
        it('should properly load configuration with defaults', () => {
            // Test that all constants are properly defined
            expect(typeof tokensConfig.MAX_TOKENS_PLANNING).toBe('number');
            expect(typeof tokensConfig.MAX_TOKENS_TOOL_SYNTHESIS).toBe('number');
            expect(typeof tokensConfig.MAX_TOKENS_LOW_COMPLEXITY).toBe('number');
            expect(typeof tokensConfig.MAX_TOKENS_MEDIUM_COMPLEXITY).toBe('number');
            expect(typeof tokensConfig.MAX_TOKENS_HIGH_COMPLEXITY).toBe('number');
            expect(typeof tokensConfig.MAX_TOKENS_MATH_RESPONSE).toBe('number');
            expect(typeof tokensConfig.MAX_TOKENS_FINAL_RESPONSE).toBe('number');
            expect(typeof tokensConfig.getTokensForComplexity).toBe('function');
        });
        
        it('should handle complexity function correctly', () => {
            // Test that the function works as expected
            expect(tokensConfig.getTokensForComplexity('low')).toBe(tokensConfig.MAX_TOKENS_LOW_COMPLEXITY);
            expect(tokensConfig.getTokensForComplexity('high')).toBe(tokensConfig.MAX_TOKENS_HIGH_COMPLEXITY);
            expect(tokensConfig.getTokensForComplexity('medium')).toBe(tokensConfig.MAX_TOKENS_MEDIUM_COMPLEXITY);
            expect(tokensConfig.getTokensForComplexity('unknown')).toBe(tokensConfig.MAX_TOKENS_MEDIUM_COMPLEXITY);
        });
    });
});
