# AWS Lambda Concurrency Limit Issue

## Problem
Your AWS account has a Lambda concurrent execution limit of **10** (extremely low). This causes `ConcurrentInvocationLimitExceeded` errors when:
- Multiple users access the app
- A single user has multiple browser tabs open  
- Requests take longer than a few seconds (blocking a concurrency slot)

## Why Planning Requires Only ONE Lambda Invocation

A planning request should only trigger **one** Lambda invocation:
1. User clicks "Generate Plan" in UI
2. UI calls `/planning` endpoint (1 Lambda invocation)
3. Lambda makes ONE call to Gemini/Groq LLM API
4. Lambda streams response back to UI
5. Lambda invocation ends

**No nested Lambda calls**. No retries (unless explicit error). No tools execution.

## Why You're Hitting the Limit

With only 10 concurrent executions and typical request times of 5-30 seconds:

### Scenario 1: Single User, Multiple Tabs
- Tab 1: Planning request (5-10s) = 1 concurrent
- Tab 2: Chat request (10-30s) = 1 concurrent  
- Tab 3: Usage stats (5s) = 1 concurrent
- **Total: 3 concurrent from 1 user**

### Scenario 2: Multiple Users
- User A: 2 tabs with active requests = 2 concurrent
- User B: 2 tabs with active requests = 2 concurrent
- User C: 1 tab with request = 1 concurrent
- Background: Health checks, etc. = 1-2 concurrent
- **Total: 7-8 concurrent from 3 users**

### Scenario 3: Slow Requests
If a planning request takes 30 seconds and you make 10 requests:
- Even staggered by 3 seconds each, you'll have multiple overlapping
- Request 1 still running when Request 4 starts
- **Easy to hit 10 concurrent**

## Root Cause: AWS Account Limit

Normal AWS accounts get **1000** concurrent Lambda executions by default.  
Your account only has **10**.

This happens when:
1. **Free Tier** - New AWS accounts in free tier
2. **Service Quotas** - Manually reduced limits
3. **Regional Limits** - Some regions have lower defaults
4. **Organizational Policies** - AWS Organizations can set limits

## Solutions

### Immediate Solution: Request Limit Increase

1. **Go to AWS Service Quotas Console**:
   ```
   https://console.aws.amazon.com/servicequotas/home/services/lambda/quotas
   ```

2. **Find "Concurrent executions"** quota for Lambda

3. **Request increase to 1000** (standard limit)
   - Reason: "Production application needs standard Lambda concurrency"
   - Approval time: Usually 24-48 hours

4. **Alternative: Use AWS Support**:
   ```bash
   aws support create-case \
     --service-code lambda \
     --category-code general-guidance \
     --severity-code low \
     --subject "Request Lambda Concurrent Execution Increase to 1000" \
     --communication-body "Please increase Lambda concurrent execution limit from 10 to 1000 for region us-east-1. This is a production application requiring standard concurrency limits." \
     --region us-east-1
   ```

### Temporary Workarounds (Until Limit Increased)

#### 1. Reduce Concurrent Users
- Limit to 1-2 active users at a time
- Close extra browser tabs
- Avoid simultaneous requests

#### 2. Optimize Request Duration
Already done - your Lambda is optimized:
- Fast model selection
- Efficient code
- Streaming responses

#### 3. Client-Side Request Queuing (Already Implemented)
I created `/ui-new/src/utils/requestQueue.ts` but didn't integrate it yet.

#### 4. Use Multiple Lambda Functions
Split endpoints across multiple functions:
- `llmproxy-chat` (5 concurrent reserved)
- `llmproxy-planning` (3 concurrent reserved)
- `llmproxy-usage` (2 concurrent reserved)

But with 10 total limit, this doesn't help much.

## Recommended Action

**Request AWS limit increase to 1000 concurrent executions**

This is the standard limit and should be approved automatically. The 10 limit is abnormally low and not suitable for any production use.

While waiting for approval:
- Limit concurrent users
- Close extra browser tabs
- Avoid rapid-fire requests

## Monitoring

Check current usage:
```bash
aws lambda get-account-settings --region us-east-1 \
  --query 'AccountLimit.{UnreservedConcurrentExecutions:UnreservedConcurrentExecutions,ConcurrentExecutions:ConcurrentExecutions}'
```

Check function metrics:
```bash
aws cloudwatch get-metric-statistics \
  --namespace AWS/Lambda \
  --metric-name ConcurrentExecutions \
  --dimensions Name=FunctionName,Value=llmproxy \
  --start-time $(date -u -d '1 hour ago' +%Y-%m-%dT%H:%M:%S) \
  --end-time $(date -u +%Y-%m-%dT%H:%M:%S) \
  --period 300 \
  --statistics Maximum \
  --region us-east-1
```
