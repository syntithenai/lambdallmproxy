import React, { useEffect, useRef, useState } from 'react';
import mermaid from 'mermaid';
import { useAuth } from '../contexts/AuthContext';
import { useSettings } from '../contexts/SettingsContext';
import { useUsage } from '../contexts/UsageContext';
import { useSwag } from '../contexts/SwagContext';
import { useToast } from './ToastManager';
import { LlmInfoDialog as LlmInfoDialogNew } from './LlmInfoDialogNew';

interface MermaidChartProps {
  chart: string;
  description?: string;
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
  llmApiCall?: any; // Full llmApiCall object for transparency
}

export const MermaidChart: React.FC<MermaidChartProps> = ({ chart, description, onLlmApiCall }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [fixAttempts, setFixAttempts] = useState<FixAttempt[]>([]);
  const [currentChart, setCurrentChart] = useState(chart);
  const [showFixDetails, setShowFixDetails] = useState(false);
  const [showLlmInfo, setShowLlmInfo] = useState(false); // NEW: Show LLM transparency dialog
  const [copiedImage, setCopiedImage] = useState(false);
  const { accessToken } = useAuth();
  const { settings } = useSettings();
  const { addCost } = useUsage();
  const { addSnippet } = useSwag();
  const { showSuccess, showError } = useToast();

  // Convert SVG to PNG and copy to clipboard
  const handleCopyImage = async () => {
    if (!containerRef.current) return;
    
    try {
      const svgElement = containerRef.current.querySelector('svg');
      if (!svgElement) {
        showError('Chart not found');
        return;
      }

      // Create canvas and draw SVG
      const canvas = document.createElement('canvas');
      const svgData = new XMLSerializer().serializeToString(svgElement);
      const img = new Image();
      const svgBlob = new Blob([svgData], { type: 'image/svg+xml;charset=utf-8' });
      const url = URL.createObjectURL(svgBlob);

      img.onload = async () => {
        canvas.width = svgElement.clientWidth || 800;
        canvas.height = svgElement.clientHeight || 600;
        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.fillStyle = 'white';
          ctx.fillRect(0, 0, canvas.width, canvas.height);
          ctx.drawImage(img, 0, 0);
          
          canvas.toBlob(async (blob) => {
            if (blob) {
              try {
                await navigator.clipboard.write([
                  new ClipboardItem({ 'image/png': blob })
                ]);
                setCopiedImage(true);
                setTimeout(() => setCopiedImage(false), 2000);
                showSuccess('Chart image copied to clipboard!');
              } catch (clipboardErr) {
                console.error('Failed to copy to clipboard:', clipboardErr);
                showError('Failed to copy image to clipboard');
              }
            }
          });
        }
        URL.revokeObjectURL(url);
      };

      img.onerror = () => {
        showError('Failed to process chart image');
        URL.revokeObjectURL(url);
      };

      img.src = url;
    } catch (err) {
      console.error('Failed to copy image:', err);
      showError('Failed to copy chart image');
    }
  };

  // Convert SVG to PNG base64 and add to swag as markdown
  const handleGrabImage = async () => {
    if (!containerRef.current) return;
    
    try {
      const svgElement = containerRef.current.querySelector('svg');
      if (!svgElement) {
        showError('Chart not found');
        return;
      }

      const chartDescription = description || 'Chart diagram';
      
      // Convert SVG to PNG for better compatibility in Swag page
      const canvas = document.createElement('canvas');
      const svgData = new XMLSerializer().serializeToString(svgElement);
      const img = new Image();
      const svgBlob = new Blob([svgData], { type: 'image/svg+xml;charset=utf-8' });
      const url = URL.createObjectURL(svgBlob);

      img.onload = async () => {
        try {
          canvas.width = svgElement.clientWidth || 800;
          canvas.height = svgElement.clientHeight || 600;
          const ctx = canvas.getContext('2d');
          if (ctx) {
            // White background
            ctx.fillStyle = 'white';
            ctx.fillRect(0, 0, canvas.width, canvas.height);
            ctx.drawImage(img, 0, 0);
            
            // Convert to base64 PNG
            const pngDataUrl = canvas.toDataURL('image/png');
            
            // Use HTML img tag instead of markdown for better compatibility with rehypeRaw
            const htmlContent = `<img src="${pngDataUrl}" alt="${chartDescription}" class="max-w-full h-auto rounded-lg" />`;
            
            await addSnippet(htmlContent, 'tool', `Chart: ${chartDescription}`);
            showSuccess('Chart saved to Swag!');
          }
          URL.revokeObjectURL(url);
        } catch (conversionErr) {
          console.error('Failed to convert to PNG:', conversionErr);
          showError('Failed to save chart to Swag');
          URL.revokeObjectURL(url);
        }
      };

      img.onerror = () => {
        showError('Failed to process chart image');
        URL.revokeObjectURL(url);
      };

      img.src = url;
    } catch (err) {
      console.error('Failed to grab image:', err);
      showError('Failed to save chart to Swag');
    }
  };

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
        
        // Insert SVG (check if container still exists - component may have unmounted)
        if (!containerRef.current) {
          console.warn('⚠️ MermaidChart container ref is null - component may have unmounted');
          return;
        }
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
      // Import the API utility to get the correct base URL
      // Force fresh check to ensure we get the right backend URL
      const { getCachedApiBase, resetApiBase } = await import('../utils/api');
      resetApiBase(); // Clear cache to re-detect backend
      const apiUrl = await getCachedApiBase();
      
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
        usage: data.usage,
        llmApiCall: data.llmApiCall // Store full llmApiCall for transparency
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
    <div className="my-4 border border-gray-300 dark:border-gray-700 rounded-lg overflow-hidden group">
      {/* Chart Container with Action Buttons */}
      <div className="relative bg-white dark:bg-gray-900">
        {/* Action Buttons - subtle and appear on hover */}
        <div className="absolute top-2 right-2 flex gap-1.5 z-10 opacity-0 group-hover:opacity-100 transition-opacity duration-200">
          {/* LLM Info Button - Show if there are fix attempts with llmApiCall */}
          {fixAttempts.some(attempt => attempt.llmApiCall) && (
            <button
              onClick={() => setShowLlmInfo(true)}
              className="p-1.5 bg-white/80 dark:bg-gray-800/80 hover:bg-white dark:hover:bg-gray-800 text-blue-600 dark:text-blue-400 text-xs rounded backdrop-blur-sm transition-all duration-200 shadow-sm hover:shadow flex items-center gap-1"
              title="View LLM transparency info for chart fixes"
            >
              <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <span className="text-[10px]">LLM</span>
            </button>
          )}
          <button
            onClick={handleCopyImage}
            className="p-1.5 bg-white/80 dark:bg-gray-800/80 hover:bg-white dark:hover:bg-gray-800 text-gray-700 dark:text-gray-300 text-xs rounded backdrop-blur-sm transition-all duration-200 shadow-sm hover:shadow flex items-center gap-1"
            title="Copy chart image to clipboard"
          >
            {copiedImage ? (
              <>
                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
                <span className="text-[10px]">Copied!</span>
              </>
            ) : (
              <>
                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                </svg>
                <span className="text-[10px]">Copy</span>
              </>
            )}
          </button>
          <button
            onClick={handleGrabImage}
            className="p-1.5 bg-white/80 dark:bg-gray-800/80 hover:bg-white dark:hover:bg-gray-800 text-gray-700 dark:text-gray-300 text-xs rounded backdrop-blur-sm transition-all duration-200 shadow-sm hover:shadow flex items-center gap-1"
            title="Grab chart as base64 markdown"
          >
            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 11.5V14m0-2.5v-6a1.5 1.5 0 113 0m-3 6a1.5 1.5 0 00-3 0v2a7.5 7.5 0 0015 0v-5a1.5 1.5 0 00-3 0m-6-3V11m0-5.5v-1a1.5 1.5 0 013 0v1m0 0V11m0-5.5a1.5 1.5 0 013 0v3m0 0V11" />
            </svg>
            <span className="text-[10px]">Grab</span>
          </button>
        </div>
        
        {/* Chart */}
        <div 
          ref={containerRef} 
          className="p-4 flex items-center justify-center min-h-[200px]"
          style={{ 
            fontSize: '14px',
            overflow: 'auto'
          }}
        />
      </div>

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

      {/* LLM Transparency Dialog */}
      {showLlmInfo && (
        <LlmInfoDialogNew
          apiCalls={fixAttempts.filter(a => a.llmApiCall).map(a => a.llmApiCall)}
          onClose={() => setShowLlmInfo(false)}
        />
      )}
    </div>
  );
};
