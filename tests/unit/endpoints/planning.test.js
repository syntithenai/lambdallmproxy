/**
 * Unit tests for planning endpoint
 */

global.awslambda = {
    HttpResponseStream: {
        from: jest.fn((stream, metadata) => {
            stream.metadata = metadata;
            return stream;
        })
    }
};

const { handler, generatePlan } = require('../../../src/endpoints/planning');
const { llmResponsesWithTools } = require('../../../src/llm_tools_adapter');
const { verifyGoogleToken, getAllowedEmails } = require('../../../src/auth');

jest.mock('../../../src/llm_tools_adapter');
jest.mock('../../../src/auth');

describe('Planning Endpoint', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });
    
    describe('generatePlan', () => {
        it('should generate a valid plan from LLM response', async () => {
            const mockResponse = {
                text: JSON.stringify({
                    text: 'This is a research plan',
                    searchKeywords: [['keyword1', 'keyword2'], ['keyword3']],
                    questions: ['Question 1?', 'Question 2?'],
                    persona: 'I am an expert researcher',
                    reasoning: 'This approach is optimal',
                    complexityAssessment: 'medium'
                })
            };
            
            llmResponsesWithTools.mockResolvedValue(mockResponse);
            
            const result = await generatePlan('test query', 'test-api-key');
            
            expect(result).toHaveProperty('text', 'This is a research plan');
            expect(result).toHaveProperty('searchKeywords');
            expect(result.searchKeywords).toEqual([['keyword1', 'keyword2'], ['keyword3']]);
            expect(result).toHaveProperty('questions');
            expect(result.questions).toEqual(['Question 1?', 'Question 2?']);
            expect(result).toHaveProperty('persona', 'I am an expert researcher');
        });
        
        it('should throw error for empty query', async () => {
            await expect(generatePlan('', 'test-api-key')).rejects.toThrow('Query parameter is required');
        });
        
        it('should throw error for missing API key', async () => {
            await expect(generatePlan('test query', '')).rejects.toThrow('API key is required');
        });
        
        it('should throw error for invalid LLM response format', async () => {
            const mockResponse = {
                text: JSON.stringify({
                    text: 'Missing other fields'
                })
            };
            
            llmResponsesWithTools.mockResolvedValue(mockResponse);
            
            await expect(generatePlan('test query', 'test-api-key')).rejects.toThrow('Invalid plan response: missing required fields');
        });
        
        it('should throw error for invalid searchKeywords format', async () => {
            const mockResponse = {
                text: JSON.stringify({
                    text: 'Plan text',
                    searchKeywords: 'not an array',
                    questions: ['Q1'],
                    persona: 'Expert'
                })
            };
            
            llmResponsesWithTools.mockResolvedValue(mockResponse);
            
            await expect(generatePlan('test query', 'test-api-key')).rejects.toThrow('searchKeywords must be an array of arrays');
        });
        
        it('should handle LLM errors gracefully', async () => {
            llmResponsesWithTools.mockRejectedValue(new Error('LLM service unavailable'));
            
            await expect(generatePlan('test query', 'test-api-key')).rejects.toThrow('LLM service unavailable');
        });
    });
    
    // TODO: Update handler unit tests for streaming - currently covered by integration tests
    describe.skip('handler', () => {
        it('should return 401 for missing authentication', async () => {
            verifyGoogleToken.mockReturnValue(null);
            getAllowedEmails.mockReturnValue(['allowed@example.com']);
            
            const event = {
                headers: {},
                body: JSON.stringify({
                    query: 'test query',
                    apiKey: 'test-api-key'
                })
            };
            
            const response = await handler(event);
            
            expect(response.statusCode).toBe(401);
            const body = JSON.parse(response.body);
            expect(body.error).toContain('Authentication required');
        });
        
        it('should return 401 for invalid token', async () => {
            verifyGoogleToken.mockReturnValue({ email: 'notallowed@example.com' });
            getAllowedEmails.mockReturnValue(['allowed@example.com']);
            
            const event = {
                headers: { Authorization: 'Bearer invalid-token' },
                body: JSON.stringify({
                    query: 'test query',
                    apiKey: 'test-api-key'
                })
            };
            
            const response = await handler(event);
            
            expect(response.statusCode).toBe(401);
        });
        
        it('should return plan for valid authenticated request', async () => {
            const mockResponse = {
                text: JSON.stringify({
                    text: 'Research plan',
                    searchKeywords: [['kw1']],
                    questions: ['Q1?'],
                    persona: 'Expert'
                })
            };
            
            llmResponsesWithTools.mockResolvedValue(mockResponse);
            verifyGoogleToken.mockReturnValue({ email: 'allowed@example.com', name: 'Test User' });
            getAllowedEmails.mockReturnValue(['allowed@example.com']);
            
            const event = {
                headers: { Authorization: 'Bearer valid-token' },
                body: JSON.stringify({
                    query: 'test query',
                    apiKey: 'test-api-key'
                })
            };
            
            const response = await handler(event);
            
            expect(response.statusCode).toBe(200);
            expect(response.headers['Content-Type']).toBe('application/json');
            
            const body = JSON.parse(response.body);
            expect(body).toHaveProperty('text');
            expect(body).toHaveProperty('searchKeywords');
            expect(body).toHaveProperty('questions');
            expect(body).toHaveProperty('persona');
        });
        
        it('should return 400 for missing query', async () => {
            verifyGoogleToken.mockReturnValue({ email: 'allowed@example.com' });
            getAllowedEmails.mockReturnValue(['allowed@example.com']);
            
            const event = {
                headers: { Authorization: 'Bearer valid-token' },
                body: JSON.stringify({
                    apiKey: 'test-api-key'
                })
            };
            
            const response = await handler(event);
            
            expect(response.statusCode).toBe(400);
            const body = JSON.parse(response.body);
            expect(body.error).toContain('Query parameter is required');
        });
        
        it('should use env API key when available', async () => {
            process.env.GROQ_API_KEY = 'env-api-key';
            verifyGoogleToken.mockReturnValue({ email: 'allowed@example.com' });
            getAllowedEmails.mockReturnValue(['allowed@example.com']);
            
            const mockResponse = {
                text: JSON.stringify({
                    text: 'Plan',
                    searchKeywords: [['kw']],
                    questions: ['Q?'],
                    persona: 'Expert'
                })
            };
            
            llmResponsesWithTools.mockResolvedValue(mockResponse);
            
            const event = {
                headers: { Authorization: 'Bearer valid-token' },
                body: JSON.stringify({
                    query: 'test query'
                })
            };
            
            const response = await handler(event);
            
            expect(response.statusCode).toBe(200);
            expect(llmResponsesWithTools).toHaveBeenCalledWith(
                expect.objectContaining({
                    options: expect.objectContaining({
                        apiKey: 'env-api-key'
                    })
                })
            );
            
            delete process.env.GROQ_API_KEY;
        });
        
        it('should return 500 for internal errors', async () => {
            llmResponsesWithTools.mockRejectedValue(new Error('Internal error'));
            verifyGoogleToken.mockReturnValue({ email: 'allowed@example.com' });
            getAllowedEmails.mockReturnValue(['allowed@example.com']);
            
            const event = {
                headers: { Authorization: 'Bearer valid-token' },
                body: JSON.stringify({
                    query: 'test query',
                    apiKey: 'test-api-key'
                })
            };
            
            const response = await handler(event);
            
            expect(response.statusCode).toBe(500);
            const body = JSON.parse(response.body);
            expect(body.error).toContain('Internal error');
        });
        
        it('should include CORS headers', async () => {
            verifyGoogleToken.mockReturnValue({ email: 'allowed@example.com' });
            getAllowedEmails.mockReturnValue(['allowed@example.com']);
            
            const event = {
                headers: { Authorization: 'Bearer valid-token' },
                body: JSON.stringify({
                    query: 'test',
                    apiKey: 'key'
                })
            };
            
            const response = await handler(event);
            
            expect(response.headers).toHaveProperty('Access-Control-Allow-Origin', '*');
        });
    });
});
