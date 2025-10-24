/**
 * Factory for creating guardrail validator instances
 * Uses existing provider infrastructure to call LLM APIs for content filtering
 */

const { createProvider } = require('../providers/provider-factory');
const { getInputFilterPrompt, getOutputFilterPrompt } = require('./prompts');

/**
 * Llama Guard safety category labels
 */
const SAFETY_CATEGORIES = {
  'S1': 'Violent Crimes',
  'S2': 'Non-Violent Crimes',
  'S3': 'Sex Crimes',
  'S4': 'Child Exploitation',
  'S5': 'Defamation',
  'S6': 'Specialized Advice',
  'S7': 'Privacy',
  'S8': 'Intellectual Property',
  'S9': 'Indiscriminate Weapons',
  'S10': 'Hate',
  'S11': 'Self-Harm',
  'S12': 'Sexual Content',
  'S13': 'Elections',
  'S14': 'Code Interpreter Abuse'
};

/**
 * Get API key for a provider from context or indexed environment variables
 * Only supports indexed format (LP_*) for guardrails
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
  
  // Check indexed format (LP_*) - ONLY source for guardrails
  let index = 0;
  while (true) {
    const typeVar = `LP_TYPE_${index}`;
    const keyVar = `LP_KEY_${index}`;
    
    const providerType = process.env[typeVar];
    const providerKey = process.env[keyVar];
    
    if (!providerType) break; // No more providers
    
    if (providerType.toLowerCase() === providerLower && providerKey) {
      return providerKey;
    }
    
    index++;
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
      const prompt = getInputFilterPrompt(input, config.inputModel);
      
      console.log(`🛡️ Validating input (${input.length} chars) with ${config.inputModel}...`);
      
      try {
        const response = await provider.makeRequest([
          { role: 'user', content: prompt }
        ], {
          model: config.inputModel,
          temperature: 0,
          max_tokens: 500
        });
        
        const endTime = Date.now();
        const duration = (endTime - startTime) / 1000;
        
        // Parse response - handle both Llama Guard format and JSON format
        const content = response.choices[0].message.content.trim();
        let result;
        
        // Check if using Llama Guard model (native format)
        if (config.inputModel.includes('llama-guard')) {
          // Llama Guard returns: "safe" or "unsafe\nS1,S3"
          const lines = content.split('\n');
          const isSafe = lines[0].toLowerCase() === 'safe';
          const violations = [];
          
          if (!isSafe && lines.length > 1) {
            // Parse violation categories (S1, S2, etc.)
            const categories = lines[1].split(',').map(v => v.trim());
            violations.push(...categories);
          }
          
          // Convert violation codes to human-readable labels
          const violationLabels = violations.map(code => SAFETY_CATEGORIES[code] || code);
          
          result = {
            safe: isSafe,
            violations: violations,
            reason: isSafe ? '' : `Flagged: ${violationLabels.join(', ')}`,
            suggested_revision: null
          };
        } else if (config.inputModel.includes('virtueguard')) {
          // VirtueGuard returns JSON: {"is_safe": true/false, "violation_categories": [...], "safety_score": 0.95}
          let jsonContent = content;
          if (content.startsWith('```')) {
            const jsonMatch = content.match(/```(?:json)?\s*(\{[\s\S]*\})\s*```/);
            if (jsonMatch) {
              jsonContent = jsonMatch[1];
            }
          }
          const virtueResult = JSON.parse(jsonContent);
          
          result = {
            safe: virtueResult.is_safe !== false,
            violations: virtueResult.violation_categories || [],
            reason: virtueResult.is_safe ? '' : `Flagged: ${(virtueResult.violation_categories || []).join(', ')}`,
            suggested_revision: null
          };
        } else {
          // Standard JSON format for other models
          let jsonContent = content;
          if (content.startsWith('```')) {
            const jsonMatch = content.match(/```(?:json)?\s*(\{[\s\S]*\})\s*```/);
            if (jsonMatch) {
              jsonContent = jsonMatch[1];
            }
          }
          result = JSON.parse(jsonContent);
        }
        
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
          reason: `Moderation error: ${error.message}`,
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
      const prompt = getOutputFilterPrompt(output, config.outputModel);
      
      console.log(`🛡️ Validating output (${output.length} chars) with ${config.outputModel}...`);
      
      try {
        const response = await provider.makeRequest([
          { role: 'user', content: prompt }
        ], {
          model: config.outputModel,
          temperature: 0,
          max_tokens: 300
        });
        
        const endTime = Date.now();
        const duration = (endTime - startTime) / 1000;
        
        // Parse response - handle both Llama Guard format and JSON format
        const content = response.choices[0].message.content.trim();
        let result;
        
        // Check if using Llama Guard model (native format)
        if (config.outputModel.includes('llama-guard')) {
          // Llama Guard returns: "safe" or "unsafe\nS1,S3"
          const lines = content.split('\n');
          const isSafe = lines[0].toLowerCase() === 'safe';
          const violations = [];
          
          if (!isSafe && lines.length > 1) {
            // Parse violation categories (S1, S2, etc.)
            const categories = lines[1].split(',').map(v => v.trim());
            violations.push(...categories);
          }
          
          // Convert violation codes to human-readable labels
          const violationLabels = violations.map(code => SAFETY_CATEGORIES[code] || code);
          
          result = {
            safe: isSafe,
            violations: violations,
            reason: isSafe ? '' : `Flagged: ${violationLabels.join(', ')}`
          };
        } else if (config.outputModel.includes('virtueguard')) {
          // VirtueGuard returns JSON: {"is_safe": true/false, "violation_categories": [...], "safety_score": 0.95}
          let jsonContent = content;
          if (content.startsWith('```')) {
            const jsonMatch = content.match(/```(?:json)?\s*(\{[\s\S]*\})\s*```/);
            if (jsonMatch) {
              jsonContent = jsonMatch[1];
            }
          }
          const virtueResult = JSON.parse(jsonContent);
          
          result = {
            safe: virtueResult.is_safe !== false,
            violations: virtueResult.violation_categories || [],
            reason: virtueResult.is_safe ? '' : `Flagged: ${(virtueResult.violation_categories || []).join(', ')}`
          };
        } else {
          // Standard JSON format for other models
          let jsonContent = content;
          if (content.startsWith('```')) {
            const jsonMatch = content.match(/```(?:json)?\s*(\{[\s\S]*\})\s*```/);
            if (jsonMatch) {
              jsonContent = jsonMatch[1];
            }
          }
          result = JSON.parse(jsonContent);
        }
        
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
          reason: `Moderation error: ${error.message}`,
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
