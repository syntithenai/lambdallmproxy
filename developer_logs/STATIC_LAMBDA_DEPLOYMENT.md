# Static Lambda Deployment

## Overview

This document explains the new static Lambda function architecture and how to deploy it.

## Architecture

We now have **two Lambda functions**:

### 1. `llmproxy-static` (NEW)
- **Purpose**: Serves static files and buffered proxy requests
- **Endpoints**:
  - `GET /*` → Static files from `docs/`
  - `POST /proxy` → Buffered (non-streaming) proxy to OpenAI-compatible APIs
- **Response Type**: Standard buffered Lambda responses
- **No streaming infrastructure required**

### 2. `llmproxy` (EXISTING)
- **Purpose**: Streaming SSE endpoints
- **Endpoints**:
  - `POST /planning` → Planning with streaming
  - `POST /search` → Search with streaming
  - `POST /chat` → (FUTURE) OpenAI-compatible streaming with tools
- **Response Type**: SSE via `awslambda.streamifyResponse()`

## Files Created

```
src/
  static-index.js          # Entry point for static Lambda
scripts/
  deploy-static.sh         # Deployment script for static Lambda
tests/
  test-static-lambda.js    # Local test suite
```

## Testing Locally

Before deploying to AWS, test the handler locally:

```bash
node tests/test-static-lambda.js
```

**Expected Output:**
- ✅ CORS handling works
- ✅ Static file serving returns HTML
- ✅ Proxy endpoint handles auth (returns 401 without valid token)
- ✅ Invalid methods return 405

## Deployment Steps

### Prerequisites

1. **AWS CLI configured** with valid credentials
2. **`.env` file** exists with required variables:
   ```bash
   ACCESS_SECRET=your-secret
   OPENAI_API_KEY=your-openai-key
   GROQ_API_KEY=your-groq-key
   GOOGLE_CLIENT_ID=your-google-client-id
   ALLOWED_EMAILS=user1@example.com,user2@example.com
   OPENAI_API_URL=https://api.openai.com/v1/chat/completions
   ```

3. **Main `llmproxy` function exists** (used to get IAM role)

### Deploy Static Lambda

```bash
./scripts/deploy-static.sh
```

**What it does:**
1. Creates temporary build directory
2. Copies `src/static-index.js` → `index.js`
3. Copies dependencies: `auth.js`, `endpoints/proxy.js`, `endpoints/static.js`
4. Copies `docs/` directory for static file serving
5. Installs `google-auth-library` npm package
6. Creates deployment ZIP
7. Creates or updates Lambda function
8. Creates Function URL with CORS configuration
9. Sets environment variables from `.env`

### Verify Deployment

After deployment, the script will output:

```
✅ Static Lambda Function URL: https://xxxxx.lambda-url.us-east-1.on.aws/
```

Test the endpoints:

```bash
# Test static file serving
curl https://xxxxx.lambda-url.us-east-1.on.aws/

# Test proxy endpoint (should return 401 without auth)
curl -X POST https://xxxxx.lambda-url.us-east-1.on.aws/proxy \
  -H "Content-Type: application/json" \
  -d '{"model":"gpt-4","messages":[{"role":"user","content":"Hello"}]}'
```

## Configuration

### Environment Variables

The static Lambda requires these environment variables:

- `ACCESS_SECRET` - Secret for authentication
- `OPENAI_API_KEY` - OpenAI API key
- `GROQ_API_KEY` - Groq API key
- `GOOGLE_CLIENT_ID` - Google OAuth client ID
- `ALLOWED_EMAILS` - Comma-separated list of allowed emails
- `OPENAI_API_URL` - Default OpenAI API URL

### Lambda Configuration

- **Runtime**: Node.js 20.x
- **Timeout**: 30 seconds
- **Memory**: 512 MB
- **Handler**: `index.handler`

### CORS Configuration

Function URL is configured with:
- **AllowOrigins**: `["*"]`
- **AllowMethods**: `["GET", "POST", "OPTIONS"]`
- **AllowHeaders**: `["Content-Type", "Authorization"]`
- **MaxAge**: 86400 seconds

## Troubleshooting

### Function creation fails

**Error**: `Could not find IAM role from main llmproxy function`

**Solution**: Ensure the main `llmproxy` function exists first:
```bash
./scripts/deploy.sh
```

### Environment variables not set

**Error**: Variables are empty or missing

**Solution**: Check `.env` file exists and has correct format:
```bash
cat .env | grep -E "^(OPENAI_API_KEY|GROQ_API_KEY|GOOGLE_CLIENT_ID)="
```

### Static files not found

**Error**: 404 when accessing `/`

**Solution**: Ensure `docs/` directory exists and contains `index.html`:
```bash
ls -la docs/index.html
```

If missing, build the docs:
```bash
./scripts/build-docs.sh
```

### Function URL not created

**Error**: No Function URL in output

**Solution**: Manually create Function URL:
```bash
aws lambda create-function-url-config \
  --function-name llmproxy-static \
  --region us-east-1 \
  --auth-type NONE \
  --cors '{
    "AllowOrigins": ["*"],
    "AllowMethods": ["GET", "POST", "OPTIONS"],
    "AllowHeaders": ["Content-Type", "Authorization"],
    "MaxAge": 86400
  }'
```

## Next Steps

After deploying the static Lambda:

1. ✅ **Update DNS/Routing**: Point your domain to the new static Lambda Function URL
2. ✅ **Test Production**: Verify static files and proxy work in production
3. 🔄 **Create Chat Endpoint**: Next phase - streaming chat with tool execution
4. 🔄 **Update UI**: Update frontend to use new chat endpoint

## Rollback

If issues occur, the original `llmproxy` function still has all endpoints:

```bash
# Revert DNS to original Function URL
# Original function still serves everything
```

To delete the static Lambda:

```bash
aws lambda delete-function --function-name llmproxy-static --region us-east-1
```

## Cost Implications

Adding a second Lambda function will:
- **Increase costs slightly** due to two Function URLs
- **Decrease latency** for static file serving (no streaming overhead)
- **Improve scalability** by separating concerns

Expected cost increase: **< $1/month** for typical usage

## Monitoring

Monitor both functions in CloudWatch:

```bash
# View logs for static Lambda
aws logs tail /aws/lambda/llmproxy-static --follow

# View logs for streaming Lambda
aws logs tail /aws/lambda/llmproxy --follow
```

## Support

If you encounter issues:

1. Check CloudWatch logs for error details
2. Run local tests: `node tests/test-static-lambda.js`
3. Verify environment variables are set correctly
4. Ensure IAM role has necessary permissions

---

**Status**: Ready for deployment  
**Created**: October 5, 2025  
**Version**: 1.0
