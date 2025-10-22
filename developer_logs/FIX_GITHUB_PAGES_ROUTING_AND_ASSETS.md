# GitHub Pages React Router & Asset Path Fixes

## Issues Fixed

### 1. Missing Research Agent Image on Login Screen
**Problem**: Image not loading on GitHub Pages deployment
**Error**: 404 for `/agent.png`

### 2. Blank Chat Page (Routes Not Working)
**Problem**: React Router routes not working on GitHub Pages with base path
**Symptom**: Only header shows, main content area blank

### 3. CORS Errors for Usage Endpoint
**Status**: Backend already has CORS headers - no changes needed
**Note**: CORS should work correctly with proper preflight handling

## Root Causes

### Image Path Issue
Images referenced with absolute paths like `/agent.png` don't include the repository base path needed for GitHub Pages project repositories.

### Router Issue  
`BrowserRouter` needs a `basename` prop to work correctly on GitHub Pages project repos where the app is served from `/lambdallmproxy/` instead of root `/`.

## Solutions Applied

### 1. Fixed Image Path in LoginScreen
**File**: `ui-new/src/components/LoginScreen.tsx`

**Before**:
```tsx
<img 
  src="/agent.png" 
  alt="Research Agent" 
  className="w-24 h-24 object-contain"
/>
```

**After**:
```tsx
<img 
  src={`${import.meta.env.BASE_URL}agent.png`}
  alt="Research Agent" 
  className="w-24 h-24 object-contain"
/>
```

**Explanation**: `import.meta.env.BASE_URL` is set by Vite to `/lambdallmproxy/` (from `vite.config.ts` base property), so the final path becomes `/lambdallmproxy/agent.png`.

### 2. Fixed React Router Base Path
**File**: `ui-new/src/App.tsx`

**Before**:
```tsx
function App() {
  return (
    <BrowserRouter>
      <ToastProvider>
        {/* ... providers ... */}
      </ToastProvider>
    </BrowserRouter>
  );
}
```

**After**:
```tsx
function App() {
  return (
    <BrowserRouter basename={import.meta.env.BASE_URL}>
      <ToastProvider>
        {/* ... providers ... */}
      </ToastProvider>
    </BrowserRouter>
  );
}
```

**Explanation**: The `basename` prop tells React Router that all routes are relative to `/lambdallmproxy/`, so when you navigate to `/`, it actually goes to `/lambdallmproxy/`.

## How BASE_URL Works

1. **vite.config.ts** defines the base:
   ```typescript
   export default defineConfig({
     base: '/lambdallmproxy/',
     // ...
   })
   ```

2. **At build time**, Vite:
   - Sets `import.meta.env.BASE_URL` to `/lambdallmproxy/`
   - Prefixes all asset paths in HTML with `/lambdallmproxy/`
   - Generates proper import paths

3. **At runtime**:
   - `import.meta.env.BASE_URL` resolves to `/lambdallmproxy/`
   - Image source: `${BASE_URL}agent.png` → `/lambdallmproxy/agent.png`
   - Router basename ensures routes work: `/` → `/lambdallmproxy/`

## URL Structure on GitHub Pages

### Project Repository (lambdallmproxy)
- **Base URL**: `https://syntithenai.github.io/lambdallmproxy/`
- **Assets**: `https://syntithenai.github.io/lambdallmproxy/assets/...`
- **Images**: `https://syntithenai.github.io/lambdallmproxy/agent.png`
- **Routes**: `https://syntithenai.github.io/lambdallmproxy/` (home)

### User/Org Site (if this were syntithenai.github.io repo)
- **Base URL**: `https://syntithenai.github.io/`
- **Assets**: `https://syntithenai.github.io/assets/...`
- **No base path needed** - served from root

## Testing Checklist

### Local Development (works without base path)
```bash
cd ui-new
npm run dev
# Access: http://localhost:5173
# BASE_URL = '/' (default)
```

### Production Build (with base path)
```bash
make deploy-ui
# BASE_URL = '/lambdallmproxy/'
```

### Verify on GitHub Pages
1. ✅ Navigate to: https://syntithenai.github.io/lambdallmproxy/
2. ✅ Check login screen shows Research Agent image
3. ✅ After login, chat interface loads (not blank)
4. ✅ Check DevTools Network tab - all assets load from `/lambdallmproxy/...`
5. ✅ Navigate between tabs (Chat, Swag) - routes work
6. ✅ Refresh page on any route - doesn't 404
7. ✅ Check console for CORS errors - should be none after auth

## CORS Handling

### Backend Already Configured
The Lambda function has CORS headers on all endpoints:

```javascript
headers: {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  // ...
}
```

### Preflight Requests
OPTIONS requests are handled in `src/index.js`:

```javascript
if (method === 'OPTIONS') {
  return handleCorsPreflightRequest();
}
```

### Usage Endpoint
The `/usage` endpoint includes CORS headers in all responses (200, 401, 500).

## Related Files

### Frontend
- `ui-new/vite.config.ts` - Base path configuration
- `ui-new/src/App.tsx` - Router basename
- `ui-new/src/components/LoginScreen.tsx` - Image path

### Backend (no changes needed)
- `src/index.js` - CORS preflight handling
- `src/endpoints/usage.js` - CORS headers on responses
- `src/endpoints/chat.js` - CORS headers
- `src/endpoints/transcribe.js` - CORS headers

## Implementation Date

- **Date**: October 12, 2025
- **Commit**: c86dc54

## Best Practices for GitHub Pages + React

1. **Always use `base` in vite.config.ts** for project repos
2. **Use `import.meta.env.BASE_URL`** for all asset references
3. **Set `basename` on BrowserRouter** to match Vite base
4. **Use relative imports** for JavaScript modules (handled automatically)
5. **Test locally with production build** before deploying:
   ```bash
   npm run build
   npm run preview
   ```

## Common Pitfalls Avoided

❌ **Hardcoded absolute paths**: `/agent.png`
✅ **Use BASE_URL**: `${import.meta.env.BASE_URL}agent.png`

❌ **BrowserRouter without basename**: Routes 404 on refresh
✅ **BrowserRouter with basename**: Routes work correctly

❌ **Missing 404.html**: GitHub Pages returns 404 for SPA routes
✅ **404.html redirect**: Already in place at `docs/404.html`

## Verification Commands

```bash
# Check built index.html has correct paths
grep 'src=' docs/index.html | head -5

# Should show:
# <script src="/lambdallmproxy/assets/index-....js">
# <link href="/lambdallmproxy/assets/index-....css">

# Check image path
ls -l docs/agent.png

# Test production build locally
cd ui-new
npm run build
npm run preview
# Access: http://localhost:4173/lambdallmproxy/
```

## Summary

Both issues stemmed from the same root cause: not accounting for the GitHub Pages base path (`/lambdallmproxy/`). The fixes ensure all assets and routes include this prefix:

- **Images**: Use `BASE_URL` environment variable
- **Router**: Set `basename` prop on BrowserRouter  
- **Build**: Configure `base` in vite.config.ts

With these changes, the app works correctly on both local development (base `/`) and GitHub Pages deployment (base `/lambdallmproxy/`).
