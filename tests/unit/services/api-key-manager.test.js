/**
 * Tests for API Key Manager Service
 * 
 * Coverage:
 * - API key generation
 * - Key creation and storage
 * - Key validation
 * - Usage tracking (requests and tokens)
 * - Key revocation
 * - User key listing
 * - Security: key format, isolation, revoked keys
 */

const apiKeyManager = require('../../../src/services/api-key-manager');
const https = require('https');
const jwt = require('jsonwebtoken');

// Mock https and jwt modules
jest.mock('https');
jest.mock('jsonwebtoken');

describe('API Key Manager Service', () => {
    let mockRequest;
    let mockResponse;
    
    beforeEach(() => {
        jest.clearAllMocks();
        
        // Mock JWT signing
        jwt.sign = jest.fn().mockReturnValue('mock-jwt-token');
        
        // Setup mock response
        mockResponse = {
            statusCode: 200,
            on: jest.fn()
        };
        
        // Setup mock request
        mockRequest = {
            on: jest.fn(),
            write: jest.fn(),
            end: jest.fn(),
            destroy: jest.fn()
        };
        
        https.request.mockReturnValue(mockRequest);
        
        // Setup environment
        process.env.GS_SHEET_ID = 'test-sheet-id';
        process.env.GS_EMAIL = 'test@serviceaccount.com';
        // Mock private key - not a real key, just for testing
        process.env.GS_KEY = '-----BEGIN PRIVATE KEY-----\\nTEST_MOCK_KEY\\n-----END PRIVATE KEY-----';
    });
    
    describe('generateAPIKey', () => {
        it('should generate key with sk- prefix', () => {
            const key = apiKeyManager.generateAPIKey();
            expect(key).toMatch(/^sk-[A-Za-z0-9_-]+$/);
        });
        
        it('should generate unique keys', () => {
            const key1 = apiKeyManager.generateAPIKey();
            const key2 = apiKeyManager.generateAPIKey();
            expect(key1).not.toBe(key2);
        });
        
        it('should generate keys of consistent length', () => {
            const key = apiKeyManager.generateAPIKey();
            expect(key.length).toBeGreaterThan(30); // sk- + 24 bytes base64url
        });
    });
    
    describe('createAPIKey', () => {
        beforeEach(() => {
            // Mock OAuth token request
            mockResponse.on.mockImplementation((event, handler) => {
                if (event === 'data') {
                    handler(JSON.stringify({ access_token: 'mock-token' }));
                } else if (event === 'end') {
                    handler();
                }
                return mockResponse;
            });
        });
        
        it('should create API key with default parameters', async () => {
            // Mock sheet metadata request (sheet exists)
            let requestCount = 0;
            https.request.mockImplementation((options, callback) => {
                requestCount++;
                
                if (requestCount === 1) {
                    // OAuth request
                    callback(mockResponse);
                } else if (requestCount === 2) {
                    // Check sheet exists
                    mockResponse.on.mockImplementation((event, handler) => {
                        if (event === 'data') {
                            handler(JSON.stringify({
                                sheets: [{ properties: { title: 'User API Keys' } }]
                            }));
                        } else if (event === 'end') {
                            handler();
                        }
                        return mockResponse;
                    });
                    callback(mockResponse);
                } else if (requestCount === 3) {
                    // Append row
                    mockResponse.on.mockImplementation((event, handler) => {
                        if (event === 'data') {
                            handler(JSON.stringify({ updates: { updatedRows: 1 } }));
                        } else if (event === 'end') {
                            handler();
                        }
                        return mockResponse;
                    });
                    callback(mockResponse);
                }
                
                return mockRequest;
            });
            
            const result = await apiKeyManager.createAPIKey('user@example.com');
            
            expect(result).toMatchObject({
                userEmail: 'user@example.com',
                keyName: 'Default',
                tier: 'free'
            });
            expect(result.apiKey).toMatch(/^sk-/);
            expect(result.createdAt).toBeTruthy();
        });
        
        it('should create API key with custom parameters', async () => {
            let requestCount = 0;
            https.request.mockImplementation((options, callback) => {
                requestCount++;
                
                if (requestCount === 1) {
                    callback(mockResponse);
                } else if (requestCount === 2) {
                    mockResponse.on.mockImplementation((event, handler) => {
                        if (event === 'data') {
                            handler(JSON.stringify({
                                sheets: [{ properties: { title: 'User API Keys' } }]
                            }));
                        } else if (event === 'end') {
                            handler();
                        }
                        return mockResponse;
                    });
                    callback(mockResponse);
                } else if (requestCount === 3) {
                    mockResponse.on.mockImplementation((event, handler) => {
                        if (event === 'data') {
                            handler(JSON.stringify({ updates: { updatedRows: 1 } }));
                        } else if (event === 'end') {
                            handler();
                        }
                        return mockResponse;
                    });
                    callback(mockResponse);
                }
                
                return mockRequest;
            });
            
            const result = await apiKeyManager.createAPIKey(
                'user@example.com',
                'Production Key',
                'pro',
                'Main production key'
            );
            
            expect(result).toMatchObject({
                userEmail: 'user@example.com',
                keyName: 'Production Key',
                tier: 'pro'
            });
        });
        
        it('should throw error if Google Sheets not configured', async () => {
            delete process.env.GS_SHEET_ID;
            
            await expect(
                apiKeyManager.createAPIKey('user@example.com')
            ).rejects.toThrow('Google Sheets configuration missing');
        });
        
        it('should create sheet if it does not exist', async () => {
            let requestCount = 0;
            https.request.mockImplementation((options, callback) => {
                requestCount++;
                
                if (requestCount === 1) {
                    // OAuth
                    callback(mockResponse);
                } else if (requestCount === 2) {
                    // Check metadata (sheet doesn't exist)
                    mockResponse.on.mockImplementation((event, handler) => {
                        if (event === 'data') {
                            handler(JSON.stringify({ sheets: [] }));
                        } else if (event === 'end') {
                            handler();
                        }
                        return mockResponse;
                    });
                    callback(mockResponse);
                } else if (requestCount === 3) {
                    // Create sheet
                    mockResponse.on.mockImplementation((event, handler) => {
                        if (event === 'data') {
                            handler(JSON.stringify({ replies: [{ addSheet: {} }] }));
                        } else if (event === 'end') {
                            handler();
                        }
                        return mockResponse;
                    });
                    callback(mockResponse);
                } else if (requestCount === 4) {
                    // Add headers
                    mockResponse.on.mockImplementation((event, handler) => {
                        if (event === 'data') {
                            handler(JSON.stringify({ updatedRows: 1 }));
                        } else if (event === 'end') {
                            handler();
                        }
                        return mockResponse;
                    });
                    callback(mockResponse);
                } else if (requestCount === 5) {
                    // Append key
                    mockResponse.on.mockImplementation((event, handler) => {
                        if (event === 'data') {
                            handler(JSON.stringify({ updates: { updatedRows: 1 } }));
                        } else if (event === 'end') {
                            handler();
                        }
                        return mockResponse;
                    });
                    callback(mockResponse);
                }
                
                return mockRequest;
            });
            
            const result = await apiKeyManager.createAPIKey('user@example.com');
            
            expect(result.apiKey).toMatch(/^sk-/);
            expect(https.request).toHaveBeenCalledTimes(5); // OAuth + check + create + headers + append
        });
    });
    
    describe('validateAPIKey', () => {
        beforeEach(() => {
            mockResponse.on.mockImplementation((event, handler) => {
                if (event === 'data') {
                    handler(JSON.stringify({ access_token: 'mock-token' }));
                } else if (event === 'end') {
                    handler();
                }
                return mockResponse;
            });
        });
        
        it('should validate active API key', async () => {
            let requestCount = 0;
            https.request.mockImplementation((options, callback) => {
                requestCount++;
                
                if (requestCount === 1) {
                    // OAuth
                    callback(mockResponse);
                } else if (requestCount === 2) {
                    // Find key
                    mockResponse.on.mockImplementation((event, handler) => {
                        if (event === 'data') {
                            handler(JSON.stringify({
                                values: [
                                    ['API Key', 'User Email', 'Key Name', 'Tier', 'Created At', 'Last Used', 'Requests', 'Tokens', 'Revoked', 'Notes'],
                                    ['sk-test123', 'user@example.com', 'Test Key', 'free', '2025-01-01', '', '5', '1000', 'FALSE', '']
                                ]
                            }));
                        } else if (event === 'end') {
                            handler();
                        }
                        return mockResponse;
                    });
                    callback(mockResponse);
                } else if (requestCount === 3) {
                    // Update row
                    mockResponse.on.mockImplementation((event, handler) => {
                        if (event === 'data') {
                            handler(JSON.stringify({ updatedRows: 1 }));
                        } else if (event === 'end') {
                            handler();
                        }
                        return mockResponse;
                    });
                    callback(mockResponse);
                }
                
                return mockRequest;
            });
            
            const result = await apiKeyManager.validateAPIKey('sk-test123');
            
            expect(result).toMatchObject({
                valid: true,
                userEmail: 'user@example.com',
                keyName: 'Test Key',
                tier: 'free',
                requestsCount: 6, // Incremented from 5 to 6
                tokensCount: 1000
            });
        });
        
        it('should reject invalid API key', async () => {
            let requestCount = 0;
            https.request.mockImplementation((options, callback) => {
                requestCount++;
                
                if (requestCount === 1) {
                    callback(mockResponse);
                } else if (requestCount === 2) {
                    // Key not found
                    mockResponse.on.mockImplementation((event, handler) => {
                        if (event === 'data') {
                            handler(JSON.stringify({
                                values: [
                                    ['API Key', 'User Email', 'Key Name', 'Tier', 'Created At', 'Last Used', 'Requests', 'Tokens', 'Revoked', 'Notes']
                                ]
                            }));
                        } else if (event === 'end') {
                            handler();
                        }
                        return mockResponse;
                    });
                    callback(mockResponse);
                }
                
                return mockRequest;
            });
            
            const result = await apiKeyManager.validateAPIKey('sk-invalid');
            
            expect(result).toEqual({
                valid: false,
                reason: 'Invalid API key'
            });
        });
        
        it('should reject revoked API key', async () => {
            let requestCount = 0;
            https.request.mockImplementation((options, callback) => {
                requestCount++;
                
                if (requestCount === 1) {
                    callback(mockResponse);
                } else if (requestCount === 2) {
                    // Key is revoked
                    mockResponse.on.mockImplementation((event, handler) => {
                        if (event === 'data') {
                            handler(JSON.stringify({
                                values: [
                                    ['API Key', 'User Email', 'Key Name', 'Tier', 'Created At', 'Last Used', 'Requests', 'Tokens', 'Revoked', 'Notes'],
                                    ['sk-revoked', 'user@example.com', 'Test Key', 'free', '2025-01-01', '', '5', '1000', 'TRUE', 'Revoked by admin']
                                ]
                            }));
                        } else if (event === 'end') {
                            handler();
                        }
                        return mockResponse;
                    });
                    callback(mockResponse);
                }
                
                return mockRequest;
            });
            
            const result = await apiKeyManager.validateAPIKey('sk-revoked');
            
            expect(result).toEqual({
                valid: false,
                reason: 'API key revoked'
            });
        });
        
        it('should handle missing configuration gracefully', async () => {
            delete process.env.GS_SHEET_ID;
            
            const result = await apiKeyManager.validateAPIKey('sk-test');
            
            expect(result).toEqual({
                valid: false,
                reason: 'Configuration error'
            });
        });
    });
    
    describe('incrementTokenCount', () => {
        beforeEach(() => {
            mockResponse.on.mockImplementation((event, handler) => {
                if (event === 'data') {
                    handler(JSON.stringify({ access_token: 'mock-token' }));
                } else if (event === 'end') {
                    handler();
                }
                return mockResponse;
            });
        });
        
        it('should increment token count for API key', async () => {
            let requestCount = 0;
            let updatePayload = null;
            
            https.request.mockImplementation((options, callback) => {
                requestCount++;
                
                if (requestCount === 1) {
                    // OAuth
                    callback(mockResponse);
                } else if (requestCount === 2) {
                    // Find key
                    mockResponse.on.mockImplementation((event, handler) => {
                        if (event === 'data') {
                            handler(JSON.stringify({
                                values: [
                                    ['API Key', 'User Email', 'Key Name', 'Tier', 'Created At', 'Last Used', 'Requests', 'Tokens', 'Revoked', 'Notes'],
                                    ['sk-test123', 'user@example.com', 'Test Key', 'free', '2025-01-01', '', '5', '1000', 'FALSE', '']
                                ]
                            }));
                        } else if (event === 'end') {
                            handler();
                        }
                        return mockResponse;
                    });
                    callback(mockResponse);
                } else if (requestCount === 3) {
                    // Update row with new token count
                    mockResponse.on.mockImplementation((event, handler) => {
                        if (event === 'data') {
                            handler(JSON.stringify({ updatedRows: 1 }));
                        } else if (event === 'end') {
                            handler();
                        }
                        return mockResponse;
                    });
                    callback(mockResponse);
                }
                
                // Capture write payload
                const req = {
                    on: jest.fn(),
                    write: jest.fn((data) => {
                        if (requestCount === 3) {
                            updatePayload = JSON.parse(data);
                        }
                    }),
                    end: jest.fn(),
                    destroy: jest.fn()
                };
                
                return req;
            });
            
            await apiKeyManager.incrementTokenCount('sk-test123', 500);
            
            expect(https.request).toHaveBeenCalledTimes(3);
            expect(updatePayload.values[0][7]).toBe('1500'); // 1000 + 500
        });
        
        it('should handle missing key gracefully', async () => {
            let requestCount = 0;
            https.request.mockImplementation((options, callback) => {
                requestCount++;
                
                if (requestCount === 1) {
                    callback(mockResponse);
                } else if (requestCount === 2) {
                    // Key not found
                    mockResponse.on.mockImplementation((event, handler) => {
                        if (event === 'data') {
                            handler(JSON.stringify({ values: [] }));
                        } else if (event === 'end') {
                            handler();
                        }
                        return mockResponse;
                    });
                    callback(mockResponse);
                }
                
                return mockRequest;
            });
            
            await expect(
                apiKeyManager.incrementTokenCount('sk-invalid', 500)
            ).resolves.not.toThrow();
        });
    });
    
    describe('revokeAPIKey', () => {
        beforeEach(() => {
            mockResponse.on.mockImplementation((event, handler) => {
                if (event === 'data') {
                    handler(JSON.stringify({ access_token: 'mock-token' }));
                } else if (event === 'end') {
                    handler();
                }
                return mockResponse;
            });
        });
        
        it('should revoke API key', async () => {
            let requestCount = 0;
            let updatePayload = null;
            
            https.request.mockImplementation((options, callback) => {
                requestCount++;
                
                if (requestCount === 1) {
                    // OAuth
                    callback(mockResponse);
                } else if (requestCount === 2) {
                    // Find key
                    mockResponse.on.mockImplementation((event, handler) => {
                        if (event === 'data') {
                            handler(JSON.stringify({
                                values: [
                                    ['API Key', 'User Email', 'Key Name', 'Tier', 'Created At', 'Last Used', 'Requests', 'Tokens', 'Revoked', 'Notes'],
                                    ['sk-test123', 'user@example.com', 'Test Key', 'free', '2025-01-01', '', '5', '1000', 'FALSE', '']
                                ]
                            }));
                        } else if (event === 'end') {
                            handler();
                        }
                        return mockResponse;
                    });
                    callback(mockResponse);
                } else if (requestCount === 3) {
                    // Update row to set Revoked = TRUE
                    mockResponse.on.mockImplementation((event, handler) => {
                        if (event === 'data') {
                            handler(JSON.stringify({ updatedRows: 1 }));
                        } else if (event === 'end') {
                            handler();
                        }
                        return mockResponse;
                    });
                    callback(mockResponse);
                }
                
                // Capture write payload
                const req = {
                    on: jest.fn(),
                    write: jest.fn((data) => {
                        if (requestCount === 3) {
                            updatePayload = JSON.parse(data);
                        }
                    }),
                    end: jest.fn(),
                    destroy: jest.fn()
                };
                
                return req;
            });
            
            const result = await apiKeyManager.revokeAPIKey('sk-test123');
            
            expect(result).toBe(true);
            expect(updatePayload.values[0][8]).toBe('TRUE'); // Column I (Revoked)
        });
        
        it('should return false if key not found', async () => {
            let requestCount = 0;
            https.request.mockImplementation((options, callback) => {
                requestCount++;
                
                if (requestCount === 1) {
                    callback(mockResponse);
                } else if (requestCount === 2) {
                    mockResponse.on.mockImplementation((event, handler) => {
                        if (event === 'data') {
                            handler(JSON.stringify({ values: [] }));
                        } else if (event === 'end') {
                            handler();
                        }
                        return mockResponse;
                    });
                    callback(mockResponse);
                }
                
                return mockRequest;
            });
            
            const result = await apiKeyManager.revokeAPIKey('sk-invalid');
            
            expect(result).toBe(false);
        });
    });
    
    describe('listUserAPIKeys', () => {
        beforeEach(() => {
            mockResponse.on.mockImplementation((event, handler) => {
                if (event === 'data') {
                    handler(JSON.stringify({ access_token: 'mock-token' }));
                } else if (event === 'end') {
                    handler();
                }
                return mockResponse;
            });
        });
        
        it('should list all keys for a user', async () => {
            let requestCount = 0;
            https.request.mockImplementation((options, callback) => {
                requestCount++;
                
                if (requestCount === 1) {
                    // OAuth
                    callback(mockResponse);
                } else if (requestCount === 2) {
                    // Get all keys
                    mockResponse.on.mockImplementation((event, handler) => {
                        if (event === 'data') {
                            handler(JSON.stringify({
                                values: [
                                    ['API Key', 'User Email', 'Key Name', 'Tier', 'Created At', 'Last Used', 'Requests', 'Tokens', 'Revoked', 'Notes'],
                                    ['sk-user1key1', 'user@example.com', 'Production', 'pro', '2025-01-01', '2025-01-15', '100', '50000', 'FALSE', ''],
                                    ['sk-user2key1', 'other@example.com', 'Test', 'free', '2025-01-05', '', '5', '1000', 'FALSE', ''],
                                    ['sk-user1key2', 'user@example.com', 'Development', 'free', '2025-01-10', '2025-01-12', '20', '5000', 'TRUE', 'Revoked']
                                ]
                            }));
                        } else if (event === 'end') {
                            handler();
                        }
                        return mockResponse;
                    });
                    callback(mockResponse);
                }
                
                return mockRequest;
            });
            
            const result = await apiKeyManager.listUserAPIKeys('user@example.com');
            
            expect(result).toHaveLength(2); // Only user@example.com keys
            expect(result[0]).toMatchObject({
                apiKey: 'sk-user1key1'.slice(0, 12) + '...',
                keyName: 'Production',
                tier: 'pro',
                requestsCount: 100,
                tokensCount: 50000,
                revoked: false
            });
            expect(result[1]).toMatchObject({
                keyName: 'Development',
                revoked: true
            });
        });
        
        it('should return empty array if no keys found', async () => {
            let requestCount = 0;
            https.request.mockImplementation((options, callback) => {
                requestCount++;
                
                if (requestCount === 1) {
                    callback(mockResponse);
                } else if (requestCount === 2) {
                    mockResponse.on.mockImplementation((event, handler) => {
                        if (event === 'data') {
                            handler(JSON.stringify({
                                values: [
                                    ['API Key', 'User Email', 'Key Name', 'Tier', 'Created At', 'Last Used', 'Requests', 'Tokens', 'Revoked', 'Notes']
                                ]
                            }));
                        } else if (event === 'end') {
                            handler();
                        }
                        return mockResponse;
                    });
                    callback(mockResponse);
                }
                
                return mockRequest;
            });
            
            const result = await apiKeyManager.listUserAPIKeys('nokeys@example.com');
            
            expect(result).toEqual([]);
        });
        
        it('should handle "Never" for keys never used', async () => {
            let requestCount = 0;
            https.request.mockImplementation((options, callback) => {
                requestCount++;
                
                if (requestCount === 1) {
                    callback(mockResponse);
                } else if (requestCount === 2) {
                    mockResponse.on.mockImplementation((event, handler) => {
                        if (event === 'data') {
                            handler(JSON.stringify({
                                values: [
                                    ['API Key', 'User Email', 'Key Name', 'Tier', 'Created At', 'Last Used', 'Requests', 'Tokens', 'Revoked', 'Notes'],
                                    ['sk-neverused', 'user@example.com', 'Unused', 'free', '2025-01-01', '', '0', '0', 'FALSE', '']
                                ]
                            }));
                        } else if (event === 'end') {
                            handler();
                        }
                        return mockResponse;
                    });
                    callback(mockResponse);
                }
                
                return mockRequest;
            });
            
            const result = await apiKeyManager.listUserAPIKeys('user@example.com');
            
            expect(result[0].lastUsed).toBe('Never');
        });
    });
    
    describe('Security Tests', () => {
        it('should mask API keys in listing (data protection)', async () => {
            mockResponse.on.mockImplementation((event, handler) => {
                if (event === 'data') {
                    handler(JSON.stringify({ access_token: 'mock-token' }));
                } else if (event === 'end') {
                    handler();
                }
                return mockResponse;
            });
            
            let requestCount = 0;
            https.request.mockImplementation((options, callback) => {
                requestCount++;
                
                if (requestCount === 1) {
                    callback(mockResponse);
                } else if (requestCount === 2) {
                    mockResponse.on.mockImplementation((event, handler) => {
                        if (event === 'data') {
                            handler(JSON.stringify({
                                values: [
                                    ['API Key', 'User Email', 'Key Name', 'Tier', 'Created At', 'Last Used', 'Requests', 'Tokens', 'Revoked', 'Notes'],
                                    ['sk-verylongapikey123456789', 'user@example.com', 'Test', 'free', '2025-01-01', '', '0', '0', 'FALSE', '']
                                ]
                            }));
                        } else if (event === 'end') {
                            handler();
                        }
                        return mockResponse;
                    });
                    callback(mockResponse);
                }
                
                return mockRequest;
            });
            
            const result = await apiKeyManager.listUserAPIKeys('user@example.com');
            
            // Should only show first 12 chars + ...
            expect(result[0].apiKey).toBe('sk-verylonga...');
            expect(result[0].apiKey).not.toContain('123456789');
        });
        
        it('should isolate keys by user email', async () => {
            mockResponse.on.mockImplementation((event, handler) => {
                if (event === 'data') {
                    handler(JSON.stringify({ access_token: 'mock-token' }));
                } else if (event === 'end') {
                    handler();
                }
                return mockResponse;
            });
            
            let requestCount = 0;
            https.request.mockImplementation((options, callback) => {
                requestCount++;
                
                if (requestCount === 1) {
                    callback(mockResponse);
                } else if (requestCount === 2) {
                    mockResponse.on.mockImplementation((event, handler) => {
                        if (event === 'data') {
                            handler(JSON.stringify({
                                values: [
                                    ['API Key', 'User Email', 'Key Name', 'Tier', 'Created At', 'Last Used', 'Requests', 'Tokens', 'Revoked', 'Notes'],
                                    ['sk-alice1', 'alice@example.com', 'Alice Key', 'pro', '2025-01-01', '', '100', '10000', 'FALSE', ''],
                                    ['sk-bob1', 'bob@example.com', 'Bob Key', 'free', '2025-01-02', '', '50', '5000', 'FALSE', ''],
                                    ['sk-alice2', 'alice@example.com', 'Alice Key 2', 'free', '2025-01-03', '', '10', '1000', 'FALSE', '']
                                ]
                            }));
                        } else if (event === 'end') {
                            handler();
                        }
                        return mockResponse;
                    });
                    callback(mockResponse);
                }
                
                return mockRequest;
            });
            
            const aliceKeys = await apiKeyManager.listUserAPIKeys('alice@example.com');
            
            // Should only return Alice's keys, not Bob's
            expect(aliceKeys).toHaveLength(2);
            expect(aliceKeys.every(k => !k.keyName.includes('Bob'))).toBe(true);
        });
    });
});
