import React from 'react';

interface SelectionControlsProps {
  onSelectAll: () => void;
  onSelectNone: () => void;
  selectedCount: number;
  totalCount: number;
}

export const SelectionControls: React.FC<SelectionControlsProps> = ({
  onSelectAll,
  onSelectNone,
  selectedCount,
  totalCount,
}) => {
  return (
    <div className="flex items-center justify-between p-4 bg-gray-50 border-b border-gray-200">
      <div className="flex items-center gap-4">
        <button
          onClick={onSelectAll}
          className="text-sm text-blue-600 hover:text-blue-800 font-medium"
          disabled={selectedCount === totalCount}
        >
          Select All
        </button>
        <button
          onClick={onSelectNone}
          className="text-sm text-blue-600 hover:text-blue-800 font-medium"
          disabled={selectedCount === 0}
        >
          Select None
        </button>
      </div>
      <div className="text-sm text-gray-600">
        {selectedCount} of {totalCount} selected
      </div>
    </div>
  );
};
