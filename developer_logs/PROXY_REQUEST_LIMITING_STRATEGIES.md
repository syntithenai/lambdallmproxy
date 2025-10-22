# Proxy Request Limiting Strategies

**Date**: October 15, 2025  
**Purpose**: Reduce proxy costs and avoid rate limits  
**Current Proxy**: Webshare residential proxy with rotating IPs

## Current Proxy Usage

Your application currently uses Webshare proxy for:

1. **YouTube Data API Search** (`src/tools.js` - `search_youtube`)
2. **YouTube Transcript Fetching** (`src/youtube-api.js` - InnerTube API)
3. **DuckDuckGo Web Search** (`src/search.js`)
4. **Image Proxying** (`src/endpoints/proxy-image.js`)
5. **Web Content Scraping** (when enabled)

**Proxy Credentials**:
- Environment: `WEBSHARE_PROXY_USERNAME` / `WEBSHARE_PROXY_PASSWORD`
- User-provided: Via UI Settings → Proxy tab
- Format: `http://username-rotate:password@p.webshare.io:80/`

---

## Strategy 1: Request Caching ⭐ **Most Effective**

### Implementation: Cache Proxy Responses

**Benefits**: 
- Eliminates duplicate proxy requests
- Fastest response times
- Can reduce proxy usage by 50-80%

**Implementation Options**:

#### Option A: Lambda Memory Cache (Simple)
```javascript
// src/utils/proxy-cache.js
const cache = new Map();
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

function getCached(key) {
  const item = cache.get(key);
  if (item && Date.now() - item.timestamp < CACHE_TTL) {
    console.log(`✅ Cache hit: ${key}`);
    return item.data;
  }
  cache.delete(key);
  return null;
}

function setCached(key, data) {
  cache.set(key, { data, timestamp: Date.now() });
  // Limit cache size
  if (cache.size > 100) {
    const firstKey = cache.keys().next().value;
    cache.delete(firstKey);
  }
}

module.exports = { getCached, setCached };
```

#### Option B: DynamoDB Cache (Persistent)
```javascript
// src/utils/dynamo-cache.js
const AWS = require('aws-sdk');
const dynamo = new AWS.DynamoDB.DocumentClient();

async function getCached(key) {
  const result = await dynamo.get({
    TableName: 'ProxyCache',
    Key: { requestKey: key }
  }).promise();
  
  if (result.Item && result.Item.expiresAt > Date.now()) {
    return result.Item.data;
  }
  return null;
}

async function setCached(key, data, ttlMinutes = 5) {
  await dynamo.put({
    TableName: 'ProxyCache',
    Item: {
      requestKey: key,
      data: data,
      expiresAt: Date.now() + (ttlMinutes * 60 * 1000),
      createdAt: Date.now()
    }
  }).promise();
}
```

#### Usage Example:
```javascript
// In src/tools.js - search_youtube
case 'search_youtube': {
  const query = args.query;
  const cacheKey = `youtube:${query}`;
  
  // Check cache first
  const cached = getCached(cacheKey);
  if (cached) {
    return cached; // No proxy request needed!
  }
  
  // Make proxy request
  const proxyAgent = createWebshareProxyAgent(username, password);
  const results = await makeYouTubeRequest(query, proxyAgent);
  
  // Cache for future requests
  setCached(cacheKey, results);
  return results;
}
```

**Cache Keys**:
- YouTube search: `youtube:${query}`
- Web search: `websearch:${query}:${loadContent}`
- Transcripts: `transcript:${videoId}`
- Images: `image:${md5(imageUrl)}`

---

## Strategy 2: Selective Proxy Usage 🎯 **Cost-Effective**

### Only Use Proxy When Necessary

**Current Issue**: Proxy is used for ALL requests, even when not needed.

**Solution**: Use proxy only when:
1. Previous direct request failed with rate limit
2. Known problematic domains (YouTube, Google)
3. User explicitly enabled proxy in settings

```javascript
// src/utils/proxy-decision.js
const ALWAYS_USE_PROXY = [
  'youtube.com',
  'googlevideo.com',
  'google.com'
];

const directAttempts = new Map(); // Track failures

function shouldUseProxy(domain, context) {
  // User forced proxy on
  if (context.forceProxy) return true;
  
  // Known problematic domains
  if (ALWAYS_USE_PROXY.some(d => domain.includes(d))) {
    return true;
  }
  
  // Failed direct attempt recently
  const failures = directAttempts.get(domain) || 0;
  if (failures > 2) return true;
  
  // Try direct first
  return false;
}

function recordDirectFailure(domain) {
  const failures = directAttempts.get(domain) || 0;
  directAttempts.set(domain, failures + 1);
  
  // Reset after 10 minutes
  setTimeout(() => {
    directAttempts.delete(domain);
  }, 10 * 60 * 1000);
}
```

**Implementation**:
```javascript
// In search_web tool
const domain = new URL(url).hostname;
const useProxy = shouldUseProxy(domain, context);

try {
  if (useProxy) {
    result = await fetchWithProxy(url, proxyAgent);
  } else {
    result = await fetchDirect(url);
  }
} catch (error) {
  if (error.message.includes('rate limit') || error.statusCode === 429) {
    recordDirectFailure(domain);
    if (!useProxy) {
      // Retry with proxy
      result = await fetchWithProxy(url, proxyAgent);
    }
  }
}
```

---

## Strategy 3: Rate Limiting 🚦 **Prevents Abuse**

### Limit Requests Per User/Session

**Implementation**:

```javascript
// src/middleware/rate-limiter.js
const requestCounts = new Map();

function checkRateLimit(userId, endpoint) {
  const key = `${userId}:${endpoint}`;
  const now = Date.now();
  const windowStart = now - (60 * 1000); // 1 minute window
  
  // Get requests in current window
  let requests = requestCounts.get(key) || [];
  requests = requests.filter(t => t > windowStart);
  
  // Define limits by endpoint
  const limits = {
    'search_youtube': 10,  // 10/minute
    'search_web': 20,      // 20/minute
    'proxy-image': 30,     // 30/minute
    'transcribe': 5        // 5/minute
  };
  
  const limit = limits[endpoint] || 10;
  
  if (requests.length >= limit) {
    throw new Error(`Rate limit exceeded: ${limit} requests per minute for ${endpoint}`);
  }
  
  // Record this request
  requests.push(now);
  requestCounts.set(key, requests);
  
  return {
    remaining: limit - requests.length,
    resetAt: windowStart + (60 * 1000)
  };
}
```

**Usage**:
```javascript
// In endpoints/chat.js
async function handler(event, responseStream) {
  const userId = event.requestContext?.authorizer?.userId || event.headers['x-user-id'] || 'anonymous';
  
  // Check rate limit before processing
  try {
    const rateLimit = checkRateLimit(userId, 'chat');
    console.log(`Rate limit: ${rateLimit.remaining} remaining`);
  } catch (error) {
    return {
      statusCode: 429,
      body: JSON.stringify({ 
        error: 'Rate limit exceeded. Please wait before making more requests.',
        retryAfter: 60
      })
    };
  }
  
  // Process request...
}
```

---

## Strategy 4: Request Batching 📦 **Reduces Volume**

### Combine Multiple Requests

**Example**: Search multiple YouTube queries in one request

```javascript
// Instead of 3 separate proxy requests:
await searchYouTube('python tutorials');
await searchYouTube('python basics');
await searchYouTube('python advanced');

// Batch into one:
const queries = ['python tutorials', 'python basics', 'python advanced'];
const results = await Promise.all(
  queries.map(q => searchYouTube(q))
);
```

**Smart Batching**:
```javascript
function batchYouTubeSearches(queries, maxConcurrent = 3) {
  const batches = [];
  for (let i = 0; i < queries.length; i += maxConcurrent) {
    batches.push(queries.slice(i, i + maxConcurrent));
  }
  
  return batches.reduce(async (promise, batch) => {
    await promise;
    return Promise.all(batch.map(q => searchYouTube(q)));
  }, Promise.resolve());
}
```

---

## Strategy 5: Throttling/Debouncing 🕐 **Prevents Spikes**

### Add Delays Between Requests

```javascript
// src/utils/throttle.js
class RequestThrottler {
  constructor(minDelay = 500) {
    this.minDelay = minDelay;
    this.lastRequest = 0;
  }
  
  async throttle(fn) {
    const now = Date.now();
    const timeSinceLastRequest = now - this.lastRequest;
    
    if (timeSinceLastRequest < this.minDelay) {
      const delay = this.minDelay - timeSinceLastRequest;
      console.log(`⏱️ Throttling: waiting ${delay}ms`);
      await new Promise(resolve => setTimeout(resolve, delay));
    }
    
    this.lastRequest = Date.now();
    return fn();
  }
}

// Usage
const youtubeThrottler = new RequestThrottler(1000); // 1 second between requests

async function searchYouTube(query) {
  return youtubeThrottler.throttle(() => {
    return makeYouTubeAPIRequest(query);
  });
}
```

---

## Strategy 6: User-Level Controls 👤 **Transparency**

### Let Users Disable Proxy

**Add UI Controls**:

1. **Global proxy toggle** (already exists in Settings)
2. **Per-tool proxy settings**:
   ```typescript
   // In Settings modal
   - [ ] Use proxy for YouTube
   - [ ] Use proxy for web search
   - [ ] Use proxy for image fetching
   - [ ] Use proxy for transcripts
   ```

3. **Request count display**:
   ```typescript
   // In chat interface
   "🔒 Proxy requests this session: 45"
   "💰 Estimated cost: $0.09"
   ```

**Implementation**:
```javascript
// ui-new/src/contexts/SettingsContext.tsx
interface ProxySettings {
  enabled: boolean;
  username: string;
  password: string;
  useForYouTube: boolean;
  useForWebSearch: boolean;
  useForImages: boolean;
  useForTranscripts: boolean;
}

// Backend respects these settings
if (context.proxySettings?.useForYouTube && tool === 'search_youtube') {
  proxyAgent = createProxyAgent(username, password);
}
```

---

## Strategy 7: Quota Management 💰 **Budget Control**

### Set Hard Limits on Proxy Usage

```javascript
// src/utils/proxy-quota.js
const quotaStore = new Map();

function checkQuota(userId) {
  const quota = quotaStore.get(userId) || {
    daily: 0,
    weekly: 0,
    resetDaily: Date.now() + (24 * 60 * 60 * 1000),
    resetWeekly: Date.now() + (7 * 24 * 60 * 60 * 1000)
  };
  
  // Reset if expired
  if (Date.now() > quota.resetDaily) {
    quota.daily = 0;
    quota.resetDaily = Date.now() + (24 * 60 * 60 * 1000);
  }
  
  if (Date.now() > quota.resetWeekly) {
    quota.weekly = 0;
    quota.resetWeekly = Date.now() + (7 * 24 * 60 * 60 * 1000);
  }
  
  // Check limits
  const DAILY_LIMIT = 500;
  const WEEKLY_LIMIT = 2000;
  
  if (quota.daily >= DAILY_LIMIT) {
    throw new Error('Daily proxy quota exceeded');
  }
  
  if (quota.weekly >= WEEKLY_LIMIT) {
    throw new Error('Weekly proxy quota exceeded');
  }
  
  // Increment
  quota.daily++;
  quota.weekly++;
  quotaStore.set(userId, quota);
  
  return {
    dailyRemaining: DAILY_LIMIT - quota.daily,
    weeklyRemaining: WEEKLY_LIMIT - quota.weekly
  };
}
```

---

## Strategy 8: Direct Connection Preference 🔓 **Default Behavior**

### Try Direct First, Proxy as Fallback

**Current Implementation**: Already exists with `PROXY_FAILED:` pattern

**Enhance**:
```javascript
async function smartFetch(url, proxyAgent, options = {}) {
  const domain = new URL(url).hostname;
  const forceProxy = options.forceProxy || ALWAYS_USE_PROXY.includes(domain);
  
  if (forceProxy) {
    console.log(`🔒 Using proxy (required): ${domain}`);
    return fetchWithProxy(url, proxyAgent);
  }
  
  // Try direct first
  try {
    console.log(`🔓 Trying direct connection: ${domain}`);
    return await fetchDirect(url);
  } catch (error) {
    if (isRateLimitError(error)) {
      console.log(`⚠️ Direct failed (${error.message}), trying proxy...`);
      return fetchWithProxy(url, proxyAgent);
    }
    throw error;
  }
}
```

---

## Strategy 9: Monitoring & Alerting 📊 **Visibility**

### Track Proxy Usage

```javascript
// src/utils/proxy-metrics.js
const metrics = {
  requests: 0,
  failures: 0,
  cacheHits: 0,
  cacheMisses: 0,
  directSuccess: 0,
  proxySuccess: 0,
  bytesTransferred: 0
};

function recordProxyRequest(success, bytes = 0) {
  metrics.requests++;
  if (success) {
    metrics.proxySuccess++;
    metrics.bytesTransferred += bytes;
  } else {
    metrics.failures++;
  }
}

function recordCacheResult(hit) {
  if (hit) metrics.cacheHits++;
  else metrics.cacheMisses++;
}

function getMetrics() {
  const cacheHitRate = metrics.cacheHits / (metrics.cacheHits + metrics.cacheMisses) * 100;
  const successRate = metrics.proxySuccess / metrics.requests * 100;
  
  return {
    ...metrics,
    cacheHitRate: `${cacheHitRate.toFixed(1)}%`,
    successRate: `${successRate.toFixed(1)}%`,
    avgBytesPerRequest: Math.round(metrics.bytesTransferred / metrics.requests)
  };
}

// Log metrics periodically
setInterval(() => {
  console.log('📊 Proxy Metrics:', getMetrics());
}, 60 * 1000); // Every minute
```

---

## Recommended Implementation Priority

### Phase 1: Quick Wins (1-2 hours) ⚡
1. ✅ **Request Caching** (in-memory Map)
2. ✅ **Selective Proxy Usage** (YouTube/Google only)
3. ✅ **Basic Metrics** (console logging)

### Phase 2: User Controls (2-3 hours) 👤
1. **UI: Per-tool proxy toggles**
2. **UI: Request counter display**
3. **UI: Cost estimator**

### Phase 3: Advanced (4-6 hours) 🚀
1. **DynamoDB cache** (persistent across Lambda instances)
2. **Rate limiting** (per-user quotas)
3. **CloudWatch metrics** (monitoring dashboard)

---

## Cost Estimation

**Webshare Residential Proxy Pricing** (approx):
- $2.99 per GB bandwidth
- ~1000 requests per GB (depending on response size)
- **Cost per request**: $0.003

**With Caching (50% hit rate)**:
- 1000 requests/day → 500 proxy requests
- Cost: 500 × $0.003 = **$1.50/day**
- Without cache: **$3.00/day**
- **Savings: 50%** 💰

**With All Strategies**:
- Cache (50% reduction) + Selective usage (30% reduction) = **65% total reduction**
- 1000 requests/day → 350 proxy requests
- Cost: **$1.05/day**
- **Savings: 65%** 🎉

---

## Quick Start: Implement Caching

Here's the simplest, most effective change you can make right now:

```javascript
// src/utils/simple-cache.js
const cache = new Map();
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

function getCached(key) {
  const item = cache.get(key);
  if (item && Date.now() - item.ts < CACHE_TTL) return item.data;
  cache.delete(key);
  return null;
}

function setCached(key, data) {
  if (cache.size > 100) cache.delete(cache.keys().next().value);
  cache.set(key, { data, ts: Date.now() });
}

module.exports = { getCached, setCached };
```

**Add to src/tools.js**:
```javascript
const { getCached, setCached } = require('./utils/simple-cache');

// In search_youtube:
const cacheKey = `yt:${query}`;
const cached = getCached(cacheKey);
if (cached) return cached;

// ... make request ...

setCached(cacheKey, response);
return response;
```

**Expected Impact**: 40-60% reduction in proxy requests immediately! 🚀

---

## Questions to Consider

1. **What's your current proxy usage/cost?**
   - Check Webshare dashboard for request count
   - Estimate current monthly cost

2. **Which tools use proxy most?**
   - YouTube search?
   - Web scraping?
   - Image fetching?
   - Transcripts?

3. **What's acceptable cache freshness?**
   - YouTube search: 5-10 minutes
   - Web content: 1-5 minutes
   - Transcripts: Hours/days (rarely change)
   - Images: Days (immutable)

4. **Do you need per-user limits?**
   - Public deployment: Yes
   - Personal use: No

---

## Next Steps

Choose your approach based on priorities:

### Priority: **Reduce Cost** 💰
→ Implement **Caching + Selective Usage**

### Priority: **Prevent Abuse** 🛡️
→ Implement **Rate Limiting + Quotas**

### Priority: **User Control** 👤
→ Add **UI toggles + Metrics display**

### Priority: **Reliability** 🔧
→ Enhance **Direct-first + Fallback logic**

Let me know which strategies interest you most and I can help implement them! 🚀
