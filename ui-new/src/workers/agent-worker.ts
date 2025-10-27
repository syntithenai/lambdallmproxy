/**
 * Agent Worker - Background execution for concurrent agents
 * 
 * Runs in a separate Web Worker thread to enable:
 * - Non-blocking agent execution
 * - Tab-safe operation (continues when tab is inactive)
 * - Crash isolation (worker crash doesn't affect main thread)
 */

import type { AgentState, AgentWorkerMessage } from '../types/agent';

// Worker state
let currentAgent: AgentState | null = null;
let abortController: AbortController | null = null;

/**
 * Handle messages from main thread
 */
self.addEventListener('message', async (event: MessageEvent<AgentWorkerMessage>) => {
  const { type, payload } = event.data;
  
  try {
    switch (type) {
      case 'START_AGENT':
        if (payload?.agent) {
          currentAgent = payload.agent;
          await executeAgent(currentAgent);
        }
        break;
        
      case 'PAUSE_AGENT':
        if (abortController) {
          abortController.abort();
        }
        if (currentAgent) {
          postMessage({
            type: 'AGENT_PAUSED',
            payload: { agent: currentAgent }
          });
        }
        break;
        
      case 'ABORT_AGENT':
        if (abortController) {
          abortController.abort();
        }
        if (currentAgent) {
          currentAgent.status = 'aborted';
          postMessage({
            type: 'AGENT_ABORTED',
            payload: { agent: currentAgent }
          });
        }
        break;
    }
  } catch (error) {
    console.error('Worker message handling error:', error);
    if (currentAgent) {
      currentAgent.status = 'error';
      currentAgent.lastError = error instanceof Error ? error.message : 'Unknown error';
      postMessage({
        type: 'AGENT_ERROR',
        payload: { agent: currentAgent }
      });
    }
  }
});

/**
 * Execute agent iterations until completion
 */
async function executeAgent(agent: AgentState): Promise<void> {
  try {
    while (agent.iterationCount < agent.maxIterations && agent.status === 'running') {
      // Create new abort controller for each iteration
      abortController = new AbortController();
      
      // Update phase
      agent.phase = 'thinking';
      agent.lastUpdateTime = Date.now();
      postMessage({
        type: 'AGENT_UPDATE',
        payload: { agent }
      });
      
      // Get API base URL from worker-specific storage or use default
      const apiBase = await getApiBase();
      
      // Prepare request body
      const requestBody = {
        messages: agent.messages,
        stream: true,
        continueSession: agent.iterationCount > 0
      };
      
      // Call backend /chat endpoint
      const response = await fetch(`${apiBase}/chat`, {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          // Note: Auth token should be passed from main thread if needed
        },
        body: JSON.stringify(requestBody),
        signal: abortController.signal
      });
      
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
      
      // Process SSE stream
      await processSSEStream(agent, response);
      
      // Increment iteration
      agent.iterationCount++;
      agent.lastUpdateTime = Date.now();
      
      postMessage({
        type: 'AGENT_UPDATE',
        payload: { agent }
      });
      
      // Check if agent has more work to do
      // (In a real implementation, we'd check if the LLM indicated completion)
      const lastMessage = agent.messages[agent.messages.length - 1];
      if (lastMessage && lastMessage.role === 'assistant' && !lastMessage.tool_calls) {
        // Assistant responded without tool calls - conversation complete
        break;
      }
    }
    
    // Completion
    agent.status = 'completed';
    agent.completedAt = Date.now();
    postMessage({
      type: 'AGENT_COMPLETED',
      payload: { agent }
    });
    
  } catch (error: any) {
    if (error.name === 'AbortError') {
      // Paused by user
      agent.status = 'paused';
      postMessage({
        type: 'AGENT_PAUSED',
        payload: { agent }
      });
    } else {
      // Error
      agent.status = 'error';
      agent.lastError = error.message || 'Unknown error';
      postMessage({
        type: 'AGENT_ERROR',
        payload: { agent }
      });
    }
  }
}

/**
 * Process Server-Sent Events stream
 */
async function processSSEStream(agent: AgentState, response: Response): Promise<void> {
  const reader = response.body?.getReader();
  if (!reader) {
    throw new Error('No response body');
  }
  
  const decoder = new TextDecoder();
  let buffer = '';
  let currentAssistantMessage: any = null;
  
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || ''; // Keep incomplete line in buffer
      
      for (const line of lines) {
        if (!line.startsWith('data: ')) continue;
        
        try {
          const data = JSON.parse(line.slice(6));
          
          // Handle different SSE event types
          switch (data.event) {
            case 'content':
              agent.phase = 'streaming';
              
              // Append to current assistant message or create new one
              if (!currentAssistantMessage) {
                currentAssistantMessage = {
                  role: 'assistant',
                  content: data.content || ''
                };
                agent.messages.push(currentAssistantMessage);
              } else {
                currentAssistantMessage.content += data.content || '';
              }
              
              // Update token count if available
              if (data.usage) {
                agent.tokenCount += (data.usage.prompt_tokens || 0) + (data.usage.completion_tokens || 0);
              }
              break;
              
            case 'tool_call':
              agent.phase = 'tool_execution';
              agent.toolCallsCount++;
              
              // Track tool calls in message
              if (currentAssistantMessage) {
                if (!currentAssistantMessage.tool_calls) {
                  currentAssistantMessage.tool_calls = [];
                }
                currentAssistantMessage.tool_calls.push(data.tool_call);
              }
              break;
              
            case 'tool_result':
              // Add tool result as separate message
              agent.messages.push({
                role: 'tool',
                content: data.result,
                tool_call_id: data.tool_call_id
              });
              break;
              
            case 'done':
              // Stream complete
              agent.phase = 'waiting';
              break;
              
            case 'error':
              throw new Error(data.error || 'Stream error');
          }
          
          // Send updates to main thread periodically
          agent.lastUpdateTime = Date.now();
          postMessage({
            type: 'AGENT_UPDATE',
            payload: { agent }
          });
          
        } catch (parseError) {
          console.warn('Failed to parse SSE data:', line, parseError);
        }
      }
    }
  } finally {
    reader.releaseLock();
  }
}

/**
 * Get API base URL
 * In a real implementation, this would be passed from the main thread
 */
async function getApiBase(): Promise<string> {
  // Check if running locally (development)
  try {
    const healthCheck = await fetch('http://localhost:3000/health', {
      method: 'HEAD',
      signal: AbortSignal.timeout(1000) // 1 second timeout
    });
    if (healthCheck.ok) {
      return 'http://localhost:3000';
    }
  } catch {
    // Local server not available, use production
  }
  
  // Production Lambda URL (should be passed from main thread)
  return 'https://your-lambda-url.lambda-url.us-east-1.on.aws';
}

/**
 * Log worker info on startup
 */
console.log('🤖 Agent Worker initialized');
