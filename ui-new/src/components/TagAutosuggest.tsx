import React, { useState, useRef, useEffect } from 'react';

interface TagAutosuggestProps {
  allTags: string[];
  selectedTags: string[];
  onAdd: (tag: string) => void;
  placeholder?: string;
  className?: string;
}

export const TagAutosuggest: React.FC<TagAutosuggestProps> = ({
  allTags,
  selectedTags,
  onAdd,
  placeholder = 'Add tag...',
  className = ''
}) => {
  const [input, setInput] = useState('');
  const [show, setShow] = useState(false);
  const [highlight, setHighlight] = useState(0);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setShow(false);
    }
    if (show) document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, [show]);

  const filtered = allTags
    .filter(tag => tag.toLowerCase().includes(input.toLowerCase()) && !selectedTags.includes(tag))
    .slice(0, 8);

  function handleAdd(tag: string) {
    onAdd(tag);
    setInput('');
    setShow(false);
    setHighlight(0);
  }

  return (
    <div className={`relative ${className}`} ref={ref}>
      <input
        type="text"
        value={input}
        onChange={e => { setInput(e.target.value); setShow(true); setHighlight(0); }}
        onFocus={() => setShow(true)}
        onKeyDown={e => {
          if (!show) return;
          if (e.key === 'ArrowDown') { setHighlight(h => Math.min(h + 1, filtered.length - 1)); e.preventDefault(); }
          else if (e.key === 'ArrowUp') { setHighlight(h => Math.max(h - 1, 0)); e.preventDefault(); }
          else if (e.key === 'Enter' && filtered[highlight]) { handleAdd(filtered[highlight]); }
        }}
        placeholder={placeholder}
        className="w-full px-3 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
        aria-label="Add tag to filter"
      />
      {show && filtered.length > 0 && (
        <div className="absolute z-10 left-0 right-0 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded shadow-lg mt-1 max-h-48 overflow-auto">
          {filtered.map((tag, i) => (
            <div
              key={tag}
              className={`px-3 py-2 text-sm cursor-pointer ${i === highlight ? 'bg-blue-100 dark:bg-blue-900' : ''}`}
              onMouseDown={() => handleAdd(tag)}
              onMouseEnter={() => setHighlight(i)}
            >
              {tag}
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
