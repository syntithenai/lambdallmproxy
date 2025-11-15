# Installing Local Voice Support on Linux for Web Speech API

## Overview

Chrome on Linux does not fire boundary events (specifically word-level boundary events) for the Web Speech API because the default voices are network-based. Network-based voices and Android speech synthesis do not support boundary events at the word level. This is a **known limitation** marked as "WontFix" by the Chromium team because the upstream APIs do not expose this functionality.

**Solution**: Install local TTS engines (eSpeak) and configure Chrome to use the local speech-dispatcher service instead of network voices.

## Why Local Voices Matter

**Local Voices (with `localService: true`)**:
- ✅ Support word-level boundary events
- ✅ Enable live rate/volume controls during playback
- ✅ Zero latency (no network requests)
- ✅ Work offline
- ✅ Privacy-friendly

**Network Voices (remote services)**:
- ❌ Do NOT fire boundary events
- ❌ Cannot adjust rate/volume mid-speech
- ❌ Require internet connection
- ❌ Higher latency
- ❌ Default on Linux Chrome

## Installation Guide (Ubuntu/Debian)

### Step 1: Install TTS Software

Install the core text-to-speech packages:

```bash
sudo apt update
sudo apt install speech-dispatcher espeak-ng mbrola
```

**Package Breakdown**:
- `speech-dispatcher`: Common interface for TTS engines in Linux
- `espeak-ng`: Compact, open-source speech synthesizer (locally installed)
- `mbrola`: Provides additional higher-quality voices for eSpeak

After installation, services should start automatically. If needed, restart:

```bash
systemctl --user restart speech-dispatcher.service
```

You may need to **log out and log back in** for changes to take effect.

### Step 2: Configure Chrome to Use Local Voices

By default, Chrome on Linux uses network-based voices. Launch Chrome with a special flag to force local speech-dispatcher service:

```bash
google-chrome --enable-speech-dispatcher
```

**For Chromium users**:
```bash
chromium-browser --enable-speech-dispatcher
```

### Step 3: Verify Installation

1. Open Chrome using the command from Step 2
2. Open the browser console (F12)
3. Run the following test:

```javascript
// Wait for voices to load
speechSynthesis.addEventListener('voiceschanged', () => {
  const voices = speechSynthesis.getVoices();
  const localVoices = voices.filter(v => v.localService);
  
  console.log(`Total voices: ${voices.length}`);
  console.log(`Local voices: ${localVoices.length}`);
  
  localVoices.forEach(v => {
    console.log(`✅ ${v.name} (${v.lang}) - localService: ${v.localService}`);
  });
  
  if (localVoices.length === 0) {
    console.warn('⚠️ No local voices available! Boundary events will NOT work.');
  }
});
```

You should see voices like:
- `eSpeak NG English (Great Britain)`
- `eSpeak NG English (United States)`
- etc.

All with `localService: true`.

### Step 4: Make Chrome Launch with Flag Permanently

To avoid typing the command every time, modify Chrome's desktop entry:

```bash
sudo nano /usr/share/applications/google-chrome.desktop
```

Find all lines starting with `Exec=` and append `--enable-speech-dispatcher` to each:

**Before**:
```
Exec=/usr/bin/google-chrome-stable %U
```

**After**:
```
Exec=/usr/bin/google-chrome-stable --enable-speech-dispatcher %U
```

Save and close (Ctrl+X, Y, Enter). You may need to log out/in for changes to take effect when launching from the application menu.

## Verification: Test Boundary Events

Use this test page to verify boundary events work:

```html
<!DOCTYPE html>
<html>
<head>
    <title>Boundary Event Test</title>
</head>
<body>
    <button onclick="testBoundary()">Test Boundary Events</button>
    <div id="output"></div>
    
    <script>
        function testBoundary() {
            const output = document.getElementById('output');
            output.innerHTML = 'Testing...<br>';
            
            const utterance = new SpeechSynthesisUtterance(
                'Testing boundary events with local voices on Linux.'
            );
            
            let boundaryCount = 0;
            
            utterance.onboundary = (event) => {
                boundaryCount++;
                output.innerHTML += `✅ Boundary #${boundaryCount}: ${event.name} at char ${event.charIndex}<br>`;
            };
            
            utterance.onend = () => {
                if (boundaryCount === 0) {
                    output.innerHTML += '<strong style="color: red;">❌ NO boundary events fired!</strong><br>';
                } else {
                    output.innerHTML += `<strong style="color: green;">✅ SUCCESS! ${boundaryCount} boundary events fired.</strong><br>`;
                }
            };
            
            speechSynthesis.speak(utterance);
        }
    </script>
</body>
</html>
```

**Expected Result**: You should see multiple "✅ Boundary #X" messages appear as the text is spoken.

## Filtering Voices in Your Application

eSpeak provides **many voices** (one per language variant). To show only reasonable voices in your UI, filter in JavaScript:

```javascript
let voices = [];

function getLocalEnglishVoices() {
  voices = speechSynthesis.getVoices();
  
  // Filter to local English voices only
  const filtered = voices.filter(voice => {
    const isLocal = voice.localService;
    const isEnglish = voice.lang.startsWith('en');
    
    // Optional: exclude specific variants if too many
    // const isReasonable = !voice.name.includes('variant-name');
    
    return isLocal && isEnglish;
  });
  
  return filtered;
}

// Wait for voices to load
speechSynthesis.addEventListener('voiceschanged', () => {
  const localVoices = getLocalEnglishVoices();
  console.log(`Found ${localVoices.length} local English voices`);
  
  // Populate your UI with filtered voices
  localVoices.forEach(voice => {
    console.log(`${voice.name} (${voice.lang})`);
  });
});
```

**Common Filtering Strategies**:
1. **By localService**: `voice.localService === true` (most important!)
2. **By language**: `voice.lang.startsWith('en')` for English only
3. **By name pattern**: Exclude variants you don't want
4. **Limit count**: Show only first N voices from filtered list

## Troubleshooting

### No Local Voices Appear

**Check if speech-dispatcher is running**:
```bash
systemctl --user status speech-dispatcher.service
```

**Restart speech-dispatcher**:
```bash
systemctl --user restart speech-dispatcher.service
```

**Verify eSpeak is installed**:
```bash
espeak-ng --voices
```

Should list available voices.

### Boundary Events Still Don't Fire

**Verify Chrome flag**:
```bash
ps aux | grep chrome | grep speech-dispatcher
```

Should show `--enable-speech-dispatcher` in the process.

**Check voice in JavaScript**:
```javascript
const voice = speechSynthesis.getVoices()[0];
console.log('Using voice:', voice.name);
console.log('Is local?', voice.localService);
```

If `localService: false`, boundary events will NOT work.

**Force local voice selection**:
```javascript
const utterance = new SpeechSynthesisUtterance('Test');
const localVoices = speechSynthesis.getVoices().filter(v => v.localService);
if (localVoices.length > 0) {
  utterance.voice = localVoices[0]; // Force first local voice
  speechSynthesis.speak(utterance);
}
```

### Chrome Ignores Desktop File Changes

**Clear desktop cache**:
```bash
update-desktop-database ~/.local/share/applications
```

**Or edit user-specific file** instead:
```bash
cp /usr/share/applications/google-chrome.desktop ~/.local/share/applications/
nano ~/.local/share/applications/google-chrome.desktop
```

## Application Integration

Our application already implements all the necessary checks:

1. **Voice Filtering** (`BrowserProviders.ts`):
   - Automatically filters to local voices when available
   - Shows warning if only remote voices available
   - Marks remote voices with "Remote" badge in UI

2. **Boundary Detection** (`BrowserProviders.ts`):
   - Tests boundary support on first speech
   - Updates UI state accordingly

3. **UI Warnings** (`TTSSettings.tsx`):
   - Shows warning banner when no local voices available
   - Explains consequences (no live changes, higher latency)

4. **Control Restrictions** (`TTSPlaybackDialog.tsx`):
   - Disables rate/volume sliders during playback if:
     - No boundary support, OR
     - Using non-local voice
   - Shows appropriate warning messages

## Summary

**To enable boundary events on Linux**:
1. Install: `sudo apt install speech-dispatcher espeak-ng mbrola`
2. Launch Chrome: `google-chrome --enable-speech-dispatcher`
3. Verify: Check `voice.localService === true`
4. Optional: Make permanent by editing desktop file

**Result**: 
- ✅ Word-level boundary events fire
- ✅ Live rate/volume controls work during playback
- ✅ Zero network latency
- ✅ Full offline functionality

## References

- **Chromium Bug**: https://bugs.chromium.org/p/chromium/issues/detail?id=509488 (WontFix)
- **Stack Overflow**: "onBoundary event doesn't fire in Chrome on Ubuntu"
- **Web Speech API**: https://developer.mozilla.org/en-US/docs/Web/API/SpeechSynthesisUtterance/boundary_event
- **eSpeak NG**: https://github.com/espeak-ng/espeak-ng
- **Speech Dispatcher**: https://github.com/brailcom/speechd
