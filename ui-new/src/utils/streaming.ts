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
 * Create an SSE streaming request
 * @param url - Endpoint URL
 * @param body - Request body
 * @param token - Authorization token
 * @param signal - AbortSignal for cancellation (optional)
 * @param youtubeToken - Optional YouTube OAuth access token
 * @returns Fetch response promise
 */
export async function createSSERequest(
  url: string,
  body: any,
  token: string,
  signal?: AbortSignal,
  youtubeToken?: string | null
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

  const response = await fetch(url, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
    signal
  });

  if (!response.ok) {
    throw new Error(`Request failed: ${response.status} ${response.statusText}`);
  }

  return response;
}
