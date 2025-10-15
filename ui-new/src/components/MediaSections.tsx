import React, { useState } from 'react';

interface MediaSectionsProps {
  images?: string[];
  links?: Array<{ url: string; title?: string }>;
  youtubeLinks?: Array<{ url: string; title?: string }>;
  otherMedia?: Array<{ url: string; type: string }>;
  onGrabImage?: (url: string) => void;
}

export const MediaSections: React.FC<MediaSectionsProps> = ({
  images = [],
  links = [],
  youtubeLinks = [],
  otherMedia = [],
  onGrabImage
}) => {
  const [expandedSection, setExpandedSection] = useState<string | null>(null);
  const [hiddenImages, setHiddenImages] = useState<Set<number>>(new Set());
  
  const toggleSection = (section: string) => {
    setExpandedSection(expandedSection === section ? null : section);
  };
  
  const hasAnyContent = images.length > 0 || links.length > 0 || youtubeLinks.length > 0 || otherMedia.length > 0;
  
  if (!hasAnyContent) return null;
  
  return (
    <div className="mt-4 border-t border-gray-200 dark:border-gray-700 pt-4 space-y-2">
      <div className="text-sm font-medium text-gray-600 dark:text-gray-400 mb-2">
        📎 Extracted Content
      </div>
      
      {/* All Images Section */}
      {images.length > 0 && (
        <div className="border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden">
          <button
            onClick={() => toggleSection('images')}
            className="w-full px-3 py-2 bg-gray-50 dark:bg-gray-800 hover:bg-gray-100 dark:hover:bg-gray-700 flex items-center justify-between text-sm transition-colors"
          >
            <span className="font-medium text-gray-700 dark:text-gray-300">
              🖼️ All Images ({images.length - hiddenImages.size})
            </span>
            <svg
              className={`w-4 h-4 transform transition-transform ${expandedSection === 'images' ? 'rotate-180' : ''}`}
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </button>
          {expandedSection === 'images' && (
            <div className="p-3 grid grid-cols-4 gap-2">
              {images.map((img, idx) => {
                if (hiddenImages.has(idx)) return null;
                
                return (
                  <div 
                    key={idx}
                    className="relative group rounded overflow-hidden border border-gray-200 dark:border-gray-700 hover:border-blue-500 dark:hover:border-blue-400 h-24"
                  >
                    <a 
                      href={img}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="block w-full h-full"
                    >
                      <img 
                        src={img} 
                        alt={`Image ${idx + 1}`}
                        className="w-full h-full object-cover"
                        loading="lazy"
                        onError={() => setHiddenImages(prev => new Set(prev).add(idx))}
                      />
                    </a>
                    {onGrabImage && (
                      <button
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          onGrabImage(img);
                        }}
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
          )}
        </div>
      )}
      
      {/* All Links Section */}
      {links.length > 0 && (
        <div className="border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden">
          <button
            onClick={() => toggleSection('links')}
            className="w-full px-3 py-2 bg-gray-50 dark:bg-gray-800 hover:bg-gray-100 dark:hover:bg-gray-700 flex items-center justify-between text-sm transition-colors"
          >
            <span className="font-medium text-gray-700 dark:text-gray-300">
              🔗 All Links ({links.length})
            </span>
            <svg
              className={`w-4 h-4 transform transition-transform ${expandedSection === 'links' ? 'rotate-180' : ''}`}
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </button>
          {expandedSection === 'links' && (
            <div className="p-3 space-y-1 max-h-64 overflow-y-auto">
              {links.map((link, idx) => (
                <a
                  key={idx}
                  href={link.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="block px-2 py-1 text-xs text-blue-600 dark:text-blue-400 hover:underline truncate"
                  title={link.title || link.url}
                >
                  {link.title || link.url}
                </a>
              ))}
            </div>
          )}
        </div>
      )}
      
      {/* YouTube Links Section */}
      {youtubeLinks.length > 0 && (
        <div className="border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden">
          <button
            onClick={() => toggleSection('youtube')}
            className="w-full px-3 py-2 bg-gray-50 dark:bg-gray-800 hover:bg-gray-100 dark:hover:bg-gray-700 flex items-center justify-between text-sm transition-colors"
          >
            <span className="font-medium text-gray-700 dark:text-gray-300">
              🎥 YouTube Links ({youtubeLinks.length})
            </span>
            <svg
              className={`w-4 h-4 transform transition-transform ${expandedSection === 'youtube' ? 'rotate-180' : ''}`}
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </button>
          {expandedSection === 'youtube' && (
            <div className="p-3 space-y-2">
              {youtubeLinks.map((link, idx) => (
                <a
                  key={idx}
                  href={link.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="block px-2 py-2 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded hover:bg-red-100 dark:hover:bg-red-900/30 transition-colors"
                >
                  <div className="text-xs font-medium text-red-700 dark:text-red-300 truncate">
                    {link.title || 'YouTube Video'}
                  </div>
                  <div className="text-xs text-red-600 dark:text-red-400 truncate opacity-75">
                    {link.url}
                  </div>
                </a>
              ))}
            </div>
          )}
        </div>
      )}
      
      {/* Other Media Section */}
      {otherMedia.length > 0 && (
        <div className="border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden">
          <button
            onClick={() => toggleSection('media')}
            className="w-full px-3 py-2 bg-gray-50 dark:bg-gray-800 hover:bg-gray-100 dark:hover:bg-gray-700 flex items-center justify-between text-sm transition-colors"
          >
            <span className="font-medium text-gray-700 dark:text-gray-300">
              📁 Other Media ({otherMedia.length})
            </span>
            <svg
              className={`w-4 h-4 transform transition-transform ${expandedSection === 'media' ? 'rotate-180' : ''}`}
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </button>
          {expandedSection === 'media' && (
            <div className="p-3 space-y-1 max-h-64 overflow-y-auto">
              {otherMedia.map((media, idx) => (
                <a
                  key={idx}
                  href={media.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="block px-2 py-1 text-xs hover:underline"
                >
                  <span className="text-gray-500 dark:text-gray-400">[{media.type}]</span>{' '}
                  <span className="text-blue-600 dark:text-blue-400">{media.url}</span>
                </a>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
};
