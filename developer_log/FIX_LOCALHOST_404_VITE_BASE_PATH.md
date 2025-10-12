# Local Development Setup Fix

**Date**: 2025-01-12  
**Type**: Configuration Fix  
**Status**: ✅ Complete  

## Problem

When visiting `http://localhost:8081/`, the site showed 404 errors for JavaScript and CSS files. This occurred because:

1. The production build uses base path `/lambdallmproxy/` for GitHub Pages
2. The `make serve-ui` command was serving pre-built files from `docs/` directory
3. Pre-built files had hardcoded `/lambdallmproxy/` paths in them
4. Localhost expects files at root path `/`

Example 404 errors:
```
GET http://localhost:8081/lambdallmproxy/assets/index-CIyqvOBu.js - 404 Not Found
GET http://localhost:8081/lambdallmproxy/assets/index-BfKN9kot.css - 404 Not Found
```

## Solution

### 1. Fixed Vite Configuration

Updated `ui-new/vite.config.ts` to use different base paths for development vs production:

```typescript
export default defineConfig(({ command }) => ({
  plugins: [react()],
  // Use subpath for production build (GitHub Pages), root path for dev server
  base: command === 'build' ? '/lambdallmproxy/' : '/',
  build: {
    outDir: '../docs',
    emptyOutDir: true,
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
}))
```

**How it works:**
- `command === 'build'` → Production build → `base: '/lambdallmproxy/'`
- `command === 'serve'` (dev) → Development server → `base: '/'`

### 2. Updated Makefile Commands

Changed the local development commands to use Vite's dev server instead of serving pre-built files:

#### Before:
```makefile
serve-ui:
    cd docs && python3 -m http.server 8081
```

#### After:
```makefile
# Use Vite dev server (recommended for development)
serve-ui:
    cd ui-new && npm run dev

# Serve pre-built UI (for testing production build)
serve-ui-prod:
    cd docs && python3 -m http.server 8081
```

### 3. Updated Help Documentation

```bash
make help
```

Now shows:
```
Local Development:
  make run-lambda-local    - Run Lambda function locally on port 3000
  make serve-ui            - Start Vite dev server on port 8081 (with hot reload)
  make serve-ui-prod       - Serve production build on port 8082
  make dev                 - Run both Lambda (3000) and UI (8081) locally
```

## Usage

### For Local Development (Recommended)

**Start UI only:**
```bash
make serve-ui
```
- Opens Vite dev server at `http://localhost:8081`
- Hot reload enabled (changes auto-refresh)
- No 404 errors (uses root path)
- Fast rebuild on file changes

**Start both Lambda + UI:**
```bash
make dev
```
- Lambda API: `http://localhost:3000`
- UI dev server: `http://localhost:8081`
- Both run in parallel

### For Testing Production Build

**Test production build locally:**
```bash
make build-ui                 # Build production files to docs/
make serve-ui-prod            # Serve on http://localhost:8082
```

**Note:** This will show 404 errors because the production build expects `/lambdallmproxy/` base path. This is normal and expected - it's only for verifying the build works correctly before deploying to GitHub Pages.

### For Production Deployment

**Deploy to GitHub Pages:**
```bash
make deploy-ui
```
- Builds with `/lambdallmproxy/` base path
- Deploys to `https://syntithenai.github.io/lambdallmproxy/`
- Works correctly with GitHub Pages routing

## Files Modified

1. **ui-new/vite.config.ts**:
   - Added conditional base path logic
   - Development: `base: '/'`
   - Production: `base: '/lambdallmproxy/'`

2. **Makefile**:
   - `serve-ui`: Changed to use Vite dev server (port 5173)
   - `serve-ui-prod`: New command for testing production build (port 8081)
   - `dev`: Updated to use Vite dev server instead of serving docs/
   - `help`: Updated documentation

## Benefits

### Development Mode (`make serve-ui`)
✅ No 404 errors on localhost  
✅ Hot reload - changes appear instantly  
✅ Fast rebuilds (Vite HMR)  
✅ TypeScript errors shown in real-time  
✅ Proper source maps for debugging  

### Production Mode (`make deploy-ui`)
✅ Optimized bundle with tree-shaking  
✅ Minified assets  
✅ Correct base path for GitHub Pages  
✅ Cache busting with hashed filenames  

## Port Reference

| Command | Server | Port | URL | Purpose |
|---------|--------|------|-----|---------|
| `make serve-ui` | Vite dev | 8081 | http://localhost:8081 | **Local development (recommended)** |
| `make serve-ui-prod` | Python HTTP | 8082 | http://localhost:8082 | Test production build (will have 404s) |
| `make run-lambda-local` | Node.js | 3000 | http://localhost:3000 | Local Lambda API |
| `make dev` | Both | 8081 + 3000 | Both URLs | Full local dev environment |

## Vite Dev Server Features

When using `make serve-ui` (Vite dev server):

1. **Hot Module Replacement (HMR)**: Changes to React components instantly reflect without full page reload
2. **Fast Refresh**: React state preserved during component edits
3. **TypeScript Checking**: Build errors shown in browser overlay
4. **Source Maps**: Original TypeScript code in browser DevTools
5. **Optimized Dependencies**: Pre-bundled for fast startup
6. **Network Access**: Can access from other devices on network (shows local IP)

## Testing Strategy

### Local Development
```bash
# Start dev server with hot reload
make serve-ui

# Visit http://localhost:8081
# Make changes to files in ui-new/src/
# Browser auto-refreshes
```

### Production Build Verification
```bash
# Build for production
make build-ui

# Check that base path is correct in docs/index.html
grep "lambdallmproxy" docs/index.html

# Should see:
# <link rel="icon" href="/lambdallmproxy/agent.png" />
# <script type="module" crossorigin src="/lambdallmproxy/assets/index-....js">
```

### GitHub Pages Verification
```bash
# Deploy to GitHub Pages
make deploy-ui

# Visit: https://syntithenai.github.io/lambdallmproxy/
# All assets should load correctly
```

## Troubleshooting

### Issue: 404 errors on localhost
**Cause**: Using `make serve-ui-prod` or manually serving `docs/` directory  
**Solution**: Use `make serve-ui` instead (Vite dev server)

### Issue: Changes not appearing
**Cause**: Using production build instead of dev server  
**Solution**: Use `make serve-ui` with Vite HMR

### Issue: "npm: command not found"
**Cause**: Node.js/npm not installed  
**Solution**: Install Node.js (includes npm)

### Issue: Port 8081 already in use
**Cause**: Another server running on port 8081  
**Solution**: Kill other process using port 8081 or Vite will auto-increment port (8082, 8083, etc.)

### Issue: GitHub Pages shows 404
**Cause**: Base path not set correctly  
**Solution**: Verify `vite.config.ts` has `base: command === 'build' ? '/lambdallmproxy/' : '/'`

## Migration Guide

### If you were using `python3 -m http.server 8081`:

**Old workflow:**
```bash
cd docs
python3 -m http.server 8081
# Visit http://localhost:8081
# → 404 errors
```

**New workflow:**
```bash
make serve-ui
# Visit http://localhost:8081
# ✅ Works correctly
```

### If you were building every change:

**Old workflow:**
```bash
# Edit file
make build-ui           # Wait ~10 seconds
# Refresh browser
# Repeat for every change
```

**New workflow:**
```bash
make serve-ui           # Start once
# Edit file
# Browser auto-refreshes instantly
```

## Related Files

- `ui-new/vite.config.ts` - Vite configuration with conditional base path
- `Makefile` - Development commands
- `ui-new/package.json` - NPM scripts
- `docs/index.html` - Production build output (has /lambdallmproxy/ paths)

## Success Criteria

✅ `make serve-ui` starts Vite dev server without errors  
✅ Visiting http://localhost:5173 loads UI without 404 errors  
✅ Changes to React components auto-refresh in browser  
✅ `make build-ui` creates production build with correct base path  
✅ `make deploy-ui` deploys successfully to GitHub Pages  
✅ Production site at https://syntithenai.github.io/lambdallmproxy/ works correctly  

---

## Summary

The fix separates development and production environments:

- **Development** (`make serve-ui`): Vite dev server with root path and HMR
- **Production** (`make deploy-ui`): Static build with GitHub Pages subpath

This gives you the best of both worlds: fast local development with hot reload, and correctly configured production builds for GitHub Pages.
