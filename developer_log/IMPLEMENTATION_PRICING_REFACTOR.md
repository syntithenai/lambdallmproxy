# Pricing Refactoring Implementation Plan

**Date:** October 25, 2025  
**Status:** Planning Phase  
**Scope:** Remove free tier concepts, implement profit margin surcharge for server-side keys

---

## Overview

This document outlines the implementation plan for refactoring the pricing system to:

1. **Charge 25% surcharge** on all LLM operations when using server-side provider keys
2. **Zero cost** when users provide their own API keys via UI
3. **Remove "free tier" options** from UI (groq-free, gemini-free)
4. **Use paid tier pricing** for all cost calculations, regardless of key source
5. **Update all documentation** to reflect new pricing model

---

## Business Requirements

### Pricing Model
- **User-provided keys (UI):** $0 cost to you (pass-through)
- **Server-side keys (environment):** LLM API cost × (1 + `LLM_PROFIT_MARGIN`%)
- **Default margin:** 25% (`LLM_PROFIT_MARGIN=25`)
- **All calculations:** Use paid tier pricing, even for free tier API keys

### Scope of Operations
- Chat/text completion
- Embeddings (RAG)
- Image generation
- Text-to-speech (TTS)
- Speech-to-text (STT/Whisper)

---

## Technical Implementation

### Phase 1: Environment Configuration ✅ COMPLETED

**File:** `.env`

```properties
# LLM Operations Surcharge (percentage added to LLM API costs)
# Applied ONLY when using server-side provider keys (environment-configured)
# User-provided keys from UI are NOT charged (pass-through at $0 cost to you)
# This covers your costs when users use your free tier API keys
# Default: 25% surcharge on server-side LLM operations
LLM_PROFIT_MARGIN=25
```

**Changes made:**
- Added `LLM_PROFIT_MARGIN=25` environment variable
- Updated provider configuration comments to remove "free tier" language
- Changed `LP_TYPE_0` from `groq-free` → `groq`
- Changed `LP_TYPE_2` from `gemini-free` → `gemini`

---

### Phase 2: UI - Remove Free Tier Options ✅ PARTIALLY COMPLETED

#### 2.1. Provider Type Definitions ✅ COMPLETED

**File:** `ui-new/src/types/provider.ts`

**Changes made:**
- Removed `groq-free` and `gemini-free` from `ProviderType` union
- Removed free tier entries from `PROVIDER_ENDPOINTS`
- Removed free tier entries from `PROVIDER_INFO`
- Updated descriptions to remove "free tier" language
- Updated icons (removed 🆓, updated to ⚡ for Groq, ✨ for Gemini)

#### 2.2. Provider Form ✅ COMPLETED

**File:** `ui-new/src/components/ProviderForm.tsx`

**Changes made:**
- Removed `groq-free` and `gemini-free` from `providerTypes` array

#### 2.3. Provider Validation ⏳ PENDING

**File:** `ui-new/src/utils/providerValidation.ts`

**Required changes:**
```typescript
// Remove these entries:
const PROVIDER_KEY_PATTERNS = {
  // 'groq-free': /^gsk_[a-zA-Z0-9]{32,}$/,  // REMOVE
  'groq': /^gsk_[a-zA-Z0-9]{32,}$/,
  // 'gemini-free': /^AIza[a-zA-Z0-9_-]{35}$/,  // REMOVE
  'gemini': /^AIza[a-zA-Z0-9_-]{35}$/,
  // ... rest
};

// Remove from validation messages:
const VALIDATION_MESSAGES = {
  // 'groq-free': '...',  // REMOVE
  // 'gemini-free': '...',  // REMOVE
  // ... rest
};
```

#### 2.4. TTS Services ⏳ PENDING

**Files to update:**
- `ui-new/src/services/tts/LLMProviderTTSProvider.ts`
- `ui-new/src/services/tts/TTSProviderFactory.ts`

**Required changes:**
```typescript
// Change from:
const supportedTypes = ['openai', 'gemini', 'gemini-free', 'groq-free', 'together'];

// To:
const supportedTypes = ['openai', 'gemini', 'groq', 'together'];

// Update all switch/case statements:
// case 'gemini-free':  // REMOVE
case 'gemini':
  // ... handle Gemini TTS

// case 'groq-free':  // REMOVE  
case 'groq':
  // ... handle Groq TTS
```

#### 2.5. Voice Input Dialog ⏳ PENDING

**File:** `ui-new/src/components/VoiceInputDialog.tsx`

```typescript
// Change from:
const groqProvider = providers.find(p => p.type === 'groq' || p.type === 'groq-free');

// To:
const groqProvider = providers.find(p => p.type === 'groq');
```

#### 2.6. Chat Tab ⏳ PENDING

**File:** `ui-new/src/components/ChatTab.tsx`

```typescript
// Remove case:
// case 'gemini-free':  // REMOVE
case 'gemini':
  // ... Gemini handling
```

---

### Phase 3: Backend - Pricing Calculation Logic ⏳ PENDING

#### 3.1. Credential Pool - Mark Provider Source

**File:** `src/credential-pool.js`

**Function:** `buildProviderPool(userProviders, isAuthorized)`

**Required changes:**
```javascript
// Add source flag to all providers
function buildProviderPool(userProviders = [], isAuthorized = false) {
    const pool = [];
    
    // User providers - NO SURCHARGE
    if (userProviders && Array.isArray(userProviders)) {
        validUserProviders.forEach(p => {
            const expanded = expandProviderForLoadBalancing(p);
            expanded.forEach(ep => {
                pool.push({
                    ...ep,
                    source: 'user',
                    isServerSideKey: false  // NEW FLAG
                });
            });
        });
    }
    
    // Environment providers - SURCHARGE APPLIES
    if (isAuthorized) {
        const envProviders = loadEnvironmentProviders();
        envProviders.forEach(p => {
            const expanded = expandProviderForLoadBalancing(p);
            expanded.forEach(ep => {
                pool.push({
                    ...ep,
                    source: 'environment',
                    isServerSideKey: true  // NEW FLAG
                });
            });
        });
    }
    
    return pool;
}
```

**Impact:** All downstream code will have access to `provider.isServerSideKey` flag

---

#### 3.2. Core Pricing Function - Apply Surcharge

**File:** `src/services/google-sheets-logger.js`

**Function:** `calculateCost(model, promptTokens, completionTokens, fixedCost, isUserProvidedKey)`

**Current signature:**
```javascript
function calculateCost(model, promptTokens, completionTokens, fixedCost = null)
```

**New signature:**
```javascript
function calculateCost(model, promptTokens, completionTokens, fixedCost = null, isUserProvidedKey = false)
```

**Implementation:**
```javascript
function calculateCost(model, promptTokens, completionTokens, fixedCost = null, isUserProvidedKey = false) {
    // User-provided keys: $0 cost (pass-through)
    if (isUserProvidedKey) {
        console.log(`💰 Cost calculation: $0.00 (user-provided key)`);
        return 0;
    }
    
    // Fixed cost operations (e.g., images)
    if (fixedCost !== null && fixedCost !== undefined) {
        const surcharge = parseFloat(process.env.LLM_PROFIT_MARGIN || '25') / 100;
        const totalCost = fixedCost * (1 + surcharge);
        console.log(`💰 Cost calculation: $${fixedCost.toFixed(6)} + ${surcharge * 100}% surcharge = $${totalCost.toFixed(6)} (server-side key)`);
        return totalCost;
    }
    
    // Map free tier model names to paid tier pricing
    let pricingModel = model;
    if (model.includes('groq-free') || model.includes('gemini-free')) {
        // Normalize to paid tier for pricing lookup
        pricingModel = model.replace('-free', '');
        console.log(`💰 Mapping free tier model ${model} → ${pricingModel} for pricing`);
    }
    
    // Calculate token-based cost using PAID TIER pricing
    const pricing = PRICING[pricingModel] || { input: 0, output: 0 };
    const inputCost = (promptTokens / 1000000) * pricing.input;
    const outputCost = (completionTokens / 1000000) * pricing.output;
    const baseCost = inputCost + outputCost;
    
    // Apply surcharge for server-side keys
    const surcharge = parseFloat(process.env.LLM_PROFIT_MARGIN || '25') / 100;
    const totalCost = baseCost * (1 + surcharge);
    
    console.log(`💰 Cost calculation: $${baseCost.toFixed(6)} + ${surcharge * 100}% surcharge = $${totalCost.toFixed(6)} (server-side key)`);
    
    return totalCost;
}
```

**Key changes:**
1. Add `isUserProvidedKey` parameter
2. Return 0 if user key
3. Map `groq-free` → `groq`, `gemini-free` → `gemini` for pricing
4. Apply `LLM_PROFIT_MARGIN` surcharge if server key

---

#### 3.3. Chat Endpoint - Pass Key Source Flag

**File:** `src/endpoints/chat.js`

**Required changes:**

1. **Import helper:**
```javascript
// At top of file
function isUserProvidedProvider(provider) {
    return provider.source === 'user' || !provider.isServerSideKey;
}
```

2. **Update all `calculateCost()` calls:**

**Search for:** ~20+ instances of `calculateCost(` or `calculateCostSafe(`

**Example transformation:**
```javascript
// BEFORE:
const cost = calculateCostSafe(
    model,
    evaluation.usage.prompt_tokens || 0,
    evaluation.usage.completion_tokens || 0
);

// AFTER:
const cost = calculateCostSafe(
    model,
    evaluation.usage.prompt_tokens || 0,
    evaluation.usage.completion_tokens || 0,
    null,  // fixedCost
    isUserProvidedProvider(selectedProvider)  // NEW: pass key source
);
```

**Locations to update:**
- Line ~1401: Tool call cost calculation
- Line ~3284: Evaluation cost calculation  
- Line ~3512: Planning cost calculation
- Line ~3760: Another evaluation cost
- Line ~3814, 3828: Final cost calculations
- Search for all other instances

---

#### 3.4. RAG Endpoint - Pass Key Source Flag

**File:** `src/endpoints/rag.js`

**Required changes:**

```javascript
// Update embedSnippets cost calculation (line ~376):
const totalCost = calculateCost(
    embeddingModel, 
    totalTokens, 
    0,  // Embeddings have 0 output tokens
    null,  // fixedCost
    embeddingSelection.provider.source === 'user'  // NEW: pass key source
);

// Update queryKnowledgeBase cost calculation (line ~704):
const totalCost = calculateCost(
    'text-embedding-3-small', 
    result.tokens || 0, 
    0,
    null,  // fixedCost
    providerPool.some(p => p.source === 'user')  // NEW: check if any user providers
);
```

---

#### 3.5. TTS Endpoint - Apply Surcharge

**File:** `src/endpoints/tts.js`

**Current implementation:**
```javascript
// Line ~29-69: Pricing calculation
const pricing = {
    openai: {
        'tts-1': 15,
        'tts-1-hd': 30,
    },
    google: {
        Neural2: 16,
        Wavenet: 16,
        Standard: 4,
    },
    groq: {
        playai: 0,  // Groq TTS via PlayAI is free
    },
    elevenlabs: {
        default: 0,  // Free tier
    },
};
```

**Required changes:**
```javascript
// Add surcharge calculation:
const cost = (charCount / 1000000) * costPerMillion;

// Apply surcharge if server-side key
if (provider && provider.isServerSideKey) {
    const surcharge = parseFloat(process.env.LLM_PROFIT_MARGIN || '25') / 100;
    const totalCost = cost * (1 + surcharge);
    console.log(`💰 TTS cost: $${cost.toFixed(6)} + ${surcharge * 100}% surcharge = $${totalCost.toFixed(6)}`);
    return totalCost;
}

console.log(`💰 TTS cost: $${cost.toFixed(6)} (user-provided key, no surcharge)`);
return cost;
```

---

#### 3.6. Image Generation Tools - Apply Surcharge

**Files:**
- `src/image-providers/openai.js`
- `src/image-providers/together.js`
- `src/image-providers/replicate.js`

**Pattern for each:**
```javascript
// In each provider's generateImage() function:
const baseCost = calculateCost(model, size, quality);

// Apply surcharge if server-side key
if (provider && provider.isServerSideKey) {
    const surcharge = parseFloat(process.env.LLM_PROFIT_MARGIN || '25') / 100;
    const totalCost = baseCost * (1 + surcharge);
    console.log(`💰 Image cost: $${baseCost.toFixed(6)} + ${surcharge * 100}% surcharge = $${totalCost.toFixed(6)}`);
    return totalCost;
}

return baseCost;
```

---

#### 3.7. Transcription (Whisper) - Apply Surcharge

**File:** `src/tools.js`

**Function:** `transcribeAudio()`

**Search for:** Cost calculations around line ~800-1000

**Required changes:**
```javascript
// After calculating Whisper API cost:
const baseCost = calculateWhisperCost(audioLength, model);

// Apply surcharge if server-side OpenAI key
if (openaiProvider && openaiProvider.isServerSideKey) {
    const surcharge = parseFloat(process.env.LLM_PROFIT_MARGIN || '25') / 100;
    const totalCost = baseCost * (1 + surcharge);
    console.log(`💰 Transcription cost: $${baseCost.toFixed(6)} + ${surcharge * 100}% surcharge = $${totalCost.toFixed(6)}`);
    return totalCost;
}

return baseCost;
```

---

#### 3.8. Provider Catalog - Update Pricing Data

**File:** `PROVIDER_CATALOG.json`

**Required changes:**

1. **Search for `groq-free` entries** → Change to `groq`
2. **Search for `gemini-free` entries** → Change to `gemini`
3. **Ensure all pricing uses paid tier rates**

**Example:**
```json
{
  "id": "llama-3.3-70b-versatile",
  "name": "LLaMA 3.3 70B Versatile",
  "provider": "groq",  // Changed from "groq-free"
  "context_window": 131072,
  "max_output_tokens": 32768,
  "pricing": {
    "input": 0.59,   // Paid tier pricing
    "output": 0.79
  },
  "capabilities": ["chat", "function_calling", "json_mode"],
  "recommended": true
}
```

---

### Phase 4: Documentation Updates ⏳ PENDING

#### 4.1. README.md

**Required changes:**
- Remove all mentions of "free tier"
- Add section explaining pricing model:
  - User keys: $0 cost
  - Server keys: LLM cost + 25% surcharge
  - All calculations use paid tier rates

#### 4.2. Help Pages (UI)

**Files:**
- Search for UI help/documentation pages
- Update pricing information
- Remove free tier language

**Example text:**
```
## Pricing

### Using Your Own API Keys
When you configure providers in settings with your own API keys, there is **no additional cost** to you. You pay only what your provider charges directly.

### Using Server-Side Providers
If you don't configure any providers, authenticated users with credits can use server-side providers. A **25% surcharge** is applied to cover infrastructure costs.

All pricing calculations use **paid tier rates** from each provider's published pricing, regardless of whether free tier API keys are used.
```

---

### Phase 5: Testing Plan ⏳ PENDING

#### Test Cases

**1. User-Provided Keys (Should be $0 cost):**
```bash
# Setup: Configure Groq provider in UI with user's API key
# Test: Send chat message
# Expected: Cost calculation shows $0.00 in logs
# Verify: Google Sheets log shows cost = 0
```

**2. Server-Side Keys (Should have 25% surcharge):**
```bash
# Setup: Use server-side provider (LP_TYPE_0=groq)
# Test: Send chat message
# Expected: Cost calculation shows base cost + 25% in logs
# Example: If base cost is $0.001, total should be $0.00125
# Verify: Google Sheets log shows surcharge applied
```

**3. Embedding Operations:**
```bash
# Test: Embed a SWAG snippet
# Verify: isUserProvidedKey flag passed correctly
# Check: Cost calculation in logs
```

**4. Image Generation:**
```bash
# Test: Generate image with Together AI
# Verify: Surcharge applied if server key
# Check: Cost in Google Sheets log
```

**5. TTS Operations:**
```bash
# Test: Text-to-speech with OpenAI
# Verify: Surcharge applied if server key
# Check: Cost calculation
```

**6. STT/Transcription:**
```bash
# Test: Upload audio file for transcription
# Verify: Whisper cost includes surcharge if server OpenAI key
# Check: Cost in logs
```

---

### Phase 6: Deployment ⏳ PENDING

#### Pre-Deployment Checklist

- [ ] All UI changes tested locally (`npm run dev`)
- [ ] All backend changes tested with `make dev`
- [ ] Environment variable `LLM_PROFIT_MARGIN=25` added to `.env`
- [ ] No references to `groq-free` or `gemini-free` in codebase (except backend compatibility)
- [ ] Documentation updated
- [ ] Test suite passes

#### Deployment Steps

```bash
# 1. Deploy environment variables
make deploy-env

# 2. Deploy backend (Lambda)
make deploy-lambda-fast

# 3. Build and deploy UI
make deploy-ui

# 4. Verify deployment
make logs

# 5. Test in production
# - Sign in
# - Clear existing providers in UI
# - Test with server-side providers
# - Check Google Sheets for cost calculations
```

---

## Risk Assessment

### High Risk
- **Breaking existing user configurations:** Users with `groq-free` or `gemini-free` providers configured
  - **Mitigation:** Backend should still accept these types and map to paid tier internally
  
### Medium Risk
- **Incorrect cost calculations:** Could overcharge or undercharge users
  - **Mitigation:** Extensive testing with both user and server keys

### Low Risk
- **UI migration:** Users need to reconfigure providers
  - **Mitigation:** Existing providers should still work, just not selectable for new configs

---

## Rollback Plan

If issues arise:

```bash
# 1. Revert Lambda deployment
git revert <commit-hash>
make deploy-lambda-fast

# 2. Revert UI deployment  
git revert <commit-hash>
make deploy-ui

# 3. Revert environment variables
# Restore from .env.backup.<timestamp>
make deploy-env
```

---

## Success Criteria

- [ ] No `groq-free` or `gemini-free` options in UI provider dropdown
- [ ] User-provided keys result in $0 cost (verified in Google Sheets logs)
- [ ] Server-side keys result in base cost × 1.25 (verified in logs)
- [ ] All LLM operations (chat, embed, image, TTS, STT) apply surcharge correctly
- [ ] Documentation reflects new pricing model
- [ ] No user complaints about unexpected charges
- [ ] Google Sheets logs show correct cost attribution

---

## Timeline Estimate

- **Phase 1 (Env Config):** ✅ Done
- **Phase 2 (UI):** 2-3 hours (partially done)
- **Phase 3 (Backend):** 6-8 hours (most complex)
- **Phase 4 (Docs):** 1-2 hours
- **Phase 5 (Testing):** 3-4 hours
- **Phase 6 (Deploy):** 1 hour

**Total:** ~13-18 hours

---

## Open Questions

1. **Backward compatibility:** Should backend still accept `groq-free` and `gemini-free` provider types?
   - **Answer:** YES - Map internally to paid tier for pricing
   
2. **Migration path:** Should we auto-migrate users' saved provider configs?
   - **Answer:** NO - Let them reconfigure, old configs will still work

3. **Communication:** Should users be notified about pricing changes?
   - **Answer:** Update help page and billing page

---

## Next Steps

**Immediate:**
1. Complete Phase 2 (UI cleanup)
2. Implement Phase 3.1-3.2 (core pricing logic)
3. Test locally with both user and server keys

**After local testing:**
4. Update documentation
5. Deploy to Lambda
6. Monitor logs for cost calculations
7. Verify Google Sheets logging

---

**Document Status:** Draft - Ready for Implementation  
**Last Updated:** October 25, 2025
