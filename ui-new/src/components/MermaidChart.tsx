import React, { useEffect, useRef, useState } from 'react';
import mermaid from 'mermaid';
import { useAuth } from '../contexts/AuthContext';
import { useSettings } from '../contexts/SettingsContext';
import { useUsage } from '../contexts/UsageContext';

interface MermaidChartProps {
  chart: string;
  onLlmApiCall?: (apiCall: {
    model: string;
    provider: string;
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
    cost: number;
    duration_ms: number;
    purpose: string;
  }) => void;
}

interface FixAttempt {
  attemptNumber: number;
  error: string;
  fixedChart?: string;
  usage?: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
    cost: number;
    provider: string;
    model: string;
    duration_ms: number;
  };
}

export const MermaidChart: React.FC<MermaidChartProps> = ({ chart, onLlmApiCall }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [fixAttempts, setFixAttempts] = useState<FixAttempt[]>([]);
  const [currentChart, setCurrentChart] = useState(chart);
  const [showFixDetails, setShowFixDetails] = useState(false);
  const { accessToken } = useAuth();
  const { settings } = useSettings();
  const { addCost } = useUsage();

  // Initialize mermaid
  useEffect(() => {
    mermaid.initialize({
      startOnLoad: false,
      theme: 'default',
      securityLevel: 'loose',
      fontFamily: 'inherit',
      logLevel: 'error' // Only log errors to console, don't render them
    });
  }, []);

  // Render chart
  useEffect(() => {
    const renderChart = async () => {
      if (!containerRef.current) return;

      try {
        setError(null);
        
        // Clear previous content
        containerRef.current.innerHTML = '';

        // Generate unique ID for this chart
        const id = `mermaid-${Math.random().toString(36).substr(2, 9)}`;

        // Render mermaid chart
        const { svg } = await mermaid.render(id, currentChart);
        
        // Insert SVG
        containerRef.current.innerHTML = svg;
        
        // Clean up any error messages that Mermaid might have inserted into the DOM
        // Remove any divs with error messages that appear at the bottom of the page
        const errorDivs = document.querySelectorAll('div[id^="d"]');
        errorDivs.forEach(div => {
          const text = div.textContent || '';
          if (text.includes('Syntax error in text') || text.includes('mermaid version')) {
            div.remove();
          }
        });
        
        console.log('✅ Mermaid chart rendered successfully');
      } catch (err: any) {
        console.error('❌ Mermaid rendering error:', err);
        const errorMessage = err.message || String(err);
        setError(errorMessage);
        
        // Clean up any error messages that Mermaid inserted before throwing the error
        const errorDivs = document.querySelectorAll('div[id^="d"]');
        errorDivs.forEach(div => {
          const text = div.textContent || '';
          if (text.includes('Syntax error in text') || text.includes('mermaid version')) {
            div.remove();
          }
        });
        
        // Auto-fix if we haven't exceeded retry limit
        if (fixAttempts.length < 3) {
          await attemptFix(errorMessage);
        }
      }
    };

    renderChart();
  }, [currentChart]);

  const attemptFix = async (errorMessage: string) => {
    if (!accessToken) {
      console.warn('No access token available for chart fix');
      return;
    }

    if (fixAttempts.length >= 3) {
      console.log('Max fix attempts (3) reached');
      return;
    }

    setIsLoading(true);
    const attemptNumber = fixAttempts.length + 1;
    
    console.log(`🔧 Attempting to fix chart (attempt ${attemptNumber}/3)`);

    try {
      const apiUrl = import.meta.env.VITE_API_URL || '';
      
      const response = await fetch(`${apiUrl}/fix-mermaid-chart`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${accessToken}`
        },
        body: JSON.stringify({
          chart: currentChart,
          error: errorMessage,
          providers: settings.providers
        })
      });

      if (!response.ok) {
        throw new Error(`Fix request failed: ${response.statusText}`);
      }

      const data = await response.json();

      if (data.error) {
        throw new Error(data.error);
      }

      const newAttempt: FixAttempt = {
        attemptNumber,
        error: errorMessage,
        fixedChart: data.fixedChart,
        usage: data.usage
      };

      setFixAttempts(prev => [...prev, newAttempt]);
      
      // Track usage
      if (data.usage && addCost) {
        addCost(data.usage.cost || 0);
      }

      // Report LLM API call for transparency
      if (onLlmApiCall && data.usage) {
        onLlmApiCall({
          model: data.usage.model,
          provider: data.usage.provider,
          prompt_tokens: data.usage.prompt_tokens,
          completion_tokens: data.usage.completion_tokens,
          total_tokens: data.usage.total_tokens,
          cost: data.usage.cost,
          duration_ms: data.usage.duration_ms,
          purpose: `chart-fix-attempt-${attemptNumber}`
        });
      }

      console.log(`✅ Chart fix attempt ${attemptNumber} successful`);
      console.log(`💰 Cost: $${data.usage?.cost?.toFixed(6) || '0.000000'}`);
      console.log(`📊 Tokens: ${data.usage?.total_tokens || 0}`);

      // Apply fixed chart
      setCurrentChart(data.fixedChart);
      setError(null);

    } catch (err: any) {
      console.error(`❌ Chart fix attempt ${attemptNumber} failed:`, err);
      
      const newAttempt: FixAttempt = {
        attemptNumber,
        error: errorMessage
      };
      setFixAttempts(prev => [...prev, newAttempt]);
      
      // If this was the last attempt, keep the error visible
      if (attemptNumber >= 3) {
        setError(`Failed to fix chart after 3 attempts. Last error: ${errorMessage}`);
      }
    } finally {
      setIsLoading(false);
    }
  };

  const handleManualRetry = () => {
    if (fixAttempts.length < 3 && error) {
      attemptFix(error);
    }
  };

  return (
    <div className="my-4 border border-gray-300 dark:border-gray-700 rounded-lg overflow-hidden">
      {/* Chart Container */}
      <div 
        ref={containerRef} 
        className="bg-white dark:bg-gray-900 p-4 flex items-center justify-center min-h-[200px]"
        style={{ 
          fontSize: '14px',
          overflow: 'auto'
        }}
      />

      {/* Error Display */}
      {error && !isLoading && (
        <div className="bg-red-50 dark:bg-red-900/20 border-t border-red-300 dark:border-red-700 p-4">
          <div className="flex items-start gap-3">
            <svg className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
            </svg>
            <div className="flex-1 min-w-0">
              <div className="text-sm font-medium text-red-800 dark:text-red-300 mb-1">
                Chart Rendering Error
              </div>
              <div className="text-xs text-red-700 dark:text-red-400 font-mono break-all">
                {error}
              </div>
              {fixAttempts.length < 3 && (
                <button
                  onClick={handleManualRetry}
                  className="mt-2 text-xs btn-secondary px-3 py-1"
                >
                  🔧 Try to Fix ({fixAttempts.length}/3 attempts)
                </button>
              )}
              {fixAttempts.length >= 3 && (
                <div className="mt-2 text-xs text-red-600 dark:text-red-400">
                  ⚠️ Maximum fix attempts reached. The chart may have unsupported syntax.
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Loading State */}
      {isLoading && (
        <div className="bg-blue-50 dark:bg-blue-900/20 border-t border-blue-300 dark:border-blue-700 p-4">
          <div className="flex items-center gap-3">
            <svg className="w-5 h-5 text-blue-500 animate-spin" viewBox="0 0 24 24" fill="none" stroke="currentColor">
              <circle className="opacity-25" cx="12" cy="12" r="10" strokeWidth="3" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
            </svg>
            <div className="text-sm text-blue-700 dark:text-blue-300">
              Attempting to fix chart (attempt {fixAttempts.length + 1}/3)...
            </div>
          </div>
        </div>
      )}

      {/* Fix Details (collapsible) */}
      {fixAttempts.length > 0 && (
        <div className="bg-gray-50 dark:bg-gray-800 border-t border-gray-300 dark:border-gray-700">
          <button
            onClick={() => setShowFixDetails(!showFixDetails)}
            className="w-full px-4 py-2 text-left text-xs font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-750 flex items-center justify-between"
          >
            <span>🔧 Chart Auto-Fix Details ({fixAttempts.length} attempt{fixAttempts.length > 1 ? 's' : ''})</span>
            <svg 
              className={`w-4 h-4 transition-transform ${showFixDetails ? 'rotate-180' : ''}`} 
              fill="none" 
              stroke="currentColor" 
              viewBox="0 0 24 24"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </button>
          
          {showFixDetails && (
            <div className="px-4 pb-4 space-y-3">
              {fixAttempts.map((attempt) => (
                <div key={attempt.attemptNumber} className="bg-white dark:bg-gray-900 rounded p-3 text-xs">
                  <div className="font-semibold text-gray-900 dark:text-gray-100 mb-2">
                    Attempt {attempt.attemptNumber}
                  </div>
                  
                  <div className="space-y-2">
                    <div>
                      <span className="text-gray-600 dark:text-gray-400">Error:</span>
                      <div className="text-red-600 dark:text-red-400 font-mono text-[10px] break-all mt-1">
                        {attempt.error}
                      </div>
                    </div>
                    
                    {attempt.usage && (
                      <div className="pt-2 border-t border-gray-200 dark:border-gray-700">
                        <span className="text-gray-600 dark:text-gray-400">LLM Usage:</span>
                        <div className="mt-1 grid grid-cols-2 gap-2">
                          <div>
                            <div className="text-gray-500 dark:text-gray-500">Provider:</div>
                            <div className="font-medium">{attempt.usage.provider}</div>
                          </div>
                          <div>
                            <div className="text-gray-500 dark:text-gray-500">Model:</div>
                            <div className="font-medium">{attempt.usage.model}</div>
                          </div>
                          <div>
                            <div className="text-gray-500 dark:text-gray-500">Tokens:</div>
                            <div className="font-medium">{attempt.usage.total_tokens.toLocaleString()}</div>
                          </div>
                          <div>
                            <div className="text-gray-500 dark:text-gray-500">Cost:</div>
                            <div className="font-medium text-green-600 dark:text-green-400">
                              ${attempt.usage.cost.toFixed(6)}
                            </div>
                          </div>
                          <div>
                            <div className="text-gray-500 dark:text-gray-500">Duration:</div>
                            <div className="font-medium">{attempt.usage.duration_ms}ms</div>
                          </div>
                          <div>
                            <div className="text-gray-500 dark:text-gray-500">Result:</div>
                            <div className="font-medium text-green-600 dark:text-green-400">
                              {attempt.fixedChart ? '✅ Fixed' : '❌ Failed'}
                            </div>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              ))}
              
              {fixAttempts.some(a => a.usage) && (
                <div className="bg-blue-50 dark:bg-blue-900/20 rounded p-3 text-xs">
                  <div className="font-semibold text-blue-900 dark:text-blue-100 mb-1">
                    📊 Total Cost
                  </div>
                  <div className="text-blue-800 dark:text-blue-300">
                    ${fixAttempts.reduce((sum, a) => sum + (a.usage?.cost || 0), 0).toFixed(6)}
                    {' '}({fixAttempts.reduce((sum, a) => sum + (a.usage?.total_tokens || 0), 0).toLocaleString()} tokens)
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
};
