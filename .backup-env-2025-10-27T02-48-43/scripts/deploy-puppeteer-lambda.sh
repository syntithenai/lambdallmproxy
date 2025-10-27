#!/bin/bash
# Deploy Puppeteer Lambda function
# Packages and uploads the Puppeteer code with dependencies

set -e  # Exit on error

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
FUNCTION_NAME="llmproxy-puppeteer"
REGION="us-east-1"
BUILD_DIR="/tmp/puppeteer-lambda-build"

echo -e "${BLUE}================================================${NC}"
echo -e "${BLUE}  Deploying Puppeteer Lambda Function${NC}"
echo -e "${BLUE}================================================${NC}"
echo ""

# Check if AWS CLI is installed
if ! command -v aws &> /dev/null; then
    echo -e "${RED}❌ Error: AWS CLI is not installed${NC}"
    exit 1
fi

# Check if function exists
echo -e "${YELLOW}🔍 Checking if function exists...${NC}"
if ! aws lambda get-function --function-name "$FUNCTION_NAME" --region "$REGION" &> /dev/null; then
    echo -e "${RED}❌ Error: Function '$FUNCTION_NAME' does not exist${NC}"
    echo -e "${YELLOW}Run: ./scripts/setup-puppeteer-function.sh first${NC}"
    exit 1
fi
echo -e "${GREEN}✓ Function exists${NC}"

# Clean and create build directory
echo -e "${YELLOW}🧹 Cleaning build directory...${NC}"
rm -rf "$BUILD_DIR"
mkdir -p "$BUILD_DIR"

# Copy handler code
echo -e "${YELLOW}📄 Copying handler code...${NC}"
mkdir -p "$BUILD_DIR/src"
cp src/puppeteer-handler.js "$BUILD_DIR/src/"
echo -e "${GREEN}✓ Handler copied${NC}"

# Copy package.json
echo -e "${YELLOW}📦 Setting up package.json...${NC}"
cp puppeteer-package.json "$BUILD_DIR/package.json"

# Install dependencies
echo -e "${YELLOW}📥 Installing dependencies...${NC}"
cd "$BUILD_DIR"
npm install --production --silent

if [ $? -ne 0 ]; then
    echo -e "${RED}❌ Error: npm install failed${NC}"
    exit 1
fi
echo -e "${GREEN}✓ Dependencies installed${NC}"

# Check package size
echo -e "${YELLOW}📊 Checking package size...${NC}"
PACKAGE_SIZE=$(du -sh "$BUILD_DIR" | cut -f1)
echo -e "${BLUE}Package size: $PACKAGE_SIZE${NC}"

# Create deployment package (excluding Chromium binary - it's in the Layer)
echo -e "${YELLOW}📦 Creating deployment package...${NC}"
cd "$BUILD_DIR"

# Exclude Chromium binary from package (it's in the Lambda Layer)
# This significantly reduces package size
zip -r -q function.zip . \
    -x "node_modules/@sparticuz/chromium/.local-chromium/*" \
    -x "*.git*" \
    -x "*.md" \
    -x "test/*" \
    -x "*.test.js"

if [ ! -f function.zip ]; then
    echo -e "${RED}❌ Error: Failed to create deployment package${NC}"
    exit 1
fi

ZIP_SIZE=$(du -h function.zip | cut -f1)
echo -e "${GREEN}✓ Package created: $ZIP_SIZE${NC}"

# Upload to S3 first (required for large packages to avoid SSL issues)
S3_BUCKET="llmproxy-deployments"

# Ensure S3 bucket exists
if ! aws s3 ls "s3://$S3_BUCKET" 2>/dev/null; then
    echo -e "${YELLOW}📦 Creating S3 bucket...${NC}"
    aws s3 mb "s3://$S3_BUCKET" --region "$REGION" 2>/dev/null || true
fi

# Always upload to S3 for large packages (avoids SSL timeout issues)
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
S3_KEY="puppeteer-lambda/$TIMESTAMP/function.zip"

echo -e "${YELLOW}☁️  Uploading to S3 (recommended for large packages)...${NC}"
aws s3 cp function.zip "s3://$S3_BUCKET/$S3_KEY" --region "$REGION"

if [ $? -ne 0 ]; then
    echo -e "${RED}❌ Error: Failed to upload to S3${NC}"
    exit 1
fi

echo -e "${GREEN}✓ Uploaded to S3: s3://$S3_BUCKET/$S3_KEY${NC}"

# Update Lambda function code from S3 (more reliable than direct upload)
echo -e "${YELLOW}🚀 Updating Lambda function from S3...${NC}"
aws lambda update-function-code \
    --function-name "$FUNCTION_NAME" \
    --s3-bucket "$S3_BUCKET" \
    --s3-key "$S3_KEY" \
    --region "$REGION" \
    > /dev/null

if [ $? -ne 0 ]; then
    echo -e "${RED}❌ Error: Failed to update Lambda function${NC}"
    exit 1
fi

echo -e "${GREEN}✓ Function code updated${NC}"

# Wait for update to complete
echo -e "${YELLOW}⏳ Waiting for update to complete...${NC}"
aws lambda wait function-updated \
    --function-name "$FUNCTION_NAME" \
    --region "$REGION"

# Get function info
FUNCTION_INFO=$(aws lambda get-function-configuration \
    --function-name "$FUNCTION_NAME" \
    --region "$REGION")

MEMORY=$(echo "$FUNCTION_INFO" | grep -o '"MemorySize": [0-9]*' | grep -o '[0-9]*')
TIMEOUT=$(echo "$FUNCTION_INFO" | grep -o '"Timeout": [0-9]*' | grep -o '[0-9]*')
RUNTIME=$(echo "$FUNCTION_INFO" | grep -o '"Runtime": "[^"]*"' | cut -d'"' -f4)
CODE_SIZE=$(echo "$FUNCTION_INFO" | grep -o '"CodeSize": [0-9]*' | grep -o '[0-9]*')

# Convert bytes to KB/MB
if [ "$CODE_SIZE" -gt 1048576 ]; then
    CODE_SIZE_HUMAN="$(echo "scale=2; $CODE_SIZE / 1048576" | bc)MB"
elif [ "$CODE_SIZE" -gt 1024 ]; then
    CODE_SIZE_HUMAN="$(echo "scale=2; $CODE_SIZE / 1024" | bc)KB"
else
    CODE_SIZE_HUMAN="${CODE_SIZE}B"
fi

echo ""
echo -e "${GREEN}================================================${NC}"
echo -e "${GREEN}  Deployment Complete!${NC}"
echo -e "${GREEN}================================================${NC}"
echo ""
echo -e "${BLUE}Function:${NC} $FUNCTION_NAME"
echo -e "${BLUE}Region:${NC} $REGION"
echo -e "${BLUE}Runtime:${NC} $RUNTIME"
echo -e "${BLUE}Memory:${NC} ${MEMORY}MB"
echo -e "${BLUE}Timeout:${NC} ${TIMEOUT}s"
echo -e "${BLUE}Code Size:${NC} $CODE_SIZE_HUMAN"
echo ""
echo -e "${YELLOW}📋 Test the function:${NC}"
echo -e "  aws lambda invoke --function-name $FUNCTION_NAME \\"
echo -e "    --payload '{\"url\":\"https://example.com\"}' \\"
echo -e "    --region $REGION \\"
echo -e "    /tmp/puppeteer-response.json"
echo ""
echo -e "${YELLOW}📋 View logs:${NC}"
echo -e "  aws logs tail /aws/lambda/$FUNCTION_NAME --follow --region $REGION"
echo ""

# Cleanup
echo -e "${YELLOW}🧹 Cleaning up build directory...${NC}"
rm -rf "$BUILD_DIR"
echo -e "${GREEN}✓ Cleanup complete${NC}"
