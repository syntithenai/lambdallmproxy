/**
 * Test suite for sheets-storage module with multi-tenancy focus
 */
const { buildUserFilter, validateProjectId } = require('../../../src/services/user-isolation');
const { SheetsStorage } = require('../../../src/rag/sheets-storage');

// Mock the Google Sheets service
jest.mock('google-spreadsheet', () => {
  return jest.fn().mockImplementation(() => ({
    loadInfo: jest.fn(),
    sheets: {
      byIndex: jest.fn()
    }
  }));
});

describe('SheetsStorage', () => {
  let sheetsStorage;
  let mockSheet;

  beforeEach(() => {
    // Mock the Google Sheets API
    const mockSpreadsheet = {
      loadInfo: jest.fn(),
      sheets: {
        byIndex: jest.fn()
      }
    };
    
    mockSheet = {
      getRows: jest.fn(),
      addRow: jest.fn(),
      updateRow: jest.fn(),
      deleteRow: jest.fn()
    };
    
    mockSpreadsheet.sheets.byIndex.mockReturnValue(mockSheet);
    
    sheetsStorage = new SheetsStorage();
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('constructor', () => {
    it('should initialize with default configuration', () => {
      expect(sheetsStorage).toBeDefined();
      expect(sheetsStorage.projectId).toBeUndefined();
      expect(sheetsStorage.userId).toBeUndefined();
    });
  });

  describe('setUserContext', () => {
    it('should set user and project context', () => {
      sheetsStorage.setUserContext('user123', 'project456');
      
      expect(sheetsStorage.userId).toBe('user123');
      expect(sheetsStorage.projectId).toBe('project456');
    });
  });

  describe('buildUserFilter', () => {
    it('should build proper user filter for Google Sheets queries', () => {
      const filter = buildUserFilter('user123', 'project456');
      
      expect(filter).toBeDefined();
      expect(typeof filter).toBe('string');
    });
  });

  describe('validateProjectId', () => {
    it('should validate project ID format', () => {
      const validProjectId = 'project-123';
      const invalidProjectId = null;
      
      expect(validateProjectId(validProjectId)).toBe(true);
      expect(validateProjectId(invalidProjectId)).toBe(false);
    });
  });

  describe('multi-tenancy isolation', () => {
    it('should isolate data by user and project', () => {
      // Test that different users have isolated data
      const storage1 = new SheetsStorage();
      const storage2 = new SheetsStorage();
      
      storage1.setUserContext('user1', 'project1');
      storage2.setUserContext('user2', 'project2');
      
      expect(storage1.userId).toBe('user1');
      expect(storage1.projectId).toBe('project1');
      expect(storage2.userId).toBe('user2');
      expect(storage2.projectId).toBe('project2');
    });
  });

  describe('data operations with context', () => {
    it('should properly handle data operations with user context', async () => {
      const mockData = { id: '1', content: 'test content' };
      
      // Mock the sheet operations
      mockSheet.getRows.mockResolvedValue([mockData]);
      
      sheetsStorage.setUserContext('user123', 'project456');
      
      // This would normally call the Google Sheets API with proper context
      const result = await sheetsStorage.getRows();
      
      expect(result).toBeDefined();
      expect(mockSheet.getRows).toHaveBeenCalled();
    });
  });

  describe('security validation', () => {
    it('should validate user and project before operations', () => {
      // Test that operations fail without proper context
      expect(() => {
        sheetsStorage.setUserContext(null, 'project456');
      }).toThrow();
      
      expect(() => {
        sheetsStorage.setUserContext('user123', null);
      }).toThrow();
    });
  });
});