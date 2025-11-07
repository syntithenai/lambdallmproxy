/**
 * Tests for Cost Logger Service
 * 
 * Coverage:
 * - LLM cost logging (chat, image generation, etc.)
 * - Lambda execution cost logging
 * - Generic cost logging
 * - Error handling (logging failures should not crash operations)
 * - User anonymization
 * - Metadata handling
 * - UI key tracking
 */

const costLogger = require('../../../src/services/cost-logger');
const googleSheetsLogger = require('../../../src/services/google-sheets-logger');

// Mock Google Sheets logger
jest.mock('../../../src/services/google-sheets-logger');

describe('Cost Logger Service', () => {
    let consoleLogSpy;
    let consoleErrorSpy;
    
    beforeEach(() => {
        jest.clearAllMocks();
        consoleLogSpy = jest.spyOn(console, 'log').mockImplementation();
        consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();
        
        // Mock successful logging by default
        googleSheetsLogger.logToGoogleSheets.mockResolvedValue();
    });
    
    afterEach(() => {
        consoleLogSpy.mockRestore();
        consoleErrorSpy.mockRestore();
    });
    
    describe('logLLMCost', () => {
        it('should log LLM chat cost with all required fields', async () => {
            await costLogger.logLLMCost({
                userEmail: 'user@example.com',
                model: 'gpt-4',
                promptTokens: 100,
                completionTokens: 50,
                cost: 0.0015,
                provider: 'openai',
                isUIKey: false,
                requestId: 'req-123',
                durationMs: 1500,
                type: 'chat'
            });
            
            expect(googleSheetsLogger.logToGoogleSheets).toHaveBeenCalledTimes(1);
            expect(googleSheetsLogger.logToGoogleSheets).toHaveBeenCalledWith(
                expect.objectContaining({
                    userEmail: 'user@example.com',
                    model: 'gpt-4',
                    type: 'chat',
                    provider: 'openai',
                    promptTokens: 100,
                    completionTokens: 50,
                    totalTokens: 150,
                    cost: 0.0015,
                    durationMs: 1500,
                    requestId: 'req-123'
                })
            );
            
            // Check metadata
            const callArgs = googleSheetsLogger.logToGoogleSheets.mock.calls[0][0];
            expect(callArgs.metadata).toMatchObject({
                provider: 'openai',
                isUIKey: false
            });
            
            expect(consoleLogSpy).toHaveBeenCalledWith(
                expect.stringContaining('Logged LLM cost for user@example.com: $0.001500')
            );
        });
        
        it('should log LLM image generation cost', async () => {
            await costLogger.logLLMCost({
                userEmail: 'user@example.com',
                model: 'dall-e-3',
                promptTokens: 0,
                completionTokens: 0,
                cost: 0.04,
                provider: 'openai',
                isUIKey: false,
                requestId: 'req-456',
                durationMs: 3000,
                type: 'image_generation',
                metadata: {
                    imageSize: '1024x1024',
                    quality: 'standard'
                }
            });
            
            expect(googleSheetsLogger.logToGoogleSheets).toHaveBeenCalledWith(
                expect.objectContaining({
                    type: 'image_generation',
                    cost: 0.04
                })
            );
            
            const callArgs = googleSheetsLogger.logToGoogleSheets.mock.calls[0][0];
            expect(callArgs.metadata.imageSize).toBe('1024x1024');
            expect(callArgs.metadata.quality).toBe('standard');
        });
        
        it('should anonymize missing user email', async () => {
            await costLogger.logLLMCost({
                model: 'gpt-3.5-turbo',
                promptTokens: 50,
                completionTokens: 25,
                cost: 0.0001,
                provider: 'openai',
                isUIKey: false,
                requestId: 'req-789',
                durationMs: 500,
                type: 'chat'
            });
            
            expect(googleSheetsLogger.logToGoogleSheets).toHaveBeenCalledWith(
                expect.objectContaining({
                    userEmail: 'anonymous'
                })
            );
            
            expect(consoleLogSpy).toHaveBeenCalledWith(
                expect.stringContaining('Logged LLM cost for anonymous')
            );
        });
        
        it('should mark UI key requests correctly', async () => {
            await costLogger.logLLMCost({
                userEmail: 'user@example.com',
                model: 'claude-3-sonnet',
                promptTokens: 200,
                completionTokens: 100,
                cost: 0.0,  // Free for UI keys
                provider: 'anthropic',
                isUIKey: true,
                requestId: 'req-ui-1',
                durationMs: 2000,
                type: 'chat'
            });
            
            const callArgs = googleSheetsLogger.logToGoogleSheets.mock.calls[0][0];
            expect(callArgs.metadata.isUIKey).toBe(true);
            expect(callArgs.cost).toBe(0.0);
        });
        
        it('should handle logging errors gracefully', async () => {
            googleSheetsLogger.logToGoogleSheets.mockRejectedValue(
                new Error('Google Sheets API error')
            );
            
            await expect(
                costLogger.logLLMCost({
                    userEmail: 'user@example.com',
                    model: 'gpt-4',
                    promptTokens: 100,
                    completionTokens: 50,
                    cost: 0.0015,
                    provider: 'openai',
                    isUIKey: false,
                    requestId: 'req-error',
                    durationMs: 1500,
                    type: 'chat'
                })
            ).resolves.not.toThrow();
            
            expect(consoleErrorSpy).toHaveBeenCalledWith(
                expect.stringContaining('Failed to log LLM cost to Google Sheets'),
                'Google Sheets API error'
            );
        });
        
        it('should include custom metadata', async () => {
            await costLogger.logLLMCost({
                userEmail: 'user@example.com',
                model: 'gpt-4',
                promptTokens: 100,
                completionTokens: 50,
                cost: 0.0015,
                provider: 'openai',
                isUIKey: false,
                requestId: 'req-meta',
                durationMs: 1500,
                type: 'chat',
                metadata: {
                    temperature: 0.7,
                    maxTokens: 500,
                    streaming: true
                }
            });
            
            const callArgs = googleSheetsLogger.logToGoogleSheets.mock.calls[0][0];
            expect(callArgs.metadata).toMatchObject({
                provider: 'openai',
                isUIKey: false,
                temperature: 0.7,
                maxTokens: 500,
                streaming: true
            });
        });
        
        it('should default type to "chat" if not specified', async () => {
            await costLogger.logLLMCost({
                userEmail: 'user@example.com',
                model: 'gpt-4',
                promptTokens: 100,
                completionTokens: 50,
                cost: 0.0015,
                provider: 'openai',
                isUIKey: false,
                requestId: 'req-default',
                durationMs: 1500
                // type not specified
            });
            
            expect(googleSheetsLogger.logToGoogleSheets).toHaveBeenCalledWith(
                expect.objectContaining({
                    type: 'chat'
                })
            );
        });
    });
    
    describe('logLambdaCost', () => {
        it('should log Lambda execution cost with all required fields', async () => {
            await costLogger.logLambdaCost({
                userEmail: 'user@example.com',
                durationMs: 5000,
                memoryMB: 512,
                cost: 0.00001,
                requestId: 'lambda-123',
                metadata: {
                    region: 'us-east-1'
                }
            });
            
            expect(googleSheetsLogger.logToGoogleSheets).toHaveBeenCalledTimes(1);
            expect(googleSheetsLogger.logToGoogleSheets).toHaveBeenCalledWith(
                expect.objectContaining({
                    userEmail: 'user@example.com',
                    model: 'lambda',
                    type: 'lambda_execution',
                    promptTokens: 0,
                    completionTokens: 0,
                    totalTokens: 0,
                    cost: 0.00001,
                    durationMs: 5000,
                    requestId: 'lambda-123'
                })
            );
            
            const callArgs = googleSheetsLogger.logToGoogleSheets.mock.calls[0][0];
            expect(callArgs.metadata).toMatchObject({
                memoryMB: 512,
                costPerRequest: 0.00001,
                region: 'us-east-1'
            });
            
            expect(consoleLogSpy).toHaveBeenCalledWith(
                expect.stringContaining('Logged Lambda cost for user@example.com: $0.000010')
            );
        });
        
        it('should anonymize missing user email', async () => {
            await costLogger.logLambdaCost({
                durationMs: 2000,
                memoryMB: 256,
                cost: 0.000005,
                requestId: 'lambda-anon'
            });
            
            expect(googleSheetsLogger.logToGoogleSheets).toHaveBeenCalledWith(
                expect.objectContaining({
                    userEmail: 'anonymous'
                })
            );
        });
        
        it('should handle logging errors gracefully', async () => {
            googleSheetsLogger.logToGoogleSheets.mockRejectedValue(
                new Error('Network error')
            );
            
            await expect(
                costLogger.logLambdaCost({
                    userEmail: 'user@example.com',
                    durationMs: 3000,
                    memoryMB: 512,
                    cost: 0.00001,
                    requestId: 'lambda-error'
                })
            ).resolves.not.toThrow();
            
            expect(consoleErrorSpy).toHaveBeenCalledWith(
                expect.stringContaining('Failed to log Lambda cost to Google Sheets'),
                'Network error'
            );
        });
    });
    
    describe('logCost', () => {
        it('should log generic operation cost', async () => {
            await costLogger.logCost({
                userEmail: 'user@example.com',
                cost: 0.005,
                operationType: 'text_to_speech',
                isUIKey: false,
                requestId: 'tts-123',
                metadata: {
                    voice: 'alloy',
                    words: 500
                }
            });
            
            expect(googleSheetsLogger.logToGoogleSheets).toHaveBeenCalledTimes(1);
            expect(googleSheetsLogger.logToGoogleSheets).toHaveBeenCalledWith(
                expect.objectContaining({
                    userEmail: 'user@example.com',
                    model: 'text_to_speech',
                    type: 'text_to_speech',
                    promptTokens: 0,
                    completionTokens: 0,
                    totalTokens: 0,
                    cost: 0.005,
                    durationMs: 0,
                    requestId: 'tts-123'
                })
            );
            
            const callArgs = googleSheetsLogger.logToGoogleSheets.mock.calls[0][0];
            expect(callArgs.metadata).toMatchObject({
                isUIKey: false,
                operationType: 'text_to_speech',
                voice: 'alloy',
                words: 500
            });
            
            expect(consoleLogSpy).toHaveBeenCalledWith(
                expect.stringContaining('Logged generic cost for user@example.com: $0.005000 (text_to_speech)')
            );
        });
        
        it('should default operation type to "unknown"', async () => {
            await costLogger.logCost({
                userEmail: 'user@example.com',
                cost: 0.001,
                requestId: 'unknown-123'
            });
            
            expect(googleSheetsLogger.logToGoogleSheets).toHaveBeenCalledWith(
                expect.objectContaining({
                    type: 'unknown',
                    model: 'unknown'
                })
            );
            
            expect(consoleLogSpy).toHaveBeenCalledWith(
                expect.stringContaining('(unknown)')
            );
        });
        
        it('should default isUIKey to false', async () => {
            await costLogger.logCost({
                userEmail: 'user@example.com',
                cost: 0.001,
                operationType: 'transcription',
                requestId: 'transcribe-123'
            });
            
            const callArgs = googleSheetsLogger.logToGoogleSheets.mock.calls[0][0];
            expect(callArgs.metadata.isUIKey).toBe(false);
        });
        
        it('should anonymize missing user email', async () => {
            await costLogger.logCost({
                cost: 0.002,
                operationType: 'embedding',
                requestId: 'embed-anon'
            });
            
            expect(googleSheetsLogger.logToGoogleSheets).toHaveBeenCalledWith(
                expect.objectContaining({
                    userEmail: 'anonymous'
                })
            );
        });
        
        it('should handle logging errors gracefully', async () => {
            googleSheetsLogger.logToGoogleSheets.mockRejectedValue(
                new Error('Database error')
            );
            
            await expect(
                costLogger.logCost({
                    userEmail: 'user@example.com',
                    cost: 0.001,
                    operationType: 'custom',
                    requestId: 'custom-error'
                })
            ).resolves.not.toThrow();
            
            expect(consoleErrorSpy).toHaveBeenCalledWith(
                expect.stringContaining('Failed to log generic cost to Google Sheets'),
                'Database error'
            );
        });
    });
    
    describe('Integration Tests', () => {
        it('should log costs with consistent timestamp format', async () => {
            const beforeTimestamp = new Date().toISOString();
            
            await costLogger.logLLMCost({
                userEmail: 'user@example.com',
                model: 'gpt-4',
                promptTokens: 100,
                completionTokens: 50,
                cost: 0.0015,
                provider: 'openai',
                isUIKey: false,
                requestId: 'req-timestamp',
                durationMs: 1500,
                type: 'chat'
            });
            
            const afterTimestamp = new Date().toISOString();
            
            const callArgs = googleSheetsLogger.logToGoogleSheets.mock.calls[0][0];
            expect(callArgs.timestamp).toBeDefined();
            expect(callArgs.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
            expect(callArgs.timestamp >= beforeTimestamp).toBe(true);
            expect(callArgs.timestamp <= afterTimestamp).toBe(true);
        });
        
        it('should preserve metadata across all logging functions', async () => {
            const testMetadata = {
                customField1: 'value1',
                customField2: 123,
                customField3: true
            };
            
            await costLogger.logLLMCost({
                userEmail: 'user@example.com',
                model: 'gpt-4',
                promptTokens: 100,
                completionTokens: 50,
                cost: 0.0015,
                provider: 'openai',
                isUIKey: false,
                requestId: 'req-1',
                durationMs: 1500,
                type: 'chat',
                metadata: testMetadata
            });
            
            let callArgs = googleSheetsLogger.logToGoogleSheets.mock.calls[0][0];
            expect(callArgs.metadata).toMatchObject(testMetadata);
            
            jest.clearAllMocks();
            
            await costLogger.logLambdaCost({
                userEmail: 'user@example.com',
                durationMs: 2000,
                memoryMB: 512,
                cost: 0.00001,
                requestId: 'lambda-1',
                metadata: testMetadata
            });
            
            callArgs = googleSheetsLogger.logToGoogleSheets.mock.calls[0][0];
            expect(callArgs.metadata).toMatchObject(testMetadata);
            
            jest.clearAllMocks();
            
            await costLogger.logCost({
                userEmail: 'user@example.com',
                cost: 0.001,
                operationType: 'custom',
                requestId: 'custom-1',
                metadata: testMetadata
            });
            
            callArgs = googleSheetsLogger.logToGoogleSheets.mock.calls[0][0];
            expect(callArgs.metadata).toMatchObject(testMetadata);
        });
    });
});
