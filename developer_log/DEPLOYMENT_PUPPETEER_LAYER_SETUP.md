# Puppeteer Chromium Layer Setup

**Date:** January 2025  
**Status:** ⏸️ PENDING MANUAL AWS SETUP  
**Code Status:** ✅ DEPLOYED (202KB, fast deployment)

## Current State

- ✅ Puppeteer code deployed to Lambda successfully
- ✅ Dependencies added (puppeteer-core, @sparticuz/chromium)
- ✅ Environment variable added (USE_PUPPETEER)
- ✅ Documentation complete
- ⏸️ Chromium Lambda Layer NOT yet added
- ⏸️ USE_PUPPETEER defaults to false (safe)

## Why Lambda Layer?

The Chromium binary is ~64MB, which is too large to include in the Lambda function package:

```bash
du -sh node_modules/@sparticuz
# Result: 64M
```

Attempted full deployment failed:
```bash
make deploy-lambda  # Exit code: 2
# Error: Connection was closed before we received a valid response
```

Solution: Use fast deployment (code only, 202KB) + separate Lambda Layer for Chromium:
```bash
make deploy-lambda-fast  # Success! (202KB)
```

## Manual Setup Required

### Option 1: AWS Console (Easiest - 1 minute)

1. **Open Lambda Function:**
   - Go to: https://console.aws.amazon.com/lambda
   - Select function: `llmproxy`
   - Region: `us-east-1`

2. **Add Layer:**
   - Scroll to "Layers" section
   - Click "Add a layer"
   - Choose "Specify an ARN"
   - Enter ARN: `arn:aws:lambda:us-east-1:764866452798:layer:chrome-aws-lambda:43`
   - Click "Add"

3. **Verify:**
   - Check "Layers" section shows "chrome-aws-lambda:43"

### Option 2: AWS CLI (Fast)

```bash
aws lambda update-function-configuration \
  --function-name llmproxy \
  --layers arn:aws:lambda:us-east-1:764866452798:layer:chrome-aws-lambda:43 \
  --region us-east-1
```

### Option 3: Terraform (For Infrastructure as Code)

```hcl
resource "aws_lambda_function" "llmproxy" {
  function_name = "llmproxy"
  
  layers = [
    "arn:aws:lambda:us-east-1:764866452798:layer:chrome-aws-lambda:43"
  ]
  
  # ... other configuration ...
}
```

## Increase Lambda Memory (Recommended)

Chromium requires 200-300MB of memory. Increase Lambda memory to 1024MB:

### AWS Console:

1. Open Lambda function "llmproxy"
2. Go to "Configuration" → "General configuration"
3. Click "Edit"
4. Set "Memory" to 1024 MB
5. Click "Save"

### AWS CLI:

```bash
aws lambda update-function-configuration \
  --function-name llmproxy \
  --memory-size 1024 \
  --region us-east-1
```

## Enable Puppeteer

After Layer is installed, enable the feature:

1. **Update local .env:**
   ```bash
   # Edit .env file
   USE_PUPPETEER=true
   ```

2. **Deploy environment variables:**
   ```bash
   make deploy-env
   ```

3. **Verify in AWS Console:**
   - Lambda → llmproxy → Configuration → Environment variables
   - Check USE_PUPPETEER = true

## Testing

### 1. Test Basic Scraping

Ask in chat:
```
Scrape https://example.com
```

### 2. Check Logs

```bash
make logs
```

Look for:
```
🤖 [Puppeteer] Scraping https://example.com with headless Chromium
✅ [Puppeteer] Successfully scraped https://example.com
```

### 3. Test JavaScript-Rendered Page

Try a React/Vue/Angular SPA:
```
Scrape https://reactjs.org
```

Puppeteer should capture content that traditional HTTP fetch cannot.

### 4. Test Fallback

Disable Puppeteer:
```bash
# Edit .env
USE_PUPPETEER=false

# Deploy
make deploy-env
```

Verify falls back to Tavily/DuckDuckGo in logs.

## Troubleshooting

### Layer Not Found

**Error:** "Layer not found"

**Solution:** Check ARN is correct and region matches:
```bash
aws lambda get-layer-version \
  --layer-name chrome-aws-lambda \
  --version-number 43 \
  --region us-east-1
```

### Out of Memory (OOM)

**Error:** "Process exited before completing request"

**Solution:** Increase Lambda memory to 1024MB (see above).

### Chromium Launch Timeout

**Error:** "Chromium failed to launch"

**Solution:** 
1. Check Layer is installed
2. Increase Lambda timeout to 60s
3. Check Lambda memory is 1024MB+

### Permission Denied

**Error:** "EACCES: permission denied, open '/tmp/...'"

**Solution:** Chromium Layer handles /tmp permissions automatically. Check Layer ARN is correct.

## Cost Analysis

### Traditional Scraping
- Invocation time: ~1 second
- Memory: 256MB
- Cost per 1M requests: ~$4.20

### Puppeteer Scraping
- Invocation time: ~3 seconds
- Memory: 1024MB (recommended)
- Cost per 1M requests: ~$50.40

**Recommendation:** Use Puppeteer only for JavaScript-rendered pages. Keep USE_PUPPETEER=false by default and enable selectively.

## Performance Comparison

| Feature | Traditional | Puppeteer |
|---------|-------------|-----------|
| Static HTML | ✅ Fast | ⚠️ Slower |
| JavaScript-rendered | ❌ Incomplete | ✅ Complete |
| AJAX content | ❌ Missing | ✅ Captured |
| Images/Links | ⚠️ Limited | ✅ Full extraction |
| Speed | ~1s | ~3s |
| Memory | 256MB | 1024MB |
| Cost | $4.20/1M | $50.40/1M |

## Next Steps

1. **Add Chromium Layer** (AWS Console or CLI)
2. **Increase Lambda memory** to 1024MB
3. **Enable USE_PUPPETEER** in .env
4. **Deploy environment** with `make deploy-env`
5. **Test scraping** and check logs
6. **Monitor costs** and adjust USE_PUPPETEER as needed

## References

- **Chromium Layer:** https://github.com/Sparticuz/chromium
- **Layer ARN:** `arn:aws:lambda:us-east-1:764866452798:layer:chrome-aws-lambda:43`
- **Full Documentation:** `developer_log/FEATURE_PUPPETEER_WEB_SCRAPING.md`
- **Lambda Function:** `llmproxy` (us-east-1)
- **Lambda URL:** https://nrw7pperjjdswbmqgmigbwsbyi0rwdqf.lambda-url.us-east-1.on.aws

## Summary

✅ **Code is deployed and functional** (defaults to traditional scraping)  
⏸️ **Manual AWS setup required:** Add Chromium Layer to enable Puppeteer  
📚 **Documentation complete:** Setup instructions and troubleshooting guide  
🔒 **Safe by default:** USE_PUPPETEER=false prevents unexpected costs  
🚀 **Ready to enable:** Once Layer is installed, just set USE_PUPPETEER=true
