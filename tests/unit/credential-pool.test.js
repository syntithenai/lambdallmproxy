/**
 * Unit Tests for Credential Pool
 * 
 * CRITICAL SECURITY MODULE - Tests API key rotation and provider management
 */

const { 
    loadEnvironmentProviders, 
    buildProviderPool,
    hasAvailableProviders 
} = require('../../src/credential-pool');

describe('Credential Pool', () => {
    let originalEnv;

    beforeEach(() => {
        // Save original environment
        originalEnv = { ...process.env };
        
        // Clear all LP_ variables
        Object.keys(process.env).forEach(key => {
            if (key.startsWith('LP_')) {
                delete process.env[key];
            }
        });
    });

    afterEach(() => {
        // Restore original environment
        process.env = originalEnv;
    });

    describe('loadEnvironmentProviders', () => {
        test('should load provider from environment', () => {
            process.env.LP_TYPE_0 = 'groq-free';
            process.env.LP_KEY_0 = 'gsk_test123';

            const providers = loadEnvironmentProviders();
            
            expect(providers).toHaveLength(1);
            expect(providers[0].type).toBe('groq-free');
            expect(providers[0].apiKey).toBe('gsk_test123');
            expect(providers[0].source).toBe('environment');
        });

        test('should load multiple providers', () => {
            process.env.LP_TYPE_0 = 'groq-free';
            process.env.LP_KEY_0 = 'gsk_test1';
            process.env.LP_TYPE_1 = 'openai';
            process.env.LP_KEY_1 = 'sk_test2';

            const providers = loadEnvironmentProviders();
            
            expect(providers).toHaveLength(2);
            expect(providers[0].type).toBe('groq-free');
            expect(providers[1].type).toBe('openai');
        });

        test('should skip indices with missing type or key', () => {
            process.env.LP_TYPE_0 = 'groq-free';
            // Missing LP_KEY_0
            process.env.LP_TYPE_1 = 'openai';
            process.env.LP_KEY_1 = 'sk_test';

            const providers = loadEnvironmentProviders();
            
            expect(providers).toHaveLength(1);
            expect(providers[0].type).toBe('openai');
        });

        test('should handle gaps in provider indices', () => {
            process.env.LP_TYPE_0 = 'groq-free';
            process.env.LP_KEY_0 = 'gsk_test1';
            // Skip index 1
            process.env.LP_TYPE_2 = 'openai';
            process.env.LP_KEY_2 = 'sk_test2';

            const providers = loadEnvironmentProviders();
            
            expect(providers).toHaveLength(2);
        });

        test('should load optional endpoint', () => {
            process.env.LP_TYPE_0 = 'openai-compatible';
            process.env.LP_KEY_0 = 'sk_test';
            process.env.LP_ENDPOINT_0 = 'https://custom.api.com/v1';

            const providers = loadEnvironmentProviders();
            
            expect(providers[0].apiEndpoint).toBe('https://custom.api.com/v1');
        });

        test('should load optional model name', () => {
            process.env.LP_TYPE_0 = 'openai-compatible';
            process.env.LP_KEY_0 = 'sk_test';
            process.env.LP_MODEL_0 = 'gpt-4';

            const providers = loadEnvironmentProviders();
            
            expect(providers[0].modelName).toBe('gpt-4');
        });

        test('should load priority settings', () => {
            process.env.LP_TYPE_0 = 'groq-free';
            process.env.LP_KEY_0 = 'gsk_test';
            process.env.LP_PRIORITY_0 = '5';

            const providers = loadEnvironmentProviders();
            
            expect(providers[0].priority).toBe(5);
        });

        test('should use default priority 100 when not specified', () => {
            process.env.LP_TYPE_0 = 'groq-free';
            process.env.LP_KEY_0 = 'gsk_test';

            const providers = loadEnvironmentProviders();
            
            expect(providers[0].priority).toBe(100);
        });

        test('should return empty array when no providers configured', () => {
            const providers = loadEnvironmentProviders();
            
            expect(providers).toHaveLength(0);
        });
    });

    describe('buildProviderPool', () => {
        test('should build pool with user providers only (unauthorized)', () => {
            const userProviders = [
                { type: 'openai', apiKey: 'sk_user123' }
            ];

            const pool = buildProviderPool(userProviders, false);
            
            expect(pool.length).toBeGreaterThan(0);
            const userProvider = pool.find(p => p.source === 'user');
            expect(userProvider).toBeDefined();
            expect(userProvider.isServerSideKey).toBe(false);
        });

        test('should build pool with user + environment providers (authorized)', () => {
            process.env.LP_TYPE_0 = 'groq-free';
            process.env.LP_KEY_0 = 'gsk_env';

            const userProviders = [
                { type: 'openai', apiKey: 'sk_user123' }
            ];

            const pool = buildProviderPool(userProviders, true);
            
            expect(pool.length).toBeGreaterThan(0);
            
            const hasUserProvider = pool.some(p => p.source === 'user');
            const hasEnvProvider = pool.some(p => p.source === 'environment');
            
            expect(hasUserProvider).toBe(true);
            expect(hasEnvProvider).toBe(true);
        });

        test('should skip invalid user providers', () => {
            const userProviders = [
                { type: 'openai' }, // Missing apiKey
                { apiKey: 'sk_test' }, // Missing type
                { type: 'anthropic', apiKey: 'sk_valid' }
            ];

            const pool = buildProviderPool(userProviders, false);
            
            // Should only include the valid provider (expanded)
            expect(pool.length).toBeGreaterThan(0);
        });

        test('should handle empty user providers', () => {
            const pool = buildProviderPool([], false);
            
            expect(pool).toHaveLength(0);
        });
    });

    describe('hasAvailableProviders', () => {
        test('should return true when user has valid providers', () => {
            const userProviders = [
                { type: 'openai', apiKey: 'sk_user' }
            ];

            expect(hasAvailableProviders(userProviders, false)).toBe(true);
        });

        test('should return false when user has no valid providers (unauthorized)', () => {
            expect(hasAvailableProviders([], false)).toBe(false);
        });

        test('should return true when authorized with environment providers', () => {
            process.env.LP_TYPE_0 = 'groq-free';
            process.env.LP_KEY_0 = 'gsk_env';

            expect(hasAvailableProviders([], true)).toBe(true);
        });

        test('should filter out invalid user providers', () => {
            const userProviders = [
                { type: 'openai' } // Missing apiKey
            ];

            expect(hasAvailableProviders(userProviders, false)).toBe(false);
        });
    });

    describe('Security Tests', () => {
        test('should not expose API keys in logs', () => {
            const consoleLogSpy = jest.spyOn(console, 'log').mockImplementation();
            
            process.env.LP_TYPE_0 = 'groq-free';
            process.env.LP_KEY_0 = 'gsk_secret123';

            loadEnvironmentProviders();
            
            // Check that full API key is not logged
            const logCalls = consoleLogSpy.mock.calls.map(call => call.join(' '));
            const hasFullKey = logCalls.some(log => log.includes('gsk_secret123'));
            
            expect(hasFullKey).toBe(false);
            
            consoleLogSpy.mockRestore();
        });

        test('should handle malformed priority values', () => {
            process.env.LP_TYPE_0 = 'groq-free';
            process.env.LP_KEY_0 = 'gsk_test';
            process.env.LP_PRIORITY_0 = 'invalid';

            const providers = loadEnvironmentProviders();
            
            expect(providers[0].priority).toBe(100); // Should fallback to default
        });

        test('should mark server-side keys correctly', () => {
            process.env.LP_TYPE_0 = 'groq-free';
            process.env.LP_KEY_0 = 'gsk_env';

            const pool = buildProviderPool([], true);
            
            const envProvider = pool.find(p => p.source === 'environment');
            expect(envProvider.isServerSideKey).toBe(true);
        });
    });
});
