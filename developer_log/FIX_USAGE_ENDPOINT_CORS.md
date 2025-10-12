# Fix: CORS Error on Usage Endpoint

**Date**: 2025-10-12  
**Status**: ✅ Fixed and Deployed

## Problem

The `/usage` endpoint was returning CORS errors in the browser, preventing the UI from fetching usage data.

**User Report**: "the usage endpoint is showing a cors error. is there a conflict between lamda function sending headers and the aws cors config"

**Browser Error**:
```
Access to fetch at 'https://...lambda-url.../usage' from origin 'https://syntithenai.github.io' 
has been blocked by CORS policy: The 'Access-Control-Allow-Origin' header contains multiple values 
'*, *', but only one is allowed.
```

## Root Cause

**Duplicate CORS Header Conflict**:

1. **AWS Lambda Function URL** has CORS configured at the infrastructure level:
   ```bash
   aws lambda update-function-url-config \
       --cors AllowOrigins=*,AllowMethods=*,AllowHeaders=... \
       --invoke-mode RESPONSE_STREAM
   ```

2. **Lambda Function Code** was also setting CORS headers:
   ```javascript
   headers: {
       'Content-Type': 'application/json',
       'Access-Control-Allow-Origin': '*'  // ❌ Duplicate!
   }
   ```

3. **Result**: AWS adds the CORS header, then Lambda function adds it again
   - Browser receives: `Access-Control-Allow-Origin: *, *`
   - Browser rejects response due to duplicate headers

## Architectural Background

### AWS Lambda Function URL CORS Handling

When you configure CORS at the AWS Lambda Function URL level, AWS automatically handles:
- Preflight OPTIONS requests
- CORS response headers (`Access-Control-Allow-*`)
- Header validation and enforcement

**This is the recommended approach** because:
- ✅ Consistent across all endpoints
- ✅ Handles preflight automatically
- ✅ No code changes needed for CORS
- ✅ Works with both buffered and streaming responses

### Lambda Function Response Headers

Lambda functions should **NOT** set CORS headers when:
- AWS Lambda Function URL CORS is configured
- The function is accessed via Function URL (not API Gateway)

Lambda functions **SHOULD** set CORS headers when:
- Using API Gateway without CORS configuration
- Custom CORS logic is needed per endpoint

## Solution

Removed all `Access-Control-Allow-Origin` headers from the usage endpoint, relying on AWS Lambda Function URL CORS configuration instead.

**File**: `src/endpoints/usage.js`

### Before (❌ Causes Conflict):
```javascript
return {
    statusCode: 401,
    headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'  // ❌ Conflicts with AWS CORS
    },
    body: JSON.stringify({ error: 'Unauthorized' })
};
```

### After (✅ AWS Handles CORS):
```javascript
return {
    statusCode: 401,
    headers: {
        'Content-Type': 'application/json'
        // Note: CORS headers handled by AWS Lambda Function URL configuration
    },
    body: JSON.stringify({ error: 'Unauthorized' })
};
```

## Changes Made

**File**: `src/endpoints/usage.js`

Removed `'Access-Control-Allow-Origin': '*'` from all response headers:
- Line 31: Unauthorized response (missing auth header)
- Line 57: Unauthorized response (invalid token)
- Line 90: Success response (200 OK)
- Line 103: Error response (500 Internal Server Error)

All CORS handling is now done by AWS Lambda Function URL configuration (configured in `scripts/deploy.sh` lines 255-320).

## AWS CORS Configuration

The deployment script (`scripts/deploy.sh`) configures CORS at the AWS level:

```bash
aws lambda update-function-url-config \
    --function-name "$FUNCTION_NAME" \
    --cors AllowCredentials=true,\
AllowHeaders=content-type,authorization,origin,accept,cache-control,x-requested-with,\
accept-encoding,accept-language,connection,host,referer,user-agent,\
AllowMethods=*,\
AllowOrigins=*,\
MaxAge=86400,\
ExposeHeaders=content-type,content-length,date,x-amzn-requestid \
    --invoke-mode RESPONSE_STREAM
```

This configuration:
- ✅ Allows all origins (`AllowOrigins=*`)
- ✅ Allows all methods (`AllowMethods=*`)
- ✅ Allows required headers (authorization, content-type, etc.)
- ✅ Sets credentials support (`AllowCredentials=true`)
- ✅ Caches preflight for 24 hours (`MaxAge=86400`)

## Verification

### Test the Fix

1. **Open Browser DevTools** (F12)
2. **Navigate to your app**: https://syntithenai.github.io/lambdallmproxy/
3. **Login with Google**
4. **Check Network Tab** for `/usage` request
5. **Verify Response Headers**:
   ```
   access-control-allow-origin: *
   access-control-allow-methods: *
   access-control-allow-headers: content-type,authorization,...
   content-type: application/json
   ```
6. **Verify NO duplicate headers**
7. **Verify usage data displays** in UI

### Expected Behavior

**Before Fix**:
- ❌ CORS error in console
- ❌ Usage data not displayed
- ❌ Duplicate `Access-Control-Allow-Origin` headers

**After Fix**:
- ✅ No CORS errors
- ✅ Usage data displays correctly
- ✅ Single `Access-Control-Allow-Origin: *` header (from AWS)

## Impact on Other Endpoints

### Chat Endpoint (`/chat`)
- **Status**: ✅ No CORS headers in code
- **Reason**: Uses streaming response with SSE writer, AWS handles CORS
- **Action**: No changes needed

### Search Endpoint (`/search`)  
- **Status**: ✅ No CORS headers in code
- **Reason**: Uses streaming response, AWS handles CORS
- **Action**: No changes needed

### Proxy Endpoint (`/proxy`)
- **Status**: ⚠️ Not checked (may need review)
- **Action**: Should verify if it has CORS headers and remove if present

## Deployment

```bash
# Deploy backend fix
make deploy-lambda-fast
```

**Deployed**: 2025-10-12 03:07:20 UTC

## Best Practices

### When to Use AWS Lambda Function URL CORS:
- ✅ Simple CORS requirements (allow all or specific origins)
- ✅ Consistent CORS across all endpoints
- ✅ Streaming responses
- ✅ Don't want to write CORS logic in code

### When to Use Code-Level CORS:
- ⚠️ Complex CORS logic (different origins per endpoint)
- ⚠️ Dynamic origin validation
- ⚠️ Using API Gateway without CORS configuration
- ⚠️ Need per-request CORS decisions

### Rule of Thumb:
**Pick ONE approach and stick with it!** 
- Either AWS handles CORS (recommended)
- OR Lambda function handles CORS (more control, more code)
- **Never both** (causes conflicts)

## Related Documentation

- AWS Lambda Function URL CORS: https://docs.aws.amazon.com/lambda/latest/dg/urls-configuration.html#urls-cors
- CORS Specification: https://developer.mozilla.org/en-US/docs/Web/HTTP/CORS
- Lambda Response Format: https://docs.aws.amazon.com/lambda/latest/dg/urls-invocation.html#urls-payloads

## Files Modified

- `src/endpoints/usage.js` - Removed CORS headers (lines 31, 57, 90, 103)

## Future Improvements

1. **Audit Other Endpoints**: Check proxy endpoint for CORS headers
2. **Add CORS Tests**: Verify CORS works in integration tests
3. **Document CORS Strategy**: Add to architecture docs
4. **CI/CD Check**: Lint rule to prevent CORS headers when AWS CORS is enabled
