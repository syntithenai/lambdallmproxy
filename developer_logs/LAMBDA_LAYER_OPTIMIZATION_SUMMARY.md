# Lambda Layer Size Optimization - Quick Reference

**Date**: October 15, 2025  
**Status**: Analysis complete, implementation ready

## 🎯 Key Findings

### Current State
- **Total dependencies**: 510MB (`node_modules`)
- **Current layer**: ~80MB (5 packages only)
- **RAG database**: 540KB (`rag-kb.db`)
- **Lambda layer limit**: 250MB unzipped, 50MB zipped

### Biggest Contributors
1. `@ffmpeg-installer/ffmpeg`: **66MB** ⚠️ (IN LAYER, ACTIVELY USED)
2. `@sparticuz/chromium`: 64MB (not in layer)
3. `@napi-rs/*`: 58MB (not in layer)
4. `pdfjs-dist`: 37MB (not in layer)

### Good News ✅
- Your layer is already optimized (only 5 packages)
- Full dependencies NOT deployed to Lambda
- RAG database NOT currently in layer

## 📋 Immediate Action Items

### ✅ Option 1: Move RAG Database to S3 (RECOMMENDED)

**Why:**
- Current size: 540KB (small but will grow)
- Future-proof: Can scale to GBs
- No deployment needed when DB updates
- Cost: ~$0.01/month

**How:**
```bash
# 1. Run analysis
./scripts/analyze-layer-size.sh

# 2. Upload database to S3
./scripts/upload-rag-db.sh

# 3. Update Lambda environment
aws lambda update-function-configuration \
    --function-name llmproxy \
    --environment "Variables={RAG_DB_S3_BUCKET=llmproxy-assets,RAG_DB_S3_KEY=rag/rag-kb.db}"

# 4. Deploy code changes
make deploy-lambda-fast
```

**Files to modify:**
- `src/rag/libsql-storage.js` - Add S3 download logic (see LAMBDA_LAYER_SIZE_OPTIMIZATION.md)

---

### ⚠️ Option 2: Keep FFmpeg, Accept Layer Size

**Current situation:**
- FFmpeg (66MB) is **actively used** by:
  - `src/tools/youtube-downloader.js` (converts audio)
  - `src/tools/audio-chunker.js` (processes audio)
- These tools ARE deployed (via `cp -r src/tools/*`)

**Decision needed:**
- Keep FFmpeg in layer (current state) ✅
- OR: Remove audio tools if not critical ❌
- OR: Use external FFmpeg Lambda Layer 🔄

**To check if audio tools are used:**
```bash
# Search for tool calls in main code
grep -r "youtube-downloader\|audio-chunker" src/index.js src/tools.js
```

---

### 🔍 Option 3: Analyze Before Optimizing

Run the analysis script to see exact layer size:

```bash
./scripts/analyze-layer-size.sh
```

**Output will show:**
- Individual package sizes
- Total uncompressed/compressed size
- Comparison vs AWS limits
- Specific recommendations

---

## 🎯 Recommended Strategy

### Phase 1: Low-hanging fruit (30 min)
1. ✅ Move RAG DB to S3 (future-proof)
2. ✅ Run layer analysis
3. ❓ Check if audio tools are actually used in production

### Phase 2: If layer exceeds limits (1-2 hours)
1. 🔧 Use external FFmpeg layer (removes 66MB)
2. 🔧 Split into multiple layers
3. 🔧 Container image deployment (10GB limit)

---

## 📊 Quick Commands

```bash
# Check current layer contents
cat scripts/deploy-layer.sh | grep -A 20 "dependencies"

# Analyze layer size
./scripts/analyze-layer-size.sh

# Upload RAG database to S3
./scripts/upload-rag-db.sh

# Check if FFmpeg is used in deployed code
grep -r "ffmpeg" src/index.js src/tools.js src/endpoints/

# See full optimization guide
cat LAMBDA_LAYER_SIZE_OPTIMIZATION.md
```

---

## 💡 Key Insights

### Your Layer is Already Good! ✅
- Only 5 packages (minimal)
- Heavy dependencies (chromium, pdf-parse, etc.) NOT in layer
- Most size comes from FFmpeg (66MB) which is actively used

### What's NOT a Problem
- ❌ Layer doesn't include full 510MB of dependencies
- ❌ RAG database not currently deployed to Lambda
- ❌ You're using the layer pattern correctly

### What Might Become a Problem
- ⚠️ RAG database will grow over time
- ⚠️ FFmpeg is 66MB (close to 250MB limit when fully zipped)
- ⚠️ Adding more dependencies to layer

---

## 🚀 Next Steps

**Choose your path:**

1. **Conservative** (recommended): 
   - Move RAG DB to S3
   - Keep current layer as-is
   - Monitor layer size over time

2. **Aggressive optimization**:
   - Move RAG DB to S3
   - Use external FFmpeg layer
   - Reduce layer to <20MB

3. **Future-proof**:
   - Container image deployment (10GB limit)
   - Include everything (dependencies + DB)
   - Easier maintenance

**Questions to answer:**
- ❓ Are audio tools (`youtube-downloader`, `audio-chunker`) used in production?
- ❓ How often does RAG database get updated?
- ❓ What's current Lambda cold start time?

---

## 📚 Resources

- **Full guide**: `LAMBDA_LAYER_SIZE_OPTIMIZATION.md`
- **Analysis script**: `scripts/analyze-layer-size.sh`
- **Upload script**: `scripts/upload-rag-db.sh`
- **Current layer**: `scripts/deploy-layer.sh`

**AWS Lambda Limits:**
- Layer: 250MB unzipped, 50MB zipped
- Function + layers: 250MB unzipped
- Container images: 10GB
- `/tmp` storage: 512MB - 10GB (configurable)

---

## ✅ Summary

**Your layer is fine for now!** 

The main opportunity is moving the RAG database to S3 for future scalability. FFmpeg is actively used, so keeping it in the layer makes sense. If you hit size limits in the future, you have multiple options (external FFmpeg layer, container images, etc.).

**Recommended first step**: Run `./scripts/analyze-layer-size.sh` to get exact numbers, then decide if optimization is needed.
