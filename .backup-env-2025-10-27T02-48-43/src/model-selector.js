/**
 * Model selection utility for Groq models
 * Selects the optimal model based on query complexity, reasoning requirements, and token limits
 *
 * Features:
 * - Intelligent model scoring based on query complexity, reasoning needs, and token limits
 * - Vision model preference when image data is detected in prompts
 * - API availability checking to ensure selected models are actually accessible
 * - Graceful fallback to configured models if API check fails
 */

const { GROQ_RATE_LIMITS } = require('./groq-rate-limits');
const { loadEnvironmentProviders } = require('./credential-pool');
const https = require('https');

/**
 * Models that appear in the API but don't actually work (403/404 errors)
 * These models will be filtered out from the available models list
 */
// Blacklisted models that appear in the API but don't actually work
const BLACKLISTED_MODELS = new Set([
  'allam-2-7b',  // Returns 404 "model does not exist" despite being in API list
  'meta-llama/llama-4-scout-17b-16e-instruct',  // Returns 403/404 "does not exist or no access"
  'meta-llama/llama-guard-4-12b'  // Returns "does not exist or no access"
]);

/**
 * Fetch available models from Groq API
 * @returns {Promise<Set<string>>} - Set of available model IDs
 */
async function fetchAvailableModels() {
  return new Promise((resolve, reject) => {
    // Get Groq API key from environment providers
    const envProviders = loadEnvironmentProviders();
    const groqProvider = envProviders.find(p => p.type === 'groq' || p.type === 'groq-free');
    const groqApiKey = groqProvider?.apiKey;
    
    if (!groqApiKey) {
      console.warn('⚠️ No Groq provider configured, cannot fetch available models');
      resolve(new Set());
      return;
    }
    
    const options = {
      hostname: 'api.groq.com',
      path: '/openai/v1/models',
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${groqApiKey}`,
        'Content-Type': 'application/json'
      }
    };

    const req = https.request(options, (res) => {
      let data = '';

      res.on('data', (chunk) => {
        data += chunk;
      });

      res.on('end', () => {
        try {
          const response = JSON.parse(data);
          if (response.data && Array.isArray(response.data)) {
            // Filter out blacklisted models
            const availableModels = new Set(
              response.data
                .map(model => model.id)
                .filter(id => !BLACKLISTED_MODELS.has(id))
            );
            console.log(`Successfully fetched ${availableModels.size} available models from Groq API (${response.data.length - availableModels.size} blacklisted)`);
            resolve(availableModels);
          } else if (response.error) {
            console.warn('Groq API returned error:', response.error.message, '- falling back to all configured models');
            resolve(new Set(Object.keys(GROQ_RATE_LIMITS)));
          } else {
            console.warn('Unexpected API response format, falling back to all configured models');
            resolve(new Set(Object.keys(GROQ_RATE_LIMITS)));
          }
        } catch (error) {
          console.warn('Failed to parse API response, falling back to all configured models:', error.message);
          resolve(new Set(Object.keys(GROQ_RATE_LIMITS)));
        }
      });
    });

    req.on('error', (error) => {
      console.warn('Failed to fetch available models, falling back to all configured models:', error.message);
      resolve(new Set(Object.keys(GROQ_RATE_LIMITS)));
    });

    req.setTimeout(5000, () => {
      console.warn('Model availability check timed out, falling back to all configured models');
      req.destroy();
      resolve(new Set(Object.keys(GROQ_RATE_LIMITS)));
    });

    req.end();
  });
}

/**
 * Analyze query complexity based on content
 * @param {string} query - The user query
 * @returns {string} - 'simple', 'moderate', 'complex'
 */
function analyzeQueryComplexity(query) {
  if (!query || typeof query !== 'string') return 'moderate';

  const lowerQuery = query.toLowerCase();
  const wordCount = query.split(' ').length;
  const charCount = query.length;

  // Simple queries: basic questions, calculations, short definitions
  if ((lowerQuery.match(/\b(what is|who is|when is|where is|how many|calculate|define|spell)\b/) && wordCount < 15) ||
      charCount < 50 ||
      wordCount < 8 ||
      /^\d+[\s\d+*=/-]*\d+$/.test(lowerQuery)) { // Simple math
    return 'simple';
  }

  // Complex queries: analysis, reasoning, multi-step tasks, research, long explanations
  if (lowerQuery.match(/\b(analyze|explain|compare|evaluate|research|synthesis|strategy|design|optimize|critique|assess|investigate|explore|comprehensive|detailed)\b/) ||
      charCount > 150 ||
      wordCount > 25 ||
      (lowerQuery.includes('?') && lowerQuery.split('?').length > 2) || // Multiple questions
      lowerQuery.match(/\b(and|or|but|however|therefore|consequently|moreover|furthermore)\b/) || // Complex connectors
      lowerQuery.match(/\b(economic|scientific|technical|political|social|historical)\b.*\b(impact|effect|influence|consequence)\b/)) { // Domain analysis
    return 'complex';
  }

  return 'moderate';
}

/**
 * Map reasoning level to model capability requirements
 * @param {string} reasoningLevel - 'basic', 'intermediate', 'advanced'
 * @returns {string} - Required reasoning capability
 */
function mapReasoningLevel(reasoningLevel) {
  const validLevels = ['basic', 'intermediate', 'advanced'];
  if (!validLevels.includes(reasoningLevel)) {
    return 'intermediate'; // Default
  }
  return reasoningLevel;
}

/**
 * Detect if the prompt contains image data
 * @param {Object|string} prompt - The full prompt object or string sent to Groq API
 * @returns {boolean} - True if image data is detected
 */
function detectImageData(prompt) {
  if (!prompt) return false;

  // If prompt is a string, only check for very specific image-related patterns that indicate actual image processing
  if (typeof prompt === 'string') {
    const lowerPrompt = prompt.toLowerCase();
    // Only detect if it seems like actual image analysis/processing, not just mentioning images
    return (lowerPrompt.includes('describe what you see') ||
            lowerPrompt.includes('analyze this image') ||
            lowerPrompt.includes('what is in this image') ||
            lowerPrompt.includes('image_url') ||
            lowerPrompt.includes('image data')) &&
           (lowerPrompt.includes('image') || lowerPrompt.includes('picture') || lowerPrompt.includes('photo'));
  }

  // If prompt is an object (JSON structure), check for image_url or similar fields
  if (typeof prompt === 'object') {
    // Check messages array for image content
    if (prompt.messages && Array.isArray(prompt.messages)) {
      return prompt.messages.some(message => {
        if (message.content && Array.isArray(message.content)) {
          return message.content.some(content => content.type === 'image_url' || content.image_url);
        }
        return false;
      });
    }

    // Check for image-related fields in the prompt object
    return !!(prompt.image_url || prompt.images);
  }

  return false;
}

const DEFAULT_FALLBACK_PRIORITY = [
  'llama-3.1-8b-instant',
  'llama-3.3-70b-versatile',
  'mixtral-8x7b-32768'
];

/**
 * Select the optimal Groq model based on query, reasoning level, token limit, and prompt content
 * @param {string} query - The user query text
 * @param {string|Array} reasoningLevel - 'basic', 'intermediate', 'advanced'
 * @param {number} tokenLimit - Maximum tokens allowed for the response
 * @param {Object|string} fullPrompt - The full prompt object/structure sent to Groq API (optional)
 * @param {Object} options - Additional selection options
 * @param {Array<string>} options.excludeModels - List of models that should not be selected (with or without provider prefix)
 * @param {Array<string>} options.preferredFallbacks - Priority list of fallback models
 * @param {Set<string>} options.availableModels - Pre-fetched set of available model IDs
 * @returns {Promise<string>} - Selected model name (e.g., 'groq:llama-3.1-8b-instant')
 */
async function selectModel(query, reasoningLevel = 'intermediate', tokenLimit = 4000, fullPrompt = null, options = {}) {
  const {
    excludeModels = [],
    preferredFallbacks = [],
    availableModels = null
  } = options || {};

  const excludedModels = new Set(
    (Array.isArray(excludeModels) ? excludeModels : [])
      .filter(Boolean)
      .map(model => model.replace(/^groq:/, ''))
  );

  const fallbackPriority = (Array.isArray(preferredFallbacks) && preferredFallbacks.length > 0
    ? preferredFallbacks
    : DEFAULT_FALLBACK_PRIORITY)
      .map(model => model.replace(/^groq:/, ''))
      .filter(model => !excludedModels.has(model));

  const resolvedTokenLimit = (typeof tokenLimit === 'number' && tokenLimit > 0)
    ? tokenLimit
    : 4000;

  const queryComplexity = analyzeQueryComplexity(query);
  const requiredReasoning = mapReasoningLevel(reasoningLevel);
  const hasImageData = detectImageData(fullPrompt);

  console.log(`Model selection: complexity=${queryComplexity}, reasoning=${requiredReasoning}, tokenLimit=${resolvedTokenLimit}, hasImageData=${hasImageData}`);

  // Filter models that can handle the token limit
  const modelEntries = Object.entries(GROQ_RATE_LIMITS).filter(([modelName, limits]) => {
    if (excludedModels.has(modelName)) {
      return false;
    }

    if (!limits || typeof limits.context_window !== 'number') {
      return true;
    }

    const contextRequirement = Math.max(resolvedTokenLimit * 2, resolvedTokenLimit + 1000);
    return limits.context_window >= contextRequirement;
  });

  if (modelEntries.length === 0) {
    console.warn(`No models can handle token limit ${resolvedTokenLimit}, using smallest context model`);

    const emergencyFallback = fallbackPriority[0] || 'llama-3.1-8b-instant';
    return `groq:${emergencyFallback}`;
  }

  // Score models based on requirements
  const scoredModels = modelEntries.map(([modelName, limits]) => {
    let score = 0;

    // Vision capability is critical when images are present
    if (hasImageData) {
      if (limits.vision_capable) {
        score += 20; // Major boost for vision-capable models when images are detected
        // Prefer llama-4-maverick (scout is blacklisted)
        if (modelName === 'meta-llama/llama-4-maverick-17b-128e-instruct') score += 5;
      } else {
        score -= 10; // Penalize non-vision models when images are present
      }
    }

    // Reasoning capability match
    if (limits.reasoning_capability === requiredReasoning) score += 10;
    else if (limits.reasoning_capability === 'advanced' && requiredReasoning === 'intermediate') score += 7;
    else if (limits.reasoning_capability === 'intermediate' && requiredReasoning === 'basic') score += 7;

    // Speed preference based on complexity
    if (queryComplexity === 'simple' && limits.speed === 'fast') score += 5;
    if (queryComplexity === 'complex' && limits.speed === 'moderate') score += 3;

    // Token efficiency (prefer higher TPM for longer responses)
    if (resolvedTokenLimit > 2000 && limits.tpm >= 6000) score += 3;

    return { modelName, score, limits };
  });

  // Sort by score descending
  scoredModels.sort((a, b) => b.score - a.score);

  // Fetch available models and check if our top choice is available
  try {
    const availableModelIds = availableModels instanceof Set
      ? availableModels
      : await fetchAvailableModels();

    const candidateScores = scoredModels.filter(({ modelName }) => !excludedModels.has(modelName));

    // Try preferred fallback order first when explicitly provided
    for (const fallback of fallbackPriority) {
      if (!excludedModels.has(fallback)) {
        console.log(`Selected fallback model: ${fallback}`);
        return `groq:${fallback}`;
      }
    }

    const hasAvailabilityData = availableModelIds && typeof availableModelIds.has === 'function';

    // Find the first available model from our scored list
    for (const { modelName } of candidateScores) {
      if (!hasAvailabilityData || availableModelIds.has(modelName)) {
        const selectedScore = scoredModels.find(m => m.modelName === modelName)?.score;
        console.log(`Selected model: ${modelName} (score: ${selectedScore})`);
        return `groq:${modelName}`;
      }
    }

    // If none of our preferred models are available, fall back to the first available model
    const availabilitySource = hasAvailabilityData
      ? Array.from(availableModelIds)
      : scoredModels.map(candidate => candidate.modelName);

    const firstAvailable = availabilitySource.find(modelName => !excludedModels.has(modelName));
    if (firstAvailable) {
      console.warn(`None of preferred models available, falling back to: ${firstAvailable}`);
      return `groq:${firstAvailable}`;
    }
  } catch (error) {
    console.warn('Failed to check model availability, using top scored model:', error.message);
  }

  // Final fallback to top scored model
  const finalCandidates = scoredModels.filter(candidate => !excludedModels.has(candidate.modelName));

  if (finalCandidates.length > 0) {
    const selectedModel = finalCandidates[0].modelName;
    console.log(`Selected model (fallback): ${selectedModel} (score: ${finalCandidates[0].score})`);
    return `groq:${selectedModel}`;
  }

  const lastResort = fallbackPriority[0] || scoredModels[0]?.modelName || 'llama-3.1-8b-instant';
  console.warn(`All candidate models were excluded. Using last resort: ${lastResort}`);
  return `groq:${lastResort}`;
}

module.exports = {
  selectModel,
  analyzeQueryComplexity,
  mapReasoningLevel,
  detectImageData,
  fetchAvailableModels
};