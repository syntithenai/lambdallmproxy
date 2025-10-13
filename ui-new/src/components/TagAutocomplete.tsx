import React, { useState, useRef, useEffect } from 'react';
import { useClickOutside } from '../hooks/useClickOutside';

interface TagAutocompleteProps {
  existingTags: string[];        // All available tags in the system
  currentTags: string[];         // Tags already applied to this snippet
  onAddTag: (tag: string) => void;
  placeholder?: string;
  className?: string;
}

/**
 * Enhanced tag input with autocomplete dropdown
 * Features:
 * - Fuzzy matching for existing tags
 * - Keyboard navigation (↑↓ arrows, Enter, Esc)
 * - Click outside to close
 * - "Create new tag" option
 * - Case-insensitive matching
 */
export const TagAutocomplete: React.FC<TagAutocompleteProps> = ({
  existingTags,
  currentTags,
  onAddTag,
  placeholder = 'Type to add tag...',
  className = ''
}) => {
  const [inputValue, setInputValue] = useState('');
  const [showDropdown, setShowDropdown] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(0);
  
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Close dropdown when clicking outside
  useClickOutside(containerRef, () => setShowDropdown(false));

  // Filter tags based on input (fuzzy matching)
  const filteredSuggestions = React.useMemo(() => {
    const query = inputValue.toLowerCase().trim();
    if (!query) {
      // Show all available tags when input is empty
      return existingTags
        .filter(tag => !currentTags.includes(tag))
        .slice(0, 10);
    }
    
    return existingTags
      .filter(tag => 
        tag.toLowerCase().includes(query) &&
        !currentTags.includes(tag)
      )
      .slice(0, 10); // Limit to 10 suggestions for performance
  }, [inputValue, existingTags, currentTags]);

  // Check if input value matches an existing tag exactly
  const hasExactMatch = filteredSuggestions.some(
    tag => tag.toLowerCase() === inputValue.toLowerCase().trim()
  );

  // Show "Create new" option if input doesn't match existing tag
  const showCreateNew = inputValue.trim() && !hasExactMatch;

  // Total number of dropdown items
  const totalItems = filteredSuggestions.length + (showCreateNew ? 1 : 0);

  // Reset selected index when suggestions change
  useEffect(() => {
    setSelectedIndex(0);
  }, [filteredSuggestions.length, showCreateNew]);

  const addTag = (tag: string) => {
    const trimmedTag = tag.trim();
    if (trimmedTag && !currentTags.includes(trimmedTag)) {
      onAddTag(trimmedTag);
      setInputValue('');
      setShowDropdown(false);
      setSelectedIndex(0);
      // Keep focus on input for continuous tag adding
      inputRef.current?.focus();
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (!showDropdown && e.key !== 'Enter') {
      setShowDropdown(true);
      return;
    }

    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        setSelectedIndex(prev => Math.min(prev + 1, totalItems - 1));
        break;
        
      case 'ArrowUp':
        e.preventDefault();
        setSelectedIndex(prev => Math.max(prev - 1, 0));
        break;
        
      case 'Enter':
        e.preventDefault();
        if (totalItems === 0) {
          // No suggestions, create new tag
          if (inputValue.trim()) {
            addTag(inputValue.trim());
          }
        } else if (selectedIndex < filteredSuggestions.length) {
          // Select from existing tags
          addTag(filteredSuggestions[selectedIndex]);
        } else {
          // "Create new" option selected
          addTag(inputValue.trim());
        }
        break;
        
      case 'Escape':
        e.preventDefault();
        setShowDropdown(false);
        setSelectedIndex(0);
        break;
    }
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setInputValue(e.target.value);
    if (!showDropdown) {
      setShowDropdown(true);
    }
  };

  const shouldShowDropdown = showDropdown && (filteredSuggestions.length > 0 || showCreateNew);

  return (
    <div ref={containerRef} className={`relative ${className}`}>
      <input
        ref={inputRef}
        type="text"
        value={inputValue}
        onChange={handleInputChange}
        onKeyDown={handleKeyDown}
        onFocus={() => setShowDropdown(true)}
        className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 dark:focus:ring-blue-400"
        placeholder={placeholder}
        autoComplete="off"
      />
      
      {shouldShowDropdown && (
        <div className="absolute z-10 w-full mt-1 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-lg shadow-lg max-h-60 overflow-y-auto">
          {/* Existing tags */}
          {filteredSuggestions.map((tag, index) => (
            <div
              key={tag}
              className={`px-4 py-2 cursor-pointer flex items-center justify-between ${
                index === selectedIndex 
                  ? 'bg-blue-100 dark:bg-blue-900 text-blue-900 dark:text-blue-100' 
                  : 'text-gray-900 dark:text-gray-100 hover:bg-gray-100 dark:hover:bg-gray-700'
              }`}
              onClick={() => addTag(tag)}
              onMouseEnter={() => setSelectedIndex(index)}
            >
              <span className="font-medium">{tag}</span>
              <span className="text-xs text-gray-500 dark:text-gray-400 ml-2">(existing)</span>
            </div>
          ))}
          
          {/* "Create new" option */}
          {showCreateNew && (
            <div
              className={`px-4 py-2 cursor-pointer border-t border-gray-200 dark:border-gray-700 ${
                selectedIndex === filteredSuggestions.length
                  ? 'bg-blue-100 dark:bg-blue-900 text-blue-900 dark:text-blue-100'
                  : 'text-gray-900 dark:text-gray-100 hover:bg-gray-100 dark:hover:bg-gray-700'
              }`}
              onClick={() => addTag(inputValue.trim())}
              onMouseEnter={() => setSelectedIndex(filteredSuggestions.length)}
            >
              <span className="text-blue-600 dark:text-blue-400">+ Create new: </span>
              <span className="font-medium">{inputValue.trim()}</span>
            </div>
          )}
          
          {/* Empty state */}
          {filteredSuggestions.length === 0 && !showCreateNew && inputValue.trim() && (
            <div className="px-4 py-3 text-sm text-gray-500 dark:text-gray-400 text-center">
              No matching tags. Press Enter to create "{inputValue.trim()}"
            </div>
          )}
        </div>
      )}
    </div>
  );
};
