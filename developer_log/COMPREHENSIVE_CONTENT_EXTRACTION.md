# Comprehensive Content Extraction Feature

**Deployment:** llmproxy-20251009-134416.zip (111.8 KB)  
**Date:** October 9, 2025  
**File Modified:** `src/endpoints/chat.js`

## Overview

Implemented automatic post-processing that extracts all discovered content from tool calls (search_web, scrape_url) and sends it as **structured data separate from the LLM response**. This ensures:
1. Users always have access to complete source information
2. Extracted content never pollutes LLM conversation context
3. UI can easily display expandable sections without modifying response text

## Problem Solved

**Root Cause:** CloudWatch logs confirmed the LLM was receiving URLs in tool results but ignoring instructions to include them in responses (model compliance issue, not backend bug).

**Solution:** Instead of relying on LLM compliance:
1. Extract all content from tool results (URLs, images, videos, media)
2. If LLM didn't include links, inject a simple **Sources:** section into content
3. Send complete extracted content as **separate structured fields** in the response
4. UI displays these fields as expandable sections below the response
5. Extracted content **never enters LLM conversation context** - always separate

## Response Structure

### SSE Events Sent to Client

**message_complete event:**
```javascript
{
  role: 'assistant',
  content: '...',  // LLM response (may include injected Sources section)
  extractedContent: {
    sources: [...],      // Array of URL objects (or null)
    images: [...],       // Array of image objects (or null)
    youtubeVideos: [...], // Array of YouTube video objects (or null)
    otherVideos: [...],  // Array of other video objects (or null)
    media: [...]         // Array of media objects (or null)
  }
}
```

**complete event:**
```javascript
{
  status: 'success',
  messages: [...],     // Full conversation history
  iterations: 2,
  extractedContent: {...}  // Same structure as above
}
```

### Extracted Content Structure

#### Sources
```javascript
[
  {
    title: "Tesla Stock Price - Yahoo Finance",
    url: "https://finance.yahoo.com/quote/TSLA",
    snippet: "Tesla Inc. (TSLA) stock price, news, quote..." // Optional, first 150 chars
  },
  ...
]
```

#### Images
```javascript
[
  {
    src: "https://cdn.example.com/model3.jpg",
    alt: "Tesla Model 3",
    source: "https://tesla.com/model3"  // Page URL where image was found
  },
  ...
]
```

#### YouTube Videos
```javascript
[
  {
    src: "https://youtube.com/watch?v=abc123",
    title: "Tesla Q3 2025 Earnings Call",
    source: "https://investor.tesla.com"  // Page URL where video was found
  },
  ...
]
```

#### Other Videos
```javascript
[
  {
    src: "https://example.com/videos/factory.mp4",
    title: "Tesla Factory Tour",
    source: "https://tesla.com/factory"
  },
  ...
]
```

#### Media
```javascript
[
  {
    src: "https://example.com/podcast.mp3",
    type: "audio",
    source: "https://tesla.com/podcast"
  },
  ...
]
```

## Features

### 1. **Automatic URL Injection into Content** (Fallback)
- Detects if LLM didn't include markdown links in response
- Injects simple **Sources:** list into `content` field
- Ensures basic attribution even if UI doesn't handle extractedContent

### 2. **Structured Extracted Content** (Primary)
- All content sent as **separate fields**, never part of LLM context
- UI displays as expandable sections below response
- Deduplicated by URL/src
- Categorized into sources, images, YouTube, videos, media

### 3. **Context Cleanliness**
- Extracted content **never sent to LLM** in subsequent requests
- No filtering/stripping needed - it's simply not in message.content
- Keeps conversation focused on actual LLM responses

## Implementation Details

### Content Extraction Pipeline

1. **Collect Tool Results**
   - Filters all `tool` role messages from conversation
   - Processes both JSON and compressed markdown formats

2. **Parse Content**
   - **search_web JSON:** Extracts from `results[].page_content.{images, videos, media}`
   - **scrape_url JSON:** Extracts from top-level `{images, videos, media}`
   - **Compressed Markdown:** Extracts URLs from `🚨 CRITICAL` section

3. **Deduplicate**
   - URLs by `url` field
   - Images by `src` field
   - Videos by `src` field
   - Media by `src` field

4. **Categorize**
   - Separates YouTube videos (youtube.com, youtu.be)
   - Groups other videos separately
   - Identifies media types

5. **Format & Append**
   - Builds markdown with expandable `<details>` sections
   - Appends to `assistantMessage.content` before sending to user
   - Includes counts in summary headers

### Code Location

**File:** `src/endpoints/chat.js`  
**Function:** Anonymous post-processing block (lines ~720-870)  
**Trigger:** Before sending final response to user (after LLM generation)

### Logging

```javascript
console.log(`⚠️ LLM didn't include URLs - injected ${uniqueUrls.length} source links into content`);
console.log(`✅ Extracted content: ${uniqueUrls.length} sources, ${uniqueImages.length} images, ${youtubeVideos.length} YouTube videos, ${otherVideos.length} other videos, ${uniqueMedia.length} media items`);
```

## Benefits

1. **Context Cleanliness:** Extracted content **never pollutes LLM conversation context**
2. **UI Flexibility:** Frontend controls how to display extracted content
3. **Reliability:** Users always get source attribution, regardless of LLM behavior
4. **Transparency:** Complete visibility into all discovered content
5. **Discoverability:** Images and videos users might not have known to ask for
6. **Follow-up Actions:** Easy access to YouTube URLs for transcription
7. **No Filtering Needed:** Since content is separate, no need to strip it from messages

## Testing

### Backend Testing (Check CloudWatch Logs)

Test queries:
- Stock prices: "What is Tesla's stock price?"
- News queries: "Recent news about AI regulation"
- Visual content: "Show me images of the latest iPhone"
- Video content: "Find videos about SpaceX launches"

Expected logs:
```
✅ Extracted content: 5 sources, 12 images, 3 YouTube videos, 2 other videos, 0 media items
```

### Frontend Integration

The UI should:
1. Display `message.content` as the main response
2. Check if `message.extractedContent` exists
3. If yes, render expandable sections for each category
4. When sending messages back to backend, simply send `message.content` (extractedContent is never part of LLM context)

Example UI handling:
```javascript
if (message.extractedContent) {
  if (message.extractedContent.sources) {
    renderExpandableSection('📋 Complete Source List', message.extractedContent.sources);
  }
  if (message.extractedContent.images) {
    renderExpandableSection('🖼️ Extracted Images', message.extractedContent.images);
  }
  if (message.extractedContent.youtubeVideos) {
    renderExpandableSection('📺 YouTube Videos', message.extractedContent.youtubeVideos);
  }
  // ... etc
}
```

## Edge Cases Handled

- **Empty content:** Sections only appear if content exists
- **No markdown links:** Automatically inject Sources section
- **Already has links:** Don't duplicate, just add complete list
- **Multiple tool calls:** Aggregate content from all calls
- **Duplicate URLs:** Deduplicated automatically
- **YouTube detection:** Properly separates from other videos
- **JSON parse errors:** Falls back to markdown extraction

## Future Enhancements

1. **Thumbnail Previews:** Add image thumbnails in summaries
2. **Video Previews:** Embed video players in expandable sections
3. **Smart Filtering:** Only show most relevant images/videos
4. **User Preferences:** Allow users to toggle sections on/off
5. **Download Links:** Provide bulk download for all media
6. **Metadata Extraction:** Include file sizes, durations, dimensions

## Related Documentation

- `LINK_CITATION_STRENGTHENING.md` - Previous attempts at prompt engineering
- `src/tools.js` - URL section injection in compressed results
- `src/config/prompts.js` - System prompt with link requirements

---

**Status:** ✅ Production Ready  
**Deployment Time:** ~10 seconds (fast deploy)  
**Package Size:** 112.1 KB (code only, layer cached)
