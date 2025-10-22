# Lambda Function URL InvokeMode Fix

## Problem

The search and planning endpoints were returning HTTP 200 OK but with no usable response body. The actual response was being wrapped in a Lambda response object structure:

```json
{
  "statusCode": 401,
  "headers": {...},
  "body": "{\"error\":\"...\"}"
}
```

## Root Cause

The Lambda Function URL was configured with `InvokeMode: RESPONSE_STREAM`, but the endpoint handlers (planning, search, proxy) were returning regular JSON response objects, not streaming responses.

When a Lambda function URL is in `RESPONSE_STREAM` mode, it expects the function to write to a response stream. When it receives a regular object return, it wraps it in the Lambda response format.

## Solution

Changed the Lambda Function URL `InvokeMode` from `RESPONSE_STREAM` to `BUFFERED`:

```bash
aws lambda update-function-url-config \
  --function-name llmproxy \
  --region us-east-1 \
  --invoke-mode BUFFERED
```

## Deploy Script Update

Updated `/scripts/deploy.sh` to automatically verify and set the correct invoke mode on every deployment:

**Before:**
```bash
if [[ "$CURRENT_INVOKE_MODE" != "RESPONSE_STREAM" ]]; then
    echo -e "${YELLOW}⚠️  InvokeMode is '$CURRENT_INVOKE_MODE', should be 'RESPONSE_STREAM'${NC}"
    NEEDS_CORS_UPDATE=true
fi

# ... later ...
--invoke-mode RESPONSE_STREAM > /dev/null
```

**After:**
```bash
if [[ "$CURRENT_INVOKE_MODE" != "BUFFERED" ]]; then
    echo -e "${YELLOW}⚠️  InvokeMode is '$CURRENT_INVOKE_MODE', should be 'BUFFERED'${NC}"
    NEEDS_CORS_UPDATE=true
fi

# ... later ...
--invoke-mode BUFFERED > /dev/null
```

## Verification

After the fix, endpoints return proper JSON responses:

### Before (broken):
```bash
$ curl -X POST .../search -d '{"queries":["test"]}'
{"statusCode":401,"headers":{...},"body":"{\"error\":\"...\"}"}
```

### After (fixed):
```bash
$ curl -X POST .../search -d '{"queries":["test"]}'
{"error":"Authentication required. Please provide a valid JWT token in the Authorization header.","code":"UNAUTHORIZED"}
```

## Impact

- ✅ Planning endpoint now returns proper JSON
- ✅ Search endpoint now returns proper JSON  
- ✅ Proxy endpoint continues to work correctly
- ✅ Future deployments will maintain BUFFERED mode
- ✅ Proper error messages are now visible to the client

## Notes

- `BUFFERED` mode is appropriate for most REST API use cases where you return JSON
- `RESPONSE_STREAM` mode is for server-sent events (SSE) or other streaming responses
- The proxy endpoint may benefit from streaming in the future, but currently returns buffered responses
