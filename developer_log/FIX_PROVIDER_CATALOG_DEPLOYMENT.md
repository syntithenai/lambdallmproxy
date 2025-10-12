# Fix: Deploy PROVIDER_CATALOG.json to Lambda for Image Generation

**Date**: 2025-01-12  
**Issue**: Image generation fails with error `ENOENT: no such file or directory, open '/var/PROVIDER_CATALOG.json'`  
**Root Cause**: `PROVIDER_CATALOG.json` was not being copied to Lambda during deployment  

## Problem

After adding the `generate_image` tool to the UI, image generation requests failed with:

```
Error: ENOENT: no such file or directory, open '/var/PROVIDER_CATALOG.json'
    at Object.readFileSync (node:fs:449:20)
    at callFunction (/var/task/tools.js:1650:39)
```

The `generate_image` tool handler in `src/tools.js` (line 1650) attempts to read `PROVIDER_CATALOG.json`:

```javascript
const catalogPath = path.join(__dirname, '..', 'PROVIDER_CATALOG.json');
const catalog = JSON.parse(fs.readFileSync(catalogPath, 'utf8'));
```

However, neither deployment script was copying this file to Lambda.

## Root Cause

The `PROVIDER_CATALOG.json` file exists in the project root and contains all provider configurations, including:
- Image generation providers (OpenAI DALL-E, Together AI Stable Diffusion, Replicate)
- Quality tier definitions
- Model pricing and capabilities

But it was **missing from deployment scripts**:
- `scripts/deploy.sh` - Full deployment script
- `scripts/deploy-fast.sh` - Fast deployment script (code only)

## Solution

### 1. Updated `scripts/deploy-fast.sh`

Added after copying modular components (line ~72):

```bash
# Copy PROVIDER_CATALOG.json (required for image generation)
cp "$OLDPWD"/PROVIDER_CATALOG.json ./ 2>/dev/null || echo -e "${YELLOW}⚠️  PROVIDER_CATALOG.json not found${NC}"
```

### 2. Updated `scripts/deploy.sh`

**Added missing directories and file copy** (line ~73):

```bash
# Copy modular components (new refactored structure)
mkdir -p config utils services streaming endpoints tools model-selection routing retry mcp image-providers
cp -r "$OLDPWD"/src/config/* ./config/ 2>/dev/null || true
cp -r "$OLDPWD"/src/utils/* ./utils/ 2>/dev/null || true  
cp -r "$OLDPWD"/src/services/* ./services/ 2>/dev/null || true
cp -r "$OLDPWD"/src/streaming/* ./streaming/ 2>/dev/null || true
cp -r "$OLDPWD"/src/endpoints/* ./endpoints/ 2>/dev/null || true
cp -r "$OLDPWD"/src/tools/* ./tools/ 2>/dev/null || true
cp -r "$OLDPWD"/src/model-selection/* ./model-selection/ 2>/dev/null || true
cp -r "$OLDPWD"/src/routing/* ./routing/ 2>/dev/null || true
cp -r "$OLDPWD"/src/retry/* ./retry/ 2>/dev/null || true
cp -r "$OLDPWD"/src/mcp/* ./mcp/ 2>/dev/null || true
cp -r "$OLDPWD"/src/image-providers/* ./image-providers/ 2>/dev/null || true

# Copy PROVIDER_CATALOG.json (required for image generation)
cp "$OLDPWD"/PROVIDER_CATALOG.json ./ 2>/dev/null || echo -e "${YELLOW}⚠️  PROVIDER_CATALOG.json not found${NC}"
```

**Updated zip command** to include PROVIDER_CATALOG.json and new directories (line ~112):

```bash
# Create the deployment package (include node_modules)
zip -q -r "$ZIP_FILE" index.js package.json *.js PROVIDER_CATALOG.json config/ utils/ services/ streaming/ endpoints/ tools/ model-selection/ routing/ retry/ mcp/ image-providers/ node_modules/ 2>/dev/null || zip -q -r "$ZIP_FILE" index.js package.json
```

## Deployment

```bash
make deploy-lambda-fast
```

✅ Successfully deployed to Lambda

## Verification

The PROVIDER_CATALOG.json contains:
- **Image providers**: OpenAI, Together AI, Replicate
- **Quality tiers**: ultra, high, standard, fast
- **Model definitions**: DALL-E 2/3, Stable Diffusion XL, etc.
- **Pricing information**: Per-image costs for each model
- **Capabilities**: Realistic, artistic, stylized, etc.

Example from PROVIDER_CATALOG.json (lines 778-850):

```json
"image": {
  "providers": {
    "openai": {
      "models": {
        "dall-e-3": {
          "qualityTier": "high",
          "supportedSizes": ["1024x1024", "1792x1024", "1024x1792"],
          "pricing": {
            "standard_1024": 0.040,
            "hd_1024": 0.080
          }
        }
      }
    }
  }
}
```

## Testing

Now image generation should work:
1. Query: "generate a low res image of a cat"
2. Expected: Tool calls `generate_image` with quality="fast", size="512x512"
3. Backend reads PROVIDER_CATALOG.json successfully
4. Selects appropriate provider (e.g., Together AI Stable Diffusion)
5. Returns button for user to confirm generation

## Files Modified

- `scripts/deploy-fast.sh` - Added PROVIDER_CATALOG.json copy
- `scripts/deploy.sh` - Added PROVIDER_CATALOG.json copy, mcp/ and image-providers/ directories, updated zip command
- Lambda deployment package - Now includes PROVIDER_CATALOG.json

## Related Issues

This was discovered after implementing the UI changes in `FIX_GENERATE_IMAGE_MISSING.md`. The tool was correctly added to the UI, but the backend couldn't read the provider catalog.

## Prevention

**Lesson**: When adding new features that rely on configuration files, ensure all deployment scripts include those files. Both fast and full deployment paths must be updated.
