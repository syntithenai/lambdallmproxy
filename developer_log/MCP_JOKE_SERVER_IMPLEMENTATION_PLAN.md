# MCP Joke Server - Implementation Plan

**Date**: October 25, 2025  
**Project**: Lambda LLM Proxy (Research Agent)  
**Objective**: Create sample MCP server with 100 jokes database, add UI example templates, research public MCP servers  
**Status**: Planning Phase (No Changes Made)

---

## Executive Summary

This plan outlines the implementation of a sample MCP (Model Context Protocol) joke server to demonstrate MCP integration capabilities. The server will provide random jokes via JSON-RPC 2.0, include a 100-joke database, integrate with the existing UI via example templates, and include a Makefile command for easy startup.

**Key Deliverables**:
1. ✅ MCP joke server with JSON-RPC 2.0 interface
2. ✅ Database of 100 categorized jokes
3. ✅ UI "Add Example" button with pre-configured templates
4. ✅ `make mcp-sample-jokes` command for server startup
5. ✅ Research and catalog of public MCP servers
6. ✅ Documentation and testing guidelines

---

## Part 1: MCP Joke Server Implementation

### 1.1. Server Architecture

**Technology Stack**:
- **Runtime**: Node.js (Express.js for HTTP server)
- **Protocol**: JSON-RPC 2.0 over HTTP
- **Port**: 3100 (avoids conflict with main Lambda on 3000)
- **Data Storage**: In-memory JavaScript array (no database needed)

**File Structure**:
```
samples/
└── mcp-servers/
    └── joke-server/
        ├── server.js           # Main MCP server implementation
        ├── jokes-database.js   # 100 jokes organized by category
        ├── package.json        # Dependencies (express, etc.)
        ├── README.md           # Server documentation
        └── test-client.js      # Simple test client
```

---

### 1.2. Jokes Database Design

**Database Schema** (`jokes-database.js`):

```javascript
const jokes = [
  {
    id: 1,
    category: 'programming',
    setup: 'Why do programmers prefer dark mode?',
    punchline: 'Because light attracts bugs!',
    rating: 'G',
    tags: ['programming', 'bugs', 'dark-mode']
  },
  {
    id: 2,
    category: 'programming',
    setup: 'How many programmers does it take to change a light bulb?',
    punchline: 'None, that\'s a hardware problem!',
    rating: 'G',
    tags: ['programming', 'hardware']
  },
  // ... 98 more jokes
];

module.exports = { jokes };
```

**Categories** (20 jokes per category):
1. **Programming** (20 jokes) - Developer humor, bugs, languages
2. **Dad Jokes** (20 jokes) - Classic puns and wordplay
3. **Science** (20 jokes) - Physics, chemistry, biology
4. **Animals** (20 jokes) - Funny animal stories and puns
5. **Food** (20 jokes) - Cooking and eating humor

**Ratings**:
- **G**: General audience (all ages)
- **PG**: Parental guidance (mild wordplay)

---

### 1.3. MCP Server Implementation

**Server Specification** (`server.js`):

```javascript
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
 * - tools/call - Execute a tool (get_random_joke, get_joke_by_category)
 */

const express = require('express');
const { jokes } = require('./jokes-database');

const app = express();
app.use(express.json());

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    service: 'mcp-joke-server',
    version: '1.0.0',
    totalJokes: jokes.length
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
        result = getRandomJoke(args);
        break;
      
      case 'get_joke_by_id':
        result = getJokeById(args);
        break;
      
      case 'search_jokes':
        result = searchJokes(args);
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
  const joke = jokes.find(j => j.id === args.id);
  
  if (!joke) {
    return { error: `Joke with ID ${args.id} not found` };
  }

  return { joke };
}

function searchJokes(args) {
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
});

module.exports = app;
```

**Package.json**:

```json
{
  "name": "mcp-joke-server",
  "version": "1.0.0",
  "description": "Sample MCP server that serves random jokes via JSON-RPC 2.0",
  "main": "server.js",
  "scripts": {
    "start": "node server.js",
    "dev": "nodemon server.js",
    "test": "node test-client.js"
  },
  "keywords": ["mcp", "model-context-protocol", "jsonrpc", "jokes"],
  "author": "Lambda LLM Proxy",
  "license": "MIT",
  "dependencies": {
    "express": "^4.18.2"
  },
  "devDependencies": {
    "nodemon": "^3.0.1"
  }
}
```

---

### 1.4. Sample Jokes Database (100 jokes)

**Programming Jokes** (20 jokes):

1. "Why do programmers prefer dark mode?" → "Because light attracts bugs!"
2. "How many programmers does it take to change a light bulb?" → "None, that's a hardware problem!"
3. "Why do Java developers wear glasses?" → "Because they can't C#!"
4. "What's a programmer's favorite hangout place?" → "The Foo Bar!"
5. "Why do programmers always mix up Halloween and Christmas?" → "Because Oct 31 = Dec 25!"
6. "How do you comfort a JavaScript bug?" → "You console it!"
7. "Why did the developer go broke?" → "Because he used up all his cache!"
8. "What do you call a programmer from Finland?" → "Nerdic!"
9. "Why don't programmers like nature?" → "It has too many bugs!"
10. "What's the object-oriented way to become wealthy?" → "Inheritance!"
11. "Why was the JavaScript developer sad?" → "Because they didn't know how to 'null' their emotions!"
12. "How does a programmer open a jar?" → "They use Java!"
13. "Why did the programmer quit their job?" → "Because they didn't get arrays!"
14. "What do you call 8 hobbits?" → "A hobbyte!"
15. "Why do Python programmers have bad eyesight?" → "They can't C!"
16. "What's a computer's favorite snack?" → "Microchips!"
17. "Why was the computer cold?" → "It left its Windows open!"
18. "How do you generate a random string?" → "Put a Windows user in front of Vim!"
19. "What do you call a busy server?" → "Swamped with requests!"
20. "Why don't programmers like the outdoors?" → "There's no Ctrl+Z for real life!"

**Dad Jokes** (20 jokes):

21. "What do you call fake spaghetti?" → "An impasta!"
22. "Why don't eggs tell jokes?" → "They'd crack each other up!"
23. "What do you call a fish wearing a bowtie?" → "Sofishticated!"
24. "Why did the scarecrow win an award?" → "He was outstanding in his field!"
25. "What's brown and sticky?" → "A stick!"
26. "Why can't you hear a pterodactyl use the bathroom?" → "Because the 'P' is silent!"
27. "What do you call a bear with no teeth?" → "A gummy bear!"
28. "Why don't skeletons fight each other?" → "They don't have the guts!"
29. "What do you call cheese that isn't yours?" → "Nacho cheese!"
30. "How does a penguin build its house?" → "Igloos it together!"
31. "What did the ocean say to the beach?" → "Nothing, it just waved!"
32. "Why did the bicycle fall over?" → "It was two-tired!"
33. "What do you call a dinosaur with extensive vocabulary?" → "A thesaurus!"
34. "Why don't scientists trust atoms?" → "Because they make up everything!"
35. "What did one wall say to the other?" → "I'll meet you at the corner!"
36. "Why did the math book look sad?" → "Because it had too many problems!"
37. "What do you call a parade of rabbits hopping backwards?" → "A receding hare-line!"
38. "How do you organize a space party?" → "You planet!"
39. "What's the best time to go to the dentist?" → "Tooth-hurty!"
40. "Why did the cookie go to the doctor?" → "Because it felt crumbly!"

**Science Jokes** (20 jokes):

41. "What do you do with a sick chemist?" → "If you can't helium, and you can't curium, you might as well barium!"
42. "Why can't you trust an atom?" → "They make up everything!"
43. "What did the thermometer say to the graduated cylinder?" → "You may have graduated, but I have more degrees!"
44. "Why did the physicist break up with the biologist?" → "There was no chemistry!"
45. "What is a physicist's favorite food?" → "Fission chips!"
46. "Why are chemists great at solving problems?" → "They have all the solutions!"
47. "What do you call an educated tube?" → "A graduated cylinder!"
48. "Why don't electrons ever go to therapy?" → "They're always so negative!"
49. "How does the moon cut its hair?" → "Eclipse it!"
50. "What did the scientist say when he found 2 isotopes of helium?" → "HeHe!"
51. "Why did the germ cross the microscope?" → "To get to the other slide!"
52. "What do you call a tooth in a glass of water?" → "One molar solution!"
53. "Why are mitochondria so popular?" → "They're the powerhouse of the cell!"
54. "What did one DNA say to another?" → "Do these genes make me look fat?"
55. "Why did the white bear dissolve in water?" → "It was polar!"
56. "What is the fastest way to determine the sex of a chromosome?" → "Pull down its genes!"
57. "Why don't biologists like to exercise?" → "They get too out of breath!"
58. "What did the limestone say to the geologist?" → "Don't take me for granite!"
59. "Why are protons more positive than neutrons?" → "They know they matter!"
60. "What do you call a clown in jail?" → "A silicon!"

**Animal Jokes** (20 jokes):

61. "What do you call a sleeping bull?" → "A bulldozer!"
62. "What do you call an alligator in a vest?" → "An investigator!"
63. "Why don't oysters donate to charity?" → "Because they're shellfish!"
64. "What do you call a pile of cats?" → "A meowtain!"
65. "Why don't ants get sick?" → "They have tiny ant-ibodies!"
66. "What do you call a cow with no legs?" → "Ground beef!"
67. "Why do cows have hooves instead of feet?" → "Because they lactose!"
68. "What's orange and sounds like a parrot?" → "A carrot!"
69. "Why don't elephants use computers?" → "They're afraid of the mouse!"
70. "What do you call a fish without eyes?" → "Fsh!"
71. "Why did the chicken join a band?" → "Because it had the drumsticks!"
72. "What do you call a lazy kangaroo?" → "A pouch potato!"
73. "Why do seagulls fly over the sea?" → "Because if they flew over the bay, they'd be bagels!"
74. "What do you call a bear in the rain?" → "A drizzly bear!"
75. "Why don't cats play poker in the jungle?" → "Too many cheetahs!"
76. "What do you call a dog magician?" → "A labracadabrador!"
77. "Why did the duck go to the doctor?" → "He was feeling a little down!"
78. "What's a cat's favorite color?" → "Purrr-ple!"
79. "Why don't sheep tell jokes?" → "They'd just get the flock laughing!"
80. "What do you call a snake that works for the government?" → "A civil serpent!"

**Food Jokes** (20 jokes):

81. "Why did the tomato turn red?" → "Because it saw the salad dressing!"
82. "What do you call a fake noodle?" → "An impasta!"
83. "Why did the banana go to the doctor?" → "It wasn't peeling well!"
84. "What do you call a sad coffee?" → "Depresso!"
85. "Why did the cookie cry?" → "Because its mother was a wafer so long!"
86. "What's a vampire's favorite fruit?" → "A neck-tarine!"
87. "Why don't eggs tell each other secrets?" → "They might crack up!"
88. "What do you call a cheese that isn't yours?" → "Nacho cheese!"
89. "Why did the lettuce win the race?" → "Because it was ahead!"
90. "What do you call a sleeping pizza?" → "A piZZZa!"
91. "Why did the orange stop rolling down the hill?" → "It ran out of juice!"
92. "What's a potato's favorite TV show?" → "Starch Trek!"
93. "Why don't melons get married?" → "Because they cantaloupe!"
94. "What do you call a grumpy bread?" → "Sourdough!"
95. "Why did the grape stop in the middle of the road?" → "Because it ran out of juice!"
96. "What's the best thing to put in a pie?" → "Your teeth!"
97. "Why did the mushroom go to the party?" → "Because he was a fungi!"
98. "What do you call a cow that eats your grass?" → "A lawn mooer!"
99. "Why did the apple go to school?" → "To become a smartie!"
100. "What do you call a stolen yam?" → "A hot potato!"

---

## Part 2: UI Integration - Example Templates

### 2.1. Add "Example Servers" Button to MCP Dialog

**Location**: `ui-new/src/components/ChatTab.tsx` (lines 6840-6925)

**Current UI**:
- Manual input fields for name and URL
- No guidance on what to configure

**Enhanced UI**:
```tsx
{/* Add New MCP Server */}
<div className="mb-6 p-4 bg-gray-50 dark:bg-gray-800 rounded-lg">
  <div className="flex justify-between items-center mb-3">
    <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
      Add MCP Server
    </h3>
    <button
      onClick={() => setShowExampleServers(!showExampleServers)}
      className="text-sm px-3 py-1 bg-blue-500 text-white rounded hover:bg-blue-600"
    >
      📚 {showExampleServers ? 'Hide' : 'Show'} Examples
    </button>
  </div>

  {/* Example Servers Dropdown */}
  {showExampleServers && (
    <div className="mb-4 p-3 bg-white dark:bg-gray-700 rounded border border-gray-300 dark:border-gray-600">
      <label className="block text-sm font-medium mb-2 text-gray-700 dark:text-gray-300">
        Quick Add Example Server:
      </label>
      <select
        onChange={(e) => {
          const example = exampleMCPServers.find(s => s.id === e.target.value);
          if (example) {
            setNewMCPServer({ 
              name: example.name, 
              url: example.url 
            });
          }
        }}
        className="input-field w-full"
        defaultValue=""
      >
        <option value="">Select an example...</option>
        {exampleMCPServers.map(server => (
          <option key={server.id} value={server.id}>
            {server.name} - {server.description}
          </option>
        ))}
      </select>
      
      {/* Show details for selected example */}
      {newMCPServer.url && (
        <div className="mt-2 p-2 bg-blue-50 dark:bg-blue-900/20 rounded text-xs">
          <p className="text-gray-600 dark:text-gray-400">
            <strong>URL:</strong> {newMCPServer.url}
          </p>
          {exampleMCPServers.find(s => s.url === newMCPServer.url)?.instructions && (
            <p className="mt-1 text-gray-600 dark:text-gray-400">
              <strong>Setup:</strong> {exampleMCPServers.find(s => s.url === newMCPServer.url)?.instructions}
            </p>
          )}
        </div>
      )}
    </div>
  )}

  {/* Manual input fields (existing) */}
  <div className="space-y-3">
    <input
      type="text"
      value={newMCPServer.name}
      onChange={(e) => setNewMCPServer({ ...newMCPServer, name: e.target.value })}
      placeholder="Server Name (e.g., filesystem, github)"
      className="input-field w-full"
    />
    <input
      type="text"
      value={newMCPServer.url}
      onChange={(e) => setNewMCPServer({ ...newMCPServer, url: e.target.value })}
      placeholder="Server URL (e.g., http://localhost:3000)"
      className="input-field w-full"
    />
    <button
      onClick={handleAddMCPServer}
      disabled={!newMCPServer.name.trim() || !newMCPServer.url.trim()}
      className="btn-primary w-full"
    >
      ➕ Add Server
    </button>
  </div>
</div>
```

---

### 2.2. Example MCP Servers Data Structure

**Add to ChatTab.tsx**:

```tsx
// Example MCP Servers (including local sample + public servers)
const exampleMCPServers = [
  // Local Sample Server
  {
    id: 'local-jokes',
    name: '🃏 Local Joke Server',
    url: 'http://localhost:3100',
    description: 'Sample MCP server that returns random jokes',
    category: 'sample',
    instructions: 'Run `make mcp-sample-jokes` to start the server',
    tools: ['get_random_joke', 'get_joke_by_id', 'search_jokes', 'get_categories']
  },

  // Public MCP Servers (researched)
  {
    id: 'modelcontextprotocol-filesystem',
    name: '📁 Filesystem Server',
    url: 'npx -y @modelcontextprotocol/server-filesystem /path/to/allowed/files',
    description: 'Official MCP server for filesystem operations',
    category: 'official',
    instructions: 'Install Node.js, then run the npx command with your allowed directory',
    tools: ['read_file', 'write_file', 'list_directory', 'create_directory'],
    githubUrl: 'https://github.com/modelcontextprotocol/servers/tree/main/src/filesystem'
  },

  {
    id: 'modelcontextprotocol-github',
    name: '🐙 GitHub Server',
    url: 'npx -y @modelcontextprotocol/server-github',
    description: 'Official MCP server for GitHub API access',
    category: 'official',
    instructions: 'Requires GITHUB_PERSONAL_ACCESS_TOKEN environment variable',
    tools: ['search_repositories', 'create_issue', 'get_file_contents', 'push_files'],
    githubUrl: 'https://github.com/modelcontextprotocol/servers/tree/main/src/github'
  },

  {
    id: 'modelcontextprotocol-postgres',
    name: '🗄️ PostgreSQL Server',
    url: 'npx -y @modelcontextprotocol/server-postgres postgresql://localhost/mydb',
    description: 'Official MCP server for PostgreSQL database access',
    category: 'official',
    instructions: 'Requires running PostgreSQL instance with connection URL',
    tools: ['query', 'list_tables', 'describe_table'],
    githubUrl: 'https://github.com/modelcontextprotocol/servers/tree/main/src/postgres'
  },

  {
    id: 'modelcontextprotocol-slack',
    name: '💬 Slack Server',
    url: 'npx -y @modelcontextprotocol/server-slack',
    description: 'Official MCP server for Slack workspace integration',
    category: 'official',
    instructions: 'Requires SLACK_BOT_TOKEN and SLACK_TEAM_ID environment variables',
    tools: ['post_message', 'list_channels', 'get_channel_history'],
    githubUrl: 'https://github.com/modelcontextprotocol/servers/tree/main/src/slack'
  },

  {
    id: 'modelcontextprotocol-sqlite',
    name: '💾 SQLite Server',
    url: 'npx -y @modelcontextprotocol/server-sqlite /path/to/database.db',
    description: 'Official MCP server for SQLite database operations',
    category: 'official',
    instructions: 'Provide path to your SQLite database file',
    tools: ['query', 'list_tables', 'describe_table', 'append_insight'],
    githubUrl: 'https://github.com/modelcontextprotocol/servers/tree/main/src/sqlite'
  },

  {
    id: 'modelcontextprotocol-brave-search',
    name: '🔍 Brave Search Server',
    url: 'npx -y @modelcontextprotocol/server-brave-search',
    description: 'Official MCP server for Brave Search API',
    category: 'official',
    instructions: 'Requires BRAVE_API_KEY environment variable from https://brave.com/search/api/',
    tools: ['brave_web_search', 'brave_local_search'],
    githubUrl: 'https://github.com/modelcontextprotocol/servers/tree/main/src/brave-search'
  },

  {
    id: 'modelcontextprotocol-google-drive',
    name: '📂 Google Drive Server',
    url: 'npx -y @modelcontextprotocol/server-gdrive',
    description: 'Official MCP server for Google Drive access',
    category: 'official',
    instructions: 'Requires Google OAuth credentials (see GitHub repo for setup)',
    tools: ['search_files', 'read_file', 'list_folder'],
    githubUrl: 'https://github.com/modelcontextprotocol/servers/tree/main/src/gdrive'
  },

  {
    id: 'modelcontextprotocol-git',
    name: '🌳 Git Server',
    url: 'npx -y @modelcontextprotocol/server-git /path/to/repo',
    description: 'Official MCP server for Git repository operations',
    category: 'official',
    instructions: 'Provide path to your Git repository',
    tools: ['git_status', 'git_diff', 'git_commit', 'git_log'],
    githubUrl: 'https://github.com/modelcontextprotocol/servers/tree/main/src/git'
  },

  {
    id: 'modelcontextprotocol-memory',
    name: '🧠 Memory Server',
    url: 'npx -y @modelcontextprotocol/server-memory',
    description: 'Official MCP server for persistent knowledge graph memory',
    category: 'official',
    instructions: 'Stores memories as knowledge graph in local database',
    tools: ['create_entities', 'create_relations', 'search_nodes', 'delete_entities'],
    githubUrl: 'https://github.com/modelcontextprotocol/servers/tree/main/src/memory'
  },

  {
    id: 'modelcontextprotocol-fetch',
    name: '🌐 Fetch Server',
    url: 'npx -y @modelcontextprotocol/server-fetch',
    description: 'Official MCP server for HTTP requests and web scraping',
    category: 'official',
    instructions: 'Simple HTTP client for fetching web content',
    tools: ['fetch', 'fetch_html'],
    githubUrl: 'https://github.com/modelcontextprotocol/servers/tree/main/src/fetch'
  }
];
```

---

## Part 3: Makefile Integration

### 3.1. Add MCP Commands to Makefile

**Location**: `Makefile` (add to utilities section, around line 650)

**New Commands**:

```makefile
# ================================================================
# MCP Sample Servers
# ================================================================

.PHONY: mcp-sample-jokes mcp-list-examples mcp-install-jokes

# Start the sample joke MCP server on port 3100
mcp-sample-jokes:
	@echo "🃏 Starting MCP Joke Server..."
	@if [ ! -d "samples/mcp-servers/joke-server/node_modules" ]; then \
		echo "📦 Installing dependencies..."; \
		cd samples/mcp-servers/joke-server && npm install; \
	fi
	@echo "🚀 Server starting on http://localhost:3100"
	@echo "📚 Test with: curl http://localhost:3100/health"
	@cd samples/mcp-servers/joke-server && npm start

# Install dependencies for joke server
mcp-install-jokes:
	@echo "📦 Installing MCP Joke Server dependencies..."
	@cd samples/mcp-servers/joke-server && npm install
	@echo "✅ Dependencies installed"

# List available MCP example servers
mcp-list-examples:
	@echo "📋 Available MCP Example Servers:"
	@echo ""
	@echo "Local Samples:"
	@echo "  • Joke Server (port 3100)"
	@echo "    Start: make mcp-sample-jokes"
	@echo "    Test:  curl http://localhost:3100/health"
	@echo ""
	@echo "Official MCP Servers (from @modelcontextprotocol):"
	@echo "  • filesystem  - File operations"
	@echo "  • github      - GitHub API access"
	@echo "  • postgres    - PostgreSQL database"
	@echo "  • sqlite      - SQLite database"
	@echo "  • slack       - Slack workspace"
	@echo "  • brave-search- Brave Search API"
	@echo "  • gdrive      - Google Drive"
	@echo "  • git         - Git repository"
	@echo "  • memory      - Knowledge graph memory"
	@echo "  • fetch       - HTTP requests"
	@echo ""
	@echo "Install official server: npx -y @modelcontextprotocol/server-<name>"
	@echo "Learn more: https://github.com/modelcontextprotocol/servers"
```

**Update Help Section**:

```makefile
help:
	@echo "🚀 Lambda LLM Proxy - Deployment Commands"
	@echo ""
	# ... existing sections ...
	@echo "MCP Sample Servers:"
	@echo "  make mcp-sample-jokes    - Start sample joke MCP server (port 3100)"
	@echo "  make mcp-install-jokes   - Install joke server dependencies"
	@echo "  make mcp-list-examples   - List all available MCP example servers"
	@echo ""
```

---

## Part 4: Public MCP Servers Research

### 4.1. Official MCP Servers Repository

**Source**: https://github.com/modelcontextprotocol/servers

**Official Maintained Servers** (10 servers):

1. **@modelcontextprotocol/server-filesystem**
   - **Purpose**: Secure file system operations
   - **Tools**: read_file, write_file, list_directory, create_directory, move_file, search_files, get_file_info
   - **Use Case**: Allow LLMs to read/write files in allowed directories
   - **Setup**: `npx -y @modelcontextprotocol/server-filesystem /path/to/allowed/dir`

2. **@modelcontextprotocol/server-github**
   - **Purpose**: GitHub repository and PR management
   - **Tools**: search_repositories, create_issue, create_pull_request, get_file_contents, push_files, search_code
   - **Use Case**: Automate GitHub workflows
   - **Setup**: Requires `GITHUB_PERSONAL_ACCESS_TOKEN` env var

3. **@modelcontextprotocol/server-postgres**
   - **Purpose**: PostgreSQL database access
   - **Tools**: query, list_tables, describe_table, append_insight
   - **Use Case**: Natural language database queries
   - **Setup**: Requires PostgreSQL connection URL

4. **@modelcontextprotocol/server-sqlite**
   - **Purpose**: SQLite database operations
   - **Tools**: query, list_tables, describe_table, append_insight
   - **Use Case**: Lightweight database for LLM memory
   - **Setup**: Provide path to SQLite .db file

5. **@modelcontextprotocol/server-slack**
   - **Purpose**: Slack workspace integration
   - **Tools**: post_message, list_channels, get_channel_history, get_thread, search_messages
   - **Use Case**: Chatbot automation, workspace search
   - **Setup**: Requires Slack Bot Token

6. **@modelcontextprotocol/server-brave-search**
   - **Purpose**: Web search via Brave Search API
   - **Tools**: brave_web_search, brave_local_search
   - **Use Case**: Real-time web search for LLMs
   - **Setup**: Requires Brave API key (free tier available)

7. **@modelcontextprotocol/server-gdrive**
   - **Purpose**: Google Drive file access
   - **Tools**: search_files, read_file, list_folder, create_file, upload_file
   - **Use Case**: LLM access to Google Drive documents
   - **Setup**: Requires Google OAuth credentials

8. **@modelcontextprotocol/server-git**
   - **Purpose**: Git repository operations
   - **Tools**: git_status, git_diff, git_commit, git_log, create_branch, search_files
   - **Use Case**: Code analysis and automation
   - **Setup**: Provide path to Git repository

9. **@modelcontextprotocol/server-memory**
   - **Purpose**: Persistent knowledge graph for LLM memory
   - **Tools**: create_entities, create_relations, search_nodes, open_nodes, delete_entities
   - **Use Case**: Long-term memory across sessions
   - **Setup**: Stores graph in local SQLite database

10. **@modelcontextprotocol/server-fetch**
    - **Purpose**: HTTP requests and web scraping
    - **Tools**: fetch, fetch_html
    - **Use Case**: Retrieve web content
    - **Setup**: No configuration needed

---

### 4.2. Community MCP Servers

**Sources**:
- Anthropic's Claude Desktop uses MCP
- GitHub search: "modelcontextprotocol server"
- npm search: "@modelcontextprotocol/server-*"

**Known Community Servers**:

1. **Notion Server** (Community-built)
   - Access Notion workspace via MCP
   - Tools: search_pages, read_page, create_page

2. **Jira Server** (Community-built)
   - Jira project management
   - Tools: search_issues, create_issue, update_issue

3. **Linear Server** (Community-built)
   - Linear issue tracking
   - Tools: search_issues, create_issue

4. **Anthropic Claude Desktop Defaults**:
   - filesystem, git, github, brave-search, fetch

---

## Part 5: Testing Strategy

### 5.1. Manual Testing Checklist

**Test 1: Joke Server Startup**
```bash
# Start server
make mcp-sample-jokes

# Verify health endpoint
curl http://localhost:3100/health

# Expected output:
# {"status":"ok","service":"mcp-joke-server","version":"1.0.0","totalJokes":100}
```

**Test 2: JSON-RPC Tools List**
```bash
curl -X POST http://localhost:3100 \
  -H "Content-Type: application/json" \
  -d '{
    "jsonrpc": "2.0",
    "id": "test-1",
    "method": "tools/list",
    "params": {}
  }'

# Expected: List of 4 tools
```

**Test 3: Get Random Joke**
```bash
curl -X POST http://localhost:3100 \
  -H "Content-Type: application/json" \
  -d '{
    "jsonrpc": "2.0",
    "id": "test-2",
    "method": "tools/call",
    "params": {
      "name": "get_random_joke",
      "arguments": {
        "category": "programming"
      }
    }
  }'

# Expected: Random programming joke
```

**Test 4: UI Integration**
1. Open UI at `http://localhost:8081`
2. Open Settings → Tools → MCP Servers
3. Click "Show Examples"
4. Select "🃏 Local Joke Server"
5. Verify name and URL are populated
6. Click "Add Server"
7. Enable the server
8. Send chat message: "Tell me a programming joke"
9. Verify LLM calls the joke server

---

### 5.2. Automated Test Client

**File**: `samples/mcp-servers/joke-server/test-client.js`

```javascript
/**
 * Test client for MCP Joke Server
 * Runs automated tests against all endpoints
 */

const http = require('http');

const SERVER_URL = 'http://localhost:3100';

// JSON-RPC 2.0 request helper
async function jsonRpcRequest(method, params = {}) {
  return new Promise((resolve, reject) => {
    const payload = JSON.stringify({
      jsonrpc: '2.0',
      id: `test-${Date.now()}`,
      method,
      params
    });

    const options = {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(payload)
      }
    };

    const req = http.request(SERVER_URL, options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          resolve(JSON.parse(data));
        } catch (e) {
          reject(new Error(`Parse error: ${e.message}`));
        }
      });
    });

    req.on('error', reject);
    req.write(payload);
    req.end();
  });
}

// Test suite
async function runTests() {
  console.log('🧪 Running MCP Joke Server Tests...\n');

  try {
    // Test 1: Health check
    console.log('Test 1: Health Check');
    const health = await new Promise((resolve, reject) => {
      http.get(`${SERVER_URL}/health`, (res) => {
        let data = '';
        res.on('data', chunk => data += chunk);
        res.on('end', () => resolve(JSON.parse(data)));
      }).on('error', reject);
    });
    console.log('✅ Health:', health.status);
    console.log(`   Total jokes: ${health.totalJokes}\n`);

    // Test 2: List tools
    console.log('Test 2: List Tools');
    const toolsList = await jsonRpcRequest('tools/list');
    console.log(`✅ Found ${toolsList.result.tools.length} tools:`);
    toolsList.result.tools.forEach(tool => {
      console.log(`   - ${tool.name}`);
    });
    console.log();

    // Test 3: Get random joke
    console.log('Test 3: Get Random Joke');
    const randomJoke = await jsonRpcRequest('tools/call', {
      name: 'get_random_joke',
      arguments: {}
    });
    const joke = JSON.parse(randomJoke.result.content[0].text);
    console.log('✅ Random joke:');
    console.log(`   ${joke.joke.setup}`);
    console.log(`   → ${joke.joke.punchline}\n`);

    // Test 4: Get joke by category
    console.log('Test 4: Get Programming Joke');
    const progJoke = await jsonRpcRequest('tools/call', {
      name: 'get_random_joke',
      arguments: { category: 'programming' }
    });
    const progJokeData = JSON.parse(progJoke.result.content[0].text);
    console.log('✅ Programming joke:');
    console.log(`   ${progJokeData.joke.setup}`);
    console.log(`   → ${progJokeData.joke.punchline}\n`);

    // Test 5: Get joke by ID
    console.log('Test 5: Get Joke by ID (42)');
    const jokeById = await jsonRpcRequest('tools/call', {
      name: 'get_joke_by_id',
      arguments: { id: 42 }
    });
    const jokeByIdData = JSON.parse(jokeById.result.content[0].text);
    console.log('✅ Joke #42:');
    console.log(`   ${jokeByIdData.joke.setup}`);
    console.log(`   → ${jokeByIdData.joke.punchline}\n`);

    // Test 6: Search jokes
    console.log('Test 6: Search for "computer" jokes');
    const searchResults = await jsonRpcRequest('tools/call', {
      name: 'search_jokes',
      arguments: { query: 'computer' }
    });
    const searchData = JSON.parse(searchResults.result.content[0].text);
    console.log(`✅ Found ${searchData.totalResults} jokes matching "computer"\n`);

    // Test 7: Get categories
    console.log('Test 7: Get Categories');
    const categories = await jsonRpcRequest('tools/call', {
      name: 'get_categories',
      arguments: {}
    });
    const categoriesData = JSON.parse(categories.result.content[0].text);
    console.log('✅ Categories:');
    Object.entries(categoriesData.categories).forEach(([cat, count]) => {
      console.log(`   - ${cat}: ${count} jokes`);
    });
    console.log();

    console.log('🎉 All tests passed!');
    process.exit(0);

  } catch (error) {
    console.error('❌ Test failed:', error.message);
    process.exit(1);
  }
}

// Run tests
runTests();
```

---

## Part 6: Documentation

### 6.1. README for Joke Server

**File**: `samples/mcp-servers/joke-server/README.md`

```markdown
# MCP Joke Server

A sample Model Context Protocol (MCP) server that provides random jokes via JSON-RPC 2.0.

## Features

- 100 jokes across 5 categories (Programming, Dad Jokes, Science, Animals, Food)
- JSON-RPC 2.0 compliant API
- 4 tools: get_random_joke, get_joke_by_id, search_jokes, get_categories
- Health check endpoint
- Automated test suite

## Quick Start

```bash
# Install dependencies
npm install

# Start server
npm start

# Test server
npm test
```

Or use the Makefile from project root:

```bash
make mcp-sample-jokes
```

## API Documentation

### Health Check

```bash
GET http://localhost:3100/health
```

**Response**:
```json
{
  "status": "ok",
  "service": "mcp-joke-server",
  "version": "1.0.0",
  "totalJokes": 100
}
```

### JSON-RPC 2.0 Endpoint

```bash
POST http://localhost:3100
Content-Type: application/json
```

### Available Methods

#### 1. tools/list

List all available tools.

**Request**:
```json
{
  "jsonrpc": "2.0",
  "id": "1",
  "method": "tools/list",
  "params": {}
}
```

**Response**:
```json
{
  "jsonrpc": "2.0",
  "id": "1",
  "result": {
    "tools": [
      {
        "name": "get_random_joke",
        "description": "Get a random joke...",
        "inputSchema": { ... }
      },
      ...
    ]
  }
}
```

#### 2. tools/call - get_random_joke

Get a random joke, optionally filtered by category or rating.

**Request**:
```json
{
  "jsonrpc": "2.0",
  "id": "2",
  "method": "tools/call",
  "params": {
    "name": "get_random_joke",
    "arguments": {
      "category": "programming",
      "rating": "G"
    }
  }
}
```

**Response**:
```json
{
  "jsonrpc": "2.0",
  "id": "2",
  "result": {
    "content": [
      {
        "type": "text",
        "text": "{\"joke\":{\"id\":1,\"category\":\"programming\",\"setup\":\"Why do programmers prefer dark mode?\",\"punchline\":\"Because light attracts bugs!\",\"rating\":\"G\"},\"totalJokesInCategory\":20}"
      }
    ]
  }
}
```

#### 3. tools/call - get_joke_by_id

Get a specific joke by ID (1-100).

**Request**:
```json
{
  "jsonrpc": "2.0",
  "id": "3",
  "method": "tools/call",
  "params": {
    "name": "get_joke_by_id",
    "arguments": {
      "id": 42
    }
  }
}
```

#### 4. tools/call - search_jokes

Search jokes by keyword.

**Request**:
```json
{
  "jsonrpc": "2.0",
  "id": "4",
  "method": "tools/call",
  "params": {
    "name": "search_jokes",
    "arguments": {
      "query": "computer"
    }
  }
}
```

#### 5. tools/call - get_categories

Get list of categories with joke counts.

**Request**:
```json
{
  "jsonrpc": "2.0",
  "id": "5",
  "method": "tools/call",
  "params": {
    "name": "get_categories",
    "arguments": {}
  }
}
```

## Integration with Lambda LLM Proxy

1. Start the joke server: `make mcp-sample-jokes`
2. Open UI at http://localhost:8081
3. Go to Settings → Tools → MCP Servers
4. Click "Show Examples" → Select "🃏 Local Joke Server"
5. Click "Add Server" and enable it
6. Chat with the LLM: "Tell me a programming joke"

## Categories

- **programming** (20 jokes) - Developer humor
- **dad_jokes** (20 jokes) - Classic puns
- **science** (20 jokes) - Physics, chemistry, biology
- **animals** (20 jokes) - Animal humor
- **food** (20 jokes) - Cooking and eating

## License

MIT
```

---

## Part 7: Implementation Timeline

### Phase 1: Core Server (Week 1, Day 1-2)

**Tasks**:
1. Create directory structure: `samples/mcp-servers/joke-server/`
2. Implement `jokes-database.js` with 100 jokes (5 categories × 20 jokes)
3. Implement `server.js` with JSON-RPC 2.0 handler
4. Create `package.json` with dependencies
5. Create `test-client.js` for automated testing
6. Create `README.md` documentation

**Deliverables**:
- Working MCP server on port 3100
- All 4 tools functional (get_random_joke, get_joke_by_id, search_jokes, get_categories)
- Health endpoint operational
- Test suite passing

---

### Phase 2: Makefile Integration (Week 1, Day 3)

**Tasks**:
1. Add `mcp-sample-jokes` command to Makefile
2. Add `mcp-install-jokes` command
3. Add `mcp-list-examples` command
4. Update `make help` output
5. Test all Makefile commands

**Deliverables**:
- `make mcp-sample-jokes` starts server
- `make mcp-list-examples` shows all examples
- Updated help documentation

---

### Phase 3: UI Integration (Week 1, Day 4-5)

**Tasks**:
1. Add `exampleMCPServers` array to `ChatTab.tsx`
2. Add "Show Examples" button to MCP dialog
3. Add dropdown selector with all examples
4. Add setup instructions display
5. Populate with 10 official MCP servers
6. Add local joke server example
7. Test UI flow: select example → auto-populate → add server

**Deliverables**:
- "Show Examples" button functional
- Dropdown with 11 options (1 local + 10 official)
- Auto-population of name/URL fields
- Setup instructions displayed

---

### Phase 4: Public Servers Research (Week 1, Day 6-7)

**Tasks**:
1. Research all official @modelcontextprotocol/server-* packages
2. Document each server's tools, use cases, setup requirements
3. Test npx installation of official servers
4. Search for community MCP servers
5. Update example list with accurate URLs and instructions
6. Create comprehensive MCP servers catalog

**Deliverables**:
- Documented list of 10+ official servers
- Working examples of 3-5 servers
- Setup guides for each server
- Community servers catalog

---

### Phase 5: Testing & Documentation (Week 2, Day 1-2)

**Tasks**:
1. End-to-end testing: start joke server → configure in UI → send chat message
2. Test all 10 official server examples (documentation accuracy)
3. Create video tutorial (optional)
4. Write blog post about MCP integration (optional)
5. Update main project README with MCP section

**Deliverables**:
- All tests passing
- Complete documentation
- Tutorial content (optional)

---

## Part 8: Success Metrics

### Technical Metrics

| Metric | Target | Validation |
|--------|--------|------------|
| **Joke Server Uptime** | 99%+ | Health endpoint returns 200 |
| **Response Time** | <50ms | `curl` timing tests |
| **Tool Count** | 4 tools | `tools/list` returns 4 items |
| **Joke Database Size** | 100 jokes | Health endpoint shows totalJokes: 100 |
| **Test Pass Rate** | 100% | `npm test` exits 0 |
| **Makefile Commands** | 3 new commands | `make help` shows MCP section |

### User Experience Metrics

| Metric | Target | Validation |
|--------|--------|------------|
| **Example Servers Listed** | 11+ | Dropdown shows ≥11 options |
| **Setup Clarity** | Instructions visible | Each example shows setup steps |
| **One-Click Add** | <3 clicks | Select → Auto-populate → Add |
| **Integration Success** | LLM calls tool | Chat logs show MCP tool execution |

---

## Part 9: Future Enhancements

### 9.1. Additional Sample Servers

1. **Weather Server** - Get current weather for a city
2. **Calculator Server** - Advanced math operations
3. **Dictionary Server** - Word definitions and synonyms
4. **Trivia Server** - Random trivia questions
5. **Quote Server** - Inspirational quotes

### 9.2. UI Improvements

1. **Server Status Indicator** - Green dot if server is reachable
2. **Auto-Discovery** - Scan localhost ports for MCP servers
3. **Server Templates** - Export/import MCP configurations
4. **Batch Add** - Add multiple example servers at once
5. **Server Testing** - "Test Connection" button in UI

### 9.3. Documentation Enhancements

1. **Video Tutorial** - How to create your own MCP server
2. **Interactive Demo** - Embed joke server in docs page
3. **Server Registry** - Searchable database of community servers
4. **Best Practices Guide** - MCP server development patterns

---

## Part 10: Risk Assessment

### Technical Risks

| Risk | Probability | Impact | Mitigation |
|------|-------------|--------|------------|
| Port 3100 already in use | Medium | Low | Use PORT env var, document in README |
| JSON-RPC 2.0 spec compliance | Low | High | Use official spec, test with MCP client |
| Joke database quality | Medium | Low | Source from public joke APIs, curate manually |
| UI state management complexity | Low | Medium | Use existing `useLocalStorage` pattern |

### User Experience Risks

| Risk | Probability | Impact | Mitigation |
|------|-------------|--------|------------|
| Confusing setup instructions | Medium | Medium | Clear step-by-step guides with screenshots |
| Official servers require auth | High | Medium | Document auth setup clearly, link to API docs |
| Example servers don't work | Low | High | Test all examples before release |
| Too many example choices | Low | Low | Categorize (Local, Official, Community) |

---

## Appendix A: Official MCP Servers Summary

| Server | Install Command | Key Use Case | Auth Required |
|--------|----------------|--------------|---------------|
| filesystem | `npx -y @modelcontextprotocol/server-filesystem /path` | File operations | No |
| github | `npx -y @modelcontextprotocol/server-github` | GitHub automation | Yes (PAT) |
| postgres | `npx -y @modelcontextprotocol/server-postgres postgresql://...` | Database queries | Yes (DB creds) |
| sqlite | `npx -y @modelcontextprotocol/server-sqlite /path/db.db` | Lightweight DB | No |
| slack | `npx -y @modelcontextprotocol/server-slack` | Slack integration | Yes (Bot token) |
| brave-search | `npx -y @modelcontextprotocol/server-brave-search` | Web search | Yes (API key) |
| gdrive | `npx -y @modelcontextprotocol/server-gdrive` | Google Drive | Yes (OAuth) |
| git | `npx -y @modelcontextprotocol/server-git /path/repo` | Git operations | No |
| memory | `npx -y @modelcontextprotocol/server-memory` | Knowledge graph | No |
| fetch | `npx -y @modelcontextprotocol/server-fetch` | HTTP requests | No |

---

## Appendix B: Implementation Checklist

### Backend (Joke Server)

- [ ] Create `samples/mcp-servers/joke-server/` directory
- [ ] Implement `jokes-database.js` with 100 jokes
- [ ] Implement `server.js` with JSON-RPC 2.0
- [ ] Create `package.json` with express dependency
- [ ] Create `test-client.js` for automated testing
- [ ] Create `README.md` with API documentation
- [ ] Test health endpoint (`/health`)
- [ ] Test `tools/list` method
- [ ] Test `tools/call` method with all 4 tools
- [ ] Verify all 100 jokes are accessible
- [ ] Run automated test suite (`npm test`)

### Makefile Integration

- [ ] Add `mcp-sample-jokes` command
- [ ] Add `mcp-install-jokes` command
- [ ] Add `mcp-list-examples` command
- [ ] Update `make help` output
- [ ] Test `make mcp-sample-jokes` starts server
- [ ] Test server accessible at http://localhost:3100

### UI Integration

- [ ] Add `exampleMCPServers` array to `ChatTab.tsx`
- [ ] Add `showExampleServers` state variable
- [ ] Add "Show Examples" button to MCP dialog
- [ ] Add dropdown selector for examples
- [ ] Add setup instructions display
- [ ] Populate with local joke server example
- [ ] Populate with 10 official MCP servers
- [ ] Test dropdown selection auto-populates fields
- [ ] Test "Add Server" button works
- [ ] Test enabled server shows in chat

### Research & Documentation

- [ ] Document all 10 official MCP servers
- [ ] Test installation of official servers
- [ ] Document auth requirements for each
- [ ] Search for community MCP servers
- [ ] Create comprehensive servers catalog
- [ ] Add MCP section to main README.md

### Testing

- [ ] End-to-end test: joke server → UI → chat
- [ ] Test all 4 joke server tools
- [ ] Verify LLM receives tool results
- [ ] Test error handling (server down)
- [ ] Test example server documentation accuracy
- [ ] Load test: 100 concurrent requests

---

## Conclusion

This plan provides a complete roadmap for implementing a sample MCP joke server with UI integration and public server examples. The joke server demonstrates MCP protocol compliance while being fun and educational. The UI examples provide users with quick-start templates for both local and public MCP servers.

**Key Benefits**:
1. ✅ Demonstrates MCP integration capabilities
2. ✅ Provides working example for developers
3. ✅ Lowers barrier to entry (one-click examples)
4. ✅ Documents 10+ public MCP servers
5. ✅ Includes comprehensive testing
6. ✅ Simple Makefile commands

**Estimated Effort**: 2 weeks (1 developer)
- Week 1: Core implementation (server + UI)
- Week 2: Testing + documentation

**Next Steps**: Review plan, approve scope, begin Phase 1 implementation.

---

**END OF PLAN - NO CHANGES MADE**
