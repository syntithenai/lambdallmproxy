# Phase 2: Settings UI Redesign

## Objective
Transform the settings interface from single-provider selection to dynamic multi-provider management with support for arbitrary OpenAI-compatible providers.

## Current State Analysis

### Existing Settings Schema
```typescript
interface Settings {
  provider: Provider; // 'groq' | 'openai'
  llmApiKey: string;
  tavilyApiKey: string;
  apiEndpoint: string;
  smallModel?: string;
  largeModel?: string;
  reasoningModel?: string;
}
```

### Current UI Structure
- **File**: `ui-new/src/components/SettingsModal.tsx`
- **Lines**: 1-412
- **Features**:
  - Single provider dropdown (Groq/OpenAI)
  - Single API key field
  - Hardcoded model suggestions per provider
  - Auto-fills endpoint based on provider choice
  - Model selection (small/large/reasoning)

### Issues with Current Design
1. **Single Provider Limitation**: Can only configure one provider at a time
2. **No Free Tier Indicators**: Doesn't show which providers are free
3. **Static Model Lists**: Model suggestions are hardcoded, not dynamic
4. **No Provider Pooling**: Can't use multiple providers simultaneously
5. **Environment Variable Disconnect**: User credentials separate from Lambda env vars

## New Settings Schema

```typescript
interface ProviderConfig {
  id: string; // Unique ID for this provider instance
  name: string; // User-friendly name (e.g., "My Groq Account")
  type: ProviderType; // 'groq' | 'openai' | 'gemini' | 'openai-compatible'
  apiKey: string;
  endpoint?: string; // Required for openai-compatible type
  freeTier: boolean; // User indicates this is a free tier account
  tokenLimits?: {
    requestsPerMinute?: number;
    requestsPerDay?: number;
    tokensPerMinute?: number;
    tokensPerDay?: number;
  };
  enabled: boolean; // Can disable without deleting
  priority: number; // For ordering preference (lower = higher priority)
}

type ProviderType = 
  | 'groq' 
  | 'groq-free' 
  | 'openai' 
  | 'gemini' 
  | 'gemini-free';

interface Settings {
  providers: ProviderConfig[]; // Array of configured providers
  tavilyApiKey: string; // Unchanged
  modelSuggestions: {
    planning: 'reasoning' | 'large';
    chat: 'large' | 'small';
    summarization: 'small';
  };
  autoRetry: boolean; // Enable/disable automatic retry on rate limit
  maxRetries: number; // Max retry attempts (default: 3)
}
```

## UI Components Redesign

### 1. Provider List Component
**New File**: `ui-new/src/components/ProviderList.tsx`

```
┌─────────────────────────────────────────────┐
│ Configured Providers                 [+ Add]│
├─────────────────────────────────────────────┤
│ 🟢 My Groq Free Account                     │
│    Type: Groq Free Tier                     │
│    Limits: 7,000 req/min, 14,400 req/day    │
│    [Edit] [Disable] [Delete]                │
├─────────────────────────────────────────────┤
│ 🟢 Google Gemini Free                       │
│    Type: Gemini Free Tier                   │
│    Limits: 15 req/min, 1,500 req/day        │
│    [Edit] [Disable] [Delete]                │
├─────────────────────────────────────────────┤
│ 🔴 My OpenAI Account (Disabled)             │
│    Type: OpenAI Paid                        │
│    [Edit] [Enable] [Delete]                 │
└─────────────────────────────────────────────┘
```

Features:
- Toggle enabled/disabled state
- Visual indicators for free tier
- Quick edit without full form

### 2. Provider Form Component
**New File**: `ui-new/src/components/ProviderForm.tsx`

```
┌─────────────────────────────────────────────┐
│ Add Provider                                 │
├─────────────────────────────────────────────┤
│ Provider Name: [My Groq Account        ]    │
│                                              │
│ Provider Type: [Groq Free Tier ▼]           │
│   Options:                                   │
│   • Groq (Free Tier) 🆓                     │
│   • Groq (Paid)                              │
│   • OpenAI                                   │
│   • Google Gemini (Free Tier) 🆓            │
│   • Google Gemini (Paid)                     │
│   • OpenAI Compatible (Custom)               │
│                                              │
│ API Key: [sk-...                       ]    │
│                                              │
│ ☑ This is a free tier account               │
│                                              │
│ Token Limits (optional):                    │
│ ├─ Requests/minute: [7000             ]    │
│ ├─ Requests/day:    [14400            ]    │
│ ├─ Tokens/minute:   [30000            ]    │
│ └─ Tokens/day:      [leave empty      ]    │
│                                              │
│ Priority: [1] (lower = higher priority)     │
│                                              │
│ [Cancel] [Save Provider]                    │
└─────────────────────────────────────────────┘
```

Features:
- Auto-fill limits based on provider type selection
- Validation of API key format per provider
- Help text explaining each field
- Test connection button

### 3. OpenAI-Compatible Provider Sub-Form
When "OpenAI Compatible (Custom)" is selected:

```
┌─────────────────────────────────────────────┐
│ Custom Endpoint Configuration                │
├─────────────────────────────────────────────┤
│ API Endpoint:                                │
│ [https://api.together.xyz/v1           ]    │
│                                              │
│ Suggested Endpoints:                         │
│ • Together AI: https://api.together.xyz/v1   │
│ • Anyscale: https://api.endpoints.anyscale...│
│ • Perplexity: https://api.perplexity.ai      │
│ • DeepInfra: https://api.deepinfra.com/v1... │
│ • Fireworks: https://api.fireworks.ai/inf... │
│ • Custom: [Enter your own]                   │
│                                              │
│ Supports Streaming: ☑                       │
│ Supports Tools/Functions: ☑                 │
└─────────────────────────────────────────────┘
```

### 4. Model Suggestion Settings
Replace explicit model selection with request type preferences:

```
┌─────────────────────────────────────────────┐
│ Model Selection Preferences                  │
├─────────────────────────────────────────────┤
│ For Planning/Reasoning:                      │
│ ( ) Prefer Reasoning models                  │
│ (•) Prefer Large models                      │
│                                              │
│ For General Chat:                            │
│ (•) Prefer Large models                      │
│ ( ) Prefer Small models                      │
│                                              │
│ For Summarization:                           │
│ (•) Prefer Small models                      │
│ ( ) Prefer Large models                      │
│                                              │
│ ☑ Prefer free tier providers when available │
│ ☑ Auto-retry with different provider on fail│
│ Max Retries: [3]                             │
└─────────────────────────────────────────────┘
```

## Implementation Files

### Files to Create
1. `ui-new/src/components/ProviderList.tsx` - Provider management list
2. `ui-new/src/components/ProviderForm.tsx` - Add/edit provider form
3. `ui-new/src/components/ProviderCard.tsx` - Individual provider display
4. `ui-new/src/types/provider.ts` - TypeScript type definitions
5. `ui-new/src/hooks/useProviders.ts` - Provider CRUD operations
6. `ui-new/src/utils/providerValidation.ts` - API key validation

### Files to Modify
1. `ui-new/src/components/SettingsModal.tsx`
   - Replace single provider UI with ProviderList
   - Update to new settings schema
   - Add migration logic for existing settings

2. `ui-new/src/contexts/SettingsContext.tsx`
   - Update Settings interface
   - Add provider management methods
   - Implement settings versioning and migration

3. `ui-new/src/components/ChatTab.tsx`
   - Update to send providers array instead of single provider
   - Remove model selection from UI (let Lambda choose)
   - Send modelSuggestion instead of explicit model name

## Settings Migration Strategy

### Version 1.0.0 → 2.0.0 Migration

```typescript
function migrateSettings(oldSettings: any): Settings {
  // If already v2, return as-is
  if (oldSettings.version === '2.0.0') {
    return oldSettings;
  }

  // Migrate from v1 single provider to v2 multi-provider
  const migratedProviders: ProviderConfig[] = [];

  if (oldSettings.provider && oldSettings.llmApiKey) {
    migratedProviders.push({
      id: crypto.randomUUID(),
      name: `My ${oldSettings.provider.charAt(0).toUpperCase() + oldSettings.provider.slice(1)} Account`,
      type: oldSettings.provider,
      apiKey: oldSettings.llmApiKey,
      freeTier: oldSettings.provider === 'groq', // Assume Groq was free tier
      enabled: true,
      priority: 1,
      tokenLimits: oldSettings.provider === 'groq' ? {
        requestsPerMinute: 7000,
        requestsPerDay: 14400,
        tokensPerMinute: 30000
      } : undefined
    });
  }

  return {
    version: '2.0.0',
    providers: migratedProviders,
    tavilyApiKey: oldSettings.tavilyApiKey || '',
    modelSuggestions: {
      planning: 'reasoning',
      chat: 'large',
      summarization: 'small'
    },
    autoRetry: true,
    maxRetries: 3
  };
}
```

## Request Format Changes

### Old Request Format (from UI to Lambda)
```json
{
  "model": "llama-3.1-8b-instant",
  "messages": [...],
  "stream": true
}
```

### New Request Format
```json
{
  "requestType": "chat", // or "planning", "summarization"
  "providers": [
    {
      "id": "uuid-1",
      "type": "groq",
      "apiKey": "gsk_...",
      "freeTier": true,
      "tokenLimits": {...}
    },
    {
      "id": "uuid-2",
      "type": "gemini-free",
      "apiKey": "AIza...",
      "freeTier": true,
      "tokenLimits": {...}
    }
  ],
  "messages": [...],
  "stream": true
}
```

## Side Effects Analysis

### Potential Breaking Changes
1. **localStorage Schema Change**: Existing users will need migration
2. **Request Format**: Lambda must handle both old and new formats during transition
3. **Model Selection**: Users can't choose specific models anymore (pros/cons)

### UI/UX Impact
1. **More Complex Setup**: Users must configure multiple providers (good for power users, intimidating for beginners)
2. **No Visual Model Selection**: May confuse users who liked choosing specific models
3. **Free Tier Encouragement**: Good for cost savings, may reduce quality perception

### Backend Impact
1. **Request Validation**: Must validate provider configs from frontend
2. **Security**: Multiple API keys sent in each request (encryption important)
3. **Error Messages**: Need to specify which provider failed

## Validation Requirements

### Frontend Validation
- API key format per provider type:
  - Groq: `gsk_[a-zA-Z0-9]{32,}`
  - OpenAI: `sk-[a-zA-Z0-9]{48}`
  - Gemini: `AIza[a-zA-Z0-9_-]{35}`
 
- Endpoint validation for custom providers:
  - Must be valid HTTPS URL
  - Must respond to `/v1/models` endpoint
  - Should support streaming

### Backend Validation
- Verify provider configs aren't malicious
- Rate limit per-provider, not per-user
- Sanitize provider names (XSS prevention)

## Testing Requirements

### Unit Tests
- Settings migration from v1 to v2
- Provider CRUD operations
- Validation functions

### Integration Tests
- Add/edit/delete providers in UI
- Settings persistence across page reloads
- Migration with real legacy data

### E2E Tests
- Complete provider setup flow
- Request with multiple providers
- Failover scenario (one provider fails)

## Implementation Checklist

- [ ] Create TypeScript type definitions
- [ ] Implement ProviderList component
- [ ] Implement ProviderForm component
- [ ] Implement ProviderCard component
- [ ] Add provider validation utilities
- [ ] Update SettingsContext with new schema
- [ ] Implement settings migration logic
- [ ] Update SettingsModal to use new components
- [ ] Update ChatTab to send new request format
- [ ] Add unit tests for migration
- [ ] Add E2E tests for provider management
- [ ] Update documentation


