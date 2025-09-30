/**
 * Tests for utility modules
 */

const { isQuotaLimitError, parseWaitTimeFromMessage } = require('../../src/utils/error-handling');
const { estimateTokenCount, safeParseJson, truncateText } = require('../../src/utils/token-estimation');

describe('Utility Modules', () => {
    describe('Error Handling Utils', () => {
        describe('isQuotaLimitError', () => {
            test('should detect quota limit errors', () => {
                expect(isQuotaLimitError('quota exceeded')).toBe(true);
                expect(isQuotaLimitError('rate limit exceeded')).toBe(true);
                expect(isQuotaLimitError('too many requests')).toBe(true);
                expect(isQuotaLimitError('HTTP 429 error')).toBe(true);
            });

            test('should not detect non-quota errors', () => {
                expect(isQuotaLimitError('connection failed')).toBe(false);
                expect(isQuotaLimitError('invalid request')).toBe(false);
                expect(isQuotaLimitError('')).toBe(false);
                expect(isQuotaLimitError(null)).toBe(false);
            });
        });

        describe('parseWaitTimeFromMessage', () => {
            test('should parse seconds from error messages', () => {
                expect(parseWaitTimeFromMessage('try again in 30 seconds')).toBe(30);
                expect(parseWaitTimeFromMessage('wait 15s')).toBe(15);
                expect(parseWaitTimeFromMessage('retry after 5.5 seconds')).toBe(6); // rounds up
            });

            test('should parse milliseconds from error messages', () => {
                expect(parseWaitTimeFromMessage('try again in 500ms')).toBe(1); // rounds up to minimum 1s
                expect(parseWaitTimeFromMessage('wait 1500ms')).toBe(2); // rounds up
            });

            test('should parse minutes from error messages', () => {
                expect(parseWaitTimeFromMessage('try again in 2 minutes')).toBe(120);
                expect(parseWaitTimeFromMessage('wait 1 minute')).toBe(60);
            });

            test('should return default for unparseable messages', () => {
                expect(parseWaitTimeFromMessage('unknown error')).toBe(60);
                expect(parseWaitTimeFromMessage('')).toBe(60);
            });
        });
    });

    describe('Token Estimation Utils', () => {
        describe('estimateTokenCount', () => {
            test('should estimate tokens from text length', () => {
                expect(estimateTokenCount('hello world')).toBe(3); // 11 chars / 4 = 2.75, ceil to 3
                expect(estimateTokenCount('a')).toBe(1);
                expect(estimateTokenCount('')).toBe(0);
                expect(estimateTokenCount(null)).toBe(0);
            });
        });

        describe('safeParseJson', () => {
            test('should parse valid JSON', () => {
                expect(safeParseJson('{"key": "value"}')).toEqual({ key: 'value' });
                expect(safeParseJson('[1, 2, 3]')).toEqual([1, 2, 3]);
            });

            test('should return fallback for invalid JSON', () => {
                expect(safeParseJson('invalid json')).toEqual({});
                expect(safeParseJson('invalid json', [])).toEqual([]);
                expect(safeParseJson('{"incomplete": ')).toEqual({});
            });
        });

        describe('truncateText', () => {
            test('should truncate long text', () => {
                expect(truncateText('hello world', 8)).toBe('hello...');
                expect(truncateText('short', 10)).toBe('short');
                expect(truncateText('', 5)).toBe('');
                expect(truncateText(null, 5)).toBe('');
            });
        });
    });
});