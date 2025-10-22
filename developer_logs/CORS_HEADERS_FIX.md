# CORS Headers Fix for SSE Streaming

## Issue
Browser was showing CORS errors when making requests to the Lambda endpoints because the application code was setting limited CORS headers that overrode the Lambda Function URL configuration.

## Root Cause
The endpoints (`planning.js` and `search.js`) were setting their own CORS headers in the response metadata:
```javascript
'Access-Control-Allow-Headers': 'Content-Type,Authorization'  // Only 2 headers ❌
```

These headers overrode the Lambda Function URL CORS configuration (which had 12 headers).

## Solution
Updated CORS headers in all endpoint response metadata to match the comprehensive Lambda Function URL configuration.

### Files Updated

1. **src/endpoints/planning.js** (line ~133)
2. **src/endpoints/search.js** (line ~185)
3. **src/index.js** (line ~32, OPTIONS handler)

### New CORS Configuration

All endpoints now include:

```javascript
headers: {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'content-type,authorization,origin,accept,cache-control,x-requested-with,accept-encoding,accept-language,connection,host,referer,user-agent',
    'Access-Control-Allow-Methods': '*',
    'Access-Control-Expose-Headers': 'content-type,content-length,date,x-amzn-requestid',
    'Access-Control-Max-Age': '86400'
}
```

### Headers Breakdown

**AllowHeaders (12 total):**
- `content-type` - Request content type
- `authorization` - JWT tokens
- `origin` - Request origin
- `accept` - Content negotiation
- `cache-control` - Cache directives
- `x-requested-with` - AJAX requests
- `accept-encoding` - Compression support
- `accept-language` - Language preferences
- `connection` - Connection management
- `host` - Target host
- `referer` - Referrer URL
- `user-agent` - Client information

**ExposeHeaders (4 total):**
- `content-type` - Response content type
- `content-length` - Response size
- `date` - Response timestamp
- `x-amzn-requestid` - AWS request ID for debugging

**Additional Settings:**
- `Access-Control-Max-Age: 86400` - Cache preflight for 24 hours
- `Access-Control-Allow-Methods: *` - All HTTP methods allowed
- `Access-Control-Allow-Origin: *` - All origins allowed

## Verification

Test endpoints show correct headers:
```bash
# Search endpoint
curl -v -X POST https://nrw7pperjjdswbmqgmigbwsbyi0rwdqf.lambda-url.us-east-1.on.aws/search \
  -H "Content-Type: application/json" \
  -H "Origin: https://lambdallmproxy.pages.dev" \
  -d '{"queries":["test"]}'

# Planning endpoint  
curl -v -X POST https://nrw7pperjjdswbmqgmigbwsbyi0rwdqf.lambda-url.us-east-1.on.aws/planning \
  -H "Content-Type: application/json" \
  -H "Origin: https://lambdallmproxy.pages.dev" \
  -d '{"query":"test"}'
```

Both return:
```
access-control-allow-headers: content-type,authorization,origin,accept,cache-control,x-requested-with,accept-encoding,accept-language,connection,host,referer,user-agent
access-control-expose-headers: content-type,content-length,date,x-amzn-requestid
access-control-max-age: 86400
```

## Browser Compatibility

These headers support:
- ✅ Chrome/Edge - All versions
- ✅ Firefox - All versions
- ✅ Safari - All versions
- ✅ Server-Sent Events (SSE)
- ✅ Fetch API with streaming
- ✅ CORS preflight caching

## Notes

- Headers must be consistent between Lambda Function URL config and application code
- Application-level headers take precedence over Function URL config
- MaxAge of 86400 (24 hours) reduces preflight requests for better performance
- Wildcards (*) simplify configuration but can be restricted to specific origins in production

## Related Files

- `scripts/deploy.sh` - Includes Lambda Function URL CORS configuration
- `AWS_LAMBDA_GLOBAL_FIX.md` - Documents the awslambda global object fix
- `.github/copilot-instructions.md` - Project deployment workflow
