import React, { useEffect, useState } from 'react';
import MDEditor, { commands } from '@uiw/react-md-editor';
import rehypeSanitize from 'rehype-sanitize';
import { ImagePicker } from './ImagePicker';

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
  const [isDark, setIsDark] = useState(false);
  const [showImagePicker, setShowImagePicker] = useState(false);
  const [editorApi, setEditorApi] = useState<any>(null);

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
    execute: async (_state: any, api: any) => {
      if (!onImageUpload) {
        // Fallback: insert markdown image syntax
        api.replaceSelection('![alt text](image-url)');
        return;
      }

      // Store API reference for later use
      setEditorApi(api);

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

  // Custom image picker command (select from swag)
  const imagePickerCommand = {
    name: 'image-picker',
    keyCommand: 'image-picker',
    buttonProps: { 'aria-label': 'Select image from Swag', title: 'Select from Swag' },
    icon: (
      <svg viewBox="0 0 24 24" width="12" height="12">
        <path fill="currentColor" d="M21 19V5c0-1.1-.9-2-2-2H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2zM8.5 13.5l2.5 3.01L14.5 12l4.5 6H5l3.5-4.5z" />
        <circle fill="currentColor" cx="8" cy="9" r="1.5" />
      </svg>
    ),
    execute: async (_state: any, api: any) => {
      setEditorApi(api);
      setShowImagePicker(true);
    }
  };

  const handleImageSelected = (imageUrl: string, altText: string) => {
    if (editorApi) {
      editorApi.replaceSelection(`![${altText}](${imageUrl})`);
    }
    setShowImagePicker(false);
  };

  return (
    <div data-color-mode={isDark ? 'dark' : 'light'}>
      <MDEditor
        value={value}
        onChange={(val) => onChange(val || '')}
        height={height}
        preview={preview}
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
          imagePickerCommand,
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

      {/* Image Picker Modal */}
      {showImagePicker && (
        <ImagePicker
          onSelectImage={handleImageSelected}
          onClose={() => setShowImagePicker(false)}
        />
      )}
    </div>
  );
};
