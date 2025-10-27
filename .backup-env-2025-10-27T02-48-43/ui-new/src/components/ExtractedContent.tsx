import React from 'react';

interface Link {
  title: string;
  url: string;
  snippet?: string;
  isSearchResult?: boolean;
}

interface Image {
  src: string;
  alt: string;
  source: string;
  placement?: string;
  placementScore?: number;
  relevance?: number;
}

interface Video {
  src: string;
  title: string;
  source: string;
}

interface Media {
  src: string;
  type: string;
  source: string;
}

interface ExtractionMetadata {
  summary?: {
    totalImages: number;
    uniqueImages: number;
    prioritizedImages: number;
    totalLinks: number;
    uniqueLinks: number;
    prioritizedLinks: number;
    youtubeVideos: number;
    otherVideos: number;
  };
  imagePlacement?: Record<string, number>;
  topImages?: Array<{
    rank: number;
    src: string;
    placement: string;
    placementScore: number;
    relevance: number;
    combinedScore: string;
    selectionReason: string;
  }>;
  linkCategories?: {
    searchResults: number;
    scrapedLinks: number;
    prioritizedFromScraped: number;
  };
}

interface ExtractedContentProps {
  extractedContent: {
    prioritizedLinks?: Link[];
    prioritizedImages?: Image[];
    youtubeVideos?: Video[];
    otherVideos?: Video[];
    media?: Media[];
    allLinks?: Link[];
    allImages?: Image[];
    sources?: Link[];
    images?: Image[];
    metadata?: ExtractionMetadata;
  };
}

const ExtractedContent: React.FC<ExtractedContentProps> = ({ extractedContent }) => {
  const [hiddenImages, setHiddenImages] = React.useState<Set<number>>(new Set());

  if (!extractedContent) return null;
  
  // Debug: Log if metadata exists
  React.useEffect(() => {
    console.log('🔍 ExtractedContent received:', {
      hasMetadata: !!extractedContent.metadata,
      metadataKeys: extractedContent.metadata ? Object.keys(extractedContent.metadata) : [],
      hasSummary: !!extractedContent.metadata?.summary,
      hasPlacement: !!extractedContent.metadata?.imagePlacement,
      hasTopImages: !!extractedContent.metadata?.topImages
    });
  }, [extractedContent]);

  const { 
    prioritizedLinks,
    prioritizedImages,
    youtubeVideos,
    otherVideos,
    media,
    allLinks,
    allImages,
    metadata
  } = extractedContent;

  const hasContent = prioritizedLinks || prioritizedImages || youtubeVideos || otherVideos || media || allLinks || allImages || metadata;

  if (!hasContent) return null;

  const handleImageError = (idx: number) => {
    setHiddenImages(prev => new Set(prev).add(idx));
  };

  return (
    <div className="extracted-content" style={{ marginTop: '1.5rem', fontSize: '0.9rem', lineHeight: '1.6' }}>
      {/* Prioritized Links */}
      {prioritizedLinks && prioritizedLinks.length > 0 && (
        <div style={{ 
          marginBottom: '1.5rem',
          padding: '1rem',
          backgroundColor: '#f8f9fa',
          borderRadius: '8px',
          borderLeft: '4px solid #0066cc'
        }}>
          <div style={{ fontWeight: '600', marginBottom: '0.75rem', color: '#333' }}>
            📚 References & Sources
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
            {prioritizedLinks.slice(0, 4).map((link, idx) => (
              <div key={idx} style={{ display: 'flex', alignItems: 'baseline', gap: '0.5rem' }}>
                <span style={{ color: '#666', fontSize: '0.85rem', minWidth: '1.5rem' }}>{idx + 1}.</span>
                <a href={link.url} target="_blank" rel="noopener noreferrer" style={{ color: '#0066cc', textDecoration: 'none', flex: 1 }}>
                  {link.title}
                </a>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Prioritized Images */}
      {prioritizedImages && prioritizedImages.length > 0 && (
        <div style={{ marginBottom: '1.5rem' }}>
          <div style={{ fontWeight: '600', marginBottom: '0.75rem', color: '#333' }}>🖼️ Related Images</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: '1rem' }}>
            {prioritizedImages.filter((_, idx) => !hiddenImages.has(idx)).map((image, idx) => (
              <figure key={idx} style={{ margin: 0 }}>
                <img src={image.src} alt={image.alt} loading="lazy" style={{ width: '100%', height: 'auto', borderRadius: '8px', border: '1px solid #ddd' }} onError={() => handleImageError(idx)} />
                <figcaption style={{ fontSize: '0.8rem', color: '#666', marginTop: '0.5rem' }}>
                  {image.alt} {image.source && <a href={image.source} target="_blank" rel="noopener noreferrer" style={{ color: '#0066cc', fontSize: '0.75rem' }}>(source)</a>}
                </figcaption>
              </figure>
            ))}
          </div>
        </div>
      )}

      {/* YouTube Videos */}
      {youtubeVideos && youtubeVideos.length > 0 && (
        <div style={{ marginBottom: '1.5rem' }}>
          <div style={{ fontWeight: '600', marginBottom: '0.75rem', color: '#333' }}>📺 YouTube Videos ({youtubeVideos.length})</div>
          <div style={{ padding: '0 0.5rem' }}>
            {youtubeVideos.map((video, idx) => (
              <div key={idx} style={{ marginBottom: '0.5rem' }}>
                <span style={{ color: '#666', fontSize: '0.85rem' }}>{idx + 1}. </span>
                <a href={video.src} target="_blank" rel="noopener noreferrer" style={{ color: '#0066cc' }}>{video.title}</a>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Other Videos */}
      {otherVideos && otherVideos.length > 0 && (
        <div style={{ marginBottom: '1.5rem' }}>
          <div style={{ fontWeight: '600', marginBottom: '0.75rem', color: '#333' }}>🎬 Videos ({otherVideos.length})</div>
          <div style={{ padding: '0 0.5rem' }}>
            {otherVideos.map((video, idx) => (
              <div key={idx} style={{ marginBottom: '0.5rem' }}>
                <span style={{ color: '#666', fontSize: '0.85rem' }}>{idx + 1}. </span>
                <a href={video.src} target="_blank" rel="noopener noreferrer" style={{ color: '#0066cc' }}>{video.title}</a>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Media */}
      {media && media.length > 0 && (
        <div style={{ marginBottom: '1.5rem' }}>
          <div style={{ fontWeight: '600', marginBottom: '0.75rem', color: '#333' }}>🎵 Audio & Media ({media.length})</div>
          <div style={{ padding: '0 0.5rem' }}>
            {media.map((item, idx) => (
              <div key={idx} style={{ marginBottom: '0.5rem' }}>
                <span style={{ color: '#666', fontSize: '0.85rem' }}>{idx + 1}. </span>
                <a href={item.src} target="_blank" rel="noopener noreferrer" style={{ color: '#0066cc' }}>{item.type}</a>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* All Images - Always show expandable section with ALL images */}
      {allImages && allImages.length > 0 && (
        <details style={{ marginBottom: '1rem' }}>
          <summary style={{ cursor: 'pointer', fontWeight: '600', padding: '0.75rem', backgroundColor: '#f5f5f5', borderRadius: '8px' }}>
            🖼️ All Images ({allImages.length - hiddenImages.size})
          </summary>
          <div style={{ padding: '1rem', display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: '1rem' }}>
            {allImages.map((image, idx) => (
              <figure key={idx} style={{ margin: 0, display: hiddenImages.has(idx + 100) ? 'none' : 'block' }}>
                <img src={image.src} alt={image.alt} loading="lazy" style={{ width: '100%', height: 'auto', borderRadius: '4px', border: '1px solid #ddd' }} onError={() => handleImageError(idx + 100)} />
                <figcaption style={{ fontSize: '0.75rem', color: '#666', marginTop: '0.25rem' }}>{image.alt}</figcaption>
              </figure>
            ))}
          </div>
        </details>
      )}

      {/* All Links */}
      {allLinks && allLinks.length > (prioritizedLinks?.length || 0) && (
        <details style={{ marginBottom: '1rem' }}>
          <summary style={{ cursor: 'pointer', fontWeight: '600', padding: '0.75rem', backgroundColor: '#f5f5f5', borderRadius: '8px' }}>
            🔗 All Links ({allLinks.length})
          </summary>
          <div style={{ padding: '1rem', paddingLeft: '1.5rem' }}>
            {allLinks.map((link, idx) => (
              <div key={idx} style={{ marginBottom: '0.75rem' }}>
                <div><span style={{ color: '#666', fontSize: '0.85rem' }}>{idx + 1}. </span><a href={link.url} target="_blank" rel="noopener noreferrer" style={{ color: '#0066cc' }}>{link.title}</a></div>
                {link.snippet && <blockquote style={{ margin: '0.25rem 0 0 2rem', padding: '0.25rem 0.5rem', borderLeft: '3px solid #ccc', color: '#666', fontStyle: 'italic', fontSize: '0.8rem' }}>{link.snippet}</blockquote>}
              </div>
            ))}
          </div>
        </details>
      )}
    </div>
  );
};

export default ExtractedContent;
