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

// Load environment variables from .env file
require('dotenv').config();

const app = express();
const PORT = process.env.LOCAL_LAMBDA_PORT || 3000;

// Enable CORS for all origins in development
app.use(cors({
  origin: '*',
  methods: ['GET', 'POST', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
  credentials: true
}));

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

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ 
    status: 'ok', 
    service: 'local-lambda-server',
    timestamp: new Date().toISOString()
  });
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
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
};

// Handle all HTTP methods for all routes
app.all('*', handleRequest);

// Start server
const server = app.listen(PORT, '127.0.0.1', () => {
  console.log('');
  console.log('🚀 Local Lambda Development Server');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log(`📍 Listening on: http://localhost:${PORT}`);
  console.log(`🏥 Health check: http://localhost:${PORT}/health`);
  console.log('');
  console.log('Available endpoints:');
  console.log(`  POST http://localhost:${PORT}/chat`);
  console.log(`  POST http://localhost:${PORT}/providers`);
  console.log(`  GET  http://localhost:${PORT}/health`);
  console.log('');
  console.log('Press Ctrl+C to stop');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('');
});

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
