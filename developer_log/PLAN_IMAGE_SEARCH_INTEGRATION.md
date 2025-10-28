# Plan: Image Search Integration for Feed Items

**Date**: 2025-10-28  
**Status**: 📋 PLANNING  
**Priority**: HIGH (High value, low complexity)  
**Estimated Implementation Time**: 8 hours

## Executive Summary

Enhance feed items with relevant, high-quality images from external image search APIs (Unsplash and Pexels) instead of placeholder images. This will significantly improve the visual appeal of the feed and user engagement.

## Current State Analysis

### Existing Image Handling

**Feed Generation** (`src/endpoints/feed.js`):
- Each feed item includes `imageSearchTerms` field
- Terms are generated from item content/title
- Example: "machine learning" → `imageSearchTerms: ["machine learning", "artificial intelligence"]`

**Frontend Display** (`ui-new/src/components/FeedItem.tsx`):
- Uses placeholder images or no images
- No integration with external image APIs
- Missing visual appeal

**Image Proxy** (`src/tools/image-proxy.js`):
- Can download and convert external images to base64
- Handles CORS issues
- Ready for integration with image APIs

**Limitations**:
- ❌ No actual images displayed in feed
- ❌ Poor visual engagement
- ❌ Missing context for feed items
- ❌ Placeholder images look unprofessional

## Requirements

### Functional Requirements

1. **Automatic Image Search**:
   - Search for images based on `imageSearchTerms`
   - Fetch 1-3 images per feed item
   - Handle search failures gracefully (fallback to placeholder)

2. **Multi-Provider Support**:
   - Primary: Unsplash API (50 req/hour free tier)
   - Secondary: Pexels API (200 req/hour free tier)
   - Round-robin or failover between providers

3. **Image Caching**:
   - Cache search results for 1 hour (in-memory)
   - Cache popular search terms longer (24 hours)
   - Reduce API calls for repeated searches

4. **Image Optimization**:
   - Serve thumbnail size for feed grid (400x300)
   - Serve full size for expanded view
   - Lazy load images (only when visible)

5. **Attribution & Licensing**:
   - Display photographer credit (required by Unsplash)
   - Link to original photo page
   - Comply with API terms of service

### Non-Functional Requirements

1. **Performance**:
   - Image search latency < 500ms (P95)
   - Feed generation time increase < 200ms
   - Images load progressively (don't block feed)

2. **Reliability**:
   - Graceful degradation on API failures
   - Fallback to placeholder images
   - No feed generation failures due to images

3. **Cost**:
   - Stay within free tier limits (50-200 req/hour)
   - Monitor usage to avoid quota exhaustion
   - Implement rate limiting and backoff

## Provider Comparison

### Unsplash API

**Pros**:
- ✅ High-quality curated photos
- ✅ Free tier: 50 requests/hour (1,200/day)
- ✅ Simple REST API
- ✅ No attribution required in many cases
- ✅ Excellent search relevance
- ✅ Multiple image sizes provided

**Cons**:
- ❌ Lower rate limit (50/hour)
- ❌ Requires API key registration
- ❌ Commercial use has restrictions

**API Example**:
```javascript
GET https://api.unsplash.com/search/photos?query=machine+learning&per_page=3
Headers:
  Authorization: Client-ID YOUR_ACCESS_KEY

Response:
{
  "results": [
    {
      "id": "abc123",
      "urls": {
        "raw": "https://images.unsplash.com/photo-123?raw",
        "full": "https://images.unsplash.com/photo-123?w=1920",
        "regular": "https://images.unsplash.com/photo-123?w=1080",
        "small": "https://images.unsplash.com/photo-123?w=400",
        "thumb": "https://images.unsplash.com/photo-123?w=200"
      },
      "user": {
        "name": "John Doe",
        "username": "johndoe",
        "links": { "html": "https://unsplash.com/@johndoe" }
      },
      "description": "Machine learning concept"
    }
  ]
}
```

**Pricing**:
- Free: 50 requests/hour
- Production: $99/month (5,000 requests/hour)

### Pexels API

**Pros**:
- ✅ Free tier: 200 requests/hour (4,800/day)
- ✅ Higher rate limit than Unsplash
- ✅ Good quality stock photos
- ✅ Simple API
- ✅ No API key registration (just attribution)

**Cons**:
- ❌ Requires attribution on every photo
- ❌ Slightly less curated than Unsplash
- ❌ Search relevance varies

**API Example**:
```javascript
GET https://api.pexels.com/v1/search?query=machine+learning&per_page=3
Headers:
  Authorization: YOUR_API_KEY

Response:
{
  "photos": [
    {
      "id": 456789,
      "src": {
        "original": "https://images.pexels.com/photos/456789/original.jpg",
        "large2x": "https://images.pexels.com/photos/456789/large2x.jpg",
        "large": "https://images.pexels.com/photos/456789/large.jpg",
        "medium": "https://images.pexels.com/photos/456789/medium.jpg",
        "small": "https://images.pexels.com/photos/456789/small.jpg",
        "tiny": "https://images.pexels.com/photos/456789/tiny.jpg"
      },
      "photographer": "Jane Smith",
      "photographer_url": "https://www.pexels.com/@janesmith",
      "alt": "Machine learning visualization"
    }
  ]
}
```

**Pricing**:
- Free: 200 requests/hour (unlimited)

### Recommendation

**Primary**: Pexels (higher free tier rate limit)  
**Secondary**: Unsplash (better quality, fallback)  
**Strategy**: Round-robin between both providers to maximize free tier usage

## Architecture

### Image Search Service

**File**: `src/services/image-search.js`

```javascript
const fetch = require('node-fetch');

// In-memory cache (1 hour TTL)
const imageCache = new Map();
const CACHE_TTL = 60 * 60 * 1000; // 1 hour

// Provider rotation (round-robin)
let currentProvider = 'pexels'; // Start with higher rate limit

// Rate limiting (simple counter)
const rateLimits = {
  unsplash: { count: 0, resetTime: Date.now() + 3600000 },
  pexels: { count: 0, resetTime: Date.now() + 3600000 }
};

/**
 * Search for images using Pexels API
 */
async function searchPexels(query, count = 3) {
  const apiKey = process.env.PEXELS_API_KEY;
  if (!apiKey) {
    throw new Error('PEXELS_API_KEY not configured');
  }

  try {
    const response = await fetch(
      `https://api.pexels.com/v1/search?query=${encodeURIComponent(query)}&per_page=${count}`,
      {
        headers: { 'Authorization': apiKey },
        timeout: 5000 // 5 second timeout
      }
    );

    if (!response.ok) {
      throw new Error(`Pexels API error: ${response.status}`);
    }

    const data = await response.json();
    
    return data.photos.map(photo => ({
      id: photo.id.toString(),
      url: photo.src.medium,        // 350px wide
      thumb: photo.src.small,       // 130px wide
      full: photo.src.large,        // 940px wide
      photographer: photo.photographer,
      photographerUrl: photo.photographer_url,
      alt: photo.alt || query,
      source: 'pexels'
    }));
  } catch (error) {
    console.error('Pexels search failed:', error.message);
    throw error;
  }
}

/**
 * Search for images using Unsplash API
 */
async function searchUnsplash(query, count = 3) {
  const accessKey = process.env.UNSPLASH_ACCESS_KEY;
  if (!accessKey) {
    throw new Error('UNSPLASH_ACCESS_KEY not configured');
  }

  try {
    const response = await fetch(
      `https://api.unsplash.com/search/photos?query=${encodeURIComponent(query)}&per_page=${count}`,
      {
        headers: { 'Authorization': `Client-ID ${accessKey}` },
        timeout: 5000
      }
    );

    if (!response.ok) {
      throw new Error(`Unsplash API error: ${response.status}`);
    }

    const data = await response.json();
    
    return data.results.map(photo => ({
      id: photo.id,
      url: photo.urls.small,        // 400px wide
      thumb: photo.urls.thumb,      // 200px wide
      full: photo.urls.regular,     // 1080px wide
      photographer: photo.user.name,
      photographerUrl: photo.user.links.html,
      alt: photo.description || photo.alt_description || query,
      source: 'unsplash'
    }));
  } catch (error) {
    console.error('Unsplash search failed:', error.message);
    throw error;
  }
}

/**
 * Check rate limit and reset if needed
 */
function checkRateLimit(provider) {
  const limit = rateLimits[provider];
  
  // Reset counter if hour has passed
  if (Date.now() > limit.resetTime) {
    limit.count = 0;
    limit.resetTime = Date.now() + 3600000;
  }

  const maxRequests = provider === 'pexels' ? 200 : 50;
  
  if (limit.count >= maxRequests) {
    return false; // Rate limit exceeded
  }

  limit.count++;
  return true;
}

/**
 * Search for images with provider failover
 */
async function searchImages(query, count = 1) {
  // Check cache first
  const cacheKey = `${query}:${count}`;
  const cached = imageCache.get(cacheKey);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
    console.log(`Image cache hit: ${query}`);
    return cached.images;
  }

  // Try primary provider (round-robin)
  let images = null;
  let error = null;

  try {
    if (currentProvider === 'pexels' && checkRateLimit('pexels')) {
      images = await searchPexels(query, count);
    } else if (currentProvider === 'unsplash' && checkRateLimit('unsplash')) {
      images = await searchUnsplash(query, count);
    } else {
      // Rate limit exceeded, try other provider
      currentProvider = currentProvider === 'pexels' ? 'unsplash' : 'pexels';
      throw new Error(`Rate limit exceeded for ${currentProvider}`);
    }
  } catch (err) {
    error = err;
    console.log(`Primary provider (${currentProvider}) failed:`, err.message);
  }

  // Fallback to secondary provider
  if (!images) {
    const fallbackProvider = currentProvider === 'pexels' ? 'unsplash' : 'pexels';
    
    try {
      if (fallbackProvider === 'pexels' && checkRateLimit('pexels')) {
        images = await searchPexels(query, count);
      } else if (fallbackProvider === 'unsplash' && checkRateLimit('unsplash')) {
        images = await searchUnsplash(query, count);
      }
    } catch (fallbackErr) {
      console.error('Fallback provider also failed:', fallbackErr.message);
      throw error || fallbackErr; // Throw original error
    }
  }

  // Rotate provider for next request (round-robin)
  currentProvider = currentProvider === 'pexels' ? 'unsplash' : 'pexels';

  // Cache results
  if (images && images.length > 0) {
    imageCache.set(cacheKey, {
      images,
      timestamp: Date.now()
    });
  }

  return images || [];
}

/**
 * Get cache statistics (for monitoring)
 */
function getCacheStats() {
  return {
    size: imageCache.size,
    rateLimits: {
      pexels: {
        used: rateLimits.pexels.count,
        limit: 200,
        resetsIn: Math.max(0, rateLimits.pexels.resetTime - Date.now())
      },
      unsplash: {
        used: rateLimits.unsplash.count,
        limit: 50,
        resetsIn: Math.max(0, rateLimits.unsplash.resetTime - Date.now())
      }
    }
  };
}

module.exports = {
  searchImages,
  getCacheStats
};
```

### Feed Integration

**Update**: `src/endpoints/feed.js`

```javascript
const { searchImages } = require('../services/image-search');

// In generateFeedItem function
async function generateFeedItem(type, searchTerm, options = {}) {
  // ... existing code to generate item ...

  // PRIORITY 1: Extract images from web search results if available
  if (item.searchResults && item.searchResults.length > 0) {
    try {
      // Extract images from search result content
      const imagesFromSearch = extractImagesFromSearchResults(item.searchResults);
      
      if (imagesFromSearch.length > 0) {
        item.image = imagesFromSearch[0]; // Use first image from search results
        item.imageSource = 'web_search';
        console.log('✅ Using image from web search results');
        return item;
      }
    } catch (error) {
      console.error('Failed to extract images from search:', error.message);
      // Fall through to image search APIs
    }
  }

  // PRIORITY 2: Fallback to image search APIs if no images in search results
  if (item.imageSearchTerms && item.imageSearchTerms.length > 0) {
    try {
      // Try first search term
      const images = await searchImages(item.imageSearchTerms[0], 1);
      
      if (images.length > 0) {
        item.image = images[0]; // { url, thumb, full, photographer, photographerUrl }
        item.imageSource = 'image_api';
        console.log('✅ Using image from Pexels/Unsplash API');
      }
    } catch (error) {
      console.error('Image search failed:', error.message);
      // Continue without image (will use placeholder in UI)
    }
  }

  return item;
}

/**
 * Extract images from web search results
 */
function extractImagesFromSearchResults(searchResults) {
  const images = [];
  
  searchResults.forEach(result => {
    // Check if result has image metadata
    if (result.image) {
      images.push({
        url: result.image,
        thumb: result.image,
        full: result.image,
        alt: result.title || 'Search result image',
        source: 'web_search',
        sourceUrl: result.url
      });
    }
    
    // Parse HTML content for images (if available)
    if (result.body) {
      const imgRegex = /<img[^>]+src="([^">]+)"/g;
      let match;
      
      while ((match = imgRegex.exec(result.body)) !== null) {
        const imgUrl = match[1];
        
        // Filter out common junk images
        if (!isJunkImage(imgUrl)) {
          images.push({
            url: imgUrl,
            thumb: imgUrl,
            full: imgUrl,
            alt: result.title || 'Search result image',
            source: 'web_search',
            sourceUrl: result.url
          });
        }
      }
    }
  });
  
  return images;
}

/**
 * Filter out common junk images (icons, tracking pixels, etc.)
 */
function isJunkImage(url) {
  const junkPatterns = [
    /favicon/i,
    /logo/i,
    /icon/i,
    /pixel/i,
    /tracker/i,
    /1x1/,
    /\.gif$/,
    /\.svg$/
  ];
  
  return junkPatterns.some(pattern => pattern.test(url));
}
```

### Frontend Display

**Update**: `ui-new/src/components/FeedItem.tsx`

```tsx
interface FeedImage {
  url: string;
  thumb: string;
  full: string;
  photographer: string;
  photographerUrl: string;
  alt: string;
  source: 'pexels' | 'unsplash';
}

interface FeedItemProps {
  // ... existing props ...
  image?: FeedImage;
}

export function FeedItem({ item, onStash, onTrash }: FeedItemProps) {
  const [imageLoaded, setImageLoaded] = useState(false);
  const [imageError, setImageError] = useState(false);

  return (
    <div className="feed-item">
      {/* Image section */}
      <div className="feed-item-image">
        {item.image && !imageError ? (
          <>
            <img
              src={item.image.url}
              alt={item.image.alt}
              loading="lazy"
              onLoad={() => setImageLoaded(true)}
              onError={() => setImageError(true)}
              style={{ opacity: imageLoaded ? 1 : 0 }}
            />
            
            {/* Attribution */}
            <div className="image-attribution">
              Photo by{' '}
              <a
                href={item.image.photographerUrl}
                target="_blank"
                rel="noopener noreferrer"
              >
                {item.image.photographer}
              </a>
              {' '}on{' '}
              <a
                href={item.image.source === 'unsplash' ? 'https://unsplash.com' : 'https://pexels.com'}
                target="_blank"
                rel="noopener noreferrer"
              >
                {item.image.source === 'unsplash' ? 'Unsplash' : 'Pexels'}
              </a>
            </div>
          </>
        ) : (
          <div className="placeholder-image">
            📷 {item.imageSearchTerms?.[0] || 'Image'}
          </div>
        )}
      </div>

      {/* Content section */}
      <div className="feed-item-content">
        <h3>{item.title}</h3>
        <p>{item.content}</p>
      </div>

      {/* Actions */}
      <div className="feed-item-actions">
        <button onClick={() => onStash(item)}>💾 Stash</button>
        <button onClick={() => onTrash(item)}>🗑️ Trash</button>
      </div>
    </div>
  );
}
```

**CSS**: `ui-new/src/components/FeedItem.css`

```css
.feed-item-image {
  position: relative;
  width: 100%;
  height: 200px;
  overflow: hidden;
  border-radius: 8px 8px 0 0;
  background: #f0f0f0;
}

.feed-item-image img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  transition: opacity 0.3s ease;
}

.placeholder-image {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 100%;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  color: white;
  font-size: 1.2rem;
}

.image-attribution {
  position: absolute;
  bottom: 0;
  left: 0;
  right: 0;
  padding: 8px;
  background: rgba(0, 0, 0, 0.6);
  color: white;
  font-size: 0.75rem;
  text-align: right;
}

.image-attribution a {
  color: white;
  text-decoration: underline;
}
```

## Implementation Plan

### Phase 1: Backend Image Search Service (3 hours)

**Deliverables**:
- [ ] Create `src/services/image-search.js` module
  - Pexels API integration
  - Unsplash API integration
  - Round-robin provider rotation
  - Rate limiting logic
  - In-memory caching (1 hour TTL)
  - Error handling and retries

- [ ] Environment variables:
  ```bash
  PEXELS_API_KEY=your_pexels_api_key
  UNSPLASH_ACCESS_KEY=your_unsplash_access_key
  IMAGE_CACHE_TTL=3600
  ```

- [ ] Unit tests:
  - Test Pexels search
  - Test Unsplash search
  - Test failover logic
  - Test rate limiting
  - Test caching

**Testing**:
```bash
# Test image search
curl -X POST http://localhost:3000/test-image-search \
  -H "Content-Type: application/json" \
  -d '{"query": "machine learning", "count": 3}'
```

### Phase 2: Feed Endpoint Integration (2 hours)

**Deliverables**:
- [ ] Update `src/endpoints/feed.js`:
  - Call `searchImages()` for each feed item
  - Handle errors gracefully (continue without image)
  - Include image data in feed item response
  - Monitor performance impact

- [ ] Add image search to feed generation:
  ```javascript
  const items = await Promise.all(
    searchTerms.map(async (term) => {
      const item = await generateFeedItem('didYouKnow', term);
      
      // Add image search (non-blocking)
      if (item.imageSearchTerms) {
        item.image = await searchImages(item.imageSearchTerms[0], 1)
          .then(imgs => imgs[0])
          .catch(err => {
            console.error('Image search failed:', err);
            return null;
          });
      }
      
      return item;
    })
  );
  ```

**Testing**:
- Generate feed and verify images are included
- Test with various search terms
- Test error handling (invalid API keys, network errors)

### Phase 3: Frontend Display (2 hours)

**Deliverables**:
- [ ] Update `FeedItem.tsx`:
  - Display image with lazy loading
  - Show loading state (skeleton/blur)
  - Handle image load errors (fallback to placeholder)
  - Display attribution (photographer credit)

- [ ] Add CSS styling:
  - Responsive image sizing
  - Smooth transitions
  - Attribution overlay
  - Placeholder design

- [ ] Accessibility:
  - Alt text for images
  - Keyboard navigation for attribution links
  - Screen reader support

**Testing**:
- Test image display in feed grid
- Test lazy loading (scroll performance)
- Test error states (broken images)
- Test attribution links

### Phase 4: Monitoring & Optimization (1 hour)

**Deliverables**:
- [ ] Add monitoring endpoint:
  ```javascript
  // GET /api/image-search/stats
  app.get('/api/image-search/stats', (req, res) => {
    res.json(getCacheStats());
  });
  ```

- [ ] Add CloudWatch metrics:
  - Image search success rate
  - API provider usage (Pexels vs Unsplash)
  - Rate limit usage
  - Cache hit rate

- [ ] Optimize caching:
  - Cache popular search terms for 24 hours
  - Pre-fetch images for trending topics
  - Implement LRU eviction (max 1000 entries)

**Testing**:
- Monitor rate limit usage over 1 day
- Verify cache hit rate > 30%
- Check API costs (should be $0 with free tier)

## Success Metrics

### Adoption
- **Target**: 95%+ of feed items have images
- **Metric**: Items with images / total items generated

### Performance
- **Target**: Image search latency < 500ms (P95)
- **Metric**: Time from image search call to response

### Reliability
- **Target**: < 1% image search failures
- **Metric**: Failed searches / total searches

### Cost Efficiency
- **Target**: Stay within free tier (no API costs)
- **Metric**: Pexels requests < 200/hour, Unsplash requests < 50/hour

## Testing Plan

### Unit Tests

```javascript
// tests/services/image-search.test.js
describe('Image Search Service', () => {
  it('should search Pexels successfully', async () => {
    const images = await searchPexels('machine learning', 3);
    expect(images).toHaveLength(3);
    expect(images[0]).toHaveProperty('url');
    expect(images[0]).toHaveProperty('photographer');
  });

  it('should search Unsplash successfully', async () => {
    const images = await searchUnsplash('artificial intelligence', 3);
    expect(images).toHaveLength(3);
    expect(images[0]).toHaveProperty('url');
  });

  it('should cache search results', async () => {
    const images1 = await searchImages('test query', 1);
    const images2 = await searchImages('test query', 1);
    // Second call should be cached (faster)
    expect(images1).toEqual(images2);
  });

  it('should failover to secondary provider on error', async () => {
    // Mock Pexels failure
    jest.spyOn(global, 'fetch').mockRejectedValueOnce(new Error('API error'));
    
    // Should fallback to Unsplash
    const images = await searchImages('test', 1);
    expect(images).toHaveLength(1);
    expect(images[0].source).toBe('unsplash');
  });

  it('should enforce rate limits', async () => {
    // Make 201 requests (exceeds Pexels limit)
    for (let i = 0; i < 201; i++) {
      await searchImages(`query-${i}`, 1);
    }
    
    const stats = getCacheStats();
    expect(stats.rateLimits.pexels.used).toBeLessThanOrEqual(200);
  });
});
```

### Integration Tests

```javascript
// tests/integration/feed-images.test.js
describe('Feed with Images', () => {
  it('should include images in feed items', async () => {
    const response = await fetch('http://localhost:3000/feed', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ count: 10 })
    });

    const feed = await response.json();
    
    // At least 80% of items should have images
    const itemsWithImages = feed.items.filter(item => item.image);
    expect(itemsWithImages.length).toBeGreaterThanOrEqual(8);
  });

  it('should handle image search failures gracefully', async () => {
    // Mock API failure
    process.env.PEXELS_API_KEY = 'invalid';
    process.env.UNSPLASH_ACCESS_KEY = 'invalid';

    const response = await fetch('http://localhost:3000/feed', {
      method: 'POST',
      body: JSON.stringify({ count: 5 })
    });

    // Feed should still work without images
    expect(response.ok).toBe(true);
    const feed = await response.json();
    expect(feed.items).toHaveLength(5);
  });
});
```

## Future Enhancements

### Phase 2: Advanced Features
- [ ] Allow users to choose image provider (settings)
- [ ] Image quality selection (low/medium/high)
- [ ] User-uploaded images for custom feed items
- [ ] Image zoom/lightbox on click

### Phase 3: Performance Optimization
- [ ] Cache images in S3 (reduce API calls)
- [ ] Pre-fetch images for next page
- [ ] Progressive image loading (blur-up technique)
- [ ] WebP format support (smaller files)

### Phase 4: AI-Powered Image Selection
- [ ] Use CLIP embeddings to rank image relevance
- [ ] Filter out irrelevant images automatically
- [ ] Generate custom images with DALL-E for unique terms
- [ ] A/B test image selection algorithms

## Risk Assessment

### API Rate Limits
- **Risk**: Exceed free tier limits (50-200 req/hour)
- **Impact**: Images stop loading, degraded UX
- **Mitigation**: 
  - Aggressive caching (1 hour TTL)
  - Round-robin between providers
  - Monitor usage via CloudWatch
  - Fallback to placeholder images

### API Key Security
- **Risk**: API keys leaked in code/logs
- **Impact**: Quota theft, security breach
- **Mitigation**:
  - Store keys in environment variables (`.env`)
  - Never log API keys
  - Rotate keys quarterly
  - Use AWS Secrets Manager in production

### Image Copyright Issues
- **Risk**: Displaying unlicensed images
- **Impact**: Legal liability
- **Mitigation**:
  - Only use API-provided images (licensed)
  - Display proper attribution
  - Follow Unsplash/Pexels terms of service
  - Add DMCA takedown process

### Performance Impact
- **Risk**: Image search slows down feed generation
- **Impact**: Slow page loads, poor UX
- **Mitigation**:
  - Async image loading (non-blocking)
  - Timeout image searches after 5 seconds
  - Lazy load images in viewport
  - Use CDN for faster image delivery

---

**Status**: Ready for implementation  
**Next Step**: Register for Pexels and Unsplash API keys  
**Estimated Launch**: 1 week from start

**API Registration**:
- Pexels: https://www.pexels.com/api/
- Unsplash: https://unsplash.com/developers
