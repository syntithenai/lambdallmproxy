import React from 'react';

interface DragDropOverlayProps {
  isDragging: boolean;
}

export const DragDropOverlay: React.FC<DragDropOverlayProps> = ({ isDragging }) => {
  if (!isDragging) return null;

  return (
    <div className="absolute inset-0 z-50 bg-blue-500/20 dark:bg-blue-400/20 backdrop-blur-sm flex items-center justify-center border-4 border-dashed border-blue-500 dark:border-blue-400">
      <div className="bg-white dark:bg-gray-800 rounded-lg p-8 shadow-2xl">
        <div className="text-center">
          <svg className="w-16 h-16 mx-auto mb-4 text-blue-500 dark:text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
          </svg>
          <h3 className="text-2xl font-bold text-gray-900 dark:text-gray-100 mb-2">
            Drop files here
          </h3>
          <p className="text-gray-600 dark:text-gray-400">
            Images (JPEG, PNG, GIF, WebP) and PDFs supported
          </p>
          <p className="text-sm text-gray-500 dark:text-gray-500 mt-2">
            Max: 5MB for images, 10MB for PDFs
          </p>
        </div>
      </div>
    </div>
  );
};
