/**
 * Unit tests for static file server endpoint
 */

const { handler, readStaticFile, getContentType } = require('../../../src/endpoints/static');
const fs = require('fs');
const path = require('path');

jest.mock('fs');

describe('Static File Server Endpoint', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });
    
    describe('getContentType', () => {
        it('should return correct MIME type for HTML', () => {
            expect(getContentType('index.html')).toBe('text/html');
        });
        
        it('should return correct MIME type for CSS', () => {
            expect(getContentType('styles.css')).toBe('text/css');
        });
        
        it('should return correct MIME type for JavaScript', () => {
            expect(getContentType('app.js')).toBe('application/javascript');
        });
        
        it('should return correct MIME type for JSON', () => {
            expect(getContentType('data.json')).toBe('application/json');
        });
        
        it('should return correct MIME type for images', () => {
            expect(getContentType('image.png')).toBe('image/png');
            expect(getContentType('photo.jpg')).toBe('image/jpeg');
            expect(getContentType('icon.svg')).toBe('image/svg+xml');
        });
        
        it('should return default MIME type for unknown extensions', () => {
            expect(getContentType('file.unknown')).toBe('application/octet-stream');
        });
    });
    
    describe('readStaticFile', () => {
        it('should read file from docs directory', async () => {
            const mockContent = '<html><body>Test</body></html>';
            const mockStats = {
                isFile: () => true,
                size: mockContent.length,
                mtime: new Date()
            };
            
            fs.stat.mockImplementation((path, callback) => {
                callback(null, mockStats);
            });
            
            fs.readFile.mockImplementation((path, callback) => {
                callback(null, Buffer.from(mockContent));
            });
            
            const result = await readStaticFile('index.html');
            
            expect(result.content.toString()).toBe(mockContent);
            expect(result.contentType).toBe('text/html');
            expect(result.size).toBe(mockContent.length);
        });
        
        it('should default to index.html for root path', async () => {
            const mockContent = '<html></html>';
            const mockStats = {
                isFile: () => true,
                size: mockContent.length,
                mtime: new Date()
            };
            
            fs.stat.mockImplementation((path, callback) => {
                expect(path).toContain('index.html');
                callback(null, mockStats);
            });
            
            fs.readFile.mockImplementation((path, callback) => {
                callback(null, Buffer.from(mockContent));
            });
            
            await readStaticFile('/');
            
            expect(fs.stat).toHaveBeenCalled();
        });
        
        it('should reject paths outside docs directory', async () => {
            await expect(readStaticFile('../../etc/passwd')).rejects.toThrow('Access denied');
        });
        
        it('should reject non-existent files', async () => {
            fs.stat.mockImplementation((path, callback) => {
                callback(new Error('File not found'));
            });
            
            await expect(readStaticFile('nonexistent.html')).rejects.toThrow('File not found');
        });
        
        it('should handle read errors', async () => {
            const mockStats = {
                isFile: () => true,
                size: 100,
                mtime: new Date()
            };
            
            fs.stat.mockImplementation((path, callback) => {
                callback(null, mockStats);
            });
            
            fs.readFile.mockImplementation((path, callback) => {
                callback(new Error('Read error'));
            });
            
            await expect(readStaticFile('test.html')).rejects.toThrow('Failed to read file');
        });
        
        it('should handle nested paths correctly', async () => {
            const mockContent = 'body { color: red; }';
            const mockStats = {
                isFile: () => true,
                size: mockContent.length,
                mtime: new Date()
            };
            
            fs.stat.mockImplementation((path, callback) => {
                expect(path).toContain('css');
                expect(path).toContain('styles.css');
                callback(null, mockStats);
            });
            
            fs.readFile.mockImplementation((path, callback) => {
                callback(null, Buffer.from(mockContent));
            });
            
            const result = await readStaticFile('css/styles.css');
            
            expect(result.contentType).toBe('text/css');
        });
    });
    
    describe('handler', () => {
        it('should serve HTML file', async () => {
            const mockContent = '<html><body>Test</body></html>';
            const mockStats = {
                isFile: () => true,
                size: mockContent.length,
                mtime: new Date()
            };
            
            fs.stat.mockImplementation((path, callback) => {
                callback(null, mockStats);
            });
            
            fs.readFile.mockImplementation((path, callback) => {
                callback(null, Buffer.from(mockContent));
            });
            
            const event = {
                path: '/index.html'
            };
            
            const response = await handler(event);
            
            expect(response.statusCode).toBe(200);
            expect(response.headers['Content-Type']).toBe('text/html');
            expect(response.body).toBe(mockContent);
            expect(response.isBase64Encoded).toBe(false);
        });
        
        it('should serve binary files with base64 encoding', async () => {
            const mockContent = Buffer.from([0x89, 0x50, 0x4E, 0x47]); // PNG header
            const mockStats = {
                isFile: () => true,
                size: mockContent.length,
                mtime: new Date()
            };
            
            fs.stat.mockImplementation((path, callback) => {
                callback(null, mockStats);
            });
            
            fs.readFile.mockImplementation((path, callback) => {
                callback(null, mockContent);
            });
            
            const event = {
                path: '/image.png'
            };
            
            const response = await handler(event);
            
            expect(response.statusCode).toBe(200);
            expect(response.headers['Content-Type']).toBe('image/png');
            expect(response.isBase64Encoded).toBe(true);
        });
        
        it('should return 404 for non-existent files', async () => {
            fs.stat.mockImplementation((path, callback) => {
                callback(new Error('File not found'));
            });
            
            const event = {
                path: '/nonexistent.html'
            };
            
            const response = await handler(event);
            
            expect(response.statusCode).toBe(404);
            expect(response.body).toContain('404 Not Found');
        });
        
        it('should return 404 for paths outside docs directory', async () => {
            // Mock readStaticFile to throw access denied error
            fs.stat.mockImplementation((path, callback) => {
                callback(new Error('Access denied'));
            });
            
            const event = {
                path: '/../../etc/passwd'
            };
            
            const response = await handler(event);
            
            expect(response.statusCode).toBe(404);
        });
        
        it('should include cache headers', async () => {
            const mockContent = '<html></html>';
            const mockStats = {
                isFile: () => true,
                size: mockContent.length,
                mtime: new Date()
            };
            
            fs.stat.mockImplementation((path, callback) => {
                callback(null, mockStats);
            });
            
            fs.readFile.mockImplementation((path, callback) => {
                callback(null, Buffer.from(mockContent));
            });
            
            const event = {
                path: '/index.html'
            };
            
            const response = await handler(event);
            
            expect(response.headers).toHaveProperty('Cache-Control');
            expect(response.headers).toHaveProperty('Last-Modified');
        });
        
        it('should include CORS headers', async () => {
            fs.stat.mockImplementation((path, callback) => {
                callback(new Error('File not found'));
            });
            
            const event = {
                path: '/test.html'
            };
            
            const response = await handler(event);
            
            expect(response.headers).toHaveProperty('Access-Control-Allow-Origin', '*');
        });
    });
});
