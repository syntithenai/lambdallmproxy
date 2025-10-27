/**
 * YouTube Downloader Module
 * Extracts audio from YouTube videos using @distube/ytdl-core
 * (actively maintained fork with better YouTube compatibility)
 */

const ytdl = require('@distube/ytdl-core');
const ffmpeg = require('fluent-ffmpeg');
const ffmpegPath = require('@ffmpeg-installer/ffmpeg').path;
const { PassThrough } = require('stream');

ffmpeg.setFfmpegPath(ffmpegPath);

/**
 * Validate and extract YouTube video ID
 * @param {string} url - YouTube URL
 * @returns {string|null} Video ID or null if invalid
 */
function extractVideoId(url) {
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

/**
 * Check if URL is a YouTube URL
 * @param {string} url - URL to check
 * @returns {boolean} True if YouTube URL
 */
function isYouTubeUrl(url) {
    return url.includes('youtube.com/watch') || 
           url.includes('youtu.be/') ||
           url.includes('youtube.com/embed/') ||
           url.includes('youtube.com/shorts/');
}

/**
 * Get video metadata
 * @param {string} videoId - YouTube video ID
 * @returns {Promise<Object>} Video info
 */
async function getVideoInfo(videoId) {
    try {
        const info = await ytdl.getInfo(videoId);
        return {
            videoId,
            title: info.videoDetails.title,
            author: info.videoDetails.author.name,
            lengthSeconds: parseInt(info.videoDetails.lengthSeconds),
            viewCount: parseInt(info.videoDetails.viewCount),
            thumbnail: info.videoDetails.thumbnails?.[0]?.url
        };
    } catch (error) {
        // Provide helpful error messages based on error type
        const errorMsg = error.message || '';
        
        if (errorMsg.includes('410') || errorMsg.includes('Gone')) {
            throw new Error(`Video unavailable (410 Gone). This video may be: deleted, private, region-blocked, or age-restricted. YouTube URL: https://youtube.com/watch?v=${videoId}`);
        } else if (errorMsg.includes('403') || errorMsg.includes('Forbidden')) {
            const err = new Error(`Access forbidden (403). YouTube may be blocking automated access. Try: 1) Check if video exists at https://youtube.com/watch?v=${videoId}, 2) Video may be region-locked or require sign-in`);
            err.code = 'YOUTUBE_403';
            throw err;
        } else if (errorMsg.includes('404')) {
            throw new Error(`Video not found (404). The video ID may be invalid: https://youtube.com/watch?v=${videoId}`);
        } else if (errorMsg.includes('429') || errorMsg.includes('Too Many Requests')) {
            throw new Error(`Rate limit exceeded (429). YouTube is temporarily blocking requests. Please try again in a few minutes.`);
        } else {
            throw new Error(`Failed to get video info: ${error.message}. Video URL: https://youtube.com/watch?v=${videoId}`);
        }
    }
}

/**
 * Download audio from YouTube video
 * @param {string} videoId - YouTube video ID
 * @param {Function} onProgress - Progress callback (percent)
 * @returns {Promise<Buffer>} Audio buffer
 */
async function downloadAudio(videoId, onProgress) {
    return new Promise((resolve, reject) => {
        const chunks = [];
        let downloadedSize = 0;
        let totalSize = 0;

        // Get download timeout from environment (default: 30 seconds)
        const downloadTimeout = 15000; // 15 second timeout for YouTube downloads
        
        // Set up timeout
        const timeoutId = setTimeout(() => {
            reject(new Error(`YouTube download timeout after ${downloadTimeout / 1000} seconds. The video may be too large or YouTube is too slow to respond.`));
        }, downloadTimeout);

        try {
            // Get audio stream with additional options
            const audioStream = ytdl(videoId, {
                quality: 'highestaudio',
                filter: 'audioonly',
                // Add headers to appear more like a browser
                requestOptions: {
                    headers: {
                        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
                    }
                }
            });

            // Track download progress
            audioStream.on('progress', (chunkLength, downloaded, total) => {
                downloadedSize = downloaded;
                totalSize = total;
                const percent = (downloaded / total) * 100;
                if (onProgress) {
                    onProgress(Math.round(percent));
                }
            });

            audioStream.on('error', (error) => {
                clearTimeout(timeoutId);
                const errorMsg = error.message || '';
                if (errorMsg.includes('410') || errorMsg.includes('Gone')) {
                    reject(new Error(`Video stream unavailable. The video may have been deleted or made private during download.`));
                } else if (errorMsg.includes('403')) {
                    const err = new Error(`YouTube blocked the download request. The video may require authentication or be region-locked.`);
                    err.code = 'YOUTUBE_403';
                    reject(err);
                } else {
                    reject(new Error(`Audio stream error: ${error.message}`));
                }
            });

            // Convert to WAV using FFmpeg
            const outputStream = new PassThrough();
            
            ffmpeg(audioStream)
                .audioCodec('pcm_s16le')
                .audioChannels(1)
                .audioFrequency(16000)
                .format('wav')
                .on('error', (err) => {
                    clearTimeout(timeoutId);
                    reject(new Error(`FFmpeg error: ${err.message}`));
                })
                .pipe(outputStream);

            // Collect chunks
            outputStream.on('data', (chunk) => {
                chunks.push(chunk);
            });

            outputStream.on('end', () => {
                clearTimeout(timeoutId);
                const buffer = Buffer.concat(chunks);
                resolve(buffer);
            });

            outputStream.on('error', (error) => {
                clearTimeout(timeoutId);
                reject(error);
            });

        } catch (error) {
            clearTimeout(timeoutId);
            reject(error);
        }
    });
}

/**
 * Main function to download YouTube audio
 * @param {Object} params - Download parameters
 * @param {string} params.url - YouTube URL
 * @param {Function} params.onProgress - Progress callback
 * @returns {Promise<Object>} { buffer, metadata }
 */
async function downloadYouTubeAudio(params) {
    const { url, onProgress } = params;

    // Extract video ID
    const videoId = extractVideoId(url);
    if (!videoId) {
        throw new Error('Invalid YouTube URL');
    }

    console.log(`📺 Fetching YouTube video metadata: ${videoId}`);

    // Get video metadata
    const metadata = await getVideoInfo(videoId);
    
    console.log(`📺 Video: "${metadata.title}" by ${metadata.author}`);
    console.log(`⏱️  Duration: ${metadata.lengthSeconds}s`);

    // Emit metadata
    if (onProgress) {
        onProgress({
            type: 'metadata',
            data: metadata
        });
    }

    console.log(`📥 Downloading audio...`);

    // Download audio
    const buffer = await downloadAudio(videoId, (percent) => {
        if (onProgress) {
            onProgress({
                type: 'download_progress',
                percent
            });
        }
    });

    console.log(`✅ Download complete: ${(buffer.length / 1024 / 1024).toFixed(2)}MB`);

    return {
        buffer,
        metadata,
        size: buffer.length,
        format: 'audio/wav'
    };
}

module.exports = {
    downloadYouTubeAudio,
    extractVideoId,
    getVideoInfo,
    isYouTubeUrl
};
