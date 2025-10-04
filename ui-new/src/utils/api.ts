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

// Planning endpoint
export const generatePlan = async (
  query: string,
  token: string
): Promise<any> => {
  const response = await fetch(`${API_BASE}/planning`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`
    },
    body: JSON.stringify({ query })
  });
  
  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || 'Planning request failed');
  }
  
  return response.json();
};

// Search endpoint
export const performSearch = async (
  queries: string[],
  token: string,
  options: { maxResults?: number; includeContent?: boolean } = {}
): Promise<SearchResult[]> => {
  const response = await fetch(`${API_BASE}/search`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`
    },
    body: JSON.stringify({
      queries,
      maxResults: options.maxResults || 5,
      includeContent: options.includeContent !== false
    })
  });
  
  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || 'Search request failed');
  }
  
  return response.json();
};
