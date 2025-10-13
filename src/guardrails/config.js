/**
 * Content Guardrails Configuration
 * Loads and validates environment variables for guardrail filtering
 */

/**
 * Load guardrail configuration from environment variables
 * @returns {Object|null} Configuration object or null if disabled
 * @throws {Error} If enabled but misconfigured
 */
function loadGuardrailConfig() {
  const enabled = process.env.ENABLE_GUARDRAILS === 'true';
  
  if (!enabled) {
    console.log('🛡️ Content guardrails: DISABLED');
    return null;
  }
  
  const provider = process.env.GUARDRAIL_PROVIDER;
  const inputModel = process.env.GUARDRAIL_INPUT_MODEL;
  const outputModel = process.env.GUARDRAIL_OUTPUT_MODEL;
  
  // Validation
  const errors = [];
  if (!provider) errors.push('GUARDRAIL_PROVIDER not set');
  if (!inputModel) errors.push('GUARDRAIL_INPUT_MODEL not set');
  if (!outputModel) errors.push('GUARDRAIL_OUTPUT_MODEL not set');
  
  if (errors.length > 0) {
    throw new Error(
      `Content guardrails configuration invalid: ${errors.join(', ')}. ` +
      `Either set ENABLE_GUARDRAILS=false or provide all required variables.`
    );
  }
  
  const config = {
    enabled: true,
    provider,
    inputModel,
    outputModel,
    strictness: process.env.GUARDRAIL_STRICTNESS || 'moderate'
  };
  
  console.log('🛡️ Content guardrails: ENABLED', {
    provider: config.provider,
    inputModel: config.inputModel,
    outputModel: config.outputModel
  });
  
  return config;
}

/**
 * Validate that guardrail provider has required API key
 * Supports any provider configured in the system (OpenAI, Anthropic, Groq, Gemini, etc.)
 * @param {string} provider - Provider name
 * @param {Object} context - Request context with API keys from UI or env
 * @returns {boolean} True if provider available
 * @throws {Error} If provider not available
 */
function validateGuardrailProvider(provider, context = {}) {
  // Map of provider names to their environment variable names
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
  
  // Map of provider names to their context key names
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
  
  const providerLower = provider.toLowerCase();
  
  // Check context first (from UI)
  const contextKey = contextKeyMap[providerLower];
  if (contextKey && context[contextKey]) {
    console.log(`🛡️ Guardrail provider "${provider}" available from context`);
    return true;
  }
  
  // Check new indexed format (LLAMDA_LLM_PROXY_PROVIDER_*)
  // Look through all indexed providers
  let index = 0;
  while (true) {
    const typeVar = `LLAMDA_LLM_PROXY_PROVIDER_TYPE_${index}`;
    const keyVar = `LLAMDA_LLM_PROXY_PROVIDER_KEY_${index}`;
    
    const providerType = process.env[typeVar];
    const providerKey = process.env[keyVar];
    
    if (!providerType) break; // No more providers
    
    // Check if this indexed provider matches our guardrail provider
    if (providerType.toLowerCase() === providerLower && providerKey && providerKey.trim().length > 0) {
      console.log(`🛡️ Guardrail provider "${provider}" available from indexed provider ${index}`);
      return true;
    }
    
    index++;
  }
  
  // Fallback to environment variables (legacy format)
  const envVar = envVarMap[providerLower];
  if (envVar) {
    const apiKey = process.env[envVar];
    if (apiKey && apiKey.trim().length > 0) {
      console.log(`🛡️ Guardrail provider "${provider}" available from env var ${envVar}`);
      return true;
    }
  }
  
  // Provider not available
  throw new Error(
    `Content moderation is required for this application but is currently unavailable. ` +
    `The configured guardrail provider "${provider}" does not have an API key configured. ` +
    `Please contact the administrator to configure content filtering.`
  );
}

module.exports = {
  loadGuardrailConfig,
  validateGuardrailProvider
};
