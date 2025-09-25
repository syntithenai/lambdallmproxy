#!/bin/bash

# Quick Development Deployment Script
# Optimized for frequent code changes during development

set -e  # Exit on any error

# Configuration
FUNCTION_NAME="llmproxy"
REGION="us-east-1"
SOURCE_FILE="src/lambda_search_llm_handler.js"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${BLUE}🔥 Quick Development Deploy - ${FUNCTION_NAME}${NC}"
echo -e "${YELLOW}This is optimized for AI agents making frequent code changes.${NC}"

# Check if source file exists
if [ ! -f "$SOURCE_FILE" ]; then
    echo -e "${RED}❌ Source file $SOURCE_FILE not found!${NC}"
    exit 1
fi

# Check AWS CLI configuration quickly
if ! aws sts get-caller-identity > /dev/null 2>&1; then
    echo -e "${RED}❌ AWS CLI not configured or credentials invalid!${NC}"
    exit 1
fi

# Quick inline deployment (no temp files)
echo -e "${YELLOW}📦 Creating deployment package...${NC}"

# Create zip with just the handler file renamed to index.js
zip -q lambda-function.zip -j "$SOURCE_FILE"
zip -q lambda-function.zip -r src/ -x "src/lambda_search_llm_handler.js"

# Rename the main file to index.js in the zip
zip -q lambda-function.zip -d "$SOURCE_FILE"
cp "$SOURCE_FILE" index.js
zip -q lambda-function.zip index.js
rm index.js

echo -e "${YELLOW}🚀 Deploying to AWS Lambda...${NC}"

# Deploy with minimal output
aws lambda update-function-code \
    --function-name "$FUNCTION_NAME" \
    --zip-file fileb://lambda-function.zip \
    --region "$REGION" \
    --query 'LastModified' \
    --output text > /dev/null

# Clean up
rm lambda-function.zip

echo -e "${GREEN}✅ Quick deploy complete!${NC}"
echo -e "${BLUE}💡 Function updated at: $(date)${NC}"
echo -e "${YELLOW}🔗 Test at: https://lambdallmproxy.pages.dev${NC}"