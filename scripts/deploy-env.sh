#!/bin/bash
# ================================================================
# Deploy Environment Variables to AWS Lambda
# ================================================================
# This script reads .env file and updates Lambda function environment variables
# Only non-commented, non-empty variables are deployed
# ================================================================

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
FUNCTION_NAME="llmproxy"
ENV_FILE=".env"
REGION="us-east-1"
SKIP_CONFIRMATION=false

# Parse command line arguments
while [[ $# -gt 0 ]]; do
    case $1 in
        -y|--yes|--no-confirm)
            SKIP_CONFIRMATION=true
            shift
            ;;
        -h|--help)
            echo "Deploy Environment Variables to AWS Lambda"
            echo ""
            echo "Usage: $0 [options]"
            echo ""
            echo "Options:"
            echo "  -y, --yes, --no-confirm    Skip confirmation prompt"
            echo "  -h, --help                 Show this help message"
            echo ""
            echo "Examples:"
            echo "  $0                  # Deploy with confirmation"
            echo "  $0 --yes            # Deploy without confirmation"
            echo "  make deploy-env     # Deploy without confirmation (via Makefile)"
            exit 0
            ;;
        *)
            echo -e "${RED}Unknown option: $1${NC}"
            echo "Use --help for usage information"
            exit 1
            ;;
    esac
done

echo -e "${BLUE}════════════════════════════════════════════════════════════${NC}"
echo -e "${BLUE}  Lambda Environment Variables Deployment${NC}"
echo -e "${BLUE}════════════════════════════════════════════════════════════${NC}"
echo ""

# Check if .env file exists
if [ ! -f "$ENV_FILE" ]; then
    echo -e "${RED}✗ Error: $ENV_FILE file not found${NC}"
    echo -e "${YELLOW}  Create one from .env.example: cp .env.example .env${NC}"
    exit 1
fi

echo -e "${BLUE}📄 Reading environment variables from $ENV_FILE...${NC}"

# Parse .env file and build JSON for AWS CLI
# Skip comments, empty lines, and extract key=value pairs
ENV_VARS_JSON="{"
FIRST=true
COUNT=0

while IFS='=' read -r key value; do
    # Skip comments and empty lines
    if [[ "$key" =~ ^[[:space:]]*# ]] || [[ -z "$key" ]]; then
        continue
    fi
    
    # Trim whitespace
    key=$(echo "$key" | xargs)
    value=$(echo "$value" | xargs)
    
    # Skip if key or value is empty
    if [[ -z "$key" ]] || [[ -z "$value" ]]; then
        continue
    fi
    
    # Skip AWS auto-set variables
    if [[ "$key" == "AWS_LAMBDA_FUNCTION_MEMORY_SIZE" ]]; then
        continue
    fi
    
    # Remove quotes from value if present
    value="${value%\"}"
    value="${value#\"}"
    value="${value%\'}"
    value="${value#\'}"
    
    # Add comma if not first entry
    if [ "$FIRST" = false ]; then
        ENV_VARS_JSON+=","
    fi
    FIRST=false
    
    # Escape special characters in value for JSON
    # Replace newlines with \n, quotes with \", etc.
    value=$(echo "$value" | sed 's/\\/\\\\/g' | sed 's/"/\\"/g' | sed ':a;N;$!ba;s/\n/\\n/g')
    
    ENV_VARS_JSON+="\"$key\":\"$value\""
    COUNT=$((COUNT + 1))
    
    # Show variable name (hide sensitive values)
    if [[ "$key" == *"KEY"* ]] || [[ "$key" == *"SECRET"* ]]; then
        echo -e "  ${GREEN}✓${NC} $key = ${YELLOW}[REDACTED]${NC}"
    else
        # Truncate long values for display
        DISPLAY_VALUE="$value"
        if [ ${#DISPLAY_VALUE} -gt 60 ]; then
            DISPLAY_VALUE="${DISPLAY_VALUE:0:60}..."
        fi
        echo -e "  ${GREEN}✓${NC} $key = $DISPLAY_VALUE"
    fi
    
done < "$ENV_FILE"

ENV_VARS_JSON+="}"

echo ""
echo -e "${BLUE}📊 Summary: Found $COUNT environment variables to deploy${NC}"
echo ""

# Confirm deployment (unless --yes flag is used)
if [ "$SKIP_CONFIRMATION" = false ]; then
    echo -e "${YELLOW}⚠️  This will update Lambda function: $FUNCTION_NAME in $REGION${NC}"
    read -p "Continue? (y/n) " -n 1 -r
    echo ""

    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        echo -e "${YELLOW}Deployment cancelled${NC}"
        exit 0
    fi
else
    echo -e "${BLUE}ℹ️  Skipping confirmation (--yes flag)${NC}"
fi

echo ""
echo -e "${BLUE}🚀 Deploying environment variables to Lambda...${NC}"

# Save JSON to temp file for AWS CLI
echo "$ENV_VARS_JSON" > /tmp/lambda-env-vars.json

# Update Lambda function environment variables
aws lambda update-function-configuration \
    --function-name "$FUNCTION_NAME" \
    --region "$REGION" \
    --environment "{\"Variables\": $ENV_VARS_JSON}" \
    --output json > /tmp/lambda-env-deploy.json

# Check if successful
if [ $? -eq 0 ]; then
    echo ""
    echo -e "${GREEN}════════════════════════════════════════════════════════════${NC}"
    echo -e "${GREEN}  ✓ Environment variables deployed successfully!${NC}"
    echo -e "${GREEN}════════════════════════════════════════════════════════════${NC}"
    echo ""
    echo -e "${BLUE}Function Details:${NC}"
    
    # Extract and display key information
    LAST_MODIFIED=$(jq -r '.LastModified' /tmp/lambda-env-deploy.json)
    STATE=$(jq -r '.State' /tmp/lambda-env-deploy.json)
    
    echo -e "  Function: ${GREEN}$FUNCTION_NAME${NC}"
    echo -e "  Region: ${GREEN}$REGION${NC}"
    echo -e "  Last Modified: ${GREEN}$LAST_MODIFIED${NC}"
    echo -e "  State: ${GREEN}$STATE${NC}"
    echo -e "  Variables Deployed: ${GREEN}$COUNT${NC}"
    echo ""
    echo -e "${YELLOW}ℹ️  Note: It may take a few seconds for changes to take effect${NC}"
    echo -e "${YELLOW}ℹ️  Run 'make logs' to verify the function is using new variables${NC}"
    echo ""
    
    # Clean up temp file
    rm -f /tmp/lambda-env-deploy.json
else
    echo ""
    echo -e "${RED}════════════════════════════════════════════════════════════${NC}"
    echo -e "${RED}  ✗ Deployment failed${NC}"
    echo -e "${RED}════════════════════════════════════════════════════════════${NC}"
    echo ""
    echo -e "${YELLOW}Common issues:${NC}"
    echo -e "  1. AWS credentials not configured (run 'aws configure')"
    echo -e "  2. Insufficient IAM permissions"
    echo -e "  3. Function name or region incorrect"
    echo -e "  4. JSON syntax error in environment variables"
    echo ""
    exit 1
fi
