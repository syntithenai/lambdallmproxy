/**
 * Unit tests for chat endpoint
 * 
 * This test file covers the main chat endpoint functionality including:
 * - Module structure and exports
 * - Authentication handling
 * - Provider selection logic
 * - Model selection and routing
 * - Tool execution flow
 * - Streaming response handling
 */

// Mock external dependencies to isolate the chat endpoint logic
jest.mock('../../../src/auth');
jest.mock('../../../src/tools');
jest.mock('../../../src/streaming/sse-writer');
jest.mock('../../../src/providers');
jest.mock('../../../src/utils/progress-emitter');
jest.mock('../../../src/utils/token-estimation');
jest.mock('../../../src/credential-pool');
jest.mock('../../../src/model-selection/rate-limit-tracker');
jest.mock('../../../src/model-selection/selector');
jest.mock('../../../src/guardrails/config');
jest.mock('../../../src/services/google-sheets-logger');
jest.mock('../../../src/utils/catalog-loader');
jest.mock('../../../src/groq-rate-limits');
jest.mock('../../../src/gemini-rate-limits');
jest.mock('../../../src/utils/memory-tracker');
jest.mock('../../../src/utils/security-headers');
jest.mock('../../../src/utils/todos-manager');
jest.mock('../../../src/utils/languageInstructions');
jest.mock('../../../src/utils/query-complexity');
jest.mock('../../../src/utils/content-optimizer');
jest.mock('../../../src/utils/credit-check');
jest.mock('../../../src/utils/pricing-service');

const chatEndpoint = require('../../../src/endpoints/chat');
const { verifyGoogleToken, authenticateRequest } = require('../../../src/auth');
const { callFunction } = require('../../../src/tools');
const { createSSEStreamAdapter } = require('../../../src/streaming/sse-writer');
const { buildProviderPool, hasAvailableProviders } = require('../../../src/credential-pool');
const { RateLimitTracker } = require('../../../src/model-selection/rate-limit-tracker');
const { selectModel, selectWithFallback, RoundRobinSelector, SelectionStrategy } = require('../../../src/model-selection/selector');
const { loadGuardrailConfig } = require('../../../src/guardrails/config');
const { logToGoogleSheets, calculateCost } = require('../../../src/services/google-sheets-logger');
const { loadProviderCatalog } = require('../../../src/utils/catalog-loader');
const { getMemoryTracker } = require('../../../src/utils/memory-tracker');
const { getSecurityHeaders } = require('../../../src/utils/security-headers');
const { TodosManager } = require('../../../src/utils/todos-manager');
const { getLanguageInstruction } = require('../../../src/utils/languageInstructions');
const { getOptimalModel, analyzeQueryComplexity } = require('../../../src/utils/query-complexity');
const { getOptimalMaxTokens } = require('../../../src/utils/content-optimizer');
const { checkCreditBalance, estimateChatCost } = require('../../../src/utils/credit-check');
const { calculateLLMCost, isUIKey } = require('../../../src/utils/pricing-service');

// Mock awslambda for streaming responses
global.awslambda = {
    HttpResponseStream: {
        from: jest.fn((stream, metadata) => {
            stream.metadata = metadata;
            return stream;
        })
    }
};

describe('Chat Endpoint Service', () => {
    let originalEnv;
    
    beforeEach(() => {
        // Store original environment
        originalEnv = { ...process.env };
        
        // Clear all environment variables that might affect tests
        Object.keys(process.env).forEach(key => {
            if (key.startsWith('GS_') || key === 'CREDIT_LIMIT' || key.includes('PROVIDER')) {
                delete process.env[key];
            }
        });
        
        // Reset all mocks
        jest.clearAllMocks();
        
        // Setup default mock returns
        authenticateRequest.mockReturnValue({
            authenticated: true,
            authorized: true,
            email: 'test@example.com',
            user: { email: 'test@example.com' }
        });
        
        buildProviderPool.mockReturnValue([
            {
                type: 'groq-free',
                apiKey: 'test-api-key',
                source: 'environment'
            }
        ]);
        
        hasAvailableProviders.mockReturnValue(true);
        
        // Mock memory tracker
        const mockMemoryTracker = {
            snapshot: jest.fn(),
            getCurrentUsage: jest.fn().mockReturnValue({
                heapUsedMB: 10,
                rssMB: 50
            })
        };
        getMemoryTracker.mockReturnValue(mockMemoryTracker);
        
        // Mock security headers
        getSecurityHeaders.mockReturnValue({
            'X-Content-Type-Options': 'nosniff',
            'X-Frame-Options': 'DENY'
        });
        
        // Mock todos manager
        TodosManager.mockImplementation(() => ({
            emit: jest.fn()
        }));
        
        // Mock language instruction
        getLanguageInstruction.mockReturnValue('Respond in English');
        
        // Mock query complexity functions
        getOptimalModel.mockReturnValue('llama-3.1-8b-instant');
        analyzeQueryComplexity.mockReturnValue({ complexity: 'simple' });
        
        // Mock content optimizer
        getOptimalMaxTokens.mockReturnValue(1000);
        
        // Mock credit check
        checkCreditBalance.mockResolvedValue({
            allowed: true,
            balance: 10.0
        });
        estimateChatCost.mockReturnValue(0.001);
        
        // Mock pricing service
        calculateLLMCost.mockReturnValue(0.0001);
        isUIKey.mockReturnValue(false);
    });
    
    afterEach(() => {
        // Restore original environment
        process.env = { ...originalEnv };
    });
    
    describe('Module Structure', () => {
        it('should properly load the chat module', () => {
            expect(chatEndpoint).toBeDefined();
            expect(typeof chatEndpoint).toBe('object');
        });
        
        it('should have a handler function', () => {
            // The chat endpoint exports a handler function for Lambda
            expect(chatEndpoint).toHaveProperty('handler');
            expect(typeof chatEndpoint.handler).toBe('function');
        });
    });
    
    describe('Authentication and Authorization', () => {
        it('should reject unauthenticated requests', async () => {
            authenticateRequest.mockReturnValue({
                authenticated: false,
                authorized: false
            });
            
            const mockStream = {
                write: jest.fn(),
                end: jest.fn()
            };
            
            const event = {
                headers: {},
                body: JSON.stringify({
                    messages: [{ role: 'user', content: 'Hello' }]
                })
            };
            
            await chatEndpoint.handler(event, mockStream);
            
            expect(mockStream.write).toHaveBeenCalledWith(expect.stringContaining('error'));
        });
        
        it('should reject requests with no providers available', async () => {
            hasAvailableProviders.mockReturnValue(false);
            
            const mockStream = {
                write: jest.fn(),
                end: jest.fn()
            };
            
            const event = {
                headers: { Authorization: 'Bearer valid-token' },
                body: JSON.stringify({
                    messages: [{ role: 'user', content: 'Hello' }]
                })
            };
            
            await chatEndpoint.handler(event, mockStream);
            
            expect(mockStream.write).toHaveBeenCalledWith(expect.stringContaining('error'));
        });
    });
    
    describe('Provider and Model Selection', () => {
        it('should select appropriate provider and model', async () => {
            // Mock the selection functions
            selectModel.mockReturnValue({
                model: { name: 'llama-3.1-8b-instant', providerType: 'groq-free' },
                category: 'free',
                analysis: { type: 'SIMPLE', estimatedTokens: 100 }
            });
            
            const mockStream = {
                write: jest.fn(),
                end: jest.fn()
            };
            
            const event = {
                headers: { Authorization: 'Bearer valid-token' },
                body: JSON.stringify({
                    messages: [{ role: 'user', content: 'Hello' }]
                })
            };
            
            await chatEndpoint.handler(event, mockStream);
            
            // Should have written some events
            expect(mockStream.write).toHaveBeenCalled();
        });
        
        it('should handle model selection fallback', async () => {
            // Mock the selection functions to throw first, then succeed
            selectModel.mockImplementation(() => {
                throw new Error('Selection failed');
            });
            
            selectWithFallback.mockReturnValue({
                model: { name: 'llama-3.1-8b-instant', providerType: 'groq-free' },
                category: 'free',
                analysis: { type: 'SIMPLE', estimatedTokens: 100 }
            });
            
            const mockStream = {
                write: jest.fn(),
                end: jest.fn()
            };
            
            const event = {
                headers: { Authorization: 'Bearer valid-token' },
                body: JSON.stringify({
                    messages: [{ role: 'user', content: 'Hello' }]
                })
            };
            
            await chatEndpoint.handler(event, mockStream);
            
            // Should have written some events
            expect(mockStream.write).toHaveBeenCalled();
        });
    });
    
    describe('Tool Execution', () => {
        it('should execute tool calls when provided', async () => {
            callFunction.mockResolvedValue('{"result": "test"}');
            
            const mockStream = {
                write: jest.fn(),
                end: jest.fn()
            };
            
            const event = {
                headers: { Authorization: 'Bearer valid-token' },
                body: JSON.stringify({
                    messages: [{ role: 'user', content: 'Hello' }],
                    tools: [{
                        name: 'search_web',
                        description: 'Search the web',
                        parameters: {}
                    }]
                })
            };
            
            await chatEndpoint.handler(event, mockStream);
            
            // Should have executed tool calls
            expect(callFunction).toHaveBeenCalled();
        });
        
        it('should handle tool execution errors gracefully', async () => {
            callFunction.mockRejectedValue(new Error('Tool execution failed'));
            
            const mockStream = {
                write: jest.fn(),
                end: jest.fn()
            };
            
            const event = {
                headers: { Authorization: 'Bearer valid-token' },
                body: JSON.stringify({
                    messages: [{ role: 'user', content: 'Hello' }],
                    tools: [{
                        name: 'search_web',
                        description: 'Search the web',
                        parameters: {}
                    }]
                })
            };
            
            await chatEndpoint.handler(event, mockStream);
            
            // Should have written error events
            expect(mockStream.write).toHaveBeenCalled();
        });
    });
    
    describe('Credit System', () => {
        it('should check credit balance before processing request', async () => {
            checkCreditBalance.mockResolvedValue({
                allowed: false,
                error: {
                    error: 'Insufficient credit',
                    code: 'INSUFFICIENT_CREDIT'
                }
            });
            
            const mockStream = {
                write: jest.fn(),
                end: jest.fn()
            };
            
            const event = {
                headers: { Authorization: 'Bearer valid-token' },
                body: JSON.stringify({
                    messages: [{ role: 'user', content: 'Hello' }]
                })
            };
            
            await chatEndpoint.handler(event, mockStream);
            
            expect(mockStream.write).toHaveBeenCalledWith(expect.stringContaining('error'));
        });
        
        it('should proceed with request when credit is sufficient', async () => {
            checkCreditBalance.mockResolvedValue({
                allowed: true,
                balance: 10.0
            });
            
            const mockStream = {
                write: jest.fn(),
                end: jest.fn()
            };
            
            const event = {
                headers: { Authorization: 'Bearer valid-token' },
                body: JSON.stringify({
                    messages: [{ role: 'user', content: 'Hello' }]
                })
            };
            
            await chatEndpoint.handler(event, mockStream);
            
            // Should have written some events
            expect(mockStream.write).toHaveBeenCalled();
        });
    });
    
    describe('Guardrails Integration', () => {
        it('should initialize guardrails when enabled', async () => {
            loadGuardrailConfig.mockReturnValue({
                input: { enabled: true, rules: [] }
            });
            
            const mockStream = {
                write: jest.fn(),
                end: jest.fn()
            };
            
            const event = {
                headers: { Authorization: 'Bearer valid-token' },
                body: JSON.stringify({
                    messages: [{ role: 'user', content: 'Hello' }]
                })
            };
            
            await chatEndpoint.handler(event, mockStream);
            
            // Should have initialized guardrails
            expect(loadGuardrailConfig).toHaveBeenCalled();
        });
    });
    
    describe('Test Requests', () => {
        it('should handle test requests without processing', async () => {
            const mockStream = {
                write: jest.fn(),
                end: jest.fn()
            };
            
            const event = {
                headers: { Authorization: 'Bearer valid-token' },
                body: JSON.stringify({
                    messages: [{ role: 'user', content: 'test' }]
                })
            };
            
            await chatEndpoint.handler(event, mockStream);
            
            // Should end without processing
            expect(mockStream.end).toHaveBeenCalled();
        });
    });
    
    describe('Error Handling', () => {
        it('should handle invalid request body gracefully', async () => {
            const mockStream = {
                write: jest.fn(),
                end: jest.fn()
            };
            
            const event = {
                headers: { Authorization: 'Bearer valid-token' },
                body: 'invalid json'
            };
            
            await chatEndpoint.handler(event, mockStream);
            
            // Should have written error
            expect(mockStream.write).toHaveBeenCalledWith(expect.stringContaining('error'));
        });
        
        it('should handle missing messages gracefully', async () => {
            const mockStream = {
                write: jest.fn(),
                end: jest.fn()
            };
            
            const event = {
                headers: { Authorization: 'Bearer valid-token' },
                body: JSON.stringify({
                    // No messages
                })
            };
            
            await chatEndpoint.handler(event, mockStream);
            
            // Should have written error
            expect(mockStream.write).toHaveBeenCalledWith(expect.stringContaining('error'));
        });
    });
});
