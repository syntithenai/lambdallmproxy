import React, { useState, useRef } from 'react';
import type { DragEvent, ChangeEvent } from 'react';
import { useToast } from './ToastManager';

interface FileUploadDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onUpload: (file: File | string) => Promise<void>;
}

type UploadMode = 'file' | 'url';

const FileUploadDialog: React.FC<FileUploadDialogProps> = ({ isOpen, onClose, onUpload }) => {
  const [uploadMode, setUploadMode] = useState<UploadMode>('file');
  const [url, setUrl] = useState('');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [estimatedCost, setEstimatedCost] = useState<number | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { showError, showSuccess } = useToast();

  if (!isOpen) return null;

  const acceptedFormats = [
    '.pdf',
    '.docx',
    '.txt',
    '.md',
    '.html',
    '.csv',
    '.json',
    '.png',
    '.jpg',
    '.jpeg',
    '.gif',
    '.webp',
  ];

  const validateUrl = (urlString: string): boolean => {
    try {
      const urlObj = new URL(urlString);
      return urlObj.protocol === 'http:' || urlObj.protocol === 'https:';
    } catch {
      return false;
    }
  };

  const estimateEmbeddingCost = (file: File): number => {
    // Rough estimate: 4 chars per token, $0.02 per 1M tokens
    const estimatedChars = file.size;
    const estimatedTokens = estimatedChars / 4;
    const cost = (estimatedTokens / 1000000) * 0.02;
    return cost;
  };

  const handleFileSelect = (file: File) => {
    // Validate file type
    const extension = '.' + file.name.split('.').pop()?.toLowerCase();
    if (!acceptedFormats.includes(extension)) {
      showError(`File type ${extension} not supported`);
      return;
    }

    // Validate file size (max 10 MB)
    if (file.size > 10 * 1024 * 1024) {
      showError('File size exceeds 10 MB limit');
      return;
    }

    setSelectedFile(file);
    const cost = estimateEmbeddingCost(file);
    setEstimatedCost(cost);
  };

  const handleFileInputChange = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      handleFileSelect(file);
    }
  };

  const handleDragOver = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  };

  const handleDragLeave = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  };

  const handleDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);

    const file = e.dataTransfer.files?.[0];
    if (file) {
      handleFileSelect(file);
    }
  };

  const handleUpload = async () => {
    if (uploadMode === 'file' && !selectedFile) {
      showError('Please select a file');
      return;
    }

    if (uploadMode === 'url' && !url.trim()) {
      showError('Please enter a URL');
      return;
    }

    if (uploadMode === 'url' && !validateUrl(url)) {
      showError('Invalid URL format');
      return;
    }

    setIsUploading(true);
    setUploadProgress(0);

    try {
      // Simulate progress
      const progressInterval = setInterval(() => {
        setUploadProgress((prev) => Math.min(prev + 10, 90));
      }, 300);

      if (uploadMode === 'file' && selectedFile) {
        await onUpload(selectedFile);
      } else {
        await onUpload(url);
      }

      clearInterval(progressInterval);
      setUploadProgress(100);

      showSuccess('File uploaded and processed successfully');
      
      // Reset and close
      setTimeout(() => {
        setSelectedFile(null);
        setUrl('');
        setEstimatedCost(null);
        setUploadProgress(0);
        setIsUploading(false);
        onClose();
      }, 500);

    } catch (error) {
      console.error('Upload error:', error);
      showError(`Upload failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
      setIsUploading(false);
      setUploadProgress(0);
    }
  };

  const handleClose = () => {
    if (!isUploading) {
      setSelectedFile(null);
      setUrl('');
      setEstimatedCost(null);
      setUploadProgress(0);
      onClose();
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-2xl w-full mx-4 max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-gray-200 dark:border-gray-700">
          <h2 className="text-2xl font-bold text-gray-900 dark:text-white">
            Upload Document
          </h2>
          <button
            onClick={handleClose}
            disabled={isUploading}
            className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 disabled:opacity-50"
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-gray-200 dark:border-gray-700">
          <button
            onClick={() => setUploadMode('file')}
            disabled={isUploading}
            className={`flex-1 px-6 py-3 font-medium ${
              uploadMode === 'file'
                ? 'text-blue-600 dark:text-blue-400 border-b-2 border-blue-600 dark:border-blue-400'
                : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200'
            } disabled:opacity-50`}
          >
            📁 Upload File
          </button>
          <button
            onClick={() => setUploadMode('url')}
            disabled={isUploading}
            className={`flex-1 px-6 py-3 font-medium ${
              uploadMode === 'url'
                ? 'text-blue-600 dark:text-blue-400 border-b-2 border-blue-600 dark:border-blue-400'
                : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200'
            } disabled:opacity-50`}
          >
            🔗 Paste URL
          </button>
        </div>

        {/* Content */}
        <div className="p-6">
          {uploadMode === 'file' ? (
            <div>
              {/* File Drop Zone */}
              <div
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
                onClick={() => !isUploading && fileInputRef.current?.click()}
                className={`
                  border-2 border-dashed rounded-lg p-8 text-center cursor-pointer
                  transition-colors duration-200
                  ${isDragging 
                    ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20' 
                    : 'border-gray-300 dark:border-gray-600 hover:border-blue-400 dark:hover:border-blue-500'
                  }
                  ${isUploading ? 'opacity-50 cursor-not-allowed' : ''}
                `}
              >
                <input
                  ref={fileInputRef}
                  type="file"
                  accept={acceptedFormats.join(',')}
                  onChange={handleFileInputChange}
                  disabled={isUploading}
                  className="hidden"
                />
                
                <svg className="w-12 h-12 mx-auto mb-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                </svg>

                {selectedFile ? (
                  <div>
                    <p className="text-sm font-medium text-gray-900 dark:text-white mb-1">
                      {selectedFile.name}
                    </p>
                    <p className="text-xs text-gray-500 dark:text-gray-400">
                      {(selectedFile.size / 1024).toFixed(2)} KB
                    </p>
                  </div>
                ) : (
                  <div>
                    <p className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                      Drag and drop a file here, or click to browse
                    </p>
                    <p className="text-xs text-gray-500 dark:text-gray-400">
                      Supported: PDF, DOCX, TXT, MD, HTML, CSV, JSON, Images
                    </p>
                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                      Max size: 10 MB
                    </p>
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div>
              {/* URL Input */}
              <div className="mb-4">
                <label htmlFor="url-input" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Document URL
                </label>
                <input
                  id="url-input"
                  type="url"
                  value={url}
                  onChange={(e) => setUrl(e.target.value)}
                  disabled={isUploading}
                  placeholder="https://example.com/document.pdf"
                  className="
                    w-full px-4 py-2 border border-gray-300 dark:border-gray-600 
                    rounded-lg focus:ring-2 focus:ring-blue-500 dark:focus:ring-blue-400
                    bg-white dark:bg-gray-700 text-gray-900 dark:text-white
                    disabled:opacity-50 disabled:cursor-not-allowed
                  "
                />
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-2">
                  The document will be fetched and processed. Original URL will be preserved as the source.
                </p>
              </div>
            </div>
          )}

          {/* Cost Estimate */}
          {estimatedCost !== null && (
            <div className="mt-4 p-4 bg-blue-50 dark:bg-blue-900/20 rounded-lg">
              <p className="text-sm text-blue-800 dark:text-blue-300">
                <strong>Estimated embedding cost:</strong> ${estimatedCost.toFixed(4)}
              </p>
              <p className="text-xs text-blue-600 dark:text-blue-400 mt-1">
                This estimate is based on file size and may vary depending on actual content.
              </p>
            </div>
          )}

          {/* Upload Progress */}
          {isUploading && (
            <div className="mt-4">
              <div className="flex justify-between text-sm text-gray-600 dark:text-gray-400 mb-2">
                <span>Uploading and processing...</span>
                <span>{uploadProgress}%</span>
              </div>
              <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2">
                <div
                  className="bg-blue-600 dark:bg-blue-400 h-2 rounded-full transition-all duration-300"
                  style={{ width: `${uploadProgress}%` }}
                />
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex justify-end gap-3 p-6 border-t border-gray-200 dark:border-gray-700">
          <button
            onClick={handleClose}
            disabled={isUploading}
            className="
              px-4 py-2 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 
              rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed
            "
          >
            Cancel
          </button>
          <button
            onClick={handleUpload}
            disabled={isUploading || (uploadMode === 'file' && !selectedFile) || (uploadMode === 'url' && !url.trim())}
            className="
              px-6 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg 
              transition-colors disabled:opacity-50 disabled:cursor-not-allowed
              font-medium
            "
          >
            {isUploading ? 'Processing...' : uploadMode === 'file' ? 'Upload' : 'Fetch & Process'}
          </button>
        </div>
      </div>
    </div>
  );
};

export { FileUploadDialog };
export type { FileUploadDialogProps };
