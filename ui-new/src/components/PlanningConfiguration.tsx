/**
 * PlanningConfiguration Component
 * Collapsible configuration panel for planning parameters
 */
import React from 'react';

interface PlanningConfigurationProps {
  temperature: number;
  maxTokens: number;
  systemPrompt: string;
  onTemperatureChange: (value: number) => void;
  onMaxTokensChange: (value: number) => void;
  onSystemPromptChange: (value: string) => void;
}

export const PlanningConfiguration: React.FC<PlanningConfigurationProps> = ({
  temperature,
  maxTokens,
  systemPrompt,
  onTemperatureChange,
  onMaxTokensChange,
  onSystemPromptChange
}) => {
  return (
    <details className="card p-4">
      <summary className="cursor-pointer font-semibold text-gray-700 dark:text-gray-300 mb-2">
        Configuration (Temperature: {temperature.toFixed(1)}, Tokens: {maxTokens})
      </summary>
      <div className="space-y-4 mt-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
            Temperature: {temperature.toFixed(1)}
          </label>
          <input
            type="range"
            min="0"
            max="1"
            step="0.1"
            value={temperature}
            onChange={(e) => onTemperatureChange(parseFloat(e.target.value))}
            className="w-full h-2 bg-gray-200 dark:bg-gray-700 rounded-lg appearance-none cursor-pointer"
          />
          <div className="flex justify-between text-xs text-gray-500 dark:text-gray-400 mt-1">
            <span title="Deterministic and precise">0.0 Factual</span>
            <span title="Slight variation">0.3 Mostly Factual</span>
            <span title="Balanced creativity">0.5 Balanced</span>
            <span title="More creative and varied" className="font-semibold">0.7 Creative</span>
            <span title="Highly experimental">1.0 Experimental</span>
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
            Response Length: {maxTokens} tokens
          </label>
          <input
            type="range"
            min="128"
            max="4096"
            step="128"
            value={maxTokens}
            onChange={(e) => onMaxTokensChange(parseInt(e.target.value))}
            className="w-full h-2 bg-gray-200 dark:bg-gray-700 rounded-lg appearance-none cursor-pointer"
          />
          <div className="flex justify-between text-xs text-gray-500 dark:text-gray-400 mt-1">
            <span>128 Brief</span>
            <span className="font-semibold">512 Normal</span>
            <span>1024 Detailed</span>
            <span>2048 Comprehensive</span>
            <span>4096 Extensive</span>
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
            System Prompt (synced with Chat)
          </label>
          <textarea
            value={systemPrompt}
            onChange={(e) => onSystemPromptChange(e.target.value)}
            placeholder="Enter a custom system prompt to guide the AI's behavior..."
            className="input-field resize-none"
            rows={4}
          />
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
            This system prompt will be used in both Planning and Chat tabs. It helps define the AI's role and behavior.
          </p>
        </div>
      </div>
    </details>
  );
};
