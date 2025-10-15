import React, { useState, useEffect } from 'react';
import type { BrowserFeatureConfig, BrowserFeaturePermissions, BrowserFeatureType, RiskLevel } from '../services/clientTools';
import { ExecutionHistoryPanel } from './ExecutionHistoryPanel';
import { ConfirmDialog } from './ConfirmDialog';

// Default permissions (all disabled)
const DEFAULT_PERMISSIONS: BrowserFeaturePermissions = {
  javascript: false,
  storage_read: false,
  storage_write: false,
  clipboard_read: false,
  clipboard_write: false,
  notification: false,
  geolocation: false,
  file_read: false,
  screenshot: false,
  dom_query: false,
  dom_manipulate: false
};

// Default config
const DEFAULT_CONFIG: BrowserFeatureConfig = {
  permissions: DEFAULT_PERMISSIONS,
  codeReviewMode: 'always',
  autoApproveTimeout: 30
};

// Feature metadata
interface FeatureMetadata {
  name: string;
  description: string;
  riskLevel: RiskLevel;
}

const FEATURE_METADATA: Record<BrowserFeatureType, FeatureMetadata> = {
  javascript: {
    name: 'JavaScript Execution',
    description: 'Execute arbitrary JavaScript code (sandboxed)',
    riskLevel: 'high'
  },
  dom_manipulate: {
    name: 'DOM Manipulation',
    description: 'Modify page elements and content',
    riskLevel: 'high'
  },
  storage_write: {
    name: 'Storage Write',
    description: 'Write to localStorage/sessionStorage',
    riskLevel: 'medium'
  },
  file_read: {
    name: 'File Reading',
    description: 'Read local files (requires user selection)',
    riskLevel: 'medium'
  },
  geolocation: {
    name: 'Geolocation',
    description: 'Access device location',
    riskLevel: 'medium'
  },
  storage_read: {
    name: 'Storage Read',
    description: 'Read from localStorage/sessionStorage',
    riskLevel: 'low'
  },
  clipboard_read: {
    name: 'Clipboard Read',
    description: 'Read clipboard contents',
    riskLevel: 'low'
  },
  clipboard_write: {
    name: 'Clipboard Write',
    description: 'Write to clipboard',
    riskLevel: 'low'
  },
  notification: {
    name: 'Notifications',
    description: 'Show browser notifications',
    riskLevel: 'low'
  },
  screenshot: {
    name: 'Screenshots',
    description: 'Capture page screenshots',
    riskLevel: 'low'
  },
  dom_query: {
    name: 'DOM Query',
    description: 'Query page elements (read-only)',
    riskLevel: 'low'
  }
};

// Storage key
const CONFIG_STORAGE_KEY = 'browser_features_config';

/**
 * Load config from localStorage
 */
function loadConfig(): BrowserFeatureConfig {
  try {
    const stored = localStorage.getItem(CONFIG_STORAGE_KEY);
    if (!stored) return DEFAULT_CONFIG;
    return { ...DEFAULT_CONFIG, ...JSON.parse(stored) };
  } catch (error) {
    console.error('Failed to load browser features config:', error);
    return DEFAULT_CONFIG;
  }
}

/**
 * Save config to localStorage
 */
function saveConfig(config: BrowserFeatureConfig): void {
  try {
    localStorage.setItem(CONFIG_STORAGE_KEY, JSON.stringify(config));
  } catch (error) {
    console.error('Failed to save browser features config:', error);
  }
}

/**
 * Browser Features Settings Component
 */
export const BrowserFeaturesSettings: React.FC = () => {
  const [config, setConfig] = useState<BrowserFeatureConfig>(loadConfig());
  const [showHistory, setShowHistory] = useState(false);
  const [confirmDialog, setConfirmDialog] = useState<{
    isOpen: boolean;
    feature: BrowserFeatureType | null;
  }>({ isOpen: false, feature: null });

  // Auto-save config changes
  useEffect(() => {
    saveConfig(config);
  }, [config]);

  const handleToggleFeature = (feature: BrowserFeatureType, enabled: boolean) => {
    const metadata = FEATURE_METADATA[feature];
    
    // Show warning for high/medium risk features
    if (enabled && (metadata.riskLevel === 'high' || metadata.riskLevel === 'medium')) {
      setConfirmDialog({ isOpen: true, feature });
    } else {
      setConfig({
        ...config,
        permissions: {
          ...config.permissions,
          [feature]: enabled
        }
      });
    }
  };

  const handleConfirmEnable = () => {
    if (confirmDialog.feature) {
      setConfig({
        ...config,
        permissions: {
          ...config.permissions,
          [confirmDialog.feature]: true
        }
      });
    }
    setConfirmDialog({ isOpen: false, feature: null });
  };

  const handleCancelEnable = () => {
    setConfirmDialog({ isOpen: false, feature: null });
  };

  const riskBadgeStyles: Record<RiskLevel, string> = {
    high: 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200',
    medium: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200',
    low: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200'
  };

  // Group features by risk level
  const highRiskFeatures = Object.entries(FEATURE_METADATA).filter(([_, meta]) => meta.riskLevel === 'high');
  const mediumRiskFeatures = Object.entries(FEATURE_METADATA).filter(([_, meta]) => meta.riskLevel === 'medium');
  const lowRiskFeatures = Object.entries(FEATURE_METADATA).filter(([_, meta]) => meta.riskLevel === 'low');

  return (
    <div className="space-y-6">
      {/* Security Warning */}
      <div className="bg-red-50 dark:bg-red-900/20 border-2 border-red-200 dark:border-red-800 rounded-lg p-4">
        <div className="flex items-start gap-3">
          <span className="text-2xl">⚠️</span>
          <div>
            <h4 className="font-semibold text-red-900 dark:text-red-200 mb-2">
              Security Warning
            </h4>
            <p className="text-sm text-red-800 dark:text-red-300 mb-2">
              Browser features allow AI to execute code and access browser APIs. This can be powerful but also risky.
            </p>
            <ul className="text-sm text-red-800 dark:text-red-300 space-y-1 list-disc list-inside">
              <li>Always review code before approval</li>
              <li>Only enable features you understand</li>
              <li>High-risk features require explicit approval</li>
              <li>All executions are logged in history</li>
            </ul>
          </div>
        </div>
      </div>

      {/* Code Review Mode */}
      <div>
        <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-3">
          Code Review Mode
        </h3>
        <div className="space-y-2">
          <label className="flex items-center gap-3 cursor-pointer p-3 rounded-lg border border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors">
            <input
              type="radio"
              name="reviewMode"
              value="always"
              checked={config.codeReviewMode === 'always'}
              onChange={() => setConfig({ ...config, codeReviewMode: 'always' })}
              className="w-4 h-4 text-blue-600"
            />
            <div>
              <div className="font-medium text-gray-900 dark:text-gray-100">
                ✓ Always Review (Recommended)
              </div>
              <div className="text-sm text-gray-600 dark:text-gray-400">
                Review all code before execution
              </div>
            </div>
          </label>

          <label className="flex items-center gap-3 cursor-pointer p-3 rounded-lg border border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors">
            <input
              type="radio"
              name="reviewMode"
              value="risky-only"
              checked={config.codeReviewMode === 'risky-only'}
              onChange={() => setConfig({ ...config, codeReviewMode: 'risky-only' })}
              className="w-4 h-4 text-blue-600"
            />
            <div>
              <div className="font-medium text-gray-900 dark:text-gray-100">
                ⚡ Review High-Risk Only
              </div>
              <div className="text-sm text-gray-600 dark:text-gray-400">
                Auto-approve low-risk operations
              </div>
            </div>
          </label>

          <label className="flex items-center gap-3 cursor-pointer p-3 rounded-lg border border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors">
            <input
              type="radio"
              name="reviewMode"
              value="timeout"
              checked={config.codeReviewMode === 'timeout'}
              onChange={() => setConfig({ ...config, codeReviewMode: 'timeout' })}
              className="w-4 h-4 text-blue-600"
            />
            <div className="flex-1">
              <div className="font-medium text-gray-900 dark:text-gray-100">
                ⏱️ Auto-Approve After Timeout
              </div>
              <div className="text-sm text-gray-600 dark:text-gray-400 mb-2">
                Show dialog but auto-approve if no response
              </div>
              {config.codeReviewMode === 'timeout' && (
                <div className="flex items-center gap-3 mt-2">
                  <input
                    type="range"
                    min="5"
                    max="120"
                    step="5"
                    value={config.autoApproveTimeout}
                    onChange={(e) => setConfig({ ...config, autoApproveTimeout: Number(e.target.value) })}
                    className="flex-1"
                  />
                  <span className="text-sm font-mono text-gray-700 dark:text-gray-300 min-w-[4rem]">
                    {config.autoApproveTimeout}s
                  </span>
                </div>
              )}
            </div>
          </label>
        </div>
      </div>

      {/* Feature Toggles */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
            Enabled Features
          </h3>
          <button
            onClick={() => setShowHistory(true)}
            className="text-sm text-blue-600 dark:text-blue-400 hover:underline"
          >
            View Execution History →
          </button>
        </div>

        {/* High Risk Features */}
        {highRiskFeatures.length > 0 && (
          <div className="mb-4">
            <h4 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">
              High Risk Features
            </h4>
            <div className="space-y-2">
              {highRiskFeatures.map(([feature, metadata]) => (
                <label
                  key={feature}
                  className="flex items-center justify-between p-3 rounded-lg border border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors cursor-pointer"
                >
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="font-medium text-gray-900 dark:text-gray-100">
                        {metadata.name}
                      </span>
                      <span className={`px-2 py-0.5 rounded text-xs font-medium uppercase ${riskBadgeStyles[metadata.riskLevel]}`}>
                        {metadata.riskLevel}
                      </span>
                    </div>
                    <p className="text-sm text-gray-600 dark:text-gray-400">
                      {metadata.description}
                    </p>
                  </div>
                  <input
                    type="checkbox"
                    checked={config.permissions[feature as BrowserFeatureType]}
                    onChange={(e) => handleToggleFeature(feature as BrowserFeatureType, e.target.checked)}
                    className="w-5 h-5 text-blue-600 rounded focus:ring-2 focus:ring-blue-500"
                  />
                </label>
              ))}
            </div>
          </div>
        )}

        {/* Medium Risk Features */}
        {mediumRiskFeatures.length > 0 && (
          <div className="mb-4">
            <h4 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">
              Medium Risk Features
            </h4>
            <div className="space-y-2">
              {mediumRiskFeatures.map(([feature, metadata]) => (
                <label
                  key={feature}
                  className="flex items-center justify-between p-3 rounded-lg border border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors cursor-pointer"
                >
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="font-medium text-gray-900 dark:text-gray-100">
                        {metadata.name}
                      </span>
                      <span className={`px-2 py-0.5 rounded text-xs font-medium uppercase ${riskBadgeStyles[metadata.riskLevel]}`}>
                        {metadata.riskLevel}
                      </span>
                    </div>
                    <p className="text-sm text-gray-600 dark:text-gray-400">
                      {metadata.description}
                    </p>
                  </div>
                  <input
                    type="checkbox"
                    checked={config.permissions[feature as BrowserFeatureType]}
                    onChange={(e) => handleToggleFeature(feature as BrowserFeatureType, e.target.checked)}
                    className="w-5 h-5 text-blue-600 rounded focus:ring-2 focus:ring-blue-500"
                  />
                </label>
              ))}
            </div>
          </div>
        )}

        {/* Low Risk Features */}
        {lowRiskFeatures.length > 0 && (
          <div>
            <h4 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">
              Low Risk Features
            </h4>
            <div className="space-y-2">
              {lowRiskFeatures.map(([feature, metadata]) => (
                <label
                  key={feature}
                  className="flex items-center justify-between p-3 rounded-lg border border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors cursor-pointer"
                >
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="font-medium text-gray-900 dark:text-gray-100">
                        {metadata.name}
                      </span>
                      <span className={`px-2 py-0.5 rounded text-xs font-medium uppercase ${riskBadgeStyles[metadata.riskLevel]}`}>
                        {metadata.riskLevel}
                      </span>
                    </div>
                    <p className="text-sm text-gray-600 dark:text-gray-400">
                      {metadata.description}
                    </p>
                  </div>
                  <input
                    type="checkbox"
                    checked={config.permissions[feature as BrowserFeatureType]}
                    onChange={(e) => handleToggleFeature(feature as BrowserFeatureType, e.target.checked)}
                    className="w-5 h-5 text-blue-600 rounded focus:ring-2 focus:ring-blue-500"
                  />
                </label>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Execution History Panel */}
      {showHistory && (
        <ExecutionHistoryPanel onClose={() => setShowHistory(false)} />
      )}

      {/* Confirm Dialog for High/Medium Risk Features */}
      {confirmDialog.feature && (
        <ConfirmDialog
          isOpen={confirmDialog.isOpen}
          title="Enable Risky Feature?"
          message={`Are you sure you want to enable "${FEATURE_METADATA[confirmDialog.feature].name}"? This is a ${FEATURE_METADATA[confirmDialog.feature].riskLevel}-risk feature that requires careful review before execution.`}
          confirmLabel="Enable"
          cancelLabel="Cancel"
          variant="warning"
          onConfirm={handleConfirmEnable}
          onCancel={handleCancelEnable}
        />
      )}
    </div>
  );
};

/**
 * Export config loader for use in other components
 */
export { loadConfig as loadBrowserFeaturesConfig };
