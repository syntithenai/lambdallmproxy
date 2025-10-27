/**
 * Audio Chunker Module
 * Splits large audio files into 25MB chunks for Whisper API
 */

const ffmpeg = require('fluent-ffmpeg');
const { PassThrough } = require('stream');

const MAX_CHUNK_SIZE = 25 * 1024 * 1024; // 25MB
const OVERLAP_SECONDS = 5; // 5 seconds overlap for continuity

/**
 * Calculate chunk duration based on bitrate
 * @param {number} fileSize - Total file size in bytes
 * @param {number} durationSeconds - Total duration in seconds
 * @returns {number} Chunk duration in seconds
 */
function calculateChunkDuration(fileSize, durationSeconds) {
    const bytesPerSecond = fileSize / durationSeconds;
    const chunkDuration = Math.floor(MAX_CHUNK_SIZE / bytesPerSecond);
    return Math.max(chunkDuration - OVERLAP_SECONDS, 60); // Min 60 seconds
}

/**
 * Get audio duration using ffprobe
 * @param {Buffer} audioBuffer - Audio file buffer
 * @returns {Promise<number>} Duration in seconds
 */
async function getAudioDuration(audioBuffer) {
    return new Promise((resolve, reject) => {
        const stream = new PassThrough();
        stream.end(audioBuffer);

        ffmpeg.ffprobe(stream, (err, metadata) => {
            if (err) {
                reject(err);
            } else {
                resolve(metadata.format.duration);
            }
        });
    });
}

/**
 * Extract a chunk from audio buffer
 * @param {Buffer} audioBuffer - Original audio
 * @param {number} startTime - Start time in seconds
 * @param {number} duration - Chunk duration in seconds
 * @returns {Promise<Buffer>} Chunk buffer
 */
async function extractChunk(audioBuffer, startTime, duration) {
    return new Promise((resolve, reject) => {
        const inputStream = new PassThrough();
        inputStream.end(audioBuffer);

        const chunks = [];
        const outputStream = new PassThrough();

        ffmpeg(inputStream)
            .setStartTime(startTime)
            .setDuration(duration)
            .audioCodec('pcm_s16le')
            .audioChannels(1)
            .audioFrequency(16000)
            .format('wav')
            .on('error', reject)
            .pipe(outputStream);

        outputStream.on('data', (chunk) => chunks.push(chunk));
        outputStream.on('end', () => resolve(Buffer.concat(chunks)));
        outputStream.on('error', reject);
    });
}

/**
 * Split audio into chunks
 * @param {Object} params - Chunking parameters
 * @param {Buffer} params.audioBuffer - Audio file buffer
 * @param {number} params.fileSize - File size in bytes
 * @param {number} params.duration - Audio duration in seconds (optional)
 * @param {Function} params.onProgress - Progress callback
 * @returns {Promise<Array>} Array of chunk buffers with metadata
 */
async function splitAudioIntoChunks(params) {
    const { audioBuffer, fileSize, duration: providedDuration, onProgress } = params;

    // Check if chunking is needed
    if (fileSize <= MAX_CHUNK_SIZE) {
        console.log(`📦 File size ${(fileSize / 1024 / 1024).toFixed(2)}MB is under limit, no chunking needed`);
        return [{
            buffer: audioBuffer,
            chunkIndex: 0,
            startTime: 0,
            size: fileSize,
            isOnlyChunk: true
        }];
    }

    console.log(`📊 File size ${(fileSize / 1024 / 1024).toFixed(2)}MB exceeds 25MB limit, chunking required`);

    // Get audio duration
    const totalDuration = providedDuration || await getAudioDuration(audioBuffer);
    
    // Calculate chunk duration
    const chunkDuration = calculateChunkDuration(fileSize, totalDuration);
    
    // Calculate number of chunks
    const numChunks = Math.ceil(totalDuration / (chunkDuration - OVERLAP_SECONDS));

    console.log(`📊 Total duration: ${totalDuration.toFixed(1)}s, Chunk duration: ${chunkDuration}s`);
    console.log(`✂️  Splitting into ${numChunks} chunks with ${OVERLAP_SECONDS}s overlap`);

    if (onProgress) {
        onProgress({
            type: 'chunking_start',
            totalChunks: numChunks,
            chunkDuration,
            totalDuration
        });
    }

    const chunks = [];
    let currentTime = 0;

    for (let i = 0; i < numChunks; i++) {
        const isLastChunk = i === numChunks - 1;
        const duration = isLastChunk 
            ? totalDuration - currentTime 
            : chunkDuration;

        console.log(`🔪 Extracting chunk ${i + 1}/${numChunks} (${currentTime.toFixed(1)}s - ${(currentTime + duration).toFixed(1)}s)`);

        const chunkBuffer = await extractChunk(audioBuffer, currentTime, duration);

        chunks.push({
            buffer: chunkBuffer,
            chunkIndex: i,
            startTime: currentTime,
            endTime: currentTime + duration,
            size: chunkBuffer.length,
            totalChunks: numChunks
        });

        console.log(`✅ Chunk ${i + 1} extracted: ${(chunkBuffer.length / 1024 / 1024).toFixed(2)}MB`);

        if (onProgress) {
            onProgress({
                type: 'chunk_ready',
                chunkIndex: i,
                totalChunks: numChunks,
                size: chunkBuffer.length
            });
        }

        // Move to next chunk (with overlap)
        currentTime += chunkDuration - OVERLAP_SECONDS;
    }

    return chunks;
}

/**
 * Find word overlap between two text segments
 * @param {string} text1 - First text
 * @param {string} text2 - Second text
 * @param {number} maxWords - Maximum words to check
 * @returns {number} Number of overlapping words
 */
function findOverlap(text1, text2, maxWords) {
    const words1 = text1.split(' ');
    const words2 = text2.split(' ');
    
    const startWords = Math.min(maxWords, words1.length);
    
    for (let i = startWords; i > 0; i--) {
        const suffix = words1.slice(-i).join(' ').toLowerCase();
        const prefix = words2.slice(0, i).join(' ').toLowerCase();
        
        if (suffix === prefix) {
            return i;
        }
    }
    
    return 0;
}

/**
 * Merge transcriptions from chunks
 * @param {Array} transcriptions - Array of transcription objects
 * @returns {string} Merged transcription
 */
function mergeTranscriptions(transcriptions) {
    if (!transcriptions || transcriptions.length === 0) {
        return '';
    }

    if (transcriptions.length === 1) {
        return transcriptions[0].text || '';
    }

    // Remove overlap duplicates using edit distance
    let merged = transcriptions[0].text || '';

    for (let i = 1; i < transcriptions.length; i++) {
        const prev = transcriptions[i - 1].text || '';
        const current = transcriptions[i].text || '';

        if (!current) continue;

        // Find overlap by checking last N words of previous vs first N words of current
        const overlapWords = findOverlap(prev, current, OVERLAP_SECONDS * 3); // ~3 words/sec
        
        if (overlapWords > 0) {
            // Remove overlap from current chunk
            const currentWords = current.split(' ');
            const mergedCurrent = currentWords.slice(overlapWords).join(' ');
            merged += ' ' + mergedCurrent;
        } else {
            merged += ' ' + current;
        }
    }

    return merged.trim();
}

module.exports = {
    splitAudioIntoChunks,
    mergeTranscriptions,
    calculateChunkDuration,
    getAudioDuration,
    findOverlap,
    MAX_CHUNK_SIZE,
    OVERLAP_SECONDS
};
