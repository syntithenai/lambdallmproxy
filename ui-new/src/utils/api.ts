// API client for Lambda endpoints
const API_BASE = import.meta.env.VITE_API_BASE || 'https://nrw7pperjjdswbmqgmigbwsbyi0rwdqf.lambda-url.us-east-1.on.aws';

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string;
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
  isStreaming?: boolean;  // Flag to indicate message is currently being streamed
  llmApiCalls?: Array<{   // LLM API transparency data for this message
    phase: string;
    model: string;
    request: any;
    response?: any;
    httpHeaders?: any;    // HTTP response headers from LLM API
    httpStatus?: number;  // HTTP status code from LLM API
    timestamp: string;
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
  const response = await fetch(`${API_BASE}/proxy`, {
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
  const { createSSERequest, handleSSEResponse } = await import('./streaming');
  
  const requestBody: any = { query };
  
  // Only add model if provided (server will use default if not provided)
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
    `${API_BASE}/planning`,
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
  const { createSSERequest, handleSSEResponse } = await import('./streaming');
  
  const response = await createSSERequest(
    `${API_BASE}/search`,
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
  request: ProxyRequest & { tools?: any[] },
  token: string,
  onEvent: (event: string, data: any) => void,
  onComplete?: () => void,
  onError?: (error: Error) => void,
  signal?: AbortSignal
): Promise<void> => {
  const { createSSERequest, handleSSEResponse } = await import('./streaming');
  
  const response = await createSSERequest(
    `${API_BASE}/chat`,
    request,
    token,
    signal
  );
  
  await handleSSEResponse(response, onEvent, onComplete, onError);
};
