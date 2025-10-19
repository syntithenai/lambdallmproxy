import React, { useState, useEffect } from 'react';
import './BillingPage.css';

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
  totalRequests: number;
  byType: Record<string, { cost: number; tokens: number; requests: number }>;
  byProvider: Record<string, { cost: number; tokens: number; requests: number }>;
  byModel: Record<string, { 
    cost: number; 
    tokens: number; 
    requests: number; 
    provider: string; 
    model: string;
  }>;
  dateRange: {
    start: string | null;
    end: string | null;
  };
}

interface BillingData {
  success: boolean;
  transactions: Transaction[];
  totals: Totals;
  count: number;
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
  const [billingData, setBillingData] = useState<BillingData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [typeFilter, setTypeFilter] = useState('');
  const [providerFilter, setProviderFilter] = useState('');
  const [isClearModalOpen, setIsClearModalOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<'overview' | 'transactions'>('overview');

  const fetchBillingData = async () => {
    setLoading(true);
    setError(null);

    try {
      const token = localStorage.getItem('google_jwt');
      if (!token) {
        throw new Error('Not authenticated. Please sign in.');
      }

      // Build query params
      const params = new URLSearchParams();
      if (startDate) params.append('startDate', startDate);
      if (endDate) params.append('endDate', endDate);
      if (typeFilter) params.append('type', typeFilter);
      if (providerFilter) params.append('provider', providerFilter);

      const apiBase = await getApiBase();
      const url = `${apiBase}/billing${params.toString() ? '?' + params.toString() : ''}`;

      const response = await fetch(url, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || `HTTP ${response.status}`);
      }

      const data: BillingData = await response.json();
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
      const token = localStorage.getItem('google_jwt');
      if (!token) {
        throw new Error('Not authenticated');
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
          'Authorization': `Bearer ${token}`,
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

  if (loading) {
    return (
      <div className="billing-page">
        <div className="loading">Loading billing data...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="billing-page">
        <div className="error-message">
          <h3>Error Loading Billing Data</h3>
          <p>{error}</p>
          <button onClick={fetchBillingData}>Retry</button>
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

  return (
    <div className="billing-page">
      <div className="billing-header">
        <div className="billing-title">
          <h1>💰 Billing Dashboard</h1>
          <p>Your personal API usage and costs</p>
        </div>
        <div className="billing-actions">
          <button className="btn-secondary" onClick={exportToCSV}>
            📥 Export CSV
          </button>
          <button className="btn-danger" onClick={() => setIsClearModalOpen(true)}>
            🗑️ Clear Data
          </button>
        </div>
      </div>

      <div className="billing-filters">
        <div className="filter-group">
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
          <label>
            Type:
            <select value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)}>
              <option value="">All Types</option>
              <option value="chat">Chat</option>
              <option value="embedding">Embedding</option>
              <option value="guardrail_input">Guardrail Input</option>
              <option value="guardrail_output">Guardrail Output</option>
              <option value="planning">Planning</option>
            </select>
          </label>
          <label>
            Provider:
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
        </div>
      )}

      {activeTab === 'transactions' && (
        <div className="billing-transactions">
          <div className="transactions-table-container">
            <table className="transactions-table">
              <thead>
                <tr>
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
                {billingData.transactions.map((tx, idx) => (
                  <tr key={idx}>
                    <td>{new Date(tx.timestamp).toLocaleString()}</td>
                    <td>{tx.type}</td>
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
  );
};

export default BillingPage;
