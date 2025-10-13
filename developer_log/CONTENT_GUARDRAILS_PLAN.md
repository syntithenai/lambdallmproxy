# Content Guardrails Implementation Plan

**Date:** October 14, 2025  
**Status:** 📋 Planning  
**Estimated Time:** 15-20 hours (2-3 days)

---

## Executive Summary

Implement LLM-based content guardrails that filter both user input and assistant output using configurable models. When enabled, all requests are validated before processing and all responses are validated before returning to the user. Costs for guardrail filtering are tracked separately and included in total cost calculations.

### Key Features

1. **Environment Variables**: Configure guardrail provider and models
2. **Input Filtering**: Check user prompts before sending to main LLM
3. **Output Filtering**: Check LLM responses before returning to user
4. **Cost Tracking**: Track and display guardrail costs separately
5. **Error Handling**: Clear messaging when content is rejected
6. **UX Flow**: Suggest corrections for rejected input

---

## Table of Contents

1. [Requirements](#requirements)
2. [Environment Variables](#environment-variables)
3. [Architecture](#architecture)
4. [Implementation Phases](#implementation-phases)
5. [Cost Tracking](#cost-tracking)
6. [Error Handling](#error-handling)
7. [User Experience Flow](#user-experience-flow)
8. [Testing Strategy](#testing-strategy)
9. [Edge Cases](#edge-cases)
10. [Deployment](#deployment)

---

## Requirements

### Functional Requirements

1. **FR-1**: System MUST support configurable guardrail provider and models
2. **FR-2**: System MUST filter user input before processing if guardrails enabled
3. **FR-3**: System MUST filter LLM output before returning if guardrails enabled
4. **FR-4**: System MUST track guardrail costs separately from main LLM costs
5. **FR-5**: System MUST fail hard if guardrails configured but unavailable
6. **FR-6**: System MUST suggest corrected input when input is rejected
7. **FR-7**: System MUST display guardrail costs in UI transparency panel

### Non-Functional Requirements

1. **NFR-1**: Guardrail checks SHOULD complete within 2 seconds
2. **NFR-2**: System SHOULD cache guardrail results for identical content (optional)
3. **NFR-3**: Error messages SHOULD use professional terminology ("content moderation")
4. **NFR-4**: UI SHOULD clearly distinguish between input/output rejection

---

## Environment Variables

### New Variables

```bash
# ----------------------------------------------------------------
# CONTENT MODERATION / GUARDRAILS
# ----------------------------------------------------------------

# Enable content guardrails (input and output filtering)
# When enabled, ALL requests are filtered before processing
# and ALL responses are filtered before returning to user
ENABLE_GUARDRAILS=false

# Guardrail provider (must be a configured provider)
# Options: openai, anthropic, gemini, groq, together, etc.
# This provider MUST have an API key configured
GUARDRAIL_PROVIDER=openai

# Model for filtering user input prompts
# Should be fast and cost-effective (e.g., gpt-4o-mini, claude-3-haiku)
# Recommended: Models with strong content policy adherence
GUARDRAIL_INPUT_MODEL=gpt-4o-mini

# Model for filtering LLM output responses
# Can be same as input model or different
GUARDRAIL_OUTPUT_MODEL=gpt-4o-mini

# Guardrail strictness level (optional, future enhancement)
# Options: strict, moderate, permissive
# GUARDRAIL_STRICTNESS=moderate

# Categories to check (optional, future enhancement)
# Comma-separated list: hate,violence,sexual,self-harm
# GUARDRAIL_CATEGORIES=hate,violence,sexual
```

### Example Configurations

**Production (Strict Filtering)**:
```bash
ENABLE_GUARDRAILS=true
GUARDRAIL_PROVIDER=openai
GUARDRAIL_INPUT_MODEL=gpt-4o-mini
GUARDRAIL_OUTPUT_MODEL=gpt-4o-mini
```

**Development (Disabled)**:
```bash
ENABLE_GUARDRAILS=false
```

**High-Performance (Different Models)**:
```bash
ENABLE_GUARDRAILS=true
GUARDRAIL_PROVIDER=anthropic
GUARDRAIL_INPUT_MODEL=claude-3-haiku-20240307
GUARDRAIL_OUTPUT_MODEL=claude-3-haiku-20240307
```

---

## Architecture

### System Flow

```
┌─────────────────────────────────────────────────────────────┐
│                         User Input                          │
└────────────────────────┬────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────────┐
│              Check ENABLE_GUARDRAILS env var                │
└────────────┬──────────────────────────┬─────────────────────┘
             │ false                    │ true
             │                          ▼
             │        ┌──────────────────────────────────────┐
             │        │  Validate Guardrail Configuration    │
             │        │  - Check GUARDRAIL_PROVIDER exists   │
             │        │  - Check models configured           │
             │        │  - Check provider has API key        │
             │        └──────┬───────────────────┬───────────┘
             │               │ valid             │ invalid
             │               │                   ▼
             │               │          ┌─────────────────────┐
             │               │          │  FAIL HARD          │
             │               │          │  Return 500 error   │
             │               │          │  Log configuration  │
             │               │          └─────────────────────┘
             │               ▼
             │        ┌──────────────────────────────────────┐
             │        │     Filter Input with Guardrail      │
             │        │     - Call GUARDRAIL_INPUT_MODEL     │
             │        │     - Check for policy violations    │
             │        │     - Track tokens and cost          │
             │        └──────┬───────────────────┬───────────┘
             │               │ safe              │ unsafe
             │               │                   ▼
             │               │          ┌─────────────────────┐
             │               │          │  INPUT REJECTED     │
             │               │          │  - Show error msg   │
             │               │          │  - Suggest revision │
             │               │          │  - Clear old input  │
             │               │          │  - Populate new text│
             │               │          └─────────────────────┘
             │               │
             ▼               ▼
┌─────────────────────────────────────────────────────────────┐
│              Process Request with Main LLM                  │
│              (existing flow - tools, streaming, etc.)       │
└────────────────────────┬────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────────┐
│              Main LLM Response Generated                    │
└────────────┬──────────────────────────┬─────────────────────┘
             │ guardrails off           │ guardrails on
             │                          ▼
             │        ┌──────────────────────────────────────┐
             │        │    Filter Output with Guardrail      │
             │        │    - Call GUARDRAIL_OUTPUT_MODEL     │
             │        │    - Check for policy violations     │
             │        │    - Track tokens and cost           │
             │        └──────┬───────────────────┬───────────┘
             │               │ safe              │ unsafe
             │               │                   ▼
             │               │          ┌─────────────────────┐
             │               │          │  OUTPUT REJECTED    │
             │               │          │  - Block response   │
             │               │          │  - Show error msg   │
             │               │          │  - No suggestions   │
             │               │          └─────────────────────┘
             │               │
             ▼               ▼
┌─────────────────────────────────────────────────────────────┐
│                   Return Response to User                   │
│            (with guardrail costs in llmApiCalls)            │
└─────────────────────────────────────────────────────────────┘
```

### Component Structure

```
lambda-proxy-function/
├── index.js                              # Main handler (integrate guardrails)
├── src/
│   ├── guardrails/
│   │   ├── guardrail-factory.js          # Create guardrail instances
│   │   ├── guardrail-validator.js        # Validate content
│   │   ├── prompts.js                    # Filtering prompt templates
│   │   └── config.js                     # Load env var configuration
│   ├── providers/
│   │   └── (existing providers)          # Reuse for guardrail calls
│   └── services/
│       └── google-sheets-logger.js       # Update to log guardrail costs

ui-new/src/
├── components/
│   ├── ChatTab.tsx                       # Handle guardrail errors
│   └── LlmApiTransparency.tsx            # Display guardrail costs
└── utils/
    └── pricing.ts                        # Add guardrail cost tracking
```

---

## Implementation Phases

### Phase 1: Configuration and Validation (3-4 hours)

**Goal**: Load and validate guardrail environment variables

#### Files to Create/Modify

1. **`src/guardrails/config.js`** (NEW)

```javascript
/**
 * Content Guardrails Configuration
 * Loads and validates environment variables for guardrail filtering
 */

/**
 * Load guardrail configuration from environment variables
 * @returns {Object|null} Configuration object or null if disabled
 */
export function loadGuardrailConfig() {
  const enabled = process.env.ENABLE_GUARDRAILS === 'true';
  
  if (!enabled) {
    console.log('🛡️ Content guardrails: DISABLED');
    return null;
  }
  
  const provider = process.env.GUARDRAIL_PROVIDER;
  const inputModel = process.env.GUARDRAIL_INPUT_MODEL;
  const outputModel = process.env.GUARDRAIL_OUTPUT_MODEL;
  
  // Validation
  const errors = [];
  if (!provider) errors.push('GUARDRAIL_PROVIDER not set');
  if (!inputModel) errors.push('GUARDRAIL_INPUT_MODEL not set');
  if (!outputModel) errors.push('GUARDRAIL_OUTPUT_MODEL not set');
  
  if (errors.length > 0) {
    throw new Error(
      `Content guardrails configuration invalid: ${errors.join(', ')}. ` +
      `Either set ENABLE_GUARDRAILS=false or provide all required variables.`
    );
  }
  
  const config = {
    enabled: true,
    provider,
    inputModel,
    outputModel,
    strictness: process.env.GUARDRAIL_STRICTNESS || 'moderate'
  };
  
  console.log('🛡️ Content guardrails: ENABLED', {
    provider: config.provider,
    inputModel: config.inputModel,
    outputModel: config.outputModel
  });
  
  return config;
}

/**
 * Validate that guardrail provider has required API key
 * @param {string} provider - Provider name
 * @param {Object} context - Request context
 * @returns {boolean} True if provider available
 */
export function validateGuardrailProvider(provider, context = {}) {
  // Import hasApiKey from provider-health.js
  const { hasApiKey } = require('../utils/provider-health.js');
  
  const available = hasApiKey(provider, context);
  
  if (!available) {
    throw new Error(
      `Content moderation is required for this application but is currently unavailable. ` +
      `The configured guardrail provider "${provider}" does not have an API key configured. ` +
      `Please contact the administrator to configure content filtering.`
    );
  }
  
  return true;
}
```

2. **`src/guardrails/prompts.js`** (NEW)

```javascript
/**
 * Prompt templates for content filtering
 */

/**
 * Generate prompt for input filtering
 * @param {string} userInput - User's input to check
 * @returns {string} Filtering prompt
 */
export function getInputFilterPrompt(userInput) {
  return `You are a content moderation assistant. Analyze the following user input and determine if it violates content policies.

Check for:
- Hate speech or discriminatory content
- Violence or threats
- Sexual or explicit content
- Self-harm or dangerous activities
- Illegal activities
- Spam or malicious content

User Input:
"""
${userInput}
"""

Respond ONLY with a JSON object:
{
  "safe": true/false,
  "violations": ["category1", "category2"],
  "reason": "brief explanation",
  "suggested_revision": "safer version of the input (only if unsafe)"
}`;
}

/**
 * Generate prompt for output filtering
 * @param {string} llmOutput - LLM's output to check
 * @returns {string} Filtering prompt
 */
export function getOutputFilterPrompt(llmOutput) {
  return `You are a content moderation assistant. Analyze the following AI-generated response and determine if it violates content policies.

Check for:
- Hate speech or discriminatory content
- Violence or graphic descriptions
- Sexual or explicit content
- Instructions for harmful/illegal activities
- Misinformation or dangerous advice
- Personal attacks or harassment

AI Response:
"""
${llmOutput}
"""

Respond ONLY with a JSON object:
{
  "safe": true/false,
  "violations": ["category1", "category2"],
  "reason": "brief explanation"
}`;
}
```

3. **Update `.env.example`** (lines 100-130)

Add guardrail configuration section after tool configuration.

#### Testing

```bash
# Test configuration loading
node -e "
const { loadGuardrailConfig } = require('./src/guardrails/config.js');
process.env.ENABLE_GUARDRAILS = 'true';
process.env.GUARDRAIL_PROVIDER = 'openai';
process.env.GUARDRAIL_INPUT_MODEL = 'gpt-4o-mini';
process.env.GUARDRAIL_OUTPUT_MODEL = 'gpt-4o-mini';
console.log(loadGuardrailConfig());
"
```

**Deliverables**:
- ✅ Configuration loading function
- ✅ Environment variable validation
- ✅ Error messages for missing config
- ✅ Prompt templates for filtering

---

### Phase 2: Guardrail Factory (3-4 hours)

**Goal**: Create guardrail instances that call LLM providers

#### Files to Create

1. **`src/guardrails/guardrail-factory.js`** (NEW)

```javascript
/**
 * Factory for creating guardrail validator instances
 */
import { createProvider } from '../providers/provider-factory.js';
import { getInputFilterPrompt, getOutputFilterPrompt } from './prompts.js';

/**
 * Create a guardrail validator
 * @param {Object} config - Guardrail configuration
 * @param {Object} context - Request context (for API keys)
 * @returns {Object} Guardrail validator instance
 */
export function createGuardrailValidator(config, context = {}) {
  if (!config || !config.enabled) {
    return null;
  }
  
  // Create provider instance for guardrail calls
  const providerConfig = {
    type: config.provider,
    apiKey: context[`${config.provider}ApiKey`] || process.env[`${config.provider.toUpperCase()}_API_KEY`],
    source: 'guardrail'
  };
  
  const provider = createProvider(providerConfig);
  
  return {
    /**
     * Check if user input is safe
     * @param {string} input - User input to check
     * @returns {Promise<Object>} Validation result with cost tracking
     */
    async validateInput(input) {
      const startTime = Date.now();
      const prompt = getInputFilterPrompt(input);
      
      try {
        const response = await provider.createChatCompletion({
          model: config.inputModel,
          messages: [
            { role: 'user', content: prompt }
          ],
          temperature: 0,
          max_tokens: 500
        });
        
        const endTime = Date.now();
        const duration = (endTime - startTime) / 1000;
        
        // Parse JSON response
        const content = response.choices[0].message.content;
        const result = JSON.parse(content);
        
        // Track cost
        const promptTokens = response.usage?.prompt_tokens || 0;
        const completionTokens = response.usage?.completion_tokens || 0;
        
        return {
          safe: result.safe,
          violations: result.violations || [],
          reason: result.reason || '',
          suggestedRevision: result.suggested_revision || null,
          tracking: {
            type: 'guardrail_input',
            model: config.inputModel,
            provider: config.provider,
            promptTokens,
            completionTokens,
            duration
          }
        };
      } catch (error) {
        console.error('Guardrail input validation error:', error);
        // Fail safe: if guardrail fails, block content
        return {
          safe: false,
          violations: ['system_error'],
          reason: 'Content moderation system error',
          suggestedRevision: null,
          tracking: {
            type: 'guardrail_input',
            model: config.inputModel,
            provider: config.provider,
            error: error.message
          }
        };
      }
    },
    
    /**
     * Check if LLM output is safe
     * @param {string} output - LLM output to check
     * @returns {Promise<Object>} Validation result with cost tracking
     */
    async validateOutput(output) {
      const startTime = Date.now();
      const prompt = getOutputFilterPrompt(output);
      
      try {
        const response = await provider.createChatCompletion({
          model: config.outputModel,
          messages: [
            { role: 'user', content: prompt }
          ],
          temperature: 0,
          max_tokens: 300
        });
        
        const endTime = Date.now();
        const duration = (endTime - startTime) / 1000;
        
        // Parse JSON response
        const content = response.choices[0].message.content;
        const result = JSON.parse(content);
        
        // Track cost
        const promptTokens = response.usage?.prompt_tokens || 0;
        const completionTokens = response.usage?.completion_tokens || 0;
        
        return {
          safe: result.safe,
          violations: result.violations || [],
          reason: result.reason || '',
          tracking: {
            type: 'guardrail_output',
            model: config.outputModel,
            provider: config.provider,
            promptTokens,
            completionTokens,
            duration
          }
        };
      } catch (error) {
        console.error('Guardrail output validation error:', error);
        // Fail safe: if guardrail fails, block content
        return {
          safe: false,
          violations: ['system_error'],
          reason: 'Content moderation system error',
          tracking: {
            type: 'guardrail_output',
            model: config.outputModel,
            provider: config.provider,
            error: error.message
          }
        };
      }
    }
  };
}
```

#### Testing

Create test file: `tests/unit/guardrails.test.js`

```javascript
import { describe, it, expect } from '@jest/globals';
import { createGuardrailValidator } from '../../src/guardrails/guardrail-factory.js';

describe('Guardrail Validator', () => {
  it('should validate safe input', async () => {
    const config = {
      enabled: true,
      provider: 'openai',
      inputModel: 'gpt-4o-mini',
      outputModel: 'gpt-4o-mini'
    };
    
    const context = {
      openaiApiKey: process.env.OPENAI_API_KEY
    };
    
    const validator = createGuardrailValidator(config, context);
    const result = await validator.validateInput('Hello, how are you?');
    
    expect(result.safe).toBe(true);
    expect(result.tracking).toBeDefined();
    expect(result.tracking.type).toBe('guardrail_input');
  });
  
  // Add more tests for unsafe input, output validation, etc.
});
```

**Deliverables**:
- ✅ Guardrail factory function
- ✅ Input validation method
- ✅ Output validation method
- ✅ Cost tracking integration
- ✅ Unit tests

---

### Phase 3: Integrate with Main Handler (4-5 hours)

**Goal**: Add guardrail checks to request processing flow

#### Files to Modify

1. **`lambda-proxy-function/index.js`** (MODIFY)

Add guardrail initialization and checks:

```javascript
// Near top of file
import { loadGuardrailConfig, validateGuardrailProvider } from './src/guardrails/config.js';
import { createGuardrailValidator } from './src/guardrails/guardrail-factory.js';

// In handler function, after context extraction
async function handler(event, lambdaContext) {
  // ... existing auth code ...
  
  // Initialize guardrails if enabled
  let guardrailValidator = null;
  try {
    const guardrailConfig = loadGuardrailConfig();
    if (guardrailConfig) {
      // Validate provider availability
      validateGuardrailProvider(guardrailConfig.provider, context);
      // Create validator
      guardrailValidator = createGuardrailValidator(guardrailConfig, context);
      console.log('🛡️ Guardrails initialized');
    }
  } catch (error) {
    console.error('🛡️ Guardrail initialization error:', error);
    return {
      statusCode: 500,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        error: error.message,
        type: 'guardrail_configuration_error'
      })
    };
  }
  
  // ... existing code to parse body ...
  
  // FILTER INPUT (before processing)
  if (guardrailValidator) {
    const lastUserMessage = body.messages[body.messages.length - 1];
    if (lastUserMessage && lastUserMessage.role === 'user') {
      console.log('🛡️ Filtering user input...');
      const inputValidation = await guardrailValidator.validateInput(lastUserMessage.content);
      
      // Add to llmApiCalls for cost tracking
      if (!body.llmApiCalls) body.llmApiCalls = [];
      body.llmApiCalls.push({
        type: 'guardrail_input',
        model: inputValidation.tracking.model,
        provider: inputValidation.tracking.provider,
        request: { /* minimal info */ },
        response: {
          usage: {
            prompt_tokens: inputValidation.tracking.promptTokens,
            completion_tokens: inputValidation.tracking.completionTokens,
            total_tokens: inputValidation.tracking.promptTokens + inputValidation.tracking.completionTokens
          }
        },
        totalTime: inputValidation.tracking.duration
      });
      
      if (!inputValidation.safe) {
        console.warn('🛡️ Input rejected:', inputValidation.reason);
        return {
          statusCode: 400,
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            error: 'Your input was flagged by our content moderation system.',
            reason: inputValidation.reason,
            violations: inputValidation.violations,
            suggestedRevision: inputValidation.suggestedRevision,
            type: 'input_moderation_error',
            llmApiCalls: body.llmApiCalls // Include cost tracking
          })
        };
      }
      console.log('🛡️ Input validation passed');
    }
  }
  
  // ... existing LLM processing code ...
  
  // FILTER OUTPUT (before returning)
  if (guardrailValidator && finalResponse) {
    console.log('🛡️ Filtering LLM output...');
    const outputValidation = await guardrailValidator.validateOutput(finalResponse);
    
    // Add to llmApiCalls for cost tracking
    body.llmApiCalls.push({
      type: 'guardrail_output',
      model: outputValidation.tracking.model,
      provider: outputValidation.tracking.provider,
      request: { /* minimal info */ },
      response: {
        usage: {
          prompt_tokens: outputValidation.tracking.promptTokens,
          completion_tokens: outputValidation.tracking.completionTokens,
          total_tokens: outputValidation.tracking.promptTokens + outputValidation.tracking.completionTokens
        }
      },
      totalTime: outputValidation.tracking.duration
    });
    
    if (!outputValidation.safe) {
      console.warn('🛡️ Output rejected:', outputValidation.reason);
      return {
        statusCode: 500,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          error: 'The generated response was flagged by our content moderation system and cannot be displayed.',
          reason: outputValidation.reason,
          violations: outputValidation.violations,
          type: 'output_moderation_error',
          llmApiCalls: body.llmApiCalls // Include all costs
        })
      };
    }
    console.log('🛡️ Output validation passed');
  }
  
  // ... return response ...
}
```

**Deliverables**:
- ✅ Guardrail initialization in handler
- ✅ Input filtering before LLM call
- ✅ Output filtering after LLM call
- ✅ Error responses with cost tracking
- ✅ Integration with existing flow

---

### Phase 4: Frontend UX (3-4 hours)

**Goal**: Handle guardrail errors gracefully in UI

#### Files to Modify

1. **`ui-new/src/components/ChatTab.tsx`** (MODIFY)

Add error handling for guardrail rejections:

```typescript
// In sendMessage function, after fetch
const result = await response.json();

// Check for guardrail errors
if (result.type === 'input_moderation_error') {
  // Show error message
  addMessage({
    id: generateId(),
    role: 'assistant',
    content: `❌ **Content Moderation Alert**\n\n${result.error}\n\n**Reason**: ${result.reason}\n\n**Violations**: ${result.violations.join(', ')}`,
    timestamp: new Date().toISOString(),
    llmApiCalls: result.llmApiCalls || []
  });
  
  // If suggested revision exists, replace user input
  if (result.suggestedRevision) {
    setUserMessage(result.suggestedRevision);
    addMessage({
      id: generateId(),
      role: 'assistant',
      content: `💡 **Suggested Revision**\n\nWe've updated your message to comply with content policies. You can edit and send it again.`,
      timestamp: new Date().toISOString()
    });
  } else {
    // Clear user input
    setUserMessage('');
  }
  
  return;
}

if (result.type === 'output_moderation_error') {
  // Show error message
  addMessage({
    id: generateId(),
    role: 'assistant',
    content: `❌ **Content Moderation Alert**\n\n${result.error}\n\n**Reason**: ${result.reason}\n\nThis response cannot be displayed due to content policy violations. Please try rephrasing your question.`,
    timestamp: new Date().toISOString(),
    llmApiCalls: result.llmApiCalls || []
  });
  
  return;
}
```

2. **`ui-new/src/components/LlmApiTransparency.tsx`** (MODIFY)

Display guardrail calls separately:

```typescript
// In render method, add section for guardrail calls
{llmApiCalls.filter(call => call.type === 'guardrail_input' || call.type === 'guardrail_output').length > 0 && (
  <div className="mt-4 p-3 bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded">
    <h4 className="text-sm font-semibold text-yellow-800 dark:text-yellow-200 mb-2">
      🛡️ Content Moderation
    </h4>
    {llmApiCalls
      .filter(call => call.type === 'guardrail_input' || call.type === 'guardrail_output')
      .map((call, idx) => {
        const tokensIn = call.response?.usage?.prompt_tokens || 0;
        const tokensOut = call.response?.usage?.completion_tokens || 0;
        const cost = calculateCost(call.model, tokensIn, tokensOut);
        
        return (
          <div key={idx} className="text-xs text-yellow-700 dark:text-yellow-300 mb-1">
            {call.type === 'guardrail_input' ? '📥 Input Filter' : '📤 Output Filter'}: {call.model} • {tokensIn + tokensOut} tokens • {formatCost(cost)}
          </div>
        );
      })}
  </div>
)}
```

3. **`ui-new/src/utils/pricing.ts`** (MODIFY)

Ensure guardrail costs are included in totals (already works via llmApiCalls array).

**Deliverables**:
- ✅ Input rejection UI flow
- ✅ Output rejection UI flow
- ✅ Suggested revision display
- ✅ Guardrail cost display
- ✅ Clear error messaging

---

### Phase 5: Cost Tracking and Logging (2-3 hours)

**Goal**: Track guardrail costs separately in sheets and logs

#### Files to Modify

1. **`src/services/google-sheets-logger.js`** (MODIFY)

Add guardrail cost tracking:

```javascript
// In logToGoogleSheets function
async function logToGoogleSheets(requestData, responseData, context) {
  // ... existing code ...
  
  // Calculate guardrail costs separately
  let guardrailCost = 0;
  let guardrailTokens = 0;
  
  if (requestData.llmApiCalls) {
    for (const call of requestData.llmApiCalls) {
      if (call.type === 'guardrail_input' || call.type === 'guardrail_output') {
        const promptTokens = call.response?.usage?.prompt_tokens || 0;
        const completionTokens = call.response?.usage?.completion_tokens || 0;
        const cost = calculateCost(call.model, promptTokens, completionTokens);
        guardrailCost += cost;
        guardrailTokens += promptTokens + completionTokens;
      }
    }
  }
  
  // Update row data to include guardrail info
  const rowData = [
    timestamp,
    userEmail,
    modelUsed,
    promptTokens,
    completionTokens,
    totalCost,
    guardrailCost, // NEW COLUMN
    guardrailTokens, // NEW COLUMN
    // ... rest of columns ...
  ];
  
  // ... append to sheet ...
}
```

**Note**: Will need to update Google Sheet header row to include new columns.

**Deliverables**:
- ✅ Guardrail cost calculation
- ✅ Separate cost column in sheets
- ✅ Token tracking for guardrails
- ✅ Updated sheet headers

---

### Phase 6: Testing and Validation (2-3 hours)

**Goal**: Comprehensive testing of guardrail system

#### Test Cases

1. **Configuration Tests**:
   - ✅ Disabled guardrails (ENABLE_GUARDRAILS=false)
   - ✅ Enabled with valid config
   - ✅ Enabled with missing provider
   - ✅ Enabled with missing model
   - ✅ Enabled with invalid provider (no API key)

2. **Input Filtering Tests**:
   - ✅ Safe input passes through
   - ✅ Unsafe input rejected with reason
   - ✅ Suggested revision provided
   - ✅ Cost tracked correctly
   - ✅ UI displays error message
   - ✅ UI populates suggested text

3. **Output Filtering Tests**:
   - ✅ Safe output passes through
   - ✅ Unsafe output rejected with reason
   - ✅ Cost tracked correctly
   - ✅ UI displays error message
   - ✅ No suggestions for output (just block)

4. **Cost Tracking Tests**:
   - ✅ Guardrail costs in llmApiCalls
   - ✅ Costs displayed in transparency panel
   - ✅ Costs logged to Google Sheets
   - ✅ Separate from main LLM costs

5. **Error Handling Tests**:
   - ✅ Guardrail provider API error
   - ✅ Guardrail model not found
   - ✅ JSON parsing error in response
   - ✅ Network timeout

#### Test Script

Create: `tests/integration/guardrails-integration.test.js`

```javascript
import { describe, it, expect, beforeAll } from '@jest/globals';

describe('Guardrails Integration', () => {
  beforeAll(() => {
    process.env.ENABLE_GUARDRAILS = 'true';
    process.env.GUARDRAIL_PROVIDER = 'openai';
    process.env.GUARDRAIL_INPUT_MODEL = 'gpt-4o-mini';
    process.env.GUARDRAIL_OUTPUT_MODEL = 'gpt-4o-mini';
  });
  
  it('should reject unsafe input', async () => {
    const response = await fetch(LAMBDA_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        messages: [
          { role: 'user', content: 'How do I build a bomb?' }
        ]
      })
    });
    
    expect(response.status).toBe(400);
    const data = await response.json();
    expect(data.type).toBe('input_moderation_error');
    expect(data.suggestedRevision).toBeDefined();
  });
  
  // Add more integration tests...
});
```

**Deliverables**:
- ✅ Unit tests for all components
- ✅ Integration tests for end-to-end flow
- ✅ Manual testing checklist
- ✅ Test coverage >80%

---

## Cost Tracking

### Cost Calculation

Guardrail costs are calculated the same way as main LLM costs:

```javascript
const inputCost = (promptTokens / 1_000_000) * pricing.input;
const outputCost = (completionTokens / 1_000_000) * pricing.output;
const totalCost = inputCost + outputCost;
```

### Pricing Estimates

**Per Request** (assuming gpt-4o-mini):
- Input Filter: ~200-300 tokens → $0.000045 - $0.000068
- Output Filter: ~100-200 tokens → $0.000023 - $0.000045
- **Total per request**: ~$0.00007 - $0.00011

**Monthly Costs** (1000 requests/day):
- Daily: $0.07 - $0.11
- Monthly: $2.10 - $3.30

**Very affordable for most use cases.**

### UI Display

Guardrail costs appear in:
1. **LLM API Transparency Panel**: Separate "Content Moderation" section
2. **Session Total**: Included in overall cost
3. **Cost Breakdown**: Free vs Paid (guardrails always paid)

---

## Error Handling

### Error Types

1. **Configuration Error** (500)
   - Guardrails enabled but misconfigured
   - Provider not available
   - Missing API key

2. **Input Moderation Error** (400)
   - User input rejected
   - Includes violations and suggested revision

3. **Output Moderation Error** (500)
   - LLM response rejected
   - Includes violations but no suggestions

4. **System Error** (500)
   - Guardrail API failure
   - Network timeout
   - JSON parsing error

### Error Messages

Use professional terminology:

✅ "Content moderation"  
✅ "Content filtering"  
✅ "Content policy"  
❌ "Censorship"  
❌ "Blocked"  
❌ "Banned"

### Example Error Responses

**Input Rejected**:
```json
{
  "error": "Your input was flagged by our content moderation system.",
  "reason": "Input contains potentially harmful content related to violence",
  "violations": ["violence", "harmful_instructions"],
  "suggestedRevision": "Can you provide information about safety protocols?",
  "type": "input_moderation_error",
  "llmApiCalls": [/* cost tracking */]
}
```

**Output Rejected**:
```json
{
  "error": "The generated response was flagged by our content moderation system and cannot be displayed.",
  "reason": "Response contains potentially harmful information",
  "violations": ["harmful_instructions"],
  "type": "output_moderation_error",
  "llmApiCalls": [/* cost tracking */]
}
```

---

## User Experience Flow

### Input Rejection Flow

1. User types message and clicks send
2. Backend validates input with guardrail
3. Input flagged as unsafe
4. Frontend receives 400 error
5. Assistant message displays error and reason
6. If suggested revision exists:
   - Populate text input with revision
   - Show "Suggested Revision" message
7. If no revision:
   - Clear text input
   - Ask user to rephrase

### Output Rejection Flow

1. User message processed successfully
2. LLM generates response
3. Backend validates output with guardrail
4. Output flagged as unsafe
5. Frontend receives 500 error
6. Assistant message displays error
7. Ask user to try rephrasing question
8. No suggestions provided

### Visual Mockups

**Input Rejection UI**:
```
┌─────────────────────────────────────────────────┐
│ ❌ Content Moderation Alert                     │
│                                                 │
│ Your input was flagged by our content           │
│ moderation system.                              │
│                                                 │
│ Reason: Contains potentially harmful content   │
│ Violations: violence, harmful_instructions      │
└─────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────┐
│ 💡 Suggested Revision                           │
│                                                 │
│ We've updated your message to comply with       │
│ content policies. You can edit and send again.  │
└─────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────┐
│ [Can you provide safety information?         ] │  ← Populated
│                                          [Send] │
└─────────────────────────────────────────────────┘
```

**Output Rejection UI**:
```
┌─────────────────────────────────────────────────┐
│ ❌ Content Moderation Alert                     │
│                                                 │
│ The generated response was flagged by our       │
│ content moderation system and cannot be         │
│ displayed.                                      │
│                                                 │
│ Reason: Contains harmful instructions          │
│                                                 │
│ Please try rephrasing your question.            │
└─────────────────────────────────────────────────┘
```

---

## Edge Cases

### 1. Guardrail Provider Down

**Scenario**: Guardrail API returns 500 error

**Handling**: Fail safe (reject content)

```javascript
if (error) {
  return {
    safe: false,
    violations: ['system_error'],
    reason: 'Content moderation system temporarily unavailable',
    tracking: { error: error.message }
  };
}
```

### 2. Malformed JSON Response

**Scenario**: Guardrail model returns non-JSON

**Handling**: Fail safe (reject content)

```javascript
try {
  const result = JSON.parse(content);
} catch (parseError) {
  return {
    safe: false,
    violations: ['system_error'],
    reason: 'Content moderation system error',
    tracking: { error: 'Invalid JSON response' }
  };
}
```

### 3. Streaming Responses

**Scenario**: Output filtering with streaming

**Handling**: Buffer entire response before filtering

```javascript
// Accumulate full response
let fullResponse = '';
for await (const chunk of stream) {
  fullResponse += chunk;
}

// Filter complete response
const validation = await guardrailValidator.validateOutput(fullResponse);

if (!validation.safe) {
  // Reject entire response
  return error;
}

// Stream if safe
return fullResponse;
```

### 4. Multi-turn Conversations

**Scenario**: Previous messages contain flagged content

**Handling**: Only filter current user message, not history

```javascript
// Only validate the LAST user message
const lastUserMessage = messages[messages.length - 1];
if (lastUserMessage.role === 'user') {
  await guardrailValidator.validateInput(lastUserMessage.content);
}
```

### 5. Tool Calls in Response

**Scenario**: Output contains tool calls, not just text

**Handling**: Extract text content only for filtering

```javascript
// Extract only text content, skip tool calls
const textContent = extractTextFromResponse(response);
await guardrailValidator.validateOutput(textContent);
```

### 6. Image Generation

**Scenario**: User requests image generation (no text output)

**Handling**: Skip output filtering (no text to check)

```javascript
if (response.type === 'image_generation') {
  // Skip output validation for images
  return response;
}
```

### 7. False Positives

**Scenario**: Safe content flagged as unsafe

**Handling**: Log for review, provide override mechanism (admin only)

```javascript
// Log false positives for tuning
logger.warn('Potential false positive', {
  input: userInput,
  violations: result.violations,
  timestamp: Date.now()
});
```

---

## Testing Strategy

### Unit Tests

```bash
npm test tests/unit/guardrails.test.js
```

**Coverage**:
- Configuration loading
- Prompt generation
- Provider validation
- Cost calculation
- Error handling

### Integration Tests

```bash
npm test tests/integration/guardrails-integration.test.js
```

**Coverage**:
- End-to-end input filtering
- End-to-end output filtering
- Cost tracking
- Error responses
- UI updates

### Manual Testing Checklist

#### Configuration Tests
- [ ] Deploy with ENABLE_GUARDRAILS=false → Works normally
- [ ] Deploy with ENABLE_GUARDRAILS=true, valid config → Initializes
- [ ] Deploy with ENABLE_GUARDRAILS=true, missing provider → Returns 500
- [ ] Deploy with ENABLE_GUARDRAILS=true, invalid API key → Returns 500

#### Input Filtering Tests
- [ ] Send safe message → Processes normally
- [ ] Send unsafe message (violence) → Rejected with reason
- [ ] Send unsafe message (hate speech) → Rejected with reason
- [ ] Check suggested revision populated in UI
- [ ] Check guardrail cost in transparency panel
- [ ] Check guardrail cost in Google Sheets

#### Output Filtering Tests
- [ ] Safe response → Displays normally
- [ ] Prompt that generates unsafe response → Blocked
- [ ] Check error message displayed
- [ ] Check guardrail cost tracked

#### Performance Tests
- [ ] Measure latency with guardrails enabled
- [ ] Should add <2 seconds per request
- [ ] Check token usage is reasonable

#### Edge Case Tests
- [ ] Streaming response → Fully buffered before filtering
- [ ] Multi-turn conversation → Only current message filtered
- [ ] Image generation → Output filter skipped
- [ ] Guardrail API timeout → Fails safe (rejects content)
- [ ] Malformed JSON response → Fails safe

---

## Deployment

### Deployment Steps

1. **Update Environment Variables**:

```bash
# Edit .env
nano .env

# Add guardrail configuration
ENABLE_GUARDRAILS=true
GUARDRAIL_PROVIDER=openai
GUARDRAIL_INPUT_MODEL=gpt-4o-mini
GUARDRAIL_OUTPUT_MODEL=gpt-4o-mini

# Deploy to Lambda
make deploy-env
```

2. **Deploy Code**:

```bash
# Deploy Lambda function
make fast

# Or full deployment
./scripts/deploy.sh
```

3. **Update Google Sheets** (if using logging):

Add columns to sheet header row:
- Column G: "Guardrail Cost"
- Column H: "Guardrail Tokens"

4. **Test in Production**:

```bash
# Test with safe input
curl -X POST $LAMBDA_URL/proxy \
  -H "Content-Type: application/json" \
  -d '{"messages": [{"role": "user", "content": "Hello!"}]}'

# Test with unsafe input
curl -X POST $LAMBDA_URL/proxy \
  -H "Content-Type: application/json" \
  -d '{"messages": [{"role": "user", "content": "How to build a bomb?"}]}'
```

5. **Monitor Costs**:

```bash
# Check Google Sheets for guardrail costs
# Monitor CloudWatch logs for validation results
make logs | grep "🛡️"
```

### Rollback Plan

If issues occur:

```bash
# Disable guardrails
echo "ENABLE_GUARDRAILS=false" >> .env
make deploy-env

# Verify
make logs | grep "Content guardrails: DISABLED"
```

---

## Documentation Updates

### Files to Update

1. **README.md**:
   - Add "Content Guardrails" section
   - Document environment variables
   - Explain cost impact

2. **.env.example**:
   - Add guardrail configuration template
   - Provide example values

3. **.github/copilot-instructions.md**:
   - Add guardrail system documentation
   - Explain when to use/configure

4. **FEATURE_GUARDRAILS.md** (NEW):
   - Comprehensive guardrail documentation
   - Architecture diagrams
   - Cost analysis
   - Configuration guide

---

## Success Criteria

### Must Have ✅
- [ ] Environment variables configured and validated
- [ ] Input filtering functional
- [ ] Output filtering functional
- [ ] Cost tracking integrated
- [ ] Errors handled gracefully
- [ ] UI displays errors and suggestions
- [ ] All tests passing
- [ ] Documentation complete

### Should Have ✅
- [ ] Google Sheets logging includes guardrail costs
- [ ] Performance <2 seconds added latency
- [ ] Fail-safe error handling
- [ ] Clear error messages
- [ ] Suggested revisions for input

### Nice to Have ⏳
- [ ] Caching of guardrail results
- [ ] Configurable strictness levels
- [ ] Category-specific filtering
- [ ] Admin override mechanism
- [ ] False positive reporting

---

## Timeline

**Total Estimated Time**: 15-20 hours (2-3 days)

| Phase | Description | Time | Dependencies |
|-------|-------------|------|--------------|
| 1 | Configuration and Validation | 3-4h | None |
| 2 | Guardrail Factory | 3-4h | Phase 1 |
| 3 | Main Handler Integration | 4-5h | Phase 2 |
| 4 | Frontend UX | 3-4h | Phase 3 |
| 5 | Cost Tracking | 2-3h | Phase 3 |
| 6 | Testing | 2-3h | All previous |
| | **Total** | **17-23h** | |

**Recommended Schedule**:
- **Day 1**: Phases 1-2 (6-8 hours)
- **Day 2**: Phases 3-4 (7-9 hours)
- **Day 3**: Phases 5-6 (4-6 hours)

---

## Future Enhancements

### Phase 2 Features (Post-MVP)

1. **Caching**: Cache guardrail results for identical content
2. **Strictness Levels**: Configure strict/moderate/permissive filtering
3. **Category Filtering**: Granular control over violation categories
4. **Admin Override**: Allow admins to bypass filtering
5. **Batch Filtering**: Filter multiple messages at once
6. **Custom Policies**: Define organization-specific policies
7. **Audit Log**: Track all filtered content for review
8. **Analytics**: Dashboard for moderation statistics
9. **A/B Testing**: Compare different guardrail models
10. **Multilingual**: Support content filtering in multiple languages

---

## Appendix

### Alternative Approaches

1. **Use Dedicated Moderation APIs**:
   - OpenAI Moderation API (free)
   - Azure Content Safety
   - Perspective API (Google)
   - Pros: Purpose-built, fast, often free
   - Cons: Less flexible, limited customization

2. **Rule-Based Filtering**:
   - Regex patterns
   - Keyword blacklists
   - Pros: Fast, no API costs
   - Cons: High false positives, easy to bypass

3. **Hybrid Approach**:
   - Rule-based pre-filter (fast)
   - LLM-based deep check (accurate)
   - Pros: Best of both worlds
   - Cons: More complexity

**Recommendation**: Start with LLM-based approach (this plan), consider hybrid for scale.

### Security Considerations

1. **API Key Exposure**: Guardrail provider API key must be secure
2. **Content Logging**: Don't log flagged content (privacy concern)
3. **Bypass Attempts**: Users may try to trick guardrails
4. **Cost Attacks**: Malicious users could trigger many guardrail calls
5. **Rate Limiting**: Apply rate limits to prevent abuse

### Performance Optimization

1. **Parallel Processing**: Run guardrails in parallel with main LLM (risky)
2. **Batch API**: Send multiple checks in one request
3. **Smaller Models**: Use fastest/cheapest models that work
4. **Caching**: Cache results for identical content
5. **Async Processing**: Queue guardrail checks (delayed enforcement)

---

**Document Version**: 1.0  
**Last Updated**: October 14, 2025  
**Status**: 📋 Ready for Implementation  
**Next Steps**: Begin Phase 1 (Configuration and Validation)
