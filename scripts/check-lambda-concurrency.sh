#!/bin/bash

# Script to check AWS Lambda concurrency limits and request increase
# Author: Research Agent
# Date: October 27, 2025

set -e

FUNCTION_NAME="llmproxy"
REGION="us-east-1"
TARGET_CONCURRENCY=1000

echo "🔍 Checking AWS Lambda Concurrency Limits..."
echo "================================================"
echo ""

# Check account-wide concurrency limits
echo "📊 Account-wide concurrency limits:"
ACCOUNT_SETTINGS=$(aws lambda get-account-settings --region $REGION --output json)

CURRENT_LIMIT=$(echo $ACCOUNT_SETTINGS | jq -r '.AccountLimit.ConcurrentExecutions')
UNRESERVED_LIMIT=$(echo $ACCOUNT_SETTINGS | jq -r '.AccountLimit.UnreservedConcurrentExecutions')

echo "  - Total Concurrent Executions: $CURRENT_LIMIT"
echo "  - Unreserved Concurrent Executions: $UNRESERVED_LIMIT"
echo ""

# Check function-specific reserved concurrency
echo "📊 Function-specific concurrency ($FUNCTION_NAME):"
FUNCTION_CONCURRENCY=$(aws lambda get-function-concurrency --function-name $FUNCTION_NAME --region $REGION 2>&1 || echo "null")

if echo "$FUNCTION_CONCURRENCY" | grep -q "ReservedConcurrentExecutions"; then
  RESERVED=$(echo $FUNCTION_CONCURRENCY | jq -r '.ReservedConcurrentExecutions')
  echo "  - Reserved Concurrent Executions: $RESERVED"
else
  echo "  - Reserved Concurrent Executions: None (using account limit)"
fi
echo ""

# Analyze current status
echo "⚠️  Status Analysis:"
if [ "$CURRENT_LIMIT" -lt "$TARGET_CONCURRENCY" ]; then
  echo "  ❌ CRITICAL: Current limit ($CURRENT_LIMIT) is below recommended ($TARGET_CONCURRENCY)"
  echo "  ❌ This limits your application to ~$CURRENT_LIMIT simultaneous users"
  echo "  ❌ Additional requests will be throttled with HTTP 429 errors"
  echo ""
  
  # Provide instructions for requesting increase
  echo "📝 How to Request Concurrency Increase:"
  echo "================================================"
  echo ""
  echo "1. Open AWS Support Center:"
  echo "   https://console.aws.amazon.com/support/home#/case/create"
  echo ""
  echo "2. Select Case Type:"
  echo "   - Choose: Service limit increase"
  echo ""
  echo "3. Fill out the form:"
  echo "   - Limit type: Lambda"
  echo "   - Region: $REGION"
  echo "   - Limit: Concurrent executions"
  echo "   - New limit value: $TARGET_CONCURRENCY (or higher)"
  echo ""
  echo "4. Business Justification (copy this):"
  echo "   \"We are running a production AI research assistant application"
  echo "   (Lambda LLM Proxy) that serves multiple concurrent users. Our"
  echo "   current limit of $CURRENT_LIMIT concurrent executions is blocking"
  echo "   our ability to scale and serve our growing user base. We need"
  echo "   to support 100+ concurrent users for normal operations and handle"
  echo "   traffic spikes. Requesting increase to $TARGET_CONCURRENCY concurrent"
  echo "   executions to ensure application availability and user experience.\""
  echo ""
  echo "5. Expected Approval Time:"
  echo "   - Typical response: 24-48 hours"
  echo "   - Urgent requests: Can be expedited with business justification"
  echo ""
  
  # Offer to submit the request directly via AWS CLI
  echo "🚀 Quick Action:"
  echo "================================================"
  echo ""
  read -p "Would you like to submit the concurrency increase request now? (y/n) " -n 1 -r
  echo ""
  if [[ $REPLY =~ ^[Yy]$ ]]; then
    echo ""
    echo "📤 Submitting AWS Support case..."
    
    # Create case via AWS CLI
    CASE_SUBJECT="Lambda Concurrency Limit Increase Request - llmproxy"
    CASE_BODY="Service Limit Increase Request

Service: AWS Lambda
Region: $REGION
Limit Name: Concurrent executions
Current Limit: $CURRENT_LIMIT
Requested New Limit: $TARGET_CONCURRENCY

Business Justification:
We are running a production AI research assistant application (Lambda LLM Proxy) that serves multiple concurrent users. Our current limit of $CURRENT_LIMIT concurrent executions is blocking our ability to scale and serve our growing user base. We need to support 100+ concurrent users for normal operations and handle traffic spikes. Requesting increase to $TARGET_CONCURRENCY concurrent executions to ensure application availability and user experience.

Function Name: $FUNCTION_NAME
Use Case: Production AI research assistant with real-time LLM inference, web search, and RAG capabilities
Expected Traffic: 100-500 concurrent users during peak hours
Current Throttling: Yes, users receiving HTTP 429 errors when limit is exceeded

Technical Details:
- Application: Lambda LLM Proxy (Node.js 18)
- Architecture: Serverless with API Gateway
- Memory: 512MB-1024MB per invocation
- Duration: 2-30 seconds per request
- Invocation Pattern: User-initiated chat requests, web search, image generation

Thank you for your consideration."

    # Submit the case (requires AWS Support plan)
    CASE_RESULT=$(aws support create-case \
      --subject "$CASE_SUBJECT" \
      --service-code "lambda" \
      --severity-code "normal" \
      --category-code "general-guidance" \
      --communication-body "$CASE_BODY" \
      --cc-email-addresses "" \
      --language "en" \
      --region us-east-1 \
      2>&1)
    
    if [ $? -eq 0 ]; then
      CASE_ID=$(echo "$CASE_RESULT" | jq -r '.caseId')
      echo "✅ Support case created successfully!"
      echo "📋 Case ID: $CASE_ID"
      echo ""
      echo "You can track your case at:"
      echo "https://console.aws.amazon.com/support/home#/case/?displayId=$CASE_ID"
      echo ""
      echo "Expected response time: 24-48 hours"
    else
      echo "❌ Failed to create support case via CLI"
      echo ""
      echo "Error details:"
      echo "$CASE_RESULT"
      echo ""
      echo "This might be because:"
      echo "1. You don't have an AWS Support plan (Developer, Business, or Enterprise)"
      echo "2. Your IAM user lacks support:CreateCase permission"
      echo ""
      echo "📝 Alternative: Manual submission via AWS Console"
      echo "Please visit: https://console.aws.amazon.com/support/home#/case/create"
      echo ""
      echo "Or use the Service Quotas API (doesn't require Support plan):"
      echo "aws service-quotas request-service-quota-increase \\"
      echo "  --service-code lambda \\"
      echo "  --quota-code L-B99A9384 \\"
      echo "  --desired-value $TARGET_CONCURRENCY \\"
      echo "  --region $REGION"
    fi
  fi
  
else
  echo "  ✅ Current limit ($CURRENT_LIMIT) is sufficient"
  echo "  ✅ Your application can handle ~$CURRENT_LIMIT simultaneous users"
fi

echo ""
echo "📋 Alternative Solutions (if increase is denied):"
echo "================================================"
echo ""
echo "Option 1: Request Queuing"
echo "  - Use SQS to buffer requests when Lambda is at capacity"
echo "  - Provide 'Position in queue' feedback to users"
echo "  - Automatically retry when Lambda available"
echo ""
echo "Option 2: Multiple Lambda Functions"
echo "  - Split workload: chat-service, search-service, rag-service"
echo "  - Each gets separate concurrency limit"
echo "  - Total capacity: 3-4x current limit"
echo ""
echo "Option 3: Provisioned Concurrency"
echo "  - Pre-warm Lambda instances (eliminates cold starts)"
echo "  - Costs ~\$14/month but guarantees availability"
echo "  - Recommended for production critical workloads"
echo ""

# Save report to file
REPORT_FILE="lambda-concurrency-report-$(date +%Y%m%d-%H%M%S).txt"
cat > "$REPORT_FILE" << EOF
AWS Lambda Concurrency Report
Generated: $(date)
================================================

Account Settings:
- Total Concurrent Executions: $CURRENT_LIMIT
- Unreserved Concurrent Executions: $UNRESERVED_LIMIT

Function Settings ($FUNCTION_NAME):
$FUNCTION_CONCURRENCY

Status:
$([ "$CURRENT_LIMIT" -lt "$TARGET_CONCURRENCY" ] && echo "❌ NEEDS INCREASE to $TARGET_CONCURRENCY" || echo "✅ SUFFICIENT")

Target: $TARGET_CONCURRENCY concurrent executions
Current Capacity: ~$CURRENT_LIMIT simultaneous users
EOF

echo "💾 Report saved to: $REPORT_FILE"
echo ""
