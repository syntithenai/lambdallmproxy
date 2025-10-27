#!/bin/bash
# Build script for LLM Proxy React UI
set -e

GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[0;33m'
NC='\033[0m'

log_info() { echo -e "${GREEN}✅ $1${NC}"; }
log_step() { echo -e "${BLUE}🔧 $1${NC}"; }
log_warn() { echo -e "${YELLOW}⚠️  $1${NC}"; }

cd "$(dirname "$0")/.."

# Get Lambda URL from .env or Lambda directly
LAMBDA_URL=$(grep '^LAMBDA_FUNCTION_URL=' .env 2>/dev/null | cut -d'=' -f2 || echo "")

if [ -z "$LAMBDA_URL" ]; then
    log_warn "LAMBDA_FUNCTION_URL not found in .env, trying to get from AWS..."
    LAMBDA_URL=$(aws lambda get-function-url-config --function-name llmproxy 2>/dev/null | jq -r '.FunctionUrl' | sed 's:/*$::' || echo "")
fi

if [ -n "$LAMBDA_URL" ]; then
    log_step "Updating .env.production with Lambda URL: $LAMBDA_URL"
    
    # Update VITE_API_BASE in .env.production
    if [ -f ui-new/.env.production ]; then
        sed -i "s|^VITE_API_BASE=.*|VITE_API_BASE=$LAMBDA_URL|" ui-new/.env.production
        log_info "Updated ui-new/.env.production"
    else
        log_warn ".env.production not found, creating it..."
        cat > ui-new/.env.production << EOF
# Production Environment Configuration
# Auto-updated: $(date -u +"%Y-%m-%d %H:%M:%S UTC")
VITE_API_BASE=$LAMBDA_URL
VITE_GOOGLE_CLIENT_ID=927667106833-7od90q7nh5oage0shc3kka5s9vtg2loj.apps.googleusercontent.com
EOF
        log_info "Created ui-new/.env.production"
    fi
else
    log_warn "Could not determine Lambda URL, using existing .env.production"
fi

log_step "Building React UI from ui-new/ (using .env.production)..."
cd ui-new
npm run build
log_info "Build complete! Files in docs/"
log_info "Production build uses VITE_API_BASE from .env.production"
