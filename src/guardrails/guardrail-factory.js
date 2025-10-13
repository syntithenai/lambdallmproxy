/**
 * Factory for creating guardrail validator instances
 * Uses existing provider infrastructure to call LLM APIs for content filtering
 */

const { createProvider } = require('../providers/provider-factory');
const { getInputFilterPrompt, getOutputFilterPrompt } = require('./prompts');

/**
 * Get API key for a provider from context or environment
 * Supports both new indexed format and legacy environment variables
 * @param {string} provider - Provider name
 * @param {Object} context - Request context
 * @returns {string|null} API key or null if not found
 */
function getProviderApiKey(provider, context = {}) {
  const providerLower = provider.toLowerCase();
  
  // Map of provider names to context keys
  const contextKeyMap = {
    'openai': 'openaiApiKey',
    'anthropic': 'anthropicApiKey',
    'groq': 'groqApiKey',
    'groq-free': 'groqApiKey',
    'gemini': 'geminiApiKey',
    'gemini-free': 'geminiApiKey',
    'together': 'togetherApiKey',
    'replicate': 'replicateApiKey',
    'atlascloud': 'atlascloudApiKey'
  };
  
  // Check context first (from UI)
  const contextKey = contextKeyMap[providerLower];
  if (contextKey && context[contextKey]) {
    return context[contextKey];
  }
  
  // Check new indexed format (LLAMDA_LLM_PROXY_PROVIDER_*)
  let index = 0;
  while (true) {
    const typeVar = `LLAMDA_LLM_PROXY_PROVIDER_TYPE_${index}`;
    const keyVar = `LLAMDA_LLM_PROXY_PROVIDER_KEY_${index}`;
    
    const providerType = process.env[typeVar];
    const providerKey = process.env[keyVar];
    
    if (!providerType) break; // No more providers
    
    if (providerType.toLowerCase() === providerLower && providerKey) {
      return providerKey;
    }
    
    index++;
  }
  
  // Fallback to legacy environment variables
  const envVarMap = {
    'openai': 'OPENAI_API_KEY',
    'anthropic': 'ANTHROPIC_API_KEY',
    'groq': 'GROQ_API_KEY',
    'groq-free': 'GROQ_API_KEY',
    'gemini': 'GEMINI_API_KEY',
    'gemini-free': 'GEMINI_API_KEY',
    'together': 'TOGETHER_API_KEY',
    'replicate': 'REPLICATE_API_TOKEN',
    'atlascloud': 'ATLASCLOUD_API_KEY'
  };
  
  const envVar = envVarMap[providerLower];
  if (envVar) {
    return process.env[envVar] || null;
  }
  
  return null;
}

/**
 * Create a guardrail validator
 * @param {Object} config - Guardrail configuration
 * @param {Object} context - Request context (for API keys)
 * @returns {Object} Guardrail validator instance
 */
function createGuardrailValidator(config, context = {}) {
  if (!config || !config.enabled) {
    return null;
  }
  
  // Get API key for provider
  const apiKey = getProviderApiKey(config.provider, context);
  
  if (!apiKey) {
    throw new Error(
      `Cannot create guardrail validator: No API key found for provider "${config.provider}". ` +
      `Please configure the provider in environment variables or pass API key in request context.`
    );
  }
  
  // Create provider instance for guardrail calls
  const providerConfig = {
    id: 'guardrail',
    type: config.provider,
    apiKey: apiKey,
    source: 'guardrail'
  };
  
  const provider = createProvider(providerConfig);
  console.log(`🛡️ Created guardrail validator using ${config.provider}`);
  
  return {
    /**
     * Check if user input is safe
     * @param {string} input - User input to check
     * @returns {Promise<Object>} Validation result with cost tracking
     */
    async validateInput(input) {
      const startTime = Date.now();
      const prompt = getInputFilterPrompt(input);
      
      console.log(`🛡️ Validating input (${input.length} chars) with ${config.inputModel}...`);
      
      try {
        const response = await provider.createChatCompletion({
          model: config.inputModel,
          messages: [
            { role: 'user', content: prompt }
          ],
          temperature: 0,
          max_tokens: 500
        });
        
        const endTime = Date.now();
        const duration = (endTime - startTime) / 1000;
        
        // Parse JSON response
        const content = response.choices[0].message.content.trim();
        
        // Try to extract JSON if wrapped in markdown code blocks
        let jsonContent = content;
        if (content.startsWith('```')) {
          const jsonMatch = content.match(/```(?:json)?\s*(\{[\s\S]*\})\s*```/);
          if (jsonMatch) {
            jsonContent = jsonMatch[1];
          }
        }
        
        const result = JSON.parse(jsonContent);
        
        // Track cost
        const promptTokens = response.usage?.prompt_tokens || 0;
        const completionTokens = response.usage?.completion_tokens || 0;
        
        console.log(`🛡️ Input validation: ${result.safe ? '✅ SAFE' : '❌ UNSAFE'} (${duration.toFixed(2)}s, ${promptTokens + completionTokens} tokens)`);
        if (!result.safe) {
          console.log(`🛡️ Violations: ${result.violations?.join(', ')}`, `Reason: ${result.reason}`);
        }
        
        return {
          safe: result.safe,
          violations: result.violations || [],
          reason: result.reason || '',
          suggestedRevision: result.suggested_revision || null,
          tracking: {
            type: 'guardrail_input',
            model: config.inputModel,
            provider: config.provider,
            promptTokens,
            completionTokens,
            duration
          }
        };
      } catch (error) {
        console.error('🛡️ Guardrail input validation error:', error.message);
        // Fail safe: if guardrail fails, block content
        return {
          safe: false,
          violations: ['system_error'],
          reason: `Content moderation system error: ${error.message}`,
          suggestedRevision: null,
          tracking: {
            type: 'guardrail_input',
            model: config.inputModel,
            provider: config.provider,
            error: error.message,
            duration: (Date.now() - startTime) / 1000
          }
        };
      }
    },
    
    /**
     * Check if LLM output is safe
     * @param {string} output - LLM output to check
     * @returns {Promise<Object>} Validation result with cost tracking
     */
    async validateOutput(output) {
      const startTime = Date.now();
      const prompt = getOutputFilterPrompt(output);
      
      console.log(`🛡️ Validating output (${output.length} chars) with ${config.outputModel}...`);
      
      try {
        const response = await provider.createChatCompletion({
          model: config.outputModel,
          messages: [
            { role: 'user', content: prompt }
          ],
          temperature: 0,
          max_tokens: 300
        });
        
        const endTime = Date.now();
        const duration = (endTime - startTime) / 1000;
        
        // Parse JSON response
        const content = response.choices[0].message.content.trim();
        
        // Try to extract JSON if wrapped in markdown code blocks
        let jsonContent = content;
        if (content.startsWith('```')) {
          const jsonMatch = content.match(/```(?:json)?\s*(\{[\s\S]*\})\s*```/);
          if (jsonMatch) {
            jsonContent = jsonMatch[1];
          }
        }
        
        const result = JSON.parse(jsonContent);
        
        // Track cost
        const promptTokens = response.usage?.prompt_tokens || 0;
        const completionTokens = response.usage?.completion_tokens || 0;
        
        console.log(`🛡️ Output validation: ${result.safe ? '✅ SAFE' : '❌ UNSAFE'} (${duration.toFixed(2)}s, ${promptTokens + completionTokens} tokens)`);
        if (!result.safe) {
          console.log(`🛡️ Violations: ${result.violations?.join(', ')}`, `Reason: ${result.reason}`);
        }
        
        return {
          safe: result.safe,
          violations: result.violations || [],
          reason: result.reason || '',
          tracking: {
            type: 'guardrail_output',
            model: config.outputModel,
            provider: config.provider,
            promptTokens,
            completionTokens,
            duration
          }
        };
      } catch (error) {
        console.error('🛡️ Guardrail output validation error:', error.message);
        // Fail safe: if guardrail fails, block content
        return {
          safe: false,
          violations: ['system_error'],
          reason: `Content moderation system error: ${error.message}`,
          tracking: {
            type: 'guardrail_output',
            model: config.outputModel,
            provider: config.provider,
            error: error.message,
            duration: (Date.now() - startTime) / 1000
          }
        };
      }
    }
  };
}

module.exports = {
  createGuardrailValidator,
  getProviderApiKey
};
