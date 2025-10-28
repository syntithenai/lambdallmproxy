# Chrome Web Store Assets - Creation Guide

## Overview

This guide explains how to create the required promotional assets for the Chrome Web Store listing.

## Required Assets

### 1. Screenshots (REQUIRED)

**Specifications**:
- **Format**: PNG or JPEG
- **Size**: 1280x800 or 640x400 pixels
- **Quantity**: 1-5 screenshots (recommend 5)
- **File size**: < 5 MB each

**Recommended Screenshots**:

1. **Context Menu in Action** (1280x800)
   - Show right-click menu with "Research with AI" option
   - Selected text highlighted
   - Clean, readable webpage in background

2. **Sidebar Chat Interface** (1280x800)
   - Full sidebar panel visible
   - Example conversation with AI
   - Show both user and assistant messages
   - Include thinking indicator

3. **Inline Research Button** (1280x800)
   - Text selection with inline button visible
   - Button positioned near selected text
   - Clean webpage background

4. **Popup UI** (1280x800)
   - Extension popup open
   - Quick research input visible
   - 4 action buttons shown
   - Professional appearance

5. **Settings Page** (1280x800)
   - Options page with all settings visible
   - API configuration section
   - Privacy settings
   - Clean, organized layout

**How to Create**:

```bash
# 1. Load extension in Chrome
# 2. Open a webpage (e.g., Wikipedia article)
# 3. For each screenshot:
#    - Set up the scene (select text, open sidebar, etc.)
#    - Take screenshot (use Chrome's full page screenshot or external tool)
#    - Crop to 1280x800
#    - Save as PNG

# Tools:
# - Chrome DevTools: Ctrl+Shift+P → "Capture screenshot"
# - macOS: Cmd+Shift+4
# - Linux: gnome-screenshot or flameshot
# - Windows: Snipping Tool or Win+Shift+S
```

### 2. Promotional Images (OPTIONAL but RECOMMENDED)

**Small Tile** (440x280 pixels):
- Featured in Chrome Web Store category pages
- Eye-catching design
- Extension icon + tagline
- Gradient background

**Large Tile** (920x680 pixels):
- Featured in Chrome Web Store homepage
- More detailed design
- Extension features highlighted
- Professional appearance

**Marquee** (1400x560 pixels):
- Large promotional banner
- Used in special promotions
- Most prominent placement
- High-quality design essential

**How to Create**:

```bash
# Use design tool (Figma, Canva, GIMP, Photoshop)
# Create template with correct dimensions
# Add extension icon, name, tagline, features
# Use brand colors (blue gradient: #3b82f6 to #2563eb)
# Export as PNG

# Example Figma template:
# 1. Create frame (440x280)
# 2. Add gradient background
# 3. Add icon (centered or left)
# 4. Add text: "Research Agent"
# 5. Add tagline: "AI Research Assistant"
# 6. Add key features as bullets
# 7. Export as PNG
```

### 3. Extension Icon (ALREADY CREATED ✅)

- ✅ 16x16 PNG
- ✅ 48x48 PNG
- ✅ 128x128 PNG

**Location**: `extension/icons/`

## Screenshot Creation Script

Create a simple HTML page to help position elements for screenshots:

```html
<!-- screenshot-template.html -->
<!DOCTYPE html>
<html>
<head>
  <style>
    body {
      margin: 0;
      padding: 40px;
      font-family: Arial, sans-serif;
      background: white;
    }
    .frame {
      width: 1280px;
      height: 800px;
      border: 2px dashed #ccc;
      position: relative;
    }
    .guide {
      position: absolute;
      top: 10px;
      left: 10px;
      background: rgba(0,0,0,0.7);
      color: white;
      padding: 10px;
      font-size: 12px;
    }
  </style>
</head>
<body>
  <div class="frame">
    <div class="guide">1280x800 Screenshot Frame</div>
    <!-- Load your extension and take screenshot within this frame -->
  </div>
</body>
</html>
```

## Automated Screenshot Guide

For consistent screenshots, use Puppeteer:

```javascript
// scripts/create-screenshots.js
const puppeteer = require('puppeteer');
const path = require('path');

async function createScreenshots() {
  const browser = await puppeteer.launch({
    headless: false,
    defaultViewport: {
      width: 1280,
      height: 800
    }
  });
  
  const page = await browser.newPage();
  
  // Screenshot 1: Context Menu
  await page.goto('https://en.wikipedia.org/wiki/Artificial_intelligence');
  // Manual step: Right-click on text
  console.log('Position 1: Right-click on text, then press Enter');
  await page.waitForTimeout(10000); // Wait for manual action
  await page.screenshot({
    path: path.join(__dirname, '../screenshots/01-context-menu.png')
  });
  
  // Screenshot 2: Sidebar
  // Manual step: Open sidebar
  console.log('Position 2: Open sidebar with conversation, then press Enter');
  await page.waitForTimeout(10000);
  await page.screenshot({
    path: path.join(__dirname, '../screenshots/02-sidebar.png')
  });
  
  // Continue for other screenshots...
  
  await browser.close();
}

createScreenshots();
```

## Promotional Image Templates

### Small Tile Template (440x280)

```
┌─────────────────────────────────────────┐
│                                         │
│   [Icon 64x64]    Research Agent        │
│                                         │
│   AI-Powered Research Assistant         │
│                                         │
│   ✓ Instant Research                    │
│   ✓ Smart Summaries                     │
│   ✓ Context Menu                        │
│                                         │
└─────────────────────────────────────────┘
```

### Large Tile Template (920x680)

```
┌─────────────────────────────────────────────────────────┐
│                                                         │
│              Research Agent                             │
│         AI Research Assistant for Chrome                │
│                                                         │
│         [Icon 128x128]                                  │
│                                                         │
│    ✨ Instant Research    📝 Smart Summaries           │
│    🔍 Context Menu       💬 AI Chat                    │
│    ⚡ Page Extraction   🎯 ELI5 Explanations          │
│                                                         │
│              Available Now - Free                       │
│                                                         │
└─────────────────────────────────────────────────────────┘
```

## Asset Storage

**Directory Structure**:
```
extension/
├── icons/                # Extension icons ✅
│   ├── icon-16.png
│   ├── icon-48.png
│   └── icon-128.png
├── screenshots/          # Store screenshots (create this)
│   ├── 01-context-menu.png
│   ├── 02-sidebar.png
│   ├── 03-inline-button.png
│   ├── 04-popup.png
│   └── 05-settings.png
└── promotional/          # Promotional images (create this)
    ├── small-tile-440x280.png
    ├── large-tile-920x680.png
    └── marquee-1400x560.png
```

## Quick Screenshot Checklist

### Before Taking Screenshots:

- [ ] Extension installed and working
- [ ] Settings configured (remove any personal data)
- [ ] Browser zoom at 100%
- [ ] Clean browser (no extra extensions visible)
- [ ] Example content ready (Wikipedia, blog post, etc.)
- [ ] Screen resolution set to 1280x800 or higher

### Screenshot Quality:

- [ ] Clear and readable text
- [ ] No personal information visible
- [ ] Professional appearance
- [ ] Consistent branding
- [ ] Proper cropping (1280x800 exactly)
- [ ] File size < 5 MB
- [ ] PNG format for best quality

## Tools & Resources

### Screenshot Tools:
- **Chrome DevTools**: Built-in, Ctrl+Shift+P → "Capture screenshot"
- **Flameshot** (Linux): `sudo apt install flameshot`
- **Greenshot** (Windows): https://getgreenshot.org/
- **Skitch** (macOS): https://evernote.com/products/skitch

### Image Editing:
- **GIMP** (Free): https://www.gimp.org/
- **Figma** (Free): https://www.figma.com/
- **Canva** (Free tier): https://www.canva.com/
- **Photopea** (Web-based): https://www.photopea.com/

### Optimization:
- **TinyPNG**: https://tinypng.com/ (compress PNG files)
- **Squoosh**: https://squoosh.app/ (optimize images)

## Next Steps

1. **Create screenshots directory**:
   ```bash
   mkdir -p extension/screenshots extension/promotional
   ```

2. **Load extension in Chrome**:
   - Open chrome://extensions/
   - Enable Developer mode
   - Load unpacked → select dist/

3. **Take screenshots**:
   - Follow the 5 screenshot list above
   - Use consistent webpage (Wikipedia recommended)
   - Crop to exactly 1280x800

4. **Create promotional images** (optional):
   - Use Figma or Canva
   - Follow templates above
   - Export as PNG

5. **Verify assets**:
   - Check file sizes (< 5 MB)
   - Verify dimensions
   - Review for personal data
   - Test visual quality

---

**Status**: Assets guide created, ready for manual screenshot creation
**Next**: Take screenshots and create promotional images before Chrome Web Store submission
