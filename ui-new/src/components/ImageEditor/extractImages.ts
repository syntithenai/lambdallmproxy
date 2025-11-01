import type { ImageData } from './types';
import type { ContentSnippet } from '../../contexts/SwagContext';

/**
 * Extracts all images from an array of snippets
 * Handles:
 * - Direct image snippets (base64 data URLs)
 * - Images embedded in HTML content (<img> tags)
 * - Images in markdown content (![alt](url))
 * Now includes imageIndex for tracking position in snippet
 */
export function extractImagesFromSnippets(snippets: ContentSnippet[]): ImageData[] {
  const images: ImageData[] = [];
  let globalCounter = 0;

  for (const snippet of snippets) {
    const content = snippet.content || '';
    let snippetImageIndex = 0;

    // Check if snippet content is a direct base64 image
    if (content.startsWith('data:image/')) {
      globalCounter++;
      images.push({
        id: `${snippet.id}-img-${globalCounter}`,
        url: content,
        name: snippet.title || `Image ${globalCounter}`,
        tags: snippet.tags || [],
        snippetId: snippet.id,
        imageIndex: 0, // Direct image is always index 0
        format: extractImageFormat(content),
      });
      continue;
    }

    // Extract images from HTML content
    if (content.includes('<img')) {
      const htmlImages = extractImagesFromHTML(content, snippet, snippetImageIndex);
      images.push(...htmlImages);
      snippetImageIndex += htmlImages.length;
      globalCounter += htmlImages.length;
    }

    // Extract images from markdown content
    if (content.includes('![')) {
      const markdownImages = extractImagesFromMarkdown(content, snippet, snippetImageIndex);
      images.push(...markdownImages);
      snippetImageIndex += markdownImages.length;
      globalCounter += markdownImages.length;
    }
  }

  return images;
}

/**
 * Extracts images from HTML content
 */
function extractImagesFromHTML(
  html: string,
  snippet: ContentSnippet,
  startIndex: number
): ImageData[] {
  const images: ImageData[] = [];
  const parser = new DOMParser();
  const doc = parser.parseFromString(html, 'text/html');
  const imgElements = doc.querySelectorAll('img');

  imgElements.forEach((img, index) => {
    const src = img.src || img.getAttribute('src');
    if (!src) return;

    // Skip broken or placeholder images
    if (src.includes('placeholder') || src.length < 10) return;

    const alt = img.alt || img.getAttribute('alt') || '';
    const width = img.width || parseInt(img.getAttribute('width') || '0');
    const height = img.height || parseInt(img.getAttribute('height') || '0');

    images.push({
      id: `${snippet.id}-html-${startIndex + index}`,
      url: src,
      name: alt || `${snippet.title || 'Image'} - ${index + 1}`,
      tags: snippet.tags || [],
      snippetId: snippet.id,
      imageIndex: startIndex + index, // Track position in snippet
      width: width || undefined,
      height: height || undefined,
      format: extractImageFormat(src),
    });
  });

  return images;
}

/**
 * Extracts images from markdown content
 */
function extractImagesFromMarkdown(
  markdown: string,
  snippet: ContentSnippet,
  startIndex: number
): ImageData[] {
  const images: ImageData[] = [];
  // Markdown image pattern: ![alt text](image url "optional title")
  const imageRegex = /!\[([^\]]*)\]\(([^)\s]+)(?:\s+"([^"]*)")?\)/g;
  let match;
  let index = 0;

  while ((match = imageRegex.exec(markdown)) !== null) {
    const alt = match[1] || '';
    const url = match[2];
    const title = match[3] || '';

    // Skip broken or placeholder images
    if (!url || url.includes('placeholder') || url.length < 10) continue;

    images.push({
      id: `${snippet.id}-md-${startIndex + index}`,
      url,
      name: title || alt || `${snippet.title || 'Image'} - ${index + 1}`,
      tags: snippet.tags || [],
      snippetId: snippet.id,
      imageIndex: startIndex + index, // Track position in snippet
      format: extractImageFormat(url),
    });

    index++;
  }

  return images;
}

/**
 * Extracts the image format from a URL or data URL
 */
function extractImageFormat(url: string): string | undefined {
  // For data URLs
  if (url.startsWith('data:image/')) {
    const match = url.match(/data:image\/([a-z]+);/);
    return match ? match[1].toUpperCase() : undefined;
  }

  // For regular URLs
  const match = url.match(/\.([a-z]{3,4})(?:\?|$)/i);
  return match ? match[1].toUpperCase() : undefined;
}

/**
 * Checks if a snippet contains any images
 */
export function snippetHasImages(snippet: ContentSnippet): boolean {
  const content = snippet.content || '';
  
  // Check for direct base64 image
  if (content.startsWith('data:image/')) {
    return true;
  }

  // Check for HTML images
  if (content.includes('<img')) {
    return true;
  }

  // Check for markdown images
  if (content.includes('![')) {
    return true;
  }

  return false;
}
