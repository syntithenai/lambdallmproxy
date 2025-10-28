# Plan: Browser Extension

**Date**: 2025-10-28  
**Status**: 📋 PLANNING  
**Priority**: MEDIUM (User-requested feature)  
**Estimated Implementation Time**: 3-4 weeks

## Executive Summary

This plan outlines the development of a browser extension for Chrome, Firefox, and Edge that integrates the Research Agent directly into the user's browsing experience. The extension will provide context menu integration, sidebar panel for full chat interface, content script injection for page content capture, and seamless synchronization with the web application.

## Current State Analysis

### Existing Access Methods

**Web Application**: `https://your-domain.github.io/docs/`
- Full-featured React UI
- Requires opening in separate tab
- No access to current page content
- Manual copy/paste for research

**Limitations**:
- ❌ Context switching between browser and app
- ❌ No quick access to research features
- ❌ Cannot capture page selections automatically
- ❌ No integration with browser workflows

## Requirements

### Functional Requirements

1. **Context Menu Integration**:
   - "Research this with AI" on text selection
   - "Summarize this page" on page action
   - "Extract main points" for articles
   - Custom submenu with quick actions

2. **Sidebar Panel**:
   - Full chat interface (same as web app)
   - Persistent across page navigation
   - Resizable and collapsible
   - Syncs conversation with web app

3. **Content Scripts**:
   - Capture selected text automatically
   - Extract page metadata (title, URL, author)
   - Parse article content (readability)
   - Inject inline research UI (optional)

4. **Popup UI**:
   - Quick research input (mini chat)
   - Recent conversations list
   - Settings and preferences
   - Login status

5. **Synchronization**:
   - Sync conversations across devices
   - Share state with web application
   - Real-time updates via WebSocket
   - Offline queue for requests

### Non-Functional Requirements

1. **Performance**:
   - Extension load time < 100ms
   - Content script injection < 50ms
   - No impact on page load speed
   - Minimal memory footprint (< 50MB)

2. **Compatibility**:
   - Chrome 88+ (Manifest V3)
   - Firefox 109+ (Manifest V3)
   - Edge 88+ (Chromium-based)
   - Safari 17+ (if feasible)

3. **Security**:
   - No sensitive data in localStorage
   - Encrypted communication with backend
   - CSP-compliant content scripts
   - Minimal permissions (principle of least privilege)

4. **Privacy**:
   - No tracking or analytics (without consent)
   - User control over data collection
   - Clear permission requests
   - GDPR compliance

## Manifest V3 Architecture

### Manifest.json

```json
{
  "manifest_version": 3,
  "name": "Research Agent",
  "version": "1.0.0",
  "description": "AI-powered research assistant that helps you understand, summarize, and explore web content.",
  "icons": {
    "16": "icons/icon-16.png",
    "48": "icons/icon-48.png",
    "128": "icons/icon-128.png"
  },
  "action": {
    "default_popup": "popup.html",
    "default_icon": {
      "16": "icons/icon-16.png",
      "48": "icons/icon-48.png"
    }
  },
  "background": {
    "service_worker": "background.js",
    "type": "module"
  },
  "content_scripts": [
    {
      "matches": ["<all_urls>"],
      "js": ["content-script.js"],
      "css": ["content-script.css"],
      "run_at": "document_idle"
    }
  ],
  "side_panel": {
    "default_path": "sidebar.html"
  },
  "permissions": [
    "activeTab",
    "contextMenus",
    "storage",
    "scripting",
    "sidePanel"
  ],
  "host_permissions": [
    "https://your-lambda-url.amazonaws.com/*",
    "https://your-domain.github.io/*"
  ],
  "web_accessible_resources": [
    {
      "resources": ["sidebar.html", "icons/*"],
      "matches": ["<all_urls>"]
    }
  ],
  "content_security_policy": {
    "extension_pages": "script-src 'self'; object-src 'self'"
  }
}
```

### Key Manifest V3 Changes from V2

| Feature | Manifest V2 | Manifest V3 |
|---------|-------------|-------------|
| Background Script | `background.js` (persistent) | Service worker (event-driven) |
| Host Permissions | In `permissions` array | Separate `host_permissions` |
| Content Security Policy | Single string | Object with `extension_pages`, `sandbox` |
| Action API | `browser_action` + `page_action` | Unified `action` |
| Web Request | `webRequest` (blocking) | `declarativeNetRequest` (non-blocking) |
| Scripting API | `tabs.executeScript()` | `scripting.executeScript()` |

## Extension Components

### 1. Background Service Worker (`background.js`)

**Purpose**: Event-driven background tasks, API calls, state management

```javascript
// background.js
import { ChatAPI } from './api/chat.js';
import { StorageManager } from './storage/manager.js';

// Create context menu on installation
chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: 'research-selection',
    title: 'Research "%s" with AI',
    contexts: ['selection'],
  });

  chrome.contextMenus.create({
    id: 'summarize-page',
    title: 'Summarize this page',
    contexts: ['page'],
  });

  chrome.contextMenus.create({
    id: 'extract-points',
    title: 'Extract main points',
    contexts: ['page'],
  });
});

// Handle context menu clicks
chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (info.menuItemId === 'research-selection') {
    const selectedText = info.selectionText;
    await handleResearch(selectedText, tab);
  } else if (info.menuItemId === 'summarize-page') {
    await handleSummarize(tab);
  } else if (info.menuItemId === 'extract-points') {
    await handleExtractPoints(tab);
  }
});

// Open sidebar with research query
async function handleResearch(text, tab) {
  // Open sidebar
  await chrome.sidePanel.open({ tabId: tab.id });

  // Send message to sidebar
  chrome.runtime.sendMessage({
    type: 'RESEARCH_QUERY',
    data: {
      query: text,
      context: {
        url: tab.url,
        title: tab.title,
      },
    },
  });
}

// Extract page content and summarize
async function handleSummarize(tab) {
  // Inject content script to extract article
  const [result] = await chrome.scripting.executeScript({
    target: { tabId: tab.id },
    func: extractArticleContent,
  });

  const content = result.result;

  // Open sidebar with summary request
  await chrome.sidePanel.open({ tabId: tab.id });

  chrome.runtime.sendMessage({
    type: 'SUMMARIZE_PAGE',
    data: {
      content,
      url: tab.url,
      title: tab.title,
    },
  });
}

// Extract page content using Readability
function extractArticleContent() {
  // This function runs in page context
  const article = new Readability(document.cloneNode(true)).parse();
  return {
    title: article.title,
    content: article.textContent,
    excerpt: article.excerpt,
    byline: article.byline,
  };
}

// Message handler for sidebar/popup communication
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'CHAT_REQUEST') {
    handleChatRequest(message.data).then(sendResponse);
    return true; // Async response
  }
});

async function handleChatRequest(data) {
  const api = new ChatAPI();
  const response = await api.streamChat(data.messages, data.tools);
  return response;
}
```

### 2. Content Script (`content-script.js`)

**Purpose**: Interact with web pages, extract content, inject UI

```javascript
// content-script.js
console.log('Research Agent content script loaded');

// Listen for selection events (optional inline UI)
document.addEventListener('mouseup', (event) => {
  const selection = window.getSelection().toString().trim();
  if (selection.length > 0 && selection.length < 500) {
    showInlineResearchButton(event.clientX, event.clientY, selection);
  } else {
    hideInlineResearchButton();
  }
});

let inlineButton = null;

function showInlineResearchButton(x, y, text) {
  if (!inlineButton) {
    inlineButton = document.createElement('div');
    inlineButton.id = 'research-agent-inline-button';
    inlineButton.innerHTML = `
      <button>
        🔍 Research this
      </button>
    `;
    inlineButton.style.cssText = `
      position: absolute;
      z-index: 999999;
      background: #3b82f6;
      color: white;
      border: none;
      border-radius: 6px;
      padding: 8px 12px;
      font-size: 14px;
      cursor: pointer;
      box-shadow: 0 2px 8px rgba(0,0,0,0.2);
    `;
    document.body.appendChild(inlineButton);

    inlineButton.addEventListener('click', () => {
      chrome.runtime.sendMessage({
        type: 'RESEARCH_QUERY',
        data: { query: text },
      });
      hideInlineResearchButton();
    });
  }

  inlineButton.style.left = `${x}px`;
  inlineButton.style.top = `${y + 20}px`;
  inlineButton.style.display = 'block';
}

function hideInlineResearchButton() {
  if (inlineButton) {
    inlineButton.style.display = 'none';
  }
}

// Listen for messages from background script
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'EXTRACT_CONTENT') {
    const content = extractPageContent();
    sendResponse(content);
  }
});

function extractPageContent() {
  // Use Readability.js for article extraction
  const article = new Readability(document.cloneNode(true)).parse();
  
  return {
    title: document.title,
    url: window.location.href,
    article: article ? {
      title: article.title,
      content: article.textContent,
      excerpt: article.excerpt,
      byline: article.byline,
    } : null,
    metadata: {
      description: document.querySelector('meta[name="description"]')?.content || '',
      author: document.querySelector('meta[name="author"]')?.content || '',
      keywords: document.querySelector('meta[name="keywords"]')?.content || '',
    },
  };
}
```

**Content Script CSS** (`content-script.css`):
```css
#research-agent-inline-button {
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
  animation: fadeIn 0.2s ease-in;
}

#research-agent-inline-button:hover {
  background: #2563eb;
  transform: scale(1.05);
}

@keyframes fadeIn {
  from { opacity: 0; transform: translateY(-5px); }
  to { opacity: 1; transform: translateY(0); }
}
```

### 3. Sidebar Panel (`sidebar.html` + `sidebar.js`)

**Purpose**: Full chat interface embedded in browser sidebar

```html
<!-- sidebar.html -->
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Research Agent</title>
  <link rel="stylesheet" href="sidebar.css">
</head>
<body>
  <div id="root"></div>
  <script type="module" src="sidebar.js"></script>
</body>
</html>
```

```javascript
// sidebar.js
import React from 'react';
import ReactDOM from 'react-dom/client';
import { ChatInterface } from './components/ChatInterface.jsx';

// Initialize React app
const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(<ChatInterface />);

// Listen for research queries from context menu
chrome.runtime.onMessage.addListener((message) => {
  if (message.type === 'RESEARCH_QUERY') {
    window.dispatchEvent(new CustomEvent('research-query', {
      detail: message.data,
    }));
  }
});
```

## Cross-Browser Compatibility

### Chrome vs Firefox Differences

| Feature | Chrome | Firefox | Solution |
|---------|--------|---------|----------|
| Namespace | `chrome.*` | `browser.*` | Use webextension-polyfill |
| Promises | Callbacks only | Native promises | Polyfill or promisify |
| Side Panel API | `chrome.sidePanel` | Not available | Fallback to popup |
| Service Worker | Full support | Limited (experimental) | Feature detection |
| Scripting API | `chrome.scripting` | `browser.scripting` | Polyfill |

### Polyfill Setup

```javascript
// Use webextension-polyfill for cross-browser compatibility
import browser from 'webextension-polyfill';

// Use browser.* instead of chrome.*
browser.contextMenus.create({ ... });
browser.runtime.sendMessage({ ... });
```

## Implementation Plan

### Phase 1: MVP (Week 1-2)

**Deliverables**:
- [ ] Manifest V3 setup (Chrome only)
- [ ] Background service worker with context menu
- [ ] Content script for text selection
- [ ] Popup UI with quick research
- [ ] Basic API integration (chat endpoint)

**Testing**:
- Context menu appears on text selection
- Research query opens sidebar with response
- Popup quick search works

### Phase 2: Sidebar & Full Features (Week 2-3)

**Deliverables**:
- [ ] Sidebar panel with full chat interface
- [ ] Page content extraction (Readability.js)
- [ ] Conversation persistence (IndexedDB)
- [ ] Settings page (API key, preferences)

**Testing**:
- Sidebar displays chat interface
- Page summarization works
- Conversations saved and loaded correctly

### Phase 3: Cross-Browser & Polish (Week 3-4)

**Deliverables**:
- [ ] Firefox compatibility (webextension-polyfill)
- [ ] Edge compatibility testing
- [ ] Improved UI/UX (animations, loading states)
- [ ] Inline research button (optional)
- [ ] Sync with web app

**Testing**:
- Extension works in Chrome, Firefox, Edge
- UI is responsive and polished
- Sync maintains state across devices

### Phase 4: Distribution (Week 4)

**Deliverables**:
- [ ] Chrome Web Store listing
- [ ] Firefox Add-ons listing
- [ ] Edge Add-ons listing
- [ ] Documentation and user guide
- [ ] Privacy policy and terms

## Distribution

### Chrome Web Store

**Steps**:
1. Create developer account ($5 one-time fee)
2. Prepare listing:
   - Name: "Research Agent - AI Research Assistant"
   - Description: 300-word summary
   - Screenshots: 1280x800 (5 images)
   - Category: Productivity
3. Upload `.zip` package
4. Submit for review (2-3 days)
5. Publish

### Firefox Add-ons

**Steps**:
1. Create developer account (free)
2. Upload `.xpi` package (signed automatically)
3. Submit for review (1-2 days)
4. Publish

## Success Metrics

### Adoption
- **Target**: 1,000 installs in first month
- **Metric**: Active users in Chrome Web Store dashboard

### Engagement
- **Target**: 50% of users activate context menu at least once
- **Metric**: Context menu click events

### Retention
- **Target**: 40% 7-day retention
- **Metric**: Daily active users / installs

## Future Enhancements

### Phase 5: Advanced Features
- [ ] Inline annotation mode (highlight + comment)
- [ ] Collaborative research (share conversations)
- [ ] Export to Markdown/PDF
- [ ] Keyboard shortcuts (Ctrl+Shift+R to research)
- [ ] Custom prompts library

### Phase 6: Integrations
- [ ] Notion integration (save research to pages)
- [ ] Obsidian integration (save to vault)
- [ ] Roam Research integration
- [ ] Google Docs integration (research sidebar)

---

**Status**: Ready for implementation  
**Next Step**: Create GitHub repository for extension code  
**Estimated Launch**: 3-4 weeks from start
