/**
 * Prompt templates for content filtering
 * These prompts are used to check user input and LLM output for policy violations
 */

/**
 * Generate prompt for input filtering
 * @param {string} userInput - User's input to check
 * @param {string} modelId - Model ID to generate appropriate prompt format
 * @returns {string} Filtering prompt
 */
function getInputFilterPrompt(userInput, modelId = '') {
  // Use Llama Guard's native format for Llama Guard models
  if (modelId.includes('llama-guard')) {
    return `<|begin_of_text|><|start_header_id|>user<|end_header_id|>

Task: Check if there is unsafe content in 'User' messages in conversations according our safety policy with the below categories.

<BEGIN UNSAFE CONTENT CATEGORIES>
S1: Violent Crimes
S2: Non-Violent Crimes
S3: Sex Crimes
S4: Child Exploitation
S5: Defamation
S6: Specialized Advice
S7: Privacy
S8: Intellectual Property
S9: Indiscriminate Weapons
S10: Hate
S11: Self-Harm
S12: Sexual Content
S13: Elections
S14: Code Interpreter Abuse
<END UNSAFE CONTENT CATEGORIES>

<BEGIN CONVERSATION>

User: ${userInput}

<END CONVERSATION>

Provide your safety assessment for 'User' in the above conversation:
- First line must be 'safe' or 'unsafe'.
- If unsafe, second line must be a comma-separated list of violated categories. (e.g. 'S1,S3')<|eot_id|><|start_header_id|>assistant<|end_header_id|>`;
  }
  
  // VirtueGuard uses simple direct prompting
  if (modelId.includes('virtueguard')) {
    return userInput;
  }
  
  // JSON format for other models (Gemini, OpenAI, etc.)
  return `Analyze this user input for content policy violations.

User Input:
"""
${userInput}
"""

Respond with JSON only:
{"safe": true/false, "violations": ["category"], "reason": "explanation"}

Violation categories: Hate, Violence, Sexual Content, Self-Harm, Illegal Activities, Harassment`;
}

/**
 * Generate prompt for output filtering
 * @param {string} llmOutput - LLM's output to check
 * @param {string} modelId - Model ID to generate appropriate prompt format
 * @returns {string} Filtering prompt
 */
function getOutputFilterPrompt(llmOutput, modelId = '') {
  // Use Llama Guard's native format for Llama Guard models
  if (modelId.includes('llama-guard')) {
    return `<|begin_of_text|><|start_header_id|>user<|end_header_id|>

Task: Check if there is unsafe content in 'Agent' messages in conversations according our safety policy with the below categories.

<BEGIN UNSAFE CONTENT CATEGORIES>
S1: Violent Crimes
S2: Non-Violent Crimes
S3: Sex Crimes
S4: Child Exploitation
S5: Defamation
S6: Specialized Advice
S7: Privacy
S8: Intellectual Property
S9: Indiscriminate Weapons
S10: Hate
S11: Self-Harm
S12: Sexual Content
S13: Elections
S14: Code Interpreter Abuse
<END UNSAFE CONTENT CATEGORIES>

<BEGIN CONVERSATION>

Agent: ${llmOutput}

<END CONVERSATION>

Provide your safety assessment for 'Agent' in the above conversation:
- First line must be 'safe' or 'unsafe'.
- If unsafe, second line must be a comma-separated list of violated categories. (e.g. 'S1,S3')<|eot_id|><|start_header_id|>assistant<|end_header_id|>`;
  }
  
  // VirtueGuard uses simple direct prompting
  if (modelId.includes('virtueguard')) {
    return llmOutput;
  }
  
  // JSON format for other models (Gemini, OpenAI, etc.)
  return `Analyze this AI response for content policy violations.

AI Response:
"""
${llmOutput}
"""

Respond with JSON only:
{"safe": true/false, "violations": ["category"], "reason": "explanation"}

Violation categories: Hate, Violence, Sexual Content, Harmful Instructions, Misinformation, Harassment`;
}

module.exports = {
  getInputFilterPrompt,
  getOutputFilterPrompt
};
