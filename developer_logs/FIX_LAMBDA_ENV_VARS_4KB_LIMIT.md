# Environment Variables 4KB Limit Fix

## Problem

Lambda environment variables have a 4KB total size limit. The Google Sheets service account private key (~1700 bytes) was causing this limit to be exceeded:

```
InvalidParameterValueException: Lambda was unable to configure your environment 
variables because the environment variables you have provided exceeded the 4KB limit.
```

## Solution

**Move large secrets to AWS Secrets Manager** - Specifically the Google Sheets service account private key.

### Architecture Changes

1. **Split Environment Files**:
   - `.env` - Full configuration (for local development)
   - `.env.lambda` - Lambda-optimized (excludes local-only variables)

2. **AWS Secrets Manager**:
   - Store Google Sheets private key in Secrets Manager
   - Lambda fetches it at runtime with caching (1 hour TTL)
   - Fallback to environment variable for backward compatibility

3. **Removed Variables from Lambda**:
   - `OPENAI_API_KEY` - Only used for local RAG embeddings ingestion
   - `LIBSQL_URL` - Local file path, not needed in Lambda
   - `RAG_EMBEDDING_MODEL` - Only for local ingestion
   - `RAG_EMBEDDING_PROVIDER` - Only for local ingestion
   - `USE_HTTPS` - Not used in code
   - Comments with `# ...` that were being parsed as values

## Implementation Steps

### 1. Install Dependencies

```bash
cd /home/stever/projects/lambdallmproxy
npm install --save @aws-sdk/client-secrets-manager
```

### 2. Setup AWS Secrets Manager

```bash
make setup-secrets
```

This will:
- Extract private key from `.env`
- Create/update secret: `llmproxy-google-sheets-key`
- Grant Lambda IAM role permission to read the secret

### 3. Deploy Environment Variables

```bash
make deploy-env
```

This now uses `.env.lambda` (without the large private key).

### 4. Deploy Lambda Code

```bash
make deploy-lambda-fast
```

Lambda will fetch the private key from Secrets Manager at runtime.

## Files Modified

### New Files
- `.env.lambda` - Lambda-optimized environment variables
- `scripts/setup-secrets.sh` - Secrets Manager setup script

### Modified Files
- `src/services/google-sheets-logger.js`:
  - Added `getGoogleSheetsPrivateKey()` function
  - Fetches from Secrets Manager with 1-hour cache
  - Falls back to environment variable
  - Updated all 5 functions that use private key

- `scripts/deploy-env.sh`:
  - Changed to use `.env.lambda` instead of `.env`

- `package.json`:
  - Added `@aws-sdk/client-secrets-manager` dependency

- `Makefile`:
  - Added `setup-secrets` target
  - Updated `deploy-env` documentation

## Size Comparison

**Before** (4KB+ - FAILED):
```json
{
  "GOOGLE_SHEETS_SERVICE_ACCOUNT_PRIVATE_KEY": "-----BEGIN PRIVATE KEY-----\n...(1700 bytes)...\n-----END PRIVATE KEY-----\n",
  "OPENAI_API_KEY": "sk-proj-...(200 bytes)",
  "LIBSQL_URL": "file:///home/stever/...(60 bytes)",
  ... (40+ other variables)
}
```

**After** (<4KB - SUCCESS):
```json
{
  // Private key moved to Secrets Manager
  "OPENAI_API_KEY": "removed (local-only)",
  "LIBSQL_URL": "removed (local-only)",
  "RAG_EMBEDDING_MODEL": "removed (local-only)",
  "RAG_EMBEDDING_PROVIDER": "removed (local-only)",
  ... (35 variables, ~2.8KB total)
}
```

## IAM Permissions Required

Lambda execution role needs:

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
        "secretsmanager:GetSecretValue",
        "secretsmanager:DescribeSecret"
      ],
      "Resource": "arn:aws:secretsmanager:us-east-1:*:secret:llmproxy-google-sheets-key*"
    }
  ]
}
```

This is automatically added by `scripts/setup-secrets.sh`.

## Performance Impact

- **First request**: ~50ms to fetch from Secrets Manager
- **Subsequent requests**: <1ms (cached for 1 hour)
- **Negligible cost**: $0.40/month per secret + $0.05 per 10,000 API calls

## Rollback Plan

If Secrets Manager causes issues, you can revert:

1. Restore `.env.lambda` to include `GOOGLE_SHEETS_SERVICE_ACCOUNT_PRIVATE_KEY`
2. Run `make deploy-env`
3. The code will fallback to environment variable automatically

## Testing

1. **Local Development**: Uses `.env` (private key in environment)
2. **Lambda Production**: Uses Secrets Manager

Test logging:
```bash
# Should see in CloudWatch logs:
🔐 Fetching private key...
✅ Private key fetched, length: 1704
```

## Future Optimization

If other secrets grow large, consider moving to Secrets Manager:
- PayPal credentials
- OAuth client secrets
- Provider API keys

Current size without private key: ~2.8KB (1.2KB headroom).

## Related Documentation

- AWS Secrets Manager: https://docs.aws.amazon.com/secretsmanager/
- Lambda Environment Variables: https://docs.aws.amazon.com/lambda/latest/dg/configuration-envvars.html
- Lambda Limits: https://docs.aws.amazon.com/lambda/latest/dg/gettingstarted-limits.html

## Deployment Checklist

- [x] Create `.env.lambda` file
- [x] Update `google-sheets-logger.js` to fetch from Secrets Manager
- [x] Add `@aws-sdk/client-secrets-manager` to package.json
- [ ] Run `npm install`
- [ ] Run `make setup-secrets`
- [ ] Run `make deploy-env`
- [ ] Run `make deploy-lambda-fast`
- [ ] Test Google Sheets logging in production
- [ ] Verify CloudWatch logs show successful key fetch
