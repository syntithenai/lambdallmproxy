#!/bin/bash

# Restart Vite dev server with clean cache

echo "🧹 Cleaning Vite cache..."
rm -rf node_modules/.vite

echo "🛑 Stopping any existing dev server..."
pkill -f "vite.*8081" 2>/dev/null || true
sleep 1

echo "🚀 Starting Vite dev server..."
npm run dev
