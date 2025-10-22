# Provider Research: Together AI & Atlas Cloud AI

**Date**: October 11, 2025  
**Purpose**: Document pricing, rate limits, and available models for integration

---

## Together AI

**Provider Type**: `together`  
**API Base**: `https://api.together.xyz`  
**API Key**: `tgp_v1_5yZxH3GMbdh8wpyvzuujFmsWVRiddNEfGZPROSgwCOw` (Provider 3)

### Rate Limits (Tier-Based)

Together AI uses a tiered rate limiting system based on spending:

| Tier | Requirement | RPM (Requests/Min) | TPM (Tokens/Min) |
|------|------------|-------------------|------------------|
| **Tier 1** | Credit card + $5 paid | 600 | 180,000 |
| **Tier 2** | $50 paid | 1,800 | 250,000 |
| **Tier 3** | $100 paid | 3,000 | 500,000 |
| **Tier 4** | $250 paid | 4,500 | 1,000,000 |
| **Tier 5** | $1,000 paid | 6,000 | 2,000,000 |

**Special Rate Limits**:
- DeepSeek-R1: 3 RPM (Tier 1), 60 RPM (Tier 2), 400+ RPM (Tier 3-4), 1200+ RPM (Tier 5+)
- FLUX.1 Schnell Free: 6 img/min
- Free Llama 3.3 70B: 6 RPM (free tier), 10 RPM (paid tiers)

### Chat Models (Pricing per 1M tokens)

| Model Name | Input | Output | Context | Precision |
|------------|-------|--------|---------|-----------|
| **Meta Llama** |
| meta-llama/Llama-4-Maverick-17B-128E-Instruct-FP8 | $0.27 | $0.85 | 1,048,576 | FP8 |
| meta-llama/Llama-4-Scout-17B-16E-Instruct | $0.18 | $0.59 | 1,048,576 | FP16 |
| meta-llama/Llama-3.3-70B-Instruct-Turbo | $0.88 | $0.88 | 131,072 | FP8 |
| meta-llama/Llama-3.3-70B-Instruct-Turbo-Free | $0.00 | $0.00 | 131,072 | FP8 (6 RPM limit) |
| meta-llama/Meta-Llama-3.1-405B-Instruct-Turbo | $3.50 | $3.50 | 130,815 | FP8 |
| meta-llama/Meta-Llama-3.1-70B-Instruct-Turbo | $0.88 | $0.88 | 131,072 | FP8 |
| meta-llama/Meta-Llama-3.1-8B-Instruct-Turbo | $0.18 | $0.18 | 131,072 | FP8 |
| meta-llama/Llama-3.2-3B-Instruct-Turbo | $0.06 | $0.06 | 131,072 | FP16 |
| meta-llama/Meta-Llama-3-8B-Instruct-Lite | $0.10 | $0.10 | 8,192 | INT4 |
| **DeepSeek** |
| deepseek-ai/DeepSeek-V3.1 | $0.60 | $1.70 | 128,000 | FP8 |
| deepseek-ai/DeepSeek-V3 | $1.25 | $1.25 | 163,839 | FP8 |
| deepseek-ai/DeepSeek-R1 | $3.00 | $7.00 | 163,839 | FP8 |
| deepseek-ai/DeepSeek-R1-0528-tput | $0.55 | $2.19 | 163,839 | FP8 |
| deepseek-ai/DeepSeek-R1-Distill-Llama-70B | $2.00 | $2.00 | 131,072 | FP16 |
| deepseek-ai/DeepSeek-R1-Distill-Qwen-14B | $0.18 | $0.18 | 131,072 | FP16 |
| **OpenAI** |
| openai/gpt-oss-120b | $0.15 | $0.60 | 128,000 | MXFP4 |
| openai/gpt-oss-20b | $0.05 | $0.20 | 128,000 | MXFP4 |
| **Qwen** |
| Qwen/Qwen3-Coder-480B-A35B-Instruct-FP8 | $2.00 | $2.00 | 256,000 | FP8 |
| Qwen/Qwen3-235B-A22B-Instruct-2507-tput | $0.20 | $0.60 | 262,144 | FP8 |
| Qwen/Qwen3-235B-A22B-Thinking-2507 | $0.65 | $3.00 | 262,144 | FP8 |
| Qwen/Qwen3-Next-80B-A3B-Instruct | $0.20 | $0.60 | 262,144 | BF16 |
| Qwen/Qwen3-Next-80B-A3B-Thinking | $0.65 | $3.00 | 262,144 | BF16 |
| Qwen/Qwen2.5-72B-Instruct-Turbo | $1.20 | $1.20 | 32,768 | FP8 |
| Qwen/Qwen2.5-VL-72B-Instruct | $1.95 | $8.00 | 32,768 | FP8 |
| Qwen/Qwen2.5-7B-Instruct-Turbo | $0.30 | $0.30 | 32,768 | FP8 |
| Qwen/Qwen2.5-Coder-32B-Instruct | $0.80 | $0.80 | 32,768 | FP16 |
| Qwen/QwQ-32B | $1.20 | $1.20 | 32,768 | FP16 |
| **Moonshot (Kimi)** |
| moonshotai/Kimi-K2-Instruct-0905 | $1.00 | $3.00 | 262,144 | FP8 |
| moonshotai/Kimi-K2-Instruct | $1.00 | $3.00 | 128,000 | FP8 |
| **Mistral** |
| mistralai/Magistral-Small-2506 | $0.80 | $0.80 | 40,960 | BF16 |
| mistralai/Mistral-Small-24B-Instruct-2501 | $0.80 | $0.80 | 32,768 | FP16 |
| mistralai/Mistral-7B-Instruct-v0.3 | $0.20 | $0.20 | 32,768 | FP16 |
| mistralai/Mistral-7B-Instruct-v0.2 | $0.20 | $0.20 | 32,768 | FP16 |
| mistralai/Mixtral-8x7B-v0.1 | $0.60 | $0.60 | 32,768 | - |
| **GLM (Zai)** |
| zai-org/GLM-4.5-Air-FP8 | $0.20 | $1.10 | 131,072 | FP8 |
| **Google** |
| google/gemma-3n-E4B-it | $0.02 | $0.04 | 32,768 | FP8 |
| google/gemma-2b-it | $0.20 | $0.20 | 8,192 | FP16 |
| **Arcee AI** |
| arcee-ai/virtuoso-medium-v2 | $0.50 | $0.80 | 128,000 | - |
| arcee-ai/coder-large | $0.50 | $0.80 | 32,768 | - |
| arcee-ai/virtuoso-large | $0.75 | $1.20 | 128,000 | - |
| arcee-ai/maestro-reasoning | $0.90 | $3.30 | 128,000 | - |
| arcee-ai/caller | $0.20 | $0.40 | 32,768 | - |
| arcee-ai/arcee-blitz | $0.10 | $0.40 | 32,768 | - |
| **Deep Cogito** |
| deepcogito/cogito-v2-preview-llama-70B | $0.88 | $0.88 | 32,768 | BF16 |
| deepcogito/cogito-v2-preview-llama-109B-MoE | $0.18 | $0.59 | 32,768 | BF16 |
| deepcogito/cogito-v2-preview-llama-405B | $3.50 | $3.50 | 32,768 | BF16 |
| deepcogito/cogito-v2-preview-deepseek-671b | $1.25 | $1.25 | 32,768 | FP8 |
| **Marin** |
| marin-community/marin-8b-instruct | $0.18 | $0.18 | 4,096 | FP16 |

### Embedding Models

| Model Name | Price per 1M tokens |
|------------|---------------------|
| togethercomputer/m2-bert-80M-32k-retrieval | $0.01 |
| BAAI/bge-large-en-v1.5 | $0.02 |
| BAAI/bge-base-en-v1.5 | $0.01 |
| Alibaba-NLP/gte-modernbert-base | $0.08 |
| intfloat/multilingual-e5-large-instruct | $0.02 |

### Image Models (FLUX)

| Model Name | Price per MP | Default Steps |
|------------|-------------|---------------|
| black-forest-labs/FLUX.1-schnell-Free | Free (10 img/min limit) | 4 |
| black-forest-labs/FLUX.1-schnell | $0.0027 | 4 |
| black-forest-labs/FLUX.1-dev | $0.025 | 28 |
| black-forest-labs/FLUX.1.1-pro | $0.04 | - |
| black-forest-labs/FLUX.1-pro | $0.05 | 28 |
| black-forest-labs/FLUX.1-kontext-dev | $0.025 | 28 |
| black-forest-labs/FLUX.1-kontext-pro | $0.04 | 28 |
| black-forest-labs/FLUX.1-kontext-max | $0.08 | 28 |

**Pricing Formula**: Cost = MP × Price per MP × (Steps ÷ Default Steps) [only if steps > default]

### Audio Models

| Model Name | Price |
|------------|-------|
| Cartesia Sonic 2 | $65.00 per 1M characters |
| openai/whisper-large-v3 | $0.0015 per audio minute |

### Rerank Models

| Model Name | Price per 1M tokens |
|------------|---------------------|
| Salesforce/Llama-Rank-v1 | $0.10 |
| mixedbread-ai/Mxbai-Rerank-Large-V2 | $0.10 |

### Moderation Models

| Model Name | Price per 1M tokens |
|------------|---------------------|
| meta-llama/Meta-Llama-Guard-3-8B | $0.20 |
| meta-llama/Llama-Guard-4-12B | $0.20 |
| VirtueAI/VirtueGuard-Text-Lite | $0.20 |

---

## Atlas Cloud AI

**Provider Type**: `atlascloud`  
**API Base**: `https://api.atlascloud.ai/v1`  
**API Key**: `apikey-6c6705cf55174eadaa924203b916ae84` (Provider 4)  
**OpenAI Compatible**: Yes

### Rate Limits

**Note**: Atlas Cloud documentation does not specify explicit rate limits. They offer:
- Developer Plans with daily credit quotas
- Enterprise plans with custom RPM/TPM
- Contact sales for high-volume usage

**Default Assumption**: Use conservative limits until we contact sales or test
- **Estimated**: 600 RPM, 180,000 TPM (similar to Together Tier 1)

### Chat Models (Pricing per 1M tokens)

| Model Name | Input | Output | Context |
|------------|-------|--------|---------|
| **Anthropic Claude** |
| claude-3-5-haiku-20241022 | $0.70 | $3.50 | 131,072 |
| claude-3-5-sonnet-20241022 | $2.10 | $10.50 | 131,072 |
| claude-3-7-sonnet-20250219 | $2.10 | $10.50 | 131,072 |
| claude-3-7-sonnet-20250219-thinking | $2.10 | $10.50 | 131,072 |
| **Google Gemini** |
| gemini-2.5-flash | $0.15 | $1.25 | 131,072 |
| gemini-2.5-flash-image-preview | $0.18 | $18.00 | 131,072 |
| gemini-2.5-flash-lite | $0.05 | $0.20 | 131,072 |
| gemini-2.5-flash-lite-preview-06-17 | $0.05 | $0.20 | 131,072 |
| gemini-2.5-flash-preview-05-20 | $0.15 | $1.25 | 131,072 |
| gemini-2.5-pro | $0.625 | $5.00 | 131,072 |
| gemini-2.5-pro-preview-06-05 | $0.625 | $5.00 | 131,072 |
| **GLM (Zai)** |
| zai-org/GLM-4.5 | $0.60 | $2.20 | 131,072 |
| zai-org/GLM-4.5-Air | $0.00 | $0.00 | 32,768 (FREE) |
| zai-org/GLM-4.6 | $0.60 | $2.20 | 131,072 |
| **DeepSeek** |
| deepseek-ai/DeepSeek-V3 | $0.36 | $1.10 | 163,839 |
| deepseek-ai/DeepSeek-V3-0324 | $0.36 | $1.10 | 163,839 |
| deepseek-ai/DeepSeek-R1 | $0.14 | $2.19 | 163,839 |
| deepseek-ai/DeepSeek-R1-0528 | $0.14 | $2.19 | 163,839 |
| deepseek-ai/DeepSeek-R1-Distill-Llama-70B | $0.59 | $0.79 | 131,072 |
| deepseek-ai/DeepSeek-R1-Distill-Qwen-14B | $0.18 | $0.18 | 131,072 |
| deepseek-ai/DeepSeek-R1-Distill-Qwen-32B | $0.40 | $0.40 | 131,072 |
| **Meta Llama** |
| meta-llama/Llama-3.3-70B-Instruct-Turbo | $0.59 | $0.79 | 131,072 |
| meta-llama/Llama-3.1-405B-Instruct-Turbo | $2.70 | $2.70 | 130,815 |
| meta-llama/Llama-3.1-70B-Instruct-Turbo | $0.59 | $0.79 | 131,072 |
| meta-llama/Llama-3.1-8B-Instruct-Turbo | $0.15 | $0.15 | 131,072 |
| **Qwen** |
| Qwen/Qwen2.5-72B-Instruct-Turbo | $0.90 | $0.90 | 32,768 |
| Qwen/Qwen2.5-7B-Instruct-Turbo | $0.18 | $0.18 | 32,768 |
| Qwen/Qwen2.5-Coder-32B-Instruct | $0.60 | $0.60 | 32,768 |
| Qwen/QwQ-32B-Preview | $0.90 | $0.90 | 32,768 |
| **Mistral** |
| mistralai/Mistral-7B-Instruct-v0.3 | $0.18 | $0.18 | 32,768 |
| mistralai/Mistral-Small-24B-Instruct-2501 | $0.60 | $0.60 | 32,768 |
| mistralai/Mixtral-8x7B-Instruct-v0.1 | $0.40 | $0.40 | 32,768 |
| **Moonshot (Kimi)** |
| moonshotai/Kimi-K2-Instruct | $0.60 | $2.20 | 128,000 |
| moonshotai/Kimi-K2-Instruct-0905 | $0.60 | $2.20 | 262,144 |

### Image Generation Models (Sample)

| Model Name | Price per Image |
|------------|-----------------|
| wavespeed-ai/flux-schnell | $0.0027 |
| wavespeed-ai/flux-dev | $0.009 |
| wavespeed-ai/flux-dev-ultra-fast | $0.0045 |
| black-forest-labs/FLUX.1.1-pro | $0.036 |
| wavespeed-ai/flux-kontext-dev | $0.0225 |
| wavespeed-ai/flux-kontext-pro | $0.036 |
| wavespeed-ai/flux-kontext-max | $0.072 |
| ideogram-ai/ideogram-v2 | $0.072 |
| ideogram-ai/ideogram-v2-turbo | $0.045 |
| bytedance/seedream-v3 | $0.0225 |
| bytedance/seedream-v4 | $0.027 |

### Video Generation Models (Sample)

| Model Name | Price per 5s |
|------------|-------------|
| minimax/hailuo-02/standard | $0.207 |
| minimax/hailuo-02/fast | $0.09 |
| kwaivgi/kling-v2.1-i2v-standard | $0.225 |
| bytedance/seedance-v1-lite-t2v-480p | $0.072 |
| bytedance/seedance-v1-pro-t2v-720p | $0.27 |
| openai/sora-2/text-to-video | $0.4 |
| google/veo2 | $2.25 |

---

## Integration Plan

### 1. Environment Configuration (.env)
```bash
# Provider 3: Together AI
LLAMDA_LLM_PROXY_PROVIDER_TYPE_3=together
LLAMDA_LLM_PROXY_PROVIDER_KEY_3=tgp_v1_5yZxH3GMbdh8wpyvzuujFmsWVRiddNEfGZPROSgwCOw

# Provider 4: Atlas Cloud
LLAMDA_LLM_PROXY_PROVIDER_TYPE_4=atlascloud
LLAMDA_LLM_PROXY_PROVIDER_KEY_4=apikey-6c6705cf55174eadaa924203b916ae84
```

### 2. Frontend Pricing (ui-new/src/utils/pricing.ts)

**Priority Models to Add**:

**Together AI**:
- Llama 3.3 70B Turbo ($0.88/$0.88)
- Llama 3.1 405B Turbo ($3.50/$3.50)
- DeepSeek-V3.1 ($0.60/$1.70)
- DeepSeek-R1 ($3.00/$7.00)
- Qwen 2.5 72B Turbo ($1.20/$1.20)

**Atlas Cloud**:
- Claude 3.7 Sonnet ($2.10/$10.50)
- Gemini 2.5 Flash ($0.15/$1.25)
- DeepSeek-V3 ($0.36/$1.10) - cheaper than Together!
- DeepSeek-R1 ($0.14/$2.19) - much cheaper than Together!
- Llama 3.3 70B ($0.59/$0.79) - cheaper than Together!

### 3. Backend Provider Configuration

**Provider Type Mapping**:
```javascript
{
  'together': {
    apiBase: 'https://api.together.xyz/v1',
    rateLimits: { rpm: 600, tpm: 180000 }, // Tier 1 default
    authHeader: 'Authorization: Bearer {key}'
  },
  'atlascloud': {
    apiBase: 'https://api.atlascloud.ai/v1',
    rateLimits: { rpm: 600, tpm: 180000 }, // Conservative estimate
    authHeader: 'Authorization: Bearer {key}',
    openaiCompatible: true
  }
}
```

### 4. Testing Priorities

1. **Together AI**: Test Llama 3.3 70B Turbo (recommended by Together)
2. **Atlas Cloud**: Test DeepSeek-R1 (much cheaper: $0.14/$2.19 vs $3.00/$7.00)
3. **Together AI**: Test free Llama 3.3 70B (6 RPM limit)
4. **Atlas Cloud**: Test Claude 3.7 Sonnet (latest model)

---

## Cost Comparison Analysis

### DeepSeek-R1 (Reasoning Model)
- **Together AI**: $3.00 input / $7.00 output
- **Atlas Cloud**: $0.14 input / $2.19 output
- **Savings**: 95% input, 69% output ⭐️

### Llama 3.3 70B Instruct
- **Together AI**: $0.88 input / $0.88 output
- **Atlas Cloud**: $0.59 input / $0.79 output
- **Savings**: 33% input, 10% output ⭐️

### DeepSeek-V3
- **Together AI**: $1.25 input / $1.25 output
- **Atlas Cloud**: $0.36 input / $1.10 output
- **Savings**: 71% input, 12% output ⭐️

**Recommendation**: Prefer Atlas Cloud for DeepSeek models (significant cost savings!)

---

## Free Tier Models

### Together AI
- **Llama 3.3 70B Instruct Turbo Free**: Completely free (6 RPM limit on free tier, 10 RPM on paid)
- **FLUX.1 Schnell Free**: Free image generation (10 img/min limit)

### Atlas Cloud
- **GLM-4.5-Air**: Completely free ($0/$0)

---

## Next Steps

1. ✅ Add both providers to .env
2. ✅ Deploy environment with `make deploy-env`
3. ⏳ Update pricing.ts with priority models
4. ⏳ Examine backend provider mapping
5. ⏳ Add provider configurations to backend
6. ⏳ Test API calls to both providers
7. ⏳ Deploy updates
8. ⏳ Benchmark performance and costs
