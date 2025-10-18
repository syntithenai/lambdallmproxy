import React from 'react';

interface GenerateChartDisplayProps {
  content: string | { type: string; text?: string; image_url?: { url: string; detail?: string } }[] | { chart_type?: string; description?: string; instructions?: string };
  chartCode?: string; // Optional: actual Mermaid code from assistant's response
}

export const GenerateChartDisplay: React.FC<GenerateChartDisplayProps> = ({ content, chartCode }) => {
  const [copiedInstructions, setCopiedInstructions] = React.useState(false);
  const [copiedCode, setCopiedCode] = React.useState(false);

  try {
    const chartData = typeof content === 'string' ? JSON.parse(content) : content;

    // Extract Mermaid code from instructions (fallback)
    // Note: instructions usually contains template/guidelines, not actual code
    // The actual chart code should come from the chartCode prop
    const extractMermaidCode = (instructions: string): string | null => {
      if (!instructions) return null;
      
      // Look for code between ```mermaid and ```
      const mermaidMatch = instructions.match(/```mermaid\s*([\s\S]*?)```/);
      if (mermaidMatch && mermaidMatch[1]) {
        const code = mermaidMatch[1].trim();
        // Filter out placeholder text
        if (code.includes('[Your Mermaid diagram code here]') || 
            code.includes('Your Mermaid diagram code here')) {
          return null;
        }
        return code;
      }
      
      return null;
    };

    // Use provided chartCode first, fallback to extracting from instructions
    const mermaidCode = chartCode || extractMermaidCode(chartData.instructions || '');

    const handleCopyInstructions = () => {
      if (chartData.instructions) {
        navigator.clipboard.writeText(chartData.instructions).then(() => {
          setCopiedInstructions(true);
          setTimeout(() => setCopiedInstructions(false), 2000);
        });
      }
    };

    const handleCopyCode = () => {
      if (mermaidCode) {
        navigator.clipboard.writeText(mermaidCode).then(() => {
          setCopiedCode(true);
          setTimeout(() => setCopiedCode(false), 2000);
        });
      }
    };

    return (
      <div className="bg-gradient-to-br from-purple-50 to-indigo-50 dark:from-purple-950/30 dark:to-indigo-950/30 rounded-lg border border-purple-200 dark:border-purple-700 overflow-hidden">
        <table className="w-full text-sm">
          <tbody>
            <tr className="border-b border-purple-200 dark:border-purple-700">
              <td className="font-semibold text-purple-700 dark:text-purple-300 p-3 w-32 bg-purple-100/50 dark:bg-purple-900/30">
                📊 Chart Type
              </td>
              <td className="p-3 text-gray-800 dark:text-gray-200">
                <span className="inline-flex items-center px-2.5 py-1 bg-purple-100 dark:bg-purple-900/50 text-purple-800 dark:text-purple-200 rounded-full text-xs font-medium border border-purple-300 dark:border-purple-600">
                  {chartData.chart_type || 'N/A'}
                </span>
              </td>
            </tr>
            <tr className="border-b border-purple-200 dark:border-purple-700">
              <td className="font-semibold text-purple-700 dark:text-purple-300 p-3 bg-purple-100/50 dark:bg-purple-900/30">
                📝 Description
              </td>
              <td className="p-3 text-gray-800 dark:text-gray-200">
                {chartData.description || 'N/A'}
              </td>
            </tr>
            {mermaidCode && (
              <tr className="border-b border-purple-200 dark:border-purple-700">
                <td className="font-semibold text-purple-700 dark:text-purple-300 p-3 bg-purple-100/50 dark:bg-purple-900/30 align-top">
                  � Chart Code
                </td>
                <td className="p-3 text-gray-800 dark:text-gray-200 relative">
                  <button
                    onClick={handleCopyCode}
                    className="absolute top-2 right-2 px-3 py-1.5 bg-purple-600 hover:bg-purple-700 text-white text-xs rounded-md transition-colors duration-200 shadow-sm hover:shadow flex items-center gap-1.5 z-10"
                    title="Copy Mermaid code to clipboard"
                  >
                    {copiedCode ? (
                      <>
                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                        </svg>
                        Copied!
                      </>
                    ) : (
                      <>
                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                        </svg>
                        Copy Code
                      </>
                    )}
                  </button>
                  <pre className="whitespace-pre-wrap font-mono text-xs bg-gray-900 dark:bg-gray-950 text-green-400 dark:text-green-300 p-3 rounded border border-purple-200 dark:border-purple-700 max-h-96 overflow-y-auto pr-28">
                    {mermaidCode}
                  </pre>
                </td>
              </tr>
            )}
            <tr>
              <td className="font-semibold text-purple-700 dark:text-purple-300 p-3 bg-purple-100/50 dark:bg-purple-900/30 align-top">
                �📋 Full Instructions
              </td>
              <td className="p-3 text-gray-800 dark:text-gray-200 relative">
                <button
                  onClick={handleCopyInstructions}
                  className="absolute top-2 right-2 px-3 py-1.5 bg-purple-600 hover:bg-purple-700 text-white text-xs rounded-md transition-colors duration-200 shadow-sm hover:shadow flex items-center gap-1.5 z-10"
                  title="Copy full instructions to clipboard"
                >
                  {copiedInstructions ? (
                    <>
                      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                      </svg>
                      Copied!
                    </>
                  ) : (
                    <>
                      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                      </svg>
                      Copy All
                    </>
                  )}
                </button>
                <pre className="whitespace-pre-wrap font-mono text-xs bg-white dark:bg-gray-900 p-3 rounded border border-purple-200 dark:border-purple-700 max-h-96 overflow-y-auto pr-28">
                  {chartData.instructions || 'No instructions available'}
                </pre>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    );
  } catch (e) {
    console.error('Error parsing generate_chart result:', e);
    return (
      <pre className="whitespace-pre-wrap text-xs text-gray-800 dark:text-gray-200">
        {typeof content === 'string' ? content : JSON.stringify(content, null, 2)}
      </pre>
    );
  }
};
