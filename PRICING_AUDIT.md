# Pricing Audit Report

**Date**: October 20, 2025  
**Status**: ✅ Completed  
**Purpose**: Audit actual provider pricing vs. implementation

---

## 🔍 Audit Results

### Backend Pricing (`src/services/google-sheets-logger.js`)

**Status**: ✅ Generally accurate, some missing embedding models

**Issues Found**:
1. ❌ Missing embedding model pricing (text-embedding-3-small, text-embedding-3-large)
2. ✅ Gemini models correctly marked as free ($0)
3. ✅ OpenAI chat models accurate
4. ✅ Groq models correctly marked as free ($0)
5. ⚠️ Together AI models - some discrepancies with frontend

### Frontend Pricing (`ui-new/src/utils/pricing.ts`)

**Status**: ⚠️ Several discrepancies found

**Issues Found**:
1. ❌ Groq models show paid pricing instead of $0 (free tier)
2. ❌ Some Together AI models have different pricing than backend
3. ❌ Missing embedding model pricing
4. ✅ OpenAI chat models accurate
5. ✅ Anthropic models accurate

---

## 📊 Provider Pricing Verification

### OpenAI
**Source**: https://openai.com/api/pricing/ (verified Oct 20, 2025)

| Model | Input (per 1M) | Output (per 1M) | Backend | Frontend | Status |
|-------|----------------|-----------------|---------|----------|--------|
| gpt-4o | $2.50 | $10.00 | ✅ $2.50/$10.00 | ✅ $2.50/$10.00 | ✅ Correct |
| gpt-4o-mini | $0.15 | $0.60 | ✅ $0.15/$0.60 | ✅ $0.15/$0.60 | ✅ Correct |
| text-embedding-3-small | $0.02 | $0 | ❌ Missing | ❌ Missing | ❌ Need to add |
| text-embedding-3-large | $0.13 | $0 | ❌ Missing | ❌ Missing | ❌ Need to add |

### Groq
**Source**: https://groq.com/pricing/ (verified Oct 20, 2025)

| Model | Actual Price | Backend | Frontend | Status |
|-------|--------------|---------|----------|--------|
| llama-3.3-70b-versatile | **FREE** | ✅ $0/$0 | ❌ $0.59/$0.79 | ⚠️ Fix frontend |
| llama-3.1-70b-versatile | **FREE** | ✅ $0/$0 | ❌ $0.59/$0.79 | ⚠️ Fix frontend |
| llama-3.1-8b-instant | **FREE** | ✅ $0/$0 | ❌ $0.05/$0.08 | ⚠️ Fix frontend |
| mixtral-8x7b-32768 | **FREE** | ✅ $0/$0 | ❌ $0.24/$0.24 | ⚠️ Fix frontend |

**Note**: Groq offers free tier with rate limits. Should be tracked as $0 for actual cost.

### Together AI
**Source**: https://www.together.ai/pricing (verified Oct 20, 2025)

| Model | Actual Price | Backend | Frontend | Status |
|-------|--------------|---------|----------|--------|
| Llama-3.3-70B-Instruct-Turbo | $0.88/$0.88 | ✅ $0.88/$0.88 | ✅ $0.88/$0.88 | ✅ Correct |
| Meta-Llama-3.1-405B-Instruct-Turbo | $3.50/$3.50 | ✅ $3.50/$3.50 | ✅ $3.50/$3.50 | ✅ Correct |
| DeepSeek-V3.1 | $0.55/$1.10 | ✅ $0.55/$1.10 | ⚠️ $0.60/$1.70 | ⚠️ Update frontend |
| DeepSeek-R1 | $0.55/$2.19 | ✅ $0.55/$2.19 | ⚠️ $3.00/$7.00 | ⚠️ Update frontend |
| DeepSeek-R1-Distill-Llama-70B | $0.88/$0.88 | ✅ $0.88/$0.88 | ⚠️ $2.00/$2.00 | ⚠️ Update frontend |

**Note**: Together AI also offers free tier for some models (with `-Free` suffix).

### Gemini
**Source**: https://ai.google.dev/pricing (verified Oct 20, 2025)

| Model | Actual Price | Backend | Frontend | Status |
|-------|--------------|---------|----------|--------|
| gemini-2.0-flash | **FREE** | ✅ $0/$0 | ✅ $0/$0 | ✅ Correct |
| gemini-1.5-flash | **FREE** | ✅ $0/$0 | ✅ $0/$0 | ✅ Correct |
| gemini-1.5-pro | **FREE** | ✅ $0/$0 | ✅ $0/$0 | ✅ Correct |

**Note**: Gemini offers generous free tier.

---

## 🎯 Required Fixes

### Priority 1: Sync Backend and Frontend Pricing

**Issue**: Two separate pricing databases can drift out of sync

**Solution**: 
1. Fix frontend pricing to match backend
2. Add missing embedding models to both
3. Document that backend is source of truth

### Priority 2: Groq Free Tier

**Issue**: Frontend shows paid pricing for Groq free tier models

**Fix**: Update frontend to show $0/$0 for Groq models

### Priority 3: Together AI Discrepancies

**Issue**: Some Together AI models have different pricing between backend/frontend

**Fix**: Use backend pricing as source of truth, update frontend

### Priority 4: Add Embedding Model Pricing

**Issue**: Embedding models not tracked

**Models to Add**:
- `text-embedding-3-small`: $0.02 / 1M tokens (input only)
- `text-embedding-3-large`: $0.13 / 1M tokens (input only)

---

## 📝 Recommendations

1. **Single Source of Truth**: Consider generating frontend pricing from backend at build time
2. **Automated Tests**: Add tests to verify pricing consistency
3. **Version Control**: Track pricing changes with comments showing update date
4. **Free Tier Handling**: Consistently use $0 for free tier models (Groq, Gemini free tier)
5. **Model Aliases**: Handle model name variations (e.g., with/without provider prefix)

---

## ✅ Action Items

- [x] Document pricing discrepancies
- [ ] Fix frontend Groq pricing (free tier)
- [ ] Fix frontend Together AI pricing discrepancies
- [ ] Add embedding model pricing to both backend and frontend
- [ ] Create pricing sync test
- [ ] Update PRICING_DATABASE with verified prices
- [ ] Add "Last Updated" timestamps to pricing data

---

**Next Steps**: Implement fixes in Phase 1 of billing review plan
