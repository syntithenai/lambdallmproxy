# CORS Testing Guide

## Current CORS Configuration

### Lambda Function URL CORS Settings
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

### Application Response Headers
All endpoints (`/planning`, `/search`) return:
```
Access-Control-Allow-Origin: *
Access-Control-Allow-Headers: content-type,authorization,origin,accept,cache-control,x-requested-with,accept-encoding,accept-language,connection,host,referer,user-agent
Access-Control-Allow-Methods: *
Access-Control-Expose-Headers: content-type,content-length,date,x-amzn-requestid
Access-Control-Max-Age: 86400
```

## Testing Commands

### Test OPTIONS Preflight
```bash
curl -v -X OPTIONS "https://nrw7pperjjdswbmqgmigbwsbyi0rwdqf.lambda-url.us-east-1.on.aws/search" \
  -H "Origin: https://lambdallmproxy.pages.dev" \
  -H "Access-Control-Request-Method: POST" \
  -H "Access-Control-Request-Headers: content-type,authorization,accept"
```

Expected response headers:
```
Access-Control-Allow-Origin: https://lambdallmproxy.pages.dev
Access-Control-Allow-Headers: content-type,authorization,origin,accept,cache-control,x-requested-with,accept-encoding,accept-language,connection,host,referer,user-agent
Access-Control-Allow-Methods: POST (or *)
Access-Control-Max-Age: 86400
```

### Test Actual POST Request
```bash
curl -v -X POST "https://nrw7pperjjdswbmqgmigbwsbyi0rwdqf.lambda-url.us-east-1.on.aws/search" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Accept: text/event-stream" \
  -H "Origin: https://lambdallmproxy.pages.dev" \
  -d '{"queries":["test"],"maxResults":5,"includeContent":true}'
```

## Common CORS Issues

### 1. Preflight Fails
**Symptom:** Browser shows "CORS preflight channel did not succeed"

**Causes:**
- OPTIONS method not allowed
- Requested headers not in AllowHeaders list
- Requested method not in AllowMethods list

**Check:**
```bash
# See what the browser is requesting
# In Chrome DevTools Network tab, look for the OPTIONS request
# Check "Access-Control-Request-Headers" and "Access-Control-Request-Method"
```

### 2. POST Request CORS Error
**Symptom:** "No 'Access-Control-Allow-Origin' header is present"

**Causes:**
- Endpoint not returning CORS headers
- Origin not in AllowOrigins list
- Credentials mode mismatch

**Solution:**
- Verify endpoint returns `Access-Control-Allow-Origin` header
- Check browser Network tab for actual response headers

### 3. Credentials Issues
**Symptom:** "Credentials flag is 'true', but the 'Access-Control-Allow-Credentials' header is ''"

**Fix:**
- Ensure AllowCredentials is true in Function URL config
- Don't use `Access-Control-Allow-Origin: *` with credentials (use specific origin)

### 4. Exposed Headers
**Symptom:** JavaScript can't read certain response headers

**Fix:**
- Add headers to ExposeHeaders list
- Current list: content-type, content-length, date, x-amzn-requestid

## Browser Testing

### Open Browser DevTools
1. Open https://lambdallmproxy.pages.dev
2. Open DevTools (F12)
3. Go to Network tab
4. Filter by "search" or "planning"
5. Try making a search request
6. Look for:
   - OPTIONS request (preflight)
   - POST request (actual request)
   - Check response headers for both
   - Look for any red text indicating errors

### Check Console
Look for errors like:
```
Access to fetch at 'https://...' from origin 'https://lambdallmproxy.pages.dev' 
has been blocked by CORS policy: Response to preflight request doesn't pass 
access control check: No 'Access-Control-Allow-Origin' header is present on 
the requested resource.
```

The error message will tell you exactly what's wrong.

## Notes

### AWS Lambda Function URL CORS Behavior
- When `AllowMethods: ["*"]` is configured, the OPTIONS response returns the **specific method** from the `Access-Control-Request-Method` header, not `*`
- This is **correct behavior** according to CORS spec
- The `*` means "allow all methods", but the response confirms the specific method requested

### Header Case Sensitivity
- Header names are case-insensitive in HTTP
- Our config uses lowercase consistently
- Browsers normalize header names

### MaxAge
- 86400 seconds = 24 hours
- Browser caches the preflight response for this duration
- Reduces preflight requests for better performance

## Troubleshooting Steps

1. **Clear browser cache** - Old preflight responses may be cached
2. **Check Network tab** - See actual requests and responses
3. **Test with curl** - Verify server-side CORS is working
4. **Check Console** - See exact CORS error message
5. **Verify token** - Authentication errors can look like CORS errors
6. **Check origin** - Make sure you're accessing from correct domain
