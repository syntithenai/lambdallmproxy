import React, { useState, useEffect } from 'react';
import './BillingPage.css';
import { useAuth } from '../contexts/AuthContext';

interface Transaction {
  rowIndex: number;
  timestamp: string;
  type: 'chat' | 'embedding' | 'guardrail_input' | 'guardrail_output' | 'planning';
  provider: string;
  model: string;
  tokensIn: number;
  tokensOut: number;
  totalTokens: number;
  cost: number;
  durationMs: number;
  memoryLimitMB: number;
  memoryUsedMB: number;
  requestId: string;
  status: string;
  error: string;
}

interface Totals {
  totalCost: number;
  totalTokens: number;
  totalRequests?: number;
  totalTokensIn?: number;
  totalTokensOut?: number;
  byType?: Record<string, { cost: number; tokens: number; requests: number }>;
  byProvider?: Record<string, { cost: number; tokens: number; requests: number }>;
  byModel?: Record<string, { 
    cost: number; 
    tokens: number; 
    requests: number; 
    provider: string; 
    model: string;
  }>;
  dateRange?: {
    start: string | null;
    end: string | null;
  };
}

interface BillingData {
  success: boolean;
  transactions: Transaction[];
  totals: Totals;
  count: number;
  source?: 'personal' | 'service';
  message?: string;
  fallback?: boolean;
  fallbackReason?: string;
  personalSheetEmpty?: boolean;
}

interface ClearDataModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (mode: 'all' | 'provider' | 'dateRange', options: any) => void;
  providers: string[];
}

const ClearDataModal: React.FC<ClearDataModalProps> = ({ isOpen, onClose, onConfirm, providers }) => {
  const [mode, setMode] = useState<'all' | 'provider' | 'dateRange'>('all');
  const [selectedProvider, setSelectedProvider] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [confirmed, setConfirmed] = useState(false);

  if (!isOpen) return null;

  const handleSubmit = () => {
    const options: any = {};
    
    if (mode === 'provider') {
      options.provider = selectedProvider;
    } else if (mode === 'dateRange') {
      if (startDate) options.startDate = startDate;
      if (endDate) options.endDate = endDate;
    }
    
    onConfirm(mode, options);
    setConfirmed(false);
    onClose();
  };

  const isValid = () => {
    if (!confirmed) return false;
    if (mode === 'provider' && !selectedProvider) return false;
    if (mode === 'dateRange' && !startDate && !endDate) return false;
    return true;
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>Clear Billing Data</h2>
          <button className="modal-close" onClick={onClose}>×</button>
        </div>
        
        <div className="modal-body">
          <div className="warning-banner">
            ⚠️ <strong>Warning:</strong> This action cannot be undone. Your billing data will be permanently deleted.
          </div>

          <div className="clear-mode-tabs">
            <button 
              className={mode === 'all' ? 'active' : ''} 
              onClick={() => setMode('all')}
            >
              Clear All
            </button>
            <button 
              className={mode === 'provider' ? 'active' : ''} 
              onClick={() => setMode('provider')}
            >
              Clear by Provider
            </button>
            <button 
              className={mode === 'dateRange' ? 'active' : ''} 
              onClick={() => setMode('dateRange')}
            >
              Clear by Date Range
            </button>
          </div>

          <div className="clear-mode-content">
            {mode === 'all' && (
              <div className="clear-mode-description">
                <p>This will delete <strong>all</strong> transactions from your billing sheet.</p>
                <p>Consider exporting to CSV first for your records.</p>
              </div>
            )}

            {mode === 'provider' && (
              <div className="clear-mode-options">
                <label>
                  Select Provider:
                  <select 
                    value={selectedProvider} 
                    onChange={(e) => setSelectedProvider(e.target.value)}
                  >
                    <option value="">-- Select Provider --</option>
                    {providers.map(p => (
                      <option key={p} value={p}>{p}</option>
                    ))}
                  </select>
                </label>
                <p className="hint">
                  Useful for aligning with provider billing cycles (e.g., clear monthly).
                </p>
              </div>
            )}

            {mode === 'dateRange' && (
              <div className="clear-mode-options">
                <label>
                  Start Date:
                  <input 
                    type="date" 
                    value={startDate} 
                    onChange={(e) => setStartDate(e.target.value)}
                  />
                </label>
                <label>
                  End Date:
                  <input 
                    type="date" 
                    value={endDate} 
                    onChange={(e) => setEndDate(e.target.value)}
                  />
                </label>
                <p className="hint">
                  Leave blank to clear from beginning/to end. Both can be used together.
                </p>
              </div>
            )}

            <div className="confirmation-checkbox">
              <label>
                <input 
                  type="checkbox" 
                  checked={confirmed} 
                  onChange={(e) => setConfirmed(e.target.checked)}
                />
                <span>I understand this action cannot be undone</span>
              </label>
            </div>
          </div>
        </div>

        <div className="modal-footer">
          <button className="btn-secondary" onClick={onClose}>
            Cancel
          </button>
          <button 
            className="btn-danger" 
            onClick={handleSubmit}
            disabled={!isValid()}
          >
            Clear Data
          </button>
        </div>
      </div>
    </div>
  );
};

const BillingPage: React.FC = () => {
  const { accessToken, isAuthenticated } = useAuth();
  const [billingData, setBillingData] = useState<BillingData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [typeFilter, setTypeFilter] = useState('');
  const [providerFilter, setProviderFilter] = useState('');
  const [isClearModalOpen, setIsClearModalOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<'overview' | 'transactions'>('overview');
  const [groupByRequest, setGroupByRequest] = useState(true); // Group transactions by request ID
  const [expandedRequests, setExpandedRequests] = useState<Set<string>>(new Set()); // Track expanded request groups

  const fetchBillingData = async () => {
    setLoading(true);
    setError(null);

    try {
      if (!accessToken || !isAuthenticated) {
        throw new Error('Not authenticated. Please sign in.');
      }

      // Get Google Drive access token and billing sync preference
      const driveAccessToken = localStorage.getItem('google_drive_access_token');
      const billingSyncEnabled = localStorage.getItem('cloud_sync_billing') === 'true';
      
      console.log('🔐 Drive access token present:', !!driveAccessToken);
      console.log('🔐 Token length:', driveAccessToken?.length || 0);
      console.log('🔐 Billing sync enabled:', billingSyncEnabled);

      // Build query params
      const params = new URLSearchParams();
      if (startDate) params.append('startDate', startDate);
      if (endDate) params.append('endDate', endDate);
      if (typeFilter) params.append('type', typeFilter);
      if (providerFilter) params.append('provider', providerFilter);

      const apiBase = await getApiBase();
      const url = `${apiBase}/billing${params.toString() ? '?' + params.toString() : ''}`;

      const headers: Record<string, string> = {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
        'X-Billing-Sync': billingSyncEnabled ? 'true' : 'false'
      };

      // Only add Drive access token if billing sync is enabled
      if (billingSyncEnabled && driveAccessToken) {
        headers['X-Google-Access-Token'] = driveAccessToken;
        console.log('✅ Sending billing request with personal sheet headers:', {
          hasBillingSyncHeader: true,
          hasGoogleTokenHeader: true,
          tokenLength: driveAccessToken.length
        });
      } else {
        console.log('ℹ️ Sending billing request without personal sheet headers:', {
          billingSyncEnabled,
          hasDriveToken: !!driveAccessToken
        });
      }

      const response = await fetch(url, {
        method: 'GET',
        headers
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || `HTTP ${response.status}`);
      }

      const data: BillingData = await response.json();
      
      // Debug: Check breakdown data
      console.log('📊 Billing data received:', {
        source: data.source,
        transactionCount: data.transactions?.length,
        hasByType: !!data.totals?.byType,
        hasByProvider: !!data.totals?.byProvider,
        hasByModel: !!data.totals?.byModel,
        byTypeKeys: data.totals?.byType ? Object.keys(data.totals.byType) : [],
        byProviderKeys: data.totals?.byProvider ? Object.keys(data.totals.byProvider) : [],
        byModelKeys: data.totals?.byModel ? Object.keys(data.totals.byModel) : []
      });
      
      // Show info message if using service key fallback
      if (data.source === 'service' && data.message) {
        console.log('ℹ️ Billing data source: Service key sheet');
        console.log('ℹ️ Message:', data.message);
      }
      
      setBillingData(data);
    } catch (err: any) {
      console.error('Error fetching billing data:', err);
      setError(err.message || 'Failed to load billing data');
    } finally {
      setLoading(false);
    }
  };

  const handleClearData = async (mode: 'all' | 'provider' | 'dateRange', options: any) => {
    try {
      if (!accessToken || !isAuthenticated) {
        throw new Error('Not authenticated');
      }

      // Get Google Drive access token (needed for Sheets API access)
      const driveAccessToken = localStorage.getItem('google_drive_access_token');
      if (!driveAccessToken) {
        throw new Error('Google Drive access not granted. Please enable cloud sync in Swag page first.');
      }

      const params = new URLSearchParams({ mode });
      if (mode === 'provider' && options.provider) {
        params.append('provider', options.provider);
      }
      if (mode === 'dateRange') {
        if (options.startDate) params.append('startDate', options.startDate);
        if (options.endDate) params.append('endDate', options.endDate);
      }

      const apiBase = await getApiBase();
      const response = await fetch(`${apiBase}/billing/clear?${params.toString()}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'X-Google-Access-Token': driveAccessToken,
          'Content-Type': 'application/json'
        }
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || 'Failed to clear data');
      }

      const result = await response.json();
      alert(`✅ Success: Cleared ${result.deletedCount} transactions. ${result.remainingCount} remaining.`);
      
      // Refresh data
      fetchBillingData();
    } catch (err: any) {
      console.error('Error clearing data:', err);
      alert(`❌ Error: ${err.message}`);
    }
  };

  const exportToCSV = () => {
    if (!billingData || billingData.transactions.length === 0) {
      alert('No data to export');
      return;
    }

    const headers = [
      'Timestamp', 'Type', 'Provider', 'Model', 
      'Tokens In', 'Tokens Out', 'Total Tokens', 
      'Cost ($)', 'Duration (ms)', 
      'Memory Limit (MB)', 'Memory Used (MB)', 
      'Request ID', 'Status', 'Error'
    ];

    const rows = billingData.transactions.map(t => [
      t.timestamp,
      t.type,
      t.provider,
      t.model,
      t.tokensIn,
      t.tokensOut,
      t.totalTokens,
      t.cost.toFixed(6),
      t.durationMs,
      t.memoryLimitMB || '',
      t.memoryUsedMB || '',
      t.requestId || '',
      t.status,
      t.error || ''
    ]);

    const csv = [
      headers.join(','),
      ...rows.map(row => row.map(cell => `"${cell}"`).join(','))
    ].join('\n');

    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `billing-${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const getApiBase = async (): Promise<string> => {
    // Check if running on localhost
    const hostname = window.location.hostname;
    if (hostname === 'localhost' || hostname === '127.0.0.1') {
      const localUrl = 'http://localhost:3000';
      try {
        const response = await fetch(`${localUrl}/health`, { 
          method: 'GET',
          signal: AbortSignal.timeout(1000)
        });
        if (response.ok) {
          return localUrl;
        }
      } catch (err) {
        // Local Lambda not available, fall through to remote
      }
    }
    // Use remote Lambda
    return import.meta.env.VITE_API_BASE || 
           'https://nrw7pperjjdswbmqgmigbwsbyi0rwdqf.lambda-url.us-east-1.on.aws';
  };

  useEffect(() => {
    fetchBillingData();
  }, [startDate, endDate, typeFilter, providerFilter]);

  // Listen for changes to billing sync settings
  useEffect(() => {
    const handleStorageChange = (e: StorageEvent) => {
      // Refetch if billing sync preference or Google Drive token changes
      if (e.key === 'cloud_sync_billing' || e.key === 'google_drive_access_token') {
        console.log('🔄 Billing sync settings changed, refetching data...');
        fetchBillingData();
      }
    };

    // Listen for storage events from other tabs/windows
    window.addEventListener('storage', handleStorageChange);

    // Also listen for custom event (for same-tab changes)
    const handleSettingsChange = () => {
      console.log('🔄 Settings changed, refetching billing data...');
      fetchBillingData();
    };
    window.addEventListener('billing-settings-changed', handleSettingsChange);

    return () => {
      window.removeEventListener('storage', handleStorageChange);
      window.removeEventListener('billing-settings-changed', handleSettingsChange);
    };
  }, [accessToken, isAuthenticated, startDate, endDate, typeFilter, providerFilter]);

  if (loading) {
    return (
      <div className="billing-page">
        <div className="loading">Loading billing data...</div>
      </div>
    );
  }

  if (error) {
    const needsCloudSync = error.includes('Cloud sync not enabled') || error.includes('Google Drive access');
    
    return (
      <div className="billing-page">
        <div className="error-message">
          <h3>⚠️ {needsCloudSync ? 'Cloud Sync Required' : 'Error Loading Billing Data'}</h3>
          <p>{error}</p>
          
          {needsCloudSync && (
            <div className="info-box" style={{ marginTop: '20px', padding: '15px', background: '#e3f2fd', borderRadius: '8px', textAlign: 'left' }}>
              <h4 style={{ marginTop: 0, color: '#1976d2' }}>📋 How to Enable Cloud Sync:</h4>
              <ol style={{ marginLeft: '20px', color: '#424242' }}>
                <li>Go to the <strong>Swag</strong> page (button in top navigation)</li>
                <li>Look for the "☁️ Enable Cloud Sync" button</li>
                <li>Click it and authorize Google Drive & Sheets access</li>
                <li>Come back to this Billing page - it will load automatically</li>
              </ol>
              <p style={{ marginTop: '15px', color: '#666', fontSize: '0.9em' }}>
                💡 Cloud sync stores your billing data in a Google Sheet in your Google Drive (folder: "Research Agent").
                This allows you to track API costs across devices and export data to other tools.
              </p>
            </div>
          )}
          
          <button onClick={fetchBillingData} style={{ marginTop: '15px' }}>🔄 Retry</button>
        </div>
      </div>
    );
  }

  if (!billingData) {
    return null;
  }

  const uniqueProviders = Array.from(
    new Set(billingData.transactions.map(t => t.provider))
  ).sort();

  // Dynamically get all unique types from transactions
  const uniqueTypes: string[] = Array.from(
    new Set(billingData.transactions.map(t => String(t.type)))
  );

  // Group transactions by request ID
  const groupTransactionsByRequest = (transactions: Transaction[]) => {
    const grouped = new Map<string, Transaction[]>();
    const ungrouped: Transaction[] = [];

    transactions.forEach(tx => {
      if (tx.requestId && tx.requestId !== '') {
        const existing = grouped.get(tx.requestId) || [];
        existing.push(tx);
        grouped.set(tx.requestId, existing);
      } else {
        ungrouped.push(tx);
      }
    });

    return { grouped, ungrouped };
  };

  const { grouped, ungrouped } = groupTransactionsByRequest(billingData.transactions);

  const toggleRequestGroup = (requestId: string) => {
    setExpandedRequests(prev => {
      const next = new Set(prev);
      if (next.has(requestId)) {
        next.delete(requestId);
      } else {
        next.add(requestId);
      }
      return next;
    });
  };

  return (
    <div className="billing-page-container">
      <div className="billing-page">
        <div className="billing-header">
          <div className="billing-title">
            <h1>💰 Billing Dashboard</h1>
            <div style={{ display: 'flex', gap: '12px', alignItems: 'center', flexWrap: 'wrap', marginTop: '4px' }}>
              <p style={{ margin: 0, color: '#666', fontSize: '0.9rem' }}>
                {billingData.personalSheetEmpty ? (
                  <>🆕 Data source: <strong>Service (Personal sheet collecting data...)</strong></>
                ) : billingData.source === 'service' ? (
                  <>📊 Data source: <strong>Centralized Service</strong></>
                ) : billingData.fallback ? (
                  <>⚠️ Data source: <strong>Service (Fallback)</strong></>
                ) : (
                  <>📋 Data source: <strong>Personal Sheet</strong></>
                )}
              </p>
              <span style={{ color: '#ddd' }}>•</span>
              <p style={{ margin: 0, color: '#666', fontSize: '0.85rem' }}>
                ⚠️ Costs are estimates – verify with provider billing
              </p>
              {billingData.personalSheetEmpty && (
                <>
                  <span style={{ color: '#ddd' }}>•</span>
                  <p style={{ margin: 0, color: '#2196F3', fontSize: '0.85rem' }}>
                    ℹ️ New transactions will log to your personal sheet
                  </p>
                </>
              )}
            </div>
          </div>
          <div className="billing-actions">
            <button className="btn-secondary" onClick={exportToCSV}>
              📥 Export CSV
            </button>
            {/* Only show Clear Data button if using personal sheet (not centralized service data) */}
            {billingData.source !== 'service' && (
              <button className="btn-danger" onClick={() => setIsClearModalOpen(true)}>
                🗑️ Clear Data
              </button>
            )}
          </div>
        </div>

      <div className="billing-filters">
        <div className="filter-group">
          <label>
            📅 Start Date:
            <input 
              type="date" 
              value={startDate} 
              onChange={(e) => setStartDate(e.target.value)}
              placeholder="Select start date"
              max={endDate || undefined}
            />
          </label>
          <label>
            📅 End Date:
            <input 
              type="date" 
              value={endDate} 
              onChange={(e) => setEndDate(e.target.value)}
              placeholder="Select end date"
              min={startDate || undefined}
            />
          </label>
          <label>
            🏷️ Type:
            <select value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)}>
              <option value="">All Types</option>
              {uniqueTypes.map((type: string) => (
                <option key={type} value={type}>
                  {type === 'chat' ? 'Chat'
                    : type === 'embedding' ? 'Embedding'
                    : type === 'guardrail_input' ? 'Guardrail Input'
                    : type === 'guardrail_output' ? 'Guardrail Output'
                    : type === 'planning' ? 'Planning'
                    : type === 'image_generation' ? 'Image Generation'
                    : typeof type === 'string'
                      ? type.replace(/_/g, ' ').replace(/\b\w/g, (l: string) => l.toUpperCase())
                      : String(type)}
                </option>
              ))}
            </select>
          </label>
          <label>
            🔌 Provider:
            <select value={providerFilter} onChange={(e) => setProviderFilter(e.target.value)}>
              <option value="">All Providers</option>
              {uniqueProviders.map(p => (
                <option key={p} value={p}>{p}</option>
              ))}
            </select>
          </label>
          {(startDate || endDate || typeFilter || providerFilter) && (
            <button 
              className="btn-clear-filters"
              onClick={() => {
                setStartDate('');
                setEndDate('');
                setTypeFilter('');
                setProviderFilter('');
              }}
            >
              Clear Filters
            </button>
          )}
        </div>
        
        {/* Quick Date Range Selectors */}
        <div style={{ 
          marginTop: '1rem', 
          paddingTop: '1rem', 
          borderTop: '1px solid #e0e0e0',
          display: 'flex',
          gap: '0.5rem',
          flexWrap: 'wrap',
          alignItems: 'center'
        }}>
          <span style={{ fontSize: '0.85rem', color: '#666', fontWeight: 500 }}>Quick ranges:</span>
          <button 
            className="btn-clear-filters"
            style={{ fontSize: '0.8rem', padding: '0.4rem 0.8rem' }}
            onClick={() => {
              const today = new Date();
              setStartDate(today.toISOString().split('T')[0]);
              setEndDate(today.toISOString().split('T')[0]);
            }}
          >
            Today
          </button>
          <button 
            className="btn-clear-filters"
            style={{ fontSize: '0.8rem', padding: '0.4rem 0.8rem' }}
            onClick={() => {
              const today = new Date();
              const weekAgo = new Date(today);
              weekAgo.setDate(today.getDate() - 7);
              setStartDate(weekAgo.toISOString().split('T')[0]);
              setEndDate(today.toISOString().split('T')[0]);
            }}
          >
            Last 7 Days
          </button>
          <button 
            className="btn-clear-filters"
            style={{ fontSize: '0.8rem', padding: '0.4rem 0.8rem' }}
            onClick={() => {
              const today = new Date();
              const monthAgo = new Date(today);
              monthAgo.setMonth(today.getMonth() - 1);
              setStartDate(monthAgo.toISOString().split('T')[0]);
              setEndDate(today.toISOString().split('T')[0]);
            }}
          >
            Last 30 Days
          </button>
          <button 
            className="btn-clear-filters"
            style={{ fontSize: '0.8rem', padding: '0.4rem 0.8rem' }}
            onClick={() => {
              const today = new Date();
              const firstDay = new Date(today.getFullYear(), today.getMonth(), 1);
              setStartDate(firstDay.toISOString().split('T')[0]);
              setEndDate(today.toISOString().split('T')[0]);
            }}
          >
            This Month
          </button>
        </div>
      </div>

      <div className="billing-tabs">
        <button 
          className={activeTab === 'overview' ? 'active' : ''} 
          onClick={() => setActiveTab('overview')}
        >
          Overview
        </button>
        <button 
          className={activeTab === 'transactions' ? 'active' : ''} 
          onClick={() => setActiveTab('transactions')}
        >
          Transactions ({billingData.count})
        </button>
      </div>

      {activeTab === 'overview' && (
        <div className="billing-overview">
          <div className="summary-cards">
            <div className="summary-card">
              <div className="summary-label">Total Cost</div>
              <div className="summary-value">${billingData.totals.totalCost.toFixed(4)}</div>
            </div>
            <div className="summary-card">
              <div className="summary-label">Total Tokens</div>
              <div className="summary-value">{billingData.totals.totalTokens.toLocaleString()}</div>
            </div>
            <div className="summary-card">
              <div className="summary-label">Total Requests</div>
              <div className="summary-value">{billingData.totals.totalRequests}</div>
            </div>
          </div>

          {billingData.totals.byType && Object.keys(billingData.totals.byType).length > 0 && (
            <div className="breakdown-section">
              <h3>By Type</h3>
              <table className="breakdown-table">
                <thead>
                  <tr>
                    <th>Type</th>
                    <th>Requests</th>
                    <th>Tokens</th>
                    <th>Cost</th>
                  </tr>
                </thead>
                <tbody>
                  {Object.entries(billingData.totals.byType).map(([type, data]) => (
                    <tr key={type}>
                      <td>{type}</td>
                      <td>{data.requests}</td>
                      <td>{data.tokens.toLocaleString()}</td>
                      <td>${data.cost.toFixed(4)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {billingData.totals.byProvider && Object.keys(billingData.totals.byProvider).length > 0 && (
            <div className="breakdown-section">
              <h3>By Provider</h3>
              <table className="breakdown-table">
                <thead>
                  <tr>
                    <th>Provider</th>
                    <th>Requests</th>
                    <th>Tokens</th>
                    <th>Cost</th>
                  </tr>
                </thead>
                <tbody>
                  {Object.entries(billingData.totals.byProvider).map(([provider, data]) => (
                    <tr key={provider}>
                      <td>{provider}</td>
                      <td>{data.requests}</td>
                      <td>{data.tokens.toLocaleString()}</td>
                      <td>${data.cost.toFixed(4)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {billingData.totals.byModel && Object.keys(billingData.totals.byModel).length > 0 && (
            <div className="breakdown-section">
              <h3>By Model</h3>
              <table className="breakdown-table">
                <thead>
                  <tr>
                    <th>Provider</th>
                    <th>Model</th>
                    <th>Requests</th>
                    <th>Tokens</th>
                    <th>Cost</th>
                  </tr>
                </thead>
                <tbody>
                  {Object.entries(billingData.totals.byModel).map(([key, data]) => (
                    <tr key={key}>
                      <td>{data.provider}</td>
                      <td>{data.model}</td>
                      <td>{data.requests}</td>
                      <td>{data.tokens.toLocaleString()}</td>
                      <td>${data.cost.toFixed(4)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {activeTab === 'transactions' && (
        <div className="billing-transactions">
          {/* Grouping toggle */}
          <div style={{ 
            marginBottom: '1rem', 
            padding: '0.75rem', 
            background: '#f5f5f5', 
            borderRadius: '8px',
            display: 'flex',
            alignItems: 'center',
            gap: '0.5rem'
          }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer' }}>
              <input 
                type="checkbox" 
                checked={groupByRequest} 
                onChange={(e) => setGroupByRequest(e.target.checked)}
                style={{ cursor: 'pointer' }}
              />
              <span style={{ fontWeight: 500, fontSize: '0.9rem' }}>
                📦 Group by Request ID
              </span>
            </label>
            <span style={{ fontSize: '0.85rem', color: '#666', marginLeft: 'auto' }}>
              {groupByRequest 
                ? `${grouped.size} request groups, ${ungrouped.length} ungrouped`
                : `${billingData.transactions.length} total transactions`
              }
            </span>
          </div>

          <div className="transactions-table-container">
            <table className="transactions-table">
              <thead>
                <tr>
                  {groupByRequest && <th style={{ width: '40px' }}>▶</th>}
                  <th>Timestamp</th>
                  <th>Type</th>
                  <th>Provider</th>
                  <th>Model</th>
                  <th>Tokens</th>
                  <th>Cost</th>
                  <th>Duration</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {!groupByRequest ? (
                  // Flat list view (original)
                  billingData.transactions.map((tx, idx) => (
                    <tr key={idx}
                      style={
                        String(tx.type) === 'guardrail_input' || String(tx.type) === 'guardrail_output'
                          ? { background: '#fffde7' }
                          : String(tx.type) === 'image_generation'
                            ? { background: '#e3f2fd' }
                            : String(tx.type) === 'tts'
                              ? { background: '#f3e5f5' }
                              : {}
                      }
                    >
                      <td>{new Date(tx.timestamp).toLocaleString()}</td>
                      <td>
                        {String(tx.type) === 'guardrail_input' ? '🛡️ Guardrail Input'
                          : String(tx.type) === 'guardrail_output' ? '🛡️ Guardrail Output'
                          : String(tx.type) === 'image_generation' ? '🖼️ Image Generation'
                          : String(tx.type) === 'tts' ? '🎙️ Text-to-Speech'
                          : String(tx.type) === 'chat' ? 'Chat'
                          : String(tx.type) === 'embedding' ? 'Embedding'
                          : String(tx.type) === 'planning' ? 'Planning'
                          : typeof tx.type === 'string'
                            ? String(tx.type).replace(/_/g, ' ').replace(/\b\w/g, (l: string) => l.toUpperCase())
                            : String(tx.type)}
                      </td>
                      <td>{tx.provider}</td>
                      <td>{tx.model}</td>
                      <td>{tx.totalTokens.toLocaleString()}</td>
                      <td>${tx.cost.toFixed(6)}</td>
                      <td>{tx.durationMs}ms</td>
                      <td className={tx.status === 'success' ? 'status-success' : 'status-error'}>
                        {tx.status}
                      </td>
                    </tr>
                  ))
                ) : (
                  // Grouped view
                  <>
                    {Array.from(grouped.entries()).map(([requestId, txs]) => {
                      const isExpanded = expandedRequests.has(requestId);
                      const groupCost = txs.reduce((sum, tx) => sum + tx.cost, 0);
                      const groupTokens = txs.reduce((sum, tx) => sum + tx.totalTokens, 0);
                      const groupDuration = txs.reduce((sum, tx) => sum + tx.durationMs, 0);
                      const firstTx = txs[0];

                      return (
                        <React.Fragment key={requestId}>
                          {/* Group header row */}
                          <tr 
                            onClick={() => toggleRequestGroup(requestId)}
                            style={{ 
                              background: '#f0f0f0', 
                              fontWeight: 500,
                              cursor: 'pointer',
                              userSelect: 'none'
                            }}
                          >
                            <td style={{ textAlign: 'center' }}>
                              {isExpanded ? '▼' : '▶'}
                            </td>
                            <td>{new Date(firstTx.timestamp).toLocaleString()}</td>
                            <td colSpan={3}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                <span>🔗 Request Group ({txs.length} transactions)</span>
                                <code style={{ 
                                  fontSize: '0.75rem', 
                                  background: '#fff', 
                                  padding: '2px 6px', 
                                  borderRadius: '4px',
                                  color: '#666'
                                }}>
                                  {requestId.substring(0, 12)}...
                                </code>
                              </div>
                            </td>
                            <td>{groupTokens.toLocaleString()}</td>
                            <td><strong>${groupCost.toFixed(6)}</strong></td>
                            <td>{groupDuration}ms</td>
                            <td className={txs.every(tx => tx.status === 'success') ? 'status-success' : 'status-error'}>
                              {txs.every(tx => tx.status === 'success') ? 'success' : 'partial'}
                            </td>
                          </tr>

                          {/* Individual transactions (when expanded) */}
                          {isExpanded && txs.map((tx, idx) => (
                            <tr key={`${requestId}-${idx}`}
                              style={{
                                ...(String(tx.type) === 'guardrail_input' || String(tx.type) === 'guardrail_output'
                                  ? { background: '#fffde7' }
                                  : String(tx.type) === 'image_generation'
                                    ? { background: '#e3f2fd' }
                                    : String(tx.type) === 'tts'
                                      ? { background: '#f3e5f5' }
                                      : { background: '#fafafa' }),
                                borderLeft: '3px solid #ddd'
                              }}
                            >
                              <td style={{ textAlign: 'center', color: '#ccc' }}>└</td>
                              <td style={{ paddingLeft: '2rem', fontSize: '0.9rem' }}>
                                {new Date(tx.timestamp).toLocaleString()}
                              </td>
                              <td>
                                {String(tx.type) === 'guardrail_input' ? '🛡️ Guardrail Input'
                                  : String(tx.type) === 'guardrail_output' ? '🛡️ Guardrail Output'
                                  : String(tx.type) === 'image_generation' ? '🖼️ Image Generation'
                                  : String(tx.type) === 'tts' ? '🎙️ Text-to-Speech'
                                  : String(tx.type) === 'chat' ? 'Chat'
                                  : String(tx.type) === 'embedding' ? 'Embedding'
                                  : String(tx.type) === 'planning' ? 'Planning'
                                  : typeof tx.type === 'string'
                                    ? String(tx.type).replace(/_/g, ' ').replace(/\b\w/g, (l: string) => l.toUpperCase())
                                    : String(tx.type)}
                              </td>
                              <td>{tx.provider}</td>
                              <td>{tx.model}</td>
                              <td>{tx.totalTokens.toLocaleString()}</td>
                              <td>${tx.cost.toFixed(6)}</td>
                              <td>{tx.durationMs}ms</td>
                              <td className={tx.status === 'success' ? 'status-success' : 'status-error'}>
                                {tx.status}
                              </td>
                            </tr>
                          ))}
                        </React.Fragment>
                      );
                    })}

                    {/* Ungrouped transactions */}
                    {ungrouped.map((tx, idx) => (
                      <tr key={`ungrouped-${idx}`}
                        style={
                          String(tx.type) === 'guardrail_input' || String(tx.type) === 'guardrail_output'
                            ? { background: '#fffde7' }
                            : String(tx.type) === 'image_generation'
                              ? { background: '#e3f2fd' }
                              : String(tx.type) === 'tts'
                                ? { background: '#f3e5f5' }
                                : {}
                        }
                      >
                        <td style={{ textAlign: 'center', color: '#ccc' }}>—</td>
                        <td>{new Date(tx.timestamp).toLocaleString()}</td>
                        <td>
                          {String(tx.type) === 'guardrail_input' ? '🛡️ Guardrail Input'
                            : String(tx.type) === 'guardrail_output' ? '🛡️ Guardrail Output'
                            : String(tx.type) === 'image_generation' ? '🖼️ Image Generation'
                            : String(tx.type) === 'tts' ? '🎙️ Text-to-Speech'
                            : String(tx.type) === 'chat' ? 'Chat'
                            : String(tx.type) === 'embedding' ? 'Embedding'
                            : String(tx.type) === 'planning' ? 'Planning'
                            : typeof tx.type === 'string'
                              ? String(tx.type).replace(/_/g, ' ').replace(/\b\w/g, (l: string) => l.toUpperCase())
                              : String(tx.type)}
                        </td>
                        <td>{tx.provider}</td>
                        <td>{tx.model}</td>
                        <td>{tx.totalTokens.toLocaleString()}</td>
                        <td>${tx.cost.toFixed(6)}</td>
                        <td>{tx.durationMs}ms</td>
                        <td className={tx.status === 'success' ? 'status-success' : 'status-error'}>
                          {tx.status}
                        </td>
                      </tr>
                    ))}
                  </>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <ClearDataModal
        isOpen={isClearModalOpen}
        onClose={() => setIsClearModalOpen(false)}
        onConfirm={handleClearData}
        providers={uniqueProviders}
      />
      </div>
    </div>
  );
};

export default BillingPage;
