/**
 * MCP (Model Context Protocol) Client Implementation
 * 
 * Provides JSON-RPC 2.0 client for communicating with MCP servers.
 * Supports tool discovery (tools/list) and tool execution (tools/call).
 * 
 * Protocol: https://modelcontextprotocol.io/docs
 * JSON-RPC 2.0: https://www.jsonrpc.org/specification
 */

const https = require('https');
const http = require('http');

/**
 * Send a JSON-RPC 2.0 request to an MCP server
 * 
 * @param {string} serverUrl - Full URL of the MCP server
 * @param {string} method - JSON-RPC method name (e.g., "tools/list", "tools/call")
 * @param {Object} params - Method parameters
 * @param {number} timeout - Request timeout in milliseconds (default: 30000)
 * @returns {Promise<Object>} JSON-RPC result object
 * @throws {Error} On network errors, timeouts, or JSON-RPC errors
 */
async function sendJsonRpcRequest(serverUrl, method, params = {}, timeout = 30000) {
  return new Promise((resolve, reject) => {
    const url = new URL(serverUrl);
    const protocol = url.protocol === 'https:' ? https : http;
    
    // Generate unique request ID
    const requestId = `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
    
    // JSON-RPC 2.0 request payload
    const payload = JSON.stringify({
      jsonrpc: '2.0',
      id: requestId,
      method: method,
      params: params
    });
    
    const options = {
      hostname: url.hostname,
      port: url.port || (url.protocol === 'https:' ? 443 : 80),
      path: url.pathname + url.search,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(payload),
        'User-Agent': 'LambdaLLMProxy-MCP-Client/1.0'
      },
      timeout: timeout
    };
    
    const req = protocol.request(options, (res) => {
      let data = '';
      let totalBytes = 0;
      const MAX_RESPONSE_SIZE = 10 * 1024 * 1024; // 10 MB limit
      
      res.on('data', (chunk) => {
        totalBytes += chunk.length;
        if (totalBytes > MAX_RESPONSE_SIZE) {
          req.destroy();
          reject(new Error(`Response exceeds maximum size of ${MAX_RESPONSE_SIZE} bytes`));
          return;
        }
        data += chunk;
      });
      
      res.on('end', () => {
        try {
          const response = JSON.parse(data);
          
          // Validate JSON-RPC response
          if (response.jsonrpc !== '2.0') {
            reject(new Error(`Invalid JSON-RPC version: ${response.jsonrpc}`));
            return;
          }
          
          if (response.id !== requestId) {
            reject(new Error(`Response ID mismatch: expected ${requestId}, got ${response.id}`));
            return;
          }
          
          // Check for JSON-RPC error
          if (response.error) {
            const error = new Error(response.error.message || 'MCP server error');
            error.code = response.error.code;
            error.data = response.error.data;
            reject(error);
            return;
          }
          
          // Return result
          resolve(response.result);
        } catch (parseError) {
          reject(new Error(`Failed to parse JSON-RPC response: ${parseError.message}`));
        }
      });
    });
    
    req.on('error', (error) => {
      reject(new Error(`MCP request failed: ${error.message}`));
    });
    
    req.on('timeout', () => {
      req.destroy();
      reject(new Error(`MCP request timeout after ${timeout}ms`));
    });
    
    req.write(payload);
    req.end();
  });
}

/**
 * Discover available tools from an MCP server
 * 
 * Calls the "tools/list" method to retrieve all tools exposed by the server.
 * Each tool includes name, description, and input schema.
 * 
 * @param {string} serverUrl - Full URL of the MCP server
 * @returns {Promise<Array>} Array of tool definitions
 * @throws {Error} On connection or protocol errors
 */
async function discoverTools(serverUrl) {
  try {
    const result = await sendJsonRpcRequest(serverUrl, 'tools/list', {});
    
    // Validate response structure
    if (!result || !Array.isArray(result.tools)) {
      throw new Error('Invalid tools/list response: missing tools array');
    }
    
    // Validate each tool definition
    const tools = result.tools.map((tool, index) => {
      if (!tool.name || typeof tool.name !== 'string') {
        throw new Error(`Tool ${index} missing valid name`);
      }
      
      if (!tool.description || typeof tool.description !== 'string') {
        tool.description = 'No description provided';
      }
      
      if (!tool.inputSchema || typeof tool.inputSchema !== 'object') {
        tool.inputSchema = {
          type: 'object',
          properties: {},
          required: []
        };
      }
      
      return {
        name: tool.name,
        description: tool.description,
        inputSchema: tool.inputSchema
      };
    });
    
    return tools;
  } catch (error) {
    throw new Error(`Failed to discover tools from ${serverUrl}: ${error.message}`);
  }
}

/**
 * Execute a tool on an MCP server
 * 
 * Calls the "tools/call" method with the specified tool name and arguments.
 * Returns the tool execution result.
 * 
 * @param {string} serverUrl - Full URL of the MCP server
 * @param {string} toolName - Name of the tool to execute
 * @param {Object} toolArguments - Tool input arguments
 * @returns {Promise<Array>} Array of content items from tool execution
 * @throws {Error} On execution errors or invalid responses
 */
async function executeTool(serverUrl, toolName, toolArguments = {}) {
  try {
    const result = await sendJsonRpcRequest(serverUrl, 'tools/call', {
      name: toolName,
      arguments: toolArguments
    });
    
    // Validate response structure
    if (!result || !Array.isArray(result.content)) {
      throw new Error('Invalid tools/call response: missing content array');
    }
    
    // Validate content items
    result.content.forEach((item, index) => {
      if (!item.type || typeof item.type !== 'string') {
        throw new Error(`Content item ${index} missing type`);
      }
      
      // MCP supports: text, image, resource
      if (!['text', 'image', 'resource'].includes(item.type)) {
        throw new Error(`Content item ${index} has unsupported type: ${item.type}`);
      }
      
      // Validate text content
      if (item.type === 'text' && typeof item.text !== 'string') {
        throw new Error(`Content item ${index} of type 'text' missing text field`);
      }
    });
    
    return result.content;
  } catch (error) {
    throw new Error(`Failed to execute tool ${toolName} on ${serverUrl}: ${error.message}`);
  }
}

/**
 * Test connection to an MCP server
 * 
 * Attempts to connect and retrieve tool list to verify server is accessible
 * and responding correctly.
 * 
 * @param {string} serverUrl - Full URL of the MCP server
 * @returns {Promise<Object>} Connection status and tool count
 */
async function testConnection(serverUrl) {
  try {
    const tools = await discoverTools(serverUrl);
    return {
      success: true,
      toolCount: tools.length,
      tools: tools.map(t => t.name)
    };
  } catch (error) {
    return {
      success: false,
      error: error.message
    };
  }
}

/**
 * Validate MCP server URL
 * 
 * Ensures URL is valid and doesn't point to internal/private networks.
 * Security measure to prevent SSRF attacks.
 * 
 * @param {string} serverUrl - URL to validate
 * @returns {boolean} True if URL is valid and safe
 * @throws {Error} On invalid or unsafe URLs
 */
function validateServerUrl(serverUrl) {
  try {
    const url = new URL(serverUrl);
    
    // Only allow HTTP/HTTPS
    if (!['http:', 'https:'].includes(url.protocol)) {
      throw new Error(`Invalid protocol: ${url.protocol}. Only HTTP/HTTPS allowed.`);
    }
    
    // Block private IP ranges (SSRF protection)
    const hostname = url.hostname.toLowerCase();
    
    // Localhost
    if (hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '::1') {
      throw new Error('Cannot connect to localhost');
    }
    
    // Private IP ranges
    const privateRanges = [
      /^10\./,           // 10.0.0.0/8
      /^172\.(1[6-9]|2[0-9]|3[0-1])\./, // 172.16.0.0/12
      /^192\.168\./      // 192.168.0.0/16
    ];
    
    for (const range of privateRanges) {
      if (range.test(hostname)) {
        throw new Error('Cannot connect to private IP addresses');
      }
    }
    
    // Link-local
    if (/^169\.254\./.test(hostname)) {
      throw new Error('Cannot connect to link-local addresses');
    }
    
    return true;
  } catch (error) {
    if (error.message.startsWith('Cannot connect')) {
      throw error;
    }
    throw new Error(`Invalid server URL: ${error.message}`);
  }
}

module.exports = {
  discoverTools,
  executeTool,
  testConnection,
  validateServerUrl,
  sendJsonRpcRequest // Export for testing
};
