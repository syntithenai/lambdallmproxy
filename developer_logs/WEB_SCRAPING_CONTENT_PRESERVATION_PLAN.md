# Web Scraping Content Preservation & Image Extraction Plan

## Executive Summary

This plan enhances the existing web scraping and content extraction system to improve image selection, add placement metadata, and optimize content delivery to both the UI and LLM.

**Goal**: Improve the quality of extracted images and content while leveraging the existing dual-path architecture that already separates UI-bound media from LLM context.

**Scope**: These enhancements apply to ALL content extraction methods:
- **Web search scraped pages** (search results with multiple URLs)
- **Direct scrape_url pages** (single URL scraping)
- **YouTube transcriptions** (video captions and transcripts)
- **Video/audio captions** (any media with text transcripts)

---

## Architecture Understanding

### Current Dual-Path Architecture (Already Implemented ✅)

**Lambda Response Flow:**
```
UI → Lambda (chat.js) → Tool Execution → Extract Media → LLM (compressed content only)
                                                    ↓
UI ← Lambda Response (extractedContent + LLM response) ← LLM Response
```

**Key Files:**
- `src/endpoints/chat.js` lines 2380-2447: Builds `extractedContent` object
- `src/tools.js` lines 1200-1350: Tool returns with `page_content` preserved
- `src/html-parser.js`: Image/link extraction and filtering
- `src/utils/content-optimizer.js`: Model-aware content limits

**Critical Insight:** The Lambda already implements dual-path delivery:
1. **Path 1 (To LLM):** Compressed content via `assistantMessage.content` with truncated text, limited images
2. **Path 2 (To UI):** Full media extraction via `extractedContent` object (images, videos, links, media)

The `extractedContent` object is sent to the UI via SSE but is **NOT included in the LLM request**.

---

## Existing Implementations (Already Working ✅)

### 1. Link Filtering (`src/html-parser.js` lines 127-200)

Comprehensive `shouldFilterLink()` function filters:
- **Navigation:** /page/, /edit/, /user/, /admin/, /login/, /privacy, /terms, /about, /contact
- **Tracking:** ?utm_, /share/, ?share=, /print/, /pdf/
- **Ad Domains:** doubleclick.net, googlesyndication.com, advertising.com, outbrain.com, taboola.com
- **Social Sharing:** facebook.com/sharer, twitter.com/intent, linkedin.com/share
- **Navigation Text:** "Home", "About", "Login", "Subscribe", "Next", "Previous", "Top", "Menu"
- **Position-based:** Links inside `<header>`, `<footer>`, `<nav>`, `<aside>` elements
- **Ad Classes/IDs:** Elements with class/id containing "ad", "sponsored", "promo", "banner"
- **Empty/Long Text:** Empty links or text >150 chars
- **Single Chars:** Single/double character non-numeric links

### 2. Image Filtering (`src/html-parser.js` lines 306-355)

Comprehensive image filtering and scoring:
- **Filters Out:** Data URIs, tracking pixels, icons, logos, avatars, badges, 1x1 images
- **Size Filtering:** Small images (<100x100px) get relevance penalty
- **Quality Scoring:** Large images (>300x300px) get relevance bonus
- **Relevance Calculation:** Based on alt text, title, caption, and surrounding context
- **Sorting:** Images sorted by relevance score, returns top N

### 3. Model-Aware Content Optimization (`src/utils/content-optimizer.js`)

Dynamic content limits based on selected model:
- `getOptimalSearchResultCount()`: Returns 1-10 results based on context window and optimization preference
- `getOptimalContentLength()`: Returns max characters based on model capacity and content type
- **Factors:** Model context window (128K vs 1M+), optimization preference (cheap/balanced/powerful), content type

**Already integrated** in `tools.js` lines 587-606:
```javascript
const optimalResultCount = getOptimalSearchResultCount({
  model: context.selectedModel,
  inputTokens: context.inputTokens,
  optimization: context.optimization
});
```

### 4. Intelligent Content Extraction (`src/tools.js` lines 233-300)

`extractKeyContent()` function prioritizes:
- Query-relevant content (contains search terms)
- Numerical data (percentages, measurements, statistics)
- Date patterns (2023, 2024, recent, latest, current)
- Headers and titles
- Contextual sentences (opening/closing)
- Hard limit: 300 chars max per extraction

**Already applied** to all web search results (lines 644, 677, 743).

### 5. Dual-Path Response (`src/endpoints/chat.js` lines 2380-2447)

The `extractedContent` object sent to UI includes:
```javascript
{
  prioritizedLinks,      // Top prioritized search + scraped links
  prioritizedImages,     // Top 3 images
  youtubeVideos,         // YouTube videos (separated)
  otherVideos,           // Other videos
  media,                 // Other media types
  allLinks,              // All links (expandable section)
  allImages,             // All images (expandable section)
  sources                // Legacy field for compatibility
}
```

This is sent to the UI but **NOT to the LLM**.

---

## Proposed Enhancements

### Phase 1: Document Existing System ✅ COMPLETE

All existing implementations have been documented above. The system already has:
- ✅ Dual-path architecture (extractedContent for UI, compressed content for LLM)
- ✅ Comprehensive link filtering (ads, navigation, tracking, social sharing)
- ✅ Comprehensive image filtering (tracking pixels, icons, logos, size-based scoring)
- ✅ Model-aware content optimization (dynamic limits based on context window)
- ✅ Intelligent content extraction (query-relevant prioritization)

### Phase 2: Enhanced Image Selection with Placement Metadata

**Goal:** Improve image quality and add placement context for better LLM understanding.

**Current State:**
- Images already filtered by size and relevance (html-parser.js)
- Top 3 images selected via `prioritizedImages = uniqueImages.slice(0, 3)` (chat.js line 2415)
- No placement metadata (hero, above-fold, sidebar, etc.)

**Enhancement:**

Add placement detection to Puppeteer Lambda and HTML parser:

```javascript
// In puppeteer-handler.js or html-parser.js
function classifyImagePlacement(imgElement, viewportHeight) {
  const rect = imgElement.getBoundingClientRect();
  const parentClasses = imgElement.closest('[class]')?.className || '';
  
  // Hero image detection
  if (rect.top < 100 && rect.width > 600 && rect.height > 300) {
    return { placement: 'hero', score: 1.0 };
  }
  
  // Above-fold content
  if (rect.top < viewportHeight) {
    return { placement: 'above-fold', score: 0.9 };
  }
  
  // Sidebar detection
  if (parentClasses.match(/sidebar|aside|widget/i)) {
    return { placement: 'sidebar', score: 0.3 };
  }
  
  // Main content
  if (parentClasses.match(/content|article|main|post/i)) {
    return { placement: 'content', score: 0.8 };
  }
  
  return { placement: 'below-fold', score: 0.5 };
}
```

**Updated Image Selection (chat.js):**

```javascript
// Replace simple slice with smart selection
const prioritizedImages = uniqueImages
  .sort((a, b) => {
    // Prioritize by placement and relevance
    const scoreA = (a.placementScore || 0.5) * (a.relevance || 0.5);
    const scoreB = (b.placementScore || 0.5) * (b.relevance || 0.5);
    return scoreB - scoreA;
  })
  .slice(0, 3);
```

**Applies to:**
- ✅ Web search results (each scraped page)
- ✅ Direct scrape_url pages
- ❌ Transcriptions (no images, just video thumbnail)

### Phase 3: Improve Content Truncation for LLM

**Goal:** Replace simple `substring()` truncation with intelligent `extractKeyContent()`.

**Current State:**
- `tools.js` line 1295: `content: r.content ? r.content.substring(0, 300) : r.content`
- Simple character truncation loses important information
- `extractKeyContent()` already exists and is smart (lines 233-300)

**Enhancement:**

Replace all simple truncation with intelligent extraction:

```javascript
// Current (tools.js line 1295):
content: r.content ? r.content.substring(0, 300) : r.content

// Enhanced:
content: r.content ? extractKeyContent(r.content, r.query) : r.content
```

**Applies to:**
- ✅ Web search results (truncated results)
- ✅ Direct scrape_url pages (if truncated)
- ❌ Transcriptions (different handling needed - see Phase 4)

**Impact:** Better preserve query-relevant content, numbers, dates, and key context even when truncating.

### Phase 4: Transcript Dual-Path Delivery

**Goal:** Apply dual-path architecture to transcriptions (full to UI, summary to LLM).

**Current State:**
- Transcriptions extracted and included in tool results
- Likely sent in full to LLM (needs verification)
- No smart summarization for transcripts

**Enhancement:**

**Path 1 (To UI via extractedContent):**
```javascript
// In chat.js, extract from get_youtube_transcript results
if (toolMsg.name === 'get_youtube_transcript') {
  const parsed = JSON.parse(toolMsg.content);
  
  // Add to extractedContent
  extractedContent.transcripts = extractedContent.transcripts || [];
  extractedContent.transcripts.push({
    videoId: parsed.videoId,
    videoUrl: parsed.videoUrl,
    title: parsed.title,
    fullTranscript: parsed.transcript,  // Full text
    segments: parsed.segments,          // With timestamps
    duration: parsed.duration,
    thumbnail: parsed.thumbnail,
    chapters: parsed.chapters
  });
}
```

**Path 2 (To LLM - Compressed):**
```javascript
// Create transcript summary for LLM
function summarizeTranscript(transcript, maxTokens) {
  const model = context.selectedModel;
  const contextWindow = model?.context_window || 32000;
  
  if (contextWindow > 100000) {
    // Large context: Include more detail
    return extractKeyTimestamps(transcript, maxTokens * 2);
  } else if (contextWindow > 16000) {
    // Medium context: Key segments
    return extractKeyTimestamps(transcript, maxTokens);
  } else {
    // Small context: Summary only
    return extractTopQuotes(transcript, maxTokens / 2);
  }
}
```

**Applies to:**
- ✅ YouTube transcriptions
- ✅ Other media transcriptions (audio/video captions)
    {
      start: number,        // Start time (seconds)
      end: number,          // End time (seconds)
      text: string,         // Transcript segment
      speaker: string       // Speaker label (if multi-speaker)
    }
  ],
  language: string,         // Transcript language
  isAutoGenerated: boolean  // Auto vs manual captions
};
```

##### Other Media (Audio/Video)
```javascript
// Extract HTML5 audio/video elements
const otherMedia = [
  ...document.querySelectorAll('video'),
  ...document.querySelectorAll('audio'),
  ...document.querySelectorAll('video source'),
  ...document.querySelectorAll('audio source'),
  ...document.querySelectorAll('a[href$=".mp4"]'),
  ...document.querySelectorAll('a[href$=".mp3"]'),
  ...document.querySelectorAll('a[href$=".webm"]'),
  ...document.querySelectorAll('a[href$=".ogg"]'),
  // Add other video/audio formats
];

// For each media item, capture:
{
  url: string,              // Direct media URL
  type: 'audio' | 'video',  // Media type
  format: string,           // File extension/MIME type
  title: string,            // Link text or title attribute
  poster: string,           // Poster image (for video)
  position: {
    index: number,
    nearestHeading: string,
    contextText: string
  }
}
```

#### Step 2: Filter Out Junk (Images and Links)

**Applies to:**
- ✅ Web search results
- ✅ Direct scrape_url pages
- ⚠️ NOT applicable to transcriptions (no images/links in pure transcript)

```javascript
function filterJunk(images, links) {
  // Use existing link filter logic for links
  const filteredLinks = applyExistingLinkFilter(links);
  
  // Apply similar filtering to images
  const filteredImages = images.filter(img => {
    // Remove ads
    if (img.metadata.isAd) return false;
    if (img.src.includes('doubleclick') || img.src.includes('googlesyndication')) return false;
    if (img.src.includes('/ads/') || img.src.includes('/ad/')) return false;
    
    // Remove header/nav images
    if (img.metadata.isHeader) return false;
    const parent = img.element?.closest('header, nav, .header, .navigation');
    if (parent) return false;
    
    // Remove tiny icons
    if (img.width < 50 || img.height < 50) return false;
    
    // Remove tracking pixels
    if (img.width === 1 && img.height === 1) return false;
    
    // Remove social media icons
    if (img.src.includes('facebook') || img.src.includes('twitter') || 
        img.src.includes('instagram') || img.src.includes('linkedin')) {
      if (img.width < 100 || img.height < 100) return false;
    }
    
    // Remove common junk patterns
    if (img.src.includes('spacer.gif')) return false;
    if (img.src.includes('blank.gif')) return false;
    if (img.alt === '' && img.width < 100) return false;
    
    return true; // Keep if passed all filters
  });
  
  return { filteredImages, filteredLinks };
}
```

#### Step 3: Score Images by Relevance

**Applies to:**
- ✅ Web search results
- ✅ Direct scrape_url pages
- ⚠️ NOT applicable to transcriptions (no images in pure transcript)

```javascript
function scoreImage(image) {
  let score = 100;
  
  // Size scoring (larger = better, to a point)
  if (image.width < 100 || image.height < 100) score -= 50; // Too small
  if (image.width > 1200) score += 20; // High resolution
  if (image.aspectRatio < 0.5 || image.aspectRatio > 3) score -= 10; // Weird ratio
  
  // Position scoring (earlier = better)
  score += (1000 - image.position.index) / 10; // First images score higher
  
  // Content scoring
  if (image.alt && image.alt.length > 10) score += 15; // Good alt text
  if (image.position.contextText.length > 50) score += 10; // Good context
  if (image.metadata.isContent) score += 30; // Main content
  
  // Penalty scoring
  if (image.metadata.isIcon) score -= 40; // Icons not useful
  if (image.metadata.isAd) score -= 60; // Ads not useful
  if (image.metadata.isDecorative) score -= 20; // Decorative less useful
  if (image.src.includes('placeholder')) score -= 50; // Placeholders useless
  if (image.src.includes('icon') || image.src.includes('logo')) score -= 30;
  
  // URL scoring
  if (image.src.includes('thumbnail')) score -= 10; // Prefer full size
  if (image.src.includes('_large') || image.src.includes('_full')) score += 15;
  
  return Math.max(0, score);
}
```

#### Step 4: Select Top 3 Images for LLM (with Placement Metadata)

### Phase 5: UI Transparency & Debug Display

**Goal:** Provide full transparency of tool execution with expandable JSON views of raw data and extracted metadata.

**Current State:**
- UI receives `extractedContent` object with processed media
- No visibility into raw tool responses
- No way to inspect extraction logic decisions
- Limited debugging capability for users

**Enhancement: Tool Use Transparency Blocks**

Add expandable JSON tree views inside each tool use block in the chat UI:

#### 5.1: Tool Response Structure Display

For every tool call, display collapsible sections:

```
┌─────────────────────────────────────────────────────────┐
│ 🔧 Tool: search_web                                      │
├─────────────────────────────────────────────────────────┤
│ Status: ✅ Complete (2.3s)                               │
│ Query: "web scraping best practices"                     │
│                                                           │
│ ▼ Extracted Content (For You)                           │
│   ├─ 5 search results                                    │
│   ├─ 12 images (3 prioritized)                          │
│   ├─ 2 YouTube videos                                    │
│   └─ 47 links (8 prioritized)                           │
│                                                           │
│ ▼ LLM Context (Sent to AI)                              │
│   ├─ Top 3 images with placement                        │
│   ├─ Compressed content (1,247 tokens)                  │
│   └─ 8 prioritized links                                │
│                                                           │
│ ▶ Raw Tool Response (JSON)                              │
│ ▶ Extracted Metadata (JSON)                             │
│ ▶ Filtering Decisions (JSON)                            │
└─────────────────────────────────────────────────────────┘
```

#### 5.2: Expandable JSON Trees

**Raw Tool Response:**
```json
{
  "searchService": "tavily",
  "queries": ["web scraping best practices"],
  "totalResults": 5,
  "results": [
    {
      "query": "web scraping best practices",
      "title": "...",
      "url": "...",
      "content": "... (full content)",
      "page_content": {
        "images": [ /* all extracted images */ ],
        "links": [ /* all extracted links */ ],
        "videos": [ /* all extracted videos */ ]
      }
    }
  ]
}
```

**Extracted Metadata:**
```json
{
  "extraction_summary": {
    "total_images": 37,
    "filtered_images": 12,
    "junk_removed": 25,
    "junk_reasons": {
      "tracking_pixels": 8,
      "icons_logos": 12,
      "small_images": 5
    },
    "top_3_images": [
      {
        "src": "...",
        "relevance": 0.95,
        "placement": "hero",
        "placementScore": 1.0,
        "selectedReason": "High relevance + hero placement"
      }
    ]
  },
  "link_filtering": {
    "total_links": 89,
    "filtered_links": 47,
    "removed_links": 42,
    "removed_reasons": {
      "navigation": 15,
      "ads": 8,
      "social_sharing": 7,
      "tracking": 12
    }
  },
  "content_optimization": {
    "model": "gpt-4-turbo",
    "context_window": 128000,
    "optimization": "balanced",
    "original_tokens": 5420,
    "compressed_tokens": 1247,
    "compression_ratio": "77% reduction",
    "techniques_used": [
      "extractKeyContent",
      "top_3_image_selection",
      "link_prioritization"
    ]
  }
}
```

**Filtering Decisions:**
```json
{
  "images_removed": [
    {
      "src": "https://example.com/tracking-pixel.gif",
      "reason": "tracking_pixel",
      "filter": "src.includes('tracking')"
    },
    {
      "src": "https://example.com/icon-small.png",
      "reason": "too_small",
      "dimensions": "16x16",
      "filter": "width < 100 && height < 100"
    }
  ],
  "links_removed": [
    {
      "href": "/privacy-policy",
      "text": "Privacy Policy",
      "reason": "navigation",
      "filter": "href.includes('/privacy')"
    },
    {
      "href": "https://twitter.com/intent/tweet",
      "text": "Share",
      "reason": "social_sharing",
      "filter": "social sharing domain"
    }
  ],
  "content_decisions": [
    {
      "section": "result_1_content",
      "original_length": 12453,
      "compressed_length": 300,
      "method": "extractKeyContent",
      "preserved": [
        "query_relevant_sentences: 2",
        "numerical_data: 2",
        "dates: 1"
      ]
    }
  ]
}
```

#### 5.3: Transcript Tool Transparency

For `get_youtube_transcript`:

```
┌─────────────────────────────────────────────────────────┐
│ 🎬 Tool: get_youtube_transcript                          │
├─────────────────────────────────────────────────────────┤
│ Status: ✅ Complete (3.8s)                               │
│ Video: "Introduction to Web Scraping" (20:45)           │
│                                                           │
│ ▼ Full Transcript (For You)                             │
│   ├─ 1,247 segments with timestamps                     │
│   ├─ Duration: 20:45                                     │
│   ├─ Language: en (auto-generated)                      │
│   └─ Word count: 3,421                                   │
│                                                           │
│ ▼ LLM Context (Sent to AI)                              │
│   ├─ Summary (247 tokens)                               │
│   ├─ 5 key quotes with timestamps                       │
│   └─ 10 notable moments                                  │
│                                                           │
│ ▶ Raw Transcript Data (JSON)                            │
│ ▶ Summarization Decisions (JSON)                        │
│ ▶ Video Metadata (JSON)                                 │
└─────────────────────────────────────────────────────────┘
```

#### 5.4: Implementation Details

**UI Components Needed:**

1. **CollapsibleSection Component:**
   - Expand/collapse with animations
   - Default states (extracted: expanded, raw: collapsed)
   - Persistent state (remember user preferences)

2. **JsonTreeViewer Component:**
   - Syntax highlighting
   - Collapsible nodes
   - Copy to clipboard
   - Search within JSON
   - Line numbers
   - Pretty formatting

3. **ToolUseBlock Component:**
   - Status indicator (loading/success/error)
   - Execution time
   - Summary statistics
   - Multiple expandable sections
   - Download raw JSON button

**UI Layout:**

```typescript
interface ToolUseBlockProps {
  toolName: string;
  status: 'loading' | 'success' | 'error';
  executionTime: number;
  
  // User-facing processed data
  extractedContent: {
    summary: string;
    counts: Record<string, number>;
    displayData: any;
  };
  
  // LLM-bound data
  llmContext: {
    summary: string;
    tokenCount: number;
    data: any;
  };
  
  // Debug/transparency data
  rawResponse: any;
  metadata: {
    extraction: any;
    filtering: any;
    optimization: any;
  };
  filteringDecisions: {
    removed: any[];
    reasons: Record<string, number>;
  };
}
```

#### 5.5: Media Display (Enhanced from Phase 5 Original)

1. **Image Gallery Display:**
   - Display `prioritizedImages` inline with response
   - Display `allImages` in expandable gallery section
   - Add lightbox/modal for full-size viewing
   - Show placement metadata badges (🏆 hero, ⬆️ above-fold, 📄 content)
   - Show relevance scores in debug mode
   - **NEW:** Click image to see extraction metadata (why selected, filtering applied)

2. **Video Embedding:**
   - Display `youtubeVideos` with embedded players
   - Display `otherVideos` with appropriate players
   - Add lazy loading for performance
   - **NEW:** Show video metadata in expandable section below player

3. **Transcript Viewer:**
   - Display full transcript from `extractedContent.transcripts`
   - Add timestamp navigation (click timestamp to jump)
   - Add chapter navigation if available
   - Add search within transcript
   - Link to source video
   - **NEW:** Highlight segments sent to LLM vs. full transcript
   - **NEW:** Show summarization decisions

4. **Link Organization:**
   - Display `prioritizedLinks` inline
   - Display `allLinks` in expandable "All Links" section
   - Group by domain or type
   - Show search result links separately from scraped links
   - **NEW:** Show removed links in separate "Filtered Out" section
   - **NEW:** Display filter reasons (navigation, ads, tracking, etc.)

#### 5.6: User Benefits

**For Regular Users:**
- See what data was extracted from sources
- Understand what the AI actually received
- Access full transcripts and media separately from AI response
- Trust through transparency

**For Power Users:**
- Debug tool extraction issues
- Understand filtering decisions
- Validate data quality
- Export raw data for external use

**For Developers:**
- Inspect tool responses
- Debug extraction logic
- Validate filtering rules
- Monitor optimization effectiveness

**Applies to:**
- ✅ All tool types (search_web, scrape_url, get_youtube_transcript, etc.)
- ✅ All content types (web pages, transcriptions, media)

### Phase 6: Testing and Validation

**Goal:** Validate enhancements work correctly across all content types and transparency features.

**Test Cases:**

1. **Web Search Results:**
   - Multiple pages with images/videos/links
   - Verify top 3 images selected correctly with placement
   - Verify all media in extractedContent
   - Verify `extractKeyContent()` used instead of substring
   - Test with different model sizes (small/medium/large context)
   - **NEW:** Verify JSON trees display raw responses correctly
   - **NEW:** Verify filtering decisions are accurate and visible

2. **Direct scrape_url:**
   - Single page with complex media
   - Verify image placement detection works
   - Verify all media types extracted
   - Verify smart content truncation
   - **NEW:** Verify extraction metadata shows all decisions
   - **NEW:** Verify removed items visible in "Filtered Out" section

3. **YouTube Transcriptions:**
   - Verify full transcript in extractedContent
   - Verify summary sent to LLM
   - Verify source video link preserved
   - Verify timestamps preserved
   - Test with different video lengths
   - **NEW:** Verify transcript viewer highlights LLM vs. full content
   - **NEW:** Verify summarization decisions displayed

4. **Model-Aware Optimization:**
   - Test with cheap optimization (small limits)
   - Test with balanced optimization (medium limits)
   - Test with powerful optimization (large limits)
   - Verify content-optimizer.js respected
   - **NEW:** Verify optimization metadata shows model info and decisions

5. **UI Transparency:**
   - **NEW:** Verify all tool use blocks have expandable sections
   - **NEW:** Verify JSON trees render correctly (syntax highlighting, collapsible)
   - **NEW:** Verify "Extracted Content" vs "LLM Context" distinction is clear
   - **NEW:** Verify raw response, metadata, and filtering decisions accessible
   - **NEW:** Verify copy-to-clipboard and download JSON work
   - **NEW:** Verify search within JSON works
   - **NEW:** Test with various data sizes (small/large responses)

6. **UI Media Display:**
   - Verify image gallery renders correctly
   - Verify video embeds work
   - Verify transcript viewer functional
   - Verify expandable sections work
   - **NEW:** Verify placement badges on images (hero, above-fold, etc.)
   - **NEW:** Verify click-to-see-metadata on images works
   - **NEW:** Verify removed links section displays with reasons
   - **NEW:** Verify transcript highlighting (LLM segments vs full)

7. **User Experience:**
   - **NEW:** Test with non-technical users (is transparency helpful or overwhelming?)
   - **NEW:** Test default expand/collapse states (good defaults?)
   - **NEW:** Test persistent state (remembered preferences?)
   - **NEW:** Test performance with large JSON trees (100+ items)
   - **NEW:** Verify mobile responsiveness of expandable sections

---

## Implementation Summary

**Total Phases: 6**

1. ✅ **Document Existing System** - Complete (see above)
2. 🔨 **Enhanced Image Selection** - Add placement metadata to Puppeteer/HTML parser
3. 🔨 **Improve Content Truncation** - Replace substring with extractKeyContent
4. 🔨 **Transcript Dual-Path** - Add transcript handling to extractedContent
5. 🔨 **UI Transparency & Display** - Comprehensive transparency with JSON trees + improved media display
6. 🧪 **Testing & Validation** - Validate all enhancements including transparency features

**Key Architectural Points:**
- ✅ Dual-path architecture already exists (extractedContent for UI, compressed for LLM)
- ✅ Link filtering already comprehensive
- ✅ Image filtering already comprehensive  
- ✅ Model-aware optimization already implemented
- ✅ Intelligent content extraction already implemented
- 🔨 Need to add placement metadata to images
- 🔨 Need to apply extractKeyContent to truncated content
- 🔨 Need to extend dual-path to transcripts
- 🔨 Need to add comprehensive UI transparency features
- 🔨 Need to implement JSON tree viewers for raw data
- 🔨 Need to expose filtering decisions and metadata

**Estimated Effort:**
- Phase 2: 4-6 hours (Puppeteer changes + image selection logic)
- Phase 3: 1-2 hours (simple replacement)
- Phase 4: 3-4 hours (transcript extraction + summarization)
- Phase 5: 12-20 hours (UI transparency components + media display enhancements)
  - Tool use block structure: 2-3 hours
  - JSON tree viewer component: 4-6 hours
  - Metadata collection and formatting: 3-4 hours
  - Media display enhancements: 3-5 hours
  - Integration and polish: 2-4 hours
- Phase 6: 6-10 hours (comprehensive testing including transparency features)

**Total: 30-43 hours**

**Breakdown by Priority:**

**Critical (Must Have):**
- Phase 2: Image placement metadata (6 hours)
- Phase 3: Better content truncation (2 hours)
- Phase 4: Transcript dual-path (4 hours)
- **Subtotal: 12 hours**

**High Priority (Transparency Core):**
- Phase 5.1-5.3: Tool use blocks with JSON trees (10 hours)
- Phase 5.6: Basic user benefits (included above)
- **Subtotal: 10 hours**

**Medium Priority (Enhanced Features):**
- Phase 5.4-5.5: Advanced media display (8 hours)
- Phase 6: Full testing suite (8 hours)
- **Subtotal: 16 hours**

**Total Critical Path: 22 hours**  
**Total with All Features: 38 hours**

---

## Removed Sections

The following sections from the original plan are no longer applicable:

- ❌ Comprehensive raw extraction (already done by html-parser.js)
- ❌ Intelligent content summarization tiers (already done by content-optimizer.js)
- ❌ Junk filtering algorithms (already done by html-parser.js)
- ❌ Dual-path architecture design (already implemented in chat.js)
- ❌ Model-aware content limits (already done by content-optimizer.js)
- ❌ Link filtering logic (already done by html-parser.js)
- ❌ Image size/relevance scoring (already done by html-parser.js)

**Status: Plan Updated to Reflect Actual System Architecture**
content = content.substring(0, 5000); // Cuts mid-sentence

// GOOD: Intelligent truncation
function intelligentTruncate(content, maxTokens) {
  const sentences = splitIntoSentences(content);
  const important = sentences.filter(s => 
    containsNumbers(s) ||
    containsNamedEntities(s) ||
    isHeading(s) ||
    hasStrongWords(s)
  );
  
  let result = [];
  let tokenCount = 0;
  
  // Always include important sentences
  for (const sentence of important) {
    const tokens = estimateTokens(sentence);
    if (tokenCount + tokens < maxTokens * 0.7) { // Reserve 30% for summaries
      result.push(sentence);
      tokenCount += tokens;
    }
  }
  
  // Fill remaining with summaries
  const remaining = sentences.filter(s => !important.includes(s));
  const summary = summarizeSentences(remaining, maxTokens - tokenCount);
  
  return result.join(' ') + '\n\n' + summary;
}
```

### Strategy 3: Structured Data Preservation

**Preserve High-Value Structures:**

```javascript
// Tables: Keep structure, summarize data
{
  type: 'table',
  headers: ['Product', 'Price', 'Rating'],
  rowCount: 50,
  summary: 'Prices range from $10-$500, avg rating 4.2/5',
  sampleRows: [ /* First 3 rows */ ],
  note: 'Full table available on request'
}

// Lists: Condense but keep structure
{
  type: 'list',
  itemCount: 25,
  preview: [ /* First 5 items */ ],
  categories: ['Features', 'Benefits', 'Specs'],
  note: 'Complete list available'
}

// Code: Preserve exactly
{
  type: 'code',
  language: 'javascript',
  lines: 45,
  content: '...', // Full code preserved
  note: 'Code preserved verbatim'
}
```

---

## LLM Instruction Enhancements

### New System Prompt Additions

**Add to scrape_url and web_search tool descriptions:**

```markdown
**Image Handling Instructions (Web Pages Only):**

## Code Changes Required

### Phase 2: Enhanced Image Selection with Placement Metadata

**File:** `src/puppeteer-handler.js` or `src/html-parser.js`

*Note: See detailed implementation in subsequent sections*

### Phase 5: UI Transparency Implementation

**New Files to Create:**

1. **`ui/components/ToolUseBlock.tsx`** - Main tool transparency component
2. **`ui/components/JsonTreeViewer.tsx`** - Interactive JSON tree viewer
3. **`ui/components/CollapsibleSection.tsx`** - Reusable collapsible section
4. **`ui/hooks/useToolTransparency.ts`** - Hook for managing transparency data
5. **`ui/utils/formatToolMetadata.ts`** - Utilities for formatting metadata

**Backend Changes:**

**File:** `src/endpoints/chat.js` (modify tool result processing)

```javascript
// After tool execution, enhance with metadata
function enhanceToolResultWithMetadata(toolName, toolResult, context) {
  const metadata = {
    tool: toolName,
    execution_time: Date.now() - context.startTime,
    model: context.selectedModel?.name,
    optimization: context.optimization,
    
    // Parse tool result
    raw_response: toolResult,
    
    // Add extraction summary
    extraction_summary: buildExtractionSummary(toolResult),
    
    // Add filtering decisions
    filtering_decisions: buildFilteringDecisions(toolResult),
    
    // Add optimization info
    optimization_info: buildOptimizationInfo(toolResult, context)
  };
  
  return {
    original: toolResult,
    metadata: metadata,
    transparency: true
  };
}

// Build extraction summary
function buildExtractionSummary(toolResult) {
  const parsed = JSON.parse(toolResult);
  
  if (parsed.results) {
    // Web search or scrape
    const allImages = [];
    const allLinks = [];
    const allVideos = [];
    
    parsed.results.forEach(r => {
      if (r.page_content?.images) allImages.push(...r.page_content.images);
      if (r.page_content?.links) allLinks.push(...r.page_content.links);
      if (r.page_content?.videos) allVideos.push(...r.page_content.videos);
    });
    
    return {
      total_images: allImages.length,
      total_links: allLinks.length,
      total_videos: allVideos.length,
      results_count: parsed.results.length,
      content_type: 'web_search'
    };
  }
  
  if (parsed.transcript) {
    // Transcript
    return {
      total_segments: parsed.segments?.length || 0,
      duration: parsed.duration,
      word_count: parsed.transcript.split(/\s+/).length,
      content_type: 'transcript'
    };
  }
  
  return { content_type: 'unknown' };
}

// Build filtering decisions
function buildFilteringDecisions(toolResult) {
  const parsed = JSON.parse(toolResult);
  
  // Track what was filtered out (requires modifying extraction code)
  return {
    images_removed: parsed._filtered?.images || [],
    links_removed: parsed._filtered?.links || [],
    removal_reasons: parsed._filtered?.reasons || {}
  };
}

// Build optimization info
function buildOptimizationInfo(toolResult, context) {
  const parsed = JSON.parse(toolResult);
  
  return {
    model: {
      name: context.selectedModel?.name,
      context_window: context.selectedModel?.context_window,
      provider: context.selectedModel?.providerType
    },
    optimization_preference: context.optimization,
    token_estimates: {
      raw_content: parsed._tokenEstimates?.raw || 0,
      compressed_content: parsed._tokenEstimates?.compressed || 0,
      compression_ratio: parsed._tokenEstimates?.ratio || 0
    },
    techniques_applied: parsed._techniques || []
  };
}
```

**File:** `src/html-parser.js` (track filtered items)

```javascript
// Modify extractImages to track removed items
extractImages(maxImages) {
  const images = [];
  const removed = []; // NEW: Track removed images
  
  // ... existing extraction ...
  
  for (const imgTag of imgTags) {
    const src = /* extract src */;
    
    // Track filtering decisions
    if (!src || src.startsWith('data:')) {
      removed.push({
        src: src || '[empty]',
        reason: 'data_uri_or_empty',
        filter: 'src validation'
      });
      continue;
    }
    
    if (src.includes('pixel') || src.includes('track')) {
      removed.push({
        src: src,
        reason: 'tracking_pixel',
        filter: "src.includes('pixel') || src.includes('track')"
      });
      continue;
    }
    
    // ... continue with other filters ...
    
    images.push(/* image object */);
  }
  
  // Return both kept and removed
  return {
    images: images.sort((a, b) => b.relevance - a.relevance).slice(0, maxImages),
    removed: removed,
    stats: {
      total_found: images.length + removed.length,
      kept: images.length,
      removed: removed.length
    }
  };
}

// Similar for extractLinks
extractLinks() {
  const links = [];
  const removed = [];
  
  // ... existing extraction with tracking ...
  
  return { links, removed, stats };
}
```

---

### Phase 2: Enhanced Image Selection with Placement Metadata (Detailed)

**File:** `src/puppeteer-handler.js` or `src/html-parser.js`

```javascript
// Add placement detection function
function classifyImagePlacement(imgElement, viewportHeight) {
  const rect = imgElement.getBoundingClientRect();
  const parentClasses = imgElement.closest('[class]')?.className || '';
  
  // Hero image detection
  if (rect.top < 100 && rect.width > 600 && rect.height > 300) {
    return { placement: 'hero', score: 1.0 };
  }
  
  // Above-fold content
  if (rect.top < viewportHeight) {
    return { placement: 'above-fold', score: 0.9 };
  }
  
  // Sidebar detection
  if (parentClasses.match(/sidebar|aside|widget/i)) {
    return { placement: 'sidebar', score: 0.3 };
  }
  
  // Main content
  if (parentClasses.match(/content|article|main|post/i)) {
    return { placement: 'content', score: 0.8 };
  }
  
  return { placement: 'below-fold', score: 0.5 };
}

// Modify image extraction to include placement
function extractImages(document) {
  // ... existing extraction ...
  
  images.forEach(img => {
    const placementInfo = classifyImagePlacement(img.element, window.innerHeight);
    img.placement = placementInfo.placement;
    img.placementScore = placementInfo.score;
  });
  
  return images;
}
```

**File:** `src/endpoints/chat.js` lines 2415

```javascript
// Replace simple slice with smart selection
const prioritizedImages = uniqueImages
  .sort((a, b) => {
    // Combine placement score and relevance score
    const scoreA = (a.placementScore || 0.5) * (a.relevance || 0.5);
    const scoreB = (b.placementScore || 0.5) * (b.relevance || 0.5);
    return scoreB - scoreA;
  })
  .slice(0, 3)
  .map(img => ({
    ...img,
    // Add placement metadata for LLM
    llmContext: {
      placement: img.placement,
      suggestedPosition: img.placement === 'hero' ? 'top' : 'inline'
    }
  }));
```

### Phase 3: Improve Content Truncation

**File:** `src/tools.js` line 1295

```javascript
// Current:
content: r.content ? r.content.substring(0, 300) : r.content

// Replace with:
content: r.content ? extractKeyContent(r.content, r.query) : r.content
```

**Note:** `extractKeyContent()` already exists at lines 233-300, just needs to be used instead of substring.

### Phase 4: Transcript Dual-Path Delivery

**File:** `src/endpoints/chat.js` (add after video extraction around line 2350)

```javascript
// Extract from get_youtube_transcript results
if (toolMsg.name === 'get_youtube_transcript') {
  const parsed = JSON.parse(toolMsg.content);
  
  // Add to extractedContent (for UI)
  if (!extractedContent.transcripts) {
    extractedContent.transcripts = [];
  }
  
  extractedContent.transcripts.push({
    videoId: parsed.videoId,
    videoUrl: parsed.videoUrl || `https://youtube.com/watch?v=${parsed.videoId}`,
    title: parsed.title,
    fullTranscript: parsed.transcript,
    segments: parsed.segments || [],
    duration: parsed.duration,
    thumbnail: parsed.thumbnail,
    chapters: parsed.chapters || []
  });
}
```

**File:** `src/tools.js` (modify get_youtube_transcript tool around line 2712)

```javascript
// Add summarization before returning
const transcriptSummary = summarizeTranscriptForLLM(transcript, context.selectedModel);

return JSON.stringify({
  // For UI (via extractedContent)
  videoId,
  videoUrl,
  title,
  transcript: fullTranscript,
  segments,
  duration,
  thumbnail,
  
  // For LLM (compressed)
  llmSummary: transcriptSummary,
  keyQuotes: extractKeyQuotes(fullTranscript, 5),
  keyTimestamps: extractKeyTimestamps(segments, 10)
});

function summarizeTranscriptForLLM(transcript, model) {
  const contextWindow = model?.context_window || 32000;
  
  if (contextWindow > 100000) {
    // Large context: More detail
    return extractKeyContent(transcript, null, 2000); // ~500 tokens
  } else if (contextWindow > 16000) {
    // Medium context: Key segments
    return extractKeyContent(transcript, null, 1000); // ~250 tokens
  } else {
    // Small context: Brief summary only
    return extractKeyContent(transcript, null, 400); // ~100 tokens
  }
}
      ]
    },
    "tier2": {
      // ONLY included if model supports (contextWindow >= 16K)
      "detailedSummary": "More detailed section-by-section summary...",
      "transcriptSections": [
        {
          "timeRange": "0:00-2:00",
          "text": "Detailed transcript excerpt..."
        }
      ],
      "qAndA": [
        {
          "timestamp": "15:20",
          "question": "What about...?",
          "answer": "Well..."
        }
      ]
    },
    "modelTokens": 3000
  },
  
  "metadata": {
    "scrapedAt": "2025-10-16T12:00:00Z",
    "contentQuality": "high",
    "fullTranscriptAvailable": true,
    "totalSegments": 250,
    "layer2Included": true
  }
}
```

#### For Web Pages (Path 2 remains the same)

**Path 2: LLM Context (Only Top 3 Images + Smart Content)**
```json
{
  "title": "Page Title",
  "url": "https://example.com/page",
  
  "summary": {
    "wordCount": 5000,
    "readingTime": "20 min",
    "mainTopics": ["Topic 1", "Topic 2"],
    "keyFacts": ["Fact 1", "Fact 2", "Fact 3"]
  },
  
  "content": {
    "type": "structured",
    "tier1": {
      "headings": ["H1", "H2", "H3"],
      "keyContent": "...",
      "tables": [...],
      "lists": [...]
    },
    "tier2": {
      // ONLY included if model supports (contextWindow >= 16K)
      "summaries": [...],
      "quotes": [...],
      "codeSnippets": [...]
    },
    "modelTokens": 5000  // Actual tokens sent to this model
  },
  
  "images": {
    "top3": [
      {
        "url": "image1.jpg",
        "alt": "Description",
        "placement": {
          "nearestHeading": "Introduction",
          "contextText": "This section discusses...",
          "sectionId": "intro",
          "suggestedPosition": "inline"
        }
      }
      // ONLY 3 images with placement metadata
    ]
  },
  
  "metadata": {
    "scrapedAt": "2025-10-16T12:00:00Z",
    "contentQuality": "high",
    "totalImagesAvailable": 25,    // In direct response
    "totalVideosAvailable": 5,     // In direct response
    "totalLinksAvailable": 150,    // In direct response
    "layer2Included": true         // Based on model capacity
  }
}
```

---

## Implementation Phases

### Phase 1: Comprehensive Extraction (Week 1)
**Goal**: Extract and preserve ALL media content before filtering

**For Web Pages (Search + Direct Scrape):**
- [ ] Update scraper to extract all images from raw HTML
- [ ] Extract all YouTube video URLs (embeds and links)
- [ ] Extract all other media URLs (audio, video elements)
- [ ] Implement junk filtering for images (ads, headers, tracking pixels)
- [ ] Apply existing link filter logic to links
- [ ] Implement image scoring algorithm
- [ ] Preserve complete image metadata (position, context, dimensions)
- [ ] Store all extracted media in results
- [ ] Store full page structure (headings, sections, lists)

**For Transcriptions (YouTube + Other Media):**
- [ ] Extract full transcript with timestamps
- [ ] Extract video/audio metadata (title, author, duration)
- [ ] Extract source URL (YouTube link, audio file URL)
- [ ] Extract thumbnail/poster image
- [ ] Extract chapters/sections if available
- [ ] Extract speaker labels if multi-speaker
- [ ] Store complete transcript in results

**Deliverable**: Complete extraction with filtered images/links (web) and full transcripts (media)

### Phase 2: Intelligent Filtering & Model-Aware Summarization (Week 2)
**Goal**: Smart content summarization that adapts to model capacity

**For Web Pages:**
- [ ] Implement Tier 1 content strategy (always included)
- [ ] Implement Tier 2 content strategy (conditional on model)
- [ ] Create model detection logic (context window check)
- [ ] Create intelligent truncation algorithm
- [ ] Preserve structured data (tables, lists, code)
- [ ] Implement token budget management per model

**For Transcriptions:**
- [ ] Implement Tier 1 transcript summary (overview + key quotes)
- [ ] Implement Tier 2 detailed summaries (conditional on model)
- [ ] Extract key timestamps and moments
- [ ] Identify main topics and themes
- [ ] Preserve speaker dialogue and Q&A sections
- [ ] Implement transcript-specific token budgets

**For All Content Types:**
- [ ] Add content quality scoring
- [ ] Remove expansion mechanism (users can ask more questions)

**Deliverable**: Model-aware filtered content that adapts to capacity (web + transcripts)

### Phase 3: Media Integration & Dual-Path Response (Week 3)
**Goal**: Separate media delivery paths (direct vs LLM)

**For Web Pages:**
- [ ] Map images to content sections
- [ ] Select top 3 images for LLM with placement metadata
- [ ] Create dual-path response structure
  - [ ] Path 1: Direct Lambda response (all media, bypasses LLM)
  - [ ] Path 2: LLM context (top 3 images + smart summary)
- [ ] Add image relevance scoring to results
- [ ] Structure YouTube videos for direct response
- [ ] Structure other media (audio/video) for direct response
- [ ] Ensure filtered images/links in direct response

**For Transcriptions:**
- [ ] Create dual-path response structure
  - [ ] Path 1: Direct Lambda response (full transcript, bypasses LLM)
  - [ ] Path 2: LLM context (summary + key quotes)
- [ ] Structure transcript segments for direct response
- [ ] Include source metadata (video/audio info)
- [ ] Preserve timestamp navigation
- [ ] Include chapter markers in direct response

**Deliverable**: Dual-path media delivery system (web pages + transcriptions)

### Phase 4: LLM Instructions (Week 4)
**Goal**: Guide LLM to use images and transcripts effectively

**For Web Pages:**
- [ ] Add image placement instructions to system prompt
- [ ] Update tool descriptions with image guidelines
- [ ] Add examples of good image usage
- [ ] Create image distribution guidelines
- [ ] Add content preservation instructions

**For Transcriptions:**
- [ ] Add timestamp reference instructions to system prompt
- [ ] Create transcript quotation guidelines
- [ ] Add speaker attribution instructions
- [ ] Create examples of good transcript usage
- [ ] Add chapter/section navigation guidelines

**For All Content Types:**
- [ ] Test LLM responses for proper content handling
- [ ] Validate source linking (URLs, media files)

**Deliverable**: Enhanced system prompts with content-type-specific instructions

### Phase 5: UI/UX Updates (Week 5)
**Goal**: Display comprehensive media to users

**For Web Pages:**
- [ ] Update expandable image gallery to show ALL filtered images
- [ ] Add image metadata (alt text, context, relevance)
- [ ] Create YouTube video player section
- [ ] Create other media (audio/video) player section
- [ ] Display all filtered links
- [ ] Show media counts (images, videos, audio, links)
- [ ] Add media quality indicators

**For Transcriptions:**
- [ ] Create transcript viewer with timestamp navigation
- [ ] Add timestamp click-to-jump functionality (if video embedded)
- [ ] Display speaker labels clearly
- [ ] Create chapter navigation UI
- [ ] Add search within transcript
- [ ] Display video thumbnail and metadata
- [ ] Create downloadable transcript option

**Deliverable**: UI that exposes all extracted media (web + transcripts)

### Phase 6: Testing & Optimization (Week 6)
**Goal**: Validate and refine

**For Web Pages:**
- [ ] Test with various page types (news, product, technical, blog, video)
- [ ] Measure token usage vs. content quality
- [ ] Validate image extraction completeness and filtering
- [ ] Validate YouTube video extraction
- [ ] Validate other media (audio/video) extraction
- [ ] Test image positioning in LLM responses (top 3 only)
- [ ] Verify junk filtering effectiveness

**For Transcriptions:**
- [ ] Test with various transcript sources (YouTube, audio files, podcasts)
- [ ] Validate timestamp accuracy
- [ ] Test speaker label preservation
- [ ] Validate chapter/section extraction
- [ ] Test transcript summarization quality
- [ ] Verify source linking (video/audio URLs)

**For All Content Types:**
- [ ] Test model-aware Layer 2 inclusion logic
- [ ] Test with different models (GPT-3.5, GPT-4, Claude, Groq)
- [ ] Measure token efficiency across content types
- [ ] Gather user feedback
- [ ] Optimize scoring/summarization algorithms

**Deliverable**: Production-ready implementation (all content types)

---

## Success Criteria

### Media Extraction
- ✅ **100% media capture**: All images, videos, audio from page extracted
- ✅ **Effective junk filtering**: Ads, headers, tracking pixels removed from images
- ✅ **Link filtering**: Existing filter logic applied to all links
- ✅ **YouTube extraction**: All playable YouTube URLs captured
- ✅ **Other media extraction**: All audio/video elements captured
- ✅ **Smart highlighting**: Top 3 most relevant images identified for LLM
- ✅ **Position preservation**: Image locations relative to content maintained
- ✅ **Context awareness**: Top 3 images include placement metadata
- ✅ **Complete gallery**: All filtered media available in UI

### Content Preservation
- ✅ **Key information retained**: Numbers, facts, headings, lists preserved
- ✅ **Structure maintained**: Heading hierarchy and organization kept
- ✅ **Intelligent summarization**: Important content prioritized over filler
- ✅ **Model-aware delivery**: Layer 2 included/excluded based on model capacity
- ✅ **Token efficiency**: 70%+ reduction without losing core information
- ✅ **No expansion needed**: Users can ask follow-up questions for more details

### LLM Integration
- ✅ **Top 3 images only**: LLM receives only 3 best images with placement metadata
- ✅ **Contextual placement**: Images include suggested positions
- ✅ **Proper attribution**: Alt text and context included
- ✅ **Model adaptation**: Content adjusts to model context window
- ✅ **Clean separation**: Media bypasses LLM, delivered directly to user

### User Experience
- ✅ **No information loss**: Users can access ALL scraped media directly
- ✅ **Fast responses**: LLM receives optimized content quickly
- ✅ **Direct media access**: Videos, audio, images available immediately
- ✅ **Playable YouTube**: Video URLs ready for embedding/playing
- ✅ **Visual completeness**: Image/video gallery shows everything
- ✅ **Clean content**: Junk filtered out from images and links

---

## Token Economics Analysis

### Current State (Aggressive Truncation)
```
Typical News Article:
- Original: 50,000 tokens
- After truncation: 3,000 tokens (94% loss)
- Images: 3 of 15 shown (80% loss)
- Videos: Not extracted
- Media: Not extracted
- Content quality: Poor (important details lost)
- Cost savings: ~$1.50 per scrape
- User value: Low (content "useless")
```

### Proposed State (Smart Summarization + Direct Media)
```
Same News Article:
- Original: 50,000 tokens
- After smart filtering: 2,000-5,000 tokens (90-96% reduction, model-aware)
- Images to LLM: 3 with placement metadata (optimized)
- Images to user: 15 filtered (100% captured, ads removed)
- Videos to user: 2 YouTube + 1 MP4 (100% captured, direct access)
- Links to user: 50 filtered (existing logic, direct access)
- Content quality: Good (key facts preserved)
- Cost per scrape: ~$0.10-$0.20 (model-aware)
- User value: High (useful summaries + complete media access)
```

### ROI Analysis
```
Cost increase: ~5% more tokens to LLM (model-aware saves costs)
Value increase: 500%+ (complete media preserved and directly accessible)
User satisfaction: Significantly higher
Scraping efficiency: Same speed
Storage requirements: +30% (media URLs + metadata)
Media accessibility: Immediate (bypasses LLM)
```

**Recommendation**: Dual-path delivery provides massively better value with minimal cost increase, plus direct media access

---

## Technical Implementation Notes

### Image Extraction Pseudocode

```javascript
async function comprehensiveMediaExtraction(url) {
  // 1. Fetch raw HTML
  const html = await fetch(url).then(r => r.text());
  
  // 2. Parse with full-featured parser
  const dom = new DOMParser().parseFromString(html, 'text/html');
  
  // 3. Extract ALL images
  const images = [];
  
  // Regular img tags
  for (const img of dom.querySelectorAll('img')) {
    images.push(extractImageData(img, dom));
  }
  
  // Picture sources
  for (const source of dom.querySelectorAll('picture source')) {
    images.push(extractImageData(source, dom));
  }
  
  // CSS backgrounds
  for (const el of dom.querySelectorAll('[style*="background-image"]')) {
    const bgImage = extractBackgroundImage(el);
    if (bgImage) images.push({...bgImage, type: 'background'});
  }
  
  // Data attributes (lazy loading)
  for (const el of dom.querySelectorAll('[data-src], [data-lazy]')) {
    images.push(extractLazyImage(el, dom));
  }
  
  // 4. Filter junk (ads, headers, tracking pixels)
  const filteredImages = filterJunkImages(images);
  
  // 5. Score and sort
  const scoredImages = filteredImages.map(img => ({
    ...img,
    score: scoreImage(img, dom)
  })).sort((a, b) => b.score - a.score);
  
  // 6. Extract YouTube videos
  const youtubeVideos = extractYouTubeVideos(dom);
  
  // 7. Extract other media
  const otherMedia = extractOtherMedia(dom);
  
  // 8. Extract and filter links (existing logic)
  const filteredLinks = extractAndFilterLinks(dom);
  
  // 9. Return dual-path structure
  return {
    // For LLM: Only top 3 images with placement
    llm: {
      top3Images: scoredImages.slice(0, 3).map(img => ({
        url: img.src,
        alt: img.alt,
        placement: {
          nearestHeading: img.position.nearestHeading,
          contextText: img.position.contextText,
          sectionId: img.position.sectionId,
          suggestedPosition: 'inline'
        }
      }))
    },
    
    // For direct Lambda response: ALL media (bypasses LLM)
    direct: {
      allImages: scoredImages,
      allLinks: filteredLinks,
      youtubeVideos: youtubeVideos,
      otherMedia: otherMedia
    },
    
    metadata: {
      extractedAt: Date.now(),
      url: url,
      counts: {
        images: scoredImages.length,
        videos: youtubeVideos.length + otherMedia.filter(m => m.type === 'video').length,
        audio: otherMedia.filter(m => m.type === 'audio').length,
        links: filteredLinks.length
      }
    }
  };
}

function extractImageData(element, dom) {
  const rect = element.getBoundingClientRect();
  return {
    src: element.src || element.getAttribute('srcset')?.split(' ')[0],
    alt: element.alt || element.getAttribute('aria-label') || '',
    title: element.title || '',
    width: element.naturalWidth || rect.width,
    height: element.naturalHeight || rect.height,
    position: {
      index: Array.from(dom.querySelectorAll('img')).indexOf(element),
      nearestHeading: findNearestHeading(element, dom),
      contextText: extractContextText(element, dom),
      sectionId: findParentSection(element, dom)
    },
    metadata: classifyImage(element, dom),
    element: element // For filtering
  };
}

function filterJunkImages(images) {
  return images.filter(img => {
    // Remove ads
    if (img.metadata.isAd) return false;
    if (img.src.includes('doubleclick') || img.src.includes('googlesyndication')) return false;
    
    // Remove header/nav images
    if (img.metadata.isHeader) return false;
    const parent = img.element?.closest('header, nav, .header, .navigation');
    if (parent) return false;
    
    // Remove tiny icons
    if (img.width < 50 || img.height < 50) return false;
    
    // Remove tracking pixels
    if (img.width === 1 && img.height === 1) return false;
    
    // Remove social media icons
    if ((img.src.includes('facebook') || img.src.includes('twitter')) && 
        (img.width < 100 || img.height < 100)) return false;
    
    // Remove common junk
    if (img.src.includes('spacer.gif') || img.src.includes('blank.gif')) return false;
    
    return true;
  });
}

function extractYouTubeVideos(dom) {
  const videos = [];
  
  // iframe embeds
  for (const iframe of dom.querySelectorAll('iframe[src*="youtube.com/embed"], iframe[src*="youtu.be"]')) {
    const src = iframe.src;
    const videoId = extractYouTubeId(src);
    videos.push({
      url: `https://youtube.com/watch?v=${videoId}`,
      embedUrl: src,
      videoId: videoId,
      title: iframe.title || '',
      thumbnail: `https://img.youtube.com/vi/${videoId}/maxresdefault.jpg`
    });
  }
  
  // Direct links
  for (const link of dom.querySelectorAll('a[href*="youtube.com/watch"], a[href*="youtu.be"]')) {
    const videoId = extractYouTubeId(link.href);
    if (videoId && !videos.some(v => v.videoId === videoId)) {
      videos.push({
        url: link.href,
        embedUrl: `https://youtube.com/embed/${videoId}`,
        videoId: videoId,
        title: link.textContent || '',
        thumbnail: `https://img.youtube.com/vi/${videoId}/maxresdefault.jpg`
      });
    }
  }
  
  return videos;
}

function extractOtherMedia(dom) {
  const media = [];
  
  // Video elements
  for (const video of dom.querySelectorAll('video, video source')) {
    const src = video.src || video.querySelector('source')?.src;
    if (src) {
      media.push({
        url: src,
        type: 'video',
        format: src.split('.').pop(),
        poster: video.poster || ''
      });
    }
  }
  
  // Audio elements
  for (const audio of dom.querySelectorAll('audio, audio source')) {
    const src = audio.src || audio.querySelector('source')?.src;
    if (src) {
      media.push({
        url: src,
        type: 'audio',
        format: src.split('.').pop()
      });
    }
  }
  
  // Media links
  const mediaExtensions = ['.mp4', '.webm', '.ogg', '.mp3', '.wav', '.m4a'];
  for (const link of dom.querySelectorAll('a[href]')) {
    const href = link.href;
    for (const ext of mediaExtensions) {
      if (href.endsWith(ext)) {
        media.push({
          url: href,
          type: ext.match(/mp3|wav|m4a/) ? 'audio' : 'video',
          format: ext.substring(1),
          title: link.textContent || ''
        });
        break;
      }
    }
  }
  
  return media;
}
```

### Smart Truncation Pseudocode

```javascript
function intelligentContentFilter(content, modelId, contextWindow, targetTokens = 5000) {
  // Parse content into structured sections
  const sections = parseIntoSections(content);
  
  // Determine if Layer 2 should be included based on model
  const includeLayer2 = shouldIncludeLayer2(modelId, contextWindow);
  
  // Extract Tier 1: Essential high-value content (ALWAYS)
  const tier1 = {
    title: sections.title,
    headings: sections.allHeadings(),
    metadata: sections.metadata,
    keyFacts: extractKeyFacts(sections),
    tables: summarizeTables(sections.tables),
    lists: condenseLists(sections.lists),
    codeSnippets: sections.code // Preserve exactly
  };
  
  const tier1Tokens = estimateTokens(tier1);
  
  // Extract Tier 2: Smart summaries (CONDITIONAL)
  let tier2 = null;
  let tier2Tokens = 0;
  
  if (includeLayer2) {
    const remainingTokens = targetTokens - tier1Tokens;
    tier2 = {
      summaries: sections.body.map(section => {
        const importance = scoreSectionImportance(section);
        const allocation = remainingTokens * (importance / totalImportance);
        return smartSummarize(section, allocation);
      }),
      quotes: extractImportantQuotes(sections),
      namedEntities: extractNamedEntities(sections)
    };
    tier2Tokens = estimateTokens(tier2);
  }
  
  return {
    tier1: tier1,
    tier2: includeLayer2 ? tier2 : null,
    metadata: {
      originalTokens: estimateTokens(content),
      includedTokens: tier1Tokens + tier2Tokens,
      compressionRatio: (tier1Tokens + tier2Tokens) / estimateTokens(content),
      layer2Included: includeLayer2,
      modelId: modelId,
      contextWindow: contextWindow
    }
  };
}

function shouldIncludeLayer2(modelId, contextWindow) {
  // Check context window capacity
  if (contextWindow >= 16000) return true;
  
  // Model-specific overrides
  const alwaysInclude = ['gpt-4', 'claude', 'groq'];
  const neverInclude = ['gpt-3.5-turbo'];
  
  if (alwaysInclude.some(m => modelId.toLowerCase().includes(m))) return true;
  if (neverInclude.some(m => modelId.toLowerCase().includes(m))) return false;
  
  return false; // Conservative default
}
```

---

## UI Component Specifications

### JsonTreeViewer Component

**Purpose:** Display JSON data in an interactive, collapsible tree format with syntax highlighting.

**Features:**
- Syntax highlighting for JSON types (string, number, boolean, null, object, array)
- Collapsible/expandable nodes
- Copy to clipboard (entire tree or selected node)
- Download as JSON file
- Search within JSON (highlight matching keys/values)
- Line numbers
- Deep linking to specific nodes
- Keyboard navigation

**Example Usage:**
```tsx
<JsonTreeViewer
  data={rawToolResponse}
  defaultExpanded={false}
  searchable={true}
  copyable={true}
  downloadable={true}
  maxDepth={3}
  highlightUpdates={true}
/>
```

### ToolUseBlock Component

**Purpose:** Display tool execution with full transparency and expandable sections.

**Structure:**
```tsx
<ToolUseBlock
  toolName="search_web"
  status="success"
  executionTime={2.3}
  query="web scraping best practices"
>
  <Section title="Extracted Content (For You)" defaultExpanded={true}>
    <SummaryStats>
      <Stat icon="🔍" label="Search Results" value={5} />
      <Stat icon="🖼️" label="Images" value="12 (3 prioritized)" />
      <Stat icon="🎬" label="YouTube Videos" value={2} />
      <Stat icon="🔗" label="Links" value="47 (8 prioritized)" />
    </SummaryStats>
    
    <ImageGallery images={extractedImages} />
    <VideoList videos={extractedVideos} />
    <LinkList links={extractedLinks} />
  </Section>
  
  <Section title="LLM Context (Sent to AI)" defaultExpanded={false}>
    <SummaryStats>
      <Stat icon="🖼️" label="Images" value="3 with placement" />
      <Stat icon="📝" label="Content" value="1,247 tokens" />
      <Stat icon="🔗" label="Links" value="8 prioritized" />
    </SummaryStats>
    
    <CodeBlock language="markdown">
      {llmContext}
    </CodeBlock>
  </Section>
  
  <Section title="Raw Tool Response" defaultExpanded={false}>
    <JsonTreeViewer data={rawResponse} />
  </Section>
  
  <Section title="Extracted Metadata" defaultExpanded={false}>
    <JsonTreeViewer data={metadata} />
  </Section>
  
  <Section title="Filtering Decisions" defaultExpanded={false}>
    <FilteringReport
      imagesRemoved={25}
      linksRemoved={42}
      reasons={filteringReasons}
    />
    <JsonTreeViewer data={filteringDecisions} />
  </Section>
</ToolUseBlock>
```

### CollapsibleSection Component

**Purpose:** Reusable collapsible section with consistent styling.

**Props:**
```typescript
interface CollapsibleSectionProps {
  title: string;
  defaultExpanded?: boolean;
  icon?: React.ReactNode;
  badge?: string | number;
  onToggle?: (expanded: boolean) => void;
  persistKey?: string; // For remembering state
  children: React.ReactNode;
}
```

### FilteringReport Component

**Purpose:** Visual summary of filtering decisions.

**Display:**
```
┌─────────────────────────────────────┐
│ Filtering Summary                    │
├─────────────────────────────────────┤
│ 📊 Images                            │
│   ✅ Kept: 12                        │
│   ❌ Removed: 25                     │
│   └─ Reasons:                        │
│      • Tracking pixels: 8            │
│      • Icons/logos: 12               │
│      • Too small: 5                  │
│                                      │
│ 📊 Links                             │
│   ✅ Kept: 47                        │
│   ❌ Removed: 42                     │
│   └─ Reasons:                        │
│      • Navigation: 15                │
│      • Ads: 8                        │
│      • Social sharing: 7             │
│      • Tracking: 12                  │
└─────────────────────────────────────┘
```

---

## Success Metrics

**After Implementation, Track:**

1. **Image Quality:**
   - Top 3 image selection accuracy (hero/important images captured)
   - Placement metadata correctness
   - User engagement with image gallery

2. **Content Quality:**
   - LLM response quality vs. old substring truncation
   - Content relevance preservation (query-relevant info retained)

3. **Transcript Usability:**
   - Transcript viewer usage rate
   - Timestamp navigation clicks
   - Full transcript vs. summary view ratio

4. **Performance:**
   - No significant increase in scraping time
   - Token usage within expected limits
   - Model-aware optimization effectiveness

5. **Transparency Features (NEW):**
   - JSON tree viewer usage rate
   - Most viewed sections (Raw Response, Metadata, Filtering Decisions)
   - Copy/download feature usage
   - User feedback on transparency (helpful vs. overwhelming)
   - Time spent inspecting tool results
   - Debug capability improvements (developer feedback)

---

## Conclusion

This plan focuses on targeted enhancements to an already well-architected system:

**What Already Works:**
- ✅ Dual-path delivery (extractedContent for UI, compressed for LLM)
- ✅ Comprehensive link filtering
- ✅ Comprehensive image filtering
- ✅ Model-aware content optimization
- ✅ Intelligent content extraction

**What Needs Enhancement:**
- 🔨 Image placement metadata (Phase 2)
- 🔨 Better content truncation (Phase 3)
- 🔨 Transcript dual-path delivery (Phase 4)
- 🔨 **Comprehensive UI transparency** (Phase 5 - NEW)
  - JSON tree viewers for raw data
  - Extraction metadata display
  - Filtering decisions visibility
  - LLM context vs. full data distinction
- 🔨 Enhanced media display (Phase 5)

**Expected Outcomes:**
- Better image selection with placement context
- Smarter content truncation preserving key information
- Full transcripts available to users while LLM gets summaries
- **Complete transparency into tool execution and data extraction**
- **Users can inspect, debug, and understand all processing decisions**
- Improved UI display of all extracted media

**Implementation Time:** 30-43 hours total (22 hours critical path)
**Risk Level:** Low-Medium (incremental enhancements, transparency adds UI complexity)

**Key Value Proposition:**
- **Trust through Transparency:** Users see exactly what data was extracted and why
- **Debug Capability:** Developers and power users can inspect tool execution
- **Data Access:** Full raw data available for export and analysis
- **Educational:** Users understand the difference between extracted data and LLM context
- **Quality Assurance:** Filtering decisions are visible and auditable

---

## Next Steps

1. ✅ **Phase 1 Complete:** System architecture documented
2. **Phase 2:** Add image placement detection (4-6 hours)
3. **Phase 3:** Replace substring with extractKeyContent (1-2 hours)
4. **Phase 4:** Implement transcript dual-path (3-4 hours)
5. **Phase 5:** Implement UI transparency + media display (12-20 hours)
   - **5.1:** Tool use block structure (2-3 hours)
   - **5.2:** JSON tree viewer component (4-6 hours)
   - **5.3:** Metadata collection & formatting (3-4 hours)
   - **5.4:** Enhanced media display (3-5 hours)
   - **5.5:** Integration & polish (2-4 hours)
6. **Phase 6:** Testing and validation (6-10 hours)

**Prioritization:**
- **Must Have (Week 1):** Phases 2, 3, 4 (12 hours)
- **High Priority (Week 2):** Phase 5.1-5.3 Transparency Core (10 hours)
- **Nice to Have (Week 3):** Phase 5.4-5.5 + Phase 6 (16 hours)

**Status:** 📋 Plan Updated with Full Transparency Features - Ready for Implementation
