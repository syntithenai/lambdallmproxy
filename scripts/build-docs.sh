#!/bin/bash

# Build script for LLM Proxy documentation
# Copies ui/index_template.html to docs/ folder and replaces environment variables

set -e

# Colors for output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

# Function to print colored output
log_info() { echo -e "${GREEN}✅ $1${NC}"; }
log_warn() { echo -e "${YELLOW}⚠️  $1${NC}"; }
log_error() { echo -e "${RED}❌ $1${NC}"; }

# Check if .env file exists
if [ ! -f ".env" ]; then
    log_error ".env file not found!"
    log_warn "Please copy .env.example to .env and fill in your values:"
    log_warn "cp .env.example .env"
    exit 1
fi

# Source environment variables
log_info "Loading environment variables from .env..."
set -a  # automatically export all variables
source .env
set +a  # disable automatic export

# Validate required environment variables
missing_vars=()

if [ -z "$LAMBDA_URL" ]; then
    missing_vars+=("LAMBDA_URL")
fi

if [ -z "$ACCESS_SECRET" ]; then
    missing_vars+=("ACCESS_SECRET")
fi

if [ -z "$GOOGLE_CLIENT_ID" ]; then
    missing_vars+=("GOOGLE_CLIENT_ID")
fi

if [ ${#missing_vars[@]} -gt 0 ]; then
    log_error "Missing required environment variables:"
    for var in "${missing_vars[@]}"; do
        log_error "  - $var"
    done
    log_warn "Please update your .env file with the missing variables"
    exit 1
fi

# Create docs directory if it doesn't exist
log_info "Creating docs directory..."
mkdir -p docs

# Copy modular template files to docs/ and replace environment variables
log_info "Building documentation with environment variables..."

# Check which template to use - prefer modular version
TEMPLATE_FILE=""
if [ -f "ui/index_template_modular.html" ]; then
    TEMPLATE_FILE="ui/index_template_modular.html"
    log_info "Using modular template: ui/index_template_modular.html"
elif [ -f "ui/index_template.html" ]; then
    TEMPLATE_FILE="ui/index_template.html" 
    log_warn "Using legacy monolithic template: ui/index_template.html"
    log_warn "Consider switching to the modular version: ui/index_template_modular.html"
else
    log_error "No template file found! Expected ui/index_template_modular.html or ui/index_template.html"
    exit 1
fi

# Copy CSS and JS files if using modular template
if [ "$TEMPLATE_FILE" = "ui/index_template_modular.html" ]; then
    log_info "Copying CSS and JavaScript modules..."
    
    # Create subdirectories
    mkdir -p docs/css docs/js
    
    # Copy CSS files
    if [ -f "ui/css/styles.css" ]; then
        cp "ui/css/styles.css" "docs/css/styles.css"
        log_info "✅ Copied CSS: docs/css/styles.css"
    else
        log_error "CSS file ui/css/styles.css not found!"
        exit 1
    fi
    
    # Copy JavaScript modules with environment variable processing
    JS_FILES=(
        "utils.js"
        "auth.js" 
        "settings.js"
        "samples.js"
        "events.js"
        "streaming.js"
        "main.js"
    )
    
    for js_file in "${JS_FILES[@]}"; do
        if [ -f "ui/js/$js_file" ]; then
            # Process environment variables in JavaScript files (especially auth.js for GOOGLE_CLIENT_ID)
            sed "s|{{LAMBDA_URL}}|$LAMBDA_URL|g" "ui/js/$js_file" | \
            sed "s|{{ACCESS_SECRET}}|$ACCESS_SECRET|g" | \
            sed "s|{{GOOGLE_CLIENT_ID}}|$GOOGLE_CLIENT_ID|g" > "docs/js/$js_file"
            log_info "✅ Copied JS: docs/js/$js_file"
        else
            log_error "JavaScript file ui/js/$js_file not found!"
            exit 1
        fi
    done
fi

# Use sed to replace placeholders with actual environment variables (excluding OPENAI_API_KEY)
sed "s|{{LAMBDA_URL}}|$LAMBDA_URL|g" "$TEMPLATE_FILE" | \
sed "s|{{ACCESS_SECRET}}|$ACCESS_SECRET|g" | \
sed "s|{{GOOGLE_CLIENT_ID}}|$GOOGLE_CLIENT_ID|g" > docs/index.html

log_info "Documentation built successfully!"

if [ "$TEMPLATE_FILE" = "ui/index_template_modular.html" ]; then
    log_info "📁 Output: docs/index.html (modular structure)"
    log_info "📁 CSS: docs/css/styles.css"
    log_info "📁 JavaScript modules: docs/js/*.js"
else
    log_info "📁 Output: docs/index.html (legacy monolithic)"
fi

log_warn "⚠️  The docs/index.html file contains your Lambda URL, access secret, and Google Client ID"
log_warn "⚠️  OpenAI API key is kept as placeholder for manual entry"

# Verify the file was created
if [ -f "docs/index.html" ]; then
    log_info "Build completed successfully!"
    
    if [ "$TEMPLATE_FILE" = "ui/index_template_modular.html" ]; then
        log_info "✨ Using modular structure - this should resolve JavaScript parsing issues"
    fi
    
    log_info "You can now serve the docs folder locally or deploy it securely"
else
    log_error "Build failed - docs/index.html was not created"
    exit 1
fi