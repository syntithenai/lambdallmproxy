# Local Development Setup - Complete

**Date**: October 11, 2025  
**Status**: ✅ IMPLEMENTED  
**Branch**: agent

## Summary

Added complete local development infrastructure with:
1. Local Lambda server on port 3000 (avoids IP restrictions)
2. Local UI server on port 8081
3. Combined `make dev` command to run both
4. Intelligent fallback: localhost → try local Lambda → fall back to remote if unavailable

## New Make Commands

### 1. `make run-lambda-local`
Runs the Lambda function locally on port 3000.

```bash
make run-lambda-local
```

**Output:**
```
🚀 Local Lambda Development Server
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📍 Listening on: http://localhost:3000
🏥 Health check: http://localhost:3000/health

Available endpoints:
  POST http://localhost:3000/chat
  POST http://localhost:3000/providers
  GET  http://localhost:3000/health

Press Ctrl+C to stop
```

**Benefits:**
- No IP restrictions (runs locally)
- Fast iteration (no deployment needed)
- Full Lambda environment simulation
- Loads `.env` file automatically

### 2. `make serve-ui`
Serves the UI locally on port 8081.

```bash
make serve-ui
```

**Output:**
```
🖥️ Starting local UI server on port 8081...
📍 UI available at: http://localhost:8081
Press Ctrl+C to stop
Serving HTTP on 0.0.0.0 port 8081 (http://0.0.0.0:8081/) ...
```

**Auto-builds UI if needed:**
If `docs/` folder doesn't exist, automatically runs `make build-ui` first.

### 3. `make dev` ⭐ RECOMMENDED
Runs both Lambda server (3000) and UI server (8081) together.

```bash
make dev
```

**Output:**
```
🚀 Starting local development environment...

This will start:
  📍 Lambda server: http://localhost:3000
  📍 UI server: http://localhost:8081

Press Ctrl+C to stop both servers

🚀 Local Lambda Development Server
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📍 Listening on: http://localhost:3000
...

Serving HTTP on 0.0.0.0 port 8081 ...
```

**Features:**
- Runs both servers simultaneously
- Single Ctrl+C stops both
- Perfect for full-stack development
- Auto-builds UI if needed

## Intelligent API Routing

### How It Works

The UI now automatically detects its environment and routes API calls intelligently:

1. **On localhost** (127.0.0.1, 192.168.x.x, etc.):
   - Checks if local Lambda is available at `http://localhost:3000/health`
   - If available: Uses local Lambda (`http://localhost:3000`)
   - If not available: Falls back to remote Lambda and saves preference to localStorage
   - Future requests use cached choice

2. **On production** (GitHub Pages, etc.):
   - Always uses remote Lambda
   - No localhost detection needed

3. **Manual override** (via browser console):
   ```javascript
   // Force use of remote Lambda
   window.forceRemote()
   
   // Reset cache and re-detect
   window.resetApiBase()
   
   // Check current API base
   await window.getCurrentApiBase()
   ```

### localStorage Marker

When local Lambda is unavailable, the UI saves a marker to localStorage:
- **Key**: `lambdaproxy_use_remote`
- **Value**: `"true"`

This prevents repeated health checks on every page load. Clear localStorage or use `resetApiBase()` to re-detect.

## File Changes

### New Files

#### `scripts/run-local-lambda.js` (220 lines)
Express server that wraps the Lambda handler for local development.

**Features:**
- Loads `src/index.js` Lambda handler
- Converts Express requests to Lambda event format
- Converts Lambda responses back to HTTP
- Full CORS support
- Health check endpoint
- Request/response logging
- Graceful shutdown handling

**Environment:**
- Loads `.env` file automatically
- Port: `LOCAL_LAMBDA_PORT` (default: 3000)
- Binds to `127.0.0.1` (localhost only)

### Modified Files

#### `Makefile` (+37 lines)
Added three new commands:
- `run-lambda-local` - Run Lambda locally
- `serve-ui` - Serve UI locally
- `dev` - Run both together

Updated help text with local development section.

#### `ui-new/src/utils/api.ts` (+100 lines)
Added intelligent API routing with fallback:

**New Functions:**
```typescript
isLocalhost(): boolean
  // Detects if running on localhost/LAN

shouldUseRemote(): boolean
  // Checks localStorage marker

markUseRemote(): void
  // Sets localStorage marker

isLocalLambdaAvailable(): Promise<boolean>
  // Tests health endpoint with 1s timeout

getApiBase(): Promise<string>
  // Determines correct API base URL

getCachedApiBase(): Promise<string>
  // Returns cached or freshly determined API base

resetApiBase(): void
  // Clears cache and localStorage

forceRemote(): void
  // Forces remote Lambda usage

getCurrentApiBase(): Promise<string>
  // Returns current API base for debugging
```

**Updated API Functions:**
- `sendChatMessage()` - Uses dynamic API base
- `generatePlan()` - Uses dynamic API base
- `performSearch()` - Uses dynamic API base
- `sendChatMessageStreaming()` - Uses dynamic API base

## Usage Guide

### Quick Start

```bash
# Terminal 1 & 2 combined
make dev

# Or separately:
# Terminal 1: Lambda
make run-lambda-local

# Terminal 2: UI
make serve-ui
```

### Access Points

- **UI**: http://localhost:8081
- **Lambda**: http://localhost:3000
- **Health Check**: http://localhost:3000/health

### Development Workflow

1. **Start dev environment:**
   ```bash
   make dev
   ```

2. **Open UI in browser:**
   ```
   http://localhost:8081
   ```

3. **Make changes to code:**
   - Backend: Edit `src/` files
   - Frontend: Edit `ui-new/src/` files

4. **Test changes:**
   - Backend: Restart `make dev` (Lambda reloads)
   - Frontend: Rebuild with `make build-ui` and refresh browser

5. **Check console:**
   - Backend: See Lambda server logs in terminal
   - Frontend: See browser console for API routing decisions

### Testing Fallback

1. **Start only UI** (no Lambda):
   ```bash
   make serve-ui
   ```

2. **Open http://localhost:8081**

3. **Check browser console:**
   ```
   🌐 Local Lambda not available, falling back to remote
   🌐 Switched to remote Lambda (saved to localStorage)
   ```

4. **Future requests use remote automatically**

5. **Start Lambda later:**
   ```bash
   # In another terminal
   make run-lambda-local
   ```

6. **Reset API routing in browser console:**
   ```javascript
   resetApiBase()
   ```

7. **Refresh page - now uses local Lambda:**
   ```
   🏠 Using local Lambda server at http://localhost:3000
   ```

## Environment Variables

The local Lambda server automatically loads `.env` file, so all environment variables work locally just like in production:

```bash
# .env (example)
GROQ_API_KEY=gsk_...
OPENAI_API_KEY=sk-...
GOOGLE_SHEETS_SPREADSHEET_ID=...
GOOGLE_SERVICE_ACCOUNT_EMAIL=...
# ... etc
```

## Debugging

### Check Current API Base

In browser console:
```javascript
await getCurrentApiBase()
// Returns: "http://localhost:3000" or "https://..."
```

### Check localStorage

In browser console:
```javascript
localStorage.getItem('lambdaproxy_use_remote')
// Returns: "true" or null
```

### Force Remote Lambda

In browser console:
```javascript
forceRemote()
// Console: "🌐 Forced to use remote Lambda"
```

### Reset Everything

In browser console:
```javascript
resetApiBase()
// Console: "🔄 API base cache reset"
```

Then refresh the page.

### Check Lambda Health

```bash
curl http://localhost:3000/health

# Response:
{
  "status": "ok",
  "service": "local-lambda-server",
  "timestamp": "2025-10-11T06:45:23.456Z"
}
```

### Test API Call

```bash
curl -X POST http://localhost:3000/chat \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <your-google-token>" \
  -d '{
    "messages": [{"role": "user", "content": "Hello"}],
    "model": "groq:llama-3.3-70b-versatile",
    "stream": false
  }'
```

## Architecture

### Request Flow (Local Development)

```
User
  ↓
Browser (localhost:8081)
  ↓
api.ts detects localhost
  ↓
Checks: http://localhost:3000/health
  ↓
[LOCAL AVAILABLE]
  ↓
POST http://localhost:3000/chat
  ↓
run-local-lambda.js (Express)
  ↓
Converts to Lambda event
  ↓
src/index.js (handler)
  ↓
Processes request
  ↓
Returns Lambda response
  ↓
Converts to HTTP response
  ↓
Returns to browser
```

### Request Flow (Local Fallback)

```
User
  ↓
Browser (localhost:8081)
  ↓
api.ts detects localhost
  ↓
Checks: http://localhost:3000/health
  ↓
[TIMEOUT/ERROR]
  ↓
Save to localStorage: use_remote=true
  ↓
POST https://...lambda-url.../chat
  ↓
AWS Lambda (deployed)
  ↓
Returns response
  ↓
Returns to browser
```

### Request Flow (Production)

```
User
  ↓
Browser (GitHub Pages)
  ↓
api.ts detects NOT localhost
  ↓
POST https://...lambda-url.../chat
  ↓
AWS Lambda (deployed)
  ↓
Returns response
  ↓
Returns to browser
```

## Benefits

### 1. **No IP Restrictions**
- Work around IP whitelists
- Test from any network
- No VPN needed

### 2. **Fast Iteration**
- No deployment needed
- Instant code changes
- See logs in real-time

### 3. **Offline Development**
- Work without internet (for backend)
- Only need internet for LLM API calls

### 4. **Debugging**
- Full access to Lambda logs
- Can use Node debugger
- Can modify environment variables easily

### 5. **Team Development**
- Each developer runs own local Lambda
- No conflicts with shared environment
- Test different configurations

### 6. **Intelligent Fallback**
- Automatic remote fallback
- No manual configuration needed
- Remembers choice

## Limitations

### Local Lambda Server

1. **Not identical to AWS Lambda**
   - Different runtime environment
   - Different resource limits
   - Different timeout behavior

2. **Manual restart needed**
   - Code changes require restart
   - No hot reloading

3. **Environment differences**
   - Local file system access
   - Different network configuration
   - Different memory/CPU

### Recommendations

- Test locally first for fast iteration
- Deploy to AWS Lambda for final testing
- Use local for development, remote for staging/production

## Troubleshooting

### "Local Lambda not available"

**Problem:** Can't connect to http://localhost:3000

**Solutions:**
1. Check if Lambda server is running: `ps aux | grep run-local-lambda`
2. Start it: `make run-lambda-local`
3. Check port 3000 is not in use: `lsof -i :3000`
4. Check firewall settings

### "Port already in use"

**Problem:** Port 3000 or 8081 already taken

**Solutions:**
1. Stop existing process: `lsof -i :3000` then `kill <PID>`
2. Change port in script or command
3. Use different port via environment variable

### "docs/ folder not found"

**Problem:** UI can't be served

**Solution:**
```bash
make build-ui
make serve-ui
```

### "Module not found" errors

**Problem:** Missing dependencies

**Solution:**
```bash
npm install
```

### API calls still going to remote

**Problem:** localhost detection not working

**Solutions:**
1. Check browser console for detection logs
2. Verify you're accessing `http://localhost:8081` (not `127.0.0.1` or IP)
3. Clear localStorage: `localStorage.clear()`
4. Refresh page

## Testing

### Manual Test Checklist

- [ ] `make run-lambda-local` starts server on 3000
- [ ] Health endpoint returns 200: `curl http://localhost:3000/health`
- [ ] `make serve-ui` starts UI on 8081
- [ ] UI opens in browser at http://localhost:8081
- [ ] `make dev` starts both servers
- [ ] Browser console shows: "🏠 Using local Lambda server"
- [ ] Chat message works through local Lambda
- [ ] Stop Lambda server (Ctrl+C)
- [ ] Browser console shows: "🌐 Local Lambda not available, falling back to remote"
- [ ] Chat message works through remote Lambda
- [ ] localStorage has `lambdaproxy_use_remote=true`
- [ ] Restart Lambda server
- [ ] Run `resetApiBase()` in console
- [ ] Refresh page
- [ ] Chat message uses local Lambda again

## Next Steps

- ✅ Local Lambda server created
- ✅ UI routing logic implemented
- ✅ Make commands added
- ✅ Documentation complete
- 🔄 Ready for testing and deployment
- 📋 Consider adding hot reload for local Lambda
- 📋 Consider adding Docker support
- 📋 Consider adding VS Code launch configurations

---

**Implementation Time**: ~45 minutes  
**Lines Added**: ~357  
**Files Created**: 1  
**Files Modified**: 2  
**Build Status**: ✅ Success
