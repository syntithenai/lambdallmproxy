import React, { useState } from 'react';

interface SystemPromptDisplayProps {
  systemPrompt: string;
  setSystemPrompt: (prompt: string) => void;
}

export const SystemPromptDisplay: React.FC<SystemPromptDisplayProps> = ({ 
  systemPrompt, 
  setSystemPrompt 
}) => {
  const [systemPromptExpanded, setSystemPromptExpanded] = useState(false);
  const [isEditingSystemPrompt, setIsEditingSystemPrompt] = useState(false);
  const [editedSystemPrompt, setEditedSystemPrompt] = useState<string>('');

  if (!systemPrompt) return null;

  return (
    <div className="p-2 border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800">
      <div className="flex items-start gap-2 max-w-screen-2xl mx-auto">
        {isEditingSystemPrompt ? (
          <>
            {/* Edit Mode - Textarea */}
            <textarea
              value={editedSystemPrompt}
              onChange={(e) => setEditedSystemPrompt(e.target.value)}
              className="flex-1 text-sm text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-900 border border-gray-300 dark:border-gray-600 rounded p-2 min-h-[80px] resize-y focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="Enter system prompt..."
            />
            {/* Edit Mode Buttons */}
            <div className="flex gap-1 flex-shrink-0">
              <button
                onClick={() => {
                  setSystemPrompt(editedSystemPrompt);
                  setIsEditingSystemPrompt(false);
                }}
                className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-xs rounded transition-colors"
                title="Save system prompt"
              >
                Save
              </button>
              <button
                onClick={() => {
                  setEditedSystemPrompt(systemPrompt);
                  setIsEditingSystemPrompt(false);
                }}
                className="px-3 py-1.5 bg-gray-400 hover:bg-gray-500 text-white text-xs rounded transition-colors"
                title="Cancel editing"
              >
                Cancel
              </button>
            </div>
          </>
        ) : (
          <>
            {/* View Mode - Display */}
            <div 
              className="flex-1 text-sm text-gray-700 dark:text-gray-300 cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-700 p-1 rounded transition-colors"
              onClick={() => setSystemPromptExpanded(!systemPromptExpanded)}
              title={systemPromptExpanded ? "Click to collapse" : "Click to expand"}
            >
              {systemPromptExpanded ? systemPrompt : (systemPrompt.length > 200 ? systemPrompt.substring(0, 200) + '...' : systemPrompt)}
            </div>
            {/* View Mode Buttons */}
            <div className="flex gap-1 flex-shrink-0">
              <button
                onClick={() => {
                  setEditedSystemPrompt(systemPrompt);
                  setIsEditingSystemPrompt(true);
                  setSystemPromptExpanded(true);
                }}
                className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-xs rounded transition-colors"
                title="Edit system prompt"
              >
                Edit
              </button>
              <button
                onClick={() => {
                  if (confirm('Clear the system prompt?')) {
                    setSystemPrompt('');
                    setIsEditingSystemPrompt(false);
                  }
                }}
                className="px-3 py-1.5 bg-red-600 hover:bg-red-700 text-white text-xs rounded transition-colors"
                title="Clear system prompt"
              >
                Clear
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
};
