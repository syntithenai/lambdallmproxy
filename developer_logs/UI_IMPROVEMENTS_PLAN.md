# UI Improvements Implementation Plan

## Overview
This document outlines the required UI changes for improved LLM transparency, media display, and cost tracking.

---

## 1. ✅ Image Generation Tool Block - Show Query/Prompt

**File**: `ui-new/src/components/GeneratedImageBlock.tsx`

**Status**: **ALREADY IMPLEMENTED**
- Prompt is displayed at lines 362-368
- Shows truncated prompt (150 chars) with full text option
- No changes needed

---

## 2. 🔧 LLM Transparency Dialog - Total Cost & Token Summary

**File**: `ui-new/src/components/LlmInfoDialog.tsx`

### Current Implementation
- **Lines 154-177**: Calculates `totalActualCost`, `totalPaidEquivalent`, `hasFreeModels`
- **Lines 193-203**: Shows total cost in dialog header
- **Lines 462-476**: Shows total cost in dialog footer

### Required Changes

#### A. Add Total Token Calculation
**Location**: After line 177 (after total cost calculation)

```typescript
// Calculate total tokens across all calls
const { totalPromptTokens, totalCompletionTokens, totalTokens, hasPricing } = apiCalls.reduce((acc, call) => {
  // Skip image generation calls (no tokens)
  if (call.type === 'image_generation') {
    return acc;
  }
  
  const tokensIn = call.response?.usage?.prompt_tokens || 0;
  const tokensOut = call.response?.usage?.completion_tokens || 0;
  const breakdown = getCostBreakdown(call.model, tokensIn, tokensOut);
  
  return {
    totalPromptTokens: acc.totalPromptTokens + tokensIn,
    totalCompletionTokens: acc.totalCompletionTokens + tokensOut,
    totalTokens: acc.totalTokens + tokensIn + tokensOut,
    hasPricing: acc.hasPricing || breakdown.hasPricing
  };
}, { totalPromptTokens: 0, totalCompletionTokens: 0, totalTokens: 0, hasPricing: false });
```

#### B. Add Token Summary Section in Header
**Location**: Lines 193-203 (update the header subtitle)

Replace current subtitle with:
```tsx
<div className="flex gap-4 mt-1 text-sm text-gray-600 dark:text-gray-400">
  <span>{apiCalls.length} call{apiCalls.length !== 1 ? 's' : ''}</span>
  
  {/* Token Summary */}
  {totalTokens > 0 && (
    <>
      <span>•</span>
      <span>
        {totalTokens.toLocaleString()} tokens
        <span className="text-xs opacity-75 ml-1">
          ({totalPromptTokens.toLocaleString()} in, {totalCompletionTokens.toLocaleString()} out)
        </span>
      </span>
    </>
  )}
  
  {/* Cost Summary with Pricing Warning */}
  {totalActualCost > 0 && (
    <>
      <span>•</span>
      <span className="font-semibold text-green-600 dark:text-green-400">
        💰 {formatCost(totalActualCost)}
        {hasFreeModels && totalPaidEquivalent > 0 && (
          <span className="text-xs opacity-75 ml-1">
            (would be {formatCost(totalPaidEquivalent)} on paid)
          </span>
        )}
      </span>
    </>
  )}
  
  {/* Pricing Warning */}
  {!hasPricing && totalTokens > 0 && (
    <>
      <span>•</span>
      <span className="font-medium text-yellow-600 dark:text-yellow-400" title="Pricing information not available for some models">
        ⚠️ No pricing info
      </span>
    </>
  )}
</div>
```

#### C. Update Footer Summary
**Location**: Lines 462-476

Add token information to footer:
```tsx
<div className="p-4 border-t border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 flex justify-between items-center">
  <div className="text-sm text-gray-600 dark:text-gray-400 flex gap-4">
    {/* Token Summary */}
    {totalTokens > 0 && (
      <span>
        📊 {totalTokens.toLocaleString()} tokens
        <span className="text-xs opacity-75 ml-1">
          ({totalPromptTokens.toLocaleString()} in, {totalCompletionTokens.toLocaleString()} out)
        </span>
      </span>
    )}
    
    {/* Cost Summary */}
    {totalActualCost > 0 && (
      <span className="font-semibold text-green-600 dark:text-green-400">
        💰 Total Cost: {formatCost(totalActualCost)}
        {hasFreeModels && totalPaidEquivalent > 0 && (
          <span className="text-xs opacity-75 ml-1">
            (would be {formatCost(totalPaidEquivalent)} on paid plan)
          </span>
        )}
      </span>
    )}
    
    {/* Pricing Warning */}
    {!hasPricing && totalTokens > 0 && (
      <span className="font-medium text-yellow-600 dark:text-yellow-400">
        ⚠️ Some models lack pricing data
      </span>
    )}
  </div>
  <button
    onClick={onClose}
    className="px-4 py-2 bg-gray-500 hover:bg-gray-600 text-white rounded transition-colors"
  >
    Close
  </button>
</div>
```

---

## 3. 🔧 LLM Response Blocks - Show Selected Images

**File**: `ui-new/src/components/ChatTab.tsx`

### Current State
- Messages are rendered around line 3100
- ExtractedContent component exists but may not show images inline
- Search results store images in message metadata

### Required Changes

#### A. Create Image Gallery Component
**New File**: `ui-new/src/components/ImageGallery.tsx`

```tsx
import React from 'react';

interface ImageGalleryProps {
  images: string[];
  maxDisplay?: number; // Show only first N images inline (default 3)
  onImageClick?: (url: string) => void;
}

export const ImageGallery: React.FC<ImageGalleryProps> = ({ 
  images, 
  maxDisplay = 3,
  onImageClick 
}) => {
  if (!images || images.length === 0) return null;
  
  const displayImages = images.slice(0, maxDisplay);
  
  return (
    <div className="my-4 flex gap-2 flex-wrap">
      {displayImages.map((imageUrl, idx) => (
        <div 
          key={idx}
          className="relative group cursor-pointer rounded-lg overflow-hidden border border-gray-200 dark:border-gray-700 hover:border-blue-500 dark:hover:border-blue-400 transition-colors"
          onClick={() => onImageClick?.(imageUrl)}
        >
          <img 
            src={imageUrl} 
            alt={`Search result ${idx + 1}`}
            className="w-32 h-32 object-cover"
            loading="lazy"
          />
          <div className="absolute inset-0 bg-black bg-opacity-0 group-hover:bg-opacity-20 transition-opacity" />
        </div>
      ))}
      {images.length > maxDisplay && (
        <div className="flex items-center justify-center w-32 h-32 bg-gray-100 dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 text-gray-500 dark:text-gray-400 text-sm">
          +{images.length - maxDisplay} more
        </div>
      )}
    </div>
  );
};
```

#### B. Update Message Rendering in ChatTab
**Location**: Around line 3100 where `<MarkdownRenderer />` is used

```tsx
{msg.content && (
  <>
    <MarkdownRenderer content={getMessageText(msg.content)} />
    
    {/* Show selected images immediately after response */}
    {msg.extractedImages && msg.extractedImages.length > 0 && (
      <ImageGallery 
        images={msg.extractedImages}
        maxDisplay={3}
        onImageClick={(url) => {
          // Open image in new tab or modal
          window.open(url, '_blank');
        }}
      />
    )}
  </>
)}
```

---

## 4. 🔧 LLM Content Blocks - Expandable Media Sections

**File**: `ui-new/src/components/ChatTab.tsx`

### Required Changes

#### A. Create Media Sections Component
**New File**: `ui-new/src/components/MediaSections.tsx`

```tsx
import React, { useState } from 'react';

interface MediaSectionsProps {
  images?: string[];
  links?: Array<{ url: string; title?: string }>;
  youtubeLinks?: Array<{ url: string; title?: string }>;
  otherMedia?: Array<{ url: string; type: string }>;
}

export const MediaSections: React.FC<MediaSectionsProps> = ({
  images = [],
  links = [],
  youtubeLinks = [],
  otherMedia = []
}) => {
  const [expandedSection, setExpandedSection] = useState<string | null>(null);
  
  const toggleSection = (section: string) => {
    setExpandedSection(expandedSection === section ? null : section);
  };
  
  const hasAnyContent = images.length > 0 || links.length > 0 || youtubeLinks.length > 0 || otherMedia.length > 0;
  
  if (!hasAnyContent) return null;
  
  return (
    <div className="mt-4 border-t border-gray-200 dark:border-gray-700 pt-4 space-y-2">
      <div className="text-sm font-medium text-gray-600 dark:text-gray-400 mb-2">
        📎 Extracted Content
      </div>
      
      {/* All Images Section */}
      {images.length > 0 && (
        <div className="border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden">
          <button
            onClick={() => toggleSection('images')}
            className="w-full px-3 py-2 bg-gray-50 dark:bg-gray-800 hover:bg-gray-100 dark:hover:bg-gray-700 flex items-center justify-between text-sm transition-colors"
          >
            <span className="font-medium text-gray-700 dark:text-gray-300">
              🖼️ All Images ({images.length})
            </span>
            <svg
              className={`w-4 h-4 transform transition-transform ${expandedSection === 'images' ? 'rotate-180' : ''}`}
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </button>
          {expandedSection === 'images' && (
            <div className="p-3 grid grid-cols-4 gap-2">
              {images.map((img, idx) => (
                <a 
                  key={idx}
                  href={img}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="relative group rounded overflow-hidden border border-gray-200 dark:border-gray-700 hover:border-blue-500 dark:hover:border-blue-400"
                >
                  <img 
                    src={img} 
                    alt={`Image ${idx + 1}`}
                    className="w-full h-24 object-cover"
                    loading="lazy"
                  />
                </a>
              ))}
            </div>
          )}
        </div>
      )}
      
      {/* All Links Section */}
      {links.length > 0 && (
        <div className="border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden">
          <button
            onClick={() => toggleSection('links')}
            className="w-full px-3 py-2 bg-gray-50 dark:bg-gray-800 hover:bg-gray-100 dark:hover:bg-gray-700 flex items-center justify-between text-sm transition-colors"
          >
            <span className="font-medium text-gray-700 dark:text-gray-300">
              🔗 All Links ({links.length})
            </span>
            <svg
              className={`w-4 h-4 transform transition-transform ${expandedSection === 'links' ? 'rotate-180' : ''}`}
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </button>
          {expandedSection === 'links' && (
            <div className="p-3 space-y-1 max-h-64 overflow-y-auto">
              {links.map((link, idx) => (
                <a
                  key={idx}
                  href={link.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="block px-2 py-1 text-xs text-blue-600 dark:text-blue-400 hover:underline truncate"
                  title={link.title || link.url}
                >
                  {link.title || link.url}
                </a>
              ))}
            </div>
          )}
        </div>
      )}
      
      {/* YouTube Links Section */}
      {youtubeLinks.length > 0 && (
        <div className="border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden">
          <button
            onClick={() => toggleSection('youtube')}
            className="w-full px-3 py-2 bg-gray-50 dark:bg-gray-800 hover:bg-gray-100 dark:hover:bg-gray-700 flex items-center justify-between text-sm transition-colors"
          >
            <span className="font-medium text-gray-700 dark:text-gray-300">
              🎥 YouTube Links ({youtubeLinks.length})
            </span>
            <svg
              className={`w-4 h-4 transform transition-transform ${expandedSection === 'youtube' ? 'rotate-180' : ''}`}
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </button>
          {expandedSection === 'youtube' && (
            <div className="p-3 space-y-2">
              {youtubeLinks.map((link, idx) => (
                <a
                  key={idx}
                  href={link.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="block px-2 py-2 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded hover:bg-red-100 dark:hover:bg-red-900/30 transition-colors"
                >
                  <div className="text-xs font-medium text-red-700 dark:text-red-300 truncate">
                    {link.title || 'YouTube Video'}
                  </div>
                  <div className="text-xs text-red-600 dark:text-red-400 truncate opacity-75">
                    {link.url}
                  </div>
                </a>
              ))}
            </div>
          )}
        </div>
      )}
      
      {/* Other Media Section */}
      {otherMedia.length > 0 && (
        <div className="border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden">
          <button
            onClick={() => toggleSection('media')}
            className="w-full px-3 py-2 bg-gray-50 dark:bg-gray-800 hover:bg-gray-100 dark:hover:bg-gray-700 flex items-center justify-between text-sm transition-colors"
          >
            <span className="font-medium text-gray-700 dark:text-gray-300">
              📁 Other Media ({otherMedia.length})
            </span>
            <svg
              className={`w-4 h-4 transform transition-transform ${expandedSection === 'media' ? 'rotate-180' : ''}`}
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </button>
          {expandedSection === 'media' && (
            <div className="p-3 space-y-1 max-h-64 overflow-y-auto">
              {otherMedia.map((media, idx) => (
                <a
                  key={idx}
                  href={media.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="block px-2 py-1 text-xs hover:underline"
                >
                  <span className="text-gray-500 dark:text-gray-400">[{media.type}]</span>{' '}
                  <span className="text-blue-600 dark:text-blue-400">{media.url}</span>
                </a>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
};
```

#### B. Extract Media from Messages
**Location**: ChatTab.tsx, create utility function

```typescript
// Add this function near the top of ChatTab.tsx
const extractMediaFromMessage = (message: any) => {
  const media = {
    images: [] as string[],
    links: [] as Array<{ url: string; title?: string }>,
    youtubeLinks: [] as Array<{ url: string; title?: string }>,
    otherMedia: [] as Array<{ url: string; type: string }>
  };
  
  // Extract from tool results if present
  if (message.toolResults) {
    message.toolResults.forEach((result: any) => {
      try {
        const data = JSON.parse(result.content || '{}');
        
        // Search results
        if (data.results) {
          data.results.forEach((r: any) => {
            if (r.images) media.images.push(...r.images);
            if (r.links) media.links.push(...r.links.map((l: any) => ({ url: l })));
            if (r.url) media.links.push({ url: r.url, title: r.title });
          });
        }
        
        // YouTube results
        if (data.videos) {
          data.videos.forEach((v: any) => {
            media.youtubeLinks.push({ url: v.url, title: v.title });
          });
        }
        
        // Direct images array
        if (data.images && Array.isArray(data.images)) {
          media.images.push(...data.images);
        }
      } catch (e) {
        // Skip invalid JSON
      }
    });
  }
  
  // Deduplicate
  media.images = [...new Set(media.images)];
  media.links = Array.from(new Map(media.links.map(l => [l.url, l])).values());
  media.youtubeLinks = Array.from(new Map(media.youtubeLinks.map(l => [l.url, l])).values());
  
  return media;
};
```

#### C. Update Message Rendering
**Location**: Around line 3100 in ChatTab.tsx

```tsx
{msg.content && (
  <>
    <MarkdownRenderer content={getMessageText(msg.content)} />
    
    {/* Show selected images immediately after response */}
    {(() => {
      const media = extractMediaFromMessage(msg);
      return (
        <>
          {media.images.length > 0 && (
            <ImageGallery 
              images={media.images}
              maxDisplay={3}
              onImageClick={(url) => window.open(url, '_blank')}
            />
          )}
          
          {/* Expandable media sections at the end */}
          <MediaSections
            images={media.images}
            links={media.links}
            youtubeLinks={media.youtubeLinks}
            otherMedia={media.otherMedia}
          />
        </>
      );
    })()}
  </>
)}
```

---

## Implementation Checklist

### Phase 1: LLM Transparency Improvements
- [ ] Add total token calculation to LlmInfoDialog.tsx
- [ ] Update header to show token counts and pricing warnings
- [ ] Update footer to show comprehensive summary
- [ ] Test with various model combinations (free/paid)

### Phase 2: Image Display
- [ ] Create ImageGallery.tsx component
- [ ] Add inline image display (3 images after response)
- [ ] Test with search results containing images

### Phase 3: Expandable Media Sections
- [ ] Create MediaSections.tsx component
- [ ] Add extractMediaFromMessage utility function
- [ ] Integrate MediaSections into message rendering
- [ ] Test with various tool results (search, YouTube, etc.)

### Phase 4: Testing
- [ ] Test image generation with prompt display
- [ ] Test LLM transparency with multiple calls
- [ ] Test image gallery with search results
- [ ] Test expandable sections with all media types
- [ ] Test responsiveness on mobile devices

---

## Notes

1. **Image Gallery**: Consider adding lightbox functionality for full-size image viewing
2. **Performance**: Use lazy loading for images to improve performance
3. **Media Extraction**: May need to update based on actual tool result structure
4. **Accessibility**: Add proper ARIA labels and keyboard navigation
5. **Dark Mode**: All components include dark mode support

## Estimated Implementation Time
- Phase 1: 30-45 minutes
- Phase 2: 20-30 minutes
- Phase 3: 45-60 minutes
- Phase 4: 30 minutes
- **Total**: ~2.5-3 hours
