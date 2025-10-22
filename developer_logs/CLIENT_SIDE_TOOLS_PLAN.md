# Client-Side Tools Implementation Plan ⚙️

## Overview

Implement client-side tool execution where the LLM can call tools that run in the browser instead of on the Lambda backend. The system intercepts tool calls from the event stream, executes them locally, injects results, and resubmits the request.

**Key Innovation:** LLM outputs client tool requests first, stream is scanned in real-time, and execution happens client-side with immediate result injection.

**Initial Tools:**
1. ✅ `run_javascript` - Execute arbitrary JavaScript code (sandboxed)
2. ✅ `wait_and_retry` - Delay execution and retry request

---

## Security Warning ⚠️

**`run_javascript` is DANGEROUS!**
- Allows execution of arbitrary code in user's browser
- Potential for XSS, data theft, malicious actions
- **MUST** be explicitly enabled by user with clear warnings
- **MUST** run in sandboxed environment
- **MUST** have timeout protection
- Consider limiting to safe subset of JavaScript

**Mitigation Strategies:**
1. Disabled by default
2. Explicit opt-in with warning dialog
3. Sandboxed execution (Web Worker or iframe)
4. API whitelist (only safe APIs exposed)
5. Timeout protection (max 10 seconds)
6. Result size limits (max 10KB)
7. Audit logging of all executions
8. User can review code before execution (optional)

---

## Architecture Design

### High-Level Flow

```
[User submits prompt]
      ↓
[Add client tools to request if enabled]
      ↓
[Send to Lambda /api/chat]
      ↓
[SSE Stream starts]
      ↓
[Monitor stream for tool_calls event]
      ↓
[Detect client tool call] ← Check tool.function.name
      ↓
[ABORT STREAM IMMEDIATELY] ← Critical!
      ↓
[Execute tool on client]
      ↓
[Get tool result]
      ↓
[Inject result into messages array]
      ↓
[Resubmit request to Lambda]
      ↓
[Process continues normally]
```

### Stream Interception

```typescript
// In SSE event listener
eventSource.addEventListener('tool_call_start', (event) => {
  const data = JSON.parse(event.data);
  const toolCall = data;
  
  // Check if this is a client-side tool
  if (isClientTool(toolCall.name)) {
    // ABORT STREAM
    eventSource.close();
    
    // Execute client tool
    executeClientTool(toolCall).then(result => {
      // Inject result and resubmit
      resubmitWithToolResult(toolCall, result);
    });
  }
});
```

---

## Implementation Phases

### **Phase 1: Client Tool Infrastructure** (4 hours)

#### 1.1 Client Tool Registry
**File:** `ui-new/src/services/clientTools/ClientToolRegistry.ts`

```typescript
export interface ClientTool {
  name: string;
  description: string;
  parameters: {
    type: 'object';
    properties: Record<string, any>;
    required?: string[];
  };
  isEnabled: () => boolean;
  execute: (args: any) => Promise<any>;
  isDestructive: boolean; // Requires extra warning
}

export class ClientToolRegistry {
  private tools: Map<string, ClientTool> = new Map();
  
  register(tool: ClientTool): void {
    this.tools.set(tool.name, tool);
  }
  
  get(name: string): ClientTool | undefined {
    return this.tools.get(name);
  }
  
  isClientTool(name: string): boolean {
    return this.tools.has(name);
  }
  
  getEnabledTools(): ClientTool[] {
    return Array.from(this.tools.values())
      .filter(tool => tool.isEnabled());
  }
  
  /**
   * Get OpenAI-compatible tool definitions for enabled tools
   */
  getToolDefinitions(): any[] {
    return this.getEnabledTools().map(tool => ({
      type: 'function',
      function: {
        name: tool.name,
        description: tool.description,
        parameters: tool.parameters
      }
    }));
  }
}

// Singleton instance
export const clientToolRegistry = new ClientToolRegistry();
```

#### 1.2 JavaScript Sandbox
**File:** `ui-new/src/services/clientTools/JavaScriptSandbox.ts`

```typescript
/**
 * Sandboxed JavaScript execution using Web Worker
 * Isolated from main thread, limited API access
 */
export class JavaScriptSandbox {
  private worker: Worker | null = null;
  private timeoutMs: number = 10000; // 10 seconds
  
  /**
   * Execute JavaScript code in sandboxed environment
   */
  async execute(code: string): Promise<any> {
    return new Promise((resolve, reject) => {
      // Create worker from inline code
      const workerCode = `
        // Sandboxed globals (whitelist only safe APIs)
        const safeGlobals = {
          console: {
            log: (...args) => self.postMessage({ type: 'log', data: args }),
            error: (...args) => self.postMessage({ type: 'error', data: args })
          },
          Math: Math,
          Date: Date,
          JSON: JSON,
          Array: Array,
          Object: Object,
          String: String,
          Number: Number,
          Boolean: Boolean,
          
          // Async support
          setTimeout: (fn, delay) => setTimeout(fn, Math.min(delay, 5000)), // Max 5s
          Promise: Promise,
          
          // Fetch (with restrictions)
          fetch: async (url, options) => {
            // Only allow GET requests
            if (options?.method && options.method !== 'GET') {
              throw new Error('Only GET requests allowed');
            }
            return fetch(url, { ...options, method: 'GET' });
          }
        };
        
        // Execute user code in sandboxed context
        self.onmessage = async (e) => {
          try {
            // Create function with sandboxed globals
            const fn = new Function(
              ...Object.keys(safeGlobals),
              \`
                'use strict';
                return (async () => {
                  \${e.data.code}
                })();
              \`
            );
            
            // Execute with sandboxed globals
            const result = await fn(...Object.values(safeGlobals));
            
            self.postMessage({ type: 'result', data: result });
          } catch (error) {
            self.postMessage({ 
              type: 'error', 
              data: error.message || String(error) 
            });
          }
        };
      `;
      
      const blob = new Blob([workerCode], { type: 'application/javascript' });
      const workerUrl = URL.createObjectURL(blob);
      
      this.worker = new Worker(workerUrl);
      
      // Setup timeout
      const timeout = setTimeout(() => {
        this.worker?.terminate();
        reject(new Error('JavaScript execution timeout (10 seconds)'));
      }, this.timeoutMs);
      
      // Handle messages
      this.worker.onmessage = (e) => {
        clearTimeout(timeout);
        
        if (e.data.type === 'result') {
          this.worker?.terminate();
          URL.revokeObjectURL(workerUrl);
          
          // Limit result size
          const resultStr = JSON.stringify(e.data.data);
          if (resultStr.length > 10000) {
            resolve(resultStr.substring(0, 10000) + '... (truncated)');
          } else {
            resolve(e.data.data);
          }
        } else if (e.data.type === 'error') {
          this.worker?.terminate();
          URL.revokeObjectURL(workerUrl);
          reject(new Error(e.data.data));
        }
        // Ignore 'log' type messages for now
      };
      
      this.worker.onerror = (error) => {
        clearTimeout(timeout);
        this.worker?.terminate();
        URL.revokeObjectURL(workerUrl);
        reject(new Error(`Worker error: ${error.message}`));
      };
      
      // Send code to worker
      this.worker.postMessage({ code });
    });
  }
  
  /**
   * Cleanup worker
   */
  destroy(): void {
    this.worker?.terminate();
    this.worker = null;
  }
}
```

#### 1.3 Client Tool Implementations
**File:** `ui-new/src/services/clientTools/tools/RunJavaScript.ts`

```typescript
import type { ClientTool } from '../ClientToolRegistry';
import { JavaScriptSandbox } from '../JavaScriptSandbox';

export const RunJavaScriptTool: ClientTool = {
  name: 'run_javascript',
  description: 'Execute JavaScript code on the client side. SECURITY WARNING: Only use for trusted code. The code runs in a sandboxed environment with limited API access.',
  parameters: {
    type: 'object',
    properties: {
      code: {
        type: 'string',
        description: 'The JavaScript code to execute. Must be valid JavaScript. Has access to: console, Math, Date, JSON, Array, Object, String, Number, Boolean, setTimeout (max 5s), Promise, fetch (GET only).'
      },
      description: {
        type: 'string',
        description: 'A brief description of what this code does (for user transparency)'
      }
    },
    required: ['code']
  },
  isDestructive: true,
  
  isEnabled: () => {
    const enabled = localStorage.getItem('clientTools_runJavaScript') === 'true';
    return enabled;
  },
  
  execute: async (args: { code: string; description?: string }) => {
    console.log('🔧 Executing client-side JavaScript:', args.description || 'No description');
    console.log('Code:', args.code);
    
    const sandbox = new JavaScriptSandbox();
    
    try {
      const result = await sandbox.execute(args.code);
      
      return {
        success: true,
        result: result,
        executedAt: new Date().toISOString(),
        description: args.description
      };
    } catch (error: any) {
      return {
        success: false,
        error: error.message || String(error),
        executedAt: new Date().toISOString(),
        description: args.description
      };
    } finally {
      sandbox.destroy();
    }
  }
};
```

**File:** `ui-new/src/services/clientTools/tools/WaitAndRetry.ts`

```typescript
import type { ClientTool } from '../ClientToolRegistry';

export const WaitAndRetryTool: ClientTool = {
  name: 'wait_and_retry',
  description: 'Wait for a specified duration before retrying the request. Useful for handling rate limits or waiting for async operations to complete.',
  parameters: {
    type: 'object',
    properties: {
      duration_ms: {
        type: 'number',
        description: 'Duration to wait in milliseconds (max 60000 = 1 minute)'
      },
      reason: {
        type: 'string',
        description: 'Reason for waiting (e.g., "Rate limit", "Waiting for async operation")'
      }
    },
    required: ['duration_ms']
  },
  isDestructive: false,
  
  isEnabled: () => {
    const enabled = localStorage.getItem('clientTools_waitAndRetry') === 'true';
    return enabled;
  },
  
  execute: async (args: { duration_ms: number; reason?: string }) => {
    // Cap at 1 minute
    const duration = Math.min(args.duration_ms, 60000);
    
    console.log(`⏱️ Waiting ${duration}ms before retry:`, args.reason || 'No reason given');
    
    const startTime = Date.now();
    
    await new Promise(resolve => setTimeout(resolve, duration));
    
    const endTime = Date.now();
    const actualDuration = endTime - startTime;
    
    return {
      success: true,
      waited_ms: actualDuration,
      reason: args.reason,
      timestamp: new Date().toISOString()
    };
  }
};
```

#### 1.4 Register Tools
**File:** `ui-new/src/services/clientTools/index.ts`

```typescript
import { clientToolRegistry } from './ClientToolRegistry';
import { RunJavaScriptTool } from './tools/RunJavaScript';
import { WaitAndRetryTool } from './tools/WaitAndRetry';

// Register all client tools
clientToolRegistry.register(RunJavaScriptTool);
clientToolRegistry.register(WaitAndRetryTool);

export { clientToolRegistry };
export type { ClientTool } from './ClientToolRegistry';
```

---

### **Phase 2: Stream Interception** (3 hours)

#### 2.1 Enhanced Chat API Hook
**File:** `ui-new/src/hooks/useChatStream.ts`

```typescript
import { useState, useCallback, useRef } from 'react';
import { clientToolRegistry } from '../services/clientTools';

interface UseChatStreamOptions {
  onMessage?: (message: any) => void;
  onToolCall?: (toolCall: any) => void;
  onError?: (error: Error) => void;
  onComplete?: () => void;
}

export function useChatStream(options: UseChatStreamOptions = {}) {
  const [isStreaming, setIsStreaming] = useState(false);
  const eventSourceRef = useRef<EventSource | null>(null);
  const messagesRef = useRef<any[]>([]);
  
  /**
   * Execute client-side tool and resubmit request
   */
  const executeClientToolAndRetry = useCallback(async (
    toolCall: any,
    currentMessages: any[],
    originalRequest: any
  ) => {
    try {
      console.log('🔧 Executing client tool:', toolCall.function.name);
      
      // Get tool from registry
      const tool = clientToolRegistry.get(toolCall.function.name);
      if (!tool) {
        throw new Error(`Client tool not found: ${toolCall.function.name}`);
      }
      
      // Parse arguments
      const args = JSON.parse(toolCall.function.arguments);
      
      // Execute tool
      const result = await tool.execute(args);
      
      // Create tool result message
      const toolResultMessage = {
        role: 'tool',
        tool_call_id: toolCall.id,
        name: toolCall.function.name,
        content: JSON.stringify(result)
      };
      
      // Inject result into messages
      const updatedMessages = [
        ...currentMessages,
        toolResultMessage
      ];
      
      // Resubmit request with tool result
      console.log('🔄 Resubmitting request with client tool result');
      await startStream({
        ...originalRequest,
        request: {
          ...originalRequest.request,
          messages: updatedMessages
        }
      });
      
    } catch (error: any) {
      console.error('❌ Client tool execution failed:', error);
      
      // Create error message
      const errorMessage = {
        role: 'tool',
        tool_call_id: toolCall.id,
        name: toolCall.function.name,
        content: JSON.stringify({
          success: false,
          error: error.message || String(error)
        })
      };
      
      // Inject error and resubmit
      const updatedMessages = [
        ...currentMessages,
        errorMessage
      ];
      
      await startStream({
        ...originalRequest,
        request: {
          ...originalRequest.request,
          messages: updatedMessages
        }
      });
    }
  }, []);
  
  /**
   * Start streaming chat response
   */
  const startStream = useCallback(async (requestBody: any) => {
    // Save request for potential retry
    const originalRequest = { ...requestBody };
    
    // Add client tool definitions if any tools are enabled
    const enabledTools = clientToolRegistry.getEnabledTools();
    if (enabledTools.length > 0) {
      const clientToolDefs = clientToolRegistry.getToolDefinitions();
      
      // Merge with existing tools
      const existingTools = requestBody.request.tools || [];
      requestBody.request.tools = [...clientToolDefs, ...existingTools];
      
      // Add system message about client tools
      const clientToolsSystemMsg = {
        role: 'system',
        content: `IMPORTANT: You have access to CLIENT-SIDE tools that run in the user's browser:
${enabledTools.map(t => `- ${t.name}: ${t.description}`).join('\n')}

When using client-side tools:
1. ALWAYS prefer client-side tools over server-side alternatives when appropriate
2. CALL CLIENT TOOLS FIRST before any other operations
3. Client tools will be executed immediately and results will be available in the next iteration

Client tools available: ${enabledTools.map(t => t.name).join(', ')}`
      };
      
      // Prepend to messages
      if (!requestBody.request.messages) {
        requestBody.request.messages = [];
      }
      requestBody.request.messages.unshift(clientToolsSystemMsg);
    }
    
    setIsStreaming(true);
    
    try {
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('jwt_token')}`
        },
        body: JSON.stringify(requestBody)
      });
      
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      
      // Create EventSource from response
      const reader = response.body?.getReader();
      if (!reader) throw new Error('No response body');
      
      const decoder = new TextDecoder();
      let buffer = '';
      
      const processStream = async () => {
        try {
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            
            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split('\n');
            buffer = lines.pop() || '';
            
            for (const line of lines) {
              if (!line.trim() || !line.startsWith('data: ')) continue;
              
              const data = line.substring(6);
              if (data === '[DONE]') continue;
              
              try {
                const event = JSON.parse(data);
                
                // Check for tool_call_start event
                if (event.type === 'tool_call_start') {
                  const toolName = event.name;
                  
                  // Check if this is a client-side tool
                  if (clientToolRegistry.isClientTool(toolName)) {
                    console.log('🎯 Detected client tool call:', toolName);
                    
                    // ABORT STREAM
                    reader.cancel();
                    
                    // Wait for tool_calls to be complete (need full arguments)
                    // We'll need to buffer until we get the complete tool_call
                    // For now, assume we have it in the event
                    const toolCall = {
                      id: event.id,
                      type: 'function',
                      function: {
                        name: event.name,
                        arguments: event.arguments
                      }
                    };
                    
                    // Execute client tool and retry
                    await executeClientToolAndRetry(
                      toolCall,
                      messagesRef.current,
                      originalRequest
                    );
                    
                    return; // Exit stream processing
                  }
                }
                
                // Normal event handling
                options.onMessage?.(event);
                
              } catch (parseError) {
                console.error('Failed to parse SSE event:', parseError);
              }
            }
          }
          
          options.onComplete?.();
        } catch (error: any) {
          console.error('Stream processing error:', error);
          options.onError?.(error);
        } finally {
          setIsStreaming(false);
        }
      };
      
      await processStream();
      
    } catch (error: any) {
      console.error('Chat stream error:', error);
      options.onError?.(error);
      setIsStreaming(false);
    }
  }, [executeClientToolAndRetry, options]);
  
  /**
   * Stop streaming
   */
  const stopStream = useCallback(() => {
    eventSourceRef.current?.close();
    eventSourceRef.current = null;
    setIsStreaming(false);
  }, []);
  
  return {
    isStreaming,
    startStream,
    stopStream
  };
}
```

---

### **Phase 3: Configuration UI** (2 hours)

#### 3.1 Client Tools Settings
**File:** `ui-new/src/components/ConfigurationPage.tsx` (add section)

```typescript
// Add to existing ConfigurationPage

export const ConfigurationPage: React.FC = () => {
  // ... existing state
  
  const [jsToolEnabled, setJsToolEnabled] = useState(
    localStorage.getItem('clientTools_runJavaScript') === 'true'
  );
  const [retryToolEnabled, setRetryToolEnabled] = useState(
    localStorage.getItem('clientTools_waitAndRetry') === 'true'
  );
  const [showJsWarning, setShowJsWarning] = useState(false);
  
  const handleEnableJavaScript = (enabled: boolean) => {
    if (enabled && !jsToolEnabled) {
      // Show warning dialog first
      setShowJsWarning(true);
    } else {
      // Disabling, no warning needed
      localStorage.setItem('clientTools_runJavaScript', 'false');
      setJsToolEnabled(false);
    }
  };
  
  const confirmEnableJavaScript = () => {
    localStorage.setItem('clientTools_runJavaScript', 'true');
    setJsToolEnabled(true);
    setShowJsWarning(false);
  };
  
  return (
    <div className="p-6 max-w-4xl mx-auto">
      {/* ... existing sections ... */}
      
      {/* Client-Side Tools Section */}
      <div className="card bg-white dark:bg-gray-800 p-6 mb-6">
        <h3 className="text-lg font-semibold mb-4">Client-Side Tools</h3>
        <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
          Enable tools that execute on your browser instead of the server. These tools allow the AI to perform actions locally.
        </p>
        
        {/* Wait and Retry Tool */}
        <div className="mb-4 p-4 border border-gray-200 dark:border-gray-700 rounded-lg">
          <div className="flex items-center justify-between mb-2">
            <div className="flex-1">
              <h4 className="font-medium">Wait and Retry</h4>
              <p className="text-sm text-gray-600 dark:text-gray-400">
                Allows the AI to wait before retrying a request. Useful for rate limits.
              </p>
            </div>
            <label className="relative inline-flex items-center cursor-pointer ml-4">
              <input
                type="checkbox"
                checked={retryToolEnabled}
                onChange={(e) => {
                  const enabled = e.target.checked;
                  localStorage.setItem('clientTools_waitAndRetry', enabled.toString());
                  setRetryToolEnabled(enabled);
                }}
                className="sr-only peer"
              />
              <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300 dark:peer-focus:ring-blue-800 rounded-full peer dark:bg-gray-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all dark:border-gray-600 peer-checked:bg-blue-600"></div>
            </label>
          </div>
          <div className="text-xs text-green-600 dark:text-green-400">
            ✓ Safe - No security concerns
          </div>
        </div>
        
        {/* Run JavaScript Tool */}
        <div className="mb-4 p-4 border-2 border-red-200 dark:border-red-900 rounded-lg bg-red-50 dark:bg-red-900/20">
          <div className="flex items-center justify-between mb-2">
            <div className="flex-1">
              <h4 className="font-medium flex items-center gap-2">
                Run JavaScript
                <span className="text-xs px-2 py-1 bg-red-600 text-white rounded-full">DANGEROUS</span>
              </h4>
              <p className="text-sm text-gray-600 dark:text-gray-400 mb-2">
                Allows the AI to execute JavaScript code in your browser.
              </p>
              <div className="text-sm text-red-600 dark:text-red-400 space-y-1">
                <p className="font-semibold">⚠️ Security Warning:</p>
                <ul className="list-disc list-inside space-y-1 ml-2">
                  <li>AI can execute arbitrary JavaScript code</li>
                  <li>Code runs in a sandboxed environment (limited access)</li>
                  <li>Still poses security risks if AI is compromised</li>
                  <li>Only enable if you trust your prompts and understand the risks</li>
                </ul>
              </div>
            </div>
            <label className="relative inline-flex items-center cursor-pointer ml-4">
              <input
                type="checkbox"
                checked={jsToolEnabled}
                onChange={(e) => handleEnableJavaScript(e.target.checked)}
                className="sr-only peer"
              />
              <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-red-300 dark:peer-focus:ring-red-800 rounded-full peer dark:bg-gray-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all dark:border-gray-600 peer-checked:bg-red-600"></div>
            </label>
          </div>
          
          {jsToolEnabled && (
            <div className="mt-3 p-3 bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded text-sm">
              <p className="font-semibold text-yellow-800 dark:text-yellow-400">📋 Sandbox Limitations:</p>
              <ul className="list-disc list-inside text-yellow-700 dark:text-yellow-300 mt-1 space-y-1 ml-2">
                <li>No DOM manipulation</li>
                <li>No localStorage/sessionStorage access</li>
                <li>Only GET fetch requests allowed</li>
                <li>10 second execution timeout</li>
                <li>10KB result size limit</li>
              </ul>
            </div>
          )}
        </div>
        
        {/* Example Use Cases */}
        <div className="mt-4 p-4 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg">
          <h4 className="font-medium text-blue-900 dark:text-blue-300 mb-2">Example Use Cases:</h4>
          <ul className="text-sm text-blue-800 dark:text-blue-200 space-y-1 list-disc list-inside ml-2">
            <li><strong>Wait and Retry:</strong> "Search for information, if rate limited wait 5 seconds and retry"</li>
            <li><strong>JavaScript:</strong> "Calculate the factorial of 50" (compute-heavy tasks)</li>
            <li><strong>JavaScript:</strong> "Generate random data for testing"</li>
            <li><strong>JavaScript:</strong> "Parse and analyze this JSON data structure"</li>
          </ul>
        </div>
      </div>
      
      {/* JavaScript Warning Dialog */}
      {showJsWarning && (
        <div className="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center p-4 z-50">
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-2xl max-w-2xl w-full">
            <div className="p-6 border-b border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-900/20">
              <h2 className="text-2xl font-bold text-red-900 dark:text-red-300 flex items-center gap-3">
                <svg className="w-8 h-8" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M12 2L1 21h22L12 2zm0 3.5L19.5 19h-15L12 5.5zM11 10v4h2v-4h-2zm0 5v2h2v-2h-2z"/>
                </svg>
                Security Warning: JavaScript Execution
              </h2>
            </div>
            
            <div className="p-6 space-y-4">
              <p className="text-lg font-semibold">
                You are about to enable the ability for AI to execute JavaScript code in your browser.
              </p>
              
              <div className="bg-red-50 dark:bg-red-900/30 border-l-4 border-red-600 p-4">
                <p className="font-semibold text-red-900 dark:text-red-300 mb-2">Risks:</p>
                <ul className="space-y-2 text-red-800 dark:text-red-200 text-sm list-disc list-inside ml-2">
                  <li>AI can execute arbitrary JavaScript code in your browser</li>
                  <li>Malicious or buggy code could cause unexpected behavior</li>
                  <li>While sandboxed, there are still potential security risks</li>
                  <li>Not recommended for use with untrusted AI models or prompts</li>
                </ul>
              </div>
              
              <div className="bg-green-50 dark:bg-green-900/30 border-l-4 border-green-600 p-4">
                <p className="font-semibold text-green-900 dark:text-green-300 mb-2">Protections:</p>
                <ul className="space-y-2 text-green-800 dark:text-green-200 text-sm list-disc list-inside ml-2">
                  <li>Code runs in isolated Web Worker (no DOM access)</li>
                  <li>10 second execution timeout</li>
                  <li>Limited API access (no localStorage, limited network)</li>
                  <li>Only GET fetch requests allowed</li>
                  <li>Result size limited to 10KB</li>
                  <li>All executions logged to console</li>
                </ul>
              </div>
              
              <div className="bg-blue-50 dark:bg-blue-900/30 border-l-4 border-blue-600 p-4">
                <p className="font-semibold text-blue-900 dark:text-blue-300 mb-2">Recommendations:</p>
                <ul className="space-y-2 text-blue-800 dark:text-blue-200 text-sm list-disc list-inside ml-2">
                  <li>Only use with trusted AI models and your own prompts</li>
                  <li>Review code in console before accepting results</li>
                  <li>Disable when not actively needed</li>
                  <li>Consider using for specific tasks only (math, parsing, etc.)</li>
                </ul>
              </div>
              
              <div className="flex items-center gap-2 p-4 bg-gray-100 dark:bg-gray-700 rounded">
                <input
                  type="checkbox"
                  id="understand-risks"
                  className="w-4 h-4"
                />
                <label htmlFor="understand-risks" className="text-sm">
                  I understand the risks and want to enable JavaScript execution
                </label>
              </div>
            </div>
            
            <div className="p-6 border-t border-gray-200 dark:border-gray-700 flex justify-end gap-3">
              <button
                onClick={() => setShowJsWarning(false)}
                className="px-6 py-2 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={confirmEnableJavaScript}
                disabled={!document.getElementById('understand-risks')?.checked}
                className="px-6 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Enable JavaScript Execution
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
```

---

### **Phase 4: LLM Integration** (2 hours)

#### 4.1 System Prompt Enhancement

The client tool definitions are automatically added to the request in the `useChatStream` hook. The system message instructs the LLM to:

1. **Prefer client tools** when appropriate
2. **Call client tools FIRST** before other operations
3. Understand that results will be available in next iteration

**Example System Message:**
```
IMPORTANT: You have access to CLIENT-SIDE tools that run in the user's browser:
- run_javascript: Execute JavaScript code on the client side
- wait_and_retry: Wait before retrying the request

When using client-side tools:
1. ALWAYS prefer client-side tools over server-side alternatives when appropriate
2. CALL CLIENT TOOLS FIRST before any other operations
3. Client tools will be executed immediately and results will be available in the next iteration
```

#### 4.2 Tool Definition Format

Client tools follow OpenAI function calling format:

```json
{
  "type": "function",
  "function": {
    "name": "run_javascript",
    "description": "Execute JavaScript code on the client side...",
    "parameters": {
      "type": "object",
      "properties": {
        "code": {
          "type": "string",
          "description": "The JavaScript code to execute..."
        },
        "description": {
          "type": "string",
          "description": "A brief description of what this code does"
        }
      },
      "required": ["code"]
    }
  }
}
```

---

### **Phase 5: Testing & Safety** (3 hours)

#### 5.1 Unit Tests
**File:** `ui-new/src/services/clientTools/__tests__/JavaScriptSandbox.test.ts`

```typescript
import { JavaScriptSandbox } from '../JavaScriptSandbox';

describe('JavaScriptSandbox', () => {
  let sandbox: JavaScriptSandbox;
  
  beforeEach(() => {
    sandbox = new JavaScriptSandbox();
  });
  
  afterEach(() => {
    sandbox.destroy();
  });
  
  test('executes simple JavaScript', async () => {
    const result = await sandbox.execute('return 2 + 2;');
    expect(result).toBe(4);
  });
  
  test('executes async JavaScript', async () => {
    const code = `
      const result = await Promise.resolve(42);
      return result;
    `;
    const result = await sandbox.execute(code);
    expect(result).toBe(42);
  });
  
  test('has access to Math', async () => {
    const result = await sandbox.execute('return Math.sqrt(16);');
    expect(result).toBe(4);
  });
  
  test('has access to Date', async () => {
    const code = 'return new Date("2025-01-01").getFullYear();';
    const result = await sandbox.execute(code);
    expect(result).toBe(2025);
  });
  
  test('timeout protection works', async () => {
    const code = 'while(true) {}'; // Infinite loop
    await expect(sandbox.execute(code)).rejects.toThrow('timeout');
  }, 15000);
  
  test('blocks access to window', async () => {
    const code = 'return typeof window;';
    const result = await sandbox.execute(code);
    expect(result).toBe('undefined');
  });
  
  test('blocks access to document', async () => {
    const code = 'return typeof document;';
    const result = await sandbox.execute(code);
    expect(result).toBe('undefined');
  });
  
  test('blocks access to localStorage', async () => {
    const code = 'return typeof localStorage;';
    const result = await sandbox.execute(code);
    expect(result).toBe('undefined');
  });
  
  test('allows GET fetch only', async () => {
    const code = `
      try {
        await fetch('https://example.com', { method: 'POST' });
        return 'SHOULD_FAIL';
      } catch (e) {
        return 'BLOCKED';
      }
    `;
    const result = await sandbox.execute(code);
    expect(result).toBe('BLOCKED');
  });
  
  test('limits result size', async () => {
    const code = 'return "x".repeat(20000);'; // 20KB
    const result = await sandbox.execute(code);
    expect(result.length).toBeLessThanOrEqual(10010); // 10KB + "... (truncated)"
  });
  
  test('handles errors gracefully', async () => {
    const code = 'throw new Error("Test error");';
    await expect(sandbox.execute(code)).rejects.toThrow('Test error');
  });
});
```

#### 5.2 Integration Tests
**File:** `ui-new/src/services/clientTools/__tests__/integration.test.ts`

```typescript
describe('Client Tools Integration', () => {
  test('run_javascript tool executes code', async () => {
    localStorage.setItem('clientTools_runJavaScript', 'true');
    
    const tool = clientToolRegistry.get('run_javascript');
    expect(tool).toBeDefined();
    
    const result = await tool!.execute({
      code: 'return 10 * 5;',
      description: 'Calculate 10 times 5'
    });
    
    expect(result.success).toBe(true);
    expect(result.result).toBe(50);
  });
  
  test('wait_and_retry tool waits', async () => {
    localStorage.setItem('clientTools_waitAndRetry', 'true');
    
    const tool = clientToolRegistry.get('wait_and_retry');
    const startTime = Date.now();
    
    const result = await tool!.execute({
      duration_ms: 100,
      reason: 'Test wait'
    });
    
    const endTime = Date.now();
    expect(endTime - startTime).toBeGreaterThanOrEqual(95); // Allow some slack
    expect(result.success).toBe(true);
  });
  
  test('tool definitions are correctly formatted', () => {
    localStorage.setItem('clientTools_runJavaScript', 'true');
    localStorage.setItem('clientTools_waitAndRetry', 'true');
    
    const defs = clientToolRegistry.getToolDefinitions();
    
    expect(defs.length).toBe(2);
    expect(defs[0].type).toBe('function');
    expect(defs[0].function.name).toBeDefined();
    expect(defs[0].function.parameters).toBeDefined();
  });
});
```

#### 5.3 Manual Testing Checklist

- [ ] **Basic Execution**
  - [ ] Enable wait_and_retry, test with prompt: "Wait 2 seconds then tell me the time"
  - [ ] Enable run_javascript, test with: "Calculate factorial of 10"
  - [ ] Verify results appear in chat

- [ ] **Security Tests**
  - [ ] Try accessing `window` - should fail
  - [ ] Try accessing `localStorage` - should fail
  - [ ] Try POST request - should fail
  - [ ] Try infinite loop - should timeout
  - [ ] Try very large result - should truncate

- [ ] **UI Tests**
  - [ ] Enable/disable toggles work
  - [ ] Warning dialog appears for JavaScript
  - [ ] Checkbox required to enable JavaScript
  - [ ] Settings persist across page reloads

- [ ] **Stream Interception**
  - [ ] Client tool call detected in stream
  - [ ] Stream aborted correctly
  - [ ] Tool executed
  - [ ] Result injected and request resubmitted
  - [ ] Final response includes tool result

- [ ] **Error Handling**
  - [ ] JavaScript syntax errors handled gracefully
  - [ ] Tool execution failures don't crash app
  - [ ] Timeout errors reported properly

---

## Implementation Checklist

### Phase 1: Infrastructure ✅
- [ ] Create `ClientToolRegistry.ts`
- [ ] Create `JavaScriptSandbox.ts` with Web Worker
- [ ] Implement `RunJavaScriptTool.ts`
- [ ] Implement `WaitAndRetryTool.ts`
- [ ] Register tools in `index.ts`
- [ ] Write unit tests for sandbox

### Phase 2: Stream Interception ✅
- [ ] Create `useChatStream` hook
- [ ] Implement stream parsing
- [ ] Detect client tool calls
- [ ] Abort stream on detection
- [ ] Execute client tool
- [ ] Inject result and resubmit
- [ ] Handle errors

### Phase 3: Configuration UI ✅
- [ ] Add Client Tools section to ConfigurationPage
- [ ] Create enable/disable toggles
- [ ] Create JavaScript warning dialog
- [ ] Add checkbox consent requirement
- [ ] Add examples and documentation
- [ ] Persist settings to localStorage

### Phase 4: LLM Integration ✅
- [ ] Add client tools to request
- [ ] Add system message about client tools
- [ ] Test tool definitions format
- [ ] Verify LLM can call tools

### Phase 5: Testing ✅
- [ ] Write unit tests for sandbox
- [ ] Write integration tests
- [ ] Manual testing checklist
- [ ] Security audit
- [ ] Performance testing

---

## Performance Considerations

### Optimization Strategies
1. **Lazy Loading** - Only load Web Worker code when needed
2. **Caching** - Cache tool definitions
3. **Debouncing** - Debounce stream events
4. **Result Limits** - 10KB max result size
5. **Timeout** - 10 second max execution time

### Memory Management
- Terminate workers after execution
- Clean up blob URLs
- Limit concurrent executions (max 1 at a time)

---

## Security Considerations

### Threat Model
1. **Malicious AI** - AI attempts harmful actions
2. **Prompt Injection** - User tricks AI into executing malicious code
3. **XSS** - Code injection into page context
4. **Data Exfiltration** - Stealing sensitive data
5. **Resource Exhaustion** - Infinite loops, memory leaks

### Mitigations
1. **Sandboxing** - Web Worker isolation
2. **API Whitelist** - Only safe APIs exposed
3. **Timeouts** - 10 second limit
4. **Result Limits** - 10KB max
5. **User Consent** - Explicit opt-in with warnings
6. **Audit Logging** - All executions logged
7. **Disable by Default** - Must be enabled
8. **No DOM Access** - Cannot manipulate page

### Remaining Risks
- AI could still execute malicious logic within sandbox
- GET requests could leak data via URLs
- Console logging could expose sensitive info
- Complex JavaScript could find sandbox escapes

**Recommendation:** Only enable for trusted use cases and personal projects.

---

## Cost Estimation

### Time Estimates
| Phase | Description | Hours |
|-------|-------------|-------|
| Phase 1 | Infrastructure | 4 |
| Phase 2 | Stream Interception | 3 |
| Phase 3 | Configuration UI | 2 |
| Phase 4 | LLM Integration | 2 |
| Phase 5 | Testing & Safety | 3 |
| **Total** | | **14 hours** |

### No Additional Costs
- All client-side execution (no API costs)
- No cloud compute needed
- Only uses existing LLM API calls

---

## Phase 6: Unified Browser Feature Execution (8 hours)

### Overview

Instead of separate tools, implement a **single unified tool** `execute_browser_feature` that can:
1. Execute JavaScript (existing)
2. Access localStorage/sessionStorage
3. Access clipboard
4. Show notifications
5. Access geolocation
6. Upload/read files
7. Take screenshots
8. Navigate/manipulate DOM

This provides a cleaner API and easier permission management.

---

### 6.1 Unified Tool Architecture

**File:** `ui-new/src/services/clientTools/tools/ExecuteBrowserFeature.ts`

```typescript
import type { ClientTool } from '../ClientToolRegistry';
import { JavaScriptSandbox } from '../JavaScriptSandbox';

export type BrowserFeatureType = 
  | 'javascript'           // Execute arbitrary JS
  | 'storage_read'         // Read localStorage/sessionStorage
  | 'storage_write'        // Write localStorage/sessionStorage
  | 'clipboard_read'       // Read clipboard
  | 'clipboard_write'      // Write clipboard
  | 'notification'         // Show notification
  | 'geolocation'          // Get location
  | 'file_read'            // Read local file
  | 'screenshot'           // Take screenshot
  | 'dom_query'            // Query DOM elements
  | 'dom_manipulate';      // Manipulate DOM

export interface BrowserFeaturePermissions {
  javascript: boolean;
  storage: boolean;
  clipboard: boolean;
  notification: boolean;
  geolocation: boolean;
  file_access: boolean;
  screenshot: boolean;
  dom_access: boolean;
}

export const ExecuteBrowserFeatureTool: ClientTool = {
  name: 'execute_browser_feature',
  description: `Execute browser features on the client side. Supports multiple capabilities:

JAVASCRIPT: Execute custom JavaScript code in sandboxed environment
STORAGE: Read/write localStorage and sessionStorage
CLIPBOARD: Read from or write to clipboard
NOTIFICATION: Show browser notifications
GEOLOCATION: Get user's current location (with permission)
FILE: Read local files selected by user
SCREENSHOT: Capture visible page or element
DOM: Query or manipulate page elements

Each feature requires explicit user permission and shows code review UI before execution.`,

  parameters: {
    type: 'object',
    properties: {
      feature: {
        type: 'string',
        enum: [
          'javascript',
          'storage_read',
          'storage_write',
          'clipboard_read',
          'clipboard_write',
          'notification',
          'geolocation',
          'file_read',
          'screenshot',
          'dom_query',
          'dom_manipulate'
        ],
        description: 'The browser feature to execute'
      },
      code: {
        type: 'string',
        description: 'JavaScript code to execute (required for javascript, dom_manipulate features)'
      },
      storage_key: {
        type: 'string',
        description: 'Storage key to read/write (for storage features)'
      },
      storage_value: {
        type: 'string',
        description: 'Value to write to storage (for storage_write)'
      },
      storage_type: {
        type: 'string',
        enum: ['localStorage', 'sessionStorage'],
        description: 'Type of storage to use (default: localStorage)'
      },
      clipboard_text: {
        type: 'string',
        description: 'Text to write to clipboard (for clipboard_write)'
      },
      notification_title: {
        type: 'string',
        description: 'Notification title (for notification feature)'
      },
      notification_body: {
        type: 'string',
        description: 'Notification body text'
      },
      notification_icon: {
        type: 'string',
        description: 'Notification icon URL (optional)'
      },
      selector: {
        type: 'string',
        description: 'CSS selector for DOM operations'
      },
      file_accept: {
        type: 'string',
        description: 'File type filter (e.g., ".txt,.json" or "image/*")'
      },
      description: {
        type: 'string',
        description: 'Human-readable description of what this operation does'
      }
    },
    required: ['feature', 'description']
  },

  isEnabled: () => {
    // Check if any browser features are enabled
    const perms = getBrowserFeaturePermissions();
    return Object.values(perms).some(p => p);
  },

  isDestructive: true, // All browser features require review

  execute: async (args: any): Promise<any> => {
    const { feature, description } = args;

    // Check permission for specific feature
    if (!hasPermission(feature)) {
      return {
        success: false,
        error: `Permission denied for feature: ${feature}`,
        message: 'Enable this feature in Settings > Client Tools'
      };
    }

    // Route to specific handler
    switch (feature) {
      case 'javascript':
        return executeJavaScript(args);
      
      case 'storage_read':
        return readStorage(args);
      
      case 'storage_write':
        return writeStorage(args);
      
      case 'clipboard_read':
        return readClipboard();
      
      case 'clipboard_write':
        return writeClipboard(args.clipboard_text);
      
      case 'notification':
        return showNotification(args);
      
      case 'geolocation':
        return getGeolocation();
      
      case 'file_read':
        return readFile(args.file_accept);
      
      case 'screenshot':
        return takeScreenshot(args.selector);
      
      case 'dom_query':
        return queryDOM(args.selector);
      
      case 'dom_manipulate':
        return manipulateDOM(args);
      
      default:
        return {
          success: false,
          error: `Unknown feature: ${feature}`
        };
    }
  }
};

// Feature-specific implementations

async function executeJavaScript(args: any): Promise<any> {
  const sandbox = new JavaScriptSandbox();
  try {
    const result = await sandbox.execute(args.code);
    return {
      success: true,
      result,
      description: args.description
    };
  } catch (error: any) {
    return {
      success: false,
      error: error.message,
      description: args.description
    };
  } finally {
    sandbox.destroy();
  }
}

async function readStorage(args: any): Promise<any> {
  const { storage_key, storage_type = 'localStorage' } = args;
  
  try {
    const storage = storage_type === 'sessionStorage' ? sessionStorage : localStorage;
    const value = storage.getItem(storage_key);
    
    return {
      success: true,
      key: storage_key,
      value: value,
      storage_type: storage_type,
      found: value !== null
    };
  } catch (error: any) {
    return {
      success: false,
      error: error.message
    };
  }
}

async function writeStorage(args: any): Promise<any> {
  const { storage_key, storage_value, storage_type = 'localStorage' } = args;
  
  try {
    const storage = storage_type === 'sessionStorage' ? sessionStorage : localStorage;
    storage.setItem(storage_key, storage_value);
    
    return {
      success: true,
      key: storage_key,
      value: storage_value,
      storage_type: storage_type,
      message: `Successfully wrote to ${storage_type}`
    };
  } catch (error: any) {
    return {
      success: false,
      error: error.message
    };
  }
}

async function readClipboard(): Promise<any> {
  try {
    const text = await navigator.clipboard.readText();
    return {
      success: true,
      text: text,
      length: text.length
    };
  } catch (error: any) {
    return {
      success: false,
      error: error.message,
      message: 'Clipboard read permission denied or not available'
    };
  }
}

async function writeClipboard(text: string): Promise<any> {
  try {
    await navigator.clipboard.writeText(text);
    return {
      success: true,
      text: text,
      message: 'Successfully copied to clipboard'
    };
  } catch (error: any) {
    return {
      success: false,
      error: error.message,
      message: 'Clipboard write permission denied'
    };
  }
}

async function showNotification(args: any): Promise<any> {
  const { notification_title, notification_body, notification_icon } = args;
  
  try {
    // Request permission if needed
    if (Notification.permission === 'default') {
      const permission = await Notification.requestPermission();
      if (permission !== 'granted') {
        return {
          success: false,
          error: 'Notification permission denied'
        };
      }
    }
    
    if (Notification.permission !== 'granted') {
      return {
        success: false,
        error: 'Notification permission not granted'
      };
    }
    
    const notification = new Notification(notification_title, {
      body: notification_body,
      icon: notification_icon
    });
    
    return {
      success: true,
      message: 'Notification shown'
    };
  } catch (error: any) {
    return {
      success: false,
      error: error.message
    };
  }
}

async function getGeolocation(): Promise<any> {
  return new Promise((resolve) => {
    if (!navigator.geolocation) {
      resolve({
        success: false,
        error: 'Geolocation not supported by browser'
      });
      return;
    }
    
    navigator.geolocation.getCurrentPosition(
      (position) => {
        resolve({
          success: true,
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
          accuracy: position.coords.accuracy,
          altitude: position.coords.altitude,
          timestamp: position.timestamp
        });
      },
      (error) => {
        resolve({
          success: false,
          error: error.message,
          code: error.code
        });
      },
      {
        enableHighAccuracy: true,
        timeout: 10000,
        maximumAge: 0
      }
    );
  });
}

async function readFile(accept?: string): Promise<any> {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    if (accept) {
      input.accept = accept;
    }
    
    input.onchange = async (e: any) => {
      const file = e.target.files?.[0];
      if (!file) {
        resolve({
          success: false,
          error: 'No file selected'
        });
        return;
      }
      
      try {
        const text = await file.text();
        resolve({
          success: true,
          name: file.name,
          size: file.size,
          type: file.type,
          content: text,
          lastModified: file.lastModified
        });
      } catch (error: any) {
        resolve({
          success: false,
          error: error.message
        });
      }
    };
    
    input.click();
  });
}

async function takeScreenshot(selector?: string): Promise<any> {
  try {
    // Use html2canvas library if available
    // @ts-ignore
    if (typeof html2canvas === 'undefined') {
      return {
        success: false,
        error: 'Screenshot library not loaded. Add html2canvas to page.'
      };
    }
    
    const element = selector ? document.querySelector(selector) : document.body;
    if (!element) {
      return {
        success: false,
        error: `Element not found: ${selector}`
      };
    }
    
    // @ts-ignore
    const canvas = await html2canvas(element);
    const dataUrl = canvas.toDataURL('image/png');
    
    return {
      success: true,
      dataUrl: dataUrl,
      width: canvas.width,
      height: canvas.height,
      message: 'Screenshot captured'
    };
  } catch (error: any) {
    return {
      success: false,
      error: error.message
    };
  }
}

async function queryDOM(selector: string): Promise<any> {
  try {
    const elements = Array.from(document.querySelectorAll(selector));
    
    return {
      success: true,
      count: elements.length,
      elements: elements.slice(0, 10).map(el => ({
        tagName: el.tagName,
        id: el.id,
        className: el.className,
        textContent: el.textContent?.substring(0, 100),
        attributes: Array.from(el.attributes).reduce((acc, attr) => {
          acc[attr.name] = attr.value;
          return acc;
        }, {} as Record<string, string>)
      })),
      message: `Found ${elements.length} element(s)`
    };
  } catch (error: any) {
    return {
      success: false,
      error: error.message
    };
  }
}

async function manipulateDOM(args: any): Promise<any> {
  const { code, selector } = args;
  
  try {
    // Execute code with DOM context
    const sandbox = new JavaScriptSandbox();
    
    // Enhanced code with DOM context
    const enhancedCode = `
      const elements = Array.from(document.querySelectorAll('${selector}'));
      const element = elements[0];
      
      // User code
      ${code}
    `;
    
    const result = await sandbox.execute(enhancedCode);
    sandbox.destroy();
    
    return {
      success: true,
      result: result,
      selector: selector
    };
  } catch (error: any) {
    return {
      success: false,
      error: error.message
    };
  }
}

// Permission management
function getBrowserFeaturePermissions(): BrowserFeaturePermissions {
  return {
    javascript: localStorage.getItem('browserFeatures_javascript') === 'true',
    storage: localStorage.getItem('browserFeatures_storage') === 'true',
    clipboard: localStorage.getItem('browserFeatures_clipboard') === 'true',
    notification: localStorage.getItem('browserFeatures_notification') === 'true',
    geolocation: localStorage.getItem('browserFeatures_geolocation') === 'true',
    file_access: localStorage.getItem('browserFeatures_file_access') === 'true',
    screenshot: localStorage.getItem('browserFeatures_screenshot') === 'true',
    dom_access: localStorage.getItem('browserFeatures_dom_access') === 'true'
  };
}

function hasPermission(feature: BrowserFeatureType): boolean {
  const featureMap: Record<BrowserFeatureType, keyof BrowserFeaturePermissions> = {
    'javascript': 'javascript',
    'storage_read': 'storage',
    'storage_write': 'storage',
    'clipboard_read': 'clipboard',
    'clipboard_write': 'clipboard',
    'notification': 'notification',
    'geolocation': 'geolocation',
    'file_read': 'file_access',
    'screenshot': 'screenshot',
    'dom_query': 'dom_access',
    'dom_manipulate': 'dom_access'
  };
  
  const permKey = featureMap[feature];
  const perms = getBrowserFeaturePermissions();
  return perms[permKey];
}
```

---

### 6.2 Code Review UI with Editing

**File:** `ui-new/src/components/CodeReviewDialog.tsx`

```typescript
import React, { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from './ui/dialog';
import { Button } from './ui/button';
import { Badge } from './ui/badge';
import { Alert, AlertDescription } from './ui/alert';
import { Tabs, TabsContent, TabsList, TabsTrigger } from './ui/tabs';
import { Textarea } from './ui/textarea';
import { AlertTriangle, Code, Edit, Play, X } from 'lucide-react';

export interface CodeReviewRequest {
  id: string;
  feature: string;
  description: string;
  code?: string;
  args: Record<string, any>;
  timestamp: number;
}

export interface CodeReviewDialogProps {
  open: boolean;
  request: CodeReviewRequest | null;
  onApprove: (editedCode?: string) => void;
  onReject: () => void;
  onAlwaysAllow?: () => void;
}

export const CodeReviewDialog: React.FC<CodeReviewDialogProps> = ({
  open,
  request,
  onApprove,
  onReject,
  onAlwaysAllow
}) => {
  const [activeTab, setActiveTab] = useState<'review' | 'edit'>('review');
  const [editedCode, setEditedCode] = useState('');
  const [hasEdits, setHasEdits] = useState(false);
  
  useEffect(() => {
    if (request?.code) {
      setEditedCode(request.code);
      setHasEdits(false);
    }
  }, [request]);
  
  if (!request) return null;
  
  const handleCodeChange = (newCode: string) => {
    setEditedCode(newCode);
    setHasEdits(newCode !== request.code);
  };
  
  const handleApprove = () => {
    if (hasEdits && activeTab === 'edit') {
      onApprove(editedCode);
    } else {
      onApprove();
    }
  };
  
  const getRiskLevel = (feature: string): 'low' | 'medium' | 'high' => {
    if (feature === 'javascript' || feature === 'dom_manipulate') return 'high';
    if (feature === 'storage_write' || feature === 'file_read') return 'medium';
    return 'low';
  };
  
  const riskLevel = getRiskLevel(request.feature);
  const riskColors = {
    low: 'bg-green-100 text-green-800 border-green-300',
    medium: 'bg-yellow-100 text-yellow-800 border-yellow-300',
    high: 'bg-red-100 text-red-800 border-red-300'
  };
  
  const showCodeEditor = request.code || request.feature === 'javascript' || request.feature === 'dom_manipulate';
  
  return (
    <Dialog open={open} onOpenChange={() => onReject()}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <AlertTriangle className="w-5 h-5 text-orange-500" />
            Code Review Required
            <Badge className={`ml-auto ${riskColors[riskLevel]}`}>
              {riskLevel.toUpperCase()} RISK
            </Badge>
          </DialogTitle>
        </DialogHeader>
        
        <div className="flex-1 overflow-y-auto space-y-4">
          {/* Warning Banner */}
          <Alert variant="destructive">
            <AlertTriangle className="w-4 h-4" />
            <AlertDescription>
              <strong>Security Warning:</strong> This operation will execute code in your browser.
              Review carefully before approving. You can edit the code before execution.
            </AlertDescription>
          </Alert>
          
          {/* Request Details */}
          <div className="space-y-2">
            <div>
              <strong>Feature:</strong>{' '}
              <code className="px-2 py-1 bg-gray-100 rounded text-sm">
                {request.feature}
              </code>
            </div>
            <div>
              <strong>Description:</strong>{' '}
              <span className="text-gray-700">{request.description}</span>
            </div>
            <div>
              <strong>Requested:</strong>{' '}
              <span className="text-gray-500 text-sm">
                {new Date(request.timestamp).toLocaleString()}
              </span>
            </div>
          </div>
          
          {/* Arguments */}
          {Object.keys(request.args).length > 0 && (
            <div>
              <strong className="block mb-2">Arguments:</strong>
              <pre className="bg-gray-50 p-3 rounded border text-xs overflow-x-auto">
                {JSON.stringify(request.args, null, 2)}
              </pre>
            </div>
          )}
          
          {/* Code Review/Edit Tabs */}
          {showCodeEditor && (
            <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as any)} className="w-full">
              <TabsList className="grid w-full grid-cols-2">
                <TabsTrigger value="review" className="flex items-center gap-2">
                  <Code className="w-4 h-4" />
                  Review Code
                </TabsTrigger>
                <TabsTrigger value="edit" className="flex items-center gap-2">
                  <Edit className="w-4 h-4" />
                  Edit Code
                  {hasEdits && <span className="ml-1 w-2 h-2 bg-orange-500 rounded-full" />}
                </TabsTrigger>
              </TabsList>
              
              <TabsContent value="review" className="space-y-2">
                <div className="bg-gray-50 border rounded-lg overflow-hidden">
                  <div className="bg-gray-200 px-3 py-2 border-b flex items-center gap-2">
                    <Code className="w-4 h-4" />
                    <span className="font-mono text-sm">Code to Execute</span>
                  </div>
                  <pre className="p-4 overflow-x-auto text-sm">
                    <code className="language-javascript">
                      {request.code || editedCode}
                    </code>
                  </pre>
                </div>
                {hasEdits && (
                  <Alert>
                    <AlertDescription className="text-sm">
                      ✏️ You have made edits to the code. Switch to Edit tab to review changes.
                    </AlertDescription>
                  </Alert>
                )}
              </TabsContent>
              
              <TabsContent value="edit" className="space-y-2">
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium">Edit Code Before Execution</span>
                    {hasEdits && (
                      <Badge variant="outline" className="bg-orange-50">
                        Modified
                      </Badge>
                    )}
                  </div>
                  <Textarea
                    value={editedCode}
                    onChange={(e) => handleCodeChange(e.target.value)}
                    className="font-mono text-sm min-h-[300px] resize-none"
                    placeholder="Enter JavaScript code..."
                  />
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => {
                        setEditedCode(request.code || '');
                        setHasEdits(false);
                      }}
                      disabled={!hasEdits}
                    >
                      Reset Changes
                    </Button>
                    <div className="flex-1" />
                    <span className="text-xs text-gray-500 self-center">
                      {editedCode.length} characters
                    </span>
                  </div>
                </div>
              </TabsContent>
            </Tabs>
          )}
          
          {/* Safety Tips */}
          <Alert>
            <AlertDescription>
              <div className="space-y-1 text-sm">
                <div className="font-semibold mb-2">Safety Tips:</div>
                <ul className="list-disc list-inside space-y-1 text-gray-700">
                  <li>Review the code carefully for any suspicious operations</li>
                  <li>Check that it only does what the description claims</li>
                  <li>You can edit the code in the "Edit Code" tab before approving</li>
                  <li>Look for attempts to access sensitive data or external URLs</li>
                  <li>When in doubt, reject and ask the AI to clarify</li>
                </ul>
              </div>
            </AlertDescription>
          </Alert>
        </div>
        
        <DialogFooter className="flex gap-2 pt-4 border-t">
          <Button
            variant="outline"
            onClick={onReject}
            className="flex items-center gap-2"
          >
            <X className="w-4 h-4" />
            Reject
          </Button>
          
          {onAlwaysAllow && (
            <Button
              variant="secondary"
              onClick={onAlwaysAllow}
              className="flex items-center gap-2"
            >
              Always Allow (This Session)
            </Button>
          )}
          
          <Button
            onClick={handleApprove}
            className="flex items-center gap-2 bg-green-600 hover:bg-green-700"
          >
            <Play className="w-4 h-4" />
            {hasEdits ? 'Approve with Edits' : 'Approve & Execute'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
```

---

### 6.3 Execution History UI

**File:** `ui-new/src/components/ExecutionHistoryPanel.tsx`

```typescript
import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Badge } from './ui/badge';
import { Button } from './ui/button';
import { ScrollArea } from './ui/scroll-area';
import {
  History,
  CheckCircle,
  XCircle,
  Clock,
  Code,
  Trash2,
  Download
} from 'lucide-react';

export interface ExecutionHistoryEntry {
  id: string;
  feature: string;
  description: string;
  code?: string;
  args: Record<string, any>;
  result: any;
  success: boolean;
  timestamp: number;
  duration_ms: number;
  edited: boolean;
}

export const ExecutionHistoryPanel: React.FC = () => {
  const [history, setHistory] = useState<ExecutionHistoryEntry[]>([]);
  const [selectedEntry, setSelectedEntry] = useState<ExecutionHistoryEntry | null>(null);
  
  useEffect(() => {
    // Load history from localStorage
    const stored = localStorage.getItem('browserFeatures_executionHistory');
    if (stored) {
      try {
        setHistory(JSON.parse(stored));
      } catch (e) {
        console.error('Failed to load execution history:', e);
      }
    }
  }, []);
  
  const clearHistory = () => {
    if (confirm('Clear all execution history?')) {
      setHistory([]);
      localStorage.removeItem('browserFeatures_executionHistory');
      setSelectedEntry(null);
    }
  };
  
  const exportHistory = () => {
    const dataStr = JSON.stringify(history, null, 2);
    const dataUri = 'data:application/json;charset=utf-8,'+ encodeURIComponent(dataStr);
    const exportFileDefaultName = `execution-history-${Date.now()}.json`;
    
    const linkElement = document.createElement('a');
    linkElement.setAttribute('href', dataUri);
    linkElement.setAttribute('download', exportFileDefaultName);
    linkElement.click();
  };
  
  const deleteEntry = (id: string) => {
    const newHistory = history.filter(e => e.id !== id);
    setHistory(newHistory);
    localStorage.setItem('browserFeatures_executionHistory', JSON.stringify(newHistory));
    if (selectedEntry?.id === id) {
      setSelectedEntry(null);
    }
  };
  
  return (
    <div className="grid grid-cols-2 gap-4 h-full">
      {/* History List */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between pb-3">
          <CardTitle className="flex items-center gap-2">
            <History className="w-5 h-5" />
            Execution History
            <Badge variant="secondary">{history.length}</Badge>
          </CardTitle>
          <div className="flex gap-2">
            <Button size="sm" variant="outline" onClick={exportHistory}>
              <Download className="w-4 h-4" />
            </Button>
            <Button size="sm" variant="outline" onClick={clearHistory}>
              <Trash2 className="w-4 h-4" />
            </Button>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <ScrollArea className="h-[600px]">
            {history.length === 0 ? (
              <div className="p-8 text-center text-gray-500">
                <History className="w-12 h-12 mx-auto mb-2 opacity-20" />
                <p>No execution history yet</p>
              </div>
            ) : (
              <div className="divide-y">
                {history.map(entry => (
                  <div
                    key={entry.id}
                    className={`p-4 cursor-pointer hover:bg-gray-50 transition-colors ${
                      selectedEntry?.id === entry.id ? 'bg-blue-50' : ''
                    }`}
                    onClick={() => setSelectedEntry(entry)}
                  >
                    <div className="flex items-start gap-3">
                      {entry.success ? (
                        <CheckCircle className="w-5 h-5 text-green-500 flex-shrink-0 mt-0.5" />
                      ) : (
                        <XCircle className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" />
                      )}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <code className="text-sm font-mono bg-gray-100 px-2 py-0.5 rounded">
                            {entry.feature}
                          </code>
                          {entry.edited && (
                            <Badge variant="outline" className="text-xs">
                              Edited
                            </Badge>
                          )}
                        </div>
                        <p className="text-sm text-gray-700 truncate">
                          {entry.description}
                        </p>
                        <div className="flex items-center gap-3 mt-2 text-xs text-gray-500">
                          <span className="flex items-center gap-1">
                            <Clock className="w-3 h-3" />
                            {new Date(entry.timestamp).toLocaleTimeString()}
                          </span>
                          <span>{entry.duration_ms}ms</span>
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </ScrollArea>
        </CardContent>
      </Card>
      
      {/* Entry Details */}
      <Card>
        <CardHeader>
          <CardTitle>Execution Details</CardTitle>
        </CardHeader>
        <CardContent>
          {selectedEntry ? (
            <ScrollArea className="h-[600px] pr-4">
              <div className="space-y-4">
                {/* Status */}
                <div>
                  <div className="text-sm font-medium mb-1">Status</div>
                  <Badge className={selectedEntry.success ? 'bg-green-500' : 'bg-red-500'}>
                    {selectedEntry.success ? 'SUCCESS' : 'FAILED'}
                  </Badge>
                </div>
                
                {/* Feature */}
                <div>
                  <div className="text-sm font-medium mb-1">Feature</div>
                  <code className="text-sm bg-gray-100 px-2 py-1 rounded block">
                    {selectedEntry.feature}
                  </code>
                </div>
                
                {/* Description */}
                <div>
                  <div className="text-sm font-medium mb-1">Description</div>
                  <p className="text-sm text-gray-700">
                    {selectedEntry.description}
                  </p>
                </div>
                
                {/* Timestamp */}
                <div>
                  <div className="text-sm font-medium mb-1">Executed</div>
                  <p className="text-sm text-gray-700">
                    {new Date(selectedEntry.timestamp).toLocaleString()}
                  </p>
                </div>
                
                {/* Duration */}
                <div>
                  <div className="text-sm font-medium mb-1">Duration</div>
                  <p className="text-sm text-gray-700">
                    {selectedEntry.duration_ms}ms
                  </p>
                </div>
                
                {/* Arguments */}
                {Object.keys(selectedEntry.args).length > 0 && (
                  <div>
                    <div className="text-sm font-medium mb-1">Arguments</div>
                    <pre className="text-xs bg-gray-50 p-3 rounded border overflow-x-auto">
                      {JSON.stringify(selectedEntry.args, null, 2)}
                    </pre>
                  </div>
                )}
                
                {/* Code */}
                {selectedEntry.code && (
                  <div>
                    <div className="text-sm font-medium mb-1 flex items-center gap-2">
                      <Code className="w-4 h-4" />
                      Code
                      {selectedEntry.edited && (
                        <Badge variant="outline" className="text-xs">
                          User Edited
                        </Badge>
                      )}
                    </div>
                    <pre className="text-xs bg-gray-50 p-3 rounded border overflow-x-auto font-mono">
                      {selectedEntry.code}
                    </pre>
                  </div>
                )}
                
                {/* Result */}
                <div>
                  <div className="text-sm font-medium mb-1">Result</div>
                  <pre className="text-xs bg-gray-50 p-3 rounded border overflow-x-auto">
                    {JSON.stringify(selectedEntry.result, null, 2)}
                  </pre>
                </div>
                
                {/* Actions */}
                <div className="pt-4 border-t flex gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => deleteEntry(selectedEntry.id)}
                    className="flex items-center gap-2"
                  >
                    <Trash2 className="w-4 h-4" />
                    Delete
                  </Button>
                </div>
              </div>
            </ScrollArea>
          ) : (
            <div className="h-[600px] flex items-center justify-center text-gray-500">
              <div className="text-center">
                <Code className="w-12 h-12 mx-auto mb-2 opacity-20" />
                <p>Select an entry to view details</p>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

// Helper function to add entries to history
export function addExecutionHistoryEntry(entry: Omit<ExecutionHistoryEntry, 'id' | 'timestamp'>): void {
  const historyEntry: ExecutionHistoryEntry = {
    ...entry,
    id: `exec_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
    timestamp: Date.now()
  };
  
  const stored = localStorage.getItem('browserFeatures_executionHistory');
  let history: ExecutionHistoryEntry[] = [];
  
  if (stored) {
    try {
      history = JSON.parse(stored);
    } catch (e) {
      console.error('Failed to parse execution history:', e);
    }
  }
  
  history.unshift(historyEntry);
  
  // Keep only last 100 entries
  if (history.length > 100) {
    history = history.slice(0, 100);
  }
  
  localStorage.setItem('browserFeatures_executionHistory', JSON.stringify(history));
}
```

---

### 6.4 Updated Settings UI

**File:** `ui-new/src/components/ConfigurationPage.tsx` (add comprehensive browser features section)

```typescript
// Add to ConfigurationPage

const BrowserFeaturesSection: React.FC = () => {
  const [permissions, setPermissions] = useState<BrowserFeaturePermissions>({
    javascript: localStorage.getItem('browserFeatures_javascript') === 'true',
    storage: localStorage.getItem('browserFeatures_storage') === 'true',
    clipboard: localStorage.getItem('browserFeatures_clipboard') === 'true',
    notification: localStorage.getItem('browserFeatures_notification') === 'true',
    geolocation: localStorage.getItem('browserFeatures_geolocation') === 'true',
    file_access: localStorage.getItem('browserFeatures_file_access') === 'true',
    screenshot: localStorage.getItem('browserFeatures_screenshot') === 'true',
    dom_access: localStorage.getItem('browserFeatures_dom_access') === 'true'
  });
  
  const [showWarning, setShowWarning] = useState<string | null>(null);
  const [codeReviewMode, setCodeReviewMode] = useState(
    localStorage.getItem('browserFeatures_codeReviewMode') || 'always'
  );
  const [autoApproveTimeout, setAutoApproveTimeout] = useState(
    parseInt(localStorage.getItem('browserFeatures_autoApproveTimeout') || '30')
  );
  
  const features: Array<{
    key: keyof BrowserFeaturePermissions;
    label: string;
    description: string;
    riskLevel: 'low' | 'medium' | 'high';
  }> = [
    {
      key: 'javascript',
      label: 'JavaScript Execution',
      description: 'Execute arbitrary JavaScript code in sandboxed environment',
      riskLevel: 'high'
    },
    {
      key: 'storage',
      label: 'Browser Storage',
      description: 'Read and write localStorage and sessionStorage',
      riskLevel: 'medium'
    },
    {
      key: 'clipboard',
      label: 'Clipboard Access',
      description: 'Read from and write to system clipboard',
      riskLevel: 'low'
    },
    {
      key: 'notification',
      label: 'Browser Notifications',
      description: 'Show browser notifications',
      riskLevel: 'low'
    },
    {
      key: 'geolocation',
      label: 'Geolocation',
      description: 'Access device location (requires browser permission)',
      riskLevel: 'medium'
    },
    {
      key: 'file_access',
      label: 'File Access',
      description: 'Read local files selected by user',
      riskLevel: 'medium'
    },
    {
      key: 'screenshot',
      label: 'Screenshots',
      description: 'Capture page or element screenshots',
      riskLevel: 'low'
    },
    {
      key: 'dom_access',
      label: 'DOM Manipulation',
      description: 'Query and manipulate page DOM elements',
      riskLevel: 'high'
    }
  ];
  
  const handleToggle = (key: keyof BrowserFeaturePermissions) => {
    const feature = features.find(f => f.key === key);
    if (!feature) return;
    
    if (!permissions[key] && feature.riskLevel !== 'low') {
      setShowWarning(key);
    } else {
      togglePermission(key);
    }
  };
  
  const togglePermission = (key: keyof BrowserFeaturePermissions) => {
    const newPermissions = {
      ...permissions,
      [key]: !permissions[key]
    };
    setPermissions(newPermissions);
    localStorage.setItem(`browserFeatures_${key}`, String(newPermissions[key]));
    setShowWarning(null);
  };
  
  const handleCodeReviewModeChange = (mode: string) => {
    setCodeReviewMode(mode);
    localStorage.setItem('browserFeatures_codeReviewMode', mode);
  };
  
  const handleAutoApproveTimeoutChange = (timeout: number) => {
    setAutoApproveTimeout(timeout);
    localStorage.setItem('browserFeatures_autoApproveTimeout', String(timeout));
  };
  
  const riskColors = {
    low: 'text-green-600 bg-green-50',
    medium: 'text-yellow-600 bg-yellow-50',
    high: 'text-red-600 bg-red-50'
  };
  
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Code className="w-5 h-5" />
          Browser Features
        </CardTitle>
        <p className="text-sm text-gray-600">
          Control what browser features the AI can access on your device
        </p>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Warning Alert */}
        <Alert variant="destructive">
          <AlertTriangle className="w-4 h-4" />
          <AlertDescription>
            <strong>Security Warning:</strong> Enabling browser features allows AI to execute
            code and access browser APIs. All operations require your approval via code review dialog.
          </AlertDescription>
        </Alert>
        
        {/* Code Review Settings */}
        <div className="space-y-3">
          <div className="font-medium">Code Review Mode</div>
          <div className="space-y-2">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="radio"
                name="codeReviewMode"
                value="always"
                checked={codeReviewMode === 'always'}
                onChange={(e) => handleCodeReviewModeChange(e.target.value)}
                className="form-radio"
              />
              <div>
                <div className="font-medium">Always Review (Recommended)</div>
                <div className="text-sm text-gray-600">
                  Review and approve every operation with code editor
                </div>
              </div>
            </label>
            
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="radio"
                name="codeReviewMode"
                value="risky"
                checked={codeReviewMode === 'risky'}
                onChange={(e) => handleCodeReviewModeChange(e.target.value)}
                className="form-radio"
              />
              <div>
                <div className="font-medium">Review High-Risk Only</div>
                <div className="text-sm text-gray-600">
                  Auto-approve low-risk operations, review high-risk
                </div>
              </div>
            </label>
            
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="radio"
                name="codeReviewMode"
                value="timeout"
                checked={codeReviewMode === 'timeout'}
                onChange={(e) => handleCodeReviewModeChange(e.target.value)}
                className="form-radio"
              />
              <div className="flex-1">
                <div className="font-medium">Auto-Approve After Timeout</div>
                <div className="text-sm text-gray-600 mb-2">
                  Show review dialog, auto-approve if not acted upon
                </div>
                {codeReviewMode === 'timeout' && (
                  <div className="flex items-center gap-2 ml-6">
                    <label className="text-sm">Timeout:</label>
                    <input
                      type="number"
                      min="5"
                      max="120"
                      value={autoApproveTimeout}
                      onChange={(e) => handleAutoApproveTimeoutChange(parseInt(e.target.value))}
                      className="form-input w-20 text-sm"
                    />
                    <span className="text-sm text-gray-600">seconds</span>
                  </div>
                )}
              </div>
            </label>
          </div>
        </div>
        
        <div className="border-t pt-4" />
        
        {/* Feature Toggles */}
        <div className="space-y-4">
          <div className="font-medium">Enabled Features</div>
          
          {features.map(feature => (
            <div key={feature.key} className="flex items-start gap-3 p-3 border rounded-lg">
              <input
                type="checkbox"
                checked={permissions[feature.key]}
                onChange={() => handleToggle(feature.key)}
                className="form-checkbox mt-1"
              />
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <span className="font-medium">{feature.label}</span>
                  <Badge className={`text-xs ${riskColors[feature.riskLevel]}`}>
                    {feature.riskLevel.toUpperCase()}
                  </Badge>
                </div>
                <p className="text-sm text-gray-600 mt-1">
                  {feature.description}
                </p>
              </div>
            </div>
          ))}
        </div>
        
        {/* View History Button */}
        <div className="border-t pt-4">
          <Button
            variant="outline"
            onClick={() => {
              // Navigate to execution history
              window.location.hash = '#execution-history';
            }}
            className="flex items-center gap-2"
          >
            <History className="w-4 h-4" />
            View Execution History
          </Button>
        </div>
      </CardContent>
      
      {/* Warning Dialog */}
      {showWarning && (
        <Dialog open={!!showWarning} onOpenChange={() => setShowWarning(null)}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <AlertTriangle className="w-5 h-5 text-orange-500" />
                Enable {features.find(f => f.key === showWarning)?.label}?
              </DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <Alert variant="destructive">
                <AlertDescription>
                  This feature has {features.find(f => f.key === showWarning)?.riskLevel} security risk.
                  It will be subject to code review before execution.
                </AlertDescription>
              </Alert>
              <p className="text-sm text-gray-700">
                {features.find(f => f.key === showWarning)?.description}
              </p>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setShowWarning(null)}>
                Cancel
              </Button>
              <Button onClick={() => togglePermission(showWarning as keyof BrowserFeaturePermissions)}>
                Enable Feature
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </Card>
  );
};
```

---

## Future Enhancements (Phase 7+)

### 7.1 WebSocket Communication
- Real-time bidirectional communication between AI and browser
- Streaming execution results for long operations
- Progress updates during execution
- Interactive debugging sessions

### 7.2 Browser Automation Advanced
- Full page navigation control
- Form filling and submission
- Element interaction (click, type, select)
- Network interception and modification
- Cookie management
- Browser history manipulation

### 7.3 Media Capture
- Camera access (with permission)
- Microphone access (with permission)
- Screen recording
- Audio playback control
- Video stream manipulation

### 7.4 Advanced Storage
- IndexedDB operations
- Cache API management
- Service Worker control
- WebSQL (if supported)
- File System Access API

### 7.5 Performance Monitoring
- Page performance metrics
- Resource timing
- Memory usage tracking
- Network waterfall analysis
- Core Web Vitals measurement

---

## Implementation Checklist

### Phase 1-3: Core Infrastructure (COMPLETE)
- [x] Client tool registry
- [x] JavaScript sandbox
- [x] Basic tools (run_javascript, wait_and_retry)
- [x] Stream interception
- [x] Configuration UI

### Phase 6: Unified Browser Features (NEW)
- [ ] **6.1: Unified Tool Architecture** (3 hours)
  - [ ] Create ExecuteBrowserFeature tool
  - [ ] Implement all feature handlers:
    - [ ] JavaScript execution
    - [ ] Storage read/write (localStorage/sessionStorage)
    - [ ] Clipboard read/write
    - [ ] Notifications
    - [ ] Geolocation
    - [ ] File reading
    - [ ] Screenshots (requires html2canvas)
    - [ ] DOM query/manipulation
  - [ ] Permission management system
  - [ ] Feature-specific error handling
  - [ ] Integration with existing registry

- [ ] **6.2: Code Review UI with Editing** (3 hours)
  - [ ] Create CodeReviewDialog component
  - [ ] Implement code editor with syntax highlighting
  - [ ] Add review/edit tab system
  - [ ] Show feature risk levels (high/medium/low)
  - [ ] Display arguments and context
  - [ ] Safety tips and warnings
  - [ ] Edit tracking and diff view
  - [ ] Approve/reject/always-allow actions
  - [ ] Character count and validation

- [ ] **6.3: Execution History** (2 hours)
  - [ ] Create ExecutionHistoryPanel component
  - [ ] Implement history storage (localStorage)
  - [ ] List view with filtering and search
  - [ ] Detail view for each execution
  - [ ] Export history as JSON
  - [ ] Delete individual entries
  - [ ] Clear all history
  - [ ] Success/failure statistics
  - [ ] Execution time tracking

- [ ] **6.4: Enhanced Settings UI** (2 hours)
  - [ ] Add BrowserFeaturesSection to ConfigurationPage
  - [ ] Feature toggle switches with risk badges
  - [ ] Code review mode selection:
    - [ ] Always review (recommended)
    - [ ] Review high-risk only
    - [ ] Auto-approve after timeout
  - [ ] Auto-approve timeout slider (5-120s)
  - [ ] Link to execution history
  - [ ] Permission warning dialogs
  - [ ] Feature descriptions and help text
  - [ ] Visual risk indicators

### Integration & Testing (5 hours)
- [ ] **Integration with Chat Hook** (2 hours)
  - [ ] Update useChatStream to handle execute_browser_feature
  - [ ] Queue system for code review requests
  - [ ] Integration with CodeReviewDialog
  - [ ] Execution history tracking
  - [ ] Error handling and retry logic
  - [ ] Result formatting for chat display

- [ ] **Testing Suite** (3 hours)
  - [ ] Unit tests for each feature handler
  - [ ] Integration tests for unified tool
  - [ ] UI component tests (CodeReviewDialog, History)
  - [ ] Permission management tests
  - [ ] Security boundary tests (sandbox escaping)
  - [ ] Performance tests (timeout, memory)
  - [ ] Browser compatibility tests

### Documentation (2 hours)
- [ ] User guide for browser features
- [ ] Security best practices
- [ ] Feature reference guide with examples
- [ ] Code review workflow
- [ ] Troubleshooting guide
- [ ] API documentation for developers

### Estimated Total Time
- **Phase 6 Implementation:** 10 hours
- **Integration & Testing:** 5 hours
- **Documentation:** 2 hours
- **Total:** ~17 hours (2 days)

---

## Security Considerations

### Risk Assessment by Feature

| Feature | Risk Level | Mitigation | Auto-Approve? |
|---------|-----------|------------|---------------|
| JavaScript Execution | 🔴 HIGH | Sandboxed worker, code review, timeout | Never |
| DOM Manipulation | 🔴 HIGH | Code review, limited scope, read-only option | Never |
| Storage Write | 🟡 MEDIUM | Code review for destructive ops, backup | Optional |
| File Access | 🟡 MEDIUM | User file picker, no filesystem access | Optional |
| Geolocation | 🟡 MEDIUM | Browser permission required | Optional |
| Storage Read | 🟢 LOW | Read-only, code review optional | Yes |
| Clipboard Read | 🟢 LOW | Browser permission, explicit request | Yes |
| Clipboard Write | 🟢 LOW | Safe operation, code review optional | Yes |
| Notifications | 🟢 LOW | Browser permission, no sensitive data | Yes |
| Screenshots | 🟢 LOW | Requires user interaction | Yes |
| DOM Query | 🟢 LOW | Read-only, no side effects | Yes |

### Security Best Practices

1. **Never Auto-Approve High-Risk Operations**
   - JavaScript execution must always be reviewed
   - DOM manipulation must always be reviewed
   - Storage writes should be reviewed

2. **Sandbox All Code Execution**
   - Use Web Workers for isolation
   - Whitelist safe APIs only
   - Block access to sensitive globals (window, document, localStorage)
   - Enforce strict timeouts (10s max)
   - Limit setTimeout to 5s max

3. **Limit Result Sizes**
   - Maximum 10KB result size
   - Truncate large outputs
   - Prevent memory exhaustion
   - Stream large results when possible

4. **Audit Logging**
   - Log all executions to history
   - Include timestamps, args, results
   - Track edited vs original code
   - Allow export for review
   - Retain last 100 executions

5. **User Control**
   - All features disabled by default
   - Explicit opt-in required
   - Clear permission warnings
   - Easy disable mechanism
   - Per-feature granular control

6. **Code Review Workflow**
   - Show original code clearly
   - Allow editing before approval
   - Track edited code separately
   - Highlight changes visually
   - Provide safety recommendations

### Attack Vectors & Mitigations

| Attack | Vector | Mitigation | Severity |
|--------|--------|------------|----------|
| XSS via clipboard | Write malicious HTML | Sanitize content, show preview | Medium |
| Data exfiltration | Fetch API POST | Block POST/PUT/DELETE, allow GET only | High |
| Infinite loop DoS | while(true) | 10-second timeout, worker termination | Medium |
| Memory exhaustion | Large allocations | Result size limits, worker memory limits | Medium |
| localStorage poisoning | Overwrite sensitive data | Code review for writes, show diff | High |
| Geolocation tracking | Repeated requests | Browser permission, show data before use | Low |
| DOM tampering | Modify critical UI | Code review, sandbox scope | High |
| Cookie theft | Access document.cookie | Block in sandbox, no document access | High |

---

## User Experience Design

### Code Review Dialog Flow

```
[AI requests browser feature]
       ↓
[Queue request for review]
       ↓
[Show CodeReviewDialog]
       ↓
[User sees: feature, risk level, code, description]
       ↓
[Two tabs: Review | Edit]
       ↓
   Review Tab:
     → Syntax-highlighted code (read-only)
     → Feature details
     → Arguments preview
     → Safety tips
       ↓
   Edit Tab:
     → Editable code area
     → Character count
     → Reset button
     → Modified indicator
     → Real-time validation
       ↓
   Actions:
     → Reject (cancel operation)
     → Always Allow (this session)
     → Approve (execute now)
     → Approve with Edits (if modified)
       ↓
   If Approve:
     → Execute (with edits if any)
     → Show result in chat
     → Add to history
     → Track execution time
       ↓
   If Reject:
     → Cancel execution
     → Tell AI operation was rejected
     → Log rejection in history
     → Continue conversation
```

### Execution History Workflow

```
[User opens Settings]
       ↓
[Click "View Execution History"]
       ↓
[Two-panel view: list + details]
       ↓
[List panel shows:]
  → Success/failure icon
  → Feature name
  → Timestamp
  → Description
  → Execution time
  → Sort by: newest, oldest, feature
       ↓
[Click entry → show details in right panel]
       ↓
[Details panel shows:]
  → Full status
  → Feature type
  → Description
  → Timestamp
  → Duration
  → Arguments (formatted JSON)
  → Code (if applicable)
  → Result (formatted JSON)
  → Edited indicator
       ↓
[Available actions:]
  → Delete this entry
  → Export history (JSON)
  → Clear all history
  → View statistics
```

### Settings Configuration Flow

```
[User opens Settings]
       ↓
[Navigate to Browser Features section]
       ↓
[See security warning banner at top]
       ↓
[Configure Code Review Mode:]
  → Always Review (recommended) ✓
  → Review High-Risk Only
  → Auto-Approve After Timeout
     └─ Timeout slider: 5-120 seconds
       ↓
[Enable/Disable Features:]
  For each feature:
    → Checkbox toggle
    → Feature name
    → Risk badge (HIGH/MEDIUM/LOW)
    → Description
       ↓
  For HIGH/MEDIUM risk features:
    → Show warning dialog on enable
    → Explain specific risks
    → Require explicit confirmation
       ↓
[Changes auto-save to localStorage]
       ↓
[Features available immediately in chat]
       ↓
[Link to "View Execution History"]
```

---

## Example Use Cases

### Use Case 1: Data Extraction & Storage

**User Prompt:** "Extract all email addresses from this page and save them to localStorage"

**AI Flow:**
1. **First Call:** `execute_browser_feature` with `feature: 'dom_query'`
   - Args: `{ selector: 'a[href^="mailto:"]' }`
   - Extracts email links from page
   
2. **Second Call:** `execute_browser_feature` with `feature: 'javascript'`
   - Code extracts email addresses from links
   - User reviews code in dialog
   
3. **Third Call:** `execute_browser_feature` with `feature: 'storage_write'`
   - Args: `{ storage_key: 'emails', storage_value: JSON.stringify(emails) }`
   - User reviews storage write operation
   - User approves
   
4. **AI Response:** "✓ Saved 15 email addresses to localStorage under key 'emails'"

### Use Case 2: Interactive Form Filling

**User Prompt:** "Fill out this contact form with my saved information"

**AI Flow:**
1. **First Call:** `execute_browser_feature` with `feature: 'storage_read'`
   - Args: `{ storage_key: 'contactInfo' }`
   - Retrieves saved contact information
   
2. **Second Call:** `execute_browser_feature` with `feature: 'dom_manipulate'`
   - Code:
     ```javascript
     document.querySelector('#name').value = contactInfo.name;
     document.querySelector('#email').value = contactInfo.email;
     document.querySelector('#phone').value = contactInfo.phone;
     ```
   - User reviews DOM manipulation code
   - User can edit if form selectors are different
   - User approves
   
3. **AI Response:** "✓ Form filled with your contact information"

### Use Case 3: Clipboard Management

**User Prompt:** "Copy the table data to clipboard in CSV format"

**AI Flow:**
1. **First Call:** `execute_browser_feature` with `feature: 'dom_query'`
   - Args: `{ selector: 'table tr' }`
   - Extracts table rows
   
2. **Second Call:** `execute_browser_feature` with `feature: 'javascript'`
   - Code converts table data to CSV format
   - User reviews conversion logic
   - User approves
   
3. **Third Call:** `execute_browser_feature` with `feature: 'clipboard_write'`
   - Args: `{ clipboard_text: csvData }`
   - User approves clipboard write
   
4. **AI Response:** "✓ Copied 50 rows as CSV (2.4 KB) to clipboard"

### Use Case 4: Location-Based Actions

**User Prompt:** "Show me the weather for my current location"

**AI Flow:**
1. **First Call:** `execute_browser_feature` with `feature: 'geolocation'`
   - User reviews geolocation request
   - User approves in dialog
   - Browser prompts for location permission
   - User approves browser prompt
   - Location coordinates obtained
   
2. **AI uses coordinates** to fetch weather via API
   
3. **AI Response:** "📍 Your location: San Francisco, CA\n🌤️ Current: 72°F, Partly Cloudy"

### Use Case 5: Screenshot Documentation

**User Prompt:** "Take a screenshot of this error message for debugging"

**AI Flow:**
1. **First Call:** `execute_browser_feature` with `feature: 'screenshot'`
   - Args: `{ selector: '.error-message' }`
   - User reviews screenshot request
   - User approves
   - Screenshot captured as data URL
   
2. **AI analyzes screenshot** and provides help
   
3. **AI Response:** "I can see the error: '404 Not Found - /api/users'. This means the API endpoint doesn't exist..."

---

## Performance Optimization

### Caching Strategies

1. **Permission Cache**
   ```typescript
   class PermissionCache {
     private cache = new Map<string, boolean>();
     private ttl = 60000; // 1 minute
     
     get(key: string): boolean | null {
       const cached = this.cache.get(key);
       if (cached !== undefined) return cached;
       
       // Read from localStorage and cache
       const value = localStorage.getItem(key) === 'true';
       this.cache.set(key, value);
       setTimeout(() => this.cache.delete(key), this.ttl);
       return value;
     }
   }
   ```

2. **Code Review State**
   ```typescript
   // Remember "always allow" for session
   const sessionApprovals = new Set<string>();
   
   function isAlwaysAllowed(codeHash: string): boolean {
     return sessionApprovals.has(codeHash);
   }
   
   function markAlwaysAllowed(code: string): void {
     const hash = hashCode(code);
     sessionApprovals.add(hash);
   }
   ```

3. **Execution Results**
   ```typescript
   // Cache expensive operations
   interface CacheEntry {
     result: any;
     timestamp: number;
     ttl: number;
   }
   
   const resultCache = new Map<string, CacheEntry>();
   
   function getCached(key: string): any | null {
     const entry = resultCache.get(key);
     if (!entry) return null;
     
     if (Date.now() - entry.timestamp > entry.ttl) {
       resultCache.delete(key);
       return null;
     }
     
     return entry.result;
   }
   ```

### Lazy Loading

```typescript
// Lazy load sandbox only when needed
let sandboxInstance: JavaScriptSandbox | null = null;

function getSandbox(): JavaScriptSandbox {
  if (!sandboxInstance) {
    console.log('Creating JavaScript sandbox...');
    sandboxInstance = new JavaScriptSandbox();
  }
  return sandboxInstance;
}

// Cleanup on page unload
window.addEventListener('beforeunload', () => {
  if (sandboxInstance) {
    console.log('Cleaning up sandbox...');
    sandboxInstance.destroy();
    sandboxInstance = null;
  }
});
```

### Worker Pool

```typescript
// Reuse workers instead of creating new ones
class SandboxPool {
  private pool: JavaScriptSandbox[] = [];
  private maxSize = 3;
  private activeCount = 0;
  
  async acquire(): Promise<JavaScriptSandbox> {
    if (this.pool.length > 0) {
      const sandbox = this.pool.pop()!;
      this.activeCount++;
      return sandbox;
    }
    
    if (this.activeCount < this.maxSize) {
      this.activeCount++;
      return new JavaScriptSandbox();
    }
    
    // Wait for a worker to become available
    await new Promise(resolve => setTimeout(resolve, 100));
    return this.acquire();
  }
  
  release(sandbox: JavaScriptSandbox): void {
    this.activeCount--;
    
    if (this.pool.length < this.maxSize) {
      this.pool.push(sandbox);
    } else {
      sandbox.destroy();
    }
  }
  
  cleanup(): void {
    this.pool.forEach(s => s.destroy());
    this.pool = [];
    this.activeCount = 0;
  }
}

// Global pool instance
const sandboxPool = new SandboxPool();
```

---

## Documentation

### User Documentation
- [ ] **Browser Features Overview**
  - What are browser features
  - How they enhance AI capabilities
  - When to use them
  
- [ ] **Security Guide**
  - Understanding risk levels
  - How code review works
  - Best practices for safe use
  - Warning signs of malicious code
  
- [ ] **Setup Guide**
  - Enabling browser features
  - Configuring review modes
  - Setting permissions
  - Testing features
  
- [ ] **Feature Reference**
  - JavaScript execution examples
  - Storage operations
  - Clipboard operations
  - DOM manipulation patterns
  - Geolocation usage
  - File reading workflows
  - Screenshot capture
  
- [ ] **Code Review Tutorial**
  - Understanding the review dialog
  - Editing code before approval
  - Safety checklist
  - Common patterns to watch for
  
- [ ] **Troubleshooting Guide**
  - Permission errors
  - Execution failures
  - Browser compatibility
  - Performance issues
  - Common mistakes

### Developer Documentation
- [ ] **Architecture Overview**
  - System design
  - Component relationships
  - Data flow diagrams
  - Security architecture
  
- [ ] **Adding New Features**
  - Feature handler pattern
  - Permission integration
  - Testing requirements
  - Documentation needs
  
- [ ] **Security Guidelines**
  - Sandbox requirements
  - Permission checks
  - Input validation
  - Output sanitization
  - Audit logging
  
- [ ] **Testing Guide**
  - Unit test patterns
  - Integration test setup
  - Security test cases
  - Performance benchmarks
  
- [ ] **API Reference**
  - ExecuteBrowserFeature parameters
  - Feature-specific APIs
  - Error codes
  - Return value formats

---

## Success Metrics

### Safety Metrics
- **Security Incidents:** Target = 0
- **Sandbox Escapes:** Target = 0
- **Permission Bypasses:** Target = 0
- **Code Review Skips:** Track rate, target < 5% for high-risk

### Adoption Metrics
- **Enabled Users:** % of users who enable any feature
- **Active Users:** % who actually use features weekly
- **Feature Popularity:** Most/least used features
- **Review Approval Rate:** % of reviews that are approved vs rejected

### Usage Metrics
- **Calls Per Session:** Average browser feature calls
- **Features Per User:** Average features enabled per user
- **Execution Time:** P50, P95, P99 execution times
- **Success Rate:** % of executions that succeed

### Reliability Metrics
- **Error Rate:** % of failed executions
- **Timeout Rate:** % of executions that timeout
- **Browser Compatibility:** Success rate by browser
- **Performance:** Average response time

### User Experience Metrics
- **Review Time:** Time spent in review dialog
- **Edit Rate:** % of code that is edited before approval
- **Session Duration:** Time from request to approval
- **Satisfaction Score:** User ratings (1-5)

### Business Metrics
- **Feature Value:** User-reported usefulness
- **Support Tickets:** Feature-related issues
- **Churn Impact:** Effect on user retention
- **Engagement:** Increase in overall platform usage

---

## Monitoring & Analytics

### Event Tracking

```typescript
// Track all browser feature events
interface BrowserFeatureEvent {
  type: 'request' | 'review' | 'approve' | 'reject' | 'execute' | 'error';
  feature: string;
  timestamp: number;
  userId: string;
  sessionId: string;
  metadata: Record<string, any>;
}

function trackEvent(event: BrowserFeatureEvent): void {
  // Send to analytics service
  analytics.track('browser_feature', event);
  
  // Log locally for debugging
  console.log('[Browser Feature]', event);
}

// Usage
trackEvent({
  type: 'approve',
  feature: 'javascript',
  timestamp: Date.now(),
  userId: getCurrentUserId(),
  sessionId: getSessionId(),
  metadata: {
    edited: true,
    review_time_ms: 15000,
    code_length: 250
  }
});
```

### Error Monitoring

```typescript
// Monitor and report errors
function reportError(error: Error, context: any): void {
  // Send to error tracking service
  errorTracker.captureException(error, {
    tags: {
      feature: 'browser_features',
      component: context.component
    },
    extra: context
  });
  
  // Log to console
  console.error('[Browser Feature Error]', error, context);
}

// Usage
try {
  await executeBrowserFeature(args);
} catch (error) {
  reportError(error, {
    component: 'execute_browser_feature',
    feature: args.feature,
    args: args
  });
}
```

---

*Plan Created: October 2025*  
*Plan Expanded: October 2025*  
*Status: Ready for Phase 6 Implementation* ⚙️🔒🚀

**WARNING: This feature enables code execution. Implement with extreme caution!** ⚠️

**Total Estimated Implementation Time: ~20 hours (2.5 days)**

**Key Benefits:**
- ✅ Unified tool interface for all browser features
- ✅ Comprehensive code review with editing capability
- ✅ Full execution history and audit trail
- ✅ Granular permission control
- ✅ Production-ready security measures
- ✅ Excellent user experience
- ✅ Complete documentation
