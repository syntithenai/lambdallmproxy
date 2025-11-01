import React, { useState, useMemo } from 'react';
import { useSwag } from '../../contexts/SwagContext';
import type { ImageData } from './types';

interface SwagImagePickerProps {
  onSelect: (images: ImageData[]) => void;
  onClose: () => void;
  allowMultiple?: boolean;
}

export const SwagImagePicker: React.FC<SwagImagePickerProps> = ({
  onSelect,
  onClose,
  allowMultiple = true,
}) => {
  const { snippets } = useSwag();
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [searchQuery, setSearchQuery] = useState('');

  // Extract all images from snippets
  const allImages = useMemo(() => {
    const images: ImageData[] = [];
    
    snippets.forEach(snippet => {
      // Extract from HTML img tags
      const htmlRegex = /<img[^>]+src=["']([^"']+)["'][^>]*>/g;
      let match;
      let imageIndex = 0;
      
      while ((match = htmlRegex.exec(snippet.content)) !== null) {
        const url = match[1];
        if (url) {
          images.push({
            id: `${snippet.id}-img-${imageIndex}`,
            url,
            name: snippet.title || 'Untitled',
            snippetId: snippet.id,
            imageIndex,
            tags: snippet.tags || [],
          });
          imageIndex++;
        }
      }
      
      // Extract from markdown syntax
      const markdownRegex = /!\[([^\]]*)\]\(([^)]+)\)/g;
      while ((match = markdownRegex.exec(snippet.content)) !== null) {
        const url = match[2];
        const alt = match[1];
        if (url) {
          images.push({
            id: `${snippet.id}-img-${imageIndex}`,
            url,
            name: alt || snippet.title || 'Untitled',
            snippetId: snippet.id,
            imageIndex,
            tags: snippet.tags || [],
          });
          imageIndex++;
        }
      }
    });
    
    return images;
  }, [snippets]);

  // Filter images by search query
  const filteredImages = useMemo(() => {
    if (!searchQuery.trim()) return allImages;
    
    const query = searchQuery.toLowerCase();
    return allImages.filter(img => 
      img.name.toLowerCase().includes(query) ||
      img.tags.some(tag => tag.toLowerCase().includes(query))
    );
  }, [allImages, searchQuery]);

  const handleToggleImage = (imageId: string) => {
    const newSelection = new Set(selectedIds);
    
    if (newSelection.has(imageId)) {
      newSelection.delete(imageId);
    } else {
      if (!allowMultiple) {
        newSelection.clear();
      }
      newSelection.add(imageId);
    }
    
    setSelectedIds(newSelection);
  };

  const handleSelectAll = () => {
    setSelectedIds(new Set(filteredImages.map(img => img.id)));
  };

  const handleSelectNone = () => {
    setSelectedIds(new Set());
  };

  const handleConfirm = () => {
    const selectedImages = allImages.filter(img => selectedIds.has(img.id));
    onSelect(selectedImages);
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-xl max-w-6xl w-full max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="border-b border-gray-200 p-4">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xl font-bold text-gray-900">Select Images from Swag</h2>
            <button
              onClick={onClose}
              className="text-gray-400 hover:text-gray-600 transition-colors"
            >
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
          
          {/* Search and Controls */}
          <div className="flex gap-3">
            <input
              type="text"
              placeholder="Search images by name or tags..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <button
              onClick={handleSelectAll}
              className="px-3 py-2 text-sm bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors"
            >
              Select All
            </button>
            <button
              onClick={handleSelectNone}
              className="px-3 py-2 text-sm bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors"
            >
              Clear
            </button>
          </div>
          
          {/* Selection Count */}
          <div className="mt-2 text-sm text-gray-600">
            {selectedIds.size} selected · {filteredImages.length} total images
          </div>
        </div>

        {/* Image Grid */}
        <div className="flex-1 overflow-auto p-4">
          {filteredImages.length === 0 ? (
            <div className="text-center py-12 text-gray-500">
              {searchQuery ? 'No images found matching your search' : 'No images found in Swag'}
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
              {filteredImages.map((image) => (
                <div
                  key={image.id}
                  onClick={() => handleToggleImage(image.id)}
                  className={`relative cursor-pointer rounded-lg overflow-hidden border-2 transition-all ${
                    selectedIds.has(image.id)
                      ? 'border-blue-500 ring-2 ring-blue-200'
                      : 'border-gray-200 hover:border-gray-300'
                  }`}
                >
                  {/* Image */}
                  <div className="aspect-square bg-gray-100">
                    <img
                      src={image.url}
                      alt={image.name}
                      className="w-full h-full object-cover"
                      loading="lazy"
                    />
                  </div>
                  
                  {/* Selection Indicator */}
                  {selectedIds.has(image.id) && (
                    <div className="absolute top-2 right-2 w-6 h-6 bg-blue-500 rounded-full flex items-center justify-center">
                      <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                      </svg>
                    </div>
                  )}
                  
                  {/* Image Info */}
                  <div className="p-2 bg-white">
                    <div className="text-xs font-medium text-gray-900 truncate" title={image.name}>
                      {image.name}
                    </div>
                    {image.tags.length > 0 && (
                      <div className="flex gap-1 mt-1 flex-wrap">
                        {image.tags.slice(0, 2).map((tag, idx) => (
                          <span
                            key={idx}
                            className="text-xs px-1.5 py-0.5 bg-gray-100 text-gray-600 rounded"
                          >
                            {tag}
                          </span>
                        ))}
                        {image.tags.length > 2 && (
                          <span className="text-xs text-gray-500">
                            +{image.tags.length - 2}
                          </span>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="border-t border-gray-200 p-4 flex justify-end gap-3">
          <button
            onClick={onClose}
            className="px-4 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleConfirm}
            disabled={selectedIds.size === 0}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors"
          >
            Add {selectedIds.size} Image{selectedIds.size !== 1 ? 's' : ''}
          </button>
        </div>
      </div>
    </div>
  );
};
