#!/bin/bash

# Build script for new React UI
# Builds Vite project from ui-new/ to docs/

set -e

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
BLUE='\033[0;34m'
NC='\033[0m'

log_info() { echo -e "${GREEN}✅ $1${NC}"; }
log_warn() { echo -e "${YELLOW}⚠️  $1${NC}"; }
log_error() { echo -e "${RED}❌ $1${NC}"; }
log_step() { echo -e "${BLUE}🔧 $1${NC}"; }

# Check if ui-new exists
if [ ! -d "ui-new" ]; then
    log_error "ui-new directory not found!"
    exit 1
fi

log_step "Building new React UI..."

# Navigate to ui-new and build
cd ui-new

# Check if node_modules exists
if [ ! -d "node_modules" ]; then
    log_warn "node_modules not found, running npm install..."
    npm install
fi

# Build the project
log_step "Running npm run build..."
npm run build

cd ..

log_info "Build complete! Output in docs/"
log_info "To preview: cd docs && python3 -m http.server 8082"
