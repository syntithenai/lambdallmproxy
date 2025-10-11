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

// Log all requests
app.use((req, res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.path}`);
  next();
});

// Load the Lambda handler
let handler;
try {
  const indexPath = path.join(__dirname, '../src/index.js');
  if (!fs.existsSync(indexPath)) {
    console.error('❌ ERROR: src/index.js not found!');
    process.exit(1);
  }
  
  // Delete require cache to allow hot reloading
  delete require.cache[require.resolve(indexPath)];
  
  const lambdaModule = require(indexPath);
  handler = lambdaModule.handler;
  
  if (!handler || typeof handler !== 'function') {
    console.error('❌ ERROR: No handler function exported from src/index.js');
    process.exit(1);
  }
  
  console.log('✅ Lambda handler loaded successfully');
} catch (error) {
  console.error('❌ ERROR loading Lambda handler:', error.message);
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
      succeed: () => {}
    };
    
    // Call the Lambda handler
    const response = await handler(event, context);
    
    // Convert Lambda response to Express response
    if (response) {
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
