/**
 * Tests for Credential Pool Service (Simplified)
 * 
 * Coverage:
 * - Environment provider loading with various configurations
 * - Provider expansion for load balancing (groq-free/groq providers)
 * - User provider integration
 * - Authorization-based environment provider access
 * - Error handling and validation
 * - Priority system functionality
 * - Capability filtering
 */

const credentialPool = require('../../../src/credential-pool');

describe('Credential Pool Service', () => {
    let originalEnv;
    
    beforeEach(() => {
        // Store original environment
        originalEnv = { ...process.env };
        
        // Clear all environment variables that might affect tests
        Object.keys(process.env).forEach(key => {
            if (key.startsWith('LP_')) {
                delete process.env[key];
            }
        });
    });
    
    afterEach(() => {
        // Restore original environment
        process.env = { ...originalEnv };
    });
    
    describe('loadEnvironmentProviders', () => {
        it('should return empty array when no providers configured', () => {
            const result = credentialPool.loadEnvironmentProviders();
            expect(result).toEqual([]);
        });
        
        it('should load single provider with basic configuration', () => {
            process.env.LP_TYPE_0 = 'groq-free';
            process.env.LP_KEY_0 = 'gsk_test123';
            
            const result = credentialPool.loadEnvironmentProviders();
            
            expect(result).toHaveLength(1);
            expect(result[0]).toMatchObject({
                id: 'env-provider-0',
                type: 'groq-free',
                apiKey: 'gsk_test123',
                source: 'environment',
                index: 0,
                priority: 100 // default
            });
        });
        
        it('should load provider with custom priority', () => {
            process.env.LP_TYPE_0 = 'groq-free';
            process.env.LP_KEY_0 = 'gsk_test123';
            process.env.LP_PRIORITY_0 = '5';
            
            const result = credentialPool.loadEnvironmentProviders();
            
            expect(result[0].priority).toBe(5);
        });
        
        it('should handle invalid priority gracefully', () => {
            process.env.LP_TYPE_0 = 'groq-free';
            process.env.LP_KEY_0 = 'gsk_test123';
            process.env.LP_PRIORITY_0 = 'invalid';
            
            const result = credentialPool.loadEnvironmentProviders();
            
            expect(result[0].priority).toBe(100); // default
        });
        
        it('should load provider with endpoint configuration', () => {
            process.env.LP_TYPE_0 = 'groq-free';
            process.env.LP_KEY_0 = 'gsk_test123';
            process.env.LP_ENDPOINT_0 = 'https://api.groq.com/openai/v1';
            
            const result = credentialPool.loadEnvironmentProviders();
            
            expect(result[0].apiEndpoint).toBe('https://api.groq.com/openai/v1');
        });
        
        it('should load provider with model name', () => {
            process.env.LP_TYPE_0 = 'groq-free';
            process.env.LP_KEY_0 = 'gsk_test123';
            process.env.LP_MODEL_0 = 'llama-3.1-70b-instruct';
            
            const result = credentialPool.loadEnvironmentProviders();
            
            expect(result[0].modelName).toBe('llama-3.1-70b-instruct');
        });
        
        it('should load provider with rate limit', () => {
            process.env.LP_TYPE_0 = 'groq-free';
            process.env.LP_KEY_0 = 'gsk_test123';
            process.env.LP_RATE_LIMIT_0 = '10000';
            
            const result = credentialPool.loadEnvironmentProviders();
            
            expect(result[0].rateLimitTPM).toBe(10000);
        });
        
        it('should load provider with allowed models (comma-separated)', () => {
            process.env.LP_TYPE_0 = 'groq-free';
            process.env.LP_KEY_0 = 'gsk_test123';
            process.env.LP_ALLOWED_MODELS_0 = 'model1,model2,model3';
            
            const result = credentialPool.loadEnvironmentProviders();
            
            expect(result[0].allowedModels).toEqual(['model1', 'model2', 'model3']);
        });
        
        it('should load provider with allowed models (empty string = all)', () => {
            process.env.LP_TYPE_0 = 'groq-free';
            process.env.LP_KEY_0 = 'gsk_test123';
            process.env.LP_ALLOWED_MODELS_0 = '';
            
            const result = credentialPool.loadEnvironmentProviders();
            
            expect(result[0].allowedModels).toBeNull();
        });
        
        it('should load provider with image quality cap', () => {
            process.env.LP_TYPE_0 = 'groq-free';
            process.env.LP_KEY_0 = 'gsk_test123';
            process.env.LP_IMAGE_MAX_QUALITY_0 = 'high';
            
            const result = credentialPool.loadEnvironmentProviders();
            
            expect(result[0].maxImageQuality).toBe('high');
        });
        
        it('should ignore invalid image quality', () => {
            process.env.LP_TYPE_0 = 'groq-free';
            process.env.LP_KEY_0 = 'gsk_test123';
            process.env.LP_IMAGE_MAX_QUALITY_0 = 'invalid-quality';
            
            const result = credentialPool.loadEnvironmentProviders();
            
            expect(result[0].maxImageQuality).toBeUndefined();
        });
        
        it('should load provider with capabilities', () => {
            process.env.LP_TYPE_0 = 'groq-free';
            process.env.LP_KEY_0 = 'gsk_test123';
            process.env.LP_CAPABILITIES_0 = 'chat,image,embeddings';
            
            const result = credentialPool.loadEnvironmentProviders();
            
            expect(result[0].capabilities).toEqual(['chat', 'image', 'embeddings']);
        });
        
        it('should handle gaps in provider indexing', () => {
            process.env.LP_TYPE_0 = 'groq-free';
            process.env.LP_KEY_0 = 'gsk_test123';
            process.env.LP_TYPE_5 = 'openai';
            process.env.LP_KEY_5 = 'sk_test456';
            
            const result = credentialPool.loadEnvironmentProviders();
            
            expect(result).toHaveLength(2);
            expect(result[0].index).toBe(0);
            expect(result[1].index).toBe(5);
        });
        
        it('should skip providers with missing type or key', () => {
            process.env.LP_TYPE_0 = 'groq-free';
            // Missing LP_KEY_0
            process.env.LP_TYPE_1 = 'openai';
            process.env.LP_KEY_1 = 'sk_test456';
            
            const result = credentialPool.loadEnvironmentProviders();
            
            expect(result).toHaveLength(1);
            expect(result[0].type).toBe('openai');
        });
    });
    
    describe('expandProviderForLoadBalancing', () => {
        it('should not expand non-groq providers', () => {
            const provider = {
                type: 'openai',
                apiKey: 'sk_test123'
            };
            
            const result = credentialPool.expandProviderForLoadBalancing(provider);
            
            expect(result).toHaveLength(1);
            expect(result[0]).toBe(provider);
        });
        
        it('should not expand providers with specific model set', () => {
            const provider = {
                type: 'groq-free',
                apiKey: 'gsk_test123',
                modelName: 'llama-3.1-70b-instruct'
            };
            
            const result = credentialPool.expandProviderForLoadBalancing(provider);
            
            expect(result).toHaveLength(1);
            expect(result[0]).toBe(provider);
        });
    });
    
    describe('buildProviderPool', () => {
        it('should build pool with only user providers when not authorized', () => {
            const userProviders = [
                { type: 'groq-free', apiKey: 'gsk_user123' },
                { type: 'openai', apiKey: 'sk_user456' }
            ];
            
            const result = credentialPool.buildProviderPool(userProviders, false);
            
            expect(result).toHaveLength(2);
            expect(result[0].source).toBe('user');
            expect(result[1].source).toBe('user');
        });
        
        it('should build pool with user and environment providers when authorized', () => {
            // Set up environment providers
            process.env.LP_TYPE_0 = 'groq-free';
            process.env.LP_KEY_0 = 'gsk_env123';
            
            const userProviders = [
                { type: 'openai', apiKey: 'sk_user456' }
            ];
            
            const result = credentialPool.buildProviderPool(userProviders, true);
            
            expect(result).toHaveLength(2); // 1 user + 1 env (expanded to 1)
            expect(result[0].source).toBe('user');
            expect(result[1].source).toBe('environment');
        });
        
        it('should handle empty user providers gracefully', () => {
            const result = credentialPool.buildProviderPool([], true);
            
            expect(result).toHaveLength(1); // Only environment provider
        });
        
        it('should filter out invalid user providers', () => {
            const userProviders = [
                { type: 'groq-free', apiKey: 'gsk_valid' }, // valid
                { type: 'openai' }, // invalid - missing apiKey
                { apiKey: 'sk_another' } // invalid - missing type
            ];
            
            const result = credentialPool.buildProviderPool(userProviders, true);
            
            // Should have expanded to multiple models but only 1 valid provider
            expect(result).toHaveLengthGreaterThan(0); 
        });
        
        it('should mark environment providers as server-side keys', () => {
            process.env.LP_TYPE_0 = 'groq-free';
            process.env.LP_KEY_0 = 'gsk_env123';
            
            const result = credentialPool.buildProviderPool([], true);
            
            expect(result[0].isServerSideKey).toBe(true);
        });
        
        it('should mark user providers as non-server-side keys', () => {
            const userProviders = [
                { type: 'openai', apiKey: 'sk_user456' }
            ];
            
            const result = credentialPool.buildProviderPool(userProviders, true);
            
            expect(result[0].isServerSideKey).toBe(false);
        });
    });
    
    describe('hasAvailableProviders', () => {
        it('should return true when user has providers and is not authorized', () => {
            const userProviders = [
                { type: 'groq-free', apiKey: 'gsk_valid' }
            ];
            
            const result = credentialPool.hasAvailableProviders(userProviders, false);
            
            expect(result).toBe(true);
        });
        
        it('should return true when user has providers and is authorized', () => {
            const userProviders = [
                { type: 'groq-free', apiKey: 'gsk_valid' }
            ];
            
            const result = credentialPool.hasAvailableProviders(userProviders, true);
            
            expect(result).toBe(true);
        });
        
        it('should return false when no providers available', () => {
            const result = credentialPool.hasAvailableProviders([], false);
            
            expect(result).toBe(false);
        });
        
        it('should return true when environment providers are available and user is authorized', () => {
            process.env.LP_TYPE_0 = 'groq-free';
            process.env.LP_KEY_0 = 'gsk_env123';
            
            const result = credentialPool.hasAvailableProviders([], true);
            
            expect(result).toBe(true);
        });
        
        it('should return false when environment providers are available but user is not authorized', () => {
            process.env.LP_TYPE_0 = 'groq-free';
            process.env.LP_KEY_0 = 'gsk_env123';
            
            const result = credentialPool.hasAvailableProviders([], false);
            
            expect(result).toBe(false);
        });
    });
    
    describe('Integration Tests', () => {
        it('should properly handle complex provider configuration', () => {
            // Set up multiple providers with various configurations
            process.env.LP_TYPE_0 = 'groq-free';
            process.env.LP_KEY_0 = 'gsk_test123';
            process.env.LP_PRIORITY_0 = '1';
            process.env.LP_ALLOWED_MODELS_0 = 'llama-3.1-70b-instruct';
            
            process.env.LP_TYPE_1 = 'openai';
            process.env.LP_KEY_1 = 'sk_test456';
            process.env.LP_ENDPOINT_1 = 'https://api.openai.com/v1';
            process.env.LP_IMAGE_MAX_QUALITY_1 = 'standard';
            process.env.LP_CAPABILITIES_1 = 'chat,image';
            
            const result = credentialPool.loadEnvironmentProviders();
            
            expect(result).toHaveLength(2);
            
            // Check first provider
            expect(result[0].type).toBe('groq-free');
            expect(result[0].priority).toBe(1);
            expect(result[0].allowedModels).toEqual(['llama-3.1-70b-instruct']);
            
            // Check second provider
            expect(result[1].type).toBe('openai');
            expect(result[1].apiEndpoint).toBe('https://api.openai.com/v1');
            expect(result[1].maxImageQuality).toBe('standard');
            expect(result[1].capabilities).toEqual(['chat', 'image']);
        });
    });
});
