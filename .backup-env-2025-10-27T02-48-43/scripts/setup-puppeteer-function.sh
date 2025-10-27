#!/bin/bash
# Setup script for Puppeteer Lambda function
# Creates the Lambda function with proper configuration and Chromium Layer

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
RUNTIME="nodejs20.x"
MEMORY_SIZE=1024
TIMEOUT=60
CHROMIUM_LAYER_ARN="arn:aws:lambda:us-east-1:764866452798:layer:chrome-aws-lambda:43"

echo -e "${BLUE}================================================${NC}"
echo -e "${BLUE}  Setting up Puppeteer Lambda Function${NC}"
echo -e "${BLUE}================================================${NC}"
echo ""

# Check if AWS CLI is installed
if ! command -v aws &> /dev/null; then
    echo -e "${RED}❌ Error: AWS CLI is not installed${NC}"
    echo "Please install AWS CLI: https://aws.amazon.com/cli/"
    exit 1
fi

# Check if function already exists
echo -e "${YELLOW}🔍 Checking if function exists...${NC}"
if aws lambda get-function --function-name "$FUNCTION_NAME" --region "$REGION" &> /dev/null; then
    echo -e "${YELLOW}⚠️  Function '$FUNCTION_NAME' already exists${NC}"
    read -p "Do you want to update it? (y/n) " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        echo -e "${BLUE}ℹ️  Skipping function creation${NC}"
        exit 0
    fi
    UPDATE_MODE=true
else
    echo -e "${GREEN}✓ Function does not exist, will create new${NC}"
    UPDATE_MODE=false
fi

# Get or create execution role
echo -e "${YELLOW}🔍 Setting up IAM execution role...${NC}"
ROLE_NAME="llmproxy-puppeteer-role"

if ! aws iam get-role --role-name "$ROLE_NAME" &> /dev/null; then
    echo -e "${YELLOW}📝 Creating execution role...${NC}"
    
    # Create trust policy
    cat > /tmp/trust-policy.json << EOF
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Principal": {
        "Service": "lambda.amazonaws.com"
      },
      "Action": "sts:AssumeRole"
    }
  ]
}
EOF

    # Create role
    aws iam create-role \
        --role-name "$ROLE_NAME" \
        --assume-role-policy-document file:///tmp/trust-policy.json \
        --description "Execution role for Puppeteer Lambda function"
    
    # Attach basic execution policy
    aws iam attach-role-policy \
        --role-name "$ROLE_NAME" \
        --policy-arn "arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole"
    
    echo -e "${GREEN}✓ Execution role created${NC}"
    
    # Wait for role to propagate
    echo -e "${YELLOW}⏳ Waiting for IAM role to propagate...${NC}"
    sleep 10
else
    echo -e "${GREEN}✓ Execution role already exists${NC}"
fi

# Get role ARN
ROLE_ARN=$(aws iam get-role --role-name "$ROLE_NAME" --query 'Role.Arn' --output text)
echo -e "${GREEN}✓ Role ARN: $ROLE_ARN${NC}"

if [ "$UPDATE_MODE" = false ]; then
    # Create function (initial deployment with dummy code)
    echo -e "${YELLOW}🚀 Creating Lambda function...${NC}"
    
    # Create a minimal deployment package
    mkdir -p /tmp/puppeteer-init
    cat > /tmp/puppeteer-init/index.js << 'EOF'
exports.handler = async (event) => {
    return {
        statusCode: 200,
        body: JSON.stringify({ message: 'Initial deployment - use deploy-puppeteer-lambda.sh to update' })
    };
};
EOF
    
    cd /tmp/puppeteer-init
    zip -q function.zip index.js
    
    aws lambda create-function \
        --function-name "$FUNCTION_NAME" \
        --runtime "$RUNTIME" \
        --role "$ROLE_ARN" \
        --handler "src/puppeteer-handler.handler" \
        --zip-file fileb://function.zip \
        --timeout "$TIMEOUT" \
        --memory-size "$MEMORY_SIZE" \
        --region "$REGION" \
        --description "Puppeteer web scraping with headless Chromium"
    
    echo -e "${GREEN}✓ Function created${NC}"
    
    # Wait for function to be active
    echo -e "${YELLOW}⏳ Waiting for function to be active...${NC}"
    sleep 5
else
    echo -e "${BLUE}ℹ️  Function already exists, skipping creation${NC}"
fi

# Update function configuration
echo -e "${YELLOW}⚙️  Updating function configuration...${NC}"
aws lambda update-function-configuration \
    --function-name "$FUNCTION_NAME" \
    --timeout "$TIMEOUT" \
    --memory-size "$MEMORY_SIZE" \
    --region "$REGION" \
    > /dev/null

echo -e "${GREEN}✓ Configuration updated (Memory: ${MEMORY_SIZE}MB, Timeout: ${TIMEOUT}s)${NC}"

# Add Chromium Layer
echo -e "${YELLOW}📦 Adding Chromium Lambda Layer...${NC}"
aws lambda update-function-configuration \
    --function-name "$FUNCTION_NAME" \
    --layers "$CHROMIUM_LAYER_ARN" \
    --region "$REGION" \
    > /dev/null

echo -e "${GREEN}✓ Chromium Layer added${NC}"

# Wait for update to complete
echo -e "${YELLOW}⏳ Waiting for configuration update to complete...${NC}"
aws lambda wait function-updated \
    --function-name "$FUNCTION_NAME" \
    --region "$REGION"

echo -e "${GREEN}✓ Configuration update complete${NC}"

# Get function ARN
FUNCTION_ARN=$(aws lambda get-function --function-name "$FUNCTION_NAME" --region "$REGION" --query 'Configuration.FunctionArn' --output text)

echo ""
echo -e "${GREEN}================================================${NC}"
echo -e "${GREEN}  Puppeteer Lambda Setup Complete!${NC}"
echo -e "${GREEN}================================================${NC}"
echo ""
echo -e "${BLUE}Function Name:${NC} $FUNCTION_NAME"
echo -e "${BLUE}Function ARN:${NC} $FUNCTION_ARN"
echo -e "${BLUE}Region:${NC} $REGION"
echo -e "${BLUE}Memory:${NC} ${MEMORY_SIZE}MB"
echo -e "${BLUE}Timeout:${NC} ${TIMEOUT}s"
echo -e "${BLUE}Runtime:${NC} $RUNTIME"
echo ""
echo -e "${YELLOW}📋 Next Steps:${NC}"
echo -e "  1. Run: ${GREEN}make deploy-puppeteer${NC} to deploy the Puppeteer code"
echo -e "  2. Run: ${GREEN}make setup-main-lambda-permissions${NC} to allow main Lambda to invoke this function"
echo -e "  3. Set environment variable: ${GREEN}PUPPETEER_LAMBDA_ARN=$FUNCTION_ARN${NC}"
echo ""
