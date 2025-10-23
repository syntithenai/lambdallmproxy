// API client for Lambda endpoints
import { createSSERequest, handleSSEResponse } from './streaming';

// Constants
const REMOTE_LAMBDA_URL = import.meta.env.VITE_API_BASE || import.meta.env.VITE_LAMBDA_URL || 'https://nrw7pperjjdswbmqgmigbwsbyi0rwdqf.lambda-url.us-east-1.on.aws';

console.log('🚀 API Module Loading - Version: 2024-10-22-DYNAMIC-HOSTNAME');

/**
 * Get the local Lambda URL based on current hostname
 * This allows accessing from localhost, LAN IP, or domain name
 * Lambda dev server matches UI protocol (HTTP or HTTPS)
 */
function getLocalLambdaUrl(): string {
  const protocol = window.location.protocol; // 'http:' or 'https:'
  const hostname = window.location.hostname;
  const port = '3000';
  
  console.log('🔍 getLocalLambdaUrl() called:', { protocol, hostname, port });
  
  // If VITE_LOCAL_LAMBDA_URL is explicitly set, use it
  if (import.meta.env.VITE_LOCAL_LAMBDA_URL) {
    return import.meta.env.VITE_LOCAL_LAMBDA_URL;
  }
  
  // Lambda dev server runs on same protocol as UI to avoid mixed content issues
  // Build URL based on current hostname (works for localhost, LAN IP, or domain)
  const url = `${protocol}//${hostname}:${port}`;
  console.log('🔍 getLocalLambdaUrl() returning:', url);
  return url;
}

// Log configuration for debugging (use function to get current value)
console.log('🔧 API Configuration:', {
  hostname: window.location.hostname,
  remote: REMOTE_LAMBDA_URL,
  local: getLocalLambdaUrl(),
  source: import.meta.env.VITE_API_BASE ? 'env' : 'fallback'
});

/**
 * Check if local Lambda is available
 */
async function isLocalLambdaAvailable(): Promise<boolean> {
  const localUrl = getLocalLambdaUrl();
  try {
    console.log(`🔍 Checking if local Lambda is available at: ${localUrl}/health`);
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 1000); // 1 second timeout
    
    const response = await fetch(`${localUrl}/health`, {
      method: 'GET',
      signal: controller.signal
    });
    
    clearTimeout(timeoutId);
    const available = response.ok;
    console.log(`${available ? '✅' : '❌'} Local Lambda ${available ? 'available' : 'not available'} at ${localUrl}`);
    return available;
  } catch (error) {
    console.log(`❌ Local Lambda not available at ${localUrl}:`, error instanceof Error ? error.message : 'Unknown error');
    return false;
  }
}

/**
 * Get the appropriate API base URL
 * - If VITE_API_BASE env var is set, always use it (production build)
 * - Otherwise, check if local Lambda is available at :3000 on current hostname
 * - Fall back to remote Lambda if local is not available
 */
async function getApiBase(): Promise<string> {
  // If environment variable is set, always use it (production build)
  if (import.meta.env.VITE_API_BASE) {
    console.log('🌐 Using VITE_API_BASE:', import.meta.env.VITE_API_BASE);
    return import.meta.env.VITE_API_BASE;
  }
  
  // Check if local Lambda is available (on any hostname: localhost, LAN IP, or domain)
  const localAvailable = await isLocalLambdaAvailable();
  
  if (localAvailable) {
    const localUrl = getLocalLambdaUrl();
    console.log('🏠 Using local Lambda server at', localUrl);
    return localUrl;
  }
  
  // Fall back to remote Lambda
  console.log('🌐 Local Lambda not available, using remote:', REMOTE_LAMBDA_URL);
  return REMOTE_LAMBDA_URL;
}

// Cache the API base to avoid checking on every request
let cachedApiBase: string | null = null;
let apiBasePromise: Promise<string> | null = null;
let cachedHostname: string | null = null; // Track which hostname the cache is for

/**
 * Get cached API base or determine it
 */
export async function getCachedApiBase(): Promise<string> {
  // If hostname changed, clear cache
  if (cachedHostname && cachedHostname !== window.location.hostname) {
    console.log(`🔄 Hostname changed from ${cachedHostname} to ${window.location.hostname}, clearing API cache`);
    cachedApiBase = null;
    apiBasePromise = null;
    cachedHostname = null;
  }
  
  if (cachedApiBase) {
    return cachedApiBase;
  }
  
  if (!apiBasePromise) {
    cachedHostname = window.location.hostname;
    apiBasePromise = getApiBase().then(base => {
      cachedApiBase = base;
      return base;
    });
  }
  
  return apiBasePromise;
}

/**
 * Reset the cached API base (useful for testing or manual switching)
 */
export function resetApiBase(): void {
  cachedApiBase = null;
  apiBasePromise = null;
  console.log('🔄 API base cache reset');
}

/**
 * Force use of remote Lambda (useful for debugging)
 */
export function forceRemote(): void {
  cachedApiBase = REMOTE_LAMBDA_URL;
  console.log('🌐 Forced to use remote Lambda');
}

/**
 * Get current API base URL (for debugging)
 */
export async function getCurrentApiBase(): Promise<string> {
  return getCachedApiBase();
}

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string | Array<{type: string; text?: string; image_url?: {url: string; detail?: string}}>;  // Support multimodal content
  tool_calls?: Array<{
    id: string;
    type: 'function';
    function: {
      name: string;
      arguments: string;
    };
  }>;
  tool_call_id?: string;
  name?: string;
  rawResponse?: string;  // NEW: For tool messages - full raw response
  extractionMetadata?: any;  // NEW: For tool messages - extraction metadata
  isStreaming?: boolean;  // Flag to indicate message is currently being streamed
  _attachments?: Array<{  // UI-only: attached files for display
    name: string;
    type: string;
    size: number;
    base64: string;
    preview?: string;
  }>;
  llmApiCalls?: Array<{   // LLM API transparency data for this message
    phase: string;
    provider?: string;    // LLM provider (e.g., 'groq', 'openai')
    model: string;
    request: any;
    response?: any;
    httpHeaders?: any;    // HTTP response headers from LLM API
    httpStatus?: number;  // HTTP status code from LLM API
    timestamp: string;
  }>;
  toolResults?: Array<{   // Tool execution results embedded in assistant message
    role: 'tool';
    content: string;
    tool_call_id: string;
    name: string;
    llmApiCalls?: any[];
    rawResponse?: string;  // NEW: Full raw response for transparency
    extractionMetadata?: any;  // NEW: Per-tool extraction metadata
  }>;
  errorData?: any;        // Full error object for error transparency
  extractedContent?: {    // Extracted content from tool calls (search results, images, videos, media)
    // Prioritized content (shown inline, not expandable)
    prioritizedLinks?: Array<{
      title: string;
      url: string;
      snippet?: string;
    }>;
    prioritizedImages?: Array<{
      src: string;
      alt: string;
      source: string;
    }>;
    // Expandable sections (collapsed by default)
    allLinks?: Array<{
      title: string;
      url: string;
      snippet?: string;
      source?: string;
    }>;
    allImages?: Array<{
      src: string;
      alt: string;
      source: string;
    }>;
    // Legacy fields for backwards compatibility
    sources?: Array<{
      title: string;
      url: string;
      snippet?: string;
    }>;
    images?: Array<{
      src: string;
      alt: string;
      source: string;
    }>;
    youtubeVideos?: Array<{
      src: string;
      title: string;
      source: string;
    }>;
    otherVideos?: Array<{
      src: string;
      title: string;
      source: string;
    }>;
    media?: Array<{
      src: string;
      type: string;
      source: string;
    }>;
    metadata?: any;  // Extraction metadata
  };
  // Retry support
  isRetryable?: boolean;             // Mark message as retryable (error or incomplete response)
  retryCount?: number;               // Number of retry attempts for this message
  originalErrorMessage?: string;     // Original error message for retry context
  originalUserPromptIndex?: number;  // Index of original user prompt for retry
  // Self-evaluation results
  evaluations?: Array<{              // Self-evaluation results for response comprehensiveness
    attempt: number;                 // Evaluation attempt number
    comprehensive: boolean;          // Whether response was deemed comprehensive
    reason: string;                  // Explanation of evaluation result
  }>;
  // Image generation results
  imageGenerations?: Array<{         // Image generation tool results
    id: string;                      // Unique identifier for this generation
    provider: string;                // Provider name (openai, together, replicate, gemini)
    model: string;                   // Model name/ID
    modelKey?: string;               // Internal model key from PROVIDER_CATALOG
    cost: number;                    // Estimated or actual cost in USD
    prompt: string;                  // Image description prompt
    size?: string;                   // Image dimensions (e.g., '1024x1024')
    style?: string;                  // Style preference (e.g., 'natural', 'vivid')
    qualityTier?: string;            // Quality tier (ultra, high, standard, fast)
    constraints?: {                  // Model constraints
      maxSize?: string;
      supportedSizes?: string[];
      supportsStyle?: boolean;
    };
    imageUrl?: string;               // Generated image URL (after generation)
    llmApiCall?: any;                // LLM API call data for generation
    status: 'pending' | 'generating' | 'complete' | 'error';  // Generation status
    error?: string;                  // Error message if generation failed
    fallbackUsed?: boolean;          // Whether a fallback provider was used
    availableAlternatives?: Array<{  // Alternative providers that can handle request
      provider: string;
      model: string;
      cost: number;
      capabilities?: string[];
    }>;
    ready?: boolean;                 // Whether ready for generation (false = needs user click)
    message?: string;                // Status/instruction message for user
  }>;
}

export interface ProxyRequest {
  model: string;
  messages: ChatMessage[];
  temperature?: number;
  max_tokens?: number;
  stream?: boolean;
  providers?: Record<string, { apiKey: string; [key: string]: any }>; // All enabled providers for fallback
}

export interface PlanningRequest {
  query: string;
}

export interface SearchRequest {
  queries: string[];
  maxResults?: number;
  includeContent?: boolean;
}

export interface SearchResult {
  query: string;
  results: Array<{
    title: string;
    url: string;
    description: string;
    content?: string;
    error?: string;
  }>;
}

// Proxy endpoint (OpenAI-compatible chat)
export const sendChatMessage = async (
  request: ProxyRequest,
  token: string,
  signal?: AbortSignal
): Promise<Response> => {
  const apiBase = await getCachedApiBase();
  const response = await fetch(`${apiBase}/proxy`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`
    },
    body: JSON.stringify(request),
    signal
  });
  
  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || 'Request failed');
  }
  
  return response;
};

// Planning endpoint (SSE streaming)
export const generatePlan = async (
  query: string,
  token: string,
  providers: Array<{
    type: string;
    apiKey: string;
    enabled?: boolean;
    [key: string]: any;
  }>,
  model: string | undefined,
  onEvent: (event: string, data: any) => void,
  onComplete?: () => void,
  onError?: (error: Error) => void,
  options?: {
    temperature?: number;
    maxTokens?: number;
    reasoningDepth?: number;
  }
): Promise<void> => {
  const apiBase = await getCachedApiBase();
  
  // Filter and format providers for backend
  const enabledProviders = providers.filter(p => p.enabled !== false);
  const providersMap: Record<string, { apiKey: string; [key: string]: any }> = {};
  
  enabledProviders.forEach(provider => {
    const { type, enabled, ...providerConfig } = provider;
    providersMap[type] = providerConfig;
  });
  
  const requestBody: any = { 
    query,
    providers: providersMap
  };
  
  // Only add model if provided (server will use load balancing if not provided)
  if (model) {
    requestBody.model = model;
  }
  
  // Add planning options if provided
  if (options?.temperature !== undefined) {
    requestBody.temperature = options.temperature;
  }
  if (options?.maxTokens !== undefined) {
    requestBody.max_tokens = options.maxTokens;
  }
  if (options?.reasoningDepth !== undefined) {
    requestBody.reasoning_depth = options.reasoningDepth;
  }
  
  const response = await createSSERequest(
    `${apiBase}/planning`,
    requestBody,
    token
  );
  
  await handleSSEResponse(response, onEvent, onComplete, onError);
};

// Search endpoint (SSE streaming)
export const performSearch = async (
  queries: string[],
  token: string,
  options: { maxResults?: number; includeContent?: boolean } = {},
  onEvent: (event: string, data: any) => void,
  onComplete?: () => void,
  onError?: (error: Error) => void
): Promise<void> => {
  const apiBase = await getCachedApiBase();
  
  const response = await createSSERequest(
    `${apiBase}/search`,
    {
      queries,
      maxResults: options.maxResults || 5,
      includeContent: options.includeContent !== false
    },
    token
  );
  
  await handleSSEResponse(response, onEvent, onComplete, onError);
};

// Chat endpoint with SSE streaming and tool execution
export const sendChatMessageStreaming = async (
  request: ProxyRequest & { 
    tools?: any[];
    isRetry?: boolean;
    retryContext?: {
      previousToolResults?: ChatMessage[];
      intermediateMessages?: ChatMessage[];
      failureReason?: string;
      attemptNumber?: number;
    };
  },
  token: string,
  onEvent: (event: string, data: any) => void,
  onComplete?: () => void,
  onError?: (error: Error) => void,
  signal?: AbortSignal,
  youtubeToken?: string | null,
  requestId?: string | null  // Optional request ID for grouping logs (e.g., from voice transcription)
): Promise<void> => {
  const apiBase = await getCachedApiBase();
  
  const response = await createSSERequest(
    `${apiBase}/chat`,
    request,
    token,
    signal,
    youtubeToken,
    3, // maxRetries
    1000, // initialRetryDelay
    requestId // Pass request ID to headers
  );
  
  await handleSSEResponse(response, onEvent, onComplete, onError);
};

// Image Generation endpoint (non-streaming)
export const generateImage = async (
  prompt: string,
  provider: string,
  model: string,
  modelKey: string,
  size: string,
  quality: string,
  style: string,
  token: string | null,
  providerApiKeys?: {
    openaiApiKey?: string;
    togetherApiKey?: string;
    geminiApiKey?: string;
    replicateApiKey?: string;
  }
): Promise<{
  success: boolean;
  imageUrl?: string;
  base64?: string;
  fallbackUsed?: boolean;
  originalProvider?: string;
  llmApiCall?: any;
  metadata?: any;
  error?: string;
}> => {
  const apiBase = await getCachedApiBase();
  
  const requestBody = {
    prompt,
    provider,
    model,
    modelKey,
    size,
    quality,
    style,
    accessToken: token,
    // Include provider API keys from settings
    ...(providerApiKeys || {})
  };
  
  try {
    const response = await fetch(`${apiBase}/generate-image`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(requestBody),
      credentials: 'include'
    });
    
    const data = await response.json();
    
    if (!response.ok) {
      return {
        success: false,
        error: data.error || `HTTP ${response.status}: ${response.statusText}`
      };
    }
    
    return data;
  } catch (error: any) {
    console.error('Image generation request failed:', error);
    return {
      success: false,
      error: error.message || 'Failed to generate image'
    };
  }
};

// Get image provider health status
export const getImageProviderHealth = async (): Promise<{
  timestamp: string;
  providers: Record<string, {
    provider: string;
    available: boolean;
    reason: string;
    details?: any;
    lastCheck: string;
  }>;
  summary: {
    total: number;
    available: number;
    unavailable: number;
  };
}> => {
  const apiBase = await getCachedApiBase();
  
  try {
    const response = await fetch(`${apiBase}/health-check/image-providers`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json'
      },
      credentials: 'include'
    });
    
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }
    
    return await response.json();
  } catch (error: any) {
    console.error('Failed to fetch provider health:', error);
    // Return error state
    return {
      timestamp: new Date().toISOString(),
      providers: {},
      summary: {
        total: 0,
        available: 0,
        unavailable: 0
      }
    };
  }
};
