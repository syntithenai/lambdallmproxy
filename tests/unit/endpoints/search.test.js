/**
 * Unit tests for search endpoint
 */

global.awslambda = {
    HttpResponseStream: {
        from: jest.fn((stream, metadata) => {
            stream.metadata = metadata;
            return stream;
        })
    }
};

const { handler, searchWithContent, searchMultiple, fetchContent } = require('../../../src/endpoints/search');
const { DuckDuckGoSearcher } = require('../../../src/search');
const { SimpleHTMLParser } = require('../../../src/html-parser');
const { verifyGoogleToken, getAllowedEmails } = require('../../../src/auth');

jest.mock('../../../src/search');
jest.mock('../../../src/html-parser');
jest.mock('../../../src/auth');

// SKIP: These tests import endpoints which transitively import tools.js 
// TODO: Refactor to separate business logic from HTTP handler logic
describe.skip('Search Endpoint', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        verifyGoogleToken.mockReturnValue({ email: 'allowed@example.com' });
        getAllowedEmails.mockReturnValue(['allowed@example.com']);
    });
    
    describe('fetchContent', () => {
        it('should fetch and parse HTML content', async () => {
            const mockParser = {
                convertToText: jest.fn().mockReturnValue('Extracted content')
            };
            SimpleHTMLParser.mockImplementation(() => mockParser);
            
            const mockSearcher = {
                fetchUrl: jest.fn().mockResolvedValue('<html><body>Test content</body></html>')
            };
            
            const content = await fetchContent(mockSearcher, 'https://example.com');
            
            expect(content).toBe('Extracted content');
            expect(mockSearcher.fetchUrl).toHaveBeenCalledWith('https://example.com', 10000);
            expect(mockParser.convertToText).toHaveBeenCalled();
        });
        
        it('should handle fetch errors', async () => {
            const mockSearcher = {
                fetchUrl: jest.fn().mockRejectedValue(new Error('Network error'))
            };
            
            await expect(fetchContent(mockSearcher, 'https://example.com')).rejects.toThrow('Failed to fetch');
        });
    });
    
    describe('searchWithContent', () => {
        it('should perform search and fetch content for all results', async () => {
            const mockSearchResults = {
                results: [
                    { url: 'https://example.com/1', title: 'Result 1', description: 'Desc 1' },
                    { url: 'https://example.com/2', title: 'Result 2', description: 'Desc 2' }
                ]
            };
            
            const mockParser = {
                convertToText: jest.fn().mockReturnValue('Extracted content')
            };
            SimpleHTMLParser.mockImplementation(() => mockParser);
            
            const mockSearcher = {
                search: jest.fn().mockResolvedValue(mockSearchResults),
                fetchUrl: jest.fn().mockResolvedValue('<html><body>Content</body></html>')
            };
            DuckDuckGoSearcher.mockImplementation(() => mockSearcher);
            
            const results = await searchWithContent('test query');
            
            expect(results).toHaveLength(2);
            expect(results[0]).toHaveProperty('content', 'Extracted content');
            expect(results[1]).toHaveProperty('content', 'Extracted content');
        });
        
        it('should handle search with no results', async () => {
            const mockSearcher = {
                search: jest.fn().mockResolvedValue({ results: [] })
            };
            DuckDuckGoSearcher.mockImplementation(() => mockSearcher);
            
            const results = await searchWithContent('test query');
            
            expect(results).toHaveLength(0);
        });
        
        it('should throw error for empty query', async () => {
            await expect(searchWithContent('')).rejects.toThrow('Query parameter is required and must be a non-empty string');
        });
        
        it('should skip content fetching when includeContent is false', async () => {
            const mockSearchResults = {
                results: [
                    { url: 'https://example.com', title: 'Result', description: 'Desc' }
                ]
            };
            
            const mockSearcher = {
                search: jest.fn().mockResolvedValue(mockSearchResults)
            };
            DuckDuckGoSearcher.mockImplementation(() => mockSearcher);
            
            const results = await searchWithContent('test query', { maxResults: 5, includeContent: false });
            
            expect(results).toHaveLength(1);
            expect(results[0]).toHaveProperty('content', '');
            expect(results[0].content).toBe('');
        });
        
        it('should handle content fetch errors gracefully', async () => {
            const mockSearchResults = {
                results: [
                    { url: 'https://example.com', title: 'Result', description: 'Desc' }
                ]
            };
            
            const mockSearcher = {
                search: jest.fn().mockResolvedValue(mockSearchResults),
                fetchUrl: jest.fn().mockRejectedValue(new Error('Network error'))
            };
            DuckDuckGoSearcher.mockImplementation(() => mockSearcher);
            
            const results = await searchWithContent('test query');
            
            expect(results).toHaveLength(1);
            expect(results[0]).toHaveProperty('contentError');
            expect(results[0].contentError).toContain('Network error');
        });
    });
    
    describe('searchMultiple', () => {
        it('should execute multiple searches in parallel', async () => {
            const mockSearcher = {
                search: jest.fn()
                    .mockResolvedValueOnce({
                        results: [{ url: 'https://example1.com', title: 'Result 1', description: 'Desc 1' }]
                    })
                    .mockResolvedValueOnce({
                        results: [{ url: 'https://example2.com', title: 'Result 2', description: 'Desc 2' }]
                    })
            };
            DuckDuckGoSearcher.mockImplementation(() => mockSearcher);
            
            const mockRequest = jest.fn((options, callback) => {
                const mockResponse = {
                    on: jest.fn((event, handler) => {
                        if (event === 'data') {
                            handler('<html><body>Content</body></html>');
                        } else if (event === 'end') {
                            handler();
                        }
                    })
                };
                setTimeout(() => callback(mockResponse), 0);
                return {
                    on: jest.fn(),
                    end: jest.fn(),
                    destroy: jest.fn()
                };
            });
            
            const https = require('https');
            https.request = mockRequest;
            
            const mockParser = {
                extractText: jest.fn().mockReturnValue('Content')
            };
            SimpleHTMLParser.mockImplementation(() => mockParser);
            
            const results = await searchMultiple(['query 1', 'query 2']);
            
            expect(results).toHaveLength(2);
            expect(results[0]).toHaveProperty('query', 'query 1');
            expect(results[0]).toHaveProperty('results');
            expect(results[1]).toHaveProperty('query', 'query 2');
            expect(results[1]).toHaveProperty('results');
        });
        
        it('should throw error for non-array queries', async () => {
            await expect(searchMultiple('not an array')).rejects.toThrow('Queries must be a non-empty array');
        });
        
        it('should throw error for empty array', async () => {
            await expect(searchMultiple([])).rejects.toThrow('Queries must be a non-empty array');
        });
        
        it('should validate all queries are strings', async () => {
            await expect(searchMultiple(['valid', 123, 'also valid'])).rejects.toThrow('Query at index 1 must be a non-empty string');
        });
        
        it('should handle individual search errors gracefully', async () => {
            const mockSearcher = {
                search: jest.fn()
                    .mockResolvedValueOnce({
                        results: [{ url: 'https://example.com', title: 'Result', description: 'Desc' }]
                    })
                    .mockRejectedValueOnce(new Error('Search failed'))
            };
            DuckDuckGoSearcher.mockImplementation(() => mockSearcher);
            
            const mockRequest = jest.fn((options, callback) => {
                const mockResponse = {
                    on: jest.fn((event, handler) => {
                        if (event === 'data') {
                            handler('<html><body>Content</body></html>');
                        } else if (event === 'end') {
                            handler();
                        }
                    })
                };
                setTimeout(() => callback(mockResponse), 0);
                return {
                    on: jest.fn(),
                    end: jest.fn(),
                    destroy: jest.fn()
                };
            });
            
            const https = require('https');
            https.request = mockRequest;
            
            const mockParser = {
                extractText: jest.fn().mockReturnValue('Content')
            };
            SimpleHTMLParser.mockImplementation(() => mockParser);
            
            const results = await searchMultiple(['query 1', 'query 2']);
            
            expect(results).toHaveLength(2);
            expect(results[0]).toHaveProperty('results');
            expect(results[1]).toHaveProperty('error');
            expect(results[1].error).toContain('Search failed');
        });
    });
    
    // TODO: Update handler unit tests for streaming - currently covered by integration tests
    describe.skip('handler', () => {
        // Helper class for mock streaming response
        class MockResponseStream {
            constructor() {
                this.chunks = [];
                this.ended = false;
                this.metadata = null;
            }
            write(chunk) {
                this.chunks.push(chunk);
            }
            end() {
                this.ended = true;
            }
            getEvents(type) {
                return this.chunks
                    .filter(chunk => typeof chunk === 'string' && chunk.includes(`event: ${type}`))
                    .map(chunk => {
                        const dataMatch = chunk.match(/data: (.+)/);
                        return dataMatch ? { type, data: JSON.parse(dataMatch[1]) } : null;
                    })
                    .filter(Boolean);
            }
        }
        
        it('should return 401 for missing authentication', async () => {
            verifyGoogleToken.mockReturnValue(null);
            getAllowedEmails.mockReturnValue(['allowed@example.com']);
            
            const event = {
                headers: {},
                body: JSON.stringify({
                    query: 'test query'
                })
            };
            
            const mockStream = new MockResponseStream();
            await handler(event, mockStream);
            
            const errorEvents = mockStream.getEvents('error');
            expect(errorEvents.length).toBe(1);
            expect(errorEvents[0].data.error).toContain('Authentication required');
            expect(mockStream.ended).toBe(true);
        });
        
        it('should return search results for valid authenticated request', async () => {
            const mockSearcher = {
                search: jest.fn().mockResolvedValue({
                    results: [
                        { url: 'https://example.com', title: 'Result', description: 'Desc' }
                    ]
                })
            };
            DuckDuckGoSearcher.mockImplementation(() => mockSearcher);
            
            const mockRequest = jest.fn((options, callback) => {
                const mockResponse = {
                    on: jest.fn((event, handler) => {
                        if (event === 'data') {
                            handler('<html><body>Content</body></html>');
                        } else if (event === 'end') {
                            handler();
                        }
                    })
                };
                setTimeout(() => callback(mockResponse), 0);
                return {
                    on: jest.fn(),
                    end: jest.fn(),
                    destroy: jest.fn()
                };
            });
            
            const https = require('https');
            https.request = mockRequest;
            
            const mockParser = {
                extractText: jest.fn().mockReturnValue('Content')
            };
            SimpleHTMLParser.mockImplementation(() => mockParser);
            
            const event = {
                headers: { Authorization: 'Bearer valid-token' },
                body: JSON.stringify({
                    query: 'test query'
                })
            };
            
            const response = await handler(event);
            
            expect(response.statusCode).toBe(200);
            expect(response.headers['Content-Type']).toBe('application/json');
            
            const body = JSON.parse(response.body);
            expect(body).toHaveProperty('query', 'test query');
            expect(body).toHaveProperty('count', 1);
            expect(body).toHaveProperty('results');
            expect(body.results).toHaveLength(1);
        });
        
        it('should return 400 for missing query', async () => {
            const event = {
                headers: { Authorization: 'Bearer valid-token' },
                body: JSON.stringify({})
            };
            
            const response = await handler(event);
            
            expect(response.statusCode).toBe(400);
            const body = JSON.parse(response.body);
            expect(body.error).toContain('Query or queries parameter is required');
        });
        
        it('should return 400 for invalid maxResults', async () => {
            const event = {
                headers: { Authorization: 'Bearer valid-token' },
                body: JSON.stringify({
                    query: 'test',
                    maxResults: 50
                })
            };
            
            const response = await handler(event);
            
            expect(response.statusCode).toBe(400);
            const body = JSON.parse(response.body);
            expect(body.error).toContain('maxResults must be between 1 and 20');
        });
        
        it('should respect maxResults parameter', async () => {
            const mockSearcher = {
                search: jest.fn().mockResolvedValue({ results: [] })
            };
            DuckDuckGoSearcher.mockImplementation(() => mockSearcher);
            
            const event = {
                headers: { Authorization: 'Bearer valid-token' },
                body: JSON.stringify({
                    query: 'test query',
                    maxResults: 10
                })
            };
            
            await handler(event);
            
            expect(mockSearcher.search).toHaveBeenCalledWith('test query', 10);
        });
        
        it('should return 500 for internal errors', async () => {
            const mockSearcher = {
                search: jest.fn().mockRejectedValue(new Error('Search failed'))
            };
            DuckDuckGoSearcher.mockImplementation(() => mockSearcher);
            
            const event = {
                headers: { Authorization: 'Bearer valid-token' },
                body: JSON.stringify({
                    query: 'test query'
                })
            };
            
            const response = await handler(event);
            
            expect(response.statusCode).toBe(500);
            const body = JSON.parse(response.body);
            expect(body.error).toContain('Search failed');
        });
        
        it('should include CORS headers', async () => {
            const event = {
                headers: { Authorization: 'Bearer valid-token' },
                body: JSON.stringify({
                    query: 'test'
                })
            };
            
            const response = await handler(event);
            
            expect(response.headers).toHaveProperty('Access-Control-Allow-Origin', '*');
        });
    });
    
    describe('handler with multiple queries', () => {
        it('should handle array of queries', async () => {
            const mockSearcher = {
                search: jest.fn()
                    .mockResolvedValueOnce({
                        results: [{ url: 'https://example1.com', title: 'Result 1', description: 'Desc 1' }]
                    })
                    .mockResolvedValueOnce({
                        results: [{ url: 'https://example2.com', title: 'Result 2', description: 'Desc 2' }]
                    })
            };
            DuckDuckGoSearcher.mockImplementation(() => mockSearcher);
            
            const mockRequest = jest.fn((options, callback) => {
                const mockResponse = {
                    on: jest.fn((event, handler) => {
                        if (event === 'data') {
                            handler('<html><body>Content</body></html>');
                        } else if (event === 'end') {
                            handler();
                        }
                    })
                };
                setTimeout(() => callback(mockResponse), 0);
                return {
                    on: jest.fn(),
                    end: jest.fn(),
                    destroy: jest.fn()
                };
            });
            
            const https = require('https');
            https.request = mockRequest;
            
            const mockParser = {
                extractText: jest.fn().mockReturnValue('Content')
            };
            SimpleHTMLParser.mockImplementation(() => mockParser);
            
            const event = {
                headers: { Authorization: 'Bearer valid-token' },
                body: JSON.stringify({
                    query: ['query 1', 'query 2']
                })
            };
            
            const response = await handler(event);
            
            expect(response.statusCode).toBe(200);
            const body = JSON.parse(response.body);
            expect(body).toHaveProperty('searches');
            expect(body.searches).toHaveLength(2);
            expect(body).toHaveProperty('totalSearches', 2);
            expect(body).toHaveProperty('totalResults', 2);
        });
        
        it('should accept queries parameter for array', async () => {
            const mockSearcher = {
                search: jest.fn().mockResolvedValue({
                    results: [{ url: 'https://example.com', title: 'Result', description: 'Desc' }]
                })
            };
            DuckDuckGoSearcher.mockImplementation(() => mockSearcher);
            
            const mockRequest = jest.fn((options, callback) => {
                const mockResponse = {
                    on: jest.fn((event, handler) => {
                        if (event === 'data') {
                            handler('<html><body>Content</body></html>');
                        } else if (event === 'end') {
                            handler();
                        }
                    })
                };
                setTimeout(() => callback(mockResponse), 0);
                return {
                    on: jest.fn(),
                    end: jest.fn(),
                    destroy: jest.fn()
                };
            });
            
            const https = require('https');
            https.request = mockRequest;
            
            const mockParser = {
                extractText: jest.fn().mockReturnValue('Content')
            };
            SimpleHTMLParser.mockImplementation(() => mockParser);
            
            const event = {
                headers: { Authorization: 'Bearer valid-token' },
                body: JSON.stringify({
                    queries: ['query 1']
                })
            };
            
            const response = await handler(event);
            
            expect(response.statusCode).toBe(200);
            const body = JSON.parse(response.body);
            expect(body).toHaveProperty('searches');
        });
        
        it('should maintain backward compatibility with single query', async () => {
            const mockSearcher = {
                search: jest.fn().mockResolvedValue({
                    results: [{ url: 'https://example.com', title: 'Result', description: 'Desc' }]
                })
            };
            DuckDuckGoSearcher.mockImplementation(() => mockSearcher);
            
            const mockRequest = jest.fn((options, callback) => {
                const mockResponse = {
                    on: jest.fn((event, handler) => {
                        if (event === 'data') {
                            handler('<html><body>Content</body></html>');
                        } else if (event === 'end') {
                            handler();
                        }
                    })
                };
                setTimeout(() => callback(mockResponse), 0);
                return {
                    on: jest.fn(),
                    end: jest.fn(),
                    destroy: jest.fn()
                };
            });
            
            const https = require('https');
            https.request = mockRequest;
            
            const mockParser = {
                extractText: jest.fn().mockReturnValue('Content')
            };
            SimpleHTMLParser.mockImplementation(() => mockParser);
            
            const event = {
                headers: { Authorization: 'Bearer valid-token' },
                body: JSON.stringify({
                    query: 'single query'
                })
            };
            
            const response = await handler(event);
            
            expect(response.statusCode).toBe(200);
            const body = JSON.parse(response.body);
            expect(body).toHaveProperty('query', 'single query');
            expect(body).toHaveProperty('count');
            expect(body).toHaveProperty('results');
            expect(body).not.toHaveProperty('searches');
        });
    });
});
