import React, { useState, useRef } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useSwag } from '../../contexts/SwagContext';
import { useSettings } from '../../contexts/SettingsContext';
import { useAuth } from '../../contexts/AuthContext';
import { useFeatures } from '../../contexts/FeaturesContext';
import { useUsage } from '../../contexts/UsageContext';
import { useToast } from '../ToastManager';
import { imageStorage } from '../../utils/imageStorage';
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
  const { providerCapabilities } = useUsage();
  const { showSuccess, showInfo, showWarning } = useToast();

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

  // Undo/Redo functionality
  const [history, setHistory] = useState<Map<string, string>[]>([new Map(processedImageUrls)]);
  const [historyIndex, setHistoryIndex] = useState(0);
  
  const canUndo = historyIndex > 0;
  const canRedo = historyIndex < history.length - 1;

  const handleUndo = () => {
    if (!canUndo) return;
    const newIndex = historyIndex - 1;
    setHistoryIndex(newIndex);
    setProcessedImageUrls(new Map(history[newIndex]));
  };

  const handleRedo = () => {
    if (!canRedo) return;
    const newIndex = historyIndex + 1;
    setHistoryIndex(newIndex);
    setProcessedImageUrls(new Map(history[newIndex]));
  };

  // Save history snapshot when processedImageUrls changes
  React.useEffect(() => {
    // Only add to history if processedImageUrls actually changed
    if (history.length === 0 || 
        history[historyIndex].size !== processedImageUrls.size ||
        Array.from(processedImageUrls.entries()).some(([k, v]) => history[historyIndex].get(k) !== v)) {
      // Remove any future history if we're in the middle and make a new change
      const newHistory = history.slice(0, historyIndex + 1);
      newHistory.push(new Map(processedImageUrls));
      setHistory(newHistory);
      setHistoryIndex(newHistory.length - 1);
    }
  }, [processedImageUrls]);

  // Keyboard shortcuts for undo/redo
  React.useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && !e.shiftKey && e.key === 'z') {
        e.preventDefault();
        handleUndo();
      } else if ((e.ctrlKey || e.metaKey) && (e.shiftKey && e.key === 'z' || e.key === 'y')) {
        e.preventDefault();
        handleRedo();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [canUndo, canRedo, historyIndex]);

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

    // Handle duplicate operation separately (no backend API call needed)
    if (operation.type === 'duplicate') {
      await handleDuplicate();
      return;
    }

    setIsProcessing(true);

    const selectedImageIds = Array.from(selectedImages);
    const selectedImagesData = allImages.filter((img) => selectedImageIds.includes(img.id));

    try {
      // Call real API (duplicate is already handled above, so this is safe)
      await editImages(
        {
          images: selectedImagesData.map((img) => ({ id: img.id, url: img.url })),
          operations: [operation as any], // Safe: duplicate is filtered out above
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
              
              // Show cost notification if AI generation was used
              if (event.cost && event.cost.total > 0) {
                const costMsg = event.cost.isUserProvidedKey 
                  ? `💰 Cost: $${event.cost.total.toFixed(4)} (Lambda only - your API key used)`
                  : `💰 Cost: $${event.cost.total.toFixed(4)} (LLM: $${event.cost.llm.toFixed(4)}, Lambda: $${event.cost.lambda.toFixed(4)})`;
                showInfo(costMsg);
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

      console.log('Auto-updating image:', { oldUrl, newUrl, isSwagImage: oldUrl.startsWith('swag-image://') });

      // If the image uses swag-image:// reference, update IndexedDB
      if (oldUrl.startsWith('swag-image://')) {
        const imageId = oldUrl.replace('swag-image://', '');
        
        // Update the image data in IndexedDB while keeping the same reference
        await imageStorage.updateImage(imageId, newUrl);
        console.log('Updated IndexedDB image:', imageId);
        
        // No need to update snippet content - the swag-image:// reference stays the same
        // The updated image will be loaded from IndexedDB when displayed
      } else {
        // For direct base64/URL images, replace in content
        let updatedContent = snippet.content;
        
        // Replace in markdown: ![alt](url)
        const markdownPattern = `](${oldUrl})`;
        updatedContent = updatedContent.split(markdownPattern).join(`](${newUrl})`);
        
        // Replace in HTML: <img src="url"> (both single and double quotes)
        const htmlPatternDouble = `src="${oldUrl}"`;
        const htmlPatternSingle = `src='${oldUrl}'`;
        updatedContent = updatedContent.split(htmlPatternDouble).join(`src="${newUrl}"`);
        updatedContent = updatedContent.split(htmlPatternSingle).join(`src='${newUrl}'`);

        // Update snippet
        await updateSnippet(image.snippetId, { content: updatedContent });
        console.log('Updated snippet content for direct image URL');
      }
      
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

  // Handle duplicate operation
  const handleDuplicate = async () => {
    const selectedImageIds = Array.from(selectedImages);
    const selectedImagesData = allImages.filter((img) => selectedImageIds.includes(img.id));

    if (selectedImagesData.length === 0) return;

    // Confirm if multiple images selected
    if (selectedImagesData.length > 1) {
      const confirmed = window.confirm(
        `Are you sure you want to duplicate ${selectedImagesData.length} images? ` +
        `This will create ${selectedImagesData.length} new snippets in SWAG.`
      );
      if (!confirmed) return;
    }

    setIsProcessing(true);

    try {
      const duplicatedImages: ImageData[] = [];

      for (const image of selectedImagesData) {
        // Create new image with unique ID
        const duplicateId = `duplicate-${Date.now()}-${Math.random()}`;
        const duplicateName = `${image.name} (Copy)`;
        
        const duplicatedImage: ImageData = {
          id: duplicateId,
          url: image.url, // Same URL (data URL is already in memory)
          name: duplicateName,
          tags: [...image.tags, 'duplicated'],
        };

        duplicatedImages.push(duplicatedImage);

        // Save to SWAG immediately
        try {
          const title = `Copy of: ${image.name}`;
          const content = `![${duplicateName}](${image.url})`;
          await addSnippet(content, 'user', title);
          console.log(`✅ Duplicated and saved to SWAG: ${duplicateName}`);
        } catch (error) {
          console.error('Failed to save duplicate to SWAG:', error);
          showInfo(`Duplicated ${duplicateName} but failed to save to SWAG`);
        }
      }

      // Add duplicated images to the images array
      setImages(prev => [...prev, ...duplicatedImages]);

      // Select the duplicated images
      const duplicatedIds = duplicatedImages.map(img => img.id);
      setSelectedImages(new Set(duplicatedIds));

      showSuccess(
        `Duplicated ${duplicatedImages.length} image${duplicatedImages.length > 1 ? 's' : ''} and saved to SWAG`
      );
    } catch (error) {
      console.error('Duplicate error:', error);
      alert(`Error duplicating images: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      setIsProcessing(false);
    }
  };

  // Helper function to escape special regex characters
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
      // Debug: Check all possible token sources
      console.log('🔍 [Generate] Checking auth tokens:');
      console.log('  - google_access_token:', localStorage.getItem('google_access_token') ? 'EXISTS' : 'MISSING');
      console.log('  - google_oauth_token:', localStorage.getItem('google_oauth_token') ? 'EXISTS' : 'MISSING');
      console.log('  - access_token:', localStorage.getItem('access_token') ? 'EXISTS' : 'MISSING');
      
      let authToken = await getToken();
      console.log('🔑 [Generate] getToken() returned:', authToken ? `${authToken.substring(0, 30)}...` : 'NULL');
      
      // Fallback: check for legacy token keys if getToken returns null
      if (!authToken) {
        authToken = localStorage.getItem('google_oauth_token') || localStorage.getItem('access_token');
        if (authToken) {
          console.log('⚠️ [Generate] Using fallback token from localStorage');
        }
      }
      
      if (!authToken) {
        throw new Error('Please sign in to generate images. Click the Sign In button in the top right.');
      }
      
      const apiBase = await import('../../utils/api').then(m => m.getCachedApiBase());
      
      // Combine UI providers (from settings) with backend environment providers
      // Priority: UI configured providers > Environment providers
      console.log('🔍 UI providers:', settings.providers);
      console.log('🔍 Environment providers:', providerCapabilities);
      
      // Filter UI providers for image generation
      const uiImageProviders = (settings.providers || []).filter(p => {
        // enabled defaults to true if undefined
        const isEnabled = p.enabled !== false;
        const hasApiKey = !!p.apiKey;
        const isImageProvider = ['openai', 'together', 'replicate', 'gemini'].includes(p.type);
        
        console.log(`🔍 UI Provider ${p.type}: enabled=${isEnabled}, hasApiKey=${hasApiKey}, isImageProvider=${isImageProvider}`);
        
        return isEnabled && hasApiKey && isImageProvider;
      });
      
      // Filter environment providers for image generation
      const envImageProviders = (providerCapabilities || [])
        .filter(p => ['openai', 'together', 'replicate', 'gemini'].includes(p.type))
        .map(p => ({
          id: p.id,
          type: p.type as any,
          apiEndpoint: p.endpoint || '',
          apiKey: '', // Not exposed from backend
          enabled: p.enabled !== false,
          source: 'environment' as const
        }));
      
      console.log(`✅ Found ${uiImageProviders.length} UI providers, ${envImageProviders.length} environment providers`);
      
      // Combine both sources (UI providers take precedence)
      const allImageProviders = [...uiImageProviders, ...envImageProviders];
      
      if (allImageProviders.length === 0) {
        throw new Error('No image generation provider configured. Please add OpenAI, Together, Replicate, or Gemini in Settings.');
      }
      
      // Select provider (prefer OpenAI for best quality)
      const providerPriority = ['openai', 'together', 'gemini', 'replicate'];
      allImageProviders.sort((a, b) => {
        const aIndex = providerPriority.indexOf(a.type.toLowerCase());
        const bIndex = providerPriority.indexOf(b.type.toLowerCase());
        return aIndex - bIndex;
      });
      
      const selectedProvider = allImageProviders[0];
      
      // Select model based on provider
      let model = 'dall-e-3'; // Default for OpenAI
      if (selectedProvider.type.toLowerCase() === 'together') {
        model = 'black-forest-labs/FLUX.1-schnell-Free';
      } else if (selectedProvider.type.toLowerCase() === 'replicate') {
        model = 'black-forest-labs/flux-schnell';
      } else if (selectedProvider.type.toLowerCase() === 'gemini') {
        model = 'imagen-3.0-generate-001';
      }
      
      console.log(`🎨 Generating image with ${selectedProvider.type}:${model}`);
      console.log(`🔑 Using auth token:`, authToken ? `${authToken.substring(0, 20)}...` : 'NONE');
      
      // Map imageQuality setting to API quality parameter
      const qualityMap = {
        low: 'standard',
        medium: 'standard', 
        high: 'hd'
      };
      const quality = qualityMap[settings.imageQuality || 'low'];
      
      console.log(`🎨 Using image quality: ${settings.imageQuality || 'low'} (mapped to: ${quality})`);
      
      // Call the generate-image endpoint
      const response = await fetch(`${apiBase}/generate-image`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${authToken}`
        },
        body: JSON.stringify({
          prompt: generatePrompt,
          provider: selectedProvider.type,
          model: model,
          size: generateSize,
          quality: quality,
          style: 'natural',
          accessToken: authToken, // Backend expects accessToken in body, not header
          imageQuality: settings.imageQuality || 'low', // Pass user preference to backend
          // Pass API keys from settings
          openaiApiKey: selectedProvider.type === 'openai' ? selectedProvider.apiKey : undefined,
          togetherApiKey: selectedProvider.type === 'together' ? selectedProvider.apiKey : undefined,
          replicateApiKey: selectedProvider.type === 'replicate' ? selectedProvider.apiKey : undefined,
          geminiApiKey: selectedProvider.type === 'gemini' ? selectedProvider.apiKey : undefined
        })
      });
      
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
      
      const result = await response.json();
      
      if (!result.success) {
        throw new Error(result.error || 'Generation failed');
      }
      
      // Use base64 data from backend (avoids CORS issues with direct image URLs)
      let base64 = result.base64 || result.imageUrl;
      
      if (!base64) {
        throw new Error('No image data returned from backend');
      }
      
      // Ensure base64 has proper data URL prefix
      if (!base64.startsWith('data:')) {
        base64 = `data:image/jpeg;base64,${base64}`;
      }
      
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
    if (!command.trim()) return;

    setIsProcessing(true);

    try {
      // NEW FEATURE: If no images are selected, generate a new image from the prompt
      if (selectedImages.size === 0) {
        console.log('🎨 No images selected - generating new image from prompt:', command);
        
        const authToken = await getToken();
        
        // Import generateImage from api.ts
        const { generateImage } = await import('../../utils/api');
        
        // Find image-capable providers
        const imageProviders = settings.providers.filter(p => 
          p.enabled !== false && 
          (p.capabilities?.image !== false) &&
          (p.type === 'openai' || p.type === 'replicate' || p.type === 'together')
        );
        
        if (imageProviders.length === 0) {
          alert('No image generation provider configured. Please configure one in Settings.');
          setIsProcessing(false);
          return;
        }
        
        // Use the first available image provider
        const imageProvider = imageProviders[0];
        
        // Build provider API keys object
        const providerApiKeys: {
          openaiApiKey?: string;
          togetherApiKey?: string;
          geminiApiKey?: string;
          replicateApiKey?: string;
        } = {};
        
        settings.providers.forEach(p => {
          if (p.type === 'openai' && p.apiKey) providerApiKeys.openaiApiKey = p.apiKey;
          if (p.type === 'replicate' && p.apiKey) providerApiKeys.replicateApiKey = p.apiKey;
          if (p.type === 'together' && p.apiKey) providerApiKeys.togetherApiKey = p.apiKey;
          if (p.type === 'gemini' && p.apiKey) providerApiKeys.geminiApiKey = p.apiKey;
        });
        
        // Generate the image using the backend's model selection logic
        const result = await generateImage(
          command,
          imageProvider.type, // Provider type (e.g., 'replicate')
          '', // Let backend select model
          '', // Let backend select modelKey
          '1024x768', // Default size for generated images
          'fast', // Use fast/cheap tier
          'vivid', // Default style
          authToken,
          providerApiKeys
        );
        
        if (!result.success || !result.imageUrl) {
          alert(result.error || 'Failed to generate image');
          setIsProcessing(false);
          return;
        }
        
        // Prefer base64 data URL for storage, fallback to regular URL
        let imageUrl = result.imageUrl;
        if (result.base64 && !result.base64.startsWith('data:')) {
          imageUrl = `data:image/png;base64,${result.base64}`;
        } else if (result.base64) {
          imageUrl = result.base64;
        }
        
        // Add the generated image to the images array
        const imageId = `generated-${Date.now()}-${Math.random()}`;
        const newImage: ImageData = {
          id: imageId,
          url: imageUrl,
          name: `Generated: ${command.substring(0, 50)}`,
          tags: ['ai-generated']
        };
        
        setImages(prev => [...prev, newImage]);
        setSelectedImages(new Set([imageId]));
        
        // Auto-save to SWAG
        try {
          const title = `AI Image: ${command.substring(0, 80)}`;
          const content = `![Generated Image](${imageUrl})\n\n**Prompt:** ${command}`;
          await addSnippet(content, 'user', title);
          console.log('✅ Auto-saved generated image to SWAG');
          showSuccess('Image generated and saved to SWAG');
        } catch (error) {
          console.error('Failed to auto-save to SWAG:', error);
          showSuccess('Image generated (failed to save to SWAG)');
        }
        
        // Show cost information if available
        if (result.cost !== undefined && result.cost > 0) {
          // Check if user provided their own API key
          const hasUserKey = imageProviders.some(p => p.apiKey && p.apiKey.trim() !== '');
          const costMsg = hasUserKey 
            ? `💰 Generation cost: $${result.cost.toFixed(4)} (using your API key)`
            : `💰 Generation cost: $${result.cost.toFixed(4)} (includes 25% LLM markup + Lambda fees)`;
          showInfo(costMsg);
        }
        
        // Clear command after successful generation
        setCommand('');
        setIsProcessing(false);
        return;
      }

      // EXISTING FEATURE: If images are selected, parse and execute editing commands
      console.log('Parsing command:', command);
      const authToken = await getToken();
      const parseResult = await parseImageCommand(command, settings.providers, authToken);
      
      if (!parseResult.success || parseResult.operations.length === 0) {
        showWarning(parseResult.explanation || 'Could not understand command. Try: "make smaller", "rotate right", "convert to jpg", "remove glasses"');
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
          <div className="flex items-center gap-4">
            <div className="flex gap-2">
              <button
                onClick={handleUndo}
                disabled={!canUndo || isProcessing}
                className="px-3 py-1.5 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                title="Undo (Ctrl+Z)"
              >
                ↶ Undo
              </button>
              <button
                onClick={handleRedo}
                disabled={!canRedo || isProcessing}
                className="px-3 py-1.5 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                title="Redo (Ctrl+Y)"
              >
                ↷ Redo
              </button>
            </div>
            <h1 className="text-xl font-bold text-gray-900">
              Image Editor
              {selectedImages.size > 0 && ` (${selectedImages.size} selected)`}
            </h1>
          </div>
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
            className="flex items-center gap-2 px-3 sm:px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
            </svg>
            <span className="hidden sm:inline">{isUploading ? 'Uploading...' : '📁 Upload File'}</span>
            <span className="sm:hidden">📁</span>
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
            className="flex items-center gap-2 px-3 sm:px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
            </svg>
            <span className="hidden sm:inline">📚 Select from Swag</span>
            <span className="sm:hidden">📚</span>
          </button>

          {/* Generate from Prompt Button */}
          <button
            onClick={() => setShowGenerateDialog(true)}
            disabled={!features?.imageEditingAI || isProcessing}
            className={`flex items-center gap-2 px-3 sm:px-4 py-2 rounded-lg transition-colors ${
              !features?.imageEditingAI || isProcessing
                ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
                : 'bg-purple-600 text-white hover:bg-purple-700'
            }`}
            title={!features?.imageEditingAI ? 'Configure image providers in settings to enable' : ''}
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
            </svg>
            <span className="hidden sm:inline">✨ Generate from Prompt</span>
            <span className="sm:hidden">✨</span>
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
            <form onSubmit={(e) => {
              e.preventDefault();
              if (generatePrompt.trim() && !isGenerating) {
                handleGenerateFromPrompt();
              }
            }}>
              <textarea
                value={generatePrompt}
                onChange={(e) => setGeneratePrompt(e.target.value)}
                onKeyDown={(e) => {
                  // Submit on Enter (without shift for multiline support)
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    if (generatePrompt.trim() && !isGenerating) {
                      handleGenerateFromPrompt();
                    }
                  }
                }}
                placeholder="Describe the image you want to create..."
                className="w-full h-32 border border-gray-300 rounded p-3 mb-4 focus:outline-none focus:ring-2 focus:ring-purple-500"
                tabIndex={1}
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
                  tabIndex={2}
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
                  type="button"
                  onClick={() => { setShowGenerateDialog(false); setGeneratePrompt(''); }}
                  className="px-4 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 transition-colors"
                  tabIndex={4}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={!generatePrompt.trim() || isGenerating}
                  className="px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors"
                  tabIndex={3}
                >
                  {isGenerating ? 'Generating...' : 'Generate Image'}
                </button>
              </div>
              <div className="mt-2 text-xs text-gray-500 text-center">
                Press <kbd className="px-1 py-0.5 bg-gray-200 rounded">Enter</kbd> to generate • <kbd className="px-1 py-0.5 bg-gray-200 rounded">Shift+Enter</kbd> for new line
              </div>
            </form>
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
