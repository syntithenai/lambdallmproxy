# Model Rotation Plan Updates - October 2025

## Summary of Changes

This document summarizes the updates made to the Model Rotation Implementation Plan to incorporate TogetherAI, generic provider support, enhanced Whisper strategy, and expanded model lists based on current provider documentation.

## Major Additions

### 1. TogetherAI Integration

**Why Added:**
- Competitive pricing (often cheaper than OpenAI)
- Higher rate limits (60 RPM / 60k TPM vs Groq's 30/30k)
- Excellent for research tasks with large context needs
- Strong code and vision model offerings

**Models Added:**
- **Research Pool:**
  - `meta-llama/Llama-3.3-70B-Instruct-Turbo` (Priority 1, $0.88/M tokens)
  - `deepseek-ai/DeepSeek-V3.1` (Priority 2, $0.60/M tokens)
  - `Qwen/Qwen2.5-72B-Instruct-Turbo` (Priority 6, $1.20/M tokens)

- **Code Pool:**
  - `Qwen/Qwen2.5-Coder-32B-Instruct` (Priority 1, $0.80/M tokens)

- **Vision Pool:**
  - `meta-llama/Llama-4-Scout-17B-16E-Instruct` (Priority 3, $0.18/M tokens)
  - `Qwen/Qwen2.5-VL-72B-Instruct` (Priority 4, $1.95/M tokens)

- **Fast Pool:**
  - `meta-llama/Llama-3.3-70B-Instruct-Turbo` (Priority 4, $0.88/M tokens)

**Configuration Required:**
- TogetherAI API key(s) in settings
- Rate limits: 60 RPM, 60,000 TPM (default)

### 2. Generic Provider Support

**Why Added:**
- Users may have access to custom OpenAI-compatible endpoints
- Support for local LLM deployments (Ollama, LM Studio, etc.)
- Enable use of niche providers not explicitly supported
- Future-proof for new providers

**Features:**
- Arbitrary number of generic endpoints can be configured
- Each endpoint includes:
  - Name/Label (user-friendly identifier)
  - Base URL (API endpoint)
  - API Key
  - Model ID
  - Task types (fast, research, code, vision)
  - Optional rate limits (learned from errors if not provided)
- Lowest priority (999) - used as fallback
- Full OpenAI API compatibility required

**Configuration Structure:**
```javascript
{
  id: 'custom-uuid',
  name: 'My Local Ollama',
  baseURL: 'http://localhost:11434/v1',
  apiKey: 'not-needed',
  models: [{
    modelId: 'llama3.2:latest',
    taskTypes: ['fast', 'code'],
    supportsTools: true,
    parallelTools: true,
    maxTPM: null, // Will learn from usage
    contextWindow: 8192
  }]
}
```

### 3. Enhanced Whisper Strategy

**Previous Approach:**
- Whisper provider tied to LLM provider preference
- No intelligent selection
- Single provider per session

**New Approach:**
1. **Prefer Groq** (if API key available)
   - Free tier (no cost)
   - 100MB file size limit (vs 25MB elsewhere)
   - Fast inference on GroqChip™
   - Models: whisper-large-v3, whisper-large-v3-turbo

2. **Round-Robin Distribution** (if Groq unavailable)
   - Rotate through: OpenAI → TogetherAI → Generic endpoints
   - Skip providers without keys or that are rate limited
   - Track usage per provider for even distribution
   - Reset to prefer Groq after cooldown period

3. **Provider-Specific Handling:**
   - Respect file size limits (100MB Groq, 25MB others)
   - Automatic retry with next provider on error
   - Transparent to user (happens automatically)

**Benefits:**
- Minimize costs (use free Groq when available)
- Maximize reliability (automatic failover)
- Even load distribution across paid providers
- Better user experience (rarely blocked by rate limits)

### 4. Groq Vision Models

**Previous State:**
- Only OpenAI GPT-4o and GPT-4o-mini for vision

**New Models Added:**
- `meta-llama/llama-4-scout-17b-16e-instruct`
  - Priority 1 (cheapest)
  - $0.18/M tokens (vs $2.50 for GPT-4o)
  - 131K context window
  - 5 images per request
  - 20MB per image URL
  - Tool support, JSON mode, multi-turn conversations

- `meta-llama/llama-4-maverick-17b-128e-instruct`
  - Priority 2
  - $0.27/M tokens
  - **1M context window!** (massive for vision tasks)
  - Same image capabilities as Scout
  - Better for complex multi-image reasoning

**Impact:**
- 93% cost reduction vs OpenAI for vision tasks
- Massive context enables processing many images at once
- Groq's speed advantage (tokens/second)
- Fallback to OpenAI still available

### 5. Updated Model Pools

All model pools refreshed with latest offerings as of October 2025:

**Fast Pool:**
- Added `llama-3.1-8b-instant` (Groq, $0.05/M - ultra cheap)
- Updated context windows (131K for Llama models)
- Added TogetherAI Llama 3.3 as fallback

**Research Pool:**
- TogetherAI models now priority 1-2 (better rate limits)
- Added DeepSeek-V3.1 (excellent reasoning)
- Groq and OpenAI as fallbacks
- 6 total options for high availability

**Code Pool:**
- Qwen2.5-Coder now priority 1 (specialized for code)
- OpenAI and Groq as fallbacks
- Better pricing than general models

**Vision Pool:**
- Groq Llama 4 models as priority 1-2 (cheapest)
- TogetherAI options for variety
- OpenAI as premium fallback
- 6 total providers for redundancy

## Configuration Changes

### Settings UI Updates

**New Sections:**
1. **TogetherAI API Keys**
   - Multi-key support (same as Groq/OpenAI)
   - Masked display (last 4 chars)
   - Validate button

2. **Generic Provider Endpoints**
   - List of configured providers
   - Add/Edit/Remove interface
   - Fields: Name, Base URL, API Key, Model ID
   - Optional: Task types, Rate limits
   - Test connection button

3. **Whisper Settings**
   - Info: "Groq preferred, then round-robin"
   - Checkboxes per provider
   - Shows next provider to be used

### Backend Configuration Files

**New/Updated Files:**
- `src/config/modelPools.js` - All 4 providers included
- `src/config/whisperModels.js` - Round-robin logic
- `src/config/genericProviders.js` - Template and loader
- `src/config/rateLimits.js` - TogetherAI limits added

## Implementation Tasks Updated

### TODO 1: Rate Limits Research
- Added TODO 1.3 for TogetherAI research
- Updated Whisper research to include all providers

### TODO 2: Model Pool Configuration
- Added TODO 2.3 for generic provider configuration
- Updated pool definitions to include TogetherAI
- Added vision-specific fields

### TODO 7: Whisper Tool
- Complete rewrite of selection logic
- Added TODO 7.4 for provider status tracking
- Round-robin implementation

### TODO 8: Settings UI
- Added TogetherAI key management
- Added generic provider form
- Updated Whisper UI with round-robin info

### TODO 9: Testing
- Added tests for TogetherAI integration
- Added tests for generic provider loading
- Added tests for Whisper round-robin

## Migration Impact

### Backward Compatibility
- ✅ Existing Groq/OpenAI keys continue to work
- ✅ No breaking changes to existing API
- ✅ Default behavior same as before (if no new keys added)
- ✅ Gradual adoption - users can add providers incrementally

### Performance Improvements
- **Faster failover**: More providers = higher success rate
- **Lower costs**: Intelligent selection of cheapest model
- **Better reliability**: Whisper rarely fails (4+ providers)
- **Vision cost savings**: 93% reduction using Groq

### User Experience
- **Transparent**: Most changes happen automatically
- **Configurable**: Power users can add custom endpoints
- **Informative**: UI shows which providers are active
- **Flexible**: Can disable providers without removing keys

## Testing Strategy

### New Test Categories

1. **TogetherAI Integration Tests**
   - Model selection from TogetherAI pool
   - API client functionality
   - Rate limit handling
   - Error message parsing

2. **Generic Provider Tests**
   - Configuration loading
   - URL validation
   - Custom model selection
   - Rate limit learning

3. **Whisper Round-Robin Tests**
   - Groq preference respected
   - Round-robin rotation works
   - Provider skipping (no key/rate limited)
   - Reset to Groq after cooldown

4. **Vision Model Tests**
   - Groq Llama 4 Scout selection
   - Image processing
   - Multi-image handling
   - Fallback to OpenAI

### Test Coverage Goals
- 80%+ code coverage for new features
- 100% coverage for critical paths (rotation, failover)
- Integration tests for each provider
- End-to-end tests for typical user flows

## Documentation Updates Needed

### User Documentation
- [ ] Update README with TogetherAI setup
- [ ] Add generic provider configuration guide
- [ ] Update Whisper documentation
- [ ] Add vision model examples

### Developer Documentation
- [ ] API documentation for generic providers
- [ ] Model pool configuration reference
- [ ] Rate limit sources and update procedure
- [ ] Whisper round-robin algorithm explanation

### Configuration Reference
- [ ] Complete model pool reference
- [ ] Provider comparison table
- [ ] Cost analysis by task type
- [ ] Rate limit reference table

## Risk Assessment

### Low Risk
- ✅ TogetherAI integration (similar to existing providers)
- ✅ Whisper round-robin (isolated feature)
- ✅ Vision model additions (similar to existing)

### Medium Risk
- ⚠️ Generic provider support (unknown endpoints)
- ⚠️ Rate limit learning (complex logic)
- ⚠️ Multi-provider coordination (more moving parts)

### Mitigation Strategies
- Extensive testing with mock providers
- Graceful degradation if provider unavailable
- Detailed logging for debugging
- User feedback mechanisms
- Staged rollout (internal → beta → production)

## Success Metrics

### Performance Metrics
- **Failover Speed**: <2s to switch providers
- **Success Rate**: >95% requests succeed first try
- **Cost Reduction**: 30-50% vs current (using cheaper models)
- **Whisper Availability**: >99% (with round-robin)

### User Metrics
- **Configuration Time**: <5min to add new provider
- **Support Tickets**: <5% related to provider issues
- **User Satisfaction**: >4.5/5 for model selection
- **Feature Adoption**: >50% users add TogetherAI key

## Timeline

### Phase 1: Foundation (Week 1)
- Rate limits research (all providers)
- Configuration file structure
- Generic provider template

### Phase 2: Backend (Weeks 2-3)
- TogetherAI API client
- Generic provider loader
- Whisper round-robin logic
- Updated model pools

### Phase 3: UI (Week 4)
- Settings UI for all providers
- Generic provider form
- Whisper configuration
- Status dashboard

### Phase 4: Testing (Weeks 5-6)
- Unit tests (all new features)
- Integration tests (provider interactions)
- End-to-end tests (user flows)
- Performance testing

### Phase 5: Documentation & Rollout (Week 7)
- User documentation
- Developer documentation
- Beta testing
- Production deployment

## Conclusion

These updates significantly expand the system's capabilities while maintaining backward compatibility and improving reliability. The addition of TogetherAI provides cost-effective research capabilities, generic provider support enables custom deployments, and the enhanced Whisper strategy maximizes availability while minimizing costs.

The updated model pools leverage the latest offerings from all providers, with particular emphasis on Groq's vision models for cost savings and TogetherAI's research models for better rate limits.

All changes are designed to be transparent to users while providing power users with extensive configuration options. The implementation plan has been updated to reflect these additions with minimal impact to the original timeline.
