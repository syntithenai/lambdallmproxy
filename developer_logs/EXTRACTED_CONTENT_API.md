# Extracted Content API Documentation

**Deployment:** llmproxy-20251009-134416.zip (111.8 KB)  
**Date:** October 9, 2025

## Overview

The Lambda function now automatically extracts comprehensive content from all tool calls (search_web, scrape_url) and returns it as **structured data separate from the LLM response text**. This ensures the extracted content never pollutes LLM conversation context.

## API Response Format

### message_complete Event

```typescript
{
  role: 'assistant',
  content: string,  // LLM response (may include basic Sources section if LLM forgot)
  extractedContent?: {
    sources: SourceItem[] | null,
    images: ImageItem[] | null,
    youtubeVideos: VideoItem[] | null,
    otherVideos: VideoItem[] | null,
    media: MediaItem[] | null
  }
}
```

### complete Event

```typescript
{
  status: 'success',
  messages: Message[],
  iterations: number,
  extractedContent?: ExtractedContent  // Same structure as above
}
```

## Data Structures

### SourceItem

```typescript
interface SourceItem {
  title: string;      // Page title or URL if title unavailable
  url: string;        // Full URL
  snippet?: string;   // First 150 characters of content (optional)
}
```

**Example:**
```json
{
  "title": "Tesla Stock Price - Yahoo Finance",
  "url": "https://finance.yahoo.com/quote/TSLA",
  "snippet": "Tesla Inc. (TSLA) stock price, news, quote and history. Find the latest Tesla Inc. stock price and performance data."
}
```

### ImageItem

```typescript
interface ImageItem {
  src: string;    // Image URL
  alt: string;    // Alt text, title, or "Image"
  source: string; // Page URL where image was found
}
```

**Example:**
```json
{
  "src": "https://cdn.motor1.com/images/2024/tesla-model-3.jpg",
  "alt": "Tesla Model 3 2024",
  "source": "https://www.motor1.com/reviews/tesla-model-3/"
}
```

### VideoItem

```typescript
interface VideoItem {
  src: string;    // Video URL
  title: string;  // Video title or "Video"
  source: string; // Page URL where video was found
}
```

**Example (YouTube):**
```json
{
  "src": "https://youtube.com/watch?v=abc123",
  "title": "Tesla Q3 2025 Earnings Call",
  "source": "https://investor.tesla.com/earnings"
}
```

**Example (Other):**
```json
{
  "src": "https://tesla.com/videos/factory-tour.mp4",
  "title": "Factory Tour",
  "source": "https://tesla.com/factory"
}
```

### MediaItem

```typescript
interface MediaItem {
  src: string;    // Media URL
  type: string;   // Media type (audio, podcast, etc.)
  source: string; // Page URL where media was found
}
```

**Example:**
```json
{
  "src": "https://example.com/tesla-podcast-ep42.mp3",
  "type": "audio",
  "source": "https://example.com/podcasts/tesla"
}
```

## Extraction Logic

### Content Sources

1. **search_web tool (JSON format):**
   - `results[].url` → sources
   - `results[].page_content.images[]` → images
   - `results[].page_content.videos[]` → videos (categorized as YouTube or other)
   - `results[].page_content.media[]` → media

2. **search_web tool (compressed markdown format):**
   - URLs extracted from `🚨 CRITICAL: YOU MUST COPY THESE URLS` section

3. **scrape_url tool:**
   - `url` → sources
   - `images[]` → images
   - `videos[]` → videos (categorized as YouTube or other)
   - `media[]` → media

### Deduplication

All items are deduplicated by their primary identifier:
- Sources: by `url`
- Images: by `src`
- Videos: by `src`
- Media: by `src`

### YouTube Detection

Videos are categorized as YouTube if their `src` includes:
- `youtube.com`
- `youtu.be`

All other videos go into `otherVideos`.

## Content Injection Fallback

If the LLM response doesn't contain any markdown links (`[text](url)`), a basic **Sources:** section is automatically injected into the `content` field:

```markdown
**Sources:**
1. [Tesla Stock Price - Yahoo Finance](https://finance.yahoo.com/quote/TSLA)
2. [TSLA Stock Analysis - Reuters](https://reuters.com/markets/TSLA.O)
3. ...
```

This ensures basic attribution even if the UI doesn't handle `extractedContent`.

## Frontend Integration Guide

### Step 1: Handle message_complete Event

```javascript
eventSource.addEventListener('message_complete', (event) => {
  const data = JSON.parse(event.data);
  
  // Display main response
  displayMessage(data.content);
  
  // Display extracted content if available
  if (data.extractedContent) {
    renderExtractedContent(data.extractedContent);
  }
});
```

### Step 2: Render Extracted Content

```javascript
function renderExtractedContent(extracted) {
  const container = document.getElementById('extracted-content');
  
  // Render sources
  if (extracted.sources && extracted.sources.length > 0) {
    container.appendChild(
      createExpandableSection(
        '📋 Complete Source List',
        extracted.sources.length,
        renderSources(extracted.sources)
      )
    );
  }
  
  // Render images
  if (extracted.images && extracted.images.length > 0) {
    container.appendChild(
      createExpandableSection(
        '🖼️ Extracted Images',
        extracted.images.length,
        renderImages(extracted.images)
      )
    );
  }
  
  // Render YouTube videos
  if (extracted.youtubeVideos && extracted.youtubeVideos.length > 0) {
    container.appendChild(
      createExpandableSection(
        '📺 YouTube Videos',
        extracted.youtubeVideos.length,
        renderVideos(extracted.youtubeVideos)
      )
    );
  }
  
  // Render other videos
  if (extracted.otherVideos && extracted.otherVideos.length > 0) {
    container.appendChild(
      createExpandableSection(
        '🎬 Other Videos',
        extracted.otherVideos.length,
        renderVideos(extracted.otherVideos)
      )
    );
  }
  
  // Render media
  if (extracted.media && extracted.media.length > 0) {
    container.appendChild(
      createExpandableSection(
        '🎵 Other Media',
        extracted.media.length,
        renderMedia(extracted.media)
      )
    );
  }
}
```

### Step 3: Create Expandable Section

```javascript
function createExpandableSection(title, count, content) {
  const details = document.createElement('details');
  
  const summary = document.createElement('summary');
  summary.innerHTML = `<strong>${title}</strong> (${count} item${count !== 1 ? 's' : ''})`;
  details.appendChild(summary);
  
  details.appendChild(content);
  
  return details;
}
```

### Step 4: Render Items

```javascript
function renderSources(sources) {
  const div = document.createElement('div');
  sources.forEach((item, idx) => {
    const p = document.createElement('p');
    p.innerHTML = `${idx + 1}. <a href="${item.url}" target="_blank">${item.title}</a>`;
    if (item.snippet) {
      const blockquote = document.createElement('blockquote');
      blockquote.textContent = item.snippet + '...';
      p.appendChild(blockquote);
    }
    div.appendChild(p);
  });
  return div;
}

function renderImages(images) {
  const div = document.createElement('div');
  images.forEach((img, idx) => {
    const figure = document.createElement('figure');
    const image = document.createElement('img');
    image.src = img.src;
    image.alt = img.alt;
    image.loading = 'lazy';
    figure.appendChild(image);
    
    const caption = document.createElement('figcaption');
    caption.innerHTML = `${idx + 1}. ${img.alt}<br>Source: <a href="${img.source}" target="_blank">${img.source}</a>`;
    figure.appendChild(caption);
    
    div.appendChild(figure);
  });
  return div;
}

function renderVideos(videos) {
  const div = document.createElement('div');
  videos.forEach((video, idx) => {
    const p = document.createElement('p');
    p.innerHTML = `${idx + 1}. <a href="${video.src}" target="_blank">${video.title}</a><br>Source: <a href="${video.source}" target="_blank">${video.source}</a>`;
    div.appendChild(p);
  });
  return div;
}

function renderMedia(mediaItems) {
  const div = document.createElement('div');
  mediaItems.forEach((media, idx) => {
    const p = document.createElement('p');
    p.innerHTML = `${idx + 1}. <a href="${media.src}" target="_blank">${media.type}</a><br>Source: <a href="${media.source}" target="_blank">${media.source}</a>`;
    div.appendChild(p);
  });
  return div;
}
```

### Step 5: Sending Messages Back

When sending conversation history back to the backend, simply send the `content` field. The `extractedContent` field should **never** be sent to the LLM:

```javascript
// ✅ CORRECT
const messagesToSend = conversationHistory.map(msg => ({
  role: msg.role,
  content: msg.content
}));

// ❌ WRONG - Don't include extractedContent
const messagesToSend = conversationHistory.map(msg => ({
  role: msg.role,
  content: msg.content,
  extractedContent: msg.extractedContent  // ← Remove this!
}));
```

## Logging

Check CloudWatch logs for extraction information:

```
⚠️ LLM didn't include URLs - injected 5 source links into content
✅ Extracted content: 5 sources, 12 images, 3 YouTube videos, 2 other videos, 0 media items
```

## Benefits

1. **Clean Context:** Extracted content never pollutes LLM conversation
2. **No Filtering Needed:** Content is separate, no need to strip it
3. **UI Flexibility:** Frontend decides how to display extracted content
4. **Reliable Attribution:** Users always get sources, even if LLM forgets
5. **Rich Discovery:** Images, videos, and media exposed for user exploration

---

**Related:** See `COMPREHENSIVE_CONTENT_EXTRACTION.md` for implementation details
