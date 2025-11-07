/**
 * Tests for Memory Configuration Service
 * 
 * Coverage:
 * - Default constant values
 * - Constant relationships
 * - Basic configuration validation
 */

const memoryConfig = require('../../../src/config/memory');

describe('Memory Configuration Service', () => {
    beforeEach(() => {
        // No setup needed since constants are evaluated at import time
    });
    
    describe('Configuration Constants (Default Values)', () => {
        it('should have default LAMBDA_MEMORY_LIMIT_MB value', () => {
            expect(memoryConfig.LAMBDA_MEMORY_LIMIT_MB).toBe(128);
        });
        
        it('should have MEMORY_SAFETY_BUFFER_MB value', () => {
            expect(memoryConfig.MEMORY_SAFETY_BUFFER_MB).toBe(16);
        });
        
        it('should have BYTES_PER_MB constant', () => {
            expect(memoryConfig.BYTES_PER_MB).toBe(1024 * 1024);
        });
        
        it('should calculate MAX_CONTENT_SIZE_MB correctly with default values', () => {
            // Should be 128 (default limit) - 16 (buffer) = 112
            expect(memoryConfig.MAX_CONTENT_SIZE_MB).toBe(112);
        });
    });
    
    describe('Memory Calculations', () => {
        it('should maintain correct relationships between constants', () => {
            // Test that MAX_CONTENT_SIZE_MB = LAMBDA_MEMORY_LIMIT_MB - MEMORY_SAFETY_BUFFER_MB
            const defaultLimit = memoryConfig.LAMBDA_MEMORY_LIMIT_MB;
            const defaultBuffer = memoryConfig.MEMORY_SAFETY_BUFFER_MB;
            const defaultMaxSize = memoryConfig.MAX_CONTENT_SIZE_MB;
            
            expect(defaultMaxSize).toBe(defaultLimit - defaultBuffer);
        });
        
        it('should have reasonable values for all constants', () => {
            // Test that all values are positive numbers
            expect(memoryConfig.LAMBDA_MEMORY_LIMIT_MB).toBeGreaterThan(0);
            expect(memoryConfig.MEMORY_SAFETY_BUFFER_MB).toBeGreaterThan(0);
            expect(memoryConfig.MAX_CONTENT_SIZE_MB).toBeGreaterThanOrEqual(0); // Can be 0
            expect(memoryConfig.BYTES_PER_MB).toBeGreaterThan(0);
        });
    });
    
    describe('Integration Tests', () => {
        it('should properly load configuration with defaults', () => {
            // Test that all constants are properly defined and related
            expect(typeof memoryConfig.LAMBDA_MEMORY_LIMIT_MB).toBe('number');
            expect(typeof memoryConfig.MEMORY_SAFETY_BUFFER_MB).toBe('number');
            expect(typeof memoryConfig.MAX_CONTENT_SIZE_MB).toBe('number');
            expect(typeof memoryConfig.BYTES_PER_MB).toBe('number');
            
            // Test relationships
            expect(memoryConfig.MAX_CONTENT_SIZE_MB).toBe(
                memoryConfig.LAMBDA_MEMORY_LIMIT_MB - memoryConfig.MEMORY_SAFETY_BUFFER_MB
            );
        });
    });
});
