/**
 * LLM Pricing Information
 * Prices are per million tokens (input and output)
 * Last updated: October 20, 2025
 * Source of truth: Must match backend src/services/google-sheets-logger.js PRICING object
 */

export interface ModelPricing {
  input: number;  // Price per 1M input tokens
  output: number; // Price per 1M output tokens
}

// Pricing data for various LLM models
export const MODEL_PRICING: Record<string, ModelPricing> = {
  // OpenAI Models
  'gpt-4o': {
    input: 2.50,
    output: 10.00,
  },
  'gpt-4o-mini': {
    input: 0.150,
    output: 0.600,
  },
  'gpt-4-turbo': {
    input: 10.00,
    output: 30.00,
  },
  'gpt-4': {
    input: 30.00,
    output: 60.00,
  },
  'gpt-3.5-turbo': {
    input: 0.50,
    output: 1.50,
  },
  'gpt-3.5-turbo-0125': {
    input: 0.50,
    output: 1.50,
  },
  'o1-preview': {
    input: 15.00,
    output: 60.00,
  },
  'o1-mini': {
    input: 3.00,
    output: 12.00,
  },
  // OpenAI Embedding Models
  'text-embedding-3-small': {
    input: 0.02,
    output: 0.00,  // Embeddings have no output tokens
  },
  'text-embedding-3-large': {
    input: 0.13,
    output: 0.00,
  },
  'text-embedding-ada-002': {
    input: 0.10,
    output: 0.00,
  },

  // Groq Models (Free tier - $0 per million tokens)
  'llama-3.3-70b-versatile': {
    input: 0.00,
    output: 0.00,
  },
  'llama-3.1-70b-versatile': {
    input: 0.00,
    output: 0.00,
  },
  'llama-3.1-8b-instant': {
    input: 0.00,
    output: 0.00,
  },
  'llama3-70b-8192': {
    input: 0.00,
    output: 0.00,
  },
  'llama3-8b-8192': {
    input: 0.00,
    output: 0.00,
  },
  'mixtral-8x7b-32768': {
    input: 0.00,
    output: 0.00,
  },
  'gemma-7b-it': {
    input: 0.00,
    output: 0.00,
  },
  'gemma2-9b-it': {
    input: 0.00,
    output: 0.00,
  },

  // Anthropic Models
  'claude-3-5-sonnet-20241022': {
    input: 3.00,
    output: 15.00,
  },
  'claude-3-5-sonnet': {
    input: 3.00,
    output: 15.00,
  },
  'claude-3-opus': {
    input: 15.00,
    output: 75.00,
  },
  'claude-3-sonnet': {
    input: 3.00,
    output: 15.00,
  },
  'claude-3-haiku': {
    input: 0.25,
    output: 1.25,
  },

  // Together AI Models
  'meta-llama/Llama-4-Maverick-17B-128E-Instruct-FP8': {
    input: 0.20,
    output: 0.20,
  },
  'meta-llama/Llama-4-Scout-17B-16E-Instruct': {
    input: 0.20,
    output: 0.20,
  },
  'meta-llama/Llama-3.3-70B-Instruct': {
    input: 0.88,
    output: 0.88,
  },
  'meta-llama/Llama-3.3-70B-Instruct-Turbo': {
    input: 0.88,
    output: 0.88,
  },
  'meta-llama/Llama-3.1-405B-Instruct': {
    input: 3.50,
    output: 3.50,
  },
  'meta-llama/Llama-3.3-70B-Instruct-Turbo-Free': {
    input: 0.00,
    output: 0.00,
  },
  'meta-llama/Meta-Llama-3.1-405B-Instruct-Turbo': {
    input: 3.50,
    output: 3.50,
  },
  'meta-llama/Meta-Llama-3.1-70B-Instruct-Turbo': {
    input: 0.88,
    output: 0.88,
  },
  'meta-llama/Meta-Llama-3.1-8B-Instruct-Turbo': {
    input: 0.18,
    output: 0.18,
  },
  'meta-llama/Llama-3.2-3B-Instruct-Turbo': {
    input: 0.06,
    output: 0.06,
  },
  'deepseek-ai/DeepSeek-V3.1': {
    input: 0.55,
    output: 1.10,
  },
  'deepseek-ai/DeepSeek-V3': {
    input: 0.27,
    output: 1.10,
  },
  'deepseek-ai/DeepSeek-R1': {
    input: 0.55,
    output: 2.19,
  },
  'deepseek-ai/DeepSeek-R1-0528-tput': {
    input: 0.30,
    output: 0.60,
  },
  'deepseek-ai/DeepSeek-R1-Distill-Llama-70B': {
    input: 0.88,
    output: 0.88,
  },
  'deepseek-ai/DeepSeek-R1-Distill-Qwen-14B': {
    input: 0.20,
    output: 0.20,
  },
  'openai/gpt-oss-120b': {
    input: 0.15,
    output: 0.60,
  },
  'openai/gpt-oss-20b': {
    input: 0.05,
    output: 0.20,
  },
  'Qwen/Qwen3-Coder-480B-A35B-Instruct-FP8': {
    input: 2.00,
    output: 2.00,
  },
  'Qwen/Qwen3-235B-A22B-Instruct-2507-tput': {
    input: 0.20,
    output: 0.60,
  },
  'Qwen/Qwen3-235B-A22B-Thinking-2507': {
    input: 0.65,
    output: 3.00,
  },
  'Qwen/Qwen2.5-72B-Instruct': {
    input: 1.20,
    output: 1.20,
  },
  'Qwen/Qwen2.5-72B-Instruct-Turbo': {
    input: 1.20,
    output: 1.20,
  },
  'Qwen/Qwen2.5-VL-72B-Instruct': {
    input: 1.95,
    output: 8.00,
  },
  'Qwen/Qwen2.5-7B-Instruct-Turbo': {
    input: 0.18,
    output: 0.18,
  },
  'Qwen/Qwen2.5-Coder-32B-Instruct': {
    input: 0.60,
    output: 0.60,
  },
  'Qwen/QwQ-32B': {
    input: 1.20,
    output: 1.20,
  },
  'moonshotai/Kimi-K2-Instruct-0905': {
    input: 1.00,
    output: 1.00,
  },
  'moonshotai/Kimi-K2-Instruct': {
    input: 1.00,
    output: 1.00,
  },
  'mistralai/Magistral-Small-2506': {
    input: 0.80,
    output: 0.80,
  },
  'mistralai/Mistral-Small-24B-Instruct-2501': {
    input: 0.30,
    output: 0.30,
  },
  'mistralai/Mixtral-8x7B-v0.1': {
    input: 0.60,
    output: 0.60,
  },
  'zai-org/GLM-4.5-Air-FP8': {
    input: 0.30,
    output: 0.30,
  },

  // Atlas Cloud Models
  // Anthropic Claude via Atlas Cloud (cheaper than direct)
  'claude-3-5-haiku-20241022': {
    input: 0.70,
    output: 3.50,
  },
  'claude-3-7-sonnet-20250219': {
    input: 2.10,
    output: 10.50,
  },
  'claude-3-7-sonnet-20250219-thinking': {
    input: 2.10,
    output: 10.50,
  },
  // Google Gemini via Atlas Cloud
  'gemini-2.5-flash': {
    input: 0.00,  // Free tier (synced with backend)
    output: 0.00,
  },
  'gemini-2.5-flash-lite': {
    input: 0.05,
    output: 0.20,
  },
  'gemini-2.5-pro': {
    input: 0.00,  // Free tier (synced with backend)
    output: 0.00,
  },
  // Google Gemini Free API (direct access, not via Atlas Cloud)
  'gemini-2.0-flash': {
    input: 0.00,  // Free tier: 1,500 RPD
    output: 0.00,
  },
  'gemini-1.5-flash': {
    input: 0.00,  // Free tier: 1,500 RPD
    output: 0.00,
  },
  'gemini-1.5-pro': {
    input: 0.00,  // Free tier: 1,500 RPD
    output: 0.00,
  },
  // GLM via Atlas Cloud
  'zai-org/GLM-4.5': {
    input: 0.60,
    output: 2.20,
  },
  'zai-org/GLM-4.5-Air': {
    input: 0.00,
    output: 0.00,
  },
  'zai-org/GLM-4.6': {
    input: 0.60,
    output: 2.20,
  },
  // DeepSeek via Atlas Cloud (significantly cheaper!)
  'atlascloud/deepseek-ai/DeepSeek-V3': {
    input: 0.36,
    output: 1.10,
  },
  'atlascloud/deepseek-ai/DeepSeek-V3-0324': {
    input: 0.36,
    output: 1.10,
  },
  'atlascloud/deepseek-ai/DeepSeek-R1': {
    input: 0.14,
    output: 2.19,
  },
  'atlascloud/deepseek-ai/DeepSeek-R1-0528': {
    input: 0.14,
    output: 2.19,
  },
  'atlascloud/deepseek-ai/DeepSeek-R1-Distill-Llama-70B': {
    input: 0.59,
    output: 0.79,
  },
  'atlascloud/deepseek-ai/DeepSeek-R1-Distill-Qwen-14B': {
    input: 0.18,
    output: 0.18,
  },
  'atlascloud/deepseek-ai/DeepSeek-R1-Distill-Qwen-32B': {
    input: 0.40,
    output: 0.40,
  },
  // Llama via Atlas Cloud (cheaper than Together!)
  'atlascloud/meta-llama/Llama-3.3-70B-Instruct-Turbo': {
    input: 0.59,
    output: 0.79,
  },
  'atlascloud/meta-llama/Llama-3.1-405B-Instruct-Turbo': {
    input: 2.70,
    output: 2.70,
  },
  'atlascloud/meta-llama/Llama-3.1-70B-Instruct-Turbo': {
    input: 0.59,
    output: 0.79,
  },
  'atlascloud/meta-llama/Llama-3.1-8B-Instruct-Turbo': {
    input: 0.15,
    output: 0.15,
  },
  // Qwen via Atlas Cloud
  'atlascloud/Qwen/Qwen2.5-72B-Instruct-Turbo': {
    input: 0.90,
    output: 0.90,
  },
  'atlascloud/Qwen/Qwen2.5-7B-Instruct-Turbo': {
    input: 0.18,
    output: 0.18,
  },
  'atlascloud/Qwen/Qwen2.5-Coder-32B-Instruct': {
    input: 0.60,
    output: 0.60,
  },
  'atlascloud/Qwen/QwQ-32B-Preview': {
    input: 0.90,
    output: 0.90,
  },
  // Mistral via Atlas Cloud
  'atlascloud/mistralai/Mistral-7B-Instruct-v0.3': {
    input: 0.18,
    output: 0.18,
  },
  'atlascloud/mistralai/Mistral-Small-24B-Instruct-2501': {
    input: 0.60,
    output: 0.60,
  },
  'atlascloud/mistralai/Mixtral-8x7B-Instruct-v0.1': {
    input: 0.40,
    output: 0.40,
  },
  // Moonshot (Kimi) via Atlas Cloud
  'atlascloud/moonshotai/Kimi-K2-Instruct': {
    input: 0.60,
    output: 2.20,
  },
  'atlascloud/moonshotai/Kimi-K2-Instruct-0905': {
    input: 0.60,
    output: 2.20,
  },
};

/**
 * Calculate the cost of an LLM API call
 * @param model - The model identifier (may include provider prefix)
 * @param promptTokens - Number of input/prompt tokens
 * @param completionTokens - Number of output/completion tokens
 * @returns Cost in USD, or null if pricing not available
 */
export function calculateCost(
  model: string | undefined,
  promptTokens: number,
  completionTokens: number
): number | null {
  if (!model || promptTokens === 0 && completionTokens === 0) {
    return null;
  }

  // Remove provider prefix (e.g., "openai:", "groq:", "anthropic:", "together:", "atlascloud:")
  const cleanModel = model.replace(/^(openai:|groq:|anthropic:|together:|atlascloud:)/, '');

  // Look up pricing
  const pricing = MODEL_PRICING[cleanModel];
  if (!pricing) {
    console.warn(`Pricing not available for model: ${cleanModel}`);
    return null;
  }

  // Calculate cost: (tokens / 1,000,000) * price_per_million
  const inputCost = (promptTokens / 1_000_000) * pricing.input;
  const outputCost = (completionTokens / 1_000_000) * pricing.output;
  
  return inputCost + outputCost;
}

/**
 * Format a cost value for display
 * @param cost - Cost in USD
 * @param showCurrency - Whether to show the $ symbol
 * @returns Formatted cost string
 */
export function formatCost(cost: number | null, showCurrency: boolean = true): string {
  if (cost === null) {
    return 'N/A';
  }

  const prefix = showCurrency ? '$' : '';
  
  if (cost < 0.0001) {
    return `${prefix}${cost.toFixed(6)}`;
  } else if (cost < 0.01) {
    return `${prefix}${cost.toFixed(4)}`;
  } else {
    return `${prefix}${cost.toFixed(4)}`;
  }
}

/**
 * Get detailed cost breakdown for display
 * @param model - The model identifier
 * @param promptTokens - Number of input tokens
 * @param completionTokens - Number of output tokens
 * @returns Detailed cost information
 */
export function getCostBreakdown(
  model: string | undefined,
  promptTokens: number,
  completionTokens: number
): {
  inputCost: number | null;
  outputCost: number | null;
  totalCost: number | null;
  hasPricing: boolean;
} {
  if (!model) {
    return {
      inputCost: null,
      outputCost: null,
      totalCost: null,
      hasPricing: false,
    };
  }

  const cleanModel = model.replace(/^(openai:|groq:|anthropic:|together:|atlascloud:)/, '');
  const pricing = MODEL_PRICING[cleanModel];

  if (!pricing) {
    return {
      inputCost: null,
      outputCost: null,
      totalCost: null,
      hasPricing: false,
    };
  }

  const inputCost = (promptTokens / 1_000_000) * pricing.input;
  const outputCost = (completionTokens / 1_000_000) * pricing.output;

  return {
    inputCost,
    outputCost,
    totalCost: inputCost + outputCost,
    hasPricing: true,
  };
}

/**
 * Determine if a model is on the free tier (Google Gemini, Groq, Together AI Free, Atlas Cloud Free)
 * @param model - The model identifier
 * @returns True if the model is free tier
 */
export function isFreeTierModel(model: string | undefined): boolean {
  if (!model) return false;
  
  const cleanModel = model.replace(/^(openai:|groq:|anthropic:|gemini:|google:|together:|atlascloud:)/, '').toLowerCase();
  
  // Google Gemini models (free tier)
  if (cleanModel.startsWith('gemini-')) {
    return true;
  }
  
  // Together AI free models
  if (cleanModel.includes('llama-3.3-70b-instruct-turbo-free')) {
    return true;
  }
  
  // Atlas Cloud free models
  if (cleanModel.includes('glm-4.5-air') && !cleanModel.includes('fp8')) {
    return true;
  }
  
  // Groq models (free tier for now)
  if (cleanModel.includes('llama') || 
      cleanModel.includes('mixtral') ||
      cleanModel.includes('gemma')) {
    return true;
  }
  
  return false;
}

/**
 * Calculate dual pricing: actual cost (may be $0 for free tier) + what it would cost on a paid plan
 * @param model - The model identifier
 * @param promptTokens - Number of input tokens
 * @param completionTokens - Number of output tokens
 * @returns Object with actual cost, paid equivalent cost (if free), and whether it's free tier
 */
export function calculateDualPricing(
  model: string | undefined,
  promptTokens: number,
  completionTokens: number
): { 
  actualCost: number | null; 
  paidEquivalentCost: number | null; 
  isFree: boolean;
  formattedActual: string;
  formattedPaidEquivalent: string | null;
} {
  const isFree = isFreeTierModel(model);
  const actualCost = calculateCost(model, promptTokens, completionTokens);
  
  if (isFree) {
    // For free models, actual cost is $0
    // Calculate what it WOULD cost using gpt-4o-mini as baseline
    const equivalentPricing = MODEL_PRICING['gpt-4o-mini'];
    const paidEquivalentCost = 
      ((promptTokens / 1_000_000) * equivalentPricing.input) +
      ((completionTokens / 1_000_000) * equivalentPricing.output);
    
    return { 
      actualCost: 0,
      paidEquivalentCost,
      isFree: true,
      formattedActual: '$0.0000',
      formattedPaidEquivalent: formatCost(paidEquivalentCost)
    };
  }
  
  // For paid models, no need for equivalent pricing
  return { 
    actualCost,
    paidEquivalentCost: null,
    isFree: false,
    formattedActual: formatCost(actualCost),
    formattedPaidEquivalent: null
  };
}
