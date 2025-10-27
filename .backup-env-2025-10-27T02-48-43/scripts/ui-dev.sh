#!/bin/bash

# UI Development Automation Script
# This script ensures UI changes are properly applied and built

set -e

# Colors for output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
RED='\033[0;31m'
NC='\033[0m' # No Color

log_info() { echo -e "${GREEN}✅ $1${NC}"; }
log_warn() { echo -e "${YELLOW}⚠️  $1${NC}"; }
log_step() { echo -e "${BLUE}🔧 $1${NC}"; }
log_error() { echo -e "${RED}❌ $1${NC}"; }

echo -e "${BLUE}🚀 UI Development Automation${NC}"
echo "=================================================="

# Function to watch for changes and auto-rebuild
watch_and_rebuild() {
    log_info "Starting UI watch mode..."
    log_warn "This will monitor ui/ folder and auto-rebuild on changes"
    log_warn "Press Ctrl+C to stop watching"
    
    if command -v inotifywait >/dev/null 2>&1; then
        while inotifywait -r -e modify,create,delete ui/ 2>/dev/null; do
            log_step "Change detected in ui/ folder, rebuilding..."
            bash scripts/build-docs.sh
            log_info "UI rebuilt automatically!"
        done
    else
        log_warn "inotifywait not available. Install inotify-tools for auto-rebuild:"
        log_warn "sudo apt-get install inotify-tools"
        log_info "For now, use 'npm run ui:build' after each change"
    fi
}

# Function to build UI
build_ui() {
    log_step "Building UI from source files..."
    bash scripts/build-docs.sh
    log_info "UI build completed!"
}

# Function to test UI locally
test_ui() {
    log_step "Starting local test server..."
    log_info "UI will be available at: http://localhost:9000/docs/"
    log_warn "Press Ctrl+C to stop the server"
    cd "$(dirname "$0")"
    python3 -m http.server 9000
}

# Function to deploy UI
deploy_ui() {
    log_step "Deploying UI to GitHub Pages..."
    bash scripts/deploy-docs.sh
    log_info "UI deployment completed!"
}

# Function to show UI structure
show_structure() {
    echo -e "${BLUE}📁 UI Source Structure:${NC}"
    tree ui/ 2>/dev/null || find ui/ -type f | sort
    echo ""
    echo -e "${BLUE}📁 Built Output Structure:${NC}"
    tree docs/ 2>/dev/null || find docs/ -type f | sort
}

# Main script logic
case "${1:-help}" in
    "build")
        build_ui
        ;;
    "test")
        build_ui
        test_ui
        ;;
    "watch")
        build_ui
        watch_and_rebuild
        ;;
    "deploy")
        build_ui
        deploy_ui
        ;;
    "structure")
        show_structure
        ;;
    "help"|*)
        echo -e "${BLUE}UI Development Commands:${NC}"
        echo ""
        echo "  $0 build     - Build UI from source files"
        echo "  $0 test      - Build and serve UI locally"
        echo "  $0 watch     - Watch for changes and auto-rebuild"
        echo "  $0 deploy    - Build and deploy to GitHub Pages"
        echo "  $0 structure - Show UI file structure"
        echo ""
        echo -e "${YELLOW}📋 Development Workflow:${NC}"
        echo "1. Edit files in ui/ folder"
        echo "2. Run: $0 build"
        echo "3. Test: $0 test"
        echo "4. Deploy: $0 deploy"
        echo ""
        echo -e "${GREEN}✨ Recent UI Features:${NC}"
        echo "- 5-row textarea (improved layout)"
        echo "- Real-time monitoring expandable sections"
        echo "- Query persistence with default examples"
        echo "- Cost/token information display"
        echo "- Modular JavaScript architecture"
        ;;
esac