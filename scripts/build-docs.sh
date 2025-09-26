#!/bin/bash

# Enhanced Build script for LLM Proxy documentation
# Supports both monolithic and modular template systems
# Handles CSS compilation, template variable replacement, and asset copying

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
log_step() { echo -e "${BLUE}🔧 $1${NC}"; }

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

# Determine which template system to use
TEMPLATE_FILE=""
if [ -f "ui/index_template_modular.html" ]; then
    TEMPLATE_FILE="ui/index_template_modular.html"
    log_step "Using modular template system"
elif [ -f "ui/index_template.html" ]; then
    TEMPLATE_FILE="ui/index_template.html"
    log_step "Using monolithic template system"
else
    log_error "No template file found! Expected ui/index_template_modular.html or ui/index_template.html"
    exit 1
fi

# Create docs directory structure
log_step "Creating docs directory structure..."
mkdir -p docs
mkdir -p docs/js

# If using modular template, copy JavaScript modules
if [ "$TEMPLATE_FILE" = "ui/index_template_modular.html" ]; then
    log_step "Copying JavaScript modules..."
    
    # Copy modular JavaScript files if they exist in docs/js/
    if [ -d "docs/js" ] && [ -f "docs/js/main.js" ]; then
        log_info "JavaScript modules already exist in docs/js/"
    else
        log_warn "JavaScript modules not found in docs/js/ - they should have been created during integration"
        log_warn "Building will continue but the site may not function properly"
    fi
    
    # Compile CSS from separate file if it exists
    if [ -f "ui/styles.css" ]; then
        log_step "Loading CSS from ui/styles.css..."
        CSS_CONTENT=$(cat ui/styles.css)
        log_info "CSS loaded ($(echo "$CSS_CONTENT" | wc -l) lines)"
    else
        log_warn "ui/styles.css not found - using empty CSS"
        CSS_CONTENT=""
    fi
    
    # Create model options HTML from template
    MODEL_OPTIONS='<optgroup label="Groq Models" id="groq-models">
                        <option value="groq:llama-3.1-8b-instant" selected>Llama 3.1 8B Instant (Fastest)</option>
                        <option value="groq:llama-3.3-70b-versatile">Llama 3.3 70B Versatile</option>
                        <option value="groq:llama-3.1-405b-reasoning">Llama 3.1 405B Reasoning</option>
                        <option value="groq:mixtral-8x7b-32768">Mixtral 8x7B</option>
                    </optgroup>
                    <optgroup label="OpenAI Models" id="openai-models">
                        <option value="openai:gpt-4o">GPT-4o</option>
                        <option value="openai:gpt-4o-mini">GPT-4o Mini</option>
                        <option value="openai:gpt-4">GPT-4</option>
                        <option value="openai:gpt-3.5-turbo">GPT-3.5 Turbo</option>
                    </optgroup>'
    
    # Process modular template with CSS compilation and environment variables
    log_step "Processing modular template with CSS compilation..."
    
    # Use a temporary file for multi-step processing
    TEMP_FILE=$(mktemp)
    
    # First, replace CSS content using Python for safer handling of special characters
    python3 -c "
import sys
content = open('$TEMPLATE_FILE', 'r').read()
css_content = open('ui/styles.css', 'r').read() if os.path.exists('ui/styles.css') else ''
result = content.replace('{{CSS_CONTENT}}', css_content)
open('$TEMP_FILE', 'w').write(result)
import os
" 2>/dev/null || {
        # Fallback to safer sed approach using file substitution
        echo "$CSS_CONTENT" > /tmp/css_content.tmp
        sed '/{{CSS_CONTENT}}/{
            r /tmp/css_content.tmp
            d
        }' "$TEMPLATE_FILE" > "$TEMP_FILE"
        rm -f /tmp/css_content.tmp
    }
    
    # Then replace model options using file substitution
    echo "$MODEL_OPTIONS" > /tmp/model_options.tmp
    sed -i '/{{MODEL_OPTIONS}}/{
        r /tmp/model_options.tmp
        d
    }' "$TEMP_FILE"
    rm -f /tmp/model_options.tmp
    
    # Finally, replace environment variables
    sed "s|{{LAMBDA_URL}}|$LAMBDA_URL|g" "$TEMP_FILE" | \
    sed "s|{{ACCESS_SECRET}}|$ACCESS_SECRET|g" | \
    sed "s|{{GOOGLE_CLIENT_ID}}|$GOOGLE_CLIENT_ID|g" > docs/index.html
    
    # Clean up temp file
    rm "$TEMP_FILE"
    
    log_info "Modular template processed with CSS compilation"
    
else
    # Process monolithic template (original behavior)
    log_step "Processing monolithic template..."
    
    sed "s|{{LAMBDA_URL}}|$LAMBDA_URL|g" "$TEMPLATE_FILE" | \
    sed "s|{{ACCESS_SECRET}}|$ACCESS_SECRET|g" | \
    sed "s|{{GOOGLE_CLIENT_ID}}|$GOOGLE_CLIENT_ID|g" > docs/index.html
    
    log_info "Monolithic template processed"
fi

log_info "Documentation built successfully!"
log_info "📁 Output: docs/index.html"
if [ "$TEMPLATE_FILE" = "ui/index_template_modular.html" ]; then
    log_info "📁 JavaScript modules: docs/js/*.js"
fi
log_warn "⚠️  The docs/index.html file contains your Lambda URL, access secret, and Google Client ID"
log_warn "⚠️  OpenAI API key is kept as placeholder for manual entry"

# Verify the file was created
if [ -f "docs/index.html" ]; then
    log_info "Build completed successfully!"
    log_info "You can now serve the docs folder locally or deploy it securely"
    
    # Provide usage instructions
    echo -e "\n${BLUE}📖 Usage Instructions:${NC}"
    if [ "$TEMPLATE_FILE" = "ui/index_template_modular.html" ]; then
        echo -e "   • Modular architecture with separate JavaScript files"
        echo -e "   • CSS compiled from ui/styles.css"
        echo -e "   • Start local server: ${YELLOW}python3 -m http.server 8000${NC} (from docs/ directory)"
    else
        echo -e "   • Monolithic template with inline JavaScript and CSS"
        echo -e "   • Start local server: ${YELLOW}python3 -m http.server 8000${NC} (from docs/ directory)"
    fi
    echo -e "   • Access at: ${YELLOW}http://localhost:8000${NC}"
    
else
    log_error "Build failed - docs/index.html was not created"
    exit 1
fi