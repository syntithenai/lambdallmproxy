/**
 * Tests for Prompt Configuration Service
 * 
 * Coverage:
 * - System prompt generation with current datetime
 * - Configuration constants (default values only)
 * - Environment variable override handling
 */

// Import the module to test it properly
const promptsModule = require('../../../src/config/prompts');

describe('Prompt Configuration Service', () => {
    let originalEnv;
    
    beforeEach(() => {
        // Store original environment
        originalEnv = { ...process.env };
        
        // Clear all environment variables that might affect tests
        Object.keys(process.env).forEach(key => {
            if (key.startsWith('MAX_ITER') || key.startsWith('REASON_EFF') || key.startsWith('SYS_SRCH')) {
                delete process.env[key];
            }
        });
    });
    
    afterEach(() => {
        // Restore original environment
        process.env = { ...originalEnv };
    });
    
    describe('Configuration Constants (Default Values)', () => {
        it('should have default MAX_TOOL_ITERATIONS value', () => {
            // Since constants are evaluated at import time, we test the actual module values
            expect(promptsModule.MAX_TOOL_ITERATIONS).toBe(15);
        });
        
        it('should have default DEFAULT_REASONING_EFFORT value', () => {
            // Since constants are evaluated at import time, we test the actual module values
            expect(promptsModule.DEFAULT_REASONING_EFFORT).toBe('medium');
        });
    });
    
    describe('getComprehensiveResearchSystemPrompt', () => {
        it('should return a string prompt', () => {
            const result = promptsModule.getComprehensiveResearchSystemPrompt();
            expect(typeof result).toBe('string');
            expect(result.length).toBeGreaterThan(0);
        });
        
        it('should include current date/time in the prompt', () => {
            const result = promptsModule.getComprehensiveResearchSystemPrompt();
            expect(result).toMatch(/CURRENT DATE\/TIME:/);
            expect(result).toMatch(/[0-9]{4}, [0-9]{1,2}:[0-9]{2}:[0-9]{2}/);
        });
        
        it('should use environment variable when provided', () => {
            process.env.SYS_SRCH = 'Custom system prompt';
            // Reload module to pick up new env vars
            const newPrompts = require('../../../src/config/prompts');
            const result = newPrompts.getComprehensiveResearchSystemPrompt();
            expect(result).toBe('Custom system prompt');
        });
        
        it('should return default prompt when environment variable not set', () => {
            delete process.env.SYS_SRCH;
            const result = promptsModule.getComprehensiveResearchSystemPrompt();
            expect(result).toMatch(/You are a highly knowledgeable AI research assistant/);
            expect(result).toMatch(/TOOLS/);
            expect(result).toMatch(/RESPONSE/);
        });
        
        it('should handle different date/time formats correctly', () => {
            const result = promptsModule.getComprehensiveResearchSystemPrompt();
            // Should contain the expected pattern
            expect(result).toContain('CURRENT DATE/TIME:');
            expect(result).toMatch(/.*[0-9]{4}, [0-9]{1,2}:[0-9]{2}:[0-9]{2}/);
        });
    });
    
    describe('Integration Tests', () => {
        it('should properly load configuration with defaults', () => {
            // Test that the module loads and functions correctly
            expect(typeof promptsModule.MAX_TOOL_ITERATIONS).toBe('number');
            expect(typeof promptsModule.DEFAULT_REASONING_EFFORT).toBe('string');
            expect(typeof promptsModule.getComprehensiveResearchSystemPrompt()).toBe('string');
        });
        
        it('should handle environment variable override', () => {
            process.env.SYS_SRCH = 'Custom prompt for testing';
            const newPrompts = require('../../../src/config/prompts');
            
            // This test is more about ensuring the module can be reloaded
            expect(newPrompts.getComprehensiveResearchSystemPrompt()).toBe('Custom prompt for testing');
        });
    });
});
