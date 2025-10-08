import React, { useState } from 'react';

interface JsonTreeProps {
  data: any;
  level?: number;
  expanded?: boolean;
  expandPaths?: string[]; // Array of paths to expand (e.g., ['messages', 'messages.0'])
  currentPath?: string; // Current path in the tree
  expandAll?: boolean; // Expand everything
}

export const JsonTree: React.FC<JsonTreeProps> = ({ 
  data, 
  level = 0, 
  expanded = false,
  expandPaths = [],
  currentPath = '',
  expandAll = false
}) => {
  // Determine if this node should be expanded by default
  const shouldExpand = expandAll || expanded || expandPaths.some(path => 
    currentPath === path || currentPath.startsWith(path + '.')
  );
  
  const [isExpanded, setIsExpanded] = useState(shouldExpand);

  // Determine the type of data
  const getType = (value: any): string => {
    if (value === null) return 'null';
    if (Array.isArray(value)) return 'array';
    return typeof value;
  };

  const type = getType(data);

  // For primitive values, just display them
  if (type !== 'object' && type !== 'array') {
    return (
      <span className={`json-value json-${type}`}>
        {type === 'string' ? `"${data}"` : String(data)}
      </span>
    );
  }

  // For arrays and objects
  const entries = Array.isArray(data)
    ? data.map((item, index) => [index, item])
    : Object.entries(data);

  const isEmpty = entries.length === 0;
  const preview = Array.isArray(data)
    ? `Array(${data.length})`
    : `Object{${entries.length}}`;

  return (
    <div className="json-tree">
      <div className="json-line">
        {!isEmpty && (
          <button
            onClick={() => setIsExpanded(!isExpanded)}
            className="json-toggle"
            aria-label={isExpanded ? 'Collapse' : 'Expand'}
          >
            {isExpanded ? '▼' : '▶'}
          </button>
        )}
        <span className="json-bracket">
          {Array.isArray(data) ? '[' : '{'}
        </span>
        {!isExpanded && !isEmpty && (
          <span className="json-preview"> {preview} </span>
        )}
        {!isExpanded && (
          <span className="json-bracket">
            {Array.isArray(data) ? ']' : '}'}
          </span>
        )}
      </div>

      {isExpanded && (
        <div className="json-content" style={{ marginLeft: `${level * 20 + 20}px` }}>
          {entries.map(([key, value], index) => {
            const childPath = currentPath ? `${currentPath}.${key}` : String(key);
            return (
              <div key={key} className="json-item">
                {!Array.isArray(data) && (
                  <>
                    <span className="json-key">"{key}"</span>
                    <span className="json-colon">: </span>
                  </>
                )}
                <JsonTree 
                  data={value} 
                  level={level + 1} 
                  expanded={false}
                  expandPaths={expandPaths}
                  currentPath={childPath}
                  expandAll={expandAll}
                />
                {index < entries.length - 1 && <span className="json-comma">,</span>}
              </div>
            );
          })}
          <div style={{ marginLeft: `-${20}px` }} className="json-bracket">
            {Array.isArray(data) ? ']' : '}'}
          </div>
        </div>
      )}
    </div>
  );
};

// Utility function to detect if string contains JSON
export const isJsonString = (str: string): boolean => {
  if (typeof str !== 'string') return false;
  const trimmed = str.trim();
  if (!trimmed) return false;
  
  // Must start with { or [
  if (!(trimmed.startsWith('{') || trimmed.startsWith('['))) return false;
  
  try {
    const parsed = JSON.parse(trimmed);
    // Must be an object or array (not just a primitive wrapped in JSON)
    return typeof parsed === 'object' && parsed !== null;
  } catch {
    return false;
  }
};

// Utility function to parse JSON safely
export const parseJsonSafe = (str: string): any | null => {
  try {
    return JSON.parse(str.trim());
  } catch {
    return null;
  }
};

// Component to render content with JSON detection
interface JsonOrTextProps {
  content: string;
  className?: string;
}

export const JsonOrText: React.FC<JsonOrTextProps> = ({ content, className = '' }) => {
  if (isJsonString(content)) {
    const parsed = parseJsonSafe(content);
    if (parsed !== null) {
      return (
        <div className={`json-container ${className}`}>
          <JsonTree data={parsed} expanded={false} />
        </div>
      );
    }
  }
  
  // Not JSON, render as plain text
  return <div className={className}>{content}</div>;
};
