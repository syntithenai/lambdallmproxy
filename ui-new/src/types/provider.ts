/**
 * Phase 2: Settings UI Type Definitions
 * 
 * This file defines the new v2.0.0 settings schema with multi-provider support.
 * Key changes from v1:
 * - Single provider → Multiple providers array
 * - Model selection removed (backend decides)
 * - Provider type encoding
 * - OpenAI-compatible support with modelName
 * 
 * Note: All pricing uses paid tier rates regardless of API key source
 */

export type ProviderType =
  | 'groq'                // Groq - https://api.groq.com/openai/v1
  | 'openai'              // OpenAI - https://api.openai.com/v1
  | 'gemini'              // Google Gemini - https://generativelanguage.googleapis.com/v1beta
  | 'together'            // Together AI - https://api.together.xyz/v1
  | 'replicate'           // Replicate - https://api.replicate.com/v1
  | 'atlascloud'          // Atlas Cloud - https://api.atlascloud.ai/v1
  | 'openai-compatible';  // Custom endpoint - user specifies endpoint AND modelName

export interface ProviderConfig {
  id: string;              // Unique ID for this provider instance (UUID)
  type: ProviderType;      // Provider type - determines endpoint and behavior
  apiEndpoint: string;     // Auto-filled and NOT EDITABLE except for openai-compatible
  apiKey: string;          // User's API key for this provider
  modelName?: string;      // ONLY for openai-compatible - preserved through to upstream
  rateLimitTPM?: number;   // ONLY for openai-compatible - explicit rate limit or undefined
  enabled?: boolean;       // Whether this provider should be used (defaults to true if undefined)
  // Model restrictions - applies to ALL LLM calls (chat, image, etc.)
  // null or undefined = allow all models
  // empty array = allow all models
  // non-empty array = only allow exact model name matches
  allowedModels?: string[] | null;
  // Image generation quality cap
  maxImageQuality?: 'fast' | 'standard' | 'high' | 'ultra';
  // Capability flags - control which services this provider can be used for
  capabilities?: {
    chat?: boolean;        // Enable for chat/text completion (default: true)
    image?: boolean;       // Enable for image generation (default: true)
    embedding?: boolean;   // Enable for embeddings (default: true)
    voice?: boolean;       // Enable for voice/transcription (default: true)
    tts?: boolean;         // Enable for text-to-speech (default: true)
  };
}

export type OptimizationPreference = 'cheap' | 'balanced' | 'powerful' | 'fastest';

export interface Settings {
  version: '2.0.0';
  providers: ProviderConfig[]; // Array of configured providers (unlimited)
  tavilyApiKey: string;        // Unchanged - for search functionality
  syncToGoogleDrive?: boolean; // Enable automatic sync to Google Drive (default: false)
  optimization?: OptimizationPreference; // Model selection strategy (default: 'cheap')
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
  'openai': 'https://api.openai.com/v1',
  'gemini': 'https://generativelanguage.googleapis.com/v1beta',
  'together': 'https://api.together.xyz/v1',
  'replicate': 'https://api.replicate.com/v1',
  'atlascloud': 'https://api.atlascloud.ai/v1',
};

/**
 * Provider display names and descriptions
 * All providers use paid tier pricing regardless of API key source
 */
export const PROVIDER_INFO: Record<ProviderType, { name: string; icon: string; description: string }> = {
  'groq': {
    name: 'Groq',
    icon: '⚡',
    description: 'Fast inference with LLaMA and Mixtral models'
  },
  'openai': {
    name: 'OpenAI',
    icon: '🤖',
    description: 'GPT-4, GPT-4o, and other OpenAI models'
  },
  'gemini': {
    name: 'Google Gemini',
    icon: '✨',
    description: 'Google\'s Gemini models'
  },
  'together': {
    name: 'Together AI',
    icon: '🔌',
    description: 'Open source models including FLUX image generation'
  },
  'replicate': {
    name: 'Replicate',
    icon: '🔄',
    description: 'Run ML models via API'
  },
  'atlascloud': {
    name: 'Atlas Cloud',
    icon: '☁️',
    description: 'API marketplace for various LLM models'
  },
  'openai-compatible': {
    name: 'OpenAI Compatible (Custom)',
    icon: '⚙️',
    description: 'Custom endpoint with OpenAI-compatible API'
  },
};
