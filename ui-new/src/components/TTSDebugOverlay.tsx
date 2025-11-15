/**
 * TTS Debug Overlay
 * Shows current TTS state for debugging rate/volume issues
 */

import React, { useEffect } from 'react';
import { useTTS } from '../contexts/TTSContext';

export const TTSDebugOverlay: React.FC = () => {
  const { state } = useTTS();
  const [actualProvider, setActualProvider] = React.useState<string>('none');
  
  // Poll for actual provider name from console logs or infer from state
  useEffect(() => {
    if (state.isPlaying && state.activeProvider) {
      setActualProvider(state.activeProvider);
    } else if (!state.isPlaying) {
      setActualProvider('none');
    }
  }, [state.isPlaying, state.activeProvider]);

  // Only show in development
  if (import.meta.env.PROD) return null;

  return (
    <div
      className="fixed bottom-4 right-4 bg-black/80 text-white p-3 rounded-lg text-xs font-mono z-[9999] max-w-xs"
      style={{ backdropFilter: 'blur(8px)' }}
    >
      <div className="font-bold mb-2 text-yellow-400">🎙️ TTS Debug</div>
      <div className="space-y-1">
        <div>
          <span className="text-gray-400">Selected:</span>{' '}
          <span className="text-purple-400">{state.currentProvider}</span>
        </div>
        <div>
          <span className="text-gray-400">Actual:</span>{' '}
          <span className={actualProvider !== 'none' ? 'text-green-400 font-bold' : 'text-red-400'}>
            {actualProvider}
          </span>
        </div>
        <div>
          <span className="text-gray-400">Playing:</span>{' '}
          <span className={state.isPlaying ? 'text-green-400' : 'text-gray-400'}>
            {state.isPlaying ? 'YES' : 'no'}
          </span>
        </div>
        <div className="pt-1 border-t border-gray-700">
          <span className="text-gray-400">Rate:</span>{' '}
          <span className="text-blue-400 font-bold">{state.rate.toFixed(1)}x</span>
        </div>
        <div>
          <span className="text-gray-400">Volume:</span>{' '}
          <span className="text-blue-400 font-bold">{Math.round(state.volume * 100)}%</span>
        </div>
        <div>
          <span className="text-gray-400">Boundary:</span>{' '}
          <span className={state.boundarySupported ? 'text-green-400' : 'text-yellow-400'}>
            {state.boundarySupported ? '✓ Live restart' : '⚠ Next chunk'}
          </span>
        </div>
        {!state.boundarySupported && state.isPlaying && (
          <div className="mt-2 pt-2 border-t border-yellow-700 bg-yellow-900/20 -mx-3 px-3 py-2">
            <div className="text-yellow-300 text-[10px] leading-tight">
              ⚠️ Settings changes apply on next chunk only
            </div>
          </div>
        )}
        {state.currentText && (
          <div className="mt-2 pt-2 border-t border-gray-600">
            <span className="text-gray-400">Text:</span>{' '}
            <span className="text-gray-300 text-[10px]">
              {state.currentText.substring(0, 35)}
              {state.currentText.length > 35 ? '...' : ''}
            </span>
          </div>
        )}
      </div>
    </div>
  );
};
