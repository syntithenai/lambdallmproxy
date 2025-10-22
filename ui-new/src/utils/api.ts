// API client for Lambda endpoints
import { createSSERequest, handleSSEResponse } from './streaming';

// Constants
const LOCAL_LAMBDA_URL = import.meta.env.VITE_LOCAL_LAMBDA_URL || 'http://localhost:3000';
const REMOTE_LAMBDA_URL = import.meta.env.VITE_API_BASE || import.meta.env.VITE_LAMBDA_URL || 'https://nrw7pperjjdswbmqgmigbwsbyi0rwdqf.lambda-url.us-east-1.on.aws';

// Log configuration for debugging
console.log('🔧 API Configuration:', {
  hostname: window.location.hostname,
  remote: REMOTE_LAMBDA_URL,
  local: LOCAL_LAMBDA_URL,
  source: import.meta.env.VITE_API_BASE ? 'env' : 'fallback'
});

/**
 * Determine if we're running on localhost
 */
function isLocalhost(): boolean {
  const hostname = window.location.hostname;
  return hostname === 'localhost' || 
         hostname === '127.0.0.1' ||
         hostname.startsWith('192.168.') ||
         hostname.startsWith('10.') ||
         hostname.match(/^172\.(1[6-9]|2[0-9]|3[0-1])\./) !== null;
}

/**
 * Check if local Lambda is available
 */
async function isLocalLambdaAvailable(): Promise<boolean> {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 1000); // 1 second timeout
    
    const response = await fetch(`${LOCAL_LAMBDA_URL}/health`, {
      method: 'GET',
      signal: controller.signal
    });
    
    clearTimeout(timeoutId);
    return response.ok;
  } catch {
    return false;
  }
}

/**
 * Get the appropriate API base URL
 * - If VITE_API_BASE env var is set, always use it (production build)
 * - If on GitHub Pages (*.github.io), always use remote
 * - If on localhost/local IP, require local Lambda to be running (no fallback)
 */
async function getApiBase(): Promise<string> {
  // If environment variable is set, always use it (production build)
  if (import.meta.env.VITE_API_BASE) {
    console.log('🌐 Using VITE_API_BASE:', import.meta.env.VITE_API_BASE);
    return import.meta.env.VITE_API_BASE;
  }
  
  // If on GitHub Pages or other remote host, always use remote
  if (!isLocalhost()) {
    console.log('🌐 Not localhost, using remote Lambda:', REMOTE_LAMBDA_URL);
    return REMOTE_LAMBDA_URL;
  }
  
  // On localhost: REQUIRE local Lambda to be running (no fallback to remote)
  const localAvailable = await isLocalLambdaAvailable();
  
  if (localAvailable) {
    console.log('🏠 Using local Lambda server at', LOCAL_LAMBDA_URL);
    return LOCAL_LAMBDA_URL;
  } else {
    console.error('❌ Local Lambda not available at', LOCAL_LAMBDA_URL);
    throw new Error('⚠️ Dev server not running. Please start your dev server with `make dev` or `npm run dev`');
  }
}

// Cache the API base to avoid checking on every request
let cachedApiBase: string | null = null;
let apiBasePromise: Promise<string> | null = null;

/**
 * Get cached API base or determine it
 */
export async function getCachedApiBase(): Promise<string> {
  if (cachedApiBase) {
    return cachedApiBase;
  }
  
  if (!apiBasePromise) {
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
  youtubeToken?: string | null
): Promise<void> => {
  const apiBase = await getCachedApiBase();
  
  const response = await createSSERequest(
    `${apiBase}/chat`,
    request,
    token,
    signal,
    youtubeToken
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
