import React, { useState, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import './BillingPage.css';
import { useAuth } from '../contexts/AuthContext';
import { useUsage } from '../contexts/UsageContext';
import { createPayPalOrder, capturePayPalOrder } from '../utils/api';

// Declare PayPal SDK types
declare global {
  interface Window {
    paypal?: any;
  }
}

interface Transaction {
  rowIndex: number;
  timestamp: string;
  type: 'chat' | 'embedding' | 'guardrail_input' | 'guardrail_output' | 'planning' | 'image_generation' | 'tts' | 'assessment' | 'chat_iteration' | 'credit_added' | 'summary' | 'lambda_invocation';
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
  const { t } = useTranslation();
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
          <h2>{t('billing.clearBillingData')}</h2>
          <button className="modal-close" onClick={onClose}>×</button>
        </div>
        
        <div className="modal-body">
          <div className="warning-banner">
            {t('billing.clearDataWarning')}
          </div>

          <div className="clear-mode-tabs">
            <button 
              className={mode === 'all' ? 'active' : ''} 
              onClick={() => setMode('all')}
            >
              {t('billing.clearAll')}
            </button>
            <button 
              className={mode === 'provider' ? 'active' : ''} 
              onClick={() => setMode('provider')}
            >
              {t('billing.clearByProvider')}
            </button>
            <button 
              className={mode === 'dateRange' ? 'active' : ''} 
              onClick={() => setMode('dateRange')}
            >
              {t('billing.clearByDateRange')}
            </button>
          </div>

          <div className="clear-mode-content">
            {mode === 'all' && (
              <div className="clear-mode-description">
                <p>{t('billing.clearAllDescription')}</p>
                <p>{t('billing.considerExportFirst')}</p>
              </div>
            )}

            {mode === 'provider' && (
              <div className="clear-mode-options">
                <label>
                  {t('billing.selectProvider')}
                  <select 
                    value={selectedProvider} 
                    onChange={(e) => setSelectedProvider(e.target.value)}
                  >
                    <option value="">{t('billing.selectProviderPlaceholder')}</option>
                    {providers.map(p => (
                      <option key={p} value={p}>{p}</option>
                    ))}
                  </select>
                </label>
                <p className="hint">
                  {t('billing.clearProviderHint')}
                </p>
              </div>
            )}

            {mode === 'dateRange' && (
              <div className="clear-mode-options">
                <label>
                  {t('billing.startDate')}:
                  <input 
                    type="date" 
                    value={startDate} 
                    onChange={(e) => setStartDate(e.target.value)}
                  />
                </label>
                <label>
                  {t('billing.endDate')}:
                  <input 
                    type="date" 
                    value={endDate} 
                    onChange={(e) => setEndDate(e.target.value)}
                  />
                </label>
                <p className="hint">
                  {t('billing.clearDateRangeHint')}
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
                <span>{t('billing.confirmUndoCheckbox')}</span>
              </label>
            </div>
          </div>
        </div>

        <div className="modal-footer">
          <button className="btn-secondary" onClick={onClose}>
            {t('billing.cancel')}
          </button>
          <button 
            className="btn-danger" 
            onClick={handleSubmit}
            disabled={!isValid()}
          >
            {t('billing.clearData')}
          </button>
        </div>
      </div>
    </div>
  );
};

const BillingPage: React.FC = () => {
  const { t } = useTranslation();
  const { accessToken, isAuthenticated } = useAuth();
  const { refreshUsage } = useUsage(); // Get refresh function from UsageContext
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
  const [creditBalance, setCreditBalance] = useState<number>(0); // User's current credit balance (available = credits - expenses)
  const [totalCredits, setTotalCredits] = useState<number>(0); // Total credits purchased
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const [_, setTotalExpenses] = useState<number>(0); // Total spent on API calls
  const [showAddCreditModal, setShowAddCreditModal] = useState(false); // Add Credit modal state
  const [creditAmount, setCreditAmount] = useState('5.00'); // Amount to purchase
  const [paypalLoading, setPaypalLoading] = useState(false); // PayPal button loading state
  const paypalButtonsRef = useRef<HTMLDivElement>(null); // Ref for PayPal buttons container
  
  // Pagination state for transaction list
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(100); // Default to 100 items per page

  // Debug: Log auth state
  useEffect(() => {
    console.log('🔍 [BillingPage] Auth State:', {
      isAuthenticated,
      hasAccessToken: !!accessToken,
      tokenLength: accessToken?.length || 0
    });
  }, [isAuthenticated, accessToken]);

  const fetchBillingData = async () => {
    setLoading(true);
    setError(null);

    try {
      console.log('📊 [BillingPage] fetchBillingData called');
      console.log('📊 [BillingPage] accessToken present:', !!accessToken);
      console.log('📊 [BillingPage] isAuthenticated:', isAuthenticated);
      
      if (!accessToken || !isAuthenticated) {
        const errorMsg = 'Not authenticated. Please sign in.';
        console.error('❌ [BillingPage] Authentication check failed:', errorMsg);
        throw new Error(errorMsg);
      }

      // Fetch ALL data without filters - filtering will be done locally
      const apiBase = await getApiBase();
      const url = `${apiBase}/billing`;
      
      console.log('🌐 [BillingPage] API Base:', apiBase);
      console.log('🌐 [BillingPage] Request URL:', url);

      const headers: Record<string, string> = {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      };
      
      console.log('📤 [BillingPage] Sending request to:', url);
      console.log('📤 [BillingPage] Request headers:', Object.keys(headers));

      const response = await fetch(url, {
        method: 'GET',
        headers
      });
      
      console.log('📥 [BillingPage] Response received:', {
        status: response.status,
        statusText: response.statusText,
        ok: response.ok,
        headers: Object.fromEntries(response.headers.entries())
      });

      if (!response.ok) {
        let errorData;
        try {
          errorData = await response.json();
        } catch (parseError) {
          console.error('❌ [BillingPage] Failed to parse error response:', parseError);
          throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }
        console.error('❌ [BillingPage] Backend returned error:', errorData);
        throw new Error(errorData.message || errorData.error || `HTTP ${response.status}`);
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
      
      // Debug: Check transaction types in raw data
      if (data.transactions && data.transactions.length > 0) {
        const uniqueTypes = [...new Set(data.transactions.map(t => t.type))];
        console.log('📊 Unique transaction types in data:', uniqueTypes);
        console.log('📊 Sample transactions:', data.transactions.slice(0, 3));
      }
      
      // Show info message if using service key fallback
      if (data.source === 'service' && data.message) {
        console.log('ℹ️ Billing data source: Service key sheet');
        console.log('ℹ️ Message:', data.message);
      }
      
      setBillingData(data);
      console.log('✅ [BillingPage] Billing data loaded successfully');
      
      // Calculate credit balance from transactions
      // Credits are added with type 'credit_added', spending subtracts from balance
      let balance = 0;
      let credits = 0;
      let expenses = 0;
      if (data.transactions) {
        for (const tx of data.transactions) {
          if (tx.type === 'credit_added') {
            // Credits are stored as negative costs (-0.50), so we add the absolute value
            const creditAmount = Math.abs(tx.cost);
            credits += creditAmount;
            balance += creditAmount;
            console.log(`💳 Found credit: +$${creditAmount.toFixed(2)}, total credits: $${credits.toFixed(2)}, balance: $${balance.toFixed(2)}`);
          } else {
            // Regular spending subtracts from balance
            expenses += tx.cost;
            balance -= tx.cost;
          }
        }
      }
      setCreditBalance(balance);
      setTotalCredits(credits);
      setTotalExpenses(expenses);
      console.log(`💳 Final summary - Balance: $${balance.toFixed(4)}, Total Credits: $${credits.toFixed(4)}, Total Expenses: $${expenses.toFixed(4)}`);
      
      // Refresh usage context (calculates usage from billing totals)
      refreshUsage();
    } catch (err: any) {
      console.error('❌ [BillingPage] Error fetching billing data:', {
        message: err.message,
        stack: err.stack,
        name: err.name,
        error: err
      });
      const errorMessage = err.message || 'Failed to load billing data';
      setError(errorMessage);
      
      // Show user-friendly error message
      if (err.message?.includes('Not authenticated')) {
        setError('❌ Not authenticated. Please sign in with Google to view billing data.');
      } else if (err.message?.includes('NetworkError') || err.message?.includes('Failed to fetch')) {
        setError('❌ Network error. Please check your connection and ensure the backend server is running.');
      } else {
        setError(`❌ Failed to load billing data: ${errorMessage}`);
      }
    } finally {
      setLoading(false);
      console.log('🏁 [BillingPage] fetchBillingData completed, loading:', false);
    }
  };

  const handleClearData = async (mode: 'all' | 'provider' | 'dateRange', options: any) => {
    try {
      if (!accessToken || !isAuthenticated) {
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
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json'
        }
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || 'Failed to clear data');
      }

      const result = await response.json();
      alert(t('billing.dataClearedSuccess', { count: result.deletedCount, remaining: result.remainingCount }));
      
      // Refresh data
      fetchBillingData();
    } catch (err: any) {
      console.error('Error clearing data:', err);
      alert(t('billing.dataClearError', { message: err.message }));
    }
  };

  const exportToCSV = () => {
    if (!billingData || filteredTransactions.length === 0) {
      alert(t('billing.noDataToExport'));
      return;
    }

    const headers = [
      'Timestamp', 'Type', 'Provider', 'Model', 
      'Tokens In', 'Tokens Out', 'Total Tokens', 
      'Cost ($)', 'Duration (ms)', 
      'Memory Limit (MB)', 'Memory Used (MB)', 
      'Request ID', 'Status', 'Error'
    ];

    const rows = filteredTransactions.map(t => [
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
    // Only fetch if authenticated - wait for auth state to be ready
    // Filters are applied locally, so no need to refetch on filter changes
    if (isAuthenticated && accessToken) {
      fetchBillingData();
    }
  }, [isAuthenticated, accessToken]);

  // Render PayPal buttons when modal opens and SDK is loaded
  useEffect(() => {
    if (!showAddCreditModal || !paypalButtonsRef.current || !accessToken) {
      return;
    }

    // Wait for PayPal SDK to load (polling approach)
    const waitForPayPal = setInterval(() => {
      if (window.paypal) {
        clearInterval(waitForPayPal);
        setPaypalLoading(true);
        
        // Clear any existing buttons
        paypalButtonsRef.current!.innerHTML = '';
        
        window.paypal.Buttons({
          createOrder: async () => {
            try {
              const amount = parseFloat(creditAmount);
              if (amount < 5) {
                throw new Error('Minimum purchase is $5.00');
              }
              
              const result = await createPayPalOrder(amount, accessToken);
              if (!result.success || !result.orderId) {
                throw new Error(result.error || 'Failed to create order');
              }
              
              return result.orderId;
            } catch (error: any) {
              console.error('PayPal createOrder error:', error);
              alert(`Error creating order: ${error.message}`);
              throw error;
            }
          },
          onApprove: async (data: any) => {
            try {
              const result = await capturePayPalOrder(data.orderID, accessToken);
              if (!result.success) {
                throw new Error(result.error || 'Failed to capture payment');
              }
              
              // Success! Refresh billing data and close modal
              // (Removed alert - billing page shows updated balance automatically)
              setShowAddCreditModal(false);
              await fetchBillingData(); // Refresh to show new credit
              await refreshUsage(); // Refresh usage context
            } catch (error: any) {
              console.error('PayPal onApprove error:', error);
              alert(`Error processing payment: ${error.message}`);
            }
          },
          onError: (err: any) => {
            console.error('PayPal error:', err);
            alert('PayPal encountered an error. Please try again.');
          },
          style: {
            layout: 'vertical',
            color: 'blue',
            shape: 'rect',
            label: 'paypal'
          }
        }).render(paypalButtonsRef.current!).then(() => {
          setPaypalLoading(false);
        }).catch((err: any) => {
          console.error('PayPal render error:', err);
          setPaypalLoading(false);
        });
      }
    }, 100); // Check every 100ms for PayPal SDK

    // Cleanup: stop polling if modal closes before SDK loads
    return () => clearInterval(waitForPayPal);
  }, [showAddCreditModal, creditAmount, accessToken]);

  // Reset to page 1 when filters change
  useEffect(() => {
    setCurrentPage(1);
  }, [startDate, endDate, typeFilter, providerFilter]);



  // Show not authenticated message if user isn't signed in
  if (!isAuthenticated) {
    return (
      <div className="billing-page">
        <div className="error-message">
          <h3>{t('billing.signInRequired')}</h3>
          <p>{t('billing.signInToViewBilling')}</p>
          
          <div className="info-box" style={{ marginTop: '20px', padding: '15px', background: '#e3f2fd', borderRadius: '8px', textAlign: 'left' }}>
            <h4 style={{ marginTop: 0, color: '#1976d2' }}>{t('billing.howToAccessBilling')}</h4>
            <ol style={{ marginLeft: '20px', color: '#424242' }}>
              <li>{t('billing.signInStep1')}</li>
              <li>{t('billing.signInStep2')}</li>
            </ol>
            <p style={{ marginTop: '15px', color: '#666', fontSize: '0.9em' }}>
              {t('billing.billingDataNote')}
            </p>
            
            {/* Debug info */}
            <details style={{ marginTop: '15px', fontSize: '0.85em', color: '#888' }}>
              <summary style={{ cursor: 'pointer', fontWeight: 'bold' }}>{t('billing.debugInfo')}</summary>
              <pre style={{ marginTop: '10px', padding: '10px', background: '#f5f5f5', borderRadius: '4px', overflow: 'auto' }}>
                {JSON.stringify({
                  isAuthenticated,
                  hasAccessToken: !!accessToken,
                  tokenLength: accessToken?.length || 0,
                  currentPath: window.location.pathname
                }, null, 2)}
              </pre>
            </details>
          </div>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="billing-page">
        <div className="loading">{t('billing.loading')}</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="billing-page">
        <div className="error-message">
          <h3>{t('billing.errorLoading')}</h3>
          <p>{error}</p>
          
          <button onClick={fetchBillingData} style={{ marginTop: '15px' }}>{t('billing.retry')}</button>
        </div>
      </div>
    );
  }

  if (!billingData) {
    return (
      <div className="billing-page">
        <div className="loading">{t('billing.noBillingData')}</div>
      </div>
    );
  }
  
  // Handle empty transactions case
  if (!billingData.transactions || billingData.transactions.length === 0) {
    return (
      <div className="billing-page">
        <div className="billing-header">
          <h1>{t('billing.title')}</h1>
          <p style={{ color: '#666', marginTop: '8px' }}>
            {billingData.message || t('billing.noTransactionsMessage')}
          </p>
        </div>
        <div className="info-box" style={{ marginTop: '20px', padding: '20px', background: '#f5f5f5', borderRadius: '8px' }}>
          <h3 style={{ marginTop: 0 }}>{t('billing.noBillingDataYet')}</h3>
          <p>{t('billing.startUsingChat')}</p>
          <button onClick={fetchBillingData} style={{ marginTop: '15px' }}>{t('billing.refresh')}</button>
        </div>
      </div>
    );
  }

  // Apply local filtering
  const filteredTransactions = billingData.transactions.filter(tx => {
    // Date filter
    if (startDate || endDate) {
      const txDate = new Date(tx.timestamp);
      if (startDate && txDate < new Date(startDate)) return false;
      // For endDate, include the entire day by setting time to end of day (23:59:59.999)
      if (endDate) {
        const endDateTime = new Date(endDate);
        endDateTime.setHours(23, 59, 59, 999);
        if (txDate > endDateTime) return false;
      }
    }
    
    // Type filter
    if (typeFilter && String(tx.type).toLowerCase() !== typeFilter.toLowerCase()) return false;
    
    // Provider filter
    if (providerFilter && tx.provider.toLowerCase() !== providerFilter.toLowerCase()) return false;
    
    return true;
  });

  // Pagination logic for transactions
  const totalFilteredTransactions = filteredTransactions.length;
  const totalPages = Math.ceil(totalFilteredTransactions / itemsPerPage);
  const startIndex = (currentPage - 1) * itemsPerPage;
  const endIndex = startIndex + itemsPerPage;
  const paginatedTransactions = filteredTransactions.slice(startIndex, endIndex);

  // Calculate totals from filtered data
  const calculateFilteredTotals = (transactions: Transaction[], excludeCredits: boolean = false) => {
    const byType: Record<string, { cost: number; tokens: number; tokensIn: number; tokensOut: number; count: number }> = {};
    const byProvider: Record<string, { cost: number; tokens: number; tokensIn: number; tokensOut: number; count: number }> = {};
    const byModel: Record<string, { cost: number; tokens: number; tokensIn: number; tokensOut: number; count: number; provider: string }> = {};
    let totalCost = 0;
    let totalTokens = 0;
    let totalTokensIn = 0;
    let totalTokensOut = 0;

    // Count user queries vs LLM calls correctly:
    // - User queries: Count only 'chat' type transactions (initial user requests)
    // - LLM calls: Count all LLM API calls (chat, chat_iteration, guardrail, etc.)
    const userTransactions = transactions.filter(tx => 
      tx.type === 'chat'  // Only count initial user chat requests
    );
    const llmCalls = transactions.filter(tx => 
      tx.type !== 'summary' && 
      tx.type !== 'credit_added' && 
      tx.type !== 'lambda_invocation'  // Exclude non-LLM transactions
    );
    const totalUserQueries = userTransactions.length;
    const totalLLMCalls = llmCalls.length;

    transactions.forEach(tx => {
      // Skip invalid transactions
      if (!tx || !tx.model || !tx.provider) {
        console.warn('Skipping invalid transaction:', tx);
        return;
      }
      
      // Exclude credit transactions from totalCost if requested
      if (!excludeCredits || String(tx.type) !== 'credit_added') {
        totalCost += tx.cost;
      }
      totalTokens += tx.totalTokens || 0;
      totalTokensIn += tx.tokensIn || 0;
      totalTokensOut += tx.tokensOut || 0;

      // By type
      const type = String(tx.type);
      if (!byType[type]) byType[type] = { cost: 0, tokens: 0, tokensIn: 0, tokensOut: 0, count: 0 };
      byType[type].cost += tx.cost;
      byType[type].tokens += tx.totalTokens || 0;
      byType[type].tokensIn += tx.tokensIn || 0;
      byType[type].tokensOut += tx.tokensOut || 0;
      byType[type].count += 1;

      // By provider
      if (!byProvider[tx.provider]) byProvider[tx.provider] = { cost: 0, tokens: 0, tokensIn: 0, tokensOut: 0, count: 0 };
      byProvider[tx.provider].cost += tx.cost;
      byProvider[tx.provider].tokens += tx.totalTokens || 0;
      byProvider[tx.provider].tokensIn += tx.tokensIn || 0;
      byProvider[tx.provider].tokensOut += tx.tokensOut || 0;
      byProvider[tx.provider].count += 1;

      // By model (with provider information)
      if (!byModel[tx.model]) byModel[tx.model] = { cost: 0, tokens: 0, tokensIn: 0, tokensOut: 0, count: 0, provider: tx.provider };
      byModel[tx.model].cost += tx.cost;
      byModel[tx.model].tokens += tx.totalTokens || 0;
      byModel[tx.model].tokensIn += tx.tokensIn || 0;
      byModel[tx.model].tokensOut += tx.tokensOut || 0;
      byModel[tx.model].count += 1;
    });

    return { 
      totalCost, 
      totalTokens, 
      totalTokensIn, 
      totalTokensOut, 
      totalUserQueries, 
      totalLLMCalls, 
      byType, 
      byProvider, 
      byModel 
    };
  };

  // Calculate totals excluding credit transactions from cost
  const filteredTotals = calculateFilteredTotals(filteredTransactions, true);

  const uniqueProviders = Array.from(
    new Set(billingData.transactions.map(t => t.provider))
  ).sort();

  // Dynamically get all unique types from transactions
  const uniqueTypes: string[] = Array.from(
    new Set(billingData.transactions.map(t => String(t.type)))
  );

  // Group transactions by request ID with proper sorting
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

    // Sort transactions within each group by timestamp ascending (earliest first)
    grouped.forEach((txs) => {
      txs.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
    });

    // Sort ungrouped transactions by timestamp descending (latest first)
    ungrouped.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

    // Convert grouped map to array and sort by earliest transaction in group (descending)
    const sortedGroupedArray = Array.from(grouped.entries()).sort(([, txsA], [, txsB]) => {
      const earliestA = txsA[0].timestamp;
      const earliestB = txsB[0].timestamp;
      return new Date(earliestB).getTime() - new Date(earliestA).getTime();
    });

    return { grouped: new Map(sortedGroupedArray), ungrouped };
  };

  // Group transactions by request ID (use paginated transactions for display)
  const { grouped, ungrouped } = groupTransactionsByRequest(paginatedTransactions);
  // Also calculate totals from ALL filtered transactions (not just current page)
  const { grouped: allGrouped, ungrouped: allUngrouped } = groupTransactionsByRequest(filteredTransactions);

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
          </div>
          <div className="billing-actions">
            <button className="btn-secondary flex items-center gap-1.5" onClick={exportToCSV} title="Export CSV" aria-label="Export CSV">
              <span>📥</span>
              <span className="hidden md:inline">Export CSV</span>
            </button>
            {/* Only show Clear Data button if using personal sheet (not centralized service data) */}
            {billingData.source !== 'service' && (
              <button className="btn-danger flex items-center gap-1.5" onClick={() => setIsClearModalOpen(true)} title="Clear Data" aria-label="Clear Data">
                <span>🗑️</span>
                <span className="hidden md:inline">Clear Data</span>
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
                    : type === 'assessment' ? 'Assessment'
                    : type === 'image_generation' ? 'Image Generation'
                    : type === 'tts' ? 'Text-to-Speech'
                    : type === 'chat_iteration' ? 'Chat Iteration'
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
          Transactions ({filteredTransactions.length})
        </button>
      </div>

      {activeTab === 'overview' && (
        <div className="billing-overview">
          <div className="summary-cards">
            {/* Credit Balance Card - Highlighted and positioned first */}
            <div className="summary-card" style={{
              background: creditBalance > 0 ? 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)' : 'linear-gradient(135deg, #f093fb 0%, #f5576c 100%)',
              color: 'white',
              boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
              border: '2px solid rgba(255,255,255,0.3)'
            }}>
              <div className="summary-label" style={{ color: 'rgba(255,255,255,0.9)', fontSize: '1.1rem', fontWeight: 'bold', marginBottom: '8px' }}>💳 Credit Balance</div>
              <div className="summary-value" style={{ fontSize: '2.5rem', fontWeight: 'bold', marginBottom: '12px' }}>${creditBalance.toFixed(2)}</div>
              <div style={{ fontSize: '0.75rem', color: 'rgba(255,255,255,0.7)', marginTop: '8px', paddingTop: '8px', borderTop: '1px solid rgba(255,255,255,0.2)' }}>
                Total Credits: ${totalCredits.toFixed(2)}
              </div>
              <button 
                style={{
                  background: 'white',
                  color: '#764ba2',
                  border: 'none',
                  padding: '8px 16px',
                  borderRadius: '6px',
                  fontSize: '0.85rem',
                  fontWeight: 'bold',
                  cursor: 'pointer',
                  marginTop: '12px',
                  boxShadow: '0 2px 4px rgba(0,0,0,0.1)'
                }}
                onClick={() => setShowAddCreditModal(true)}
              >
                ➕ Add Credit
              </button>
            </div>
            
            <div className="summary-card">
              <div className="summary-label">Total Cost</div>
              <div className="summary-value">${filteredTotals.totalCost.toFixed(4)}</div>
              <div style={{ fontSize: '0.75rem', color: '#666', marginTop: '4px' }}>
                Usage only (excl. credits)
              </div>
            </div>
            <div className="summary-card">
              <div className="summary-label">Total Tokens</div>
              <div className="summary-value">{filteredTotals.totalTokens.toLocaleString()}</div>
              <div style={{ fontSize: '0.75rem', color: '#666', marginTop: '4px' }}>
                In: {filteredTotals.totalTokensIn.toLocaleString()} | Out: {filteredTotals.totalTokensOut.toLocaleString()}
              </div>
            </div>
            <div className="summary-card">
              <div className="summary-label">Total Requests</div>
              <div className="summary-value">{filteredTotals.totalUserQueries} / {filteredTotals.totalLLMCalls}</div>
              <div style={{ fontSize: '0.75rem', color: '#666', marginTop: '4px' }}>
                User Queries / LLM Calls
              </div>
            </div>
          </div>

          {filteredTotals.byType && Object.keys(filteredTotals.byType).length > 0 && (
            <div className="breakdown-section">
              <h3>By Type</h3>
              <table className="breakdown-table">
                <thead>
                  <tr>
                    <th>Type</th>
                    <th>Requests</th>
                    <th>Tokens In</th>
                    <th>Tokens Out</th>
                    <th>Total Tokens</th>
                    <th>Cost</th>
                  </tr>
                </thead>
                <tbody>
                  {Object.entries(filteredTotals.byType).map(([type, data]) => (
                    <tr key={type}>
                      <td>{type}</td>
                      <td>{data.count}</td>
                      <td>{data.tokensIn.toLocaleString()}</td>
                      <td>{data.tokensOut.toLocaleString()}</td>
                      <td>{data.tokens.toLocaleString()}</td>
                      <td>${data.cost.toFixed(4)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {filteredTotals.byProvider && Object.keys(filteredTotals.byProvider).length > 0 && (
            <div className="breakdown-section">
              <h3>By Provider</h3>
              <table className="breakdown-table">
                <thead>
                  <tr>
                    <th>Provider</th>
                    <th>Requests</th>
                    <th>Tokens In</th>
                    <th>Tokens Out</th>
                    <th>Total Tokens</th>
                    <th>Cost</th>
                  </tr>
                </thead>
                <tbody>
                  {Object.entries(filteredTotals.byProvider).map(([provider, data]) => (
                    <tr key={provider}>
                      <td>{provider}</td>
                      <td>{data.count}</td>
                      <td>{data.tokensIn.toLocaleString()}</td>
                      <td>{data.tokensOut.toLocaleString()}</td>
                      <td>{data.tokens.toLocaleString()}</td>
                      <td>${data.cost.toFixed(4)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {filteredTotals.byModel && Object.keys(filteredTotals.byModel).length > 0 && (
            <div className="breakdown-section">
              <h3>By Model</h3>
              <table className="breakdown-table">
                <thead>
                  <tr>
                    <th>Provider</th>
                    <th>Model</th>
                    <th>Requests</th>
                    <th>Tokens In</th>
                    <th>Tokens Out</th>
                    <th>Total Tokens</th>
                    <th>Cost</th>
                  </tr>
                </thead>
                <tbody>
                  {/* Group models by provider and sort */}
                  {Object.entries(filteredTotals.byModel)
                    .filter(([_, data]) => data && data.provider) // Filter out invalid entries
                    .sort((a, b) => {
                      // Sort by provider first, then by model name
                      const providerCompare = a[1].provider.localeCompare(b[1].provider);
                      if (providerCompare !== 0) return providerCompare;
                      return a[0].localeCompare(b[0]);
                    })
                    .map(([model, data]) => (
                      <tr key={model}>
                        <td>{data.provider}</td>
                        <td>{model}</td>
                        <td>{data.count}</td>
                        <td>{data.tokensIn.toLocaleString()}</td>
                        <td>{data.tokensOut.toLocaleString()}</td>
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
            
            {/* Items per page selector */}
            <select 
              value={itemsPerPage} 
              onChange={(e) => {
                setItemsPerPage(Number(e.target.value));
                setCurrentPage(1); // Reset to first page
              }}
              style={{ 
                padding: '0.4rem 0.6rem', 
                border: '1px solid #ccc', 
                borderRadius: '4px',
                fontSize: '0.85rem'
              }}
            >
              <option value={50}>50 per page</option>
              <option value={100}>100 per page</option>
              <option value={250}>250 per page</option>
              <option value={500}>500 per page</option>
              <option value={1000}>1000 per page</option>
            </select>
            
            <span style={{ fontSize: '0.85rem', color: '#666', marginLeft: 'auto' }}>
              {groupByRequest 
                ? `${allGrouped.size} total request groups (showing ${grouped.size}), ${allUngrouped.length} ungrouped`
                : `${totalFilteredTransactions} total transactions (showing ${paginatedTransactions.length})`
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
            
            {/* Pagination Controls */}
            <div style={{ 
              marginTop: '1rem', 
              display: 'flex', 
              justifyContent: 'center', 
              alignItems: 'center',
              gap: '1rem',
              padding: '1rem',
              borderTop: '1px solid #eee'
            }}>
              <button
                onClick={() => setCurrentPage(1)}
                disabled={currentPage === 1}
                style={{
                  padding: '0.5rem 0.75rem',
                  border: '1px solid #ccc',
                  borderRadius: '4px',
                  background: currentPage === 1 ? '#f5f5f5' : 'white',
                  cursor: currentPage === 1 ? 'not-allowed' : 'pointer',
                  fontSize: '0.85rem'
                }}
              >
                ⏮️ First
              </button>
              
              <button
                onClick={() => setCurrentPage(currentPage - 1)}
                disabled={currentPage === 1}
                style={{
                  padding: '0.5rem 0.75rem',
                  border: '1px solid #ccc',
                  borderRadius: '4px',
                  background: currentPage === 1 ? '#f5f5f5' : 'white',
                  cursor: currentPage === 1 ? 'not-allowed' : 'pointer',
                  fontSize: '0.85rem'
                }}
              >
                ◀️ Prev
              </button>
              
              <span style={{ fontSize: '0.9rem', fontWeight: 500 }}>
                Page {currentPage} of {totalPages}
              </span>
              
              <button
                onClick={() => setCurrentPage(currentPage + 1)}
                disabled={currentPage === totalPages}
                style={{
                  padding: '0.5rem 0.75rem',
                  border: '1px solid #ccc',
                  borderRadius: '4px',
                  background: currentPage === totalPages ? '#f5f5f5' : 'white',
                  cursor: currentPage === totalPages ? 'not-allowed' : 'pointer',
                  fontSize: '0.85rem'
                }}
              >
                Next ▶️
              </button>
              
              <button
                onClick={() => setCurrentPage(totalPages)}
                disabled={currentPage === totalPages}
                style={{
                  padding: '0.5rem 0.75rem',
                  border: '1px solid #ccc',
                  borderRadius: '4px',
                  background: currentPage === totalPages ? '#f5f5f5' : 'white',
                  cursor: currentPage === totalPages ? 'not-allowed' : 'pointer',
                  fontSize: '0.85rem'
                }}
              >
                Last ⏭️
              </button>
            </div>
          </div>
        </div>
      )}

      <ClearDataModal
        isOpen={isClearModalOpen}
        onClose={() => setIsClearModalOpen(false)}
        onConfirm={handleClearData}
        providers={uniqueProviders}
      />

      {/* Add Credit Modal */}
      {showAddCreditModal && (
        <div className="modal-overlay" onClick={() => setShowAddCreditModal(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '500px' }}>
            <div className="modal-header">
              <h2>💳 Add Credits</h2>
              <button className="modal-close" onClick={() => setShowAddCreditModal(false)}>×</button>
            </div>
            
            <div className="modal-body">
              <div style={{ marginBottom: '20px' }}>
                <p>Purchase credits to use AI features. Minimum purchase: $5.00</p>
              </div>
              
              <div style={{ marginBottom: '20px' }}>
                <label style={{ display: 'block', marginBottom: '8px', fontWeight: 'bold' }}>
                  Amount (USD):
                </label>
                <input 
                  type="number" 
                  min="5" 
                  step="1" 
                  value={creditAmount}
                  onChange={(e) => setCreditAmount(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '10px',
                    fontSize: '1rem',
                    border: '1px solid #ddd',
                    borderRadius: '4px'
                  }}
                  placeholder="Enter amount (min $5.00)"
                />
              </div>
              
              <div style={{ 
                background: '#f5f5f5', 
                padding: '15px', 
                borderRadius: '4px',
                marginBottom: '20px'
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
                  <span>Credits to add:</span>
                  <strong>${parseFloat(creditAmount || '0').toFixed(2)}</strong>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.9rem', color: '#666' }}>
                  <span>New balance:</span>
                  <span>${(creditBalance + parseFloat(creditAmount || '0')).toFixed(2)}</span>
                </div>
              </div>
              
              <div style={{ 
                padding: '12px', 
                background: '#e3f2fd', 
                borderRadius: '4px',
                fontSize: '0.9rem',
                marginBottom: '20px'
              }}>
                <strong>💡 Tip:</strong> Add your own API keys in Settings for $0 LLM costs!
                <br/>
                Only infrastructure costs apply when using your own keys.
              </div>

              {/* PayPal Buttons Container */}
              <div 
                ref={paypalButtonsRef} 
                style={{ minHeight: '150px', display: paypalLoading ? 'none' : 'block' }}
              ></div>
              
              {paypalLoading && (
                <div style={{ textAlign: 'center', padding: '40px', color: '#666' }}>
                  Loading PayPal...
                </div>
              )}
              
              {!window.paypal && (
                <div style={{
                  padding: '15px',
                  background: '#fff3cd',
                  border: '1px solid #ffc107',
                  borderRadius: '4px',
                  color: '#856404'
                }}>
                  ⚠️ PayPal SDK not loaded. Please refresh the page.
                </div>
              )}
            </div>
            
            <div className="modal-footer">
              <button 
                className="btn-secondary" 
                onClick={() => setShowAddCreditModal(false)}
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
      </div>
    </div>
  );
};

export default BillingPage;
