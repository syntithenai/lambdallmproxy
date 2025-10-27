#!/bin/bash

# Deployment Status Checker
# Shows current deployment status and helps verify deployments

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
RED='\033[0;31m'
NC='\033[0m'

echo -e "${BLUE}🔍 Lambda LLM Proxy Deployment Status${NC}"
echo ""

# Check AWS CLI
if ! command -v aws &> /dev/null; then
    echo -e "${RED}❌ AWS CLI not installed${NC}"
    exit 1
fi

# Check credentials
if ! aws sts get-caller-identity > /dev/null 2>&1; then
    echo -e "${RED}❌ AWS credentials not configured${NC}"
    exit 1
fi

echo -e "${GREEN}✅ AWS CLI configured${NC}"

# Check Lambda function
echo -e "${YELLOW}📋 Lambda Function Status:${NC}"
LAST_MODIFIED=$(aws lambda get-function --function-name llmproxy --query 'Configuration.LastModified' --output text 2>/dev/null)
if [ $? -eq 0 ]; then
    echo -e "${GREEN}✅ Function exists - Last modified: $LAST_MODIFIED${NC}"
    
    # Get function URL
    FUNCTION_URL=$(aws lambda get-function-url-config --function-name llmproxy --query 'FunctionUrl' --output text 2>/dev/null)
    if [ $? -eq 0 ]; then
        echo -e "${GREEN}✅ Function URL: $FUNCTION_URL${NC}"
    else
        echo -e "${YELLOW}⚠️ Function URL not configured${NC}"
    fi
else
    echo -e "${RED}❌ Lambda function 'llmproxy' not found${NC}"
fi

# Check environment variables
echo -e "${YELLOW}📋 Environment Configuration:${NC}"
if [ -f ".env" ]; then
    echo -e "${GREEN}✅ .env file exists${NC}"
    
    # Check for required variables
    if grep -q "OPENAI_API_KEY" .env; then
        echo -e "${GREEN}✅ OpenAI API key configured${NC}"
    else
        echo -e "${RED}❌ OpenAI API key missing in .env${NC}"
    fi
    
    if grep -q "LAMBDA_URL" .env; then
        echo -e "${GREEN}✅ Lambda URL configured${NC}"
    else
        echo -e "${YELLOW}⚠️ Lambda URL not in .env${NC}"
    fi
else
    echo -e "${RED}❌ .env file not found${NC}"
fi

# Check documentation
echo -e "${YELLOW}📋 Documentation Status:${NC}"
if [ -d "docs" ] && [ -f "docs/index.html" ]; then
    echo -e "${GREEN}✅ Documentation built${NC}"
    echo -e "${BLUE}🔗 Local preview: http://localhost:8081 (run 'make serve')${NC}"
    echo -e "${BLUE}🔗 Live site: https://lambdallmproxy.pages.dev${NC}"
else
    echo -e "${YELLOW}⚠️ Documentation not built - run 'make build-docs'${NC}"
fi

echo ""
echo -e "${BLUE}💡 Quick Commands:${NC}"
echo -e "  make dev          ${YELLOW}# Deploy Lambda after code changes${NC}"
echo -e "  make full-deploy  ${YELLOW}# Deploy everything${NC}"
echo -e "  make test         ${YELLOW}# Test the function${NC}"
echo -e "  make serve        ${YELLOW}# Preview docs locally${NC}"