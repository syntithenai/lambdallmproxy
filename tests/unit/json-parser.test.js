/**
 * Unit tests for robust JSON parser
 */

const { robustJsonParse, tryParseJson, extractAllJson, validateJsonSchema } = require('../../src/utils/json-parser');

describe('Robust JSON Parser', () => {
    describe('robustJsonParse', () => {
        test('parses clean JSON', () => {
            const json = '{"title": "Test", "value": 123}';
            const result = robustJsonParse(json);
            expect(result).toEqual({ title: 'Test', value: 123 });
        });

        test('parses JSON with markdown code fence', () => {
            const json = '```json\n{"title": "Test"}\n```';
            const result = robustJsonParse(json);
            expect(result).toEqual({ title: 'Test' });
        });

        test('parses JSON with plain code fence', () => {
            const json = '```\n{"title": "Test"}\n```';
            const result = robustJsonParse(json);
            expect(result).toEqual({ title: 'Test' });
        });

        test('parses JSON with trailing commas', () => {
            const json = '{"title": "Test", "value": 123,}';
            const result = robustJsonParse(json);
            expect(result).toEqual({ title: 'Test', value: 123 });
        });

        test('parses JSON with trailing commas in array', () => {
            const json = '{"items": [1, 2, 3,]}';
            const result = robustJsonParse(json);
            expect(result).toEqual({ items: [1, 2, 3] });
        });

        test('extracts JSON object from text', () => {
            const text = 'Here is some JSON: {"title": "Test"} and more text';
            const result = robustJsonParse(text);
            expect(result).toEqual({ title: 'Test' });
        });

        test('extracts JSON array from text', () => {
            const text = 'Here is an array: [1, 2, 3] and more text';
            const result = robustJsonParse(text);
            expect(result).toEqual([1, 2, 3]);
        });

        test('handles single quotes (converts to double)', () => {
            const json = "{'title': 'Test', 'value': 123}";
            const result = robustJsonParse(json);
            expect(result).toEqual({ title: 'Test', value: 123 });
        });

        test('removes JavaScript comments', () => {
            const json = `{
                // This is a comment
                "title": "Test", /* inline comment */
                "value": 123
            }`;
            const result = robustJsonParse(json);
            expect(result).toEqual({ title: 'Test', value: 123 });
        });

        test('handles nested objects', () => {
            const json = '{"outer": {"inner": {"deep": "value"}}}';
            const result = robustJsonParse(json);
            expect(result).toEqual({ outer: { inner: { deep: 'value' } } });
        });

        test('handles nested arrays', () => {
            const json = '{"items": [[1, 2], [3, 4]]}';
            const result = robustJsonParse(json);
            expect(result).toEqual({ items: [[1, 2], [3, 4]] });
        });

        test('throws error on invalid JSON after all attempts', () => {
            const invalid = 'This is not JSON at all';
            expect(() => robustJsonParse(invalid)).toThrow();
        });

        test('throws error on empty string', () => {
            expect(() => robustJsonParse('')).toThrow('Input must be a non-empty string');
        });

        test('throws error on null input', () => {
            expect(() => robustJsonParse(null)).toThrow('Input must be a non-empty string');
        });
    });

    describe('tryParseJson', () => {
        test('returns parsed JSON on success', () => {
            const json = '{"title": "Test"}';
            const result = tryParseJson(json);
            expect(result).toEqual({ title: 'Test' });
        });

        test('returns null on failure', () => {
            const invalid = 'Not JSON';
            const result = tryParseJson(invalid);
            expect(result).toBeNull();
        });

        test('returns null without throwing', () => {
            expect(() => tryParseJson('invalid')).not.toThrow();
        });
    });

    describe('extractAllJson', () => {
        test('extracts multiple JSON objects', () => {
            const text = 'First: {"a": 1} and Second: {"b": 2}';
            const results = extractAllJson(text);
            expect(results).toHaveLength(2);
            expect(results[0]).toEqual({ a: 1 });
            expect(results[1]).toEqual({ b: 2 });
        });

        test('extracts JSON arrays if no objects found', () => {
            const text = 'Array: [1, 2, 3]';
            const results = extractAllJson(text);
            expect(results).toHaveLength(1);
            expect(results[0]).toEqual([1, 2, 3]);
        });

        test('returns empty array if no JSON found', () => {
            const text = 'No JSON here';
            const results = extractAllJson(text);
            expect(results).toEqual([]);
        });
    });

    describe('validateJsonSchema', () => {
        test('validates required fields', () => {
            const json = { title: 'Test', value: 123 };
            const schema = {
                required: ['title', 'value']
            };
            expect(validateJsonSchema(json, schema)).toBe(true);
        });

        test('fails when required field missing', () => {
            const json = { title: 'Test' };
            const schema = {
                required: ['title', 'value']
            };
            expect(validateJsonSchema(json, schema)).toBe(false);
        });

        test('validates field types', () => {
            const json = { title: 'Test', count: 123, items: [] };
            const schema = {
                properties: {
                    title: { type: 'string' },
                    count: { type: 'number' },
                    items: { type: 'array' }
                }
            };
            expect(validateJsonSchema(json, schema)).toBe(true);
        });

        test('fails on incorrect type', () => {
            const json = { title: 123 }; // Should be string
            const schema = {
                properties: {
                    title: { type: 'string' }
                }
            };
            expect(validateJsonSchema(json, schema)).toBe(false);
        });

        test('validates object type', () => {
            const json = { data: { nested: 'value' } };
            const schema = {
                properties: {
                    data: { type: 'object' }
                }
            };
            expect(validateJsonSchema(json, schema)).toBe(true);
        });

        test('fails when array expected but object provided', () => {
            const json = { items: { not: 'array' } };
            const schema = {
                properties: {
                    items: { type: 'array' }
                }
            };
            expect(validateJsonSchema(json, schema)).toBe(false);
        });

        test('returns false for non-object input', () => {
            expect(validateJsonSchema(null, {})).toBe(false);
            expect(validateJsonSchema('string', {})).toBe(false);
            expect(validateJsonSchema(123, {})).toBe(false);
        });
    });

    describe('Real-world LLM response scenarios', () => {
        test('handles typical GPT response with code fence', () => {
            const response = `Sure! Here's the data you requested:

\`\`\`json
{
    "title": "Quantum Physics",
    "items": [
        {"id": 1, "text": "Particle"},
        {"id": 2, "text": "Wave"}
    ]
}
\`\`\`

I hope this helps!`;
            const result = robustJsonParse(response);
            expect(result.title).toBe('Quantum Physics');
            expect(result.items).toHaveLength(2);
        });

        test('handles response with extra explanatory text', () => {
            const response = `Let me generate that for you. {"status": "success", "data": [1, 2, 3]} The generation is complete.`;
            const result = robustJsonParse(response);
            expect(result).toEqual({ status: 'success', data: [1, 2, 3] });
        });

        test('handles malformed JSON from streaming accumulation', () => {
            const partial = '{"title": "Test", "items": [{"id": 1, "val"';
            // This should fail gracefully
            expect(() => robustJsonParse(partial)).toThrow();
        });

        test('handles quiz-like structure', () => {
            const response = `{
                "title": "Science Quiz",
                "questions": [
                    {
                        "id": "q1",
                        "prompt": "What is H2O?",
                        "choices": [
                            {"id": "a", "text": "Water"},
                            {"id": "b", "text": "Oxygen"}
                        ],
                        "answerId": "a"
                    }
                ]
            }`;
            const result = robustJsonParse(response);
            expect(result.questions).toHaveLength(1);
            expect(result.questions[0].answerId).toBe('a');
        });

        test('handles feed item structure', () => {
            const response = `\`\`\`json
{
    "type": "did-you-know",
    "title": "Amazing Fact",
    "content": "Short summary here.",
    "expandedContent": "Long detailed content with facts.",
    "mnemonic": "Memory aid",
    "topics": ["science", "nature"],
    "imageSearchTerms": "amazing nature photo"
}
\`\`\``;
            const result = robustJsonParse(response);
            expect(result.type).toBe('did-you-know');
            expect(result.topics).toContain('science');
        });
    });
});
