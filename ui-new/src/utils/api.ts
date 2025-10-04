// API client for Lambda endpoints
const API_BASE = import.meta.env.VITE_API_BASE || '';

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
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
  token: string
): Promise<Response> => {
  const response = await fetch(`${API_BASE}/proxy`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`
    },
    body: JSON.stringify(request)
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
  onEvent: (event: string, data: any) => void,
  onComplete?: () => void,
  onError?: (error: Error) => void
): Promise<void> => {
  const { createSSERequest, handleSSEResponse } = await import('./streaming');
  
  const response = await createSSERequest(
    `${API_BASE}/planning`,
    { query },
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
