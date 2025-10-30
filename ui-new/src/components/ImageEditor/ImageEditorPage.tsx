import React, { useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useSwag } from '../../contexts/SwagContext';
import { useSettings } from '../../contexts/SettingsContext';
import { useAuth } from '../../contexts/AuthContext';
import { useFeatures } from '../../contexts/FeaturesContext';
import { ImageGrid } from './ImageGrid';
import { SelectionControls } from './SelectionControls';
import { BulkOperationsBar } from './BulkOperationsBar';
import { CommandInput } from './CommandInput';
import { editImages, parseImageCommand } from './imageEditApi';
import type { ImageData, ProcessingStatus, BulkOperation } from './types';

export const ImageEditorPage: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { addSnippet, updateSnippet, snippets: swagSnippets } = useSwag();
  const { settings } = useSettings();
  const { getToken } = useAuth();
  const { features } = useFeatures();

  // Get images and editing context from navigation state
  const locationState = location.state as { 
    images?: ImageData[]; 
    editingSnippetId?: string;
  } | null;
  
  const initialImages = locationState?.images || [];
  const editingSnippetId = locationState?.editingSnippetId; // ID of snippet being edited (if from markdown editor)
  
  // Determine if this is inline editing (single image from markdown renderer)
  const isInlineEdit = initialImages.length === 1 && initialImages[0].snippetId;
  const sourceSnippetId = isInlineEdit ? initialImages[0].snippetId : null;

  const [images] = useState<ImageData[]>(initialImages);
  const [selectedImages, setSelectedImages] = useState<Set<string>>(() => {
    // Check if we have persisted image IDs to determine if this is a reload
    const hasPersistedImages = localStorage.getItem('image_editor_images');
    
    if (hasPersistedImages) {
      // This is a page reload - try to restore previous selection
      try {
        const savedSelection = localStorage.getItem('image_editor_selection');
        const savedImages = JSON.parse(hasPersistedImages);
        
        if (savedSelection && savedImages) {
          const parsed = JSON.parse(savedSelection);
          // Only restore selection if saved images match current images (by ID)
          const savedImageIds = savedImages.map((img: ImageData) => img.id);
          const currentImageIds = initialImages.map(img => img.id);
          
          // Check if the image sets are the same
          const sameImages = savedImageIds.length === currentImageIds.length &&
            savedImageIds.every((id: string) => currentImageIds.includes(id));
          
          if (sameImages) {
            // Restore previous selection, but only for images that still exist
            const validSelections = parsed.filter((id: string) => currentImageIds.includes(id));
            if (validSelections.length > 0) {
              return new Set(validSelections);
            }
          }
        }
      } catch (error) {
        console.error('Failed to load persisted selection:', error);
      }
    }
    
    // New session or different images - auto-select all newly added images
    if (initialImages.length > 0) {
      return new Set(initialImages.map(img => img.id));
    }
    
    return new Set();
  });
  const [processedImages] = useState<ImageData[]>([]);
  const [processingStatus, setProcessingStatus] = useState<Map<string, ProcessingStatus>>(new Map());
  
  // Persist command between page reloads
  // Command is automatically saved to localStorage when changed
  // and cleared when successfully executed or manually cleared
  const [command, setCommand] = useState(() => {
    // Load persisted command from localStorage on mount
    try {
      return localStorage.getItem('image_editor_command') || '';
    } catch (error) {
      console.error('Failed to load persisted command:', error);
      return '';
    }
  });
  const [isProcessing, setIsProcessing] = useState(false);
  const [newlyGeneratedIds] = useState<Set<string>>(new Set());
  
  // Track processed image URLs (imageId -> new URL)
  const [processedImageUrls, setProcessedImageUrls] = useState<Map<string, string>>(new Map());

  // Persist command to localStorage whenever it changes
  React.useEffect(() => {
    try {
      if (command.trim()) {
        localStorage.setItem('image_editor_command', command);
      } else {
        localStorage.removeItem('image_editor_command');
      }
    } catch (error) {
      console.error('Failed to persist command:', error);
    }
  }, [command]);

  // Persist images to localStorage to detect reloads
  React.useEffect(() => {
    try {
      if (images.length > 0) {
        localStorage.setItem('image_editor_images', JSON.stringify(images));
      }
    } catch (error) {
      console.error('Failed to persist images:', error);
    }
  }, [images]);

  // Persist selection to localStorage whenever it changes
  React.useEffect(() => {
    try {
      if (selectedImages.size > 0) {
        localStorage.setItem('image_editor_selection', JSON.stringify(Array.from(selectedImages)));
      } else {
        localStorage.removeItem('image_editor_selection');
      }
    } catch (error) {
      console.error('Failed to persist selection:', error);
    }
  }, [selectedImages]);

  // Combine original and processed images, updating URLs for processed images
  const allImages = [...processedImages, ...images].map((img) => {
    const processedUrl = processedImageUrls.get(img.id);
    if (processedUrl) {
      // Return new image object with updated URL
      return { ...img, url: processedUrl };
    }
    return img;
  });

  const handleSelectAll = () => {
    setSelectedImages(new Set(allImages.map((img) => img.id)));
  };

  const handleSelectNone = () => {
    setSelectedImages(new Set());
  };

  const handleToggleSelection = (imageId: string) => {
    const newSelection = new Set(selectedImages);
    if (newSelection.has(imageId)) {
      newSelection.delete(imageId);
    } else {
      newSelection.add(imageId);
    }
    setSelectedImages(newSelection);
  };

  const handleBulkOperation = async (operation: BulkOperation) => {
    if (selectedImages.size === 0) return;

    setIsProcessing(true);

    const selectedImageIds = Array.from(selectedImages);
    const selectedImagesData = allImages.filter((img) => selectedImageIds.includes(img.id));

    try {
      // Call real API
      await editImages(
        {
          images: selectedImagesData.map((img) => ({ id: img.id, url: img.url })),
          operations: [operation],
        },
        (event) => {
          // Handle progress events
          if (event.type === 'image_start' && event.imageId) {
            setProcessingStatus(
              (prev) =>
                new Map(prev).set(event.imageId!, {
                  imageId: event.imageId!,
                  status: 'processing',
                  progress: 0,
                  message: `Starting ${operation.label}...`,
                })
            );
          } else if (event.type === 'progress' && event.imageId) {
            setProcessingStatus(
              (prev) =>
                new Map(prev).set(event.imageId!, {
                  imageId: event.imageId!,
                  status: 'processing',
                  progress: event.progress || 0,
                  message: event.currentOperation
                    ? `${event.currentOperation}... ${event.progress}%`
                    : `${event.status}...`,
                })
            );
          } else if (event.type === 'image_complete' && event.imageId && event.result) {
            setProcessingStatus(
              (prev) =>
                new Map(prev).set(event.imageId!, {
                  imageId: event.imageId!,
                  status: 'complete',
                  progress: 100,
                  message: 'Complete',
                  result: event.result?.url,
                })
            );
            
            // Save processed image URL
            if (event.result?.url) {
              setProcessedImageUrls((prev) => new Map(prev).set(event.imageId!, event.result!.url));
            }
          } else if (event.type === 'image_error' && event.imageId) {
            setProcessingStatus(
              (prev) =>
                new Map(prev).set(event.imageId!, {
                  imageId: event.imageId!,
                  status: 'error',
                  progress: 0,
                  message: event.error || 'Processing failed',
                  error: event.error,
                })
            );
          } else if (event.type === 'complete') {
            console.log('All images processed:', event);
          } else if (event.type === 'error') {
            console.error('API error:', event.error);
            alert(`Error: ${event.error}`);
          }
        }
      );

      // Clear completed status after 3 seconds
      setTimeout(() => {
        setIsProcessing(false);
        selectedImageIds.forEach((imageId) => {
          setProcessingStatus((prev) => {
            const newMap = new Map(prev);
            newMap.delete(imageId);
            return newMap;
          });
        });
      }, 3000);
    } catch (error) {
      console.error('Image processing error:', error);
      alert(`Error processing images: ${error instanceof Error ? error.message : String(error)}`);
      setIsProcessing(false);
      
      // Mark all as error
      selectedImageIds.forEach((imageId) => {
        setProcessingStatus((prev) =>
          new Map(prev).set(imageId, {
            imageId,
            status: 'error',
            progress: 0,
            message: 'Failed',
            error: error instanceof Error ? error.message : String(error),
          })
        );
      });
    }
  };

  const handleSaveToSwag = async () => {
    if (processedImageUrls.size === 0) {
      alert('No processed images to save');
      return;
    }

    setIsProcessing(true);

    try {
      // INLINE EDITING: Replace image in source snippet with base64 data
      if (isInlineEdit && sourceSnippetId) {
        const imageId = Array.from(processedImageUrls.keys())[0];
        const newUrl = processedImageUrls.get(imageId);
        const originalImage = allImages.find((img) => img.id === imageId);
        
        if (newUrl && originalImage) {
          // The newUrl is already a base64 data URL from the backend
          const base64 = newUrl;
          
          // Get the source snippet
          const sourceSnippet = swagSnippets.find(s => s.id === sourceSnippetId);
          if (!sourceSnippet) {
            throw new Error('Source snippet not found');
          }
          
          // Replace the original image URL with base64 data URL
          let updatedContent = sourceSnippet.content;
          const oldUrl = originalImage.url;
          
          // Replace in markdown syntax: ![alt](url)
          updatedContent = updatedContent.replace(
            new RegExp(`!\\[([^\\]]*)\\]\\(${escapeRegex(oldUrl)}\\)`, 'g'),
            `![$1](${base64})`
          );
          
          // Replace in HTML img tags: <img src="url" ...>
          updatedContent = updatedContent.replace(
            new RegExp(`<img([^>]*?)src="${escapeRegex(oldUrl)}"`, 'g'),
            `<img$1src="${base64}"`
          );
          updatedContent = updatedContent.replace(
            new RegExp(`<img([^>]*?)src='${escapeRegex(oldUrl)}'`, 'g'),
            `<img$1src='${base64}'`
          );
          
          // If content is just the image URL (base64 or otherwise), replace entirely
          if (updatedContent.trim() === oldUrl || updatedContent.trim() === `![](${oldUrl})`) {
            updatedContent = base64;
          }
          
          // Update the snippet
          await updateSnippet(sourceSnippetId, { content: updatedContent });
          
          // Clear localStorage to prevent stale selection on return
          localStorage.removeItem('image_editor_selection');
          localStorage.removeItem('image_editor_images');
          
          alert('Image updated inline in snippet');
          
          // Navigate back with the editingSnippetId to ensure the snippet is refreshed
          navigate('/swag', { state: { updatedSnippetId: sourceSnippetId } });
          return;
        }
      }
      
      // BULK EDITING or NEW IMAGES: Save as new snippets with base64
      let savedCount = 0;
      
      for (const [imageId, newUrl] of processedImageUrls.entries()) {
        const image = allImages.find((img) => img.id === imageId);
        if (!image) continue;

        try {
          // The newUrl is already a base64 data URL from the backend
          const base64 = newUrl;
          
          // Create markdown content with base64 data URL
          const title = `Edited Image - ${new Date().toLocaleString()}`;
          const content = `![${image.name || 'Edited image'}](${base64})`;
          
          // Add as new snippet to swag
          await addSnippet(content, 'user', title);
          savedCount++;
        } catch (error) {
          console.error(`Failed to save image ${imageId}:`, error);
        }
      }

      alert(`Successfully saved ${savedCount} edited image(s) to Swag as new snippets`);
      
      // Clear processed images
      setProcessedImageUrls(new Map());
      
      // Clear localStorage to prevent stale data
      localStorage.removeItem('image_editor_selection');
      localStorage.removeItem('image_editor_images');
      
      // Navigate back to swag
      navigate('/swag');
      
    } catch (error) {
      console.error('Save to swag error:', error);
      alert(`Error saving: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      setIsProcessing(false);
    }
  };

  // Helper function to escape special regex characters
  const escapeRegex = (str: string): string => {
    return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  };

  const handleCommandSubmit = async () => {
    if (!command.trim() || selectedImages.size === 0) return;

    setIsProcessing(true);

    try {
      // Parse natural language command using LLM
      console.log('Parsing command:', command);
      const authToken = await getToken();
      const parseResult = await parseImageCommand(command, settings.providers, authToken);
      
      if (!parseResult.success || parseResult.operations.length === 0) {
        alert(parseResult.explanation || 'Could not understand command. Try: "make smaller", "rotate right", "convert to jpg"');
        setIsProcessing(false);
        return;
      }
      
      console.log('Parsed operations:', parseResult.operations);
      
      // Check if any operations are generative AI operations (new feature!)
      const hasGenerativeOps = parseResult.operations.some((op: BulkOperation) => op.type === 'generate');
      if (hasGenerativeOps) {
        console.log('🎨 Generative AI operations detected - will be processed by backend');
      }
      
      // Process all parsed operations sequentially
      for (const operation of parseResult.operations) {
        await handleBulkOperation(operation);
      }
      
      // Clear command after successful execution
      setCommand('');
      
    } catch (error) {
      console.error('Command parsing error:', error);
      alert(`Error: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col bg-gray-50">
      {/* Feature Availability Warning */}
      {!features?.imageEditing && (
        <div className="bg-yellow-50 border-l-4 border-yellow-400 p-4">
          <div className="max-w-7xl mx-auto flex items-start">
            <svg className="w-6 h-6 text-yellow-400 mt-0.5 mr-3 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
            <div>
              <h3 className="text-sm font-medium text-yellow-800">Image Editing Feature Unavailable</h3>
              <div className="mt-1 text-sm text-yellow-700">
                <p>Image editing functionality is not currently available. The server must be configured with image generation providers (e.g., OpenAI DALL-E, Replicate Flux) to enable this feature.</p>
              </div>
            </div>
          </div>
        </div>
      )}
      
      {/* Header with Back Button */}
      <header className="bg-white border-b border-gray-200 p-4 sticky top-0 z-20 shadow-sm">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <button
            onClick={() => {
              // If we came from editing a snippet, restore that editing dialog
              if (editingSnippetId) {
                navigate('/swag', { state: { editingSnippetId } });
              } else {
                navigate('/swag');
              }
            }}
            className="flex items-center gap-2 text-gray-700 hover:text-gray-900 font-medium transition-colors"
          >
            <svg
              className="w-5 h-5"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M10 19l-7-7m0 0l7-7m-7 7h18"
              />
            </svg>
            Back to Swag
          </button>
          <h1 className="text-xl font-bold text-gray-900">
            {isInlineEdit ? 'Edit Inline Image' : 'Image Editor'}
            {selectedImages.size > 0 && ` (${selectedImages.size} selected)`}
          </h1>
          <button
            onClick={handleSaveToSwag}
            disabled={processedImageUrls.size === 0 || isProcessing}
            className={`px-4 py-2 rounded-lg font-medium transition-colors ${
              processedImageUrls.size === 0 || isProcessing
                ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
                : 'bg-green-600 text-white hover:bg-green-700'
            }`}
          >
            {isProcessing 
              ? 'Saving...' 
              : isInlineEdit 
                ? 'Update in Snippet'
                : `Save to Swag (${processedImageUrls.size})`
            }
          </button>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 overflow-auto">
        <div className="max-w-7xl mx-auto">
          <SelectionControls
            onSelectAll={handleSelectAll}
            onSelectNone={handleSelectNone}
            selectedCount={selectedImages.size}
            totalCount={allImages.length}
          />

          <ImageGrid
            images={allImages}
            selectedImages={selectedImages}
            onToggleSelection={handleToggleSelection}
            processingStatus={processingStatus}
            newlyGeneratedIds={newlyGeneratedIds}
          />
        </div>
      </main>

      {/* Footer - Operations and Command Input */}
      <footer className="bg-white border-t border-gray-200 sticky bottom-0 z-20 shadow-lg">
        <div className="max-w-7xl mx-auto">
          <BulkOperationsBar
            selectedCount={selectedImages.size}
            onOperation={handleBulkOperation}
            disabled={isProcessing}
          />

          <CommandInput
            value={command}
            onChange={setCommand}
            onSubmit={handleCommandSubmit}
            disabled={isProcessing || selectedImages.size === 0}
            placeholder={
              selectedImages.size === 0
                ? 'Select images to apply transformations'
                : "Describe transformation (e.g., 'resize to 800px width' or 'convert to grayscale')"
            }
          />
        </div>
      </footer>
    </div>
  );
};
