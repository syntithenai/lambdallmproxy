# Share Feature Implementation Plan

## Overview

Enable users to share chat conversations and individual LLM responses via URL-based sharing mechanism. Shared data includes messages, images, research plans, and can be distributed via social media, QR codes, or direct links.

## Table of Contents

1. [Architecture Overview](#architecture-overview)
2. [Data Structure](#data-structure)
3. [URL Encoding Strategy](#url-encoding-strategy)
4. [Share UI Components](#share-ui-components)
5. [Data Extraction & Restoration](#data-extraction--restoration)
6. [Security Considerations](#security-considerations)
7. [Technical Stack](#technical-stack)
8. [Implementation Steps](#implementation-steps)
9. [Testing Plan](#testing-plan)
10. [Future Enhancements](#future-enhancements)

---

## Architecture Overview

### Core Mechanism

**URL-Based Sharing**: Encode conversation data into URL query parameters for easy sharing without backend storage.

**Two Sharing Modes**:
1. **Full Conversation Share**: Entire chat conversation with all messages, images, and research plans
2. **Single Response Share**: First user prompt + selected assistant response

**Flow**:
```
User clicks "Share" → Data serialized → Compressed → Base64 encoded → 
Added to URL params → Share dialog opens → User selects share method → 
URL distributed → Recipient opens URL → Data extracted → Decompressed → 
Conversation restored → New chat created (or read-only view)
```

---

## Data Structure

### ShareData Interface

```typescript
interface ShareData {
  version: number;                    // Schema version for future compatibility
  timestamp: number;                  // Unix timestamp of share creation
  shareType: 'conversation' | 'response';
  
  // Conversation metadata
  metadata?: {
    title?: string;                   // Chat title
    model?: string;                   // Primary model used
    totalMessages?: number;           // Message count
  };
  
  // Messages
  messages: ShareMessage[];
  
  // Research plan (if applicable)
  plan?: {
    query: string;
    steps: string[];
    status: 'completed' | 'partial';
  };
}

interface ShareMessage {
  role: 'user' | 'assistant';
  content: string;
  
  // Optional fields
  timestamp?: number;
  model?: string;                     // Model used for this response
  images?: ShareImage[];              // Base64 images
  toolCalls?: ShareToolCall[];        // Tool calls made
}

interface ShareImage {
  data: string;                       // Base64 image data
  mimeType: string;                   // image/png, image/jpeg, etc.
  description?: string;               // Alt text or caption
}

interface ShareToolCall {
  name: string;                       // Tool name (e.g., 'web_search')
  parameters: Record<string, any>;    // Tool parameters
  result?: string;                    // Truncated result summary
}
```

### Example ShareData JSON

```json
{
  "version": 1,
  "timestamp": 1704067200,
  "shareType": "conversation",
  "metadata": {
    "title": "Python Web Scraping Tutorial",
    "model": "gpt-4o",
    "totalMessages": 4
  },
  "messages": [
    {
      "role": "user",
      "content": "How do I scrape a website with Python?",
      "timestamp": 1704067200
    },
    {
      "role": "assistant",
      "content": "Here's a comprehensive guide...",
      "timestamp": 1704067205,
      "model": "gpt-4o",
      "toolCalls": [
        {
          "name": "web_search",
          "parameters": {"query": "python web scraping tutorial"},
          "result": "Found 10 results..."
        }
      ]
    }
  ],
  "plan": {
    "query": "Create step-by-step web scraping tutorial",
    "steps": [
      "Research Python scraping libraries",
      "Explain BeautifulSoup basics",
      "Show example code",
      "Discuss legal considerations"
    ],
    "status": "completed"
  }
}
```

---

## URL Encoding Strategy

### Challenge: URL Length Limits

**Browser Limits**:
- **Chrome/Edge**: ~32,000 characters (TARGET LIMIT)
- **Firefox**: ~65,000 characters
- **Safari**: ~80,000 characters
- **Internet Explorer**: Not supported (deprecated browser)

**Recommendation**: Target **32,000 characters** (Chrome limit) for modern browsers.

### Compression Strategy

**Multi-Stage Compression**:

```typescript
function encodeShareData(data: ShareData): string {
  // 1. Serialize to JSON
  const json = JSON.stringify(data);
  
  // 2. Compress using LZ-String
  const compressed = LZString.compressToEncodedURIComponent(json);
  
  // 3. If still too long, truncate and add warning
  if (compressed.length > 32000) {
    // Fallback: Truncate messages but preserve first and last
    return handleLargeShare(data);
  }
  
  return compressed;
}

function decodeShareData(encoded: string): ShareData | null {
  try {
    // 1. Decompress
    const json = LZString.decompressFromEncodedURIComponent(encoded);
    
    // 2. Parse JSON
    const data = JSON.parse(json) as ShareData;
    
    // 3. Validate schema
    if (!validateShareData(data)) {
      throw new Error('Invalid share data format');
    }
    
    return data;
  } catch (error) {
    console.error('Failed to decode share data:', error);
    return null;
  }
}
```

### Fallback for Large Shares

**Option 1: Smart Message Truncation (Preserves Context)**

When compressed data exceeds 32K characters, intelligently truncate messages while preserving:
- **First user message** (original question/intent)
- **Last assistant response** (final answer)
- Middle messages as space allows

```typescript
function handleLargeShare(data: ShareData): string {
  if (data.messages.length <= 2) {
    // Can't truncate further - only first user + last assistant
    return LZString.compressToEncodedURIComponent(JSON.stringify(data));
  }
  
  // Strategy: Keep first user message and last assistant message
  // Fill middle with as many messages as fit
  const firstMessage = data.messages[0];
  const lastMessage = data.messages[data.messages.length - 1];
  
  // Start with just first and last
  let truncatedMessages = [firstMessage, lastMessage];
  let currentData = { ...data, messages: truncatedMessages };
  let compressed = LZString.compressToEncodedURIComponent(JSON.stringify(currentData));
  
  // Try adding messages from the middle, working backwards from the end
  for (let i = data.messages.length - 2; i > 0 && compressed.length < 32000; i--) {
    // Insert before last message
    truncatedMessages.splice(truncatedMessages.length - 1, 0, data.messages[i]);
    currentData = { ...data, messages: truncatedMessages };
    const testCompressed = LZString.compressToEncodedURIComponent(JSON.stringify(currentData));
    
    if (testCompressed.length > 32000) {
      // Too big, remove the message we just added
      truncatedMessages.splice(truncatedMessages.length - 2, 1);
      break;
    }
    
    compressed = testCompressed;
  }
  
  // Update metadata to indicate truncation
  const finalData: ShareData = {
    ...data,
    messages: truncatedMessages,
    metadata: {
      ...data.metadata,
      truncated: true,
      originalMessageCount: data.messages.length,
      includedMessageCount: truncatedMessages.length
    }
  };
  
  return LZString.compressToEncodedURIComponent(JSON.stringify(finalData));
}
```

**Truncation Display**:

When loading a truncated share, show notice:

```tsx
{shareData.metadata?.truncated && (
  <div className="bg-yellow-50 dark:bg-yellow-900/20 p-3 rounded-lg border border-yellow-200 dark:border-yellow-800 mb-4">
    <p className="text-sm font-semibold text-yellow-800 dark:text-yellow-200">
      ⚠️ Conversation Truncated
    </p>
    <p className="text-xs text-yellow-700 dark:text-yellow-300 mt-1">
      This shared conversation originally had {shareData.metadata.originalMessageCount} messages. 
      Due to URL length limits, only {shareData.metadata.includedMessageCount} messages are shown 
      (including the first question and final answer).
    </p>
  </div>
)}
```
```

**Option 2: External Storage (Future Enhancement)**

### URL Structure

**Format**:
```
https://yoursite.com/?share=<encoded_data>
```

**Example**:
```
https://yoursite.com/?share=N4IgdghgtgpiBcIDaABAGRgLYGcDOYBGAbgA...
```

---

## Share UI Components

### 1. Share Button in Chat

**Location**: Chat header or message actions toolbar

**Component**: `ShareButton.tsx`

```typescript
interface ShareButtonProps {
  conversationId?: string;          // For full conversation share
  messageId?: string;               // For single response share
  disabled?: boolean;
}

export function ShareButton({ conversationId, messageId, disabled }: ShareButtonProps) {
  const [showDialog, setShowDialog] = useState(false);
  
  const handleShare = () => {
    setShowDialog(true);
  };
  
  return (
    <>
      <button
        onClick={handleShare}
        disabled={disabled}
        className="flex items-center gap-2 px-3 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg"
      >
        <span>📤</span>
        <span>Share</span>
      </button>
      
      {showDialog && (
        <ShareDialog
          conversationId={conversationId}
          messageId={messageId}
          onClose={() => setShowDialog(false)}
        />
      )}
    </>
  );
}
```

### 2. Share Dialog

**Component**: `ShareDialog.tsx`

**Tabs**:
1. **Social Media**: Quick share to platforms
2. **QR Code**: Generate QR for mobile sharing
3. **Link**: Display full URL with copy button
4. **Embed**: iframe/script tag for websites

```typescript
interface ShareDialogProps {
  conversationId?: string;
  messageId?: string;
  onClose: () => void;
}

export function ShareDialog({ conversationId, messageId, onClose }: ShareDialogProps) {
  const [activeTab, setActiveTab] = useState<'social' | 'qr' | 'link' | 'embed'>('social');
  const [shareUrl, setShareUrl] = useState('');
  const [shareData, setShareData] = useState<ShareData | null>(null);
  
  useEffect(() => {
    // Generate share data and URL
    const data = conversationId 
      ? generateConversationShareData(conversationId)
      : generateResponseShareData(messageId!);
    
    setShareData(data);
    
    const encoded = encodeShareData(data);
    const url = `${window.location.origin}?share=${encoded}`;
    setShareUrl(url);
  }, [conversationId, messageId]);
  
  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl w-full max-w-2xl max-h-[80vh] overflow-y-auto">
        {/* Header */}
        <div className="p-4 border-b dark:border-gray-700 flex justify-between items-center">
          <h2 className="text-xl font-bold">Share Conversation</h2>
          <button onClick={onClose} className="text-gray-500 hover:text-gray-700">✕</button>
        </div>
        
        {/* Tabs */}
        <div className="flex gap-2 p-4 border-b dark:border-gray-700">
          <TabButton active={activeTab === 'social'} onClick={() => setActiveTab('social')}>
            📱 Social Media
          </TabButton>
          <TabButton active={activeTab === 'qr'} onClick={() => setActiveTab('qr')}>
            📷 QR Code
          </TabButton>
          <TabButton active={activeTab === 'link'} onClick={() => setActiveTab('link')}>
            🔗 Link
          </TabButton>
          <TabButton active={activeTab === 'embed'} onClick={() => setActiveTab('embed')}>
            💻 Embed
          </TabButton>
        </div>
        
        {/* Content */}
        <div className="p-4">
          {activeTab === 'social' && <SocialShareTab url={shareUrl} data={shareData} />}
          {activeTab === 'qr' && <QRCodeTab url={shareUrl} />}
          {activeTab === 'link' && <LinkTab url={shareUrl} />}
          {activeTab === 'embed' && <EmbedTab url={shareUrl} />}
        </div>
      </div>
    </div>
  );
}
```

### 3. Social Share Tab

**Component**: `SocialShareTab.tsx`

**Platforms**:
- Facebook
- Twitter/X
- LinkedIn
- Reddit
- WhatsApp
- Email
- Web Share API (mobile)

```typescript
interface SocialShareTabProps {
  url: string;
  data: ShareData | null;
}

export function SocialShareTab({ url, data }: SocialShareTabProps) {
  const title = data?.metadata?.title || 'Check out this AI conversation';
  const description = data?.messages[0]?.content.substring(0, 100) + '...' || '';
  
  const shareToFacebook = () => {
    window.open(`https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(url)}`, '_blank');
  };
  
  const shareToTwitter = () => {
    const text = `${title} - ${description}`;
    window.open(`https://twitter.com/intent/tweet?url=${encodeURIComponent(url)}&text=${encodeURIComponent(text)}`, '_blank');
  };
  
  const shareToLinkedIn = () => {
    window.open(`https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(url)}`, '_blank');
  };
  
  const shareToReddit = () => {
    window.open(`https://reddit.com/submit?url=${encodeURIComponent(url)}&title=${encodeURIComponent(title)}`, '_blank');
  };
  
  const shareToWhatsApp = () => {
    const text = `${title}: ${url}`;
    window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, '_blank');
  };
  
  const shareToEmail = () => {
    const subject = encodeURIComponent(title);
    const body = encodeURIComponent(`${description}\n\n${url}`);
    window.location.href = `mailto:?subject=${subject}&body=${body}`;
  };
  
  const shareNative = async () => {
    if (navigator.share) {
      try {
        await navigator.share({
          title,
          text: description,
          url
        });
      } catch (error) {
        console.error('Native share failed:', error);
      }
    }
  };
  
  return (
    <div className="grid grid-cols-2 gap-3">
      <SocialButton icon="📘" label="Facebook" onClick={shareToFacebook} color="bg-blue-600" />
      <SocialButton icon="🐦" label="Twitter" onClick={shareToTwitter} color="bg-sky-500" />
      <SocialButton icon="💼" label="LinkedIn" onClick={shareToLinkedIn} color="bg-blue-700" />
      <SocialButton icon="🔴" label="Reddit" onClick={shareToReddit} color="bg-orange-600" />
      <SocialButton icon="💬" label="WhatsApp" onClick={shareToWhatsApp} color="bg-green-600" />
      <SocialButton icon="✉️" label="Email" onClick={shareToEmail} color="bg-gray-600" />
      
      {navigator.share && (
        <SocialButton icon="📤" label="More..." onClick={shareNative} color="bg-purple-600" />
      )}
    </div>
  );
}

function SocialButton({ icon, label, onClick, color }: {
  icon: string;
  label: string;
  onClick: () => void;
  color: string;
}) {
  return (
    <button
      onClick={onClick}
      className={`${color} hover:opacity-90 text-white px-4 py-3 rounded-lg flex items-center gap-2 justify-center transition-opacity`}
    >
      <span>{icon}</span>
      <span className="font-medium">{label}</span>
    </button>
  );
}
```

### 4. QR Code Tab

**Component**: `QRCodeTab.tsx`

**Library**: `qrcode.react`

```typescript
import QRCode from 'qrcode.react';

interface QRCodeTabProps {
  url: string;
}

export function QRCodeTab({ url }: QRCodeTabProps) {
  const [downloadFormat, setDownloadFormat] = useState<'png' | 'svg'>('png');
  
  const downloadQR = () => {
    const canvas = document.getElementById('qr-canvas') as HTMLCanvasElement;
    if (canvas) {
      const url = canvas.toDataURL('image/png');
      const link = document.createElement('a');
      link.download = 'conversation-qr.png';
      link.href = url;
      link.click();
    }
  };
  
  return (
    <div className="flex flex-col items-center gap-4">
      <div className="bg-white p-4 rounded-lg">
        <QRCode
          id="qr-canvas"
          value={url}
          size={256}
          level="M"
          includeMargin={true}
        />
      </div>
      
      <p className="text-sm text-gray-600 dark:text-gray-400 text-center">
        Scan this QR code with your phone to open the shared conversation
      </p>
      
      <button
        onClick={downloadQR}
        className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg"
      >
        📥 Download QR Code
      </button>
    </div>
  );
}
```

### 5. Link Tab

**Component**: `LinkTab.tsx`

```typescript
interface LinkTabProps {
  url: string;
}

export function LinkTab({ url }: LinkTabProps) {
  const [copied, setCopied] = useState(false);
  
  const copyToClipboard = async () => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (error) {
      console.error('Failed to copy:', error);
    }
  };
  
  const urlLength = url.length;
  const isTooLong = urlLength > 32000;
  
  return (
    <div className="space-y-4">
      {isTooLong && (
        <div className="bg-red-50 dark:bg-red-900/20 p-3 rounded-lg border border-red-200 dark:border-red-800">
          <p className="text-sm font-semibold text-red-800 dark:text-red-200">⚠️ Error: URL Too Long</p>
          <p className="text-xs text-red-700 dark:text-red-300 mt-1">
            This URL is {urlLength} characters long, exceeding Chrome's 32K limit. 
            This should not happen - please report this as a bug.
          </p>
        </div>
      )}
      
      <div className="flex gap-2">
        <input
          type="text"
          value={url}
          readOnly
          className="flex-1 px-3 py-2 bg-gray-50 dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg text-sm font-mono"
        />
        <button
          onClick={copyToClipboard}
          className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg whitespace-nowrap"
        >
          {copied ? '✅ Copied!' : '📋 Copy'}
        </button>
      </div>
      
      <div className="text-xs text-gray-500 dark:text-gray-400 space-y-1">
        <p>URL Length: {urlLength.toLocaleString()} characters</p>
        <p>Browser Compatibility: {isTooLong ? '❌ Exceeds Chrome limit' : '✅ Compatible with Chrome, Firefox, Safari'}</p>
      </div>
    </div>
  );
}
```

### 6. Embed Tab

**Component**: `EmbedTab.tsx`

```typescript
interface EmbedTabProps {
  url: string;
}

export function EmbedTab({ url }: EmbedTabProps) {
  const [embedType, setEmbedType] = useState<'iframe' | 'script'>('iframe');
  const [copied, setCopied] = useState(false);
  
  const iframeCode = `<iframe src="${url}" width="100%" height="600" frameborder="0"></iframe>`;
  const scriptCode = `<script src="https://yoursite.com/embed.js" data-share-url="${url}"></script>`;
  
  const code = embedType === 'iframe' ? iframeCode : scriptCode;
  
  const copyCode = async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (error) {
      console.error('Failed to copy:', error);
    }
  };
  
  return (
    <div className="space-y-4">
      <div className="flex gap-2">
        <button
          onClick={() => setEmbedType('iframe')}
          className={`px-4 py-2 rounded-lg ${embedType === 'iframe' ? 'bg-blue-600 text-white' : 'bg-gray-200 dark:bg-gray-700'}`}
        >
          iframe
        </button>
        <button
          onClick={() => setEmbedType('script')}
          className={`px-4 py-2 rounded-lg ${embedType === 'script' ? 'bg-blue-600 text-white' : 'bg-gray-200 dark:bg-gray-700'}`}
        >
          Script Tag
        </button>
      </div>
      
      <div className="relative">
        <pre className="bg-gray-900 text-green-400 p-4 rounded-lg overflow-x-auto text-xs font-mono">
{code}
        </pre>
        <button
          onClick={copyCode}
          className="absolute top-2 right-2 px-3 py-1 bg-gray-700 hover:bg-gray-600 text-white rounded text-xs"
        >
          {copied ? '✅ Copied' : '📋 Copy'}
        </button>
      </div>
      
      <p className="text-xs text-gray-600 dark:text-gray-400">
        {embedType === 'iframe' 
          ? 'Embed this conversation directly in your website using an iframe'
          : 'Use a script tag for a more integrated embed experience'}
      </p>
    </div>
  );
}
```

---

## Data Extraction & Restoration

### URL Detection on App Load

**Component**: `App.tsx` (modification)

```typescript
useEffect(() => {
  // Check for shared data in URL
  const params = new URLSearchParams(window.location.search);
  const shareParam = params.get('share');
  
  if (shareParam) {
    handleSharedData(shareParam);
  }
}, []);

async function handleSharedData(encoded: string) {
  try {
    // Decode share data
    const data = decodeShareData(encoded);
    
    if (!data) {
      toast.error('Invalid share link');
      return;
    }
    
    // Sanitize content for XSS protection
    const sanitized = sanitizeShareData(data);
    
    // Create new conversation from shared data
    const conversationId = await createConversationFromShare(sanitized);
    
    // Navigate to new conversation
    navigate(`/chat/${conversationId}`);
    
    // Clean URL (remove share param)
    window.history.replaceState({}, '', window.location.pathname);
    
    toast.success('Shared conversation loaded!');
  } catch (error) {
    console.error('Failed to load shared data:', error);
    toast.error('Failed to load shared conversation');
  }
}
```

### Creating Conversation from Share Data

```typescript
async function createConversationFromShare(data: ShareData): Promise<string> {
  // Create new conversation in IndexedDB
  const conversation: Conversation = {
    id: generateId(),
    title: data.metadata?.title || 'Shared Conversation',
    messages: data.messages.map(msg => ({
      ...msg,
      id: generateId(),
      timestamp: msg.timestamp || Date.now()
    })),
    createdAt: Date.now(),
    updatedAt: Date.now(),
    metadata: {
      ...data.metadata,
      isShared: true,
      sharedFrom: window.location.href,
      sharedAt: data.timestamp
    }
  };
  
  // Save to IndexedDB
  await db.conversations.add(conversation);
  
  return conversation.id;
}
```

### XSS Protection

```typescript
import DOMPurify from 'dompurify';

function sanitizeShareData(data: ShareData): ShareData {
  return {
    ...data,
    messages: data.messages.map(msg => ({
      ...msg,
      content: DOMPurify.sanitize(msg.content),
      images: msg.images?.map(img => ({
        ...img,
        description: img.description ? DOMPurify.sanitize(img.description) : undefined
      }))
    })),
    plan: data.plan ? {
      ...data.plan,
      query: DOMPurify.sanitize(data.plan.query),
      steps: data.plan.steps.map(step => DOMPurify.sanitize(step))
    } : undefined
  };
}
```

---

## Security Considerations

### 1. XSS Protection

**Threat**: Malicious actors could inject JavaScript in shared content

**Mitigation**:
- Use `DOMPurify.sanitize()` on all text content before rendering
- Validate base64 images are valid image data
- Escape HTML in message content
- Use React's built-in XSS protection (JSX auto-escaping)

### 2. Data Validation

**Threat**: Invalid or malformed share data could crash the app

**Mitigation**:
```typescript
function validateShareData(data: any): data is ShareData {
  if (typeof data !== 'object' || data === null) return false;
  if (typeof data.version !== 'number') return false;
  if (typeof data.timestamp !== 'number') return false;
  if (!['conversation', 'response'].includes(data.shareType)) return false;
  if (!Array.isArray(data.messages)) return false;
  
  // Validate each message
  for (const msg of data.messages) {
    if (!['user', 'assistant'].includes(msg.role)) return false;
    if (typeof msg.content !== 'string') return false;
  }
  
  return true;
}
```

### 3. Image Size Limits

**Threat**: Large base64 images could exceed URL limits

**Mitigation**:
- Compress images before encoding
- Limit image count in share data
- Resize images to reasonable dimensions (max 800x800)
- Warn users if share data exceeds size limits

### 4. Privacy Warnings

**Threat**: Users may accidentally share sensitive information

**Mitigation**:
- Show preview of what will be shared
- Add prominent warning: "This will create a public link with your conversation"
- Option to review and edit messages before sharing
- Highlight potentially sensitive content (emails, phone numbers, API keys)

---

## Technical Stack

### Required npm Packages

```bash
npm install lz-string          # Compression
npm install qrcode.react        # QR code generation
npm install dompurify           # XSS protection
npm install @types/dompurify    # TypeScript types
```

### Browser APIs

- **Web Share API**: Native mobile sharing (`navigator.share`)
- **Clipboard API**: Copy to clipboard (`navigator.clipboard.writeText`)
- **URLSearchParams**: Parse URL parameters
- **Canvas API**: QR code rendering and download

---

## Implementation Steps

### Phase 1: Core Infrastructure (Week 1)

1. **Create Data Structures**
   - Define TypeScript interfaces (`ShareData`, `ShareMessage`, etc.)
   - Create encoding/decoding utility functions
   - Add compression/decompression logic
   - Implement validation functions

2. **Build URL Handler**
   - Add URL parameter detection in `App.tsx`
   - Create `handleSharedData()` function
   - Implement `createConversationFromShare()`
   - Add XSS sanitization with DOMPurify

3. **Test Core Mechanism**
   - Create unit tests for encoding/decoding
   - Test compression ratio on sample data
   - Verify URL length limits
   - Test XSS protection

### Phase 2: UI Components (Week 2)

4. **Share Button Component**
   - Add share button to chat header
   - Add share button to individual messages
   - Implement click handlers
   - Add loading states

5. **Share Dialog Component**
   - Create modal dialog with tabs
   - Implement tab navigation
   - Add close handlers
   - Style for dark mode

6. **Social Share Tab**
   - Add social media buttons
   - Implement platform-specific share URLs
   - Add Web Share API integration
   - Test on mobile devices

### Phase 3: Advanced Features (Week 3)

7. **QR Code Tab**
   - Integrate `qrcode.react`
   - Add QR code rendering
   - Implement download functionality
   - Add customization options (size, error correction)

8. **Link Tab**
   - Display generated URL
   - Add copy-to-clipboard button
   - Show URL length warning
   - Add compatibility information

9. **Embed Tab**
   - Generate iframe embed code
   - Generate script tag embed code
   - Add copy functionality
   - Create embed documentation

### Phase 4: Polish & Testing (Week 4)

10. **Error Handling**
    - Add error boundaries
    - Implement fallbacks for failed shares
    - Add user-friendly error messages
    - Log errors for debugging

11. **Performance Optimization**
    - Lazy load share dialog
    - Debounce URL generation
    - Optimize image compression
    - Cache encoded URLs

12. **Comprehensive Testing**
    - Test all share platforms
    - Verify mobile functionality
    - Test URL length edge cases
    - Security audit (XSS, injection)

---

## Testing Plan

### Unit Tests

```typescript
describe('Share Encoding', () => {
  test('encodes and decodes simple message', () => {
    const data: ShareData = {
      version: 1,
      timestamp: Date.now(),
      shareType: 'response',
      messages: [
        { role: 'user', content: 'Hello' },
        { role: 'assistant', content: 'Hi there!' }
      ]
    };
    
    const encoded = encodeShareData(data);
    const decoded = decodeShareData(encoded);
    
    expect(decoded).toEqual(data);
  });
  
  test('handles images in messages', () => {
    const data: ShareData = {
      version: 1,
      timestamp: Date.now(),
      shareType: 'conversation',
      messages: [
        {
          role: 'user',
          content: 'Check this image',
          images: [{ data: 'base64...', mimeType: 'image/png' }]
        }
      ]
    };
    
    const encoded = encodeShareData(data);
    const decoded = decodeShareData(encoded);
    
    expect(decoded?.messages[0].images?.[0].data).toBe('base64...');
  });
  
  test('sanitizes XSS attempts', () => {
    const malicious: ShareData = {
      version: 1,
      timestamp: Date.now(),
      shareType: 'response',
      messages: [
        { role: 'user', content: '<script>alert("xss")</script>' }
      ]
    };
    
    const sanitized = sanitizeShareData(malicious);
    expect(sanitized.messages[0].content).not.toContain('<script>');
  });
});
```

### Integration Tests

```typescript
describe('Share Flow', () => {
  test('full conversation share and restore', async () => {
    // 1. Create conversation
    const conversation = await createTestConversation();
    
    // 2. Generate share URL
    const shareUrl = generateShareUrl(conversation.id);
    
    // 3. Extract share param
    const params = new URLSearchParams(new URL(shareUrl).search);
    const encoded = params.get('share')!;
    
    // 4. Decode and restore
    const restored = await createConversationFromShare(decodeShareData(encoded)!);
    
    // 5. Verify messages match
    expect(restored.messages).toEqual(conversation.messages);
  });
});
```

### Manual Testing Checklist

- [ ] Share button appears in chat
- [ ] Share dialog opens on click
- [ ] All tabs render correctly
- [ ] Social media buttons open correct platforms
- [ ] QR code generates and downloads
- [ ] Copy link button works
- [ ] Embed codes are valid
- [ ] Shared URL loads correctly
- [ ] Messages appear in new conversation
- [ ] Images display properly
- [ ] Dark mode styling correct
- [ ] Mobile responsive design
- [ ] URL length warning shows for large shares
- [ ] XSS attempts are blocked
- [ ] Invalid share URLs show error

---

## Future Enhancements

### 1. External Storage Backend

For shares exceeding URL limits:

```typescript
async function saveShareToBackend(data: ShareData): Promise<string> {
  const response = await fetch('https://api.yoursite.com/shares', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data)
  });
  
  const { shareId } = await response.json();
  return shareId; // e.g., "abc123xyz"
}

// Short URL: https://yoursite.com/s/abc123xyz
```

### 2. Share Analytics

Track share performance:
- Number of shares created
- Most shared conversations
- Share platform distribution
- Share engagement metrics

### 3. Expiring Shares

Add time-limited shares:
```typescript
interface ShareData {
  // ...existing fields
  expiresAt?: number;  // Unix timestamp
}
```

### 4. Private Shares with Passwords

Encrypt share data with password:
```typescript
function encryptShareData(data: ShareData, password: string): string {
  const encrypted = CryptoJS.AES.encrypt(JSON.stringify(data), password).toString();
  return LZString.compressToEncodedURIComponent(encrypted);
}
```

### 5. Share Customization

Allow users to:
- Select specific messages to share
- Redact sensitive information
- Add custom preview image
- Set custom Open Graph metadata

### 6. Social Media Previews

Generate rich previews with Open Graph tags:
```html
<meta property="og:title" content="AI Conversation: Python Web Scraping" />
<meta property="og:description" content="Learn how to scrape websites with Python..." />
<meta property="og:image" content="https://yoursite.com/share-preview.png" />
<meta property="og:url" content="https://yoursite.com/?share=..." />
```

### 7. Share Templates

Predefined share formats:
- Code snippet share (syntax highlighted)
- Research summary share (formatted with sources)
- Tutorial share (step-by-step format)

---

## Success Metrics

**User Adoption**:
- % of conversations shared
- Average shares per user
- Share method distribution

**Technical Performance**:
- URL generation time < 100ms
- Share load time < 500ms
- Compression ratio > 50%
- Error rate < 1%

**User Satisfaction**:
- Share success rate
- User feedback scores
- Support tickets related to sharing

---

## Conclusion

This comprehensive plan provides a solid foundation for implementing URL-based sharing of chat conversations and individual LLM responses. The approach balances:

✅ **Simplicity**: No backend storage required for basic shares  
✅ **Flexibility**: Multiple sharing methods (social, QR, link, embed)  
✅ **Security**: XSS protection and data validation  
✅ **Scalability**: Fallback to external storage for large shares  
✅ **User Experience**: Intuitive UI with previews and warnings  

**Recommended Implementation Timeline**: 4 weeks  
**Technical Complexity**: Medium  
**User Impact**: High  

---

## Appendix: Code Examples

### Complete Encoding/Decoding Module

```typescript
// src/utils/shareEncoding.ts

import LZString from 'lz-string';
import DOMPurify from 'dompurify';

export interface ShareData {
  version: number;
  timestamp: number;
  shareType: 'conversation' | 'response';
  metadata?: {
    title?: string;
    model?: string;
    totalMessages?: number;
    truncated?: boolean;
    originalMessageCount?: number;
  };
  messages: ShareMessage[];
  plan?: {
    query: string;
    steps: string[];
    status: 'completed' | 'partial';
  };
}

export interface ShareMessage {
  role: 'user' | 'assistant';
  content: string;
  timestamp?: number;
  model?: string;
  images?: ShareImage[];
  toolCalls?: ShareToolCall[];
}

export interface ShareImage {
  data: string;
  mimeType: string;
  description?: string;
}

export interface ShareToolCall {
  name: string;
  parameters: Record<string, any>;
  result?: string;
}

const MAX_URL_LENGTH = 32000; // Chrome limit
const SCHEMA_VERSION = 1;

export function encodeShareData(data: ShareData): string {
  // Ensure version is set
  const versionedData = { ...data, version: SCHEMA_VERSION };
  
  // Serialize to JSON
  const json = JSON.stringify(versionedData);
  
  // Compress using LZ-String
  const compressed = LZString.compressToEncodedURIComponent(json);
  
  // Check length
  if (compressed.length > MAX_URL_LENGTH) {
    console.warn(`Share URL too long (${compressed.length} chars), truncating...`);
    return handleLargeShare(versionedData);
  }
  
  return compressed;
}

export function decodeShareData(encoded: string): ShareData | null {
  try {
    // Decompress
    const json = LZString.decompressFromEncodedURIComponent(encoded);
    
    if (!json) {
      throw new Error('Failed to decompress share data');
    }
    
    // Parse JSON
    const data = JSON.parse(json) as ShareData;
    
    // Validate schema
    if (!validateShareData(data)) {
      throw new Error('Invalid share data format');
    }
    
    return data;
  } catch (error) {
    console.error('Failed to decode share data:', error);
    return null;
  }
}

export function validateShareData(data: any): data is ShareData {
  if (typeof data !== 'object' || data === null) return false;
  if (typeof data.version !== 'number') return false;
  if (typeof data.timestamp !== 'number') return false;
  if (!['conversation', 'response'].includes(data.shareType)) return false;
  if (!Array.isArray(data.messages)) return false;
  
  // Validate each message
  for (const msg of data.messages) {
    if (!['user', 'assistant'].includes(msg.role)) return false;
    if (typeof msg.content !== 'string') return false;
  }
  
  return true;
}

export function sanitizeShareData(data: ShareData): ShareData {
  return {
    ...data,
    metadata: data.metadata ? {
      ...data.metadata,
      title: data.metadata.title ? DOMPurify.sanitize(data.metadata.title) : undefined
    } : undefined,
    messages: data.messages.map(msg => ({
      ...msg,
      content: DOMPurify.sanitize(msg.content),
      images: msg.images?.map(img => ({
        ...img,
        description: img.description ? DOMPurify.sanitize(img.description) : undefined
      }))
    })),
    plan: data.plan ? {
      ...data.plan,
      query: DOMPurify.sanitize(data.plan.query),
      steps: data.plan.steps.map(step => DOMPurify.sanitize(step))
    } : undefined
  };
}

function handleLargeShare(data: ShareData): string {
  if (data.messages.length <= 2) {
    // Can't truncate further - only first user + last assistant
    return LZString.compressToEncodedURIComponent(JSON.stringify(data));
  }
  
  // Strategy: Keep first user message and last assistant message
  // Fill middle with as many messages as fit within 32K limit
  const firstMessage = data.messages[0];
  const lastMessage = data.messages[data.messages.length - 1];
  
  // Start with just first and last
  let truncatedMessages = [firstMessage, lastMessage];
  let currentData = { ...data, messages: truncatedMessages };
  let compressed = LZString.compressToEncodedURIComponent(JSON.stringify(currentData));
  
  // Try adding messages from the end, working backwards
  for (let i = data.messages.length - 2; i > 0 && compressed.length < MAX_URL_LENGTH; i--) {
    // Insert before last message
    truncatedMessages.splice(truncatedMessages.length - 1, 0, data.messages[i]);
    currentData = { ...data, messages: truncatedMessages };
    const testCompressed = LZString.compressToEncodedURIComponent(JSON.stringify(currentData));
    
    if (testCompressed.length > MAX_URL_LENGTH) {
      // Too big, remove the message we just added
      truncatedMessages.splice(truncatedMessages.length - 2, 1);
      break;
    }
    
    compressed = testCompressed;
  }
  
  // Update metadata to indicate truncation
  const finalData: ShareData = {
    ...data,
    messages: truncatedMessages,
    metadata: {
      ...data.metadata,
      truncated: true,
      originalMessageCount: data.messages.length,
      includedMessageCount: truncatedMessages.length
    }
  };
  
  return LZString.compressToEncodedURIComponent(JSON.stringify(finalData));
}

export function generateShareUrl(data: ShareData): string {
  const encoded = encodeShareData(data);
  const baseUrl = window.location.origin;
  return `${baseUrl}?share=${encoded}`;
}
```

---

**END OF PLAN**
