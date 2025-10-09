# Multi-Provider LLM Proxy Refactor - Overview

## Executive Summary

This document outlines a major architectural refactor to transform the Lambda LLM Proxy from a single-provider system to a multi-provider intelligent routing system with:
- Dynamic provider management
- Intelligent load balancing
- Rate limit tracking and avoidance
- Free tier preference
- Automatic failover on errors
- Token-aware model selection

## Current State Analysis

### Existing Architecture
- Single provider selection (Groq or OpenAI)
- Hardcoded model lists per provider
- No rate limit tracking
- No automatic failover
- Settings stored in browser localStorage
- Provider credentials in Lambda environment variables only

### Current Files Affected
- `ui-new/src/components/SettingsModal.tsx` - Provider/model selection UI
- `ui-new/src/contexts/SettingsContext.tsx` - Settings state management
- `src/index.js` - Lambda entry point
- `src/providers.js` - Provider integrations
- `src/model-selector.js` - Model selection logic
- `src/auth.js` - Authentication logic

## Refactor Phases

### Phase 1: Research & Data Collection
- Research provider APIs and model availability
- Document rate limits and pricing
- Create comprehensive provider/model JSON structure
- Identify OpenAI-compatible endpoints
- **Deliverable**: `PROVIDER_CATALOG.json` with all provider data

### Phase 2: Settings UI Redesign
- Remove hardcoded provider selection
- Add dynamic provider management (add/remove/edit)
- Implement provider type selection
- Add free tier configuration
- Update settings schema and persistence
- **Deliverable**: New settings UI components and schemas

### Phase 3: Authentication & Authorization Enhancement
- Enforce Google OAuth for all requests
- Implement email whitelist checking
- Merge user credentials with environment credentials
- Create credential pooling system
- **Deliverable**: Enhanced auth middleware and credential manager

### Phase 4: Provider Integration Layer
- Abstract provider interfaces
- Implement Gemini integration
- Implement Cohere integration
- Implement Mistral integration
- Support arbitrary OpenAI-compatible providers
- Standardize response handling
- **Deliverable**: Unified provider abstraction layer

### Phase 5: Intelligent Model Selection
- Implement model categorization (small/large/reasoning)
- Create request type detection (planning/chat/summarization)
- Build token estimation and cost calculation
- Implement rate limit state tracking
- Create model selection algorithm with free tier preference
- **Deliverable**: Smart model selector with state management

### Phase 6: Request Routing & Load Balancing
- Implement round-robin for free providers
- Add rate limit checking before requests
- Parse provider response headers for limits
- Update state after each request
- **Deliverable**: Load balancer and state tracker

### Phase 7: Retry & Failover Logic
- Detect 429 rate limit errors
- Implement automatic retry with different model
- Handle provider failures gracefully
- Add circuit breaker patterns
- **Deliverable**: Resilient request handler

### Phase 8: Whisper/Transcription Multi-Provider
- Extend multi-provider logic to Whisper
- Implement provider rotation for transcription
- Add failover for transcription errors
- **Deliverable**: Multi-provider transcription system

### Phase 9: Testing & Validation
- Unit tests for each component
- Integration tests for full flows
- Load testing for rate limit handling
- Failover scenario testing
- **Deliverable**: Comprehensive test suite

### Phase 10: Migration & Deployment
- Backward compatibility strategy
- Migration guide for existing users
- Phased rollout plan
- Monitoring and alerting setup
- **Deliverable**: Deployment runbook

## Risk Assessment

### High Risk Areas
1. **Breaking Changes**: Settings schema changes may break existing users
2. **State Management**: Rate limit tracking across Lambda invocations (cold starts)
3. **Authentication**: Enforcing Google OAuth may block existing API users
4. **Cost**: Using paid providers as fallback could increase costs unexpectedly

### Mitigation Strategies
1. Implement settings migration logic with versioning
2. Use DynamoDB or S3 for persistent rate limit state
3. Add API key fallback option for programmatic access
4. Add cost monitoring and alerts with configurable limits

## Success Criteria

- [ ] Support at least 5 provider types (Groq, OpenAI, Gemini, Cohere, Mistral)
- [ ] Free tier providers used 90%+ of the time
- [ ] Zero 429 errors reaching end users (automatic retry)
- [ ] Sub-100ms provider selection overhead
- [ ] 99.9% request success rate with failover
- [ ] Existing users can migrate without data loss
- [ ] Cost reduction of 50%+ through free tier usage

## Timeline Estimate

- Phase 1: 2-3 days (research intensive)
- Phase 2: 3-4 days (UI work)
- Phase 3: 2-3 days (auth changes)
- Phase 4: 4-5 days (multiple integrations)
- Phase 5: 3-4 days (complex logic)
- Phase 6: 2-3 days (state management)
- Phase 7: 2-3 days (error handling)
- Phase 8: 2 days (extend existing)
- Phase 9: 3-4 days (comprehensive testing)
- Phase 10: 2-3 days (deployment)

**Total: 25-34 days** (single developer, full-time)

## Next Steps

1. Review and approve this overview
2. Begin Phase 1: Research & Data Collection
3. Create detailed implementation plan for Phase 2
4. Set up tracking for progress and blockers
