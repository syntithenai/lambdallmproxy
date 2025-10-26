/**
 * MCP Joke Server
 * Provides random jokes via JSON-RPC 2.0 (Model Context Protocol)
 * 
 * Endpoints:
 * - POST / (JSON-RPC 2.0 requests)
 * - GET /health (Health check)
 * 
 * JSON-RPC Methods:
 * - tools/list - List available tools
 * - tools/call - Execute a tool (get_random_joke, get_joke_by_id, search_jokes, get_categories)
 */

const express = require('express');
const { jokes } = require('./jokes-database');

const app = express();
app.use(express.json());

// CORS headers for browser requests
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') {
    return res.sendStatus(200);
  }
  next();
});

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    service: 'mcp-joke-server',
    version: '1.0.0',
    totalJokes: jokes.length,
    port: process.env.PORT || 3100
  });
});

// JSON-RPC 2.0 handler
app.post('/', (req, res) => {
  const { jsonrpc, id, method, params } = req.body;

  // Validate JSON-RPC request
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

  // Handle different methods
  switch (method) {
    case 'tools/list':
      return handleToolsList(req, res, id);
    
    case 'tools/call':
      return handleToolsCall(req, res, id, params);
    
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
});

// Handle tools/list - Return available tools
function handleToolsList(req, res, id) {
  res.json({
    jsonrpc: '2.0',
    id,
    result: {
      tools: [
        {
          name: 'get_random_joke',
          description: 'Get a random joke from the database. Optionally filter by category or rating.',
          inputSchema: {
            type: 'object',
            properties: {
              category: {
                type: 'string',
                enum: ['programming', 'dad_jokes', 'science', 'animals', 'food'],
                description: 'Filter jokes by category (optional)'
              },
              rating: {
                type: 'string',
                enum: ['G', 'PG'],
                description: 'Filter jokes by rating (optional)'
              }
            }
          }
        },
        {
          name: 'get_joke_by_id',
          description: 'Get a specific joke by its ID (1-100)',
          inputSchema: {
            type: 'object',
            properties: {
              id: {
                type: 'integer',
                minimum: 1,
                maximum: 100,
                description: 'Joke ID'
              }
            },
            required: ['id']
          }
        },
        {
          name: 'search_jokes',
          description: 'Search jokes by keyword in setup or punchline',
          inputSchema: {
            type: 'object',
            properties: {
              query: {
                type: 'string',
                description: 'Search query'
              }
            },
            required: ['query']
          }
        },
        {
          name: 'get_categories',
          description: 'Get list of all joke categories with counts',
          inputSchema: {
            type: 'object',
            properties: {}
          }
        }
      ]
    }
  });
}

// Handle tools/call - Execute a tool
function handleToolsCall(req, res, id, params) {
  const { name, arguments: args } = params;

  try {
    let result;

    switch (name) {
      case 'get_random_joke':
        result = getRandomJoke(args || {});
        break;
      
      case 'get_joke_by_id':
        result = getJokeById(args || {});
        break;
      
      case 'search_jokes':
        result = searchJokes(args || {});
        break;
      
      case 'get_categories':
        result = getCategories();
        break;
      
      default:
        return res.json({
          jsonrpc: '2.0',
          id,
          error: {
            code: -32602,
            message: `Unknown tool: ${name}`
          }
        });
    }

    res.json({
      jsonrpc: '2.0',
      id,
      result: {
        content: [
          {
            type: 'text',
            text: JSON.stringify(result, null, 2)
          }
        ]
      }
    });

  } catch (error) {
    res.json({
      jsonrpc: '2.0',
      id,
      error: {
        code: -32603,
        message: `Tool execution error: ${error.message}`
      }
    });
  }
}

// Tool implementations
function getRandomJoke(args = {}) {
  let filteredJokes = jokes;

  if (args.category) {
    filteredJokes = filteredJokes.filter(j => j.category === args.category);
  }

  if (args.rating) {
    filteredJokes = filteredJokes.filter(j => j.rating === args.rating);
  }

  if (filteredJokes.length === 0) {
    return { error: 'No jokes found matching criteria' };
  }

  const randomJoke = filteredJokes[Math.floor(Math.random() * filteredJokes.length)];
  
  return {
    joke: {
      id: randomJoke.id,
      category: randomJoke.category,
      setup: randomJoke.setup,
      punchline: randomJoke.punchline,
      rating: randomJoke.rating
    },
    totalJokesInCategory: filteredJokes.length
  };
}

function getJokeById(args) {
  if (!args.id) {
    return { error: 'Missing required parameter: id' };
  }

  const joke = jokes.find(j => j.id === args.id);
  
  if (!joke) {
    return { error: `Joke with ID ${args.id} not found` };
  }

  return { joke };
}

function searchJokes(args) {
  if (!args.query) {
    return { error: 'Missing required parameter: query' };
  }

  const query = args.query.toLowerCase();
  const results = jokes.filter(j => 
    j.setup.toLowerCase().includes(query) || 
    j.punchline.toLowerCase().includes(query) ||
    j.tags.some(tag => tag.includes(query))
  );

  return {
    query: args.query,
    totalResults: results.length,
    jokes: results.slice(0, 10) // Limit to 10 results
  };
}

function getCategories() {
  const categories = {};
  
  jokes.forEach(joke => {
    if (!categories[joke.category]) {
      categories[joke.category] = 0;
    }
    categories[joke.category]++;
  });

  return { categories, totalJokes: jokes.length };
}

// Start server
const PORT = process.env.PORT || 3100;
app.listen(PORT, () => {
  console.log(`🃏 MCP Joke Server running on http://localhost:${PORT}`);
  console.log(`📊 Loaded ${jokes.length} jokes`);
  console.log(`🏥 Health: http://localhost:${PORT}/health`);
  console.log(`📚 Categories:`,Object.keys(jokes.reduce((acc, j) => ({ ...acc, [j.category]: true }), {})).join(', '));
});

module.exports = app;
