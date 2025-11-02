/**
 * Unit Tests for User Isolation Utilities
 * 
 * CRITICAL SECURITY MODULE - Tests data isolation and multi-tenancy enforcement
 * 
 * Coverage:
 * - Email validation
 * - Filter building
 * - Project ID extraction
 * - Row filtering by user and project
 * - Access control responses
 * - Security logging
 */

const {
    validateUserEmail,
    buildUserFilter,
    extractProjectId,
    filterByUserAndProject,
    belongsToUser,
    createUnauthorizedResponse,
    createUnauthenticatedResponse,
    logUserAccess
} = require('../../../src/services/user-isolation');

describe('User Isolation Utilities', () => {
    
    describe('validateUserEmail', () => {
        test('should accept valid email', () => {
            const email = 'user@example.com';
            expect(validateUserEmail(email)).toBe(email);
        });

        test('should reject null email', () => {
            expect(() => validateUserEmail(null)).toThrow('User authentication required');
        });

        test('should reject undefined email', () => {
            expect(() => validateUserEmail(undefined)).toThrow('User authentication required');
        });

        test('should reject empty string', () => {
            expect(() => validateUserEmail('')).toThrow('User authentication required');
        });

        test('should reject whitespace-only string', () => {
            expect(() => validateUserEmail('   ')).toThrow('User authentication required');
        });

        test('should reject "unknown" placeholder', () => {
            expect(() => validateUserEmail('unknown')).toThrow('User authentication required');
        });

        test('should reject "anonymous" placeholder', () => {
            expect(() => validateUserEmail('anonymous')).toThrow('User authentication required');
        });
    });

    describe('buildUserFilter', () => {
        test('should build filter with user email only', () => {
            const filter = buildUserFilter('user@example.com');
            expect(filter).toEqual({
                user_email: 'user@example.com'
            });
        });

        test('should build filter with user email and project ID', () => {
            const filter = buildUserFilter('user@example.com', 'project-123');
            expect(filter).toEqual({
                user_email: 'user@example.com',
                project_id: 'project-123'
            });
        });

        test('should ignore null project ID', () => {
            const filter = buildUserFilter('user@example.com', null);
            expect(filter).toEqual({
                user_email: 'user@example.com'
            });
        });

        test('should ignore empty project ID', () => {
            const filter = buildUserFilter('user@example.com', '');
            expect(filter).toEqual({
                user_email: 'user@example.com'
            });
        });
    });

    describe('extractProjectId', () => {
        test('should extract x-project-id header (lowercase)', () => {
            const event = {
                headers: {
                    'x-project-id': 'project-123'
                }
            };
            expect(extractProjectId(event)).toBe('project-123');
        });

        test('should extract X-Project-ID header (uppercase)', () => {
            const event = {
                headers: {
                    'X-Project-ID': 'project-456'
                }
            };
            expect(extractProjectId(event)).toBe('project-456');
        });

        test('should return null for missing headers', () => {
            const event = {
                headers: {}
            };
            expect(extractProjectId(event)).toBeNull();
        });

        test('should return null for null event', () => {
            expect(extractProjectId(null)).toBeNull();
        });
    });

    describe('filterByUserAndProject', () => {
        const testRows = [
            { id: 1, user_email: 'alice@example.com', project_id: 'project-a', data: 'Alice A' },
            { id: 2, user_email: 'alice@example.com', project_id: 'project-b', data: 'Alice B' },
            { id: 3, user_email: 'bob@example.com', project_id: 'project-a', data: 'Bob A' },
            { id: 4, user_email: 'bob@example.com', project_id: 'project-b', data: 'Bob B' },
        ];

        test('should filter by user email only', () => {
            const filtered = filterByUserAndProject(testRows, 'alice@example.com');
            expect(filtered).toHaveLength(2);
            expect(filtered.map(r => r.id)).toEqual([1, 2]);
        });

        test('should filter by user email and project ID', () => {
            const filtered = filterByUserAndProject(testRows, 'alice@example.com', 'project-a');
            expect(filtered).toHaveLength(1);
            expect(filtered[0].id).toBe(1);
        });

        test('should return empty array for non-existent user', () => {
            const filtered = filterByUserAndProject(testRows, 'charlie@example.com');
            expect(filtered).toHaveLength(0);
        });

        test('should not leak data across users', () => {
            const bobRows = filterByUserAndProject(testRows, 'bob@example.com');
            expect(bobRows).toHaveLength(2);
            expect(bobRows.every(r => r.user_email === 'bob@example.com')).toBe(true);
        });
    });

    describe('belongsToUser', () => {
        test('should return true for matching user', () => {
            const row = { user_email: 'user@example.com', data: 'test' };
            expect(belongsToUser(row, 'user@example.com')).toBe(true);
        });

        test('should return false for non-matching user', () => {
            const row = { user_email: 'alice@example.com', data: 'test' };
            expect(belongsToUser(row, 'bob@example.com')).toBe(false);
        });

        test('should return false for null row', () => {
            expect(belongsToUser(null, 'user@example.com')).toBe(false);
        });
    });

    describe('createUnauthorizedResponse', () => {
        test('should create 403 response with default message', () => {
            const response = createUnauthorizedResponse();
            expect(response.statusCode).toBe(403);
            expect(response.headers['Content-Type']).toBe('application/json');
            
            const body = JSON.parse(response.body);
            expect(body.error).toBe('Access denied');
        });

        test('should create 403 response with custom message', () => {
            const response = createUnauthorizedResponse('Custom error');
            const body = JSON.parse(response.body);
            expect(body.error).toBe('Custom error');
        });
    });

    describe('createUnauthenticatedResponse', () => {
        test('should create 401 response', () => {
            const response = createUnauthenticatedResponse();
            expect(response.statusCode).toBe(401);
            
            const body = JSON.parse(response.body);
            expect(body.error).toBe('Authentication required');
        });
    });

    describe('logUserAccess', () => {
        let consoleLogSpy;

        beforeEach(() => {
            consoleLogSpy = jest.spyOn(console, 'log').mockImplementation();
        });

        afterEach(() => {
            consoleLogSpy.mockRestore();
        });

        test('should log user access', () => {
            logUserAccess('created', 'snippet', 'snip-123', 'user@example.com');
            expect(consoleLogSpy).toHaveBeenCalled();
        });
    });
});
