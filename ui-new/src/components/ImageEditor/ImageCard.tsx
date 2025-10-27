import React from 'react';
import type { ImageData, ProcessingStatus } from './types';

interface ImageCardProps {
  image: ImageData;
  isSelected: boolean;
  onToggleSelection: () => void;
  processingStatus?: ProcessingStatus;
  isNew?: boolean;
}

export const ImageCard: React.FC<ImageCardProps> = ({
  image,
  isSelected,
  onToggleSelection,
  processingStatus,
  isNew = false,
}) => {
  return (
    <div
      className={`
        relative rounded-lg overflow-hidden border-2 transition-all
        ${isSelected ? 'border-blue-500 shadow-lg' : 'border-gray-200'}
        ${isNew ? 'ring-4 ring-green-500 animate-pulse' : ''}
      `}
    >
      {/* Selection Checkbox */}
      <div className="absolute top-2 left-2 z-10">
        <input
          type="checkbox"
          checked={isSelected}
          onChange={onToggleSelection}
          className="w-5 h-5 rounded bg-white/80 backdrop-blur cursor-pointer"
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
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-white mx-auto"></div>
            <p className="text-sm mt-2">{processingStatus.message}</p>
            <div className="w-full bg-gray-200 rounded-full h-2 mt-2 mx-4">
              <div
                className="bg-blue-600 h-2 rounded-full transition-all"
                style={{ width: `${processingStatus.progress}%` }}
              ></div>
            </div>
          </div>
        </div>
      )}

      {/* Error Overlay */}
      {processingStatus?.status === 'error' && (
        <div className="absolute inset-0 bg-red-500/20 flex items-center justify-center">
          <div className="text-center text-red-900 bg-white/90 p-2 rounded">
            <p className="text-sm font-bold">❌ Error</p>
            <p className="text-xs">{processingStatus.error}</p>
          </div>
        </div>
      )}

      {/* Complete Badge */}
      {processingStatus?.status === 'complete' && (
        <div className="absolute top-2 right-2 bg-green-500 text-white px-2 py-1 rounded text-xs font-bold">
          ✓ Done
        </div>
      )}

      {/* Image Info */}
      <div className="p-2 bg-gray-50">
        <p className="text-sm font-medium truncate">{image.name}</p>
        <div className="flex gap-1 mt-1 flex-wrap">
          {image.tags.map((tag) => (
            <span key={tag} className="px-2 py-0.5 bg-blue-100 text-xs rounded">
              {tag}
            </span>
          ))}
        </div>
        {image.width && image.height && (
          <p className="text-xs text-gray-500 mt-1">
            {image.width} × {image.height}
            {image.format && ` • ${image.format.toUpperCase()}`}
          </p>
        )}
      </div>
    </div>
  );
};
