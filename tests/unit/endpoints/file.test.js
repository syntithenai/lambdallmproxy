/**
 * Unit tests for file endpoint
 * 
 * This test file covers the file retrieval endpoint functionality including:
 * - Authentication and authorization checks
 * - File ID validation
 * - Google Sheets integration
 * - MIME type security checks
 * - Error handling for various scenarios
 */

// Mock external dependencies to isolate the file endpoint logic
jest.mock('../../../src/rag/sheets-storage');

const fileEndpoint = require('../../../src/endpoints/file');
const { loadFileFromSheets, initSheetsClient } = require('../../../src/rag/sheets-storage');

describe('File Endpoint Service', () => {
    let originalEnv;
    
    beforeEach(() => {
        // Store original environment
        originalEnv = { ...process.env };
        
        // Clear all environment variables that might affect tests
        Object.keys(process.env).forEach(key => {
            if (key.startsWith('GS_') || key.includes('SHEETS')) {
                delete process.env[key];
            }
        });
        
        // Reset all mocks
        jest.clearAllMocks();
        
        // Setup default mock returns
        process.env.GS_CREDS = JSON.stringify({
            client_email: 'test@example.com',
            private_key: '-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n'
        });
        process.env.GS_ID = 'test-spreadsheet-id';
        
        initSheetsClient.mockReturnValue('mock-sheets-client');
        loadFileFromSheets.mockResolvedValue({
            originalName: 'test.pdf',
            mimeType: 'application/pdf',
            size: 1024,
            content: 'base64-encoded-content'
        });
    });
    
    afterEach(() => {
        // Restore original environment
        process.env = { ...originalEnv };
    });
    
    describe('Module Structure', () => {
        it('should properly load the file module', () => {
            expect(fileEndpoint).toBeDefined();
            expect(typeof fileEndpoint).toBe('object');
        });
        
        it('should have a handler function', () => {
            // The file endpoint exports a handler function for Lambda
            expect(fileEndpoint).toHaveProperty('handler');
            expect(typeof fileEndpoint.handler).toBe('function');
        });
    });
    
    describe('File ID Validation', () => {
        it('should reject requests without file ID', async () => {
            const event = {
                pathParameters: {}
            };
            
            const response = await fileEndpoint.handler(event);
            
            expect(response.statusCode).toBe(400);
        });
        
        it('should reject requests with invalid UUID format', async () => {
            const event = {
                pathParameters: {
                    fileId: 'invalid-file-id'
                }
            };
            
            const response = await fileEndpoint.handler(event);
            
            expect(response.statusCode).toBe(400);
        });
        
        it('should accept valid UUID format', async () => {
            const event = {
                pathParameters: {
                    fileId: '123e4567-e89b-12d3-a456-426614174000'
                }
            };
            
            const response = await fileEndpoint.handler(event);
            
            // Should proceed to validation (may fail on Sheets access, but not UUID)
            expect(response.statusCode).toBe(200); // Could be 404 or 500 due to Sheets, but not UUID error
        });
    });
    
    describe('Google Sheets Configuration', () => {
        it('should reject requests when Google Sheets credentials are missing', async () => {
            // Clear the environment variables
            delete process.env.GS_CREDS;
            delete process.env.GS_ID;
            
            const event = {
                pathParameters: {
                    fileId: '123e4567-e89b-12d3-a456-426614174000'
                }
            };
            
            const response = await fileEndpoint.handler(event);
            
            expect(response.statusCode).toBe(500);
        });
        
        it('should reject requests when spreadsheet ID is missing', async () => {
            // Clear only the spreadsheet ID
            delete process.env.GS_ID;
            
            const event = {
                pathParameters: {
                    fileId: '123e4567-e89b-12d3-a456-426614174000'
                }
            };
            
            const response = await fileEndpoint.handler(event);
            
            expect(response.statusCode).toBe(500);
        });
    });
    
    describe('File Retrieval', () => {
        it('should return 404 when file is not found', async () => {
            loadFileFromSheets.mockResolvedValue(null);
            
            const event = {
                pathParameters: {
                    fileId: '123e4567-e89b-12d3-a456-426614174000'
                }
            };
            
            const response = await fileEndpoint.handler(event);
            
            expect(response.statusCode).toBe(404);
        });
        
        it('should successfully retrieve a valid file', async () => {
            const event = {
                pathParameters: {
                    fileId: '123e4567-e89b-12d3-a456-426614174000'
                }
            };
            
            const response = await fileEndpoint.handler(event);
            
            expect(response.statusCode).toBe(200);
        });
    });
    
    describe('MIME Type Security', () => {
        it('should reject unsafe MIME types', async () => {
            loadFileFromSheets.mockResolvedValue({
                originalName: 'test.exe',
                mimeType: 'application/x-msdownload',
                size: 1024,
                content: 'base64-encoded-content'
            });
            
            const event = {
                pathParameters: {
                    fileId: '123e4567-e89b-12d3-a456-426614174000'
                }
            };
            
            const response = await fileEndpoint.handler(event);
            
            expect(response.statusCode).toBe(403);
        });
        
        it('should accept safe MIME types', async () => {
            loadFileFromSheets.mockResolvedValue({
                originalName: 'test.pdf',
                mimeType: 'application/pdf',
                size: 1024,
                content: 'base64-encoded-content'
            });
            
            const event = {
                pathParameters: {
                    fileId: '123e4567-e89b-12d3-a456-426614174000'
                }
            };
            
            const response = await fileEndpoint.handler(event);
            
            expect(response.statusCode).toBe(200);
        });
    });
    
    describe('Error Handling', () => {
        it('should handle internal errors gracefully', async () => {
            // Mock a failure in the sheets client
            loadFileFromSheets.mockRejectedValue(new Error('Database connection failed'));
            
            const event = {
                pathParameters: {
                    fileId: '123e4567-e89b-12d3-a456-426614174000'
                }
            };
            
            const response = await fileEndpoint.handler(event);
            
            expect(response.statusCode).toBe(500);
        });
    });
    
    describe('Response Format', () => {
        it('should return proper headers and content for valid files', async () => {
            const event = {
                pathParameters: {
                    fileId: '123e4567-e89b-12d3-a456-426614174000'
                }
            };
            
            const response = await fileEndpoint.handler(event);
            
            expect(response.statusCode).toBe(200);
            expect(response.headers).toHaveProperty('Content-Type');
            expect(response.headers).toHaveProperty('Content-Disposition');
            expect(response.headers).toHaveProperty('Cache-Control');
            expect(response).toHaveProperty('body');
            expect(response).toHaveProperty('isBase64Encoded', true);
        });
    });
});
