/**
 * Audio/Video Transcription Tool using OpenAI Whisper
 */

// Use Node.js built-in fetch (available in Node 18+)
const FormData = require('form-data');
const { downloadYouTubeAudio, isYouTubeUrl, extractVideoId } = require('./youtube-downloader');
const { splitAudioIntoChunks, mergeTranscriptions } = require('./audio-chunker');
const { checkStopSignal, clearStopSignal } = require('../utils/stop-signal');

// Supported audio/video formats (flexible matching)
const SUPPORTED_FORMATS = [
    'audio/mpeg', 'audio/mp3', 'audio/mp4', 'audio/wav',
    'audio/webm', 'audio/ogg', 'audio/flac', 'audio/m4a',
    'video/mp4', 'video/webm', 'video/mpeg',
    'application/ogg', // OGG files may be served as application/ogg
    'audio/x-wav', 'audio/x-m4a' // Alternative MIME types
];

// Max file size: 25MB (Whisper API limit)
const MAX_FILE_SIZE = 25 * 1024 * 1024;

/**
 * Check if URL is an S3 URL and parse it
 */
function parseS3Url(url) {
    // Match s3://bucket/key or https://bucket.s3.amazonaws.com/key or https://bucket.s3.region.amazonaws.com/key
    const s3Patterns = [
        /^s3:\/\/([^\/]+)\/(.+)$/,
        /^https?:\/\/([^\.]+)\.s3\.amazonaws\.com\/(.+)$/,
        /^https?:\/\/([^\.]+)\.s3\.([^\.]+)\.amazonaws\.com\/(.+)$/,
        /^https?:\/\/s3\.amazonaws\.com\/([^\/]+)\/(.+)$/,
        /^https?:\/\/s3\.([^\.]+)\.amazonaws\.com\/([^\/]+)\/(.+)$/
    ];
    
    for (const pattern of s3Patterns) {
        const match = url.match(pattern);
        if (match) {
            if (pattern.source.includes('s3://')) {
                return { bucket: match[1], key: match[2] };
            } else if (match[3]) {
                return { bucket: match[1], key: match[3] };
            } else {
                return { bucket: match[1], key: match[2] };
            }
        }
    }
    return null;
}

/**
 * Download media from S3 using AWS SDK (more reliable than fetch from Lambda)
 */
async function downloadFromS3(bucket, key, onProgress) {
    const https = require('https');
    
    console.log(`🪣 Downloading from S3: ${bucket}/${key}`);
    
    return new Promise((resolve, reject) => {
        const url = `https://${bucket}.s3.amazonaws.com/${key}`;
        
        https.get(url, (response) => {
            if (response.statusCode !== 200) {
                reject(new Error(`HTTP ${response.statusCode}: ${response.statusMessage}`));
                return;
            }
            
            const chunks = [];
            let totalLength = 0;
            const contentLength = parseInt(response.headers['content-length'] || '0');
            
            response.on('data', (chunk) => {
                chunks.push(chunk);
                totalLength += chunk.length;
            });
            
            response.on('end', () => {
                const buffer = Buffer.concat(chunks);
                console.log(`✅ Downloaded ${(buffer.length / 1024 / 1024).toFixed(2)}MB from S3`);
                
                if (onProgress) {
                    onProgress({
                        type: 'download_complete',
                        size: buffer.length
                    });
                }
                
                resolve({
                    buffer,
                    contentType: response.headers['content-type'] || 'audio/mpeg',
                    size: buffer.length
                });
            });
            
            response.on('error', reject);
        }).on('error', reject);
    });
}

/**
 * Download media from local file path or file:// URL
 */
async function downloadFromLocalFile(urlOrPath, onProgress) {
    const fs = require('fs').promises;
    const path = require('path');
    
    console.log(`🏠 downloadFromLocalFile called with: ${urlOrPath}`);
    
    // Convert file:// URL to path, or handle localhost HTTP URLs
    let filePath;
    if (urlOrPath.startsWith('file://')) {
        filePath = urlOrPath.replace('file://', '');
        console.log(`   → file:// URL detected, path: ${filePath}`);
    } else if (urlOrPath.includes('localhost:3000/samples/')) {
        // Convert localhost URL to actual file path for local development
        const filename = urlOrPath.split('/samples/').pop();
        filePath = path.join(__dirname, '../../ui-new/public/samples', filename);
        console.log(`   → localhost URL detected, filename: ${filename}`);
        console.log(`   → __dirname: ${__dirname}`);
        console.log(`   → constructed path: ${filePath}`);
    } else {
        filePath = urlOrPath;
        console.log(`   → using path as-is: ${filePath}`);
    }
    
    console.log(`📁 Reading local file: ${filePath}`);
    
    try {
        const buffer = await fs.readFile(filePath);
        console.log(`✅ Read ${(buffer.length / 1024 / 1024).toFixed(2)}MB from local file`);
        
        // Determine content type from file extension
        const ext = path.extname(filePath).toLowerCase();
        const contentTypeMap = {
            '.mp3': 'audio/mpeg',
            '.mp4': 'audio/mp4',
            '.wav': 'audio/wav',
            '.m4a': 'audio/m4a',
            '.webm': 'audio/webm',
            '.ogg': 'audio/ogg',
            '.flac': 'audio/flac'
        };
        const contentType = contentTypeMap[ext] || 'audio/mpeg';
        
        if (onProgress) {
            onProgress({
                type: 'download_complete',
                size: buffer.length
            });
        }
        
        return {
            buffer,
            contentType,
            size: buffer.length
        };
    } catch (error) {
        console.error(`❌ Failed to read local file: ${error.message}`);
        throw new Error(`Failed to read local file: ${error.message}`);
    }
}

/**
 * Download media from direct URL
 */
async function downloadMedia(url, onProgress) {
    if (onProgress) {
        onProgress({
            type: 'download_start',
            url
        });
    }

    console.log(`🌐 Fetching media from: ${url}`);
    
    // Check if this is an S3 URL - use direct S3 download (more reliable from Lambda)
    const s3Info = parseS3Url(url);
    if (s3Info) {
        console.log(`🪣 Detected S3 URL: bucket=${s3Info.bucket}, key=${s3Info.key}`);
        return await downloadFromS3(s3Info.bucket, s3Info.key, onProgress);
    }
    
    // Get download timeout from environment (default: 30 seconds)
    const downloadTimeout = parseInt(process.env.MEDIA_DOWNLOAD_TIMEOUT) || 30000;
    
    let response;
    try {
        // Create an AbortController for timeout
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), downloadTimeout);
        
        // Prepare headers - skip Referer for localhost to avoid issues
        const headers = {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            'Accept': 'audio/*,video/*,*/*',
            'Accept-Language': 'en-US,en;q=0.9'
        };
        
        // Only add Referer for non-localhost URLs
        const urlObj = new URL(url);
        if (!urlObj.hostname.includes('localhost') && !urlObj.hostname.includes('127.0.0.1')) {
            headers['Referer'] = urlObj.origin + '/';
        }
        
        console.log(`🔍 Fetch options: headers=${JSON.stringify(headers)}`);
        
        try {
            response = await fetch(url, {
                signal: controller.signal,
                headers,
                redirect: 'follow' // Follow redirects (important for archive.org)
            });
        } finally {
            clearTimeout(timeoutId);
        }

        console.log(`📡 Response status: ${response.status} ${response.statusText}`);
        console.log(`📄 Content-Type: ${response.headers.get('content-type')}`);
        console.log(`📍 Final URL: ${response.url}`);

        if (!response.ok) {
            console.error(`❌ HTTP Error: ${response.status} ${response.statusText}`);
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }
    } catch (fetchError) {
        // Handle timeout specifically
        if (fetchError.name === 'AbortError') {
            console.error(`⏱️ Download timeout after ${downloadTimeout}ms`);
            throw new Error(`Download timeout: Media failed to load within ${downloadTimeout / 1000} seconds. The file may be too large or the server is too slow.`);
        }
        
        console.error(`❌ Fetch failed:`, fetchError);
        console.error(`   URL: ${url}`);
        console.error(`   Error message: ${fetchError.message}`);
        console.error(`   Error stack: ${fetchError.stack}`);
        throw fetchError;
    }

    // Check content type
    const contentType = response.headers.get('content-type');
    if (!SUPPORTED_FORMATS.some(format => contentType?.includes(format))) {
        throw new Error(`Unsupported media format: ${contentType}. Supported: ${SUPPORTED_FORMATS.join(', ')}`);
    }

    // Check file size
    const contentLength = response.headers.get('content-length');
    if (contentLength && parseInt(contentLength) > 100 * 1024 * 1024) {
        throw new Error(`File too large: ${(parseInt(contentLength) / 1024 / 1024).toFixed(2)}MB. Max: 100MB`);
    }

    console.log(`📥 Downloading ${contentLength ? (parseInt(contentLength) / 1024 / 1024).toFixed(2) + 'MB' : 'unknown size'}...`);

    // Use arrayBuffer() for Node 18+ fetch API compatibility
    const arrayBuffer = await response.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    
    if (buffer.length > 100 * 1024 * 1024) {
        throw new Error(`File too large: ${(buffer.length / 1024 / 1024).toFixed(2)}MB. Max: 100MB`);
    }

    console.log(`✅ Downloaded ${(buffer.length / 1024 / 1024).toFixed(2)}MB`);

    if (onProgress) {
        onProgress({
            type: 'download_complete',
            size: buffer.length
        });
    }

    return {
        buffer,
        contentType: contentType || 'audio/mpeg',
        size: buffer.length
    };
}

/**
 * Transcribe audio using OpenAI or Groq Whisper API
 * Detects provider from API key prefix:
 * - gsk_* = Groq
 * - sk-* = OpenAI
 */
async function transcribeWithWhisper(audioBuffer, filename, apiKey, options = {}) {
    // Detect provider from API key prefix
    const isGroq = apiKey.startsWith('gsk_');
    const provider = options.provider || (isGroq ? 'groq' : 'openai');
    
    // Select appropriate endpoint
    const endpoint = provider === 'groq' 
        ? 'https://api.groq.com/openai/v1/audio/transcriptions'
        : 'https://api.openai.com/v1/audio/transcriptions';
    
    // Groq supports specific Whisper models
    const model = options.model || (provider === 'groq' ? 'whisper-large-v3-turbo' : 'whisper-1');
    
    console.log(`🎤 Using ${provider} Whisper API with model: ${model}`);
    console.log(`📦 Audio buffer size: ${audioBuffer.length} bytes`);
    
    const formData = new FormData();
    formData.append('file', audioBuffer, {
        filename: filename,
        contentType: options.contentType || 'audio/wav',
        knownLength: audioBuffer.length // Important: specify the length
    });
    formData.append('model', model);
    
    if (options.language) {
        formData.append('language', options.language);
    }
    
    if (options.prompt) {
        formData.append('prompt', options.prompt);
    }

    // Get the headers from form-data (includes Content-Type with boundary)
    const headers = {
        'Authorization': `Bearer ${apiKey}`,
        ...formData.getHeaders()
    };

    // Use https module instead of fetch for better FormData compatibility
    const https = require('https');
    const { URL } = require('url');
    
    return new Promise((resolve, reject) => {
        const parsedUrl = new URL(endpoint);
        
        const options = {
            hostname: parsedUrl.hostname,
            port: parsedUrl.port || 443,
            path: parsedUrl.pathname,
            method: 'POST',
            headers: headers
        };

        const req = https.request(options, (res) => {
            let data = '';
            
            res.on('data', (chunk) => {
                data += chunk;
            });
            
            res.on('end', () => {
                if (res.statusCode === 200) {
                    try {
                        resolve(JSON.parse(data));
                    } catch (e) {
                        reject(new Error(`Failed to parse response: ${data}`));
                    }
                } else {
                    reject(new Error(`Whisper API error ${res.statusCode}: ${data}`));
                }
            });
        });

        req.on('error', (error) => {
            reject(new Error(`Request failed: ${error.message}`));
        });

        // Pipe the form data to the request
        formData.pipe(req);
    });
}

/**
 * Main transcription function
 */
async function transcribeUrl(params) {
    const { 
        url, 
        apiKey, 
        provider, 
        model = 'whisper-1', 
        language, 
        prompt, 
        onProgress,
        toolCallId 
    } = params;

    // Validate inputs
    if (!url) {
        return { error: 'URL is required' };
    }

    if (!apiKey) {
        return { error: 'API key is required for Whisper transcription' };
    }

    // Validate URL format
    try {
        new URL(url);
    } catch (e) {
        return { error: 'Invalid URL format' };
    }

    try {
        let audioData;
        let filename;
        let metadata = null;

        // Handle YouTube URLs
        if (isYouTubeUrl(url)) {
            const videoId = extractVideoId(url);
            if (!videoId) {
                return { error: 'Could not extract YouTube video ID' };
            }
            
            console.log(`📺 YouTube video detected: ${videoId}`);
            
            if (onProgress) {
                onProgress({
                    type: 'youtube_download_start',
                    videoId,
                    url
                });
            }

            // Check for stop signal
            if (toolCallId && checkStopSignal(toolCallId)) {
                clearStopSignal(toolCallId);
                return {
                    url,
                    stopped: true,
                    message: 'Transcription stopped by user before download'
                };
            }

            // Download audio from YouTube
            const result = await downloadYouTubeAudio({
                url,
                onProgress: (event) => {
                    if (onProgress) {
                        onProgress(event);
                    }
                }
            });

            audioData = result;
            metadata = result.metadata;
            filename = `${videoId}.wav`;

            if (onProgress) {
                onProgress({
                    type: 'youtube_download_complete',
                    size: result.size,
                    metadata
                });
            }
        } else {
            // Download from direct URL
            console.log(`📥 Downloading media from: ${url}`);
            audioData = await downloadMedia(url, onProgress);
            filename = url.split('/').pop().split('?')[0] || 'audio.mp3';
        }

        // Check for stop signal after download
        if (toolCallId && checkStopSignal(toolCallId)) {
            clearStopSignal(toolCallId);
            return {
                url,
                stopped: true,
                message: 'Transcription stopped by user after download'
            };
        }

        // Split into chunks if needed
        console.log(`📦 Checking if chunking is needed (${(audioData.size / 1024 / 1024).toFixed(2)}MB)`);
        
        const chunks = await splitAudioIntoChunks({
            audioBuffer: audioData.buffer,
            fileSize: audioData.size,
            duration: metadata?.lengthSeconds,
            onProgress: (event) => {
                if (onProgress) {
                    onProgress(event);
                }
            }
        });

        console.log(`📝 Transcribing ${chunks.length} chunk(s) with Whisper model: ${model}`);

        // Transcribe each chunk
        const transcriptions = [];

        for (let i = 0; i < chunks.length; i++) {
            const chunk = chunks[i];

            // Check for stop signal before each chunk
            if (toolCallId && checkStopSignal(toolCallId)) {
                console.log(`🛑 Transcription stopped by user at chunk ${i + 1}/${chunks.length}`);
                
                const partialText = mergeTranscriptions(transcriptions);
                
                if (onProgress) {
                    onProgress({
                        type: 'transcription_stopped',
                        message: 'Transcription stopped by user',
                        chunksCompleted: i,
                        totalChunks: chunks.length,
                        partialTranscription: partialText
                    });
                }

                clearStopSignal(toolCallId);

                return {
                    url,
                    text: partialText,
                    language: transcriptions[0]?.language || language,
                    model,
                    size: audioData.size,
                    format: audioData.contentType,
                    chunks: i,
                    totalChunks: chunks.length,
                    stopped: true,
                    message: 'Transcription stopped by user',
                    metadata: metadata || null
                };
            }

            if (onProgress) {
                onProgress({
                    type: 'transcribe_start',
                    chunkIndex: chunk.chunkIndex,
                    totalChunks: chunks.length,
                    startTime: chunk.startTime,
                    endTime: chunk.endTime
                });
            }

            console.log(`🎤 Transcribing chunk ${i + 1}/${chunks.length}...`);

            // Determine file extension from content type
            const ext = audioData.contentType?.includes('mpeg') || audioData.contentType?.includes('mp3') ? 'mp3' 
                      : audioData.contentType?.includes('wav') ? 'wav'
                      : audioData.contentType?.includes('ogg') ? 'ogg'
                      : audioData.contentType?.includes('flac') ? 'flac'
                      : audioData.contentType?.includes('m4a') ? 'm4a'
                      : 'mp3'; // default to mp3

            const transcription = await transcribeWithWhisper(
                chunk.buffer,
                `chunk_${chunk.chunkIndex}.${ext}`,
                apiKey,
                {
                    provider,
                    model,
                    language,
                    prompt: chunk.chunkIndex === 0 ? prompt : transcriptions[chunk.chunkIndex - 1]?.text.slice(-200),
                    contentType: audioData.contentType || 'audio/mpeg'
                }
            );

            transcriptions.push({
                ...transcription,
                chunkIndex: chunk.chunkIndex,
                startTime: chunk.startTime
            });

            const partialText = mergeTranscriptions(transcriptions);

            console.log(`✅ Chunk ${i + 1} complete: ${transcription.text.length} chars`);

            if (onProgress) {
                onProgress({
                    type: 'transcribe_chunk_complete',
                    chunkIndex: chunk.chunkIndex,
                    totalChunks: chunks.length,
                    text: transcription.text,
                    partialTranscription: partialText
                });
            }
        }

        // Merge transcriptions
        const fullText = mergeTranscriptions(transcriptions);

        console.log(`✅ Full transcription complete: ${fullText.length} characters`);

        // Clear stop signal on successful completion
        if (toolCallId) {
            clearStopSignal(toolCallId);
        }

        if (onProgress) {
            onProgress({
                type: 'transcribe_complete',
                text: fullText
            });
        }

        return {
            url,
            text: fullText,
            language: transcriptions[0]?.language || language,
            model,
            size: audioData.size,
            format: audioData.contentType || audioData.format,
            chunks: chunks.length,
            metadata: metadata || null
        };

    } catch (error) {
        console.error('❌ Transcription error:', error);
        
        // Clear stop signal on error
        if (toolCallId) {
            clearStopSignal(toolCallId);
        }

        const errorMsg = error.message || '';
        const isYouTube = isYouTubeUrl(url);
        
        // HTTP error codes - distinguish between YouTube and direct URLs
        if (errorMsg.includes('404')) {
            if (isYouTube) {
                return {
                    error: `⚠️ YouTube Video Not Found: The video ID appears to be invalid or the video has been removed.\nURL: ${url}`,
                    url
                };
            } else {
                return {
                    error: `⚠️ Media Not Found: The URL returned a 404 error. The file may have been moved or deleted.\nURL: ${url}\n\nPlease verify the URL is correct and the file exists.`,
                    url
                };
            }
        }
        
        // YouTube-specific errors with helpful messages
        if (errorMsg.includes('410') || errorMsg.includes('Gone')) {
            return {
                error: `⚠️ YouTube Video Unavailable: This video cannot be accessed. Possible reasons:\n• Video has been deleted or made private\n• Video is region-restricted\n• Video requires age verification or sign-in\n• Video link: ${url}\n\nSuggestions:\n• Verify the video exists and is publicly accessible\n• Try a different video\n• If this is a recent video, YouTube may be processing it`,
                url
            };
        }
        
        if (errorMsg.includes('403') || errorMsg.includes('Forbidden')) {
            if (isYouTube) {
                return {
                    error: `⚠️ Access Blocked: YouTube is blocking automated access to this video.\n• Video may require authentication\n• Video may be region-locked\n• YouTube may be rate-limiting requests\n\nSuggestions:\n• Wait a few minutes and try again\n• Verify the video is publicly accessible\n• Try a different video`,
                    url
                };
            } else {
                return {
                    error: `⚠️ Access Forbidden: The server returned a 403 error. The file may require authentication or may be restricted.\nURL: ${url}`,
                    url
                };
            }
        }
        
        if (errorMsg.includes('429') || errorMsg.includes('Too Many Requests')) {
            return {
                error: `⚠️ Rate Limit: Too many requests to YouTube. Please wait 2-3 minutes before trying again.`,
                url
            };
        }

        if (errorMsg.includes('Failed to download')) {
            return { 
                error: `Failed to download media: ${errorMsg}`,
                url 
            };
        }
        
        if (errorMsg.includes('Whisper API error')) {
            return { 
                error: errorMsg,
                url 
            };
        }
        
        return { 
            error: `Transcription failed: ${errorMsg}`,
            url 
        };
    }
}

module.exports = {
    transcribeUrl,
    isYouTubeUrl,
    SUPPORTED_FORMATS,
    MAX_FILE_SIZE
};
