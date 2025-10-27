import React, { useState, useMemo } from 'react';
import { useSwag } from '../contexts/SwagContext';

interface ImagePickerProps {
  onSelectImage: (imageUrl: string, altText: string) => void;
  onClose: () => void;
}

interface ExtractedImage {
  url: string;
  alt: string;
  snippetId: string;
  snippetTitle?: string;
}

export const ImagePicker: React.FC<ImagePickerProps> = ({ onSelectImage, onClose }) => {
  const { snippets } = useSwag();
  const [searchTerm, setSearchTerm] = useState('');

  // Extract all images from snippets
  const allImages = useMemo(() => {
    const images: ExtractedImage[] = [];
    
    snippets.forEach(snippet => {
      // Extract markdown images: ![alt](url)
      const markdownImageRegex = /!\[([^\]]*)\]\(([^)]+)\)/g;
      let markdownMatch;
      while ((markdownMatch = markdownImageRegex.exec(snippet.content)) !== null) {
        images.push({
          url: markdownMatch[2],
          alt: markdownMatch[1] || 'Image',
          snippetId: snippet.id,
          snippetTitle: snippet.title
        });
      }

      // Extract HTML images: <img src="url" alt="alt">
      const htmlImageRegex = /<img[^>]+src="([^"]+)"[^>]*alt="([^"]*)"[^>]*>/gi;
      let htmlMatch;
      while ((htmlMatch = htmlImageRegex.exec(snippet.content)) !== null) {
        images.push({
          url: htmlMatch[1],
          alt: htmlMatch[2] || 'Image',
          snippetId: snippet.id,
          snippetTitle: snippet.title
        });
      }

      // Extract HTML images without alt: <img src="url">
      const htmlImageNoAltRegex = /<img[^>]+src="([^"]+)"(?![^>]*alt=)[^>]*>/gi;
      let htmlNoAltMatch: RegExpExecArray | null;
      while ((htmlNoAltMatch = htmlImageNoAltRegex.exec(snippet.content)) !== null) {
        // Check if we haven't already added this image
        const exists = images.some(img => img.url === htmlNoAltMatch![1] && img.snippetId === snippet.id);
        if (!exists) {
          images.push({
            url: htmlNoAltMatch[1],
            alt: 'Image',
            snippetId: snippet.id,
            snippetTitle: snippet.title
          });
        }
      }
    });

    return images;
  }, [snippets]);

  // Filter images based on search term
  const filteredImages = useMemo(() => {
    if (!searchTerm.trim()) return allImages;
    
    const term = searchTerm.toLowerCase();
    return allImages.filter(img => 
      img.alt.toLowerCase().includes(term) ||
      img.url.toLowerCase().includes(term) ||
      img.snippetTitle?.toLowerCase().includes(term)
    );
  }, [allImages, searchTerm]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50 backdrop-blur-sm">
      <div className="bg-white rounded-lg shadow-2xl max-w-4xl w-full mx-4 max-h-[80vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-gray-200">
          <h2 className="text-xl font-bold text-gray-900">Select Image from Swag</h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 transition-colors"
            aria-label="Close"
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Search */}
        <div className="p-4 border-b border-gray-200">
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Search by alt text, URL, or snippet title..."
            className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          />
        </div>

        {/* Image Grid */}
        <div className="flex-1 overflow-auto p-4">
          {filteredImages.length === 0 ? (
            <div className="text-center py-12 text-gray-500">
              {searchTerm ? 'No images found matching your search' : 'No images found in Swag'}
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
              {filteredImages.map((image, index) => (
                <button
                  key={`${image.snippetId}-${index}`}
                  onClick={() => onSelectImage(image.url, image.alt)}
                  className="group relative aspect-square rounded-lg overflow-hidden border-2 border-gray-200 hover:border-blue-500 transition-all focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <img
                    src={image.url}
                    alt={image.alt}
                    className="w-full h-full object-cover"
                    onError={(e) => {
                      // Fallback for broken images
                      const target = e.target as HTMLImageElement;
                      target.src = 'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" width="100" height="100"%3E%3Crect fill="%23ddd" width="100" height="100"/%3E%3Ctext fill="%23999" x="50%25" y="50%25" dominant-baseline="middle" text-anchor="middle"%3ENo Image%3C/text%3E%3C/svg%3E';
                    }}
                  />
                  <div className="absolute inset-0 bg-black bg-opacity-0 group-hover:bg-opacity-40 transition-opacity flex items-center justify-center">
                    <svg
                      className="w-8 h-8 text-white opacity-0 group-hover:opacity-100 transition-opacity"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                  </div>
                  {/* Image info tooltip */}
                  <div className="absolute bottom-0 left-0 right-0 bg-black bg-opacity-70 text-white text-xs p-2 opacity-0 group-hover:opacity-100 transition-opacity">
                    <div className="truncate font-medium">{image.alt}</div>
                    {image.snippetTitle && (
                      <div className="truncate text-gray-300">From: {image.snippetTitle}</div>
                    )}
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-gray-200 bg-gray-50">
          <div className="text-sm text-gray-600">
            {filteredImages.length} image{filteredImages.length !== 1 ? 's' : ''} available
            {searchTerm && ` (filtered from ${allImages.length})`}
          </div>
        </div>
      </div>
    </div>
  );
};
