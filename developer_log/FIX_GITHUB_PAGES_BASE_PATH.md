# GitHub Pages Base Path Fix

## Issue

Getting 404 errors when accessing the GitHub Pages site:
```
GET https://syntithenai.github.io/assets/index-BqJ7M5T7.js
404 Not Found
```

## Root Cause

The Vite build configuration was missing the `base` property. For GitHub Pages project repositories (not user/org sites), assets must be served from a subdirectory matching the repository name.

**Incorrect URL**: `https://syntithenai.github.io/assets/...`
**Correct URL**: `https://syntithenai.github.io/lambdallmproxy/assets/...`

## Solution

Added `base: '/lambdallmproxy/'` to `ui-new/vite.config.ts`:

```typescript
export default defineConfig({
  plugins: [react()],
  base: '/lambdallmproxy/',  // ← Added this line
  build: {
    outDir: '../docs',
    emptyOutDir: true,
  },
  // ...
})
```

## Result

All assets now correctly include the repository name in their paths:
- HTML: `<link rel="icon" href="/lambdallmproxy/agent.png" />`
- CSS: `<link rel="stylesheet" href="/lambdallmproxy/assets/index-DJdAlM9z.css">`
- JS: `<script src="/lambdallmproxy/assets/index-DcsdZwV6.js"></script>`

## Correct Access URL

**Production Site**: https://syntithenai.github.io/lambdallmproxy/

## Deployment

```bash
# After adding base path to vite.config.ts
make deploy-ui
```

## Implementation Date

- **Date**: October 12, 2025
- **Commit**: 3bd9181

## Related Files

- `ui-new/vite.config.ts` - Added base path configuration
- `docs/index.html` - Now includes `/lambdallmproxy/` prefix on all asset URLs
- `docs/assets/*` - All asset files remain in the assets directory

## Testing

1. Clear browser cache (important!)
2. Navigate to: https://syntithenai.github.io/lambdallmproxy/
3. Open DevTools Network tab
4. Verify all assets load with 200 status (not 404)
5. Check that asset URLs include `/lambdallmproxy/` prefix

## Notes

- GitHub Pages serves user/org sites from root: `https://<username>.github.io/`
- Project repository sites are served from subdirectory: `https://<username>.github.io/<repo>/`
- This is why the `base` property is required for Vite builds targeting GitHub Pages project repos
- The `base` path must match the repository name exactly

## Cache Considerations

- GitHub Pages has aggressive caching
- CDN may take a few minutes to propagate changes
- Use hard refresh (Ctrl+F5) or incognito mode for immediate testing
- Production changes may take 5-10 minutes to fully propagate
