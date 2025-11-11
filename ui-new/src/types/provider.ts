/**
 * Phase 2: Settings UI Type Definitions
 * 
 * This file re-exports types from persistence.ts for backwards compatibility
 * MIGRATION NOTE: Code should gradually migrate to import from persistence.ts directly
 */

// Re-export unified types from persistence.ts
export type { ProviderConfig, Settings } from './persistence';

// Legacy Provider type definition - kept for backward compatibility
export type ProviderType =
  | 'groq'                // Groq - https://api.groq.com/openai/v1
  | 'openai'              // OpenAI - https://api.openai.com/v1
  | 'gemini'              // Google Gemini - https://generativelanguage.googleapis.com/v1beta
  | 'together'            // Together AI - https://api.together.xyz/v1
  | 'replicate'           // Replicate - https://api.replicate.com/v1
  | 'atlascloud'          // Atlas Cloud - https://api.atlascloud.ai/v1
  | 'speaches'            // Speaches - Local Whisper server (http://localhost:8000)
  | 'anthropic'           // Anthropic - https://api.anthropic.com/v1
  | 'google'              // Google (alias for gemini)
  | 'cohere'              // Cohere
  | 'deepseek'            // DeepSeek
  | 'openai-compatible';  // Custom endpoint - user specifies endpoint AND modelName

export type OptimizationPreference = 'cheap' | 'balanced' | 'powerful' | 'fastest';
export type ImageQuality = 'low' | 'medium' | 'high';

// Settings interface is now in persistence.ts - imported above

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
  'speaches': 'http://localhost:8000',
  'anthropic': 'https://api.anthropic.com/v1',
  'google': 'https://generativelanguage.googleapis.com/v1beta',
  'cohere': 'https://api.cohere.ai/v1',
  'deepseek': 'https://api.deepseek.com/v1',
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
  'speaches': {
    name: 'Speaches (Local)',
    icon: '🏠',
    description: 'Local Whisper server for STT and TTS (OpenAI compatible)'
  },
    'anthropic': {
    name: 'Anthropic',
    icon: '🧠',
    description: 'Claude models from Anthropic'
  },
  'google': {
    name: 'Google',
    icon: '✨',
    description: 'Google AI models (alias for Gemini)'
  },
  'cohere': {
    name: 'Cohere',
    icon: '🔮',
    description: 'Cohere language models'
  },
  'deepseek': {
    name: 'DeepSeek',
    icon: '🔍',
    description: 'DeepSeek AI models'
  },
  'openai-compatible': {
    name: 'Custom Endpoint',
    icon: '🔗',
    description: 'Any OpenAI-compatible API endpoint'
  }
};
