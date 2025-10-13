/**
 * Prompt templates for content filtering
 * These prompts are used to check user input and LLM output for policy violations
 */

/**
 * Generate prompt for input filtering
 * @param {string} userInput - User's input to check
 * @returns {string} Filtering prompt
 */
function getInputFilterPrompt(userInput) {
  return `You are a content moderation assistant. Analyze the following user input and determine if it violates content policies.

Check for:
- Hate speech or discriminatory content
- Violence or threats
- Sexual or explicit content
- Self-harm or dangerous activities
- Illegal activities
- Spam or malicious content

User Input:
"""
${userInput}
"""

Respond ONLY with a JSON object in this exact format:
{
  "safe": true,
  "violations": [],
  "reason": "",
  "suggested_revision": ""
}

OR if unsafe:
{
  "safe": false,
  "violations": ["category1", "category2"],
  "reason": "brief explanation of what violates policy",
  "suggested_revision": "safer version of the input that complies with policies"
}

Important: Your response must be ONLY the JSON object, nothing else.`;
}

/**
 * Generate prompt for output filtering
 * @param {string} llmOutput - LLM's output to check
 * @returns {string} Filtering prompt
 */
function getOutputFilterPrompt(llmOutput) {
  return `You are a content moderation assistant. Analyze the following AI-generated response and determine if it violates content policies.

Check for:
- Hate speech or discriminatory content
- Violence or graphic descriptions
- Sexual or explicit content
- Instructions for harmful/illegal activities
- Misinformation or dangerous advice
- Personal attacks or harassment

AI Response:
"""
${llmOutput}
"""

Respond ONLY with a JSON object in this exact format:
{
  "safe": true,
  "violations": [],
  "reason": ""
}

OR if unsafe:
{
  "safe": false,
  "violations": ["category1", "category2"],
  "reason": "brief explanation of what violates policy"
}

Important: Your response must be ONLY the JSON object, nothing else.`;
}

module.exports = {
  getInputFilterPrompt,
  getOutputFilterPrompt
};
