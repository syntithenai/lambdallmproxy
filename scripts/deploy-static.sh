#!/bin/bash

# AWS Lambda Deployment Script for llmproxy-static function
set -e  # Exit on any error

# Configuration
FUNCTION_NAME="llmproxy-static"
REGION="us-east-1"
SOURCE_FILE="src/static-index.js"
TEMP_DIR="/tmp/lambda-static-deploy-$$"
ZIP_FILE="lambda-static-function.zip"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${BLUE}🚀 Deploying Static Lambda function ${FUNCTION_NAME}...${NC}"

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

# Copy source file and rename to index.js
cp "$OLDPWD/$SOURCE_FILE" index.js

# Copy required module files
echo -e "${YELLOW}📦 Copying dependencies...${NC}"
cp "$OLDPWD"/src/auth.js ./

# Create endpoints directory and copy needed endpoints
mkdir -p endpoints
cp "$OLDPWD"/src/endpoints/proxy.js ./endpoints/
cp "$OLDPWD"/src/endpoints/static.js ./endpoints/

# Copy docs directory for static file serving
echo -e "${YELLOW}📦 Copying static files from docs/...${NC}"
mkdir -p docs
cp -r "$OLDPWD"/docs/* ./docs/ 2>/dev/null || echo "No docs directory found, skipping"

# Create package.json for the Lambda function with dependencies
cat > package.json << EOF
{
  "name": "llmproxy-static-lambda",
  "version": "1.0.0",
  "description": "AWS Lambda handler for static content and buffered proxy",
  "main": "index.js",
  "dependencies": {
    "google-auth-library": "^10.4.0"
  },
  "engines": {
    "node": ">=18.0.0"
  }
}
EOF

# Install production dependencies
echo -e "${YELLOW}📦 Installing production dependencies...${NC}"
npm install --production --no-package-lock

# List files before packaging
echo -e "${YELLOW}📦 Files to be packaged:${NC}"
ls -la

# Create the deployment package
echo -e "${YELLOW}📦 Creating deployment package...${NC}"
zip -q -r "$ZIP_FILE" index.js package.json *.js endpoints/ docs/ node_modules/ 2>/dev/null || zip -q -r "$ZIP_FILE" index.js package.json *.js endpoints/ node_modules/

ZIP_SIZE=$(stat -f%z "$ZIP_FILE" 2>/dev/null || stat -c%s "$ZIP_FILE" 2>/dev/null)
echo -e "${GREEN}✅ Package created: $ZIP_FILE ($(numfmt --to=iec-i --suffix=B $ZIP_SIZE 2>/dev/null || echo "$ZIP_SIZE bytes"))${NC}"

# Check if function exists
FUNCTION_EXISTS=$(aws lambda get-function --function-name "$FUNCTION_NAME" --region "$REGION" 2>/dev/null || echo "")

if [ -z "$FUNCTION_EXISTS" ]; then
    echo -e "${YELLOW}📝 Function does not exist, creating new function...${NC}"
    
    # Get IAM role ARN from main lambda function
    MAIN_FUNCTION_ROLE=$(aws lambda get-function --function-name "llmproxy" --region "$REGION" --query 'Configuration.Role' --output text 2>/dev/null || echo "")
    
    if [ -z "$MAIN_FUNCTION_ROLE" ]; then
        echo -e "${RED}❌ Could not find IAM role from main llmproxy function!${NC}"
        echo "Please create the function manually or ensure llmproxy function exists."
        exit 1
    fi
    
    echo -e "${BLUE}Using IAM role: $MAIN_FUNCTION_ROLE${NC}"
    
    # Create the function
    CREATE_RESULT=$(aws lambda create-function \
        --function-name "$FUNCTION_NAME" \
        --region "$REGION" \
        --runtime nodejs20.x \
        --role "$MAIN_FUNCTION_ROLE" \
        --handler index.handler \
        --zip-file fileb://"$ZIP_FILE" \
        --timeout 30 \
        --memory-size 512 \
        --description "Static content server and buffered proxy for llmproxy" \
        --output json)
    
    if [ $? -eq 0 ]; then
        echo -e "${GREEN}✅ Function created successfully${NC}"
        
        # Enable Function URL
        echo -e "${YELLOW}📝 Enabling Function URL...${NC}"
        URL_RESULT=$(aws lambda create-function-url-config \
            --function-name "$FUNCTION_NAME" \
            --region "$REGION" \
            --auth-type NONE \
            --cors AllowOrigins="*",AllowMethods="GET,POST,OPTIONS",AllowHeaders="Content-Type,Authorization",MaxAge=86400 \
            --output json)
        
        FUNCTION_URL=$(echo "$URL_RESULT" | grep -o '"FunctionUrl": "[^"]*"' | cut -d'"' -f4)
        echo -e "${GREEN}✅ Function URL created: ${FUNCTION_URL}${NC}"
        
        # Add resource-based policy to allow public invocation
        aws lambda add-permission \
            --function-name "$FUNCTION_NAME" \
            --region "$REGION" \
            --statement-id FunctionURLAllowPublicAccess \
            --action lambda:InvokeFunctionUrl \
            --principal "*" \
            --function-url-auth-type NONE \
            --output text > /dev/null 2>&1 || true
    else
        echo -e "${RED}❌ Failed to create Lambda function!${NC}"
        exit 1
    fi
else
    echo -e "${YELLOW}📝 Function exists, updating code...${NC}"
    
    # Update the Lambda function code
    UPDATE_RESULT=$(aws lambda update-function-code \
        --function-name "$FUNCTION_NAME" \
        --region "$REGION" \
        --zip-file fileb://"$ZIP_FILE" \
        --output json)
    
    if [ $? -eq 0 ]; then
        echo -e "${GREEN}✅ Function code updated successfully${NC}"
    else
        echo -e "${RED}❌ Failed to update Lambda function!${NC}"
        exit 1
    fi
fi

# Set environment variables from .env file
echo -e "${BLUE}📁 Setting environment variables...${NC}"

# Get critical variables
ACC_SEC=$(grep '^ACC_SEC=' "$OLDPWD/.env" | tail -n1 | cut -d'=' -f2- | tr -d '\r')
OPENAI_KEY=$(grep '^OPENAI_KEY=' "$OLDPWD/.env" | tail -n1 | cut -d'=' -f2- | tr -d '\r')
GROQ_KEY=$(grep '^GROQ_KEY=' "$OLDPWD/.env" | tail -n1 | cut -d'=' -f2- | tr -d '\r')
ALLOW_EM=$(grep '^ALLOW_EM=' "$OLDPWD/.env" | tail -n1 | cut -d'=' -f2- | tr -d '\r')
GGL_CID=$(grep '^GGL_CID=' "$OLDPWD/.env" | tail -n1 | cut -d'=' -f2- | tr -d '\r')
OPENAI_API_URL=$(grep '^OPENAI_API_URL=' "$OLDPWD/.env" | tail -n1 | cut -d'=' -f2- | tr -d '\r')

# Build environment variables JSON
ENV_VARS="{"
[ -n "$ACC_SEC" ] && ENV_VARS="${ENV_VARS}\"ACC_SEC\":\"$ACC_SEC\","
[ -n "$OPENAI_KEY" ] && ENV_VARS="${ENV_VARS}\"OPENAI_KEY\":\"$OPENAI_KEY\","
[ -n "$GROQ_KEY" ] && ENV_VARS="${ENV_VARS}\"GROQ_KEY\":\"$GROQ_KEY\","
[ -n "$ALLOW_EM" ] && ENV_VARS="${ENV_VARS}\"ALLOW_EM\":\"$ALLOW_EM\","
[ -n "$GGL_CID" ] && ENV_VARS="${ENV_VARS}\"GGL_CID\":\"$GGL_CID\","
[ -n "$OPENAI_API_URL" ] && ENV_VARS="${ENV_VARS}\"OPENAI_API_URL\":\"$OPENAI_API_URL\","

# Remove trailing comma and close JSON
ENV_VARS="${ENV_VARS%,}}"

# Update environment variables
if [ "$ENV_VARS" != "{}" ]; then
    aws lambda update-function-configuration \
        --function-name "$FUNCTION_NAME" \
        --region "$REGION" \
        --environment "Variables=$ENV_VARS" \
        --output json > /dev/null
    
    echo -e "${GREEN}✅ Environment variables updated${NC}"
else
    echo -e "${YELLOW}⚠️  No environment variables to update${NC}"
fi

# Get Function URL if it exists
FUNCTION_URL=$(aws lambda get-function-url-config --function-name "$FUNCTION_NAME" --region "$REGION" --query 'FunctionUrl' --output text 2>/dev/null || echo "")

if [ -n "$FUNCTION_URL" ]; then
    echo -e "${GREEN}✅ Static Lambda Function URL: ${FUNCTION_URL}${NC}"
fi

# Clean up
cd "$OLDPWD"
rm -rf "$TEMP_DIR"

echo -e "${GREEN}✅ Static Lambda deployment complete!${NC}"
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${YELLOW}Next steps:${NC}"
echo -e "1. Test static file serving: curl ${FUNCTION_URL}"
echo -e "2. Test proxy endpoint: curl -X POST ${FUNCTION_URL}proxy"
echo -e "3. Update DNS/routing to point to new static Lambda"
