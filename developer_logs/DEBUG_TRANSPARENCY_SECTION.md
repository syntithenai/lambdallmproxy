# Debug Guide: Finding the Transparency Section

## 🔍 Current Status

✅ **Backend restarted** with enhanced debug logging  
✅ **Frontend updated** with console.log statements  
✅ **Both servers running:**
- Lambda: http://localhost:3000
- UI: http://localhost:8082

## 📋 Step-by-Step Testing

### Step 1: Open Browser Developer Tools

1. Open **http://localhost:8082**
2. Press **F12** (or right-click → Inspect)
3. Go to the **Console** tab
4. Clear the console (click 🚫 icon or Ctrl+L)

### Step 2: Perform a Web Search

In the chat interface, type:
```
search for AI breakthroughs 2024
```

or

```
search for latest tech news
```

**Important:** Use a query that will return web pages with images!

### Step 3: Monitor Lambda Logs (Terminal)

While the search is running, watch your terminal. You should see:

```
✅ Processing N tool messages for extraction
🔍 Processing search_web with X results
✅ Extracted content: Y total links (...), Z images (...) 
📊 Metadata added to extractedContent: {...}
📦 Adding extractedContent to response. Has metadata: true
📊 Metadata summary: {totalImages: X, uniqueImages: Y, prioritizedImages: 3}
```

### Step 4: Check Browser Console

In the browser console, you should see:
```
🔍 ExtractedContent received: {
  hasMetadata: true,
  metadataKeys: ['summary', 'imagePlacement', 'topImages', 'linkCategories'],
  hasSummary: true,
  hasPlacement: true,
  hasTopImages: true
}
```

### Step 5: Look for the Section

Scroll to the bottom of the response. You should see:

1. **📚 References & Sources** (links)
2. **🖼️ Related Images** (top 3 images)
3. **🔍 Extraction Transparency & Debug Info** ← THIS IS WHAT WE'RE LOOKING FOR

## 🐛 Troubleshooting

### If Terminal Shows "⚠️ No extractedContent to include in response"

**Problem:** extractedContent is null  
**Possible Causes:**
1. No tool messages were processed
2. Assistant response has no content
3. Tool results have no page_content

**Check:**
```
🔍 POST-PROCESSING: toolMessages=X, assistantContent=Y chars
```

If `toolMessages=0` → No tools were called  
If `assistantContent=0` → Assistant hasn't responded yet

### If Terminal Shows "Has metadata: false"

**Problem:** Metadata wasn't added to extractedContent  
**Possible Causes:**
1. No images were found in search results
2. Code path didn't reach metadata creation
3. extractedContent was created in transcript section, not search section

**Check earlier logs for:**
```
✅ Processing N tool messages for extraction
```

### If Browser Console Shows "hasMetadata: false"

**Problem:** UI received extractedContent but without metadata  
**Check:**
1. Network tab → Find the `/chat` request
2. Look at Response → find `extractedContent`
3. Check if `metadata` field exists in the JSON

### If Section Doesn't Appear But hasMetadata: true

**Problem:** UI rendering issue  
**Check:**
1. Browser console for React errors
2. Inspect element → look for the transparency section in DOM
3. Check if section is being rendered but hidden (CSS issue)

## 📝 What to Look For in Different Scenarios

### Scenario 1: Successful Search with Images

**Terminal logs:**
```
✅ Processing 1 tool messages for extraction
🔍 Processing search_web with 5 results
📊 Metadata added to extractedContent
📦 Adding extractedContent to response. Has metadata: true
```

**Browser console:**
```
🔍 ExtractedContent received: { hasMetadata: true, ... }
```

**UI:**
- ✅ Transparency section appears
- ✅ All subsections populated with data

### Scenario 2: Search with No Images

**Terminal logs:**
```
✅ Extracted content: 5 total links (...), 0 images (0 prioritized)
📊 Metadata added to extractedContent: {
  summary: { totalImages: 0, uniqueImages: 0, prioritizedImages: 0, ... }
}
```

**Browser console:**
```
🔍 ExtractedContent received: { 
  hasMetadata: true,
  metadataKeys: ['summary', 'imagePlacement', 'topImages', 'linkCategories']
}
```

**UI:**
- ✅ Transparency section appears
- ✅ Summary shows 0 images
- ⚠️ Image placement distribution may be empty
- ⚠️ Top images section may be empty

### Scenario 3: Direct Question (No Tools)

**Terminal logs:**
```
🔍 POST-PROCESSING: toolMessages=0, assistantContent=150 chars
⚠️ No extractedContent to include in response
```

**Browser console:**
- No ExtractedContent log (component not rendered)

**UI:**
- ❌ No transparency section (no extractedContent at all)

## 🎯 Expected Behavior

The transparency section will **only appear** when:
1. ✅ A tool was called (search_web, scrape_url, etc.)
2. ✅ The tool returned page_content with images/links
3. ✅ The assistant provided a text response
4. ✅ The metadata was successfully created and sent

## 🔬 Deep Debugging

### Check Raw Response Data

In browser console, after a search completes:
```javascript
// This will show the last response data
// (you may need to adapt based on your state management)
```

### Check extractedContent Structure

In browser console:
```javascript
// Look for the extractedContent in React DevTools
// Or check Network tab → Response JSON
```

### Verify Metadata Creation

The metadata should have this structure:
```json
{
  "summary": {
    "totalImages": 12,
    "uniqueImages": 8,
    "prioritizedImages": 3,
    "totalLinks": 47,
    "uniqueLinks": 25,
    "prioritizedLinks": 8,
    "youtubeVideos": 0,
    "otherVideos": 0
  },
  "imagePlacement": {
    "hero": 1,
    "above-fold": 2,
    "content": 3,
    "sidebar": 1,
    "below-fold": 1
  },
  "topImages": [
    {
      "rank": 1,
      "src": "...",
      "placement": "hero",
      "placementScore": 1.0,
      "relevance": 0.6,
      "combinedScore": "0.840",
      "selectionReason": "..."
    }
  ],
  "linkCategories": {
    "searchResults": 5,
    "scrapedLinks": 20,
    "prioritizedFromScraped": 5
  }
}
```

## 📊 What the Logs Mean

### Backend Logs

| Log Message | Meaning |
|------------|---------|
| `🔍 POST-PROCESSING: toolMessages=N` | Found N tool results to process |
| `✅ Processing N tool messages` | Starting extraction from tool results |
| `🔍 Processing search_web with X results` | Found X search results |
| `📊 Metadata added to extractedContent` | Metadata object created successfully |
| `📦 Adding extractedContent to response. Has metadata: true` | Sending metadata to UI |
| `⚠️ No extractedContent to include` | No content to send (no tools or no results) |

### Frontend Logs

| Log Message | Meaning |
|------------|---------|
| `🔍 ExtractedContent received: { hasMetadata: true }` | Component received metadata |
| `hasMetadata: false` | No metadata in received data |
| `metadataKeys: [...]` | Which metadata fields are present |

## ✅ Success Indicators

You'll know it's working when you see:

1. **Terminal:**
   ```
   📊 Metadata added to extractedContent
   📦 Adding extractedContent to response. Has metadata: true
   ```

2. **Browser Console:**
   ```
   🔍 ExtractedContent received: { hasMetadata: true, ... }
   ```

3. **UI:**
   - Expandable section with 🔍 icon
   - Title: "Extraction Transparency & Debug Info"
   - Subsections with data

## 🚨 If Nothing Works

1. **Kill all node processes:**
   ```bash
   pkill -f node
   ```

2. **Restart clean:**
   ```bash
   make dev
   ```

3. **Hard refresh browser:**
   - Ctrl+Shift+R (Linux/Windows)
   - Cmd+Shift+R (Mac)

4. **Check for errors:**
   - Terminal for backend errors
   - Browser console for frontend errors

---

**Ready to test!** Follow the steps above and report what you see in:
1. Terminal logs
2. Browser console logs  
3. The UI itself

This will help us identify exactly where the issue is.
