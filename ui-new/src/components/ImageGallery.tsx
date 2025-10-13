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
  const [displayedImages, setDisplayedImages] = useState<string[]>(() => images.slice(0, maxDisplay));
  const [nextImageIndex, setNextImageIndex] = useState(maxDisplay);
  const [loadedImages, setLoadedImages] = useState<Set<number>>(new Set());
  
  if (!images || images.length === 0) return null;
  
  const handleImageLoad = (idx: number) => {
    setLoadedImages(prev => new Set(prev).add(idx));
  };
  
  const handleImageError = (idx: number) => {
    console.warn('Image failed to load:', displayedImages[idx]);
    // Hide the failed image
    setHiddenImages(prev => new Set(prev).add(idx));
    
    // Replace with next available image if we have more
    if (nextImageIndex < images.length) {
      setDisplayedImages(prev => {
        const newImages = [...prev];
        newImages[idx] = images[nextImageIndex];
        return newImages;
      });
      setNextImageIndex(prev => prev + 1);
      // Reset loaded state for the new image
      setLoadedImages(prev => {
        const newSet = new Set(prev);
        newSet.delete(idx);
        return newSet;
      });
    } else {
      // No more images to replace with, just remove it
      setDisplayedImages(prev => prev.filter((_, i) => i !== idx));
    }
  };
  
  const handleGrabClick = (e: React.MouseEvent, imageUrl: string) => {
    e.stopPropagation();
    onGrabImage?.(imageUrl);
  };
  
  // Filter out hidden images
  const visibleImages = displayedImages.filter((_, idx) => !hiddenImages.has(idx));
  
  if (visibleImages.length === 0) return null;
  
  return (
    <div className="my-4 flex gap-2 flex-wrap">
      {displayedImages.map((imageUrl, idx) => {
        if (hiddenImages.has(idx)) return null;
        
        const isLoaded = loadedImages.has(idx);
        
        return (
          <div 
            key={`${imageUrl}-${idx}`}
            className="relative group rounded-lg overflow-hidden border border-gray-200 dark:border-gray-700 hover:border-blue-500 dark:hover:border-blue-400 transition-colors bg-gray-100 dark:bg-gray-800"
          >
            {/* Loading skeleton */}
            {!isLoaded && (
              <div className="absolute inset-0 flex items-center justify-center">
                <div className="w-8 h-8 border-4 border-gray-300 dark:border-gray-600 border-t-blue-500 rounded-full animate-spin" />
              </div>
            )}
            
            <img 
              src={imageUrl} 
              alt={`Search result ${idx + 1}`}
              className={`w-32 h-32 object-cover cursor-pointer transition-opacity ${isLoaded ? 'opacity-100' : 'opacity-0'}`}
              loading="eager"
              onLoad={() => handleImageLoad(idx)}
              onError={() => handleImageError(idx)}
              onClick={() => onImageClick?.(imageUrl)}
            />
            
            {/* Hover overlay - only show when image is loaded */}
            {isLoaded && (
              <div className="absolute inset-0 bg-black bg-opacity-0 group-hover:bg-opacity-20 transition-opacity pointer-events-none" />
            )}
            
            {/* Grab button - only show when image is loaded */}
            {onGrabImage && isLoaded && (
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
