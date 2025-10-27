import React from 'react';

interface LlmInfoDialogHeaderProps {
  onClose: () => void;
}

export const LlmInfoDialogHeader: React.FC<LlmInfoDialogHeaderProps> = ({ onClose }) => (
  <div className="flex items-center justify-between mb-4">
    <h2 className="text-xl font-bold">LLM Transparency Info</h2>
    <button className="text-gray-500 hover:text-gray-700 dark:hover:text-gray-300" onClick={onClose}>
      ×
    </button>
  </div>
);
