# Clear Browser Storage to Fix Embedding Settings

The embedding settings are showing as `undefined` because your browser has old settings cached.

## Quick Fix (Choose One Method)

### Method 1: Clear via Browser Console (Easiest)
1. Open browser DevTools (F12)
2. Go to **Console** tab
3. Run this command:
```javascript
localStorage.removeItem('app_settings'); location.reload();
```

### Method 2: Clear via Application Tab
1. Open browser DevTools (F12)
2. Go to **Application** tab (Chrome) or **Storage** tab (Firefox)
3. Expand **Local Storage** in the left sidebar
4. Click on `http://localhost:8081` (or your domain)
5. Find `app_settings` in the list
6. Right-click → **Delete**
7. Refresh page (Ctrl+R / Cmd+R)

### Method 3: Clear All Site Data
1. Open browser DevTools (F12)
2. Go to **Application** tab
3. Click **Clear storage** in left sidebar
4. Click **Clear site data** button
5. Refresh page

## What This Does

After clearing, the app will recreate settings with proper defaults:
- `embeddingSource: 'local'` (uses browser-based embeddings)
- `embeddingModel: 'Xenova/all-MiniLM-L6-v2'` (recommended local model)

## Verify It Worked

After clearing and refreshing, check the browser console for:
```
🔍 Embedding source check: embeddingSource="local", useLocalEmbeddings=true, embeddingModel="Xenova/all-MiniLM-L6-v2"
```

If you see this, the fix is working! ✅
