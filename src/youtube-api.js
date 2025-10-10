/**
 * YouTube API Integration
 * 
 * Provides functions to fetch YouTube video transcripts using OAuth2 tokens.
 * Uses YouTube Data API v3 for caption/transcript access.
 */

const https = require('https');
const { URL } = require('url');

/**
 * Fetch YouTube video transcript using OAuth2 token
 * 
 * @param {string} url - YouTube video URL (youtube.com, youtu.be, youtube.com/shorts)
 * @param {string} accessToken - OAuth2 access token with youtube.readonly scope
 * @returns {Promise<string>} - Plain text transcript
 * @throws {Error} - If video ID invalid, no captions available, or API error
 */
async function getYouTubeTranscript(url, accessToken) {
  console.log('Fetching YouTube transcript for:', url);
  
  // Extract video ID
  const videoId = extractYouTubeVideoId(url);
  if (!videoId) {
    throw new Error('Invalid YouTube URL - could not extract video ID');
  }

  console.log('Extracted video ID:', videoId);

  // Get caption tracks for video
  const captionsUrl = `https://www.googleapis.com/youtube/v3/captions?part=snippet&videoId=${videoId}`;
  
  const captionsResponse = await makeHttpsRequest(captionsUrl, {
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Accept': 'application/json'
    }
  });

  const captionsData = JSON.parse(captionsResponse);
  
  // Check for API errors
  if (captionsData.error) {
    console.error('YouTube API error:', captionsData.error);
    throw new Error(`YouTube API error: ${captionsData.error.message || 'Unknown error'}`);
  }

  // Find available caption tracks
  const captions = captionsData.items || [];
  if (captions.length === 0) {
    throw new Error('No captions available for this video');
  }

  console.log(`Found ${captions.length} caption tracks:`, captions.map(c => ({
    language: c.snippet.language,
    kind: c.snippet.trackKind
  })));

  // Prefer English captions, fallback to first available
  const enCaption = captions.find(c => 
    c.snippet.language === 'en' || c.snippet.language.startsWith('en')
  ) || captions[0];

  const captionId = enCaption.id;
  const captionLang = enCaption.snippet.language;
  
  console.log(`Using caption track: ${captionLang} (${enCaption.snippet.trackKind})`);

  // Download caption track
  // Note: YouTube API requires tfmt parameter for caption download
  const trackUrl = `https://www.googleapis.com/youtube/v3/captions/${captionId}?tfmt=srt`;
  
  const transcript = await makeHttpsRequest(trackUrl, {
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Accept': 'text/plain'
    }
  });

  // Parse SRT format to plain text
  const plainText = parseSrtToText(transcript);
  
  console.log(`Successfully fetched transcript (${plainText.length} characters)`);
  
  return plainText;
}

/**
 * Extract YouTube video ID from various URL formats
 * 
 * @param {string} url - YouTube URL
 * @returns {string|null} - Video ID or null if not found
 */
function extractYouTubeVideoId(url) {
  // Patterns for various YouTube URL formats
  const patterns = [
    /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/|youtube\.com\/v\/|youtube\.com\/shorts\/)([a-zA-Z0-9_-]{11})/,
    /youtube\.com\/watch\?.*v=([a-zA-Z0-9_-]{11})/
  ];

  for (const pattern of patterns) {
    const match = url.match(pattern);
    if (match && match[1]) {
      return match[1];
    }
  }

  return null;
}

/**
 * Parse SRT (SubRip) format to plain text
 * Removes sequence numbers, timestamps, and formatting
 * 
 * @param {string} srt - SRT format captions
 * @returns {string} - Plain text transcript
 */
function parseSrtToText(srt) {
  const lines = srt.split('\n');
  const textLines = [];
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    
    // Skip sequence numbers (just digits)
    if (/^\d+$/.test(line)) continue;
    
    // Skip timing lines (HH:MM:SS,mmm --> HH:MM:SS,mmm)
    if (/\d{2}:\d{2}:\d{2},\d{3}\s*-->\s*\d{2}:\d{2}:\d{2},\d{3}/.test(line)) continue;
    
    // Skip empty lines
    if (line === '') continue;
    
    // Keep text lines (remove HTML tags if present)
    const cleanLine = line
      .replace(/<[^>]+>/g, '') // Remove HTML tags
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&amp;/g, '&')
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'");
    
    if (cleanLine) {
      textLines.push(cleanLine);
    }
  }
  
  // Join with spaces and clean up multiple spaces
  return textLines.join(' ').replace(/\s+/g, ' ').trim();
}

/**
 * Make HTTPS request and return response body as string
 * 
 * @param {string} url - Request URL
 * @param {Object} options - Request options (method, headers, etc.)
 * @returns {Promise<string>} - Response body
 * @throws {Error} - If request fails or returns non-2xx status
 */
function makeHttpsRequest(url, options = {}) {
  return new Promise((resolve, reject) => {
    const urlObj = new URL(url);
    
    const reqOptions = {
      hostname: urlObj.hostname,
      path: urlObj.pathname + urlObj.search,
      method: options.method || 'GET',
      headers: options.headers || {}
    };

    const req = https.request(reqOptions, (res) => {
      let data = '';
      
      res.on('data', chunk => {
        data += chunk;
      });
      
      res.on('end', () => {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          resolve(data);
        } else {
          reject(new Error(`HTTP ${res.statusCode}: ${data}`));
        }
      });
    });

    req.on('error', (err) => {
      reject(new Error(`Request failed: ${err.message}`));
    });

    if (options.body) {
      req.write(options.body);
    }

    req.end();
  });
}

module.exports = {
  getYouTubeTranscript,
  extractYouTubeVideoId,
  parseSrtToText
};
