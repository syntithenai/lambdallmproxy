import React from 'react';
import { useLocalStorage } from '../hooks/useLocalStorage';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

interface Settings {
  llmApiKey: string;
  apiEndpoint: string;
}

export const SettingsModal: React.FC<SettingsModalProps> = ({ isOpen, onClose }) => {
  const [settings, setSettings] = useLocalStorage<Settings>('app_settings', {
    llmApiKey: '',
    apiEndpoint: ''
  });

  const handleSave = () => {
    console.log('Settings saved:', settings);
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50 p-4">
      <div className="card max-w-2xl w-full max-h-[90vh] overflow-y-auto p-6">
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-2xl font-bold text-gray-900 dark:text-gray-100">Settings</h2>
          <button
            onClick={onClose}
            className="text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="space-y-6">
          {/* LLM API Key */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              LLM API Key
            </label>
            <input
              type="password"
              value={settings.llmApiKey}
              onChange={(e) => setSettings({ ...settings, llmApiKey: e.target.value })}
              className="input-field"
              placeholder="Enter your API key (e.g., Groq, OpenAI)"
            />
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
              This key is stored locally in your browser
            </p>
          </div>

          {/* API Endpoint */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              API Endpoint
            </label>
            <input
              type="text"
              value={settings.apiEndpoint}
              onChange={(e) => setSettings({ ...settings, apiEndpoint: e.target.value })}
              className="input-field"
              placeholder="https://api.example.com (optional)"
            />
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
              Leave empty to use default endpoint
            </p>
          </div>
        </div>

        <div className="flex justify-end gap-3 mt-8">
          <button onClick={onClose} className="btn-secondary">
            Cancel
          </button>
          <button onClick={handleSave} className="btn-primary">
            Save Settings
          </button>
        </div>
      </div>
    </div>
  );
};
