# Plan: Interactive Waiting Indicators for Tool Calls

**Date**: October 23, 2025  
**Status**: 📋 Planning (No Action Taken)  
**Priority**: HIGH - User Experience Enhancement

## Problem Statement

The UI lacks interactivity during long-running tool operations. While `search_web`, `scrape_web_content`, and browser tools have excellent real-time progress indicators, other tools provide no feedback during execution:

### Current State Analysis

**✅ Tools with GOOD Interactivity:**
- ✅ `search_web` - Emits `search_progress` events (searching, results_found, fetching_result, result_loaded, etc.)
- ✅ `scrape_web_content` - Similar progress events during scraping
- ✅ Browser tools - Real-time event streaming
- ✅ `search_youtube` - Emits `youtube_search_progress` events

**❌ Tools with NO/POOR Interactivity:**
- ❌ `execute_javascript` - Silent during execution, only returns final result
- ❌ `generate_image` - Long wait time (5-30 seconds) with minimal feedback
- ❌ `generate_chart` - No progress during Mermaid chart generation
- ❌ `transcribe_url` - Audio/video transcription can take 30+ seconds with no progress
- ❌ `manage_todos` - Instant but could show visual confirmation
- ❌ `manage_snippets` - Instant but could show visual confirmation

### User Impact

1. **Perceived Slowness**: Users don't know if the system is working or frozen
2. **Abandonment Risk**: Long waits without feedback cause users to refresh/cancel
3. **Anxiety**: No indication of progress creates uncertainty
4. **Inconsistent Experience**: Some tools are interactive, others are black boxes

---

## Architectural Overview

### Current Progress Event System

**Backend (src/endpoints/chat.js):**
```javascript
// Lines 720-725: Generic tool_call_progress event
sseWriter.writeEvent('tool_call_progress', {
  id: toolCall.id,
  name: toolCall.function.name,
  status: 'executing'
});
```

**Frontend (ui-new/src/components/ChatTab.tsx):**
```typescript
// Lines 2247-2253: Tool call progress handler
case 'tool_call_progress':
  setToolStatus(prev => prev.map(t =>
    t.id === data.id ? { ...t, status: 'executing' } : t
  ));
  break;
```

**Existing Progress Components:**
- `SearchProgress.tsx` - Rich progress UI for web search
- `YouTubeSearchProgress.tsx` - YouTube-specific progress
- `ScrapingProgress.tsx` - Web scraping progress
- `TranscriptionProgress.tsx` - Audio transcription progress (may need enhancement)

---

## Detailed Implementation Plan

### Phase 1: `execute_javascript` - Streaming Console Output

**Goal**: Stream console.log outputs and intermediate results in real-time

#### Backend Changes (src/tools.js)

**Current Implementation (Lines 2144-2195):**
```javascript
case 'execute_javascript': {
  const code = String(args.code || '').trim();
  // ... validation ...
  
  const context = {
    console: {
      log: (...args) => { 
        // Currently accumulates to array, no streaming
        context._outputs.push(line);
      }
    },
    _outputs: []
  };
  
  // Execute and return final result only
  const result = vm.runInContext(code, vmContext, { timeout });
  return JSON.stringify({ result: output });
}
```

**New Implementation:**
```javascript
case 'execute_javascript': {
  const code = String(args.code || '').trim();
  if (!code) return JSON.stringify({ error: 'code required' });
  const timeout = clampInt(args.timeout, 1, 10, 5) * 1000;
  
  // ENHANCEMENT: Emit initial progress event
  if (context.writeEvent) {
    context.writeEvent('javascript_execution_progress', {
      tool: 'execute_javascript',
      phase: 'starting',
      code_length: code.length,
      timeout_ms: timeout,
      timestamp: new Date().toISOString()
    });
  }
  
  try {
    const context = {
      Math, Date, JSON, Array, Object, String, Number, Boolean,
      parseInt, parseFloat, isNaN, isFinite,
      console: {
        log: (...args) => { 
          const line = args.map(arg => 
            typeof arg === 'object' ? JSON.stringify(arg, null, 2) : String(arg)
          ).join(' ');
          
          // NEW: Stream each console.log in real-time
          if (context.writeEvent) {
            context.writeEvent('javascript_execution_progress', {
              tool: 'execute_javascript',
              phase: 'console_output',
              output: line,
              timestamp: new Date().toISOString()
            });
          }
          
          context._outputs.push(line);
        }
      },
      _outputs: [],
      writeEvent: context.writeEvent // Pass through SSE writer
    };
    
    // Create VM context
    const vmContext = vm.createContext(context);
    
    // NEW: Emit execution phase
    if (context.writeEvent) {
      context.writeEvent('javascript_execution_progress', {
        tool: 'execute_javascript',
        phase: 'executing',
        timestamp: new Date().toISOString()
      });
    }
    
    // Execute code with timeout
    const result = vm.runInContext(code, vmContext, { 
      timeout,
      displayErrors: true 
    });
    
    // NEW: Emit completion phase
    if (context.writeEvent) {
      context.writeEvent('javascript_execution_progress', {
        tool: 'execute_javascript',
        phase: 'completed',
        output_lines: context._outputs.length,
        timestamp: new Date().toISOString()
      });
    }
    
    const output = context._outputs.length > 0 
      ? context._outputs.join('\n') 
      : result;
    
    return JSON.stringify({ result: output });
  } catch (e) {
    // NEW: Emit error phase
    if (context.writeEvent) {
      context.writeEvent('javascript_execution_progress', {
        tool: 'execute_javascript',
        phase: 'error',
        error: String(e?.message || e),
        timestamp: new Date().toISOString()
      });
    }
    
    return JSON.stringify({ 
      error: String(e?.message || e)
    });
  }
}
```

**Key Changes:**
1. Add `context.writeEvent` passthrough to VM context
2. Emit `javascript_execution_progress` events for:
   - `starting` - Code execution begins
   - `console_output` - Each console.log call (real-time)
   - `executing` - Main execution phase
   - `completed` - Execution finished
   - `error` - Exception occurred
3. Include relevant metadata (code length, output lines, error details)

#### Frontend Changes (ui-new/src/components/ChatTab.tsx)

**New Event Handler:**
```typescript
case 'javascript_execution_progress':
  console.log('💻 JavaScript execution progress:', data);
  setJavascriptProgress(prev => {
    const newMap = new Map(prev);
    const key = `${data.tool}_${data.phase}`;
    newMap.set(key, data);
    return newMap;
  });
  break;
```

**New State:**
```typescript
const [javascriptProgress, setJavascriptProgress] = useState<Map<string, {
  tool: string;
  phase: string;
  output?: string;
  code_length?: number;
  output_lines?: number;
  error?: string;
  timestamp: string;
}>>(new Map());
```

#### New UI Component (ui-new/src/components/JavaScriptExecutionProgress.tsx)

```typescript
import React from 'react';

interface JavaScriptExecutionProgressData {
  phase: string;
  output?: string;
  code_length?: number;
  output_lines?: number;
  error?: string;
  timestamp?: string;
}

interface JavaScriptExecutionProgressProps {
  data: JavaScriptExecutionProgressData;
}

export const JavaScriptExecutionProgress: React.FC<JavaScriptExecutionProgressProps> = ({ data }) => {
  switch (data.phase) {
    case 'starting':
      return (
        <div className="flex items-center gap-2 p-2 bg-purple-50 dark:bg-purple-900/20 rounded text-sm">
          <div className="flex gap-1">
            <div className="w-2 h-2 bg-purple-500 rounded-full animate-pulse"></div>
            <div className="w-2 h-2 bg-purple-500 rounded-full animate-pulse" style={{ animationDelay: '150ms' }}></div>
            <div className="w-2 h-2 bg-purple-500 rounded-full animate-pulse" style={{ animationDelay: '300ms' }}></div>
          </div>
          <span className="text-gray-700 dark:text-gray-300">
            Starting JavaScript execution ({data.code_length} characters)...
          </span>
        </div>
      );
      
    case 'executing':
      return (
        <div className="flex items-center gap-2 p-2 bg-purple-50 dark:bg-purple-900/20 rounded text-sm">
          <div className="w-4 h-4 border-2 border-purple-500 border-t-transparent rounded-full animate-spin"></div>
          <span className="text-gray-700 dark:text-gray-300">
            Executing JavaScript...
          </span>
        </div>
      );
      
    case 'console_output':
      return (
        <div className="p-2 bg-gray-50 dark:bg-gray-900/50 rounded text-sm font-mono border-l-4 border-purple-500">
          <div className="text-xs text-gray-500 dark:text-gray-400 mb-1">Console Output:</div>
          <div className="text-gray-800 dark:text-gray-200 whitespace-pre-wrap">
            {data.output}
          </div>
        </div>
      );
      
    case 'completed':
      return (
        <div className="flex items-center gap-2 p-2 bg-green-50 dark:bg-green-900/20 rounded text-sm">
          <svg className="w-4 h-4 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
          </svg>
          <span className="text-gray-700 dark:text-gray-300">
            Execution completed ({data.output_lines || 0} console outputs)
          </span>
        </div>
      );
      
    case 'error':
      return (
        <div className="flex items-center gap-2 p-2 bg-red-50 dark:bg-red-900/20 rounded text-sm">
          <svg className="w-4 h-4 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
          <div className="flex-1">
            <div className="font-medium text-red-700 dark:text-red-300">Execution Error</div>
            <div className="text-xs text-red-600 dark:text-red-400">{data.error}</div>
          </div>
        </div>
      );
      
    default:
      return null;
  }
};
```

**Render in ChatTab:**
```tsx
{/* JavaScript Execution Progress */}
{javascriptProgress.size > 0 && (
  <div className="space-y-2 mb-4">
    {Array.from(javascriptProgress.values()).map((progress, idx) => (
      <JavaScriptExecutionProgress key={idx} data={progress} />
    ))}
  </div>
)}
```

**Clear Progress on Completion:**
```typescript
case 'tool_call_result':
  if (data.name === 'execute_javascript') {
    // Clear JavaScript execution progress
    setJavascriptProgress(new Map());
  }
  // ... existing logic ...
  break;
```

---

### Phase 2: `generate_image` - Rich Progress Feedback

**Goal**: Show image generation status with provider, model, and estimated time

#### Backend Changes (src/tools.js)

**Current Implementation (Lines 2495-2595):**
```javascript
case 'generate_image': {
  const prompt = String(args.prompt || '').trim();
  // ... quality tier selection ...
  // ... model selection ...
  
  // Call image generation (silent, no events)
  const result = await generateImageDirect({
    prompt,
    provider: selectedProvider.provider,
    model: selectedModel.model,
    // ...
  });
  
  return JSON.stringify(result);
}
```

**New Implementation:**
```javascript
case 'generate_image': {
  const prompt = String(args.prompt || '').trim();
  if (!prompt) return JSON.stringify({ error: 'prompt required' });
  
  // NEW: Emit initial progress event
  if (context.writeEvent) {
    context.writeEvent('image_generation_progress', {
      tool: 'generate_image',
      phase: 'analyzing_prompt',
      prompt: prompt.substring(0, 100) + (prompt.length > 100 ? '...' : ''),
      timestamp: new Date().toISOString()
    });
  }
  
  try {
    // Extract reference images and determine quality tier
    let referenceImages = args.reference_images || [];
    // ... existing reference image logic ...
    
    let qualityTier = args.quality;
    if (!qualityTier) {
      // ... existing quality detection logic ...
    }
    
    // NEW: Emit quality tier selection
    if (context.writeEvent) {
      context.writeEvent('image_generation_progress', {
        tool: 'generate_image',
        phase: 'quality_selected',
        quality_tier: qualityTier,
        has_reference_images: referenceImages.length > 0,
        timestamp: new Date().toISOString()
      });
    }
    
    // Find matching models
    const matchingModels = [];
    // ... existing model matching logic ...
    
    // NEW: Emit provider selection
    if (context.writeEvent) {
      context.writeEvent('image_generation_progress', {
        tool: 'generate_image',
        phase: 'selecting_provider',
        available_providers: matchingModels.length,
        quality_tier: qualityTier,
        timestamp: new Date().toISOString()
      });
    }
    
    // Check provider health and select best
    const healthyProviders = await checkMultipleProviders(matchingModels);
    // ... existing selection logic ...
    
    const selectedProvider = healthyProviders[0];
    const selectedModel = matchingModels.find(m => 
      m.provider === selectedProvider.provider && 
      m.model === selectedProvider.model
    );
    
    // NEW: Emit generation start with estimated time
    const estimatedTimeSeconds = getEstimatedGenerationTime(
      selectedProvider.provider, 
      selectedModel.model,
      qualityTier
    );
    
    if (context.writeEvent) {
      context.writeEvent('image_generation_progress', {
        tool: 'generate_image',
        phase: 'generating',
        provider: selectedProvider.provider,
        model: selectedModel.model,
        quality_tier: qualityTier,
        estimated_time_seconds: estimatedTimeSeconds,
        timestamp: new Date().toISOString()
      });
    }
    
    // Call image generation
    const result = await generateImageDirect({
      prompt,
      provider: selectedProvider.provider,
      model: selectedModel.model,
      modelKey: selectedModel.modelKey,
      size: args.size || '1024x1024',
      quality: qualityTier,
      style: args.style || 'natural',
      referenceImages,
      apiKeys: context.apiKeys
    });
    
    // NEW: Emit completion
    if (context.writeEvent && result.url) {
      context.writeEvent('image_generation_progress', {
        tool: 'generate_image',
        phase: 'completed',
        provider: selectedProvider.provider,
        model: selectedModel.model,
        url: result.url,
        cost: result.cost,
        timestamp: new Date().toISOString()
      });
    }
    
    return JSON.stringify(result);
  } catch (e) {
    // NEW: Emit error
    if (context.writeEvent) {
      context.writeEvent('image_generation_progress', {
        tool: 'generate_image',
        phase: 'error',
        error: String(e?.message || e),
        timestamp: new Date().toISOString()
      });
    }
    
    return JSON.stringify({ 
      error: String(e?.message || e)
    });
  }
}

// NEW: Helper function for time estimation
function getEstimatedGenerationTime(provider, model, qualityTier) {
  // Estimated generation times in seconds
  const times = {
    'openai': {
      'dall-e-3': { ultra: 15, high: 12, standard: 10, fast: 8 },
      'dall-e-2': { standard: 5, fast: 3 }
    },
    'together': {
      'flux-schnell': { fast: 3, standard: 4 },
      'flux-dev': { standard: 8, high: 10 },
      'flux-pro': { high: 12, ultra: 15 },
      'sdxl': { fast: 4, standard: 6 }
    },
    'replicate': {
      default: { fast: 5, standard: 8, high: 12, ultra: 20 }
    },
    'gemini': {
      'imagen-3.0-generate-001': { standard: 8, fast: 6 }
    }
  };
  
  return times[provider]?.[model]?.[qualityTier] || 
         times[provider]?.default?.[qualityTier] || 
         10; // Default 10 seconds
}
```

**Key Changes:**
1. Emit 6 phases: `analyzing_prompt`, `quality_selected`, `selecting_provider`, `generating`, `completed`, `error`
2. Include estimated generation time based on provider/model/quality
3. Show which provider and model was selected
4. Display reference image count if applicable

#### Frontend Changes (ui-new/src/components/ChatTab.tsx)

**Enhanced Event Handler (Already exists at line 2257, needs enhancement):**
```typescript
case 'image_generation_progress':
  console.log('🎨 Image generation progress event:', data);
  
  // Store progress for display
  setImageGenerationProgress(prev => {
    const newMap = new Map(prev);
    newMap.set(data.tool || 'generate_image', data);
    return newMap;
  });
  
  // If generating phase, start countdown timer
  if (data.phase === 'generating' && data.estimated_time_seconds) {
    setImageGenerationCountdown(data.estimated_time_seconds);
  }
  
  // If completed or error, clear countdown
  if (data.phase === 'completed' || data.phase === 'error') {
    setImageGenerationCountdown(0);
    // Clear progress after 2 seconds
    setTimeout(() => {
      setImageGenerationProgress(new Map());
    }, 2000);
  }
  break;
```

**New State:**
```typescript
const [imageGenerationProgress, setImageGenerationProgress] = useState<Map<string, {
  tool: string;
  phase: string;
  prompt?: string;
  quality_tier?: string;
  provider?: string;
  model?: string;
  estimated_time_seconds?: number;
  available_providers?: number;
  has_reference_images?: boolean;
  url?: string;
  cost?: number;
  error?: string;
  timestamp: string;
}>>(new Map());

const [imageGenerationCountdown, setImageGenerationCountdown] = useState<number>(0);

// Countdown timer effect
useEffect(() => {
  if (imageGenerationCountdown > 0) {
    const timer = setTimeout(() => {
      setImageGenerationCountdown(prev => Math.max(0, prev - 1));
    }, 1000);
    return () => clearTimeout(timer);
  }
}, [imageGenerationCountdown]);
```

#### New UI Component (ui-new/src/components/ImageGenerationProgress.tsx)

```typescript
import React from 'react';

interface ImageGenerationProgressData {
  phase: string;
  prompt?: string;
  quality_tier?: string;
  provider?: string;
  model?: string;
  estimated_time_seconds?: number;
  available_providers?: number;
  has_reference_images?: boolean;
  url?: string;
  cost?: number;
  error?: string;
  countdown?: number;
}

interface ImageGenerationProgressProps {
  data: ImageGenerationProgressData;
  countdown?: number;
}

export const ImageGenerationProgress: React.FC<ImageGenerationProgressProps> = ({ 
  data, 
  countdown = 0 
}) => {
  const formatTime = (seconds: number) => {
    if (seconds < 60) return `${seconds}s`;
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}m ${secs}s`;
  };
  
  switch (data.phase) {
    case 'analyzing_prompt':
      return (
        <div className="flex items-center gap-2 p-3 bg-pink-50 dark:bg-pink-900/20 rounded-lg text-sm border border-pink-200 dark:border-pink-800">
          <div className="flex gap-1">
            <div className="w-2 h-2 bg-pink-500 rounded-full animate-pulse"></div>
            <div className="w-2 h-2 bg-pink-500 rounded-full animate-pulse" style={{ animationDelay: '150ms' }}></div>
            <div className="w-2 h-2 bg-pink-500 rounded-full animate-pulse" style={{ animationDelay: '300ms' }}></div>
          </div>
          <div className="flex-1">
            <div className="font-medium text-gray-800 dark:text-gray-200">
              🎨 Analyzing image prompt...
            </div>
            <div className="text-xs text-gray-600 dark:text-gray-400 mt-1 italic">
              "{data.prompt}"
            </div>
          </div>
        </div>
      );
      
    case 'quality_selected':
      return (
        <div className="flex items-center gap-2 p-2 bg-pink-50 dark:bg-pink-900/20 rounded text-sm">
          <svg className="w-4 h-4 text-pink-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
          </svg>
          <span className="text-gray-700 dark:text-gray-300">
            Quality tier: <span className="font-semibold text-pink-600 dark:text-pink-400">{data.quality_tier}</span>
            {data.has_reference_images && (
              <span className="ml-2 text-xs bg-pink-100 dark:bg-pink-900 px-2 py-0.5 rounded">
                📎 Reference images attached
              </span>
            )}
          </span>
        </div>
      );
      
    case 'selecting_provider':
      return (
        <div className="flex items-center gap-2 p-2 bg-pink-50 dark:bg-pink-900/20 rounded text-sm">
          <div className="w-4 h-4 border-2 border-pink-500 border-t-transparent rounded-full animate-spin"></div>
          <span className="text-gray-700 dark:text-gray-300">
            Selecting best provider from {data.available_providers} available...
          </span>
        </div>
      );
      
    case 'generating':
      const progressPercent = data.estimated_time_seconds && countdown > 0
        ? ((data.estimated_time_seconds - countdown) / data.estimated_time_seconds) * 100
        : 0;
      
      return (
        <div className="p-3 bg-gradient-to-r from-pink-50 to-purple-50 dark:from-pink-900/20 dark:to-purple-900/20 rounded-lg border border-pink-200 dark:border-pink-800">
          <div className="flex items-center gap-3 mb-2">
            <div className="w-5 h-5 border-3 border-pink-500 border-t-transparent rounded-full animate-spin"></div>
            <div className="flex-1">
              <div className="font-semibold text-gray-800 dark:text-gray-200">
                🎨 Generating image...
              </div>
              <div className="text-xs text-gray-600 dark:text-gray-400 mt-0.5">
                {data.provider && <span className="font-medium">{data.provider}</span>}
                {data.model && <span className="ml-1">/ {data.model}</span>}
              </div>
            </div>
            {countdown > 0 && (
              <div className="text-right">
                <div className="text-2xl font-bold text-pink-600 dark:text-pink-400">
                  {countdown}s
                </div>
                <div className="text-xs text-gray-500 dark:text-gray-400">
                  ~{formatTime(data.estimated_time_seconds || 0)}
                </div>
              </div>
            )}
          </div>
          
          {/* Progress bar */}
          {data.estimated_time_seconds && countdown > 0 && (
            <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2 overflow-hidden">
              <div 
                className="h-full bg-gradient-to-r from-pink-500 to-purple-500 transition-all duration-1000 ease-linear"
                style={{ width: `${progressPercent}%` }}
              />
            </div>
          )}
        </div>
      );
      
    case 'completed':
      return (
        <div className="flex items-center gap-2 p-3 bg-green-50 dark:bg-green-900/20 rounded-lg text-sm border border-green-200 dark:border-green-800">
          <svg className="w-5 h-5 text-green-500 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
          </svg>
          <div className="flex-1">
            <div className="font-medium text-gray-800 dark:text-gray-200">
              Image generated successfully!
            </div>
            <div className="text-xs text-gray-600 dark:text-gray-400 mt-1">
              {data.provider} / {data.model}
              {data.cost && <span className="ml-2 text-green-600 dark:text-green-400">Cost: ${data.cost.toFixed(4)}</span>}
            </div>
          </div>
        </div>
      );
      
    case 'error':
      return (
        <div className="flex items-center gap-2 p-3 bg-red-50 dark:bg-red-900/20 rounded-lg text-sm border border-red-200 dark:border-red-800">
          <svg className="w-5 h-5 text-red-500 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
          <div className="flex-1">
            <div className="font-medium text-red-700 dark:text-red-300">
              Image generation failed
            </div>
            <div className="text-xs text-red-600 dark:text-red-400 mt-1">
              {data.error}
            </div>
          </div>
        </div>
      );
      
    default:
      return null;
  }
};
```

**Render in ChatTab:**
```tsx
{/* Image Generation Progress */}
{imageGenerationProgress.size > 0 && (
  <div className="space-y-2 mb-4">
    {Array.from(imageGenerationProgress.values()).map((progress, idx) => (
      <ImageGenerationProgress 
        key={idx} 
        data={progress}
        countdown={progress.phase === 'generating' ? imageGenerationCountdown : 0}
      />
    ))}
  </div>
)}
```

---

### Phase 3: Other Tools - Quick Wins

#### 3.1. `generate_chart` - Mermaid Generation Progress

**Backend (src/tools.js):**
```javascript
case 'generate_chart': {
  // Emit start event
  if (context.writeEvent) {
    context.writeEvent('chart_generation_progress', {
      tool: 'generate_chart',
      phase: 'analyzing',
      timestamp: new Date().toISOString()
    });
  }
  
  // ... existing logic ...
  
  // Emit generation event
  if (context.writeEvent) {
    context.writeEvent('chart_generation_progress', {
      tool: 'generate_chart',
      phase: 'generating_mermaid',
      diagram_type: detectedType,
      timestamp: new Date().toISOString()
    });
  }
  
  // ... call LLM to generate Mermaid ...
  
  // Emit completion
  if (context.writeEvent) {
    context.writeEvent('chart_generation_progress', {
      tool: 'generate_chart',
      phase: 'completed',
      diagram_type: detectedType,
      timestamp: new Date().toISOString()
    });
  }
}
```

**Frontend:** Simple spinner with "Generating {diagram_type} diagram..." message

#### 3.2. `transcribe_url` - Enhanced Progress

**Current State:** `TranscriptionProgress.tsx` exists but may need enhancement

**Backend (src/tools.js):** Add progress events for:
- `downloading_audio` - Downloading media file
- `transcribing` - Processing with Whisper
- `completed` - Transcription ready

**Frontend:** Enhance `TranscriptionProgress.tsx` with download progress and estimated time

#### 3.3. `manage_todos` / `manage_snippets` - Visual Confirmation

**Backend:** Emit confirmation events:
```javascript
context.writeEvent('todo_update', {
  operation: args.operation, // add, update, remove
  todo_id: result.id,
  title: result.title,
  timestamp: new Date().toISOString()
});
```

**Frontend:** Brief toast notification (2 seconds) showing operation completed

---

## Implementation Priority

### High Priority (User-Facing Impact)
1. ✅ **Phase 2: `generate_image`** - Long wait times (5-30s), high user frustration
2. ✅ **Phase 1: `execute_javascript`** - Streaming console output adds significant value

### Medium Priority (Nice to Have)
3. ✅ **Phase 3.2: `transcribe_url`** - Enhance existing component
4. ✅ **Phase 3.1: `generate_chart`** - Quick win, simple implementation

### Low Priority (Already Fast)
5. ✅ **Phase 3.3: `manage_todos` / `manage_snippets`** - Visual polish

---

## Technical Considerations

### 1. SSE Event Consistency

**Pattern to Follow:**
```javascript
context.writeEvent('<tool>_progress', {
  tool: '<tool_name>',
  phase: '<phase_name>',
  // ... phase-specific data ...
  timestamp: new Date().toISOString()
});
```

**Phases Convention:**
- `starting` / `analyzing` - Initial phase
- `processing` / `executing` / `generating` - Main work
- `completed` - Success
- `error` - Failure

### 2. Progress Component Architecture

**File Naming:**
- `<Tool>Progress.tsx` (e.g., `ImageGenerationProgress.tsx`)
- Export as `export const <Tool>Progress: React.FC<...>`

**Props Pattern:**
```typescript
interface <Tool>ProgressData {
  phase: string;
  // ... tool-specific fields ...
  timestamp?: string;
}

interface <Tool>ProgressProps {
  data: <Tool>ProgressData;
  countdown?: number; // Optional, for timed operations
}
```

**Styling Consistency:**
- Use Tailwind utility classes
- Color scheme per tool:
  - `execute_javascript`: Purple (`purple-500`, `purple-50`)
  - `generate_image`: Pink-Purple gradient (`pink-500`, `purple-500`)
  - `generate_chart`: Indigo (`indigo-500`, `indigo-50`)
  - `transcribe_url`: Orange (`orange-500`, `orange-50`)
- Animate with `animate-pulse` or `animate-spin`
- Use icons from Heroicons (already available)

### 3. State Management

**ChatTab.tsx Pattern:**
```typescript
const [<tool>Progress, set<Tool>Progress] = useState<Map<string, <Tool>ProgressData>>(new Map());

// In SSE event handler
case '<tool>_progress':
  set<Tool>Progress(prev => {
    const newMap = new Map(prev);
    newMap.set(data.tool, data);
    return newMap;
  });
  break;

// Clear on completion
case 'tool_call_result':
  if (data.name === '<tool>') {
    set<Tool>Progress(new Map());
  }
  break;
```

### 4. Memory and Performance

**Concerns:**
- Streaming many console.log outputs could flood SSE channel
- Image generation countdown requires interval timer

**Mitigations:**
- Limit console.log streaming to 100 lines (truncate if exceeded)
- Use single interval for all countdowns (shared timer)
- Clear progress state immediately on tool completion
- Debounce rapid progress updates (e.g., 100ms between events)

### 5. Error Handling

**Backend:**
- Always emit error phase on exception
- Include error message and stack trace (sanitized)

**Frontend:**
- Show error phase with red styling
- Auto-clear error after 5 seconds
- Allow user to dismiss error manually

---

## Testing Strategy

### Manual Testing Checklist

**For Each Tool:**
1. ✅ Progress indicators appear immediately when tool starts
2. ✅ Progress phases update in correct order
3. ✅ Final completion/error state is shown
4. ✅ Progress is cleared after tool finishes
5. ✅ Multiple concurrent tool calls don't interfere
6. ✅ UI remains responsive during long operations
7. ✅ Countdown timers (if applicable) are accurate
8. ✅ Error states display correctly

**Specific Scenarios:**

**`execute_javascript`:**
- Test with code that has multiple console.log calls
- Test with code that runs for several seconds
- Test with code that throws an error
- Test with code that has no console output

**`generate_image`:**
- Test with fast tier (3-5s)
- Test with ultra tier (15-20s)
- Test with reference images
- Test with provider fallback (force one provider to fail)
- Test error handling (invalid prompt, rate limit)

**`generate_chart`:**
- Test different diagram types (flowchart, sequence, class)
- Test with complex descriptions

**`transcribe_url`:**
- Test with short audio (30s)
- Test with long audio (5+ minutes)
- Test with YouTube URLs
- Test with direct audio file URLs

### Automated Testing (Future)

**Unit Tests:**
- Test progress event emission in tools.js
- Test state management in ChatTab.tsx
- Test component rendering with different phases

**Integration Tests:**
- Test full tool execution flow with mocked SSE
- Test countdown timer behavior
- Test concurrent tool executions

---

## Documentation Updates Required

### 1. Developer Documentation

**File:** `developer_logs/FEATURE_STREAMING_TOOL_PROGRESS.md`
- Document all new event types
- Explain progress component pattern
- Provide examples for adding progress to new tools

### 2. User Documentation

**File:** `README.md` or user guide
- Mention real-time progress indicators as a feature
- Show screenshots of progress UI
- Explain countdown timers for image generation

### 3. Code Comments

**In tools.js:**
```javascript
/**
 * TOOL PROGRESS EVENTS
 * 
 * All long-running tools should emit progress events via context.writeEvent()
 * to provide real-time feedback to the UI.
 * 
 * Standard pattern:
 * 1. Emit 'starting' or 'analyzing' phase when tool begins
 * 2. Emit intermediate phases during execution (optional)
 * 3. Emit 'completed' or 'error' phase when done
 * 
 * Example:
 *   context.writeEvent('my_tool_progress', {
 *     tool: 'my_tool',
 *     phase: 'processing',
 *     // ... relevant data ...
 *     timestamp: new Date().toISOString()
 *   });
 * 
 * Frontend components will automatically render progress UI based on these events.
 */
```

---

## Rollout Plan

### Phase 1: Foundation (1-2 days)
1. Implement `execute_javascript` streaming (backend + frontend)
2. Create `JavaScriptExecutionProgress` component
3. Test with various JavaScript code samples

### Phase 2: High-Impact (2-3 days)
1. Implement `generate_image` progress (backend + frontend)
2. Create `ImageGenerationProgress` component with countdown
3. Test with different quality tiers and providers

### Phase 3: Polish (1-2 days)
1. Enhance `transcribe_url` progress
2. Add `generate_chart` progress
3. Add `manage_todos` / `manage_snippets` confirmations

### Phase 4: Testing & Refinement (1-2 days)
1. Comprehensive manual testing
2. Fix bugs and edge cases
3. Performance optimization
4. Documentation updates

### Total Estimated Time: 6-9 days

---

## Success Metrics

### Quantitative
- ✅ All 4+ tools have progress indicators
- ✅ <200ms delay from tool start to progress display
- ✅ Countdown timers accurate within ±1 second
- ✅ Zero UI freezes during long tool executions

### Qualitative
- ✅ Users report feeling more informed about system activity
- ✅ Reduced support requests about "system hanging"
- ✅ Positive feedback on interactive experience
- ✅ Consistent visual language across all progress indicators

---

## Future Enhancements

### Advanced Progress Features
1. **Cancellation Support**: Allow users to cancel long-running tool calls
2. **Progress Percentage**: Calculate actual progress % for deterministic operations
3. **ETA Refinement**: Learn actual completion times and improve estimates
4. **Queue Position**: Show position in queue when rate-limited

### Visual Enhancements
1. **Animated Icons**: Use Lottie or animated SVGs for richer feedback
2. **Sound Effects**: Optional audio cues for completion (user setting)
3. **Progress History**: Show timeline of completed tool calls in session
4. **Tool Performance Stats**: Display avg execution time per tool type

### Developer Experience
1. **Progress Debugger**: Dev tool to inspect all progress events
2. **Progress Simulator**: Mock tool execution with fake progress for testing
3. **Progress Analytics**: Track which tools are slowest, optimize accordingly

---

## Related Issues & PRs

**Related Documentation:**
- `developer_logs/CHAT_TOOL_MESSAGES_AND_RESET.md` - Tool call handling
- `developer_logs/CHAT_AND_SEARCH_IMPROVEMENTS.md` - Search progress implementation
- `developer_logs/COMPREHENSIVE_CONTENT_EXTRACTION.md` - Content processing patterns

**Dependencies:**
- SSE event system (src/utils/sse-writer.js)
- Tool execution framework (src/tools.js)
- ChatTab state management (ui-new/src/components/ChatTab.tsx)

---

## Notes

- This plan follows the **exact same pattern** used successfully for `search_web` progress
- Progress components should be **reusable and composable**
- Backend changes are **minimal and non-breaking**
- Frontend changes are **additive only** (no breaking changes)
- All progress states are **optional** (tools work without progress events)
