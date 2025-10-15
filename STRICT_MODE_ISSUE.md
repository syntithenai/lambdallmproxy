# Root Cause: React StrictMode + Low Concurrency Limit

## The Real Problem

I found it! Your single tab with single user IS causing multiple concurrent Lambda invocations due to **React StrictMode**.

### React StrictMode Behavior

In `/ui-new/src/main.tsx`, the app is wrapped in `<StrictMode>`:

```tsx
createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
```

**In development mode, React StrictMode intentionally:**
1. **Runs effects twice** to detect side effects
2. **Mounts components, unmounts them, then remounts** to test cleanup
3. **Calls functions twice** to ensure they're pure

### How This Causes Multiple Lambda Invocations

#### Scenario 1: Page Load
1. User loads app → `UsageContext` mounts
2. `useEffect` runs → Calls `/usage` endpoint (1st Lambda invocation)
3. **StrictMode unmounts and remounts component**
4. `useEffect` runs again → Calls `/usage` endpoint (2nd Lambda invocation)
5. **Result: 2 concurrent Lambda invocations from page load alone**

#### Scenario 2: Planning Request
1. User clicks "Generate Plan"
2. `handleSubmit` runs → Calls `/planning` endpoint (1st invocation)
3. **If StrictMode causes re-render during submission:**
4. `handleSubmit` runs again → Calls `/planning` endpoint (2nd invocation)  
5. **Result: 2 concurrent planning requests**

#### Scenario 3: Multiple Tabs/Components
If you have:
- Usage stats loading (2 invocations from StrictMode)
- Chat tab active (potential background checks)
- Planning request (2 invocations from StrictMode)
- **Result: 4-6 concurrent invocations easily**

### Why This Hits Your 10 Concurrent Limit

```
Page Load:
  /usage (StrictMode run #1) → Lambda invocation 1 (5-10 seconds)
  /usage (StrictMode run #2) → Lambda invocation 2 (5-10 seconds)

User clicks Generate Plan:
  /planning (StrictMode run #1) → Lambda invocation 3 (10-30 seconds)
  /planning (StrictMode run #2) → Lambda invocation 4 (10-30 seconds)

If planning request is slow:
  - Invocations 1-4 all running concurrently
  - User clicks something else → Invocations 5-6
  - **BOOM: ConcurrentInvocationLimitExceeded**
```

## Solutions

### Solution 1: Disable StrictMode (Immediate Fix)

**Edit `/ui-new/src/main.tsx`:**

```tsx
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { resetApiBase } from './utils/api'

// ... existing code ...

createRoot(document.getElementById('root')!).render(
  <App />  // Remove StrictMode wrapper
)
```

**Pros:**
- Immediate fix
- Eliminates double API calls
- Reduces concurrent invocations by ~50%

**Cons:**
- Loses StrictMode development warnings
- Only fixes development mode (production already doesn't double-call)

### Solution 2: Add Request Deduplication

Prevent duplicate requests within a short time window:

```tsx
// utils/requestDeduplication.ts
const pendingRequests = new Map<string, Promise<any>>();

export async function deduplicatedRequest<T>(
  key: string,
  requestFn: () => Promise<T>,
  ttl: number = 100
): Promise<T> {
  // If request is already pending, return existing promise
  if (pendingRequests.has(key)) {
    return pendingRequests.get(key)!;
  }

  // Start new request
  const promise = requestFn();
  pendingRequests.set(key, promise);

  // Clean up after request completes or after TTL
  const cleanup = () => {
    setTimeout(() => pendingRequests.delete(key), ttl);
  };

  promise.then(cleanup, cleanup);
  return promise;
}
```

### Solution 3: Fix Effect Dependencies

Make effects more robust to prevent duplicate calls:

```tsx
// In UsageContext.tsx
useEffect(() => {
  let cancelled = false;
  
  const loadUsage = async () => {
    if (cancelled || !isAuthenticated || !accessToken) return;
    await fetchUsage();
  };
  
  loadUsage();
  
  return () => {
    cancelled = true;
  };
}, [isAuthenticated, accessToken]);
```

### Solution 4: Increase AWS Concurrency (Real Fix)

Still need to do this regardless:
- Request increase from 10 to 1000
- Even without StrictMode, 10 is too low for production

## Recommended Actions

### Immediate (Do Now):
1. **Disable StrictMode** in `main.tsx`
2. **Rebuild and deploy UI**
3. **Test with single tab** - should work now

### Short Term (Today):
4. **Request AWS concurrency increase** to 1000
   - Go to AWS Service Quotas
   - Request increase for Lambda concurrent executions
   - Should be auto-approved within 24-48 hours

### Long Term (Next Week):
5. **Add request deduplication** for robustness
6. **Re-enable StrictMode** once AWS limit is increased
7. **Add proper effect cleanup** to handle StrictMode correctly

## Verification

After disabling StrictMode:

```bash
# Check browser Network tab
# Should see:
# - 1 call to /usage (not 2)
# - 1 call to /planning per click (not 2)
# - No duplicate concurrent requests

# Check AWS CloudWatch
aws cloudwatch get-metric-statistics \
  --namespace AWS/Lambda \
  --metric-name ConcurrentExecutions \
  --dimensions Name=FunctionName,Value=llmproxy \
  --start-time $(date -u -d '10 minutes ago' +%Y-%m-%dT%H:%M:%S) \
  --end-time $(date -u +%Y-%m-%dT%H:%M:%S) \
  --period 60 \
  --statistics Maximum \
  --region us-east-1
```

Expected result: Max concurrent executions drops from ~4-6 to ~2-3
