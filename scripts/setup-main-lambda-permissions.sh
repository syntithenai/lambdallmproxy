#!/bin/bash
# Setup IAM permissions for main Lambda to invoke Puppeteer Lambda

set -e  # Exit on error

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
MAIN_FUNCTION="llmproxy"
PUPPETEER_FUNCTION="llmproxy-puppeteer"
REGION="us-east-1"
MAIN_ROLE_NAME="llmproxy-role"

echo -e "${BLUE}================================================${NC}"
echo -e "${BLUE}  Setting up Lambda Invocation Permissions${NC}"
echo -e "${BLUE}================================================${NC}"
echo ""

# Check if AWS CLI is installed
if ! command -v aws &> /dev/null; then
    echo -e "${RED}❌ Error: AWS CLI is not installed${NC}"
    exit 1
fi

# Check if functions exist
echo -e "${YELLOW}🔍 Verifying Lambda functions...${NC}"
if ! aws lambda get-function --function-name "$MAIN_FUNCTION" --region "$REGION" &> /dev/null; then
    echo -e "${RED}❌ Error: Main function '$MAIN_FUNCTION' does not exist${NC}"
    exit 1
fi
echo -e "${GREEN}✓ Main function exists${NC}"

if ! aws lambda get-function --function-name "$PUPPETEER_FUNCTION" --region "$REGION" &> /dev/null; then
    echo -e "${RED}❌ Error: Puppeteer function '$PUPPETEER_FUNCTION' does not exist${NC}"
    echo -e "${YELLOW}Run: ./scripts/setup-puppeteer-function.sh first${NC}"
    exit 1
fi
echo -e "${GREEN}✓ Puppeteer function exists${NC}"

# Get Puppeteer function ARN
PUPPETEER_ARN=$(aws lambda get-function \
    --function-name "$PUPPETEER_FUNCTION" \
    --region "$REGION" \
    --query 'Configuration.FunctionArn' \
    --output text)

echo -e "${BLUE}Puppeteer ARN:${NC} $PUPPETEER_ARN"

# Get main Lambda role
echo -e "${YELLOW}🔍 Getting main Lambda role...${NC}"
MAIN_ROLE_ARN=$(aws lambda get-function-configuration \
    --function-name "$MAIN_FUNCTION" \
    --region "$REGION" \
    --query 'Role' \
    --output text)

# Extract role name from ARN
MAIN_ROLE_NAME=$(echo "$MAIN_ROLE_ARN" | awk -F'/' '{print $NF}')
echo -e "${GREEN}✓ Main Lambda role: $MAIN_ROLE_NAME${NC}"

# Create policy document for Lambda invocation
echo -e "${YELLOW}📝 Creating IAM policy...${NC}"
POLICY_NAME="llmproxy-invoke-puppeteer-policy"

cat > /tmp/invoke-policy.json << EOF
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
        "lambda:InvokeFunction"
      ],
      "Resource": "$PUPPETEER_ARN"
    }
  ]
}
EOF

# Check if policy already exists
AWS_ACCOUNT_ID=$(aws sts get-caller-identity --query 'Account' --output text)
POLICY_ARN="arn:aws:iam::${AWS_ACCOUNT_ID}:policy/${POLICY_NAME}"

if aws iam get-policy --policy-arn "$POLICY_ARN" &> /dev/null; then
    echo -e "${YELLOW}⚠️  Policy already exists, creating new version...${NC}"
    
    # Delete old policy versions (keep only latest)
    OLD_VERSIONS=$(aws iam list-policy-versions \
        --policy-arn "$POLICY_ARN" \
        --query 'Versions[?IsDefaultVersion==`false`].VersionId' \
        --output text)
    
    for version in $OLD_VERSIONS; do
        aws iam delete-policy-version \
            --policy-arn "$POLICY_ARN" \
            --version-id "$version" 2>/dev/null || true
    done
    
    # Create new version
    aws iam create-policy-version \
        --policy-arn "$POLICY_ARN" \
        --policy-document file:///tmp/invoke-policy.json \
        --set-as-default \
        > /dev/null
    
    echo -e "${GREEN}✓ Policy updated${NC}"
else
    echo -e "${YELLOW}📝 Creating new policy...${NC}"
    
    aws iam create-policy \
        --policy-name "$POLICY_NAME" \
        --policy-document file:///tmp/invoke-policy.json \
        --description "Allow main Lambda to invoke Puppeteer Lambda" \
        > /dev/null
    
    echo -e "${GREEN}✓ Policy created${NC}"
fi

# Attach policy to role
echo -e "${YELLOW}🔗 Attaching policy to main Lambda role...${NC}"
aws iam attach-role-policy \
    --role-name "$MAIN_ROLE_NAME" \
    --policy-arn "$POLICY_ARN" \
    2>/dev/null || echo -e "${BLUE}ℹ️  Policy already attached${NC}"

echo -e "${GREEN}✓ Policy attached${NC}"

# Update main Lambda environment variables
echo -e "${YELLOW}⚙️  Updating main Lambda environment variables...${NC}"

# Get current environment variables
CURRENT_ENV=$(aws lambda get-function-configuration \
    --function-name "$MAIN_FUNCTION" \
    --region "$REGION" \
    --query 'Environment.Variables' \
    --output json)

# Add PUPPETEER_LAMBDA_ARN if not present
if echo "$CURRENT_ENV" | grep -q "PUPPETEER_LAMBDA_ARN"; then
    echo -e "${BLUE}ℹ️  PUPPETEER_LAMBDA_ARN already set${NC}"
else
    echo -e "${YELLOW}📝 Adding PUPPETEER_LAMBDA_ARN environment variable...${NC}"
    
    # Note: This requires manual update or use of AWS CLI with proper JSON manipulation
    # For simplicity, we'll output the command for manual execution
    echo -e "${YELLOW}⚠️  Please update environment variables manually or run:${NC}"
    echo ""
    echo -e "${BLUE}  Add to .env file:${NC}"
    echo "  PUPPETEER_LAMBDA_ARN=$PUPPETEER_ARN"
    echo ""
    echo -e "${BLUE}  Then run:${NC}"
    echo "  make deploy-env"
    echo ""
fi

echo ""
echo -e "${GREEN}================================================${NC}"
echo -e "${GREEN}  Permissions Setup Complete!${NC}"
echo -e "${GREEN}================================================${NC}"
echo ""
echo -e "${BLUE}Main Function:${NC} $MAIN_FUNCTION"
echo -e "${BLUE}Main Role:${NC} $MAIN_ROLE_NAME"
echo -e "${BLUE}Puppeteer Function:${NC} $PUPPETEER_FUNCTION"
echo -e "${BLUE}Puppeteer ARN:${NC} $PUPPETEER_ARN"
echo -e "${BLUE}Policy:${NC} $POLICY_NAME"
echo ""
echo -e "${YELLOW}📋 Next Steps:${NC}"
echo -e "  1. Add to ${GREEN}.env${NC} file:"
echo -e "     ${BLUE}PUPPETEER_LAMBDA_ARN=$PUPPETEER_ARN${NC}"
echo ""
echo -e "  2. Deploy environment variables:"
echo -e "     ${GREEN}make deploy-env${NC}"
echo ""
echo -e "  3. Enable Puppeteer scraping (optional, enabled by default now):"
echo -e "     ${BLUE}USE_PUPPETEER=true${NC}"
echo ""

# Cleanup
rm -f /tmp/invoke-policy.json
