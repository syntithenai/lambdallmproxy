/**
 * Phase 2: Settings UI Type Definitions
 * 
 * This file defines the new v2.0.0 settings schema with multi-provider support.
 * Key changes from v1:
 * - Single provider → Multiple providers array
 * - Model selection removed (backend decides)
 * - Provider type encoding (groq-free vs groq)
 * - OpenAI-compatible support with modelName
 */

export type ProviderType =
  | 'groq-free'           // Groq free tier - https://api.groq.com/openai/v1
  | 'groq'                // Groq paid tier - https://api.groq.com/openai/v1
  | 'openai'              // OpenAI - https://api.openai.com/v1
  | 'gemini-free'         // Gemini free tier - https://generativelanguage.googleapis.com/v1beta
  | 'gemini'              // Gemini paid tier - https://generativelanguage.googleapis.com/v1beta
  | 'together'            // Together AI - https://api.together.xyz/v1
  | 'openai-compatible';  // Custom endpoint - user specifies endpoint AND modelName

export interface ProviderConfig {
  id: string;              // Unique ID for this provider instance (UUID)
  type: ProviderType;      // Provider type - determines endpoint and behavior
  apiEndpoint: string;     // Auto-filled and NOT EDITABLE except for openai-compatible
  apiKey: string;          // User's API key for this provider
  modelName?: string;      // ONLY for openai-compatible - preserved through to upstream
  rateLimitTPM?: number;   // ONLY for openai-compatible - explicit rate limit or undefined
}

export interface Settings {
  version: '2.0.0';
  providers: ProviderConfig[]; // Array of configured providers (unlimited)
  tavilyApiKey: string;        // Unchanged - for search functionality
}

/**
 * Legacy v1.0.0 settings schema (for migration)
 */
export interface SettingsV1 {
  provider: 'groq' | 'openai';
  llmApiKey: string;
  tavilyApiKey: string;
  apiEndpoint: string;
  smallModel?: string;
  largeModel?: string;
  reasoningModel?: string;
}

/**
 * Provider endpoint mapping based on provider type
 */
export const PROVIDER_ENDPOINTS: Record<Exclude<ProviderType, 'openai-compatible'>, string> = {
  'groq': 'https://api.groq.com/openai/v1',
  'groq-free': 'https://api.groq.com/openai/v1',
  'openai': 'https://api.openai.com/v1',
  'gemini': 'https://generativelanguage.googleapis.com/v1beta',
  'gemini-free': 'https://generativelanguage.googleapis.com/v1beta',
  'together': 'https://api.together.xyz/v1',
};

/**
 * Provider display names and descriptions
 */
export const PROVIDER_INFO: Record<ProviderType, { name: string; icon: string; description: string }> = {
  'groq-free': {
    name: 'Groq (Free Tier)',
    icon: '🆓',
    description: 'Fast inference with generous free tier limits'
  },
  'groq': {
    name: 'Groq (Paid)',
    icon: '💰',
    description: 'Fast inference with higher rate limits'
  },
  'openai': {
    name: 'OpenAI',
    icon: '💰',
    description: 'GPT-4, GPT-4o, and other OpenAI models'
  },
  'gemini-free': {
    name: 'Google Gemini (Free Tier)',
    icon: '🆓',
    description: 'Google\'s Gemini models with free tier'
  },
  'gemini': {
    name: 'Google Gemini (Paid)',
    icon: '💰',
    description: 'Google\'s Gemini models with higher limits'
  },
  'together': {
    name: 'Together AI',
    icon: '🔌',
    description: 'Open source models with trial credits'
  },
  'openai-compatible': {
    name: 'OpenAI Compatible (Custom)',
    icon: '⚙️',
    description: 'Custom endpoint with OpenAI-compatible API'
  },
};
