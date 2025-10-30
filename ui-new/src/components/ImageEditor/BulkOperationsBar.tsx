import React, { useState, useRef, useEffect } from 'react';
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
  const [openDropdown, setOpenDropdown] = useState<string | null>(null);
  const dropdownRefs = useRef<{ [key: string]: HTMLDivElement | null }>({});

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (openDropdown && dropdownRefs.current[openDropdown]) {
        const dropdownElement = dropdownRefs.current[openDropdown];
        if (dropdownElement && !dropdownElement.contains(event.target as Node)) {
          setOpenDropdown(null);
        }
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [openDropdown]);

  const buttonClass = (baseClass = '') =>
    `px-3 py-1.5 text-xs font-medium rounded transition-colors ${
      disabled || selectedCount === 0
        ? 'bg-gray-100 text-gray-400 cursor-not-allowed'
        : 'bg-gray-200 hover:bg-gray-300 text-gray-700'
    } ${baseClass}`;

  const dropdownButtonClass = (isOpen: boolean) =>
    `px-3 py-1.5 text-xs font-medium rounded transition-colors flex items-center gap-1 ${
      disabled || selectedCount === 0
        ? 'bg-gray-100 text-gray-400 cursor-not-allowed'
        : isOpen
        ? 'bg-blue-500 text-white'
        : 'bg-gray-200 hover:bg-gray-300 text-gray-700'
    }`;

  const dropdownItemClass =
    'w-full text-left px-3 py-2 text-xs hover:bg-gray-100 transition-colors border-b border-gray-100 last:border-b-0';

  const toggleDropdown = (name: string) => {
    if (disabled || selectedCount === 0) return;
    setOpenDropdown(openDropdown === name ? null : name);
  };

  const handleOperation = (operation: BulkOperation) => {
    onOperation(operation);
    setOpenDropdown(null); // Close dropdown after operation
  };

  return (
    <div className="bg-white border-b border-gray-200 p-4">
      <div className="flex flex-wrap gap-2 items-start">
        {/* Quick Access - Resize */}
        <div className="flex gap-1">
          <button
            onClick={() => handleOperation({ type: 'resize', params: { scale: 0.5 }, label: '50%' })}
            disabled={disabled || selectedCount === 0}
            className={buttonClass()}
            title="Resize to 50%"
          >
            50%
          </button>
          <button
            onClick={() => handleOperation({ type: 'resize', params: { scale: 2 }, label: '200%' })}
            disabled={disabled || selectedCount === 0}
            className={buttonClass()}
            title="Resize to 200%"
          >
            200%
          </button>
        </div>

        {/* More Sizes Dropdown */}
        <div className="relative" ref={(el) => { dropdownRefs.current['sizes'] = el; }}>
          <button
            onClick={() => toggleDropdown('sizes')}
            disabled={disabled || selectedCount === 0}
            className={dropdownButtonClass(openDropdown === 'sizes')}
          >
            More Sizes ▾
          </button>
          {openDropdown === 'sizes' && (
            <div className="absolute top-full mt-1 bg-white border border-gray-300 rounded shadow-lg z-50 min-w-[120px]">
              <button
                onClick={() => handleOperation({ type: 'resize', params: { scale: 0.25 }, label: '25%' })}
                className={dropdownItemClass}
              >
                25%
              </button>
              <button
                onClick={() => handleOperation({ type: 'resize', params: { scale: 0.33 }, label: '33%' })}
                className={dropdownItemClass}
              >
                33%
              </button>
              <button
                onClick={() => handleOperation({ type: 'resize', params: { scale: 0.75 }, label: '75%' })}
                className={dropdownItemClass}
              >
                75%
              </button>
              <button
                onClick={() => handleOperation({ type: 'resize', params: { scale: 1.5 }, label: '150%' })}
                className={dropdownItemClass}
              >
                150%
              </button>
              <button
                onClick={() => handleOperation({ type: 'resize', params: { scale: 3 }, label: '300%' })}
                className={dropdownItemClass}
              >
                300%
              </button>
              <button
                onClick={() => handleOperation({ type: 'resize', params: { scale: 4 }, label: '400%' })}
                className={dropdownItemClass}
              >
                400%
              </button>
            </div>
          )}
        </div>

        {/* Quick Access - Rotate */}
        <div className="flex gap-1">
          <button
            onClick={() => handleOperation({ type: 'rotate', params: { degrees: 90 }, label: '↻ 90°' })}
            disabled={disabled || selectedCount === 0}
            className={buttonClass()}
            title="Rotate 90° clockwise"
          >
            ↻
          </button>
          <button
            onClick={() => handleOperation({ type: 'rotate', params: { degrees: 270 }, label: '↺ 90°' })}
            disabled={disabled || selectedCount === 0}
            className={buttonClass()}
            title="Rotate 90° counter-clockwise"
          >
            ↺
          </button>
        </div>

        {/* Crop & Trim Dropdown */}
        <div className="relative" ref={(el) => { dropdownRefs.current['crop'] = el; }}>
          <button
            onClick={() => toggleDropdown('crop')}
            disabled={disabled || selectedCount === 0}
            className={dropdownButtonClass(openDropdown === 'crop')}
          >
            Crop & Trim ▾
          </button>
          {openDropdown === 'crop' && (
            <div className="absolute top-full mt-1 bg-white border border-gray-300 rounded shadow-lg z-50 min-w-[180px]">
              <button
                onClick={() => handleOperation({ type: 'trim', params: {}, label: 'Auto-trim borders' })}
                className={dropdownItemClass}
                title="Remove transparent or solid-color borders"
              >
                ✂️ Auto-trim borders
              </button>
              <button
                onClick={() =>
                  handleOperation({ type: 'autocrop', params: { focus: 'center' }, label: 'AI Crop (Center)' })
                }
                className={dropdownItemClass}
                title="AI-powered crop focusing on center subject"
              >
                🤖 AI Crop (Center)
              </button>
              <button
                onClick={() =>
                  handleOperation({ type: 'autocrop', params: { focus: 'face' }, label: 'AI Crop (Face)' })
                }
                className={dropdownItemClass}
                title="AI-powered crop focusing on face"
              >
                😊 AI Crop (Face)
              </button>
              <div className="border-t border-gray-200 my-1"></div>
              <button
                onClick={() =>
                  handleOperation({ type: 'crop', params: { width: 1920, height: 1080 }, label: '1920×1080' })
                }
                className={dropdownItemClass}
              >
                📺 1920×1080 (Full HD)
              </button>
              <button
                onClick={() =>
                  handleOperation({ type: 'crop', params: { width: 1280, height: 720 }, label: '1280×720' })
                }
                className={dropdownItemClass}
              >
                📺 1280×720 (HD)
              </button>
              <button
                onClick={() =>
                  handleOperation({ type: 'crop', params: { width: 800, height: 800 }, label: '800×800' })
                }
                className={dropdownItemClass}
              >
                ⬜ 800×800 (Square)
              </button>
            </div>
          )}
        </div>

        {/* Flip Dropdown */}
        <div className="relative" ref={(el) => { dropdownRefs.current['flip'] = el; }}>
          <button
            onClick={() => toggleDropdown('flip')}
            disabled={disabled || selectedCount === 0}
            className={dropdownButtonClass(openDropdown === 'flip')}
          >
            Flip ▾
          </button>
          {openDropdown === 'flip' && (
            <div className="absolute top-full mt-1 bg-white border border-gray-300 rounded shadow-lg z-50 min-w-[150px]">
              <button
                onClick={() =>
                  handleOperation({ type: 'flip', params: { direction: 'horizontal' }, label: 'Horizontal' })
                }
                className={dropdownItemClass}
              >
                ↔️ Horizontal
              </button>
              <button
                onClick={() =>
                  handleOperation({ type: 'flip', params: { direction: 'vertical' }, label: 'Vertical' })
                }
                className={dropdownItemClass}
              >
                ↕️ Vertical
              </button>
              <button
                onClick={() => handleOperation({ type: 'rotate', params: { degrees: 180 }, label: '180°' })}
                className={dropdownItemClass}
              >
                🔄 180° rotation
              </button>
            </div>
          )}
        </div>

        {/* Format Dropdown */}
        <div className="relative" ref={(el) => { dropdownRefs.current['format'] = el; }}>
          <button
            onClick={() => toggleDropdown('format')}
            disabled={disabled || selectedCount === 0}
            className={dropdownButtonClass(openDropdown === 'format')}
          >
            Format ▾
          </button>
          {openDropdown === 'format' && (
            <div className="absolute top-full mt-1 bg-white border border-gray-300 rounded shadow-lg z-50 min-w-[150px]">
              <button
                onClick={() =>
                  handleOperation({ type: 'format', params: { format: 'jpg', quality: 90 }, label: 'JPG (High)' })
                }
                className={dropdownItemClass}
              >
                📄 JPG (High Quality)
              </button>
              <button
                onClick={() =>
                  handleOperation({ type: 'format', params: { format: 'jpg', quality: 80 }, label: 'JPG (Medium)' })
                }
                className={dropdownItemClass}
              >
                📄 JPG (Medium)
              </button>
              <button
                onClick={() =>
                  handleOperation({ type: 'format', params: { format: 'jpg', quality: 60 }, label: 'JPG (Low)' })
                }
                className={dropdownItemClass}
              >
                📄 JPG (Low/Small)
              </button>
              <div className="border-t border-gray-200 my-1"></div>
              <button
                onClick={() => handleOperation({ type: 'format', params: { format: 'png' }, label: 'PNG' })}
                className={dropdownItemClass}
              >
                🖼️ PNG (Lossless)
              </button>
              <button
                onClick={() => handleOperation({ type: 'format', params: { format: 'webp' }, label: 'WebP' })}
                className={dropdownItemClass}
              >
                🌐 WebP (Modern)
              </button>
              <button
                onClick={() => handleOperation({ type: 'format', params: { format: 'avif' }, label: 'AVIF' })}
                className={dropdownItemClass}
              >
                ⚡ AVIF (Best Compression)
              </button>
            </div>
          )}
        </div>

        {/* Filters Dropdown */}
        <div className="relative" ref={(el) => { dropdownRefs.current['filters'] = el; }}>
          <button
            onClick={() => toggleDropdown('filters')}
            disabled={disabled || selectedCount === 0}
            className={dropdownButtonClass(openDropdown === 'filters')}
          >
            Filters ▾
          </button>
          {openDropdown === 'filters' && (
            <div className="absolute top-full mt-1 bg-white border border-gray-300 rounded shadow-lg z-50 min-w-[150px]">
              <button
                onClick={() =>
                  handleOperation({ type: 'filter', params: { filter: 'grayscale' }, label: 'Grayscale' })
                }
                className={dropdownItemClass}
              >
                ⚫ Grayscale
              </button>
              <button
                onClick={() => handleOperation({ type: 'filter', params: { filter: 'sepia' }, label: 'Sepia' })}
                className={dropdownItemClass}
              >
                🟤 Sepia
              </button>
              <button
                onClick={() => handleOperation({ type: 'filter', params: { filter: 'negate' }, label: 'Invert' })}
                className={dropdownItemClass}
              >
                🔲 Invert Colors
              </button>
              <button
                onClick={() =>
                  handleOperation({ type: 'filter', params: { filter: 'normalize' }, label: 'Normalize' })
                }
                className={dropdownItemClass}
              >
                📊 Normalize (Auto-enhance)
              </button>
              <div className="border-t border-gray-200 my-1"></div>
              <button
                onClick={() =>
                  handleOperation({ type: 'filter', params: { filter: 'blur', strength: 3 }, label: 'Blur' })
                }
                className={dropdownItemClass}
              >
                🌫️ Blur
              </button>
              <button
                onClick={() =>
                  handleOperation({ type: 'filter', params: { filter: 'sharpen' }, label: 'Sharpen' })
                }
                className={dropdownItemClass}
              >
                ✨ Sharpen
              </button>
            </div>
          )}
        </div>

        {/* Adjustments Dropdown */}
        <div className="relative" ref={(el) => { dropdownRefs.current['adjust'] = el; }}>
          <button
            onClick={() => toggleDropdown('adjust')}
            disabled={disabled || selectedCount === 0}
            className={dropdownButtonClass(openDropdown === 'adjust')}
          >
            Adjustments ▾
          </button>
          {openDropdown === 'adjust' && (
            <div className="absolute top-full mt-1 bg-white border border-gray-300 rounded shadow-lg z-50 min-w-[180px]">
              <button
                onClick={() =>
                  handleOperation({
                    type: 'modulate',
                    params: { brightness: 1.2 },
                    label: 'Brightness +20%',
                  })
                }
                className={dropdownItemClass}
              >
                ☀️ Brightness +20%
              </button>
              <button
                onClick={() =>
                  handleOperation({
                    type: 'modulate',
                    params: { brightness: 0.8 },
                    label: 'Brightness -20%',
                  })
                }
                className={dropdownItemClass}
              >
                🌙 Brightness -20%
              </button>
              <div className="border-t border-gray-200 my-1"></div>
              <button
                onClick={() =>
                  handleOperation({
                    type: 'modulate',
                    params: { saturation: 1.5 },
                    label: 'Saturation +50%',
                  })
                }
                className={dropdownItemClass}
              >
                🎨 Saturation +50%
              </button>
              <button
                onClick={() =>
                  handleOperation({
                    type: 'modulate',
                    params: { saturation: 0.5 },
                    label: 'Saturation -50%',
                  })
                }
                className={dropdownItemClass}
              >
                🎨 Saturation -50%
              </button>
              <div className="border-t border-gray-200 my-1"></div>
              <button
                onClick={() =>
                  handleOperation({ type: 'modulate', params: { hue: 90 }, label: 'Hue shift +90°' })
                }
                className={dropdownItemClass}
              >
                � Hue shift +90°
              </button>
              <button
                onClick={() =>
                  handleOperation({ type: 'tint', params: { r: 255, g: 200, b: 150 }, label: 'Warm tint' })
                }
                className={dropdownItemClass}
              >
                🔥 Warm tint
              </button>
              <button
                onClick={() =>
                  handleOperation({ type: 'tint', params: { r: 150, g: 200, b: 255 }, label: 'Cool tint' })
                }
                className={dropdownItemClass}
              >
                ❄️ Cool tint
              </button>
            </div>
          )}
        </div>

        {/* Effects Dropdown */}
        <div className="relative" ref={(el) => { dropdownRefs.current['effects'] = el; }}>
          <button
            onClick={() => toggleDropdown('effects')}
            disabled={disabled || selectedCount === 0}
            className={dropdownButtonClass(openDropdown === 'effects')}
          >
            Effects ▾
          </button>
          {openDropdown === 'effects' && (
            <div className="absolute top-full mt-1 bg-white border border-gray-300 rounded shadow-lg z-50 min-w-[180px]">
              <button
                onClick={() =>
                  handleOperation({
                    type: 'extend',
                    params: { top: 20, bottom: 20, left: 20, right: 20, background: { r: 255, g: 255, b: 255 } },
                    label: 'White border',
                  })
                }
                className={dropdownItemClass}
              >
                ⬜ White border (20px)
              </button>
              <button
                onClick={() =>
                  handleOperation({
                    type: 'extend',
                    params: { top: 20, bottom: 20, left: 20, right: 20, background: { r: 0, g: 0, b: 0 } },
                    label: 'Black border',
                  })
                }
                className={dropdownItemClass}
              >
                ⬛ Black border (20px)
              </button>
              <button
                onClick={() =>
                  handleOperation({
                    type: 'extend',
                    params: { top: 50, bottom: 50, left: 50, right: 50, background: { r: 255, g: 255, b: 255 } },
                    label: 'Wide padding',
                  })
                }
                className={dropdownItemClass}
              >
                📐 Wide padding (50px)
              </button>
              <div className="border-t border-gray-200 my-1"></div>
              <button
                onClick={() => handleOperation({ type: 'gamma', params: { gamma: 1.5 }, label: 'Gamma boost' })}
                className={dropdownItemClass}
              >
                💡 Gamma boost
              </button>
              <button
                onClick={() => handleOperation({ type: 'gamma', params: { gamma: 0.7 }, label: 'Gamma reduce' })}
                className={dropdownItemClass}
              >
                🔅 Gamma reduce
              </button>
            </div>
          )}
        </div>
      </div>

      <div className="text-xs text-gray-500 mt-3 flex justify-between items-center">
        <span>
          {selectedCount} image{selectedCount !== 1 ? 's' : ''} selected
        </span>
        {selectedCount > 0 && (
          <span className="text-gray-400">
            Select operation above • {openDropdown ? '📂 Menu open' : '💡 Click for more options'}
          </span>
        )}
      </div>
    </div>
  );
};
