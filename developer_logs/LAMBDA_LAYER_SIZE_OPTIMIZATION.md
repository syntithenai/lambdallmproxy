# Lambda Layer Size Optimization Strategies

**Date**: October 15, 2025  
**Current Layer**: `llmproxy-dependencies`  
**Region**: us-east-1  
**Issue**: Lambda layers have a 250MB size limit (unzipped) or 50MB (zipped)

## Current State Analysis

### 🔍 What's Currently in Your Layer

Based on `scripts/deploy-layer.sh`, your layer contains only a **minimal subset** of dependencies:

```json
{
  "@distube/ytdl-core": "^4.14.4",
  "@ffmpeg-installer/ffmpeg": "^1.1.0",
  "fluent-ffmpeg": "^2.1.2",
  "form-data": "^4.0.0",
  "google-auth-library": "^10.4.0"
}
```

**Current layer is ALREADY optimized!** 🎉

### 📦 Full Dependencies Size Breakdown

Total `node_modules`: **510MB**

**Largest dependencies** (NOT in layer):
- `@ffmpeg-installer/ffmpeg`: 66MB (⚠️ **IN LAYER**)
- `@sparticuz/chromium`: 64MB
- `@napi-rs/*`: 58MB
- `pdfjs-dist`: 37MB
- `pdf-parse`: 25MB
- `js-tiktoken`: 22MB
- `@libsql/client`: 20MB (includes vector DB)
- `@langchain/*`: 20MB
- `langchain`: 16MB
- `fluent-ffmpeg`: 13MB (⚠️ **IN LAYER**)
- `chromium-bidi`: 12MB
- `puppeteer-core`: 12MB
- `better-sqlite3`: 11MB
- `openai`: 11MB

### 📄 RAG Database Files

- `rag-kb.db`: **540KB** (production knowledge base)
- `test-rag-kb.db`: **52KB** (test database)

**These are NOT currently deployed to Lambda!**

---

## Problem: What Happens When You Deploy Everything?

If you follow typical deployment patterns and include all dependencies + RAG database in the Lambda function or layer:

**Total size would be:**
- Dependencies: ~510MB
- RAG database: 0.5MB
- Source code: ~5MB
- **Total: ~515MB** ❌ **EXCEEDS 250MB LIMIT**

---

## ✅ Solution 1: Move RAG Database to S3 (RECOMMENDED)

### Benefits
- **Immediate size reduction**: Remove 540KB from deployment
- **Scalability**: Database can grow to GBs without affecting deployments
- **Faster cold starts**: Smaller Lambda package = faster initialization
- **Version control**: Easy to update database independently
- **Caching**: Lambda can cache downloaded database in `/tmp`

### Implementation

#### Step 1: Upload Database to S3

```bash
#!/bin/bash
# scripts/upload-rag-db.sh

BUCKET_NAME="llmproxy-assets"
DB_FILE="rag-kb.db"
S3_KEY="rag/rag-kb.db"

# Create bucket if doesn't exist
aws s3 mb "s3://${BUCKET_NAME}" --region us-east-1 2>/dev/null || true

# Upload database
echo "📤 Uploading RAG database to S3..."
aws s3 cp "$DB_FILE" "s3://${BUCKET_NAME}/${S3_KEY}" \
    --metadata "version=$(date +%Y%m%d-%H%M%S)" \
    --storage-class STANDARD

echo "✅ Database uploaded: s3://${BUCKET_NAME}/${S3_KEY}"

# Store S3 location for Lambda
echo "RAG_DB_S3_BUCKET=${BUCKET_NAME}" >> .deployment-config
echo "RAG_DB_S3_KEY=${S3_KEY}" >> .deployment-config
```

#### Step 2: Download Database in Lambda (with caching)

Modify `src/rag/libsql-storage.js`:

```javascript
const { S3Client, GetObjectCommand } = require('@aws-sdk/client-s3');
const fs = require('fs').promises;
const path = require('path');

/**
 * Get database path (downloads from S3 if needed)
 * @returns {Promise<string>} - Path to local database file
 */
async function getRAGDatabasePath() {
  const localPath = '/tmp/rag-kb.db';
  
  // Check if already cached in /tmp
  try {
    await fs.access(localPath);
    const stats = await fs.stat(localPath);
    const ageMs = Date.now() - stats.mtimeMs;
    
    // Use cached version if less than 1 hour old
    if (ageMs < 3600000) {
      console.log('✅ Using cached RAG database from /tmp');
      return localPath;
    }
  } catch (err) {
    // File doesn't exist, need to download
  }
  
  // Download from S3
  const bucket = process.env.RAG_DB_S3_BUCKET || 'llmproxy-assets';
  const key = process.env.RAG_DB_S3_KEY || 'rag/rag-kb.db';
  
  console.log(`📥 Downloading RAG database from s3://${bucket}/${key}...`);
  
  const s3 = new S3Client({ region: process.env.AWS_REGION || 'us-east-1' });
  
  try {
    const command = new GetObjectCommand({ Bucket: bucket, Key: key });
    const response = await s3.send(command);
    
    // Stream to file
    const chunks = [];
    for await (const chunk of response.Body) {
      chunks.push(chunk);
    }
    const buffer = Buffer.concat(chunks);
    
    await fs.writeFile(localPath, buffer);
    console.log(`✅ RAG database downloaded (${buffer.length} bytes)`);
    
    return localPath;
  } catch (error) {
    console.error('❌ Failed to download RAG database:', error);
    throw new Error(`Could not load RAG database: ${error.message}`);
  }
}

/**
 * Create libsql client with S3-backed database
 */
async function createLibsqlClient(options = {}) {
  const dbPath = await getRAGDatabasePath();
  
  const {
    url = process.env.LIBSQL_URL || `file://${dbPath}`,
    authToken = process.env.LIBSQL_AUTH_TOKEN,
  } = options;

  return createClient({
    url,
    authToken,
  });
}
```

#### Step 3: Update Lambda Environment Variables

```bash
# In scripts/deploy-fast.sh or deploy.sh, add:
aws lambda update-function-configuration \
    --function-name "$FUNCTION_NAME" \
    --environment "Variables={
        RAG_DB_S3_BUCKET=llmproxy-assets,
        RAG_DB_S3_KEY=rag/rag-kb.db,
        ...other vars...
    }"
```

#### Step 4: Grant Lambda S3 Read Permission

Add to Lambda IAM role policy:

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
        "s3:GetObject"
      ],
      "Resource": "arn:aws:s3:::llmproxy-assets/rag/*"
    }
  ]
}
```

### Cost Analysis

- **S3 Storage**: $0.023 per GB/month × 0.00054 GB = **$0.00001/month**
- **S3 GET Requests**: $0.0004 per 1000 requests
  - Cold starts: ~100/day = $0.012/month
- **Data Transfer**: First 100GB/month free (will never hit this)

**Total cost: ~$0.01/month** 📉

### Performance Impact

- **Cold start penalty**: +200-500ms (one-time download)
- **Warm executions**: 0ms (cached in `/tmp`)
- **Effective impact**: Minimal (most requests hit warm containers)

---

## ✅ Solution 2: Exclude Large Dependencies from Layer

### Current Layer Dependencies Size

Checking actual sizes in your `node_modules`:

```bash
# Sizes from your system
@ffmpeg-installer/ffmpeg: 66MB  ⚠️ IN LAYER
fluent-ffmpeg: 13MB            ⚠️ IN LAYER
google-auth-library: ~2MB      ✅ Reasonable
form-data: ~500KB              ✅ Reasonable
@distube/ytdl-core: ~5MB       ✅ Reasonable
```

**Problem**: `@ffmpeg-installer/ffmpeg` (66MB) is your layer's biggest consumer!

### Option 2A: Use Smaller FFmpeg Alternative

Instead of `@ffmpeg-installer/ffmpeg` (includes 66MB binary), consider:

1. **Lambda Layer with Pre-installed FFmpeg** (separate layer)
   - AWS community layers often have ffmpeg
   - Example: `arn:aws:lambda:us-east-1:145266761615:layer:ffmpeg:4`

2. **Remove FFmpeg from dependencies** (if not critical)
   - Check if ffmpeg is actually used in production
   - Many projects include it but never use it

### Option 2B: Split into Multiple Layers

AWS Lambda supports up to **5 layers** per function.

**Strategy**: Group dependencies by size and usage frequency

**Layer 1**: Core dependencies (current layer)
- `@distube/ytdl-core`
- `form-data`
- `google-auth-library`
- Total: ~7MB

**Layer 2**: FFmpeg (if needed)
- `@ffmpeg-installer/ffmpeg`
- `fluent-ffmpeg`
- Total: ~79MB

**Layer 3**: Heavy ML/PDF dependencies
- `pdf-parse`, `pdfjs-dist`
- Total: ~62MB

**Layer 4**: Chromium/Puppeteer (if used)
- `@sparticuz/chromium`, `puppeteer-core`
- Total: ~76MB

**Layer 5**: LangChain/RAG dependencies
- `langchain`, `@langchain/*`, `@libsql/client`
- Total: ~56MB

**Benefit**: Each layer under 250MB, selective loading

---

## ✅ Solution 3: Dynamic Dependency Loading

Load heavy dependencies only when needed (tree-shaking for Lambda).

### Implementation

Create separate Lambda functions for different use cases:

1. **llmproxy-core** (Main function)
   - Chat completion
   - Basic tools
   - Size: ~50MB

2. **llmproxy-youtube** (YouTube processing)
   - `@distube/ytdl-core`
   - `fluent-ffmpeg`
   - Size: ~80MB

3. **llmproxy-pdf** (PDF processing)
   - `pdf-parse`, `pdfjs-dist`
   - Size: ~70MB

4. **llmproxy-rag** (RAG search)
   - `@libsql/client`, `langchain`
   - RAG database from S3
   - Size: ~80MB

**Core function** invokes others via Lambda → Lambda calls when needed.

---

## ✅ Solution 4: Webpack Bundling & Tree-Shaking

Use webpack to bundle and eliminate unused code.

### Setup

```bash
npm install --save-dev webpack webpack-cli terser-webpack-plugin
```

**webpack.config.js**:

```javascript
const path = require('path');
const TerserPlugin = require('terser-webpack-plugin');

module.exports = {
  entry: './src/index.js',
  target: 'node',
  mode: 'production',
  externals: {
    // Exclude native modules
    'better-sqlite3': 'commonjs better-sqlite3',
    '@libsql/client': 'commonjs @libsql/client',
  },
  output: {
    path: path.resolve(__dirname, 'dist'),
    filename: 'bundle.js',
    libraryTarget: 'commonjs2'
  },
  optimization: {
    minimize: true,
    minimizer: [new TerserPlugin({
      terserOptions: {
        compress: {
          drop_console: true, // Remove console.logs
        },
      },
    })],
  },
  module: {
    rules: [
      {
        test: /\.js$/,
        exclude: /node_modules/,
        use: {
          loader: 'babel-loader',
          options: {
            presets: ['@babel/preset-env']
          }
        }
      }
    ]
  }
};
```

**Expected reduction**: 20-40% smaller bundle

---

## ✅ Solution 5: Container Image Deployment

AWS Lambda supports **container images** (up to 10GB).

### Benefits
- **10GB size limit** (vs 250MB for layers)
- Include RAG database directly
- All dependencies bundled
- Easier local testing

### Implementation

**Dockerfile**:

```dockerfile
FROM public.ecr.aws/lambda/nodejs:20

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm ci --production

# Copy source code
COPY src/ ./src/
COPY rag-kb.db ./

# Copy RAG database
ENV RAG_DB_PATH=/var/task/rag-kb.db

# Lambda handler
CMD [ "src/index.handler" ]
```

**Build & Deploy**:

```bash
#!/bin/bash
# scripts/deploy-container.sh

ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)
REGION="us-east-1"
IMAGE_NAME="llmproxy"
ECR_REPO="${ACCOUNT_ID}.dkr.ecr.${REGION}.amazonaws.com/${IMAGE_NAME}"

# Create ECR repository
aws ecr create-repository --repository-name "$IMAGE_NAME" 2>/dev/null || true

# Login to ECR
aws ecr get-login-password --region "$REGION" | \
    docker login --username AWS --password-stdin "$ECR_REPO"

# Build image
docker build -t "$IMAGE_NAME" .

# Tag and push
docker tag "$IMAGE_NAME:latest" "$ECR_REPO:latest"
docker push "$ECR_REPO:latest"

# Update Lambda function
aws lambda update-function-code \
    --function-name llmproxy \
    --image-uri "$ECR_REPO:latest"
```

**Size comparison**:
- Current: ~510MB dependencies + 5MB code + 0.5MB DB = **515MB** ❌
- Container: Same, but **10GB limit** ✅

---

## 📊 Comparison Table

| Solution | Size Reduction | Complexity | Cold Start | Cost | Recommended |
|----------|---------------|------------|------------|------|-------------|
| **S3 for RAG DB** | -0.5MB | Low | +200ms | $0.01/mo | ⭐⭐⭐⭐⭐ |
| **Split Layers** | -0MB (reorganize) | Medium | 0ms | $0 | ⭐⭐⭐ |
| **Remove FFmpeg** | -66MB | Low | 0ms | $0 | ⭐⭐⭐⭐ |
| **Multiple Functions** | -60% per function | High | 0ms | +$$ | ⭐⭐ |
| **Webpack Bundle** | -20-40% | Medium | -100ms | $0 | ⭐⭐⭐ |
| **Container Image** | 10GB limit | Low | +500ms | $0 | ⭐⭐⭐⭐ |

---

## 🎯 Recommended Implementation Plan

### Phase 1: Quick Wins (30 minutes)

1. **Move RAG database to S3** (Solution 1)
   - Immediate: -540KB
   - Scalability: Database can grow without deployment issues
   - Cost: ~$0.01/month

2. **Remove or externalize FFmpeg** (Solution 2A)
   - Check if actually used: `grep -r "ffmpeg" src/`
   - If not needed: Remove from package.json (-66MB)
   - If needed: Use AWS Lambda Layer for ffmpeg

### Phase 2: Layer Optimization (1 hour)

3. **Audit current layer** (`scripts/deploy-layer.sh`)
   - Current layer has only 5 packages (good!)
   - But includes 66MB ffmpeg (bad!)
   - Consider: Is ffmpeg actually used on Lambda?

4. **Split heavy dependencies** (Solution 2B)
   - Create separate layers for different use cases
   - Keep core layer minimal

### Phase 3: Long-term (Optional)

5. **Webpack bundling** (Solution 4)
   - Reduce bundle size by 20-40%
   - Remove unused code

6. **Container deployment** (Solution 5)
   - If size still problematic
   - 10GB limit solves all issues

---

## 🛠️ Implementation Scripts

### Script 1: Upload RAG DB to S3

```bash
#!/bin/bash
# scripts/upload-rag-db.sh

set -e

BUCKET_NAME="${RAG_DB_S3_BUCKET:-llmproxy-assets}"
DB_FILE="rag-kb.db"
S3_KEY="rag/rag-kb.db"
REGION="us-east-1"

echo "📤 Uploading RAG database to S3..."

# Create bucket if doesn't exist
aws s3 mb "s3://${BUCKET_NAME}" --region "$REGION" 2>/dev/null || true

# Upload with versioning
TIMESTAMP=$(date +%Y%m%d-%H%M%S)
aws s3 cp "$DB_FILE" "s3://${BUCKET_NAME}/${S3_KEY}" \
    --metadata "version=${TIMESTAMP},size=$(stat -f%z "$DB_FILE")" \
    --storage-class STANDARD

# Also upload to versioned path
aws s3 cp "$DB_FILE" "s3://${BUCKET_NAME}/rag/versions/rag-kb-${TIMESTAMP}.db" \
    --storage-class STANDARD_IA

echo "✅ Database uploaded:"
echo "   Current: s3://${BUCKET_NAME}/${S3_KEY}"
echo "   Backup:  s3://${BUCKET_NAME}/rag/versions/rag-kb-${TIMESTAMP}.db"

# Store config
echo "RAG_DB_S3_BUCKET=${BUCKET_NAME}" >> .deployment-config
echo "RAG_DB_S3_KEY=${S3_KEY}" >> .deployment-config
```

### Script 2: Analyze Layer Size

```bash
#!/bin/bash
# scripts/analyze-layer-size.sh

echo "📊 Analyzing Lambda Layer Dependencies..."

# Install dependencies in temp dir
TEMP_DIR=$(mktemp -d)
cd "$TEMP_DIR"

cat > package.json << 'EOF'
{
  "dependencies": {
    "@distube/ytdl-core": "^4.14.4",
    "@ffmpeg-installer/ffmpeg": "^1.1.0",
    "fluent-ffmpeg": "^2.1.2",
    "form-data": "^4.0.0",
    "google-auth-library": "^10.4.0"
  }
}
EOF

npm install --production

echo ""
echo "📦 Individual Package Sizes:"
du -sh node_modules/* | sort -hr

echo ""
echo "📊 Total Size:"
du -sh node_modules

# Cleanup
cd -
rm -rf "$TEMP_DIR"
```

---

## 🚀 Quick Start: S3-backed RAG Database

```bash
# 1. Upload database
./scripts/upload-rag-db.sh

# 2. Update Lambda environment variables
aws lambda update-function-configuration \
    --function-name llmproxy \
    --environment "Variables={
        RAG_DB_S3_BUCKET=llmproxy-assets,
        RAG_DB_S3_KEY=rag/rag-kb.db
    }"

# 3. Grant S3 read permission (add to IAM role)
# See "Grant Lambda S3 Read Permission" section above

# 4. Deploy updated code
make deploy-lambda-fast
```

**Result**: RAG database loaded from S3, cached in `/tmp`, size reduced! ✅

---

## 📝 Next Steps

1. **Immediate**: Move RAG database to S3 (recommended)
2. **Audit**: Check if ffmpeg is actually used (`grep -r "ffmpeg" src/`)
3. **Optimize**: Remove unused dependencies
4. **Monitor**: Track actual layer size after deployment

**Questions to answer:**
- Is ffmpeg actually used in your Lambda function?
- How often is the RAG database updated?
- What are your typical cold start vs warm start ratios?

Let me know which solution you'd like to implement first! 🚀
