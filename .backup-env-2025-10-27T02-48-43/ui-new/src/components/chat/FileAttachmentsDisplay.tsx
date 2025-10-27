import React from 'react';

export interface AttachedFile {
  name: string;
  type: string;
  size: number;
  base64: string;
  preview?: string;
}

interface FileAttachmentsDisplayProps {
  attachedFiles: AttachedFile[];
  onRemoveAttachment: (index: number) => void;
}

export const FileAttachmentsDisplay: React.FC<FileAttachmentsDisplayProps> = ({
  attachedFiles,
  onRemoveAttachment,
}) => {
  if (attachedFiles.length === 0) return null;

  return (
    <div className="flex flex-wrap gap-2 p-2 bg-gray-50 dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700">
      {attachedFiles.map((file, idx) => (
        <div 
          key={idx} 
          className="relative group bg-white dark:bg-gray-700 rounded-lg border border-gray-300 dark:border-gray-600 p-2 flex items-center gap-2"
        >
          {/* Preview or Icon */}
          {file.preview ? (
            <img 
              src={file.preview} 
              alt={file.name} 
              className="w-12 h-12 object-cover rounded"
            />
          ) : (
            <div className="w-12 h-12 flex items-center justify-center bg-red-100 dark:bg-red-900/30 rounded">
              <svg className="w-6 h-6 text-red-600 dark:text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
              </svg>
            </div>
          )}
          
          {/* File Info */}
          <div className="flex-1 min-w-0">
            <div className="text-xs font-medium text-gray-900 dark:text-gray-100 truncate max-w-[150px]">
              {file.name}
            </div>
            <div className="text-xs text-gray-500 dark:text-gray-400">
              {(file.size / 1024).toFixed(1)} KB
            </div>
          </div>
          
          {/* Remove Button */}
          <button
            onClick={() => onRemoveAttachment(idx)}
            className="opacity-0 group-hover:opacity-100 transition-opacity absolute -top-2 -right-2 bg-red-500 hover:bg-red-600 text-white rounded-full w-5 h-5 flex items-center justify-center text-xs"
            title="Remove file"
          >
            ×
          </button>
        </div>
      ))}
    </div>
  );
};
