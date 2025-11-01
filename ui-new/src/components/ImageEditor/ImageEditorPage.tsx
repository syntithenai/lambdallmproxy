import React, { useState, useRef } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useSwag } from '../../contexts/SwagContext';
import { useSettings } from '../../contexts/SettingsContext';
import { useAuth } from '../../contexts/AuthContext';
import { useFeatures } from '../../contexts/FeaturesContext';
import { useToast } from '../ToastManager';
import { ImageGrid } from './ImageGrid';
import { SelectionControls } from './SelectionControls';
import { BulkOperationsBar } from './BulkOperationsBar';
import { CommandInput } from './CommandInput';
import { SwagImagePicker } from './SwagImagePicker';
import { editImages, parseImageCommand } from './imageEditApi';
import type { ImageData, ProcessingStatus, BulkOperation } from './types';

export const ImageEditorPage: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { addSnippet, updateSnippet, snippets: swagSnippets } = useSwag();
  const { settings } = useSettings();
  const { getToken } = useAuth();
  const { features } = useFeatures();
  const { showSuccess, showInfo } = useToast();

  // Get images and editing context from navigation state
  const locationState = location.state as { 
    images?: ImageData[]; 
    editingSnippetId?: string;
  } | null;
  
  const initialImages = locationState?.images || [];
  const editingSnippetId = locationState?.editingSnippetId; // ID of snippet being edited (if from markdown editor)

  const [images, setImages] = useState<ImageData[]>(initialImages);
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
  
  // State for new action buttons (Upload, Select from Swag, Generate)
  const [isUploading, setIsUploading] = useState(false);
  const [showSwagPicker, setShowSwagPicker] = useState(false);
  const [showGenerateDialog, setShowGenerateDialog] = useState(false);
  const [generatePrompt, setGeneratePrompt] = useState('');
  const [generateSize, setGenerateSize] = useState('1024x768');
  const [isGenerating, setIsGenerating] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

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
              
              // AUTO-SAVE: Update or create snippet immediately after processing
              const processedImage = allImages.find(img => img.id === event.imageId);
              if (processedImage?.snippetId) {
                // Image came from existing snippet - update it
                autoUpdateSnippet(event.imageId!, event.result.url);
                showSuccess('Image auto-saved to snippet');
              } else {
                // New image (uploaded/generated) - create new snippet
                autoCreateSnippet(event.imageId!, event.result.url);
                showSuccess('New snippet created');
              }
              
              // Show auto-resize notification if it happened
              if (event.result.didAutoResize && event.result.originalDimensions && event.result.dimensions) {
                showInfo(
                  `Auto-resized from ${event.result.originalDimensions.width}×${event.result.originalDimensions.height} ` +
                  `to ${event.result.dimensions.width}×${event.result.dimensions.height} (max 1024×768)`
                );
              }
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

  // Auto-update an existing snippet with edited image at specific index
  const autoUpdateSnippet = async (imageId: string, newUrl: string) => {
    const image = allImages.find((img) => img.id === imageId);
    if (!image || !image.snippetId) {
      console.warn('Cannot auto-update: image has no snippetId');
      return;
    }

    const snippet = swagSnippets.find(s => s.id === image.snippetId);
    if (!snippet) {
      console.error('Source snippet not found:', image.snippetId);
      return;
    }

    try {
      // Extract all image URLs from the snippet content
      const imageUrlPattern = /<img[^>]+src=["']([^"']+)["'][^>]*>|!\[[^\]]*\]\(([^)]+)\)/g;
      const imageUrls: string[] = [];
      let match;
      
      while ((match = imageUrlPattern.exec(snippet.content)) !== null) {
        imageUrls.push(match[1] || match[2]);
      }

      // Determine which URL to replace based on imageIndex
      const targetIndex = image.imageIndex ?? 0;
      const oldUrl = imageUrls[targetIndex];
      
      if (!oldUrl) {
        console.error('Could not find image URL at index', targetIndex);
        return;
      }

      // Apply 1024×768 constraint by requesting resize if needed
      let finalUrl = newUrl;
      
      // Check if image needs resizing (if width/height available in metadata)
      // For now, trust backend to have applied constraints
      // TODO: Add explicit resize check when metadata is available

      // Replace old URL with new base64 URL
      let updatedContent = snippet.content;
      
      // Replace in markdown: ![alt](url)
      updatedContent = updatedContent.replace(
        new RegExp(`!\\[([^\\]]*)\\]\\(${escapeRegex(oldUrl)}\\)`, 'g'),
        `![$1](${finalUrl})`
      );
      
      // Replace in HTML: <img src="url">
      updatedContent = updatedContent.replace(
        new RegExp(`<img([^>]*?)src="${escapeRegex(oldUrl)}"`, 'g'),
        `<img$1src="${finalUrl}"`
      );
      updatedContent = updatedContent.replace(
        new RegExp(`<img([^>]*?)src='${escapeRegex(oldUrl)}'`, 'g'),
        `<img$1src='${finalUrl}'`
      );

      // Update snippet
      await updateSnippet(image.snippetId, { content: updatedContent });
      console.log('Auto-updated snippet:', image.snippetId);
    } catch (error) {
      console.error('Auto-update failed:', error);
    }
  };

  // Auto-create a new snippet for images without a snippetId (uploaded/generated)
  const autoCreateSnippet = async (imageId: string, newUrl: string) => {
    const image = allImages.find((img) => img.id === imageId);
    if (!image) {
      console.warn('Cannot auto-create: image not found');
      return;
    }

    try {
      const title = `Image - ${image.name || new Date().toLocaleString()}`;
      const content = `<img src="${newUrl}" alt="${image.name || 'Generated image'}" />`;
      
      await addSnippet(content, 'user', title);
      console.log('Auto-created snippet for new image:', imageId);
    } catch (error) {
      console.error('Auto-create failed:', error);
    }
  };

  // Helper function to escape special regex characters
  const escapeRegex = (str: string): string => {
    return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  };

  // Helper: Convert File to base64
  const fileToBase64 = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  };

  // Helper: Constrain image size using canvas
  const constrainImageSize = async (base64: string, maxWidth: number, maxHeight: number): Promise<string> => {
    return new Promise((resolve) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d')!;
        
        let { width, height } = img;
        
        // Only resize if image exceeds limits
        if (width > maxWidth || height > maxHeight) {
          const ratio = Math.min(maxWidth / width, maxHeight / height);
          width = Math.floor(width * ratio);
          height = Math.floor(height * ratio);
        }
        
        canvas.width = width;
        canvas.height = height;
        ctx.drawImage(img, 0, 0, width, height);
        
        resolve(canvas.toDataURL('image/jpeg', 0.9));
      };
      img.src = base64;
    });
  };

  // Handler: Upload files from local filesystem
  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;
    if (!files || files.length === 0) return;
    
    setIsUploading(true);
    try {
      const uploadedImages: ImageData[] = [];
      
      for (const file of Array.from(files)) {
        // Convert to base64
        const base64 = await fileToBase64(file);
        
        // Constrain to 1024×768
        const constrainedBase64 = await constrainImageSize(base64, 1024, 768);
        
        const imageId = `upload-${Date.now()}-${Math.random()}`;
        const imageData: ImageData = {
          id: imageId,
          url: constrainedBase64,
          name: file.name,
          tags: ['uploaded']
        };
        
        uploadedImages.push(imageData);
      }
      
      // Add to images array (will auto-create snippets on first edit)
      setImages(prev => [...prev, ...uploadedImages]);
      setSelectedImages(new Set(uploadedImages.map(img => img.id)));
      
      showSuccess(`Uploaded ${uploadedImages.length} image(s)`);
      
    } catch (error) {
      console.error('Upload error:', error);
      alert(`Failed to upload images: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  // Handler: Select images from Swag
  const handleSwagImagesSelected = (selectedImages: ImageData[]) => {
    setImages(prev => [...prev, ...selectedImages]);
    setSelectedImages(new Set(selectedImages.map(img => img.id)));
    setShowSwagPicker(false);
    showSuccess(`Loaded ${selectedImages.length} image(s) from Swag`);
  };

  // Handler: Generate image from text prompt using /generate-image endpoint
  const handleGenerateFromPrompt = async () => {
    if (!generatePrompt.trim()) return;
    
    setIsGenerating(true);
    try {
      const authToken = await getToken();
      const apiBase = await import('../../utils/api').then(m => m.getCachedApiBase());
      
      // Call the generate-image endpoint
      const response = await fetch(`${apiBase}/generate-image`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${authToken}`,
          'X-Google-OAuth-Token': localStorage.getItem('google_oauth_token') || ''
        },
        body: JSON.stringify({
          prompt: generatePrompt,
          providers: settings.providers,
          size: generateSize,
          quality: 'standard',
          style: 'natural'
        })
      });
      
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
      
      const result = await response.json();
      
      if (!result.success || !result.imageUrl) {
        throw new Error(result.error || 'Generation failed - no image URL returned');
      }
      
      // Download the generated image and convert to base64
      const imageResponse = await fetch(result.imageUrl);
      const imageBlob = await imageResponse.blob();
      const base64 = await new Promise<string>((resolve) => {
        const reader = new FileReader();
        reader.onloadend = () => resolve(reader.result as string);
        reader.readAsDataURL(imageBlob);
      });
      
      // Constrain to 1024×768
      const constrainedBase64 = await constrainImageSize(base64, 1024, 768);
      
      // Add generated image to editor
      const imageId = `generated-${Date.now()}`;
      const imageData: ImageData = {
        id: imageId,
        url: constrainedBase64,
        name: `Generated: ${generatePrompt.substring(0, 50)}`,
        tags: ['generated']
      };
      
      setImages(prev => [...prev, imageData]);
      setSelectedImages(new Set([imageId]));
      
      showSuccess(`Image generated successfully!`);
      
    } catch (error) {
      console.error('Generation error:', error);
      showInfo(`Failed to generate: ${error instanceof Error ? error.message : String(error)}`);
      
      // Fallback to placeholder SVG on error
      const imageId = `generated-placeholder-${Date.now()}`;
      const imageData: ImageData = {
        id: imageId,
        url: 'data:image/svg+xml;base64,' + btoa(`
          <svg width="1024" height="768" xmlns="http://www.w3.org/2000/svg">
            <rect width="100%" height="100%" fill="#fee"/>
            <text x="50%" y="50%" text-anchor="middle" fill="#c00" font-size="20" font-family="Arial">
              Generation failed. Using placeholder.
            </text>
            <text x="50%" y="55%" text-anchor="middle" fill="#666" font-size="14" font-family="Arial">
              Prompt: ${generatePrompt.substring(0, 60)}
            </text>
          </svg>
        `),
        name: `Placeholder: ${generatePrompt.substring(0, 50)}`,
        tags: ['placeholder']
      };
      
      setImages(prev => [...prev, imageData]);
      setSelectedImages(new Set([imageId]));
    } finally {
      setIsGenerating(false);
      setShowGenerateDialog(false);
      setGeneratePrompt('');
    }
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
      {/* Feature Availability Warnings */}
      {!features?.imageEditingBasic && (
        <div className="bg-red-50 border-l-4 border-red-400 p-4">
          <div className="max-w-7xl mx-auto flex items-start">
            <svg className="w-6 h-6 text-red-400 mt-0.5 mr-3 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
            <div>
              <h3 className="text-sm font-medium text-red-800">Image Editing Unavailable</h3>
              <div className="mt-1 text-sm text-red-700">
                <p>Image editing is currently unavailable. Please contact support.</p>
              </div>
            </div>
          </div>
        </div>
      )}

      {features?.imageEditingBasic && !features?.imageEditingAI && (
        <div className="bg-blue-50 border-l-4 border-blue-400 p-4">
          <div className="max-w-7xl mx-auto flex items-start">
            <svg className="w-6 h-6 text-blue-400 mt-0.5 mr-3 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <div>
              <h3 className="text-sm font-medium text-blue-800">AI Features Limited</h3>
              <div className="mt-1 text-sm text-blue-700">
                <p>Basic editing is available. Configure image providers in settings for AI features (AI crop, image generation).</p>
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
            Image Editor
            {selectedImages.size > 0 && ` (${selectedImages.size} selected)`}
          </h1>
          <div className="text-sm text-gray-600">
            {processedImageUrls.size > 0 && (
              <span className="inline-flex items-center px-3 py-1.5 rounded-lg bg-green-50 text-green-700 border border-green-200">
                <svg className="w-4 h-4 mr-1.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
                Auto-saved: {processedImageUrls.size} image{processedImageUrls.size > 1 ? 's' : ''}
              </span>
            )}
          </div>
        </div>
      </header>

      {/* Action Buttons Row */}
      <div className="bg-white border-b border-gray-200 p-4">
        <div className="max-w-7xl mx-auto flex gap-3 justify-center">
          {/* Upload File Button */}
          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={isUploading || isProcessing}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
            </svg>
            {isUploading ? 'Uploading...' : '📁 Upload File'}
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/jpeg,image/jpg,image/png,image/gif,image/webp,image/avif"
            multiple
            className="hidden"
            onChange={handleFileUpload}
          />

          {/* Select from Swag Button */}
          <button
            onClick={() => setShowSwagPicker(true)}
            disabled={isProcessing}
            className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
            </svg>
            📚 Select from Swag
          </button>

          {/* Generate from Prompt Button */}
          <button
            onClick={() => setShowGenerateDialog(true)}
            disabled={!features?.imageEditingAI || isProcessing}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg transition-colors ${
              !features?.imageEditingAI || isProcessing
                ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
                : 'bg-purple-600 text-white hover:bg-purple-700'
            }`}
            title={!features?.imageEditingAI ? 'Configure image providers in settings to enable' : ''}
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
            </svg>
            ✨ Generate from Prompt
          </button>
        </div>
      </div>

      {/* Swag Image Picker Dialog */}
      {showSwagPicker && (
        <SwagImagePicker
          onSelect={handleSwagImagesSelected}
          onClose={() => setShowSwagPicker(false)}
          allowMultiple={true}
        />
      )}

      {/* Generate from Prompt Dialog */}
      {showGenerateDialog && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg p-6 max-w-lg w-full">
            <h2 className="text-xl font-bold mb-4">Generate Image from Prompt</h2>
            <textarea
              value={generatePrompt}
              onChange={(e) => setGeneratePrompt(e.target.value)}
              placeholder="Describe the image you want to create..."
              className="w-full h-32 border border-gray-300 rounded p-3 mb-4 focus:outline-none focus:ring-2 focus:ring-purple-500"
              autoFocus
            />
            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Image Size
              </label>
              <select
                value={generateSize}
                onChange={(e) => setGenerateSize(e.target.value)}
                className="w-full border border-gray-300 rounded p-2 focus:outline-none focus:ring-2 focus:ring-purple-500"
              >
                <option value="1024x1024">Square (1024×1024)</option>
                <option value="1024x768">Landscape (1024×768)</option>
                <option value="768x1024">Portrait (768×1024)</option>
                <option value="1792x1024">Wide (1792×1024)</option>
                <option value="1024x1792">Tall (1024×1792)</option>
              </select>
            </div>
            <div className="flex gap-2 justify-end">
              <button
                onClick={() => { setShowGenerateDialog(false); setGeneratePrompt(''); }}
                className="px-4 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleGenerateFromPrompt}
                disabled={!generatePrompt.trim() || isGenerating}
                className="px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors"
              >
                {isGenerating ? 'Generating...' : 'Generate Image'}
              </button>
            </div>
          </div>
        </div>
      )}

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
