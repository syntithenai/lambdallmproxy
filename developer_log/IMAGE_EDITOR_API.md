# Image Editor - API Specification

## Endpoints

### 1. POST /image-edit

**Description**: Submit images for processing with operations

**Authentication**: Required (Bearer token)

**Request**:
```typescript
interface ImageEditRequest {
  images: ImageInput[];
  operation: Operation;
  options?: ProcessingOptions;
}

interface ImageInput {
  id: string;              // Client-generated unique ID
  url: string;             // Image URL or data URL
  name: string;            // Original filename
  tags?: string[];         // Associated tags
  snippetId?: string;      // Source snippet ID (for tracking)
}

interface Operation {
  type: 'command' | 'bulk';
  command?: string;        // Natural language command (type='command')
  bulkOp?: BulkOperation;  // Preset operation (type='bulk')
}

interface BulkOperation {
  type: 'resize' | 'rotate' | 'flip' | 'format' | 'filter';
  params: Record<string, any>;
  label: string;           // UI display label
}

interface ProcessingOptions {
  outputFormat?: 'jpg' | 'png' | 'webp';
  quality?: number;        // 1-100
  maxWidth?: number;       // Max output width
  maxHeight?: number;      // Max output height
  preserveMetadata?: boolean;
}
```

**Example Request**:
```json
{
  "images": [
    {
      "id": "img_abc123",
      "url": "https://example.com/image1.jpg",
      "name": "photo.jpg",
      "tags": ["vacation", "2025"],
      "snippetId": "snip_xyz789"
    }
  ],
  "operation": {
    "type": "command",
    "command": "resize to 800px width and convert to PNG"
  },
  "options": {
    "quality": 95,
    "preserveMetadata": true
  }
}
```

**Response** (202 Accepted):
```json
{
  "sessionId": "ses_def456",
  "status": "processing",
  "estimatedTime": 5,
  "progressUrl": "/image-edit/progress/ses_def456",
  "images": [
    {
      "id": "img_abc123",
      "status": "queued"
    }
  ]
}
```

**Error Responses**:

```json
// 400 Bad Request - Invalid input
{
  "error": "Invalid request",
  "code": "INVALID_INPUT",
  "details": "No images provided"
}

// 401 Unauthorized
{
  "error": "Authentication required",
  "code": "UNAUTHORIZED"
}

// 413 Payload Too Large
{
  "error": "Too many images",
  "code": "TOO_MANY_IMAGES",
  "details": "Maximum 50 images per batch, received 75"
}

// 500 Internal Server Error
{
  "error": "Processing failed",
  "code": "INTERNAL_ERROR",
  "details": "Failed to parse command"
}
```

---

### 2. GET /image-edit/progress/:sessionId

**Description**: Server-Sent Events stream for real-time progress updates

**Authentication**: Required (Bearer token in query param or header)

**URL Parameters**:
- `sessionId` (required): Session ID from POST /image-edit response

**Query Parameters**:
- `token` (optional): Bearer token as query parameter (alternative to header)

**Response Headers**:
```
Content-Type: text/event-stream
Cache-Control: no-cache
Connection: keep-alive
```

**Event Format** (Server-Sent Events):

```
event: progress
data: {"imageId":"img_abc123","status":"processing","progress":25,"message":"Applying resize..."}

event: progress
data: {"imageId":"img_abc123","status":"processing","progress":50,"message":"Converting format..."}

event: complete
data: {"imageId":"img_abc123","status":"complete","progress":100,"message":"Processing complete","result":{"id":"gen_xyz","url":"https://s3.../result.png","name":"photo_edited.png","tags":["edited"]}}

event: error
data: {"imageId":"img_abc123","status":"error","progress":0,"message":"Processing failed","error":"Image too large"}

event: session_complete
data: {"sessionId":"ses_def456","status":"complete","totalProcessed":1,"totalFailed":0}
```

**Event Types**:

| Event | Description | Data Fields |
|-------|-------------|-------------|
| `progress` | Processing update | `imageId`, `status`, `progress`, `message` |
| `complete` | Image completed | `imageId`, `status`, `result` |
| `error` | Image failed | `imageId`, `status`, `error` |
| `session_complete` | All images done | `sessionId`, `status`, `totalProcessed`, `totalFailed` |
| `heartbeat` | Keep-alive ping | `timestamp` |

**Progress Update Schema**:
```typescript
interface ProgressUpdate {
  imageId: string;
  status: 'queued' | 'processing' | 'complete' | 'error';
  progress: number;      // 0-100
  message: string;
  result?: GeneratedImage;
  error?: string;
  timestamp: number;
}

interface GeneratedImage {
  id: string;           // New unique ID
  url: string;          // S3 URL
  name: string;         // Generated filename
  tags: string[];       // Original tags + 'edited'
  format: string;       // Output format
  width?: number;
  height?: number;
  size?: number;        // File size in bytes
  metadata?: {
    original_id: string;
    operations: string[];
    processing_time_ms: number;
  };
}
```

**Example Event Stream**:
```
event: progress
data: {"imageId":"img_abc123","status":"queued","progress":0,"message":"Waiting to process...","timestamp":1640000000000}

event: progress
data: {"imageId":"img_abc123","status":"processing","progress":10,"message":"Downloading source image...","timestamp":1640000001000}

event: progress
data: {"imageId":"img_abc123","status":"processing","progress":30,"message":"Applying resize (800px width)...","timestamp":1640000002000}

event: progress
data: {"imageId":"img_abc123","status":"processing","progress":60,"message":"Converting to PNG...","timestamp":1640000003000}

event: progress
data: {"imageId":"img_abc123","status":"processing","progress":90,"message":"Uploading result...","timestamp":1640000004000}

event: complete
data: {"imageId":"img_abc123","status":"complete","progress":100,"message":"Processing complete","result":{"id":"gen_xyz789","url":"https://s3.amazonaws.com/.../photo_edited.png","name":"photo_edited.png","tags":["vacation","2025","edited"],"format":"png","width":800,"height":600,"size":524288,"metadata":{"original_id":"img_abc123","operations":["resize","convert_format"],"processing_time_ms":4200}},"timestamp":1640000005000}

event: session_complete
data: {"sessionId":"ses_def456","status":"complete","totalProcessed":1,"totalFailed":0,"timestamp":1640000005000}
```

**Heartbeat Events** (every 30 seconds):
```
event: heartbeat
data: {"timestamp":1640000030000}
```

**Error Handling**:
- Connection lost: Client should reconnect and poll for latest status
- Invalid session: 404 Not Found
- Unauthorized: 401 Unauthorized

---

### 3. GET /image-edit/session/:sessionId

**Description**: Get current session status (polling alternative to SSE)

**Authentication**: Required

**Response**:
```json
{
  "sessionId": "ses_def456",
  "status": "complete",
  "createdAt": 1640000000000,
  "completedAt": 1640000005000,
  "images": [
    {
      "imageId": "img_abc123",
      "status": "complete",
      "progress": 100,
      "result": {
        "id": "gen_xyz789",
        "url": "https://s3.../photo_edited.png",
        "name": "photo_edited.png",
        "tags": ["edited"],
        "format": "png"
      }
    }
  ],
  "summary": {
    "total": 1,
    "completed": 1,
    "failed": 0,
    "processing": 0
  }
}
```

---

### 4. DELETE /image-edit/session/:sessionId

**Description**: Cancel ongoing session

**Authentication**: Required

**Response** (200 OK):
```json
{
  "sessionId": "ses_def456",
  "status": "cancelled",
  "message": "Session cancelled successfully"
}
```

---

## Rate Limits

| Endpoint | Rate Limit | Scope |
|----------|-----------|-------|
| POST /image-edit | 10 requests/minute | Per user |
| GET /image-edit/progress/:sessionId | 1 connection | Per session |
| GET /image-edit/session/:sessionId | 60 requests/minute | Per user |

**Rate Limit Headers**:
```
X-RateLimit-Limit: 10
X-RateLimit-Remaining: 7
X-RateLimit-Reset: 1640000120
```

---

## Processing Constraints

| Constraint | Limit | Error Code |
|-----------|-------|------------|
| Max images per batch | 50 | `TOO_MANY_IMAGES` |
| Max image size | 25 MB | `IMAGE_TOO_LARGE` |
| Max image dimensions | 10000 x 10000 px | `DIMENSIONS_TOO_LARGE` |
| Processing timeout | 5 minutes per image | `PROCESSING_TIMEOUT` |
| Session lifetime | 24 hours | `SESSION_EXPIRED` |
| Concurrent sessions per user | 3 | `TOO_MANY_SESSIONS` |

---

## Cost Tracking

Each API call logs cost data:

```typescript
interface CostLog {
  timestamp: number;
  userId: string;
  sessionId: string;
  operation: string;
  imageCount: number;
  costs: {
    lambda_invocations: number;  // $0.20 per 1M requests
    lambda_duration_ms: number;  // $0.0000166667 per GB-second
    s3_storage: number;          // $0.023 per GB-month
    s3_requests: number;         // $0.005 per 1,000 PUT
    dynamodb_writes: number;     // $1.25 per 1M write units
    imagemagick_processing: number; // Custom metric
  };
  totalCost: number;
}
```

---

## WebSocket Alternative (Future Enhancement)

For bidirectional communication:

```
ws://localhost:3000/image-edit/ws?sessionId=ses_def456&token=Bearer_xxx

Client → Server:
{
  "type": "subscribe",
  "sessionId": "ses_def456"
}

Server → Client:
{
  "type": "progress",
  "data": { ... }
}

Client → Server:
{
  "type": "cancel",
  "sessionId": "ses_def456"
}
```

---

## Integration Examples

### JavaScript/TypeScript Client

```typescript
// Submit images for processing
async function processImages(images: ImageInput[], command: string) {
  const response = await fetch('/image-edit', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${authToken}`
    },
    body: JSON.stringify({
      images,
      operation: { type: 'command', command },
      options: { quality: 90 }
    })
  });
  
  if (!response.ok) {
    throw new Error(`Processing failed: ${response.statusText}`);
  }
  
  const { sessionId, progressUrl } = await response.json();
  
  // Subscribe to progress updates
  const results = await watchProgress(sessionId);
  return results;
}

// Watch progress via SSE
function watchProgress(sessionId: string): Promise<GeneratedImage[]> {
  return new Promise((resolve, reject) => {
    const eventSource = new EventSource(
      `/image-edit/progress/${sessionId}?token=${authToken}`
    );
    
    const results: GeneratedImage[] = [];
    const progressCallbacks: Map<string, (update: ProgressUpdate) => void> = new Map();
    
    eventSource.addEventListener('progress', (event) => {
      const update: ProgressUpdate = JSON.parse(event.data);
      progressCallbacks.get(update.imageId)?.(update);
    });
    
    eventSource.addEventListener('complete', (event) => {
      const update: ProgressUpdate = JSON.parse(event.data);
      results.push(update.result!);
    });
    
    eventSource.addEventListener('error', (event) => {
      const update: ProgressUpdate = JSON.parse(event.data);
      console.error(`Image ${update.imageId} failed:`, update.error);
    });
    
    eventSource.addEventListener('session_complete', (event) => {
      eventSource.close();
      resolve(results);
    });
    
    eventSource.onerror = (error) => {
      eventSource.close();
      reject(error);
    };
    
    // Register progress callback
    return (imageId: string, callback: (update: ProgressUpdate) => void) => {
      progressCallbacks.set(imageId, callback);
    };
  });
}
```

### React Hook

```typescript
function useImageEditor() {
  const [processing, setProcessing] = useState(false);
  const [progress, setProgress] = useState<Map<string, ProgressUpdate>>(new Map());
  const [results, setResults] = useState<GeneratedImage[]>([]);
  
  const processImages = async (images: ImageInput[], command: string) => {
    setProcessing(true);
    setProgress(new Map());
    setResults([]);
    
    try {
      const response = await fetch('/image-edit', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${authToken}`
        },
        body: JSON.stringify({
          images,
          operation: { type: 'command', command }
        })
      });
      
      const { sessionId, progressUrl } = await response.json();
      
      // Subscribe to SSE
      const eventSource = new EventSource(progressUrl);
      
      eventSource.addEventListener('progress', (event) => {
        const update: ProgressUpdate = JSON.parse(event.data);
        setProgress(prev => new Map(prev).set(update.imageId, update));
      });
      
      eventSource.addEventListener('complete', (event) => {
        const update: ProgressUpdate = JSON.parse(event.data);
        setResults(prev => [...prev, update.result!]);
      });
      
      eventSource.addEventListener('session_complete', () => {
        eventSource.close();
        setProcessing(false);
      });
      
      eventSource.onerror = () => {
        eventSource.close();
        setProcessing(false);
      };
      
    } catch (error) {
      setProcessing(false);
      throw error;
    }
  };
  
  return {
    processing,
    progress,
    results,
    processImages
  };
}
```

---

## Error Codes Reference

| Code | HTTP Status | Description | Retry? |
|------|-------------|-------------|--------|
| `INVALID_INPUT` | 400 | Malformed request | No |
| `UNAUTHORIZED` | 401 | Missing/invalid auth | No |
| `INSUFFICIENT_CREDIT` | 403 | Not enough credit balance | No |
| `SESSION_NOT_FOUND` | 404 | Invalid session ID | No |
| `TOO_MANY_IMAGES` | 413 | Exceeded batch limit | No |
| `IMAGE_TOO_LARGE` | 413 | Image exceeds size limit | No |
| `DIMENSIONS_TOO_LARGE` | 413 | Image dimensions too large | No |
| `TOO_MANY_SESSIONS` | 429 | Too many concurrent sessions | Yes (after delay) |
| `RATE_LIMIT_EXCEEDED` | 429 | Too many requests | Yes (after reset) |
| `PROCESSING_TIMEOUT` | 504 | Processing took too long | Yes |
| `INTERNAL_ERROR` | 500 | Server error | Yes (with backoff) |

---

## Next Steps

1. Implement OpenAPI/Swagger spec
2. Generate TypeScript client SDK
3. Create Postman collection
4. Write integration tests
5. Set up monitoring/alerting
6. Document authentication flow
7. Add webhook support (optional)
