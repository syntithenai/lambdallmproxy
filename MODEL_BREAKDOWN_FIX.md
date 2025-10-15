# LLM Model Breakdown Fix: "MAV Toastr" Gibberish Issue

## 🚨 **Issue Identified**

### Model Breakdown Symptoms
The LLM (Groq's `llama-3.3-70b-versatile`) was returning complete gibberish instead of JSON:

```
"MAV Toastr exposition PSI Britain MAV PSI Builder Factory exposition 
roscope Britain Rotterdam PSI injection Basel MAV PSI contaminants..."
```

**Root Causes:**
1. **Token Repetition Loop** - Model got stuck repeating meaningless tokens
2. **Max Token Limit Hit** - Response cut off with "finish_reason": "length"  
3. **Model Instability** - llama-3.3-70b-versatile appears unstable for structured JSON tasks

## ✅ **Solutions Implemented**

### 1. Model Breakdown Detection
Added intelligent detection for model failures:

```javascript
// Check for model breakdown or gibberish response
if (responseText.length < 50 || !responseText.includes('{') || !responseText.includes('}')) {
    throw new Error(`Model returned invalid response (possible breakdown)`);
}

// Check for repetitive patterns (model breakdown detection)
const words = responseText.split(/\s+/).slice(0, 20);
const uniqueWords = new Set(words);
if (words.length > 10 && uniqueWords.size < words.length * 0.3) {
    throw new Error(`Model breakdown detected - repetitive output`);
}
```

### 2. JSON Extraction Enhancement
Improved JSON parsing to handle malformed responses:

```javascript
// Try to find JSON within the response if it's not at the start
if (!responseText.startsWith('{')) {
    const jsonMatch = responseText.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
        responseText = jsonMatch[0];
        console.log('🔍 Planning: Extracted JSON from response');
    } else {
        throw new Error(`No JSON found in response`);
    }
}
```

### 3. Proactive Model Selection
Added proactive avoidance of unstable models:

```javascript
// If llama-3.3-70b-versatile was selected, prefer more stable alternatives
if (selectedModel.name === 'llama-3.3-70b-versatile') {
    console.log('⚠️ Planning: llama-3.3-70b-versatile may be unstable. Checking alternatives...');
    
    const alternativeModels = ['llama-3.1-70b-versatile', 'mixtral-8x7b-32768'];
    
    for (const altModelName of alternativeModels) {
        if (runtimeCatalog.providers['groq']?.models?.[altModelName]) {
            selectedModel = { /* use alternative */ };
            console.log('🔄 Planning: Using more stable model:', altModelName);
            break;
        }
    }
}
```

### 4. Enhanced Error Messages
Improved error reporting to distinguish between different failure modes:

- **Model breakdown**: "Model breakdown detected - repetitive output"
- **No JSON found**: "No JSON found in response"  
- **Short response**: "Model returned invalid response (possible breakdown)"
- **Parse errors**: "Failed to parse LLM response as JSON"

## 🎯 **Model Stability Recommendations**

### ✅ **Recommended Models for Planning**
1. **`llama-3.1-70b-versatile`** - More stable for structured tasks
2. **`mixtral-8x7b-32768`** - Reliable JSON generation
3. **`llama-3.1-8b-instant`** - Fast and stable for simple plans

### ⚠️ **Problematic Models**
1. **`llama-3.3-70b-versatile`** - Prone to token repetition loops
2. **Very large context models** - May hit token limits more easily

## 📊 **Monitoring & Detection**

### Log Indicators of Model Issues:
- `🚨 Planning: Model breakdown detected - repetitive output`
- `🚨 Planning: Model returned gibberish or very short response`  
- `🔄 Planning: Using more stable model: [model_name]`
- `finish_reason: "length"` in LLM responses

### Transparency Events:
- `llm_request` events now show which model was actually used
- `llm_response` events include `selectedViaLoadBalancing` flag
- Error events distinguish between model breakdown vs parsing errors

## ✅ **Status: DEPLOYED & MONITORING**

The planning endpoint now:
- ✅ **Detects model breakdowns** before attempting JSON parsing
- ✅ **Proactively avoids unstable models** like llama-3.3-70b-versatile  
- ✅ **Extracts JSON** from malformed responses when possible
- ✅ **Provides clear error messages** distinguishing failure types
- ✅ **Uses more stable models** as first choice for planning

**Your planning requests should now work reliably with stable models!** 🎉