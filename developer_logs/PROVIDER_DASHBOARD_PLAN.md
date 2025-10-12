# Provider Availability Dashboard Implementation Plan

## Overview
Create a real-time dashboard showing the health and availability status of all LLM providers and models.

## Backend Endpoint

### `/api/provider-status` (GET)

Create file: `src/endpoints/provider-status.js`

```javascript
const { RateLimitTracker } = require('../model-selection/rate-limit-tracker');
const catalog = require('../../PROVIDER_CATALOG.json');

async function providerStatus(event) {
  const rateLimitTracker = RateLimitTracker.getInstance();
  
  const status = {};
  
  // Iterate through all providers and models
  for (const [providerName, provider] of Object.entries(catalog.providers)) {
    status[providerName] = {
      name: provider.name,
      type: provider.type,
      models: {}
    };
    
    for (const model of provider.models) {
      const modelName = model.name;
      const providerType = provider.type;
      
      // Get rate limit status
      const isAvailable = rateLimitTracker.isAvailable(providerType, modelName, 1000);
      const healthScore = rateLimitTracker.getHealthScore(providerType, modelName);
      const performance = rateLimitTracker.getAveragePerformance(providerType, modelName);
      
      // Get model limit details
      const modelLimit = rateLimitTracker.getModelLimit(providerType, modelName);
      
      status[providerName].models[modelName] = {
        available: isAvailable,
        healthScore: healthScore,
        isHealthy: healthScore >= 10 && (modelLimit?.consecutiveErrors || 0) < 3,
        performance: performance ? {
          avgTTFT: performance.avgTTFT,
          avgDuration: performance.avgDuration,
          sampleSize: performance.sampleSize
        } : null,
        rateLimit: modelLimit ? {
          requestsPerMinute: modelLimit.requestsPerMinute,
          tokensPerMinute: modelLimit.tokensPerMinute,
          requestsUsed: modelLimit.requestsUsed,
          tokensUsed: modelLimit.tokensUsed,
          requestsRemaining: modelLimit.requestsRemaining,
          tokensRemaining: modelLimit.tokensRemaining,
          consecutiveErrors: modelLimit.consecutiveErrors,
          successfulRequests: modelLimit.successfulRequests,
          totalRequests: modelLimit.totalRequests
        } : null,
        pricing: model.pricing,
        contextWindow: model.context_window,
        free: model.free || false
      };
    }
  }
  
  return {
    statusCode: 200,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*'
    },
    body: JSON.stringify({
      timestamp: new Date().toISOString(),
      providers: status
    })
  };
}

module.exports = { providerStatus };
```

Register endpoint in `src/index.js`:
```javascript
const { providerStatus } = require('./endpoints/provider-status');

// In handler:
if (path === '/provider-status' && httpMethod === 'GET') {
  return await providerStatus(event);
}
```

## Frontend Component

### `ui-new/src/components/ProviderDashboard.tsx`

```typescript
import React, { useState, useEffect } from 'react';
import './ProviderDashboard.css';

interface PerformanceData {
  avgTTFT: number;
  avgDuration: number;
  sampleSize: number;
}

interface RateLimitData {
  requestsPerMinute: number;
  tokensPerMinute: number;
  requestsUsed: number;
  tokensUsed: number;
  requestsRemaining?: number;
  tokensRemaining?: number;
  consecutiveErrors: number;
  successfulRequests: number;
  totalRequests: number;
}

interface ModelStatus {
  available: boolean;
  healthScore: number;
  isHealthy: boolean;
  performance: PerformanceData | null;
  rateLimit: RateLimitData | null;
  pricing: {
    input: number;
    output: number;
  };
  contextWindow: number;
  free: boolean;
}

interface ProviderStatus {
  name: string;
  type: string;
  models: {
    [modelName: string]: ModelStatus;
  };
}

interface DashboardData {
  timestamp: string;
  providers: {
    [providerName: string]: ProviderStatus;
  };
}

export const ProviderDashboard: React.FC = () => {
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [autoRefresh, setAutoRefresh] = useState(true);

  const fetchStatus = async () => {
    try {
      const response = await fetch('https://your-lambda-url/provider-status');
      if (!response.ok) throw new Error('Failed to fetch provider status');
      const data = await response.json();
      setData(data);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchStatus();
    
    if (autoRefresh) {
      const interval = setInterval(fetchStatus, 10000); // Refresh every 10s
      return () => clearInterval(interval);
    }
  }, [autoRefresh]);

  const getHealthColor = (score: number): string => {
    if (score >= 70) return 'green';
    if (score >= 30) return 'orange';
    return 'red';
  };

  const formatTTFT = (ms: number): string => {
    if (ms < 1000) return `${ms}ms`;
    return `${(ms / 1000).toFixed(2)}s`;
  };

  if (loading) return <div className="dashboard-loading">Loading provider status...</div>;
  if (error) return <div className="dashboard-error">Error: {error}</div>;
  if (!data) return <div className="dashboard-empty">No data available</div>;

  return (
    <div className="provider-dashboard">
      <div className="dashboard-header">
        <h2>Provider Availability Dashboard</h2>
        <div className="dashboard-controls">
          <span className="last-updated">
            Last updated: {new Date(data.timestamp).toLocaleTimeString()}
          </span>
          <label className="auto-refresh">
            <input
              type="checkbox"
              checked={autoRefresh}
              onChange={(e) => setAutoRefresh(e.target.checked)}
            />
            Auto-refresh (10s)
          </label>
          <button onClick={fetchStatus} className="refresh-btn">
            🔄 Refresh Now
          </button>
        </div>
      </div>

      {Object.entries(data.providers).map(([providerKey, provider]) => (
        <div key={providerKey} className="provider-section">
          <h3 className="provider-name">
            {provider.name}
            <span className="provider-type">{provider.type}</span>
          </h3>

          <div className="models-grid">
            {Object.entries(provider.models).map(([modelName, model]) => (
              <div
                key={modelName}
                className={`model-card ${model.available ? 'available' : 'unavailable'} ${
                  model.isHealthy ? 'healthy' : 'unhealthy'
                }`}
              >
                <div className="model-header">
                  <h4 className="model-name">
                    {modelName}
                    {model.free && <span className="free-badge">FREE</span>}
                  </h4>
                  <div className="model-status-indicators">
                    <span className={`status-dot ${model.available ? 'green' : 'red'}`} />
                    <span
                      className="health-score"
                      style={{ color: getHealthColor(model.healthScore) }}
                    >
                      {model.healthScore}/100
                    </span>
                  </div>
                </div>

                <div className="model-details">
                  {/* Performance */}
                  {model.performance && (
                    <div className="detail-row">
                      <span className="detail-label">⚡ TTFT:</span>
                      <span className="detail-value">
                        {formatTTFT(model.performance.avgTTFT)}
                        <span className="sample-size">
                          ({model.performance.sampleSize} samples)
                        </span>
                      </span>
                    </div>
                  )}

                  {/* Rate Limits */}
                  {model.rateLimit && (
                    <>
                      <div className="detail-row">
                        <span className="detail-label">📊 Requests:</span>
                        <span className="detail-value">
                          {model.rateLimit.requestsRemaining !== undefined
                            ? `${model.rateLimit.requestsRemaining}/${model.rateLimit.requestsPerMinute}`
                            : `${model.rateLimit.requestsUsed}/${model.rateLimit.requestsPerMinute}`}
                          /min
                        </span>
                      </div>
                      <div className="detail-row">
                        <span className="detail-label">🎫 Tokens:</span>
                        <span className="detail-value">
                          {model.rateLimit.tokensRemaining !== undefined
                            ? `${Math.round(model.rateLimit.tokensRemaining / 1000)}k/${Math.round(model.rateLimit.tokensPerMinute / 1000)}k`
                            : `${Math.round(model.rateLimit.tokensUsed / 1000)}k/${Math.round(model.rateLimit.tokensPerMinute / 1000)}k`}
                          /min
                        </span>
                      </div>
                      {model.rateLimit.consecutiveErrors > 0 && (
                        <div className="detail-row error-row">
                          <span className="detail-label">⚠️ Errors:</span>
                          <span className="detail-value error-value">
                            {model.rateLimit.consecutiveErrors} consecutive
                          </span>
                        </div>
                      )}
                      {model.rateLimit.totalRequests > 0 && (
                        <div className="detail-row">
                          <span className="detail-label">✅ Success Rate:</span>
                          <span className="detail-value">
                            {Math.round((model.rateLimit.successfulRequests / model.rateLimit.totalRequests) * 100)}%
                            <span className="sample-size">
                              ({model.rateLimit.successfulRequests}/{model.rateLimit.totalRequests})
                            </span>
                          </span>
                        </div>
                      )}
                    </>
                  )}

                  {/* Pricing */}
                  <div className="detail-row">
                    <span className="detail-label">💰 Cost:</span>
                    <span className="detail-value">
                      ${model.pricing.input.toFixed(2)}/${ model.pricing.output.toFixed(2)} per 1M tokens
                    </span>
                  </div>

                  {/* Context */}
                  <div className="detail-row">
                    <span className="detail-label">📝 Context:</span>
                    <span className="detail-value">
                      {model.contextWindow >= 1000000
                        ? `${(model.contextWindow / 1000000).toFixed(1)}M`
                        : `${Math.round(model.contextWindow / 1000)}k`}
                    </span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
};
```

### CSS Styling (`ui-new/src/components/ProviderDashboard.css`)

```css
.provider-dashboard {
  padding: 20px;
  max-width: 1600px;
  margin: 0 auto;
}

.dashboard-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 30px;
  padding-bottom: 15px;
  border-bottom: 2px solid #e0e0e0;
}

.dashboard-controls {
  display: flex;
  gap: 15px;
  align-items: center;
}

.last-updated {
  color: #666;
  font-size: 14px;
}

.refresh-btn {
  padding: 8px 16px;
  background: #007bff;
  color: white;
  border: none;
  border-radius: 4px;
  cursor: pointer;
}

.refresh-btn:hover {
  background: #0056b3;
}

.provider-section {
  margin-bottom: 40px;
}

.provider-name {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 15px;
}

.provider-type {
  font-size: 14px;
  padding: 4px 8px;
  background: #f0f0f0;
  border-radius: 4px;
  font-weight: normal;
}

.models-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(350px, 1fr));
  gap: 15px;
}

.model-card {
  border: 2px solid #e0e0e0;
  border-radius: 8px;
  padding: 15px;
  background: white;
}

.model-card.available {
  border-left: 4px solid #28a745;
}

.model-card.unavailable {
  border-left: 4px solid #dc3545;
  opacity: 0.7;
}

.model-card.unhealthy {
  background: #fff5f5;
}

.model-header {
  display: flex;
  justify-content: space-between;
  align-items: start;
  margin-bottom: 12px;
  padding-bottom: 8px;
  border-bottom: 1px solid #e0e0e0;
}

.model-name {
  margin: 0;
  font-size: 16px;
  display: flex;
  align-items: center;
  gap: 8px;
}

.free-badge {
  font-size: 10px;
  padding: 2px 6px;
  background: #28a745;
  color: white;
  border-radius: 3px;
  font-weight: bold;
}

.model-status-indicators {
  display: flex;
  align-items: center;
  gap: 8px;
}

.status-dot {
  width: 10px;
  height: 10px;
  border-radius: 50%;
}

.status-dot.green {
  background: #28a745;
}

.status-dot.red {
  background: #dc3545;
}

.health-score {
  font-weight: bold;
  font-size: 14px;
}

.model-details {
  font-size: 13px;
}

.detail-row {
  display: flex;
  justify-content: space-between;
  padding: 4px 0;
}

.detail-label {
  color: #666;
}

.detail-value {
  font-weight: 500;
}

.sample-size {
  color: #999;
  font-size: 11px;
  margin-left: 4px;
}

.error-row {
  background: #fff3cd;
  padding: 6px 8px;
  margin: 4px -8px;
  border-radius: 4px;
}

.error-value {
  color: #dc3545;
  font-weight: bold;
}
```

## Integration Steps

1. **Add endpoint to Lambda:**
   - Create `src/endpoints/provider-status.js`
   - Register in `src/index.js`
   - Deploy Lambda

2. **Add React component:**
   - Create `ui-new/src/components/ProviderDashboard.tsx`
   - Create `ui-new/src/components/ProviderDashboard.css`
   - Import and add to main app/tabs

3. **Add to UI navigation:**
   In `ui-new/src/App.tsx` or wherever tabs are defined:
   ```typescript
   import { ProviderDashboard } from './components/ProviderDashboard';
   
   // Add to tabs:
   <Tab label="Provider Status" value="providers">
     <ProviderDashboard />
   </Tab>
   ```

4. **Test:**
   - Check endpoint returns correct data
   - Verify dashboard displays properly
   - Test auto-refresh functionality
   - Check responsiveness on mobile

## Features

✅ Real-time provider and model status  
✅ Health scores with color coding  
✅ Performance metrics (TTFT, duration)  
✅ Rate limit tracking (requests/tokens)  
✅ Consecutive error tracking  
✅ Success rate percentage  
✅ Auto-refresh every 10 seconds  
✅ Manual refresh button  
✅ Free tier indicators  
✅ Cost information  
✅ Context window display  
✅ Responsive grid layout  

## Future Enhancements

- 📊 Historical charts (health/performance over time)
- 🔔 Alerts for provider outages
- 📈 Cost tracking per provider
- 🎯 Model recommendation based on current status
- 🔍 Search/filter models
- 📱 Mobile-optimized view
- 🌐 WebSocket for real-time updates
