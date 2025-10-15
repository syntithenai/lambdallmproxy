#!/bin/bash

# Analyze Lambda Layer Size
# This script analyzes the size of dependencies in the Lambda layer
# Helps identify opportunities for optimization

set -e

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

echo -e "${BLUE}📊 Analyzing Lambda Layer Dependencies...${NC}"
echo ""

# Create temp directory
TEMP_DIR=$(mktemp -d)
echo -e "${YELLOW}Working directory: ${TEMP_DIR}${NC}"

cd "$TEMP_DIR"

# Create package.json with layer dependencies
cat > package.json << 'EOF'
{
  "name": "layer-analysis",
  "version": "1.0.0",
  "dependencies": {
    "@distube/ytdl-core": "^4.14.4",
    "@ffmpeg-installer/ffmpeg": "^1.1.0",
    "fluent-ffmpeg": "^2.1.2",
    "form-data": "^4.0.0",
    "google-auth-library": "^10.4.0"
  }
}
EOF

echo -e "${YELLOW}📥 Installing layer dependencies...${NC}"
npm install --production --silent

echo ""
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${GREEN}📦 Individual Package Sizes${NC}"
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
du -sh node_modules/* | sort -hr

echo ""
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${GREEN}📊 Total Layer Size${NC}"
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
TOTAL_SIZE=$(du -sh node_modules | awk '{print $1}')
echo -e "  Total: ${GREEN}${TOTAL_SIZE}${NC}"

# Create a zip to estimate actual layer size
echo ""
echo -e "${YELLOW}🗜️  Creating test layer package...${NC}"
mkdir -p nodejs
mv node_modules nodejs/
zip -q -r layer.zip nodejs/

ZIP_SIZE=$(ls -lh layer.zip | awk '{print $5}')
echo -e "${GREEN}Compressed layer size: ${ZIP_SIZE}${NC}"

# Check against limits
UNCOMPRESSED_MB=$(du -sm nodejs | awk '{print $1}')
ZIP_MB=$(stat -c%s layer.zip 2>/dev/null || stat -f%z layer.zip)
ZIP_MB=$((ZIP_MB / 1048576))

echo ""
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${GREEN}📏 AWS Lambda Layer Limits${NC}"
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "  Uncompressed: ${UNCOMPRESSED_MB}MB / 250MB"
echo -e "  Compressed:   ${ZIP_MB}MB / 50MB"

if [ "$UNCOMPRESSED_MB" -gt 250 ]; then
    echo -e "${RED}⚠️  WARNING: Exceeds 250MB uncompressed limit!${NC}"
elif [ "$UNCOMPRESSED_MB" -gt 200 ]; then
    echo -e "${YELLOW}⚠️  CAUTION: Close to 250MB limit (${UNCOMPRESSED_MB}MB)${NC}"
else
    echo -e "${GREEN}✅ Within limits${NC}"
fi

if [ "$ZIP_MB" -gt 50 ]; then
    echo -e "${RED}⚠️  WARNING: Exceeds 50MB compressed limit!${NC}"
elif [ "$ZIP_MB" -gt 40 ]; then
    echo -e "${YELLOW}⚠️  CAUTION: Close to 50MB limit (${ZIP_MB}MB)${NC}"
else
    echo -e "${GREEN}✅ Within limits${NC}"
fi

# Identify largest packages
echo ""
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${GREEN}🎯 Optimization Opportunities${NC}"
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"

cd nodejs/node_modules

LARGEST=$(du -sm * | sort -rn | head -5)

echo "$LARGEST" | while read SIZE PKG; do
    if [ "$SIZE" -gt 20 ]; then
        echo -e "${RED}  ❌ ${PKG}: ${SIZE}MB (consider removing or externalizing)${NC}"
    elif [ "$SIZE" -gt 10 ]; then
        echo -e "${YELLOW}  ⚠️  ${PKG}: ${SIZE}MB (large, review if necessary)${NC}"
    else
        echo -e "${GREEN}  ✅ ${PKG}: ${SIZE}MB (acceptable)${NC}"
    fi
done

# Cleanup
cd "$OLDPWD"
rm -rf "$TEMP_DIR"

echo ""
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${YELLOW}💡 Recommendations:${NC}"
echo ""
echo -e "  1. ${BLUE}Remove ffmpeg if not used:${NC}"
echo -e "     Check with: grep -r 'ffmpeg' src/"
echo ""
echo -e "  2. ${BLUE}Use AWS Lambda Layer for ffmpeg:${NC}"
echo -e "     ARN: arn:aws:lambda:us-east-1:145266761615:layer:ffmpeg:4"
echo ""
echo -e "  3. ${BLUE}Move RAG database to S3:${NC}"
echo -e "     Run: ./scripts/upload-rag-db.sh"
echo ""
echo -e "  4. ${BLUE}Split into multiple layers:${NC}"
echo -e "     Core (ytdl, form-data) + FFmpeg (separate layer)"
echo ""

echo -e "${GREEN}✅ Analysis complete!${NC}"
