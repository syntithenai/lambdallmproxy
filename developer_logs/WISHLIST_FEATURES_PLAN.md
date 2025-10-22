# Implementation Plan: Lambda Disconnect, SWAG Styling, Chromecast HDMI & Snippet Casting

**Date:** October 14, 2025  
**Status:** Planning Phase

---

## Overview

This document outlines the implementation plan for 4 user-requested features:

1. **Lambda disconnect detection** - Stop Lambda execution if UI client disconnects
2. **SWAG tag selector styling** - Make tag input smaller, matching tag button size
3. **Chromecast HDMI-CEC control** - Research forcing TV input switch
4. **Snippet casting with scroll sync** - Display snippets full screen on TV

---

## Feature 1: Lambda Disconnect Detection

### Problem

Lambda functions continue executing even if the UI client disconnects, wasting resources and incurring costs. If a user closes their browser or loses connection, the Lambda should detect this and stop immediately.

### Current Architecture

- Lambda uses `awslambda.streamifyResponse()` for all endpoints
- SSE (Server-Sent Events) used for streaming responses
- No disconnect detection currently implemented
- Lambda runs until completion or timeout (typically 60s)

### Solution: Client Heartbeat System

**Approach:** Implement a heartbeat mechanism where:
1. Client sends periodic "ping" events during streaming requests
2. Lambda tracks last heartbeat timestamp
3. Lambda aborts if no heartbeat received within timeout window

### Implementation Details

#### Client Side (React)

**File:** `ui-new/src/utils/streaming.ts`

Add heartbeat to `handleSSEResponse()`:

```typescript
export async function handleSSEResponse(
  response: Response,
  onEvent: SSEEventHandler,
  onComplete?: () => void,
  onError?: (error: Error) => void
): Promise<void> {
  if (!response.ok || !response.body) {
    throw new Error(`HTTP ${response.status}: ${response.statusText}`);
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  
  // NEW: Setup heartbeat interval
  const heartbeatInterval = setInterval(async () => {
    try {
      // Send heartbeat to Lambda
      await fetch(response.url + '/heartbeat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Session-ID': getSessionId() // Track session
        },
        body: JSON.stringify({
          timestamp: Date.now()
        })
      });
    } catch (error) {
      console.warn('Heartbeat failed:', error);
    }
  }, 5000); // Every 5 seconds

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const events = parseSSEEvents(buffer);
      
      // Process events...
    }
    
    onComplete?.();
  } catch (error) {
    onError?.(error as Error);
  } finally {
    clearInterval(heartbeatInterval); // Cleanup
  }
}
```

**Session ID Generation:**

```typescript
// Generate unique session ID for this request
let sessionId: string | null = null;

function getSessionId(): string {
  if (!sessionId) {
    sessionId = `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }
  return sessionId;
}
```

#### Server Side (Lambda)

**Challenge:** Lambda's `streamifyResponse` doesn't support reading request body after streaming starts.

**Alternative Approach:** Connection detection via write failures

**File:** `src/streaming/sse-writer.js`

```javascript
/**
 * Enhanced SSE stream adapter with disconnect detection
 */
function createSSEStreamAdapter(responseStream) {
  let isConnected = true;
  let lastWriteTime = Date.now();
  let checkInterval;

  const writeEvent = (eventType, data) => {
    if (!isConnected) {
      console.log('Client disconnected, not writing event');
      throw new Error('CLIENT_DISCONNECTED');
    }

    try {
      const eventText = `event: ${eventType}\ndata: ${JSON.stringify(data)}\n\n`;
      responseStream.write(eventText);
      lastWriteTime = Date.now();
    } catch (error) {
      console.error('Stream write failed:', error);
      isConnected = false;
      throw new Error('CLIENT_DISCONNECTED');
    }
  };

  // Check for stale connection every 10 seconds
  checkInterval = setInterval(() => {
    const timeSinceWrite = Date.now() - lastWriteTime;
    if (timeSinceWrite > 30000) { // 30 second timeout
      console.warn('No writes for 30s, assuming client disconnected');
      isConnected = false;
      clearInterval(checkInterval);
    }
  }, 10000);

  // Cleanup
  const originalEnd = responseStream.end.bind(responseStream);
  responseStream.end = function(...args) {
    clearInterval(checkInterval);
    return originalEnd(...args);
  };

  return {
    writeEvent,
    isConnected: () => isConnected
  };
}
```

**Update all endpoints to check connection:**

**File:** `src/endpoints/chat.js`

```javascript
async function handler(event, responseStream) {
  let sseWriter;
  
  try {
    sseWriter = createSSEStreamAdapter(responseStream);
    
    // Throughout execution, check if client disconnected
    if (!sseWriter.isConnected()) {
      console.log('Client disconnected, aborting execution');
      responseStream.end();
      return;
    }
    
    // In tool execution loops
    for (const tool of toolCalls) {
      if (!sseWriter.isConnected()) {
        throw new Error('CLIENT_DISCONNECTED');
      }
      // Execute tool...
    }
    
    // In streaming LLM response
    for await (const chunk of streamResponse) {
      if (!sseWriter.isConnected()) {
        throw new Error('CLIENT_DISCONNECTED');
      }
      // Process chunk...
    }
    
  } catch (error) {
    if (error.message === 'CLIENT_DISCONNECTED') {
      console.log('Client disconnected during execution, stopping gracefully');
      responseStream.end();
      return;
    }
    throw error;
  }
}
```

### Testing

1. Start long-running request (e.g., web search + LLM)
2. Close browser tab mid-request
3. Check Lambda logs - should see "Client disconnected" message
4. Verify Lambda execution stops quickly (within 10-30s)
5. Check CloudWatch metrics for reduced execution time

### Estimated Time

- Client heartbeat: 2 hours
- Server disconnect detection: 3 hours
- Testing and refinement: 2 hours
- **Total: 7 hours**

---

## Feature 2: SWAG Tag Selector Styling

### Problem

The TagAutocomplete input in snippet content is too large. User wants it:
- Same size as tag buttons (smaller text/padding)
- About 1/3 the current width
- On the same line as tag buttons

### Current State

**File:** `ui-new/src/components/SwagPage.tsx` (line 629)

```tsx
<TagAutocomplete
  existingTags={getAllTags()}
  currentTags={snippet.tags || []}
  onAddTag={(tag) => {
    updateSnippet(snippet.id, {
      tags: [...(snippet.tags || []), tag]
    });
    showSuccess(`Added tag "${tag}"`);
  }}
  placeholder="Add tag..."
  className="text-xs w-full sm:max-w-xs"  // Currently text-xs, full width on mobile
/>
```

Tag buttons use: `className="text-xs px-2 py-0.5 ..."`

### Solution

Change TagAutocomplete className to match tag button size and reduce width:

```tsx
<TagAutocomplete
  existingTags={getAllTags()}
  currentTags={snippet.tags || []}
  onAddTag={(tag) => {
    updateSnippet(snippet.id, {
      tags: [...(snippet.tags || []), tag]
    });
    showSuccess(`Added tag "${tag}"`);
  }}
  placeholder="Add tag..."
  className="text-xs w-24 sm:w-32"  // Changed: 1/3 width (6rem/8rem instead of full width)
/>
```

**Alternative:** Inline with tag chips

```tsx
{/* Tags */}
{(snippet.tags || []).length > 0 && (
  <div className="flex flex-wrap items-center gap-1.5 mb-2">
    {(snippet.tags || []).map((tag, idx) => (
      <span key={idx} className="...">
        {/* Tag button */}
      </span>
    ))}
    
    {/* Inline Tag Input */}
    <div className="inline-block" onClick={(e) => e.stopPropagation()}>
      <TagAutocomplete
        existingTags={getAllTags()}
        currentTags={snippet.tags || []}
        onAddTag={(tag) => {
          updateSnippet(snippet.id, {
            tags: [...(snippet.tags || []), tag]
          });
          showSuccess(`Added tag "${tag}"`);
        }}
        placeholder="+ tag"
        className="text-xs w-20"  // Very compact, just "+tag" placeholder
      />
    </div>
  </div>
)}

{/* If no tags, show input separately */}
{(snippet.tags || []).length === 0 && (
  <div className="mb-2" onClick={(e) => e.stopPropagation()}>
    <TagAutocomplete
      existingTags={getAllTags()}
      currentTags={[]}
      onAddTag={(tag) => {
        updateSnippet(snippet.id, {
          tags: [tag]
        });
        showSuccess(`Added tag "${tag}"`);
      }}
      placeholder="Add tag..."
      className="text-xs w-24"
    />
  </div>
)}
```

### Implementation

**File:** `ui-new/src/components/SwagPage.tsx`

1. Move TagAutocomplete inside the tags flex container
2. Reduce width to `w-20` or `w-24` (5rem or 6rem)
3. Change placeholder to "+ tag" for brevity
4. Test on mobile to ensure it doesn't wrap awkwardly

### Testing

1. Open SWAG page
2. View snippet with tags
3. Verify TagAutocomplete appears inline with tags
4. Verify it's small (1/3 or less of previous width)
5. Test adding tags
6. Test on mobile (should still be usable)

### Estimated Time

- Implementation: 30 minutes
- Testing: 15 minutes
- **Total: 45 minutes**

---

## Feature 3: Chromecast HDMI-CEC Control

### Problem

User wants to control Chromecast to force TV to switch HDMI input when content is cast.

### Research: Cast API HDMI-CEC Capabilities

The Google Cast SDK has **limited HDMI-CEC control**:

#### What's Possible:

1. **Automatic HDMI-CEC (Built-in)**
   - Chromecast automatically sends HDMI-CEC "Active Source" command when casting starts
   - This *should* switch TV input automatically on supported TVs
   - Enabled by default in Chromecast settings

2. **TV Wake-up**
   - Chromecast can wake TV from standby via HDMI-CEC
   - Also enabled by default

#### What's NOT Possible via Cast SDK:

- **Direct HDMI-CEC commands** from sender app
- **Forcing input switch** if TV doesn't respond to Auto Source
- **Custom CEC commands** beyond what Chromecast firmware supports

### Limitations

The Cast SDK (v3 CAF) **does not expose** HDMI-CEC APIs to developers. The CEC functionality is:
- Handled by Chromecast firmware
- Not accessible via JavaScript Cast API
- Controlled only via Chromecast device settings

### Workarounds

#### Option 1: Ensure HDMI-CEC is Enabled (User Action)

**Steps:**
1. Open Chromecast settings (via Google Home app)
2. Navigate to: Device Settings → Display & Sound
3. Enable "HDMI-CEC control"
4. Enable "Power on TV with Chromecast"

**Limitation:** Requires user configuration, not programmatic

#### Option 2: Visual Notification in Receiver

Add a visual prompt in the receiver that appears for 5 seconds:

```javascript
// chromecast-receiver.html
function showTVSwitchReminder() {
  const reminder = document.createElement('div');
  reminder.style.cssText = `
    position: fixed;
    top: 20px;
    right: 20px;
    background: rgba(0,0,0,0.8);
    color: white;
    padding: 20px;
    border-radius: 10px;
    font-size: 18px;
    z-index: 10000;
  `;
  reminder.textContent = '📺 Please switch TV input to HDMI ' + getHDMIPort();
  document.body.appendChild(reminder);
  
  setTimeout(() => reminder.remove(), 5000);
}

// Call when video loads
context.addEventListener('senderConnected', () => {
  showTVSwitchReminder();
});
```

#### Option 3: Audio Cue

Play a brief audio tone when casting starts to alert user that content is being cast (may prompt them to switch input).

### Recommendation

**Document the limitation** and provide user guidance:

1. Add note to CHROMECAST_VIDEO_CASTING.md about HDMI-CEC
2. Add troubleshooting section with HDMI-CEC setup instructions
3. Mention that automatic input switching depends on TV and Chromecast settings
4. No code changes needed - Chromecast handles this automatically when properly configured

### Documentation Update

**File:** `CHROMECAST_VIDEO_CASTING.md`

Add section:

```markdown
## HDMI Input Switching

### Automatic Input Switching

Chromecast supports automatic HDMI input switching via HDMI-CEC (Consumer Electronics Control). When you start casting, Chromecast sends an "Active Source" command that should automatically switch your TV to the correct HDMI input.

### Requirements

1. **TV must support HDMI-CEC** (also called Anynet+, Bravia Sync, Simplink, etc.)
2. **HDMI-CEC must be enabled** in TV settings
3. **Chromecast HDMI-CEC must be enabled** in device settings

### Setup Instructions

#### Enable on Chromecast:
1. Open Google Home app on your phone
2. Select your Chromecast device
3. Tap Settings (gear icon)
4. Navigate to: Display & Sound
5. Enable "HDMI-CEC control"
6. Enable "Power on TV with Chromecast"

#### Enable on TV:
1. Open TV settings menu
2. Find HDMI-CEC settings (name varies by brand):
   - Samsung: "Anynet+ (HDMI-CEC)"
   - LG: "SIMPLINK (HDMI-CEC)"
   - Sony: "Bravia Sync"
   - Vizio: "CEC"
3. Enable HDMI-CEC for the Chromecast HDMI port

### Limitations

- **No programmatic control**: The Cast SDK does not expose HDMI-CEC APIs
- **TV dependent**: Not all TVs support or properly implement HDMI-CEC
- **HDMI port specific**: CEC must be enabled per HDMI port on some TVs

### Troubleshooting

If automatic input switching doesn't work:
- Verify HDMI-CEC is enabled on both devices
- Try unplugging and replugging Chromecast
- Restart TV
- Try a different HDMI port
- Check TV manual for HDMI-CEC setup instructions
- Some TVs require a firmware update for proper CEC support
```

### Estimated Time

- Research: 1 hour (completed above)
- Documentation: 30 minutes
- **Total: 1.5 hours**

---

## Feature 4: Snippet Casting with Scroll Sync

### Problem

User wants to:
1. Display snippets full screen on Chromecast TV
2. Scroll the snippet on TV from sender device

### Current State

Chromecast receiver supports:
- Chat messages (text display)
- Video playback (YouTube embeds)
- Scroll position sync for chat messages

Missing:
- Snippet display mode
- Snippet-specific scroll sync

### Solution Architecture

Extend Chromecast system with new namespace for snippets:

**Namespace:** `urn:x-cast:com.lambdallmproxy.snippet`

**Commands:**
- `load` - Display snippet full screen
- `scroll` - Update scroll position
- `close` - Return to previous view

### Implementation

#### 1. Extend CastContext for Snippets

**File:** `ui-new/src/contexts/CastContext.tsx`

Add to interface:

```typescript
interface CastContextType {
  // ... existing ...
  
  // Snippet casting
  castSnippet: (snippet: ContentSnippet) => void;
  updateSnippetScroll: (position: number) => void;
  closeSnippet: () => void;
  isCastingSnippet: boolean;
}
```

Add methods:

```typescript
const [isCastingSnippet, setIsCastingSnippet] = useState(false);

const castSnippet = useCallback((snippet: ContentSnippet) => {
  if (!session || !isConnected) return;

  try {
    const namespace = 'urn:x-cast:com.lambdallmproxy.snippet';
    const message = {
      type: 'SNIPPET_COMMAND',
      command: 'load',
      data: {
        id: snippet.id,
        name: snippet.name,
        content: snippet.content,
        tags: snippet.tags || [],
        created: snippet.created
      },
      timestamp: Date.now()
    };

    session.sendMessage(
      namespace,
      message,
      () => {
        console.log('Snippet cast:', snippet.name);
        setIsCastingSnippet(true);
      },
      (error: any) => console.error('Error casting snippet:', error)
    );
  } catch (error) {
    console.error('Error in castSnippet:', error);
  }
}, [session, isConnected]);

const updateSnippetScroll = useCallback((position: number) => {
  if (!session || !isConnected || !isCastingSnippet) return;

  try {
    const namespace = 'urn:x-cast:com.lambdallmproxy.snippet';
    const message = {
      type: 'SNIPPET_COMMAND',
      command: 'scroll',
      data: { position },
      timestamp: Date.now()
    };

    session.sendMessage(namespace, message);
  } catch (error) {
    console.error('Error updating snippet scroll:', error);
  }
}, [session, isConnected, isCastingSnippet]);

const closeSnippet = useCallback(() => {
  if (!session || !isConnected) return;

  try {
    const namespace = 'urn:x-cast:com.lambdallmproxy.snippet';
    const message = {
      type: 'SNIPPET_COMMAND',
      command: 'close',
      data: {},
      timestamp: Date.now()
    };

    session.sendMessage(
      namespace,
      message,
      () => setIsCastingSnippet(false),
      (error: any) => console.error('Error closing snippet:', error)
    );
  } catch (error) {
    console.error('Error in closeSnippet:', error);
  }
}, [session, isConnected]);
```

#### 2. Update SwagPage with Cast Button

**File:** `ui-new/src/components/SwagPage.tsx`

Add Cast button to viewing dialog:

```tsx
{viewingSnippet && (
  <div className="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center p-4 z-50">
    <div className="bg-white dark:bg-gray-800 rounded-lg w-full max-w-4xl max-h-[90vh] flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b dark:border-gray-700">
        <h2 className="text-xl font-semibold dark:text-white">
          {viewingSnippet.name}
        </h2>
        <div className="flex gap-2">
          {/* Cast Button */}
          {isCastAvailable && (
            <button
              onClick={() => {
                if (isCastingSnippet) {
                  closeSnippet();
                } else {
                  castSnippet(viewingSnippet);
                }
              }}
              className={`px-3 py-1.5 text-sm rounded transition-colors ${
                isCastingSnippet
                  ? 'bg-blue-500 hover:bg-blue-600 text-white'
                  : 'bg-gray-200 hover:bg-gray-300 dark:bg-gray-700 dark:hover:bg-gray-600'
              }`}
              title={isCastingSnippet ? 'Stop casting' : `Cast to ${castDeviceName}`}
            >
              📺 {isCastingSnippet ? 'Stop Cast' : 'Cast'}
            </button>
          )}
          
          <button
            onClick={() => {
              if (isCastingSnippet) {
                closeSnippet();
              }
              setViewingSnippet(null);
            }}
            className="text-gray-500 hover:text-gray-700 dark:text-gray-400"
          >
            Close
          </button>
        </div>
      </div>

      {/* Content with scroll tracking */}
      <div
        id="snippet-content-container"
        className="flex-1 overflow-y-auto p-6"
        onScroll={(e) => {
          if (isCastingSnippet) {
            const target = e.target as HTMLDivElement;
            updateSnippetScroll(target.scrollTop);
          }
        }}
      >
        <MarkdownRenderer content={viewingSnippet.content} />
      </div>
    </div>
  </div>
)}
```

Add debounced scroll handler:

```typescript
// Debounce scroll updates
const scrollTimeoutRef = useRef<NodeJS.Timeout>();

const handleSnippetScroll = useCallback((position: number) => {
  if (scrollTimeoutRef.current) {
    clearTimeout(scrollTimeoutRef.current);
  }
  
  scrollTimeoutRef.current = setTimeout(() => {
    updateSnippetScroll(position);
  }, 100); // 100ms debounce
}, [updateSnippetScroll]);
```

#### 3. Update Chromecast Receiver

**File:** `docs/chromecast-receiver.html`

Add snippet container:

```html
<!-- Snippet Container -->
<div id="snippet-container">
  <div id="snippet-header">
    <h2 id="snippet-name"></h2>
    <div id="snippet-tags"></div>
  </div>
  <div id="snippet-content-wrapper">
    <div id="snippet-content"></div>
  </div>
</div>
```

Add styles:

```css
#snippet-container {
  position: fixed;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  z-index: 900;
  display: none;
  flex-direction: column;
}

#snippet-container.active {
  display: flex;
}

#snippet-header {
  padding: 40px;
  border-bottom: 2px solid rgba(255, 255, 255, 0.3);
}

#snippet-name {
  font-size: 48px;
  font-weight: 700;
  color: white;
  margin-bottom: 20px;
}

#snippet-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
}

#snippet-tags .tag {
  background: rgba(255, 255, 255, 0.2);
  padding: 8px 16px;
  border-radius: 20px;
  font-size: 20px;
  color: white;
}

#snippet-content-wrapper {
  flex: 1;
  overflow-y: auto;
  padding: 40px;
}

#snippet-content {
  background: rgba(255, 255, 255, 0.15);
  backdrop-filter: blur(10px);
  padding: 40px;
  border-radius: 20px;
  font-size: 28px;
  line-height: 1.8;
  color: white;
}

#snippet-content h1 {
  font-size: 48px;
  margin-bottom: 20px;
}

#snippet-content h2 {
  font-size: 40px;
  margin-bottom: 16px;
}

#snippet-content p {
  margin-bottom: 20px;
}

#snippet-content code {
  background: rgba(0, 0, 0, 0.3);
  padding: 4px 8px;
  border-radius: 4px;
  font-family: 'Courier New', monospace;
}

#snippet-content pre {
  background: rgba(0, 0, 0, 0.3);
  padding: 20px;
  border-radius: 10px;
  overflow-x: auto;
  margin-bottom: 20px;
}
```

Add JavaScript handler:

```javascript
const SNIPPET_NAMESPACE = 'urn:x-cast:com.lambdallmproxy.snippet';

const snippetContainer = document.getElementById('snippet-container');
const snippetName = document.getElementById('snippet-name');
const snippetTags = document.getElementById('snippet-tags');
const snippetContent = document.getElementById('snippet-content');
const snippetContentWrapper = document.getElementById('snippet-content-wrapper');

// Simple markdown to HTML converter for receiver
function renderMarkdown(markdown) {
  return markdown
    .replace(/^### (.*$)/gim, '<h3>$1</h3>')
    .replace(/^## (.*$)/gim, '<h2>$1</h2>')
    .replace(/^# (.*$)/gim, '<h1>$1</h1>')
    .replace(/\*\*(.*)\*\*/gim, '<strong>$1</strong>')
    .replace(/\*(.*)\*/gim, '<em>$1</em>')
    .replace(/```([^`]+)```/gim, '<pre><code>$1</code></pre>')
    .replace(/`([^`]+)`/gim, '<code>$1</code>')
    .replace(/\n/gim, '<br>');
}

function loadSnippet(data) {
  // Set name
  snippetName.textContent = data.name;
  
  // Set tags
  snippetTags.innerHTML = (data.tags || [])
    .map(tag => `<span class="tag">${tag}</span>`)
    .join('');
  
  // Set content (render markdown)
  snippetContent.innerHTML = renderMarkdown(data.content);
  
  // Show container
  snippetContainer.classList.add('active');
  
  // Hide other containers
  document.getElementById('container').style.display = 'none';
  document.getElementById('video-container').classList.remove('active');
  
  showStatus('Snippet loaded');
}

function scrollSnippet(position) {
  snippetContentWrapper.scrollTop = position;
}

function closeSnippetView() {
  snippetContainer.classList.remove('active');
  document.getElementById('container').style.display = 'flex';
  showStatus('Snippet closed');
}

// Handle snippet commands
context.addCustomMessageListener(SNIPPET_NAMESPACE, (event) => {
  console.log('Received snippet command:', event.data);
  
  const { command, data } = event.data;
  
  switch (command) {
    case 'load':
      loadSnippet(data);
      break;
    case 'scroll':
      scrollSnippet(data.position);
      break;
    case 'close':
      closeSnippetView();
      break;
    default:
      console.warn('Unknown snippet command:', command);
  }
});
```

### Testing

1. Open SWAG page
2. Connect to Chromecast
3. View a snippet
4. Click Cast button
5. Verify snippet appears full screen on TV
6. Scroll in browser
7. Verify TV scrolls in sync (with ~100ms delay)
8. Click Stop Cast
9. Verify TV returns to previous view

### Estimated Time

- CastContext extension: 2 hours
- SwagPage integration: 2 hours
- Receiver implementation: 3 hours
- Testing and refinement: 2 hours
- **Total: 9 hours**

---

## Implementation Priority

### High Priority (Must Have)
1. **Feature 1: Lambda disconnect detection** - Cost savings, resource efficiency
2. **Feature 2: SWAG tag selector styling** - Quick UI polish, high visibility

### Medium Priority (Nice to Have)
3. **Feature 4: Snippet casting** - Extends existing Chromecast functionality
4. **Feature 3: HDMI-CEC research** - Documentation only, hardware limitation

### Recommended Order

1. **Feature 2** (45min) - Quick win, visible improvement
2. **Feature 1** (7h) - Important for production use
3. **Feature 4** (9h) - Feature extension, good user experience
4. **Feature 3** (1.5h) - Documentation, no code required

**Total Estimated Time:** ~18 hours (2-3 days)

---

## Risk Assessment

### Feature 1: Lambda Disconnect

**Risks:**
- Lambda `streamifyResponse` may not detect disconnects reliably
- Write failures might be caught too late
- Heartbeat approach requires client code changes

**Mitigation:**
- Test thoroughly with network interruptions
- Add timeout-based fallback (max execution time)
- Log disconnect events for monitoring

### Feature 2: SWAG Styling

**Risks:**
- Minimal - simple CSS change
- May need adjustment on different screen sizes

**Mitigation:**
- Test on mobile, tablet, desktop
- Use Tailwind responsive classes

### Feature 3: HDMI-CEC

**Risks:**
- User expectations may not match technical limitations
- Cannot guarantee TV will switch input

**Mitigation:**
- Clear documentation of limitations
- Set proper expectations
- Provide troubleshooting guide

### Feature 4: Snippet Casting

**Risks:**
- Markdown rendering on receiver may be incomplete
- Scroll sync may feel laggy
- Large snippets may cause performance issues

**Mitigation:**
- Use simple markdown rendering (no complex features)
- Debounce scroll updates (100ms)
- Test with large snippets
- Add loading indicator

---

## Success Criteria

### Feature 1
- [ ] Lambda stops within 30s of client disconnect
- [ ] CloudWatch logs show "Client disconnected" messages
- [ ] Reduced Lambda execution time in metrics
- [ ] No errors in client console

### Feature 2
- [ ] Tag input is visibly smaller (1/3 previous width)
- [ ] Input appears inline with tag chips
- [ ] Still usable on mobile
- [ ] Tag addition works correctly

### Feature 3
- [ ] Documentation added with HDMI-CEC setup instructions
- [ ] Troubleshooting guide included
- [ ] Limitations clearly stated

### Feature 4
- [ ] Snippet displays full screen on TV
- [ ] Scroll syncs with <200ms delay
- [ ] Cast/Stop Cast buttons work correctly
- [ ] Markdown renders reasonably well
- [ ] Returns to previous view on stop

---

## Documentation Updates

### New Documents
- Lambda disconnect detection guide
- Snippet casting user guide

### Updated Documents
- `CHROMECAST_VIDEO_CASTING.md` - Add HDMI-CEC section
- `README.md` - Add snippet casting feature
- `TESTING.md` - Add disconnect detection tests

---

## Next Steps

1. **Review plan** with user
2. **Prioritize features** based on user needs
3. **Start with Feature 2** (quick win)
4. **Implement Feature 1** (critical for production)
5. **Consider Feature 4** if time permits
6. **Document Feature 3** limitations

