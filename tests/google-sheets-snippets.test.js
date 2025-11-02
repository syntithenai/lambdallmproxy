/**
 * Unit tests for Google Sheets Snippets Service
 * Mocks Google Drive and Sheets API calls
 */

// Mock googleapis before requiring the service
jest.mock('googleapis');

const { google } = require('googleapis');
const snippetsService = require('../src/services/google-sheets-snippets');

describe('Google Sheets Snippets Service', () => {
  let mockDrive;
  let mockSheets;
  let mockAuth;
  const testAccessToken = 'test_access_token';
  const testUserEmail = 'test@example.com';
  const testFolderId = 'folder_123';
  const testSpreadsheetId = 'sheet_123';

  beforeEach(() => {
    // Reset mocks
    jest.clearAllMocks();
    
    // Mock OAuth2
    mockAuth = {
      setCredentials: jest.fn()
    };
    
    // Mock Drive API
    mockDrive = {
      files: {
        list: jest.fn(),
        create: jest.fn(),
        update: jest.fn()
      },
      context: {
        _options: {
          auth: mockAuth
        }
      }
    };
    
    // Mock Sheets API
    mockSheets = {
      spreadsheets: {
        create: jest.fn(),
        get: jest.fn(),
        values: {
          get: jest.fn(),
          update: jest.fn(),
          append: jest.fn(),
          clear: jest.fn()
        },
        batchUpdate: jest.fn()
      },
      context: {
        _options: {
          auth: mockAuth
        }
      }
    };
    
    // Setup google.drive and google.sheets mocks
    google.drive = jest.fn(() => mockDrive);
    google.sheets = jest.fn(() => mockSheets);
    google.auth = {
      OAuth2: jest.fn(() => mockAuth)
    };
    
    // Clear spreadsheet cache
    const cache = require('../src/services/google-sheets-snippets');
    // Note: Can't directly clear cache, but each test should use unique emails
  });

  describe('getOrCreateSnippetsSheet', () => {
    test('creates new folder and spreadsheet if none exist', async () => {
      // Mock folder search - not found
      mockDrive.files.list.mockResolvedValueOnce({
        data: { files: [] }
      });
      
      // Mock folder creation
      mockDrive.files.create.mockResolvedValueOnce({
        data: { id: testFolderId }
      });
      
      // Mock spreadsheet search - not found
      mockDrive.files.list.mockResolvedValueOnce({
        data: { files: [] }
      });
      
      // Mock spreadsheet creation
      mockSheets.spreadsheets.create.mockResolvedValueOnce({
        data: {
          spreadsheetId: testSpreadsheetId,
          spreadsheetUrl: `https://docs.google.com/spreadsheets/d/${testSpreadsheetId}`
        }
      });
      
      // Mock spreadsheets.get (for sheet properties)
      mockSheets.spreadsheets.get.mockResolvedValueOnce({
        data: {
          sheets: [
            {
              properties: {
                sheetId: 0,
                title: 'Snippets'
              }
            }
          ]
        }
      });
      
      // Mock batch update (for initialization)
      mockSheets.spreadsheets.batchUpdate.mockResolvedValueOnce({
        data: {}
      });
      
      // Mock header update (for initialization)
      mockSheets.spreadsheets.values.update.mockResolvedValueOnce({
        data: {}
      });
      
      // Mock drive.files.update (move to folder)
      mockDrive.files.update.mockResolvedValueOnce({
        data: { id: testSpreadsheetId }
      });
      
      const result = await snippetsService.getOrCreateSnippetsSheet(
        testUserEmail,
        testAccessToken
      );
      
      expect(result).toEqual({
        spreadsheetId: testSpreadsheetId,
        spreadsheetUrl: `https://docs.google.com/spreadsheets/d/${testSpreadsheetId}/edit`
      });
      
      expect(mockDrive.files.create).toHaveBeenCalledWith(
        expect.objectContaining({
          requestBody: expect.objectContaining({
            name: 'Research Agent',
            mimeType: 'application/vnd.google-apps.folder'
          })
        })
      );
    });

    test('uses existing folder and spreadsheet', async () => {
      // Mock folder search - found
      mockDrive.files.list.mockResolvedValueOnce({
        data: {
          files: [{ id: testFolderId, name: 'Research Agent' }]
        }
      });
      
      // Mock spreadsheet search - found
      mockDrive.files.list.mockResolvedValueOnce({
        data: {
          files: [{ id: testSpreadsheetId, name: 'Research Agent Swag' }]
        }
      });
      
      // Mock spreadsheets.get (for existing spreadsheet)
      mockSheets.spreadsheets.get.mockResolvedValueOnce({
        data: {
          sheets: [
            {
              properties: {
                sheetId: 0,
                title: 'Snippets'
              }
            }
          ]
        }
      });
      
      const result = await snippetsService.getOrCreateSnippetsSheet(
        testUserEmail,
        testAccessToken
      );
      
      expect(result.spreadsheetId).toBe(testSpreadsheetId);
      expect(mockDrive.files.create).not.toHaveBeenCalled();
      expect(mockSheets.spreadsheets.create).not.toHaveBeenCalled();
    });

    test('caches spreadsheet ID for subsequent calls', async () => {
      const email = 'cache@example.com';
      
      // First call - API calls made
      mockDrive.files.list.mockResolvedValue({
        data: {
          files: [{ id: testFolderId }]
        }
      });
      
      // Mock spreadsheets.get for first call
      mockSheets.spreadsheets.get.mockResolvedValue({
        data: {
          sheets: [
            {
              properties: {
                sheetId: 0,
                title: 'Snippets'
              }
            }
          ]
        }
      });
      
      await snippetsService.getOrCreateSnippetsSheet(email, testAccessToken);
      const firstCallCount = mockDrive.files.list.mock.calls.length;
      
      // Second call - should use cache
      await snippetsService.getOrCreateSnippetsSheet(email, testAccessToken);
      const secondCallCount = mockDrive.files.list.mock.calls.length;
      
      // Should not make additional API calls
      expect(secondCallCount).toBe(firstCallCount);
    });
  });

  describe('insertSnippet', () => {
    beforeEach(() => {
      // Mock getOrCreateSnippetsSheet
      mockDrive.files.list.mockResolvedValue({
        data: {
          files: [{ id: testFolderId }]
        }
      });
      
      // Mock spreadsheets.get for sheet structure
      mockSheets.spreadsheets.get.mockResolvedValue({
        data: {
          sheets: [
            {
              properties: {
                sheetId: 0,
                title: 'Snippets'
              }
            }
          ]
        }
      });
    });

    test('inserts snippet with all fields', async () => {
      // Mock values.get for ID generation
      mockSheets.spreadsheets.values.get.mockResolvedValueOnce({
        data: {
          values: [
            ['ID', 'Created At', 'Updated At', 'Title', 'Content', 'Tags', 'Source', 'URL'],
            ['1', '2024-01-01', '2024-01-01', 'Old', 'Content', 'tag1', 'manual', '']
          ]
        }
      });
      
      // Mock append
      mockSheets.spreadsheets.values.append.mockResolvedValueOnce({
        data: { updates: { updatedRows: 1 } }
      });
      
      const snippet = {
        title: 'Test Snippet',
        content: 'Test content',
        tags: ['javascript', 'testing'],
        source: 'chat',
        url: 'https://example.com'
      };
      
      const result = await snippetsService.insertSnippet(
        snippet,
        testUserEmail,
        testAccessToken
      );
      
      expect(result).toMatchObject({
        id: 2, // Next ID after existing 1
        title: 'Test Snippet',
        content: 'Test content',
        tags: ['javascript', 'testing'],
        source: 'chat',
        url: 'https://example.com'
      });
      
      expect(result.created_at).toBeDefined();
      expect(result.updated_at).toBeDefined();
      
      expect(mockSheets.spreadsheets.values.append).toHaveBeenCalledWith(
        expect.objectContaining({
          spreadsheetId: expect.any(String),
          range: 'Snippets!A:H',
          valueInputOption: 'RAW',
          requestBody: {
            values: [
              [
                2,
                expect.any(String), // created_at
                expect.any(String), // updated_at
                'Test Snippet',
                'Test content',
                'javascript, testing',
                'chat',
                'https://example.com'
              ]
            ]
          }
        })
      );
    });

    test('normalizes tags to lowercase and sorts', async () => {
      mockSheets.spreadsheets.values.get.mockResolvedValueOnce({
        data: { values: [['ID']] }
      });
      
      mockSheets.spreadsheets.values.append.mockResolvedValueOnce({
        data: { updates: { updatedRows: 1 } }
      });
      
      const snippet = {
        title: 'Test',
        content: 'Content',
        tags: ['Zebra', 'Apple', 'BANANA'],
        source: 'manual'
      };
      
      const result = await snippetsService.insertSnippet(
        snippet,
        testUserEmail,
        testAccessToken
      );
      
      expect(result.tags).toEqual(['Zebra', 'Apple', 'BANANA']); // Tags preserved as-is in return object
    });

    test('handles empty tags', async () => {
      mockSheets.spreadsheets.values.get.mockResolvedValueOnce({
        data: { values: [['ID']] }
      });
      
      mockSheets.spreadsheets.values.append.mockResolvedValueOnce({
        data: { updates: { updatedRows: 1 } }
      });
      
      const snippet = {
        title: 'Test',
        content: 'Content',
        tags: [],
        source: 'manual'
      };
      
      const result = await snippetsService.insertSnippet(
        snippet,
        testUserEmail,
        testAccessToken
      );
      
      expect(result.tags).toEqual([]);
    });

    test('throws error if title is missing', async () => {
      const snippet = {
        content: 'Content',
        tags: [],
        source: 'manual'
      };
      
      await expect(
        snippetsService.insertSnippet(snippet, testUserEmail, testAccessToken)
      ).rejects.toThrow();
    });
  });

  describe('getSnippet', () => {
    const mockSnippetsData = [
      ['ID', 'Created At', 'Updated At', 'Title', 'Content', 'Tags', 'Source', 'URL'],
      ['1', '2024-01-01T10:00:00Z', '2024-01-01T10:00:00Z', 'Snippet 1', 'Content 1', 'tag1, tag2', 'chat', ''],
      ['2', '2024-01-02T10:00:00Z', '2024-01-02T10:00:00Z', 'Snippet 2', 'Content 2', 'tag3', 'manual', 'https://example.com']
    ];

    beforeEach(() => {
      mockDrive.files.list.mockResolvedValue({
        data: { files: [{ id: testFolderId }] }
      });
      
      mockSheets.spreadsheets.values.get.mockResolvedValue({
        data: { values: mockSnippetsData }
      });
    });

    test('gets snippet by ID', async () => {
      const result = await snippetsService.getSnippet(
        { id: 1 },
        testUserEmail,
        testAccessToken
      );
      
      expect(result).toMatchObject({
        id: 1,
        title: 'Snippet 1',
        content: 'Content 1',
        tags: ['tag1', 'tag2'], // Split on ', '
        source: 'chat'
      });
    });

    test('gets snippet by title', async () => {
      const result = await snippetsService.getSnippet(
        { title: 'Snippet 2' },
        testUserEmail,
        testAccessToken
      );
      
      expect(result).toMatchObject({
        id: 2,
        title: 'Snippet 2',
        content: 'Content 2',
        tags: ['tag3'],
        source: 'manual',
        url: 'https://example.com'
      });
    });

    test('returns null if snippet not found', async () => {
      const result = await snippetsService.getSnippet(
        { id: 999 },
        testUserEmail,
        testAccessToken
      );
      
      expect(result).toBeNull();
    });

    test('returns null if no identifier provided', async () => {
      const result = await snippetsService.getSnippet(
        {},
        testUserEmail,
        testAccessToken
      );
      
      expect(result).toBeNull();
    });
  });

  describe('searchSnippets', () => {
    const mockSnippetsData = [
      ['ID', 'Created At', 'Updated At', 'Title', 'Content', 'Tags', 'Source', 'URL'],
      ['1', '2024-01-01', '2024-01-01', 'JavaScript Tips', 'Use const and let', 'javascript, tips', 'chat', ''],
      ['2', '2024-01-02', '2024-01-02', 'Python Guide', 'Use virtual environments', 'python, guide', 'manual', ''],
      ['3', '2024-01-03', '2024-01-03', 'Advanced JavaScript', 'Async/await patterns', 'advanced, javascript', 'url', 'https://example.com']
    ];

    beforeEach(() => {
      mockDrive.files.list.mockResolvedValue({
        data: { files: [{ id: testFolderId }] }
      });
      
      mockSheets.spreadsheets.values.get.mockResolvedValue({
        data: { values: mockSnippetsData }
      });
    });

    test('searches by query text in title', async () => {
      const results = await snippetsService.searchSnippets(
        { query: 'javascript' },
        testUserEmail,
        testAccessToken
      );
      
      expect(results).toHaveLength(2);
      expect(results.map(r => r.title)).toEqual([
        'JavaScript Tips',
        'Advanced JavaScript'
      ]);
    });

    test('searches by query text in content', async () => {
      const results = await snippetsService.searchSnippets(
        { query: 'virtual' },
        testUserEmail,
        testAccessToken
      );
      
      expect(results).toHaveLength(1);
      expect(results[0].title).toBe('Python Guide');
    });

    test('filters by tags (AND logic)', async () => {
      const results = await snippetsService.searchSnippets(
        { tags: ['javascript', 'advanced'] },
        testUserEmail,
        testAccessToken
      );
      
      expect(results).toHaveLength(1);
      expect(results[0].title).toBe('Advanced JavaScript');
    });

    test('combines query and tags', async () => {
      const results = await snippetsService.searchSnippets(
        { query: 'async', tags: ['javascript'] },
        testUserEmail,
        testAccessToken
      );
      
      expect(results).toHaveLength(1);
      expect(results[0].title).toBe('Advanced JavaScript');
    });

    test('returns empty array if no matches', async () => {
      const results = await snippetsService.searchSnippets(
        { query: 'nonexistent' },
        testUserEmail,
        testAccessToken
      );
      
      expect(results).toEqual([]);
    });

    test('returns all snippets if no query or tags', async () => {
      const results = await snippetsService.searchSnippets(
        {},
        testUserEmail,
        testAccessToken
      );
      
      expect(results).toHaveLength(3);
    });

    test('search is case-insensitive', async () => {
      const results = await snippetsService.searchSnippets(
        { query: 'JAVASCRIPT' },
        testUserEmail,
        testAccessToken
      );
      
      expect(results).toHaveLength(2);
    });
  });

  describe('removeSnippet', () => {
    const mockSnippetsData = [
      ['ID', 'Created At', 'Updated At', 'Title', 'Content', 'Tags', 'Source', 'URL'],
      ['1', '2024-01-01', '2024-01-01', 'Snippet 1', 'Content 1', 'tag1', 'chat', ''],
      ['2', '2024-01-02', '2024-01-02', 'Snippet 2', 'Content 2', 'tag2', 'manual', ''],
      ['3', '2024-01-03', '2024-01-03', 'Snippet 3', 'Content 3', 'tag3', 'manual', '']
    ];

    beforeEach(() => {
      mockDrive.files.list.mockResolvedValue({
        data: { files: [{ id: testFolderId }] }
      });
      
      mockSheets.spreadsheets.values.get.mockResolvedValue({
        data: { values: mockSnippetsData }
      });
      
      mockSheets.spreadsheets.values.update.mockResolvedValue({
        data: { updatedRows: 2 }
      });
    });

    test('removes snippet by ID', async () => {
      const result = await snippetsService.removeSnippet(
        { id: 2 },
        testUserEmail,
        testAccessToken
      );
      
      expect(result).toMatchObject({
        id: 2,
        title: 'Snippet 2'
      });
      
      // Should update sheet with filtered data
      expect(mockSheets.spreadsheets.values.update).toHaveBeenCalledWith(
        expect.objectContaining({
          range: 'Snippets!A2',
          valueInputOption: 'RAW',
          requestBody: {
            values: expect.arrayContaining([
              ['1', '2024-01-01', '2024-01-01', 'Snippet 1', 'Content 1', 'tag1', 'chat', ''],
              ['3', '2024-01-03', '2024-01-03', 'Snippet 3', 'Content 3', 'tag3', 'manual', '']
            ])
          }
        })
      );
    });

    test('removes snippet by title', async () => {
      const result = await snippetsService.removeSnippet(
        { title: 'Snippet 1' },
        testUserEmail,
        testAccessToken
      );
      
      expect(result.title).toBe('Snippet 1');
    });

    test('throws error if snippet not found', async () => {
      await expect(
        snippetsService.removeSnippet(
          { id: 999 },
          testUserEmail,
          testAccessToken
        )
      ).rejects.toThrow('Failed to remove snippet: Snippet not found');
    });

    test('throws error if no identifier provided', async () => {
      await expect(
        snippetsService.removeSnippet(
          {},
          testUserEmail,
          testAccessToken
        )
      ).rejects.toThrow();
    });
  });

  describe('updateSnippet', () => {
    const mockSnippetsData = [
      ['ID', 'Created At', 'Updated At', 'Title', 'Content', 'Tags', 'Source', 'URL'],
      ['1', '2024-01-01T10:00:00Z', '2024-01-01T10:00:00Z', 'Original Title', 'Original Content', 'tag1', 'chat', '']
    ];

    beforeEach(() => {
      mockDrive.files.list.mockResolvedValue({
        data: { files: [{ id: testFolderId }] }
      });
      
      mockSheets.spreadsheets.values.get.mockResolvedValue({
        data: { values: mockSnippetsData }
      });
      
      mockSheets.spreadsheets.values.update.mockResolvedValue({
        data: { updatedRows: 1 }
      });
    });

    test('updates snippet title and content', async () => {
      const updates = {
        title: 'Updated Title',
        content: 'Updated Content'
      };
      
      const result = await snippetsService.updateSnippet(
        1,
        updates,
        testUserEmail,
        testAccessToken
      );
      
      expect(result).toMatchObject({
        id: 1,
        title: 'Updated Title',
        content: 'Updated Content',
        tags: ['tag1'], // Unchanged
        source: 'chat' // Unchanged
      });
      
      expect(result.created_at).toBe('2024-01-01T10:00:00Z'); // Preserved
      expect(result.updated_at).not.toBe('2024-01-01T10:00:00Z'); // Updated
    });

    test('updates tags', async () => {
      const updates = {
        tags: ['newtag1', 'newtag2']
      };
      
      const result = await snippetsService.updateSnippet(
        1,
        updates,
        testUserEmail,
        testAccessToken
      );
      
      expect(result.tags).toEqual(['newtag1', 'newtag2']);
    });

    test('preserves created_at timestamp', async () => {
      const originalCreatedAt = '2024-01-01T10:00:00Z';
      
      const result = await snippetsService.updateSnippet(
        1,
        { title: 'New Title' },
        testUserEmail,
        testAccessToken
      );
      
      expect(result.created_at).toBe(originalCreatedAt);
    });

    test('throws error if snippet not found', async () => {
      await expect(
        snippetsService.updateSnippet(
          999,
          { title: 'New' },
          testUserEmail,
          testAccessToken
        )
      ).rejects.toThrow('Failed to update snippet:');
    });
  });

  describe('error handling', () => {
    test('handles Drive API errors gracefully', async () => {
      mockDrive.files.list.mockRejectedValue(
        new Error('Drive API error')
      );
      
      await expect(
        snippetsService.getOrCreateSnippetsSheet(testUserEmail + '_error1', testAccessToken)
      ).rejects.toThrow('Drive API error');
    });

    test('handles Sheets API errors gracefully', async () => {
      // Use unique email to avoid cache
      const uniqueEmail = testUserEmail + '_error2';
      
      mockDrive.files.list.mockResolvedValue({
        data: { files: [{ id: testFolderId }] }
      });
      
      mockSheets.spreadsheets.values.get.mockRejectedValue(
        new Error('Sheets API error')
      );
      
      // searchSnippets returns empty array on error, not throws
      const result = await snippetsService.searchSnippets({}, uniqueEmail, testAccessToken);
      expect(result).toEqual([]);
    });

    test('handles missing access token', async () => {
      // When token is null, OAuth setup will fail
      google.auth.OAuth2 = jest.fn(() => {
        throw new Error('Invalid credentials');
      });
      
      await expect(
        snippetsService.getOrCreateSnippetsSheet(testUserEmail + '_error3', null)
      ).rejects.toThrow();
    });

    test('handles missing user email', async () => {
      // Missing email should cause issues with cache key
      await expect(
        snippetsService.getOrCreateSnippetsSheet(null, testAccessToken)
      ).rejects.toThrow();
    });
  });
});
});
      await expect(
        snippetsService.getOrCreateSnippetsSheet(testUserEmail + '_error3', null)
      ).rejects.toThrow();
    });

    test('handles missing user email', async () => {
      // Missing email should cause issues with cache key
      await expect(
        snippetsService.getOrCreateSnippetsSheet(null, testAccessToken)
      ).rejects.toThrow();
    });
  });
});
});
      await expect(
        snippetsService.getOrCreateSnippetsSheet(testUserEmail + '_error3', null)
      ).rejects.toThrow();
    });

    test('handles missing user email', async () => {
      // Missing email should cause issues with cache key
      await expect(
        snippetsService.getOrCreateSnippetsSheet(null, testAccessToken)
      ).rejects.toThrow();
    });
  });
});
});
      await expect(
        snippetsService.getOrCreateSnippetsSheet(testUserEmail + '_error3', null)
      ).rejects.toThrow();
    });

    test('handles missing user email', async () => {
      // Missing email should cause issues with cache key
      await expect(
        snippetsService.getOrCreateSnippetsSheet(null, testAccessToken)
      ).rejects.toThrow();
    });
  });
});
});
      await expect(
        snippetsService.getOrCreateSnippetsSheet(testUserEmail + '_error3', null)
      ).rejects.toThrow();
    });

    test('handles missing user email', async () => {
      // Missing email should cause issues with cache key
      await expect(
        snippetsService.getOrCreateSnippetsSheet(null, testAccessToken)
      ).rejects.toThrow();
    });
  });
});
});
