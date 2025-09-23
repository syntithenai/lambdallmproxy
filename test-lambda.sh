#!/bin/bash

# Simple test script to check Lambda function directly
echo "Testing Lambda function with minimal payload..."

# Create a simple test payload
cat > /tmp/simple-test.json << 'EOF'
{
  "httpMethod": "POST",
  "headers": {
    "content-type": "application/json",
    "accept": "text/event-stream"
  },
  "body": "{\"query\":\"hello\",\"apiKey\":\"test-key\"}"
}
EOF

echo "Test payload:"
cat /tmp/simple-test.json

echo -e "\nInvoking Lambda function..."
aws lambda invoke \
  --function-name llmproxy \
  --region us-east-1 \
  --payload file:///tmp/simple-test.json \
  /tmp/lambda-output.json

echo -e "\nLambda response:"
cat /tmp/lambda-output.json | jq .

echo -e "\nChecking recent logs..."
aws logs get-log-events \
  --log-group-name "/aws/lambda/llmproxy" \
  --log-stream-name "$(aws logs describe-log-streams --log-group-name "/aws/lambda/llmproxy" --order-by LastEventTime --descending --max-items 1 --query 'logStreams[0].logStreamName' --output text)" \
  --start-time $(date -d '2 minutes ago' +%s)000 \
  --query 'events[*].message' \
  --output text