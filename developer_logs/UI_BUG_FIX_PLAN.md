# UI Bug Fix Plan

**Date**: December 2024  
**Status**: Planning Phase (No Implementation)  
**Source**: steves_wishlist.md lines 116-122

---

## Overview

This document outlines fixes for 4 UI/UX bugs discovered in the chat interface. Each issue has been investigated, root cause identified, and solution designed. Implementation will follow approval.

---

## Issue 1: Dialog Close Behavior - Inconsistent Application

### Problem Statement
> "click outside any dialog or press escape to close the dialog. this applies to all dialogs"

### Current State
✅ **Hook Exists**: `ui-new/src/hooks/useDialogClose.ts` provides reusable ESC/outside-click functionality  
❌ **Inconsistent Usage**: Not all dialogs use the hook

**Working Implementation**:
```typescript
export function useDialogClose(
  isOpen: boolean, 
  onClose: () => void, 
  closeOnClickOutside: boolean = true
) {
  const dialogRef = useRef<HTMLDivElement>(null);
  
  // ESC key handler
  const handleEscape = useCallback((event: KeyboardEvent) => {
    if (event.key === 'Escape') onClose();
  }, [onClose]);
  
  // Click outside handler (checks if click is on backdrop)
  const handleClickOutside = useCallback((event: MouseEvent) => {
    if (!closeOnClickOutside) return;
    if (dialogRef.current && event.target === dialogRef.current) onClose();
  }, [onClose, closeOnClickOutside]);
  
  // Event listeners setup...
  return dialogRef;
}
```

**Known Users**:
- ✅ `LlmInfoDialog.tsx` - Uses hook correctly
- ✅ `PlanningDialog.tsx` - Uses hook correctly  
- ✅ `VoiceInputDialog.tsx` - Uses hook correctly

### Root Cause
Some dialogs may not use the hook, or use it incorrectly (not attaching `dialogRef` to backdrop element).

### Solution

**Step 1: Audit All Dialogs**
Search for all dialog components:
```bash
find ui-new/src/components -name "*Dialog.tsx" -o -name "*Modal.tsx"
grep -r "className.*fixed.*inset-0" ui-new/src/components
```

**Step 2: Verify Hook Usage**
For each dialog found, check:
1. Imports `useDialogClose` hook
2. Calls hook with correct parameters
3. Attaches returned `dialogRef` to backdrop element

**Step 3: Fix Non-Compliant Dialogs**
Pattern to apply:
```tsx
function MyDialog({ isOpen, onClose }) {
  const dialogRef = useDialogClose(isOpen, onClose, true);
  
  if (!isOpen) return null;
  
  return (
    <div 
      ref={dialogRef}  // ← CRITICAL: Attach to backdrop
      className="fixed inset-0 bg-black bg-opacity-50 z-50"
    >
      <div className="..."> {/* Content - don't attach ref here */}
        {/* Dialog content */}
      </div>
    </div>
  );
}
```

**Common Mistakes to Fix**:
- ❌ Not calling the hook
- ❌ Attaching `dialogRef` to content div instead of backdrop
- ❌ Custom ESC/click handlers instead of using hook
- ❌ Passing `closeOnClickOutside={false}` when it should be `true`

### Files to Modify
- **To Be Determined**: After audit step
- **Estimated**: 5-10 dialog components

### Testing Strategy
For each dialog:
1. **ESC Test**: Open dialog → Press ESC → Should close
2. **Click Outside Test**: Open dialog → Click backdrop → Should close
3. **Click Inside Test**: Open dialog → Click content → Should NOT close
4. **Multiple Dialogs Test**: Open nested dialogs → ESC closes only top dialog

### Priority
**Medium** - Existing functionality works for some dialogs, just needs consistent application

### Estimated Effort
**2-3 hours** (1 hour audit, 1-2 hours fixes)

---

## Issue 2: Relative URL Conversion in Scraping

### Problem Statement
> "when scraping links and images, if they are a relative url, convert to full url"

### Current State
✅ **Partial Implementation**: Some scrapers convert, others don't  
❌ **Inconsistent**: html-parser.js filters out relative URLs instead of converting

**Good Examples**:
```javascript
// puppeteer-scraper.js (line 159) - ✅ CORRECT
const absoluteUrl = new URL(src, window.location.href).href;
result.images.push({ url: absoluteUrl, alt });

// proxy-image.js (line 58) - ✅ CORRECT
const absoluteRedirectUrl = new URL(redirectUrl, imageUrl).toString();

// search.js fetchUrl (line 1295) - ✅ CORRECT
if (redirectUrl.startsWith('/')) {
  const urlObj = new URL(originalUrl);
  redirectUrl = `${urlObj.protocol}//${urlObj.host}${redirectUrl}`;
}
```

**Problem Example**:
```javascript
// html-parser.js extractLinks (line 218) - ❌ INCOMPLETE
const links = [];
for (const a of $('a')) {
  const href = $(a).attr('href');
  if (!href) continue;
  
  // This filters instead of converting!
  if (!href.startsWith('http') && !href.startsWith('/') && !href.startsWith('./')) {
    continue; // ← Skips relative URLs like "page.html", "../about"
  }
  
  links.push({ url: href, text: $(a).text() }); // ← Pushes relative URLs unconverted
}
```

### Root Cause
`html-parser.js` has logic to detect relative URLs but doesn't convert them to absolute before returning. This causes:
- Links like `"about.html"` to be included without conversion
- Relative paths like `"../images/pic.jpg"` to be skipped entirely
- Inconsistent URL formats in extracted content

### Solution

**File**: `src/html-parser.js`

**Method 1: extractLinks** (around line 218)

**Before**:
```javascript
extractLinks($, baseUrl) {
  const links = [];
  for (const a of $('a')) {
    const href = $(a).attr('href');
    if (!href) continue;
    
    // Problematic filtering
    if (!href.startsWith('http') && !href.startsWith('/') && !href.startsWith('./')) {
      continue;
    }
    
    links.push({ url: href, text: $(a).text() });
  }
  return links;
}
```

**After**:
```javascript
extractLinks($, baseUrl) {
  const links = [];
  for (const a of $('a')) {
    const href = $(a).attr('href');
    if (!href) continue;
    
    // Skip anchors and javascript: links
    if (href.startsWith('#') || href.startsWith('javascript:') || href.startsWith('mailto:')) {
      continue;
    }
    
    // Convert to absolute URL
    let absoluteUrl;
    try {
      absoluteUrl = new URL(href, baseUrl).href;
    } catch (e) {
      console.warn('Failed to resolve URL:', href, 'base:', baseUrl);
      continue;
    }
    
    links.push({ url: absoluteUrl, text: $(a).text().trim() });
  }
  return links;
}
```

**Method 2: extractImages** (similar location)

**Before**:
```javascript
extractImages($, baseUrl) {
  const images = [];
  for (const img of $('img')) {
    const src = $(img).attr('src');
    if (!src) continue;
    
    // Similar problematic filtering
    if (!src.startsWith('http') && !src.startsWith('/')) {
      continue;
    }
    
    images.push({ src, alt: $(img).attr('alt') });
  }
  return images;
}
```

**After**:
```javascript
extractImages($, baseUrl) {
  const images = [];
  for (const img of $('img')) {
    const src = $(img).attr('src');
    if (!src) continue;
    
    // Skip data URIs and invalid schemes
    if (src.startsWith('data:')) {
      continue;
    }
    
    // Convert to absolute URL
    let absoluteUrl;
    try {
      absoluteUrl = new URL(src, baseUrl).href;
    } catch (e) {
      console.warn('Failed to resolve image URL:', src, 'base:', baseUrl);
      continue;
    }
    
    images.push({ 
      src: absoluteUrl, 
      alt: $(img).attr('alt') || '',
      title: $(img).attr('title')
    });
  }
  return images;
}
```

**Key Changes**:
1. **Remove filtering logic** - Don't skip relative URLs
2. **Add URL resolution** - Use `new URL(relative, base).href` pattern
3. **Add error handling** - Catch malformed URLs and log warnings
4. **Skip special schemes** - Filter out `#`, `javascript:`, `mailto:`, `data:`
5. **Consistent pattern** - Matches working implementation in puppeteer-scraper.js

### Files to Modify
- **Primary**: `src/html-parser.js`
  * `extractLinks()` method
  * `extractImages()` method
- **Verify Callers**: Check that `baseUrl` is passed correctly from:
  * `src/search.js` (DuckDuckGo scraper)
  * `src/endpoints/chat.js` (search tool integration)
  * Any other callers of html-parser.js

### Testing Strategy

**Unit Tests**:
```javascript
// Test cases for extractLinks/extractImages
const testCases = [
  { input: 'https://example.com/page.html', base: 'https://site.com', expected: 'https://example.com/page.html' },
  { input: '/about', base: 'https://site.com', expected: 'https://site.com/about' },
  { input: './contact', base: 'https://site.com/dir/', expected: 'https://site.com/dir/contact' },
  { input: 'page.html', base: 'https://site.com/dir/', expected: 'https://site.com/dir/page.html' },
  { input: '../back.html', base: 'https://site.com/dir/', expected: 'https://site.com/back.html' },
  { input: '#anchor', base: 'https://site.com', expected: null /* skip */ },
  { input: 'javascript:void(0)', base: 'https://site.com', expected: null /* skip */ },
];
```

**Integration Tests**:
1. Scrape a page with relative links → Verify all URLs are absolute
2. Scrape a page with relative images → Verify all src attributes are absolute
3. Scrape a page with mixed absolute/relative → Verify correct conversion
4. Test with pages at different path depths (root, /dir/, /dir/subdir/)

### Priority
**High** - Directly affects link/image extraction quality, users can't click broken relative URLs

### Estimated Effort
**3-4 hours** (2 hours implementation, 1-2 hours testing)

---

## Issue 3: Mobile Header Overflow - Buttons Off Screen

### Problem Statement
> "on mobile display, the logout, cast buttons are pushed off the edge of the screen"

### Current State
❌ **Fixed Layout**: No responsive design for narrow screens  
❌ **No Wrapping**: Buttons extend beyond viewport on mobile

**Current Implementation**:
```tsx
// ui-new/src/components/GoogleLoginButton.tsx (line 32+)
<div className="flex items-center gap-3">
  <img 
    src={user.picture} 
    className="w-10 h-10 rounded-full" 
    alt={user.name}
  />
  <div className="hidden md:block">
    <div className="text-sm font-medium">{user.name}</div>
    <div className="text-xs text-gray-500">{user.email}</div>
  </div>
  {isAvailable && (
    <button 
      onClick={handleCastClick}
      className="px-3 py-1 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-sm"
    >
      {isConnected ? `Cast to ${deviceName}` : 'Cast'}
    </button>
  )}
  <button 
    onClick={logout}
    className="px-3 py-1 rounded-lg bg-red-600 hover:bg-red-700 text-white text-sm"
  >
    Sign Out
  </button>
</div>
```

### Root Cause
Layout uses fixed `gap-3` (0.75rem) and doesn't adapt to narrow screens:
- Profile image: 40px
- User name/email: Hidden on mobile (`hidden md:block`)
- Cast button: ~80-120px (varies with device name)
- Sign Out button: ~80px
- Gaps: 2-3 × 12px = 24-36px
- **Total**: ~224-276px minimum

On screens <375px (iPhone SE), buttons overflow.

### Solution

**File**: `ui-new/src/components/GoogleLoginButton.tsx`

**Approach 1: Responsive Button Sizing (Recommended)**

```tsx
<div className="flex items-center gap-2 sm:gap-3">
  <img 
    src={user.picture} 
    className="w-8 h-8 sm:w-10 sm:h-10 rounded-full flex-shrink-0" 
    alt={user.name}
  />
  <div className="hidden md:block flex-shrink-0">
    <div className="text-sm font-medium">{user.name}</div>
    <div className="text-xs text-gray-500">{user.email}</div>
  </div>
  {isAvailable && (
    <button 
      onClick={handleCastClick}
      className="px-2 py-1 sm:px-3 sm:py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs sm:text-sm whitespace-nowrap"
      title={isConnected ? `Cast to ${deviceName}` : 'Cast to device'}
    >
      {/* Show icon on small screens, text on larger */}
      <span className="hidden sm:inline">
        {isConnected ? `Cast to ${deviceName}` : 'Cast'}
      </span>
      <span className="sm:hidden">📡</span>
    </button>
  )}
  <button 
    onClick={logout}
    className="px-2 py-1 sm:px-3 sm:py-1.5 rounded-lg bg-red-600 hover:bg-red-700 text-white text-xs sm:text-sm whitespace-nowrap"
  >
    <span className="hidden sm:inline">Sign Out</span>
    <span className="sm:hidden">🚪</span>
  </button>
</div>
```

**Key Changes**:
1. **Responsive gaps**: `gap-2 sm:gap-3` (8px mobile, 12px desktop)
2. **Responsive image**: `w-8 h-8 sm:w-10 sm:h-10` (32px mobile, 40px desktop)
3. **Responsive padding**: `px-2 py-1 sm:px-3 sm:py-1.5` (smaller on mobile)
4. **Responsive text**: `text-xs sm:text-sm` (smaller on mobile)
5. **Icon fallback**: Show emoji icons on mobile instead of text
6. **Prevent shrink**: `flex-shrink-0` on profile image and user info
7. **Prevent wrap**: `whitespace-nowrap` on buttons

**Approach 2: Dropdown Menu (Alternative)**

If Approach 1 still overflows on very small screens:

```tsx
<div className="flex items-center gap-3">
  <img src={user.picture} className="w-10 h-10 rounded-full" />
  <div className="hidden md:block">...</div>
  
  {/* Desktop: Show buttons */}
  <div className="hidden sm:flex gap-3">
    {isAvailable && <button>Cast</button>}
    <button>Sign Out</button>
  </div>
  
  {/* Mobile: Dropdown menu */}
  <div className="sm:hidden relative">
    <button onClick={() => setMenuOpen(!menuOpen)}>⋮</button>
    {menuOpen && (
      <div className="absolute right-0 top-full mt-2 bg-white dark:bg-gray-800 rounded-lg shadow-lg">
        {isAvailable && <button>Cast</button>}
        <button>Sign Out</button>
      </div>
    )}
  </div>
</div>
```

### Files to Modify
- **Primary**: `ui-new/src/components/GoogleLoginButton.tsx`
  * Header layout section (around line 32+)
  * Add responsive Tailwind classes

### Testing Strategy

**Manual Testing** (use browser DevTools mobile emulation):
1. **iPhone SE (375×667)**: Verify buttons visible, no overflow
2. **iPhone 12 (390×844)**: Verify buttons visible, adequate spacing
3. **iPhone 14 Pro Max (430×932)**: Verify buttons use full size
4. **Galaxy Fold (280×653 folded)**: Verify extreme narrow case
5. **Tablet (768×1024)**: Verify shows full layout with user name
6. **Desktop (1920×1080)**: Verify full layout with all elements

**Breakpoint Tests**:
- 320px: Minimum viable layout (icons only)
- 375px: Small phone layout (icons or short text)
- 640px (sm): Transition to full buttons
- 768px (md): Show user name/email

**Interaction Tests**:
1. Click buttons on mobile → Should work despite smaller size
2. Touch targets → Minimum 44×44px (iOS HIG guideline)
3. Hover states → Should work on desktop
4. Cast device name → Should truncate if too long

### Priority
**High** - Blocks mobile users from logging out or using Cast feature

### Estimated Effort
**2-3 hours** (1 hour implementation, 1-2 hours testing across devices)

---

## Issue 4: Black Block Images - Selected Images Display Issue

### Problem Statement
> "the selected images (subset of the full collection) are showing up as black blocks. the image links work if opened in a new window. they also display fine in the expandable complete list of images"

### Current State
✅ **Links Work**: Images open correctly in new tab  
✅ **Expandable List Works**: Images render correctly in MediaSections component  
❌ **Selected Images Broken**: First 3 priority images show as black blocks

**Affected Component**: `ImageGallery` component (used for priority images)

**Current Implementation**:
```tsx
// ui-new/src/components/ImageGallery.tsx
<img 
  src={imageUrl}  // ← Direct URL usage
  alt={`Search result ${idx + 1}`}
  className="w-32 h-32 object-cover cursor-pointer"
  loading="lazy"
  onError={() => handleImageError(idx)}
  onClick={() => onImageClick?.(imageUrl)}
/>
```

**Working Implementation** (MediaSections expandable list):
```tsx
// ui-new/src/components/MediaSections.tsx (or similar)
<img 
  src={imageUrl}
  // Different styling or rendering approach
/>
```

### Root Cause Hypotheses

**Hypothesis 1: CSS object-cover on Failed Images**
- `object-cover` with `w-32 h-32` forces fixed dimensions
- If image fails to load but element remains, shows as black 32×32 block
- The `onError` handler should hide these, but may have timing issue

**Hypothesis 2: CORS / Proxy Issue**
- Priority images might need CORS proxy but aren't using it
- Expandable list might use proxy, priority images don't
- URLs work in new tab because browser makes direct request

**Hypothesis 3: Base64 Conversion Timing**
- If images should be converted to base64 before display (per SWAG pattern)
- Priority images might be displayed before conversion
- Expandable list might wait for conversion

**Hypothesis 4: Image Loading Race Condition**
- `loading="lazy"` might conflict with `onError` handler
- Images marked hidden before they finish loading check
- Expandable list might use eager loading

### Investigation Steps (Before Implementation)

**Step 1: Compare Components**
```bash
# Find where expandable list renders images
grep -A 20 "allImages" ui-new/src/components/MediaSections.tsx
grep -A 20 "allImages" ui-new/src/components/ExtractedContent.tsx

# Compare with ImageGallery implementation
diff -u <(grep -A 10 "<img" ui-new/src/components/ImageGallery.tsx) \
        <(grep -A 10 "<img" ui-new/src/components/MediaSections.tsx)
```

**Step 2: Check Image URLs**
- Add console.log in ImageGallery to see actual URLs
- Compare priority image URLs vs expandable list URLs
- Check if one uses proxy and the other doesn't

**Step 3: Test CORS Headers**
```javascript
// Add to ImageGallery component
useEffect(() => {
  console.log('Priority images:', images);
  images.forEach(async (url) => {
    try {
      const response = await fetch(url, { method: 'HEAD' });
      console.log('Image CORS:', url, response.headers.get('access-control-allow-origin'));
    } catch (e) {
      console.error('Image fetch failed:', url, e);
    }
  });
}, [images]);
```

**Step 4: Inspect Browser Console**
- Open chat, trigger search with images
- Check for CORS errors in console
- Check for 403/404 errors on image URLs
- Check for timing warnings

### Solution Options

**Solution 1: Use Image Proxy (If CORS Issue)**

```tsx
// ui-new/src/components/ImageGallery.tsx
import { getProxiedImageUrl } from '../utils/imageUtils';

<img 
  src={getProxiedImageUrl(imageUrl)}  // ← Add proxy wrapper
  alt={`Search result ${idx + 1}`}
  className="w-32 h-32 object-cover cursor-pointer"
  loading="lazy"
  onError={() => handleImageError(idx)}
  onClick={() => onImageClick?.(imageUrl)}
/>
```

**Solution 2: Match Expandable List Implementation**

Find what MediaSections does differently and copy that pattern:
```tsx
// Example if MediaSections uses eager loading
<img 
  src={imageUrl}
  loading="eager"  // ← Change from lazy
  // ... rest of props
/>
```

**Solution 3: Better Error Handling**

```tsx
const [imageStates, setImageStates] = useState<Map<number, 'loading' | 'loaded' | 'error'>>(new Map());

const handleImageLoad = (idx: number) => {
  setImageStates(prev => new Map(prev).set(idx, 'loaded'));
};

const handleImageError = (idx: number) => {
  setImageStates(prev => new Map(prev).set(idx, 'error'));
  setHiddenImages(prev => new Set(prev).add(idx));
};

// In render
{displayedImages.map((imageUrl, idx) => {
  const state = imageStates.get(idx);
  if (state === 'error' || hiddenImages.has(idx)) return null;
  
  return (
    <div className="relative">
      {state === 'loading' && (
        <div className="w-32 h-32 bg-gray-200 dark:bg-gray-700 animate-pulse" />
      )}
      <img 
        src={imageUrl}
        onLoad={() => handleImageLoad(idx)}
        onError={() => handleImageError(idx)}
        className={state === 'loaded' ? 'opacity-100' : 'opacity-0'}
      />
    </div>
  );
})}
```

**Solution 4: Remove object-cover (If Rendering Issue)**

```tsx
<img 
  src={imageUrl}
  className="max-w-32 max-h-32 cursor-pointer" // ← Use max instead of fixed
  style={{ width: 'auto', height: 'auto' }}   // ← Allow natural sizing
/>
```

### Files to Investigate
1. **ui-new/src/components/ImageGallery.tsx** - Priority images (broken)
2. **ui-new/src/components/MediaSections.tsx** - Expandable list (working)
3. **ui-new/src/components/ExtractedContent.tsx** - Alternative expandable implementation
4. **ui-new/src/utils/imageUtils.ts** - Image conversion and proxy utilities
5. **ui-new/src/components/ChatTab.tsx** - How images are passed to components

### Files to Modify (After Investigation)
- **Primary**: `ui-new/src/components/ImageGallery.tsx`
  * Fix image rendering or add proxy
- **Possibly**: `ui-new/src/components/ChatTab.tsx`
  * If image URLs need preprocessing before passing to ImageGallery

### Testing Strategy

**Visual Regression Tests**:
1. Trigger search with images → Check priority images render
2. Click priority image → Opens in new tab successfully
3. Expand "All Images" → Check images render there too
4. Compare: Priority vs expandable images should look the same

**Network Tab Tests**:
1. Check if priority image requests have CORS errors
2. Check if expandable image requests succeed
3. Compare request headers between the two
4. Check if one uses proxy endpoint and the other doesn't

**Console Error Tests**:
1. Open DevTools console
2. Trigger search with images
3. Look for: CORS errors, 403/404 errors, React warnings
4. Fix any errors found

**Cross-Browser Tests**:
- Chrome: Test CORS behavior
- Firefox: Test CORS behavior
- Safari: Test stricter CORS policies
- Mobile browsers: Test touch interaction

### Priority
**High** - Directly affects user experience, images are core search feature

### Estimated Effort
**4-6 hours** (2 hours investigation, 2-3 hours fix, 1 hour testing)

**Note**: This requires investigation before solution can be finalized. The "black blocks" symptom suggests multiple possible causes.

---

## Implementation Timeline

### Phase 1: Quick Wins (Day 1)
- ✅ **Issue 2**: Relative URL conversion (3-4 hours)
  * High impact, clear solution
  * Improves scraping quality immediately

### Phase 2: Mobile Fix (Day 2)
- ✅ **Issue 3**: Mobile header overflow (2-3 hours)
  * High user impact for mobile users
  * Straightforward responsive design fix

### Phase 3: Investigation & Complex Fixes (Day 3-4)
- ✅ **Issue 4**: Black block images (4-6 hours)
  * Requires investigation first
  * High impact once fixed
- ✅ **Issue 1**: Dialog close audit (2-3 hours)
  * Lower priority, partial solution exists
  * Good cleanup task

### Total Estimated Effort
**11-16 hours** across 3-4 days

---

## Testing Checklist

### Pre-Implementation
- [ ] Audit all dialog components for useDialogClose usage
- [ ] Verify html-parser.js callers pass baseUrl parameter
- [ ] Test mobile header on current implementation (document overflow)
- [ ] Investigate black block images (console errors, network tab, compare components)

### Post-Implementation
- [ ] All dialogs close on ESC key
- [ ] All dialogs close on backdrop click
- [ ] All scraped links are absolute URLs
- [ ] All scraped images are absolute URLs
- [ ] Mobile header buttons visible on 320px width
- [ ] Mobile header buttons functional (adequate touch targets)
- [ ] Priority images render correctly (no black blocks)
- [ ] Priority images match expandable list rendering
- [ ] Run full UI test suite (if exists)
- [ ] Manual smoke test on desktop and mobile

---

## Risk Assessment

### Low Risk
- **Issue 1 (Dialogs)**: Existing hook works, just need to apply consistently
- **Issue 2 (URLs)**: Well-established pattern (`new URL()`), already used elsewhere

### Medium Risk
- **Issue 3 (Mobile)**: Responsive design changes could affect desktop layout if not careful

### High Risk
- **Issue 4 (Images)**: Root cause unknown, could be complex (CORS, timing, rendering)

### Mitigation Strategies
1. **Incremental Rollout**: Fix one issue at a time, test thoroughly
2. **Feature Flags**: Consider adding feature flag for image display changes
3. **Logging**: Add detailed console logging during Issue 4 investigation
4. **Rollback Plan**: Keep git history clean, each fix in separate commit
5. **Staging Environment**: Test on dev/staging before production

---

## Success Criteria

### Issue 1: Dialog Close
- ✅ 100% of dialogs close on ESC key press
- ✅ 100% of dialogs close when clicking backdrop
- ✅ Dialog content clicks don't close dialog
- ✅ Nested dialogs only close topmost dialog

### Issue 2: Relative URLs
- ✅ All scraped links are absolute (https://...)
- ✅ All scraped images are absolute (https://...)
- ✅ Relative paths like "../page.html" convert correctly
- ✅ No broken links due to relative URLs

### Issue 3: Mobile Header
- ✅ All buttons visible on 320px width (minimum)
- ✅ Buttons have adequate touch targets (44×44px minimum)
- ✅ Layout looks good across all breakpoints (320px - 1920px)
- ✅ Desktop layout unaffected

### Issue 4: Black Block Images
- ✅ Priority images render correctly (visible, not black)
- ✅ Priority images match quality of expandable list
- ✅ No CORS errors in console
- ✅ Images clickable to open in new tab

---

## Follow-Up Tasks

After implementing these fixes, consider:

1. **Unit Tests for URL Conversion**
   - Add tests for `extractLinks()` with various URL formats
   - Add tests for `extractImages()` with relative paths

2. **Integration Tests for Dialogs**
   - Automated E2E test for dialog ESC/click behavior
   - Test nested dialog scenarios

3. **Responsive Design System**
   - Create consistent breakpoint strategy
   - Document responsive patterns for future components

4. **Image Loading Strategy**
   - Consider lazy loading strategy across all components
   - Implement consistent error handling for images
   - Add loading skeletons for better UX

5. **Mobile Testing Suite**
   - Add mobile viewport tests to CI/CD
   - Test on real devices, not just emulators

---

## Approval & Next Steps

**Status**: ⏸️ **Awaiting Approval**

**Questions for Review**:
1. Is the priority order correct? (URL conversion → Mobile → Images → Dialogs)
2. Should Issue 4 investigation happen before or after other fixes?
3. Any preference between mobile solutions (icons vs dropdown)?
4. Should this be one PR or separate PRs per issue?

**Ready to Implement**: ✅ All issues researched and solutions designed

---

*Document created: December 2024*  
*Last updated: December 2024*  
*Status: Planning Phase - No Implementation*
