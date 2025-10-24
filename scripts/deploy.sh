#!/bin/bash

# AWS Lambda Deployment Script for llmproxy function
set -e  # Exit on any error

# Configuration
FUNCTION_NAME="llmproxy"
REGION="us-east-1"
SOURCE_FILE="src/index.js"
TEMP_DIR="/tmp/lambda-deploy-$$"
ZIP_FILE="lambda-function.zip"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${BLUE}🚀 Deploying Lambda function ${FUNCTION_NAME}...${NC}"

# Check if .env file exists
if [ ! -f ".env" ]; then
    echo -e "${RED}❌ Error: .env file not found!${NC}"
    echo "Please create a .env file with your configuration."
    exit 1
fi

# Source the .env file
echo -e "${YELLOW}📝 Loading configuration from .env file...${NC}"
source .env

# Check if source file exists
if [ ! -f "$SOURCE_FILE" ]; then
    echo -e "${RED}❌ Source file $SOURCE_FILE not found!${NC}"
    exit 1
fi

# Check AWS CLI configuration
if ! aws sts get-caller-identity > /dev/null 2>&1; then
    echo -e "${RED}❌ AWS CLI not configured or credentials invalid!${NC}"
    exit 1
fi

# Create temporary directory
mkdir -p "$TEMP_DIR"
cd "$TEMP_DIR"

# Copy source file and rename to index.js (CommonJS module)
cp "$OLDPWD/$SOURCE_FILE" index.js

# Copy all module files from src/ directory
mkdir -p src
cp "$OLDPWD"/src/auth.js ./
cp "$OLDPWD"/src/providers.js ./
cp "$OLDPWD"/src/credential-pool.js ./
cp "$OLDPWD"/src/memory-tracker.js ./
cp "$OLDPWD"/src/html-parser.js ./
cp "$OLDPWD"/src/html-content-extractor.js ./
cp "$OLDPWD"/src/pricing.js ./
cp "$OLDPWD"/src/lambda_search_llm_handler.js ./
cp "$OLDPWD"/src/search.js ./ 2>/dev/null || true  # Optional, may not exist yet
cp "$OLDPWD"/src/llm_tools_adapter.js ./ 2>/dev/null || true
cp "$OLDPWD"/src/tools.js ./ 2>/dev/null || true
cp "$OLDPWD"/src/tavily-search.js ./ 2>/dev/null || true
cp "$OLDPWD"/src/pricing_scraper.js ./
cp "$OLDPWD"/src/model-selector.js ./
cp "$OLDPWD"/src/groq-rate-limits.js ./
cp "$OLDPWD"/src/youtube-api.js ./ 2>/dev/null || true

# Copy modular components (new refactored structure)
mkdir -p config utils services streaming endpoints tools model-selection routing retry mcp image-providers
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

# Copy PROVIDER_CATALOG.json (required for image generation)
cp "$OLDPWD"/PROVIDER_CATALOG.json ./ 2>/dev/null || echo -e "${YELLOW}⚠️  PROVIDER_CATALOG.json not found${NC}"

# Create minimal package.json - dependencies provided by layer
cat > package.json << EOF
{
  "name": "llmproxy-lambda",
  "dependencies": {
    "@distube/ytdl-core": "^4.14.4",
    "@ffmpeg-installer/ffmpeg": "^1.1.0",
    "fluent-ffmpeg": "^2.1.2",
    "form-data": "^4.0.0",
    "google-auth-library": "^10.4.0"
  }
}
EOF

# Install minimal dependencies (most come from layer)
echo -e "${YELLOW}📦 Installing minimal dependencies (others in layer)...${NC}"
npm install --omit=dev --no-package-lock --legacy-peer-deps

# List files before packaging
echo -e "${YELLOW}📦 Files to be packaged:${NC}"
ls -la *.js

# Create the deployment package (include node_modules)
zip -q -r "$ZIP_FILE" index.js package.json *.js PROVIDER_CATALOG.json config/ utils/ services/ streaming/ endpoints/ tools/ model-selection/ routing/ retry/ mcp/ image-providers/ node_modules/ 2>/dev/null || zip -q -r "$ZIP_FILE" index.js package.json

# Get current function configuration for backup
aws lambda get-function --function-name "$FUNCTION_NAME" --region "$REGION" > function-backup.json 2>/dev/null

# Update the Lambda function code
UPDATE_RESULT=$(aws lambda update-function-code \
    --function-name "$FUNCTION_NAME" \
    --region "$REGION" \
    --zip-file fileb://"$ZIP_FILE" \
    --output json)

if [ $? -eq 0 ]; then
    echo -e "${GREEN}✅ Function deployed successfully${NC}"
else
    echo -e "${RED}❌ Failed to update Lambda function!${NC}"
    exit 1
fi

# Set environment variables from .env file if it exists
if [ -f "$OLDPWD/.env" ]; then
    echo -e "${BLUE}📁 Loading environment variables from .env...${NC}"

    # Get critical variables
    # Use last occurrence if duplicated; trim CR
    ACCESS_SECRET=$(grep '^ACCESS_SECRET=' "$OLDPWD/.env" | tail -n1 | cut -d'=' -f2- | tr -d '\r')
    OPENAI_API_KEY=$(grep '^OPENAI_API_KEY=' "$OLDPWD/.env" | tail -n1 | cut -d'=' -f2- | tr -d '\r')
    GROQ_API_KEY=$(grep '^GROQ_API_KEY=' "$OLDPWD/.env" | tail -n1 | cut -d'=' -f2- | tr -d '\r')
    OPENAI_API_BASE_ENV=$(grep '^OPENAI_API_BASE=' "$OLDPWD/.env" | tail -n1 | cut -d'=' -f2- | tr -d '\r')
    OPENAI_MODEL_ENV=$(grep '^OPENAI_MODEL=' "$OLDPWD/.env" | tail -n1 | cut -d'=' -f2- | tr -d '\r')
    GROQ_MODEL_ENV=$(grep '^GROQ_MODEL=' "$OLDPWD/.env" | tail -n1 | cut -d'=' -f2- | tr -d '\r')
    LAMBDA_MEMORY_ENV=$(grep '^LAMBDA_MEMORY=' "$OLDPWD/.env" | tail -n1 | cut -d'=' -f2- | tr -d '\r')
    LAMBDA_TIMEOUT_ENV=$(grep '^LAMBDA_TIMEOUT=' "$OLDPWD/.env" | tail -n1 | cut -d'=' -f2- | tr -d '\r')
    ALLOWED_EMAILS_ENV=$(grep '^ALLOWED_EMAILS=' "$OLDPWD/.env" | tail -n1 | cut -d'=' -f2- | tr -d '\r')
    GOOGLE_CLIENT_ID=$(grep '^GOOGLE_CLIENT_ID=' "$OLDPWD/.env" | tail -n1 | cut -d'=' -f2- | tr -d '\r')
    REASONING_EFFORT_ENV=$(grep '^REASONING_EFFORT=' "$OLDPWD/.env" | tail -n1 | cut -d'=' -f2- | tr -d '\r')
    MAX_TOOL_ITERATIONS_ENV=$(grep '^MAX_TOOL_ITERATIONS=' "$OLDPWD/.env" | tail -n1 | cut -d'=' -f2- | tr -d '\r')
    GROQ_REASONING_MODELS_ENV=$(grep '^GROQ_REASONING_MODELS=' "$OLDPWD/.env" | tail -n1 | cut -d'=' -f2- | tr -d '\r')

    # Simple system prompts - use defaults in Lambda if these fail
    SYSTEM_PROMPT_DECISION=$(grep '^SYSTEM_PROMPT_DECISION=' "$OLDPWD/.env" | tail -n1 | cut -d'=' -f2- | sed 's/^"//;s/"$//' | tr -d '\r')
    SYSTEM_PROMPT_DIRECT=$(grep '^SYSTEM_PROMPT_DIRECT=' "$OLDPWD/.env" | tail -n1 | cut -d'=' -f2- | sed 's/^"//;s/"$//' | tr -d '\r')
    SYSTEM_PROMPT_SEARCH=$(grep '^SYSTEM_PROMPT_SEARCH=' "$OLDPWD/.env" | tail -n1 | cut -d'=' -f2- | sed 's/^"//;s/"$//' | tr -d '\r')

    # Get template variables too
    DECISION_TEMPLATE=$(grep '^DECISION_TEMPLATE=' "$OLDPWD/.env" | tail -n1 | cut -d'=' -f2- | sed 's/^"//;s/"$//' | tr -d '\r')
    SEARCH_TEMPLATE=$(grep '^SEARCH_TEMPLATE=' "$OLDPWD/.env" | tail -n1 | cut -d'=' -f2- | sed 's/^"//;s/"$//' | tr -d '\r')

    # Get current environment variables (safe even if jq missing)
    CURRENT_ENV_JSON=$(aws lambda get-function-configuration \
        --function-name "$FUNCTION_NAME" \
        --region "$REGION" \
        --query 'Environment.Variables' \
        --output json 2>/dev/null)

    # If jq is available, build JSON robustly; otherwise, skip env var update gracefully
    if command -v jq >/dev/null 2>&1; then
        ENV_VARS_JSON=$(jq -n \
            --arg ACCESS_SECRET "$ACCESS_SECRET" \
            --arg OPENAI_API_KEY "$OPENAI_API_KEY" \
            --arg GROQ_API_KEY "$GROQ_API_KEY" \
            --arg OPENAI_API_BASE "$OPENAI_API_BASE_ENV" \
            --arg OPENAI_MODEL "$OPENAI_MODEL_ENV" \
            --arg GROQ_MODEL "$GROQ_MODEL_ENV" \
            --arg SYSTEM_PROMPT_DECISION "$SYSTEM_PROMPT_DECISION" \
            --arg SYSTEM_PROMPT_DIRECT "$SYSTEM_PROMPT_DIRECT" \
            --arg SYSTEM_PROMPT_SEARCH "$SYSTEM_PROMPT_SEARCH" \
            --arg DECISION_TEMPLATE "$DECISION_TEMPLATE" \
            --arg SEARCH_TEMPLATE "$SEARCH_TEMPLATE" \
            --arg ALLOWED_EMAILS "$ALLOWED_EMAILS_ENV" \
            --arg GOOGLE_CLIENT_ID "$GOOGLE_CLIENT_ID" \
            --arg REASONING_EFFORT "$REASONING_EFFORT_ENV" \
            --arg MAX_TOOL_ITERATIONS "$MAX_TOOL_ITERATIONS_ENV" \
            --arg GROQ_REASONING_MODELS "$GROQ_REASONING_MODELS_ENV" \
            '{Variables: ({}
                + (if $ACCESS_SECRET != "" then {ACCESS_SECRET:$ACCESS_SECRET} else {} end)
                + (if $OPENAI_API_KEY != "" then {OPENAI_API_KEY:$OPENAI_API_KEY} else {} end)
                + (if $GROQ_API_KEY != "" then {GROQ_API_KEY:$GROQ_API_KEY} else {} end)
                + (if $OPENAI_API_BASE != "" then {OPENAI_API_BASE:$OPENAI_API_BASE} else {} end)
                + (if $OPENAI_MODEL != "" then {OPENAI_MODEL:$OPENAI_MODEL} else {} end)
                + (if $GROQ_MODEL != "" then {GROQ_MODEL:$GROQ_MODEL} else {} end)
                + (if $SYSTEM_PROMPT_DECISION != "" then {SYSTEM_PROMPT_DECISION:$SYSTEM_PROMPT_DECISION} else {} end)
                + (if $SYSTEM_PROMPT_DIRECT != "" then {SYSTEM_PROMPT_DIRECT:$SYSTEM_PROMPT_DIRECT} else {} end)
                + (if $SYSTEM_PROMPT_SEARCH != "" then {SYSTEM_PROMPT_SEARCH:$SYSTEM_PROMPT_SEARCH} else {} end)
                + (if $DECISION_TEMPLATE != "" then {DECISION_TEMPLATE:$DECISION_TEMPLATE} else {} end)
                + (if $SEARCH_TEMPLATE != "" then {SEARCH_TEMPLATE:$SEARCH_TEMPLATE} else {} end)
                + {ALLOWED_EMAILS:$ALLOWED_EMAILS}
                + (if $GOOGLE_CLIENT_ID != "" then {GOOGLE_CLIENT_ID:$GOOGLE_CLIENT_ID} else {} end)
                + (if $REASONING_EFFORT != "" then {REASONING_EFFORT:$REASONING_EFFORT} else {} end)
                + (if $MAX_TOOL_ITERATIONS != "" then {MAX_TOOL_ITERATIONS:$MAX_TOOL_ITERATIONS} else {} end)
                + (if $GROQ_REASONING_MODELS != "" then {GROQ_REASONING_MODELS:$GROQ_REASONING_MODELS} else {} end)
            )}' )

        aws lambda update-function-configuration \
            --function-name "$FUNCTION_NAME" \
            --region "$REGION" \
            --environment "$ENV_VARS_JSON" > /dev/null 2>&1

        if [ $? -eq 0 ]; then
            echo -e "${GREEN}✅ Environment variables configured from .env (including ALLOWED_EMAILS)${NC}"
        else
            echo -e "${YELLOW}⚠️  Warning: Could not update environment variables${NC}"
        fi
    else
        echo -e "${YELLOW}⚠️  'jq' not found. Skipping environment variables sync. Install 'jq' to enable this step.${NC}"
    fi

    # Update memory and timeout if provided
    if [ -n "$LAMBDA_MEMORY_ENV" ] || [ -n "$LAMBDA_TIMEOUT_ENV" ]; then
        echo -e "${YELLOW}🔧 Updating function memory/timeout from .env...${NC}"
        UPDATE_ARGS=(--function-name "$FUNCTION_NAME" --region "$REGION")
        if [ -n "$LAMBDA_MEMORY_ENV" ]; then UPDATE_ARGS+=(--memory-size "$LAMBDA_MEMORY_ENV"); fi
        if [ -n "$LAMBDA_TIMEOUT_ENV" ]; then UPDATE_ARGS+=(--timeout "$LAMBDA_TIMEOUT_ENV"); fi
        aws lambda update-function-configuration "${UPDATE_ARGS[@]}" >/dev/null 2>&1 || echo -e "${YELLOW}⚠️  Warning: Could not update memory/timeout${NC}"
    fi
else
    # Fallback to original logic for OPENAI_API_URL
    CURRENT_ENV_JSON=$(aws lambda get-function-configuration \
        --function-name "$FUNCTION_NAME" \
        --region "$REGION" \
        --query 'Environment.Variables' \
        --output json 2>/dev/null)

    if ! echo "$CURRENT_ENV_JSON" | jq -e '.OPENAI_API_HOSTNAME' > /dev/null 2>&1; then
        # Get current ACCESS_SECRET and add OPENAI_API_HOSTNAME
        ACCESS_SECRET=$(echo "$CURRENT_ENV_JSON" | jq -r '.ACCESS_SECRET // empty')
        if [ -n "$ACCESS_SECRET" ]; then
            ENV_VARS="Variables={ACCESS_SECRET=$ACCESS_SECRET,OPENAI_API_HOSTNAME=api.openai.com}"
        else
            ENV_VARS="Variables={OPENAI_API_HOSTNAME=api.openai.com}"
        fi
        
        aws lambda update-function-configuration \
            --function-name "$FUNCTION_NAME" \
            --region "$REGION" \
            --environment "$ENV_VARS" > /dev/null 2>&1
            
        if [ $? -eq 0 ]; then
            echo -e "${GREEN}✅ Environment configured${NC}"
        fi
    fi
fi

# Verify and configure CORS settings for Lambda Function URL
echo -e "${YELLOW}🌐 Checking Lambda Function URL CORS configuration...${NC}"
CORS_CONFIG=$(aws lambda get-function-url-config \
    --function-name "$FUNCTION_NAME" \
    --region "$REGION" \
    --output json 2>/dev/null)

if [ $? -eq 0 ]; then
    # Function URL exists, check CORS configuration
    CURRENT_ALLOW_ORIGINS=$(echo "$CORS_CONFIG" | jq -r '.Cors.AllowOrigins[]' 2>/dev/null | tr '\n' ',' | sed 's/,$//')
    CURRENT_ALLOW_METHODS=$(echo "$CORS_CONFIG" | jq -r '.Cors.AllowMethods[]' 2>/dev/null | tr '\n' ',' | sed 's/,$//')
    CURRENT_ALLOW_HEADERS=$(echo "$CORS_CONFIG" | jq -r '.Cors.AllowHeaders[]?' 2>/dev/null | tr '\n' ',' | sed 's/,$//')
    CURRENT_INVOKE_MODE=$(echo "$CORS_CONFIG" | jq -r '.InvokeMode' 2>/dev/null)
    
    # Check if CORS needs updating
    NEEDS_CORS_UPDATE=false
    
    if [[ "$CURRENT_ALLOW_ORIGINS" != "*" ]]; then
        echo -e "${YELLOW}⚠️  AllowOrigins is '$CURRENT_ALLOW_ORIGINS', should be '*'${NC}"
        NEEDS_CORS_UPDATE=true
    fi
    
    if [[ "$CURRENT_ALLOW_METHODS" != "*" ]]; then
        echo -e "${YELLOW}⚠️  AllowMethods is '$CURRENT_ALLOW_METHODS', should be '*'${NC}"
        NEEDS_CORS_UPDATE=true
    fi
    
    if [[ "$CURRENT_INVOKE_MODE" != "RESPONSE_STREAM" ]]; then
        echo -e "${YELLOW}⚠️  InvokeMode is '$CURRENT_INVOKE_MODE', should be 'RESPONSE_STREAM'${NC}"
        NEEDS_CORS_UPDATE=true
    fi
    
    # Check required headers
    if ! echo "$CURRENT_ALLOW_HEADERS" | grep -q "content-type" || \
       ! echo "$CURRENT_ALLOW_HEADERS" | grep -q "authorization" || \
       ! echo "$CURRENT_ALLOW_HEADERS" | grep -q "origin"; then
        echo -e "${YELLOW}⚠️  AllowHeaders missing required headers${NC}"
        NEEDS_CORS_UPDATE=true
    fi
    
    if [ "$NEEDS_CORS_UPDATE" = true ]; then
        echo -e "${YELLOW}🔧 Updating CORS configuration...${NC}"
        
        aws lambda update-function-url-config \
            --function-name "$FUNCTION_NAME" \
            --region "$REGION" \
            --cors AllowCredentials=true,AllowHeaders=content-type,authorization,origin,accept,cache-control,x-requested-with,accept-encoding,accept-language,connection,host,referer,user-agent,x-google-access-token,x-billing-sync,AllowMethods=*,AllowOrigins=*,MaxAge=86400,ExposeHeaders=content-type,content-length,date,x-amzn-requestid \
            --invoke-mode RESPONSE_STREAM > /dev/null
            
        if [ $? -eq 0 ]; then
            echo -e "${GREEN}✅ CORS configuration updated successfully${NC}"
        else
            echo -e "${YELLOW}⚠️  Could not update CORS configuration${NC}"
        fi
    else
        echo -e "${GREEN}✅ CORS configuration verified${NC}"
    fi
else
    echo -e "${RED}❌ Could not retrieve Function URL configuration${NC}"
    echo -e "${YELLOW}💡 You may need to create a Function URL first${NC}"
fi

# Update UI .env file with Lambda URL
echo -e "${BLUE}🔄 Updating UI .env file with Lambda URL...${NC}"
FUNCTION_URL=$(aws lambda get-function-url-config \
    --function-name "$FUNCTION_NAME" \
    --region "$REGION" \
    --query 'FunctionUrl' \
    --output text 2>/dev/null | tr -d '\n' | sed 's/\/$//')

if [ -n "$FUNCTION_URL" ]; then
    UI_ENV_FILE="$OLDPWD/ui-new/.env"
    if [ -f "$UI_ENV_FILE" ]; then
        # Create backup before modifying
        cp "$UI_ENV_FILE" "${UI_ENV_FILE}.backup.$(date +%Y%m%d-%H%M%S)"
        echo -e "${YELLOW}📋 Created backup: ${UI_ENV_FILE}.backup.$(date +%Y%m%d-%H%M%S)${NC}"
        
        # Update VITE_API_BASE with current Lambda URL
        if grep -q "VITE_API_BASE=" "$UI_ENV_FILE"; then
            sed -i "s|VITE_API_BASE=.*|VITE_API_BASE=${FUNCTION_URL}|" "$UI_ENV_FILE"
            echo -e "${GREEN}✅ Updated VITE_API_BASE in ${UI_ENV_FILE}${NC}"
        else
            echo "VITE_API_BASE=${FUNCTION_URL}" >> "$UI_ENV_FILE"
            echo -e "${GREEN}✅ Added VITE_API_BASE to ${UI_ENV_FILE}${NC}"
        fi
        
        # Update VITE_LAMBDA_URL with current Lambda URL
        if grep -q "VITE_LAMBDA_URL=" "$UI_ENV_FILE"; then
            sed -i "s|VITE_LAMBDA_URL=.*|VITE_LAMBDA_URL=${FUNCTION_URL}|" "$UI_ENV_FILE"
            echo -e "${GREEN}✅ Updated VITE_LAMBDA_URL in ${UI_ENV_FILE}${NC}"
        else
            echo "VITE_LAMBDA_URL=${FUNCTION_URL}" >> "$UI_ENV_FILE"
            echo -e "${GREEN}✅ Added VITE_LAMBDA_URL to ${UI_ENV_FILE}${NC}"
        fi
        
        # Add timestamp comment at the top
        sed -i "1i# Auto-updated by deployment script: $(date -u +"%Y-%m-%d %H:%M:%S UTC")" "$UI_ENV_FILE"
        
        echo -e "${GREEN}✅ UI .env file updated with Lambda URL: ${FUNCTION_URL}${NC}"
        echo -e "${YELLOW}💡 Rebuild the UI to apply changes:${NC}"
        echo -e "   ${BLUE}make build-ui${NC}  or  ${BLUE}make deploy-ui${NC}"
    else
        echo -e "${YELLOW}⚠️  UI .env file not found at ${UI_ENV_FILE}${NC}"
        echo -e "${YELLOW}💡 Consider creating it with:${NC}"
        echo -e "   ${BLUE}VITE_API_BASE=${FUNCTION_URL}${NC}"
    fi
else
    echo -e "${YELLOW}⚠️  Could not retrieve Lambda Function URL${NC}"
fi

# Cleanup
rm -rf "$TEMP_DIR"

# Clean up any temporary env-vars.json files that might have been created
if [ -f "env-vars.json" ]; then
    echo -e "${YELLOW}🧹 Cleaning up temporary env-vars.json file...${NC}"
    rm -f env-vars.json
fi

echo -e "${GREEN}🎉 Deployment completed successfully!${NC}"