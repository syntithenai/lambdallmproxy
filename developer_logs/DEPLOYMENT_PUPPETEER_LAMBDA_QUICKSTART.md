# Puppeteer Lambda Deployment - Quick Start Guide

**Date:** October 12, 2025  
**Goal:** Deploy Puppeteer in separate Lambda with reversed fallback logic

## What Changed

### Architecture
- **Before**: Single Lambda (1024MB) with Puppeteer + Chromium built-in
- **After**: Dual Lambda architecture
  - Main Lambda (256-512MB): LLM proxy, tools, direct scraping
  - Puppeteer Lambda (1024MB): Chromium rendering only when needed

### Scraping Flow (REVERSED)
- **Before**: Puppeteer first → Fallback to direct scraping
- **After**: Direct scraping first → Fallback to Puppeteer Lambda

## Quick Deployment (5 Minutes)

### Step 1: Setup Puppeteer Lambda

```bash
# Create Puppeteer Lambda function with Chromium Layer
make setup-puppeteer
```

**Output**:
```
Function Name: llmproxy-puppeteer
Function ARN: arn:aws:lambda:us-east-1:ACCOUNT_ID:function:llmproxy-puppeteer
Memory: 1024MB
Timeout: 60s
```

### Step 2: Deploy Puppeteer Code

```bash
# Deploy Puppeteer handler and dependencies
make deploy-puppeteer
```

**Output**:
```
Package size: 15MB
Code Size: 10.5MB
Status: Active
```

### Step 3: Setup Permissions

```bash
# Allow main Lambda to invoke Puppeteer Lambda
make setup-puppeteer-permissions
```

**Output**:
```
Policy: llmproxy-invoke-puppeteer-policy
Main Role: llmproxy-role
Status: Attached
```

### Step 4: Configure Environment

```bash
# Get Puppeteer ARN
PUPPETEER_ARN=$(aws lambda get-function \
  --function-name llmproxy-puppeteer \
  --query 'Configuration.FunctionArn' \
  --output text \
  --region us-east-1)

# Add to .env file
echo "PUPPETEER_LAMBDA_ARN=$PUPPETEER_ARN" >> .env
echo "USE_PUPPETEER=true" >> .env

# Deploy environment to main Lambda
make deploy-env
```

### Step 5: Deploy Main Lambda

```bash
# Install AWS SDK Lambda client (if not already installed)
npm install @aws-sdk/client-lambda

# Deploy main Lambda with new code
make deploy-lambda-fast
```

## Testing

### Test Direct Scraping (Fast Path)

```bash
# Should complete in ~1 second
aws lambda invoke \
  --function-name llmproxy \
  --payload '{
    "body": "{\"messages\":[{\"role\":\"user\",\"content\":\"Scrape https://example.com\"}],\"tools\":[{\"name\":\"scrape_web_content\"}]}"
  }' \
  --region us-east-1 \
  /tmp/direct-response.json

# Check response
cat /tmp/direct-response.json | jq '.body | fromjson | .scrapeService'
# Expected: "tavily" or "duckduckgo_proxy"
```

### Test Puppeteer Fallback (Slow Path)

```bash
# Force direct scraping to fail, should fallback to Puppeteer
# Use a JS-heavy page that direct scraping can't handle
aws lambda invoke \
  --function-name llmproxy \
  --payload '{
    "body": "{\"messages\":[{\"role\":\"user\",\"content\":\"Scrape https://react.dev\"}],\"tools\":[{\"name\":\"scrape_web_content\"}]}"
  }' \
  --region us-east-1 \
  /tmp/puppeteer-response.json

# Check response
cat /tmp/puppeteer-response.json | jq '.body | fromjson | .scrapeService'
# Expected: "puppeteer_lambda"
```

### Test Puppeteer Lambda Directly

```bash
# Test Puppeteer Lambda in isolation
aws lambda invoke \
  --function-name llmproxy-puppeteer \
  --payload '{
    "url": "https://example.com",
    "timeout": 30000,
    "extractLinks": true,
    "extractImages": true
  }' \
  --region us-east-1 \
  /tmp/puppeteer-direct.json

# Check response
cat /tmp/puppeteer-direct.json | jq '.body | fromjson | .success'
# Expected: true
```

## View Logs

### Main Lambda Logs

```bash
# Recent logs
make logs

# Live tail
make logs-tail
```

Look for:
- `[Direct Scraping] Trying...` (fast path)
- `[Puppeteer] Falling back...` (slow path)
- `✅ [Direct Scraping] Success` (fast path success)
- `✅ [Puppeteer] Scraping complete` (slow path success)

### Puppeteer Lambda Logs

```bash
# Live tail
make logs-puppeteer
```

Look for:
- `🌐 [Puppeteer] Launching Chromium`
- `✅ [Puppeteer] Browser launched`
- `📄 [Puppeteer] Navigating to`
- `✅ [Puppeteer] Page loaded`

## Verify Configuration

### Check Environment Variables

```bash
# Check main Lambda environment
aws lambda get-function-configuration \
  --function-name llmproxy \
  --query 'Environment.Variables.PUPPETEER_LAMBDA_ARN' \
  --output text \
  --region us-east-1

# Should show: arn:aws:lambda:us-east-1:ACCOUNT_ID:function:llmproxy-puppeteer

aws lambda get-function-configuration \
  --function-name llmproxy \
  --query 'Environment.Variables.USE_PUPPETEER' \
  --output text \
  --region us-east-1

# Should show: true
```

### Check IAM Permissions

```bash
# List policies attached to main Lambda role
aws iam list-attached-role-policies \
  --role-name llmproxy-role \
  --query 'AttachedPolicies[?PolicyName==`llmproxy-invoke-puppeteer-policy`]' \
  --output table

# Should show policy attached
```

### Check Puppeteer Lambda Configuration

```bash
# Check memory and timeout
aws lambda get-function-configuration \
  --function-name llmproxy-puppeteer \
  --query '{Memory:MemorySize,Timeout:Timeout,Runtime:Runtime,Layers:Layers[*].Arn}' \
  --output table \
  --region us-east-1

# Should show:
# Memory: 1024
# Timeout: 60
# Runtime: nodejs20.x
# Layers: [arn:aws:lambda:us-east-1:764866452798:layer:chrome-aws-lambda:43]
```

## Expected Behavior

### Scenario 1: Static HTML Page

```
User: "Scrape https://example.com"
  ↓
Main Lambda: "Trying direct scraping with DuckDuckGo+Proxy"
  ↓
DuckDuckGo: HTTP fetch succeeds
  ↓
Main Lambda: "✅ Success: 1234 chars"
  ↓
User: Gets content in ~1 second
```

**Cost**: ~$0.0000042 (256MB × 1s)

### Scenario 2: JavaScript-Rendered Page

```
User: "Scrape https://react.dev"
  ↓
Main Lambda: "Trying direct scraping with DuckDuckGo+Proxy"
  ↓
DuckDuckGo: HTTP fetch returns incomplete content
  ↓
Main Lambda: "❌ Direct scraping failed, falling back to Puppeteer"
  ↓
Puppeteer Lambda: Invoked by main Lambda
  ↓
Puppeteer Lambda: "🌐 Launching Chromium"
  ↓
Puppeteer Lambda: "📄 Navigating to page"
  ↓
Puppeteer Lambda: "✅ Success: 5678 chars"
  ↓
Main Lambda: Receives Puppeteer response
  ↓
User: Gets full rendered content in ~4 seconds
```

**Cost**: ~$0.0000540 (256MB × 1s + 1024MB × 3s)

### Scenario 3: Puppeteer Disabled

```
User: "Scrape https://react.dev"
  ↓
Main Lambda: "Trying direct scraping"
  ↓
DuckDuckGo: HTTP fetch returns incomplete content
  ↓
Main Lambda: "❌ Direct scraping failed"
  ↓
Main Lambda: "⚠️ Puppeteer disabled (USE_PUPPETEER=false)"
  ↓
User: Gets error or incomplete content
```

**Cost**: ~$0.0000042 (256MB × 1s)

## Troubleshooting

### "User is not authorized to perform: lambda:InvokeFunction"

```bash
# Re-run permissions setup
make setup-puppeteer-permissions
make deploy-env
```

### "PUPPETEER_LAMBDA_ARN environment variable not set"

```bash
# Get ARN and add to .env
PUPPETEER_ARN=$(aws lambda get-function \
  --function-name llmproxy-puppeteer \
  --query 'Configuration.FunctionArn' \
  --output text \
  --region us-east-1)

echo "PUPPETEER_LAMBDA_ARN=$PUPPETEER_ARN" >> .env
make deploy-env
```

### "Function not found: llmproxy-puppeteer"

```bash
# Setup Puppeteer Lambda
make setup-puppeteer
make deploy-puppeteer
```

### Puppeteer always times out

```bash
# Increase timeout
aws lambda update-function-configuration \
  --function-name llmproxy-puppeteer \
  --timeout 90 \
  --region us-east-1
```

### Main Lambda always using Puppeteer (expensive)

```bash
# Check proxy configuration
echo $WEBSHARE_PROXY_USERNAME
echo $WEBSHARE_PROXY_PASSWORD

# If missing, add to .env and deploy
echo "WEBSHARE_PROXY_USERNAME=your-username" >> .env
echo "WEBSHARE_PROXY_PASSWORD=your-password" >> .env
make deploy-env
```

## Cost Comparison

### Old Architecture (Single Lambda)

- Memory: 1024MB always
- Average duration: 2 seconds
- Cost per invocation: $0.0000332
- **Cost per 1M requests**: $33.20

### New Architecture (Dual Lambda)

Assuming 80% direct success, 20% Puppeteer fallback:

- Main Lambda (80%): 256MB × 1s = $0.0000042 × 800,000 = $3.36
- Main Lambda (20%): 256MB × 1s = $0.0000042 × 200,000 = $0.84
- Puppeteer Lambda (20%): 1024MB × 3s = $0.0000498 × 200,000 = $9.96

**Total cost per 1M requests**: $14.16  
**Savings**: $19.04 (57% reduction)

## Maintenance

### Update Puppeteer Code

```bash
# Edit src/puppeteer-handler.js
vim src/puppeteer-handler.js

# Deploy
make deploy-puppeteer
```

### Update Main Lambda

```bash
# Edit src/tools.js
vim src/tools.js

# Deploy
make deploy-lambda-fast
```

### Update Chromium Layer

```bash
# Update layer ARN in setup script if new version available
vim scripts/setup-puppeteer-function.sh

# Update function configuration
aws lambda update-function-configuration \
  --function-name llmproxy-puppeteer \
  --layers arn:aws:lambda:us-east-1:764866452798:layer:chrome-aws-lambda:44 \
  --region us-east-1
```

## Rollback

If issues arise:

```bash
# 1. Disable Puppeteer fallback
echo "USE_PUPPETEER=false" >> .env
make deploy-env

# 2. Remove Puppeteer Lambda (optional)
aws lambda delete-function \
  --function-name llmproxy-puppeteer \
  --region us-east-1

# 3. Revert code changes
git checkout HEAD~1 src/tools.js package.json
make deploy-lambda-fast
```

## Summary

✅ **Setup**: 5 commands to deploy dual Lambda architecture  
✅ **Testing**: 3 test scenarios to verify behavior  
✅ **Monitoring**: Logs and metrics for both functions  
✅ **Cost**: 57% reduction in average scraping costs  
✅ **Performance**: Fast path ~1s, slow path ~4s  
✅ **Fallback**: Automatic Puppeteer retry on direct scraping failure

## Next Steps

1. **Deploy** using the 5-step guide above
2. **Test** with both static and JS-heavy pages
3. **Monitor** logs and costs for first few days
4. **Adjust** memory/timeout based on actual usage
5. **Optimize** proxy configuration for better direct scraping success rate

For detailed documentation, see:
- `developer_log/ARCHITECTURE_PUPPETEER_LAMBDA_SEPARATION.md`
