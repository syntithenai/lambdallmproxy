#!/bin/bash

# AWS Lambda Deployment Script for llmproxy function
set -e  # Exit on any error

# Configuration
FUNCTION_NAME="llmproxy"
REGION="us-east-1"
SOURCE_FILE="lambda_search_llm_handler.js"
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

# Copy source file and rename to index.mjs (to match the handler)
cp "$OLDPWD/$SOURCE_FILE" index.mjs

# Create package.json for the Lambda function
cat > package.json << EOF
{
  "name": "llmproxy-lambda",
  "version": "1.0.0",
  "description": "AWS Lambda handler for intelligent search + LLM response",
  "main": "index.mjs",
  "type": "module",
  "dependencies": {},
  "engines": {
    "node": ">=18.0.0"
  }
}
EOF

# Create the deployment package
zip -q -r "$ZIP_FILE" index.mjs package.json

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
    
    # Wait a moment for the function to be ready
    sleep 2
    
    # Test the function with a simple invocation
    HTTP_TEST_RESULT=$(curl -s -X POST https://nrw7pperjjdswbmqgmigbwsbyi0rwdqf.lambda-url.us-east-1.on.aws/ \
        -H "Content-Type: application/json" \
        -d '{"query":"test deployment","apiKey":"test","accessSecret":"test","model":"groq:llama-3.1-8b-instant"}' \
        --max-time 10 || echo '{"error":"timeout"}')
    
    if echo "$HTTP_TEST_RESULT" | grep -q "Invalid API key"; then
        echo -e "${GREEN}✅ Function test passed (API key validation working)${NC}"
    elif echo "$HTTP_TEST_RESULT" | grep -q '"response":' && echo "$HTTP_TEST_RESULT" | grep -q '"metadata":'; then
        echo -e "${GREEN}✅ Function test passed (successful response)${NC}"
    elif echo "$HTTP_TEST_RESULT" | grep -q '"searchResults":' && echo "$HTTP_TEST_RESULT" | grep -q '"query":'; then
        echo -e "${GREEN}✅ Function test passed (search functionality working)${NC}"
    elif echo "$HTTP_TEST_RESULT" | grep -q "timeout"; then
        echo -e "${YELLOW}⚠️  Function test timed out${NC}"
    else
        echo -e "${YELLOW}⚠️  Function test returned unexpected result${NC}"
        echo "Response: $HTTP_TEST_RESULT"
    fi
    
else
    echo -e "${RED}❌ Failed to update Lambda function!${NC}"
    exit 1
fi

# Set environment variables from .env file if it exists
if [ -f "$OLDPWD/.env" ]; then
    echo -e "${BLUE}📁 Loading environment variables from .env...${NC}"
    
    # Get critical variables
    ACCESS_SECRET=$(grep '^ACCESS_SECRET=' "$OLDPWD/.env" | cut -d'=' -f2-)
    OPENAI_API_KEY=$(grep '^OPENAI_API_KEY=' "$OLDPWD/.env" | cut -d'=' -f2-)
    GROQ_API_KEY=$(grep '^GROQ_API_KEY=' "$OLDPWD/.env" | cut -d'=' -f2-)
    
    # Simple system prompts - use defaults in Lambda if these fail
    SYSTEM_PROMPT_DECISION=$(grep '^SYSTEM_PROMPT_DECISION=' "$OLDPWD/.env" | cut -d'=' -f2- | sed 's/^"//;s/"$//' | head -1)
    SYSTEM_PROMPT_DIRECT=$(grep '^SYSTEM_PROMPT_DIRECT=' "$OLDPWD/.env" | cut -d'=' -f2- | sed 's/^"//;s/"$//' | head -1)
    SYSTEM_PROMPT_SEARCH=$(grep '^SYSTEM_PROMPT_SEARCH=' "$OLDPWD/.env" | cut -d'=' -f2- | sed 's/^"//;s/"$//' | head -1)
    
    # Get template variables too
    DECISION_TEMPLATE=$(grep '^DECISION_TEMPLATE=' "$OLDPWD/.env" | cut -d'=' -f2- | sed 's/^"//;s/"$//' | head -1)
    SEARCH_TEMPLATE=$(grep '^SEARCH_TEMPLATE=' "$OLDPWD/.env" | cut -d'=' -f2- | sed 's/^"//;s/"$//' | head -1)
    
    # Get current environment variables
    CURRENT_ENV_JSON=$(aws lambda get-function-configuration \
        --function-name "$FUNCTION_NAME" \
        --region "$REGION" \
        --query 'Environment.Variables' \
        --output json 2>/dev/null)
    
    # Build environment variables string
    ENV_VARS="Variables={"
    
    # Add ACCESS_SECRET if it exists
    if [ -n "$ACCESS_SECRET" ]; then
        ENV_VARS="${ENV_VARS}ACCESS_SECRET=$ACCESS_SECRET,"
    fi
    
    # Add OPENAI_API_KEY if it exists
    if [ -n "$OPENAI_API_KEY" ]; then
        ENV_VARS="${ENV_VARS}OPENAI_API_KEY=$OPENAI_API_KEY,"
    fi
    
    # Add GROQ_API_KEY if it exists
    if [ -n "$GROQ_API_KEY" ]; then
        ENV_VARS="${ENV_VARS}GROQ_API_KEY=$GROQ_API_KEY,"
    fi
    
    # Add system prompt environment variables if they exist
    if [ -n "$SYSTEM_PROMPT_DECISION" ]; then
        ENV_VARS="${ENV_VARS}SYSTEM_PROMPT_DECISION=\"$SYSTEM_PROMPT_DECISION\","
    fi
    
    if [ -n "$SYSTEM_PROMPT_DIRECT" ]; then
        ENV_VARS="${ENV_VARS}SYSTEM_PROMPT_DIRECT=\"$SYSTEM_PROMPT_DIRECT\","
    fi
    
    if [ -n "$SYSTEM_PROMPT_SEARCH" ]; then
        ENV_VARS="${ENV_VARS}SYSTEM_PROMPT_SEARCH=\"$SYSTEM_PROMPT_SEARCH\","
    fi
    
    # Add template environment variables if they exist
    if [ -n "$DECISION_TEMPLATE" ]; then
        ENV_VARS="${ENV_VARS}DECISION_TEMPLATE=\"$DECISION_TEMPLATE\","
    fi
    
    if [ -n "$SEARCH_TEMPLATE" ]; then
        ENV_VARS="${ENV_VARS}SEARCH_TEMPLATE=\"$SEARCH_TEMPLATE\","
    fi
    
    # Remove trailing comma and close
    ENV_VARS="${ENV_VARS%,}}"
    
    aws lambda update-function-configuration \
        --function-name "$FUNCTION_NAME" \
        --region "$REGION" \
        --environment "$ENV_VARS" > /dev/null 2>&1
        
    if [ $? -eq 0 ]; then
        echo -e "${GREEN}✅ Environment variables configured from .env${NC}"
    else
        echo -e "${YELLOW}⚠️  Warning: Could not update environment variables${NC}"
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
    
    if [[ "$CURRENT_INVOKE_MODE" != "BUFFERED" ]]; then
        echo -e "${YELLOW}⚠️  InvokeMode is '$CURRENT_INVOKE_MODE', should be 'BUFFERED'${NC}"
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
            --cors AllowCredentials=true,AllowHeaders=content-type,authorization,origin,AllowMethods=*,AllowOrigins=*,MaxAge=86400 \
            --invoke-mode BUFFERED > /dev/null
            
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

# Cleanup
rm -rf "$TEMP_DIR"

# Clean up any temporary env-vars.json files that might have been created
if [ -f "env-vars.json" ]; then
    echo -e "${YELLOW}🧹 Cleaning up temporary env-vars.json file...${NC}"
    rm -f env-vars.json
fi

echo -e "${GREEN}🎉 Deployment completed successfully!${NC}"