# MCP Server Integration Implementation

**Date:** January 2025  
**Status:** ✅ IMPLEMENTED  
**Deployment:** Pending testing and deployment

## Executive Summary

Successfully implemented full Model Context Protocol (MCP) server integration for the Lambda LLM proxy. The system now supports connecting to external MCP servers to extend tool capabilities beyond the built-in tools. MCP tools are automatically discovered, cached, merged with built-in tools, and executed via JSON-RPC 2.0 protocol.

## Implementation Overview

### Architecture

```
Frontend (ChatTab.tsx)
    ↓ (sends mcp_servers array)
Backend (chat.js)
    ↓ (merges tools)
tools.js (mergeTools)
    ↓ (discovers & caches)
mcp/tool-cache.js
    ↓ (JSON-RPC calls)
mcp/client.js
    ↓ (HTTP/HTTPS)
External MCP Server
```

### Protocol: JSON-RPC 2.0

- **Transport:** HTTP/HTTPS POST requests
- **Format:** JSON-RPC 2.0 messages
- **Methods:**
  - `tools/list` - Discover available tools
  - `tools/call` - Execute a tool

### Tool Namespacing

MCP tools are namespaced to avoid conflicts with built-in tools:
- **Format:** `<server_name>__<tool_name>`
- **Example:** `test__read_file`, `github__search_repos`

## Files Created

### 1. src/mcp/client.js (360 lines)

Core MCP client implementing JSON-RPC 2.0 communication.

**Key Functions:**
- `sendJsonRpcRequest(serverUrl, method, params, timeout)` - Low-level JSON-RPC request handler
- `discoverTools(serverUrl)` - Fetch tool list from MCP server
- `executeTool(serverUrl, toolName, toolArguments)` - Execute a tool
- `testConnection(serverUrl)` - Test server connectivity
- `validateServerUrl(serverUrl)` - Security: URL validation and SSRF protection

**Features:**
- 30-second default timeout per request
- 10 MB response size limit
- SSRF protection (blocks private IPs, localhost, link-local)
- Automatic request ID generation
- Comprehensive error handling
- Response validation

**Security:**
- ✅ URL validation (blocks internal networks)
- ✅ Timeout enforcement (30s default)
- ✅ Response size limits (10 MB max)
- ✅ Protocol restrictions (HTTP/HTTPS only)
- ✅ JSON-RPC version validation
- ✅ Request/response ID matching

### 2. src/mcp/tool-cache.js (160 lines)

Tool caching system with TTL-based expiration.

**Key Functions:**
- `getTools(serverUrl, maxAge)` - Get tools from cache or discover
- `clearCache(serverUrl)` - Clear cache for specific server or all
- `getCacheStats()` - Get cache statistics
- `isCached(serverUrl, maxAge)` - Check if tools are cached
- `preloadTools(serverUrls, timeout)` - Warm cache at cold start
- `cleanupExpired(maxAge)` - Remove expired entries

**Features:**
- 5-minute default TTL
- Per-server caching
- Automatic expiration
- Cache statistics
- Preload support for cold starts
- Memory management utilities

**Cache Structure:**
```javascript
{
  serverUrl: string,
  tools: Array<ToolDefinition>,
  timestamp: number
}
```

### 3. test-mcp-server.js (280 lines)

Express-based test MCP server for development and testing.

**Available Tools:**
- `read_file` - Read file contents from filesystem
- `list_directory` - List directory contents with details
- `get_system_info` - Get system information (OS, memory, CPU)

**Features:**
- Full JSON-RPC 2.0 compliance
- CORS enabled for local testing
- Health check endpoint
- Detailed logging
- Error handling

**Usage:**
```bash
# Start server
node test-mcp-server.js

# Test with curl
curl -X POST http://localhost:3001 \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":"1","method":"tools/list","params":{}}'
```

## Files Modified

### 1. src/tools.js

**Added:**
- Import of MCP client and cache modules
- `mergeTools(builtInTools, mcpServers)` - Merge built-in and MCP tools
- `executeMCPTool(namespacedName, args, context)` - Execute MCP tool
- Updated `callFunction()` default case to route MCP tools
- Exported new functions in module.exports

**Key Logic:**
```javascript
// Default case in callFunction switch
default: {
  // Check if this is an MCP tool (format: serverName__toolName)
  if (name.includes('__')) {
    return await executeMCPTool(name, args, context);
  }
  return JSON.stringify({ error: `unknown function ${name}` });
}
```

**mergeTools() Flow:**
1. Start with built-in tools array
2. For each MCP server:
   - Validate server configuration (name, url)
   - Validate URL (security checks)
   - Get tools from cache or discover
   - Convert to OpenAI function format
   - Add namespace prefix: `serverName__toolName`
   - Add to merged tools array
3. Return merged array

**executeMCPTool() Flow:**
1. Parse namespaced tool name (split on `__`)
2. Find server URL from context.mcpServers
3. Validate server URL
4. Execute tool via MCP client
5. Format response (concatenate text content)
6. Return result

### 2. src/endpoints/chat.js

**Added:**
- Import `mergeTools` from tools.js
- Parse `mcp_servers` from request body
- Merge MCP tools with built-in tools before LLM request
- Add `mcpServers` to tool execution context

**Key Changes:**

**Request Body Parsing (line ~462):**
```javascript
let { messages, model, tools, providers: userProviders, 
      isRetry, retryContext, mcp_servers } = body;

// Parse MCP servers
let mcpServers = [];
if (mcp_servers) {
  mcpServers = typeof mcp_servers === 'string' 
    ? JSON.parse(mcp_servers) 
    : mcp_servers;
  console.log(`[MCP] Received ${mcpServers.length} MCP server(s)`);
}

// Merge MCP tools with built-in tools
if (mcpServers.length > 0) {
  tools = await mergeTools(tools || [], mcpServers);
  console.log(`[MCP] Merged tools: ${tools.length} total`);
}
```

**Tool Context (line ~777):**
```javascript
const toolContext = {
  user: verifiedUser.email,
  model,
  apiKey,
  googleToken,
  youtubeAccessToken: youtubeToken,
  tavilyApiKey,
  mcpServers, // NEW: Pass MCP servers for tool routing
  timestamp: new Date().toISOString()
};
```

### 3. ui-new/src/components/ChatTab.tsx

**Added:**
- MCP servers to request payload when sending chat messages

**Key Change (line ~1150):**
```typescript
// Add MCP servers (filter enabled only)
const enabledMCPServers = mcpServers.filter(s => s.enabled);
if (enabledMCPServers.length > 0) {
  requestPayload.mcp_servers = enabledMCPServers.map(s => ({
    name: s.name,
    url: s.url
  }));
  console.log('[MCP] Sending MCP servers:', 
    enabledMCPServers.map(s => s.name).join(', '));
}
```

**Note:** The UI already has MCP server management built-in (stored in localStorage as `chat_mcp_servers`). This change connects the existing UI to the new backend functionality.

## Request/Response Flow

### 1. User Adds MCP Server in UI

```javascript
// UI stores in localStorage: chat_mcp_servers
[
  {
    id: "abc123",
    name: "test",
    url: "http://localhost:3001",
    enabled: true
  }
]
```

### 2. User Sends Chat Message

**Frontend → Backend:**
```javascript
POST /chat
{
  messages: [...],
  providers: [...],
  mcp_servers: [
    { name: "test", url: "http://localhost:3001" }
  ]
}
```

### 3. Backend Merges Tools

**Backend (chat.js):**
```javascript
// Parse mcp_servers
mcpServers = [{ name: "test", url: "http://localhost:3001" }]

// Merge tools
tools = await mergeTools(builtInTools, mcpServers)
// Result: [...builtInTools, { name: "test__read_file", ... }]
```

**Backend → MCP Server (tools/list):**
```javascript
POST http://localhost:3001
{
  "jsonrpc": "2.0",
  "id": "1234-abcd",
  "method": "tools/list",
  "params": {}
}

Response:
{
  "jsonrpc": "2.0",
  "id": "1234-abcd",
  "result": {
    "tools": [
      {
        "name": "read_file",
        "description": "Read file contents",
        "inputSchema": { ... }
      }
    ]
  }
}
```

### 4. LLM Requests MCP Tool

**LLM Response:**
```javascript
{
  role: "assistant",
  content: null,
  tool_calls: [
    {
      id: "call_abc",
      type: "function",
      function: {
        name: "test__read_file",  // Namespaced!
        arguments: '{"path": "README.md"}'
      }
    }
  ]
}
```

### 5. Backend Executes MCP Tool

**Backend (tools.js):**
```javascript
// callFunction("test__read_file", { path: "README.md" }, context)
// → Detects "__" separator
// → Calls executeMCPTool()
```

**Backend → MCP Server (tools/call):**
```javascript
POST http://localhost:3001
{
  "jsonrpc": "2.0",
  "id": "5678-efgh",
  "method": "tools/call",
  "params": {
    "name": "read_file",  // Original name (no namespace)
    "arguments": {
      "path": "README.md"
    }
  }
}

Response:
{
  "jsonrpc": "2.0",
  "id": "5678-efgh",
  "result": {
    "content": [
      {
        "type": "text",
        "text": "File: README.md\n\n# Project Title\n..."
      }
    ]
  }
}
```

### 6. Backend Returns Result to LLM

**Backend → LLM:**
```javascript
{
  role: "tool",
  tool_call_id: "call_abc",
  content: "File: README.md\n\n# Project Title\n..."
}
```

## Tool Discovery & Caching

### Cache Flow

```
First Request:
  mergeTools() → getTools() → CACHE MISS → discoverTools() → Cache → Return

Second Request (< 5 min):
  mergeTools() → getTools() → CACHE HIT → Return

After 5 Minutes:
  mergeTools() → getTools() → CACHE EXPIRED → discoverTools() → Cache → Return
```

### Cache Management

**Automatic:**
- 5-minute TTL per server
- Automatic expiration checks
- Per-server isolation

**Manual:**
```javascript
const { clearCache, getCacheStats } = require('./mcp/tool-cache');

// Clear specific server
clearCache('http://localhost:3001');

// Clear all
clearCache();

// Get statistics
const stats = getCacheStats();
// {
//   totalServers: 2,
//   totalTools: 8,
//   entries: [...]
// }
```

## Security Considerations

### URL Validation

**Implemented in `mcp/client.js::validateServerUrl()`**

**Allowed:**
- `http://` and `https://` protocols
- Public IP addresses
- Public domain names

**Blocked:**
- `file://`, `ftp://`, and other protocols
- Localhost (`127.0.0.1`, `::1`, `localhost`)
- Private IP ranges:
  - `10.0.0.0/8`
  - `172.16.0.0/12`
  - `192.168.0.0/16`
- Link-local addresses (`169.254.0.0/16`)

**Purpose:** Prevent SSRF (Server-Side Request Forgery) attacks

### Timeout Protection

- **Default:** 30 seconds per request
- **Configurable:** Can be adjusted per-call
- **Purpose:** Prevent hanging connections and DoS

### Response Size Limits

- **Limit:** 10 MB per response
- **Enforcement:** Streaming validation during download
- **Purpose:** Prevent memory exhaustion attacks

### Content Sanitization

**Current:** Response validation only (JSON-RPC format)

**Future Considerations:**
- Sanitize returned text for sensitive data (API keys, tokens)
- Rate limiting per server
- Authentication support (API keys, OAuth)

## Error Handling

### Connection Errors

```javascript
{
  error: "MCP request failed: ECONNREFUSED"
}
```

### Timeout Errors

```javascript
{
  error: "MCP request timeout after 30000ms"
}
```

### Invalid URL Errors

```javascript
{
  error: "Invalid MCP server URL: Cannot connect to localhost"
}
```

### Tool Execution Errors

```javascript
{
  error: "MCP tool execution failed: File not found"
}
```

### JSON-RPC Errors

```javascript
{
  error: "MCP server error: Method not found",
  code: -32601,
  data: { ... }
}
```

## Testing Checklist

### Unit Tests (To Be Created)

- [ ] `mcp/client.js::sendJsonRpcRequest` - HTTP communication
- [ ] `mcp/client.js::validateServerUrl` - URL validation
- [ ] `mcp/client.js::discoverTools` - Tool discovery
- [ ] `mcp/client.js::executeTool` - Tool execution
- [ ] `mcp/tool-cache.js::getTools` - Cache hit/miss
- [ ] `mcp/tool-cache.js::cleanupExpired` - Cache expiration
- [ ] `tools.js::mergeTools` - Tool merging
- [ ] `tools.js::executeMCPTool` - Tool routing

### Integration Tests

- [ ] **Test Server Launch:**
  ```bash
  node test-mcp-server.js
  # Should start on port 3001
  ```

- [ ] **Tool Discovery:**
  ```bash
  curl -X POST http://localhost:3001 \
    -H "Content-Type: application/json" \
    -d '{"jsonrpc":"2.0","id":"1","method":"tools/list","params":{}}'
  # Should return 3 tools
  ```

- [ ] **Tool Execution:**
  ```bash
  curl -X POST http://localhost:3001 \
    -H "Content-Type: application/json" \
    -d '{"jsonrpc":"2.0","id":"2","method":"tools/call","params":{"name":"get_system_info","arguments":{}}}'
  # Should return system info
  ```

- [ ] **Frontend Integration:**
  1. Add test server in UI:
     - Name: `test`
     - URL: `http://localhost:3001`
     - Enable: ✓
  2. Send chat message: "Read the README.md file"
  3. LLM should see `test__read_file` tool
  4. LLM should call tool
  5. Tool should return file contents

- [ ] **Lambda Integration:**
  1. Deploy to Lambda: `make deploy-lambda-fast`
  2. Test via UI with remote Lambda
  3. Verify tool discovery in CloudWatch logs
  4. Verify tool execution

### Security Tests

- [ ] **URL Validation:**
  ```javascript
  // Should reject
  validateServerUrl('http://localhost:3001')         // ❌ Localhost
  validateServerUrl('http://127.0.0.1:3001')         // ❌ Localhost
  validateServerUrl('http://192.168.1.1:3001')       // ❌ Private IP
  validateServerUrl('http://10.0.0.1:3001')          // ❌ Private IP
  validateServerUrl('file:///etc/passwd')            // ❌ File protocol
  
  // Should accept
  validateServerUrl('http://example.com:3001')       // ✅ Public domain
  validateServerUrl('https://api.example.com')       // ✅ HTTPS
  ```

- [ ] **Timeout Protection:**
  ```javascript
  // Create slow server that delays 60 seconds
  // executeTool should timeout after 30 seconds
  ```

- [ ] **Response Size Limit:**
  ```javascript
  // Create server that returns 20 MB response
  // executeTool should reject after 10 MB
  ```

## Deployment Instructions

### Backend Deployment

```bash
# Full deployment (includes dependencies)
make deploy-lambda

# Fast deployment (code only, recommended after layer setup)
make deploy-lambda-fast

# Check logs
make logs
```

### Frontend Deployment

```bash
# Build and deploy UI
make deploy-ui

# Or just build
make build-ui
```

### Verification

1. **Check Lambda Logs:**
   ```bash
   make logs
   # Look for: [MCP] Received X MCP server(s)
   ```

2. **Test from UI:**
   - Open chat interface
   - Add test MCP server
   - Send message that requires MCP tool
   - Verify tool execution in network tab

3. **Monitor CloudWatch:**
   - Tool discovery logs: `[MCP] Merged X tools from...`
   - Tool execution logs: `[MCP] Executing <tool> on <server>`
   - Error logs: `[MCP] Failed to...`

## Future Enhancements

### 1. Authentication Support

Add support for MCP servers requiring authentication:

```javascript
// In mcp_servers config
{
  name: "secure-server",
  url: "https://api.example.com",
  auth: {
    type: "bearer",
    token: "sk-..."
  }
}

// In mcp/client.js
function sendJsonRpcRequest(serverUrl, method, params, auth) {
  const headers = {
    'Content-Type': 'application/json',
    'User-Agent': 'LambdaLLMProxy-MCP-Client/1.0'
  };
  
  if (auth?.type === 'bearer') {
    headers['Authorization'] = `Bearer ${auth.token}`;
  }
  
  // ...
}
```

### 2. WebSocket/SSE Support

For long-running tools or streaming responses:

```javascript
// Support ws:// and wss:// protocols
// Implement persistent connections
// Handle streaming tool responses
```

### 3. Rate Limiting

Per-server rate limits:

```javascript
const rateLimits = new Map();

function checkRateLimit(serverUrl) {
  const limit = rateLimits.get(serverUrl) || { count: 0, resetAt: Date.now() + 60000 };
  
  if (Date.now() > limit.resetAt) {
    limit.count = 0;
    limit.resetAt = Date.now() + 60000;
  }
  
  if (limit.count >= 100) {
    throw new Error('Rate limit exceeded');
  }
  
  limit.count++;
  rateLimits.set(serverUrl, limit);
}
```

### 4. Metrics & Monitoring

Track MCP usage:

```javascript
const metrics = {
  totalCalls: 0,
  successfulCalls: 0,
  failedCalls: 0,
  averageLatency: 0,
  byServer: {}
};

function recordMetric(serverUrl, success, latency) {
  // Update metrics...
}
```

### 5. Content Sanitization

Remove sensitive data from responses:

```javascript
function sanitizeContent(content) {
  // Remove API keys, tokens, passwords
  // Redact sensitive patterns
  // Log sanitization events
}
```

### 6. Server Health Checks

Periodic health checks with circuit breaker:

```javascript
const serverHealth = new Map();

async function checkServerHealth(serverUrl) {
  try {
    const result = await testConnection(serverUrl);
    serverHealth.set(serverUrl, { healthy: true, lastCheck: Date.now() });
  } catch (error) {
    serverHealth.set(serverUrl, { healthy: false, lastCheck: Date.now(), error: error.message });
  }
}

// Circuit breaker
function isServerHealthy(serverUrl) {
  const health = serverHealth.get(serverUrl);
  return health?.healthy !== false;
}
```

## References

- **MCP Specification:** https://modelcontextprotocol.io/docs
- **JSON-RPC 2.0 Specification:** https://www.jsonrpc.org/specification
- **Requirements Document:** `developer_log/MCP_SERVER_INTEGRATION_REQUIREMENTS.md`

## Change Log

### 2025-01-XX - Initial Implementation

**Created:**
- `src/mcp/client.js` - Core MCP client
- `src/mcp/tool-cache.js` - Tool caching system
- `test-mcp-server.js` - Test MCP server

**Modified:**
- `src/tools.js` - Added mergeTools, executeMCPTool, routing
- `src/endpoints/chat.js` - Parse mcp_servers, merge tools, pass context
- `ui-new/src/components/ChatTab.tsx` - Send mcp_servers in request

**Status:** ✅ Implementation complete, pending testing and deployment

---

**Implementation Time:** ~6 hours  
**Estimated Testing Time:** 2-3 hours  
**Total Effort:** ~8-9 hours  
**Complexity:** Medium-High  
**Risk:** Low (isolated changes, comprehensive error handling)
