# Lambda Endpoint Configuration Guide

## Overview

The UI is built to connect to your Lambda function endpoints. The base URL is configured via an environment variable that gets built into the application.

## Environment Variable

**Variable Name**: `VITE_API_BASE`

**Location**: `ui-new/.env`

## Configuration Options

### Option 1: Same-Origin (Default)
If your UI is served from the same domain as your Lambda:

```bash
# ui-new/.env
VITE_API_BASE=
```

This makes requests to:
- `/proxy` (chat endpoint)
- `/planning` (research planning endpoint)
- `/search` (search endpoint)

**Use Case**: Lambda serves both UI and API

---

### Option 2: API Gateway
If using AWS API Gateway:

```bash
# ui-new/.env
VITE_API_BASE=https://abc123.execute-api.us-east-1.amazonaws.com/prod
```

This makes requests to:
- `https://abc123.execute-api.us-east-1.amazonaws.com/prod/proxy`
- `https://abc123.execute-api.us-east-1.amazonaws.com/prod/planning`
- `https://abc123.execute-api.us-east-1.amazonaws.com/prod/search`

**Use Case**: Separate UI hosting (GitHub Pages, S3, etc.) + Lambda backend

---

### Option 3: Lambda Function URL
If using Lambda Function URLs:

```bash
# ui-new/.env
VITE_API_BASE=https://abc123.lambda-url.us-east-1.on.aws
```

**Use Case**: Direct Lambda invocation without API Gateway

---

### Option 4: Custom Domain
If you have a custom domain pointing to your Lambda:

```bash
# ui-new/.env
VITE_API_BASE=https://api.yourdomain.com
```

**Use Case**: Professional deployment with custom domain

---

## Setup Steps

### Step 1: Configure Environment
```bash
cd ui-new
cp .env.example .env
nano .env  # Edit VITE_API_BASE
```

### Step 2: Build Application
```bash
npm run build
```

The `VITE_API_BASE` value is **compiled into the JavaScript bundle** at build time.

### Step 3: Deploy
```bash
# Output is in docs/
ls -lh ../docs/
```

## How It Works

### API Client Code
File: `src/utils/api.ts`

```typescript
const API_BASE = import.meta.env.VITE_API_BASE || '';

// Chat endpoint
fetch(`${API_BASE}/proxy`, { ... })

// Planning endpoint  
fetch(`${API_BASE}/planning`, { ... })

// Search endpoint
fetch(`${API_BASE}/search`, { ... })
```

### Build-Time Replacement
Vite replaces `import.meta.env.VITE_API_BASE` with the actual value during build:

```javascript
// Before build (source)
const API_BASE = import.meta.env.VITE_API_BASE || '';

// After build (if VITE_API_BASE=https://api.example.com)
const API_BASE = "https://api.example.com" || '';

// After build (if VITE_API_BASE empty)
const API_BASE = "" || '';  // Results in empty string
```

## Deployment Scenarios

### Scenario 1: GitHub Pages + Lambda
```bash
# ui-new/.env
VITE_API_BASE=https://your-lambda-url.amazonaws.com

# Build
npm run build

# Deploy docs/ to GitHub Pages
```

**CORS Required**: Lambda must allow requests from your GitHub Pages domain.

### Scenario 2: Lambda Serves Everything
```bash
# ui-new/.env
VITE_API_BASE=

# Build
npm run build

# Lambda serves docs/ as static files
# API endpoints at same origin
```

**No CORS Issues**: Same-origin requests.

### Scenario 3: S3 + CloudFront + Lambda
```bash
# ui-new/.env
VITE_API_BASE=https://api.yourdomain.com

# Build and upload to S3
npm run build
aws s3 sync ../docs/ s3://your-bucket/
```

**CloudFront**: Serve UI from CloudFront, API from Lambda.

## Testing

### Test Locally
```bash
# Start dev server (uses .env)
npm run dev

# In browser console
fetch('/proxy', {
  method: 'POST',
  headers: {
    'Authorization': 'Bearer YOUR_TOKEN',
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    model: 'gpt-4',
    messages: [{ role: 'user', content: 'test' }]
  })
})
```

### Test Production Build
```bash
# Build with specific endpoint
echo "VITE_API_BASE=https://test-api.example.com" > .env
npm run build

# Serve and test
cd ../docs
python3 -m http.server 8082

# Open http://localhost:8082
# Check browser console for API calls
```

## Debugging

### Check Built Value
```bash
# After build, check the compiled JavaScript
grep -r "execute-api" ../docs/assets/*.js

# Or check for your domain
grep -r "yourdomain.com" ../docs/assets/*.js
```

### Browser DevTools
1. Open Network tab
2. Make a request (chat, planning, or search)
3. Check the request URL
4. Verify it's going to the correct endpoint

### Console Logging
All API responses are logged:
```javascript
console.log('Chat response:', data);
console.log('Planning response:', data);
console.log('Search results:', searchResults);
```

## Common Issues

### Issue: Requests going to wrong URL
**Solution**: 
```bash
# Rebuild after changing .env
rm -rf node_modules/.vite
npm run build
```

### Issue: CORS errors
**Solution**: Configure Lambda to allow your UI domain:
```javascript
// Lambda response headers
'Access-Control-Allow-Origin': 'https://your-ui-domain.com'
'Access-Control-Allow-Headers': 'content-type, authorization'
'Access-Control-Allow-Methods': 'POST, OPTIONS'
```

### Issue: 404 Not Found
**Solution**: Verify Lambda routes:
- `/proxy` → Chat endpoint
- `/planning` → Planning endpoint
- `/search` → Search endpoint

### Issue: Dev server not updating
**Solution**: Restart dev server after changing .env:
```bash
# Stop dev server (Ctrl+C)
npm run dev
```

## Environment Variable Reference

| Variable | Purpose | Default | Required |
|----------|---------|---------|----------|
| `VITE_API_BASE` | Lambda endpoint base URL | `''` (empty) | No |

**Notes**:
- Prefix `VITE_` is required for Vite to expose the variable
- Must be set before build (not runtime)
- Empty string means same-origin requests
- No trailing slash

## Example Configurations

### Development (Local Lambda)
```bash
VITE_API_BASE=http://localhost:3000
```

### Staging
```bash
VITE_API_BASE=https://staging-api.yourdomain.com
```

### Production
```bash
VITE_API_BASE=https://api.yourdomain.com
```

### Same-Origin
```bash
VITE_API_BASE=
```

## Security Notes

1. **API Keys**: Never put API keys in .env (client-side visible)
2. **Authentication**: Use JWT tokens (already implemented)
3. **CORS**: Configure Lambda CORS headers properly
4. **HTTPS**: Always use HTTPS in production

## Need Help?

Check:
1. Browser console for API errors
2. Network tab for request URLs
3. Lambda CloudWatch logs
4. CORS configuration on Lambda

---

**Summary**: Set `VITE_API_BASE` in `ui-new/.env`, rebuild, and deploy!
