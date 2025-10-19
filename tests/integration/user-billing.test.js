/**
 * Integration Tests for User Billing Sheet System
 * Tests the complete flow of user-owned billing sheet functionality
 */

const { describe, it, expect, vi, beforeAll, afterAll } = require('vitest');

// Mock Google Sheets API
vi.mock('googleapis', () => ({
  google: {
    auth: {
      OAuth2: vi.fn(() => ({
        setCredentials: vi.fn(),
      })),
    },
    sheets: vi.fn(() => ({
      spreadsheets: {
        create: vi.fn().mockResolvedValue({
          data: {
            spreadsheetId: 'test-spreadsheet-id',
            spreadsheetUrl: 'https://docs.google.com/spreadsheets/d/test-spreadsheet-id/edit',
          },
        }),
        get: vi.fn().mockResolvedValue({
          data: {
            sheets: [{ properties: { title: 'Billing Data' } }],
          },
        }),
        values: {
          get: vi.fn().mockResolvedValue({
            data: {
              values: [
                ['Timestamp', 'Type', 'Provider', 'Model', 'Tokens In', 'Tokens Out', 'Total Tokens', 'Cost ($)', 'Duration (ms)', 'Memory Limit (MB)', 'Memory Used (MB)', 'Request ID', 'Status', 'Error'],
                ['2024-12-15T10:30:45.123Z', 'chat', 'openai', 'gpt-4o', '1000', '500', '1500', '0.015', '2500', '3008', '1200', 'abc-123', 'success', ''],
                ['2024-12-15T10:31:00.000Z', 'embedding', 'openai', 'text-embedding-3-small', '500', '0', '500', '0.001', '1000', '3008', '800', 'def-456', 'success', ''],
              ],
            },
          }),
          append: vi.fn().mockResolvedValue({ data: {} }),
          clear: vi.fn().mockResolvedValue({ data: {} }),
          batchUpdate: vi.fn().mockResolvedValue({ data: {} }),
        },
      },
    })),
    drive: vi.fn(() => ({
      files: {
        list: vi.fn().mockResolvedValue({
          data: {
            files: [
              { id: 'test-folder-id', name: 'Research Agent' },
            ],
          },
        }),
        create: vi.fn().mockResolvedValue({
          data: {
            id: 'test-folder-id',
          },
        }),
      },
    })),
  },
}));

// Import after mocking
const userBillingSheet = require('../../src/services/user-billing-sheet');
const billingEndpoint = require('../../src/endpoints/billing');

describe('User Billing Sheet Service', () => {
  const mockAccessToken = 'test-access-token-123';
  const mockUserEmail = 'test@example.com';

  describe('getOrCreateBillingSheet', () => {
    it('should create a new billing sheet if none exists', async () => {
      const result = await userBillingSheet.getOrCreateBillingSheet(
        mockUserEmail,
        mockAccessToken
      );

      expect(result).toBeDefined();
      expect(result.spreadsheetId).toBe('test-spreadsheet-id');
      expect(result.spreadsheetUrl).toContain('test-spreadsheet-id');
    });

    it('should return existing billing sheet if found', async () => {
      // Mock finding existing sheet
      const { google } = require('googleapis');
      const mockDrive = google.drive();
      mockDrive.files.list.mockResolvedValueOnce({
        data: {
          files: [
            { id: 'existing-sheet-id', name: 'Research Agent Billing' },
          ],
        },
      });

      const result = await userBillingSheet.getOrCreateBillingSheet(
        mockUserEmail,
        mockAccessToken
      );

      expect(result).toBeDefined();
    });
  });

  describe('logToBillingSheet', () => {
    it('should log transaction data to billing sheet', async () => {
      const logData = {
        type: 'chat',
        provider: 'openai',
        model: 'gpt-4o',
        tokensIn: 1000,
        tokensOut: 500,
        totalTokens: 1500,
        cost: 0.015,
        duration: 2500,
        memoryLimit: 3008,
        memoryUsed: 1200,
        requestId: 'test-request-123',
        status: 'success',
        error: null,
      };

      await expect(
        userBillingSheet.logToBillingSheet(mockAccessToken, logData)
      ).resolves.not.toThrow();
    });

    it('should handle logging errors gracefully', async () => {
      const { google } = require('googleapis');
      const mockSheets = google.sheets();
      mockSheets.spreadsheets.values.append.mockRejectedValueOnce(
        new Error('API error')
      );

      const logData = {
        type: 'chat',
        provider: 'openai',
        model: 'gpt-4o',
        tokensIn: 100,
        tokensOut: 50,
        totalTokens: 150,
        cost: 0.001,
      };

      // Should not throw - errors are logged but not propagated
      await expect(
        userBillingSheet.logToBillingSheet(mockAccessToken, logData)
      ).resolves.not.toThrow();
    });
  });

  describe('readBillingData', () => {
    it('should read all billing data without filters', async () => {
      const result = await userBillingSheet.readBillingData(
        mockAccessToken,
        mockUserEmail
      );

      expect(result).toBeDefined();
      expect(Array.isArray(result)).toBe(true);
      expect(result.length).toBeGreaterThan(0);
    });

    it('should filter by date range', async () => {
      const filters = {
        startDate: '2024-12-01',
        endDate: '2024-12-31',
      };

      const result = await userBillingSheet.readBillingData(
        mockAccessToken,
        mockUserEmail,
        filters
      );

      expect(result).toBeDefined();
      expect(Array.isArray(result)).toBe(true);
    });

    it('should filter by type', async () => {
      const filters = {
        type: 'chat',
      };

      const result = await userBillingSheet.readBillingData(
        mockAccessToken,
        mockUserEmail,
        filters
      );

      expect(result).toBeDefined();
      expect(Array.isArray(result)).toBe(true);
    });

    it('should filter by provider', async () => {
      const filters = {
        provider: 'openai',
      };

      const result = await userBillingSheet.readBillingData(
        mockAccessToken,
        mockUserEmail,
        filters
      );

      expect(result).toBeDefined();
      expect(Array.isArray(result)).toBe(true);
    });

    it('should combine multiple filters', async () => {
      const filters = {
        startDate: '2024-12-01',
        endDate: '2024-12-31',
        type: 'chat',
        provider: 'openai',
      };

      const result = await userBillingSheet.readBillingData(
        mockAccessToken,
        mockUserEmail,
        filters
      );

      expect(result).toBeDefined();
      expect(Array.isArray(result)).toBe(true);
    });
  });

  describe('clearBillingData', () => {
    it('should clear all billing data', async () => {
      const options = {
        mode: 'all',
      };

      const rowsCleared = await userBillingSheet.clearBillingData(
        mockAccessToken,
        mockUserEmail,
        options
      );

      expect(typeof rowsCleared).toBe('number');
      expect(rowsCleared).toBeGreaterThanOrEqual(0);
    });

    it('should clear data by provider', async () => {
      const options = {
        mode: 'provider',
        provider: 'openai',
      };

      const rowsCleared = await userBillingSheet.clearBillingData(
        mockAccessToken,
        mockUserEmail,
        options
      );

      expect(typeof rowsCleared).toBe('number');
      expect(rowsCleared).toBeGreaterThanOrEqual(0);
    });

    it('should clear data by date range', async () => {
      const options = {
        mode: 'dateRange',
        startDate: '2024-12-01',
        endDate: '2024-12-15',
      };

      const rowsCleared = await userBillingSheet.clearBillingData(
        mockAccessToken,
        mockUserEmail,
        options
      );

      expect(typeof rowsCleared).toBe('number');
      expect(rowsCleared).toBeGreaterThanOrEqual(0);
    });

    it('should reject invalid clear mode', async () => {
      const options = {
        mode: 'invalid-mode',
      };

      await expect(
        userBillingSheet.clearBillingData(mockAccessToken, mockUserEmail, options)
      ).rejects.toThrow();
    });
  });
});

describe('Billing Endpoint', () => {
  const mockEvent = {
    headers: {
      authorization: 'Bearer test-token-123',
    },
    queryStringParameters: {},
  };

  const mockResponseStream = {
    write: vi.fn(),
    end: vi.fn(),
  };

  describe('GET /billing', () => {
    it('should return billing data with totals', async () => {
      const event = {
        ...mockEvent,
        httpMethod: 'GET',
        path: '/billing',
      };

      const response = await billingEndpoint.handler(
        event,
        mockResponseStream,
        {}
      );

      expect(response).toBeDefined();
      expect(response.statusCode).toBe(200);
      
      const body = JSON.parse(response.body);
      expect(body.success).toBe(true);
      expect(Array.isArray(body.transactions)).toBe(true);
      expect(body.totals).toBeDefined();
      expect(body.totals.byType).toBeDefined();
      expect(body.totals.byProvider).toBeDefined();
      expect(body.totals.byModel).toBeDefined();
    });

    it('should filter by query parameters', async () => {
      const event = {
        ...mockEvent,
        httpMethod: 'GET',
        path: '/billing',
        queryStringParameters: {
          startDate: '2024-12-01',
          endDate: '2024-12-31',
          type: 'chat',
          provider: 'openai',
        },
      };

      const response = await billingEndpoint.handler(
        event,
        mockResponseStream,
        {}
      );

      expect(response).toBeDefined();
      expect(response.statusCode).toBe(200);
      
      const body = JSON.parse(response.body);
      expect(body.success).toBe(true);
      expect(Array.isArray(body.transactions)).toBe(true);
    });

    it('should require authentication', async () => {
      const event = {
        httpMethod: 'GET',
        path: '/billing',
        headers: {}, // No authorization header
      };

      const response = await billingEndpoint.handler(
        event,
        mockResponseStream,
        {}
      );

      expect(response).toBeDefined();
      expect(response.statusCode).toBe(401);
      
      const body = JSON.parse(response.body);
      expect(body.success).toBe(false);
      expect(body.error).toContain('Authorization token required');
    });
  });

  describe('DELETE /billing/clear', () => {
    it('should clear all data', async () => {
      const event = {
        ...mockEvent,
        httpMethod: 'DELETE',
        path: '/billing/clear',
        queryStringParameters: {
          mode: 'all',
        },
      };

      const response = await billingEndpoint.handler(
        event,
        mockResponseStream,
        {}
      );

      expect(response).toBeDefined();
      expect(response.statusCode).toBe(200);
      
      const body = JSON.parse(response.body);
      expect(body.success).toBe(true);
      expect(typeof body.rowsCleared).toBe('number');
      expect(body.message).toContain('cleared');
    });

    it('should clear data by provider', async () => {
      const event = {
        ...mockEvent,
        httpMethod: 'DELETE',
        path: '/billing/clear',
        queryStringParameters: {
          mode: 'provider',
          provider: 'openai',
        },
      };

      const response = await billingEndpoint.handler(
        event,
        mockResponseStream,
        {}
      );

      expect(response).toBeDefined();
      expect(response.statusCode).toBe(200);
      
      const body = JSON.parse(response.body);
      expect(body.success).toBe(true);
    });

    it('should clear data by date range', async () => {
      const event = {
        ...mockEvent,
        httpMethod: 'DELETE',
        path: '/billing/clear',
        queryStringParameters: {
          mode: 'dateRange',
          startDate: '2024-12-01',
          endDate: '2024-12-15',
        },
      };

      const response = await billingEndpoint.handler(
        event,
        mockResponseStream,
        {}
      );

      expect(response).toBeDefined();
      expect(response.statusCode).toBe(200);
      
      const body = JSON.parse(response.body);
      expect(body.success).toBe(true);
    });

    it('should reject invalid mode', async () => {
      const event = {
        ...mockEvent,
        httpMethod: 'DELETE',
        path: '/billing/clear',
        queryStringParameters: {
          mode: 'invalid',
        },
      };

      const response = await billingEndpoint.handler(
        event,
        mockResponseStream,
        {}
      );

      expect(response).toBeDefined();
      expect(response.statusCode).toBe(400);
      
      const body = JSON.parse(response.body);
      expect(body.success).toBe(false);
      expect(body.error).toContain('Invalid mode');
    });

    it('should require mode parameter', async () => {
      const event = {
        ...mockEvent,
        httpMethod: 'DELETE',
        path: '/billing/clear',
        queryStringParameters: {}, // No mode
      };

      const response = await billingEndpoint.handler(
        event,
        mockResponseStream,
        {}
      );

      expect(response).toBeDefined();
      expect(response.statusCode).toBe(400);
      
      const body = JSON.parse(response.body);
      expect(body.success).toBe(false);
      expect(body.error).toContain('mode');
    });
  });
});

describe('End-to-End Billing Flow', () => {
  it('should complete full billing lifecycle', async () => {
    const mockAccessToken = 'test-token-123';
    const mockUserEmail = 'test@example.com';

    // 1. Create/Get billing sheet
    const sheet = await userBillingSheet.getOrCreateBillingSheet(
      mockUserEmail,
      mockAccessToken
    );
    expect(sheet).toBeDefined();
    expect(sheet.spreadsheetId).toBeDefined();

    // 2. Log transaction
    const logData = {
      type: 'chat',
      provider: 'openai',
      model: 'gpt-4o',
      tokensIn: 1000,
      tokensOut: 500,
      totalTokens: 1500,
      cost: 0.015,
      duration: 2500,
      memoryLimit: 3008,
      memoryUsed: 1200,
      requestId: 'e2e-test-123',
      status: 'success',
    };

    await userBillingSheet.logToBillingSheet(mockAccessToken, logData);

    // 3. Read data
    const transactions = await userBillingSheet.readBillingData(
      mockAccessToken,
      mockUserEmail
    );
    expect(Array.isArray(transactions)).toBe(true);

    // 4. Filter data
    const filteredTransactions = await userBillingSheet.readBillingData(
      mockAccessToken,
      mockUserEmail,
      { type: 'chat' }
    );
    expect(Array.isArray(filteredTransactions)).toBe(true);

    // 5. Clear data
    const rowsCleared = await userBillingSheet.clearBillingData(
      mockAccessToken,
      mockUserEmail,
      { mode: 'all' }
    );
    expect(typeof rowsCleared).toBe('number');
  });
});
