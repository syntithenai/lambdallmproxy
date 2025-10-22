# Image Generation - End-to-End Testing Guide

## Overview

This document provides comprehensive testing scenarios for the multi-provider image generation feature. Each scenario includes setup steps, expected behavior, verification criteria, and rollback instructions.

**Status**: Ready for testing  
**Backend**: Deployed to Lambda  
**Frontend**: Deployed to GitHub Pages  
**Test Environment**: Production Lambda function

---

## Test Environment Setup

### Prerequisites

1. **Backend Access**
   - Lambda URL: https://nrw7pperjjdswbmqgmigbwsbyi0rwdqf.lambda-url.us-east-1.on.aws
   - CloudWatch logs access
   - AWS CLI configured

2. **Frontend Access**
   - UI URL: https://lambdallmproxy.pages.dev (or GitHub Pages URL)
   - Browser with DevTools
   - Valid Google OAuth credentials

3. **API Keys** (verify in Lambda environment)
   ```bash
   aws lambda get-function-configuration --function-name llmproxy | jq '.Environment.Variables' | grep IMAGE_GENERATION
   ```

4. **Test Tools**
   ```bash
   # View logs in real-time
   make logs-tail
   
   # View recent logs
   make logs
   
   # Check provider health
   curl https://YOUR_LAMBDA_URL/health-check/image-providers
   ```

---

## Scenario 1: All Providers Available (Baseline)

### Objective
Verify normal operation when all image generation providers are available and operational.

### Setup

1. **Verify all providers enabled**:
   ```bash
   # Check Lambda environment variables
   aws lambda get-function-configuration --function-name llmproxy | jq '.Environment.Variables' | grep ENABLE_IMAGE_GENERATION
   ```
   
   Expected:
   ```
   ENABLE_IMAGE_GENERATION_OPENAI=true
   ENABLE_IMAGE_GENERATION_TOGETHER=true
   ENABLE_IMAGE_GENERATION_REPLICATE=true
   ```

2. **Verify API keys configured**:
   ```bash
   aws lambda get-function-configuration --function-name llmproxy | jq '.Environment.Variables' | grep -E '(OPENAI_API_KEY|TOGETHER_API_KEY|REPLICATE_API_TOKEN)'
   ```
   
   Should return redacted but non-empty values

3. **Check provider health**:
   ```bash
   curl https://nrw7pperjjdswbmqgmigbwsbyi0rwdqf.lambda-url.us-east-1.on.aws/health-check/image-providers
   ```
   
   Expected:
   ```json
   {
     "timestamp": "2025-10-12T...",
     "providers": {
       "openai": {"available": true, "reason": "Provider operational"},
       "together": {"available": true, "reason": "Provider operational"},
       "replicate": {"available": true, "reason": "Provider operational"}
     },
     "summary": {
       "total": 3,
       "available": 3,
       "unavailable": 0
     }
   }
   ```

### Test Steps

1. **Open UI and authenticate**
   - Navigate to https://lambdallmproxy.pages.dev
   - Sign in with Google OAuth
   - Verify authentication successful

2. **Request high-quality image**
   - Type: `"Generate a photorealistic sunset over mountains with dramatic clouds"`
   - Send message
   - Wait for LLM response

3. **Verify tool call response**
   - **Expected**: LLM calls generate_image tool
   - **Expected**: Backend returns button data:
     ```json
     {
       "id": "img_gen_...",
       "provider": "openai",
       "model": "dall-e-3",
       "cost": 0.04,
       "qualityTier": "ultra",
       "size": "1024x1024",
       "ready": false,
       "constraints": {...},
       "availableAlternatives": [...]
     }
     ```

4. **Verify UI display**
   - ✅ Button displayed: "Generate Image for $0.04"
   - ✅ Provider badge: Green badge with "OpenAI"
   - ✅ Model chip: "dall-e-3"
   - ✅ Quality chip: "ultra" (yellow)
   - ✅ Size chip: "1024x1024" (indigo)
   - ✅ Constraints section: Collapsible, shows max size and supported sizes
   - ✅ Alternatives section: Shows Together AI and Replicate options

5. **Click generate button**
   - Click "Generate Image for $0.04"
   - **Expected**: Button changes to loading spinner
   - **Expected**: Text: "Generating image with OpenAI..."

6. **Wait for generation**
   - **Expected duration**: 3-5 seconds
   - Monitor CloudWatch logs: `make logs-tail`

7. **Verify successful generation**
   - ✅ Image displayed in UI
   - ✅ Image URL format: `https://oaidalleapiprodscus.blob.core.windows.net/...`
   - ✅ Provider badge: "OpenAI" (green)
   - ✅ Model chip: "dall-e-3"
   - ✅ Size chip: "1024x1024"
   - ✅ Cost chip: "$0.0400" (green)
   - ✅ Prompt displayed (truncated if >150 chars)
   - ✅ NO fallback warning badge

8. **Test action buttons**
   - **Copy button**:
     - Click Copy
     - Verify toast: "Image URL copied to clipboard!"
     - Paste in text editor: Should be raw image URL
   
   - **Grab button**:
     - Click Grab
     - Verify toast: "Markdown copied to clipboard!"
     - Paste in text editor: Should be `![Generate a photorealistic...](https://...)`
   
   - **LLM Info button**:
     - Click "LLM Info"
     - Verify dialog opens
     - ✅ Shows "🖼️ Image Generation" entry
     - ✅ Provider badge: "OpenAI" (green)
     - ✅ Model: "dall-e-3"
     - ✅ Cost: "💰 $0.0400"
     - ✅ Size chip: "📐 1024x1024"
     - ✅ Quality chip: "⭐ hd" (if HD was used)
     - ✅ Duration: "⏱️ X.XXs"
     - ✅ Success status: "✅ Success"

9. **Verify cost tracking**
   - Check LLM Info dialog footer
   - Total cost should include image generation cost ($0.04)
   - Cost breakdown should show image cost separately

### Expected Results

✅ **Provider Selection**: OpenAI DALL-E 3 selected (highest quality)  
✅ **Cost Estimate**: $0.04 (accurate)  
✅ **Generation Time**: 3-5 seconds  
✅ **Image Quality**: High resolution, photorealistic  
✅ **No Fallback**: Primary provider used  
✅ **UI States**: All states render correctly  
✅ **Action Buttons**: All work as expected  
✅ **Cost Tracking**: Accurate in LLM Info dialog

### Verification Checklist

- [ ] Provider health check shows all available
- [ ] LLM calls generate_image tool
- [ ] Button displays with correct cost
- [ ] Provider/model/quality/size chips correct
- [ ] Constraints and alternatives displayed
- [ ] Loading state shows during generation
- [ ] Image displays after generation
- [ ] No fallback warning present
- [ ] Copy button copies URL correctly
- [ ] Grab button copies markdown correctly
- [ ] LLM Info shows generation details
- [ ] Cost tracking includes image cost
- [ ] CloudWatch logs show success

### CloudWatch Log Verification

Search for:
```
filter @message like /image generation/
| fields @timestamp, @message
| sort @timestamp desc
| limit 20
```

Expected log entries:
- `generate_image tool called with prompt: ...`
- `Selected provider: openai, model: dall-e-3`
- `Image generation successful, cost: 0.04`
- `LLM API call tracked: type=image_generation, provider=openai`

---

## Scenario 2: Primary Provider Down (Fallback)

### Objective
Verify automatic fallback when primary provider is unavailable.

### Setup

1. **Disable OpenAI provider**:
   ```bash
   # Edit .env file locally
   ENABLE_IMAGE_GENERATION_OPENAI=false
   
   # Deploy to Lambda
   make deploy-env
   ```

2. **Verify OpenAI disabled**:
   ```bash
   curl https://nrw7pperjjdswbmqgmigbwsbyi0rwdqf.lambda-url.us-east-1.on.aws/health-check/image-providers
   ```
   
   Expected:
   ```json
   {
     "providers": {
       "openai": {
         "available": false,
         "reason": "Feature flag disabled: ENABLE_IMAGE_GENERATION_OPENAI"
       },
       "together": {"available": true},
       "replicate": {"available": true}
     }
   }
   ```

3. **Keep other providers enabled**:
   - Together AI: enabled
   - Replicate: enabled

### Test Steps

1. **Request high-quality image**
   - Type: `"Create a high-quality artistic landscape with mountains"`
   - Send message

2. **Verify tool call response**
   - **Expected**: LLM calls generate_image tool
   - **Expected**: Backend selects Together AI (fallback)
   - **Expected**: Button shows Together AI as provider

3. **Verify UI display**
   - ✅ Button: "Generate Image for $0.003" (lower cost)
   - ✅ Provider badge: Blue badge with "Together AI"
   - ✅ Model: "stable-diffusion-xl"
   - ✅ Quality: "high" or "standard"
   - ✅ Alternatives: May show Replicate as option

4. **Click generate button**
   - Click button
   - Wait for generation

5. **Verify successful generation with fallback**
   - ✅ Image displayed
   - ✅ Provider badge: "Together AI" (blue)
   - ✅ **Fallback warning badge**: "⚠️ Primary provider unavailable, fallback provider used"
   - ✅ Cost: "$0.0030" or similar
   - ✅ Image quality: Good (Stable Diffusion quality)

6. **Verify LLM Info dialog**
   - Click "LLM Info"
   - ✅ Shows image generation entry
   - ✅ Provider: "Together AI" (blue badge)
   - ✅ Model: "stable-diffusion-xl"
   - ✅ Cost: Correct for Together AI
   - ✅ Metadata may include fallback information

### Expected Results

✅ **Fallback Triggered**: Automatic switch to Together AI  
✅ **Warning Displayed**: Fallback badge visible  
✅ **Cost Adjusted**: Lower cost ($0.003 vs $0.04)  
✅ **Image Quality**: Good (SD quality)  
✅ **No User Error**: Seamless experience  
✅ **Tracking**: Fallback logged in LLM API call

### Verification Checklist

- [ ] OpenAI provider disabled via feature flag
- [ ] Together AI selected as fallback
- [ ] Fallback warning badge displayed
- [ ] Cost adjusted to Together AI pricing
- [ ] Image generated successfully
- [ ] LLM Info shows Together AI provider
- [ ] CloudWatch logs show fallback decision

### CloudWatch Log Verification

Expected log entries:
- `Primary provider openai unavailable: Feature flag disabled`
- `Attempting fallback to alternative provider`
- `Selected fallback provider: together, model: stable-diffusion-xl`
- `Image generation successful with fallback, cost: 0.003`

### Rollback

```bash
# Re-enable OpenAI
ENABLE_IMAGE_GENERATION_OPENAI=true

# Deploy
make deploy-env
```

---

## Scenario 3: Circuit Breaker Triggered

### Objective
Verify circuit breaker opens after repeated failures and blocks subsequent requests.

### Setup

1. **Temporarily invalidate OpenAI API key**:
   ```bash
   # Edit .env
   OPENAI_API_KEY=invalid_key_for_testing
   
   # Deploy
   make deploy-env
   ```

2. **Ensure OpenAI is the only enabled provider** (optional, for clearer testing):
   ```bash
   ENABLE_IMAGE_GENERATION_OPENAI=true
   ENABLE_IMAGE_GENERATION_TOGETHER=false
   ENABLE_IMAGE_GENERATION_REPLICATE=false
   
   make deploy-env
   ```

3. **Verify circuit breaker settings**:
   - Default: 5 failures in 10 minutes = open
   - Timeout: 10 minutes

### Test Steps

#### Phase 1: Trigger Failures (1-4)

1. **Request image (Attempt 1)**
   - Type: `"Generate a sunset"`
   - Click generate button
   - **Expected**: Error after API call attempt
   - **Expected**: Error message: "401 Unauthorized" or similar
   - **Expected**: Circuit breaker state: CLOSED (1 failure recorded)

2. **Request image (Attempt 2-4)**
   - Repeat same prompt 3 more times
   - **Expected**: Each fails with 401 error
   - **Expected**: Circuit breaker state: CLOSED (2-4 failures recorded)
   - **Expected**: Each attempt makes actual API call

#### Phase 2: Circuit Opens (Attempt 5)

3. **Request image (Attempt 5)**
   - Type: `"Generate a landscape"`
   - Click generate button
   - **Expected**: Error after API call attempt
   - **Expected**: Circuit breaker state: OPEN (5 failures reached)
   - **Expected**: API call was made (last attempt before opening)

#### Phase 3: Circuit Blocking (Attempt 6+)

4. **Request image (Attempt 6)**
   - Type: `"Generate mountains"`
   - Click generate button
   - **Expected**: **Immediate error** (no API call made)
   - **Expected**: Error message: "Circuit breaker OPEN: provider unavailable"
   - **Expected**: No delay (blocked before API call)

5. **Verify circuit breaker state**:
   ```bash
   curl https://nrw7pperjjdswbmqgmigbwsbyi0rwdqf.lambda-url.us-east-1.on.aws/health-check/image-providers
   ```
   
   Expected:
   ```json
   {
     "providers": {
       "openai": {
         "available": false,
         "reason": "Circuit breaker OPEN (5 failures in last 10 minutes)",
         "circuitBreakerState": "OPEN"
       }
     }
   }
   ```

6. **Verify fallback** (if other providers enabled):
   - If Together AI enabled: Should fallback automatically
   - If all providers disabled: Error message about no providers available

### Expected Results

✅ **Failures 1-4**: Each makes API call, circuit remains CLOSED  
✅ **Failure 5**: Circuit opens after 5th failure  
✅ **Requests 6+**: Blocked immediately, no API calls  
✅ **Error Messages**: Clear indication of circuit breaker state  
✅ **Fallback**: Automatic switch to available provider  
✅ **Performance**: Requests blocked in <1ms (no network delay)

### Verification Checklist

- [ ] First 4 failures recorded correctly
- [ ] Circuit opens on 5th failure
- [ ] Subsequent requests blocked immediately
- [ ] Health check shows OPEN state
- [ ] CloudWatch logs show state transition
- [ ] No API calls made after circuit opens
- [ ] Fallback works if available

### CloudWatch Log Verification

Expected log entries:
- `Circuit breaker failure recorded: openai-image (1/5)`
- `Circuit breaker failure recorded: openai-image (2/5)`
- ...
- `Circuit breaker failure recorded: openai-image (5/5)`
- `Circuit breaker state changed: CLOSED -> OPEN (provider: openai-image)`
- `Request blocked: circuit breaker OPEN for provider openai-image`

### Rollback

```bash
# Restore valid API key
OPENAI_API_KEY=sk-proj-YOUR_VALID_KEY

# Re-enable all providers
ENABLE_IMAGE_GENERATION_OPENAI=true
ENABLE_IMAGE_GENERATION_TOGETHER=true
ENABLE_IMAGE_GENERATION_REPLICATE=true

# Deploy
make deploy-env
```

---

## Scenario 4: Provider Recovery

### Objective
Verify circuit breaker recovers after timeout and successful request.

### Prerequisites
- Circuit breaker must be in OPEN state (complete Scenario 3 first)
- Valid API key ready for restoration

### Setup

1. **Wait for circuit breaker timeout**:
   - Default timeout: 10 minutes
   - **Option A**: Wait 10 minutes
   - **Option B**: Modify timeout in code for testing (shorter timeout)

2. **Restore valid API key** (do this BEFORE timeout expires):
   ```bash
   # Edit .env
   OPENAI_API_KEY=sk-proj-YOUR_VALID_KEY
   
   # Deploy
   make deploy-env
   ```

### Test Steps

#### Phase 1: Circuit Remains Open

1. **Verify circuit still open** (before timeout):
   ```bash
   curl https://nrw7pperjjdswbmqgmigbwsbyi0rwdqf.lambda-url.us-east-1.on.aws/health-check/image-providers
   ```
   
   Expected:
   ```json
   {
     "providers": {
       "openai": {
         "available": false,
         "circuitBreakerState": "OPEN"
       }
     }
   }
   ```

2. **Attempt generation** (should still be blocked):
   - Type: `"Generate a test image"`
   - Click generate button
   - **Expected**: Immediate error
   - **Expected**: Message: "Circuit breaker OPEN"

#### Phase 2: Timeout Expires

3. **Wait for timeout** (10 minutes from circuit opening)
   - Monitor CloudWatch logs for state transition

4. **Verify circuit enters HALF_OPEN**:
   ```bash
   curl https://nrw7pperjjdswbmqgmigbwsbyi0rwdqf.lambda-url.us-east-1.on.aws/health-check/image-providers
   ```
   
   Expected:
   ```json
   {
     "providers": {
       "openai": {
         "available": true,
         "circuitBreakerState": "HALF_OPEN"
       }
     }
   }
   ```

#### Phase 3: Test Request (Recovery Attempt)

5. **Request image generation**:
   - Type: `"Generate a beautiful landscape"`
   - Click generate button
   - **Expected**: Request allowed (circuit HALF_OPEN)
   - **Expected**: API call made to OpenAI
   - **Expected**: Success (valid key restored)
   - **Expected**: Image generated successfully

6. **Verify circuit closes**:
   ```bash
   curl https://nrw7pperjjdswbmqgmigbwsbyi0rwdqf.lambda-url.us-east-1.on.aws/health-check/image-providers
   ```
   
   Expected:
   ```json
   {
     "providers": {
       "openai": {
         "available": true,
         "circuitBreakerState": "CLOSED",
         "reason": "Provider operational"
       }
     }
   }
   ```

#### Phase 4: Normal Operation Resumed

7. **Make additional requests**:
   - Generate 2-3 more images
   - **Expected**: All succeed normally
   - **Expected**: Circuit remains CLOSED

### Expected Results

✅ **Timeout Respected**: Circuit stays OPEN for full 10 minutes  
✅ **HALF_OPEN State**: Circuit transitions correctly  
✅ **Test Request**: Allowed in HALF_OPEN state  
✅ **Recovery Success**: Circuit closes on successful request  
✅ **Normal Operation**: Subsequent requests work normally  
✅ **State Tracking**: All transitions logged

### Verification Checklist

- [ ] Circuit remains OPEN before timeout
- [ ] Requests blocked during OPEN period
- [ ] Circuit transitions to HALF_OPEN after timeout
- [ ] Test request allowed in HALF_OPEN
- [ ] Circuit closes on successful request
- [ ] Normal operation resumed
- [ ] CloudWatch logs show all state transitions

### CloudWatch Log Verification

Expected log entries:
- `Circuit breaker timeout expired: OPEN -> HALF_OPEN (provider: openai-image)`
- `Circuit breaker test request allowed in HALF_OPEN state`
- `Image generation successful in HALF_OPEN state`
- `Circuit breaker recovery successful: HALF_OPEN -> CLOSED`

### Alternative: Recovery Failure

If the API key is still invalid:
- Test request fails in HALF_OPEN
- Circuit reopens: HALF_OPEN -> OPEN
- Wait another 10 minutes for next recovery attempt

---

## Cost Tracking Verification

### Objective
Verify all image generation costs are tracked accurately.

### Test Steps

1. **Generate multiple images with different providers**:
   - OpenAI DALL-E 3: $0.04
   - Together AI SD-XL: $0.003
   - Replicate SDXL: $0.002

2. **Open LLM Info Dialog**:
   - Click "LLM Info" on any message
   - Scroll through all API calls

3. **Verify each image generation entry**:
   - ✅ Shows "🖼️ Image Generation" label
   - ✅ Provider badge with correct color
   - ✅ Cost displayed: "💰 $X.XXXX"
   - ✅ Metadata chips: size, quality, style
   - ✅ Duration in seconds

4. **Verify total cost calculation**:
   - Check dialog footer
   - **Expected**: Total includes all image generation costs
   - **Expected**: Breakdown by provider visible
   - **Formula**: Sum of all text + image generation costs

5. **Test cost display formats**:
   - DALL-E 3: "$0.0400" (4 decimal places)
   - SD-XL: "$0.0030" (4 decimal places)
   - Verify consistent formatting

### Expected Results

✅ **Individual Costs**: All displayed correctly  
✅ **Total Cost**: Accurate sum  
✅ **Formatting**: Consistent across providers  
✅ **Metadata**: Complete for each generation

---

## UI States Verification

### Objective
Verify all UI states render correctly across different scenarios.

### Test Matrix

| State | Test Action | Expected UI | Verification |
|-------|-------------|-------------|--------------|
| **Pending** | Tool returns button data | Button with cost, provider badge, chips, collapsible sections | ✅ |
| **Generating** | Click button | Spinner with "Generating..." text | ✅ |
| **Complete** | Generation succeeds | Image, metadata chips, action buttons | ✅ |
| **Complete + Fallback** | Generation with fallback | Image + fallback warning badge | ✅ |
| **Error** | Generation fails | Error alert with retry button | ✅ |
| **Error (Circuit Open)** | Circuit breaker blocks | Error with circuit breaker message | ✅ |

### Test Each State

1. **Pending State**:
   - Verify button text includes cost
   - Verify provider badge color matches provider
   - Verify model/quality/size chips present
   - Click constraints: Should expand/collapse
   - Click alternatives: Should expand/collapse

2. **Generating State**:
   - Verify animated spinner (3 pulsing dots)
   - Verify loading text shows provider name
   - Verify button disabled during generation

3. **Complete State**:
   - Verify image loads and displays
   - Verify all metadata chips present
   - Verify prompt text (truncated if long)
   - Verify action buttons clickable

4. **Error State**:
   - Verify error icon and message
   - Verify retry button present
   - Click retry: Should attempt generation again

---

## Performance Metrics

### Measurements

Track the following for each provider:

| Provider | Avg Time | Min Time | Max Time | Success Rate | Cost |
|----------|----------|----------|----------|--------------|------|
| OpenAI DALL-E 3 | ? | ? | ? | ? | $0.04 |
| Together AI SD-XL | ? | ? | ? | ? | $0.003 |
| Replicate SDXL | ? | ? | ? | ? | $0.002 |

### Test Procedure

1. Generate 5 images with each provider
2. Record generation time for each
3. Calculate success rate
4. Note any failures and causes

---

## Test Report Template

```markdown
# Image Generation Test Report

**Date**: 2025-10-12  
**Tester**: [Name]  
**Environment**: Production Lambda

## Scenario Results

### ✅ Scenario 1: All Providers Available
- Status: PASS
- Provider: OpenAI DALL-E 3
- Generation Time: 4.2s
- Cost: $0.04
- Notes: Image quality excellent

### ✅ Scenario 2: Provider Fallback
- Status: PASS
- Primary: OpenAI (disabled)
- Fallback: Together AI
- Generation Time: 2.8s
- Cost: $0.003
- Fallback Warning: Displayed correctly
- Notes: Seamless fallback experience

### ✅ Scenario 3: Circuit Breaker
- Status: PASS
- Failures to Open: 5
- Blocking Time: <1ms
- State Transitions: CLOSED -> OPEN
- Notes: Circuit opened correctly after 5 failures

### ✅ Scenario 4: Provider Recovery
- Status: PASS
- Timeout: 10 minutes
- State Transitions: OPEN -> HALF_OPEN -> CLOSED
- Recovery: Successful
- Notes: Normal operation resumed

## Issues Found

1. [Issue description]
   - Severity: High/Medium/Low
   - Steps to reproduce:
   - Expected:
   - Actual:

## Performance Summary

- Average Generation Time: 3.5s
- Success Rate: 95%
- Fallback Rate: 5%
- Circuit Breaker Triggers: 0

## Recommendations

1. [Recommendation]
2. [Recommendation]

## Sign-off

Tested by: [Name]  
Date: 2025-10-12  
Status: Ready for Production
```

---

## Automated Testing (Optional)

### Integration Test Structure

Create `tests/integration/image-generation.test.js`:

```javascript
describe('Image Generation Integration Tests', () => {
  
  describe('Provider Availability', () => {
    it('should select OpenAI when all providers available', async () => {
      // Test implementation
    });
    
    it('should fallback to Together AI when OpenAI unavailable', async () => {
      // Test implementation
    });
  });
  
  describe('Circuit Breaker', () => {
    it('should open circuit after 5 failures', async () => {
      // Test implementation
    });
    
    it('should block requests when circuit open', async () => {
      // Test implementation
    });
    
    it('should transition to HALF_OPEN after timeout', async () => {
      // Test implementation
    });
    
    it('should close circuit on successful recovery', async () => {
      // Test implementation
    });
  });
  
  describe('Cost Calculation', () => {
    it('should calculate correct cost for DALL-E 3', async () => {
      // Test implementation
    });
    
    it('should track costs in LLM API calls', async () => {
      // Test implementation
    });
  });
});
```

---

## Conclusion

This testing guide covers all critical scenarios for the image generation feature. Complete each scenario in order, document results, and file issues for any failures found.

**Next Steps After Testing**:
1. Complete all 4 scenarios
2. Fill out test report
3. File issues for any bugs found
4. Update documentation based on findings
5. Mark Task 17 as complete

