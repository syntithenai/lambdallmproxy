/**
 * TTS Playback Dialog
 * 
 * Reusable dialog for adjusting TTS playback settings (rate, pitch, volume)
 * Can be triggered from any TTS playback location in the app
 */

import React from 'react';
import { useTTS } from '../contexts/TTSContext';

interface TTSPlaybackDialogProps {
  isOpen: boolean;
  onClose: () => void;
}

export const TTSPlaybackDialog: React.FC<TTSPlaybackDialogProps> = ({ isOpen, onClose }) => {
  const { state, setRate, setVolume } = useTTS();

  if (!isOpen) return null;

  // Show actual active provider when playing, otherwise show selected provider
  const displayProvider = state.isPlaying && state.activeProvider
    ? state.activeProvider  // Show actual provider that's speaking
    : state.currentProvider; // Show selected provider when idle

  return (
    <>
      {/* Backdrop */}
      <div 
        className="fixed inset-0 bg-black/50 z-40 backdrop-blur-sm"
        onClick={onClose}
      />
      
      {/* Dialog */}
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 pointer-events-none">
        <div 
          className="bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-md w-full pointer-events-auto"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 dark:border-gray-700">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
              Playback Settings
            </h3>
            <button
              onClick={onClose}
              className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
              aria-label="Close dialog"
            >
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          {/* Content */}
          <div className="px-6 py-6 space-y-6">
            {/* Info Note - Always show positive message */}
            <div className="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg p-3">
              <p className="text-sm text-green-800 dark:text-green-200">
                ✨ Rate and volume adjust in real-time during playback!
              </p>
            </div>

            {/* Speed Control */}
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Speed: {state.rate.toFixed(1)}x
              </label>
              <input
                type="range"
                min="0.5"
                max="2.0"
                step="0.1"
                value={state.rate}
                onChange={(e) => setRate(parseFloat(e.target.value))}
                disabled={false}
                className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer dark:bg-gray-700"
              />
              <div className="flex justify-between text-xs text-gray-500 dark:text-gray-400 mt-1">
                <span>0.5x Slower</span>
                <span>1.0x Normal</span>
                <span>2.0x Faster</span>
              </div>
            </div>

            {/* Volume Control */}
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Volume: {Math.round(state.volume * 100)}%
              </label>
              <input
                type="range"
                min="0"
                max="1"
                step="0.05"
                value={state.volume}
                onChange={(e) => setVolume(parseFloat(e.target.value))}
                disabled={false}
                className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer dark:bg-gray-700"
              />
              <div className="flex justify-between text-xs text-gray-500 dark:text-gray-400 mt-1">
                <span>0% Muted</span>
                <span>50%</span>
                <span>100% Max</span>
              </div>
            </div>

            {/* Current Provider Info */}
            <div className="pt-4 border-t border-gray-200 dark:border-gray-700">
                        <div className="settings-group">
            <label className="settings-label">
              {state.isPlaying ? 'Playing with: ' : 'Selected provider: '}
              <span className="settings-value">{displayProvider}</span>
            </label>
          </div>
            </div>
          </div>

          {/* Footer */}
          <div className="px-6 py-4 bg-gray-50 dark:bg-gray-900 rounded-b-lg flex justify-end">
            <button
              onClick={onClose}
              className="px-4 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors"
            >
              Done
            </button>
          </div>
        </div>
      </div>
    </>
  );
};
