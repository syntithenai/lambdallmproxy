#!/bin/bash

# Test the Lambda function and capture logs
echo "🧪 Testing Lambda function with HTTP headers debugging..."
echo ""

# Make a request to the Lambda
curl -X POST https://nrw7pperjjdswbmqgmigbwsbyi0rwdqf.lambda-url.us-east-1.on.aws/ \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $(cat ~/.groq_api_key 2>/dev/null || echo 'test')" \
  -d '{
    "messages": [
      {"role": "user", "content": "What is 2+2?"}
    ],
    "model": "llama-3.1-8b-instant",
    "stream": true
  }' 2>&1 | head -100

echo ""
echo ""
echo "📋 Checking CloudWatch logs for HTTP headers debug info..."
echo ""

# Wait a moment for logs to propagate
sleep 3

# Fetch recent logs
aws logs tail /aws/lambda/llmproxy --since 2m --format short | grep -A 5 "DEBUG"

echo ""
echo "✅ Test complete. Check the output above for HTTP headers debug info."
