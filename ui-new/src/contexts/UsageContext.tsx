import React, { createContext, useContext, useState, useEffect } from 'react';
import { useAuth } from './AuthContext';
import { getCachedApiBase } from '../utils/api';

interface UsageData {
  userEmail: string;
  totalCost: number;
  creditLimit: number;
  remaining: number;
  exceeded: boolean;
  timestamp: string;
}

interface UsageContextType {
  usage: UsageData | null;
  loading: boolean;
  error: string | null;
  refreshUsage: () => Promise<void>;
  addCost: (cost: number) => void;
  isLocked: boolean;
}

const UsageContext = createContext<UsageContextType | undefined>(undefined);

export function UsageProvider({ children }: { children: React.ReactNode }) {
  const { accessToken, isAuthenticated } = useAuth();
  const [usage, setUsage] = useState<UsageData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /**
   * Fetch usage data from backend
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
      const response = await fetch(`${apiBase}/usage`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json'
        }
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.message || `HTTP ${response.status}`);
      }

      const data: UsageData = await response.json();
      setUsage(data);
      console.log('💰 Usage loaded:', data);
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
    const newRemaining = Math.max(0, usage.creditLimit - newTotalCost);
    const newExceeded = newTotalCost >= usage.creditLimit;

    setUsage({
      ...usage,
      totalCost: newTotalCost,
      remaining: newRemaining,
      exceeded: newExceeded,
      timestamp: new Date().toISOString()
    });

    console.log(`💸 Added $${cost.toFixed(4)} to usage - New total: $${newTotalCost.toFixed(4)}`);
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
    isLocked: usage?.exceeded || false
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
