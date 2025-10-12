/**
 * Server-Sent Events (SSE) streaming utilities
 * Handles streaming responses from Lambda endpoints
 */

export interface SSEEvent {
  event: string;
  data: any;
}

export type SSEEventHandler = (event: string, data: any) => void;

/**
 * Parse SSE text into event objects
 * @param text - Raw SSE text
 * @returns Array of parsed events
 */
function parseSSEEvents(text: string): SSEEvent[] {
  const events: SSEEvent[] = [];
  const lines = text.split('\n');
  
  let currentEvent: { event?: string; data?: string } = {};
  
  for (const line of lines) {
    if (line.startsWith('event:')) {
      currentEvent.event = line.substring(6).trim();
    } else if (line.startsWith('data:')) {
      currentEvent.data = line.substring(5).trim();
    } else if (line === '' && currentEvent.event && currentEvent.data) {
      // Empty line signals end of event
      try {
        const parsedData = JSON.parse(currentEvent.data);
        events.push({
          event: currentEvent.event,
          data: parsedData
        });
      } catch (error) {
        console.error('Failed to parse SSE data:', currentEvent.data, error);
      }
      currentEvent = {};
    }
  }
  
  return events;
}

/**
 * Handle SSE response from fetch
 * @param response - Fetch response object
 * @param onEvent - Callback for each SSE event
 * @param onComplete - Callback when stream completes
 * @param onError - Callback for errors
 */
export async function handleSSEResponse(
  response: Response,
  onEvent: SSEEventHandler,
  onComplete?: () => void,
  onError?: (error: Error) => void
): Promise<void> {
  if (!response.body) {
    throw new Error('Response body is null');
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  try {
    while (true) {
      const { done, value } = await reader.read();
      
      if (done) {
        // Process any remaining buffer
        if (buffer.trim()) {
          const events = parseSSEEvents(buffer);
          events.forEach(e => onEvent(e.event, e.data));
        }
        if (onComplete) {
          onComplete();
        }
        break;
      }

      // Append chunk to buffer
      buffer += decoder.decode(value, { stream: true });

      // Process complete events from buffer
      const lines = buffer.split('\n\n');
      
      // Keep the last incomplete part in the buffer
      buffer = lines.pop() || '';
      
      // Process complete events
      for (const eventText of lines) {
        if (eventText.trim()) {
          const events = parseSSEEvents(eventText + '\n\n');
          events.forEach(e => onEvent(e.event, e.data));
        }
      }
    }
  } catch (error) {
    console.error('SSE stream error:', error);
    if (onError) {
      onError(error instanceof Error ? error : new Error('Stream error'));
    }
  }
}

/**
 * Create an SSE request with proper headers and retry logic
 * @param url - The URL to request
 * @param body - Request body
 * @param token - Auth token
 * @param signal - AbortSignal for cancellation
 * @param youtubeToken - Optional YouTube OAuth access token
 * @param maxRetries - Maximum number of retry attempts (default: 3)
 * @param initialRetryDelay - Initial retry delay in ms (default: 1000)
 * @returns Fetch response promise
 */
export async function createSSERequest(
  url: string,
  body: any,
  token: string,
  signal?: AbortSignal,
  youtubeToken?: string | null,
  maxRetries: number = 3,
  initialRetryDelay: number = 1000
): Promise<Response> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${token}`,
    'Accept': 'text/event-stream'
  };

  // Add YouTube OAuth token if available
  if (youtubeToken) {
    headers['X-YouTube-Token'] = youtubeToken;
  }

  let lastError: Error | null = null;
  
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      const response = await fetch(url, {
        method: 'POST',
        headers,
        body: JSON.stringify(body),
        signal
      });

      if (!response.ok) {
        // Handle 429 Rate Limit with retry
        if (response.status === 429 && attempt < maxRetries - 1) {
          // Check for Retry-After header (can be in seconds or HTTP date)
          const retryAfterHeader = response.headers.get('Retry-After');
          let delay: number;
          
          if (retryAfterHeader) {
            // Try parsing as seconds first
            const retryAfterSeconds = parseInt(retryAfterHeader);
            if (!isNaN(retryAfterSeconds)) {
              delay = retryAfterSeconds * 1000;
            } else {
              // Try parsing as HTTP date
              const retryAfterDate = new Date(retryAfterHeader);
              if (!isNaN(retryAfterDate.getTime())) {
                delay = Math.max(0, retryAfterDate.getTime() - Date.now());
              } else {
                // Fallback to exponential backoff
                delay = initialRetryDelay * Math.pow(2, attempt);
              }
            }
          } else {
            // Exponential backoff: 1s, 2s, 4s...
            delay = initialRetryDelay * Math.pow(2, attempt);
          }
          
          console.warn(`⚠️ Rate limited (429), retrying in ${(delay / 1000).toFixed(1)}s... (attempt ${attempt + 1}/${maxRetries})`);
          
          // Wait before retrying
          await new Promise(resolve => setTimeout(resolve, delay));
          continue; // Retry the request
        }
        
        // For non-429 errors or last attempt, throw immediately
        throw new Error(`Request failed: ${response.status} ${response.statusText}`);
      }

      // Success - return the response
      return response;
      
    } catch (error) {
      lastError = error as Error;
      
      // Don't retry on abort signal
      if (signal?.aborted) {
        throw new Error('Request aborted by user');
      }
      
      // Don't retry on last attempt
      if (attempt >= maxRetries - 1) {
        break;
      }
      
      // For network errors, use exponential backoff
      const delay = initialRetryDelay * Math.pow(2, attempt);
      console.warn(`⚠️ Request failed, retrying in ${(delay / 1000).toFixed(1)}s... (attempt ${attempt + 1}/${maxRetries})`, error);
      
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }

  // All retries exhausted
  throw lastError || new Error(`Request failed after ${maxRetries} attempts`);
}
