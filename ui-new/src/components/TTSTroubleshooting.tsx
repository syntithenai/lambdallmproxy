/**
 * TTS Troubleshooting Component
 * 
 * Standalone troubleshooting guide for TTS issues
 * Can be embedded in help sections or error states
 */

import React from 'react';
import { useTTS } from '../contexts/TTSContext';

interface TTSTroubleshootingProps {
  compact?: boolean;
  showTitle?: boolean;
  className?: string;
}

export const TTSTroubleshooting: React.FC<TTSTroubleshootingProps> = ({ 
  compact = false, 
  showTitle = true,
  className = '' 
}) => {
  const { state } = useTTS();

  if (compact) {
    return (
      <div className={`bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg p-4 ${className}`}>
        {showTitle && (
          <h4 className="text-sm font-semibold text-amber-800 dark:text-amber-200 mb-2 flex items-center gap-2">
            <span>🔧</span> TTS Button Stuck?
          </h4>
        )}
        <div className="text-sm text-amber-700 dark:text-amber-300 space-y-1">
          <p><strong>Quick fixes:</strong></p>
          <ul className="list-disc list-inside ml-2 space-y-0.5">
            <li>Wait 30 seconds for auto-reset</li>
            <li>Refresh page (Ctrl+F5)</li>
            <li>Try Chrome or Firefox</li>
            <li>Switch TTS provider in settings</li>
          </ul>
        </div>
      </div>
    );
  }

  return (
    <div className={`bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-6 ${className}`}>
      {showTitle && (
        <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4 flex items-center gap-2">
          <span>🔧</span> TTS Troubleshooting Guide
        </h3>
      )}

      <div className="space-y-6">
        {/* Current Status */}
        <div className="bg-gray-50 dark:bg-gray-900 rounded-lg p-4">
          <h4 className="font-medium text-gray-900 dark:text-gray-100 mb-3">Current Status</h4>
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <span className="text-gray-600 dark:text-gray-400">Provider:</span>
              <span className="ml-2 font-mono">{state.currentProvider}</span>
            </div>
            <div>
              <span className="text-gray-600 dark:text-gray-400">Status:</span>
              <span className={`ml-2 ${state.isPlaying ? 'text-red-600' : 'text-green-600'}`}>
                {state.isPlaying ? '🔴 Playing' : '⚫ Stopped'}
              </span>
            </div>
            <div>
              <span className="text-gray-600 dark:text-gray-400">Voice:</span>
              <span className="ml-2 font-mono">{state.currentVoice || 'Default'}</span>
            </div>
            <div>
              <span className="text-gray-600 dark:text-gray-400">Browser:</span>
              <span className="ml-2">
                {navigator.userAgent.includes('Chrome') ? 'Chrome ✅' : 
                 navigator.userAgent.includes('Firefox') ? 'Firefox ✅' : 
                 navigator.userAgent.includes('Safari') ? 'Safari ⚠️' : 'Other ❓'}
              </span>
            </div>
          </div>
        </div>

        {/* Red Button Issue */}
        <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-4">
          <h4 className="font-medium text-red-800 dark:text-red-200 mb-3 flex items-center gap-2">
            🚨 Stop Button Stuck Red?
          </h4>
          <div className="text-sm text-red-700 dark:text-red-300">
            <p className="mb-2">This happens when the browser's speech synthesis doesn't properly notify us that speech has ended. Try these solutions in order:</p>
            <ol className="list-decimal list-inside space-y-1 ml-2">
              <li><strong>Wait 30 seconds</strong> - The system has an automatic timeout that will reset the button</li>
              <li><strong>Click stop again</strong> - Sometimes a second click forces the reset</li>
              <li><strong>Refresh the page</strong> - Use Ctrl+F5 (Windows) or Cmd+R (Mac) for a hard refresh</li>
              <li><strong>Switch browsers</strong> - Chrome and Firefox have the most reliable TTS support</li>
              <li><strong>Change TTS provider</strong> - Go to Settings → TTS and try a different provider</li>
              <li><strong>Check console</strong> - Press F12 and look for error messages in the Console tab</li>
            </ol>
          </div>
        </div>

        {/* Browser Compatibility */}
        <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4">
          <h4 className="font-medium text-blue-800 dark:text-blue-200 mb-3">🌐 Browser Compatibility</h4>
          <div className="text-sm text-blue-700 dark:text-blue-300 space-y-2">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <h5 className="font-medium mb-1">✅ Best Support</h5>
                <ul className="text-xs space-y-0.5">
                  <li>• Chrome 70+</li>
                  <li>• Firefox 62+</li>
                  <li>• Edge 79+</li>
                </ul>
              </div>
              <div>
                <h5 className="font-medium mb-1">⚠️ Limited Support</h5>
                <ul className="text-xs space-y-0.5">
                  <li>• Safari (inconsistent)</li>
                  <li>• Mobile browsers</li>
                  <li>• Older versions</li>
                </ul>
              </div>
              <div>
                <h5 className="font-medium mb-1">❌ No Support</h5>
                <ul className="text-xs space-y-0.5">
                  <li>• Internet Explorer</li>
                  <li>• Very old browsers</li>
                  <li>• Some mobile apps</li>
                </ul>
              </div>
            </div>
          </div>
        </div>

        {/* Provider Recommendations */}
        <div className="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg p-4">
          <h4 className="font-medium text-green-800 dark:text-green-200 mb-3">💡 Provider Recommendations</h4>
          <div className="text-sm text-green-700 dark:text-green-300 space-y-2">
            <div className="space-y-2">
              <div>
                <strong>For Maximum Reliability:</strong> Use "Browser Speech" - it's built into your browser and most consistent
              </div>
              <div>
                <strong>For Best Quality:</strong> Use LLM providers (OpenAI, Groq) or ElevenLabs - requires API keys but much better voices
              </div>
              <div>
                <strong>System Fallbacks:</strong> The app automatically tries multiple providers if one fails
              </div>
            </div>
          </div>
        </div>

        {/* Advanced Tips */}
        <div className="bg-purple-50 dark:bg-purple-900/20 border border-purple-200 dark:border-purple-800 rounded-lg p-4">
          <h4 className="font-medium text-purple-800 dark:text-purple-200 mb-3">⚡ Advanced Tips</h4>
          <div className="text-sm text-purple-700 dark:text-purple-300">
            <ul className="space-y-1">
              <li>• <strong>Long text:</strong> Enable auto-summarize for better speech experience</li>
              <li>• <strong>Performance:</strong> Close other tabs using audio/video for better TTS performance</li>
              <li>• <strong>Debugging:</strong> Open browser console (F12) to see detailed error messages</li>
              <li>• <strong>API issues:</strong> Check your API key validity and account credits</li>
              <li>• <strong>Network:</strong> Ensure stable internet connection for cloud TTS providers</li>
            </ul>
          </div>
        </div>

        {/* System Info */}
        <div className="bg-gray-50 dark:bg-gray-900 rounded-lg p-4">
          <h4 className="font-medium text-gray-900 dark:text-gray-100 mb-3">🔍 System Information</h4>
          <div className="text-xs text-gray-600 dark:text-gray-400 space-y-1">
            <div>Browser: {navigator.userAgent}</div>
            <div>Speech Synthesis Available: {'speechSynthesis' in window ? 'Yes' : 'No'}</div>
            <div>Current Time: {new Date().toISOString()}</div>
            <div>TTS Implementation: Multi-layer with polling detection and 30s timeout fallback</div>
          </div>
        </div>
      </div>
    </div>
  );
};