# Troubleshooting Empty Response Issue

## Quick Diagnostic Steps

### 1. Open Browser Developer Tools
Press **F12** (or Cmd+Option+I on Mac) to open developer tools.

### 2. Check Console Tab
Look for any error messages in the Console tab. Common errors:
- `Failed to fetch`
- `TypeError`
- `CORS error`
- `401 Unauthorized`
- `Network request failed`

### 3. Check Network Tab
1. Open the **Network** tab
2. Try your query again
3. Look for the request to `/planning` or `/chat`
4. Click on the request to see:
   - **Request Headers**: Check if `Authorization` header is present
   - **Request Payload**: Verify the query is being sent
   - **Response**: Check the actual response data
   - **Status Code**: Look for 200, 401, 500, etc.

### 4. Common Issues and Solutions

#### Issue: 401 Unauthorized
**Symptom**: Console shows authentication error
**Solution**: Sign out and sign in again (Google authentication may have expired)

#### Issue: Empty Response with 200 OK
**Symptom**: Network shows 200 status but response is empty
**Possible Causes**:
1. SSE stream not being read correctly
2. Frontend not handling events properly
3. Response being truncated

**Debug Steps**:
```javascript
// Check in Console tab if events are being received:
// Look for: "Planning SSE event:" or "Chat SSE event:"
```

#### Issue: Network Request Fails
**Symptom**: Request shows as "failed" or red in Network tab
**Possible Causes**:
1. Lambda function not deployed
2. CORS issues
3. Network connectivity

#### Issue: Request Never Sent
**Symptom**: No network request appears in Network tab
**Possible Causes**:
1. Button disabled (check if loading state is stuck)
2. Form validation preventing submission
3. JavaScript error blocking execution

### 5. Backend Deployment Check
```bash
# Verify Lambda function was deployed
cd /home/stever/projects/lambdallmproxy
./scripts/status.sh
```

### 6. Test Backend Directly
```bash
# Test the planning endpoint directly
./scripts/test-lambda.sh planning "What is quantum computing?"
```

### 7. Check Frontend Build
```bash
# Verify the latest frontend build is deployed
cd ui-new
npm run build
# Check if docs/ directory was updated
ls -lh ../docs/assets/index-*.js
```

---

## Specific Issues to Check Based on Recent Changes

### Did the Planning Tab Configuration Break Something?

The recent changes added:
- Temperature slider
- Max tokens slider  
- System prompt editor

**Potential Issues**:
1. **State not initialized**: Check if `temperature`, `maxTokens`, or `systemPrompt` are undefined
2. **Type mismatch**: Check if localStorage values are being parsed correctly
3. **Request body malformed**: New parameters might be causing issues

**Debug in Console**:
```javascript
// Check localStorage values
localStorage.getItem('planning_temperature')
localStorage.getItem('planning_max_tokens')
localStorage.getItem('chat_system_prompt')
```

### Is the Issue Only in Planning Tab or Also Chat Tab?

**Test both tabs**:
1. Try a query in the **Chat** tab
2. Try a query in the **Planning** tab
3. If only Planning fails, the issue is specific to our recent changes

---

## Manual Testing Script

Open browser console and run:

```javascript
// Test 1: Check authentication
console.log('Auth token:', localStorage.getItem('google_access_token') ? 'Present' : 'Missing');

// Test 2: Check configuration
console.log('Temperature:', localStorage.getItem('planning_temperature'));
console.log('Max tokens:', localStorage.getItem('planning_max_tokens'));
console.log('System prompt:', localStorage.getItem('chat_system_prompt'));

// Test 3: Check API endpoint
fetch('https://your-lambda-url.lambda-url.region.on.aws/planning', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${localStorage.getItem('google_access_token')}`
  },
  body: JSON.stringify({
    query: 'Test query'
  })
}).then(response => {
  console.log('Status:', response.status);
  return response.text();
}).then(text => {
  console.log('Response:', text);
}).catch(error => {
  console.error('Error:', error);
});
```

---

## What to Tell Me

To help diagnose, please provide:

1. **Which tab?** Chat or Planning?
2. **Console errors?** Copy any red error messages
3. **Network status?** What status code (200, 401, 500, etc.)?
4. **Request sent?** Did you see a request in Network tab?
5. **Loading indicator?** Did it show "Generating..." or similar?
6. **Authentication?** Are you signed in with Google?

---

## Quick Fixes to Try

### Fix 1: Clear localStorage and Refresh
```javascript
// In browser console:
localStorage.clear();
location.reload();
```
Then sign in again and try your query.

### Fix 2: Check Default Values
The new sliders have defaults, but if they're `null` or `undefined`, it could cause issues.

### Fix 3: Rebuild and Redeploy
```bash
cd /home/stever/projects/lambdallmproxy/ui-new
npm run build
cd ..
./scripts/deploy-docs.sh
```

---

## Most Likely Issues (Based on Recent Changes)

1. **localStorage corruption**: Temperature/maxTokens set to invalid values
2. **Build not deployed**: Still running old code without new features  
3. **Backend not deployed**: Lambda function needs updating
4. **Authentication expired**: Need to sign out/in again

**Quick Test**: Try clearing localStorage and signing in fresh.
