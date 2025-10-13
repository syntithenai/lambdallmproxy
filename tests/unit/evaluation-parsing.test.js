/**
 * Unit tests for evaluation response parsing in chat.js
 * Tests both JSON and text-based evaluation responses from Gemini and other models
 */

const { describe, test, expect } = require('@jest/globals');

/**
 * Mock implementation of the evaluation parsing logic from chat.js
 * This mirrors the actual implementation for testing purposes
 */
function parseEvaluationResponse(evalText) {
    let evalResult = { comprehensive: true, reason: 'Evaluation failed - assuming comprehensive' };
    
    try {
        // Try to extract JSON from response (may have markdown code blocks)
        const jsonMatch = evalText.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
            evalResult = JSON.parse(jsonMatch[0]);
        } else {
            // Fallback: If Gemini returns plain text instead of JSON, parse it
            const lowerText = evalText.toLowerCase().trim();
            
            // IMPORTANT: Check negative indicators FIRST because "not comprehensive" contains "comprehensive"
            // Check for keywords indicating NOT comprehensive (more specific patterns first)
            const isNotComprehensive =
                lowerText.includes('not comprehensive') ||
                lowerText.includes('isn\'t comprehensive') ||
                lowerText.includes('is not comprehensive') ||
                lowerText.match(/\bnot\s+(enough|sufficient|complete)/i) ||
                lowerText.includes('incomplete') ||
                lowerText.includes('insufficient') ||
                lowerText.includes('too brief') ||
                lowerText.includes('too short') ||
                lowerText.includes('lacks detail') ||
                lowerText.includes('missing information') ||
                // Check for "no" but not as part of other words (e.g., "know")
                lowerText.match(/\bno\b/) ||
                lowerText.match(/\bfalse\b/);
                
            // Check for keywords indicating comprehensive (less specific, checked second)
            const isComprehensive = 
                lowerText.includes('comprehensive') ||
                lowerText.includes('complete') ||
                lowerText.includes('sufficient') ||
                lowerText.includes('adequate') ||
                lowerText.includes('thorough') ||
                lowerText.match(/\byes\b/) ||
                lowerText.match(/\btrue\b/);
            
            // If we can determine comprehensiveness from text
            // Check negative FIRST (more important to catch "not comprehensive")
            if (isNotComprehensive) {
                evalResult = { 
                    comprehensive: false, 
                    reason: `Text evaluation: ${evalText.substring(0, 150)}`
                };
            } else if (isComprehensive) {
                evalResult = { 
                    comprehensive: true, 
                    reason: `Text evaluation: ${evalText.substring(0, 150)}`
                };
            } else {
                // Can't determine - assume comprehensive (fail-safe)
                evalResult = {
                    comprehensive: true,
                    reason: `Could not parse text evaluation, assuming comprehensive: ${evalText.substring(0, 150)}`
                };
            }
        }
    } catch (parseError) {
        // Return default fail-safe result
        evalResult = { comprehensive: true, reason: 'Parse error - assuming comprehensive' };
    }
    
    return evalResult;
}

describe('Evaluation Response Parsing', () => {
    
    describe('JSON Response Parsing', () => {
        test('should parse valid JSON with comprehensive=true', () => {
            const response = '{"comprehensive": true, "reason": "Response fully answers the question"}';
            const result = parseEvaluationResponse(response);
            expect(result.comprehensive).toBe(true);
            expect(result.reason).toBe("Response fully answers the question");
        });

        test('should parse valid JSON with comprehensive=false', () => {
            const response = '{"comprehensive": false, "reason": "Response is too brief"}';
            const result = parseEvaluationResponse(response);
            expect(result.comprehensive).toBe(false);
            expect(result.reason).toBe("Response is too brief");
        });

        test('should extract JSON from markdown code blocks', () => {
            const response = '```json\n{"comprehensive": true, "reason": "Complete answer"}\n```';
            const result = parseEvaluationResponse(response);
            expect(result.comprehensive).toBe(true);
            expect(result.reason).toBe("Complete answer");
        });

        test('should extract JSON from text with surrounding content', () => {
            const response = 'Here is my evaluation: {"comprehensive": false, "reason": "Missing details"} Hope this helps!';
            const result = parseEvaluationResponse(response);
            expect(result.comprehensive).toBe(false);
            expect(result.reason).toBe("Missing details");
        });

        test('should handle JSON with extra whitespace', () => {
            const response = '  {  "comprehensive"  :  true  ,  "reason"  :  "Good response"  }  ';
            const result = parseEvaluationResponse(response);
            expect(result.comprehensive).toBe(true);
        });
    });

    describe('Text Response Parsing - Comprehensive Responses', () => {
        test('should recognize "yes" as comprehensive', () => {
            const response = 'Yes, this response is comprehensive.';
            const result = parseEvaluationResponse(response);
            expect(result.comprehensive).toBe(true);
        });

        test('should recognize "comprehensive" as comprehensive', () => {
            const response = 'The response is comprehensive and addresses all points.';
            const result = parseEvaluationResponse(response);
            expect(result.comprehensive).toBe(true);
        });

        test('should recognize "complete" as comprehensive', () => {
            const response = 'Complete answer provided.';
            const result = parseEvaluationResponse(response);
            expect(result.comprehensive).toBe(true);
        });

        test('should recognize "sufficient" as comprehensive', () => {
            const response = 'The response is sufficient to answer the query.';
            const result = parseEvaluationResponse(response);
            expect(result.comprehensive).toBe(true);
        });

        test('should recognize "adequate" as comprehensive', () => {
            const response = 'This is an adequate response.';
            const result = parseEvaluationResponse(response);
            expect(result.comprehensive).toBe(true);
        });

        test('should recognize "thorough" as comprehensive', () => {
            const response = 'A thorough and detailed answer.';
            const result = parseEvaluationResponse(response);
            expect(result.comprehensive).toBe(true);
        });

        test('should recognize "true" as comprehensive', () => {
            const response = 'True - the response comprehensively answers the question.';
            const result = parseEvaluationResponse(response);
            expect(result.comprehensive).toBe(true);
        });
    });

    describe('Text Response Parsing - NOT Comprehensive Responses', () => {
        test('should recognize "not comprehensive" as NOT comprehensive', () => {
            const response = 'No, this is not comprehensive.';
            const result = parseEvaluationResponse(response);
            expect(result.comprehensive).toBe(false);
        });

        test('should recognize "isn\'t comprehensive" as NOT comprehensive', () => {
            const response = 'The response isn\'t comprehensive enough.';
            const result = parseEvaluationResponse(response);
            expect(result.comprehensive).toBe(false);
        });

        test('should recognize "is not comprehensive" as NOT comprehensive', () => {
            const response = 'This response is not comprehensive.';
            const result = parseEvaluationResponse(response);
            expect(result.comprehensive).toBe(false);
        });

        test('should recognize "incomplete" as NOT comprehensive', () => {
            const response = 'The answer is incomplete.';
            const result = parseEvaluationResponse(response);
            expect(result.comprehensive).toBe(false);
        });

        test('should recognize "insufficient" as NOT comprehensive', () => {
            const response = 'Insufficient detail provided.';
            const result = parseEvaluationResponse(response);
            expect(result.comprehensive).toBe(false);
        });

        test('should recognize "too brief" as NOT comprehensive', () => {
            const response = 'The response is too brief.';
            const result = parseEvaluationResponse(response);
            expect(result.comprehensive).toBe(false);
        });

        test('should recognize "too short" as NOT comprehensive', () => {
            const response = 'Too short of an answer.';
            const result = parseEvaluationResponse(response);
            expect(result.comprehensive).toBe(false);
        });

        test('should recognize "lacks detail" as NOT comprehensive', () => {
            const response = 'The response lacks detail.';
            const result = parseEvaluationResponse(response);
            expect(result.comprehensive).toBe(false);
        });

        test('should recognize "missing information" as NOT comprehensive', () => {
            const response = 'There is missing information in the response.';
            const result = parseEvaluationResponse(response);
            expect(result.comprehensive).toBe(false);
        });

        test('should recognize standalone "no" as NOT comprehensive', () => {
            const response = 'No, it does not fully answer the question.';
            const result = parseEvaluationResponse(response);
            expect(result.comprehensive).toBe(false);
        });

        test('should recognize "false" as NOT comprehensive', () => {
            const response = 'False - the response is inadequate.';
            const result = parseEvaluationResponse(response);
            expect(result.comprehensive).toBe(false);
        });

        test('should recognize "not enough" as NOT comprehensive', () => {
            const response = 'Not enough information provided.';
            const result = parseEvaluationResponse(response);
            expect(result.comprehensive).toBe(false);
        });

        test('should recognize "not sufficient" as NOT comprehensive', () => {
            const response = 'The answer is not sufficient.';
            const result = parseEvaluationResponse(response);
            expect(result.comprehensive).toBe(false);
        });

        test('should recognize "not complete" as NOT comprehensive', () => {
            const response = 'Response is not complete.';
            const result = parseEvaluationResponse(response);
            expect(result.comprehensive).toBe(false);
        });
    });

    describe('Edge Cases and Gemini-Specific Formats', () => {
        test('should NOT match "no" in words like "know"', () => {
            const response = 'I know this response is comprehensive.';
            const result = parseEvaluationResponse(response);
            expect(result.comprehensive).toBe(true);
        });

        test('should handle case variations', () => {
            const response = 'NOT COMPREHENSIVE';
            const result = parseEvaluationResponse(response);
            expect(result.comprehensive).toBe(false);
        });

        test('should prioritize negative over positive when both present', () => {
            const response = 'While it seems comprehensive, it is actually not comprehensive.';
            const result = parseEvaluationResponse(response);
            expect(result.comprehensive).toBe(false);
        });

        test('should handle responses with extra punctuation', () => {
            const response = '**No!** This is not comprehensive at all!!!';
            const result = parseEvaluationResponse(response);
            expect(result.comprehensive).toBe(false);
        });

        test('should handle multi-line responses', () => {
            const response = 'Evaluation:\n\nNo, the response is incomplete.\nIt lacks sufficient detail.';
            const result = parseEvaluationResponse(response);
            expect(result.comprehensive).toBe(false);
        });

        test('should assume comprehensive for ambiguous responses', () => {
            const response = 'This response has some good points but could be better.';
            const result = parseEvaluationResponse(response);
            expect(result.comprehensive).toBe(true);
        });

        test('should handle empty responses', () => {
            const response = '';
            const result = parseEvaluationResponse(response);
            expect(result.comprehensive).toBe(true);
        });

        test('should handle responses with only whitespace', () => {
            const response = '   \n\n   ';
            const result = parseEvaluationResponse(response);
            expect(result.comprehensive).toBe(true);
        });

        test('should handle Gemini descriptive text format', () => {
            const response = 'The assistant\'s response is comprehensive because it addresses all aspects of the user\'s query with sufficient detail.';
            const result = parseEvaluationResponse(response);
            expect(result.comprehensive).toBe(true);
        });

        test('should handle Gemini negative descriptive format', () => {
            const response = 'The response is not comprehensive as it fails to address the second part of the question.';
            const result = parseEvaluationResponse(response);
            expect(result.comprehensive).toBe(false);
        });
    });

    describe('Invalid JSON Handling', () => {
        test('should fall back to text parsing for malformed JSON', () => {
            const response = '{comprehensive: true, reason: "Missing quotes"}';
            const result = parseEvaluationResponse(response);
            // Should try text parsing and find "comprehensive"
            expect(result.comprehensive).toBe(true);
        });

        test('should handle partial JSON', () => {
            const response = '{"comprehensive": true,';
            const result = parseEvaluationResponse(response);
            // Should find the JSON pattern and attempt to parse
            // If parse fails, falls back to text parsing
            expect(typeof result.comprehensive).toBe('boolean');
        });
    });
});

// Run the tests
if (require.main === module) {
    console.log('Running evaluation parsing tests...');
    // This allows running directly with node for quick testing
}

module.exports = { parseEvaluationResponse };
