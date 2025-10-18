#!/bin/bash
# Simple HTTP server for serving sample media files during local development
# Runs on port 8082 to avoid conflicts with dev server (3000) and UI (5173)

PORT=8082
SAMPLES_DIR="$(cd "$(dirname "$0")/.." && pwd)/samples"

echo "🎬 Starting sample media server..."
echo "📁 Serving files from: $SAMPLES_DIR"
echo "🌐 Server URL: http://localhost:$PORT"
echo ""
echo "Sample files available:"
echo "  - http://localhost:$PORT/audio/sample.mp3"
echo "  - http://localhost:$PORT/audio/sample.wav"
echo ""
echo "Press Ctrl+C to stop"
echo ""

cd "$SAMPLES_DIR" && python3 -m http.server $PORT
