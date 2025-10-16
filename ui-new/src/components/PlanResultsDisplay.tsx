/**
 * PlanResultsDisplay Component
 * Collapsible display of raw planning results
 */
import React from 'react';

interface PlanResultsDisplayProps {
  result: any;
}

export const PlanResultsDisplay: React.FC<PlanResultsDisplayProps> = ({ result }) => {
  if (!result || result.error) return null;

  return (
    <details className="card p-4">
      <summary className="cursor-pointer font-semibold text-gray-700 dark:text-gray-300">
        Raw Plan Details (for reference)
      </summary>
      <div className="space-y-4 mt-4">
        {result.persona && (
          <div className="bg-blue-50 dark:bg-blue-900/20 p-4 rounded-lg">
            <h4 className="font-semibold mb-2 text-blue-800 dark:text-blue-300">AI Persona:</h4>
            <p className="text-gray-700 dark:text-gray-300 whitespace-pre-wrap text-sm">
              {result.persona}
            </p>
          </div>
        )}

        {result.plan && (
          <div className="bg-green-50 dark:bg-green-900/20 p-4 rounded-lg">
            <h4 className="font-semibold mb-2 text-green-800 dark:text-green-300">Research Plan:</h4>
            <p className="text-gray-700 dark:text-gray-300 whitespace-pre-wrap text-sm">
              {result.plan}
            </p>
          </div>
        )}
        
        {result.searchKeywords && result.searchKeywords.length > 0 && (
          <div className="bg-purple-50 dark:bg-purple-900/20 p-4 rounded-lg">
            <h4 className="font-semibold mb-2 text-purple-800 dark:text-purple-300">Search Keywords:</h4>
            <div className="flex flex-wrap gap-2">
              {result.searchKeywords.map((keyword: string, idx: number) => (
                <span
                  key={idx}
                  className="bg-purple-200 dark:bg-purple-800 text-purple-900 dark:text-purple-100 px-3 py-1 rounded-full text-sm font-medium"
                >
                  {keyword}
                </span>
              ))}
            </div>
          </div>
        )}

        {result.questions && result.questions.length > 0 && (
          <div className="bg-yellow-50 dark:bg-yellow-900/20 p-4 rounded-lg">
            <h4 className="font-semibold mb-2 text-yellow-800 dark:text-yellow-300">Research Questions:</h4>
            <ul className="list-disc list-inside space-y-1 text-gray-700 dark:text-gray-300 text-sm">
              {result.questions.map((question: string, idx: number) => (
                <li key={idx}>{question}</li>
              ))}
            </ul>
          </div>
        )}

        {result.reasoning && (
          <div className="bg-orange-50 dark:bg-orange-900/20 p-4 rounded-lg">
            <h4 className="font-semibold mb-2 text-orange-800 dark:text-orange-300">Reasoning:</h4>
            <p className="text-gray-700 dark:text-gray-300 whitespace-pre-wrap text-sm">
              {result.reasoning}
            </p>
          </div>
        )}

        {result.steps && result.steps.length > 0 && (
          <div className="bg-indigo-50 dark:bg-indigo-900/20 p-4 rounded-lg">
            <h4 className="font-semibold mb-2 text-indigo-800 dark:text-indigo-300">Research Steps:</h4>
            <ol className="list-decimal list-inside space-y-2 text-gray-700 dark:text-gray-300 text-sm">
              {result.steps.map((step: string, idx: number) => (
                <li key={idx} className="pl-2">{step}</li>
              ))}
            </ol>
          </div>
        )}

        {result.sources && result.sources.length > 0 && (
          <div className="bg-teal-50 dark:bg-teal-900/20 p-4 rounded-lg">
            <h4 className="font-semibold mb-2 text-teal-800 dark:text-teal-300">Recommended Sources:</h4>
            <ul className="list-disc list-inside space-y-1 text-gray-700 dark:text-gray-300 text-sm">
              {result.sources.map((source: string, idx: number) => (
                <li key={idx}>{source}</li>
              ))}
            </ul>
          </div>
        )}

        {result.notes && (
          <div className="bg-gray-50 dark:bg-gray-800 p-4 rounded-lg">
            <h4 className="font-semibold mb-2 text-gray-800 dark:text-gray-300">Additional Notes:</h4>
            <p className="text-gray-700 dark:text-gray-300 whitespace-pre-wrap text-sm">
              {result.notes}
            </p>
          </div>
        )}
      </div>
    </details>
  );
};
