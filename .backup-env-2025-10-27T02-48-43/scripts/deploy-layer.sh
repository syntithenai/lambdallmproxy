#!/bin/bash

# Lambda Layer Deployment Script
# Separates dependencies into a Lambda Layer for faster deployments
set -e

# Configuration
LAYER_NAME="llmproxy-dependencies"
REGION="us-east-1"
S3_BUCKET="llmproxy-deployments-${RANDOM}"
TEMP_DIR="/tmp/lambda-layer-$$"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

echo -e "${BLUE}📦 Building Lambda Layer for dependencies...${NC}"

# Create S3 bucket if it doesn't exist
if ! aws s3 ls "s3://${S3_BUCKET}" 2>/dev/null; then
    echo -e "${YELLOW}Creating S3 bucket: ${S3_BUCKET}${NC}"
    aws s3 mb "s3://${S3_BUCKET}" --region "$REGION"
    
    # Store bucket name for future use
    echo "S3_BUCKET=${S3_BUCKET}" > .deployment-config
else
    echo -e "${GREEN}✅ Using existing S3 bucket: ${S3_BUCKET}${NC}"
fi

# Create temporary directory
mkdir -p "$TEMP_DIR/nodejs"
cd "$TEMP_DIR/nodejs"

# Create minimal package.json with ONLY production-critical dependencies
# Note: google-spreadsheet (lighter than googleapis), @paypal/checkout-server-sdk needed
cat > package.json << 'EOF'
{
  "name": "llmproxy-dependencies",
  "version": "1.0.0",
  "dependencies": {
    "@distube/ytdl-core": "^4.14.4",
    "@ffmpeg-installer/ffmpeg": "^1.1.0",
    "@paypal/checkout-server-sdk": "^1.0.3",
    "fluent-ffmpeg": "^2.1.2",
    "form-data": "^4.0.0",
    "google-auth-library": "^10.4.0",
    "google-spreadsheet": "4.1.5",
    "jsonwebtoken": "^9.0.2"
  }
}
EOF

# Install dependencies
echo -e "${YELLOW}📥 Installing dependencies...${NC}"
npm install --production --legacy-peer-deps

# Create layer zip
cd "$TEMP_DIR"
ZIP_FILE="layer.zip"
echo -e "${YELLOW}📦 Creating layer package...${NC}"
zip -q -r "$ZIP_FILE" nodejs/

# Get layer size
SIZE=$(ls -lh "$ZIP_FILE" | awk '{print $5}')
echo -e "${GREEN}Layer size: ${SIZE}${NC}"

# Generate S3 key with timestamp (use same timestamp for upload and publish)
S3_KEY="layers/dependencies-$(date +%Y%m%d-%H%M%S).zip"

# Upload to S3
echo -e "${YELLOW}☁️ Uploading to S3...${NC}"
aws s3 cp "$ZIP_FILE" "s3://${S3_BUCKET}/${S3_KEY}"

# Publish layer
echo -e "${YELLOW}🚀 Publishing Lambda Layer...${NC}"
LAYER_VERSION=$(aws lambda publish-layer-version \
    --layer-name "$LAYER_NAME" \
    --description "Dependencies for llmproxy (ytdl-core, ffmpeg, form-data, google-auth)" \
    --content "S3Bucket=${S3_BUCKET},S3Key=${S3_KEY}" \
    --compatible-runtimes nodejs20.x nodejs18.x \
    --region "$REGION" \
    --query 'Version' \
    --output text)

if [ $? -eq 0 ]; then
    echo -e "${GREEN}✅ Layer published: version ${LAYER_VERSION}${NC}"
    
    # Store layer version for deploy script
    echo "LAYER_VERSION=${LAYER_VERSION}" >> "$OLDPWD/.deployment-config"
    echo "LAYER_ARN=arn:aws:lambda:${REGION}:$(aws sts get-caller-identity --query Account --output text):layer:${LAYER_NAME}:${LAYER_VERSION}" >> "$OLDPWD/.deployment-config"
    
    echo -e "${BLUE}Layer ARN: arn:aws:lambda:${REGION}:$(aws sts get-caller-identity --query Account --output text):layer:${LAYER_NAME}:${LAYER_VERSION}${NC}"
else
    echo -e "${RED}❌ Failed to publish layer!${NC}"
    exit 1
fi

# Cleanup
cd "$OLDPWD"
rm -rf "$TEMP_DIR"

echo -e "${GREEN}🎉 Layer deployment complete!${NC}"
echo -e "${YELLOW}💡 Now run ./scripts/deploy-fast.sh to deploy code changes${NC}"
