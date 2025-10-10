/**
 * LLM Pricing Information
 * Prices are per million tokens (input and output)
 * Last updated: October 2025
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

  // Groq Models (Free tier, but using nominal pricing for comparison)
  'llama-3.3-70b-versatile': {
    input: 0.59,
    output: 0.79,
  },
  'llama-3.1-70b-versatile': {
    input: 0.59,
    output: 0.79,
  },
  'llama-3.1-8b-instant': {
    input: 0.05,
    output: 0.08,
  },
  'llama3-70b-8192': {
    input: 0.59,
    output: 0.79,
  },
  'llama3-8b-8192': {
    input: 0.05,
    output: 0.08,
  },
  'mixtral-8x7b-32768': {
    input: 0.24,
    output: 0.24,
  },
  'gemma-7b-it': {
    input: 0.07,
    output: 0.07,
  },
  'gemma2-9b-it': {
    input: 0.20,
    output: 0.20,
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

  // Remove provider prefix (e.g., "openai:", "groq:", "anthropic:")
  const cleanModel = model.replace(/^(openai:|groq:|anthropic:)/, '');

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

  const cleanModel = model.replace(/^(openai:|groq:|anthropic:)/, '');
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
