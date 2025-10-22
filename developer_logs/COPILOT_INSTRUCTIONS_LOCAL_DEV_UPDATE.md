# Copilot Instructions Update - Local Development Workflow

**Date**: 2025-10-18  
**Status**: ✅ Updated

## Changes Made

Updated `.github/copilot-instructions.md` to emphasize the **local development workflow** and prevent automatic Lambda deployments after every code change.

## Key Updates

### Section 1.2: Local Development Workflow

**Added Critical Reminder**:
- ⚠️ **CRITICAL**: We are developing on **localhost** using the local development server
- **DO NOT deploy to Lambda** after every code change
- **DO deploy to Lambda** only when explicitly requested or production-ready

### Development Cycle

Clear 4-step cycle documented:
1. Make code changes to backend files in `src/`
2. Restart dev server with `make dev`
3. Test locally at `http://localhost:3000` (backend) and `http://localhost:5173` (frontend)
4. Only deploy to Lambda when changes are tested and production-ready

### When to Deploy vs Develop Locally

**✅ Develop Locally (Default Workflow)**:
- Making code changes during active development
- Testing new features or bug fixes
- Iterating on implementation
- Experimenting with changes
- **Action**: Run `make dev` after backend changes

**✅ Deploy to Lambda (Only When Ready)**:
- Changes are fully tested locally
- Feature is complete and production-ready
- User explicitly requests deployment
- Preparing for release
- **Action**: Run `make deploy-lambda-fast`

### Quick Reference Commands

Updated command reference to emphasize local development:

```bash
# Local Development (Primary Workflow)
make dev                     # Start local dev server (use after backend changes)
                             # Backend: http://localhost:3000
                             # Frontend: http://localhost:5173

# Lambda Function (Production Deployment Only)
make deploy-lambda           # Full deployment with dependencies (when needed)
make deploy-lambda-fast      # Fast deployment, code only (when production-ready)
```

**Added reminder**: "After making backend code changes, use `make dev` to restart the local server, NOT deployment commands."

## Benefits

1. **Prevents Unnecessary Deployments**: Copilot will no longer suggest deploying to Lambda after every small change
2. **Faster Development**: Emphasizes using local server for testing (instant vs 10+ seconds for deployment)
3. **Clear Guidance**: Explicit instructions on when to develop locally vs when to deploy
4. **Cost Savings**: Reduces unnecessary Lambda deployments and invocations
5. **Better Workflow**: Aligns with standard local development practices

## Files Modified

- `.github/copilot-instructions.md`:
  - Lines 47-52: Added critical reminder about local development
  - Lines 54-63: Added development cycle steps
  - Lines 65-81: Added "When to Deploy vs When to Develop Locally" section
  - Lines 83: Updated heading to "Lambda Function Deployment (Production Only)"
  - Lines 117-136: Updated Quick Reference to prioritize local development

## Impact

✅ **No Code Changes**: Only documentation updates  
✅ **Copilot Behavior**: Will now default to suggesting `make dev` instead of deployments  
✅ **Workflow Clarity**: Clear distinction between development and production deployment  
✅ **Developer Experience**: Faster iteration with local testing

## Next Steps

Copilot will now:
1. ✅ Suggest `make dev` after backend code changes
2. ✅ Remind developers to test locally first
3. ✅ Only suggest deployment when changes are production-ready
4. ✅ Ask before deploying instead of automatically suggesting it

---

**Result**: Development workflow now properly reflects local-first development with deliberate production deployments.
