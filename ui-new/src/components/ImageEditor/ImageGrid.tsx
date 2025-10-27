import React from 'react';
import { ImageCard } from './ImageCard';
import type { ImageData, ProcessingStatus } from './types';

interface ImageGridProps {
  images: ImageData[];
  selectedImages: Set<string>;
  onToggleSelection: (imageId: string) => void;
  processingStatus: Map<string, ProcessingStatus>;
  newlyGeneratedIds?: Set<string>;
}

export const ImageGrid: React.FC<ImageGridProps> = ({
  images,
  selectedImages,
  onToggleSelection,
  processingStatus,
  newlyGeneratedIds = new Set(),
}) => {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 p-4">
      {images.map((image) => (
        <ImageCard
          key={image.id}
          image={image}
          isSelected={selectedImages.has(image.id)}
          onToggleSelection={() => onToggleSelection(image.id)}
          processingStatus={processingStatus.get(image.id)}
          isNew={newlyGeneratedIds.has(image.id)}
        />
      ))}
      {images.length === 0 && (
        <div className="col-span-full text-center py-12 text-gray-500">
          <p className="text-lg">No images to display</p>
          <p className="text-sm">Navigate from the Swag page to edit images</p>
        </div>
      )}
    </div>
  );
};
