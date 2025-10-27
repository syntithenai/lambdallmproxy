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
    
    # Get Google Client ID from .env as source of truth
    GOOGLE_CLIENT_ID=$(grep '^VITE_GOOGLE_CLIENT_ID=' ui-new/.env 2>/dev/null | cut -d'=' -f2 || echo "548179877633-cfvhlc5roj9prus33jlarcm540i495qi.apps.googleusercontent.com")
    
    # Get PayPal Client ID from .env as source of truth
    PAYPAL_CLIENT_ID=$(grep '^VITE_PAYPAL_CLIENT_ID=' ui-new/.env 2>/dev/null | cut -d'=' -f2 || echo "AU9cY15vsAcz4tWwm5U0O-nMBqYTP3cT0dOHTpHqPCCD1n9fwdcD-xNcuzMv_eP-UtaB3PFHTuHoXeCW")
    
    # Update or create .env.production
    if [ -f ui-new/.env.production ]; then
        # Update VITE_API_BASE
        sed -i "s|^VITE_API_BASE=.*|VITE_API_BASE=$LAMBDA_URL|" ui-new/.env.production
        
        # Update or add VITE_GOOGLE_CLIENT_ID
        if grep -q '^VITE_GOOGLE_CLIENT_ID=' ui-new/.env.production; then
            sed -i "s|^VITE_GOOGLE_CLIENT_ID=.*|VITE_GOOGLE_CLIENT_ID=$GOOGLE_CLIENT_ID|" ui-new/.env.production
        else
            echo "" >> ui-new/.env.production
            echo "# Google Client ID for OAuth authentication" >> ui-new/.env.production
            echo "VITE_GOOGLE_CLIENT_ID=$GOOGLE_CLIENT_ID" >> ui-new/.env.production
        fi
        
        # Update or add VITE_PAYPAL_CLIENT_ID
        if grep -q '^VITE_PAYPAL_CLIENT_ID=' ui-new/.env.production; then
            sed -i "s|^VITE_PAYPAL_CLIENT_ID=.*|VITE_PAYPAL_CLIENT_ID=$PAYPAL_CLIENT_ID|" ui-new/.env.production
        else
            echo "" >> ui-new/.env.production
            echo "# PayPal Client ID for payment integration" >> ui-new/.env.production
            echo "VITE_PAYPAL_CLIENT_ID=$PAYPAL_CLIENT_ID" >> ui-new/.env.production
        fi
        
        log_info "Updated ui-new/.env.production with Lambda URL, Google Client ID, and PayPal Client ID"
    else
        log_warn ".env.production not found, creating it..."
        cat > ui-new/.env.production << EOF
# Production Environment Configuration
# ================================================================
# This file is used when running: npm run build
# ================================================================

# API ENDPOINT - Production Lambda URL
# This is automatically set by the deploy script
VITE_API_BASE=$LAMBDA_URL

# Google Client ID for OAuth authentication
VITE_GOOGLE_CLIENT_ID=$GOOGLE_CLIENT_ID

# PayPal Client ID for payment integration
VITE_PAYPAL_CLIENT_ID=$PAYPAL_CLIENT_ID

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
