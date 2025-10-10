const { getComprehensiveResearchSystemPrompt } = require('../../src/config/prompts');

describe('config/prompts', () => {
  test('includes JSON tool call enforcement rule', () => {
    const prompt = getComprehensiveResearchSystemPrompt();
    expect(prompt).toMatch(/You MUST respond by invoking an approved tool with valid JSON arguments/i);
    expect(prompt).toMatch(/no plain-text or XML-style tool syntax is allowed/i);
  });
});
