# Per-Tool Transparency Refactor Plan

## Goal
Add transparency information (raw response + extraction metadata) to each individual tool result, displayed inline in the chat UI.

## Current Architecture
- **Backend**: Processes all tool messages together, creates single aggregated `extractedContent` with one `metadata` object
- **Frontend**: Shows aggregated metadata in single section at bottom via `ExtractedContent` component

## Target Architecture  
- **Backend**: Processes each tool message individually, attaches `rawResult` and `extractionMetadata` to each tool message
- **Frontend**: Shows transparency section after each tool result via new `ToolTransparency` component

## Implementation Steps

### 1. Backend Changes (src/endpoints/chat.js)

#### A. Modify Tool Message Structure (lines 2222-2550)
Currently creates:
```javascript
extractedContent = {
  prioritizedLinks: [...],
  prioritizedImages: [...],
  youtubeVideos: [...],
  metadata: {  // Single aggregated metadata for ALL tools
    summary: {...},
    imagePlacement: {...},
    topImages: [...],
    linkCategories: {...}
  }
}
```

Change to create per-tool tracking:
```javascript
// NEW: Track extraction metadata per tool
const toolExtractionMetadata = {};  // Key: tool_call_id, Value: metadata

for (const toolMsg of toolMessages) {
  const toolData = {
    toolName: toolMsg.name,
    toolCallId: toolMsg.tool_call_id,
    images: [],
    links: [],
    videos: [],
    media: []
  };
  
  // Extract content for this specific tool
  // ... existing extraction logic ...
  
  // Create metadata for THIS tool only
  toolExtractionMetadata[toolMsg.tool_call_id] = {
    summary: {
      totalImages: toolData.images.length,
      uniqueImages: [...new Set(toolData.images.map(i => i.src))].length,
      totalLinks: toolData.links.length,
      // etc.
    },
    imagePlacement: imagePlacementStats,
    topImages: prioritizedImages.slice(0, 3),
    linkCategories: {...}
  };
  
  // Aggregate into combined extractedContent (for backward compatibility)
  allImages.push(...toolData.images);
  allLinks.push(...toolData.links);
  // etc.
}
```

#### B. Attach Metadata to Tool Result Messages (lines 2858-2865)
Currently:
```javascript
messageCompleteData.toolResults = toolResultMessages.map(tm => ({
  role: 'tool',
  content: tm.rawResult || tm.content,
  tool_call_id: tm.tool_call_id,
  name: tm.name
}));
```

Change to:
```javascript
messageCompleteData.toolResults = toolResultMessages.map(tm => ({
  role: 'tool',
  content: tm.rawResult || tm.content,
  tool_call_id: tm.tool_call_id,
  name: tm.name,
  rawResponse: tm.rawResult,  // NEW: Full raw response
  extractionMetadata: toolExtractionMetadata[tm.tool_call_id] || null  // NEW: Per-tool metadata
}));
```

### 2. Frontend Changes

#### A. Update ChatMessage Type (ui-new/src/types/chat.ts or similar)
Add fields to tool result type:
```typescript
interface ToolResult {
  role: 'tool';
  content: string;
  tool_call_id: string;
  name: string;
  rawResponse?: string;  // NEW
  extractionMetadata?: {  // NEW
    summary?: {...},
    imagePlacement?: {...},
    topImages?: {...},
    linkCategories?: {...}
  };
}
```

#### B. Integrate ToolTransparency Component (ui-new/src/components/ChatTab.tsx)
In the tool message rendering section (around line 3200), after the result display, add:
```tsx
import ToolTransparency from './ToolTransparency';

// ... inside tool message rendering ...
</div>  {/* End of result display */}

{/* NEW: Add transparency section */}
<ToolTransparency 
  rawResponse={msg.rawResponse}
  extractionMetadata={msg.extractionMetadata}
/>
```

### 3. Testing Plan
1. **search_web**: Should show DuckDuckGo/Tavily JSON response + extraction metadata
2. **scrape_web_content**: Should show raw HTML/content + extraction metadata (images, links extracted)
3. **get_youtube_transcript**: Should show raw transcript JSON + metadata

### 4. Backward Compatibility
Keep the aggregated `extractedContent` with `metadata` for:
- Existing UI components that expect it
- Overall statistics across all tools
- Future analytics/reporting

## Benefits
- ✅ Full transparency per tool
- ✅ Debug each tool's extraction individually
- ✅ Copy raw responses for troubleshooting
- ✅ Understand exactly what was extracted from each source
- ✅ Easier to identify issues with specific tools

## Implementation Order
1. ✅ Create ToolTransparency component (DONE)
2. ⏳ Backend: Add per-tool metadata tracking
3. ⏳ Backend: Attach rawResponse + metadata to toolResults
4. ⏳ Frontend: Integrate ToolTransparency into ChatTab
5. ⏳ Test all three tool types
6. ⏳ Remove or relocate aggregated transparency section if desired
