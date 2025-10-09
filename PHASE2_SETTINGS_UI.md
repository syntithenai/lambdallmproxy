# Phase 2: Settings UI Redesign

## Objective
Transform the settings interface to support multiple provider configurations with a simplified, credential-focused approach. Remove model selection entirely and let the backend intelligently choose models based on PROVIDER_CATALOG.json.

## Key Design Principles

1. **Credentials Only**: Settings UI only manages API keys and endpoints
2. **No Model Selection**: Backend uses PROVIDER_CATALOG.json to select optimal models
3. **Multiple Providers**: Support unlimited provider instances
4. **Free Tier Priority**: Automatically prefer free tier providers when available
5. **Simple Provider Types**: Clear provider type dropdown with prefilled endpoints

## Current State Analysis

### Existing Settings Schema (TO BE REMOVED)
```typescript
interface Settings {
  provider: Provider; // 'groq' | 'openai'
  llmApiKey: string;
  tavilyApiKey: string;
  apiEndpoint: string;
  smallModel?: string;   // REMOVE - backend decides
  largeModel?: string;   // REMOVE - backend decides
  reasoningModel?: string; // REMOVE - backend decides
}
```

### Current UI Issues
1. **Model Selection Exposed**: User shouldn't choose models - backend knows best
2. **Single Provider Limitation**: Can only configure one provider at a time
3. **Provider Keys Hardcoded**: Only Groq and OpenAI supported
4. **No Provider Pooling**: Can't leverage multiple free tiers simultaneously

## New Settings Schema (SIMPLIFIED)

```typescript
interface ProviderConfig {
  id: string; // Unique ID for this provider instance (UUID)
  type: ProviderType; // Provider type - determines endpoint and behavior
  apiEndpoint: string; // Auto-filled and NOT EDITABLE except for openai-compatible
  apiKey: string; // User's API key for this provider
  modelName?: string; // ONLY for openai-compatible - preserved through to upstream
  rateLimitTPM?: string; // ONLY for openai-compatible - where there is no collected provider values, limit rate to explicit value or if empty, don't rate limit and rely on errors.
}

type ProviderType = 
  | 'groq-free'           // Groq free tier - endpoint: https://api.groq.com/openai/v1
  | 'groq'                // Groq paid tier - endpoint: https://api.groq.com/openai/v1
  | 'openai'              // OpenAI - endpoint: https://api.openai.com/v1
  | 'gemini-free'         // Gemini free tier - endpoint: https://generativelanguage.googleapis.com/v1beta
  | 'gemini'              // Gemini paid tier - endpoint: https://generativelanguage.googleapis.com/v1beta
  | 'together'            // Together AI - endpoint: https://api.together.xyz/v1
  | 'openai-compatible';  // Custom endpoint - user specifies endpoint AND modelName

interface Settings {
  version: '2.0.0';
  providers: ProviderConfig[]; // Array of configured providers (unlimited)
  tavilyApiKey: string; // Unchanged - for search functionality
}
```

### Key Simplifications
1. **No freeTier boolean**: Provider type encodes this (groq-free vs groq)
2. **No tokenLimits**: Backend gets this from PROVIDER_CATALOG.json
3. **No enabled flag**: Just delete disabled providers
4. **No priority field**: Backend auto-prioritizes (free tiers first)
5. **No modelSuggestions**: Backend decides based on request context
6. **No autoRetry/maxRetries**: Backend handles this automatically

## UI Components Redesign

### 1. Provider List Component
**New File**: `ui-new/src/components/ProviderList.tsx`

```
┌─────────────────────────────────────────────┐
│ Configured Providers                 [+ Add]│
├─────────────────────────────────────────────┤
│ 🆓 Groq Free Tier                           │
│    Endpoint: api.groq.com/openai/v1         │
│    API Key: gsk_•••••••••••••••             │
│    [Edit] [Delete]                          │
├─────────────────────────────────────────────┤
│ 🆓 Google Gemini Free                       │
│    Endpoint: generativelanguage.googleapis...│
│    API Key: AIza•••••••••••••••             │
│    [Edit] [Delete]                          │
├─────────────────────────────────────────────┤
│ � OpenAI                                   │
│    Endpoint: api.openai.com/v1              │
│    API Key: sk-•••••••••••••••              │
│    [Edit] [Delete]                          │
├─────────────────────────────────────────────┤
│ 🔌 Together AI                              │
│    Endpoint: api.together.xyz/v1            │
│    API Key: •••••••••••••••                 │
│    [Edit] [Delete]                          │
├─────────────────────────────────────────────┤
│ ⚙️ Custom (llama-3.1-70b)                   │
│    Endpoint: api.custom.com/v1              │
│    Model: llama-3.1-70b-instruct            │
│    API Key: •••••••••••••••                 │
│    [Edit] [Delete]                          │
└─────────────────────────────────────────────┘

ℹ️ Note: The backend prioritizes free tier providers first.
   Paid providers are used when rate limits are exceeded.
```

Features:
- 🆓 icon for free tier providers
- 💰 icon for paid providers  
- 🔌 icon for Together AI
- ⚙️ icon for custom/OpenAI-compatible providers
- Masked API keys for security
- Simple Edit/Delete actions only

### 2. Provider Form Component
**New File**: `ui-new/src/components/ProviderForm.tsx`

```
┌─────────────────────────────────────────────┐
│ Add Provider                                 │
├─────────────────────────────────────────────┤
│ Provider Type: [Select provider type... ▼]  │
│   Options:                                   │
│   • Groq (Free Tier) 🆓                     │
│   • Groq (Paid)                              │
│   • OpenAI 💰                                │
│   • Google Gemini (Free Tier) 🆓            │
│   • Google Gemini (Paid) 💰                 │
│   • Together AI 🔌                          │
│   • OpenAI Compatible (Custom) ⚙️           │
│                                              │
│ API Endpoint:                                │
│ [https://api.groq.com/openai/v1        ]    │
│ ⓘ Auto-filled, not editable                 │
│                                              │
│ API Key: [                             ]    │
│ ⓘ Your API key for this provider            │
│                                              │
│ [Cancel] [Save Provider]                    │
└─────────────────────────────────────────────┘
```

**When "OpenAI Compatible" is selected:**
```
┌─────────────────────────────────────────────┐
│ Add Provider                                 │
├─────────────────────────────────────────────┤
│ Provider Type: [OpenAI Compatible ▼]        │
│                                              │
│ API Endpoint: ✏️                            │
│ [https://                              ]    │
│ ⓘ EDITABLE - Enter custom endpoint          │
│                                              │
│ Model Name: ✏️                              │
│ [llama-3.1-70b-instruct                ]    │
│ ⓘ REQUIRED - Exact model name for API       │
│                                              │
│ API Key: [                             ]    │
│                                              │
│ [Cancel] [Save Provider]                    │
└─────────────────────────────────────────────┘
```

Features:
- API endpoint auto-filled for known providers (NOT editable)
- API endpoint EDITABLE only for "OpenAI Compatible"
- Model name field ONLY appears for "OpenAI Compatible"
- No priority, limits, or free tier checkboxes
- Minimal, credential-focused interface

### 3. Settings Page Layout

```
┌─────────────────────────────────────────────┐
│ Settings                               [×]   │
├─────────────────────────────────────────────┤
│                                              │
│ ⚡ Provider Credentials                     │
│ ─────────────────────────────────────────── │
│                                              │
│ [Provider List Component - see above]       │
│                                              │
│ ─────────────────────────────────────────── │
│                                              │
│ ℹ️ How Provider Selection Works:            │
│                                              │
│ • Free tier providers (🆓) are used first   │
│ • Paid providers (💰) are used when free    │
│   tier rate limits are exceeded             │
│ • The backend automatically selects the     │
│   best model for each request               │
│ • No need to configure rate limits or       │
│   priorities - it's all automatic!          │
│                                              │
│ ─────────────────────────────────────────── │
│                                              │
│ 🔍 Search API                                │
│ ─────────────────────────────────────────── │
│                                              │
│ Tavily API Key:                              │
│ [tvly-•••••••••••••••                  ]    │
│                                              │
│ ─────────────────────────────────────────── │
│                                              │
│                           [Save] [Cancel]    │
└─────────────────────────────────────────────┘
```

### Removed Sections
- ❌ Model selection dropdowns (small/large/reasoning)
- ❌ Provider selection radio buttons
- ❌ Token limit configuration
- ❌ Priority settings
- ❌ Model preference toggles
- ❌ Auto-retry settings

All of these are now handled automatically by the backend using PROVIDER_CATALOG.json!

## Implementation Files

### Files to Create
1. `ui-new/src/components/ProviderList.tsx` - Provider management list (simplified)
2. `ui-new/src/components/ProviderForm.tsx` - Add/edit provider form (credentials only)
3. `ui-new/src/types/provider.ts` - TypeScript type definitions (simplified schema)
4. `ui-new/src/hooks/useProviders.ts` - Provider CRUD operations
5. `ui-new/src/utils/providerValidation.ts` - API key format validation

### Files to Modify
1. `ui-new/src/components/SettingsModal.tsx`
   - **REMOVE**: Model selection dropdowns (small/large/reasoning)
   - **REMOVE**: Provider selection (single provider)
   - **REMOVE**: Manual endpoint entry
   - **ADD**: ProviderList component
   - **ADD**: Info text about free tier priority
   - Update to new settings schema

2. `ui-new/src/contexts/SettingsContext.tsx`
   - **REMOVE**: `smallModel`, `largeModel`, `reasoningModel` fields
   - **REMOVE**: `provider` field (single provider)
   - **REMOVE**: `apiEndpoint` field (now per-provider)
   - **ADD**: `providers` array field
   - Update Settings interface to v2.0.0
   - Implement settings migration from v1 to v2

3. `ui-new/src/components/ChatTab.tsx`
   - **REMOVE**: Model selection from UI
   - **UPDATE**: Send `providers` array instead of single provider/key
   - Backend will choose optimal model automatically

## Settings Migration Strategy

### Version 1.0.0 → 2.0.0 Migration

```typescript
// Endpoint mapping based on provider type
const PROVIDER_ENDPOINTS = {
  'groq': 'https://api.groq.com/openai/v1',
  'groq-free': 'https://api.groq.com/openai/v1',
  'openai': 'https://api.openai.com/v1',
  'gemini': 'https://generativelanguage.googleapis.com/v1beta',
  'gemini-free': 'https://generativelanguage.googleapis.com/v1beta',
  'together': 'https://api.together.xyz/v1',
};

function migrateSettings(oldSettings: any): Settings {
  // If already v2, return as-is
  if (oldSettings.version === '2.0.0') {
    return oldSettings;
  }

  // Migrate from v1 single provider to v2 multi-provider
  const migratedProviders: ProviderConfig[] = [];

  if (oldSettings.provider && oldSettings.llmApiKey) {
    // Determine provider type - assume Groq was free tier
    const providerType = oldSettings.provider === 'groq' ? 'groq-free' : oldSettings.provider;
    
    migratedProviders.push({
      id: crypto.randomUUID(),
      type: providerType,
      apiEndpoint: PROVIDER_ENDPOINTS[providerType],
      apiKey: oldSettings.llmApiKey
    });
  }

  return {
    version: '2.0.0',
    providers: migratedProviders,
    tavilyApiKey: oldSettings.tavilyApiKey || ''
  };
}
```

### Migration Notes
- Old `provider` field maps to new `type` field
- Old `apiEndpoint` is discarded (now auto-filled)
- Old model selections (`smallModel`, `largeModel`, `reasoningModel`) are discarded
- Groq is migrated as `groq-free` by default
- OpenAI remains as `openai`

## Request Format Changes

### Old Request Format (from UI to Lambda)
```json
{
  "model": "llama-3.1-8b-instant",
  "provider": "groq",
  "apiKey": "gsk_...",
  "messages": [...],
  "stream": true
}
```

### New Request Format
```json
{
  "providers": [
    {
      "id": "uuid-1",
      "type": "groq-free",
      "apiEndpoint": "https://api.groq.com/openai/v1",
      "apiKey": "gsk_..."
    },
    {
      "id": "uuid-2",
      "type": "gemini-free",
      "apiEndpoint": "https://generativelanguage.googleapis.com/v1beta",
      "apiKey": "AIza..."
    },
    {
      "id": "uuid-3",
      "type": "openai-compatible",
      "apiEndpoint": "https://api.custom.com/v1",
      "apiKey": "custom_key_...",
      "modelName": "llama-3.1-70b-instruct"
    }
  ],
  "messages": [...],
  "stream": true
}
```

### Key Changes
- **No `model` field**: Backend selects model from PROVIDER_CATALOG.json
- **No `requestType` field**: Backend infers from context (message length, tools, etc.)
- **`providers` array**: Send all configured providers to backend
- **`modelName` for openai-compatible only**: Backend preserves this through to upstream API
- Backend uses PROVIDER_CATALOG.json to:
  - Choose optimal model (small/large/reasoning)
  - Prioritize free tier providers
  - Track rate limits per provider
  - Failover to paid providers when needed

## Backend Requirements

### Lambda Handler Changes Required

1. **Accept providers array**: Parse `providers` array from request body
2. **Provider selection logic**:
   - Filter enabled providers
   - Prioritize by type: free tier (`groq-free`, `gemini-free`) before paid
   - Use PROVIDER_CATALOG.json to look up available models per provider
   - Choose model based on request context (simple chat vs tool use vs reasoning)
3. **Rate limit tracking**: Track usage per provider ID
4. **Failover logic**: If rate limited on one provider, try next in priority order
5. **OpenAI-compatible handling**: For `type: 'openai-compatible'`, preserve `modelName` field through to upstream API request

### Model Selection Algorithm (Backend)
```
For each request:
1. Analyze request context:
   - Does it use tools? → Requires model with supportsTools: true
   - Does it have images? → Requires model with supportsVision: true
   - Is conversation long? → Prefer large context window
   - Is it complex reasoning? → Prefer reasoning category models

2. Get available providers (prioritize free tier)
3. For each provider:
   - Check PROVIDER_CATALOG.json for compatible models
   - Check rate limits (from catalog + runtime tracking)
   - Select best available model matching requirements

4. Make request to selected provider/model
5. If rate limited → try next provider
6. If all providers exhausted → return 429 error
```

### OpenAI-Compatible Provider Handling

**CRITICAL**: For `openai-compatible` providers, the backend MUST:
1. Use the `modelName` field from the provider config
2. Pass it directly to the upstream API in the `model` field
3. NOT attempt to look up the model in PROVIDER_CATALOG.json
4. Still apply rate limiting and failover logic

Example request to upstream API:
```json
POST https://api.custom.com/v1/chat/completions
{
  "model": "llama-3.1-70b-instruct",  // FROM modelName field
  "messages": [...],
  "stream": true
}
```

## Validation Requirements

### Frontend Validation
- **API Key Format** (per provider type):
  - Groq: `gsk_[a-zA-Z0-9]{32,}`
  - OpenAI: `sk-[a-zA-Z0-9_-]{20,}`
  - Gemini: `AIza[a-zA-Z0-9_-]{35}`
  - Together: `[a-zA-Z0-9_-]{32,}`
  - OpenAI-compatible: Any non-empty string
 
- **Endpoint Validation** (for openai-compatible only):
  - Must be valid HTTPS URL
  - Must start with `https://`
  - No validation of actual endpoint (user responsibility)

- **Model Name Validation** (for openai-compatible only):
  - Required field
  - Must be non-empty string
  - No format validation (depends on provider)

### Backend Validation
- **Security**:
  - Sanitize all provider fields (XSS prevention)
  - Validate API keys are strings
  - Validate endpoints are valid URLs
  - Reject if modelName missing for openai-compatible type
  
- **Rate Limiting**:
  - Track per provider ID (not per user)
  - Use limits from PROVIDER_CATALOG.json
  - Maintain rate limit state in memory/Redis

## Testing Requirements

### Unit Tests
1. **Settings Migration**
   - Migrate v1.0.0 → v2.0.0 (single provider → multi-provider)
   - Handle missing fields gracefully
   - Preserve Tavily API key

2. **Provider CRUD**
   - Add new provider
   - Edit existing provider
   - Delete provider
   - Validate duplicate prevention

3. **Validation Functions**
   - API key format validation per provider type
   - Endpoint validation for openai-compatible
   - Model name required for openai-compatible

### Integration Tests
1. **UI Flow**
   - Add multiple providers through UI
   - Edit provider credentials
   - Delete provider
   - Settings persistence in localStorage

2. **Backend Integration**
   - Send providers array to Lambda
   - Backend selects correct model
   - OpenAI-compatible modelName preserved
   - Failover to next provider on rate limit

### E2E Tests
1. **Complete Flow**
   - Configure Groq free tier → successful request
   - Configure Gemini free tier → successful request
   - Configure OpenAI → successful request
   - Configure custom provider with modelName → successful request

2. **Failover Scenario**
   - Exceed Groq free tier limit → automatically uses next provider
   - All free tiers exhausted → uses paid provider
   - All providers exhausted → returns 429 error

3. **OpenAI-Compatible Flow**
   - Add custom provider with endpoint + modelName
   - Verify modelName passed to upstream API
   - Verify request succeeds with custom endpoint

## Implementation Checklist

### Frontend (UI)
- [ ] Create TypeScript type definitions (simplified schema)
- [ ] Implement ProviderList component
- [ ] Implement ProviderForm component (credentials only)
- [ ] Add provider validation utilities
- [ ] Update SettingsContext with new schema (v2.0.0)
- [ ] Implement settings migration (v1 → v2)
- [ ] Update SettingsModal:
  - [ ] Remove model selection dropdowns
  - [ ] Remove provider selection
  - [ ] Add ProviderList component
  - [ ] Add info text about free tier priority
- [ ] Update ChatTab:
  - [ ] Remove model selection UI
  - [ ] Send providers array instead of single provider
- [ ] Add unit tests for migration
- [ ] Add E2E tests for provider management

### Backend (Lambda)
- [ ] Accept providers array in request
- [ ] Implement provider priority logic (free tier first)
- [ ] Implement model selection algorithm using PROVIDER_CATALOG.json
- [ ] Implement rate limit tracking per provider ID
- [ ] Implement failover logic (try next provider on rate limit)
- [ ] Handle openai-compatible providers:
  - [ ] Preserve modelName field
  - [ ] Pass directly to upstream API
  - [ ] Don't look up in PROVIDER_CATALOG.json
- [ ] Add provider validation (security)
- [ ] Add unit tests for model selection
- [ ] Add integration tests for failover

### Documentation
- [ ] Update README with new provider setup instructions
- [ ] Document model selection algorithm
- [ ] Document rate limit behavior
- [ ] Document openai-compatible provider usage
- [ ] Add troubleshooting guide

## Summary of Key Changes

### What's REMOVED
- ❌ Model selection in UI (small/large/reasoning dropdowns)
- ❌ Single provider selection
- ❌ Manual endpoint entry (except openai-compatible)
- ❌ Provider priority configuration
- ❌ Rate limit configuration
- ❌ Free tier checkbox

### What's ADDED
- ✅ Multiple provider support (unlimited)
- ✅ Provider type dropdown (groq-free, groq, openai, gemini-free, gemini, together, openai-compatible)
- ✅ Auto-filled endpoints (not editable except openai-compatible)
- ✅ OpenAI-compatible provider type with modelName field
- ✅ Backend model selection using PROVIDER_CATALOG.json
- ✅ Automatic free tier prioritization
- ✅ Automatic failover on rate limits
- ✅ Info text explaining provider priority behavior

### Critical Backend Behavior
1. **Free tier providers used first** (groq-free, gemini-free)
2. **Paid providers used when rate limited** (groq, openai, gemini, together)
3. **Model selected by backend** based on request requirements + PROVIDER_CATALOG.json
4. **OpenAI-compatible modelName preserved** through to upstream API
5. **Rate limits tracked per provider** using PROVIDER_CATALOG.json data


