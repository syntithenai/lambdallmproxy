# Image Generation Feature - Complete Documentation

## Overview

This document provides comprehensive documentation for the multi-provider image generation feature implemented in LLM Proxy. The feature enables users to generate images through the chat interface with automatic provider selection, fallback handling, and transparent cost tracking.

**Status**: ✅ Backend 100% Complete, Frontend 90% Complete (LlmInfoDialog updates pending)  
**Deployment**: Backend deployed to Lambda, Frontend deployed to GitHub Pages  
**Progress**: 16/19 tasks complete (84%)

---

## Architecture

### High-Level Flow

```
User Chat Message
    ↓
LLM analyzes request → Calls generate_image tool
    ↓
Backend analyzes quality requirements
    ↓
Check provider availability (API key + feature flag + circuit breaker)
    ↓
Select best available provider by fallback priority
    ↓
Return button data (cost estimate, constraints, alternatives)
    ↓
User clicks "Generate Image for $X.XX" button
    ↓
Frontend POST /generate-image
    ↓
Backend authenticates user
    ↓
Check provider availability again
    ↓
If unavailable → Attempt fallback to alternative provider
    ↓
Route to provider handler (OpenAI/Together/Replicate)
    ↓
Generate image → Return imageUrl + metadata
    ↓
Frontend displays image with Copy/Grab/Info actions
    ↓
Track LLM API call with cost/duration/provider
```

### Two-Phase Generation

**Phase 1: Tool Call (Estimate)**
- LLM calls `generate_image` tool during chat
- Backend analyzes quality keywords from prompt
- Checks all provider availability
- Estimates cost based on quality tier
- Returns button data with constraints and alternatives
- **No actual image generation occurs**
- **No API costs incurred**

**Phase 2: User Confirmation (Actual Generation)**
- User sees button: "Generate Image for $0.0400"
- User clicks button to confirm
- Frontend POSTs to `/generate-image` endpoint
- Backend performs actual image generation
- **Actual API costs incurred at this point**
- Returns imageUrl and metadata
- UI updates to show completed image

**Benefits**:
- User controls when costs are incurred
- Clear cost transparency before generation
- Ability to choose alternative providers
- No surprise charges

---

## Provider Comparison

| Provider | Models | Quality Tiers | Cost Range | Speed | Reliability | Notes |
|----------|--------|---------------|------------|-------|-------------|-------|
| **OpenAI** | DALL-E 3, DALL-E 2 | ultra, high | $0.04 - $0.12 | Medium | High | Best quality, supports style, HD option |
| **Together AI** | Stable Diffusion XL, SD 2.1, Playground v2.5 | standard, fast | $0.002 - $0.003 | Fast | Medium | Cost-effective, good for iterations |
| **Replicate** | SDXL, Realistic Vision | standard | $0.0018 - $0.0025 | Slow | Medium | Pay-per-compute, async polling |
| **Google Gemini** | Imagen (future) | TBD | TBD | TBD | TBD | Placeholder, not yet implemented |

### Quality Tier Mapping

**Ultra ($0.12)**
- Keywords: photorealistic, professional, detailed, high resolution, ultra hd, 8k
- Model: OpenAI DALL-E 3 HD (1024x1024)
- Use cases: Marketing materials, high-quality artwork

**High ($0.04)**
- Keywords: artistic, creative, stylized, concept art
- Model: OpenAI DALL-E 3 Standard (1024x1024)
- Use cases: Creative exploration, concept design

**Standard ($0.002-0.003)**
- Keywords: quick, draft, sketch, simple, basic
- Models: Together AI Stable Diffusion models, Replicate SDXL
- Use cases: Rapid iterations, prototyping

**Fast ($0.001)**
- Keywords: instant, immediate, fast
- Model: Together AI Stable Diffusion 2.1 (fewer steps)
- Use cases: Quick previews, thumbnails

---

## Circuit Breaker Pattern

### Purpose
Prevent repeated calls to failing providers, reduce latency, and provide graceful degradation.

### States

```
CLOSED (Normal Operation)
    ↓ (5 failures within 10 minutes)
OPEN (Blocking Requests)
    ↓ (After 10-minute timeout)
HALF_OPEN (Testing Recovery)
    ↓ (Success: back to CLOSED | Failure: back to OPEN)
```

### Configuration

```javascript
// src/utils/circuit-breaker.js
const FAILURE_THRESHOLD = 5;          // Failures to trigger open
const FAILURE_WINDOW_MS = 600000;     // 10 minutes
const TIMEOUT_MS = 600000;            // 10 minutes
const SUCCESS_THRESHOLD = 1;          // Successes in HALF_OPEN to close
```

### Usage

```javascript
import { CircuitBreaker } from './utils/circuit-breaker.js';

const openaiCircuitBreaker = new CircuitBreaker('openai-image');

// Check before making request
if (!openaiCircuitBreaker.isAvailable()) {
  throw new Error('Circuit breaker OPEN: provider unavailable');
}

try {
  const result = await generateImageWithOpenAI(params);
  openaiCircuitBreaker.recordSuccess();
  return result;
} catch (error) {
  openaiCircuitBreaker.recordFailure();
  throw error;
}
```

### Failure Examples

**Temporary Failures** (don't open circuit immediately):
- Network timeout (single occurrence)
- Rate limit hit once
- Transient API error

**Repeated Failures** (trigger circuit breaker):
- 5 consecutive network timeouts
- 5 authentication failures (invalid API key)
- 5 service unavailable errors (provider down)

---

## Fallback Strategy

### Priority Order

When primary provider is unavailable, system automatically falls back to next available provider **within the same quality tier**.

**Example: "Generate a photorealistic sunset" (ultra quality)**

1. **Primary**: OpenAI DALL-E 3 HD ($0.12)
   - If unavailable (API key missing / circuit breaker open / feature flag disabled)
   - ↓ Fallback
2. **Fallback**: OpenAI DALL-E 3 Standard ($0.04)
   - If unavailable
   - ↓ Fallback
3. **Final Fallback**: Together AI Stable Diffusion XL ($0.003)
   - Best effort within budget

**Example: "Generate a quick sketch" (fast quality)**

1. **Primary**: Together AI Stable Diffusion 2.1 ($0.001)
   - If unavailable
   - ↓ Fallback
2. **Fallback**: Together AI Stable Diffusion XL ($0.003)
   - Slightly slower but still cost-effective

### Fallback Logic

```javascript
// src/endpoints/generate-image.js

async function generateImageWithFallback(params) {
  const { provider, model, prompt } = params;
  
  // 1. Check primary provider availability
  const primaryAvailable = await checkProviderAvailability(provider);
  
  if (!primaryAvailable.available) {
    console.warn(`Primary provider ${provider} unavailable: ${primaryAvailable.reason}`);
    
    // 2. Find fallback alternatives from PROVIDER_CATALOG
    const alternatives = getAlternativeProviders(model, prompt);
    
    // 3. Try each alternative in priority order
    for (const alt of alternatives) {
      const altAvailable = await checkProviderAvailability(alt.provider);
      
      if (altAvailable.available) {
        console.log(`Using fallback: ${alt.provider} ${alt.model}`);
        params.provider = alt.provider;
        params.model = alt.model;
        params.fallbackUsed = true;
        params.originalProvider = provider;
        break;
      }
    }
  }
  
  // 4. Generate with selected provider
  return await routeToProvider(params);
}
```

### Fallback UI Indicators

When fallback is used, the UI displays a warning badge:

```
⚠️ Primary provider unavailable, fallback provider used
```

This ensures users understand:
- Original provider was not available
- Alternative provider was automatically selected
- Cost may differ from original estimate

---

## API Endpoints

### POST /generate-image

Generate an image using the specified provider and model.

**Request Body**:
```json
{
  "prompt": "A photorealistic sunset over mountains",
  "provider": "openai",
  "model": "dall-e-3",
  "modelKey": "openai-dall-e-3-hd-1024",
  "size": "1024x1024",
  "quality": "ultra",
  "style": "vivid",
  "accessToken": "ya29.a0AfH6SMB..."
}
```

**Response** (Success):
```json
{
  "success": true,
  "imageUrl": "https://oaidalleapiprodscus.blob.core.windows.net/...",
  "provider": "openai",
  "model": "dall-e-3",
  "cost": 0.04,
  "fallbackUsed": false,
  "llmApiCall": {
    "id": "img_gen_1234567890",
    "type": "image_generation",
    "provider": "openai",
    "model": "dall-e-3",
    "timestamp": "2025-01-12T00:00:00.000Z",
    "durationMs": 4500,
    "cost": 0.04,
    "success": true,
    "metadata": {
      "size": "1024x1024",
      "quality": "hd",
      "style": "vivid"
    }
  }
}
```

**Response** (Fallback Used):
```json
{
  "success": true,
  "imageUrl": "https://api.together.xyz/outputs/...",
  "provider": "together",
  "model": "stable-diffusion-xl",
  "cost": 0.003,
  "fallbackUsed": true,
  "originalProvider": "openai",
  "llmApiCall": { ... }
}
```

**Response** (Error):
```json
{
  "success": false,
  "error": "All providers unavailable: openai (Circuit breaker OPEN), together (API key not configured)"
}
```

### GET /health-check/image-providers

Check availability of all image generation providers.

**Response**:
```json
{
  "timestamp": "2025-01-12T00:00:00.000Z",
  "providers": {
    "openai": {
      "available": true,
      "reason": "Provider operational",
      "lastCheck": "2025-01-12T00:00:00.000Z",
      "circuitBreakerState": "CLOSED"
    },
    "together": {
      "available": false,
      "reason": "API key not configured",
      "lastCheck": "2025-01-12T00:00:00.000Z",
      "circuitBreakerState": "CLOSED"
    },
    "replicate": {
      "available": false,
      "reason": "Circuit breaker OPEN (5 failures)",
      "lastCheck": "2025-01-12T00:00:00.000Z",
      "circuitBreakerState": "OPEN"
    }
  },
  "summary": {
    "total": 3,
    "available": 1,
    "unavailable": 2
  }
}
```

---

## Frontend Components

### GeneratedImageBlock.tsx

React component that renders image generation UI with four states.

**Props**:
```typescript
interface GeneratedImageBlockProps {
  data: ImageGenerationData;           // Image generation metadata
  accessToken: string | null;          // User OAuth token
  onCopy?: (text: string) => void;     // Callback for Copy button
  onGrab?: (markdown: string) => void; // Callback for Grab button
  onLlmInfo?: (llmApiCall: any) => void; // Callback for LLM Info button
  onStatusChange?: (                   // Callback when status changes
    id: string,
    status: 'generating' | 'complete' | 'error',
    imageUrl?: string,
    llmApiCall?: any
  ) => void;
}
```

**Four States**:

1. **Pending State** - Before user clicks button
   - Button: "Generate Image for $0.0400"
   - Provider badge (OpenAI/Together AI/Replicate)
   - Model, quality tier, size chips
   - Collapsible constraints section (max size, supported sizes, style support)
   - Collapsible alternatives section (shows fallback options)
   - onClick → calls handleGenerate() → POSTs to /generate-image

2. **Generating State** - During API call
   - Animated spinner (3 pulsing dots)
   - Text: "Generating image with OpenAI..."
   - Estimated time message: "This may take a few seconds"

3. **Complete State** - After successful generation
   - Image display with rounded corners
   - Fallback warning badge if fallbackUsed === true
   - Provider/model/size/cost chips
   - Prompt display (truncated if > 150 chars)
   - Action buttons:
     - **Copy**: Copy image URL to clipboard
     - **Grab**: Copy markdown `![prompt](imageUrl)` to clipboard
     - **LLM Info**: Show LLM API call details (if available)

4. **Error State** - If generation failed
   - Red alert box with error icon
   - Error message from API
   - **Retry** button → calls handleGenerate() again

**Styling**:
- Uses Tailwind CSS classes
- Dark mode support with `dark:` variants
- Provider color coding:
  - OpenAI: Green (`bg-green-100 dark:bg-green-900/30`)
  - Together AI: Blue (`bg-blue-100 dark:bg-blue-900/30`)
  - Replicate: Purple (`bg-purple-100 dark:bg-purple-900/30`)
  - Gemini: Orange (`bg-orange-100 dark:bg-orange-900/30`)

**Usage in ChatTab**:
```tsx
{msg.imageGenerations && msg.imageGenerations.length > 0 && (
  <div className="mt-3">
    {msg.imageGenerations.map((imgGen) => (
      <GeneratedImageBlock
        key={imgGen.id}
        data={imgGen}
        accessToken={accessToken}
        onCopy={(text) => {/* Copy to clipboard */}}
        onGrab={(markdown) => {/* Copy markdown to clipboard */}}
        onLlmInfo={() => {/* Show LLM info dialog */}}
        onStatusChange={(id, status, imageUrl, llmApiCall) => {
          /* Update message state */
        }}
      />
    ))}
  </div>
)}
```

---

## Environment Variables

**Required** (at least one provider):

```bash
# OpenAI DALL-E
OPENAI_API_KEY=sk-proj-...
ENABLE_IMAGE_GENERATION_OPENAI=true

# Together AI Stable Diffusion
TOGETHER_API_KEY=...
ENABLE_IMAGE_GENERATION_TOGETHER=true

# Replicate SDXL
REPLICATE_API_TOKEN=r8_...
ENABLE_IMAGE_GENERATION_REPLICATE=true

# Google Gemini (future)
GEMINI_API_KEY=...
ENABLE_IMAGE_GENERATION_GEMINI=false  # Not implemented yet
```

**Optional** (circuit breaker tuning):

```bash
# Number of failures to trigger circuit breaker
CIRCUIT_BREAKER_FAILURE_THRESHOLD=5

# Time window for counting failures (milliseconds)
CIRCUIT_BREAKER_FAILURE_WINDOW_MS=600000  # 10 minutes

# Timeout before attempting recovery (milliseconds)
CIRCUIT_BREAKER_TIMEOUT_MS=600000  # 10 minutes

# Number of successes in HALF_OPEN to close circuit
CIRCUIT_BREAKER_SUCCESS_THRESHOLD=1
```

**Deployment**:

After updating `.env` file, deploy to Lambda:
```bash
make deploy-env
```

This syncs environment variables from `.env` to AWS Lambda Console.

---

## Testing Scenarios

### Scenario 1: All Providers Available

**Test**: "Generate a photorealistic sunset over mountains"

**Expected Behavior**:
1. LLM calls generate_image tool
2. Backend analyzes "photorealistic" → ultra quality
3. Checks provider availability → all available
4. Selects OpenAI DALL-E 3 HD (highest quality, primary)
5. Returns button data: cost=$0.12, provider=openai, model=dall-e-3
6. UI shows button: "Generate Image for $0.12"
7. User clicks button
8. Backend POSTs to OpenAI API
9. Image generated successfully
10. UI shows image with OpenAI badge, $0.12 cost
11. LLM API call tracked with provider=openai, cost=0.12

**Verification**:
- ✅ Correct provider selected
- ✅ Cost estimate accurate
- ✅ Image generated successfully
- ✅ No fallback used
- ✅ LLM API call tracked

---

### Scenario 2: Primary Provider Down (Fallback)

**Setup**: Disable OpenAI provider
```bash
ENABLE_IMAGE_GENERATION_OPENAI=false
make deploy-env
```

**Test**: "Generate a high-quality artistic landscape"

**Expected Behavior**:
1. LLM calls generate_image tool
2. Backend analyzes "high-quality artistic" → high quality
3. Checks provider availability:
   - OpenAI: unavailable (feature flag disabled)
   - Together AI: available
   - Replicate: available
4. Selects Together AI Stable Diffusion XL (fallback, same quality tier)
5. Returns button data: cost=$0.003, provider=together, model=stable-diffusion-xl
6. User clicks button
7. Backend POSTs to Together AI API
8. Image generated successfully
9. UI shows image with Together AI badge, $0.003 cost
10. **Fallback warning badge displayed**: "⚠️ Primary provider unavailable, fallback provider used"
11. LLM API call tracked with provider=together, fallbackUsed=true

**Verification**:
- ✅ Fallback to alternative provider
- ✅ User informed of fallback
- ✅ Cost adjusted to fallback provider pricing
- ✅ Image generated successfully
- ✅ LLM API call tracked with fallback metadata

---

### Scenario 3: Circuit Breaker Triggered

**Setup**: Simulate 5 consecutive failures to OpenAI provider

**Method**: Temporarily use invalid API key
```bash
OPENAI_API_KEY=invalid_key
make deploy-env
```

**Test**: Make 5 consecutive requests to OpenAI

**Expected Behavior**:

**Request 1-4**:
- Backend attempts OpenAI API call
- Returns 401 Unauthorized error
- Circuit breaker records failure (1-4 of 5)
- User sees error message
- Circuit breaker state: CLOSED

**Request 5**:
- Backend attempts OpenAI API call
- Returns 401 Unauthorized error
- Circuit breaker records failure (5 of 5)
- **Circuit breaker opens** (state: OPEN)
- User sees error message

**Request 6**:
- Backend checks provider availability
- Circuit breaker state: OPEN → unavailable
- **Request blocked immediately** (no API call made)
- Error: "Circuit breaker OPEN: provider unavailable"
- Automatic fallback to Together AI (if available)

**After 10 minutes**:
- Circuit breaker timeout expires
- State transitions: OPEN → HALF_OPEN
- Next request allowed to test recovery
- If successful: state → CLOSED (circuit healed)
- If failed: state → OPEN (remain broken)

**Verification**:
- ✅ Circuit breaker triggers after 5 failures
- ✅ Subsequent requests blocked immediately
- ✅ Fallback to alternative provider works
- ✅ Circuit breaker recovers after timeout
- ✅ State transitions correctly

---

### Scenario 4: Provider Recovery

**Setup**: After circuit breaker opens, fix the issue

**Method**:
1. Trigger circuit breaker (5 failures)
2. Wait 10 minutes for timeout
3. Fix API key
```bash
OPENAI_API_KEY=sk-proj-correct-key
make deploy-env
```
4. Make new request

**Expected Behavior**:

**T=0**: Circuit breaker opens (state: OPEN)
**T=10min**: Timeout expires (state: HALF_OPEN)
**Next request**:
- Backend checks provider availability
- Circuit breaker state: HALF_OPEN → allowed to attempt
- Backend POSTs to OpenAI API (with correct key now)
- **Request succeeds**
- Circuit breaker records success
- **State transitions: HALF_OPEN → CLOSED**
- Future requests flow normally

**If request fails in HALF_OPEN**:
- Circuit breaker records failure
- **State transitions: HALF_OPEN → OPEN**
- Wait another 10 minutes for next recovery attempt

**Verification**:
- ✅ Circuit breaker enters HALF_OPEN after timeout
- ✅ Test request allowed
- ✅ Success closes circuit
- ✅ Failure reopens circuit
- ✅ Normal operation resumed after closing

---

## Security Considerations

### Current Implementation

✅ **OAuth Authentication**
- All /generate-image requests require valid Google OAuth token
- Token verified via Google's tokeninfo API
- Expired tokens rejected with 401 Unauthorized

✅ **API Key Protection**
- All provider API keys stored in Lambda environment variables
- Never exposed to frontend
- Redacted in logs

✅ **Circuit Breaker**
- Prevents abuse of failing providers
- Automatic blocking after repeated failures
- Rate limits unintentional DoS

✅ **Cost Transparency**
- User sees estimated cost before generation
- Explicit user confirmation required
- No hidden charges

### Recommended Enhancements (Not Yet Implemented)

⚠️ **Rate Limiting** (TODO):
```javascript
// Per-user rate limiting
const IMAGES_PER_HOUR = 10;
const IMAGES_PER_DAY = 50;

async function checkRateLimit(userId) {
  const hourlyCount = await redis.get(`img_gen:${userId}:hour`);
  const dailyCount = await redis.get(`img_gen:${userId}:day`);
  
  if (hourlyCount >= IMAGES_PER_HOUR) {
    throw new Error('Hourly limit exceeded (10 images/hour)');
  }
  
  if (dailyCount >= IMAGES_PER_DAY) {
    throw new Error('Daily limit exceeded (50 images/day)');
  }
}
```

⚠️ **Content Moderation** (TODO):
```javascript
// OpenAI Moderation API
async function moderatePrompt(prompt) {
  const moderation = await openai.moderations.create({
    input: prompt
  });
  
  if (moderation.results[0].flagged) {
    throw new Error('Content policy violation detected');
  }
}
```

⚠️ **Cost Limits** (TODO):
```javascript
// Per-user daily spending cap
const DAILY_COST_LIMIT = 10.00; // $10/day

async function checkCostLimit(userId, estimatedCost) {
  const dailyCost = await redis.get(`img_gen_cost:${userId}:day`);
  
  if (dailyCost + estimatedCost > DAILY_COST_LIMIT) {
    throw new Error('Daily cost limit exceeded ($10/day)');
  }
}
```

⚠️ **Prompt Validation** (TODO):
```javascript
// Validate prompt before generation
function validatePrompt(prompt) {
  if (!prompt || prompt.trim().length === 0) {
    throw new Error('Prompt cannot be empty');
  }
  
  if (prompt.length > 1000) {
    throw new Error('Prompt too long (max 1000 characters)');
  }
  
  // Block malicious patterns
  const blockedPatterns = [
    /eval\(/gi,
    /exec\(/gi,
    /<script>/gi
  ];
  
  for (const pattern of blockedPatterns) {
    if (pattern.test(prompt)) {
      throw new Error('Invalid prompt content');
    }
  }
}
```

---

## Monitoring and Alerting

### Current Logging

✅ **LLM API Call Tracking**
- Every image generation logged with:
  - Provider (openai/together/replicate)
  - Model (dall-e-3, stable-diffusion-xl, etc.)
  - Cost (calculated from provider pricing)
  - Duration (milliseconds)
  - Success/failure status
  - Metadata (size, quality, style)

✅ **Circuit Breaker Events**
- State transitions logged:
  - CLOSED → OPEN (5 failures)
  - OPEN → HALF_OPEN (timeout expired)
  - HALF_OPEN → CLOSED (recovery success)
  - HALF_OPEN → OPEN (recovery failed)

✅ **Fallback Usage**
- Logged when primary provider unavailable
- Includes original provider and fallback provider
- Tracks reason for unavailability

### Recommended Monitoring (TODO)

⚠️ **CloudWatch Metrics**:
```javascript
// Custom metrics
const metrics = {
  'ImageGeneration/RequestCount': 1,
  'ImageGeneration/SuccessCount': success ? 1 : 0,
  'ImageGeneration/FailureCount': success ? 0 : 1,
  'ImageGeneration/FallbackCount': fallbackUsed ? 1 : 0,
  'ImageGeneration/Cost': cost,
  'ImageGeneration/DurationMs': duration,
  [`ImageGeneration/${provider}/RequestCount`]: 1,
  [`ImageGeneration/${provider}/SuccessRate`]: success ? 100 : 0
};
```

⚠️ **CloudWatch Alarms**:
- High failure rate (> 50% failures in 5 minutes)
- Circuit breaker opened (any provider)
- High cost (> $100/hour)
- Slow response time (> 30 seconds P95)

⚠️ **Dashboard Metrics**:
- Total images generated per hour/day
- Cost per provider per hour/day
- Success rate per provider
- Average generation time per provider
- Circuit breaker state per provider
- Fallback usage percentage

---

## Known Issues and Limitations

### Current Limitations

1. **No Gemini Support Yet**
   - Placeholder handler exists (src/image-providers/gemini.js)
   - Waiting for Google to release public Imagen API
   - Returns "not implemented" error if called

2. **No Content Moderation**
   - Prompts not validated before generation
   - Relies on provider-level moderation (OpenAI has built-in)
   - Could generate inappropriate content if user tries

3. **No Rate Limiting**
   - Users could generate unlimited images
   - Potential for abuse or runaway costs
   - Recommend implementing per-user limits

4. **No Cost Limits**
   - No per-user spending caps
   - No daily/monthly budget enforcement
   - Could result in unexpected charges

5. **Replicate Polling Delay**
   - Replicate uses async predictions (not instant)
   - Requires polling until complete (60-second timeout)
   - Slower user experience vs OpenAI/Together AI

6. **Large Bundle Size**
   - Frontend bundle: 849.56 KB (gzipped: 245.12 KB)
   - Vite warning about chunk size
   - Could benefit from code splitting

### Future Enhancements

1. **Image Editing**
   - Support for image-to-image generation
   - Inpainting (edit parts of an image)
   - Outpainting (extend image borders)
   - Style transfer

2. **Batch Generation**
   - Generate multiple variations at once
   - Compare different providers/models side-by-side
   - Bulk image generation for workflows

3. **Image Storage**
   - Save generated images to user's account
   - Gallery view of all generated images
   - Organize into collections/folders

4. **Advanced Controls**
   - Negative prompts (exclude concepts)
   - Seed control (reproducible generations)
   - CFG scale (creativity vs prompt adherence)
   - Steps parameter (quality vs speed trade-off)

5. **Provider Comparison Tool**
   - Generate same prompt with multiple providers
   - Side-by-side comparison UI
   - Vote/rate best result

---

## Deployment Checklist

### Backend Deployment

- [x] Create all provider handler files
- [x] Implement circuit breaker utility
- [x] Implement provider health checking
- [x] Update PROVIDER_CATALOG.json
- [x] Create /generate-image endpoint
- [x] Register endpoints in src/index.js
- [x] Update chat endpoint to extract imageGenerations
- [x] Add environment variable documentation
- [x] Deploy Lambda function code (`make deploy-lambda-fast`)
- [x] Deploy environment variables (`make deploy-env`)
- [x] Verify CloudWatch logs show no errors

### Frontend Deployment

- [x] Add TypeScript types to api.ts
- [x] Create GeneratedImageBlock component
- [x] Add generateImage API function
- [x] Integrate in ChatTab.tsx
- [x] Update message_complete handler
- [ ] Update LlmInfoDialog.tsx (pending)
- [x] Build UI (`make build-ui` - included in deploy-ui)
- [x] Deploy to GitHub Pages (`make deploy-ui`)
- [x] Verify UI loads without errors

### Testing

- [ ] Test with all providers available
- [ ] Test with primary provider down (fallback)
- [ ] Test circuit breaker triggering
- [ ] Test provider recovery
- [ ] Test cost estimation accuracy
- [ ] Test error handling (invalid API keys, network failures)
- [ ] Test UI states (pending, generating, complete, error)
- [ ] Test action buttons (Copy, Grab, LLM Info)

### Documentation

- [x] Create FEATURE_IMAGE_GENERATION_PROGRESS.md
- [x] Create FEATURE_IMAGE_GENERATION.md (this document)
- [ ] Update README.md with image generation instructions
- [ ] Create user guide for image generation
- [ ] Document troubleshooting steps

---

## Troubleshooting

### Issue: "Circuit breaker OPEN: provider unavailable"

**Cause**: Circuit breaker triggered after 5 consecutive failures

**Solution**:
1. Check CloudWatch logs for error details
2. Verify API key is correct: `aws lambda get-function-configuration --function-name llmproxy | jq '.Environment.Variables.OPENAI_API_KEY'`
3. Check feature flag: `ENABLE_IMAGE_GENERATION_OPENAI=true`
4. Wait 10 minutes for circuit breaker timeout
5. Make test request to verify recovery

**Manual Reset**:
```javascript
// In Lambda function code (temporary debug)
const openaiCircuitBreaker = new CircuitBreaker('openai-image');
openaiCircuitBreaker.reset(); // Force close circuit
```

---

### Issue: "All providers unavailable"

**Cause**: No providers configured or all circuit breakers open

**Solution**:
1. Check at least one API key is set:
   ```bash
   aws lambda get-function-configuration --function-name llmproxy | jq '.Environment.Variables' | grep IMAGE_GENERATION
   ```
2. Verify feature flags enabled:
   ```bash
   ENABLE_IMAGE_GENERATION_OPENAI=true
   ENABLE_IMAGE_GENERATION_TOGETHER=true
   ```
3. Check GET /health-check/image-providers response
4. Reset environment variables:
   ```bash
   make deploy-env
   ```

---

### Issue: Images not showing in UI

**Cause**: imageGenerations not extracted from message_complete event

**Debug**:
1. Open browser DevTools → Network tab
2. Look for SSE events from /chat endpoint
3. Check message_complete event data for imageGenerations field
4. Verify ChatTab.tsx message_complete handler extracts imageGenerations
5. Check console logs for UI state updates

**Verification**:
```javascript
// In browser console
const messages = JSON.parse(localStorage.getItem('chatMessages'));
console.log(messages[messages.length - 1].imageGenerations);
```

---

### Issue: High costs

**Cause**: No rate limiting or cost controls

**Temporary Solution**:
1. Monitor usage via CloudWatch Logs Insights:
   ```
   fields @timestamp, @message
   | filter @message like /image generation/
   | stats sum(cost) as totalCost by bin(5m)
   ```
2. Disable expensive providers:
   ```bash
   ENABLE_IMAGE_GENERATION_OPENAI=false  # Disable DALL-E ($0.04-0.12)
   ENABLE_IMAGE_GENERATION_TOGETHER=true # Keep cheap SD ($0.001-0.003)
   make deploy-env
   ```
3. Implement rate limiting (see Security Considerations)

---

## References

### Provider Documentation

- **OpenAI DALL-E**: https://platform.openai.com/docs/guides/images
- **Together AI**: https://docs.together.ai/docs/image-models
- **Replicate**: https://replicate.com/docs/topics/predictions
- **Google Imagen**: https://cloud.google.com/vertex-ai/docs/generative-ai/image/overview

### Related Files

**Backend**:
- `PROVIDER_CATALOG.json` (lines 766-916)
- `src/utils/circuit-breaker.js` (245 lines)
- `src/utils/provider-health.js` (165 lines)
- `src/tools.js` (additions ~180 lines)
- `src/image-providers/openai.js` (210 lines)
- `src/image-providers/together.js` (210 lines)
- `src/image-providers/replicate.js` (260 lines)
- `src/image-providers/gemini.js` (90 lines)
- `src/endpoints/generate-image.js` (330 lines)
- `src/endpoints/chat.js` (additions ~30 lines)
- `src/index.js` (additions ~55 lines)
- `.env.example` (additions ~45 lines)

**Frontend**:
- `ui-new/src/utils/api.ts` (additions ~100 lines)
- `ui-new/src/components/GeneratedImageBlock.tsx` (421 lines)
- `ui-new/src/components/ChatTab.tsx` (additions ~60 lines)

**Documentation**:
- `developer_log/FEATURE_IMAGE_GENERATION_PROGRESS.md`
- `developer_log/FEATURE_IMAGE_GENERATION.md` (this document)

---

## Changelog

**2025-01-12**:
- ✅ Backend implementation complete (10 tasks)
- ✅ Backend deployed to Lambda
- ✅ Frontend types and API functions complete (2 tasks)
- ✅ GeneratedImageBlock component complete (421 lines, Tailwind CSS)
- ✅ ChatTab integration complete
- ✅ Message_complete handler updated
- ✅ Frontend deployed to GitHub Pages
- ⏸️ LlmInfoDialog updates pending
- ⏸️ End-to-end testing pending
- ⏸️ Security/monitoring enhancements pending
- 📊 Progress: 16/19 tasks (84%)

---

## Contact

For questions or issues with this feature:
- **GitHub Issues**: https://github.com/syntithenai/lambdallmproxy/issues
- **Documentation**: See developer_log/ directory
- **Testing**: Use `make logs` to view CloudWatch logs

