// Image Editor Type Definitions

export interface ImageData {
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

export interface EditorState {
  selectedImages: Set<string>;
  processedImages: ImageData[];
  processingStatus: Map<string, ProcessingStatus>;
  command: string;
  isProcessing: boolean;
}

export interface ProcessingStatus {
  imageId: string;
  status: 'idle' | 'processing' | 'complete' | 'error';
  progress: number; // 0-100
  message: string;
  result?: string; // Processed image URL
  error?: string;
}

export type BulkOperationType = 'resize' | 'rotate' | 'flip' | 'format' | 'filter' | 'crop' | 'trim' | 'autocrop' | 'modulate' | 'tint' | 'extend' | 'gamma' | 'generate';

export interface BulkOperation {
  type: BulkOperationType;
  params: Record<string, any>;
  label: string;
}

export interface ResizeParams {
  scale?: number;
  width?: number;
  height?: number;
  maintainAspectRatio?: boolean;
}

export interface RotateParams {
  degrees: number;
}

export interface FlipParams {
  direction: 'horizontal' | 'vertical';
}

export interface FormatParams {
  format: 'jpg' | 'png' | 'webp' | 'avif';
  quality?: number;
}

export interface FilterParams {
  filter: 'grayscale' | 'sepia' | 'blur' | 'sharpen' | 'negate' | 'normalize';
  intensity?: number;
  strength?: number;
}

export interface CropParams {
  width?: number;
  height?: number;
  x?: number;
  y?: number;
}

export interface AutocropParams {
  focus: 'center' | 'face';
}

export interface ModulateParams {
  brightness?: number;
  saturation?: number;
  hue?: number;
}

export interface TintParams {
  r: number;
  g: number;
  b: number;
}

export interface ExtendParams {
  top?: number;
  bottom?: number;
  left?: number;
  right?: number;
  background?: { r: number; g: number; b: number };
}

export interface GammaParams {
  gamma: number;
}

export interface ProgressUpdate {
  imageId: string;
  status: ProcessingStatus;
}

export interface ProcessImagesParams {
  images: ImageData[];
  operation: BulkOperation | string; // BulkOperation or natural language command
}
