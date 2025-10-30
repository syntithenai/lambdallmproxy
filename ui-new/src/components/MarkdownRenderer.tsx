/**
 * Markdown Renderer Component
 * Renders markdown content with syntax highlighting and proper styling
 */

import { useState, useRef } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeRaw from 'rehype-raw';
import rehypeSanitize, { defaultSchema } from 'rehype-sanitize';
import rehypeHighlight from 'rehype-highlight';
import 'highlight.js/styles/github-dark.css';
import { MermaidChart } from './MermaidChart';
import { usePlaylist } from '../contexts/PlaylistContext';

// Custom sanitization schema that allows safe HTML elements
const sanitizeSchema = {
  ...defaultSchema,
  attributes: {
    ...defaultSchema.attributes,
    // Allow common safe attributes
    '*': ['className', 'style', 'id'],
    a: ['href', 'title', 'target', 'rel'],
    img: ['src', 'alt', 'title', 'width', 'height'],
    table: ['className'],
    td: ['align', 'colspan', 'rowspan'],
    th: ['align', 'colspan', 'rowspan'],
  },
  tagNames: [
    ...(defaultSchema.tagNames || []),
    // Ensure table elements are allowed
    'table', 'thead', 'tbody', 'tr', 'th', 'td', 'tfoot',
    // Allow other common HTML elements
    'div', 'span', 'br', 'hr',
  ],
};

interface MarkdownRendererProps {
  content: string;
  className?: string;
  chartDescription?: string; // Description to pass to Mermaid charts
  onLlmApiCall?: (apiCall: {
    model: string;
    provider: string;
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
    cost: number;
    duration_ms: number;
    purpose: string;
  }) => void;
  snippetId?: string; // Optional snippet ID for image editing
  snippetTags?: string[]; // Optional snippet tags for image editing
  onImageEdit?: (imageData: {
    id: string;
    url: string;
    name: string;
    tags: string[];
    snippetId?: string;
    width?: number;
    height?: number;
    format?: string;
    size?: number;
  }) => void; // Callback when user clicks edit on an image
}

interface ImageGalleryProps {
  images: Array<{ src: string; alt: string }>;
}

// Helper function to extract YouTube video ID from URL
function extractYouTubeId(url: string): string | null {
  const patterns = [
    /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([^&\n?#]+)/,
    /youtube\.com\/shorts\/([^&\n?#]+)/
  ];
  
  for (const pattern of patterns) {
    const match = url.match(pattern);
    if (match && match[1]) {
      return match[1];
    }
  }
  return null;
}

// Component for YouTube links with play button
interface YouTubeLinkProps {
  href: string;
  children: React.ReactNode;
}

function YouTubeLink({ href, children }: YouTubeLinkProps) {
  const { addTracksToStart, playTrack } = usePlaylist();
  const videoId = extractYouTubeId(href);
  
  const handlePlay = (e: React.MouseEvent) => {
    e.preventDefault();
    if (videoId) {
      // Extract title from children if it's a string
      const title = typeof children === 'string' ? children : `YouTube Video ${videoId}`;
      
      // Add track to playlist start (addTracksToStart will move existing or add new)
      addTracksToStart([{
        videoId,
        title: title,
        url: href
      }]);
      
      // Play index 0 since addTracksToStart places the track at the start
      // Use setTimeout to ensure state update has been processed
      setTimeout(() => {
        playTrack(0);
      }, 0);
    }
  };
  
  return (
    <span className="inline-flex items-center gap-2">
      <a
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        className="text-blue-600 dark:text-blue-400 hover:underline"
      >
        {children}
      </a>
      <button
        onClick={handlePlay}
        className="inline-flex items-center gap-1 px-2 py-1 text-xs font-medium text-white bg-green-600 hover:bg-green-700 rounded transition-colors"
        title="Play now"
      >
        <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 24 24">
          <path d="M8 5v14l11-7z"/>
        </svg>
        Play
      </button>
    </span>
  );
}

function ImageGallery({ images }: ImageGalleryProps) {
  const [expandedImage, setExpandedImage] = useState<string | null>(null);

  return (
    <>
      <div className="image-gallery grid grid-cols-2 md:grid-cols-4 gap-4 my-6">
        {images.map((img, idx) => (
          <div
            key={idx}
            className="gallery-item cursor-pointer overflow-hidden rounded-lg border border-gray-200 dark:border-gray-700 hover:border-blue-500 dark:hover:border-blue-400 transition-all hover:shadow-lg"
            onClick={() => setExpandedImage(img.src)}
          >
            <img
              src={img.src}
              alt={img.alt}
              className="w-full h-48 object-cover hover:scale-105 transition-transform"
              loading="lazy"
            />
            {img.alt && (
              <div className="p-2 text-xs text-gray-600 dark:text-gray-400 bg-gray-50 dark:bg-gray-800 truncate">
                {img.alt}
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Expanded Image Modal */}
      {expandedImage && (
        <div
          className="fixed inset-0 bg-black bg-opacity-90 z-50 flex items-center justify-center p-4"
          onClick={() => setExpandedImage(null)}
        >
          <button
            className="absolute top-4 right-4 text-white text-4xl font-bold hover:text-gray-300"
            onClick={() => setExpandedImage(null)}
            aria-label="Close"
          >
            ×
          </button>
          <img
            src={expandedImage}
            alt="Expanded view"
            className="max-w-full max-h-full object-contain"
            onClick={(e) => e.stopPropagation()}
          />
        </div>
      )}
    </>
  );
}

export function MarkdownRenderer({ content, className = '', chartDescription, onLlmApiCall, snippetId, snippetTags = [], onImageEdit }: MarkdownRendererProps) {
  const imageCounterRef = useRef(0);
  // Special handling for pure HTML img tags with data URLs
  // This is for chart images saved from the Grab button
  const isHtmlImage = /^<img\s+[^>]*src="data:image\/[^"]+"/i.test(content.trim());
  
  if (isHtmlImage) {
    // Render HTML directly using dangerouslySetInnerHTML for data URL images
    return (
      <div 
        className={`markdown-content ${className}`}
        dangerouslySetInnerHTML={{ __html: content }}
      />
    );
  }
  
  // Pre-process content to convert HTML code blocks containing tables into actual HTML
  // This handles when LLM wraps HTML tables in ```html code blocks
  let processedContent = content.replace(/```html\n([\s\S]*?)\n```/g, (match, htmlCode) => {
    // Only convert if it contains table elements (to avoid rendering arbitrary HTML)
    if (htmlCode.includes('<table')) {
      // Add styling classes to table elements
      const styledHtml = htmlCode
        .replace(/<table/g, '<table class="min-w-full divide-y divide-gray-300 dark:divide-gray-700 border border-gray-300 dark:border-gray-700 my-4"')
        .replace(/<th/g, '<th class="px-4 py-2 bg-gray-100 dark:bg-gray-800 font-semibold text-left border border-gray-300 dark:border-gray-700"')
        .replace(/<td/g, '<td class="px-4 py-2 border border-gray-300 dark:border-gray-700"');
      // Return the HTML directly (will be processed by rehypeRaw and rehypeSanitize)
      return `\n\n${styledHtml}\n\n`;
    }
    // If it's not a table, keep it as a code block
    return match;
  });
  
  // Detect and extract image gallery
  const galleryRegex = /<!-- GALLERY_START -->([\s\S]*?)<!-- GALLERY_END -->/g;
  const galleryMatch = galleryRegex.exec(processedContent);
  
  let mainContent = processedContent;
  let galleryImages: Array<{ src: string; alt: string }> = [];
  
  if (galleryMatch) {
    // Extract images from gallery section
    const galleryContent = galleryMatch[1];
    const imgRegex = /!\[(.*?)\]\((.*?)\)/g;
    let imgMatch;
    
    while ((imgMatch = imgRegex.exec(galleryContent)) !== null) {
      galleryImages.push({
        alt: imgMatch[1],
        src: imgMatch[2]
      });
    }
    
    // Remove gallery section from main content
    mainContent = content.replace(galleryRegex, '').trim();
  }
  
  return (
    <div className={`markdown-content ${className}`}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        rehypePlugins={[
          rehypeRaw, // Allow HTML in markdown
          [rehypeSanitize, sanitizeSchema], // Sanitize to prevent XSS attacks
          rehypeHighlight // Syntax highlighting for code blocks
        ]}
        components={{
          // Headings
          h1: ({ children }) => (
            <h1 className="text-2xl font-bold mt-6 mb-4 text-gray-900 dark:text-gray-100">
              {children}
            </h1>
          ),
          h2: ({ children }) => (
            <h2 className="text-xl font-bold mt-5 mb-3 text-gray-900 dark:text-gray-100">
              {children}
            </h2>
          ),
          h3: ({ children }) => (
            <h3 className="text-lg font-semibold mt-4 mb-2 text-gray-900 dark:text-gray-100">
              {children}
            </h3>
          ),
          h4: ({ children }) => (
            <h4 className="text-base font-semibold mt-3 mb-2 text-gray-900 dark:text-gray-100">
              {children}
            </h4>
          ),
          
          // Paragraphs
          p: ({ children }) => (
            <p className="mb-4 leading-relaxed text-gray-800 dark:text-gray-200">
              {children}
            </p>
          ),
          
          // Lists
          ul: ({ children }) => (
            <ul className="list-disc list-inside mb-4 space-y-1 text-gray-800 dark:text-gray-200">
              {children}
            </ul>
          ),
          ol: ({ children }) => (
            <ol className="list-decimal list-inside mb-4 space-y-1 text-gray-800 dark:text-gray-200">
              {children}
            </ol>
          ),
          li: ({ children }) => (
            <li className="ml-4">
              {children}
            </li>
          ),
          
          // Code
          code: ({ className, children, ...props }) => {
            const isInline = !className;
            
            // Check if this is a mermaid chart
            const match = /language-(\w+)/.exec(className || '');
            const language = match ? match[1] : '';
            
            if (language === 'mermaid' && !isInline) {
              const chartCode = String(children).replace(/\n$/, '');
              // Extract chart type from the first line
              const firstLine = chartCode.split('\n')[0].trim();
              const defaultDescription = chartDescription || `${firstLine} diagram`;
              return <MermaidChart chart={chartCode} description={defaultDescription} onLlmApiCall={onLlmApiCall} />;
            }
            
            // DON'T render HTML here - let it pass through as code
            // We'll handle it at the pre-processing stage instead
            
            if (isInline) {
              return (
                <code 
                  className="px-1.5 py-0.5 rounded bg-gray-100 dark:bg-gray-800 text-pink-600 dark:text-pink-400 text-sm font-mono"
                  {...props}
                >
                  {children}
                </code>
              );
            }
            return (
              <code 
                className={`${className} text-sm`}
                {...props}
              >
                {children}
              </code>
            );
          },
          pre: ({ children }) => {
            // Check if the child is a mermaid chart
            const childElement = children as any;
            if (childElement?.props?.className?.includes('language-mermaid')) {
              // Return the MermaidChart directly, not wrapped in <pre>
              return children;
            }
            return (
              <pre className="mb-4 p-4 rounded-lg bg-gray-900 dark:bg-gray-950 overflow-x-auto">
                {children}
              </pre>
            );
          },
          
          // Links
          a: ({ href, children }) => {
            // Check if this is a YouTube link
            const isYouTube = href && (
              href.includes('youtube.com/watch') ||
              href.includes('youtu.be/') ||
              href.includes('youtube.com/embed/') ||
              href.includes('youtube.com/shorts/')
            );
            
            if (isYouTube && href) {
              return <YouTubeLink href={href}>{children}</YouTubeLink>;
            }
            
            return (
              <a
                href={href}
                target="_blank"
                rel="noopener noreferrer"
                className="text-blue-600 dark:text-blue-400 hover:underline"
              >
                {children}
              </a>
            );
          },
          
          // Blockquotes
          blockquote: ({ children }) => (
            <blockquote className="border-l-4 border-gray-300 dark:border-gray-600 pl-4 italic my-4 text-gray-700 dark:text-gray-300">
              {children}
            </blockquote>
          ),
          
          // Tables
          table: ({ children }) => (
            <div className="overflow-x-auto mb-4">
              <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
                {children}
              </table>
            </div>
          ),
          thead: ({ children }) => (
            <thead className="bg-gray-50 dark:bg-gray-800">
              {children}
            </thead>
          ),
          tbody: ({ children }) => (
            <tbody className="bg-white dark:bg-gray-900 divide-y divide-gray-200 dark:divide-gray-700">
              {children}
            </tbody>
          ),
          tr: ({ children }) => (
            <tr>{children}</tr>
          ),
          th: ({ children }) => (
            <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
              {children}
            </th>
          ),
          td: ({ children }) => (
            <td className="px-4 py-2 text-sm text-gray-800 dark:text-gray-200">
              {children}
            </td>
          ),
          
          // Horizontal rule
          hr: () => (
            <hr className="my-6 border-gray-300 dark:border-gray-700" />
          ),
          
          // Strong and emphasis
          strong: ({ children }) => (
            <strong className="font-bold text-gray-900 dark:text-gray-100">
              {children}
            </strong>
          ),
          em: ({ children }) => (
            <em className="italic text-gray-800 dark:text-gray-200">
              {children}
            </em>
          ),
          
          // Images - render with proper styling, handle data URLs explicitly
          img: ({ src, alt }) => {
            // Ensure src is a string and not empty
            const imgSrc = typeof src === 'string' && src.trim() !== '' ? src : null;
            
            // Don't render if no valid src
            if (!imgSrc) {
              return null;
            }
            
            // Use ref to track counter without causing re-renders
            const currentCounter = imageCounterRef.current++;
            const imageId = snippetId ? `${snippetId}-img-${currentCounter}` : `img-${currentCounter}`;
            
            // Extract format from URL or data URL
            const getFormat = (url: string): string => {
              if (url.startsWith('data:image/')) {
                const match = url.match(/^data:image\/([^;,]+)/);
                return match ? match[1].toUpperCase() : 'Unknown';
              }
              const ext = url.split('.').pop()?.toLowerCase();
              if (ext === 'jpg' || ext === 'jpeg') return 'JPG';
              if (ext === 'png') return 'PNG';
              if (ext === 'gif') return 'GIF';
              if (ext === 'webp') return 'WebP';
              if (ext === 'svg') return 'SVG';
              return 'Unknown';
            };
            
            const handleEditClick = (e: React.MouseEvent) => {
              e.preventDefault();
              e.stopPropagation();
              
              if (onImageEdit) {
                onImageEdit({
                  id: imageId,
                  url: imgSrc,
                  name: alt || `Image ${currentCounter + 1}`,
                  tags: snippetTags,
                  snippetId: snippetId,
                  format: getFormat(imgSrc),
                });
              }
            };
            
            // If edit button is enabled (onImageEdit provided), wrap in container with overlay
            if (onImageEdit) {
              return (
                <span className="relative inline-block group my-4">
                  <img
                    src={imgSrc}
                    alt={alt || ''}
                    className="max-w-full h-auto rounded-lg border border-gray-200 dark:border-gray-700"
                    loading="lazy"
                    onError={(e) => {
                      console.error('Image failed to load:', { src: imgSrc, alt });
                      (e.target as HTMLImageElement).style.display = 'none';
                    }}
                  />
                  {/* Edit button overlay */}
                  <button
                    onClick={handleEditClick}
                    className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity bg-orange-600 hover:bg-orange-700 text-white rounded-full p-2 shadow-lg"
                    title="Edit image"
                    aria-label="Edit image"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                    </svg>
                  </button>
                </span>
              );
            }
            
            // Default rendering without edit button
            return (
              <img
                src={imgSrc}
                alt={alt || ''}
                className="max-w-full h-auto rounded-lg my-4 border border-gray-200 dark:border-gray-700"
                loading="lazy"
                onError={(e) => {
                  // Log error for debugging
                  console.error('Image failed to load:', { src: imgSrc, alt });
                  // Optionally add a fallback
                  (e.target as HTMLImageElement).style.display = 'none';
                }}
              />
            );
          },
        }}
      >
        {mainContent}
      </ReactMarkdown>
      
      {/* Render image gallery if present */}
      {galleryImages.length > 0 && <ImageGallery images={galleryImages} />}
    </div>
  );
}
