#!/usr/bin/env node

/**
 * Local Lambda Development Server
 * 
 * Runs the Lambda function locally on port 3000 for development.
 * This allows testing without deploying and avoids IP restrictions.
 * 
 * Usage:
 *   node scripts/run-local-lambda.js
 *   or
 *   make run-lambda-local
 */

const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const https = require('https');

// Load environment variables from .env file
require('dotenv').config();

// Set local environment flag
process.env.IS_LOCAL = 'true';
process.env.NODE_ENV = 'development';

const app = express();
const PORT = process.env.LOCAL_LAMBDA_PORT || 3000;

// Configure multer for file uploads (memory storage)
const upload = multer({ 
  storage: multer.memoryStorage(),
  limits: { fileSize: 50 * 1024 * 1024 } // 50MB limit
});

// Enable CORS for specific origins in development
// When credentials: true, origin cannot be wildcard
const allowedOrigins = [
  'http://localhost:8081',
  'http://localhost:5173',
  'https://ai.syntithenai.com',
  'http://syntithenai.github.io',
  'https://syntithenai.github.io'
];

// CORS middleware - but skip routes that handle CORS themselves
app.use((req, res, next) => {
  // Skip CORS middleware for routes that handle it internally
  if (req.path === '/proxy-image') {
    return next();
  }
  
  // Apply CORS for other routes
  cors({
    origin: function (origin, callback) {
      // Allow requests with no origin (like mobile apps or curl requests)
      if (!origin) return callback(null, true);
      
      if (allowedOrigins.indexOf(origin) !== -1) {
        callback(null, true);
      } else {
        // For development, allow all localhost origins
        if (origin.startsWith('http://localhost:') || origin.startsWith('http://127.0.0.1:')) {
          callback(null, true);
        } else {
          console.warn(`⚠️  CORS: Blocked origin: ${origin}`);
          callback(new Error('Not allowed by CORS'));
        }
      }
    },
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'X-Google-Access-Token', 'X-Google-OAuth-Token', 'X-YouTube-Token', 'X-Billing-Sync', 'X-Request-Id', 'X-Drive-Token', 'X-Project-ID'],
    credentials: true
  })(req, res, next);
});

// Parse JSON bodies
app.use(express.json({ limit: '10mb' }));

// Serve static sample files from ui-new/public/samples
// This allows local transcription testing with localhost URLs
const samplesPath = path.join(__dirname, '../ui-new/public/samples');
if (fs.existsSync(samplesPath)) {
  app.use('/samples', express.static(samplesPath));
  console.log(`📁 Serving static samples from: ${samplesPath}`);
} else {
  console.log(`⚠️  Samples directory not found at: ${samplesPath}`);
}

// Log all requests
app.use((req, res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.path}`);
  next();
});

// Mock awslambda.streamifyResponse for local development
global.awslambda = {
  streamifyResponse: (handler) => {
    // Return a wrapper that calls the handler and handles streaming
    return async (event, context) => {
      // Get Express response from context (passed by local server)
      const expressResponse = context.expressResponse;
      let headersSent = false;
      
      // Create a mock response stream that writes directly to Express response
      const responseStream = {
        write: (data) => {
          if (expressResponse) {
            // Send headers on first write
            if (!headersSent && responseStream.metadata) {
              const metadata = responseStream.metadata;
              const statusCode = metadata.statusCode || 200;
              const headers = metadata.headers || {};
              
              Object.keys(headers).forEach(key => {
                expressResponse.setHeader(key, headers[key]);
              });
              
              expressResponse.status(statusCode);
              headersSent = true;
            }
            
            // Write chunk immediately for true streaming
            expressResponse.write(data);
          }
        },
        end: () => {
          if (expressResponse) {
            expressResponse.end();
          }
        },
        setContentType: (type) => {
          responseStream.contentType = type;
        },
        contentType: 'application/json'
      };
      
      // Add HttpResponseStream.from method
      responseStream.from = (stream, metadata) => {
        responseStream.metadata = metadata;
        return responseStream;
      };
      
      await handler(event, responseStream, context);
      
      return {
        isStreaming: true,
        metadata: responseStream.metadata
      };
    };
  },
  HttpResponseStream: {
    from: (responseStream, metadata) => {
      responseStream.metadata = metadata;
      return responseStream;
    }
  }
};

// Load the Lambda handler
let handler;
try {
  const indexPath = path.join(__dirname, '../src/index.js');
  if (!fs.existsSync(indexPath)) {
    console.error('❌ ERROR: src/index.js not found!');
    process.exit(1);
  }
  
  // Delete ALL require cache to allow hot reloading of all modules
  console.log('🔄 Clearing require cache for hot reload...');
  Object.keys(require.cache).forEach(key => {
    // Only clear cache for files in our src directory
    if (key.includes('/src/')) {
      delete require.cache[key];
    }
  });
  
  const lambdaModule = require(indexPath);
  handler = lambdaModule.handler;
  
  if (!handler || typeof handler !== 'function') {
    console.error('❌ ERROR: No handler function exported from src/index.js');
    process.exit(1);
  }
  
  console.log('✅ Lambda handler loaded successfully');
} catch (error) {
  console.error('❌ ERROR loading Lambda handler:', error.message);
  console.error(error.stack);
  process.exit(1);
}

// Transcription endpoint (uses multer for audio uploads)
app.post('/transcribe', upload.fields([
  { name: 'audio', maxCount: 1 },
  { name: 'apiKey', maxCount: 1 },
  { name: 'provider', maxCount: 1 }
]), async (req, res) => {
  try {
    console.log('Routing to transcribe endpoint');
    
    // Build multipart body for Lambda transcribe endpoint
    const boundary = '----WebKitFormBoundary' + Math.random().toString(36).substring(2);
    let body = '';
    
    // Add audio file
    if (req.files && req.files.audio && req.files.audio[0]) {
      const audioFile = req.files.audio[0];
      body += `--${boundary}\r\n`;
      body += `Content-Disposition: form-data; name="audio"; filename="${audioFile.originalname}"\r\n`;
      body += `Content-Type: ${audioFile.mimetype}\r\n\r\n`;
      body += audioFile.buffer.toString('binary');
      body += '\r\n';
    }
    
    // Add API key if provided
    if (req.body.apiKey || (req.files && req.files.apiKey)) {
      const apiKey = req.body.apiKey || (req.files.apiKey && req.files.apiKey[0] ? req.files.apiKey[0].buffer.toString('utf-8') : null);
      if (apiKey) {
        body += `--${boundary}\r\n`;
        body += `Content-Disposition: form-data; name="apiKey"\r\n\r\n`;
        body += apiKey;
        body += '\r\n';
      }
    }
    
    // Add provider if provided
    if (req.body.provider || (req.files && req.files.provider)) {
      const provider = req.body.provider || (req.files.provider && req.files.provider[0] ? req.files.provider[0].buffer.toString('utf-8') : null);
      if (provider) {
        body += `--${boundary}\r\n`;
        body += `Content-Disposition: form-data; name="provider"\r\n\r\n`;
        body += provider;
        body += '\r\n';
      }
    }
    
    body += `--${boundary}--\r\n`;
    
    // Convert to Lambda event format with raw body as base64
    const event = {
      httpMethod: 'POST',
      path: '/transcribe',
      rawPath: '/transcribe',
      queryStringParameters: null,
      headers: {
        ...req.headers,
        'content-type': `multipart/form-data; boundary=${boundary}`,
        'content-length': Buffer.byteLength(body).toString()
      },
      body: Buffer.from(body, 'binary').toString('base64'),
      isBase64Encoded: true,
      requestContext: {
        http: {
          method: 'POST',
          path: '/transcribe'
        },
        requestId: `local-${Date.now()}`,
        identity: {
          sourceIp: req.ip || '127.0.0.1'
        }
      }
    };
    
    console.log('Request body type:', typeof body);
    console.log('Request body length:', body.length);
    console.log('Is base64:', event.isBase64Encoded);
    
    // Create Lambda context
    const context = {
      requestId: event.requestContext.requestId,
      functionName: 'llmproxy-local-transcribe',
      functionVersion: '$LATEST',
      invokedFunctionArn: 'arn:aws:lambda:local:000000000000:function:llmproxy-local-transcribe',
      memoryLimitInMB: '512',
      awsRequestId: event.requestContext.requestId,
      getRemainingTimeInMillis: () => 300000
    };
    
    // Call transcribe endpoint directly (bypass streaming wrapper)
    const transcribeEndpoint = require('../src/endpoints/transcribe');
    const response = await transcribeEndpoint.handler(event, context);  // Pass context for logging
    
    // Send response
    console.log('Transcribe response status:', response.statusCode);
    console.log('Transcribe response body preview:', response.body ? response.body.substring(0, 200) : 'empty');
    
    const statusCode = response?.statusCode || 200;
    const headers = response?.headers || { 'Content-Type': 'application/json' };
    const responseBody = response?.body || JSON.stringify({ error: 'No response from handler' });
    
    res.status(statusCode);
    Object.keys(headers).forEach(key => {
      res.setHeader(key, headers[key]);
    });
    res.send(responseBody);
    
  } catch (error) {
    console.error('Transcription error:', error);
    res.status(500).json({
      error: 'Failed to process transcription',
      details: error.message
    });
  }
});

// File conversion endpoint (uses multer for file uploads)
app.post('/convert-to-markdown', upload.single('file'), async (req, res) => {
  try {
    let body;
    
    if (req.file) {
      // File uploaded via multipart/form-data
      body = {
        fileBuffer: req.file.buffer.toString('base64'),
        fileName: req.file.originalname,
        mimeType: req.file.mimetype
      };
    } else {
      // URL provided via JSON
      body = req.body;
    }
    
    // Convert to Lambda event format
    const event = {
      httpMethod: 'POST',
      path: '/convert-to-markdown',
      headers: req.headers,
      body: JSON.stringify(body),
      requestContext: {
        requestId: `local-${Date.now()}`,
        identity: { sourceIp: req.ip || '127.0.0.1' }
      }
    };
    
    // Create Lambda context with Express response
    const context = {
      requestId: `local-${Date.now()}`,
      expressResponse: res
    };
    
    // Call handler
    await handler(event, context);
    
  } catch (error) {
    console.error('Conversion error:', error);
    res.status(500).json({
      error: 'Failed to convert document',
      details: error.message
    });
  }
});

// Convert Express request to Lambda event format
function expressToLambdaEvent(req) {
  const event = {
    httpMethod: req.method,
    path: req.path,
    queryStringParameters: req.query || null,
    headers: req.headers,
    body: req.body ? (typeof req.body === 'string' ? req.body : JSON.stringify(req.body)) : null,
    isBase64Encoded: false,
    requestContext: {
      requestId: `local-${Date.now()}`,
      identity: {
        sourceIp: req.ip || '127.0.0.1'
      }
    }
  };
  
  return event;
}

// Convert Lambda response to Express response
function lambdaToExpressResponse(lambdaResponse, res) {
  // Handle streaming responses
  if (lambdaResponse && typeof lambdaResponse.pipe === 'function') {
    // It's a stream
    lambdaResponse.pipe(res);
    return;
  }
  
  // Handle regular responses
  const statusCode = lambdaResponse.statusCode || 200;
  const headers = lambdaResponse.headers || {};
  const body = lambdaResponse.body;
  
  // Set headers
  Object.keys(headers).forEach(key => {
    res.setHeader(key, headers[key]);
  });
  
  // Set status and send body
  res.status(statusCode);
  
  if (lambdaResponse.isBase64Encoded) {
    res.send(Buffer.from(body, 'base64'));
  } else {
    res.send(body);
  }
}

// Main handler for all routes
const handleRequest = async (req, res) => {
  try {
    console.log(`📥 Request: ${req.method} ${req.path}`);
    
    // Convert Express request to Lambda event
    const event = expressToLambdaEvent(req);
    
    // Create Lambda context
    const context = {
      requestId: `local-${Date.now()}`,
      functionName: 'llmproxy-local',
      functionVersion: '$LATEST',
      invokedFunctionArn: 'arn:aws:lambda:local:000000000000:function:llmproxy-local',
      memoryLimitInMB: '512',
      awsRequestId: `local-${Date.now()}`,
      getRemainingTimeInMillis: () => 300000, // 5 minutes
      done: () => {},
      fail: () => {},
      succeed: () => {},
      expressResponse: res  // Pass Express response for streaming
    };
    
    // Call the Lambda handler
    const response = await handler(event, context);
    
    // Handle streaming response from streamifyResponse wrapper
    if (response && response.isStreaming) {
      // Response was streamed directly to Express response
      // Headers and data were already sent, just log
      const metadata = response.metadata || {};
      const statusCode = metadata.statusCode || 200;
      console.log(`📤 Response: ${statusCode} (streaming)`);
    }
    // Handle regular Lambda response
    else if (response) {
      lambdaToExpressResponse(response, res);
      console.log(`📤 Response: ${response.statusCode || 200}`);
    } else {
      res.status(500).json({ error: 'No response from Lambda handler' });
      console.error('❌ No response from handler');
    }
    
  } catch (error) {
    console.error('❌ Error handling request:', error);
    res.status(500).json({ 
      error: 'Internal server error',
      message: error.message,
      stack: process.env.ENV === 'development' ? error.stack : undefined
    });
  }
};

// Handle all HTTP methods for all routes
app.all('*', handleRequest);

// Start server (with optional HTTPS support)
let server;
const USE_HTTPS = process.env.USE_HTTPS === 'true';

if (USE_HTTPS) {
  // Use basic self-signed certificate for HTTPS
  // Generate a simple self-signed cert using selfsigned package
  const selfsigned = require('selfsigned');
  const attrs = [{ name: 'commonName', value: 'localhost' }];
  const pems = selfsigned.generate(attrs, { days: 365 });
  
  const httpsOptions = {
    key: pems.private,
    cert: pems.cert
  };
  
  server = https.createServer(httpsOptions, app).listen(PORT, '0.0.0.0', () => {
    console.log('\n🚀 Local Lambda Development Server');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log(`📍 Listening on: https://localhost:${PORT}`);
    console.log('⚠️  Using self-signed certificate - you may need to accept browser warning');
  });
} else {
  server = app.listen(PORT, '0.0.0.0', () => {
    console.log('\n🚀 Local Lambda Development Server');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log(`📍 Listening on: http://localhost:${PORT}`);
    console.log(`🔐 OAuth Redirect: http://localhost:${PORT}/oauth/callback`);
    console.log('💡 Make sure this URI is registered in Google Cloud Console');
  });
}

// Graceful shutdown
process.on('SIGINT', () => {
  console.log('\n🛑 Shutting down gracefully...');
  server.close(() => {
    console.log('✅ Server closed');
    process.exit(0);
  });
});

process.on('SIGTERM', () => {
  console.log('\n🛑 Shutting down gracefully...');
  server.close(() => {
    console.log('✅ Server closed');
    process.exit(0);
  });
});
