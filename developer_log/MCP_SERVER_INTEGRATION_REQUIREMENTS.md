# MCP Server Integration Requirements

**Date**: October 12, 2025  
**Status**: 📋 ANALYSIS & REQUIREMENTS  
**Purpose**: Define requirements for Lambda function to execute MCP server tools

## Executive Summary

The UI already has MCP server configuration (name, URL, enable/disable), but the Lambda backend doesn't yet support calling MCP servers. This document outlines what's needed to integrate Model Context Protocol (MCP) servers into the Lambda function's tool execution flow.

## Current State

### Frontend (✅ Already Implemented)
- **UI**: Settings modal has "Configure MCP" button
- **Storage**: MCP servers stored in localStorage (`chat_mcp_servers`)
- **Dialog**: Add/edit/delete MCP servers with name and URL
- **Placeholder**: ChatTab logs enabled MCP servers but doesn't send them

```typescript
// ui-new/src/components/ChatTab.tsx (line 743-747)
mcpServers.filter(server => server.enabled).forEach(server => {
  // MCP servers would be added here when backend supports them
  console.log('MCP Server enabled:', server.name, server.url);
});
```

### Backend (❌ Not Implemented)
- **No MCP client implementation**
- **No MCP tool discovery**
- **No MCP tool execution**
- **No MCP protocol handling**

## What is MCP (Model Context Protocol)?

### Overview
MCP is a protocol for LLM applications to interact with external data sources and tools through standardized servers.

### Architecture
```
┌─────────────────┐
│  LLM Application│  (Lambda Function)
│   (MCP Client)  │
└────────┬────────┘
         │ JSON-RPC over HTTP/SSE
         │
    ┌────▼────┐
    │   MCP   │  (External Server)
    │  Server │
    └────┬────┘
         │
    ┌────▼────┐
    │  Tools  │  (Filesystem, Database, APIs, etc.)
    │  Data   │
    └─────────┘
```

### Protocol Basics
- **Transport**: HTTP with Server-Sent Events (SSE) or WebSocket
- **Format**: JSON-RPC 2.0
- **Operations**:
  - `tools/list` - Discover available tools
  - `tools/call` - Execute a tool
  - `resources/list` - List available resources
  - `resources/read` - Read a resource

## Requirements

### 1. Frontend Changes (Minor)

#### Send MCP Servers in Request
**File**: `ui-new/src/components/ChatTab.tsx`

**Current** (line 743-747):
```typescript
// Add enabled MCP servers (placeholder - would need MCP integration)
mcpServers.filter(server => server.enabled).forEach(server => {
  // MCP servers would be added here when backend supports them
  console.log('MCP Server enabled:', server.name, server.url);
});
```

**Needed**:
```typescript
// Add MCP servers to request body
const requestBody = {
  messages: filteredMessages,
  model: selectedModel,
  stream: true,
  tools: tools.length > 0 ? tools : undefined,
  // NEW: Include MCP servers
  mcp_servers: mcpServers
    .filter(server => server.enabled)
    .map(server => ({
      name: server.name,
      url: server.url
    }))
};
```

**Estimated Effort**: 10 minutes

---

### 2. Backend Changes (Major)

#### A. MCP Client Implementation

**New File**: `src/mcp/client.js`

**Purpose**: Handle JSON-RPC communication with MCP servers

**Functions Needed**:

```javascript
/**
 * Discover tools from an MCP server
 * @param {string} serverUrl - MCP server URL
 * @returns {Promise<Array>} List of available tools
 */
async function discoverTools(serverUrl) {
  // 1. Make JSON-RPC request to serverUrl
  // 2. Call method: "tools/list"
  // 3. Parse response
  // 4. Return tool schemas
}

/**
 * Execute a tool on an MCP server
 * @param {string} serverUrl - MCP server URL
 * @param {string} toolName - Name of the tool
 * @param {Object} arguments - Tool arguments
 * @returns {Promise<Object>} Tool execution result
 */
async function executeTool(serverUrl, toolName, arguments) {
  // 1. Make JSON-RPC request to serverUrl
  // 2. Call method: "tools/call"
  // 3. Pass tool name and arguments
  // 4. Return result
}

/**
 * Initialize connection to MCP server
 * @param {string} serverUrl - MCP server URL
 * @returns {Promise<boolean>} Connection success
 */
async function connectToServer(serverUrl) {
  // 1. Establish connection (HTTP/SSE/WebSocket)
  // 2. Perform handshake if needed
  // 3. Return connection status
}
```

**JSON-RPC Format**:
```json
// Request: tools/list
{
  "jsonrpc": "2.0",
  "id": 1,
  "method": "tools/list",
  "params": {}
}

// Response: tools/list
{
  "jsonrpc": "2.0",
  "id": 1,
  "result": {
    "tools": [
      {
        "name": "read_file",
        "description": "Read contents of a file",
        "inputSchema": {
          "type": "object",
          "properties": {
            "path": {
              "type": "string",
              "description": "File path"
            }
          },
          "required": ["path"]
        }
      }
    ]
  }
}

// Request: tools/call
{
  "jsonrpc": "2.0",
  "id": 2,
  "method": "tools/call",
  "params": {
    "name": "read_file",
    "arguments": {
      "path": "/home/user/document.txt"
    }
  }
}

// Response: tools/call
{
  "jsonrpc": "2.0",
  "id": 2,
  "result": {
    "content": [
      {
        "type": "text",
        "text": "File contents here..."
      }
    ]
  }
}
```

**Dependencies**:
- `https` module (built-in)
- JSON-RPC 2.0 spec compliance

**Estimated Effort**: 4-6 hours

---

#### B. Tool Discovery and Caching

**New File**: `src/mcp/tool-cache.js`

**Purpose**: Cache discovered tools to avoid repeated discovery calls

**Functions Needed**:

```javascript
/**
 * Cache for MCP tool schemas
 * Key: serverUrl, Value: { tools: [...], timestamp: Date }
 */
const toolCache = new Map();

/**
 * Get tools from cache or discover them
 * @param {string} serverUrl - MCP server URL
 * @param {number} maxAge - Max cache age in milliseconds
 * @returns {Promise<Array>} Tool schemas
 */
async function getTools(serverUrl, maxAge = 300000) {
  const cached = toolCache.get(serverUrl);
  if (cached && Date.now() - cached.timestamp < maxAge) {
    return cached.tools;
  }
  
  const tools = await discoverTools(serverUrl);
  toolCache.set(serverUrl, { tools, timestamp: Date.now() });
  return tools;
}

/**
 * Clear cache for a specific server
 */
function clearCache(serverUrl) {
  toolCache.delete(serverUrl);
}
```

**Cache Strategy**:
- Cache tools per server for 5 minutes
- Clear cache on error (server unreachable)
- Optional: Persist cache to Lambda /tmp directory

**Estimated Effort**: 2-3 hours

---

#### C. Tool Merging and Conflict Resolution

**Update File**: `src/tools.js`

**Purpose**: Merge MCP tools with built-in tools

**New Function**:

```javascript
/**
 * Merge MCP tools with built-in tools
 * @param {Array} builtInTools - Built-in tool schemas
 * @param {Array} mcpServers - MCP server configurations
 * @returns {Promise<Array>} Merged tool schemas
 */
async function mergeTools(builtInTools, mcpServers) {
  const allTools = [...builtInTools];
  
  for (const server of mcpServers) {
    try {
      const mcpTools = await getTools(server.url);
      
      // Convert MCP tool schema to OpenAI function schema
      for (const mcpTool of mcpTools) {
        const openAITool = {
          type: 'function',
          function: {
            name: `${server.name}__${mcpTool.name}`, // Namespace with server name
            description: mcpTool.description,
            parameters: mcpTool.inputSchema
          },
          // Mark as MCP tool for routing
          _mcp: {
            serverUrl: server.url,
            serverName: server.name,
            originalName: mcpTool.name
          }
        };
        
        allTools.push(openAITool);
      }
    } catch (error) {
      console.error(`Failed to load tools from ${server.name}:`, error);
      // Continue with other servers
    }
  }
  
  return allTools;
}
```

**Naming Convention**:
- Built-in tools: `search_web`, `execute_javascript`, etc.
- MCP tools: `<server_name>__<tool_name>`
- Example: `filesystem__read_file`, `github__create_issue`

**Conflict Resolution**:
- Namespace MCP tools by server name
- If two servers have same tool name, both are available with different namespaces
- LLM sees fully qualified names in tool list

**Estimated Effort**: 3-4 hours

---

#### D. Tool Execution Routing

**Update File**: `src/tools.js`

**Purpose**: Route tool calls to MCP servers or built-in handlers

**Modified Function**:

```javascript
/**
 * Call a function by name with given arguments
 * Routes to MCP server or built-in handler
 * @param {string} functionName - Name of the function to call
 * @param {Object} args - Parsed arguments for the function
 * @param {Object} context - Additional context (user info, progress callbacks)
 * @returns {Promise<string>} JSON result of function call
 */
async function callFunction(functionName, args, context = {}) {
  // Check if this is an MCP tool (has __ separator)
  if (functionName.includes('__')) {
    const [serverName, toolName] = functionName.split('__');
    
    // Find MCP server by name
    const mcpServers = context.mcpServers || [];
    const server = mcpServers.find(s => s.name === serverName);
    
    if (!server) {
      throw new Error(`MCP server not found: ${serverName}`);
    }
    
    // Execute tool on MCP server
    return await executeMCPTool(server.url, toolName, args, context);
  }
  
  // Handle built-in tools (existing code)
  switch (functionName) {
    case 'search_web':
      return await searchWeb(args, context);
    case 'execute_javascript':
      return await executeJavaScript(args);
    // ... other built-in tools
  }
}

/**
 * Execute a tool on an MCP server
 * @param {string} serverUrl - MCP server URL
 * @param {string} toolName - Original tool name (without namespace)
 * @param {Object} arguments - Tool arguments
 * @param {Object} context - Execution context
 * @returns {Promise<string>} JSON result
 */
async function executeMCPTool(serverUrl, toolName, arguments, context) {
  const { progressCallback } = context;
  
  // Emit progress event
  if (progressCallback) {
    progressCallback({
      type: 'tool_start',
      tool: toolName,
      server: serverUrl
    });
  }
  
  try {
    const result = await mcpClient.executeTool(serverUrl, toolName, arguments);
    
    // Emit completion event
    if (progressCallback) {
      progressCallback({
        type: 'tool_complete',
        tool: toolName,
        server: serverUrl
      });
    }
    
    // Convert MCP result to string
    return JSON.stringify(result);
  } catch (error) {
    console.error(`MCP tool execution failed: ${toolName}`, error);
    
    // Emit error event
    if (progressCallback) {
      progressCallback({
        type: 'tool_error',
        tool: toolName,
        server: serverUrl,
        error: error.message
      });
    }
    
    throw error;
  }
}
```

**Estimated Effort**: 2-3 hours

---

#### E. Chat Endpoint Integration

**Update File**: `src/endpoints/chat.js`

**Purpose**: Pass MCP servers through the tool execution flow

**Changes Needed**:

```javascript
// Line ~400: Parse MCP servers from request
const mcpServers = body.mcp_servers || [];

// Log MCP servers
console.log(`🔌 MCP Servers: ${mcpServers.length}`);
mcpServers.forEach(server => {
  console.log(`  - ${server.name}: ${server.url}`);
});

// Line ~450: Merge MCP tools with built-in tools
const builtInTools = getBuiltInTools(enabledTools);
const allTools = await mergeTools(builtInTools, mcpServers);

console.log(`🔧 Total Tools: ${allTools.length} (${builtInTools.length} built-in + ${allTools.length - builtInTools.length} MCP)`);

// Line ~600: Pass MCP servers to tool execution
const toolResults = await executeToolCalls(toolCalls, {
  accessToken,
  model: selectedModel,
  apiKey: currentKey,
  mcpServers, // NEW
  progressCallback: (event) => {
    sseWriter.writeEvent('tool_progress', event);
  }
});
```

**Estimated Effort**: 1-2 hours

---

### 3. Error Handling

**Scenarios to Handle**:

1. **MCP Server Unreachable**
   - Timeout after 30 seconds
   - Return error to LLM explaining server is unavailable
   - Remove tools from that server from tool list

2. **Tool Discovery Fails**
   - Log error
   - Skip that server
   - Continue with other servers

3. **Tool Execution Fails**
   - Return error message to LLM
   - Allow LLM to retry or choose different tool

4. **Invalid JSON-RPC Response**
   - Parse error handling
   - Log full response for debugging
   - Return generic error to LLM

5. **Rate Limiting**
   - Respect MCP server rate limits
   - Implement exponential backoff
   - Cache tools aggressively

**Estimated Effort**: 2-3 hours

---

### 4. Security Considerations

**Risks**:
1. **Untrusted MCP Servers**: Users could add malicious servers
2. **Data Leakage**: LLM context sent to external servers
3. **Code Execution**: MCP tools might execute arbitrary code
4. **Credential Exposure**: API keys in context might leak

**Mitigations**:

1. **URL Validation**
   ```javascript
   function validateMCPServerUrl(url) {
     // Only allow HTTP/HTTPS
     if (!url.startsWith('http://') && !url.startsWith('https://')) {
       throw new Error('Invalid protocol');
     }
     
     // Warn on localhost (only allow in dev)
     if (url.includes('localhost') && process.env.NODE_ENV === 'production') {
       throw new Error('Localhost not allowed in production');
     }
     
     // Block internal IPs
     if (url.match(/127\.\d+\.\d+\.\d+|10\.\d+\.\d+\.\d+|192\.168\.\d+\.\d+/)) {
       throw new Error('Internal IPs not allowed');
     }
   }
   ```

2. **Content Filtering**
   ```javascript
   function sanitizeToolArguments(args) {
     // Remove sensitive keys from context
     const sanitized = { ...args };
     delete sanitized.apiKey;
     delete sanitized.accessToken;
     delete sanitized.credentials;
     return sanitized;
   }
   ```

3. **User Warning**
   - Add warning in UI when adding MCP server
   - Explain that server will receive conversation context
   - Require user confirmation

4. **Timeout and Resource Limits**
   - 30 second timeout per tool call
   - Max 10 MB response size
   - Max 10 concurrent MCP tool calls

**Estimated Effort**: 2-3 hours

---

### 5. UI Enhancements

**Optional Improvements**:

1. **MCP Server Status Indicator**
   - Show green/red/yellow dot next to server name
   - Green: Connected and responding
   - Yellow: Connecting or slow
   - Red: Error or unreachable

2. **Tool Discovery UI**
   - Button: "Discover Tools" per server
   - Show list of available tools
   - Allow enable/disable individual tools

3. **Tool Execution Logs**
   - Show MCP tool executions in chat
   - Display server name and tool name
   - Show execution time

4. **MCP Server Templates**
   - Pre-configured servers (GitHub, Filesystem, etc.)
   - One-click add with URL template
   - Documentation links

**Estimated Effort**: 4-6 hours (optional)

---

## Implementation Plan

### Phase 1: Core MCP Client (8-10 hours)
1. ✅ Implement `src/mcp/client.js`
   - JSON-RPC communication
   - `tools/list` and `tools/call` methods
   - Error handling and timeouts

2. ✅ Implement `src/mcp/tool-cache.js`
   - Tool schema caching
   - Cache invalidation

3. ✅ Update `src/tools.js`
   - `mergeTools()` function
   - `executeMCPTool()` routing

### Phase 2: Integration (4-6 hours)
4. ✅ Update `src/endpoints/chat.js`
   - Parse `mcp_servers` from request
   - Merge tools before LLM call
   - Pass MCP servers to tool execution

5. ✅ Update `ui-new/src/components/ChatTab.tsx`
   - Send `mcp_servers` in request body
   - Remove placeholder comment

### Phase 3: Security & Polish (4-6 hours)
6. ✅ Implement security validations
   - URL validation
   - Content sanitization
   - Rate limiting

7. ✅ Add error handling
   - Server unreachable
   - Tool execution errors
   - Timeout handling

8. ✅ Add UI warnings
   - Security notice when adding MCP server
   - Data sharing explanation

### Phase 4: Testing (4-6 hours)
9. ✅ Create test MCP server
   - Simple HTTP server with 2-3 tools
   - Responds to `tools/list` and `tools/call`

10. ✅ Integration testing
    - Add test server to UI
    - Verify tool discovery
    - Execute tools from chat
    - Test error scenarios

### Phase 5: Documentation (2-3 hours)
11. ✅ Create user documentation
    - How to add MCP server
    - Security considerations
    - Example servers

12. ✅ Create developer documentation
    - MCP client API
    - Tool merging logic
    - Extension points

---

## Total Estimated Effort

- **Phase 1**: 8-10 hours
- **Phase 2**: 4-6 hours
- **Phase 3**: 4-6 hours
- **Phase 4**: 4-6 hours
- **Phase 5**: 2-3 hours

**Total**: 22-31 hours (~3-4 days of focused development)

---

## Example MCP Server

### Simple Filesystem MCP Server (Node.js)

```javascript
// mcp-filesystem-server.js
const express = require('express');
const fs = require('fs').promises;
const path = require('path');

const app = express();
app.use(express.json());

// JSON-RPC handler
app.post('/', async (req, res) => {
  const { id, method, params } = req.body;
  
  try {
    let result;
    
    if (method === 'tools/list') {
      result = {
        tools: [
          {
            name: 'read_file',
            description: 'Read contents of a file',
            inputSchema: {
              type: 'object',
              properties: {
                path: { type: 'string', description: 'File path' }
              },
              required: ['path']
            }
          },
          {
            name: 'list_directory',
            description: 'List files in a directory',
            inputSchema: {
              type: 'object',
              properties: {
                path: { type: 'string', description: 'Directory path' }
              },
              required: ['path']
            }
          }
        ]
      };
    } else if (method === 'tools/call') {
      const { name, arguments: args } = params;
      
      if (name === 'read_file') {
        const content = await fs.readFile(args.path, 'utf-8');
        result = {
          content: [{ type: 'text', text: content }]
        };
      } else if (name === 'list_directory') {
        const files = await fs.readdir(args.path);
        result = {
          content: [{ type: 'text', text: JSON.stringify(files, null, 2) }]
        };
      } else {
        throw new Error('Unknown tool: ' + name);
      }
    } else {
      throw new Error('Unknown method: ' + method);
    }
    
    res.json({ jsonrpc: '2.0', id, result });
  } catch (error) {
    res.json({
      jsonrpc: '2.0',
      id,
      error: {
        code: -32000,
        message: error.message
      }
    });
  }
});

app.listen(3100, () => {
  console.log('MCP Filesystem Server running on http://localhost:3100');
});
```

**Usage**:
1. Run: `node mcp-filesystem-server.js`
2. Add in UI: Name: "filesystem", URL: "http://localhost:3100"
3. Enable server
4. Ask LLM: "What files are in my home directory?"
5. LLM calls: `filesystem__list_directory({ path: '/home/user' })`

---

## Testing Checklist

- [ ] Tool discovery works
- [ ] Tool execution returns results
- [ ] Multiple MCP servers work simultaneously
- [ ] Tool name conflicts resolved via namespacing
- [ ] Error handling for unreachable servers
- [ ] Error handling for invalid responses
- [ ] Security: URL validation works
- [ ] Security: Sensitive data sanitized
- [ ] Timeout after 30 seconds
- [ ] Cache works (no repeated discovery calls)
- [ ] UI sends MCP servers correctly
- [ ] Lambda receives and processes MCP servers
- [ ] SSE events include MCP tool execution status

---

## References

### MCP Specification
- **Official Spec**: https://modelcontextprotocol.io/docs
- **JSON-RPC 2.0**: https://www.jsonrpc.org/specification
- **Tool Schema**: https://modelcontextprotocol.io/docs/concepts/tools

### Existing Implementations
- **Anthropic MCP SDK**: https://github.com/anthropics/model-context-protocol
- **MCP Server Examples**: https://github.com/modelcontextprotocol/servers

---

## Next Steps

1. **Decision**: Approve implementation plan
2. **Phase 1**: Start with core MCP client
3. **Test Server**: Build simple filesystem server for testing
4. **Iterate**: Implement, test, refine
5. **Deploy**: Roll out to production

---

## Questions & Answers

**Q: Can MCP servers use WebSocket instead of HTTP?**  
A: Yes, but HTTP/SSE is simpler for Lambda. WebSocket support can be added later.

**Q: How do we handle authentication to MCP servers?**  
A: Phase 1 assumes no auth. Phase 2 could add API key support per server.

**Q: What if MCP server is slow (>30s)?**  
A: Timeout and return error to LLM. LLM can try different approach.

**Q: Can users add any URL?**  
A: Yes with warnings. We validate URL format and block internal IPs.

**Q: Does this work with existing tools?**  
A: Yes! MCP tools are merged with built-in tools. LLM sees all available tools.

---

## Conclusion

MCP server integration is feasible and well-scoped. The main work is:
1. **JSON-RPC client** for tool discovery and execution
2. **Tool merging** to combine MCP and built-in tools
3. **Routing logic** to dispatch tool calls correctly
4. **Security** to protect against malicious servers

Estimated **3-4 days** of focused development for full implementation.
