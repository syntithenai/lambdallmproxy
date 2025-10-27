#!/bin/bash
# ================================================================
# Setup AWS Secrets Manager for Large Environment Variables
# ================================================================
# This script moves large secrets (Google Sheets private key) from
# environment variables to AWS Secrets Manager to avoid 4KB limit
# ================================================================

set -e

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

ENV_FILE=".env"
SECRET_NAME="llmproxy-google-sheets-key"
REGION="us-east-1"

echo -e "${BLUE}════════════════════════════════════════════════════════════${NC}"
echo -e "${BLUE}  AWS Secrets Manager Setup${NC}"
echo -e "${BLUE}════════════════════════════════════════════════════════════${NC}"
echo ""

# Check if .env exists
if [ ! -f "$ENV_FILE" ]; then
    echo -e "${RED}✗ Error: $ENV_FILE not found${NC}"
    exit 1
fi

# Extract private key from .env
echo -e "${BLUE}📄 Extracting Google Sheets private key from $ENV_FILE...${NC}"
PRIVATE_KEY=$(grep "^GOOGLE_SHEETS_SERVICE_ACCOUNT_PRIVATE_KEY=" "$ENV_FILE" | cut -d'=' -f2- | sed 's/^"//' | sed 's/"$//')

if [ -z "$PRIVATE_KEY" ]; then
    echo -e "${RED}✗ Error: GOOGLE_SHEETS_SERVICE_ACCOUNT_PRIVATE_KEY not found in $ENV_FILE${NC}"
    exit 1
fi

echo -e "${GREEN}✓ Private key extracted (${#PRIVATE_KEY} bytes)${NC}"
echo ""

# Check if secret already exists
echo -e "${BLUE}🔍 Checking if secret already exists...${NC}"
if aws secretsmanager describe-secret --secret-id "$SECRET_NAME" --region "$REGION" &>/dev/null; then
    echo -e "${YELLOW}⚠️  Secret already exists. Updating...${NC}"
    
    aws secretsmanager update-secret \
        --secret-id "$SECRET_NAME" \
        --region "$REGION" \
        --secret-string "$PRIVATE_KEY" \
        --output json > /tmp/secret-update.json
    
    echo -e "${GREEN}✓ Secret updated successfully${NC}"
else
    echo -e "${BLUE}📝 Creating new secret...${NC}"
    
    aws secretsmanager create-secret \
        --name "$SECRET_NAME" \
        --description "Google Sheets Service Account Private Key for llmproxy logging" \
        --region "$REGION" \
        --secret-string "$PRIVATE_KEY" \
        --output json > /tmp/secret-create.json
    
    echo -e "${GREEN}✓ Secret created successfully${NC}"
fi

echo ""
echo -e "${BLUE}🔑 Secret Details:${NC}"
echo -e "  Name: ${GREEN}$SECRET_NAME${NC}"
echo -e "  Region: ${GREEN}$REGION${NC}"
echo -e "  ARN: ${GREEN}$(jq -r '.ARN // .ARN' /tmp/secret-*.json 2>/dev/null || echo 'N/A')${NC}"
echo ""

# Grant Lambda permission to access secret
echo -e "${BLUE}🔐 Granting Lambda permission to access secret...${NC}"
LAMBDA_ROLE_NAME="llmproxy-role"

# Get Lambda function role ARN
LAMBDA_ROLE_ARN=$(aws lambda get-function --function-name llmproxy --region "$REGION" --query 'Configuration.Role' --output text 2>/dev/null || echo "")

if [ -z "$LAMBDA_ROLE_ARN" ]; then
    echo -e "${YELLOW}⚠️  Warning: Could not get Lambda role ARN automatically${NC}"
    echo -e "${YELLOW}   You may need to manually grant Lambda permission to access the secret${NC}"
else
    echo -e "  Lambda Role: ${GREEN}$LAMBDA_ROLE_ARN${NC}"
    
    # Create inline policy for Lambda role
    POLICY_JSON=$(cat <<EOF
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
        "secretsmanager:GetSecretValue",
        "secretsmanager:DescribeSecret"
      ],
      "Resource": "arn:aws:secretsmanager:${REGION}:*:secret:${SECRET_NAME}*"
    }
  ]
}
EOF
)
    
    # Extract role name from ARN
    ROLE_NAME=$(echo "$LAMBDA_ROLE_ARN" | awk -F'/' '{print $NF}')
    
    # Put inline policy
    aws iam put-role-policy \
        --role-name "$ROLE_NAME" \
        --policy-name "SecretsManagerAccess" \
        --policy-document "$POLICY_JSON" \
        2>/dev/null && echo -e "${GREEN}✓ Lambda permission granted${NC}" || echo -e "${YELLOW}⚠️  Permission update may have failed - check IAM console${NC}"
fi

echo ""
echo -e "${GREEN}════════════════════════════════════════════════════════════${NC}"
echo -e "${GREEN}  ✓ Setup Complete!${NC}"
echo -e "${GREEN}════════════════════════════════════════════════════════════${NC}"
echo ""
echo -e "${BLUE}Next Steps:${NC}"
echo -e "  1. Deploy environment variables: ${YELLOW}make deploy-env-lambda${NC}"
echo -e "  2. Deploy Lambda code: ${YELLOW}make deploy-lambda-fast${NC}"
echo -e "  3. Test the setup: ${YELLOW}make test-secrets${NC}"
echo ""
echo -e "${YELLOW}ℹ️  Note: The private key is now stored in AWS Secrets Manager${NC}"
echo -e "${YELLOW}   and will be fetched at Lambda runtime instead of from${NC}"
echo -e "${YELLOW}   environment variables.${NC}"
echo ""

# Clean up temp files
rm -f /tmp/secret-*.json
