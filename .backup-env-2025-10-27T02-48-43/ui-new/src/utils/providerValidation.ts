/**
 * Phase 2: Provider Validation Utilities
 * 
 * Validates API keys, endpoints, and model names per provider type.
 */

import type { ProviderType, ProviderConfig } from '../types/provider';

/**
 * API key format validation patterns per provider type
 */
const API_KEY_PATTERNS: Record<ProviderType, RegExp> = {
  'groq': /^gsk_[a-zA-Z0-9]{32,}$/,
  'openai': /^sk-[a-zA-Z0-9_-]{20,}$/,
  'gemini': /^AIza[a-zA-Z0-9_-]{35}$/,
  'together': /^[a-zA-Z0-9_-]{32,}$/,
  'atlascloud': /^apikey-[a-f0-9]{32}$/,
  'openai-compatible': /.+/, // Any non-empty string
  'replicate': /^r8_[a-zA-Z0-9]{40}$/, // Replicate API key format
};

/**
 * Validate API key format for a specific provider type
 */
export function validateApiKey(apiKey: string, providerType: ProviderType): { valid: boolean; error?: string } {
  if (!apiKey || apiKey.trim() === '') {
    return { valid: false, error: 'API key is required' };
  }

  const pattern = API_KEY_PATTERNS[providerType];
  if (!pattern.test(apiKey)) {
    const errorMessages: Record<ProviderType, string> = {
      'groq': 'Groq API key must start with "gsk_" followed by at least 32 characters',
      'openai': 'OpenAI API key must start with "sk-" followed by at least 20 characters',
      'gemini': 'Gemini API key must start with "AIza" followed by 35 characters',
      'together': 'Together AI API key must be at least 32 characters',
      'atlascloud': 'Atlas Cloud API key must start with "apikey-" followed by 32 hex characters',
      'openai-compatible': 'API key cannot be empty',
      'replicate': 'Replicate API key must start with "r8_" followed by 40 characters',
    };
    return { valid: false, error: errorMessages[providerType] };
  }

  return { valid: true };
}

/**
 * Validate endpoint URL (for openai-compatible only)
 */
export function validateEndpoint(endpoint: string): { valid: boolean; error?: string } {
  if (!endpoint || endpoint.trim() === '') {
    return { valid: false, error: 'Endpoint URL is required' };
  }

  try {
    const url = new URL(endpoint);
    if (url.protocol !== 'https:') {
      return { valid: false, error: 'Endpoint must use HTTPS protocol' };
    }
    return { valid: true };
  } catch (e) {
    return { valid: false, error: 'Invalid URL format' };
  }
}

/**
 * Validate model name (for openai-compatible only)
 */
export function validateModelName(modelName: string | undefined): { valid: boolean; error?: string } {
  if (!modelName || modelName.trim() === '') {
    return { valid: false, error: 'Model name is required for OpenAI-compatible providers' };
  }
  return { valid: true };
}

/**
 * Validate rate limit TPM (for openai-compatible only)
 */
export function validateRateLimitTPM(rateLimitTPM: number | undefined): { valid: boolean; error?: string } {
  if (rateLimitTPM !== undefined) {
    if (isNaN(rateLimitTPM) || rateLimitTPM < 0) {
      return { valid: false, error: 'Rate limit must be a positive number or empty' };
    }
  }
  return { valid: true };
}

/**
 * Validate complete provider configuration
 */
export function validateProvider(provider: Partial<ProviderConfig>): { valid: boolean; errors: Record<string, string> } {
  const errors: Record<string, string> = {};

  // Validate provider type
  if (!provider.type) {
    errors.type = 'Provider type is required';
  }

  // Validate API key
  if (provider.type) {
    const apiKeyResult = validateApiKey(provider.apiKey || '', provider.type);
    if (!apiKeyResult.valid) {
      errors.apiKey = apiKeyResult.error!;
    }
  }

  // Validate openai-compatible specific fields
  if (provider.type === 'openai-compatible') {
    const endpointResult = validateEndpoint(provider.apiEndpoint || '');
    if (!endpointResult.valid) {
      errors.apiEndpoint = endpointResult.error!;
    }

    const modelNameResult = validateModelName(provider.modelName);
    if (!modelNameResult.valid) {
      errors.modelName = modelNameResult.error!;
    }

    const rateLimitResult = validateRateLimitTPM(provider.rateLimitTPM);
    if (!rateLimitResult.valid) {
      errors.rateLimitTPM = rateLimitResult.error!;
    }
  }

  return {
    valid: Object.keys(errors).length === 0,
    errors,
  };
}

/**
 * Mask API key for display (show first 4 and last 4 characters)
 */
export function maskApiKey(apiKey: string): string {
  if (!apiKey || apiKey.length < 12) {
    return '••••••••••••••';
  }
  const visibleStart = apiKey.slice(0, 4);
  const visibleEnd = apiKey.slice(-4);
  const maskedLength = Math.max(8, apiKey.length - 8);
  return `${visibleStart}${'•'.repeat(maskedLength)}${visibleEnd}`;
}

/**
 * Check if two providers are the same (for duplicate detection)
 */
export function isDuplicateProvider(provider1: ProviderConfig, provider2: ProviderConfig): boolean {
  // Same type and same API key = duplicate
  return provider1.type === provider2.type && provider1.apiKey === provider2.apiKey;
}
