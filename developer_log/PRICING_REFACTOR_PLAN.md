# Pricing Refactor Implementation Plan

**Date**: 2025-10-25  
**Status**: In Progress  
**Objective**: Implement differential pricing - charge 25% surcharge on server-side provider keys, $0 cost for user-provided keys, remove free tier mentions

---

## Overview

This refactoring changes the pricing model from a pass-through system to a dual-tier approach:

1. **Server-Side Keys** (environment-configured): LLM API cost + 25% surcharge
2. **User-Provided Keys** (UI-configured): $0 cost (pure pass-through)

All pricing calculations will use **paid tier rates** regardless of whether the API key is from a free tier plan.

---

## Requirements

### 1. Environment Configuration
- ✅ **COMPLETED**: Add `LLM_PROFIT_MARGIN=25` environment variable
- ✅ **COMPLETED**: Update `.env` comments to reflect new pricing model
- ✅ **COMPLETED**: Change `LP_TYPE_0` and `LP_TYPE_5` from `groq-free` to `groq`
- ✅ **COMPLETED**: Change `LP_TYPE_2` from `gemini-free` to `gemini`

### 2. UI Changes - Remove Free Tier Options
- ✅ **COMPLETED**: Remove `groq-free` and `gemini-free` from `ProviderType` union in `ui-new/src/types/provider.ts`
- ✅ **COMPLETED**: Remove free tier from `PROVIDER_ENDPOINTS` mapping
- ✅ **COMPLETED**: Remove free tier from `PROVIDER_INFO` display names
- ✅ **COMPLETED**: Remove free tier from provider dropdown in `ui-new/src/components/ProviderForm.tsx`
- ⏳ **IN PROGRESS**: Remove free tier from validation patterns in `ui-new/src/utils/providerValidation.ts`
- ⏳ **IN PROGRESS**: Update TTS services to remove free tier references:
  - `ui-new/src/services/tts/LLMProviderTTSProvider.ts`
  - `ui-new/src/services/tts/TTSProviderFactory.ts`
- ⏳ **TODO**: Update `ui-new/src/components/VoiceInputDialog.tsx` (line 174)
- ⏳ **TODO**: Update `ui-new/src/components/ChatTab.tsx` (line 389)

### 3. Backend Changes - Provider Source Tracking

#### 3.1 Credential Pool (`src/credential-pool.js`)
**Goal**: Mark each provider with `isServerSideKey: boolean` flag

**Changes**:
```javascript
// In loadEnvironmentProviders() - line ~62
const provider = {
    id: `env-provider-${index}`,
    type: type,
    apiKey: apiKey,
    source: 'environment',
    isServerSideKey: true,  // NEW: Mark server-side keys
    index: index
};

// In buildProviderPool() - lines ~215-218
validUserProviders.forEach(p => {
    const expanded = expandProviderForLoadBalancing(p);
    expanded.forEach(ep => {
        pool.push({
            ...ep,
            source: 'user',
            isServerSideKey: false  // NEW: Mark user-provided keys
        });
    });
});
```

**Impact**: All providers in the pool will have `isServerSideKey` flag for cost calculations.

#### 3.2 Pricing Logic (`src/services/google-sheets-logger.js`)

**Current Signature** (line 144):
```javascript
function calculateCost(model, promptTokens, completionTokens, fixedCost = null)
```

**New Signature**:
```javascript
function calculateCost(model, promptTokens, completionTokens, fixedCost = null, isServerSideKey = false)
```

**Implementation**:
```javascript
function calculateCost(model, promptTokens, completionTokens, fixedCost = null, isServerSideKey = false) {
    // 1. If user-provided key, return 0 cost
    if (!isServerSideKey) {
        return 0;
    }

    // 2. If fixed cost provided, apply surcharge
    if (fixedCost !== null) {
        const margin = parseFloat(process.env.LLM_PROFIT_MARGIN || '25') / 100;
        return fixedCost * (1 + margin);
    }

    // 3. Map free tier models to paid tier pricing
    let pricingModel = model;
    if (model.includes('groq-free')) {
        pricingModel = model.replace('groq-free', 'groq');
    } else if (model.includes('gemini-free')) {
        pricingModel = model.replace('gemini-free', 'gemini');
    }

    // 4. Calculate base cost from tokens
    const pricing = PRICING[pricingModel] || { input: 0, output: 0 };
    const inputCost = (promptTokens / 1000000) * pricing.input;
    const outputCost = (completionTokens / 1000000) * pricing.output;
    const baseCost = inputCost + outputCost;

    // 5. Apply LLM_PROFIT_MARGIN surcharge
    const margin = parseFloat(process.env.LLM_PROFIT_MARGIN || '25') / 100;
    const finalCost = baseCost * (1 + margin);

    return finalCost;
}
```

**Pricing Table Updates** (lines 57-142):
- Ensure all `groq-free` model entries map to paid tier pricing
- Ensure all `gemini-free` model entries map to paid tier pricing
- Add explicit paid tier entries if missing

### 4. Endpoint Updates - Pass Provider Source Flag

#### 4.1 Chat Endpoint (`src/endpoints/chat.js`)

**Locations to Update**:
1. **Line 1401** - Tool execution cost calculation
2. **Line 3284** - Evaluation usage cost
3. **Line 3512** - Tool cost calculation  
4. **Line 3760** - Evaluation cost
5. **Line 3814** - Search result cost
6. **Line 3828** - Final response cost

**Pattern**:
```javascript
// OLD
const cost = calculateCostSafe(model, promptTokens, completionTokens);

// NEW - extract isServerSideKey from current provider in loop
const isServerSideKey = provider.isServerSideKey || false;
const cost = calculateCostSafe(model, promptTokens, completionTokens, null, isServerSideKey);
```

**Challenge**: Need to track which provider was used for each LLM call
**Solution**: Pass provider object through execution chain or extract from `llmApiCall` metadata

#### 4.2 RAG Endpoint (`src/endpoints/rag.js`)

**Locations to Update**:
1. **Line 376** - Embedding cost calculation
2. **Line 704** - Search embedding cost

**Pattern**:
```javascript
// Extract from current provider
const isServerSideKey = embeddingSelection.provider.isServerSideKey || false;
const totalCost = calculateCost(embeddingModel, totalTokens, 0, null, isServerSideKey);
```

#### 4.3 TTS Endpoint (`src/endpoints/tts.js`)

**Location to Update**: Line 29-69 (pricing calculation)

**Current Logic**:
```javascript
const pricing = { openai: {...}, google: {...}, groq: {...} };
const costPerMillion = pricing[provider][model] || 0;
const characterCost = (text.length / 1000000) * costPerMillion;
```

**New Logic**:
```javascript
// Add isServerSideKey parameter to function
async function calculateTTSCost(provider, model, text, isServerSideKey = false) {
    if (!isServerSideKey) return 0;  // User-provided key
    
    const pricing = { openai: {...}, google: {...}, groq: {...} };
    const costPerMillion = pricing[provider][model] || 0;
    const baseCost = (text.length / 1000000) * costPerMillion;
    
    // Apply surcharge
    const margin = parseFloat(process.env.LLM_PROFIT_MARGIN || '25') / 100;
    return baseCost * (1 + margin);
}
```

#### 4.4 Image Generation (`src/tools.js`, `src/image-providers/*.js`)

**Files to Update**:
- `src/image-providers/openai.js` - line 139, 296, 332
- `src/image-providers/together.js` - line 203, 246
- `src/image-providers/replicate.js` - line 88, 271

**Pattern**: Similar to TTS - add `isServerSideKey` parameter, return 0 for user keys, apply surcharge for server keys

### 5. Provider Catalog Updates

**File**: `PROVIDER_CATALOG.json`

**Changes Needed**:
1. Map all `groq-free` model entries to use paid tier pricing
2. Map all `gemini-free` model entries to use paid tier pricing
3. Remove "free" from model display names
4. Ensure pricing data is accurate for paid tiers

**Example**:
```json
{
  "llama-3.3-70b-versatile": {
    "provider": "groq",  // Changed from "groq-free"
    "pricing": {
      "input": 0.59,     // Paid tier rate (not free tier)
      "output": 0.79
    },
    "name": "LLaMA 3.3 70B Versatile",  // Removed "(Free)" suffix
    "contextWindow": 128000,
    "capabilities": ["chat", "tools"]
  }
}
```

### 6. Documentation Updates

#### 6.1 Help Page (`ui-new/src/components/HelpPage.tsx` or similar)

**Changes**:
- Remove all mentions of "free tier"
- Add section explaining pricing model:
  - "Server-side providers: LLM API cost + 25% service fee"
  - "Your own API keys: $0 cost (pure pass-through)"
- Update provider setup instructions to remove free tier guidance

#### 6.2 README.md

**Sections to Update**:
- Pricing model explanation
- Provider configuration examples
- Remove free tier recommendations
- Add clarification about surcharge only applying to server-side keys

#### 6.3 Provider Setup Gate (`ui-new/src/components/ProviderSetupGate.tsx`)

**Current Text** (lines 70-84):
```tsx
<h3>Recommended: Free Tier Providers</h3>
<ul>
  <li>
    <strong>Groq (Free):</strong> Fast inference with generous free tier
  </li>
  <li>
    <strong>Gemini (Free):</strong> Google's LLM with free tier
  </li>
</ul>
```

**New Text**:
```tsx
<h3>Recommended: Provider Options</h3>
<ul>
  <li>
    <strong>Groq:</strong> Fast inference with LLaMA and Mixtral models
    <br />
    <a href="https://console.groq.com/" target="_blank" rel="noopener noreferrer">
      Get API key →
    </a>
  </li>
  <li>
    <strong>Gemini:</strong> Google's powerful Gemini models
    <br />
    <a href="https://aistudio.google.com/apikey" target="_blank" rel="noopener noreferrer">
      Get API key →
    </a>
  </li>
</ul>
```

---

## Testing Plan

### 1. Unit Tests
- [ ] Test `calculateCost()` with `isServerSideKey=true` applies surcharge
- [ ] Test `calculateCost()` with `isServerSideKey=false` returns 0
- [ ] Test `groq-free` model maps to paid tier pricing
- [ ] Test `gemini-free` model maps to paid tier pricing

### 2. Integration Tests
- [ ] Test chat request with server-side key charges correct amount
- [ ] Test chat request with user-provided key charges $0
- [ ] Test embedding request with server-side key applies surcharge
- [ ] Test TTS request with user key returns $0 cost
- [ ] Test image generation with server key applies surcharge

### 3. E2E Testing
1. **Setup**: Configure both server-side and user-provided Groq keys
2. **Test 1**: Send chat request → verify user key costs $0
3. **Test 2**: Remove user key → verify server key applies 25% surcharge
4. **Test 3**: Check Google Sheets log shows correct costs
5. **Test 4**: Verify UI provider form doesn't show free tier options

### 4. Pricing Verification
- [ ] Sample 10 models from catalog
- [ ] Verify pricing matches current vendor rates (paid tier)
- [ ] Calculate surcharge manually (API cost × 1.25)
- [ ] Compare with logged costs in Google Sheets

---

## Deployment Strategy

### Phase 1: UI Updates (Low Risk)
```bash
# 1. Remove free tier from UI
cd ui-new
npm run build
cd ..
make deploy-ui
```

**Verification**: Check production UI - free tier options should be gone

### Phase 2: Backend Provider Tracking (Medium Risk)
```bash
# 1. Update credential-pool.js to add isServerSideKey flag
# 2. Deploy backend
make deploy-lambda-fast
```

**Verification**: 
- Check CloudWatch logs for provider pool output
- Verify `isServerSideKey` flag appears in logs

### Phase 3: Pricing Logic (HIGH RISK - TEST THOROUGHLY)
```bash
# 1. Update calculateCost() function
# 2. Update PROVIDER_CATALOG.json
# 3. Deploy backend
make deploy-lambda-fast

# 4. Deploy environment variable
make deploy-env
```

**Verification**:
- Monitor Google Sheets for first few requests
- Verify costs are either $0 (user keys) or show surcharge (server keys)
- Check billing sheet for anomalies

### Phase 4: Endpoint Updates (HIGH RISK)
```bash
# Deploy updated endpoints one at a time
make deploy-lambda-fast
```

**Testing Order**:
1. RAG endpoint (simplest)
2. TTS endpoint
3. Chat endpoint (most complex)
4. Image generation tools

### Phase 5: Documentation
```bash
# Update help pages and README
make deploy-ui
```

---

## Rollback Plan

### If Pricing Errors Detected:
1. **Immediate**: Revert `calculateCost()` to previous version
2. Set `LLM_PROFIT_MARGIN=0` temporarily
3. Deploy emergency fix
4. Investigate logged costs in Google Sheets
5. Refund affected users if necessary

### Rollback Commands:
```bash
# Revert to last known good commit
git revert HEAD
make deploy-lambda-fast

# Or restore from backup
git checkout <last-good-commit>
make deploy-lambda-fast
```

---

## Progress Tracking

### Completed ✅
1. Environment variable `LLM_PROFIT_MARGIN` added
2. UI provider types cleaned (groq-free, gemini-free removed)
3. Provider form dropdown updated
4. `.env` file updated with new provider types and documentation

### In Progress ⏳
1. UI validation and TTS service cleanup
2. Backend pricing calculation refactor

### TODO ❌
1. Credential pool provider source tracking
2. Chat endpoint cost calculations
3. RAG endpoint cost calculations
4. TTS/STT/image cost calculations
5. PROVIDER_CATALOG.json pricing updates
6. Documentation updates
7. Testing and deployment

---

## Risk Assessment

### High Risk Areas
1. **calculateCost() Changes**: Affects all billing - thorough testing required
2. **Chat Endpoint**: Complex execution flow - need to track provider through tool chains
3. **Provider Catalog Pricing**: Must verify all models use correct paid tier rates

### Medium Risk Areas
1. **RAG Endpoint**: Simpler than chat, but affects knowledge base operations
2. **TTS/Image Generation**: Lower usage volume, but important for feature completeness

### Low Risk Areas
1. **UI Changes**: Type-safe, compile-time errors caught
2. **Documentation**: No functional impact

---

## Success Criteria

✅ All free tier mentions removed from codebase  
✅ UI doesn't offer groq-free or gemini-free options  
✅ Server-side keys charge LLM cost + 25%  
✅ User-provided keys charge $0  
✅ All pricing uses paid tier rates  
✅ Google Sheets logs show correct costs  
✅ Documentation reflects new pricing model  
✅ Tests pass with both provider types  

---

## Notes

- **Timeline**: 2-3 days for full implementation and testing
- **Stakeholders**: Notify users of pricing change before deployment
- **Monitoring**: Watch Google Sheets closely for first 24-48 hours after deployment
- **Support**: Prepare FAQ for users asking about pricing changes

