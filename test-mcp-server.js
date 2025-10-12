/**
 * Test MCP Server
 * 
 * A simple MCP server for testing the Lambda MCP client integration.
 * Implements the Model Context Protocol (MCP) over HTTP with JSON-RPC 2.0.
 * 
 * Provides sample tools:
 * - read_file: Read a file from disk
 * - list_directory: List directory contents
 * - get_system_info: Get system information
 * 
 * Run: node test-mcp-server.js
 * Test: Add to UI with name "test" and URL "http://localhost:3001"
 */

const express = require('express');
const fs = require('fs');
const path = require('path');
const os = require('os');

const app = express();
const PORT = 3001;

// Middleware
app.use(express.json());

// CORS for local testing
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') {
    return res.sendStatus(200);
  }
  next();
});

// MCP Tool definitions
const TOOLS = [
  {
    name: 'read_file',
    description: 'Read the contents of a file from the filesystem. Provide the absolute or relative path.',
    inputSchema: {
      type: 'object',
      properties: {
        path: {
          type: 'string',
          description: 'Path to the file to read (absolute or relative)'
        }
      },
      required: ['path']
    }
  },
  {
    name: 'list_directory',
    description: 'List all files and directories in a given directory path.',
    inputSchema: {
      type: 'object',
      properties: {
        path: {
          type: 'string',
          description: 'Path to the directory to list (absolute or relative, defaults to current directory)'
        },
        show_hidden: {
          type: 'boolean',
          description: 'Whether to show hidden files (starting with .)',
          default: false
        }
      },
      required: []
    }
  },
  {
    name: 'get_system_info',
    description: 'Get information about the system (OS, platform, memory, CPU, uptime)',
    inputSchema: {
      type: 'object',
      properties: {},
      required: []
    }
  }
];

// JSON-RPC 2.0 handler
app.post('/', async (req, res) => {
  const { jsonrpc, id, method, params } = req.body;
  
  console.log(`📥 Received JSON-RPC request: ${method}`);
  
  // Validate JSON-RPC version
  if (jsonrpc !== '2.0') {
    return res.json({
      jsonrpc: '2.0',
      id: id || null,
      error: {
        code: -32600,
        message: 'Invalid Request: jsonrpc must be "2.0"'
      }
    });
  }
  
  try {
    switch (method) {
      case 'tools/list':
        return res.json({
          jsonrpc: '2.0',
          id,
          result: {
            tools: TOOLS
          }
        });
        
      case 'tools/call': {
        const { name, arguments: args } = params;
        
        console.log(`🔧 Executing tool: ${name}`, args);
        
        const result = await executeTool(name, args || {});
        
        return res.json({
          jsonrpc: '2.0',
          id,
          result: {
            content: result
          }
        });
      }
      
      default:
        return res.json({
          jsonrpc: '2.0',
          id,
          error: {
            code: -32601,
            message: `Method not found: ${method}`
          }
        });
    }
  } catch (error) {
    console.error('❌ Tool execution error:', error);
    
    return res.json({
      jsonrpc: '2.0',
      id,
      error: {
        code: -32603,
        message: error.message,
        data: error.stack
      }
    });
  }
});

/**
 * Execute a tool and return MCP-formatted content
 */
async function executeTool(name, args) {
  switch (name) {
    case 'read_file': {
      const filePath = args.path;
      if (!filePath) {
        throw new Error('path argument is required');
      }
      
      try {
        const content = fs.readFileSync(filePath, 'utf-8');
        return [
          {
            type: 'text',
            text: `File: ${filePath}\n\n${content}`
          }
        ];
      } catch (error) {
        return [
          {
            type: 'text',
            text: `Error reading file: ${error.message}`
          }
        ];
      }
    }
    
    case 'list_directory': {
      const dirPath = args.path || process.cwd();
      const showHidden = args.show_hidden !== false;
      
      try {
        let entries = fs.readdirSync(dirPath);
        
        // Filter hidden files if requested
        if (!showHidden) {
          entries = entries.filter(e => !e.startsWith('.'));
        }
        
        // Get stats for each entry
        const details = entries.map(entry => {
          const fullPath = path.join(dirPath, entry);
          try {
            const stats = fs.statSync(fullPath);
            return {
              name: entry,
              type: stats.isDirectory() ? 'directory' : 'file',
              size: stats.size,
              modified: stats.mtime.toISOString()
            };
          } catch {
            return { name: entry, type: 'unknown' };
          }
        });
        
        // Format as text
        const lines = [
          `Directory: ${dirPath}`,
          `Total entries: ${details.length}`,
          '',
          'Contents:'
        ];
        
        for (const item of details) {
          const icon = item.type === 'directory' ? '📁' : '📄';
          const size = item.size !== undefined ? ` (${item.size} bytes)` : '';
          lines.push(`${icon} ${item.name}${size}`);
        }
        
        return [
          {
            type: 'text',
            text: lines.join('\n')
          }
        ];
      } catch (error) {
        return [
          {
            type: 'text',
            text: `Error listing directory: ${error.message}`
          }
        ];
      }
    }
    
    case 'get_system_info': {
      const info = {
        platform: os.platform(),
        arch: os.arch(),
        hostname: os.hostname(),
        totalMemory: `${Math.round(os.totalmem() / 1024 / 1024 / 1024 * 100) / 100} GB`,
        freeMemory: `${Math.round(os.freemem() / 1024 / 1024 / 1024 * 100) / 100} GB`,
        cpus: os.cpus().length,
        uptime: `${Math.floor(os.uptime() / 60)} minutes`,
        nodeVersion: process.version
      };
      
      const lines = [
        '🖥️  System Information',
        '',
        `Platform: ${info.platform}`,
        `Architecture: ${info.arch}`,
        `Hostname: ${info.hostname}`,
        `Total Memory: ${info.totalMemory}`,
        `Free Memory: ${info.freeMemory}`,
        `CPU Cores: ${info.cpus}`,
        `Uptime: ${info.uptime}`,
        `Node Version: ${info.nodeVersion}`
      ];
      
      return [
        {
          type: 'text',
          text: lines.join('\n')
        }
      ];
    }
    
    default:
      throw new Error(`Unknown tool: ${name}`);
  }
}

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'ok', tools: TOOLS.length });
});

// Start server
app.listen(PORT, () => {
  console.log(`🚀 Test MCP Server running on http://localhost:${PORT}`);
  console.log(`📦 Available tools: ${TOOLS.map(t => t.name).join(', ')}`);
  console.log('');
  console.log('To use with Lambda:');
  console.log(`  - Name: test`);
  console.log(`  - URL: http://localhost:${PORT}`);
  console.log('');
  console.log('Test with curl:');
  console.log(`  curl -X POST http://localhost:${PORT} -H "Content-Type: application/json" -d '{"jsonrpc":"2.0","id":"1","method":"tools/list","params":{}}'`);
});
