# Image Editor - Tool Definitions

## Overview

This document defines the tool schemas for LLM-based image manipulation command parsing. These tools describe the available ImageMagick operations that can be invoked via natural language commands.

## Tool Schema Format

All tools follow the OpenAI function calling format:

```typescript
interface Tool {
  type: 'function';
  function: {
    name: string;
    description: string;
    parameters: {
      type: 'object';
      properties: Record<string, ParameterSchema>;
      required: string[];
    };
  };
}
```

## Image Manipulation Tools

### 1. Resize Tool

```json
{
  "type": "function",
  "function": {
    "name": "resize",
    "description": "Resize image to specific dimensions or scale. Maintains aspect ratio by default.",
    "parameters": {
      "type": "object",
      "properties": {
        "width": {
          "type": "number",
          "description": "Target width in pixels"
        },
        "height": {
          "type": "number",
          "description": "Target height in pixels"
        },
        "scale": {
          "type": "number",
          "description": "Scale factor (e.g., 0.5 for 50%, 2.0 for 200%)"
        },
        "maintainAspect": {
          "type": "boolean",
          "description": "Whether to maintain aspect ratio (default: true)",
          "default": true
        },
        "fit": {
          "type": "string",
          "enum": ["cover", "contain", "fill", "inside", "outside"],
          "description": "How to fit image in dimensions",
          "default": "inside"
        },
        "noEnlarge": {
          "type": "boolean",
          "description": "Prevent enlarging images beyond original size",
          "default": false
        }
      },
      "required": []
    }
  }
}
```

**Example commands**:
- "resize to 800px wide"
- "make it 50% smaller"
- "scale to 1024x768"

### 2. Rotate Tool

```json
{
  "type": "function",
  "function": {
    "name": "rotate",
    "description": "Rotate image by specified degrees. Positive values rotate clockwise.",
    "parameters": {
      "type": "object",
      "properties": {
        "degrees": {
          "type": "number",
          "description": "Rotation angle in degrees (0-360). Use negative for counter-clockwise."
        },
        "background": {
          "type": "string",
          "description": "Background color for empty areas (hex color code)",
          "default": "#FFFFFF"
        }
      },
      "required": ["degrees"]
    }
  }
}
```

**Example commands**:
- "rotate 90 degrees"
- "turn it upside down" (180°)
- "rotate clockwise"

### 3. Flip Tool

```json
{
  "type": "function",
  "function": {
    "name": "flip",
    "description": "Flip image horizontally or vertically",
    "parameters": {
      "type": "object",
      "properties": {
        "direction": {
          "type": "string",
          "enum": ["horizontal", "vertical"],
          "description": "Direction to flip the image"
        }
      },
      "required": ["direction"]
    }
  }
}
```

**Example commands**:
- "flip horizontally"
- "mirror the image"
- "flip upside down"

### 4. Crop Tool

```json
{
  "type": "function",
  "function": {
    "name": "crop",
    "description": "Crop image to specific region or dimensions",
    "parameters": {
      "type": "object",
      "properties": {
        "x": {
          "type": "number",
          "description": "Left position in pixels",
          "default": 0
        },
        "y": {
          "type": "number",
          "description": "Top position in pixels",
          "default": 0
        },
        "width": {
          "type": "number",
          "description": "Crop width in pixels"
        },
        "height": {
          "type": "number",
          "description": "Crop height in pixels"
        },
        "position": {
          "type": "string",
          "enum": ["center", "top", "bottom", "left", "right", "top-left", "top-right", "bottom-left", "bottom-right"],
          "description": "Smart crop position (alternative to x,y coordinates)"
        }
      },
      "required": []
    }
  }
}
```

**Example commands**:
- "crop to 500x500 from center"
- "crop top left corner 200x200"
- "remove 50px from all sides"

### 5. Convert Format Tool

```json
{
  "type": "function",
  "function": {
    "name": "convert_format",
    "description": "Convert image to different format",
    "parameters": {
      "type": "object",
      "properties": {
        "format": {
          "type": "string",
          "enum": ["jpg", "jpeg", "png", "webp", "gif", "bmp", "tiff"],
          "description": "Target image format"
        },
        "quality": {
          "type": "number",
          "description": "Compression quality for lossy formats (1-100)",
          "minimum": 1,
          "maximum": 100,
          "default": 90
        },
        "progressive": {
          "type": "boolean",
          "description": "Use progressive/interlaced encoding (JPG/PNG)",
          "default": false
        }
      },
      "required": ["format"]
    }
  }
}
```

**Example commands**:
- "convert to PNG"
- "save as high quality JPG"
- "make it a WebP"

### 6. Adjust Quality Tool

```json
{
  "type": "function",
  "function": {
    "name": "adjust_quality",
    "description": "Adjust image compression quality (lossy formats only)",
    "parameters": {
      "type": "object",
      "properties": {
        "quality": {
          "type": "number",
          "description": "Quality level (1-100). Higher = better quality, larger file",
          "minimum": 1,
          "maximum": 100
        },
        "preset": {
          "type": "string",
          "enum": ["low", "medium", "high", "maximum"],
          "description": "Quality preset: low=50, medium=75, high=90, maximum=100"
        }
      },
      "required": []
    }
  }
}
```

**Example commands**:
- "reduce quality to 50%"
- "compress for web"
- "maximum quality"

### 7. Apply Filter Tool

```json
{
  "type": "function",
  "function": {
    "name": "apply_filter",
    "description": "Apply visual filter or effect to image",
    "parameters": {
      "type": "object",
      "properties": {
        "filter": {
          "type": "string",
          "enum": [
            "grayscale",
            "sepia",
            "blur",
            "sharpen",
            "negate",
            "normalize",
            "enhance",
            "equalize",
            "emboss",
            "edge",
            "oil_paint",
            "posterize",
            "solarize"
          ],
          "description": "Filter type to apply"
        },
        "intensity": {
          "type": "number",
          "description": "Filter intensity (0.0-1.0)",
          "minimum": 0,
          "maximum": 1,
          "default": 1
        },
        "sigma": {
          "type": "number",
          "description": "Sigma value for blur/sharpen operations",
          "minimum": 0,
          "maximum": 100,
          "default": 5
        }
      },
      "required": ["filter"]
    }
  }
}
```

**Example commands**:
- "make it grayscale"
- "add sepia tone"
- "blur slightly"
- "sharpen the image"

### 8. Add Border Tool

```json
{
  "type": "function",
  "function": {
    "name": "add_border",
    "description": "Add colored border around image",
    "parameters": {
      "type": "object",
      "properties": {
        "width": {
          "type": "number",
          "description": "Border width in pixels",
          "minimum": 1,
          "maximum": 500,
          "default": 10
        },
        "color": {
          "type": "string",
          "description": "Border color (hex code, e.g., #FF0000 for red)",
          "pattern": "^#[0-9A-Fa-f]{6}$",
          "default": "#000000"
        },
        "style": {
          "type": "string",
          "enum": ["solid", "double", "groove", "ridge"],
          "description": "Border style",
          "default": "solid"
        }
      },
      "required": []
    }
  }
}
```

**Example commands**:
- "add 10px black border"
- "put a red frame around it"
- "add white border"

### 9. Add Text Tool

```json
{
  "type": "function",
  "function": {
    "name": "add_text",
    "description": "Overlay text on image",
    "parameters": {
      "type": "object",
      "properties": {
        "text": {
          "type": "string",
          "description": "Text to add to image"
        },
        "position": {
          "type": "string",
          "enum": ["North", "South", "East", "West", "Center", "NorthEast", "NorthWest", "SouthEast", "SouthWest"],
          "description": "Text position on image",
          "default": "South"
        },
        "fontSize": {
          "type": "number",
          "description": "Font size in points",
          "minimum": 8,
          "maximum": 200,
          "default": 24
        },
        "color": {
          "type": "string",
          "description": "Text color (hex code or name)",
          "default": "#FFFFFF"
        },
        "font": {
          "type": "string",
          "description": "Font family name",
          "default": "Arial"
        },
        "strokeColor": {
          "type": "string",
          "description": "Text stroke/outline color",
          "default": "#000000"
        },
        "strokeWidth": {
          "type": "number",
          "description": "Text stroke width in pixels",
          "minimum": 0,
          "maximum": 10,
          "default": 0
        }
      },
      "required": ["text"]
    }
  }
}
```

**Example commands**:
- "add watermark 'Copyright 2025' at bottom"
- "put my name in the corner"
- "add title 'Summer Vacation' at top"

### 10. Adjust Brightness Tool

```json
{
  "type": "function",
  "function": {
    "name": "adjust_brightness",
    "description": "Adjust image brightness and contrast",
    "parameters": {
      "type": "object",
      "properties": {
        "brightness": {
          "type": "number",
          "description": "Brightness adjustment (-100 to +100, 0 = no change)",
          "minimum": -100,
          "maximum": 100,
          "default": 0
        },
        "contrast": {
          "type": "number",
          "description": "Contrast adjustment (-100 to +100, 0 = no change)",
          "minimum": -100,
          "maximum": 100,
          "default": 0
        }
      },
      "required": []
    }
  }
}
```

**Example commands**:
- "make it brighter"
- "increase contrast"
- "darken the image"

### 11. Auto Enhance Tool

```json
{
  "type": "function",
  "function": {
    "name": "auto_enhance",
    "description": "Automatically enhance image (normalize levels, adjust contrast)",
    "parameters": {
      "type": "object",
      "properties": {
        "level": {
          "type": "string",
          "enum": ["light", "moderate", "aggressive"],
          "description": "Enhancement intensity",
          "default": "moderate"
        }
      },
      "required": []
    }
  }
}
```

**Example commands**:
- "auto enhance"
- "improve the image"
- "make it look better"

### 12. Generate with LLM Tool (Fallback)

```json
{
  "type": "function",
  "function": {
    "name": "generate_with_llm",
    "description": "Generate new image using LLM image provider (fallback when manipulation isn't sufficient)",
    "parameters": {
      "type": "object",
      "properties": {
        "prompt": {
          "type": "string",
          "description": "Detailed description of desired image"
        },
        "baseImage": {
          "type": "string",
          "description": "Use original image as reference (image-to-image generation)",
          "default": "yes"
        },
        "strength": {
          "type": "number",
          "description": "How much to transform from base image (0.0-1.0)",
          "minimum": 0,
          "maximum": 1,
          "default": 0.5
        }
      },
      "required": ["prompt"]
    }
  }
}
```

**Example commands** (when manipulation fails):
- "turn this into a painting"
- "make it look like a cartoon"
- "change the background to a beach"

## Complete Tool Array Export

```javascript
// src/tools/imageManipulationTools.js

const IMAGE_MANIPULATION_TOOLS = [
  {
    type: 'function',
    function: {
      name: 'resize',
      description: 'Resize image to specific dimensions or scale. Maintains aspect ratio by default.',
      parameters: { /* ... see above ... */ }
    }
  },
  {
    type: 'function',
    function: {
      name: 'rotate',
      description: 'Rotate image by specified degrees. Positive values rotate clockwise.',
      parameters: { /* ... see above ... */ }
    }
  },
  {
    type: 'function',
    function: {
      name: 'flip',
      description: 'Flip image horizontally or vertically',
      parameters: { /* ... see above ... */ }
    }
  },
  // ... all other tools ...
];

module.exports = { IMAGE_MANIPULATION_TOOLS };
```

## LLM System Prompt for Tool Selection

```javascript
const IMAGE_MANIPULATION_SYSTEM_PROMPT = `You are an expert image manipulation assistant. Convert user requests into precise tool calls.

AVAILABLE TOOLS:
1. resize - Change dimensions or scale
2. rotate - Rotate by degrees
3. flip - Mirror horizontally or vertically
4. crop - Extract region
5. convert_format - Change file format
6. adjust_quality - Compress/optimize
7. apply_filter - Visual effects (grayscale, sepia, blur, etc.)
8. add_border - Add frame
9. add_text - Overlay text
10. adjust_brightness - Brightness/contrast
11. auto_enhance - Auto-improve
12. generate_with_llm - AI image generation (FALLBACK ONLY)

RULES:
- Use generate_with_llm ONLY when manipulation tools can't achieve the request
- Multiple tools can be chained (e.g., resize then rotate)
- Always maintain aspect ratio unless explicitly asked not to
- Default to high quality (90+) for conversions
- Interpret vague requests intelligently (e.g., "make smaller" → resize 50%)

RESPONSE FORMAT:
Return JSON array of tool calls in order of execution.

EXAMPLES:

Input: "resize to 800px wide and convert to PNG"
Output: [
  {"tool": "resize", "params": {"width": 800, "maintainAspect": true}},
  {"tool": "convert_format", "params": {"format": "png", "quality": 95}}
]

Input: "make it grayscale and add my watermark"
Output: [
  {"tool": "apply_filter", "params": {"filter": "grayscale"}},
  {"tool": "add_text", "params": {"text": "watermark", "position": "SouthEast", "fontSize": 18, "color": "#FFFFFF", "strokeColor": "#000000", "strokeWidth": 1}}
]

Input: "turn into an oil painting"
Output: [
  {"tool": "generate_with_llm", "params": {"prompt": "oil painting style conversion", "baseImage": "yes", "strength": 0.7}}
]`;

module.exports = { IMAGE_MANIPULATION_SYSTEM_PROMPT };
```

## Command Parsing Examples

### Simple Commands

| User Command | Tool Call(s) |
|-------------|-------------|
| "resize to 500px" | `resize({width: 500, maintainAspect: true})` |
| "rotate 90 degrees" | `rotate({degrees: 90})` |
| "convert to JPG" | `convert_format({format: 'jpg', quality: 90})` |
| "make grayscale" | `apply_filter({filter: 'grayscale'})` |
| "flip horizontal" | `flip({direction: 'horizontal'})` |

### Complex Commands (Multiple Tools)

| User Command | Tool Call Chain |
|-------------|-----------------|
| "resize to 800px and convert to WebP" | `resize({width: 800})` → `convert_format({format: 'webp'})` |
| "rotate 180 and flip vertically" | `rotate({degrees: 180})` → `flip({direction: 'vertical'})` |
| "make it 50% smaller and grayscale" | `resize({scale: 0.5})` → `apply_filter({filter: 'grayscale'})` |
| "crop to square and add black border" | `crop({width: 1000, height: 1000, position: 'center'})` → `add_border({width: 20, color: '#000000'})` |

### Ambiguous Commands (Interpretation Required)

| User Command | Interpretation | Tool Call(s) |
|-------------|----------------|-------------|
| "make smaller" | Assume 50% scale | `resize({scale: 0.5})` |
| "improve quality" | Auto enhance | `auto_enhance({level: 'moderate'})` |
| "make it pop" | Increase contrast + sharpen | `adjust_brightness({contrast: 20})` → `apply_filter({filter: 'sharpen'})` |
| "optimize for web" | Resize + compress | `resize({width: 1200})` → `convert_format({format: 'webp', quality: 80})` |

### Generative Commands (LLM Fallback)

| User Command | Why Fallback? | Tool Call |
|-------------|---------------|-----------|
| "turn into a painting" | Style transfer needed | `generate_with_llm({prompt: 'oil painting style', strength: 0.7})` |
| "remove the background" | Semantic understanding needed | `generate_with_llm({prompt: 'transparent background', strength: 0.8})` |
| "make it look vintage" | Complex multi-step effect | `generate_with_llm({prompt: 'vintage photo effect', strength: 0.5})` |

## Error Handling

### Invalid Parameters

```javascript
function validateToolCall(toolCall) {
  const errors = [];
  
  switch (toolCall.tool) {
    case 'resize':
      if (!toolCall.params.width && !toolCall.params.height && !toolCall.params.scale) {
        errors.push('Resize requires width, height, or scale');
      }
      if (toolCall.params.scale && (toolCall.params.scale <= 0 || toolCall.params.scale > 10)) {
        errors.push('Scale must be between 0 and 10');
      }
      break;
      
    case 'rotate':
      if (!toolCall.params.degrees) {
        errors.push('Rotate requires degrees parameter');
      }
      break;
      
    case 'add_text':
      if (!toolCall.params.text) {
        errors.push('add_text requires text parameter');
      }
      break;
  }
  
  return errors;
}
```

### Unsupported Operations

```javascript
function isOperationSupported(toolCall, imageMetadata) {
  // Check format support
  const supportedFormats = ['jpg', 'jpeg', 'png', 'webp', 'gif'];
  if (!supportedFormats.includes(imageMetadata.format.toLowerCase())) {
    return { supported: false, reason: `Format ${imageMetadata.format} not supported` };
  }
  
  // Check size limits
  const maxSize = 10000; // 10000x10000 pixels
  if (imageMetadata.width > maxSize || imageMetadata.height > maxSize) {
    return { supported: false, reason: 'Image too large (max 10000x10000)' };
  }
  
  return { supported: true };
}
```

## Next Steps

1. Implement tool validation functions
2. Create comprehensive test suite for each tool
3. Build LLM command parser
4. Test with various natural language inputs
5. Optimize tool selection logic
6. Document edge cases and limitations
