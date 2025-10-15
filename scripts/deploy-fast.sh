#!/bin/bash

# Fast Lambda Deployment Script (Code Only - Uses Layer for Dependencies)
# Use this for rapid iterations during development
set -e

# Disable AWS CLI pager to prevent console jamming
export AWS_PAGER=""

# Configuration
FUNCTION_NAME="llmproxy"
REGION="us-east-1"
SOURCE_FILE="src/index.js"
TEMP_DIR="/tmp/lambda-fast-deploy-$$"
ZIP_FILE="function.zip"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

echo -e "${BLUE}⚡ Fast deploying Lambda function ${FUNCTION_NAME}...${NC}"

# Load deployment config (S3 bucket, Layer ARN)
if [ -f ".deployment-config" ]; then
    source .deployment-config
    echo -e "${GREEN}✅ Using Layer ARN: ${LAYER_ARN}${NC}"
else
    echo -e "${YELLOW}⚠️  No .deployment-config found. Run ./scripts/deploy-layer.sh first${NC}"
    echo -e "${YELLOW}   Falling back to full deployment...${NC}"
    exec ./scripts/deploy.sh
fi

# Check if source file exists
if [ ! -f "$SOURCE_FILE" ]; then
    echo -e "${RED}❌ Source file $SOURCE_FILE not found!${NC}"
    exit 1
fi

# Create temporary directory
mkdir -p "$TEMP_DIR"
cd "$TEMP_DIR"

# Copy source file and rename to index.js
cp "$OLDPWD/$SOURCE_FILE" index.js

# Copy all module files (NO node_modules - that's in the layer!)
cp "$OLDPWD"/src/auth.js ./
cp "$OLDPWD"/src/providers.js ./
cp "$OLDPWD"/src/credential-pool.js ./
cp "$OLDPWD"/src/memory-tracker.js ./
cp "$OLDPWD"/src/html-parser.js ./
cp "$OLDPWD"/src/html-content-extractor.js ./
cp "$OLDPWD"/src/pricing.js ./
cp "$OLDPWD"/src/lambda_search_llm_handler.js ./
cp "$OLDPWD"/src/search.js ./ 2>/dev/null || true
cp "$OLDPWD"/src/llm_tools_adapter.js ./ 2>/dev/null || true
cp "$OLDPWD"/src/tools.js ./ 2>/dev/null || true
cp "$OLDPWD"/src/tavily-search.js ./ 2>/dev/null || true
cp "$OLDPWD"/src/pricing_scraper.js ./
cp "$OLDPWD"/src/model-selector.js ./
cp "$OLDPWD"/src/groq-rate-limits.js ./
cp "$OLDPWD"/src/youtube-api.js ./ 2>/dev/null || true

# Copy modular components
mkdir -p config utils services streaming endpoints tools model-selection routing retry mcp image-providers guardrails providers
cp -r "$OLDPWD"/src/config/* ./config/ 2>/dev/null || true
cp -r "$OLDPWD"/src/utils/* ./utils/ 2>/dev/null || true
cp -r "$OLDPWD"/src/services/* ./services/ 2>/dev/null || true
cp -r "$OLDPWD"/src/streaming/* ./streaming/ 2>/dev/null || true
cp -r "$OLDPWD"/src/endpoints/* ./endpoints/ 2>/dev/null || true
cp -r "$OLDPWD"/src/tools/* ./tools/ 2>/dev/null || true
cp -r "$OLDPWD"/src/model-selection/* ./model-selection/ 2>/dev/null || true
cp -r "$OLDPWD"/src/routing/* ./routing/ 2>/dev/null || true
cp -r "$OLDPWD"/src/retry/* ./retry/ 2>/dev/null || true
cp -r "$OLDPWD"/src/mcp/* ./mcp/ 2>/dev/null || true
cp -r "$OLDPWD"/src/image-providers/* ./image-providers/ 2>/dev/null || true
cp -r "$OLDPWD"/src/guardrails/* ./guardrails/ 2>/dev/null || true
cp -r "$OLDPWD"/src/providers/* ./providers/ 2>/dev/null || true

# Copy PROVIDER_CATALOG.json (required for image generation)
if cp "$OLDPWD"/PROVIDER_CATALOG.json ./ 2>/dev/null; then
    echo -e "${GREEN}✅ Copied PROVIDER_CATALOG.json${NC}"
    ls -lh PROVIDER_CATALOG.json
else
    echo -e "${RED}❌ Failed to copy PROVIDER_CATALOG.json${NC}"
fi

# List files
echo -e "${YELLOW}📦 Code files to deploy:${NC}"
find . -name "*.js" | head -20
echo -e "${YELLOW}📦 JSON files to deploy:${NC}"
find . -name "*.json" -not -path "*/node_modules/*"

# Create the deployment package (CODE ONLY - no node_modules!)
echo -e "${YELLOW}🗜️  Creating lightweight package...${NC}"
zip -q -r "$ZIP_FILE" . -x "node_modules/*"

# Get package size
SIZE=$(ls -lh "$ZIP_FILE" | awk '{print $5}')
echo -e "${GREEN}Package size: ${SIZE} (much smaller without dependencies!)${NC}"

# Upload to S3 (more reliable than direct upload)
TIMESTAMP=$(date +%Y%m%d-%H%M%S)
S3_KEY="functions/llmproxy-${TIMESTAMP}.zip"

echo -e "${YELLOW}☁️  Uploading to S3...${NC}"
aws s3 cp "$ZIP_FILE" "s3://${S3_BUCKET}/${S3_KEY}"

# Update Lambda function code from S3
echo -e "${YELLOW}🚀 Updating Lambda function...${NC}"
UPDATE_RESULT=$(aws lambda update-function-code \
    --function-name "$FUNCTION_NAME" \
    --region "$REGION" \
    --s3-bucket "$S3_BUCKET" \
    --s3-key "$S3_KEY" \
    --output json)

if [ $? -eq 0 ]; then
    echo -e "${GREEN}✅ Function code deployed successfully${NC}"
    
    # Update function to use the layer (if not already)
    echo -e "${YELLOW}🔗 Ensuring layer is attached...${NC}"
    aws lambda update-function-configuration \
        --function-name "$FUNCTION_NAME" \
        --region "$REGION" \
        --layers "$LAYER_ARN" \
        --output json > /dev/null 2>&1 || true
    
    echo -e "${GREEN}✅ Layer attached${NC}"
else
    echo -e "${RED}❌ Failed to update Lambda function!${NC}"
    exit 1
fi

# Wait for function to be ready
echo -e "${YELLOW}⏳ Waiting for function to be ready...${NC}"
sleep 3

# Check status
STATUS=$(aws lambda get-function \
    --function-name "$FUNCTION_NAME" \
    --region "$REGION" \
    --query 'Configuration.[State,LastUpdateStatus]' \
    --output text)

echo -e "${BLUE}Status: ${STATUS}${NC}"

# Get Lambda Function URL
echo -e "${YELLOW}🔍 Retrieving Lambda Function URL...${NC}"
FUNCTION_URL=$(aws lambda get-function-url-config \
    --function-name "$FUNCTION_NAME" \
    --region "$REGION" \
    --query 'FunctionUrl' \
    --output text 2>/dev/null | tr -d '\n' | sed 's/\/$//')

if [ -n "$FUNCTION_URL" ]; then
    echo -e "${GREEN}✅ Lambda URL: ${FUNCTION_URL}${NC}"
    
    # Update UI .env file
    UI_ENV_FILE="$OLDPWD/ui-new/.env"
    if [ -f "$UI_ENV_FILE" ]; then
        echo -e "${YELLOW}📝 Updating UI environment configuration...${NC}"
        
        # Create backup
        cp "$UI_ENV_FILE" "${UI_ENV_FILE}.backup.$(date +%Y%m%d-%H%M%S)"
        
        # Update VITE_API_BASE
        if grep -q "VITE_API_BASE=" "$UI_ENV_FILE"; then
            # Replace existing value
            sed -i "s|VITE_API_BASE=.*|VITE_API_BASE=${FUNCTION_URL}|" "$UI_ENV_FILE"
        else
            # Add new value
            echo "VITE_API_BASE=${FUNCTION_URL}" >> "$UI_ENV_FILE"
        fi
        
        # Update VITE_LAMBDA_URL (legacy)
        if grep -q "VITE_LAMBDA_URL=" "$UI_ENV_FILE"; then
            sed -i "s|VITE_LAMBDA_URL=.*|VITE_LAMBDA_URL=${FUNCTION_URL}|" "$UI_ENV_FILE"
        else
            echo "VITE_LAMBDA_URL=${FUNCTION_URL}" >> "$UI_ENV_FILE"
        fi
        
        # Add update timestamp comment
        if ! grep -q "# Auto-updated:" "$UI_ENV_FILE"; then
            sed -i "1i# Auto-updated: $(date -u +"%Y-%m-%d %H:%M:%S UTC")" "$UI_ENV_FILE"
        else
            sed -i "s|# Auto-updated:.*|# Auto-updated: $(date -u +"%Y-%m-%d %H:%M:%S UTC")|" "$UI_ENV_FILE"
        fi
        
        echo -e "${GREEN}✅ UI .env updated with Lambda URL${NC}"
        echo -e "${BLUE}   Rebuild UI with: make build-ui or make deploy-ui${NC}"
    else
        echo -e "${YELLOW}⚠️  UI .env file not found at ${UI_ENV_FILE}${NC}"
        echo -e "${YELLOW}   Create it with: echo 'VITE_API_BASE=${FUNCTION_URL}' > ${UI_ENV_FILE}${NC}"
    fi
else
    echo -e "${YELLOW}⚠️  Could not retrieve Lambda Function URL${NC}"
fi

# Cleanup
cd "$OLDPWD"
rm -rf "$TEMP_DIR"

echo -e "${GREEN}🎉 Fast deployment complete!${NC}"
echo -e "${BLUE}⚡ Deployment time: ~5-10 seconds vs 2-3 minutes with full deploy${NC}"
echo -e "${YELLOW}💡 Test at: ${FUNCTION_URL:-https://nrw7pperjjdswbmqgmigbwsbyi0rwdqf.lambda-url.us-east-1.on.aws/}${NC}"
