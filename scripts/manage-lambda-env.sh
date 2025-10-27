#!/bin/bash
# ==============================================================================
# Lambda Environment Variable Management Script
# ==============================================================================
# This script helps manage environment variables for the Lambda function
# to test different deployment scenarios
# ==============================================================================

FUNCTION_NAME="llmproxy"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# ==============================================================================
# Helper Functions
# ==============================================================================

print_header() {
    echo -e "${BLUE}========================================${NC}"
    echo -e "${BLUE}$1${NC}"
    echo -e "${BLUE}========================================${NC}"
}

print_success() {
    echo -e "${GREEN}✅ $1${NC}"
}

print_warning() {
    echo -e "${YELLOW}⚠️  $1${NC}"
}

print_error() {
    echo -e "${RED}❌ $1${NC}"
}

# ==============================================================================
# Mode: Clear Provider Keys (Pure Client Mode)
# ==============================================================================

clear_provider_keys() {
    print_header "Clearing Provider Keys for Pure Client Mode"
    
    echo "This will remove OPENAI_KEY and GROQ_KEY from Lambda"
    echo "Users will need to provide their own API keys"
    echo ""
    read -p "Continue? (y/n) " -n 1 -r
    echo
    
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        print_warning "Cancelled"
        exit 0
    fi
    
    # Get current environment variables
    echo "📥 Getting current environment variables..."
    CURRENT_ENV=$(aws lambda get-function-configuration \
        --function-name $FUNCTION_NAME \
        --query 'Environment.Variables' \
        --output json)
    
    # Remove provider keys
    UPDATED_ENV=$(echo "$CURRENT_ENV" | jq 'del(.OPENAI_KEY, .GROQ_KEY)')
    
    # Update Lambda
    echo "🔄 Updating Lambda function..."
    aws lambda update-function-configuration \
        --function-name $FUNCTION_NAME \
        --environment "Variables=$UPDATED_ENV" \
        > /dev/null
    
    print_success "Provider keys cleared from Lambda"
    print_warning "Users must now provide their own API keys"
    
    echo ""
    echo "Current environment variables:"
    aws lambda get-function-configuration \
        --function-name $FUNCTION_NAME \
        --query 'Environment.Variables' \
        --output json
}

# ==============================================================================
# Mode: Set Legacy Provider Keys
# ==============================================================================

set_legacy_keys() {
    print_header "Setting Legacy Provider Keys"
    
    echo "Enter OpenAI API Key (or press Enter to skip):"
    read -r OPENAI_KEY
    
    echo "Enter Groq API Key (or press Enter to skip):"
    read -r GROQ_KEY
    
    if [ -z "$OPENAI_KEY" ] && [ -z "$GROQ_KEY" ]; then
        print_error "No keys provided"
        exit 1
    fi
    
    # Get current environment variables
    echo "📥 Getting current environment variables..."
    CURRENT_ENV=$(aws lambda get-function-configuration \
        --function-name $FUNCTION_NAME \
        --query 'Environment.Variables' \
        --output json)
    
    # Add provider keys
    UPDATED_ENV="$CURRENT_ENV"
    if [ -n "$OPENAI_KEY" ]; then
        UPDATED_ENV=$(echo "$UPDATED_ENV" | jq --arg key "$OPENAI_KEY" '. + {OPENAI_KEY: $key}')
    fi
    if [ -n "$GROQ_KEY" ]; then
        UPDATED_ENV=$(echo "$UPDATED_ENV" | jq --arg key "$GROQ_KEY" '. + {GROQ_KEY: $key}')
    fi
    
    # Update Lambda
    echo "🔄 Updating Lambda function..."
    aws lambda update-function-configuration \
        --function-name $FUNCTION_NAME \
        --environment "Variables=$UPDATED_ENV" \
        > /dev/null
    
    print_success "Provider keys set in Lambda"
    print_success "Authorized users can now use server-side keys"
}

# ==============================================================================
# Mode: Set New Format Providers
# ==============================================================================

set_new_format_providers() {
    print_header "Setting New Format Provider Keys"
    
    echo "This will set provider keys in the new indexed format:"
    echo "  - P_T<N>"
    echo "  - P_K<N>"
    echo ""
    
    # Read from .env file
    if [ ! -f ".env" ]; then
        print_error ".env file not found"
        exit 1
    fi
    
    echo "Reading provider configuration from .env file..."
    
    # Get current environment variables
    echo "📥 Getting current environment variables..."
    CURRENT_ENV=$(aws lambda get-function-configuration \
        --function-name $FUNCTION_NAME \
        --query 'Environment.Variables' \
        --output json)
    
    # Extract provider variables from .env
    PROVIDER_VARS=$(grep "^P_" .env | grep -v "^#")
    
    if [ -z "$PROVIDER_VARS" ]; then
        print_warning "No uncommented provider variables found in .env"
        echo "Please uncomment the provider lines in .env first"
        exit 1
    fi
    
    # Add each provider variable
    UPDATED_ENV="$CURRENT_ENV"
    while IFS='=' read -r key value; do
        if [ -n "$key" ] && [ -n "$value" ]; then
            echo "  Adding: $key"
            UPDATED_ENV=$(echo "$UPDATED_ENV" | jq --arg k "$key" --arg v "$value" '. + {($k): $v}')
        fi
    done <<< "$PROVIDER_VARS"
    
    # Update Lambda
    echo "🔄 Updating Lambda function..."
    aws lambda update-function-configuration \
        --function-name $FUNCTION_NAME \
        --environment "Variables=$UPDATED_ENV" \
        > /dev/null
    
    print_success "New format provider keys set in Lambda"
    print_success "Authorized users can now use server-side providers"
}

# ==============================================================================
# Mode: Show Current Configuration
# ==============================================================================

show_current() {
    print_header "Current Lambda Environment Variables"
    
    aws lambda get-function-configuration \
        --function-name $FUNCTION_NAME \
        --query 'Environment.Variables' \
        --output json | jq '.'
}

# ==============================================================================
# Main Menu
# ==============================================================================

show_menu() {
    echo ""
    echo "Lambda Environment Variable Manager"
    echo "====================================="
    echo "1) Show current environment variables"
    echo "2) Clear provider keys (pure client mode)"
    echo "3) Set legacy provider keys (OPENAI_KEY, GROQ_KEY)"
    echo "4) Set new format providers (from .env file)"
    echo "5) Exit"
    echo ""
}

main() {
    while true; do
        show_menu
        read -p "Select option: " choice
        case $choice in
            1) show_current ;;
            2) clear_provider_keys ;;
            3) set_legacy_keys ;;
            4) set_new_format_providers ;;
            5) exit 0 ;;
            *) print_error "Invalid option" ;;
        esac
        echo ""
        read -p "Press Enter to continue..."
    done
}

# Run main menu
main
