# Testing the Transparency Features

## Quick Test Steps

The local development environment has been restarted with the updated code including transparency metadata.

### Step 1: Open the UI
Navigate to: **http://localhost:8082**

### Step 2: Perform a Web Search
In the chat interface, type a search query that will return images, for example:
```
Search for AI news 2024
```
or
```
Search for machine learning tutorials
```

### Step 3: Wait for Response
The system will:
1. Call the search_web tool
2. Extract images and links from the results
3. Calculate placement scores
4. Build metadata

### Step 4: Look for the Transparency Section
After the response completes, scroll to the bottom. You should see:

```
📚 References & Sources
(list of links)

🖼️ Related Images  
(top 3 images displayed)

▼ 🔍 Extraction Transparency & Debug Info
```

Click on the **"🔍 Extraction Transparency & Debug Info"** section to expand it.

### Step 5: Verify the Transparency Data
Inside the expanded section, you should see:

1. **📊 Extraction Summary**
   - Grid showing counts:
     - Total Images: X
     - Unique Images: Y
     - Prioritized Images: 3
     - Total Links: X
     - Unique Links: Y
     - Prioritized Links: Z

2. **📍 Image Placement Distribution**
   - Color-coded bars showing:
     - hero (green)
     - above-fold (blue)
     - content (purple)
     - sidebar (red)
     - below-fold (gray)

3. **🎯 Smart Image Selection (Top 3)**
   - Cards showing:
     - Rank (#1, #2, #3)
     - Placement badge
     - Combined score
     - Score breakdown (placement × 0.6 + relevance × 0.4)
     - Image URL

4. **📋 Raw Metadata (JSON)**
   - Collapsible JSON tree
   - Click to expand and explore the full metadata structure

---

## Debugging If Section Doesn't Appear

### Check Lambda Console Logs
In your terminal running `make dev`, look for:
```
✅ Extracted content: X total links (Y prioritized), Z images (3 prioritized)...
📊 Metadata added to extractedContent: {...}
```

If you see the metadata log, the backend is working correctly.

### Check Browser Console
Open browser DevTools (F12), go to Console tab, and look for:
- Any errors related to ExtractedContent
- The extractedContent object being received

You can also type in the console:
```javascript
// Find the latest message with extractedContent
console.log(/* find in React state */)
```

### Check Network Tab
1. Open DevTools → Network tab
2. Perform search
3. Look for POST request to `/chat`
4. Check the response
5. Look for `extractedContent` → `metadata` in the response JSON

---

## What Each Section Shows

### Extraction Summary
Shows the funnel from total → unique → prioritized:
- **Total**: All items found across all search results
- **Unique**: After deduplication (same URL/src)
- **Prioritized**: Top items selected for display

### Image Placement Distribution
Shows how images are classified by position:
- **Hero**: Large images at top of page (score: 1.0)
- **Above-fold**: Images in first 20% of page (score: 0.9)
- **Content**: Images in article/main sections (score: 0.8)
- **Below-fold**: Images further down page (score: 0.5)
- **Sidebar**: Images in sidebar/aside (score: 0.3)

### Smart Image Selection
Explains why each of the top 3 images was selected:
- **Combined Score**: Weighted average of placement (60%) and relevance (40%)
- **#1 Ranking**: Typically hero or high-relevance content images
- **Visual Indicators**: Green highlight for #1, color-coded badges

### Raw Metadata JSON
Full transparency into the data structure:
- Can drill down into any nested field
- Verify exact values being used
- Debug any calculation issues

---

## Expected Behavior

### When Transparency Section Appears
✅ Any search that returns images and links  
✅ When extractedContent.metadata exists  
✅ After at least one tool call completes

### When Transparency Section Won't Appear
❌ Searches with no images  
❌ Before any tool calls  
❌ On error responses  
❌ When extractedContent is null

---

## Common Issues

### "I don't see the section at all"
**Cause**: Search didn't return any images or the metadata isn't being created  
**Solution**: 
1. Check Lambda console logs for metadata
2. Try a different search query with images
3. Verify extractedContent exists in response

### "Section is there but empty"
**Cause**: Metadata object is present but has no data  
**Solution**: Check if images/links were actually extracted

### "JSON viewer not expanding"
**Cause**: JsonTreeViewer component issue  
**Solution**: 
1. Check browser console for errors
2. Verify JsonTreeViewer is imported correctly
3. Check if metadata object is valid JSON

---

## Success Criteria

✅ Transparency section appears after web search  
✅ Summary stats show non-zero values  
✅ Placement distribution bars render  
✅ Top 3 images displayed with scores  
✅ JSON viewer expands/collapses  
✅ All scores and calculations visible  
✅ #1 image highlighted in green  
✅ Placement badges color-coded correctly

---

## Next Steps After Testing

Once transparency features are verified:

1. **Test with Different Queries**
   - News articles (likely hero images)
   - Blog posts (likely content images)
   - Product pages (likely mixed placement)

2. **Verify Score Accuracy**
   - Hero images should have highest scores
   - Sidebar images should be deprioritized
   - Relevance affects ranking

3. **Check Mobile Responsiveness**
   - Grid layout adapts
   - Bars render correctly
   - Cards stack properly

4. **Deploy to Production**
   - Rebuild UI: `make build-ui`
   - Deploy Lambda: `./deploy.sh`
   - Deploy docs: `./scripts/deploy-docs.sh`

---

**Server Status:** ✅ Running on http://localhost:8082  
**Backend Logs:** Added debug output for metadata  
**Frontend:** Hot reload enabled (changes auto-refresh)

Ready to test! 🚀
