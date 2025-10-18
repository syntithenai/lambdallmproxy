# Image Extraction and Streaming Indicator Improvements

## Changes Made

### 1. Extract ALL Images for UI Display

**Problem**: Only 3 images were being extracted and shown in the "All Images" list, even though pages had many more images.

**Solution**: Modified the image extraction to separate prioritized images (for LLM) from all images (for UI).

#### Files Modified:

**src/html-parser.js**:
- Modified `extractImages(limit)` to accept `null` for no limit
- Added new method `extractAllImages(priorityLimit)` that returns:
  - `prioritized`: Top N images for LLM (scored by relevance + placement)
  - `all`: ALL images found on the page

**src/tools.js**:
- Updated `scrape_web_content` tool (both Firecrawl and Puppeteer paths)
- Changed from `parser.extractImages(20)` to `parser.extractAllImages(3)`
- Now extracts:
  - `images`: Top 3 prioritized images (sent to LLM)
  - `allImages`: ALL images found (sent to UI)
- Added `allImages` field to the response object

**src/endpoints/chat.js**:
- Updated extraction logic to handle both `images` and `allImages` fields
- `allImages` populates the "All Images" collapsible section
- `images` is used for smart prioritization in "Selected Images" section
- Preserved relevance and placement scores for proper sorting

### 2. Streaming Indicator After Tool Results

**Problem**: When web scraping tool completed, users couldn't see that the LLM was still generating a response.

**Solution**: Added a visible "Generating LLM response..." indicator with spinner.

#### Files Modified:

**ui-new/src/components/ChatTab.tsx**:
- Added streaming indicator inside the last tool result block
- Shows at the bottom of the last tool result when `msg.isStreaming` is true
- Styled with:
  - Border separator
  - Spinning icon (larger, 5x5)
  - Blue color for visibility
  - "Generating LLM response..." text
- Only shows on the last tool result to avoid duplication

## Results

### Image Extraction:
- **Before**: Only 3 images extracted and shown
- **After**: ALL images extracted and shown in "All Images" section
- Top 3 most relevant images still shown in "Selected Images" section
- Images sorted by relevance and placement scores

### Streaming Indicator:
- **Before**: Tool result shown, but no indication LLM was still working
- **After**: Clear visual indicator with spinner and text showing LLM is generating response
- Appears at the bottom of the last tool result block
- Automatically disappears when streaming completes

## Technical Details

### Image Prioritization Algorithm:
Images are scored using:
- **Relevance score** (0-1.0): Based on alt text, title, caption, and context
- **Placement score** (0.3-1.0): Based on position in HTML (hero, content, sidebar, etc.)
- **Size bonus**: +0.2 for images > 300px, -0.3 for images < 100px
- **Combined score**: `(placementScore * 0.6) + (relevance * 0.4)`

Top 3 are selected for "Selected Images" (sent to LLM), all are available in "All Images" (UI only).

### Streaming Indicator Logic:
```tsx
{msg.isStreaming && msg.toolResults && trIdx === msg.toolResults.length - 1 && (
  <div>Generating LLM response...</div>
)}
```
Only shows on:
- Messages that are currently streaming
- Last tool result in the toolResults array
- When toolResults exist

## Testing

To test these changes:
1. **Image Extraction**: Scrape a page with many images and check the "All Images" section
2. **Streaming Indicator**: Scrape a page and watch for the indicator after tool result appears
