# Media Samples for Transcription Testing

This directory contains sample audio files used for testing the transcription functionality.

## Speech Audio Samples (S3-Hosted)

All speech samples are TTS-generated using espeak, hosted on AWS S3 with public read access.

### Available Samples

1. **Hello Test**
   - URL: `https://llmproxy-media-samples.s3.amazonaws.com/audio/hello-test.wav`
   - Size: 269 KB
   - Duration: ~12 seconds
   - Content: "Hello, this is a test of the Whisper transcription service. The quick brown fox jumps over the lazy dog."
   - Format: WAV, 16-bit PCM, mono 22050 Hz

2. **Machine Learning Test**
   - URL: `https://llmproxy-media-samples.s3.amazonaws.com/audio/ml-test.wav`
   - Size: 324 KB
   - Duration: ~14 seconds
   - Content: "Testing audio transcription with various words and phrases. Machine learning and artificial intelligence are fascinating topics."
   - Format: WAV, 16-bit PCM, mono 22050 Hz

3. **Voice Recognition Test**
   - URL: `https://llmproxy-media-samples.s3.amazonaws.com/audio/voice-test.wav`
   - Size: 249 KB
   - Duration: ~11 seconds
   - Content: "This is sample number three. Voice recognition technology has improved dramatically in recent years."
   - Format: WAV, 16-bit PCM, mono 22050 Hz

4. **Long-form AI & Machine Learning Discussion**
   - URL: `https://llmproxy-media-samples.s3.amazonaws.com/audio/long-form-ai-speech.mp3`
   - Size: 2.7 MB
   - Duration: ~4 minutes 27 seconds (267 seconds)
   - Content: Extended discussion about artificial intelligence and machine learning, covering supervised learning, unsupervised learning, reinforcement learning, deep learning, transformers, NLP, computer vision, AI ethics, and future trends in AI
   - Format: MP3, 128 kbps VBR
   - Use case: Testing long-form transcription with automatic chunking and progress tracking

## S3 Bucket Configuration

- **Bucket**: `llmproxy-media-samples`
- **Region**: us-east-1 (default)
- **Access**: Public read via bucket policy
- **Path**: `audio/`

### Bucket Policy

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "PublicReadGetObject",
      "Effect": "Allow",
      "Principal": "*",
      "Action": "s3:GetObject",
      "Resource": "arn:aws:s3:::llmproxy-media-samples/*"
    }
  ]
}
```

## Why S3?

These samples are hosted on S3 because:

1. ✅ **Reliable from Lambda**: AWS S3 is never blocked by AWS Lambda
2. ✅ **Fast**: Low latency within AWS infrastructure
3. ✅ **Cost-effective**: Free tier covers small files like these
4. ✅ **No bot detection**: No geo-blocking or bot protection issues
5. ✅ **Guaranteed availability**: 99.99% uptime SLA

## CDN Blocking Issues

Many public CDNs block AWS Lambda IPs, including:
- ❌ YouTube (bot detection)
- ❌ Archive.org (geo-blocking)
- ❌ FileSamples.com (bot protection)
- ❌ Wikipedia Commons (inconsistent)

## Adding More Samples

To add more samples:

```bash
# Download audio file
curl -L "URL" -o filename.mp3

# Upload to S3
aws s3 cp filename.mp3 s3://llmproxy-media-samples/audio/ 

# Test public access
curl -I https://llmproxy-media-samples.s3.amazonaws.com/audio/filename.mp3
```

## License

All audio files are public domain from LibriVox. LibriVox recordings are in the public domain in the USA and possibly other countries.
