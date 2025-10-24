import React, { useState } from 'react';

interface ImageGalleryProps {
  images: string[] | Array<{ src: string; alt?: string }>;
  maxDisplay?: number; // Show only first N images inline (default 3)
  onImageClick?: (url: string) => void;
  onGrabImage?: (url: string, description?: string) => void;
}

export const ImageGallery: React.FC<ImageGalleryProps> = ({ 
  images, 
  maxDisplay = 3,
  onImageClick,
  onGrabImage
}) => {
  const [hiddenImages, setHiddenImages] = useState<Set<number>>(new Set());
  
  // Normalize images to always have src and alt
  const normalizedImages = images.map(img => 
    typeof img === 'string' ? { src: img, alt: undefined } : img
  );
  
  const displayedImages = normalizedImages.slice(0, maxDisplay);
  
  if (!images || images.length === 0) return null;
  
  const handleGrabClick = (e: React.MouseEvent, imageUrl: string, alt?: string) => {
    e.stopPropagation();
    onGrabImage?.(imageUrl, alt);
  };
  
  return (
    <div className="my-4 flex gap-2 flex-wrap">
      {displayedImages.map((image, idx) => {
        if (hiddenImages.has(idx)) return null;
        
        return (
          <div 
            key={`${image.src}-${idx}`}
            className="relative group rounded-lg overflow-hidden border border-gray-200 dark:border-gray-700 hover:border-blue-500 dark:hover:border-blue-400 transition-colors w-32 h-32"
          >
            <img 
              src={image.src} 
              alt={image.alt || `Search result ${idx + 1}`}
              className="w-full h-full object-cover cursor-pointer"
              loading="lazy"
              onError={() => setHiddenImages(prev => new Set(prev).add(idx))}
              onClick={() => onImageClick?.(image.src)}
            />
            
            {/* Grab button */}
            {onGrabImage && (
              <button
                onClick={(e) => handleGrabClick(e, image.src, image.alt || `Search result ${idx + 1}`)}
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
