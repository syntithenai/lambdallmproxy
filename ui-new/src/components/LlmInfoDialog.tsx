import React from 'react';
import { LlmInfoDialogHeader } from './LlmInfoDialogHeader';
import { LlmApiCallCard } from './LlmApiCallCard';
import { LlmInfoDialogFooter } from './LlmInfoDialogFooter';

interface LlmApiCall {
  phase: string;
  provider?: string;
  model: string;
  request: any;
  response?: any;
  httpHeaders?: any;
  httpStatus?: number;
  timestamp: string;
  type?: string; // 'image_generation' or undefined for text
  cost?: number; // For image generation calls
  durationMs?: number; // Duration in milliseconds
  metadata?: any; // Additional metadata (size, quality, style, etc.)
  success?: boolean; // Success status
}

interface Evaluation {
  attempt: number;
  comprehensive: boolean;
  reason: string;
}

interface LlmInfoDialogProps {
  apiCalls: LlmApiCall[];
  evaluations?: Evaluation[]; // Kept for backwards compatibility but no longer used
  onClose: () => void;
}

export const LlmInfoDialog: React.FC<LlmInfoDialogProps> = ({ apiCalls, onClose }) => {
  // Example summary values (replace with real calculations as needed)
  const totalTokens = 0;
  const totalPromptTokens = 0;
  const totalCompletionTokens = 0;
  const totalActualCost = 0;
  const totalPaidEquivalent = 0;
  const hasPricing = false;
  const hasFreeModels = false;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-40 dark:bg-opacity-60">
      <div className="bg-white dark:bg-gray-900 rounded-lg shadow-lg w-full max-w-3xl p-6 relative">
        <LlmInfoDialogHeader onClose={onClose} />
        <div className="space-y-4">
          {apiCalls.length === 0 ? (
            <div className="text-gray-500 dark:text-gray-400">No API calls found.</div>
          ) : (
            apiCalls.map((call, idx) => (
              <LlmApiCallCard key={idx} call={call} />
            ))
          )}
        </div>
        <LlmInfoDialogFooter
          totalTokens={totalTokens}
          totalPromptTokens={totalPromptTokens}
          totalCompletionTokens={totalCompletionTokens}
          totalActualCost={totalActualCost}
          totalPaidEquivalent={totalPaidEquivalent}
          hasPricing={hasPricing}
          hasFreeModels={hasFreeModels}
          onClose={onClose}
        />
      </div>
    </div>
  );
};
