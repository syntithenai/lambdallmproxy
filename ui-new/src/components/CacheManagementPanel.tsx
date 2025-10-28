/**
 * Cache Management Panel
 * 
 * Displays cache statistics and provides controls for:
 * - Viewing cache stats (hits, storage usage)
 * - Clearing cache
 * - Enabling/disabling caching
 */

import { useState, useEffect } from 'react';
import { cache } from '../services/cache';

interface CacheStats {
  llmResponses: number;
  searchResults: number;
  toolOutputs: number;
  storageUsage: number;
  storageQuota: number;
  enabled: boolean;
}

export function CacheManagementPanel() {
  const [stats, setStats] = useState<CacheStats>({
    llmResponses: 0,
    searchResults: 0,
    toolOutputs: 0,
    storageUsage: 0,
    storageQuota: 0,
    enabled: true
  });
  const [isLoading, setIsLoading] = useState(false);

  // Load cache stats on mount
  useEffect(() => {
    loadStats();
  }, []);

  async function loadStats() {
    try {
      const newStats = await cache.getStats();
      setStats(newStats);
    } catch (error) {
      console.error('Failed to load cache stats:', error);
    }
  }

  async function handleClearCache() {
    if (!confirm('Are you sure you want to clear all cached data? This will remove cached chat responses, search results, and tool outputs.')) {
      return;
    }

    setIsLoading(true);
    try {
      await cache.clearAll();
      await loadStats();
      alert('Cache cleared successfully!');
    } catch (error) {
      console.error('Failed to clear cache:', error);
      alert('Failed to clear cache. Check console for details.');
    } finally {
      setIsLoading(false);
    }
  }

  async function handleToggleCaching(enabled: boolean) {
    cache.setEnabled(enabled);
    await loadStats();
  }

  // Format bytes to human-readable
  function formatBytes(bytes: number): string {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${(bytes / Math.pow(k, i)).toFixed(2)} ${sizes[i]}`;
  }

  // Calculate storage usage percentage
  const usagePercent = stats.storageQuota > 0 
    ? (stats.storageUsage / stats.storageQuota * 100).toFixed(1)
    : '0';

  const totalEntries = stats.llmResponses + stats.searchResults + stats.toolOutputs;

  return (
    <div className="cache-management-panel">
      <h3>💾 Cache Management</h3>
      
      {/* Enable/Disable Toggle */}
      <div className="cache-toggle">
        <label>
          <input
            type="checkbox"
            checked={stats.enabled}
            onChange={(e) => handleToggleCaching(e.target.checked)}
          />
          <span>Enable Aggressive Caching</span>
        </label>
        <p className="hint">
          Cache LLM responses and search results to reduce API costs and improve performance.
          Cached data expires after 4 hours.
        </p>
      </div>

      {stats.enabled && (
        <>
          {/* Cache Statistics */}
          <div className="cache-stats">
            <h4>Cache Statistics</h4>
            
            <div className="stat-grid">
              <div className="stat-item">
                <div className="stat-label">LLM Responses</div>
                <div className="stat-value">{stats.llmResponses}</div>
              </div>
              
              <div className="stat-item">
                <div className="stat-label">Search Results</div>
                <div className="stat-value">{stats.searchResults}</div>
              </div>
              
              <div className="stat-item">
                <div className="stat-label">Tool Outputs</div>
                <div className="stat-value">{stats.toolOutputs}</div>
              </div>
              
              <div className="stat-item">
                <div className="stat-label">Total Entries</div>
                <div className="stat-value">{totalEntries}</div>
              </div>
            </div>

            {/* Storage Usage */}
            <div className="storage-usage">
              <div className="storage-header">
                <span>Storage Usage</span>
                <span>{formatBytes(stats.storageUsage)} / {formatBytes(stats.storageQuota)} ({usagePercent}%)</span>
              </div>
              <div className="storage-bar">
                <div 
                  className="storage-fill" 
                  style={{ width: `${usagePercent}%` }}
                ></div>
              </div>
              <p className="hint">
                Cache automatically evicts oldest entries when storage limit (100MB) is reached.
              </p>
            </div>
          </div>

          {/* Actions */}
          <div className="cache-actions">
            <button
              onClick={loadStats}
              disabled={isLoading}
              className="btn-secondary"
            >
              🔄 Refresh Stats
            </button>
            
            <button
              onClick={handleClearCache}
              disabled={isLoading || totalEntries === 0}
              className="btn-danger"
            >
              🗑️ Clear All Cache
            </button>
          </div>

          {/* Cache Info */}
          <div className="cache-info">
            <h4>ℹ️ How Caching Works</h4>
            <ul>
              <li><strong>LLM Responses:</strong> Identical conversations return cached results instantly (no API call)</li>
              <li><strong>Search Results:</strong> Recent searches are cached for 4 hours to reduce API calls</li>
              <li><strong>Tool Outputs:</strong> Expensive operations (transcriptions, code execution) are cached</li>
              <li><strong>Privacy:</strong> All cache data is stored locally in your browser (IndexedDB)</li>
              <li><strong>Auto-Cleanup:</strong> Expired entries are automatically removed hourly</li>
            </ul>
          </div>
        </>
      )}

      <style>{`
        .cache-management-panel {
          padding: 1rem;
          background: var(--bg-secondary, #f5f5f5);
          border-radius: 8px;
          margin-bottom: 1rem;
        }

        .cache-management-panel h3 {
          margin: 0 0 1rem 0;
          font-size: 1.25rem;
        }

        .cache-management-panel h4 {
          margin: 1rem 0 0.5rem 0;
          font-size: 1rem;
        }

        .cache-toggle {
          margin-bottom: 1.5rem;
        }

        .cache-toggle label {
          display: flex;
          align-items: center;
          gap: 0.5rem;
          font-weight: 500;
          cursor: pointer;
        }

        .cache-toggle input[type="checkbox"] {
          width: 1.25rem;
          height: 1.25rem;
          cursor: pointer;
        }

        .hint {
          margin: 0.5rem 0 0 0;
          font-size: 0.875rem;
          color: var(--text-secondary, #666);
        }

        .cache-stats {
          margin-bottom: 1.5rem;
        }

        .stat-grid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
          gap: 1rem;
          margin-bottom: 1rem;
        }

        .stat-item {
          background: var(--bg-primary, white);
          padding: 1rem;
          border-radius: 6px;
          border: 1px solid var(--border-color, #ddd);
        }

        .stat-label {
          font-size: 0.875rem;
          color: var(--text-secondary, #666);
          margin-bottom: 0.5rem;
        }

        .stat-value {
          font-size: 1.5rem;
          font-weight: 700;
          color: var(--text-primary, #333);
        }

        .storage-usage {
          background: var(--bg-primary, white);
          padding: 1rem;
          border-radius: 6px;
          border: 1px solid var(--border-color, #ddd);
        }

        .storage-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 0.5rem;
          font-size: 0.875rem;
        }

        .storage-bar {
          height: 8px;
          background: var(--border-color, #ddd);
          border-radius: 4px;
          overflow: hidden;
          margin-bottom: 0.5rem;
        }

        .storage-fill {
          height: 100%;
          background: linear-gradient(90deg, #4CAF50, #8BC34A);
          transition: width 0.3s ease;
        }

        .cache-actions {
          display: flex;
          gap: 0.5rem;
          margin-bottom: 1.5rem;
        }

        .cache-actions button {
          flex: 1;
          padding: 0.75rem 1rem;
          border: none;
          border-radius: 6px;
          font-size: 0.875rem;
          font-weight: 500;
          cursor: pointer;
          transition: all 0.2s;
        }

        .cache-actions button:disabled {
          opacity: 0.5;
          cursor: not-allowed;
        }

        .btn-secondary {
          background: var(--bg-primary, white);
          border: 1px solid var(--border-color, #ddd);
          color: var(--text-primary, #333);
        }

        .btn-secondary:hover:not(:disabled) {
          background: var(--bg-hover, #f0f0f0);
        }

        .btn-danger {
          background: #f44336;
          color: white;
        }

        .btn-danger:hover:not(:disabled) {
          background: #d32f2f;
        }

        .cache-info {
          background: var(--bg-primary, white);
          padding: 1rem;
          border-radius: 6px;
          border: 1px solid var(--border-color, #ddd);
        }

        .cache-info ul {
          margin: 0.5rem 0 0 0;
          padding-left: 1.5rem;
        }

        .cache-info li {
          margin-bottom: 0.5rem;
          font-size: 0.875rem;
          line-height: 1.5;
        }
      `}</style>
    </div>
  );
}
