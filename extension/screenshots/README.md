# Screenshots - How to Capture

This directory will contain screenshots for the Chrome Web Store listing.

## Required Screenshots

You need to capture **1-5 screenshots** (recommend 5) at **1280x800 pixels**.

### Screenshot List

1. **01-context-menu.png** - Context menu in action
   - Open a Wikipedia article
   - Select some text (e.g., a paragraph about AI)
   - Right-click to show context menu
   - Show "Research with AI" and other menu items
   - Take screenshot (1280x800)

2. **02-sidebar.png** - Sidebar chat interface
   - Open sidebar with a conversation
   - Show both user and assistant messages
   - Make sure conversation looks natural and helpful
   - Take screenshot (1280x800)

3. **03-inline-button.png** - Inline research button
   - Select 50-100 characters of text
   - Wait for inline button to appear
   - Position cursor near button
   - Take screenshot (1280x800)

4. **04-popup.png** - Extension popup
   - Click extension icon
   - Show popup with quick research input
   - Show all 4 action buttons
   - Take screenshot (1280x800)

5. **05-settings.png** - Settings/options page
   - Right-click extension icon → Options
   - Show full settings page
   - Scroll to show all sections if needed
   - Take screenshot (1280x800)

## How to Take Screenshots

### Method 1: Chrome DevTools (Recommended)

1. Open Chrome and load extension
2. Navigate to test page (Wikipedia recommended)
3. Set browser window to at least 1280x800
4. Set up the scene (select text, open sidebar, etc.)
5. Press `Ctrl+Shift+P` (Cmd+Shift+P on Mac)
6. Type "Capture screenshot"
7. Select "Capture screenshot" (not full page)
8. Crop to exactly 1280x800 pixels

### Method 2: Operating System Tools

**macOS**: 
```bash
# Press Cmd+Shift+4, then drag to select 1280x800 area
# OR use Cmd+Shift+5 for more options
```

**Linux (GNOME)**:
```bash
# Use built-in screenshot tool or install flameshot
sudo apt install flameshot
flameshot gui
```

**Windows**:
```bash
# Press Win+Shift+S for Snipping Tool
# Or use third-party tool like ShareX
```

### Method 3: Browser Extension

Install "Full Page Screen Capture" or similar extension, then:
1. Set viewport to 1280x800
2. Capture visible area
3. Crop if needed

## Screenshot Quality Checklist

Before submitting, verify each screenshot:

- [ ] Exactly 1280x800 pixels
- [ ] PNG format (best quality)
- [ ] File size < 5 MB (compress if needed)
- [ ] No personal information visible
- [ ] Clear, readable text
- [ ] Professional appearance
- [ ] Consistent branding
- [ ] No extra browser extensions visible
- [ ] Browser zoom at 100%

## Image Editing (if needed)

If you need to crop or resize:

```bash
# Using ImageMagick (Linux/macOS)
convert screenshot.png -resize 1280x800! -quality 100 final.png

# Using GIMP (all platforms)
# 1. Open image
# 2. Image → Scale Image → 1280x800
# 3. Export as PNG
```

Or use online tools:
- https://www.photopea.com/ (free Photoshop alternative)
- https://squoosh.app/ (Google's image optimizer)

## Test Content Recommendations

**Best pages for screenshots**:
1. Wikipedia articles (clean, professional)
2. News articles (CNN, BBC, etc.)
3. Blog posts (Medium, dev.to)
4. Documentation pages (MDN, GitHub docs)

**Avoid**:
- Social media (privacy concerns)
- Email/personal accounts
- Financial/sensitive information
- Copyrighted content that's clearly identifiable

## Example Workflow

1. **Set up Chrome**:
   ```bash
   # Open Chrome with specific size
   chrome --window-size=1280,800 --new-window
   ```

2. **Load extension**:
   - chrome://extensions/
   - Load unpacked → dist/

3. **Navigate to test page**:
   - https://en.wikipedia.org/wiki/Artificial_intelligence

4. **Take Screenshot 1 (Context Menu)**:
   - Select paragraph about "machine learning"
   - Right-click
   - Ctrl+Shift+P → Capture screenshot
   - Save as `01-context-menu.png`

5. **Take Screenshot 2 (Sidebar)**:
   - Click "Research with AI" 
   - Wait for response
   - Ask follow-up: "What are the main types?"
   - Ctrl+Shift+P → Capture screenshot
   - Save as `02-sidebar.png`

6. **Continue for remaining screenshots...**

## After Capturing

1. Review all screenshots for quality
2. Compress if needed (but keep quality high):
   ```bash
   # Using pngquant (preserves quality)
   pngquant --quality=80-100 *.png
   ```

3. Verify file sizes:
   ```bash
   ls -lh *.png
   # Each should be < 5 MB
   ```

4. Ready for Chrome Web Store upload!

---

**Current Status**: Directory ready, screenshots not yet captured
**Next Step**: Follow the guide above to capture 5 screenshots
**Time Estimate**: 15-30 minutes
