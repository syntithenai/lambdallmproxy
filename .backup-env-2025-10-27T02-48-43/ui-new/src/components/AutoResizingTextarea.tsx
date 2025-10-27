/**
 * AutoResizingTextarea Component
 * Textarea that automatically resizes to fit content
 */
import React from 'react';
import { useAutoResizeTextarea } from '../hooks/useAutoResizeTextarea';

interface AutoResizingTextareaProps {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  disabled?: boolean;
  minHeight?: string;
  backgroundColor?: string;
}

export const AutoResizingTextarea: React.FC<AutoResizingTextareaProps> = ({
  label,
  value,
  onChange,
  placeholder = '',
  disabled = false,
  minHeight = '60px',
  backgroundColor = ''
}) => {
  const textareaRef = useAutoResizeTextarea(value);

  return (
    <div className="card p-4">
      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
        {label}
      </label>
      <textarea
        ref={textareaRef}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        disabled={disabled}
        className={`input-field w-full overflow-hidden ${backgroundColor}`}
        style={{ minHeight, resize: 'none' }}
      />
    </div>
  );
};
