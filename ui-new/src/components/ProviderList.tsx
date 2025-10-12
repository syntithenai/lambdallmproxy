/**
 * Phase 2: ProviderList Component
 * 
 * Displays configured providers with edit/delete actions.
 * Shows provider info, masked API keys, and management controls.
 */

import { useState } from 'react';
import type { ProviderConfig } from '../types/provider';
import { PROVIDER_INFO } from '../types/provider';
import { maskApiKey } from '../utils/providerValidation';
import { useProviders } from '../hooks/useProviders';
import { useSettings } from '../contexts/SettingsContext';
import { ProviderForm } from './ProviderForm';

export function ProviderList() {
  const { providers, addProvider, updateProvider, deleteProvider } = useProviders();
  const { settings, setSettings, loadFromGoogleDrive, saveToGoogleDrive, clearSettings } = useSettings();
  const [isAdding, setIsAdding] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [showWarning, setShowWarning] = useState(false);
  const [isLoadingFromDrive, setIsLoadingFromDrive] = useState(false);

  const handleAdd = () => {
    setIsAdding(true);
    setEditingId(null);
    setError(null);
    setSuccess(null);
  };

  const handleEdit = (id: string) => {
    setEditingId(id);
    setIsAdding(false);
    setError(null);
    setSuccess(null);
  };

  const handleDelete = (id: string) => {
    if (window.confirm('Are you sure you want to delete this provider?')) {
      deleteProvider(id);
      setSuccess('Provider deleted successfully');
      setTimeout(() => setSuccess(null), 3000);
    }
  };

  const handleSave = (provider: Omit<ProviderConfig, 'id'>) => {
    if (editingId) {
      // Update existing
      const result = updateProvider(editingId, provider);
      if (result.success) {
        setSuccess('Provider updated successfully');
        setEditingId(null);
        setTimeout(() => setSuccess(null), 3000);
      } else {
        setError(result.error || 'Failed to update provider');
      }
    } else {
      // Add new
      const result = addProvider(provider);
      if (result.success) {
        setSuccess('Provider added successfully');
        setIsAdding(false);
        setTimeout(() => setSuccess(null), 3000);
        
        // Dispatch custom event for provider-added
        window.dispatchEvent(new CustomEvent('provider-added'));
      } else {
        setError(result.error || 'Failed to add provider');
      }
    }
  };

  const handleCancel = () => {
    setIsAdding(false);
    setEditingId(null);
    setError(null);
  };

  const editingProvider = editingId ? providers.find((p) => p.id === editingId) : undefined;

  const handleToggleSyncToGoogleDrive = () => {
    if (!settings.syncToGoogleDrive) {
      setShowWarning(true);
    } else {
      // Disable sync
      setSettings({ ...settings, syncToGoogleDrive: false });
      setSuccess('Google Drive sync disabled');
      setTimeout(() => setSuccess(null), 3000);
    }
  };

  const handleConfirmSync = async () => {
    setShowWarning(false);
    setSettings({ ...settings, syncToGoogleDrive: true });
    
    // Save current settings to Google Drive
    try {
      await saveToGoogleDrive();
      setSuccess('Google Drive sync enabled and settings saved');
      setTimeout(() => setSuccess(null), 3000);
    } catch (err: any) {
      setError('Failed to save to Google Drive: ' + err.message);
      setTimeout(() => setError(null), 5000);
    }
  };

  const handleLoadFromGoogleDrive = async () => {
    try {
      setIsLoadingFromDrive(true);
      await loadFromGoogleDrive();
      setSuccess('Settings loaded from Google Drive');
      setTimeout(() => setSuccess(null), 3000);
    } catch (err: any) {
      setError('Failed to load from Google Drive: ' + err.message);
      setTimeout(() => setError(null), 5000);
    } finally {
      setIsLoadingFromDrive(false);
    }
  };

  const handleClearSettings = () => {
    if (window.confirm('⚠️ Are you sure you want to clear ALL settings? This will remove all configured providers and API keys. This action cannot be undone.')) {
      clearSettings();
      setSuccess('All settings cleared');
      setTimeout(() => setSuccess(null), 3000);
    }
  };

  const showLoadButton = providers.length === 0 || (providers.length === 1 && !providers[0].apiKey);

  return (
    <div className="space-y-4">
      {/* Google Drive Sync Section */}
      <div className="p-4 bg-gray-800 rounded-lg border border-gray-700">
        <div className="flex items-start gap-3">
          <div className="flex-1">
            <label className="flex items-center gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={settings.syncToGoogleDrive || false}
                onChange={handleToggleSyncToGoogleDrive}
                className="w-5 h-5 text-blue-600 rounded focus:ring-2 focus:ring-blue-500"
              />
              <div>
                <div className="font-medium text-white">
                  💾 Save Credentials to Google Drive
                </div>
                <div className="text-sm text-gray-400 mt-1">
                  Automatically sync your provider settings and API keys to Google Drive for backup and cross-device access
                </div>
              </div>
            </label>
          </div>
          
          <div className="flex gap-2">
            {showLoadButton && (
              <button
                onClick={handleLoadFromGoogleDrive}
                disabled={isLoadingFromDrive}
                className="px-3 py-1 bg-green-600 text-white rounded hover:bg-green-700 transition-colors text-sm disabled:opacity-50"
                title="Load settings from Google Drive"
              >
                {isLoadingFromDrive ? '⏳' : '📥'} Load
              </button>
            )}
            <button
              onClick={handleClearSettings}
              className="px-3 py-1 bg-red-600 text-white rounded hover:bg-red-700 transition-colors text-sm"
              title="Clear all settings"
            >
              🗑️ Clear
            </button>
          </div>
        </div>
        
        {settings.syncToGoogleDrive && (
          <div className="mt-3 p-3 bg-green-900/20 border border-green-700/50 rounded text-sm text-green-400">
            ✓ Settings are automatically syncing to Google Drive folder: <span className="font-mono">Research Agent</span>
          </div>
        )}
      </div>

      {/* Warning Dialog */}
      {showWarning && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-75 p-4">
          <div className="card max-w-md w-full p-6 bg-gray-900 border-2 border-yellow-600">
            <div className="flex items-start gap-3 mb-4">
              <div className="text-3xl">⚠️</div>
              <div>
                <h3 className="text-xl font-bold text-white mb-2">Security Warning</h3>
                <p className="text-gray-300 mb-3">
                  You are about to save <strong className="text-yellow-400">sensitive data</strong> (API keys and provider credentials) to a document in your Google Drive.
                </p>
                <ul className="space-y-2 text-sm text-gray-400 mb-4">
                  <li>✓ File will be stored in folder: <span className="font-mono text-white">Research Agent</span></li>
                  <li>✓ File name: <span className="font-mono text-white">Research Agent Settings</span></li>
                  <li>✓ Only you have access (not shared publicly)</li>
                  <li>⚠️ Contains API keys in plain text</li>
                  <li>⚠️ Ensure your Google account is secure (2FA recommended)</li>
                </ul>
              </div>
            </div>
            
            <div className="flex gap-3">
              <button
                onClick={handleConfirmSync}
                className="flex-1 px-4 py-2 bg-yellow-600 text-white rounded-lg hover:bg-yellow-700 transition-colors font-medium"
              >
                I Understand, Enable Sync
              </button>
              <button
                onClick={() => setShowWarning(false)}
                className="px-4 py-2 bg-gray-700 text-white rounded-lg hover:bg-gray-600 transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Header */}
      <div className="flex justify-between items-center">
        <h3 className="text-lg font-semibold text-white">Configured Providers</h3>
        {!isAdding && !editingId && (
          <button
            onClick={handleAdd}
            className="px-3 py-1 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors text-sm"
          >
            + Add Provider
          </button>
        )}
      </div>

      {/* Success/Error Messages */}
      {success && (
        <div className="p-3 bg-green-900/30 border border-green-700 rounded-lg">
          <p className="text-sm text-green-400">✓ {success}</p>
        </div>
      )}
      {error && (
        <div className="p-3 bg-red-900/30 border border-red-700 rounded-lg">
          <p className="text-sm text-red-400">✗ {error}</p>
        </div>
      )}

      {/* Add/Edit Form */}
      {(isAdding || editingId) && (
        <div className="p-4 bg-gray-800 rounded-lg border border-gray-700">
          <h4 className="text-md font-medium text-white mb-4">
            {editingId ? 'Edit Provider' : 'Add Provider'}
          </h4>
          <ProviderForm
            initialProvider={editingProvider}
            onSave={handleSave}
            onCancel={handleCancel}
          />
        </div>
      )}

      {/* Provider List - Hidden when editing */}
      {!isAdding && !editingId && (
        <>
          {providers.length === 0 ? (
            <div className="p-6 bg-gray-800 rounded-lg border border-gray-700 text-center">
              <p className="text-gray-400">No providers configured yet</p>
              <p className="text-sm text-gray-500 mt-2">
                Click "Add Provider" to configure your first LLM provider
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {providers.map((provider) => {
                const info = PROVIDER_INFO[provider.type];
                return (
                  <div
                    key={provider.id}
                    className={`p-4 rounded-lg border transition-colors ${
                      provider.enabled !== false
                        ? 'bg-gray-800 border-gray-700 hover:border-gray-600'
                        : 'bg-gray-900 border-gray-800 hover:border-gray-700 opacity-60'
                    }`}
                  >
                    {/* Provider Header with Actions */}
                    <div className="flex justify-between items-center mb-3">
                      <div className="flex items-center gap-2">
                        <span className="text-xl">{info.icon}</span>
                        <span className={`font-medium ${provider.enabled !== false ? 'text-white' : 'text-gray-500'}`}>
                          {info.name}
                        </span>
                        {provider.enabled === false && (
                          <span className="px-2 py-0.5 text-xs bg-gray-700 text-gray-400 rounded">
                            Disabled
                          </span>
                        )}
                      </div>

                      {/* Action Buttons - Now on top */}
                      <div className="flex gap-2 items-center">
                        {/* Enable/Disable Toggle */}
                        <button
                          onClick={() => {
                            const isEnabled = provider.enabled !== false; // Default to true if undefined
                            updateProvider(provider.id, { ...provider, enabled: !isEnabled });
                            setSuccess(isEnabled ? 'Provider disabled' : 'Provider enabled');
                            setTimeout(() => setSuccess(null), 2000);
                          }}
                          className={`px-3 py-1 rounded transition-colors text-sm font-medium ${
                            provider.enabled !== false 
                              ? 'bg-green-600 hover:bg-green-700 text-white' 
                              : 'bg-gray-600 hover:bg-gray-500 text-gray-300'
                          }`}
                          title={provider.enabled !== false ? 'Click to disable' : 'Click to enable'}
                        >
                          {provider.enabled !== false ? '✓' : '✗'}
                        </button>
                        
                        <button
                          onClick={() => handleEdit(provider.id)}
                          className="px-3 py-1 bg-gray-700 text-white rounded hover:bg-gray-600 transition-colors text-sm"
                          title="Edit provider"
                        >
                          Edit
                        </button>
                        <button
                          onClick={() => handleDelete(provider.id)}
                          className="px-3 py-1 bg-red-700 text-white rounded hover:bg-red-600 transition-colors text-sm"
                          title="Delete provider"
                        >
                          Delete
                        </button>
                      </div>
                    </div>

                    {/* Provider Details */}
                    <div className="space-y-1 text-sm">
                      <div className="flex items-start gap-2">
                        <span className="text-gray-400 min-w-[80px]">Endpoint:</span>
                        <span className="text-gray-300 break-all">{provider.apiEndpoint}</span>
                      </div>
                      {provider.modelName && (
                        <div className="flex items-start gap-2">
                          <span className="text-gray-400 min-w-[80px]">Model:</span>
                          <span className="text-gray-300">{provider.modelName}</span>
                        </div>
                      )}
                      {provider.rateLimitTPM && (
                        <div className="flex items-start gap-2">
                          <span className="text-gray-400 min-w-[80px]">Rate Limit:</span>
                          <span className="text-gray-300">{provider.rateLimitTPM.toLocaleString()} TPM</span>
                        </div>
                      )}
                      <div className="flex items-start gap-2">
                        <span className="text-gray-400 min-w-[80px]">API Key:</span>
                        <span className="text-gray-300 font-mono">{maskApiKey(provider.apiKey)}</span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}

      {/* Info Text */}
      {!isAdding && !editingId && (
        <div className="p-4 bg-blue-900/20 border border-blue-700/50 rounded-lg">
          <h4 className="text-sm font-medium text-blue-400 mb-2">ℹ️ How Provider Selection Works:</h4>
          <ul className="space-y-1 text-sm text-gray-400">
            <li>• Free tier providers (🆓) are used first</li>
            <li>• Paid providers (💰) are used when free tier rate limits are exceeded</li>
            <li>• The backend automatically selects the best model for each request</li>
            <li>• No need to configure rate limits or priorities - it's all automatic!</li>
          </ul>
        </div>
      )}
    </div>
  );
}
