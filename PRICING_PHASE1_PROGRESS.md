# Phase 1 Progress: Pricing Audit & Fixes

## ✅ Completed Tasks

### 1. Pricing Audit (PRICING_AUDIT.md)
- ✅ Created comprehensive audit document
- ✅ Verified pricing for all major providers (OpenAI, Groq, Together AI, Gemini)
- ✅ Identified specific discrepancies with sources
- ✅ Documented action items

### 2. Backend Pricing Fixes
- ✅ Added embedding models to `src/services/google-sheets-logger.js`:
  - `text-embedding-3-small`: $0.02/$0
  - `text-embedding-3-large`: $0.13/$0
  - `text-embedding-ada-002`: $0.10/$0

### 3. Frontend Pricing Fixes (`ui-new/src/utils/pricing.ts`)
- ✅ Fixed Groq free tier pricing (all models now correctly show $0/$0):
  - llama-3.3-70b-versatile
  - llama-3.1-70b-versatile
  - llama-3.1-8b-instant
  - llama3-70b-8192
  - llama3-8b-8192
  - mixtral-8x7b-32768
  - gemma-7b-it
  - gemma2-9b-it

- ✅ Fixed Together AI DeepSeek pricing:
  - DeepSeek-V3.1: $0.60/$1.70 → $0.55/$1.10 ✅
  - DeepSeek-R1: $3.00/$7.00 → $0.55/$2.19 ✅
  - DeepSeek-R1-Distill-Llama-70B: $2.00/$2.00 → $0.88/$0.88 ✅

- ✅ Added embedding models to frontend:
  - text-embedding-3-small: $0.02/$0
  - text-embedding-3-large: $0.13/$0
  - text-embedding-ada-002: $0.10/$0

- ✅ Added missing OpenAI models:
  - o1-preview: $15.00/$60.00
  - o1-mini: $3.00/$12.00

- ✅ Added missing Together AI models:
  - meta-llama/Llama-3.3-70B-Instruct: $0.88/$0.88
  - meta-llama/Llama-3.1-405B-Instruct: $3.50/$3.50
  - Qwen/Qwen2.5-72B-Instruct: $1.20/$1.20

- ✅ Updated header comment:
  - Added "Last updated: October 20, 2025"
  - Added "Source of truth" note

### 4. Pricing Consistency Test
- ✅ Created `tests/unit/pricing-accuracy.test.js`
- ✅ Tests implemented:
  - Backend and frontend pricing loading
  - All backend models exist in frontend with matching prices
  - Groq models are free ($0/$0)
  - Gemini free tier models are free
  - Embedding models have zero output cost
  - Together AI -Free suffix models are free
  - All embedding models present in both databases

## ⚠️ Known Issues (12 Price Mismatches)

The pricing test has identified 12 models where backend and frontend pricing don't match. **Backend is the source of truth** (it's what we log to Google Sheets).

### Mismatches Found:

1. **gemini-2.5-flash**
   - Backend: $0/$0 (free tier)
   - Frontend: $0.15/$1.25 (Atlas Cloud pricing)
   - **Action**: Update frontend to $0/$0

2. **gemini-2.5-pro**
   - Backend: $0/$0 (free tier)
   - Frontend: $0.625/$5.00 (Atlas Cloud pricing)
   - **Action**: Update frontend to $0/$0

3. **meta-llama/Llama-4-Maverick-17B-128E-Instruct-FP8**
   - Backend: $0.20/$0.20
   - Frontend: $0.27/$0.85
   - **Action**: Update frontend to $0.20/$0.20

4. **meta-llama/Llama-4-Scout-17B-16E-Instruct**
   - Backend: $0.20/$0.20
   - Frontend: $0.18/$0.59
   - **Action**: Update frontend to $0.20/$0.20

5. **deepseek-ai/DeepSeek-V3**
   - Backend: $0.27/$1.10
   - Frontend: $1.25/$1.25
   - **Action**: Update frontend to $0.27/$1.10

6. **deepseek-ai/DeepSeek-R1-0528-tput**
   - Backend: $0.30/$0.60
   - Frontend: $0.55/$2.19
   - **Action**: Update frontend to $0.30/$0.60

7. **deepseek-ai/DeepSeek-R1-Distill-Qwen-14B**
   - Backend: $0.20/$0.20
   - Frontend: $0.18/$0.18
   - **Action**: Update frontend to $0.20/$0.20

8. **Qwen/Qwen2.5-7B-Instruct-Turbo**
   - Backend: $0.18/$0.18
   - Frontend: $0.30/$0.30
   - **Action**: Update frontend to $0.18/$0.18

9. **Qwen/Qwen2.5-Coder-32B-Instruct**
   - Backend: $0.60/$0.60
   - Frontend: $0.80/$0.80
   - **Action**: Update frontend to $0.60/$0.60

10. **moonshotai/Kimi-K2-Instruct**
    - Backend: $1.00/$1.00
    - Frontend: $1.00/$3.00
    - **Action**: Update frontend to $1.00/$1.00

11. **mistralai/Mistral-Small-24B-Instruct-2501**
    - Backend: $0.30/$0.30
    - Frontend: $0.80/$0.80
    - **Action**: Update frontend to $0.30/$0.30

12. **zai-org/GLM-4.5-Air-FP8**
    - Backend: $0.30/$0.30
    - Frontend: $0.20/$1.10
    - **Action**: Update frontend to $0.30/$0.30

## 📊 Test Results

```bash
npx jest tests/unit/pricing-accuracy.test.js
```

**Status**: 1 failed, 6 passed, 7 total

- ✅ Backend and frontend pricing loaded (60+ models each)
- ❌ 12 price mismatches found (backend vs frontend)
- ✅ Groq models correctly free ($0/$0)
- ✅ Gemini free tier correctly free
- ✅ Embedding models have zero output cost
- ✅ Together AI -Free suffix models correctly free
- ✅ All embedding models present in both databases

## 🎯 Next Steps

### Immediate (Complete Phase 1):
1. Sync remaining 12 frontend prices with backend
2. Re-run pricing-accuracy.test.js to verify all tests pass
3. Consider automating pricing updates (scrape provider APIs?)

### Phase 2 - Expand Logging System:
1. Add embedding call logging (rag.js)
2. Add guardrail call logging (chat.js)
3. Add planning LLM logging
4. Add Lambda metrics (memory, duration) to all endpoints

### Phase 3 - User-Owned Billing Sheet:
1. Create user-billing-sheet.js service
2. Implement GET /billing endpoint
3. Implement DELETE /billing/clear endpoint

### Phase 4 - Billing UI Page:
1. Create BillingPage.tsx component
2. Add filter/export/clear data features
3. Integrate with user's Google Sheet

## 📈 Impact

### What This Fixes:
1. **Groq Free Tier**: Users were seeing paid pricing for free models (now correctly $0)
2. **DeepSeek Pricing**: 3 models had incorrect pricing (now accurate)
3. **Missing Models**: 6 models added that weren't in frontend
4. **Embedding Costs**: Now tracked in both systems
5. **Automated Testing**: Prevents future pricing drift

### What This Enables:
1. Accurate cost calculations in UI
2. Reliable billing information
3. Better model cost transparency
4. Foundation for Phase 2 (complete logging)

## 🔍 Files Modified

1. **src/services/google-sheets-logger.js** (Backend)
   - Added 3 embedding models

2. **ui-new/src/utils/pricing.ts** (Frontend)
   - Fixed 8 Groq models (free tier)
   - Fixed 3 DeepSeek models
   - Added 3 embedding models
   - Added 2 OpenAI models (o1-preview, o1-mini)
   - Added 3 Together AI models
   - Updated header comment

3. **tests/unit/pricing-accuracy.test.js** (NEW)
   - 7 comprehensive pricing tests
   - Brace-matching parser for both pricing files
   - Regex with inline comment support

4. **PRICING_AUDIT.md** (NEW)
   - Provider verification with sources
   - Specific discrepancies documented
   - Action items listed

## ⏱️ Time Spent

**Estimated**: 6-8 hours (from plan)
**Actual**: ~3 hours (audit + fixes + tests)

**Remaining for Phase 1**: ~1 hour (sync remaining 12 prices)

---

**Status**: Phase 1 is 90% complete. Once the remaining 12 price mismatches are synced, the pricing audit & fixes phase will be done.
