/**
 * Unit tests for generate-image endpoint
 * 
 * This test file covers the image generation endpoint functionality including:
 * - Authentication handling
 * - Provider selection and fallback logic
 * - Image generation with various providers
 * - Error handling for various scenarios
 * - Cost tracking and logging
 */

// Mock external dependencies to isolate the generate-image endpoint logic
jest.mock('../../../src/auth');
jest.mock('../../../src/utils/provider-health');
jest.mock('../../../src/services/google-sheets-logger');
jest.mock('../../../src/utils/credit-check');

// Mock image provider handlers
jest.mock('../../../src/image-providers/openai');
jest.mock('../../../src/image-providers/together');
jest.mock('../../../src/image-providers/replicate');
jest.mock('../../../src/image-providers/gemini');
jest.mock('../../../src/image-providers/atlascloud');

const generateImageEndpoint = require('../../../src/endpoints/generate-image');
const { verifyGoogleOAuthToken } = require('../../../src/auth');
const { checkProviderAvailability, checkMultipleProviders } = require('../../../src/utils/provider-health');
const { logToGoogleSheets } = require('../../../src/services/google-sheets-logger');
const { deductCreditFromCache } = require('../../../src/utils/credit-check');

// Mock the provider handlers
const openaiProvider = require('../../../src/image-providers/openai');
const togetherProvider = require('../../../src/image-providers/together');
const replicateProvider = require('../../../src/image-providers/replicate');
const geminiProvider = require('../../../src/image-providers/gemini');
const atlascloudProvider = require('../../../src/image-providers/atlascloud');

describe('Generate Image Endpoint Service', () => {
    let originalEnv;
    
    beforeEach(() => {
        // Store original environment
        originalEnv = { ...process.env };
        
        // Clear all environment variables that might affect tests
        Object.keys(process.env).forEach(key => {
            if (key.startsWith('GS_') || key.includes('API_KEY') || key.includes('PROVIDER')) {
                delete process.env[key];
            }
        });
        
        // Reset all mocks
        jest.clearAllMocks();
        
        // Setup default mock returns
        verifyGoogleOAuthToken.mockResolvedValue({ email: 'test@example.com' });
        checkProviderAvailability.mockResolvedValue(true);
        checkMultipleProviders.mockResolvedValue([{ provider: 'openai', available: true }]);
        
        // Mock provider handlers to return successful results
        openaiProvider.generateImage.mockResolvedValue({
            imageUrl: 'https://example.com/image.png',
            base64Data: 'base64-encoded-image-data',
            cost: 0.02,
            metadata: { width: 1024, height: 1024 }
        });
        
        togetherProvider.generateImage.mockResolvedValue({
            imageUrl: 'https://example.com/image.png',
            base64Data: 'base64-encoded-image-data',
            cost: 0.01,
            metadata: { width: 1024, height: 1024 }
        });
        
        replicateProvider.generateImage.mockResolvedValue({
            imageUrl: 'https://example.com/image.png',
            base64Data: 'base64-encoded-image-data',
            cost: 0.03,
            metadata: { width: 1024, height: 1024 }
        });
        
        geminiProvider.generateImage.mockResolvedValue({
            imageUrl: 'https://example.com/image.png',
            base64Data: 'base64-encoded-image-data',
            cost: 0.015,
            metadata: { width: 1024, height: 1024 }
        });
        
        atlascloudProvider.generateImage.mockResolvedValue({
            imageUrl: 'https://example.com/image.png',
            base64Data: 'base64-encoded-image-data',
            cost: 0.025,
            metadata: { width: 1024, height: 1024 }
        });
        
        logToGoogleSheets.mockResolvedValue(undefined);
        deductCreditFromCache.mockResolvedValue(undefined);
    });
    
    afterEach(() => {
        // Restore original environment
        process.env = { ...originalEnv };
    });
    
    describe('Module Structure', () => {
        it('should properly load the generate-image module', () => {
            expect(generateImageEndpoint).toBeDefined();
            expect(typeof generateImageEndpoint).toBe('object');
        });
        
        it('should have handleGenerateImage function', () => {
            // The generate-image endpoint exports a handler function for Lambda
            expect(generateImageEndpoint).toHaveProperty('handleGenerateImage');
            expect(typeof generateImageEndpoint.handleGenerateImage).toBe('function');
        });
        
        it('should have generateImageDirect function', () => {
            expect(generateImageEndpoint).toHaveProperty('generateImageDirect');
            expect(typeof generateImageEndpoint.generateImageDirect).toBe('function');
        });
    });
    
    describe('Authentication and Authorization', () => {
        it('should handle invalid OAuth tokens gracefully', async () => {
            verifyGoogleOAuthToken.mockRejectedValue(new Error('Invalid token'));
            
            const event = {
                body: JSON.stringify({
                    prompt: 'A test image',
                    provider: 'openai'
                })
            };
            
            const response = await generateImageEndpoint.handleGenerateImage(event);
            
            expect(response.statusCode).toBe(200); // Will succeed with error in body
        });
        
        it('should handle missing access token gracefully', async () => {
            const event = {
                body: JSON.stringify({
                    prompt: 'A test image',
                    provider: 'openai'
                })
            };
            
            const response = await generateImageEndpoint.handleGenerateImage(event);
            
            expect(response.statusCode).toBe(200); // Will succeed with error in body
        });
    });
    
    describe('Provider Selection', () => {
        it('should select OpenAI provider when specified', async () => {
            const event = {
                body: JSON.stringify({
                    prompt: 'A test image',
                    provider: 'openai'
                })
            };
            
            const response = await generateImageEndpoint.handleGenerateImage(event);
            
            expect(response.statusCode).toBe(200);
        });
        
        it('should select Together provider when specified', async () => {
            const event = {
                body: JSON.stringify({
                    prompt: 'A test image',
                    provider: 'together'
                })
            };
            
            const response = await generateImageEndpoint.handleGenerateImage(event);
            
            expect(response.statusCode).toBe(200);
        });
        
        it('should select Replicate provider when specified', async () => {
            const event = {
                body: JSON.stringify({
                    prompt: 'A test image',
                    provider: 'replicate'
                })
            };
            
            const response = await generateImageEndpoint.handleGenerateImage(event);
            
            expect(response.statusCode).toBe(200);
        });
        
        it('should select Gemini provider when specified', async () => {
            const event = {
                body: JSON.stringify({
                    prompt: 'A test image',
                    provider: 'gemini'
                })
            };
            
            const response = await generateImageEndpoint.handleGenerateImage(event);
            
            expect(response.statusCode).toBe(200);
        });
        
        it('should select Atlas Cloud provider when specified', async () => {
            const event = {
                body: JSON.stringify({
                    prompt: 'A test image',
                    provider: 'atlascloud'
                })
            };
            
            const response = await generateImageEndpoint.handleGenerateImage(event);
            
            expect(response.statusCode).toBe(200);
        });
    });
    
    describe('Image Generation', () => {
        it('should successfully generate image with OpenAI provider', async () => {
            const event = {
                body: JSON.stringify({
                    prompt: 'A beautiful landscape',
                    provider: 'openai'
                })
            };
            
            const response = await generateImageEndpoint.handleGenerateImage(event);
            
            expect(response.statusCode).toBe(200);
        });
        
        it('should handle image generation errors gracefully', async () => {
            // Mock provider to fail
            openaiProvider.generateImage.mockRejectedValue(new Error('API error'));
            
            const event = {
                body: JSON.stringify({
                    prompt: 'A beautiful landscape',
                    provider: 'openai'
                })
            };
            
            const response = await generateImageEndpoint.handleGenerateImage(event);
            
            expect(response.statusCode).toBe(500);
        });
        
        it('should handle missing prompt gracefully', async () => {
            const event = {
                body: JSON.stringify({
                    // No prompt
                    provider: 'openai'
                })
            };
            
            const response = await generateImageEndpoint.handleGenerateImage(event);
            
            expect(response.statusCode).toBe(200); // Will succeed with error in body
        });
    });
    
    describe('Fallback Logic', () => {
        it('should attempt fallback when provider becomes unavailable', async () => {
            // Mock a provider that fails on first call but succeeds on second (fallback)
            openaiProvider.generateImage.mockRejectedValueOnce(new Error('Provider unavailable'))
                .mockResolvedValueOnce({
                    imageUrl: 'https://example.com/image.png',
                    base64Data: 'base64-encoded-image-data',
                    cost: 0.02,
                    metadata: { width: 1024, height: 1024 }
                });
            
            const event = {
                body: JSON.stringify({
                    prompt: 'A beautiful landscape',
                    provider: 'openai'
                })
            };
            
            const response = await generateImageEndpoint.handleGenerateImage(event);
            
            expect(response.statusCode).toBe(200);
        });
    });
    
    describe('Cost Tracking and Logging', () => {
        it('should log to Google Sheets after successful generation', async () => {
            const event = {
                body: JSON.stringify({
                    prompt: 'A beautiful landscape',
                    provider: 'openai'
                })
            };
            
            const response = await generateImageEndpoint.handleGenerateImage(event);
            
            expect(response.statusCode).toBe(200);
            expect(logToGoogleSheets).toHaveBeenCalled();
        });
        
        it('should deduct credit from cache after successful generation', async () => {
            const event = {
                body: JSON.stringify({
                    prompt: 'A beautiful landscape',
                    provider: 'openai'
                })
            };
            
            const response = await generateImageEndpoint.handleGenerateImage(event);
            
            expect(response.statusCode).toBe(200);
            expect(deductCreditFromCache).toHaveBeenCalled();
        });
    });
    
    describe('Error Handling', () => {
        it('should handle internal errors gracefully', async () => {
            // Mock a critical failure in the main handler
            jest.spyOn(generateImageEndpoint, 'handleGenerateImage')
                .mockImplementationOnce(() => {
                    throw new Error('Internal server error');
                });
            
            const event = {
                body: JSON.stringify({
                    prompt: 'A beautiful landscape',
                    provider: 'openai'
                })
            };
            
            const response = await generateImageEndpoint.handleGenerateImage(event);
            
            expect(response.statusCode).toBe(500);
        });
        
        it('should handle invalid provider gracefully', async () => {
            const event = {
                body: JSON.stringify({
                    prompt: 'A beautiful landscape',
                    provider: 'invalid-provider'
                })
            };
            
            const response = await generateImageEndpoint.handleGenerateImage(event);
            
            expect(response.statusCode).toBe(200); // Will succeed with error in body
        });
    });
    
    describe('Response Format', () => {
        it('should return proper JSON response with image data', async () => {
            const event = {
                body: JSON.stringify({
                    prompt: 'A beautiful landscape',
                    provider: 'openai'
                })
            };
            
            const response = await generateImageEndpoint.handleGenerateImage(event);
            
            expect(response.statusCode).toBe(200);
            expect(response.headers).toHaveProperty('Content-Type', 'application/json');
            expect(response.body).toContain('imageUrl');
            expect(response.body).toContain('base64');
        });
    });
});
