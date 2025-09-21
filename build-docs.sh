#!/bin/bash

# Build script for LLM Proxy documentation
# Copies test.html to docs/ folder and replaces environment variables

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
export $(cat .env | grep -v '^#' | grep -v '^$' | xargs)

# Validate required environment variables
missing_vars=()

if [ -z "$LAMBDA_URL" ]; then
    missing_vars+=("LAMBDA_URL")
fi

if [ -z "$ACCESS_SECRET" ]; then
    missing_vars+=("ACCESS_SECRET")
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

# Copy test.html to docs/index.html and replace environment variables
log_info "Building documentation with environment variables..."

# Use sed to replace placeholders with actual environment variables (excluding OPENAI_API_KEY)
sed "s|{{LAMBDA_URL}}|$LAMBDA_URL|g" test.html | \
sed "s|{{ACCESS_SECRET}}|$ACCESS_SECRET|g" > docs/index.html

log_info "Documentation built successfully!"
log_info "📁 Output: docs/index.html"
log_warn "⚠️  The docs/index.html file contains your Lambda URL and access secret"
log_warn "⚠️  OpenAI API key is kept as placeholder for manual entry"

# Verify the file was created
if [ -f "docs/index.html" ]; then
    log_info "Build completed successfully!"
    log_info "You can now serve the docs folder locally or deploy it securely"
else
    log_error "Build failed - docs/index.html was not created"
    exit 1
fi