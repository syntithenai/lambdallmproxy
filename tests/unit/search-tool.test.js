/**
 * Test search tool updates
 */

const { callFunction } = require('../../src/tools');

describe('Search Tool Updates', () => {
    
    describe('search_web tool', () => {
        test('should include all raw search response fields', async () => {
            const result = await callFunction('search_web', {
                query: 'javascript tutorial',
                limit: 2,
                timeout: 10,
                load_content: false,
                generate_summary: false
            });
            
            const response = JSON.parse(result);
            
            // Should include all core fields from raw search response
            expect(response).toHaveProperty('query');
            expect(response).toHaveProperty('count');
            expect(response).toHaveProperty('totalFound');
            expect(response).toHaveProperty('limit');
            expect(response).toHaveProperty('fetchContent');
            expect(response).toHaveProperty('timeout');
            expect(response).toHaveProperty('processingTimeMs');
            expect(response).toHaveProperty('timestamp');
            expect(response).toHaveProperty('results');
            expect(response).toHaveProperty('metadata');
            
            // Should not include summary fields when generate_summary is false
            expect(response).not.toHaveProperty('generate_summary');
            expect(response).not.toHaveProperty('summary');
            expect(response).not.toHaveProperty('summary_model');
            expect(response).not.toHaveProperty('summary_error');
            
            // Each result should include all core fields
            if (response.results.length > 0) {
                const firstResult = response.results[0];
                expect(firstResult).toHaveProperty('title');
                expect(firstResult).toHaveProperty('url');
                expect(firstResult).toHaveProperty('description');
                expect(firstResult).toHaveProperty('score');
                expect(firstResult).toHaveProperty('duckduckgoScore');
                expect(firstResult).toHaveProperty('state');
                expect(firstResult).toHaveProperty('contentLength');
                expect(firstResult).toHaveProperty('fetchTimeMs');
                
                // Should not have content when load_content is false
                expect(firstResult.content).toBeNull();
            }
        }, 15000);
        
        test('should include summary fields when generate_summary is true', async () => {
            const result = await callFunction('search_web', {
                query: 'nodejs basics',
                limit: 1,
                timeout: 10,
                load_content: false,
                generate_summary: true
            }, {
                model: 'groq:llama-3.1-8b-instant',
                apiKey: process.env.GROQ_API_KEY || 'test-key'
            });
            
            const response = JSON.parse(result);
            
            // Should include summary fields when generate_summary is true
            expect(response).toHaveProperty('generate_summary', true);
            expect(response).toHaveProperty('summary_model');
            
            // Should have either summary or summary_error
            expect(
                response.hasOwnProperty('summary') || response.hasOwnProperty('summary_error')
            ).toBe(true);
        }, 20000);
        
        test('should include content fields when load_content is true', async () => {
            const result = await callFunction('search_web', {
                query: 'python example',
                limit: 1,
                timeout: 15,
                load_content: true,
                generate_summary: false
            });
            
            const response = JSON.parse(result);
            
            expect(response.fetchContent).toBe(true);
            
            // Should have attempted to load content
            if (response.results.length > 0) {
                const firstResult = response.results[0];
                // Content should be present (either loaded content or null if failed)
                expect(firstResult).toHaveProperty('content');
            }
        }, 20000);
        
        test('should handle missing parameters with defaults', async () => {
            const result = await callFunction('search_web', {
                query: 'test query'
                // All other parameters should use defaults
            });
            
            const response = JSON.parse(result);
            
            expect(response.query).toBe('test query');
            expect(response.limit).toBe(3); // default limit
            expect(response.fetchContent).toBe(false); // default load_content
            
            // Should not include summary fields (default generate_summary is false)
            expect(response).not.toHaveProperty('generate_summary');
        }, 15000);
    });
});