# Together AI and Atlas Cloud Provider Research

**Date**: 2025-10-11  
**Status**: Research Complete - Ready for Integration

## Together AI Provider

### Overview
- **Provider Type**: `together`
- **API Key**: `tgp_v1_5yZxH3GMbdh8wpyvzuujFmsWVRiddNEfGZPROSgwCOw`
- **Status**: ✅ Configured in .env as Provider 3
- **Base URL**: `https://api.together.xyz`

### Pricing (per 1M tokens)

#### Recommended Models
| Model | Input Price | Output Price | Context | Precision |
|-------|------------|--------------|---------|-----------|
| meta-llama/Llama-3.3-70B-Instruct-Turbo | $0.88 | $0.88 | 131K | FP8 |
| meta-llama/Llama-3.3-70B-Instruct-Turbo-Free | $0.00 | $0.00 | 131K | FP8 (6 RPM free tier) |
| meta-llama/Llama-4-Scout-17B-16E-Instruct | $0.18 | $0.59 | 1048K | FP16 |
| meta-llama/Llama-4-Maverick-17B-128E-Instruct-FP8 | $0.27 | $0.85 | 1048K | FP8 |

#### Popular Models by Category

**Llama Models**
- Llama 4 Maverick: $0.27 / $0.85 (1048K context)
- Llama 4 Scout: $0.18 / $0.59 (1048K context)
- Llama 3.3 70B Turbo: $0.88 / $0.88 (131K context)
- Llama 3.1 405B Turbo: $3.50 / $3.50 (130K context)
- Llama 3.1 70B Turbo: $0.88 / $0.88 (131K context)
- Llama 3.1 8B Turbo: $0.18 / $0.18 (131K context)
- Llama 3.2 3B Turbo: $0.06 / $0.06 (131K context)

**DeepSeek Models**
- DeepSeek-R1: $3.00 / $7.00 (163K context)
- DeepSeek-R1 Throughput: $0.55 / $2.19 (163K context)
- DeepSeek-V3.1: $0.60 / $1.70 (163K context)
- DeepSeek-V3: $1.25 / $1.25 (163K context)
- DeepSeek R1 Distill Llama 70B: $2.00 / $2.00 (131K context)
- DeepSeek R1 Distill Qwen 14B: $0.18 / $0.18 (131K context)

**OpenAI Models**
- gpt-oss-120B: $0.15 / $0.60 (128K context)
- gpt-oss-20B: $0.05 / $0.20 (128K context)

**Qwen Models**
- Qwen3-Coder 480B A35B: $2.00 / $2.00 (256K context)
- Qwen3 235B A22B: $0.20 / $0.60 (262K context)
- Qwen3 235B A22B Thinking: $0.65 / $3.00 (262K context)
- Qwen 2.5 72B Turbo: $1.20 / $1.20 (32K context)
- Qwen2.5-VL 72B: $1.95 / $8.00 (32K context, vision)
- Qwen2.5 Coder 32B: $0.80 / $0.80 (32K context)
- Qwen2.5 7B Turbo: $0.30 / $0.30 (32K context)
- QwQ-32B: $1.20 / $1.20 (32K context)

**Kimi/Moonshot Models**
- Kimi K2 Instruct: $1.00 / $3.00 (262K context)
- Kimi K2 0905: $1.00 / $3.00 (262K context)

**Mistral Models**
- Mistral Small 3: $0.80 / $0.80 (32K context)
- Mixtral 8x7B: $0.60 / $0.60 (32K context)
- Mistral 7B v0.2: $0.20 / $0.20 (32K context)
- Mistral 7B v0.3: $0.20 / $0.20 (32K context)

**Other Notable Models**
- GLM-4.5-Air: $0.20 / $1.10 (131K context)
- Marin 8B Instruct: $0.18 / $0.18 (4K context)
- Gemma 3N E4B: $0.02 / $0.04 (32K context)

**Arcee AI Models**
- Arcee AI Maestro: $0.90 / $3.30 (128K context, reasoning)
- Arcee AI Virtuoso-Large: $0.75 / $1.20 (128K context)
- Arcee AI Coder-Large: $0.50 / $0.80 (32K context)
- Arcee AI AFM-4.5B: $0.10 / $0.40

**Cogito Models**
- Cogito v2 671B MoE: $1.25 / $1.25 (32K context)
- Cogito v2 405B: $3.50 / $3.50 (32K context)
- Cogito v2 109B MoE: $0.18 / $0.59 (32K context)
- Cogito v2 70B: $0.88 / $0.88 (32K context)

### Rate Limits (Tier-Based)

**Chat, Language & Code Models**
| Tier | Requirement | RPM | TPM |
|------|-------------|-----|-----|
| Tier 1 | $5 paid | 600 | 180,000 |
| Tier 2 | $50 paid | 1,800 | 250,000 |
| Tier 3 | $100 paid | 3,000 | 500,000 |
| Tier 4 | $250 paid | 4,500 | 1,000,000 |
| Tier 5 | $1,000 paid | 6,000 | 2,000,000 |

**Special Model Limits**
- **DeepSeek R1**: 
  - Tier 1: 3 RPM
  - Tier 2: 60 RPM
  - Tier 3-4: ~400+ RPM
  - Tier 5+: ~1200+ RPM
- **Llama 3.3 70B Free**: 6 RPM (free tier), 10 RPM (paid tiers)

**Embedding Models**
| Tier | RPM | TPM |
|------|-----|-----|
| Tier 1 | 3,000 | 2,000,000 |
| Tier 2 | 5,000 | 2,000,000 |
| Tier 3 | 5,000 | 10,000,000 |
| Tier 4 | 10,000 | 10,000,000 |
| Tier 5 | 10,000 | 20,000,000 |

**Image Models**
| Tier | Images/Min |
|------|------------|
| Tier 1 | 240 |
| Tier 2 | 480 |
| Tier 3 | 600 |
| Tier 4 | 960 |
| Tier 5 | 1200 |

### Model Recommendations by Use Case

1. **General Purpose / Chat**: Llama 3.3 70B Turbo ($0.88/$0.88)
2. **Free Tier**: Llama 3.3 70B Free ($0/$0, 6 RPM limit)
3. **Long Context (1M+ tokens)**: Llama 4 Scout/Maverick ($0.18-$0.85)
4. **Reasoning**: DeepSeek-R1 ($3/$7) or Qwen3 Thinking ($0.65/$3)
5. **Code Generation**: Qwen2.5 Coder 32B ($0.80/$0.80)
6. **Budget**: Llama 3.2 3B ($0.06/$0.06) or Gemma 3N ($0.02/$0.04)
7. **Large Scale**: Llama 3.1 405B ($3.50/$3.50)

---

## Atlas Cloud AI Provider

### Overview
- **Provider Type**: `atlascloud` (proposed)
- **API Key**: `apikey-6c6705cf55174eadaa924203b916ae84`
- **Status**: ⏳ Pending configuration as Provider 4
- **Base URL**: `https://api.atlascloud.ai`
- **OpenAI Compatible**: ✅ Yes (drop-in replacement)

### Key Features
- 200+ AI models from multiple providers
- OpenAI-compatible API
- 30% cheaper DeepSeek R1 than direct
- FLUX images from $0.02
- SOC I/II certified, HIPAA compliant
- 99.9% uptime SLA
- 70% lower cost vs AWS

### Supported Providers
- **OpenAI**: GPT series, DALL-E
- **Anthropic**: Claude models
- **Google**: Gemini, PaLM
- **DeepSeek**: R1, V3 series
- **Qwen**: Alibaba models
- **Moonshot**: Kimi models
- **MiniMax**: Multimedia models
- **ByteDance**: TikTok AI models
- **Black Forest Labs**: FLUX image models
- **Luma**: Video generation
- **Others**: 10+ additional providers

### Pricing
- **Billing**: Hourly token count, per-million-token pricing
- **Model List**: Available at https://www.atlascloud.ai/pricing
- **Discount**: Volume discounts available (contact sales)

**Notable Claims**:
- DeepSeek R1: 30% cheaper than direct API
- FLUX images: Starting from $0.02
- Competitive with Together AI pricing
- Lower than AWS costs (70% savings claimed)

### Rate Limits
- **Documentation**: Not publicly specified in detail
- **Developer Plans**: Tiered subscription plans with daily credit refreshes
- **Likely Similar to Industry**: Expect RPM/TPM limits by tier
- **Contact Required**: For specific limits, contact support@atlascloud.ai

### API Integration
- **Base URL**: `https://api.atlascloud.ai`
- **Format**: OpenAI-compatible (ChatCompletion API)
- **Authentication**: Bearer token (API key)
- **Streaming**: Supported
- **Modes**: Both streaming and non-streaming

### Model Categories
1. **LLM**: Text generation, conversation, reasoning
2. **TEXT-TO-IMAGE**: Image generation from text
3. **IMAGE-TO-IMAGE**: Image transformation
4. **IMAGE-TOOLS**: Image processing
5. **TEXT-TO-VIDEO**: Video from text
6. **IMAGE-TO-VIDEO**: Animate images
7. **VIDEO-TO-VIDEO**: Video transformation
8. **AUDIO-TO-VIDEO**: Synchronized audio+video

---

## Integration Plan

### Phase 1: Environment Configuration ✅
- [x] Add Together AI to .env (Provider 3)
- [x] Deploy Together AI environment variables
- [ ] Add Atlas Cloud to .env (Provider 4)
- [ ] Deploy Atlas Cloud environment variables

### Phase 2: Frontend Pricing (pricing.ts)
- [ ] Add Together AI models to MODEL_PRICING
  - Focus on popular models: Llama 3.3 70B, Llama 4 Scout, DeepSeek-R1
  - Include free tier model: Llama 3.3 70B Free
- [ ] Add Atlas Cloud models (use Together AI pricing as baseline)
  - Mark as "contact for pricing" or "competitive with market"

### Phase 3: Backend Integration
- [ ] Find provider configuration file (src/config/providers.js or similar)
- [ ] Add Together AI provider type mapping
- [ ] Add Atlas Cloud provider type mapping
- [ ] Configure API endpoints for both providers
- [ ] Add rate limiting configuration
  - Together AI: Tier-based (default to Tier 1: 600 RPM, 180K TPM)
  - Atlas Cloud: Conservative defaults (contact for specifics)

### Phase 4: Testing & Deployment
- [ ] Test Together AI integration locally
- [ ] Test Atlas Cloud integration locally
- [ ] Build and deploy UI changes
- [ ] Deploy backend changes (make deploy-lambda-fast)
- [ ] Verify both providers work in production

---

## Next Steps

1. **Add Atlas Cloud to .env** (Provider 4)
2. **Deploy environment variables** (`make deploy-env`)
3. **Update pricing.ts** with Together AI model pricing
4. **Find and update backend provider configuration**
5. **Test locally** with `make dev`
6. **Deploy to production**

## Notes

- **Together AI** has extensive public documentation with detailed pricing
- **Atlas Cloud** has less granular public pricing - may need to query API or contact support
- Both providers support OpenAI-compatible APIs for easy integration
- Rate limiting should be conservative initially to avoid account issues
- Free tier models (Llama 3.3 70B Free) have reduced rate limits (6 RPM)

## References

- Together AI Docs: https://docs.together.ai/
- Together AI Pricing: https://www.together.ai/pricing
- Together AI Rate Limits: https://docs.together.ai/docs/rate-limits
- Atlas Cloud Docs: https://www.atlascloud.ai/docs
- Atlas Cloud Pricing: https://www.atlascloud.ai/pricing
- Atlas Cloud Models: https://www.atlascloud.ai/models/list
