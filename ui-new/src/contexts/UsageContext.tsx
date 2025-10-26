import React, { createContext, useContext, useState, useEffect } from 'react';
import { useAuth } from './AuthContext';
import { getCachedApiBase } from '../utils/api';

interface TTSCapabilities {
  openai: boolean;
  groq: boolean;
  gemini: boolean;
  together: boolean;
  elevenlabs: boolean;
  browser: boolean;
  speakjs: boolean;
}

interface UsageData {
  userEmail: string;
  totalCost: number;
  creditBalance: number;    // Remaining credit (credits - usage)
  totalCredits: number;     // Total credit added
  exceeded: boolean;
  timestamp: string;
  ttsCapabilities?: TTSCapabilities; // Server-side TTS capabilities
}

interface UsageContextType {
  usage: UsageData | null;
  loading: boolean;
  error: string | null;
  refreshUsage: () => Promise<void>;
  addCost: (cost: number) => void;
  isLocked: boolean;
  ttsCapabilities: TTSCapabilities | null;
}

const UsageContext = createContext<UsageContextType | undefined>(undefined);

export function UsageProvider({ children }: { children: React.ReactNode }) {
  const { accessToken, isAuthenticated } = useAuth();
  const [usage, setUsage] = useState<UsageData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ttsCapabilities, setTtsCapabilities] = useState<TTSCapabilities | null>(null);

  /**
   * Fetch usage data from billing endpoint
   * Usage is calculated from billing totals on the frontend
   */
  const fetchUsage = async () => {
    if (!accessToken || !isAuthenticated) {
      setUsage(null);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const apiBase = await getCachedApiBase();
      
      const headers: Record<string, string> = {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      };
      
      const response = await fetch(`${apiBase}/billing`, {
        method: 'GET',
        headers
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.message || `HTTP ${response.status}`);
      }

      const billingData = await response.json();
      
      // Extract TTS capabilities if provided by the server
      if (billingData.ttsCapabilities) {
        setTtsCapabilities(billingData.ttsCapabilities);
        console.log('🎙️ Server TTS capabilities:', billingData.ttsCapabilities);
      }
      
      // Calculate credit balance and total credits from transactions
      let totalCredits = 0;
      let totalUsage = 0;
      
      if (billingData.transactions) {
        for (const tx of billingData.transactions) {
          if (tx.type === 'credit_added') {
            // Credits are stored as negative costs (-0.50), so we add the absolute value
            totalCredits += Math.abs(tx.cost);
          } else {
            // Regular spending
            totalUsage += tx.cost;
          }
        }
      }
      
      const creditBalance = totalCredits - totalUsage;
      // Consider "exceeded" only if balance is less than -$0.01 (to handle floating-point precision)
      const exceeded = creditBalance < -0.01;
      
      const calculatedUsage: UsageData = {
        userEmail: '',
        totalCost: parseFloat(totalUsage.toFixed(4)),
        creditBalance: parseFloat(Math.max(0, creditBalance).toFixed(2)),  // Ensure non-negative, match display precision
        totalCredits: parseFloat(totalCredits.toFixed(2)),
        exceeded,
        timestamp: new Date().toISOString()
      };
      
      setUsage(calculatedUsage);
      console.log('💰 Usage calculated from billing data:', {
        ...calculatedUsage,
        rawTotalCredits: totalCredits,
        rawTotalUsage: totalUsage,
        rawCreditBalance: creditBalance
      });
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to load usage';
      console.error('❌ Failed to fetch usage:', errorMessage);
      setError(errorMessage);
      
      // On error, don't lock the user - fail open
      setUsage(null);
    } finally {
      setLoading(false);
    }
  };

  /**
   * Add cost to current usage (optimistic update)
   */
  const addCost = (cost: number) => {
    if (!usage) return;

    const newTotalCost = usage.totalCost + cost;
    const newCreditBalance = usage.totalCredits - newTotalCost;
    // Consider "exceeded" only if balance is less than -$0.01 (to handle floating-point precision)
    const newExceeded = newCreditBalance < -0.01;

    setUsage({
      ...usage,
      totalCost: newTotalCost,
      creditBalance: newCreditBalance,
      exceeded: newExceeded,
      timestamp: new Date().toISOString()
    });

    console.log(`💸 Added $${cost.toFixed(4)} to usage - New balance: $${newCreditBalance.toFixed(4)}`);
  };

  /**
   * Load usage when user authenticates
   */
  useEffect(() => {
    if (isAuthenticated && accessToken) {
      fetchUsage();
    } else {
      setUsage(null);
    }
  }, [isAuthenticated, accessToken]);

  const value: UsageContextType = {
    usage,
    loading,
    error,
    refreshUsage: fetchUsage,
    addCost,
    isLocked: usage?.exceeded || false,
    ttsCapabilities
  };

  return (
    <UsageContext.Provider value={value}>
      {children}
    </UsageContext.Provider>
  );
}

export function useUsage() {
  const context = useContext(UsageContext);
  if (context === undefined) {
    throw new Error('useUsage must be used within a UsageProvider');
  }
  return context;
}
