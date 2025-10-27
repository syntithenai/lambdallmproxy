# Markdown Editor Integration Plan for Snippet Editing Dialog

## Overview

Add a professional markdown-based WYSIWYG/split-view editor to the SwagPage snippet editing dialog to replace the current plain textarea. The editor must support:

- **Image editing**: Insert, resize, position images with drag-and-drop
- **Link editing**: Create, edit, preview links with visual indicators
- **List editing**: Numbered, bulleted, task lists with keyboard shortcuts
- **Live preview**: Side-by-side or toggle view
- **Markdown syntax**: Full CommonMark/GFM support
- **Dark mode**: Consistent with existing UI theme

---

## Current Implementation Analysis

**File**: `ui-new/src/components/SwagPage.tsx`

**Current Editor** (Lines 1764-1880):
- Plain `<textarea>` element
- No markdown preview
- No WYSIWYG features
- Font-mono styling
- Fixed height: `calc(100vh-28rem)` with 400px minimum

**Dialog Structure**:
```tsx
{editingSnippet && (
  <div className="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center p-4 z-50">
    <div className="bg-white dark:bg-gray-800 rounded-lg shadow-2xl w-full h-full max-w-6xl max-h-[95vh]">
      {/* Header: Title + Close */}
      {/* Content Section: Title input, Tags, Content textarea */}
      {/* Footer: Cancel + Save buttons */}
    </div>
  </div>
)}
```

**State Management**:
```typescript
const [editingSnippet, setEditingSnippet] = useState<ContentSnippet | null>(null);
const [editContent, setEditContent] = useState('');
const [editTitle, setEditTitle] = useState('');
const [editTags, setEditTags] = useState<string[]>([]);
```

---

## Markdown Editor Options Comparison

### 1. **React-MD-Editor** ⭐ RECOMMENDED

**NPM**: `@uiw/react-md-editor` (10K+ weekly downloads)

**Pros**:
- ✅ **Minimal setup** - Works out-of-box with React
- ✅ **Split view** - Edit + preview side-by-side or toggle
- ✅ **Dark mode** - Built-in theme support
- ✅ **Lightweight** - ~200KB minified
- ✅ **Image support** - Drag-and-drop, paste, markdown syntax
- ✅ **Link editing** - Visual link insertion dialog
- ✅ **List support** - Toolbar buttons for lists, keyboard shortcuts
- ✅ **GFM support** - Tables, task lists, strikethrough
- ✅ **Toolbar** - Customizable with common markdown actions
- ✅ **Syntax highlighting** - Code blocks with language support
- ✅ **No dependencies** - Self-contained markdown parser
- ✅ **TypeScript** - Full type definitions

**Cons**:
- ⚠️ **Limited WYSIWYG** - Primarily markdown-focused, not rich-text
- ⚠️ **Styling conflicts** - May need CSS overrides for dark mode integration
- ⚠️ **Image upload** - No built-in image upload handler (needs custom implementation)

**Use Case**: Best for **markdown-first** editing with live preview

**Example**:
```tsx
import MDEditor from '@uiw/react-md-editor';

<MDEditor
  value={editContent}
  onChange={(val) => setEditContent(val || '')}
  height={400}
  preview="live" // 'live' | 'edit' | 'preview'
  hideToolbar={false}
  enableScroll={true}
/>
```

**Customization**:
- Custom toolbar commands
- Image upload handler via `onDrop` event
- Dark mode via `data-color-mode="dark"`

---

### 2. **Toast UI Editor**

**NPM**: `@toast-ui/react-editor` (20K+ weekly downloads)

**Pros**:
- ✅ **Full WYSIWYG** - Rich text editing with markdown output
- ✅ **Image upload** - Built-in image upload with custom handler
- ✅ **Advanced tables** - Table editor with merge cells
- ✅ **Widget plugins** - Charts, UML diagrams, syntax highlighting
- ✅ **Link editing** - Visual link dialog with preview
- ✅ **List support** - Full list editing with nesting
- ✅ **Markdown + WYSIWYG** - Switch between modes seamlessly
- ✅ **Toolbar** - Extensive customization options
- ✅ **i18n** - Multi-language support

**Cons**:
- ❌ **Heavy** - ~800KB minified (4x larger than react-md-editor)
- ❌ **Complex setup** - Requires CSS imports, theme configuration
- ❌ **Dark mode** - Limited built-in support, needs custom theme
- ❌ **React integration** - Wrapper around vanilla JS library (performance overhead)
- ❌ **Overkill** - Too many features for simple snippet editing

**Use Case**: Best for **advanced document editing** with complex formatting

**Example**:
```tsx
import { Editor } from '@toast-ui/react-editor';
import '@toast-ui/editor/dist/toastui-editor.css';

<Editor
  initialValue={editContent}
  onChange={() => setEditContent(editorRef.current?.getInstance().getMarkdown())}
  previewStyle="vertical" // 'tab' | 'vertical'
  height="600px"
  initialEditType="markdown" // 'markdown' | 'wysiwyg'
  useCommandShortcut={true}
/>
```

---

### 3. **SimpleMDE / EasyMDE**

**NPM**: `easymde` (30K+ weekly downloads)

**Pros**:
- ✅ **Simple** - Minimal configuration, lightweight (~150KB)
- ✅ **Split view** - Side-by-side editing + preview
- ✅ **Toolbar** - Classic markdown toolbar
- ✅ **Autosave** - Built-in draft saving
- ✅ **Image upload** - Drag-and-drop with custom handler
- ✅ **Spell check** - Native browser spell checking
- ✅ **Link editing** - Link insertion dialog

**Cons**:
- ❌ **jQuery-style** - Not React-first (needs wrapper component)
- ❌ **Dark mode** - Requires custom CSS theming
- ❌ **Outdated design** - Feels dated compared to modern editors
- ❌ **Limited TypeScript** - Community type definitions only
- ❌ **React wrapper** - `react-simplemde-editor` is a thin wrapper, not ideal

**Use Case**: Good for **legacy projects** or when bundle size is critical

---

### 4. **React Quill**

**NPM**: `react-quill` (100K+ weekly downloads)

**Pros**:
- ✅ **WYSIWYG** - True rich-text editing experience
- ✅ **Image support** - Drag-and-drop, resize, positioning
- ✅ **Link editing** - Visual link insertion with preview
- ✅ **List support** - Ordered, unordered, indentation
- ✅ **Toolbar** - Highly customizable
- ✅ **Popular** - Large community, many plugins

**Cons**:
- ❌ **Not markdown** - Outputs HTML/Delta, not markdown
- ❌ **Conversion needed** - Requires HTML ↔ Markdown conversion
- ❌ **Heavy** - ~250KB + dependencies
- ❌ **Complexity** - More setup than markdown-native editors
- ❌ **Markdown syntax** - Users can't directly write markdown

**Use Case**: Best when **HTML output** is acceptable, not markdown

---

### 5. **Milkdown**

**NPM**: `@milkdown/react` (5K+ weekly downloads)

**Pros**:
- ✅ **Modern** - Built with ProseMirror (same as Notion, Confluence)
- ✅ **Plugin architecture** - Modular, extensible
- ✅ **WYSIWYG markdown** - Real-time markdown rendering
- ✅ **Image support** - Advanced image handling with plugins
- ✅ **Dark mode** - Built-in theme support
- ✅ **TypeScript** - Full type safety
- ✅ **Performance** - Optimized rendering

**Cons**:
- ❌ **Complex setup** - Steep learning curve, plugin configuration
- ❌ **Bundle size** - ~300KB with basic plugins
- ❌ **Documentation** - Less comprehensive than alternatives
- ❌ **Bleeding edge** - Frequent breaking changes
- ❌ **Overkill** - Advanced features not needed for snippets

**Use Case**: Best for **collaborative editing** or Notion-like experiences

---

### 6. **CodeMirror 6 + Markdown Mode**

**NPM**: `@codemirror/view`, `@codemirror/lang-markdown`

**Pros**:
- ✅ **Lightweight** - Core is ~150KB
- ✅ **Customizable** - Full control over behavior
- ✅ **Syntax highlighting** - Excellent markdown syntax support
- ✅ **Extensions** - Modular plugin system
- ✅ **Performance** - Handles large documents well
- ✅ **TypeScript** - Native TypeScript support

**Cons**:
- ❌ **No preview** - Requires separate preview component
- ❌ **DIY** - Must build toolbar, image upload, link editing yourself
- ❌ **Setup complexity** - More code than other solutions
- ❌ **Not WYSIWYG** - Code editor, not rich-text

**Use Case**: Best for **code-centric** markdown editing (GitHub-style)

---

## Recommendation: **React-MD-Editor**

**Why?**
1. **Best fit** - Balances features, bundle size, and ease of integration
2. **Markdown-first** - Matches snippet use case (technical notes, code)
3. **Dark mode** - Built-in theme switching
4. **Minimal changes** - Drop-in replacement for `<textarea>`
5. **Image/Link support** - Toolbar buttons + markdown syntax
6. **GFM support** - Task lists, tables, strikethrough

**Trade-offs**:
- Not a full WYSIWYG like Toast UI (but that's overkill for snippets)
- Requires custom image upload handler (can integrate with existing image tools)

---

## Implementation Plan

### Phase 1: Install and Basic Integration (30 minutes)

#### 1.1 Install Dependencies

```bash
cd ui-new
npm install @uiw/react-md-editor
npm install @uiw/react-markdown-preview  # For consistent preview styling
```

**Bundle impact**: +200KB minified (~60KB gzipped)

#### 1.2 Create Markdown Editor Component

**File**: `ui-new/src/components/MarkdownEditor.tsx` (NEW)

```tsx
import React, { useEffect, useState } from 'react';
import MDEditor, { commands } from '@uiw/react-md-editor';
import rehypeSanitize from 'rehype-sanitize';

interface MarkdownEditorProps {
  value: string;
  onChange: (value: string) => void;
  height?: number | string;
  placeholder?: string;
  preview?: 'live' | 'edit' | 'preview';
  onImageUpload?: (file: File) => Promise<string>; // Returns image URL
}

export const MarkdownEditor: React.FC<MarkdownEditorProps> = ({
  value,
  onChange,
  height = 400,
  placeholder = 'Enter markdown content...',
  preview = 'live',
  onImageUpload
}) => {
  const [previewMode, setPreviewMode] = useState<'live' | 'edit' | 'preview'>(preview);
  const [isDark, setIsDark] = useState(false);

  // Detect dark mode from document
  useEffect(() => {
    const checkDarkMode = () => {
      setIsDark(document.documentElement.classList.contains('dark'));
    };
    
    checkDarkMode();
    
    // Watch for theme changes
    const observer = new MutationObserver(checkDarkMode);
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['class']
    });
    
    return () => observer.disconnect();
  }, []);

  // Custom image upload command
  const imageUploadCommand = {
    name: 'image-upload',
    keyCommand: 'image-upload',
    buttonProps: { 'aria-label': 'Upload image' },
    icon: (
      <svg viewBox="0 0 1024 1024" width="12" height="12">
        <path fill="currentColor" d="M716.8 921.6a51.2 51.2 0 1 1 0 102.4H307.2a51.2 51.2 0 1 1 0-102.4h409.6zM475.8016 382.1568a51.2 51.2 0 0 1 72.3968 0l144.8448 144.8448a51.2 51.2 0 0 1-72.448 72.3968L563.2 541.952V768a51.2 51.2 0 0 1-45.2096 50.8416L512 819.2a51.2 51.2 0 0 1-51.2-51.2v-226.048l-57.3952 57.4464a51.2 51.2 0 0 1-67.584 4.2496l-4.864-4.2496a51.2 51.2 0 0 1 0-72.3968zM512 0c138.6496 0 253.4912 102.144 277.1456 236.288l10.752 0.3072C924.928 242.688 1024 348.0576 1024 476.5696 1024 608.9728 918.8352 716.8 788.48 716.8a51.2 51.2 0 1 1 0-102.4l8.3456-0.256C866.2016 609.6384 921.6 550.0416 921.6 476.5696c0-76.4416-59.904-137.8816-133.12-137.8816h-97.28v-51.2C691.2 184.9856 610.6624 102.4 512 102.4S332.8 184.9856 332.8 287.488v51.2h-97.28C162.304 338.688 102.4 400.128 102.4 476.5696c0 73.4208 55.3984 133.0176 124.0576 137.8816l8.3456 0.256a51.2 51.2 0 0 1 0 102.4C104.8064 716.8 0 608.9728 0 476.5696c0-128.512 99.072-233.8816 224.1024-239.9744C247.7568 102.144 362.5984 0 512 0z" />
      </svg>
    ),
    execute: async (state, api) => {
      if (!onImageUpload) {
        // Fallback: insert markdown image syntax
        api.replaceSelection('![alt text](image-url)');
        return;
      }

      // Trigger file input
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = 'image/*';
      input.onchange = async (e) => {
        const file = (e.target as HTMLInputElement).files?.[0];
        if (!file) return;

        try {
          const imageUrl = await onImageUpload(file);
          api.replaceSelection(`![${file.name}](${imageUrl})`);
        } catch (error) {
          console.error('Image upload failed:', error);
          api.replaceSelection(`![Upload failed]()`);
        }
      };
      input.click();
    }
  };

  return (
    <div data-color-mode={isDark ? 'dark' : 'light'}>
      <MDEditor
        value={value}
        onChange={(val) => onChange(val || '')}
        height={height}
        preview={previewMode}
        hideToolbar={false}
        enableScroll={true}
        textareaProps={{
          placeholder
        }}
        previewOptions={{
          rehypePlugins: [[rehypeSanitize]]
        }}
        commands={[
          commands.group(
            [commands.title1, commands.title2, commands.title3],
            { name: 'title', groupName: 'title', buttonProps: { 'aria-label': 'Insert title' } }
          ),
          commands.divider,
          commands.bold,
          commands.italic,
          commands.strikethrough,
          commands.divider,
          commands.link,
          onImageUpload ? imageUploadCommand : commands.image,
          commands.divider,
          commands.unorderedListCommand,
          commands.orderedListCommand,
          commands.checkedListCommand,
          commands.divider,
          commands.quote,
          commands.code,
          commands.codeBlock,
          commands.divider,
          commands.table,
          commands.divider,
          commands.help
        ]}
      />
    </div>
  );
};
```

**Features**:
- ✅ Dark mode auto-detection
- ✅ Custom image upload command
- ✅ Sanitized HTML preview
- ✅ Customizable toolbar
- ✅ Keyboard shortcuts
- ✅ Placeholder text

---

### Phase 2: Integrate into SwagPage Edit Dialog (20 minutes)

#### 2.1 Update SwagPage.tsx

**File**: `ui-new/src/components/SwagPage.tsx`

**Import statement** (add to line ~22):
```tsx
import { MarkdownEditor } from './MarkdownEditor';
```

**Replace textarea** (lines ~1830-1840):

**Before**:
```tsx
<div className="flex-1">
  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
    Content
  </label>
  <textarea
    value={editContent}
    onChange={(e) => setEditContent(e.target.value)}
    className="w-full h-[calc(100vh-28rem)] min-h-[400px] px-4 py-3 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white font-mono text-sm resize-none"
    placeholder="Enter content..."
  />
</div>
```

**After**:
```tsx
<div className="flex-1">
  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
    Content
  </label>
  <MarkdownEditor
    value={editContent}
    onChange={setEditContent}
    height="calc(100vh - 28rem)"
    placeholder="Enter markdown content..."
    preview="live"
    onImageUpload={handleImageUpload}
  />
</div>
```

#### 2.2 Add Image Upload Handler

**Add to SwagPage.tsx** (after handleSaveEdit function, ~line 840):

```tsx
const handleImageUpload = async (file: File): Promise<string> => {
  try {
    // Option 1: Upload to existing image service (if available)
    // const formData = new FormData();
    // formData.append('image', file);
    // const response = await fetch('/api/upload-image', { method: 'POST', body: formData });
    // const { url } = await response.json();
    // return url;

    // Option 2: Convert to base64 data URL (simple, no server needed)
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  } catch (error) {
    console.error('Image upload failed:', error);
    throw error;
  }
};
```

**Options for image storage**:
1. **Base64 data URLs** - Simple, no server, but increases snippet size
2. **S3 upload** - Integrate with image editor Lambda function (future)
3. **IndexedDB** - Store images locally, reference by ID
4. **External service** - Imgur, Cloudinary, etc.

---

### Phase 3: Styling and Customization (15 minutes)

#### 3.1 Add Custom CSS for Dark Mode

**File**: `ui-new/src/styles/markdown-editor.css` (NEW)

```css
/* Override react-md-editor styles for dark mode consistency */

[data-color-mode="dark"] .w-md-editor {
  background-color: rgb(31 41 55); /* dark:bg-gray-800 */
  border-color: rgb(75 85 99); /* dark:border-gray-600 */
  color: rgb(243 244 246); /* dark:text-gray-100 */
}

[data-color-mode="dark"] .w-md-editor-toolbar {
  background-color: rgb(17 24 39); /* dark:bg-gray-900 */
  border-bottom-color: rgb(75 85 99);
}

[data-color-mode="dark"] .w-md-editor-text-pre,
[data-color-mode="dark"] .w-md-editor-text-input {
  background-color: rgb(31 41 55);
  color: rgb(243 244 246);
}

[data-color-mode="dark"] .w-md-editor-preview {
  background-color: rgb(31 41 55);
  color: rgb(243 244 246);
}

/* Match existing UI border radius */
.w-md-editor {
  border-radius: 0.5rem; /* rounded-lg */
}

/* Make toolbar icons consistent with app */
.w-md-editor-toolbar button {
  color: rgb(107 114 128); /* text-gray-500 */
}

.w-md-editor-toolbar button:hover {
  color: rgb(31 41 55); /* text-gray-800 dark mode */
  background-color: rgb(243 244 246); /* hover:bg-gray-100 */
}

[data-color-mode="dark"] .w-md-editor-toolbar button:hover {
  color: rgb(243 244 246);
  background-color: rgb(55 65 81); /* dark:hover:bg-gray-700 */
}

/* Code block syntax highlighting in dark mode */
[data-color-mode="dark"] .w-md-editor-preview code {
  background-color: rgb(17 24 39);
  color: rgb(253 186 116); /* amber-300 */
}

[data-color-mode="dark"] .w-md-editor-preview pre {
  background-color: rgb(17 24 39);
  border-color: rgb(75 85 99);
}

/* Link styling */
.w-md-editor-preview a {
  color: rgb(59 130 246); /* blue-500 */
  text-decoration: underline;
}

[data-color-mode="dark"] .w-md-editor-preview a {
  color: rgb(96 165 250); /* blue-400 */
}

/* Image styling */
.w-md-editor-preview img {
  max-width: 100%;
  height: auto;
  border-radius: 0.5rem;
  margin: 1rem 0;
}

/* List styling */
.w-md-editor-preview ul,
.w-md-editor-preview ol {
  padding-left: 2rem;
  margin: 1rem 0;
}

.w-md-editor-preview li {
  margin: 0.5rem 0;
}

/* Task list styling */
.w-md-editor-preview input[type="checkbox"] {
  margin-right: 0.5rem;
}
```

#### 3.2 Import CSS in SwagPage

**File**: `ui-new/src/components/SwagPage.tsx`

Add to imports:
```tsx
import '../styles/markdown-editor.css';
```

---

### Phase 4: Advanced Features (Optional, 30 minutes)

#### 4.1 Add View Mode Toggle

Add state for editor view mode:
```tsx
const [editorPreviewMode, setEditorPreviewMode] = useState<'live' | 'edit' | 'preview'>('live');
```

Add toggle buttons above editor:
```tsx
<div className="flex justify-end gap-2 mb-2">
  <button
    onClick={() => setEditorPreviewMode('edit')}
    className={`px-3 py-1 text-sm rounded ${editorPreviewMode === 'edit' ? 'bg-blue-600 text-white' : 'bg-gray-200 dark:bg-gray-700'}`}
  >
    Edit
  </button>
  <button
    onClick={() => setEditorPreviewMode('live')}
    className={`px-3 py-1 text-sm rounded ${editorPreviewMode === 'live' ? 'bg-blue-600 text-white' : 'bg-gray-200 dark:bg-gray-700'}`}
  >
    Split
  </button>
  <button
    onClick={() => setEditorPreviewMode('preview')}
    className={`px-3 py-1 text-sm rounded ${editorPreviewMode === 'preview' ? 'bg-blue-600 text-white' : 'bg-gray-200 dark:bg-gray-700'}`}
  >
    Preview
  </button>
</div>

<MarkdownEditor
  value={editContent}
  onChange={setEditContent}
  preview={editorPreviewMode}
  {...}
/>
```

#### 4.2 Add Image Gallery Integration

If using the image editor feature:
```tsx
const handleImageUpload = async (file: File): Promise<string> => {
  // Generate image ID
  const imageId = `img_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  
  // Store in IndexedDB
  await ragDB.storeImage(imageId, file);
  
  // Return IndexedDB reference
  return `indexeddb://${imageId}`;
};
```

#### 4.3 Add Link Preview

Custom link command with preview:
```tsx
const linkWithPreviewCommand = {
  name: 'link-preview',
  keyCommand: 'link',
  execute: (state, api) => {
    const url = prompt('Enter URL:');
    const title = prompt('Enter link text:');
    if (url && title) {
      api.replaceSelection(`[${title}](${url} "Preview: ${url}")`);
    }
  }
};
```

---

## Testing Plan

### Manual Testing Checklist

- [ ] **Basic editing**: Type markdown, see live preview
- [ ] **Dark mode**: Toggle theme, verify colors update
- [ ] **Images**: Insert via toolbar, drag-and-drop, paste
- [ ] **Links**: Create links via toolbar, verify clickable in preview
- [ ] **Lists**: Create ordered, unordered, task lists
- [ ] **Code blocks**: Insert code with syntax highlighting
- [ ] **Tables**: Create tables via toolbar
- [ ] **Save/Cancel**: Verify content persists on save
- [ ] **Keyboard shortcuts**: Ctrl+B (bold), Ctrl+I (italic), etc.
- [ ] **Mobile**: Test on small screens, touch targets

### Edge Cases

- [ ] **Large content**: Test with 10,000+ characters
- [ ] **Special characters**: Markdown syntax characters in text
- [ ] **Empty content**: Save with no content
- [ ] **Image errors**: Upload failure handling
- [ ] **Link validation**: Malformed URLs

---

## Rollback Plan

If issues arise:

1. **Quick revert**: Replace `<MarkdownEditor>` with original `<textarea>`
2. **Remove package**: `npm uninstall @uiw/react-md-editor`
3. **Remove CSS**: Delete `markdown-editor.css` import
4. **Remove handler**: Delete `handleImageUpload` function

---

## Alternative: Phase 2 - Toast UI Editor (If More Features Needed)

If react-md-editor is insufficient, upgrade to Toast UI:

**Install**:
```bash
npm install @toast-ui/react-editor
```

**Replace MarkdownEditor component**:
```tsx
import { Editor } from '@toast-ui/react-editor';
import '@toast-ui/editor/dist/toastui-editor.css';
import '@toast-ui/editor/dist/theme/toastui-editor-dark.css';

<Editor
  ref={editorRef}
  initialValue={editContent}
  onChange={() => setEditContent(editorRef.current?.getInstance().getMarkdown())}
  previewStyle="vertical"
  height="600px"
  initialEditType="markdown"
  useCommandShortcut={true}
  hooks={{
    addImageBlobHook: async (blob, callback) => {
      const url = await handleImageUpload(blob);
      callback(url, blob.name);
    }
  }}
/>
```

**Trade-off**: +600KB bundle size, more complex API

---

## Migration Path

### Step 1: Feature Flag (Optional)

Add feature flag to test new editor:
```tsx
const USE_MARKDOWN_EDITOR = localStorage.getItem('use_markdown_editor') === 'true';

{USE_MARKDOWN_EDITOR ? (
  <MarkdownEditor ... />
) : (
  <textarea ... />
)}
```

### Step 2: Gradual Rollout

1. Deploy with feature flag off
2. Enable for testing users
3. Gather feedback
4. Remove flag, make default

---

## Summary

**Recommended Approach**: React-MD-Editor
- Minimal bundle impact (+200KB)
- Drop-in replacement for textarea
- Full markdown support with live preview
- Image/link/list editing built-in
- Dark mode compatible

**Timeline**:
- Phase 1: Install + Basic Integration (30 min)
- Phase 2: SwagPage Integration (20 min)
- Phase 3: Styling (15 min)
- Phase 4: Advanced Features (30 min, optional)
- **Total**: 1-2 hours

**Next Steps**:
1. Review editor options comparison
2. Approve react-md-editor selection
3. Implement Phase 1-3
4. Test and iterate

