#!/bin/bash

# Upload RAG Database to S3
# This script uploads the RAG knowledge base to S3 for Lambda to download at runtime
# Reduces Lambda deployment package size and allows database updates without redeployment

set -e

# Configuration
BUCKET_NAME="${RAG_DB_S3_BUCKET:-llmproxy-assets}"
DB_FILE="rag-kb.db"
S3_KEY="rag/rag-kb.db"
REGION="${AWS_REGION:-us-east-1}"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

echo -e "${BLUE}📤 Uploading RAG database to S3...${NC}"

# Check if database file exists
if [ ! -f "$DB_FILE" ]; then
    echo -e "${RED}❌ Database file not found: $DB_FILE${NC}"
    exit 1
fi

# Get file size
DB_SIZE=$(stat -c%s "$DB_FILE" 2>/dev/null || stat -f%z "$DB_FILE")
DB_SIZE_MB=$(echo "scale=2; $DB_SIZE / 1048576" | bc)

echo -e "${YELLOW}Database file: $DB_FILE (${DB_SIZE_MB}MB)${NC}"

# Create bucket if doesn't exist
if ! aws s3 ls "s3://${BUCKET_NAME}" 2>/dev/null; then
    echo -e "${YELLOW}Creating S3 bucket: ${BUCKET_NAME}${NC}"
    aws s3 mb "s3://${BUCKET_NAME}" --region "$REGION"
    
    # Enable versioning
    aws s3api put-bucket-versioning \
        --bucket "${BUCKET_NAME}" \
        --versioning-configuration Status=Enabled
    
    echo -e "${GREEN}✅ Bucket created with versioning enabled${NC}"
else
    echo -e "${GREEN}✅ Using existing S3 bucket: ${BUCKET_NAME}${NC}"
fi

# Upload with metadata
TIMESTAMP=$(date +%Y%m%d-%H%M%S)
echo -e "${YELLOW}☁️  Uploading to s3://${BUCKET_NAME}/${S3_KEY}...${NC}"

aws s3 cp "$DB_FILE" "s3://${BUCKET_NAME}/${S3_KEY}" \
    --metadata "version=${TIMESTAMP},size=${DB_SIZE},uploaded=$(date -u +%Y-%m-%dT%H:%M:%SZ)" \
    --storage-class STANDARD \
    --region "$REGION"

if [ $? -eq 0 ]; then
    echo -e "${GREEN}✅ Database uploaded successfully${NC}"
    
    # Also upload to versioned path (backup)
    echo -e "${YELLOW}📦 Creating versioned backup...${NC}"
    aws s3 cp "$DB_FILE" "s3://${BUCKET_NAME}/rag/versions/rag-kb-${TIMESTAMP}.db" \
        --storage-class STANDARD_IA \
        --region "$REGION"
    
    echo -e "${GREEN}✅ Backup created: rag/versions/rag-kb-${TIMESTAMP}.db${NC}"
else
    echo -e "${RED}❌ Failed to upload database${NC}"
    exit 1
fi

# Update deployment config
echo -e "${YELLOW}📝 Updating deployment configuration...${NC}"
if [ -f ".deployment-config" ]; then
    # Remove old entries
    grep -v "RAG_DB_S3" .deployment-config > .deployment-config.tmp || true
    mv .deployment-config.tmp .deployment-config
fi

echo "RAG_DB_S3_BUCKET=${BUCKET_NAME}" >> .deployment-config
echo "RAG_DB_S3_KEY=${S3_KEY}" >> .deployment-config
echo "RAG_DB_VERSION=${TIMESTAMP}" >> .deployment-config

echo -e "${GREEN}✅ Configuration updated${NC}"

# Display summary
echo ""
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${GREEN}📊 Upload Summary${NC}"
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "  Bucket:   ${BUCKET_NAME}"
echo -e "  Key:      ${S3_KEY}"
echo -e "  Size:     ${DB_SIZE_MB}MB"
echo -e "  Version:  ${TIMESTAMP}"
echo -e "  Region:   ${REGION}"
echo ""
echo -e "${YELLOW}📋 Next Steps:${NC}"
echo -e "  1. Update Lambda environment variables:"
echo -e "     ${BLUE}RAG_DB_S3_BUCKET=${BUCKET_NAME}${NC}"
echo -e "     ${BLUE}RAG_DB_S3_KEY=${S3_KEY}${NC}"
echo ""
echo -e "  2. Grant Lambda S3 read permission (IAM policy)"
echo ""
echo -e "  3. Deploy updated code:"
echo -e "     ${BLUE}make deploy-lambda-fast${NC}"
echo ""
echo -e "${GREEN}✅ RAG database ready for Lambda deployment!${NC}"
