# SSE Streaming Fixes Summary

## Issues Fixed

### 1. Runtime.ImportModuleError: Cannot find module 'aws-lambda'
**Problem:** Code was trying to import `awslambda` as an npm package
**Solution:** Removed `const awslambda = require('aws-lambda');` from:
- `src/index.js`
- `src/endpoints/planning.js`
- `src/endpoints/search.js`

**Reason:** `awslambda` is a global object provided by Lambda runtime when using Response Streaming mode. It does not need to be imported.

### 2. Duplicate Access-Control-Allow-Origin Headers
**Problem:** CORS error: "The 'Access-Control-Allow-Origin' header contains multiple values '*, http://localhost:8081', but only one is allowed"

**Root Cause:** Both the Lambda Function URL CORS configuration AND the application code were setting CORS headers, resulting in duplicates.

**Solution:** Removed all CORS headers from application code:
- `src/endpoints/planning.js` - Removed CORS headers from metadata
- `src/endpoints/search.js` - Removed CORS headers from metadata
- `src/index.js` - Removed CORS headers from OPTIONS handler

**Current Setup:**
- Lambda Function URL handles ALL CORS via its configuration
- Application code only sets content-specific headers:
  - `Content-Type: text/event-stream`
  - `Cache-Control: no-cache`
  - `Connection: keep-alive`

### 3. HTML Parser Method Name Error
**Problem:** `parser.extractText is not a function`

**Root Cause:** The `SimpleHTMLParser` class has a method called `convertToText()`, but the search endpoint was calling `extractText()`.

**Solution:** Updated `src/endpoints/search.js` to:
```javascript
const parser = new SimpleHTMLParser(data);
const content = parser.convertToText(data);
```

## Lambda Function URL CORS Configuration

The Lambda Function URL is configured with comprehensive CORS headers:

```json
{
  "AllowCredentials": true,
  "AllowHeaders": [
    "content-type", "authorization", "origin", "accept",
    "cache-control", "x-requested-with", "accept-encoding",
    "accept-language", "connection", "host", "referer", "user-agent"
  ],
  "AllowMethods": ["*"],
  "AllowOrigins": ["*"],
  "ExposeHeaders": [
    "content-type", "content-length", "date", "x-amzn-requestid"
  ],
  "MaxAge": 86400
}
```

### How Lambda Function URL CORS Works

1. **Automatic CORS Handling:** When configured, Lambda Function URL automatically handles OPTIONS preflight requests and adds CORS headers to all responses.

2. **Origin Reflection:** When `AllowOrigins: ["*"]` is set, the Function URL reflects the actual origin from the request:
   - Request from `http://localhost:8081` → Response has `Access-Control-Allow-Origin: http://localhost:8081`
   - Request from `https://lambdallmproxy.pages.dev` → Response has `Access-Control-Allow-Origin: https://lambdallmproxy.pages.dev`

3. **Method Confirmation:** When `AllowMethods: ["*"]` is set and an OPTIONS preflight comes in with `Access-Control-Request-Method: POST`, the response confirms with `Access-Control-Allow-Methods: POST` (not `*`). This is correct CORS behavior.

4. **No Application Code Needed:** Since the Function URL handles CORS, application code should NOT set any CORS headers to avoid duplicates.

## Deployment Script Updates

The `scripts/deploy.sh` script was updated to maintain the comprehensive CORS configuration:

```bash
aws lambda update-function-url-config \
    --function-name "$FUNCTION_NAME" \
    --region "$REGION" \
    --cors AllowCredentials=true,AllowHeaders=content-type,authorization,origin,accept,cache-control,x-requested-with,accept-encoding,accept-language,connection,host,referer,user-agent,AllowMethods=*,AllowOrigins=*,MaxAge=86400,ExposeHeaders=content-type,content-length,date,x-amzn-requestid \
    --invoke-mode RESPONSE_STREAM
```

## Testing

### Test CORS with localhost
```bash
curl -v -X POST "https://nrw7pperjjdswbmqgmigbwsbyi0rwdqf.lambda-url.us-east-1.on.aws/search" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer TOKEN" \
  -H "Accept: text/event-stream" \
  -H "Origin: http://localhost:8081" \
  -d '{"queries":["test"],"maxResults":5,"includeContent":true}'
```

Expected: `Access-Control-Allow-Origin: http://localhost:8081` (single value)

### Test CORS with production
```bash
curl -v -X POST "https://nrw7pperjjdswbmqgmigbwsbyi0rwdqf.lambda-url.us-east-1.on.aws/search" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer TOKEN" \
  -H "Accept: text/event-stream" \
  -H "Origin: https://lambdallmproxy.pages.dev" \
  -d '{"queries":["test"],"maxResults":5,"includeContent":true}'
```

Expected: `Access-Control-Allow-Origin: https://lambdallmproxy.pages.dev` (single value)

## Key Takeaways

1. **awslambda is a global** - Don't import it, it's provided by the runtime
2. **One CORS source only** - Use either Function URL config OR application code, not both
3. **Lambda Function URL CORS is powerful** - It handles everything automatically when configured
4. **Method names matter** - Always check the actual class method names (`convertToText` not `extractText`)

## Files Modified

1. `src/index.js` - Removed aws-lambda import, removed CORS headers from OPTIONS handler
2. `src/endpoints/planning.js` - Removed aws-lambda import, removed CORS headers
3. `src/endpoints/search.js` - Removed aws-lambda import, removed CORS headers, fixed parser method
4. `scripts/deploy.sh` - Updated to include comprehensive CORS headers in Function URL config

## Current Status

✅ Lambda function deployed successfully
✅ SSE streaming working
✅ CORS headers correct (single value, no duplicates)
✅ HTML parser using correct method name
✅ All endpoints functional
✅ Works with both localhost and production origins
