# Chromecast HDMI-CEC Auto-Switching Setup Guide 📺

## Overview

Chromecast devices support automatic TV input switching via **HDMI-CEC** (Consumer Electronics Control), a standard protocol that allows HDMI-connected devices to control each other. When you cast content, your TV can automatically turn on and switch to the Chromecast input.

**Note:** This is a **hardware/firmware feature**, not controllable via JavaScript or web applications. It's configured through your TV and Chromecast device settings.

## What is HDMI-CEC?

HDMI-CEC is a feature of HDMI that allows up to 15 devices connected through HDMI to control each other without user intervention. Different manufacturers use different marketing names:

| Manufacturer | CEC Name |
|--------------|----------|
| **LG** | SimpLink |
| **Samsung** | Anynet+ |
| **Sony** | BRAVIA Sync |
| **Panasonic** | VIERA Link |
| **Sharp** | Aquos Link |
| **Toshiba** | CE-Link / Regza Link |
| **Philips** | EasyLink |
| **Vizio** | CEC |
| **Generic** | HDMI-CEC |

## How It Works

When HDMI-CEC is enabled:

1. **User casts content** from web browser or mobile app
2. **Chromecast receives cast request** and starts playback
3. **Chromecast sends CEC command** to TV via HDMI cable
4. **TV receives CEC command** and:
   - Turns on (if off)
   - Switches to Chromecast HDMI input
   - Adjusts volume (if supported)

**All of this happens automatically at the hardware level!** 🎉

## Setup Instructions

### Step 1: Enable HDMI-CEC on Your TV

Settings vary by manufacturer, but generally:

1. **Open TV Settings**
2. **Navigate to:**
   - `Settings` → `General` → `External Device Manager` → `Anynet+ (HDMI-CEC)` (Samsung)
   - `Settings` → `Connection` → `HDMI Settings` → `SimpLink (HDMI-CEC)` (LG)
   - `Settings` → `BRAVIA Settings` → `External Inputs` → `BRAVIA Sync Settings` (Sony)
   - `Settings` → `Setup` → `CEC` → `Enable` (Vizio)
3. **Enable CEC** (turn it ON)
4. **Enable "Auto Power On"** or "Device Auto Power On" if available

### Step 2: Configure Chromecast Settings

Chromecast automatically uses HDMI-CEC when available. To verify/configure:

1. **Open Google Home app** on your phone
2. **Tap your Chromecast device**
3. **Tap gear icon (Settings)**
4. **Scroll to "CEC" or "HDMI-CEC"**
5. **Verify enabled** (usually enabled by default)

**Key Settings:**

- **"HDMI-CEC"** - Enable to allow TV control
- **"Control TV with Chromecast"** - Enable for power/input switching
- **"Control volume on TV"** - Enable for volume control via Chromecast

### Step 3: Test the Setup

1. **Turn off your TV**
2. **Open your browser** and cast a YouTube video using the cast button
3. **TV should automatically:**
   - Turn on
   - Switch to Chromecast input
   - Start playing the video

**If it doesn't work, see Troubleshooting below.**

## Using with LambdaLLMProxy

Once HDMI-CEC is configured, casting works seamlessly with the YouTube media player:

```javascript
// User clicks play button in YouTubeVideoResults component
// PlaylistContext.playTrack() is called
// If Chromecast is connected:
//   - Video starts playing on TV
//   - TV auto-switches to Chromecast input (via CEC)
//   - User sees video on TV instantly 📺
```

**No additional code needed!** The Chromecast framework (`CastContext`) handles everything.

## Current Implementation

### `ui-new/src/contexts/CastContext.tsx`

```typescript
const CastContext = React.createContext<CastContextValue>({
    isCastAvailable: false,
    isCastConnected: false,
    castVideo: (url: string, title?: string) => {
        console.log('Cast not available');
    }
});

const castVideo = (url: string, title?: string) => {
    if (!castSession) {
        console.error('No active cast session');
        return;
    }
    
    // Load media (video namespace: urn:x-cast:com.google.cast.media)
    const mediaInfo = new chrome.cast.media.MediaInfo(url, 'video/mp4');
    mediaInfo.metadata = new chrome.cast.media.GenericMediaMetadata();
    mediaInfo.metadata.title = title || 'Video';
    
    const request = new chrome.cast.media.LoadRequest(mediaInfo);
    
    castSession.loadMedia(request).then(
        () => {
            console.log('✅ Video cast successfully');
            // TV automatically switches input via CEC! 📺
        },
        (error) => console.error('❌ Cast failed:', error)
    );
};
```

**The magic happens here:**
1. `castSession.loadMedia(request)` sends video to Chromecast
2. Chromecast firmware receives video
3. Chromecast sends HDMI-CEC power-on and input-switch commands
4. TV responds to CEC commands
5. User sees video on TV! 🎬

## Troubleshooting

### TV Doesn't Auto-Switch

**Check these settings:**

1. ✅ **HDMI-CEC enabled on TV**
   - Check TV settings (see Step 1)
   - Try toggling off/on
   
2. ✅ **Chromecast HDMI-CEC enabled**
   - Check Google Home app (see Step 2)
   - Try "Reboot" in device settings

3. ✅ **HDMI cable supports CEC**
   - Use high-quality HDMI cable
   - Older cables may not support CEC
   - Try different HDMI port

4. ✅ **TV HDMI port supports CEC**
   - Some TV ports disable CEC
   - Try different HDMI input
   - Check TV manual

### TV Turns On But Doesn't Switch Input

**Common cause:** "Auto Input Switch" disabled

**Solution:**
- Go to TV settings
- Find "HDMI-CEC" or manufacturer name (e.g., "Anynet+")
- Enable "Auto Input Switch" or "Auto Source Switch"

### TV Switches But With Delay

**Normal behavior:**
- CEC commands take 1-3 seconds
- TV needs time to power on and switch inputs
- Some TVs are faster than others

**To minimize delay:**
- Keep TV in standby (don't unplug)
- Enable "Quick Start" mode if available
- Use "Game Mode" HDMI input (faster switching)

### CEC Works for YouTube App But Not Browser

**This is normal!** Web browsers use the **Cast SDK**, which works identically to mobile apps. If YouTube mobile app CEC works, browser should too.

**If browser doesn't work:**
1. Check browser supports Cast (Chrome, Edge)
2. Verify Cast extension enabled
3. Try hard refresh (Ctrl+Shift+R)
4. Check browser console for Cast errors

## Limitations

### What You CAN Control
- ✅ Start/stop casting (triggers CEC)
- ✅ Video playback (play/pause/seek)
- ✅ Volume (if TV supports CEC volume)
- ✅ Content switching (new video triggers input switch)

### What You CANNOT Control
- ❌ Force input switch without casting
- ❌ Configure CEC settings from JavaScript
- ❌ Detect if CEC succeeded
- ❌ Control other HDMI inputs
- ❌ Power on/off TV directly

**Why?** HDMI-CEC is a hardware protocol. JavaScript runs in the browser and has no access to HDMI signaling.

## Advanced: Custom Receiver for Snippets

For future snippet casting feature, CEC will work automatically:

```typescript
// Define custom snippet namespace
const SNIPPET_NAMESPACE = 'urn:x-cast:com.lambdallmproxy.snippet';

// When user casts snippet:
castSession.sendMessage(SNIPPET_NAMESPACE, {
    type: 'LOAD_SNIPPET',
    content: snippetMarkdown,
    scrollPosition: 0
});

// Chromecast receiver loads snippet
// TV auto-switches via CEC (same as video!)
```

**CEC is triggered whenever Chromecast becomes active**, regardless of content type (video, snippet, web page, etc.).

## Summary

| Feature | Status | Notes |
|---------|--------|-------|
| **HDMI-CEC Support** | ✅ Built-in | Chromecast firmware handles |
| **Auto TV Power On** | ✅ Supported | Requires CEC enabled |
| **Auto Input Switch** | ✅ Supported | Requires CEC enabled |
| **Volume Control** | ✅ Supported | Some TVs only |
| **JavaScript Control** | ❌ Not possible | Hardware-level only |
| **Current Status** | ✅ Working | Enabled by default |

## Next Steps

**For Users:**
1. ✅ Enable HDMI-CEC on TV (see Step 1)
2. ✅ Verify Chromecast CEC enabled (see Step 2)
3. ✅ Test by casting a video
4. ✅ Enjoy automatic TV switching! 📺

**For Developers:**
1. ✅ CEC already works with current video casting
2. ✅ Will work automatically with future snippet casting
3. ❌ No additional code needed
4. 📖 Document for users (this guide!)

## Resources

- [Google Cast SDK Documentation](https://developers.google.com/cast/docs/web_sender)
- [HDMI-CEC Specification](https://www.hdmi.org/spec/hdmicec)
- [Chromecast Help - HDMI-CEC](https://support.google.com/chromecast/answer/6206400)

---

*Last Updated: January 2025*  
*Status: Documentation Complete* ✅
