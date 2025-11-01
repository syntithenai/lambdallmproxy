// API client for Lambda endpoints
import { createSSERequest, handleSSEResponse } from './streaming';
import { cache } from '../services/cache';

// Constants
const REMOTE_LAMBDA_URL = import.meta.env.VITE_API || import.meta.env.VITE_LAM || 'https://nrw7pperjjdswbmqgmigbwsbyi0rwdqf.lambda-url.us-east-1.on.aws';

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
  if (import.meta.env.VITE_LOCAL) {
    return import.meta.env.VITE_LOCAL;
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
  source: import.meta.env.VITE_API ? 'env' : 'fallback'
});

/**
 * Check if local Lambda is available
 * We try to make a simple request to test connectivity
 */
async function isLocalLambdaAvailable(): Promise<boolean> {
  const localUrl = getLocalLambdaUrl();
  try {
    console.log(`🔍 Checking if local Lambda is available at: ${localUrl}`);
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 500); // 500ms timeout
    
    // Try a simple HEAD request or OPTIONS to check if server is responding
    const response = await fetch(localUrl, {
      method: 'OPTIONS',
      signal: controller.signal
    });
    
    clearTimeout(timeoutId);
    // Accept any response from the server (even errors) as it means server is running
    const available = response.status !== undefined;
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
  if (import.meta.env.VITE_API) {
    console.log('🌐 Using VITE_API_BASE:', import.meta.env.VITE_API);
    return import.meta.env.VITE_API;
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

/**
 * Get current project ID from localStorage
 * Used to add X-Project-ID header to API requests for multi-tenancy
 */
function getCurrentProjectId(): string | null {
  try {
    return localStorage.getItem('currentProjectId');
  } catch (error) {
    console.warn('Failed to get current project ID:', error);
    return null;
  }
}

/**
 * Build API request headers with authentication and project context
 * Automatically adds X-Project-ID header for multi-tenancy support
 * 
 * @param token - Authentication token
 * @param additionalHeaders - Any additional headers to include
 * @returns Headers object with Authorization and X-Project-ID
 */
export function buildApiHeaders(token: string, additionalHeaders: Record<string, string> = {}): Record<string, string> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${token}`,
    ...additionalHeaders
  };
  
  // Add project ID header for multi-tenancy
  const projectId = getCurrentProjectId();
  if (projectId) {
    headers['X-Project-ID'] = projectId;
  }
  
  return headers;
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
  guardrailFailed?: boolean;  // Flag to indicate content was filtered by guardrails
  guardrailReason?: string;   // Reason for guardrail filtering
  guardrailViolations?: any;  // Detailed violation data
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
  // Manual stop support
  wasStopped?: boolean;              // Flag indicating request was manually stopped by user
  partialCost?: number;              // Cost calculated from partial tokens received before stop
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
    base64?: string;                 // Base64 encoded image data (for inline display)
    llmApiCall?: any;                // LLM API call data for generation
    status: 'pending' | 'generating' | 'downloading' | 'complete' | 'error';  // Generation status
    phase?: string;                  // Generation phase ('selecting_provider', 'generating', 'completed', 'error')
    estimatedSeconds?: number;       // Estimated time to completion in seconds
    revisedPrompt?: string;          // Revised prompt from provider (e.g., DALL-E)
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
  voiceMode?: boolean; // Enable dual response format (short for TTS, long for display)
  imageQuality?: 'low' | 'medium' | 'high'; // Default image generation quality preference
  useLocalWhisper?: boolean; // Try local Whisper service first (for local development)
  localWhisperUrl?: string; // URL of local Whisper service (e.g., http://localhost:8000)
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
    headers: buildApiHeaders(token),
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
  onEvent: (_event: string, _data: any) => void,
  onComplete?: () => void,
  onError?: (_error: Error) => void,
  options?: {
    temperature?: number;
    maxTokens?: number;
    reasoningDepth?: number;
    clarificationAnswers?: string; // User's answers to clarification questions
    previousContext?: any; // Context from previous clarification request
    signal?: AbortSignal; // Abort signal for cancellation
    forcePlan?: boolean; // Force generation of system and user prompts even if more questions are needed
    language?: string; // User's preferred language for responses (ISO 639-1 code)
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
  
  // Add clarification data if provided
  if (options?.clarificationAnswers) {
    requestBody.clarificationAnswers = options.clarificationAnswers;
  }
  if (options?.previousContext) {
    requestBody.previousContext = options.previousContext;
  }
  
  // Add force plan flag if provided
  if (options?.forcePlan) {
    requestBody.forcePlan = true;
  }
  
  // Add language preference
  if (options?.language) {
    requestBody.language = options.language;
  }
  
  const response = await createSSERequest(
    `${apiBase}/planning`,
    requestBody,
    token,
    options?.signal // Pass abort signal
  );
  
  await handleSSEResponse(response, onEvent, onComplete, onError);
};

// Search endpoint (SSE streaming)
export const performSearch = async (
  queries: string[],
  token: string,
  options: { maxResults?: number; includeContent?: boolean } = {},
  onEvent: (_event: string, _data: any) => void,
  onComplete?: () => void,
  onError?: (_error: Error) => void
): Promise<void> => {
  // Check cache for each query
  if (cache.isEnabled() && queries.length === 1) {
    try {
      const cachedResults = await cache.getSearchResults(queries[0]);
      
      if (cachedResults) {
        // Send cached results through event handler
        onEvent('search_results', { results: cachedResults });
        onEvent('complete', { cached: true });
        
        if (onComplete) {
          onComplete();
        }
        
        return; // Return early with cached results
      }
    } catch (error) {
      console.error('Cache lookup failed for search, continuing with API call:', error);
    }
  }
  
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
  
  // Collect search results for caching
  let collectedResults: any[] = [];
  
  const wrappedOnEvent = (event: string, data: any) => {
    // Collect search results for caching
    if (cache.isEnabled() && event === 'search_results') {
      collectedResults = data.results || [];
    }
    
    // Call original event handler
    onEvent(event, data);
  };
  
  const wrappedOnComplete = async () => {
    // Cache the search results (async, don't block)
    if (cache.isEnabled() && queries.length === 1 && collectedResults.length > 0) {
      try {
        await cache.setSearchResults(queries[0], collectedResults);
      } catch (error) {
        console.error('Failed to cache search results:', error);
      }
    }
    
    // Call original completion handler
    if (onComplete) {
      onComplete();
    }
  };
  
  await handleSSEResponse(response, wrappedOnEvent, wrappedOnComplete, onError);
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
  onEvent: (_event: string, _data: any) => void,
  onComplete?: () => void,
  onError?: (_error: Error) => void,
  signal?: AbortSignal,
  youtubeToken?: string | null,
  requestId?: string | null  // Optional request ID for grouping logs (e.g., from voice transcription)
): Promise<void> => {
  // Check cache first (only for non-streaming requests without tools)
  if (!request.stream && !request.tools && cache.isEnabled()) {
    try {
      const cachedResponse = await cache.getLLMResponse(request.messages);
      
      if (cachedResponse) {
        // Simulate streaming events from cached response
        onEvent('content', { content: cachedResponse.content });
        onEvent('complete', { 
          response: cachedResponse,
          usage: cachedResponse.usage,
          model: cachedResponse.model,
          cached: true
        });
        
        if (onComplete) {
          onComplete();
        }
        
        return; // Return early with cached response
      }
    } catch (error) {
      console.error('Cache lookup failed, continuing with API call:', error);
      // Continue with normal API call if cache fails
    }
  }
  
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
  
  // Collect response for caching (if caching is enabled and no tools)
  let collectedContent = '';
  let collectedUsage: any = null;
  let collectedModel: string | undefined = undefined;
  
  const wrappedOnEvent = (event: string, data: any) => {
    // Collect response data for caching
    if (cache.isEnabled() && !request.tools) {
      if (event === 'content') {
        collectedContent += data.content || '';
      }
      if (event === 'complete') {
        collectedUsage = data.usage;
        collectedModel = data.model;
      }
    }
    
    // Call original event handler
    onEvent(event, data);
  };
  
  const wrappedOnComplete = async () => {
    // Cache the response (async, don't block)
    if (cache.isEnabled() && !request.tools && collectedContent) {
      try {
        await cache.setLLMResponse(
          request.messages,
          {
            role: 'assistant',
            content: collectedContent
          },
          collectedUsage,
          collectedModel
        );
      } catch (error) {
        console.error('Failed to cache response:', error);
      }
    }
    
    // Call original completion handler
    if (onComplete) {
      onComplete();
    }
  };
  
  await handleSSEResponse(response, wrappedOnEvent, wrappedOnComplete, onError);
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
  cost?: number;
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
      headers: buildApiHeaders(token || ''),
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

// PayPal Credit Purchase
export const createPayPalOrder = async (amount: number, token: string): Promise<{
  success: boolean;
  orderId?: string;
  error?: string;
}> => {
  const apiBase = await getCachedApiBase();
  
  try {
    const response = await fetch(`${apiBase}/paypal/create-order`, {
      method: 'POST',
      headers: buildApiHeaders(token),
      body: JSON.stringify({ amount }),
      credentials: 'include'
    });
    
    const data = await response.json();
    
    if (!response.ok) {
      return {
        success: false,
        error: data.error || `HTTP ${response.status}: ${response.statusText}`
      };
    }
    
    return {
      success: true,
      orderId: data.orderId
    };
  } catch (error: any) {
    console.error('PayPal order creation failed:', error);
    return {
      success: false,
      error: error.message || 'Failed to create PayPal order'
    };
  }
};

export const capturePayPalOrder = async (orderId: string, token: string): Promise<{
  success: boolean;
  creditsAdded?: number;
  newBalance?: number;
  error?: string;
}> => {
  const apiBase = await getCachedApiBase();
  
  try {
    const response = await fetch(`${apiBase}/paypal/capture-order`, {
      method: 'POST',
      headers: buildApiHeaders(token),
      body: JSON.stringify({ orderId }),
      credentials: 'include'
    });
    
    const data = await response.json();
    
    if (!response.ok) {
      return {
        success: false,
        error: data.error || `HTTP ${response.status}: ${response.statusText}`
      };
    }
    
    return {
      success: true,
      creditsAdded: data.creditsAdded,
      newBalance: data.newBalance
    };
  } catch (error: any) {
    console.error('PayPal order capture failed:', error);
    return {
      success: false,
      error: error.message || 'Failed to capture PayPal order'
    };
  }
};

/**
 * Generate quiz from content
 */
export interface QuizChoice {
  id: string;
  text: string;
}

export interface QuizQuestion {
  id: string;
  prompt: string;
  choices: QuizChoice[];
  answerId: string;
  explanation?: string;
}

export interface Quiz {
  title: string;
  questions: QuizQuestion[];
}

export const generateQuiz = async (
  content: string,
  enrichment: boolean,
  providers: Record<string, any>,
  token: string
): Promise<Quiz> => {
  const apiBase = await getCachedApiBase();
  
  const response = await fetch(`${apiBase}/quiz/generate`, {
    method: 'POST',
    headers: buildApiHeaders(token),
    body: JSON.stringify({
      content,
      enrichment,
      providers
    }),
    credentials: 'include'
  });
  
  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: 'Unknown error' }));
    throw new Error(error.error || `HTTP ${response.status}: ${response.statusText}`);
  }
  
  return await response.json();
};

/**
 * Get providers configured in backend environment variables
 */
export interface BackendProvider {
  id: string;
  type: string;
  enabled: boolean;
  source: string;
  priority?: number;
  apiEndpoint?: string;
  modelName?: string;
  rateLimitTPM?: number;
  allowedModels?: string[];
  maxQuality?: string;
  // NOTE: API keys are NEVER sent from backend (security)
}

export const getBackendProviders = async (): Promise<BackendProvider[]> => {
  try {
    const apiBase = await getCachedApiBase();
    
    const response = await fetch(`${apiBase}/providers`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json'
      }
    });
    
    if (!response.ok) {
      console.error('Failed to fetch backend providers:', response.status, response.statusText);
      return [];
    }
    
    const data = await response.json();
    console.log(`✅ Fetched ${data.count} backend providers`);
    return data.providers || [];
  } catch (error) {
    console.error('Error fetching backend providers:', error);
    return [];
  }
};

