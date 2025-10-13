const { getComprehensiveResearchSystemPrompt } = require('../../src/config/prompts');

describe('config/prompts', () => {
  test('includes JSON tool call enforcement rule', () => {
    const prompt = getComprehensiveResearchSystemPrompt();
    expect(prompt).toMatch(/OpenAI JSON format only/i);
    expect(prompt).toMatch(/no XML/i);
  });
});
