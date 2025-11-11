import React, { useState, useRef, useEffect } from 'react';
import type { BulkOperation } from './types';
import { useFeatures } from '../../contexts/FeaturesContext';
import { useSettings } from '../../contexts/SettingsContext';
import type { ImageQuality } from '../../types/provider';

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
  const { features } = useFeatures();
  const { settings, updateSettings } = useSettings();
  const hasAIProvider = features?.imageEditingAI ?? false;
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

  const sectionHeaderClass =
    'font-semibold text-gray-600 px-3 py-1 text-[10px] uppercase tracking-wider bg-gray-50';

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
        {/* 1. TRANSFORM DROPDOWN */}
        <div className="relative" ref={(el) => { dropdownRefs.current['transform'] = el; }}>
          <button
            onClick={() => toggleDropdown('transform')}
            disabled={disabled || selectedCount === 0}
            className={dropdownButtonClass(openDropdown === 'transform')}
          >
            🔄 Transform ▾
          </button>
          {openDropdown === 'transform' && (
            <div className="absolute top-full mt-1 bg-white border border-gray-300 rounded shadow-lg z-50 min-w-[200px] max-h-[500px] overflow-y-auto">
              {/* Flip */}
              <div className={sectionHeaderClass}>Flip</div>
              <button
                onClick={() => handleOperation({ type: 'flip', params: { direction: 'horizontal' }, label: 'Flip Horizontal' })}
                className={dropdownItemClass}
              >
                ↔️ Flip Horizontal
              </button>
              <button
                onClick={() => handleOperation({ type: 'flip', params: { direction: 'vertical' }, label: 'Flip Vertical' })}
                className={dropdownItemClass}
              >
                ↕️ Flip Vertical
              </button>
              
              {/* Rotate */}
              <div className={sectionHeaderClass}>Rotate</div>
              <button
                onClick={() => handleOperation({ type: 'rotate', params: { degrees: 90 }, label: 'Rotate 90° CW' })}
                className={dropdownItemClass}
              >
                ↻ Rotate 90° Clockwise
              </button>
              <button
                onClick={() => handleOperation({ type: 'rotate', params: { degrees: 270 }, label: 'Rotate 90° CCW' })}
                className={dropdownItemClass}
              >
                ↺ Rotate 90° Counter-Clockwise
              </button>
              <button
                onClick={() => handleOperation({ type: 'rotate', params: { degrees: 180 }, label: 'Rotate 180°' })}
                className={dropdownItemClass}
              >
                🔄 Rotate 180°
              </button>
              
              {/* Crop (AI features) */}
              <div className={sectionHeaderClass}>Crop (AI)</div>
              <button
                onClick={() => handleOperation({ type: 'autocrop', params: { focus: 'center' }, label: 'AI Auto-Crop' })}
                disabled={!hasAIProvider}
                className={dropdownItemClass}
                title={!hasAIProvider ? 'Requires AI provider (OpenAI, Gemini, etc.)' : 'Intelligently crop to content'}
              >
                🤖 AI Auto-Crop {!hasAIProvider && '🔒'}
              </button>
              <button
                onClick={() => handleOperation({ type: 'facedetect', params: { focus: 'face' }, label: 'AI Face-Crop' })}
                disabled={!hasAIProvider}
                className={dropdownItemClass}
                title={!hasAIProvider ? 'Requires AI provider (OpenAI, Gemini, etc.)' : 'Crop to detected faces'}
              >
                👤 AI Face-Crop {!hasAIProvider && '🔒'}
              </button>
              
              {/* Resize */}
              <div className={sectionHeaderClass}>Resize</div>
              <button
                onClick={() => handleOperation({ type: 'resize', params: { percentage: 50 }, label: '50%' })}
                className={dropdownItemClass}
              >
                🔽 50% Size
              </button>
              <button
                onClick={() => handleOperation({ type: 'resize', params: { percentage: 200 }, label: '200%' })}
                className={dropdownItemClass}
              >
                🔼 200% Size
              </button>
              <button
                onClick={() => handleOperation({ type: 'resize', params: { width: 800, height: 800 }, label: 'Square 800×800' })}
                className={dropdownItemClass}
              >
                ⬜ To Square (800×800)
              </button>
              <button
                onClick={() => handleOperation({ type: 'resize', params: { width: 1920, height: 1080 }, label: '16:9 HD' })}
                className={dropdownItemClass}
              >
                📺 To 16:9 (1920×1080)
              </button>
              <button
                onClick={() => handleOperation({ type: 'resize', params: { width: 1600, height: 1200 }, label: '4:3 Standard' })}
                className={dropdownItemClass}
              >
                📷 To 4:3 (1600×1200)
              </button>
              <button
                onClick={() => handleOperation({ type: 'resize', params: { width: 1500, height: 1000 }, label: '3:2 Photo' })}
                className={dropdownItemClass}
              >
                📸 To 3:2 (1500×1000)
              </button>
            </div>
          )}
        </div>

        {/* 2. EFFECTS DROPDOWN */}
        <div className="relative" ref={(el) => { dropdownRefs.current['effects'] = el; }}>
          <button
            onClick={() => toggleDropdown('effects')}
            disabled={disabled || selectedCount === 0}
            className={dropdownButtonClass(openDropdown === 'effects')}
          >
            ✨ Effects ▾
          </button>
          {openDropdown === 'effects' && (
            <div className="absolute top-full mt-1 bg-white border border-gray-300 rounded shadow-lg z-50 min-w-[200px] max-h-[500px] overflow-y-auto">
              {/* Enhancement */}
              <div className={sectionHeaderClass}>Enhancement</div>
              <button
                onClick={() => handleOperation({ type: 'filter', params: { filter: 'normalize' }, label: 'Auto Enhance' })}
                className={dropdownItemClass}
              >
                📊 Auto Enhance
              </button>
              
              {/* Filters */}
              <div className={sectionHeaderClass}>Filters</div>
              <button
                onClick={() => handleOperation({ type: 'filter', params: { filter: 'sepia' }, label: 'Sepia' })}
                className={dropdownItemClass}
              >
                🟤 Sepia
              </button>
              <button
                onClick={() => handleOperation({ type: 'filter', params: { filter: 'grayscale' }, label: 'Greyscale' })}
                className={dropdownItemClass}
              >
                ⚫ Greyscale
              </button>
              
              {/* Adjustments */}
              <div className={sectionHeaderClass}>Adjustments</div>
              <button
                onClick={() => handleOperation({ type: 'modulate', params: { brightness: 1.2 }, label: 'Brightness +20%' })}
                className={dropdownItemClass}
              >
                ☀️ Brightness +20%
              </button>
              <button
                onClick={() => handleOperation({ type: 'modulate', params: { brightness: 0.8 }, label: 'Brightness -20%' })}
                className={dropdownItemClass}
              >
                🌙 Brightness -20%
              </button>
              <button
                onClick={() => handleOperation({ type: 'modulate', params: { saturation: 1.5 }, label: 'Saturation +50%' })}
                className={dropdownItemClass}
              >
                🎨 Saturation +50%
              </button>
              <button
                onClick={() => handleOperation({ type: 'modulate', params: { saturation: 0.5 }, label: 'Saturation -50%' })}
                className={dropdownItemClass}
              >
                🎨 Saturation -50%
              </button>
              <button
                onClick={() => handleOperation({ type: 'modulate', params: { hue: 90 }, label: 'Hue Shift +90°' })}
                className={dropdownItemClass}
              >
                🌈 Hue Shift +90°
              </button>
              
              {/* Image Effects */}
              <div className={sectionHeaderClass}>Image Effects</div>
              <button
                onClick={() => handleOperation({ type: 'filter', params: { filter: 'sharpen' }, label: 'Sharpen' })}
                className={dropdownItemClass}
              >
                ✨ Sharpen
              </button>
              <button
                onClick={() => handleOperation({ type: 'filter', params: { filter: 'blur', strength: 3 }, label: 'Blur' })}
                className={dropdownItemClass}
              >
                🌫️ Blur
              </button>
              
              {/* Borders */}
              <div className={sectionHeaderClass}>Borders</div>
              <button
                onClick={() => handleOperation({ 
                  type: 'extend', 
                  params: { top: 20, bottom: 20, left: 20, right: 20, background: { r: 255, g: 255, b: 255 } }, 
                  label: 'White Border' 
                })}
                className={dropdownItemClass}
              >
                ⬜ Add White Border (20px)
              </button>
              <button
                onClick={() => handleOperation({ 
                  type: 'extend', 
                  params: { top: 20, bottom: 20, left: 20, right: 20, background: { r: 0, g: 0, b: 0 } }, 
                  label: 'Black Border' 
                })}
                className={dropdownItemClass}
              >
                ⬛ Add Black Border (20px)
              </button>
            </div>
          )}
        </div>

        {/* 3. FORMAT DROPDOWN - HIDDEN (all images auto-converted to webp) */}
        {/* Format conversion to webp happens automatically in backend */}

        {/* 4. DUPLICATE BUTTON */}
        <button
          onClick={() => handleOperation({ type: 'duplicate', params: {}, label: 'Duplicate' })}
          disabled={disabled || selectedCount === 0}
          className={`px-3 py-1.5 text-xs font-medium rounded transition-colors flex items-center gap-1 ${
            disabled || selectedCount === 0
              ? 'bg-gray-100 text-gray-400 cursor-not-allowed'
              : 'bg-gray-200 hover:bg-gray-300 text-gray-700'
          }`}
          title="Duplicate selected images and save to SWAG"
        >
          📋 Duplicate
        </button>

        {/* 5. IMAGE QUALITY SELECTOR */}
        <div className="flex items-center gap-2">
          <label htmlFor="image-quality" className="text-xs font-medium text-gray-700">
            Image Quality:
          </label>
          <select
            id="image-quality"
            value={settings?.imageQuality || 'low'}
            onChange={(e) => updateSettings({ imageQuality: e.target.value as ImageQuality })}
            className="px-2 py-1.5 text-xs font-medium bg-white border border-gray-300 rounded transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500"
            title="Default quality for AI image generation (affects cost)"
          >
            <option value="low">Low (256×256, cheapest)</option>
            <option value="medium">Medium (512×512)</option>
            <option value="high">High (1024×1024+, best)</option>
          </select>
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
