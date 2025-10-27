#!/bin/bash

# UI Migration Helper Script
# Helps transition from monolithic to modular UI structure

set -e

# Colors for output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Function to print colored output
log_info() { echo -e "${GREEN}✅ $1${NC}"; }
log_warn() { echo -e "${YELLOW}⚠️  $1${NC}"; }
log_error() { echo -e "${RED}❌ $1${NC}"; }
log_note() { echo -e "${BLUE}ℹ️  $1${NC}"; }

echo -e "${BLUE}🔄 UI Migration Helper${NC}"
echo -e "${BLUE}=============================${NC}"

# Check current UI structure
echo ""
log_note "Checking current UI structure..."

LEGACY_EXISTS=false
MODULAR_EXISTS=false

if [ -f "ui/index_template.html" ]; then
    LEGACY_EXISTS=true
    LEGACY_SIZE=$(wc -l < "ui/index_template.html")
    log_info "Found legacy template: ui/index_template.html ($LEGACY_SIZE lines)"
fi

if [ -f "ui/index_template_modular.html" ]; then
    MODULAR_EXISTS=true
    log_info "Found modular template: ui/index_template_modular.html"
fi

if [ -f "ui/css/styles.css" ]; then
    CSS_SIZE=$(wc -l < "ui/css/styles.css")
    log_info "Found modular CSS: ui/css/styles.css ($CSS_SIZE lines)"
fi

if [ -d "ui/js" ] && [ -f "ui/js/main.js" ]; then
    JS_COUNT=$(find ui/js -name "*.js" | wc -l)
    log_info "Found modular JavaScript: ui/js/ ($JS_COUNT files)"
fi

echo ""
log_note "Migration Status:"

# Determine current state and recommendations
if [ "$MODULAR_EXISTS" = true ] && [ -f "ui/css/styles.css" ] && [ -f "ui/js/main.js" ]; then
    log_info "✨ Modular structure is ready!"
    echo ""
    log_note "Your UI has been successfully decomposed into:"
    echo "  📁 ui/index_template_modular.html (clean HTML template)"
    echo "  📁 ui/css/styles.css (all CSS styles)"
    echo "  📁 ui/js/*.js (JavaScript modules)"
    echo ""
    log_info "Build scripts will automatically use the modular version"
    
    if [ "$LEGACY_EXISTS" = true ]; then
        echo ""
        log_warn "Legacy template still exists: ui/index_template.html"
        echo -e "${YELLOW}Consider backing up and removing it once you've validated the modular version${NC}"
    fi
    
elif [ "$LEGACY_EXISTS" = true ] && [ "$MODULAR_EXISTS" = false ]; then
    log_warn "Only legacy template found - modular structure missing"
    echo ""
    echo "To use the modular structure:"
    echo "1. The modular files should have been created during decomposition"
    echo "2. Check if ui/index_template_modular.html exists"
    echo "3. Verify ui/css/styles.css and ui/js/ directory exist"
    echo ""
    log_note "The build script will fall back to the legacy template for now"
    
else
    log_error "No UI templates found!"
    echo ""
    echo "Expected files:"
    echo "  ui/index_template.html (legacy) OR"
    echo "  ui/index_template_modular.html + ui/css/styles.css + ui/js/*.js (modular)"
    exit 1
fi

echo ""
log_note "Build System Information:"
echo "📜 scripts/build-docs.sh - Handles both legacy and modular templates"
echo "📜 Priority: modular template → legacy template → error"
echo "📜 Makefile targets work with both structures automatically"

echo ""
log_note "Testing Your Setup:"
echo "  make build-docs    # Test local build"
echo "  make serve         # Serve locally on :8081"
echo "  make deploy-docs   # Deploy to production"

echo ""
if [ "$MODULAR_EXISTS" = true ]; then
    log_info "🚀 Ready to deploy! The modular structure should resolve JavaScript parsing issues."
else
    log_warn "Still using legacy structure. Consider migrating to modular for better maintainability."
fi