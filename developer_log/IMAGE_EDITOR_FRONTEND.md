# Image Editor - Frontend Implementation Plan

## Component Architecture

```
src/components/ImageEditor/
├── ImageEditorPage.tsx            # Main page component (routable)
├── ImageGrid.tsx                  # Responsive image grid
├── ImageCard.tsx                  # Individual image card
├── BulkOperationsBar.tsx          # Floating toolbar
├── CommandInput.tsx               # Natural language input
├── ProgressToast.tsx              # Processing status
├── SelectionControls.tsx          # Select all/none
└── types.ts                       # TypeScript definitions

src/components/
├── ImageEditorNavButton.tsx       # Navigation button for bottom right / mobile nav dropdown
```

## Component Specifications

### 1. ImageEditorPage.tsx

**Purpose**: Dedicated routable page for image editing at `/image-editor`

**Route Setup**:
```typescript
// In App.tsx routes
<Route path="/image-editor" element={<ImageEditorPage />} />
```

**Props**:
```typescript
interface ImageEditorPageProps {
  // Images passed via location state from navigation
  // or loaded from URL params
}

interface ImageData {
  id: string;
  url: string;
  name: string;
  tags: string[];
  snippetId: string;
  width?: number;
  height?: number;
  format?: string;
  size?: number;
}
```

**State**:
```typescript
interface EditorState {
  selectedImages: Set<string>;
  processedImages: ImageData[];
  processingStatus: Map<string, ProcessingStatus>;
  command: string;
  isProcessing: boolean;
}

interface ProcessingStatus {
  imageId: string;
  status: 'idle' | 'processing' | 'complete' | 'error';
  progress: number;  // 0-100
  message: string;
  result?: ImageData;
  error?: string;
}
```

**Layout**:
```tsx
<div className="image-editor-page min-h-screen flex flex-col">
  {/* Header with Back to Swag button */}
  <header className="bg-white border-b border-gray-200 p-4">
    <div className="flex items-center justify-between">
      <Button
        onClick={() => navigate('/swag')}
        variant="ghost"
        className="flex items-center gap-2"
      >
        <ArrowLeftIcon />
        Back to Swag
      </Button>
      <h1 className="text-xl font-bold">
        Image Editor ({selectedCount} selected)
      </h1>
      <div className="w-24"></div> {/* Spacer for centering */}
    </div>
  </header>
  
  <main className="flex-1 overflow-auto p-4">
    <SelectionControls 
      onSelectAll={handleSelectAll}
      onSelectNone={handleSelectNone}
      selectedCount={selectedImages.size}
      totalCount={images.length}
    />
    
    <ImageGrid
      images={[...processedImages, ...images]}
      selectedImages={selectedImages}
      onToggleSelection={handleToggleSelection}
      processingStatus={processingStatus}
    />
  </main>
  
  <footer className="bg-white border-t border-gray-200 sticky bottom-0">
    <BulkOperationsBar
      selectedCount={selectedImages.size}
      onOperation={handleBulkOperation}
      disabled={isProcessing}
    />
    
    <CommandInput
      value={command}
      onChange={setCommand}
      onSubmit={handleCommandSubmit}
      disabled={isProcessing}
      placeholder="Describe transformation (e.g., 'resize to 800px width' or 'convert to grayscale')"
    />
  </footer>
</div>
```

**Key Methods**:
- `handleSelectAll()`: Select all images
- `handleSelectNone()`: Deselect all images
- `handleToggleSelection(imageId)`: Toggle individual selection
- `handleBulkOperation(operation)`: Apply preset transformation
- `handleCommandSubmit()`: Parse and execute natural language command
- `handleProgressUpdate(event)`: Process SSE progress events

### 2. ImageGrid.tsx

**Purpose**: Responsive grid layout for images

**Props**:
```typescript
interface ImageGridProps {
  images: ImageData[];
  selectedImages: Set<string>;
  onToggleSelection: (imageId: string) => void;
  processingStatus: Map<string, ProcessingStatus>;
}
```

**Layout**:
```css
/* Desktop: 3 columns */
@media (min-width: 768px) {
  .image-grid {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 1rem;
  }
}

/* Tablet: 2 columns */
@media (min-width: 480px) and (max-width: 767px) {
  .image-grid {
    grid-template-columns: repeat(2, 1fr);
  }
}

/* Mobile: 1 column */
@media (max-width: 479px) {
  .image-grid {
    grid-template-columns: 1fr;
  }
}
```

**Rendering**:
```tsx
<div className="image-grid">
  {images.map(image => (
    <ImageCard
      key={image.id}
      image={image}
      isSelected={selectedImages.has(image.id)}
      onToggleSelection={() => onToggleSelection(image.id)}
      processingStatus={processingStatus.get(image.id)}
      isNew={isNewlyGenerated(image)}
    />
  ))}
</div>
```

### 3. ImageCard.tsx

**Purpose**: Individual image display with selection

**Props**:
```typescript
interface ImageCardProps {
  image: ImageData;
  isSelected: boolean;
  onToggleSelection: () => void;
  processingStatus?: ProcessingStatus;
  isNew?: boolean;
}
```

**Layout**:
```tsx
<div className={`
  image-card relative rounded-lg overflow-hidden
  ${isSelected ? 'ring-2 ring-blue-500' : ''}
  ${isNew ? 'ring-4 ring-green-500 animate-pulse' : ''}
`}>
  {/* Selection Checkbox */}
  <div className="absolute top-2 left-2 z-10">
    <Checkbox
      checked={isSelected}
      onChange={onToggleSelection}
      className="bg-white/80 backdrop-blur"
    />
  </div>
  
  {/* Image */}
  <img
    src={image.url}
    alt={image.name}
    className="w-full h-auto object-cover"
    loading="lazy"
  />
  
  {/* Processing Overlay */}
  {processingStatus?.status === 'processing' && (
    <div className="absolute inset-0 bg-black/50 flex items-center justify-center">
      <div className="text-center text-white">
        <Spinner />
        <p className="text-sm mt-2">{processingStatus.message}</p>
        <ProgressBar value={processingStatus.progress} />
      </div>
    </div>
  )}
  
  {/* Image Info */}
  <div className="p-2 bg-gray-50">
    <p className="text-sm font-medium truncate">{image.name}</p>
    <div className="flex gap-1 mt-1">
      {image.tags.map(tag => (
        <span key={tag} className="px-2 py-1 bg-blue-100 text-xs rounded">
          {tag}
        </span>
      ))}
    </div>
    {image.width && image.height && (
      <p className="text-xs text-gray-500 mt-1">
        {image.width} × {image.height} • {image.format}
      </p>
    )}
  </div>
</div>
```

### 4. BulkOperationsBar.tsx

**Purpose**: Quick-action transformation buttons

**Props**:
```typescript
interface BulkOperationsBarProps {
  selectedCount: number;
  onOperation: (operation: BulkOperation) => void;
  disabled: boolean;
}

interface BulkOperation {
  type: 'resize' | 'rotate' | 'flip' | 'format' | 'filter';
  params: Record<string, any>;
  label: string;
}
```

**Layout**:
```tsx
<div className="bulk-operations-bar bg-white border-t border-gray-200 p-4">
  <div className="flex flex-wrap gap-2">
    {/* Resize Operations */}
    <div className="operation-group">
      <label className="text-xs text-gray-500 uppercase">Resize</label>
      <div className="flex gap-1">
        <Button onClick={() => onOperation({type: 'resize', params: {scale: 0.25}, label: '25%'})} size="sm">25%</Button>
        <Button onClick={() => onOperation({type: 'resize', params: {scale: 0.5}, label: '50%'})} size="sm">50%</Button>
        <Button onClick={() => onOperation({type: 'resize', params: {scale: 0.75}, label: '75%'})} size="sm">75%</Button>
        <Button onClick={() => onOperation({type: 'resize', params: {scale: 1.5}, label: '150%'})} size="sm">150%</Button>
        <Button onClick={() => onOperation({type: 'resize', params: {scale: 2}, label: '200%'})} size="sm">200%</Button>
      </div>
    </div>
    
    {/* Rotate Operations */}
    <div className="operation-group">
      <label className="text-xs text-gray-500 uppercase">Rotate</label>
      <div className="flex gap-1">
        <Button onClick={() => onOperation({type: 'rotate', params: {degrees: 90}, label: '90°'})} size="sm">90°</Button>
        <Button onClick={() => onOperation({type: 'rotate', params: {degrees: 180}, label: '180°'})} size="sm">180°</Button>
        <Button onClick={() => onOperation({type: 'rotate', params: {degrees: 270}, label: '270°'})} size="sm">270°</Button>
      </div>
    </div>
    
    {/* Flip Operations */}
    <div className="operation-group">
      <label className="text-xs text-gray-500 uppercase">Flip</label>
      <div className="flex gap-1">
        <Button onClick={() => onOperation({type: 'flip', params: {direction: 'horizontal'}, label: 'H'})} size="sm">↔️</Button>
        <Button onClick={() => onOperation({type: 'flip', params: {direction: 'vertical'}, label: 'V'})} size="sm">↕️</Button>
      </div>
    </div>
    
    {/* Format Operations */}
    <div className="operation-group">
      <label className="text-xs text-gray-500 uppercase">Format</label>
      <div className="flex gap-1">
        <Button onClick={() => onOperation({type: 'format', params: {format: 'jpg'}, label: 'JPG'})} size="sm">JPG</Button>
        <Button onClick={() => onOperation({type: 'format', params: {format: 'png'}, label: 'PNG'})} size="sm">PNG</Button>
        <Button onClick={() => onOperation({type: 'format', params: {format: 'webp'}, label: 'WebP'})} size="sm">WebP</Button>
      </div>
    </div>
    
    {/* Filter Operations */}
    <div className="operation-group">
      <label className="text-xs text-gray-500 uppercase">Filters</label>
      <div className="flex gap-1">
        <Button onClick={() => onOperation({type: 'filter', params: {filter: 'grayscale'}, label: 'Gray'})} size="sm">⚫</Button>
        <Button onClick={() => onOperation({type: 'filter', params: {filter: 'sepia'}, label: 'Sepia'})} size="sm">🟤</Button>
        <Button onClick={() => onOperation({type: 'filter', params: {filter: 'blur'}, label: 'Blur'})} size="sm">🌫️</Button>
        <Button onClick={() => onOperation({type: 'filter', params: {filter: 'sharpen'}, label: 'Sharp'})} size="sm">✨</Button>
      </div>
    </div>
  </div>
  
  <div className="text-xs text-gray-500 mt-2">
    {selectedCount} image{selectedCount !== 1 ? 's' : ''} selected
  </div>
</div>
```

### 5. CommandInput.tsx

**Purpose**: Natural language command interface

**Props**:
```typescript
interface CommandInputProps {
  value: string;
  onChange: (value: string) => void;
  onSubmit: () => void;
  disabled: boolean;
  placeholder?: string;
}
```

**Layout**:
```tsx
<div className="command-input-container bg-white border-t border-gray-200 p-4">
  <form onSubmit={(e) => { e.preventDefault(); onSubmit(); }}>
    <div className="flex gap-2">
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
        placeholder={placeholder}
        className="flex-1 border border-gray-300 rounded-lg p-3 resize-none h-24 focus:ring-2 focus:ring-blue-500"
        onKeyDown={(e) => {
          if (e.key === 'Enter' && e.ctrlKey) {
            e.preventDefault();
            onSubmit();
          }
        }}
      />
      <Button
        type="submit"
        disabled={disabled || !value.trim()}
        className="self-end"
      >
        Apply
      </Button>
    </div>
    
    {/* Example Commands */}
    <div className="mt-2 text-xs text-gray-500">
      <strong>Examples:</strong> "resize to 800px width" • "convert to grayscale" • "rotate 90 degrees" • "add 10px border"
    </div>
  </form>
</div>
```

### 6. ProgressToast.tsx

**Purpose**: Real-time processing status notifications

**Props**:
```typescript
interface ProgressToastProps {
  imageId: string;
  imageName: string;
  status: ProcessingStatus;
  onDismiss: () => void;
}
```

**Layout**:
```tsx
<Toast
  type={status.status === 'error' ? 'error' : status.status === 'complete' ? 'success' : 'info'}
  onDismiss={onDismiss}
  duration={status.status === 'complete' ? 3000 : undefined}
>
  <div className="flex items-center gap-3">
    {status.status === 'processing' && <Spinner size="sm" />}
    {status.status === 'complete' && <CheckIcon className="text-green-500" />}
    {status.status === 'error' && <ErrorIcon className="text-red-500" />}
    
    <div className="flex-1">
      <p className="font-medium">{imageName}</p>
      <p className="text-sm text-gray-600">{status.message}</p>
      {status.status === 'processing' && (
        <ProgressBar value={status.progress} className="mt-1" />
      )}
    </div>
  </div>
</Toast>
```

## State Management

### React Query Mutations

```typescript
// Hook for image processing
const useImageProcessor = () => {
  const [progressMap, setProgressMap] = useState<Map<string, ProcessingStatus>>(new Map());
  
  const processMutation = useMutation({
    mutationFn: async ({ images, operation }: ProcessImagesParams) => {
      const eventSource = new EventSource(`/api/image-edit/process`);
      
      eventSource.onmessage = (event) => {
        const update: ProgressUpdate = JSON.parse(event.data);
        setProgressMap(prev => new Map(prev).set(update.imageId, update.status));
      };
      
      const response = await fetch('/api/image-edit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ images, operation })
      });
      
      return response.json();
    },
    onSuccess: (results) => {
      // Add to Swag snippets
      results.forEach(addToSwag);
      toast.success(`Processed ${results.length} image(s)`);
    },
    onError: (error) => {
      toast.error(`Processing failed: ${error.message}`);
    }
  });
  
  return { processMutation, progressMap };
};
```

### IndexedDB Integration

```typescript
// Store generated images
const saveGeneratedImage = async (image: ImageData) => {
  const db = await openDB('image-editor', 1, {
    upgrade(db) {
      db.createObjectStore('generated-images', { keyPath: 'id' });
    }
  });
  
  await db.put('generated-images', {
    ...image,
    timestamp: Date.now(),
    source: 'editor'
  });
};

// Auto-add to Swag
const addToSwag = async (image: ImageData) => {
  const snippet = {
    id: generateId(),
    type: 'image',
    content: image.url,
    title: image.name,
    tags: ['generated', ...image.tags],
    timestamp: Date.now(),
    metadata: {
      width: image.width,
      height: image.height,
      format: image.format,
      source: 'image-editor'
    }
  };
  
  await saveSnippet(snippet);
};
```

## Integration Points

### 1. Navigation Button Component

**ImageEditorNavButton.tsx**:
```tsx
interface ImageEditorNavButtonProps {
  className?: string;
}

const ImageEditorNavButton: React.FC<ImageEditorNavButtonProps> = ({ className }) => {
  const navigate = useNavigate();
  
  return (
    <button
      onClick={() => navigate('/image-editor')}
      className={`flex items-center gap-2 ${className}`}
      title="Image Editor"
    >
      <PencilIcon className="w-5 h-5" />
      <span>Image Editor</span>
    </button>
  );
};
```

**Add to GitHubLink.tsx (Desktop - Bottom Right)**:
```tsx
// In GitHubLink.tsx component
<div className="fixed bottom-4 right-4 flex flex-col gap-2 items-end z-40">
  {/* Image Editor Button - Above other buttons */}
  <ImageEditorNavButton className="btn-secondary px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-lg shadow-lg" />
  
  {/* Existing buttons */}
  <button onClick={handleOpenSettings}>⚙️ Settings</button>
  <button onClick={handleOpenHelp}>❓ Help</button>
  // ... etc
</div>
```

**Add to Mobile Nav Dropdown**:
```tsx
// In mobile navigation dropdown (likely in App.tsx or NavMenu.tsx)
<div className="mobile-nav-menu">
  {/* Image Editor - Above settings/help/privacy/github */}
  <ImageEditorNavButton className="nav-menu-item" />
  
  <Divider />
  
  {/* Existing items */}
  <button onClick={handleOpenSettings}>⚙️ Settings</button>
  <button onClick={handleOpenHelp}>❓ Help</button>
  <button onClick={handleOpenPrivacy}>🔒 Privacy</button>
  <a href="https://github.com/..." target="_blank">🐙 GitHub</a>
</div>
```

### 2. Swag Page Integration

**Add Edit Button to Images**:
```tsx
// SwagImageDisplay.tsx
<div className="image-container relative">
  <img src={image.url} alt={image.name} />
  <button
    onClick={() => navigateToImageEditor([image])}
    className="absolute top-2 right-2 bg-white/90 p-2 rounded-lg hover:bg-white"
  >
    <PencilIcon />
  </button>
</div>

const navigateToImageEditor = (images: ImageData[]) => {
  navigate('/image-editor', { state: { images } });
};
```

**Bulk Operations Integration**:
```tsx
// SwagBulkOperationsBar.tsx
{hasSelectedSnippets && (
  <>
    <Button onClick={handleBulkEdit}>
      <PencilIcon /> Edit Images
    </Button>
  </>
)}

const handleBulkEdit = () => {
  const images = extractImagesFromSnippets(selectedSnippets);
  navigate('/image-editor', { state: { images } });
};
```

### 3. Extract Images from Snippets

```typescript
const extractImagesFromSnippets = (snippets: Snippet[]): ImageData[] => {
  const images: ImageData[] = [];
  
  for (const snippet of snippets) {
    // Direct image snippets
    if (snippet.type === 'image') {
      images.push({
        id: generateId(),
        url: snippet.content,
        name: snippet.title || 'Untitled',
        tags: snippet.tags || [],
        snippetId: snippet.id,
        ...snippet.metadata
      });
    }
    
    // Images embedded in HTML content
    if (snippet.content.includes('<img')) {
      const parser = new DOMParser();
      const doc = parser.parseFromString(snippet.content, 'text/html');
      const imgElements = doc.querySelectorAll('img');
      
      imgElements.forEach((img, index) => {
        images.push({
          id: generateId(),
          url: img.src,
          name: img.alt || `${snippet.title} - Image ${index + 1}`,
          tags: snippet.tags || [],
          snippetId: snippet.id
        });
      });
    }
  }
  
  return images;
};
```

## Error Handling

```typescript
// Retry logic for failed operations
const retryOperation = async (imageId: string, operation: Operation, maxRetries = 3) => {
  for (let i = 0; i < maxRetries; i++) {
    try {
      return await processImage(imageId, operation);
    } catch (error) {
      if (i === maxRetries - 1) throw error;
      await sleep(1000 * (i + 1)); // Exponential backoff
    }
  }
};

// User-friendly error messages
const getErrorMessage = (error: Error): string => {
  if (error.message.includes('timeout')) {
    return 'Processing took too long. Try with a smaller image.';
  }
  if (error.message.includes('memory')) {
    return 'Image too large to process. Try resizing first.';
  }
  if (error.message.includes('format')) {
    return 'Unsupported image format. Use JPG, PNG, or WebP.';
  }
  return 'Processing failed. Please try again.';
};
```

## Performance Optimizations

1. **Lazy Loading**: Load images only when visible
2. **Virtual Scrolling**: For large image sets (>100 images)
3. **Image Thumbnails**: Display lower resolution previews
4. **Debounced Input**: Delay command parsing during typing
5. **Optimistic UI**: Show expected result immediately
6. **Request Cancellation**: Cancel in-flight requests on unmount

## Accessibility

- Keyboard navigation for all controls
- ARIA labels for screen readers
- Focus management in modal
- High contrast mode support
- Touch-friendly buttons (min 44px)

## Next Steps

1. Create TypeScript type definitions
2. Build component stubs
3. Implement state management
4. Connect to backend API
5. Add progress tracking
6. Implement error handling
7. Write unit tests
8. Perform integration testing
