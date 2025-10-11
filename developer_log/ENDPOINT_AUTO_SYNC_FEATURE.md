# Endpoint Auto-Sync Feature

**Status**: ✅ Complete and Deployed  
**Date**: October 11, 2025  
**Impact**: High - Eliminates hardcoded endpoint maintenance

## Overview

Implemented automatic synchronization of Lambda Function URL to UI environment variables during deployment. This eliminates the need for manual endpoint updates and ensures the UI always uses the correct Lambda URL.

## Problem Solved

### Previous Architecture Issue

**Hardcoded Endpoint Problem**:
- Lambda Function URL was hardcoded in `ui-new/src/utils/api.ts`
- When Lambda URL changed (e.g., region change, function recreation), UI required manual code updates
- Risk of deployment failures if URL changed but UI wasn't updated
- Two-step deployment process (deploy Lambda, then manually update and deploy UI)

**Example of Previous Code**:
```typescript
// OLD: Hardcoded Lambda URL
const REMOTE_LAMBDA_URL = 'https://nrw7pperjjdswbmqgmigbwsbyi0rwdqf.lambda-url.us-east-1.on.aws';
```

## Solution Architecture

### Three-Part Solution

1. **Vite Environment Variables**: UI reads Lambda URL from environment instead of hardcode
2. **Auto-Sync Mechanism**: Deployment scripts automatically retrieve and update Lambda URL
3. **Fallback Strategy**: Maintains backwards compatibility with hardcoded fallback

### Implementation Details

#### 1. UI Environment Variable Configuration

**File**: `ui-new/.env`
```bash
# Auto-updated by deployment scripts
# Last updated: 2025-10-11 07:58:18 UTC
VITE_API_BASE=https://nrw7pperjjdswbmqgmigbwsbyi0rwdqf.lambda-url.us-east-1.on.aws
VITE_LAMBDA_URL=https://nrw7pperjjdswbmqgmigbwsbyi0rwdqf.lambda-url.us-east-1.on.aws
```

**File**: `ui-new/src/utils/api.ts`
```typescript
// NEW: Environment-based with fallback
const LOCAL_LAMBDA_URL = import.meta.env.VITE_LOCAL_LAMBDA_URL || 'http://localhost:3000';
const REMOTE_LAMBDA_URL = import.meta.env.VITE_API_BASE || 
                          import.meta.env.VITE_LAMBDA_URL || 
                          'https://nrw7pperjjdswbmqgmigbwsbyi0rwdqf.lambda-url.us-east-1.on.aws';

// Debug logging
console.log('🔧 API Configuration:', {
  remote: REMOTE_LAMBDA_URL,
  local: LOCAL_LAMBDA_URL,
  source: import.meta.env.VITE_API_BASE ? 'env' : 'fallback'
});
```

**Environment Variable Priority**:
1. `VITE_API_BASE` - Primary (auto-updated by deployment)
2. `VITE_LAMBDA_URL` - Legacy fallback
3. Hardcoded URL - Emergency fallback if both env vars missing

#### 2. Deployment Script Auto-Sync

**Files Modified**:
- `scripts/deploy-fast.sh` (fast deployment - code only)
- `scripts/deploy.sh` (full deployment - code + dependencies)

**Auto-Sync Logic** (added to both scripts):

```bash
# Retrieve Lambda Function URL from AWS
FUNCTION_URL=$(aws lambda get-function-url-config \
    --function-name "$FUNCTION_NAME" \
    --region "$REGION" \
    --query 'FunctionUrl' \
    --output text 2>/dev/null | tr -d '\n' | sed 's/\/$//')

if [ -n "$FUNCTION_URL" ]; then
    UI_ENV_FILE="$OLDPWD/ui-new/.env"
    if [ -f "$UI_ENV_FILE" ]; then
        # Create timestamped backup
        cp "$UI_ENV_FILE" "${UI_ENV_FILE}.backup.$(date +%Y%m%d-%H%M%S)"
        
        # Update VITE_API_BASE
        if grep -q "VITE_API_BASE=" "$UI_ENV_FILE"; then
            sed -i "s|VITE_API_BASE=.*|VITE_API_BASE=${FUNCTION_URL}|" "$UI_ENV_FILE"
        else
            echo "VITE_API_BASE=${FUNCTION_URL}" >> "$UI_ENV_FILE"
        fi
        
        # Update VITE_LAMBDA_URL (legacy)
        if grep -q "VITE_LAMBDA_URL=" "$UI_ENV_FILE"; then
            sed -i "s|VITE_LAMBDA_URL=.*|VITE_LAMBDA_URL=${FUNCTION_URL}|" "$UI_ENV_FILE"
        else
            echo "VITE_LAMBDA_URL=${FUNCTION_URL}" >> "$UI_ENV_FILE"
        fi
        
        # Add timestamp comment
        if ! grep -q "# Auto-updated:" "$UI_ENV_FILE"; then
            sed -i "1i# Auto-updated: $(date -u +"%Y-%m-%d %H:%M:%S UTC")" "$UI_ENV_FILE"
        else
            sed -i "s|# Auto-updated:.*|# Auto-updated: $(date -u +"%Y-%m-%d %H:%M:%S UTC")|" "$UI_ENV_FILE"
        fi
        
        echo "✅ UI .env updated with Lambda URL"
        echo "   Rebuild UI with: make build-ui or make deploy-ui"
    fi
fi
```

**Key Features**:
- ✅ Retrieves Lambda URL using AWS CLI
- ✅ Creates timestamped backup before modification
- ✅ Updates both `VITE_API_BASE` and `VITE_LAMBDA_URL`
- ✅ Adds update timestamp comment for tracking
- ✅ Handles missing env vars (adds them if not present)
- ✅ Uses `$OLDPWD` to reference project root (scripts run in temp dir)
- ✅ Provides user feedback and next steps

#### 3. Backup Strategy

**Backup Files**: `ui-new/.env.backup.YYYYMMDD-HHMMSS`

**Example**:
```bash
$ ls -lt ui-new/.env.backup.*
-rw-rw-r-- 1 stever stever 767 Oct 11 18:58 ui-new/.env.backup.20251011-185818
-rw-rw-r-- 1 stever stever 767 Oct 11 18:57 ui-new/.env.backup.20251011-185709
```

**Backup Features**:
- Timestamped filename format
- Created before every .env modification
- Allows easy rollback if needed
- Manual cleanup (backups not auto-deleted)

## Deployment Workflow

### Automatic Process

**1. Deploy Lambda (Fast)**:
```bash
make deploy-lambda-fast
```

**What Happens**:
1. Package Lambda code (no dependencies - uses layer)
2. Upload to S3
3. Update Lambda function
4. **Retrieve Lambda Function URL from AWS**
5. **Auto-update `ui-new/.env` with current URL**
6. **Create backup of .env file**
7. Display success message

**Output Example**:
```
✅ Function code deployed successfully
🔍 Retrieving Lambda Function URL...
✅ Lambda URL: https://nrw7pperjjdswbmqgmigbwsbyi0rwdqf.lambda-url.us-east-1.on.aws
📝 Updating UI environment configuration...
✅ UI .env updated with Lambda URL
   Rebuild UI with: make build-ui or make deploy-ui
```

**2. Rebuild & Deploy UI**:
```bash
make deploy-ui
```

**What Happens**:
1. Build React UI (reads updated .env)
2. Compile TypeScript with new Lambda URL
3. Bundle assets
4. Deploy to GitHub Pages
5. UI now uses auto-synced endpoint

### Verification

**Check .env File**:
```bash
$ head -5 ui-new/.env
# Auto-updated: 2025-10-11 07:58:18 UTC
# Lambda Function URL (base URL for API endpoints)
VITE_API_BASE=https://nrw7pperjjdswbmqgmigbwsbyi0rwdqf.lambda-url.us-east-1.on.aws
```

**Check UI Console**:
Open browser console and look for:
```
🔧 API Configuration: {
  remote: "https://nrw7pperjjdswbmqgmigbwsbyi0rwdqf.lambda-url.us-east-1.on.aws",
  local: "http://localhost:3000",
  source: "env"
}
```

**Verify Endpoint Match**:
```bash
# Get Lambda URL
LAMBDA_URL=$(aws lambda get-function-url-config --function-name llmproxy --query 'FunctionUrl' --output text)

# Get UI configured URL
UI_URL=$(grep VITE_API_BASE ui-new/.env | cut -d= -f2)

# Compare
if [ "$LAMBDA_URL" = "$UI_URL" ]; then
  echo "✅ Endpoints match"
else
  echo "⚠️  Mismatch detected!"
fi
```

## Benefits

### 1. Zero Manual Intervention
- Lambda URL changes automatically propagate to UI
- No manual editing of environment files required
- Eliminates human error in endpoint configuration

### 2. Deployment Safety
- Always uses correct Lambda URL
- Prevents stale endpoint references
- Reduces risk of broken deployments

### 3. Transparency
- Timestamp tracking of updates
- Backup files for audit trail
- Console logging for debugging

### 4. Backwards Compatibility
- Maintains hardcoded fallback
- Works with existing deployments
- Gradual migration path

### 5. Development Flexibility
- Easy to override locally (edit .env)
- Smart routing (local vs remote Lambda)
- Support for multiple environments

## Technical Details

### AWS CLI Command

**Retrieve Lambda Function URL**:
```bash
aws lambda get-function-url-config \
    --function-name llmproxy \
    --region us-east-1 \
    --query 'FunctionUrl' \
    --output text
```

**Output**: `https://nrw7pperjjdswbmqgmigbwsbyi0rwdqf.lambda-url.us-east-1.on.aws/`

**Processing**:
- `tr -d '\n'` - Remove newlines
- `sed 's/\/$//'` - Remove trailing slash

### Vite Environment Variable Loading

**Build Time**:
- Vite reads `.env` file during build
- Variables prefixed with `VITE_` are embedded in build
- Accessible via `import.meta.env.VITE_*`

**Runtime**:
- Environment variables become static strings in compiled code
- No runtime environment variable lookup
- Values baked into JavaScript bundle

### Path Resolution

**Challenge**: Deployment scripts change directory to temp folder

**Solution**: Use `$OLDPWD` environment variable
```bash
cd "$TEMP_DIR"  # Scripts change to temp dir
# ...
UI_ENV_FILE="$OLDPWD/ui-new/.env"  # Reference original dir
```

`$OLDPWD` stores the previous working directory before `cd` command.

## Testing

### Manual Testing Steps

**1. Verify Auto-Sync Works**:
```bash
# Deploy Lambda
make deploy-lambda-fast

# Check .env was updated
cat ui-new/.env | grep VITE_API_BASE

# Verify backup was created
ls -lt ui-new/.env.backup.* | head -1

# Check timestamp comment
head -1 ui-new/.env
```

**2. Test UI Uses Correct Endpoint**:
```bash
# Rebuild UI
make build-ui

# Check compiled code references env var
# (Should NOT find VITE_API_BASE as plain text - it's compiled)
grep -r "VITE_API_BASE" ui-new/dist/ || echo "✅ Variable compiled correctly"

# Deploy UI
make deploy-ui

# Open browser and check console for API configuration log
```

**3. Test Fallback Behavior**:
```bash
# Temporarily remove env var
mv ui-new/.env ui-new/.env.tmp

# Rebuild UI
make build-ui

# Should use hardcoded fallback
# Check browser console - source should be "fallback"

# Restore env file
mv ui-new/.env.tmp ui-new/.env
```

### Automated Testing

**Future Enhancement**: Add Makefile target
```makefile
verify-endpoint:
    @echo "Checking Lambda URL sync..."
    @LAMBDA_URL=$$(aws lambda get-function-url-config --function-name llmproxy --query 'FunctionUrl' --output text | tr -d '\n' | sed 's/\/$$//')
    @UI_URL=$$(grep VITE_API_BASE ui-new/.env | cut -d= -f2)
    @if [ "$$LAMBDA_URL" = "$$UI_URL" ]; then \
        echo "✅ Endpoints match: $$LAMBDA_URL"; \
    else \
        echo "⚠️  Mismatch detected!"; \
        echo "   Lambda: $$LAMBDA_URL"; \
        echo "   UI:     $$UI_URL"; \
        exit 1; \
    fi
```

## Troubleshooting

### Issue: UI .env Not Updated

**Symptom**: Deployment succeeds but .env file unchanged

**Causes**:
1. Script running in wrong directory
2. AWS CLI not configured
3. Lambda Function URL not configured

**Debug**:
```bash
# Check if Function URL exists
aws lambda get-function-url-config --function-name llmproxy

# Check script is using $OLDPWD
grep "UI_ENV_FILE=" scripts/deploy-fast.sh

# Should see: UI_ENV_FILE="$OLDPWD/ui-new/.env"
```

**Fix**: Ensure scripts use `$OLDPWD` path prefix

### Issue: UI Still Using Old Endpoint

**Symptom**: .env updated but UI uses old Lambda URL

**Cause**: UI not rebuilt after .env update

**Fix**:
```bash
# Rebuild UI to incorporate new .env values
make build-ui
make deploy-ui
```

**Prevention**: Always rebuild UI after Lambda deployment

### Issue: Permission Denied on .env

**Symptom**: `sed: cannot rename ui-new/.env: Permission denied`

**Cause**: File permissions or ownership issue

**Fix**:
```bash
# Check permissions
ls -l ui-new/.env

# Fix if needed
chmod 644 ui-new/.env
```

### Issue: Multiple Auto-Update Comments

**Symptom**: `.env` file has many `# Auto-updated:` lines

**Cause**: Regex in sed command not matching existing comments

**Fix**: Scripts now handle this - updates existing comment instead of adding new ones

```bash
# Check for duplicate comments
grep "# Auto-updated:" ui-new/.env | wc -l

# Should return: 1
```

## Future Enhancements

### 1. Multiple Environment Support

**Goal**: Support dev, staging, production environments

**Implementation**:
```bash
# Environment-specific .env files
ui-new/.env.development
ui-new/.env.staging
ui-new/.env.production

# Vite mode selection
vite build --mode production
```

### 2. Validation Step

**Goal**: Verify Lambda URL is reachable before updating UI

**Implementation**:
```bash
# Test Lambda health endpoint
if curl -s --max-time 5 "$FUNCTION_URL/health" > /dev/null; then
    echo "✅ Lambda URL reachable"
    # Update .env
else
    echo "⚠️  Lambda URL not responding - skipping .env update"
fi
```

### 3. Rollback Command

**Goal**: Quick rollback to previous endpoint

**Implementation**:
```bash
# Makefile target
rollback-endpoint:
    @LATEST_BACKUP=$$(ls -t ui-new/.env.backup.* | head -1)
    @if [ -n "$$LATEST_BACKUP" ]; then \
        cp "$$LATEST_BACKUP" ui-new/.env; \
        echo "✅ Rolled back to $$LATEST_BACKUP"; \
    else \
        echo "❌ No backups found"; \
    fi
```

### 4. CI/CD Integration

**Goal**: Automated endpoint sync in GitHub Actions

**Implementation**:
```yaml
# .github/workflows/deploy.yml
- name: Update UI Endpoint
  run: |
    LAMBDA_URL=$(aws lambda get-function-url-config ...)
    sed -i "s|VITE_API_BASE=.*|VITE_API_BASE=${LAMBDA_URL}|" ui-new/.env
    
- name: Build UI
  run: make build-ui
  
- name: Deploy UI
  run: make deploy-ui
```

## Related Documentation

- **Deployment Architecture**: See `DEPLOYMENT_ARCHITECTURE.md`
- **Build System**: See `BUILD_SYSTEM.md`
- **Environment Variables**: See `.env.example` and `ui-new/.env.example`
- **API Configuration**: See `ui-new/src/utils/api.ts`

## Summary

✅ **Problem**: Hardcoded Lambda URL required manual updates  
✅ **Solution**: Vite env vars + auto-sync during deployment  
✅ **Implementation**: Updated deployment scripts and API client  
✅ **Status**: Complete and deployed  
✅ **Impact**: Eliminates manual endpoint maintenance  

**Key Achievement**: Lambda deployments now automatically keep UI configuration in sync, eliminating a common source of deployment failures and manual maintenance overhead.
