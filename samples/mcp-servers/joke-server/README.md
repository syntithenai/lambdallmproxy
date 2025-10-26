# MCP Joke Server

A Model Context Protocol (MCP) compliant server that provides joke retrieval capabilities via JSON-RPC 2.0 over HTTP.

## 🎯 Features

- **100 Categorized Jokes**: Programming, dad jokes, science, animals, and food humor
- **MCP Compliant**: Full JSON-RPC 2.0 over HTTP implementation
- **4 Powerful Tools**: Random jokes, ID lookup, search, and category stats
- **Rating Filters**: Family-friendly (G) and parental guidance (PG) options
- **Health Checks**: Built-in `/health` endpoint for monitoring

## 🚀 Quick Start

### Installation

```bash
cd samples/mcp-servers/joke-server
npm install
```

### Running the Server

```bash
# Development mode (auto-restart on changes)
npm run dev

# Production mode
npm start
```

Server runs on **http://localhost:3100**

### Testing

```bash
# Run automated test suite
npm test

# Or run tests after starting server:
node test-client.js
```

## 📡 API Endpoints

### Health Check

**GET /health**

Returns server status and metadata.

```bash
curl http://localhost:3100/health
```

**Response:**
```json
{
  "status": "ok",
  "service": "mcp-joke-server",
  "version": "1.0.0",
  "totalJokes": 100,
  "port": 3100
}
```

### JSON-RPC 2.0 Endpoint

**POST /**

All tool operations use JSON-RPC 2.0 format.

## 🛠️ Available Tools

### 1. get_random_joke

Get a random joke with optional filtering.

**Parameters:**
- `category` (string, optional): Filter by category
  - `programming`, `dad_jokes`, `science`, `animals`, `food`
- `rating` (string, optional): Filter by content rating
  - `G` (general audiences), `PG` (parental guidance)

**Example Request:**
```bash
curl -X POST http://localhost:3100 \
  -H "Content-Type: application/json" \
  -d '{
    "jsonrpc": "2.0",
    "id": "1",
    "method": "tools/call",
    "params": {
      "name": "get_random_joke",
      "arguments": {
        "category": "programming",
        "rating": "G"
      }
    }
  }'
```

**Example Response:**
```json
{
  "jsonrpc": "2.0",
  "id": "1",
  "result": {
    "content": [
      {
        "type": "text",
        "text": "{\"joke\":{\"id\":5,\"category\":\"programming\",\"setup\":\"Why do programmers prefer dark mode?\",\"punchline\":\"Because light attracts bugs!\",\"rating\":\"G\",\"tags\":[\"programming\",\"bugs\",\"dark-mode\"]},\"totalJokesInCategory\":20}"
      }
    ]
  }
}
```

### 2. get_joke_by_id

Retrieve a specific joke by its ID (1-100).

**Parameters:**
- `id` (number, required): Joke ID between 1 and 100

**Example Request:**
```bash
curl -X POST http://localhost:3100 \
  -H "Content-Type: application/json" \
  -d '{
    "jsonrpc": "2.0",
    "id": "2",
    "method": "tools/call",
    "params": {
      "name": "get_joke_by_id",
      "arguments": {
        "id": 42
      }
    }
  }'
```

### 3. search_jokes

Search for jokes by keyword.

**Parameters:**
- `query` (string, required): Search term
- `limit` (number, optional): Max results (default: 10, max: 50)

**Searches in:** Setup, punchline, and tags

**Example Request:**
```bash
curl -X POST http://localhost:3100 \
  -H "Content-Type: application/json" \
  -d '{
    "jsonrpc": "2.0",
    "id": "3",
    "method": "tools/call",
    "params": {
      "name": "search_jokes",
      "arguments": {
        "query": "computer",
        "limit": 5
      }
    }
  }'
```

### 4. get_categories

Get statistics about available joke categories.

**Parameters:** None

**Example Request:**
```bash
curl -X POST http://localhost:3100 \
  -H "Content-Type: application/json" \
  -d '{
    "jsonrpc": "2.0",
    "id": "4",
    "method": "tools/call",
    "params": {
      "name": "get_categories",
      "arguments": {}
    }
  }'
```

**Example Response:**
```json
{
  "jsonrpc": "2.0",
  "id": "4",
  "result": {
    "content": [
      {
        "type": "text",
        "text": "{\"categories\":{\"programming\":20,\"dad_jokes\":20,\"science\":20,\"animals\":20,\"food\":20},\"totalJokes\":100}"
      }
    ]
  }
}
```

## 🔌 Integration with Lambda LLM Proxy

### Step 1: Start the Joke Server

```bash
cd samples/mcp-servers/joke-server
npm install
npm start
```

Server will be available at `http://localhost:3100`.

### Step 2: Configure in UI

1. Open the Lambda LLM Proxy UI
2. Navigate to **Settings → MCP Servers**
3. Click **Add MCP Server**
4. Fill in the details:
   - **Name**: `Joke Server`
   - **URL**: `http://localhost:3100`
   - **Description**: `Get jokes by category, search, or ID`

### Step 3: Use in Chat

The LLM can now call joke tools automatically. Try these prompts:

- "Tell me a programming joke"
- "Search for jokes about computers"
- "What joke categories are available?"
- "Give me joke #42"
- "Tell me a science joke rated G"

### Example Chat Flow

**User:** "Tell me a programming joke"

**Assistant (via MCP):**
1. Calls `get_random_joke` with `category: "programming"`
2. Receives joke from server
3. Formats response: "Why do programmers prefer dark mode? Because light attracts bugs! 😄"

## 📊 Database Structure

### Joke Schema

```javascript
{
  id: 1,                          // Unique ID (1-100)
  category: 'programming',        // Category name
  setup: 'Why do programmers...', // Joke setup/question
  punchline: 'Because...',        // Joke punchline/answer
  rating: 'G',                    // Content rating (G or PG)
  tags: ['programming', 'bugs']   // Searchable tags
}
```

### Categories

- **programming** (1-20): Developer and coding humor
- **dad_jokes** (21-40): Classic groan-worthy puns
- **science** (41-60): Physics, chemistry, biology jokes
- **animals** (61-80): Animal-themed humor
- **food** (81-100): Culinary comedy

### Ratings

- **G** (95 jokes): General audiences, completely family-friendly
- **PG** (5 jokes): Parental guidance suggested, mild humor

## 🧪 Testing Guide

### Manual Testing with curl

**List all tools:**
```bash
curl -X POST http://localhost:3100 \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":"test","method":"tools/list","params":{}}'
```

**Get a random joke:**
```bash
curl -X POST http://localhost:3100 \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":"test","method":"tools/call","params":{"name":"get_random_joke","arguments":{}}}'
```

### Automated Testing

Run the full test suite:

```bash
npm test
```

Tests verify:
- ✅ Health endpoint returns 200 OK
- ✅ tools/list returns 4 tools
- ✅ get_random_joke returns valid joke
- ✅ Category filtering works
- ✅ get_joke_by_id retrieves specific joke
- ✅ search_jokes finds matching jokes
- ✅ get_categories returns accurate counts

## 🏗️ Architecture

```
┌─────────────────────────────────────────────┐
│          MCP Joke Server (Port 3100)        │
├─────────────────────────────────────────────┤
│  GET /health       │ Server status          │
│  POST /            │ JSON-RPC 2.0 endpoint  │
├─────────────────────────────────────────────┤
│  Methods:                                   │
│    - tools/list    │ Get available tools    │
│    - tools/call    │ Execute a tool         │
├─────────────────────────────────────────────┤
│  Tools:                                     │
│    - get_random_joke                        │
│    - get_joke_by_id                         │
│    - search_jokes                           │
│    - get_categories                         │
├─────────────────────────────────────────────┤
│  Database: jokes-database.js (100 jokes)    │
└─────────────────────────────────────────────┘
```

## 🔧 Configuration

### Port Configuration

Default port is **3100**. To change:

```javascript
// Edit server.js
const PORT = process.env.PORT || 3100;
```

Or set environment variable:

```bash
PORT=4000 npm start
```

### CORS

CORS is enabled for all origins by default. To restrict:

```javascript
// Edit server.js, line ~45
res.setHeader('Access-Control-Allow-Origin', 'https://your-domain.com');
```

## 📝 Error Codes

| Code    | Message              | Description                          |
|---------|----------------------|--------------------------------------|
| -32600  | Invalid Request      | Malformed JSON-RPC request           |
| -32601  | Method not found     | Unknown JSON-RPC method              |
| -32602  | Unknown tool         | Tool name not recognized             |
| -32603  | Internal error       | Tool execution failed                |

**Example Error Response:**
```json
{
  "jsonrpc": "2.0",
  "id": "test",
  "error": {
    "code": -32602,
    "message": "Unknown tool: get_jokes"
  }
}
```

## 🚀 Production Deployment

### Docker (Optional)

```dockerfile
FROM node:18-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production
COPY . .
EXPOSE 3100
CMD ["node", "server.js"]
```

Build and run:
```bash
docker build -t mcp-joke-server .
docker run -p 3100:3100 mcp-joke-server
```

### Process Manager (PM2)

```bash
npm install -g pm2
pm2 start server.js --name joke-server
pm2 save
pm2 startup
```

## 📚 Resources

- **MCP Specification**: https://spec.modelcontextprotocol.io/
- **JSON-RPC 2.0**: https://www.jsonrpc.org/specification
- **Project Repository**: https://github.com/yourusername/lambdallmproxy

## 🤝 Contributing

To add more jokes:

1. Edit `jokes-database.js`
2. Add joke to appropriate category (maintain ID sequence)
3. Follow schema: `{ id, category, setup, punchline, rating, tags }`
4. Run `npm test` to verify

## 📄 License

Part of the Lambda LLM Proxy project. See main repository for license details.

---

**Made with ❤️ and 😂 for the Model Context Protocol community**
