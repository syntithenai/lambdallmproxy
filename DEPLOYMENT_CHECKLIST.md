# Deployment Checklist - Authentication Update

## Pre-Deployment Verification

### ✅ Code Changes Complete
- [x] Planning endpoint requires JWT authentication
- [x] Search endpoint requires JWT authentication  
- [x] Proxy endpoint requires JWT authentication (changed from optional to required)
- [x] Static file server remains public
- [x] All 71 endpoint tests passing

### ✅ Documentation Updated
- [x] API.md updated with authentication requirements for all endpoints
- [x] README.md updated with prominent authentication section
- [x] AUTHENTICATION_UPDATE_SUMMARY.md created
- [x] All curl examples include Authorization headers

### ✅ Test Coverage
```
Planning Endpoint:  13/13 tests ✅
Search Endpoint:    22/22 tests ✅
Proxy Endpoint:     18/18 tests ✅
Static Endpoint:    18/18 tests ✅
────────────────────────────────
Total:              71/71 tests ✅
```

## Environment Variables Check

### Required for Authentication
```bash
# Verify these are set in your .env file:
GOOGLE_CLIENT_ID=your-google-client-id
ALLOWED_EMAILS=user1@example.com,user2@example.com
```

### Optional API Keys (for authenticated users)
```bash
# If set, these will be used for authenticated users:
OPENAI_API_KEY=sk-...
GROQ_API_KEY=gsk_...
```

### Verify Current Settings
```bash
# Check if variables are in .env
grep -E "GOOGLE_CLIENT_ID|ALLOWED_EMAILS" .env

# Verify build replaced placeholders
grep "GOOGLE_CLIENT_ID" docs/index.html
```

## Deployment Steps

### 1. Build Documentation
```bash
# This compiles UI changes and replaces environment variables
make build-docs
# OR
./scripts/build-docs.sh
```

**Expected Output**: ✅ Documentation built successfully

### 2. Deploy Lambda Function
```bash
# Deploy backend code to AWS Lambda
make deploy
# OR
./scripts/deploy.sh
```

**Expected Output**: 
- ✅ Deployment package created
- ✅ Lambda function updated
- ✅ Environment variables set
- ✅ CORS configured
- ✅ Function URL available

### 3. Verify Lambda Environment Variables

After deployment, verify environment variables are set in AWS Lambda:

```bash
# Check Lambda configuration
aws lambda get-function-configuration \
  --function-name your-function-name \
  --query 'Environment.Variables' \
  --output json
```

**Must Include**:
- `GOOGLE_CLIENT_ID`
- `ALLOWED_EMAILS`
- `OPENAI_API_KEY` (optional)
- `GROQ_API_KEY` (optional)

### 4. Deploy Documentation (Optional)

If you want to deploy the updated docs to GitHub Pages:

```bash
make deploy-docs
# OR
./scripts/deploy-docs.sh
```

### 5. Test Deployment

#### Test 1: Verify Static Files Work (No Auth)
```bash
curl https://your-lambda-url.amazonaws.com/
# Expected: 200 OK, HTML content returned
```

#### Test 2: Verify API Endpoints Require Auth
```bash
# Without auth - should fail with 401
curl -X POST https://your-lambda-url.amazonaws.com/search \
  -H "Content-Type: application/json" \
  -d '{"query": "test"}'

# Expected Response:
# {
#   "error": "Authentication required. Please provide a valid JWT token in the Authorization header.",
#   "code": "UNAUTHORIZED"
# }
```

#### Test 3: Verify Authenticated Request Works
```bash
# With valid JWT token
curl -X POST https://your-lambda-url.amazonaws.com/search \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_VALID_JWT_TOKEN" \
  -d '{"query": "test"}'

# Expected: 200 OK with search results
```

### 6. Test Through Web UI

1. Open `https://your-lambda-url.amazonaws.com/` in browser
2. Click "Sign in with Google"
3. Authenticate with an email in `ALLOWED_EMAILS`
4. Submit a test query
5. Verify response is received successfully

## Post-Deployment Verification

### Frontend Checks
- [ ] Web UI loads without errors
- [ ] Google Sign In button appears
- [ ] Login flow works correctly
- [ ] Profile picture displays after login
- [ ] Form becomes enabled after authentication
- [ ] Requests include Authorization header
- [ ] Responses display correctly

### Backend Checks
- [ ] Planning endpoint returns 401 without auth
- [ ] Search endpoint returns 401 without auth
- [ ] Proxy endpoint returns 401 without auth
- [ ] Static files serve without auth
- [ ] Authenticated requests work for all endpoints
- [ ] Error messages are consistent (401 with proper message)

### Security Checks
- [ ] Only emails in `ALLOWED_EMAILS` can access API
- [ ] JWT tokens are properly verified
- [ ] Expired tokens are rejected
- [ ] Invalid tokens are rejected
- [ ] Token verification uses correct `GOOGLE_CLIENT_ID`

## Breaking Changes Alert

### ⚠️ Proxy Endpoint Breaking Change

**Before**: Proxy endpoint accepted requests with just an `apiKey` in the request body (no authentication required)

**After**: Proxy endpoint now **requires** authentication:
1. Must include valid JWT token in Authorization header
2. Must be in allowed emails list
3. Can optionally provide API key in request body, or use env vars

**Migration**: Any scripts or applications calling the proxy endpoint must:
1. Obtain a Google JWT token
2. Include it in the `Authorization: Bearer <token>` header
3. Ensure the email in the token is in `ALLOWED_EMAILS`

## Rollback Plan

If issues are encountered:

### 1. Quick Rollback (Code Only)
```bash
# Checkout previous commit
git log --oneline  # Find commit before auth changes
git checkout <previous-commit-hash>

# Redeploy
make deploy
```

### 2. Environment Variable Rollback
```bash
# Remove authentication requirements by unsetting variables
aws lambda update-function-configuration \
  --function-name your-function-name \
  --environment Variables={OPENAI_API_KEY=...,GROQ_API_KEY=...}
  # (exclude GOOGLE_CLIENT_ID and ALLOWED_EMAILS)
```

### 3. Full Rollback
```bash
# Revert all changes
git revert HEAD~<number-of-commits>
make deploy
```

## Common Issues & Solutions

### Issue: 401 on All Requests
**Cause**: `ALLOWED_EMAILS` not set or email not in list  
**Solution**: 
```bash
# Add to .env
ALLOWED_EMAILS=your.email@example.com

# Redeploy
make deploy
```

### Issue: "Invalid token" errors
**Cause**: `GOOGLE_CLIENT_ID` mismatch or not set  
**Solution**: 
```bash
# Verify GOOGLE_CLIENT_ID matches the one used for token generation
grep GOOGLE_CLIENT_ID .env
make deploy
```

### Issue: Static files return 401
**Cause**: Router incorrectly routing static files  
**Solution**: This shouldn't happen - static endpoint has no auth. Check `src/index.js` routing logic.

### Issue: Proxy endpoint always fails with 401
**Cause**: Missing environment API keys and no apiKey in request  
**Solution**: 
```bash
# Set environment API keys
OPENAI_API_KEY=sk-...
GROQ_API_KEY=gsk_...

# Redeploy
make deploy
```

## Success Criteria

Deployment is successful when:

✅ All 71 endpoint tests pass locally  
✅ Lambda function deployed successfully  
✅ Environment variables set correctly  
✅ Web UI loads and Google Sign In works  
✅ Unauthenticated requests to API endpoints return 401  
✅ Authenticated requests to API endpoints return expected results  
✅ Static files serve without authentication  
✅ No errors in CloudWatch logs for normal operations  

## Monitoring

After deployment, monitor:

1. **CloudWatch Logs**: Check for authentication errors
   ```bash
   aws logs tail /aws/lambda/your-function-name --follow
   ```

2. **Error Rate**: Watch for 401 spikes
3. **Response Times**: Ensure auth doesn't significantly impact latency
4. **User Feedback**: Monitor for access issues

## Support

If issues persist:
- Check CloudWatch logs: AWS Console → Lambda → Monitor → Logs
- Review test output: `npm test tests/unit/endpoints/`
- Verify environment variables in Lambda console
- Test with curl commands above

---

**Deployment Date**: October 4, 2025  
**Changes**: Mandatory JWT authentication for all API endpoints  
**Breaking Changes**: Proxy endpoint now requires authentication  
**Tests**: 71/71 passing  
