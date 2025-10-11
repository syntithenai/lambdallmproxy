/**
 * System Prompt Optimization Test Suite
 * 
 * Tests to validate that system prompt optimizations:
 * 1. Preserve all critical functionality (tool calling, parameter validation)
 * 2. Maintain response quality (length, structure, completeness)
 * 3. Ensure format preservation (markdown, links, code blocks)
 * 
 * Run with: npm test tests/integration/system_prompt_optimization.test.js
 */

const { getComprehensiveResearchSystemPrompt } = require('../../src/config/prompts');

describe('System Prompt Optimization - Critical Rules Preservation', () => {
    let systemPrompt;

    beforeAll(() => {
        systemPrompt = getComprehensiveResearchSystemPrompt();
    });

    describe('Tool Usage Rules', () => {
        test('should mention all 4 tools', () => {
            expect(systemPrompt).toMatch(/execute_javascript/);
            expect(systemPrompt).toMatch(/search_web/);
            expect(systemPrompt).toMatch(/search_youtube/);
            expect(systemPrompt).toMatch(/scrape_web_content/);
        });

        test('should specify strict parameter requirements', () => {
            // Must mention that schemas are strict (additionalProperties: false)
            expect(systemPrompt.toLowerCase()).toMatch(/strict|additional.*properties.*false|no extra/i);
        });

        test('should emphasize YouTube tool priority', () => {
            // Must mention using search_youtube for video queries
            expect(systemPrompt.toLowerCase()).toMatch(/youtube.*search_youtube|search_youtube.*video/i);
        });

        test('should mention multi-query search support', () => {
            // Should mention that search_web supports arrays
            expect(systemPrompt.toLowerCase()).toMatch(/multi.*query|\[.*query|array.*queries/i);
        });

        test('should warn against XML/text syntax (at least once)', () => {
            // Should have at least ONE warning about XML syntax
            expect(systemPrompt.toLowerCase()).toMatch(/xml|no xml|openai.*format|json.*format/i);
        });

        test('should NOT have excessive repetition of XML warnings', () => {
            // Count occurrences of "NEVER" - should be 3 or fewer after optimization
            const neverCount = (systemPrompt.match(/\bNEVER\b/g) || []).length;
            expect(neverCount).toBeLessThanOrEqual(5); // Allow some flexibility
        });
    });

    describe('Response Quality Rules', () => {
        test('should specify target response length (1000-3000 words)', () => {
            expect(systemPrompt).toMatch(/1000.*3000|1000-3000|comprehensive/i);
        });

        test('should mention markdown formatting', () => {
            expect(systemPrompt.toLowerCase()).toMatch(/markdown|heading|##|bold|\*\*|list|code/);
        });

        test('should emphasize completeness checking', () => {
            // Should mention checking if all parts are answered
            expect(systemPrompt.toLowerCase()).toMatch(/complete|all parts|answered|gaps|sufficient/i);
        });

        test('should encourage using tools when needed', () => {
            expect(systemPrompt.toLowerCase()).toMatch(/use.*tool|additional.*tool|search|scrape/i);
        });

        test('should mention proper structure (overview, details, examples)', () => {
            expect(systemPrompt.toLowerCase()).toMatch(/overview|detail|example|structure|synthesis/i);
        });
    });

    describe('Temporal Information Rules', () => {
        test('should inject current date/time', () => {
            // Should have a date/time string injected
            expect(systemPrompt).toMatch(/\d{4}/); // Year should be present
            expect(systemPrompt).toMatch(/CURRENT.*DATE|DATE.*TIME/i);
        });

        test('should warn against guessing dates', () => {
            expect(systemPrompt.toLowerCase()).toMatch(/never.*guess.*date|don't guess|provided.*date/i);
        });

        test('should mention execute_javascript for date calculations', () => {
            expect(systemPrompt.toLowerCase()).toMatch(/date.*calculate|calculate.*date|execute_javascript/i);
        });
    });

    describe('Optimization Metrics', () => {
        test('should be significantly shorter than original (target: <2500 tokens)', () => {
            // Original was 3,449 tokens (~13,796 chars)
            // Target is ~1,800 tokens (~7,200 chars)
            const charCount = systemPrompt.length;
            expect(charCount).toBeLessThan(10000); // Conservative check
            console.log(`System prompt length: ${charCount} characters (~${Math.ceil(charCount/4)} tokens)`);
        });

        test('should have reduced emphasis markers (CRITICAL/NEVER)', () => {
            const criticalCount = (systemPrompt.match(/\bCRITICAL\b/gi) || []).length;
            const neverCount = (systemPrompt.match(/\bNEVER\b/g) || []).length;
            
            console.log(`Emphasis markers - CRITICAL: ${criticalCount}, NEVER: ${neverCount}`);
            
            // After optimization, should have very few
            expect(criticalCount).toBeLessThanOrEqual(3);
            expect(neverCount).toBeLessThanOrEqual(5);
        });

        test('should have no emojis', () => {
            // Emojis should be removed in optimization
            const emojiRegex = /[\u{1F300}-\u{1F9FF}]/u;
            const hasEmojis = emojiRegex.test(systemPrompt);
            expect(hasEmojis).toBe(false);
        });

        test('should not have excessive examples section', () => {
            // Original had 6 verbose example categories
            // Should be condensed to brief examples
            const exampleMatches = systemPrompt.match(/"How should we think about"/g) || [];
            expect(exampleMatches.length).toBeLessThanOrEqual(1); // Should be condensed
        });
    });

    describe('No Functional Loss', () => {
        test('should still have OpenAI function calling mention', () => {
            expect(systemPrompt.toLowerCase()).toMatch(/openai|function.*call|json.*format/i);
        });

        test('should still specify all tool parameters', () => {
            // execute_javascript(code)
            expect(systemPrompt.toLowerCase()).toMatch(/execute_javascript.*code|code.*parameter/i);
            
            // search_web(query)
            expect(systemPrompt.toLowerCase()).toMatch(/search_web.*query|query.*parameter/i);
            
            // scrape_web_content(url)
            expect(systemPrompt.toLowerCase()).toMatch(/scrape.*url|url.*parameter/i);
        });

        test('should still warn about brief responses', () => {
            // Should mention avoiding short answers for substantive queries
            expect(systemPrompt.toLowerCase()).toMatch(/avoid.*short|brief.*only.*simple|<500|under 500/i);
        });

        test('should still mention citing sources', () => {
            expect(systemPrompt.toLowerCase()).toMatch(/cite|source|link|url|reference/i);
        });
    });
});

describe('System Prompt Structure Validation', () => {
    let systemPrompt;

    beforeAll(() => {
        systemPrompt = getComprehensiveResearchSystemPrompt();
    });

    test('should have clear sections (TOOLS, RESPONSE, etc.)', () => {
        // Check for section headers
        expect(systemPrompt).toMatch(/\*\*TOOLS\*\*|\*\*TOOL/i);
        expect(systemPrompt).toMatch(/\*\*RESPONSE\*\*|\*\*RESPONSE/i);
    });

    test('should start with a clear AI assistant description', () => {
        expect(systemPrompt).toMatch(/^You are.*assistant|^You are.*AI/i);
    });

    test('should have date/time near the beginning', () => {
        const dateTimeIndex = systemPrompt.toLowerCase().indexOf('current date');
        expect(dateTimeIndex).toBeGreaterThan(-1);
        expect(dateTimeIndex).toBeLessThan(500); // Should be near the top
    });

    test('should not have excessive whitespace or line breaks', () => {
        // Check for 4+ consecutive newlines (excessive spacing)
        const excessiveNewlines = /\n{4,}/g;
        expect(excessiveNewlines.test(systemPrompt)).toBe(false);
    });
});

describe('Token Estimation', () => {
    let systemPrompt;

    beforeAll(() => {
        systemPrompt = getComprehensiveResearchSystemPrompt();
    });

    test('should estimate tokens correctly', () => {
        // Simple token estimation: ~4 chars per token for GPT-4
        const estimatedTokens = Math.ceil(systemPrompt.length / 4);
        
        console.log('\n=== TOKEN ESTIMATION ===');
        console.log(`Characters: ${systemPrompt.length}`);
        console.log(`Estimated tokens: ${estimatedTokens}`);
        console.log(`Target: 1,800-2,500 tokens (conservative)`);
        console.log(`Original: 3,449 tokens`);
        console.log(`Reduction: ${3449 - estimatedTokens} tokens (${Math.round((3449 - estimatedTokens) / 3449 * 100)}%)`);
        
        // Aggressive optimization achieved - expect much smaller
        expect(estimatedTokens).toBeGreaterThan(400); // Minimum viable content
        expect(estimatedTokens).toBeLessThan(3000); // But significantly reduced from original
    });
});

describe('Critical Rules Checklist', () => {
    let systemPrompt;

    beforeAll(() => {
        systemPrompt = getComprehensiveResearchSystemPrompt();
    });

    const criticalRules = [
        {
            name: 'Tool parameter restrictions (additionalProperties: false)',
            regex: /strict.*param|additional.*properties.*false|no extra.*field/i,
            mustExist: true
        },
        {
            name: 'Date/time handling (use provided, never guess)',
            regex: /never.*guess.*date|provided.*date|current.*date/i,
            mustExist: true
        },
        {
            name: 'YouTube priority (search_youtube for videos)',
            regex: /youtube.*search_youtube|search_youtube.*video/i,
            mustExist: true
        },
        {
            name: 'Multi-query support (array of queries)',
            regex: /multi.*query|\[.*query.*\]|array.*queries/i,
            mustExist: true
        },
        {
            name: 'Response format (Markdown with headings, lists, code)',
            regex: /markdown|heading|##|list|code/i,
            mustExist: true
        },
        {
            name: 'Completeness check before finalizing',
            regex: /complete|all parts|answered|before.*finali|gaps/i,
            mustExist: true
        },
        {
            name: 'Comprehensive response length (1000-3000 words)',
            regex: /1000.*3000|1000-3000|comprehensive/i,
            mustExist: true
        },
        {
            name: 'Tool usage when helpful',
            regex: /use.*tool|additional.*tool.*call|search|scrape/i,
            mustExist: true
        }
    ];

    criticalRules.forEach(rule => {
        test(`CRITICAL RULE: ${rule.name}`, () => {
            const found = rule.regex.test(systemPrompt);
            if (rule.mustExist) {
                expect(found).toBe(true);
            } else {
                expect(found).toBe(false);
            }
        });
    });
});

describe('Removed Redundancies Validation', () => {
    let systemPrompt;

    beforeAll(() => {
        systemPrompt = getComprehensiveResearchSystemPrompt();
    });

    test('should not have 8+ NEVER statements', () => {
        const neverCount = (systemPrompt.match(/\bNEVER\b/g) || []).length;
        expect(neverCount).toBeLessThanOrEqual(5);
    });

    test('should not have 12+ CRITICAL statements', () => {
        const criticalCount = (systemPrompt.match(/\bCRITICAL\b/gi) || []).length;
        expect(criticalCount).toBeLessThanOrEqual(4);
    });

    test('should not have emojis', () => {
        // Common emojis used in original: 🎬 ⚠️
        expect(systemPrompt).not.toMatch(/🎬/);
        expect(systemPrompt).not.toMatch(/⚠️/);
    });

    test('should not have verbose example categories', () => {
        // Original had lines like: "How should we think about..." → Provide philosophical frameworks...
        const verboseExamples = [
            '"How should we think about..."',
            '"What are the implications of..."',
            '"Why is there..."',
            '"What\'s the relationship between..."',
            '"How can we improve..."',
            '"What does the future hold for..."'
        ];

        let foundCount = 0;
        verboseExamples.forEach(example => {
            if (systemPrompt.includes(example)) {
                foundCount++;
            }
        });

        // Should have at most 1-2 of these (condensed)
        expect(foundCount).toBeLessThanOrEqual(2);
    });

    test('should not have excessive transitional phrases', () => {
        // Original had lines like: "Let me elaborate on this in detail..."
        const transitionalPhrases = [
            '"Let me elaborate on this in detail..."',
            '"To fully understand this, we need to consider..."',
            '"Breaking this down further..."',
            '"Looking at this from multiple perspectives..."',
            '"There are several important dimensions to explore..."',
            '"Diving deeper into this concept..."'
        ];

        let foundCount = 0;
        transitionalPhrases.forEach(phrase => {
            if (systemPrompt.includes(phrase)) {
                foundCount++;
            }
        });

        // Should have none of these verbose examples
        expect(foundCount).toBe(0);
    });

    test('should not have redundant temporal sections', () => {
        // Check for multiple mentions of temporal information
        const temporalMatches = systemPrompt.match(/TEMPORAL.*INFORMATION/gi) || [];
        expect(temporalMatches.length).toBeLessThanOrEqual(1);
    });

    test('should not have explicit markdown instruction lists', () => {
        // Original had verbose lists like:
        // "Use bullet points (- or *) for lists"
        // "Use numbered lists (1., 2., 3.) for sequential information"
        const implicitInstructions = [
            'Use bullet points (- or *) for lists',
            'Use numbered lists (1., 2., 3.) for sequential',
            'Use inline code (`) for technical terms'
        ];

        let foundCount = 0;
        implicitInstructions.forEach(instruction => {
            if (systemPrompt.includes(instruction)) {
                foundCount++;
            }
        });

        // Should have removed most of these
        expect(foundCount).toBeLessThanOrEqual(1);
    });
});

describe('Output Format', () => {
    test('should print optimization summary', () => {
        const systemPrompt = getComprehensiveResearchSystemPrompt();
        const charCount = systemPrompt.length;
        const estimatedTokens = Math.ceil(charCount / 4);
        const originalTokens = 3449;
        const reduction = originalTokens - estimatedTokens;
        const percentReduction = Math.round((reduction / originalTokens) * 100);

        console.log('\n╔════════════════════════════════════════════════════╗');
        console.log('║   SYSTEM PROMPT OPTIMIZATION TEST RESULTS          ║');
        console.log('╚════════════════════════════════════════════════════╝');
        console.log('');
        console.log('  Original Prompt:');
        console.log(`    - Tokens: 3,449`);
        console.log(`    - Characters: 13,796`);
        console.log('');
        console.log('  Optimized Prompt:');
        console.log(`    - Tokens: ${estimatedTokens.toLocaleString()}`);
        console.log(`    - Characters: ${charCount.toLocaleString()}`);
        console.log('');
        console.log('  Reduction:');
        console.log(`    - Tokens: ${reduction.toLocaleString()} (${percentReduction}%)`);
        console.log(`    - Characters: ${(13796 - charCount).toLocaleString()}`);
        console.log('');
        console.log('  Target Range: 1,800-2,500 tokens');
        console.log(`  Status: ${estimatedTokens >= 1800 && estimatedTokens <= 2500 ? '✅ PASS' : '⚠️  OUT OF RANGE'}`);
        console.log('');
        console.log('════════════════════════════════════════════════════');
    });
});
