# Research Agent - Browser Extension

AI-powered research assistant that helps you understand, summarize, and explore web content directly in your browser.

## Features

### 🎯 Context Menu Integration
- **Research selected text**: Right-click any text → "Research with AI"
- **Summarize pages**: Right-click → "Summarize this page"
- **Extract main points**: Automatically extract key information
- **Explain simply**: Get ELI5 explanations
- **Find related topics**: Discover connected information

### 📱 Sidebar Panel
- Full chat interface embedded in browser
- Persistent across page navigation
- Conversation history saved locally
- Seamless integration with web app

### ⚡ Inline Research Button
- Appears when you select text (10-500 chars)
- One-click research without context menu
- Auto-hides after 5 seconds

### 🚀 Quick Popup
- Access via extension icon click
- Quick research input
- Recent conversations
- Fast actions (summarize, extract, explain)

### ⚙️ Settings Page
- Configure API endpoint (Lambda URL)
- Set authentication (Google OAuth token)
- Customize behavior (auto-open, delays)
- Privacy controls (clear history)
- Storage usage display

## Installation

### From Chrome Web Store (Coming Soon)

Visit the Chrome Web Store and click "Add to Chrome" (link coming after publication).

### From Source (Development)

1. **Clone the repository**:
   ```bash
   cd extension/
   ```

2. **Install dependencies**:
   ```bash
   npm install
   ```

3. **Create icons** (one-time):
   ```bash
   npm run icons
   ```

4. **Build the extension**:
   ```bash
   npm run build
   ```

5. **Load in Chrome**:
   - Open `chrome://extensions/`
   - Enable "Developer mode" (top-right toggle)
   - Click "Load unpacked"
   - Select the `dist/` folder

4. **Configure API**:
   - Click the extension icon
   - Click Settings (gear icon)
   - Enter your Lambda URL and API key
   - Save settings

### From Chrome Web Store (Coming Soon)
- Search for "Research Agent" in Chrome Web Store
- Click "Add to Chrome"

## Configuration

The extension requires:
- **Lambda URL**: Your AWS Lambda function URL
- **API Key**: Authentication token for backend

Example configuration:
```
Lambda URL: https://your-lambda-url.us-east-1.on.aws
API Key: your-google-oauth-token
```

## Usage

### Method 1: Context Menu
1. Select text on any webpage
2. Right-click → "Research with AI"
3. Sidebar opens with research results

### Method 2: Inline Button
1. Select text (10-500 characters)
2. Click the blue "Research" button that appears
3. Results appear in sidebar

### Method 3: Popup
1. Click extension icon in toolbar
2. Type or paste your question
3. Click "Research"
4. Sidebar opens with answer

### Method 4: Sidebar Direct
1. Click extension icon (or use keyboard shortcut)
2. Type question in sidebar chat
3. Press Ctrl+Enter (or Cmd+Enter) to send

## Architecture

```
extension/
├── manifest.json           # Extension configuration (Manifest V3)
├── src/
│   ├── background.js       # Service worker (context menus, API calls)
│   ├── content-script.js   # Runs on pages (inline button, extraction)
│   ├── popup.js            # Popup UI logic
│   ├── sidebar.js          # Sidebar chat logic
│   └── api/                # API integration modules
├── public/
│   ├── popup.html          # Popup UI
│   ├── popup.css           # Popup styles
│   ├── sidebar.html        # Sidebar UI
│   └── sidebar.css         # Sidebar styles
├── icons/                  # Extension icons (16, 48, 128px)
├── dist/                   # Built extension (generated)
└── scripts/
    ├── build.js            # Build script
    └── pack.js             # Packaging script
```

## Development

### Build Commands

```bash
# Build extension once
npm run build

# Build and watch for changes (future)
npm run watch

# Create .zip package for distribution
npm run pack
```

### Testing

1. **Load unpacked extension** in Chrome
2. **Open DevTools**:
   - Background script: `chrome://extensions/` → Details → "Inspect views: background page"
   - Popup: Right-click popup → Inspect
   - Sidebar: Open sidebar → Right-click → Inspect
   - Content script: Regular page DevTools → check console
3. **Test features**:
   - Select text → right-click → verify context menu
   - Select text → verify inline button appears
   - Click extension icon → verify popup works
   - Open sidebar → test chat interface

### Debugging

**Background script logs**:
```javascript
// Check background.js console
chrome://extensions/ → Research Agent → Inspect views: background page
```

**Content script logs**:
```javascript
// Check page console
Open any page → F12 → Console → Look for "Research Agent: Content script loaded"
```

**Sidebar logs**:
```javascript
// Check sidebar console
Open sidebar → Right-click in sidebar → Inspect
```

## Browser Compatibility

| Browser | Status | Notes |
|---------|--------|-------|
| Chrome 88+ | ✅ Full support | Recommended |
| Edge 88+ | ✅ Full support | Chromium-based |
| Firefox 109+ | ⚠️ Partial | Side Panel API not available |
| Safari 17+ | ❌ Not yet | Different extension API |

### Firefox Support (Future)

Firefox does not support the Side Panel API. Alternatives:
- Use popup as main interface
- Open in new tab instead of sidebar
- Use webextension-polyfill for cross-browser compatibility

## Permissions

The extension requests:

| Permission | Purpose |
|------------|---------|
| `activeTab` | Access current page content |
| `contextMenus` | Add right-click menu items |
| `storage` | Save settings and conversation history |
| `scripting` | Inject content scripts for extraction |
| `sidePanel` | Display sidebar chat interface |

**Host Permissions**:
- `*.amazonaws.com` - Access Lambda backend
- `*.github.io` - Access web app

## Privacy & Security

- **No tracking**: No analytics or user tracking
- **Local storage**: Conversations saved in browser only
- **No data collection**: Extension does not collect or share user data
- **Secure communication**: HTTPS only for API calls
- **Minimal permissions**: Only requests necessary permissions

## Troubleshooting

### Context menu not appearing
- Check that extension is enabled
- Refresh the page
- Verify permissions granted

### Inline button not showing
- Ensure you selected 10-500 characters
- Check content-script.js loaded (console message)
- Try on a different website

### Sidebar won't open
- Chrome 88+ required for Side Panel API
- Check extension permissions
- Try clicking extension icon instead

### API errors
- Verify Lambda URL and API key in settings
- Check network tab for API request details
- Ensure backend is running and accessible

### "Manifest version 3 required"
- Update Chrome to version 88+
- Extension uses Manifest V3 (current standard)

## Roadmap

### v1.1 (Next Release)
- [ ] Firefox compatibility (webextension-polyfill)
- [ ] Keyboard shortcuts (Ctrl+Shift+R)
- [ ] Dark mode support
- [ ] Export conversation to Markdown

### v1.2
- [ ] React integration for sidebar
- [ ] Better content extraction (Readability.js)
- [ ] Conversation search
- [ ] Multiple conversation threads

### v2.0
- [ ] Offline support
- [ ] Custom prompts library
- [ ] Notion/Obsidian integration
- [ ] Collaborative research (share conversations)

## Contributing

1. Fork the repository
2. Create feature branch: `git checkout -b feature/my-feature`
3. Make changes
4. Test thoroughly
5. Submit pull request

## License

MIT License - See LICENSE file for details

## Support

- **Issues**: GitHub Issues
- **Documentation**: `developer_log/PLAN_BROWSER_EXTENSION.md`
- **Web App**: https://syntithenai.github.io/lambdallmproxy

---

**Version**: 1.0.0  
**Status**: ✅ MVP Complete  
**Last Updated**: 2025-01-28
