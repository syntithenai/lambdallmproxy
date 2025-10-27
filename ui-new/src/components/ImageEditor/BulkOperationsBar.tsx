import React from 'react';
import type { BulkOperation } from './types';

interface BulkOperationsBarProps {
  selectedCount: number;
  onOperation: (operation: BulkOperation) => void;
  disabled: boolean;
}

export const BulkOperationsBar: React.FC<BulkOperationsBarProps> = ({
  selectedCount,
  onOperation,
  disabled,
}) => {
  const buttonClass = (baseClass = '') =>
    `px-3 py-1.5 text-xs font-medium rounded transition-colors ${
      disabled || selectedCount === 0
        ? 'bg-gray-100 text-gray-400 cursor-not-allowed'
        : 'bg-gray-200 hover:bg-gray-300 text-gray-700'
    } ${baseClass}`;

  return (
    <div className="bg-white border-b border-gray-200 p-4">
      <div className="flex flex-wrap gap-4">
        {/* Resize Operations */}
        <div className="flex flex-col gap-1">
          <label className="text-xs text-gray-500 uppercase font-semibold">Resize</label>
          <div className="flex gap-1">
            <button
              onClick={() => onOperation({ type: 'resize', params: { scale: 0.25 }, label: '25%' })}
              disabled={disabled || selectedCount === 0}
              className={buttonClass()}
            >
              25%
            </button>
            <button
              onClick={() => onOperation({ type: 'resize', params: { scale: 0.5 }, label: '50%' })}
              disabled={disabled || selectedCount === 0}
              className={buttonClass()}
            >
              50%
            </button>
            <button
              onClick={() => onOperation({ type: 'resize', params: { scale: 0.75 }, label: '75%' })}
              disabled={disabled || selectedCount === 0}
              className={buttonClass()}
            >
              75%
            </button>
            <button
              onClick={() => onOperation({ type: 'resize', params: { scale: 1.5 }, label: '150%' })}
              disabled={disabled || selectedCount === 0}
              className={buttonClass()}
            >
              150%
            </button>
            <button
              onClick={() => onOperation({ type: 'resize', params: { scale: 2 }, label: '200%' })}
              disabled={disabled || selectedCount === 0}
              className={buttonClass()}
            >
              200%
            </button>
          </div>
        </div>

        {/* Rotate Operations */}
        <div className="flex flex-col gap-1">
          <label className="text-xs text-gray-500 uppercase font-semibold">Rotate</label>
          <div className="flex gap-1">
            <button
              onClick={() => onOperation({ type: 'rotate', params: { degrees: 90 }, label: '90°' })}
              disabled={disabled || selectedCount === 0}
              className={buttonClass()}
            >
              90°
            </button>
            <button
              onClick={() => onOperation({ type: 'rotate', params: { degrees: 180 }, label: '180°' })}
              disabled={disabled || selectedCount === 0}
              className={buttonClass()}
            >
              180°
            </button>
            <button
              onClick={() => onOperation({ type: 'rotate', params: { degrees: 270 }, label: '270°' })}
              disabled={disabled || selectedCount === 0}
              className={buttonClass()}
            >
              270°
            </button>
          </div>
        </div>

        {/* Flip Operations */}
        <div className="flex flex-col gap-1">
          <label className="text-xs text-gray-500 uppercase font-semibold">Flip</label>
          <div className="flex gap-1">
            <button
              onClick={() =>
                onOperation({ type: 'flip', params: { direction: 'horizontal' }, label: 'Horizontal' })
              }
              disabled={disabled || selectedCount === 0}
              className={buttonClass()}
              title="Flip Horizontal"
            >
              ↔️
            </button>
            <button
              onClick={() =>
                onOperation({ type: 'flip', params: { direction: 'vertical' }, label: 'Vertical' })
              }
              disabled={disabled || selectedCount === 0}
              className={buttonClass()}
              title="Flip Vertical"
            >
              ↕️
            </button>
          </div>
        </div>

        {/* Format Operations */}
        <div className="flex flex-col gap-1">
          <label className="text-xs text-gray-500 uppercase font-semibold">Format</label>
          <div className="flex gap-1">
            <button
              onClick={() => onOperation({ type: 'format', params: { format: 'jpg' }, label: 'JPG' })}
              disabled={disabled || selectedCount === 0}
              className={buttonClass()}
            >
              JPG
            </button>
            <button
              onClick={() => onOperation({ type: 'format', params: { format: 'png' }, label: 'PNG' })}
              disabled={disabled || selectedCount === 0}
              className={buttonClass()}
            >
              PNG
            </button>
            <button
              onClick={() => onOperation({ type: 'format', params: { format: 'webp' }, label: 'WebP' })}
              disabled={disabled || selectedCount === 0}
              className={buttonClass()}
            >
              WebP
            </button>
          </div>
        </div>

        {/* Filter Operations */}
        <div className="flex flex-col gap-1">
          <label className="text-xs text-gray-500 uppercase font-semibold">Filters</label>
          <div className="flex gap-1">
            <button
              onClick={() =>
                onOperation({ type: 'filter', params: { filter: 'grayscale' }, label: 'Grayscale' })
              }
              disabled={disabled || selectedCount === 0}
              className={buttonClass()}
              title="Grayscale"
            >
              ⚫
            </button>
            <button
              onClick={() => onOperation({ type: 'filter', params: { filter: 'sepia' }, label: 'Sepia' })}
              disabled={disabled || selectedCount === 0}
              className={buttonClass()}
              title="Sepia"
            >
              🟤
            </button>
            <button
              onClick={() => onOperation({ type: 'filter', params: { filter: 'blur' }, label: 'Blur' })}
              disabled={disabled || selectedCount === 0}
              className={buttonClass()}
              title="Blur"
            >
              🌫️
            </button>
            <button
              onClick={() => onOperation({ type: 'filter', params: { filter: 'sharpen' }, label: 'Sharpen' })}
              disabled={disabled || selectedCount === 0}
              className={buttonClass()}
              title="Sharpen"
            >
              ✨
            </button>
          </div>
        </div>
      </div>

      <div className="text-xs text-gray-500 mt-2">
        {selectedCount} image{selectedCount !== 1 ? 's' : ''} selected
      </div>
    </div>
  );
};
