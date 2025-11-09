import React, { useState, useEffect } from 'react';
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Image from '@tiptap/extension-image';
import Link from '@tiptap/extension-link';
import Placeholder from '@tiptap/extension-placeholder';
import { marked } from 'marked';
import TurndownService from 'turndown';
import { imageStorage } from '../utils/imageStorage';
import '../styles/tiptap-editor.css';

// Initialize turndown for HTML to Markdown conversion
const turndownService = new TurndownService({
  headingStyle: 'atx',
  codeBlockStyle: 'fenced'
});

interface TipTapEditorProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  editable?: boolean;
  snippetId?: string; // ID of snippet being edited
  snippetTags?: string[]; // Tags from snippet
  onImageEdit?: (imageData: {
    id: string;
    url: string;
    name: string;
    tags: string[];
    snippetId?: string;
    imageIndex?: number;
    width?: number;
    height?: number;
    format?: string;
    size?: number;
  }) => void;
}

export const TipTapEditor: React.FC<TipTapEditorProps> = ({
  value,
  onChange,
  placeholder = 'Start typing...',
  editable = true,
  snippetId,
  snippetTags = [],
  onImageEdit
}) => {
  const [displayValue, setDisplayValue] = useState(value);

  // Helper function to detect if content is markdown (not HTML)
  const isMarkdown = (content: string): boolean => {
    // If it starts with < it's probably HTML
    if (content.trim().startsWith('<')) return false;
    
    // Check for common markdown patterns
    const markdownPatterns = [
      /^#{1,6}\s/m,        // Headers
      /^\*\*.*\*\*/m,      // Bold
      /^\*.*\*/m,          // Italic
      /^\[.*\]\(.*\)/m,    // Links
      /^```/m,             // Code blocks
      /^[-*+]\s/m,         // Lists
      /^>\s/m,             // Blockquotes
    ];
    
    return markdownPatterns.some(pattern => pattern.test(content));
  };

  // Convert markdown to HTML if needed
  const processContent = async (content: string): Promise<string> => {
    if (!content) return '';
    
    // First, load images from IndexedDB if present
    let processedContent = content;
    if (content.includes('swag-image://')) {
      try {
        processedContent = await imageStorage.processContentForDisplay(content);
      } catch (error) {
        console.error('Failed to load images:', error);
      }
    }
    
    // Then convert markdown to HTML if it's markdown
    if (isMarkdown(processedContent)) {
      try {
        processedContent = await marked.parse(processedContent);
      } catch (error) {
        console.error('Failed to convert markdown:', error);
      }
    }
    
    return processedContent;
  };

  // Load images from IndexedDB when value changes
  useEffect(() => {
    const loadContent = async () => {
      const processed = await processContent(value);
      setDisplayValue(processed);
    };
    loadContent();
  }, [value]);

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: {
          levels: [1, 2, 3]
        }
      }),
      Image.configure({
        inline: true,
        allowBase64: true
      }),
      Link.configure({
        openOnClick: false,
        HTMLAttributes: {
          class: 'text-blue-600 dark:text-blue-400 underline hover:text-blue-800 dark:hover:text-blue-300'
        }
      }),
      Placeholder.configure({
        placeholder
      })
    ],
    content: displayValue,
    editable,
    onUpdate: ({ editor }) => {
      const html = editor.getHTML();
      // Convert HTML back to markdown for storage
      const markdown = turndownService.turndown(html);
      // Note: We don't process images on every update (too expensive)
      // Images are processed when the snippet is saved in SwagContext
      onChange(markdown);
    },
    editorProps: {
      attributes: {
        class: 'prose prose-sm dark:prose-invert max-w-none focus:outline-none min-h-[200px] p-4'
      }
    }
  });

  // Update content when displayValue changes
  useEffect(() => {
    if (editor && displayValue !== editor.getHTML()) {
      editor.commands.setContent(displayValue);
    }
  }, [displayValue, editor]);

  // Add click handler to images for editing  
  useEffect(() => {
    if (!editor || !onImageEdit) {
      console.log('TipTap: onImageEdit not provided or editor not ready');
      return;
    }

    console.log('TipTap: Setting up image click handler');

    const handleClick = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      
      // Check if click is on an image
      if (target.tagName === 'IMG') {
        const img = target as HTMLImageElement;
        
        // Any click on the image opens the editor
        e.preventDefault();
        e.stopPropagation();
        
        // Find the index of this image in the editor content
        const allImages = editor.view.dom.querySelectorAll('img');
        let imageIndex = 0;
        for (let i = 0; i < allImages.length; i++) {
          if (allImages[i] === img) {
            imageIndex = i;
            break;
          }
        }
        
        console.log('🖼️ TipTap image clicked - opening editor', { 
          imgSrc: img.src.substring(0, 50) + '...',
          alt: img.alt,
          snippetId,
          imageIndex
        });
        
        onImageEdit({
          id: `img_${Date.now()}`,
          url: img.src,
          name: img.alt || 'Image',
          tags: snippetTags,
          snippetId: snippetId,
          imageIndex: imageIndex,
        });
      }
    };

    const editorElement = editor.view.dom;
    editorElement.addEventListener('click', handleClick);
    
    return () => {
      editorElement.removeEventListener('click', handleClick);
    };
  }, [editor, onImageEdit]);

  if (!editor) {
    return null;
  }

  const addImage = () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.onchange = async (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (!file) return;

      // Convert to base64
      const reader = new FileReader();
      reader.onload = () => {
        const base64 = reader.result as string;
        editor.chain().focus().setImage({ src: base64 }).run();
      };
      reader.readAsDataURL(file);
    };
    input.click();
  };

  const setLink = () => {
    const previousUrl = editor.getAttributes('link').href;
    const url = window.prompt('URL', previousUrl);

    // cancelled
    if (url === null) {
      return;
    }

    // empty
    if (url === '') {
      editor.chain().focus().extendMarkRange('link').unsetLink().run();
      return;
    }

    // update link
    editor.chain().focus().extendMarkRange('link').setLink({ href: url }).run();
  };

  return (
    <div className="border border-gray-300 dark:border-gray-700 rounded-lg overflow-hidden bg-white dark:bg-gray-800">
      {editable && (
        <div className="border-b border-gray-300 dark:border-gray-700 p-2 flex flex-wrap gap-1 bg-gray-50 dark:bg-gray-900">
          {/* Headings */}
          <button
            onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()}
            className={`px-3 py-1 rounded hover:bg-gray-200 dark:hover:bg-gray-700 ${
              editor.isActive('heading', { level: 1 }) ? 'bg-gray-300 dark:bg-gray-600' : ''
            }`}
            title="Heading 1"
          >
            H1
          </button>
          <button
            onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
            className={`px-3 py-1 rounded hover:bg-gray-200 dark:hover:bg-gray-700 ${
              editor.isActive('heading', { level: 2 }) ? 'bg-gray-300 dark:bg-gray-600' : ''
            }`}
            title="Heading 2"
          >
            H2
          </button>
          <button
            onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}
            className={`px-3 py-1 rounded hover:bg-gray-200 dark:hover:bg-gray-700 ${
              editor.isActive('heading', { level: 3 }) ? 'bg-gray-300 dark:bg-gray-600' : ''
            }`}
            title="Heading 3"
          >
            H3
          </button>

          <div className="w-px h-6 bg-gray-300 dark:bg-gray-700 mx-1" />

          {/* Text formatting */}
          <button
            onClick={() => editor.chain().focus().toggleBold().run()}
            className={`px-3 py-1 rounded font-bold hover:bg-gray-200 dark:hover:bg-gray-700 ${
              editor.isActive('bold') ? 'bg-gray-300 dark:bg-gray-600' : ''
            }`}
            title="Bold"
          >
            B
          </button>
          <button
            onClick={() => editor.chain().focus().toggleItalic().run()}
            className={`px-3 py-1 rounded italic hover:bg-gray-200 dark:hover:bg-gray-700 ${
              editor.isActive('italic') ? 'bg-gray-300 dark:bg-gray-600' : ''
            }`}
            title="Italic"
          >
            I
          </button>

          <div className="w-px h-6 bg-gray-300 dark:bg-gray-700 mx-1" />

          {/* Lists */}
          <button
            onClick={() => editor.chain().focus().toggleBulletList().run()}
            className={`px-3 py-1 rounded hover:bg-gray-200 dark:hover:bg-gray-700 ${
              editor.isActive('bulletList') ? 'bg-gray-300 dark:bg-gray-600' : ''
            }`}
            title="Bullet List"
          >
            •••
          </button>
          <button
            onClick={() => editor.chain().focus().toggleOrderedList().run()}
            className={`px-3 py-1 rounded hover:bg-gray-200 dark:hover:bg-gray-700 ${
              editor.isActive('orderedList') ? 'bg-gray-300 dark:bg-gray-600' : ''
            }`}
            title="Numbered List"
          >
            123
          </button>

          <div className="w-px h-6 bg-gray-300 dark:bg-gray-700 mx-1" />

          {/* Link */}
          <button
            onClick={setLink}
            className={`px-3 py-1 rounded hover:bg-gray-200 dark:hover:bg-gray-700 ${
              editor.isActive('link') ? 'bg-gray-300 dark:bg-gray-600' : ''
            }`}
            title="Add Link"
          >
            🔗
          </button>

          {/* Image */}
          <button
            onClick={addImage}
            className="px-3 py-1 rounded hover:bg-gray-200 dark:hover:bg-gray-700"
            title="Add Image"
          >
            🖼️
          </button>
        </div>
      )}
      <EditorContent editor={editor} />
    </div>
  );
};
