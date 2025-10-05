# AWS Lambda Global Object Fix

## Issue
Lambda function was failing with `Runtime.ImportModuleError: Cannot find module 'aws-lambda'`

## Root Cause
The code was incorrectly trying to import `awslambda` as an npm module:
```javascript
const awslambda = require('aws-lambda');  // ❌ WRONG
```

## Solution
When using AWS Lambda Response Streaming mode, `awslambda` is a **global object** provided by the Lambda runtime environment. It does not need to be imported.

### Files Fixed
1. `src/index.js` - Removed incorrect import
2. `src/endpoints/planning.js` - Removed incorrect import  
3. `src/endpoints/search.js` - Removed incorrect import

### Correct Usage
```javascript
// Note: awslambda is a global object provided by Lambda runtime when using Response Streaming
// No import needed - it's automatically available

// Use awslambda directly in handler:
exports.handler = awslambda.streamifyResponse(async (event, responseStream, context) => {
    // Your streaming code here
});
```

## Key Points
- `awslambda` is NOT an npm package
- It's a global object when Lambda InvokeMode is `RESPONSE_STREAM`
- Available automatically in Node.js 20+ runtime
- Only works with `streamifyResponse()` wrapper

## References
- [AWS Lambda Response Streaming Documentation](https://docs.aws.amazon.com/lambda/latest/dg/configuration-response-streaming.html)
- Lambda InvokeMode must be set to `RESPONSE_STREAM` in Function URL configuration

## Deployment
After fixing, redeploy with:
```bash
./scripts/deploy.sh
```

The deploy script automatically ensures InvokeMode is `RESPONSE_STREAM`.
