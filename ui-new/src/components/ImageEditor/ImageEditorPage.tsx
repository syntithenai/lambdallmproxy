import React, { useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useSwag } from '../../contexts/SwagContext';
import { ImageGrid } from './ImageGrid';
import { SelectionControls } from './SelectionControls';
import { BulkOperationsBar } from './BulkOperationsBar';
import { CommandInput } from './CommandInput';
import { editImages, parseImageCommand } from './imageEditApi';
import type { ImageData, ProcessingStatus, BulkOperation } from './types';

export const ImageEditorPage: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { updateSnippet, snippets: swagSnippets } = useSwag();

  // Get images from navigation state
  const initialImages = (location.state as { images?: ImageData[] })?.images || [];

  const [images] = useState<ImageData[]>(initialImages);
  const [selectedImages, setSelectedImages] = useState<Set<string>>(new Set());
  const [processedImages] = useState<ImageData[]>([]);
  const [processingStatus, setProcessingStatus] = useState<Map<string, ProcessingStatus>>(new Map());
  const [command, setCommand] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [newlyGeneratedIds] = useState<Set<string>>(new Set());
  
  // Track processed image URLs (imageId -> new URL)
  const [processedImageUrls, setProcessedImageUrls] = useState<Map<string, string>>(new Map());

  // Combine original and processed images
  const allImages = [...processedImages, ...images];

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
      // Group images by snippet ID
      const snippetUpdates = new Map<string, Array<{ oldUrl: string; newUrl: string }>>();
      
      for (const [imageId, newUrl] of processedImageUrls.entries()) {
        const image = allImages.find((img) => img.id === imageId);
        if (image && image.snippetId) {
          if (!snippetUpdates.has(image.snippetId)) {
            snippetUpdates.set(image.snippetId, []);
          }
          snippetUpdates.get(image.snippetId)!.push({
            oldUrl: image.url,
            newUrl: newUrl,
          });
        }
      }

      // Update each snippet
      let updatedCount = 0;
      for (const [snippetId, replacements] of snippetUpdates.entries()) {
        try {
          // Get snippet from swag context
          const snippet = swagSnippets.find(s => s.id === snippetId);
          if (!snippet) {
            console.error(`Snippet ${snippetId} not found`);
            continue;
          }

          // Replace image URLs in content
          let updatedContent = snippet.content;
          for (const { oldUrl, newUrl } of replacements) {
            // Replace in HTML img tags
            updatedContent = updatedContent.replace(
              new RegExp(`<img([^>]*) src="${oldUrl.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}"`, 'g'),
              `<img$1 src="${newUrl}"`
            );
            // Replace in markdown image syntax
            updatedContent = updatedContent.replace(
              new RegExp(`!\\[([^\\]]*)\\]\\(${oldUrl.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\)`, 'g'),
              `![$1](${newUrl})`
            );
          }

          // Update snippet if content changed
          if (updatedContent !== snippet.content) {
            await updateSnippet(snippetId, { content: updatedContent });
            updatedCount++;
          }
          
        } catch (error) {
          console.error(`Failed to update snippet ${snippetId}:`, error);
        }
      }

      alert(`Successfully updated ${updatedCount} snippet(s) with processed images`);
      
      // Clear processed images
      setProcessedImageUrls(new Map());
      
      // Navigate back to swag
      navigate('/swag');
      
    } catch (error) {
      console.error('Save to swag error:', error);
      alert(`Error saving: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleCommandSubmit = async () => {
    if (!command.trim() || selectedImages.size === 0) return;

    setIsProcessing(true);

    try {
      // Parse natural language command using LLM
      console.log('Parsing command:', command);
      const parseResult = await parseImageCommand(command);
      
      if (!parseResult.success || parseResult.operations.length === 0) {
        alert(parseResult.explanation || 'Could not understand command. Try: "make smaller", "rotate right", "convert to jpg"');
        setIsProcessing(false);
        return;
      }
      
      console.log('Parsed operations:', parseResult.operations);
      
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
      {/* Header with Back Button */}
      <header className="bg-white border-b border-gray-200 p-4 sticky top-0 z-20 shadow-sm">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <button
            onClick={() => navigate('/swag')}
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
            Image Editor
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
            {isProcessing ? 'Saving...' : `Save to Swag (${processedImageUrls.size})`}
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
