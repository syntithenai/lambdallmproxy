#!/bin/bash
# Build script for LLM Proxy React UI
set -e

GREEN='\033[0;32m'
BLUE='\033[0;34m'
NC='\033[0m'

log_info() { echo -e "${GREEN}✅ $1${NC}"; }
log_step() { echo -e "${BLUE}🔧 $1${NC}"; }

cd "$(dirname "$0")/.."
log_step "Building React UI from ui-new..."
cd ui-new
npm run build
log_info "Build complete! Files in docs/"
