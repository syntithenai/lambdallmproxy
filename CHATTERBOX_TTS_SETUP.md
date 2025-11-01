# Chatterbox TTS Server Setup

This guide explains how to set up the Chatterbox TTS Server with GPU acceleration for high-quality text-to-speech synthesis.

## Prerequisites

1. **NVIDIA GPU** with CUDA support
2. **Docker** and **Docker Compose** installed
3. **NVIDIA Docker Runtime** (nvidia-docker2) installed

### Install NVIDIA Docker Runtime

```bash
# Ubuntu/Debian
distribution=$(. /etc/os-release;echo $ID$VERSION_ID)
curl -s -L https://nvidia.github.io/nvidia-docker/gpgkey | sudo apt-key add -
curl -s -L https://nvidia.github.io/nvidia-docker/$distribution/nvidia-docker.list | sudo tee /etc/apt/sources.list.d/nvidia-docker.list

sudo apt-get update && sudo apt-get install -y nvidia-docker2
sudo systemctl restart docker
```

## Quick Start

1. **Start the Chatterbox TTS Server:**

```bash
docker-compose -f docker-compose.chatterbox.yml up -d
```

2. **Check the logs:**

```bash
docker-compose -f docker-compose.chatterbox.yml logs -f
```

3. **Verify GPU is working:**

```bash
docker exec chatterbox-tts nvidia-smi
```

4. **Test the endpoint:**

```bash
curl -X POST http://localhost:8000/api/tts \
  -H "Content-Type: application/json" \
  -d '{"text": "Hello world, this is a test", "language": "en"}' \
  --output test.wav

# Play the audio (Linux)
aplay test.wav

# Or (macOS)
afplay test.wav
```

## Configuration

### Environment Variables

Edit `docker-compose.chatterbox.yml` to customize:

```yaml
environment:
  # GPU Configuration
  - NVIDIA_VISIBLE_DEVICES=all          # Use all GPUs or specify IDs (0,1)
  - NVIDIA_DRIVER_CAPABILITIES=compute,utility
  
  # Server Configuration
  - HOST=0.0.0.0
  - PORT=8000
  
  # Model Configuration (optional)
  - TTS_MODEL=tts_models/multilingual/multi-dataset/xtts_v2
  - VOCODER_MODEL=vocoder_models/universal/libri-tts/wavegrad
```

### Port Configuration

If port 8000 is in use, change the port mapping in `docker-compose.chatterbox.yml`:

```yaml
ports:
  - "9000:8000"  # Maps host port 9000 to container port 8000
```

Then update the provider URL in the UI or edit `ChatterboxTTSProvider.ts`:

```typescript
constructor(baseUrl: string = 'http://localhost:9000') {
  // ...
}
```

## CORS Configuration

The Chatterbox TTS service needs CORS headers to work with the UI. The docker-compose file includes CORS environment variables, but if you still experience CORS errors:

### Option 1: Use with Production Deployment
Deploy the UI to GitHub Pages and access via the production URL. The Lambda backend can proxy TTS requests.

### Option 2: Start Chatterbox with CORS Support
If the image supports it, the docker-compose file is pre-configured with:
- `CORS_ORIGINS`: Allows requests from localhost:8081 and localhost:5173
- `CORS_ALLOW_CREDENTIALS`: Enables authenticated requests

### Option 3: Manual CORS Headers (Advanced)
If CORS environment variables don't work, you may need to:
1. Fork the chatterbox-tts repository
2. Add CORS middleware to the FastAPI application
3. Build your own Docker image

Example FastAPI CORS configuration:
```python
from fastapi.middleware.cors import CORSMiddleware

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:8081", "http://localhost:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
```

## Using in the Application

1. **Start the Chatterbox container** (see Quick Start above)

2. **Restart the container** if you modified docker-compose.yml:
```bash
docker-compose -f docker-compose.chatterbox.yml down
docker-compose -f docker-compose.chatterbox.yml up -d
```

3. **Open the application** and go to Settings → TTS

3. **Select "Chatterbox TTS (Local GPU)"** from the provider dropdown

4. **Choose a voice** from the available voices

5. **Test it** - any text-to-speech request will now use Chatterbox

## API Reference

### Health Check

```bash
GET http://localhost:8000/health
```

Response: `200 OK` if server is ready

### List Speakers

```bash
GET http://localhost:8000/api/speakers
```

Returns available speaker IDs and metadata

### Generate Speech

```bash
POST http://localhost:8000/api/tts
Content-Type: application/json

{
  "text": "Your text here",
  "language": "en",
  "speaker_id": "en_default",
  "speed": 1.0
}
```

Response: Audio file (WAV format)

## Supported Languages

- English (en)
- Spanish (es)
- French (fr)
- German (de)
- Italian (it)
- Portuguese (pt)
- Russian (ru)
- Chinese (zh)
- Japanese (ja)
- Korean (ko)
- And many more (depends on the model)

## Troubleshooting

### Container won't start

1. **Check GPU availability:**
   ```bash
   nvidia-smi
   ```

2. **Check Docker GPU support:**
   ```bash
   docker run --rm --gpus all nvidia/cuda:11.0-base nvidia-smi
   ```

3. **Check logs:**
   ```bash
   docker-compose -f docker-compose.chatterbox.yml logs
   ```

### UI shows "not available"

1. **Verify container is running:**
   ```bash
   docker ps | grep chatterbox
   ```

2. **Test health endpoint:**
   ```bash
   curl http://localhost:8000/health
   ```

3. **Check firewall/network settings** - ensure port 8000 is accessible

### Poor audio quality

1. **Try different voices** - some speakers may sound better for your use case

2. **Adjust speed** - slower speed (0.8-0.9) can improve clarity

3. **Check GPU memory** - models need sufficient VRAM to work properly

### Out of memory errors

1. **Reduce concurrent requests** - process one TTS request at a time

2. **Use a smaller model** - edit `TTS_MODEL` in docker-compose.yml

3. **Increase GPU memory** - upgrade to a GPU with more VRAM

## Performance

- **First request**: Slower (model loading)
- **Subsequent requests**: Fast (model cached in GPU memory)
- **Typical latency**: 1-3 seconds for short text
- **GPU memory usage**: 2-4 GB VRAM (depends on model)

## Stopping the Server

```bash
docker-compose -f docker-compose.chatterbox.yml down
```

To also remove cached models:

```bash
docker-compose -f docker-compose.chatterbox.yml down -v
```

## Advanced Configuration

### Custom Models

You can use different TTS models by setting the `TTS_MODEL` environment variable:

```yaml
environment:
  - TTS_MODEL=tts_models/en/ljspeech/tacotron2-DDC
```

Browse available models at: https://github.com/coqui-ai/TTS

### Multi-GPU Setup

To use specific GPUs:

```yaml
environment:
  - NVIDIA_VISIBLE_DEVICES=0,1  # Use GPU 0 and 1
```

### Resource Limits

Add resource limits to prevent the container from consuming all GPU memory:

```yaml
deploy:
  resources:
    reservations:
      devices:
        - driver: nvidia
          count: 1
          capabilities: [gpu]
    limits:
      memory: 8G
```

## Links

- Chatterbox TTS Server: https://github.com/devnen/Chatterbox-TTS-Server
- Coqui TTS Models: https://github.com/coqui-ai/TTS
- NVIDIA Docker: https://github.com/NVIDIA/nvidia-docker
