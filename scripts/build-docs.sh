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

# Get Lambda URL from AWS Lambda directly (no longer in .env)
LAMBDA_URL=$(aws lambda get-function-url-config --function-name llmproxy 2>/dev/null | jq -r '.FunctionUrl' | sed 's:/*$::' || echo "")

if [ -z "$LAMBDA_URL" ]; then
    log_warn "Unable to get Lambda URL from AWS. Make sure AWS CLI is configured."
    exit 1
fi

log_step "Updating .env.production with Lambda URL: $LAMBDA_URL"

# Get Google Client ID from root .env (use GGL_CID which is the actual variable name)
GOOGLE_CLIENT_ID=$(grep '^GGL_CID=' .env 2>/dev/null | cut -d'=' -f2 || echo "")

# Get PayPal Client ID from root .env (use PP_CID which is the actual variable name)
PAYPAL_CLIENT_ID=$(grep '^PP_CID=' .env 2>/dev/null | cut -d'=' -f2 || echo "")

# Get Share Base URL from root .env
SHARE_BASE_URL=$(grep '^SHARE_BASE_URL=' .env 2>/dev/null | cut -d'=' -f2 || echo "http://ai.syntithenai.com")

# Update or create .env.production
if [ -f ui-new/.env.production ]; then
    # Update VITE_API (was VITE_API_BASE)
    sed -i "s|^VITE_API_BASE=.*|VITE_API=$LAMBDA_URL|" ui-new/.env.production
    sed -i "s|^VITE_API=.*|VITE_API=$LAMBDA_URL|" ui-new/.env.production
    
    # Update or add VITE_GGL_CID (shortened Google Client ID)
    if grep -q '^VITE_GGL_CID=' ui-new/.env.production; then
        sed -i "s|^VITE_GGL_CID=.*|VITE_GGL_CID=$GOOGLE_CLIENT_ID|" ui-new/.env.production
    else
        echo "" >> ui-new/.env.production
        echo "# Google Client ID for OAuth authentication (YouTube, etc.)" >> ui-new/.env.production
        echo "VITE_GGL_CID=$GOOGLE_CLIENT_ID" >> ui-new/.env.production
    fi
    
    # Update or add VITE_PP_CID (shortened PayPal Client ID)
    if grep -q '^VITE_PP_CID=' ui-new/.env.production; then
        sed -i "s|^VITE_PP_CID=.*|VITE_PP_CID=$PAYPAL_CLIENT_ID|" ui-new/.env.production
    else
        echo "" >> ui-new/.env.production
        echo "# PayPal Client ID for payment integration" >> ui-new/.env.production
        echo "VITE_PP_CID=$PAYPAL_CLIENT_ID" >> ui-new/.env.production
    fi
    
    # Update or add VITE_SHARE_BASE_URL
    if grep -q '^VITE_SHARE_BASE_URL=' ui-new/.env.production; then
        sed -i "s|^VITE_SHARE_BASE_URL=.*|VITE_SHARE_BASE_URL=$SHARE_BASE_URL|" ui-new/.env.production
    else
        echo "" >> ui-new/.env.production
        echo "# Base URL for share links" >> ui-new/.env.production
        echo "VITE_SHARE_BASE_URL=$SHARE_BASE_URL" >> ui-new/.env.production
    fi
    
    log_info "Updated ui-new/.env.production with Lambda URL, Google Client ID (VITE_GGL_CID), PayPal Client ID (VITE_PP_CID), and Share Base URL"
else
    log_warn ".env.production not found, creating it..."
    cat > ui-new/.env.production << EOF
# Production Environment Configuration
# ================================================================
# This file is used when running: npm run build
# ================================================================

# API ENDPOINT - Production Lambda URL
# This is automatically set by the deploy script
VITE_API=$LAMBDA_URL

# Google Client ID for OAuth authentication (YouTube, etc.)
VITE_GGL_CID=$GGL_CID

# PayPal Client ID for payment integration
VITE_PP_CID=$PP_CID

# Base URL for share links
VITE_SHARE_BASE_URL=$SHARE_BASE_URL

EOF
    log_info "Created ui-new/.env.production"
fi

log_step "Building React UI from ui-new/ (using .env.production)..."
cd ui-new
npm run build
log_info "Build complete! Files in docs/"
log_info "Production build uses VITE_API from .env.production"
