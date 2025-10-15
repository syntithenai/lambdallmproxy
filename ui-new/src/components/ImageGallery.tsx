import React, { useState } from 'react';

interface ImageGalleryProps {
  images: string[];
  maxDisplay?: number; // Show only first N images inline (default 3)
  onImageClick?: (url: string) => void;
  onGrabImage?: (url: string) => void;
}

export const ImageGallery: React.FC<ImageGalleryProps> = ({ 
  images, 
  maxDisplay = 3,
  onImageClick,
  onGrabImage
}) => {
  const [hiddenImages, setHiddenImages] = useState<Set<number>>(new Set());
  const displayedImages = images.slice(0, maxDisplay);
  
  if (!images || images.length === 0) return null;
  
  const handleGrabClick = (e: React.MouseEvent, imageUrl: string) => {
    e.stopPropagation();
    onGrabImage?.(imageUrl);
  };
  
  return (
    <div className="my-4 flex gap-2 flex-wrap">
      {displayedImages.map((imageUrl, idx) => {
        if (hiddenImages.has(idx)) return null;
        
        return (
          <div 
            key={`${imageUrl}-${idx}`}
            className="relative group rounded-lg overflow-hidden border border-gray-200 dark:border-gray-700 hover:border-blue-500 dark:hover:border-blue-400 transition-colors w-32 h-32"
          >
            <img 
              src={imageUrl} 
              alt={`Search result ${idx + 1}`}
              className="w-full h-full object-cover cursor-pointer"
              loading="lazy"
              onError={() => setHiddenImages(prev => new Set(prev).add(idx))}
              onClick={() => onImageClick?.(imageUrl)}
            />
            
            {/* Grab button */}
            {onGrabImage && (
              <button
                onClick={(e) => handleGrabClick(e, imageUrl)}
                className="absolute bottom-1 right-1 opacity-0 group-hover:opacity-100 transition-opacity bg-blue-600 hover:bg-blue-700 text-white text-xs px-2 py-1 rounded shadow-lg z-10"
                title="Add to SWAG"
              >
                📎 Grab
              </button>
            )}
          </div>
        );
      })}
    </div>
  );
};
