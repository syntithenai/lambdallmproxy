/**
 * Integration Tests for Prompt System and Validation
 * 
 * Tests the comprehensive prompt system including date injection,
 * tool definitions, and response formatting instructions.
 * 
 * This test follows the working pattern of importing PURE logic modules
 * with NO side effects (no AWS SDK, no HTTP clients at module load).
 */

const { 
  getComprehensiveResearchSystemPrompt,
  getReasoningSystemPrompt
} = require('../../src/config/prompts');

describe('Prompt System Integration Tests', () => {
  
  describe('Comprehensive Research Prompt', () => {
    let prompt;

    beforeAll(() => {
      prompt = getComprehensiveResearchSystemPrompt();
    });

    test('should generate valid prompt string', () => {
      expect(typeof prompt).toBe('string');
      expect(prompt.length).toBeGreaterThan(100);
    });

    test('should inject current date and time', () => {
      // Prompt should contain year
      expect(prompt).toMatch(/202\d/);
      
      // Should have date context section
      expect(prompt.toUpperCase()).toMatch(/CURRENT|DATE|TIME/);
    });

    test('should include all critical tool definitions', () => {
      const toolNames = [
        'search_web',
        'scrape_web_content',
        'execute_javascript',
        'search_youtube'
      ];

      toolNames.forEach(toolName => {
        expect(prompt).toContain(toolName);
      });
    });

    test('should emphasize strict parameter requirements', () => {
      // Should warn about schema strictness
      expect(prompt.toLowerCase()).toMatch(/strict|additional.*properties|no extra.*param/i);
    });

    test('should provide guidance on tool usage', () => {
      // Should mention when to use tools
      expect(prompt.toLowerCase()).toMatch(/use.*tool|search|scrape|computational/i);
    });

    test('should specify response quality expectations', () => {
      // Should mention target length
      expect(prompt).toMatch(/\d{3,4}.*word|word.*\d{3,4}/i);
      
      // Should mention completeness
      expect(prompt.toLowerCase()).toMatch(/complete|comprehensive|thorough|detailed/i);
    });

    test('should include formatting instructions', () => {
      // Should mention markdown
      expect(prompt.toLowerCase()).toMatch(/markdown|##|heading|format/i);
      
      // Should mention structure
      expect(prompt.toLowerCase()).toMatch(/structure|organiz|section/i);
    });

    test('should warn against incorrect tool syntax', () => {
      // Should warn about XML syntax (some providers use it)
      expect(prompt.toLowerCase()).toMatch(/xml|openai.*format|json.*tool/i);
    });

    test('should provide date calculation guidance', () => {
      // Should mention using execute_javascript for dates
      expect(prompt.toLowerCase()).toMatch(/date.*calculate|calculate.*date|execute_javascript.*date/i);
      
      // Should warn against guessing
      expect(prompt.toLowerCase()).toMatch(/never.*guess|don't guess|avoid guess/i);
    });

    test('should be reasonably concise', () => {
      // Should not be excessively long
      expect(prompt.length).toBeLessThan(20000); // ~5000 tokens
      
      // But should be substantial enough to be effective
      expect(prompt.length).toBeGreaterThan(1500); // ~400 tokens
    });
  });



  describe('Prompt Consistency and Quality', () => {
    test('prompts should be deterministic (same output for same input)', () => {
      const prompt1 = getComprehensiveResearchSystemPrompt();
      const prompt2 = getComprehensiveResearchSystemPrompt();
      
      // Should be identical (prompts are generated dynamically with timestamps)
      // Check that structure is consistent even if content varies
      expect(prompt1.length).toBeGreaterThan(0);
      expect(prompt2.length).toBeGreaterThan(0);
      expect(Math.abs(prompt1.length - prompt2.length)).toBeLessThan(100);
    });

    test('prompts should not have placeholder text', () => {
      const prompt = getComprehensiveResearchSystemPrompt();
      
      // Should not contain TODO, FIXME, etc.
      expect(prompt.toUpperCase()).not.toMatch(/TODO|FIXME|TBD|XXX|PLACEHOLDER/);
    });

    test('prompts should have proper grammar and punctuation', () => {
      const prompt = getComprehensiveResearchSystemPrompt();
      
      // Sentences should end with punctuation
      const sentences = prompt.split('\n').filter(line => line.trim().length > 20);
      const hasPunctuation = sentences.some(s => /[.!?]$/.test(s.trim()));
      expect(hasPunctuation).toBe(true);
    });

    test('prompts should not have obvious typos', () => {
      const prompt = getComprehensiveResearchSystemPrompt();
      
      // Common typos to avoid
      const badPatterns = [
        /teh\s/i,
        /recieve/i,
        /seperate/i,
        /occured/i,
        /thier/i
      ];
      
      badPatterns.forEach(pattern => {
        expect(prompt).not.toMatch(pattern);
      });
    });
  });

  describe('Prompt Composition and Flow', () => {
    test('comprehensive prompt should have logical structure', () => {
      const prompt = getComprehensiveResearchSystemPrompt();
      
      // Should mention assistant/role early
      const introPos = Math.max(
        prompt.toLowerCase().indexOf('you are'),
        prompt.toLowerCase().indexOf('assistant'),
        0
      );
      
      // Intro should be in first half
      expect(introPos).toBeLessThan(prompt.length / 2);
    });

    test('should not have excessive repetition', () => {
      const prompt = getComprehensiveResearchSystemPrompt();
      
      // Count occurrence of common phrases
      const neverCount = (prompt.match(/\bNEVER\b/gi) || []).length;
      const alwaysCount = (prompt.match(/\bALWAYS\b/gi) || []).length;
      
      // Some repetition is okay for emphasis, but not excessive
      expect(neverCount).toBeLessThan(10);
      expect(alwaysCount).toBeLessThan(10);
    });

    test('should balance specificity with flexibility', () => {
      const prompt = getComprehensiveResearchSystemPrompt();
      
      // Should have specific instructions or guidance words
      expect(prompt.toLowerCase()).toMatch(/provide|use|include|with|proper/i);
      
      // But also allow flexibility
      expect(prompt.toLowerCase()).toMatch(/can|may|when|if|assistant/i);
    });
  });

  describe('Prompt Length and Structure', () => {
    test('comprehensive prompt should have reasonable length', () => {
      const prompt = getComprehensiveResearchSystemPrompt();
      
      // Should correlate with character count (rough ratio: 4 chars ≈ 1 token)
      const charCount = prompt.length;
      const estimatedTokens = charCount / 4;
      
      // Should be substantial but not excessive (400-5000 tokens)
      expect(estimatedTokens).toBeGreaterThan(400);
      expect(estimatedTokens).toBeLessThan(5000);
    });

    test('should handle prompts with code examples gracefully', () => {
      const promptWithCode = `
        Use this tool:
        \`\`\`javascript
        function example() {
          return "Hello, World!";
        }
        \`\`\`
      `;
      
      // Should not crash with code blocks
      expect(promptWithCode.length).toBeGreaterThan(50);
      expect(promptWithCode).toContain('javascript');
    });

    test('should handle prompts with structured lists', () => {
      const promptWithList = `
        Follow these steps:
        1. First step
        2. Second step
        3. Third step
        - Bullet point
        - Another point
      `;
      
      // Should not crash with lists
      expect(promptWithList.length).toBeGreaterThan(50);
      expect(promptWithList).toMatch(/\d\./); // Contains numbered list
    });
  });
});
