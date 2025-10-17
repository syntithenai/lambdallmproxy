# Dev Script Port Cleanup Enhancement

## Problem

When running `make dev`, `make run-lambda-local`, or `make serve-ui`, if a server was already running on the required port, the new process would fail with an "address already in use" error. This required manual process killing before restarting.

**Common Error:**
```
Error: listen EADDRINUSE: address already in use 127.0.0.1:3000
```

## Solution

Updated all development Make targets to automatically kill any existing processes on the required ports before starting new servers.

## Changes Made

### 1. `make dev` Target

**Before:**
```makefile
dev:
	@echo "🚀 Starting local development environment..."
	@trap 'kill 0' INT; \
	npx nodemon & \
	sleep 2; \
	cd ui-new && npm run dev & \
	wait
```

**After:**
```makefile
dev:
	@echo "🚀 Starting local development environment..."
	@echo "🧹 Cleaning up any existing servers..."
	-@pkill -f "node scripts/run-local-lambda" 2>/dev/null || true
	-@pkill -f "vite" 2>/dev/null || true
	@sleep 1
	@echo ""
	@echo "This will start:"
	@echo "  📍 Lambda server: http://localhost:3000 (hot reload enabled)"
	@echo "  📍 UI dev server: http://localhost:8081 (with hot reload)"
	@echo ""
	@echo "✨ Both servers have hot reload - file changes auto-restart/refresh"
	@echo "Press Ctrl+C to stop both servers"
	@echo ""
	@bash -c 'trap "kill 0" INT; npx nodemon & sleep 2; cd ui-new && npm run dev & wait'
```

**Key Changes:**
- Added `-@` prefix to pkill commands to ignore errors (from `-` prefix)
- Redirected stderr to `/dev/null` to suppress "no process found" messages
- Wrapped the trap/background command in `bash -c` for proper execution

### 2. `make run-lambda-local` Target

**After:**
```makefile
run-lambda-local:
	@echo "🏃 Starting local Lambda server on port 3000..."
	@echo "🧹 Killing any existing Lambda server..."
	@pkill -f "node scripts/run-local-lambda" || true
	@sleep 1
	@echo "🔄 Hot reload enabled with nodemon - changes to src/ will auto-restart"
	@chmod +x scripts/run-local-lambda.js
	@npx nodemon
```

### 3. `make serve-ui` Target

**After:**
```makefile
serve-ui:
	@echo "🖥️ Starting Vite dev server..."
	@echo "🧹 Killing any existing Vite server..."
	@pkill -f "vite" || true
	@sleep 1
	@echo "📍 UI will be available at: http://localhost:8081"
	@echo "✨ Hot reload enabled - changes auto-refresh"
	@echo "Press Ctrl+C to stop"
	@cd ui-new && npm run dev
```

## How It Works

1. **Process Detection**: Uses `pkill -f` to find processes by their command line pattern
2. **Safe Cleanup**: `|| true` ensures the command doesn't fail if no processes exist
3. **Wait Time**: `sleep 1` gives the OS time to release ports
4. **Start Fresh**: Proceeds to start the new servers on clean ports

## Usage

Now you can safely run any of these commands without worrying about port conflicts:

```bash
# Start both servers (kills any existing ones first)
make dev

# Start only Lambda server (kills existing Lambda server first)
make run-lambda-local

# Start only UI server (kills existing Vite server first)
make serve-ui
```

## Processes Killed

- **Lambda Server**: Any process matching `node scripts/run-local-lambda`
- **Vite Dev Server**: Any process matching `vite`

## Benefits

✅ **No Manual Cleanup**: No need to manually find and kill processes
✅ **Reliable Restarts**: Always starts on a clean port
✅ **Developer Friendly**: Just run `make dev` and it works
✅ **Safe**: Uses `|| true` to handle cases where no processes exist

## Files Modified

- ✅ `Makefile` - Updated 3 targets: `dev`, `run-lambda-local`, `serve-ui`

## Testing

**Test Case 1: Fresh Start**
```bash
make dev
# Should start both servers successfully
```

**Test Case 2: Restart with Existing Processes**
```bash
# Start servers
make dev
# Ctrl+C to stop (but maybe one process lingers)

# Start again
make dev
# Should kill lingering processes and start fresh
```

**Test Case 3: Individual Server Restart**
```bash
# Lambda already running
make run-lambda-local
# Should kill old Lambda and start new one

# UI already running  
make serve-ui
# Should kill old Vite and start new one
```

---

**Date:** October 17, 2025
**Issue:** Port conflicts requiring manual process cleanup
**Fix:** Automatic process cleanup in Make targets
