/**
 * Image Edit API Client
 * Handles communication with the /image-edit and /parse-image-command endpoints
 */

import { getCachedApiBase } from '../../utils/api';
import type { BulkOperation } from './types';

export interface ImageEditRequest {
  images: Array<{ id: string; url: string }>;
  operations: Array<{
    type: 'resize' | 'rotate' | 'flip' | 'format' | 'filter';
    params: any;
  }>;
}

export interface ProgressEvent {
  type: 'started' | 'image_start' | 'progress' | 'image_complete' | 'image_error' | 'complete' | 'error';
  imageId?: string;
  imageIndex?: number;
  totalImages?: number;
  status?: string;
  progress?: number;
  currentOperation?: string;
  message?: string;
  result?: {
    success: boolean;
    url: string;
    appliedOperations: string[];
    size: number;
    dimensions?: { width: number; height: number };
    format?: string;
  };
  error?: string;
  results?: any[];
  successCount?: number;
  errorCount?: number;
}

export type ProgressCallback = (event: ProgressEvent) => void;

/**
 * Call the image-edit API endpoint with SSE streaming
 * @param request - Image edit request
 * @param onProgress - Progress callback function
 * @returns Promise that resolves when processing is complete
 */
export async function editImages(
  request: ImageEditRequest,
  onProgress: ProgressCallback
): Promise<void> {
  const apiBase = await getCachedApiBase();
  const url = `${apiBase}/image-edit`;

  // Get Google OAuth token
  const googleToken = localStorage.getItem('google_oauth_token');

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(googleToken ? { 'X-Google-OAuth-Token': googleToken } : {}),
    },
    body: JSON.stringify(request),
  });

  if (!response.ok) {
    throw new Error(`HTTP error! status: ${response.status}`);
  }

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
        break;
      }

      // Decode chunk and add to buffer
      buffer += decoder.decode(value, { stream: true });

      // Process complete messages (SSE format: "data: {...}\n\n")
      const lines = buffer.split('\n\n');
      buffer = lines.pop() || ''; // Keep incomplete message in buffer

      for (const line of lines) {
        if (line.startsWith('data: ')) {
          const data = line.substring(6); // Remove "data: " prefix
          try {
            const event: ProgressEvent = JSON.parse(data);
            onProgress(event);

            // If error or complete, we can stop
            if (event.type === 'error' || event.type === 'complete') {
              return;
            }
          } catch (error) {
            console.error('Failed to parse SSE event:', error, data);
          }
        }
      }
    }
  } finally {
    reader.releaseLock();
  }
}

/**
 * Parse natural language image editing command using LLM
 * @param command - Natural language command (e.g., "make it smaller and rotate right")
 * @returns Promise that resolves with parsed operations
 */
export async function parseImageCommand(command: string): Promise<{
  success: boolean;
  operations: BulkOperation[];
  explanation: string;
  error?: string;
}> {
  const apiBase = await getCachedApiBase();
  const url = `${apiBase}/parse-image-command`;

  // Get Google OAuth token
  const googleToken = localStorage.getItem('google_oauth_token');

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(googleToken ? { 'X-Google-OAuth-Token': googleToken } : {}),
    },
    body: JSON.stringify({ command }),
  });

  if (!response.ok) {
    throw new Error(`HTTP error! status: ${response.status}`);
  }

  return await response.json();
}
