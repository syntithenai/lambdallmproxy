# Chrome Web Store Listing - Content

## Store Listing Information

### Basic Information

**Extension Name**: Research Agent - AI Assistant

**Category**: Productivity

**Language**: English

**Visibility**: Public

---

## Short Description (132 characters max)

AI-powered research assistant. Instantly research, summarize, and explore web content with context menu, sidebar, and inline tools.

---

## Detailed Description (16,000 characters max)

### Overview

Research Agent is your intelligent AI-powered research assistant, built right into Chrome. Transform the way you browse and learn with instant access to AI research capabilities through context menus, sidebar chat, inline buttons, and quick popup actions.

### 🌟 Key Features

**🔍 Context Menu Integration**
Right-click on any selected text to instantly:
- Research the selected topic with AI
- Summarize the current page
- Extract main points from articles
- Get simple explanations (ELI5 style)
- Find related topics and resources

**💬 Sidebar Chat Interface**
Full-featured AI chat panel that:
- Stays persistent across page navigation
- Saves conversation history locally
- Provides detailed, context-aware responses
- Supports follow-up questions
- Works alongside your browsing

**⚡ Inline Research Button**
Select 10-500 characters of text and see an inline button appear instantly:
- One-click research without right-clicking
- Auto-hides after 5 seconds (configurable)
- Minimal disruption to your workflow
- Works on any webpage

**🎯 Quick Popup Actions**
Click the extension icon for instant access to:
- Quick research input
- Summarize current page
- Extract key points
- Get simple explanations
- Open sidebar for detailed chat

**⚙️ Comprehensive Settings**
Customize your experience with:
- API endpoint configuration (Lambda URL)
- Authentication setup (Google OAuth)
- Auto-open sidebar preferences
- Inline button delay settings
- Enable/disable specific features
- Privacy controls

### 🎓 Perfect For

- **Students**: Research topics, understand complex concepts, get explanations
- **Researchers**: Quickly summarize papers, extract key points, explore related work
- **Professionals**: Analyze documents, get insights, save time on reading
- **Writers**: Research topics, fact-check, find related information
- **Curious Minds**: Learn anything, anytime, with AI assistance

### 🛠️ How It Works

1. **Install the extension** from Chrome Web Store
2. **Configure your backend** (Lambda URL or GitHub Pages)
3. **Start researching** - right-click, select text, or use popup
4. **Get AI-powered answers** instantly in sidebar
5. **Continue conversations** with persistent chat history

### 💡 Usage Examples

**Example 1: Quick Research**
- Select text: "quantum computing"
- Right-click → "Research with AI"
- Sidebar opens with AI explanation

**Example 2: Page Summary**
- Reading a long article
- Click extension icon → "Summarize Page"
- Get concise summary in seconds

**Example 3: Continuous Learning**
- Ask initial question in sidebar
- Get detailed response
- Ask follow-up questions
- Build on previous context

**Example 4: Inline Research**
- Select interesting phrase while reading
- Inline button appears automatically
- Click to research without interruption
- Return to reading seamlessly

### 🔒 Privacy & Security

**Your Privacy Matters**
- ✅ All conversations stored **locally** in your browser only
- ✅ **No tracking** or analytics collection
- ✅ **No data sold** to third parties
- ✅ Settings synced only via Chrome Sync (optional)
- ✅ Open source backend (https://github.com/syntithenai/lambdallmproxy)

**Data Storage**
- Conversations: Chrome's local storage (your device only)
- Settings: Chrome's sync storage (synced across your devices if enabled)
- API calls: Sent only to your configured backend server

**Permissions Explained**
- `activeTab`: Access current page content when you trigger actions
- `contextMenus`: Add right-click menu items
- `storage`: Save settings and conversation history
- `scripting`: Inject inline button on text selection
- `sidePanel`: Display sidebar chat interface (Chrome 88+)

### 🌐 Browser Compatibility

**Fully Supported**:
- ✅ Chrome 88+ (Recommended)
- ✅ Microsoft Edge 88+
- ✅ Brave Browser
- ✅ Other Chromium-based browsers

**Requires**:
- Chrome 88 or later (for Side Panel API)
- Internet connection (for API calls)
- Configured backend server (self-hosted or cloud)

### 🔧 Technical Details

**Manifest Version**: V3 (latest Chrome standard)

**Architecture**:
- Service Worker background script (event-driven)
- Content scripts (lightweight page injection)
- Side Panel API (persistent sidebar)
- Chrome Storage API (data persistence)

**Backend Options**:
- AWS Lambda (serverless)
- GitHub Pages (static + CORS)
- Self-hosted server
- Local development (localhost:3000)

### 📚 Setup Guide

**1. Install Extension**
- Click "Add to Chrome"
- Grant permissions when prompted

**2. Configure Backend**
- Click extension icon → Settings (gear icon)
- Enter your Lambda URL or GitHub Pages URL
- Optionally add API key for authentication
- Save settings

**3. Start Using**
- Right-click on selected text
- Use inline button on text selection
- Click extension icon for quick actions
- Open sidebar for detailed conversations

**Need a Backend?**
Visit our GitHub repository for:
- Step-by-step setup instructions
- AWS Lambda deployment guide
- GitHub Pages configuration
- Local development setup

Repository: https://github.com/syntithenai/lambdallmproxy

### 🆘 Support & Troubleshooting

**Common Issues**:

**Problem**: Extension not connecting to backend
- **Solution**: Check backend URL in settings, ensure server is running

**Problem**: Context menu items not appearing
- **Solution**: Check settings → Enable context menu actions

**Problem**: Inline button not showing
- **Solution**: Select 10-500 characters of text, check settings

**Problem**: Conversations not saving
- **Solution**: Check Chrome's storage permissions

**Get Help**:
- 📖 Documentation: https://github.com/syntithenai/lambdallmproxy
- 🐛 Report Issues: https://github.com/syntithenai/lambdallmproxy/issues
- 💬 Discussions: https://github.com/syntithenai/lambdallmproxy/discussions

### 🚀 Future Roadmap

**v1.1** (Next Release):
- Firefox compatibility
- Keyboard shortcuts (Ctrl+Shift+R)
- Dark mode support
- Export conversations to Markdown/PDF

**v1.2**:
- React-based sidebar UI
- Better content extraction (Readability.js)
- Multiple conversation threads
- Voice input support

**v2.0**:
- Offline mode with queue
- Custom prompts library
- Notion integration
- Obsidian integration
- Collaborative research

### 📄 License

Open source under MIT License. See repository for details.

### 🙏 Acknowledgments

Built with modern web APIs and open standards. Powered by AI language models through your configured backend.

---

**Ready to supercharge your research?**

Install Research Agent now and transform your browsing experience with AI-powered insights at your fingertips!

---

## Additional Store Fields

### Screenshots Captions

**Screenshot 1**: Right-click context menu with AI research options on any selected text

**Screenshot 2**: Persistent sidebar chat interface with conversation history and AI responses

**Screenshot 3**: Inline research button appears automatically on text selection

**Screenshot 4**: Quick popup interface for instant access to AI features

**Screenshot 5**: Comprehensive settings page for customizing your experience

---

## Privacy Policy

### Research Agent Extension - Privacy Policy

**Last Updated**: January 2025

**Data Collection**
Research Agent does NOT collect, transmit, or store any personal data on external servers.

**Local Storage**
- Conversation history is stored locally in your browser using Chrome's Storage API
- Settings are stored in Chrome Sync (optional, controlled by browser settings)
- No data leaves your device except API calls to your configured backend

**API Calls**
- Research queries are sent to YOUR configured backend server
- We do not operate any backend servers
- You control where your data is sent

**Third-Party Services**
- Extension connects only to URLs you configure
- No analytics or tracking services used
- No data sold or shared with third parties

**Permissions**
- `activeTab`: Access page content only when you trigger actions
- `contextMenus`: Add right-click menu items
- `storage`: Save settings and conversation history locally
- `scripting`: Inject inline button on text selection
- `sidePanel`: Display sidebar interface

**Your Rights**
- Clear conversation history anytime (Settings → Clear History)
- Uninstall extension to remove all local data
- View source code: https://github.com/syntithenai/lambdallmproxy

**Contact**
For privacy questions: [Your Email or GitHub Issues URL]

---

## Support Email

support@[your-domain].com

(or GitHub Issues: https://github.com/syntithenai/lambdallmproxy/issues)

---

## Developer Website

https://github.com/syntithenai/lambdallmproxy

---

## Tags/Keywords

ai assistant, research tool, productivity, summarize, context menu, sidebar, chat, artificial intelligence, study tool, learning, knowledge, reading assistant, web research, text analysis, content extraction

---

## Promotional Tile Text

**Small Tile (440x280)**:
```
Research Agent
AI Research Assistant

✓ Instant Research
✓ Smart Summaries  
✓ Context Menu
✓ Sidebar Chat

Available Now
```

**Large Tile (920x680)**:
```
Research Agent
AI-Powered Research Assistant for Chrome

🔍 Instant Research     💬 AI Chat
📝 Smart Summaries     ⚡ Quick Actions  
🎯 ELI5 Explanations   🔒 Privacy First

Transform Your Browsing with AI
Install Free Today
```

---

## Submission Checklist

### Required Items:
- [x] Extension package (.zip)
- [ ] 1-5 screenshots (1280x800)
- [ ] Detailed description
- [ ] Short description
- [x] Extension icon (128x128)
- [ ] Privacy policy
- [ ] Category selection

### Optional Items:
- [ ] Small promotional tile (440x280)
- [ ] Large promotional tile (920x680)
- [ ] Marquee promotional image (1400x560)
- [ ] YouTube demo video

### Pre-Submission:
- [x] Test extension thoroughly
- [x] Verify all features work
- [x] Check for personal data in screenshots
- [x] Proofread description
- [x] Test on fresh Chrome profile
- [ ] Verify privacy policy URL
- [ ] Set up support email

---

## Notes for Developer

**Important**:
1. Replace `[Your Email or GitHub Issues URL]` with actual contact info
2. Replace `support@[your-domain].com` with real support email
3. Take actual screenshots before submission
4. Create promotional images (optional but recommended)
5. Verify all links in description work
6. Test extension on fresh Chrome profile before submitting

**Estimated Review Time**:
- Automated checks: ~1 hour
- Manual review: 1-3 business days
- Publication: Immediate after approval

**Post-Publication**:
1. Monitor reviews and respond promptly
2. Track analytics (if enabled in Web Store dashboard)
3. Plan updates based on user feedback
4. Keep description and screenshots updated
