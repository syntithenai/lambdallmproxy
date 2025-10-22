import React from 'react';

interface LlmInfoDialogFooterProps {
  totalTokens: number;
  totalPromptTokens: number;
  totalCompletionTokens: number;
  totalActualCost: number;
  totalPaidEquivalent: number;
  hasPricing: boolean;
  hasFreeModels: boolean;
  onClose: () => void;
}

export const LlmInfoDialogFooter: React.FC<LlmInfoDialogFooterProps> = ({
  totalTokens,
  totalPromptTokens,
  totalCompletionTokens,
  totalActualCost,
  totalPaidEquivalent,
  hasPricing,
  hasFreeModels,
  onClose,
}) => (
  <div className="mt-6 border-t pt-4 text-sm text-gray-700 dark:text-gray-300">
    <div className="mb-2">Total tokens: <span className="font-mono font-semibold">{totalTokens}</span></div>
    <div className="mb-2">Prompt tokens: <span className="font-mono">{totalPromptTokens}</span> | Completion tokens: <span className="font-mono">{totalCompletionTokens}</span></div>
    <div className="mb-2">Actual cost: <span className="font-mono font-semibold">{totalActualCost}</span></div>
    {hasPricing && (
      <div className="mb-2">Paid equivalent: <span className="font-mono">{totalPaidEquivalent}</span></div>
    )}
    {hasFreeModels && (
      <div className="mb-2 text-green-600 dark:text-green-400">Some calls used free tier models.</div>
    )}
    <button className="px-4 py-2 bg-gray-500 hover:bg-gray-600 text-white rounded transition-colors mt-4" onClick={onClose}>Close</button>
  </div>
);
