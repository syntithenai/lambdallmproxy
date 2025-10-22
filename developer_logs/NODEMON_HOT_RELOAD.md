# Nodemon Hot Reload Setup

## Overview

The Lambda LLM Proxy development environment now uses **nodemon** for automatic server restarting when files change. This solves the Node.js module caching issue where changes to `src/` files weren't taking effect until manual server restart.

## What Changed

### Before (Manual Restart Required)
- Node.js cached `require()` modules after first load
- Changes to `src/tools.js` and other backend files didn't take effect
- Required manual `Ctrl+C` and `make dev` to see changes
- Lost development time and context switching

### After (Automatic Restart)
- **Nodemon watches `src/**/*.js` files**
- Detects file changes automatically
- Restarts server within ~500ms
- Fresh module loading on every restart
- Both frontend (Vite) and backend (nodemon) now have hot reload! 🔥

## Configuration

### nodemon.json
```json
{
  "watch": ["src/**/*.js", "scripts/run-local-lambda.js"],
  "ext": "js,json",
  "ignore": ["node_modules/**", "ui-new/**", "docs/**", "tests/**"],
  "exec": "node scripts/run-local-lambda.js",
  "delay": 500,
  "verbose": true,
  "env": {
    "NODE_ENV": "development"
  }
}
```

**Key settings:**
- `watch`: Monitor all JS files in `src/` and the run script
- `delay`: 500ms debounce to avoid rapid restarts during multi-file saves
- `ignore`: Skip frontend, tests, docs to avoid unnecessary restarts
- `verbose`: Show detailed restart information

### Makefile Changes

**`run-lambda-local` target:**
```makefile
run-lambda-local:
	@echo "🏃 Starting local Lambda server on port 3000..."
	@echo "🔄 Hot reload enabled with nodemon - changes to src/ will auto-restart"
	@chmod +x scripts/run-local-lambda.js
	@npx nodemon
```

**`dev` target:**
```makefile
dev:
	@echo "🚀 Starting local development environment..."
	@echo "  📍 Lambda server: http://localhost:3000 (hot reload enabled)"
	@echo "  📍 UI dev server: http://localhost:8081 (with hot reload)"
	@echo "✨ Both servers have hot reload - file changes auto-restart/refresh"
	@trap 'kill 0' INT; \
	npx nodemon & \
	sleep 2; \
	cd ui-new && npm run dev & \
	wait
```

## Usage

### Start Development Environment
```bash
make dev
```

This starts:
- **Lambda server** on http://localhost:3000 with nodemon (auto-restart)
- **Vite UI** on http://localhost:8081 with hot module replacement (auto-refresh)

### Watch Nodemon in Action

When you edit a file in `src/`, you'll see:
```
[nodemon] restarting due to changes...
[nodemon] src/tools.js
[nodemon] starting `node scripts/run-local-lambda.js`
```

The server restarts automatically and loads your fresh code! 🚀

### Manual Restart

Type `rs` in the terminal and press Enter to manually restart:
```bash
rs
```

### Stop Servers

Press `Ctrl+C` to stop both servers gracefully.

## Benefits

✅ **Instant feedback** - See backend changes without manual restart  
✅ **Faster iteration** - No context switching or lost terminal state  
✅ **Module cache solved** - Fresh `require()` on every restart  
✅ **Search progress works** - Debug logs and new features now load immediately  
✅ **Consistent with frontend** - Both backend and frontend auto-reload  

## Troubleshooting

### "Port already in use"
If you see port conflicts:
```bash
# Kill any running dev servers
pkill -f "make dev"

# Or kill specific processes
lsof -ti:3000 | xargs kill -9  # Lambda
lsof -ti:8081 | xargs kill -9  # Vite
```

### Nodemon not restarting
1. Check `nodemon.json` - ensure watch paths are correct
2. Verify file is in watched directory: `src/**/*.js`
3. Check for syntax errors in modified file
4. Manual restart: type `rs` and press Enter

### Changes still not appearing
1. Check terminal for nodemon restart messages
2. Hard refresh browser: `Ctrl+Shift+R` (clears frontend cache)
3. Check for browser console errors
4. Verify file was actually saved (check editor)

## Related Files

- `nodemon.json` - Nodemon configuration
- `Makefile` - Build targets using nodemon
- `scripts/run-local-lambda.js` - Server entry point
- `package.json` - nodemon dev dependency

## See Also

- [Nodemon Documentation](https://nodemon.io/)
- [DEVELOPMENT_SETUP.md](./DEVELOPMENT_SETUP.md) - General dev setup
- [SEARCH_PROGRESS_FEATURE.md](./SEARCH_PROGRESS_FEATURE.md) - Feature requiring hot reload
