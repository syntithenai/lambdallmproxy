# Image Editor - Backend Implementation Plan

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────┐
│                    API Gateway                               │
│  POST /image-edit                                           │
│  GET  /image-edit/progress/:sessionId  (SSE)               │
└─────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────┐
│              Main Lambda Function                            │
│  • Authentication & authorization                            │
│  • Request validation                                        │
│  • Command parsing via LLM                                  │
│  • Tool call generation                                      │
│  • Session management                                        │
│  • Invoke Image Processing Lambda                           │
│  • Stream progress events                                    │
└─────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────┐
│         Image Processing Lambda Function                     │
│  • Memory: 2048MB                                           │
│  • Timeout: 300s (5 minutes)                                │
│  • ImageMagick 7.x                                          │
│  • Sharp (Node.js wrapper)                                  │
│  • Image transformations                                     │
│  • Format conversions                                        │
│  • S3 upload for results                                    │
└─────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────┐
│                   Storage Layer                              │
│  • S3 Bucket: generated-images/                            │
│  • DynamoDB: processing-sessions                            │
│  • CloudWatch: logs & metrics                               │
└─────────────────────────────────────────────────────────────┘
```

## Lambda Functions

### 1. Main Lambda (Existing: `src/index.js`)

**New Endpoints**:

```javascript
// src/endpoints/imageEdit.js

/**
 * POST /image-edit
 * 
 * Request body:
 * {
 *   images: [{ id, url, name, tags }],
 *   operation: {
 *     type: 'command' | 'bulk',
 *     command?: string,        // Natural language
 *     bulkOp?: BulkOperation   // Preset transformation
 *   },
 *   options: {
 *     outputFormat?: 'jpg' | 'png' | 'webp',
 *     quality?: number,
 *     maxWidth?: number,
 *     maxHeight?: number
 *   }
 * }
 * 
 * Response:
 * {
 *   sessionId: string,
 *   status: 'processing',
 *   estimatedTime: number,
 *   progressUrl: string
 * }
 */
async function handleImageEdit(event, context) {
  const { images, operation, options } = JSON.parse(event.body);
  
  // Validate authentication
  const authResult = await authenticateRequest(event.headers.authorization);
  if (!authResult.authenticated) {
    return errorResponse(401, 'Unauthorized');
  }
  
  // Validate images
  if (!images || !Array.isArray(images) || images.length === 0) {
    return errorResponse(400, 'No images provided');
  }
  
  if (images.length > 50) {
    return errorResponse(400, 'Maximum 50 images per batch');
  }
  
  // Create session
  const sessionId = generateSessionId();
  await createSession(sessionId, {
    userId: authResult.email,
    images,
    operation,
    options,
    status: 'pending',
    createdAt: Date.now()
  });
  
  // Parse operation into tool calls
  let toolCalls;
  if (operation.type === 'command') {
    toolCalls = await parseCommandToToolCalls(operation.command, images);
  } else if (operation.type === 'bulk') {
    toolCalls = generateBulkToolCalls(operation.bulkOp, images);
  }
  
  // Invoke image processing Lambda asynchronously
  await invokeImageProcessor({
    sessionId,
    images,
    toolCalls,
    options,
    userId: authResult.email
  });
  
  return {
    statusCode: 202,
    headers: getCORSHeaders(),
    body: JSON.stringify({
      sessionId,
      status: 'processing',
      estimatedTime: images.length * 5, // 5 seconds per image estimate
      progressUrl: `/image-edit/progress/${sessionId}`
    })
  };
}

/**
 * GET /image-edit/progress/:sessionId
 * 
 * Server-Sent Events stream for progress updates
 */
async function handleProgressStream(event, context) {
  const sessionId = event.pathParameters.sessionId;
  
  // Validate session
  const session = await getSession(sessionId);
  if (!session) {
    return errorResponse(404, 'Session not found');
  }
  
  // Create SSE response stream
  const responseStream = awslambda.HttpResponseStream.from(
    context.responseStream,
    {
      statusCode: 200,
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
        ...getCORSHeaders()
      }
    }
  );
  
  // Stream progress updates
  const progressIterator = watchSessionProgress(sessionId);
  for await (const update of progressIterator) {
    responseStream.write(`data: ${JSON.stringify(update)}\n\n`);
    
    if (update.status === 'complete' || update.status === 'error') {
      break;
    }
  }
  
  responseStream.end();
}
```

**Command Parsing via LLM**:

```javascript
async function parseCommandToToolCalls(command, images) {
  const systemPrompt = `You are an image manipulation command parser. Convert natural language commands into ImageMagick tool calls.

Available tools:
- resize: Change image dimensions
- rotate: Rotate image by degrees
- flip: Flip horizontal or vertical
- crop: Crop to specific dimensions
- convert_format: Change image format
- adjust_quality: Change compression quality
- apply_filter: Apply visual filters (grayscale, sepia, blur, sharpen)
- add_border: Add colored border
- add_text: Overlay text on image

Respond with JSON array of tool calls in this format:
[
  {
    "tool": "resize",
    "params": { "width": 800, "maintainAspect": true },
    "applyToAll": true
  }
]`;

  const response = await llmResponsesWithTools({
    model: 'groq:llama-3.1-8b-instant',
    input: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: `Parse this command for ${images.length} image(s): "${command}"` }
    ],
    tools: IMAGE_MANIPULATION_TOOLS,
    options: {
      apiKey: process.env.LP_KEY_0,
      temperature: 0.1,
      max_tokens: 2048
    }
  });
  
  // Extract tool calls from response
  if (response.output && response.output.length > 0) {
    return response.output.map(tc => ({
      tool: tc.name,
      params: JSON.parse(tc.arguments),
      applyToAll: true
    }));
  }
  
  // Fallback: use LLM image generation
  return [{
    tool: 'generate_with_llm',
    params: { prompt: command },
    applyToAll: false  // Generate individually
  }];
}
```

**Bulk Operation Tool Call Generation**:

```javascript
function generateBulkToolCalls(bulkOp, images) {
  const toolCall = {
    applyToAll: true,
    params: {}
  };
  
  switch (bulkOp.type) {
    case 'resize':
      toolCall.tool = 'resize';
      toolCall.params = {
        scale: bulkOp.params.scale,
        maintainAspect: true
      };
      break;
      
    case 'rotate':
      toolCall.tool = 'rotate';
      toolCall.params = {
        degrees: bulkOp.params.degrees
      };
      break;
      
    case 'flip':
      toolCall.tool = 'flip';
      toolCall.params = {
        direction: bulkOp.params.direction
      };
      break;
      
    case 'format':
      toolCall.tool = 'convert_format';
      toolCall.params = {
        format: bulkOp.params.format
      };
      break;
      
    case 'filter':
      toolCall.tool = 'apply_filter';
      toolCall.params = {
        filter: bulkOp.params.filter
      };
      break;
  }
  
  return [toolCall];
}
```

### 2. Image Processing Lambda (New Function)

**File Structure**:
```
src/lambdas/imageProcessor/
├── index.js              # Lambda handler
├── imagemagick.js        # ImageMagick wrapper
├── operations.js         # Image operations
├── s3Upload.js           # S3 upload helper
└── progressReporter.js   # DynamoDB progress updates
```

**Main Handler** (`src/lambdas/imageProcessor/index.js`):

```javascript
const { processImage } = require('./operations');
const { uploadToS3 } = require('./s3Upload');
const { reportProgress } = require('./progressReporter');

exports.handler = async (event) => {
  const { sessionId, images, toolCalls, options, userId } = event;
  
  console.log(`Processing ${images.length} images for session ${sessionId}`);
  
  const results = [];
  
  for (let i = 0; i < images.length; i++) {
    const image = images[i];
    
    try {
      // Report start
      await reportProgress(sessionId, image.id, {
        status: 'processing',
        progress: 0,
        message: `Processing ${image.name}...`
      });
      
      // Download source image
      const sourceBuffer = await downloadImage(image.url);
      
      // Apply tool calls sequentially
      let processedBuffer = sourceBuffer;
      for (const toolCall of toolCalls) {
        if (toolCall.applyToAll || toolCall.imageId === image.id) {
          processedBuffer = await processImage(
            processedBuffer,
            toolCall.tool,
            toolCall.params,
            options
          );
          
          // Report progress
          const progress = Math.round(((i + 0.5) / images.length) * 100);
          await reportProgress(sessionId, image.id, {
            status: 'processing',
            progress,
            message: `Applied ${toolCall.tool}...`
          });
        }
      }
      
      // Generate output filename
      const outputName = generateOutputName(image.name, toolCalls, options);
      const outputFormat = options.outputFormat || 'png';
      
      // Upload to S3
      const s3Url = await uploadToS3(
        processedBuffer,
        `${userId}/${sessionId}/${outputName}.${outputFormat}`,
        `image/${outputFormat}`
      );
      
      // Report completion
      await reportProgress(sessionId, image.id, {
        status: 'complete',
        progress: 100,
        message: 'Processing complete',
        result: {
          id: generateId(),
          url: s3Url,
          name: outputName,
          tags: [...(image.tags || []), 'edited'],
          format: outputFormat,
          timestamp: Date.now()
        }
      });
      
      results.push({
        imageId: image.id,
        success: true,
        url: s3Url
      });
      
    } catch (error) {
      console.error(`Error processing image ${image.id}:`, error);
      
      await reportProgress(sessionId, image.id, {
        status: 'error',
        progress: 0,
        message: `Failed: ${error.message}`,
        error: error.message
      });
      
      results.push({
        imageId: image.id,
        success: false,
        error: error.message
      });
    }
  }
  
  // Update session status
  await updateSession(sessionId, {
    status: 'complete',
    completedAt: Date.now(),
    results
  });
  
  return {
    statusCode: 200,
    body: JSON.stringify({
      sessionId,
      results
    })
  };
};
```

**Image Operations** (`src/lambdas/imageProcessor/operations.js`):

```javascript
const sharp = require('sharp');
const { execImageMagick } = require('./imagemagick');

async function processImage(buffer, operation, params, options) {
  switch (operation) {
    case 'resize':
      return await resize(buffer, params, options);
      
    case 'rotate':
      return await rotate(buffer, params, options);
      
    case 'flip':
      return await flip(buffer, params, options);
      
    case 'crop':
      return await crop(buffer, params, options);
      
    case 'convert_format':
      return await convertFormat(buffer, params, options);
      
    case 'adjust_quality':
      return await adjustQuality(buffer, params, options);
      
    case 'apply_filter':
      return await applyFilter(buffer, params, options);
      
    case 'add_border':
      return await addBorder(buffer, params, options);
      
    case 'add_text':
      return await addText(buffer, params, options);
      
    case 'generate_with_llm':
      return await generateWithLLM(buffer, params, options);
      
    default:
      throw new Error(`Unknown operation: ${operation}`);
  }
}

// Resize operation
async function resize(buffer, params, options) {
  const image = sharp(buffer);
  const metadata = await image.metadata();
  
  let width, height;
  
  if (params.scale) {
    // Scale by percentage
    width = Math.round(metadata.width * params.scale);
    height = Math.round(metadata.height * params.scale);
  } else if (params.width && params.maintainAspect) {
    width = params.width;
    height = null; // Sharp auto-calculates
  } else if (params.height && params.maintainAspect) {
    width = null;
    height = params.height;
  } else {
    width = params.width || metadata.width;
    height = params.height || metadata.height;
  }
  
  return await image
    .resize(width, height, {
      fit: params.fit || 'inside',
      withoutEnlargement: params.noEnlarge || false
    })
    .toBuffer();
}

// Rotate operation
async function rotate(buffer, params, options) {
  return await sharp(buffer)
    .rotate(params.degrees)
    .toBuffer();
}

// Flip operation
async function flip(buffer, params, options) {
  const image = sharp(buffer);
  
  if (params.direction === 'horizontal') {
    return await image.flop().toBuffer();
  } else {
    return await image.flip().toBuffer();
  }
}

// Crop operation
async function crop(buffer, params, options) {
  return await sharp(buffer)
    .extract({
      left: params.x || 0,
      top: params.y || 0,
      width: params.width,
      height: params.height
    })
    .toBuffer();
}

// Format conversion
async function convertFormat(buffer, params, options) {
  const format = params.format || options.outputFormat || 'png';
  const quality = params.quality || options.quality || 90;
  
  return await sharp(buffer)
    .toFormat(format, { quality })
    .toBuffer();
}

// Quality adjustment
async function adjustQuality(buffer, params, options) {
  const metadata = await sharp(buffer).metadata();
  const format = metadata.format;
  const quality = params.quality || 80;
  
  return await sharp(buffer)
    .toFormat(format, { quality })
    .toBuffer();
}

// Apply filters
async function applyFilter(buffer, params, options) {
  const image = sharp(buffer);
  
  switch (params.filter) {
    case 'grayscale':
      return await image.grayscale().toBuffer();
      
    case 'sepia':
      // Sepia requires ImageMagick
      return await execImageMagick(buffer, [
        '-sepia-tone', '80%'
      ]);
      
    case 'blur':
      return await image.blur(params.sigma || 5).toBuffer();
      
    case 'sharpen':
      return await image.sharpen().toBuffer();
      
    case 'negate':
      return await image.negate().toBuffer();
      
    case 'normalize':
      return await image.normalize().toBuffer();
      
    default:
      throw new Error(`Unknown filter: ${params.filter}`);
  }
}

// Add border
async function addBorder(buffer, params, options) {
  const color = params.color || '#000000';
  const width = params.width || 10;
  
  return await sharp(buffer)
    .extend({
      top: width,
      bottom: width,
      left: width,
      right: width,
      background: color
    })
    .toBuffer();
}

// Add text overlay (requires ImageMagick)
async function addText(buffer, params, options) {
  return await execImageMagick(buffer, [
    '-pointsize', params.fontSize || '24',
    '-fill', params.color || 'white',
    '-gravity', params.position || 'South',
    '-annotate', '+0+10', params.text
  ]);
}

// Generate with LLM image provider
async function generateWithLLM(buffer, params, options) {
  // This would call Together AI or other image generation provider
  // For now, return original
  return buffer;
}

module.exports = { processImage };
```

**ImageMagick Wrapper** (`src/lambdas/imageProcessor/imagemagick.js`):

```javascript
const { spawn } = require('child_process');
const fs = require('fs').promises;
const path = require('path');
const os = require('os');

async function execImageMagick(inputBuffer, args) {
  const tmpDir = os.tmpdir();
  const inputPath = path.join(tmpDir, `input-${Date.now()}.png`);
  const outputPath = path.join(tmpDir, `output-${Date.now()}.png`);
  
  try {
    // Write input to temp file
    await fs.writeFile(inputPath, inputBuffer);
    
    // Execute ImageMagick convert
    const convertArgs = [inputPath, ...args, outputPath];
    await execCommand('/opt/bin/convert', convertArgs);
    
    // Read output
    const outputBuffer = await fs.readFile(outputPath);
    
    // Cleanup
    await fs.unlink(inputPath);
    await fs.unlink(outputPath);
    
    return outputBuffer;
    
  } catch (error) {
    // Cleanup on error
    try {
      await fs.unlink(inputPath);
      await fs.unlink(outputPath);
    } catch {}
    
    throw error;
  }
}

function execCommand(command, args) {
  return new Promise((resolve, reject) => {
    const proc = spawn(command, args);
    
    let stdout = '';
    let stderr = '';
    
    proc.stdout.on('data', (data) => {
      stdout += data.toString();
    });
    
    proc.stderr.on('data', (data) => {
      stderr += data.toString();
    });
    
    proc.on('close', (code) => {
      if (code === 0) {
        resolve(stdout);
      } else {
        reject(new Error(`Command failed with code ${code}: ${stderr}`));
      }
    });
    
    proc.on('error', (error) => {
      reject(error);
    });
  });
}

module.exports = { execImageMagick };
```

## DynamoDB Schema

### Sessions Table

```javascript
// Table name: image-edit-sessions
{
  TableName: 'image-edit-sessions',
  KeySchema: [
    { AttributeName: 'sessionId', KeyType: 'HASH' }
  ],
  AttributeDefinitions: [
    { AttributeName: 'sessionId', AttributeType: 'S' },
    { AttributeName: 'userId', AttributeType: 'S' },
    { AttributeName: 'createdAt', AttributeType: 'N' }
  ],
  GlobalSecondaryIndexes: [
    {
      IndexName: 'userId-createdAt-index',
      KeySchema: [
        { AttributeName: 'userId', KeyType: 'HASH' },
        { AttributeName: 'createdAt', KeyType: 'RANGE' }
      ],
      Projection: { ProjectionType: 'ALL' }
    }
  ],
  BillingMode: 'PAY_PER_REQUEST',
  TimeToLiveSpecification: {
    Enabled: true,
    AttributeName: 'ttl'  // Auto-delete after 24 hours
  }
}

// Session record structure
{
  sessionId: 'ses_abc123',
  userId: 'user@example.com',
  images: [...],
  operation: {...},
  options: {...},
  status: 'processing' | 'complete' | 'error',
  progress: {
    'img_1': { status: 'complete', progress: 100, ... },
    'img_2': { status: 'processing', progress: 50, ... }
  },
  results: [...],
  createdAt: 1234567890,
  completedAt: 1234567890,
  ttl: 1234654290  // 24 hours from creation
}
```

## S3 Bucket Configuration

```javascript
// Bucket name: generated-images-{accountId}
{
  BucketName: 'generated-images-{accountId}',
  VersioningConfiguration: {
    Status: 'Enabled'
  },
  LifecycleConfiguration: {
    Rules: [
      {
        Id: 'DeleteOldImages',
        Status: 'Enabled',
        ExpirationInDays: 30,
        Prefix: ''
      }
    ]
  },
  CorsConfiguration: {
    CorsRules: [
      {
        AllowedOrigins: ['*'],
        AllowedMethods: ['GET', 'HEAD'],
        AllowedHeaders: ['*'],
        MaxAgeSeconds: 3600
      }
    ]
  },
  PublicAccessBlockConfiguration: {
    BlockPublicAcls: true,
    IgnorePublicAcls: true,
    BlockPublicPolicy: false,
    RestrictPublicBuckets: false
  }
}
```

## Progress Reporting

```javascript
// src/lambdas/imageProcessor/progressReporter.js
const AWS = require('aws-sdk');
const dynamodb = new AWS.DynamoDB.DocumentClient();

async function reportProgress(sessionId, imageId, update) {
  await dynamodb.update({
    TableName: 'image-edit-sessions',
    Key: { sessionId },
    UpdateExpression: 'SET progress.#imageId = :update, updatedAt = :now',
    ExpressionAttributeNames: {
      '#imageId': imageId
    },
    ExpressionAttributeValues: {
      ':update': update,
      ':now': Date.now()
    }
  }).promise();
}

// Watch for progress updates (polling)
async function* watchSessionProgress(sessionId) {
  const seenUpdates = new Set();
  
  while (true) {
    const session = await getSession(sessionId);
    
    if (!session) {
      throw new Error('Session not found');
    }
    
    // Yield new updates
    for (const [imageId, progress] of Object.entries(session.progress || {})) {
      const key = `${imageId}:${progress.status}:${progress.progress}`;
      if (!seenUpdates.has(key)) {
        seenUpdates.add(key);
        yield {
          imageId,
          ...progress
        };
      }
    }
    
    // Check if complete
    if (session.status === 'complete' || session.status === 'error') {
      break;
    }
    
    // Poll every 500ms
    await sleep(500);
  }
}
```

## Error Handling

```javascript
// Graceful degradation
async function processImageWithFallback(buffer, operation, params, options) {
  try {
    // Try Sharp first (faster)
    return await processWithSharp(buffer, operation, params, options);
  } catch (error) {
    console.warn('Sharp failed, falling back to ImageMagick:', error);
    
    try {
      // Fall back to ImageMagick
      return await processWithImageMagick(buffer, operation, params, options);
    } catch (imageMagickError) {
      console.error('Both Sharp and ImageMagick failed:', imageMagickError);
      throw new Error(`Image processing failed: ${imageMagickError.message}`);
    }
  }
}

// Memory monitoring
function checkMemoryUsage() {
  const used = process.memoryUsage();
  const heapUsedMB = Math.round(used.heapUsed / 1024 / 1024);
  const heapTotalMB = Math.round(used.heapTotal / 1024 / 1024);
  
  console.log(`Memory: ${heapUsedMB}MB / ${heapTotalMB}MB heap`);
  
  if (heapUsedMB > 1800) {  // 2048MB limit - 200MB safety margin
    throw new Error('Memory limit approaching - image too large');
  }
}
```

## Next Steps

1. Set up DynamoDB table
2. Create S3 bucket
3. Build ImageMagick Lambda Layer
4. Implement image processor Lambda
5. Add endpoints to main Lambda
6. Test with sample images
7. Optimize memory usage
8. Add monitoring & alerts
