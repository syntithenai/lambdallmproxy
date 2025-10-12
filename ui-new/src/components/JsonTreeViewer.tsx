import React, { useState } from 'react';

interface JsonTreeViewerProps {
  data: any;
  name?: string;
  level?: number;
  defaultExpanded?: boolean;
}

export const JsonTreeViewer: React.FC<JsonTreeViewerProps> = ({ 
  data, 
  name, 
  level = 0,
  defaultExpanded = true 
}) => {
  const [isExpanded, setIsExpanded] = useState(defaultExpanded);
  
  const indent = level * 16;
  
  // Handle null/undefined
  if (data === null || data === undefined) {
    return (
      <div style={{ marginLeft: `${indent}px` }} className="font-mono text-sm">
        {name && <span className="text-gray-600 dark:text-gray-400">{name}: </span>}
        <span className="text-gray-500 dark:text-gray-500 italic">null</span>
      </div>
    );
  }
  
  // Handle primitive types
  const dataType = typeof data;
  if (dataType === 'string' || dataType === 'number' || dataType === 'boolean') {
    return (
      <div style={{ marginLeft: `${indent}px` }} className="font-mono text-sm">
        {name && <span className="text-gray-600 dark:text-gray-400">{name}: </span>}
        <span className={
          dataType === 'string' ? 'text-green-600 dark:text-green-400' :
          dataType === 'number' ? 'text-blue-600 dark:text-blue-400' :
          'text-purple-600 dark:text-purple-400'
        }>
          {dataType === 'string' ? `"${data}"` : String(data)}
        </span>
      </div>
    );
  }
  
  // Handle arrays
  if (Array.isArray(data)) {
    if (data.length === 0) {
      return (
        <div style={{ marginLeft: `${indent}px` }} className="font-mono text-sm">
          {name && <span className="text-gray-600 dark:text-gray-400">{name}: </span>}
          <span className="text-gray-500 dark:text-gray-500">[]</span>
        </div>
      );
    }
    
    return (
      <div style={{ marginLeft: `${indent}px` }} className="font-mono text-sm">
        <button
          onClick={() => setIsExpanded(!isExpanded)}
          className="text-left hover:bg-gray-100 dark:hover:bg-gray-800 px-1 rounded transition-colors"
        >
          <span className="text-gray-500 dark:text-gray-500 mr-1">
            {isExpanded ? '▼' : '▶'}
          </span>
          {name && <span className="text-gray-600 dark:text-gray-400">{name}: </span>}
          <span className="text-gray-500 dark:text-gray-500">
            [{data.length} {data.length === 1 ? 'item' : 'items'}]
          </span>
        </button>
        {isExpanded && (
          <div className="ml-2">
            {data.map((item, idx) => (
              <JsonTreeViewer 
                key={idx} 
                data={item} 
                name={String(idx)} 
                level={level + 1}
                defaultExpanded={level < 1}
              />
            ))}
          </div>
        )}
      </div>
    );
  }
  
  // Handle objects
  if (dataType === 'object') {
    const keys = Object.keys(data);
    
    if (keys.length === 0) {
      return (
        <div style={{ marginLeft: `${indent}px` }} className="font-mono text-sm">
          {name && <span className="text-gray-600 dark:text-gray-400">{name}: </span>}
          <span className="text-gray-500 dark:text-gray-500">{'{}'}</span>
        </div>
      );
    }
    
    return (
      <div style={{ marginLeft: `${indent}px` }} className="font-mono text-sm">
        <button
          onClick={() => setIsExpanded(!isExpanded)}
          className="text-left hover:bg-gray-100 dark:hover:bg-gray-800 px-1 rounded transition-colors"
        >
          <span className="text-gray-500 dark:text-gray-500 mr-1">
            {isExpanded ? '▼' : '▶'}
          </span>
          {name && <span className="text-gray-600 dark:text-gray-400">{name}: </span>}
          <span className="text-gray-500 dark:text-gray-500">
            {'{'}{keys.length} {keys.length === 1 ? 'key' : 'keys'}{'}'}
          </span>
        </button>
        {isExpanded && (
          <div className="ml-2">
            {keys.map((key) => (
              <JsonTreeViewer 
                key={key} 
                data={data[key]} 
                name={key} 
                level={level + 1}
                defaultExpanded={level < 1}
              />
            ))}
          </div>
        )}
      </div>
    );
  }
  
  // Fallback for any other type
  return (
    <div style={{ marginLeft: `${indent}px` }} className="font-mono text-sm">
      {name && <span className="text-gray-600 dark:text-gray-400">{name}: </span>}
      <span className="text-gray-500 dark:text-gray-500">{String(data)}</span>
    </div>
  );
};

// Helper component for tool results
interface ToolResultJsonViewerProps {
  content: string;
}

export const ToolResultJsonViewer: React.FC<ToolResultJsonViewerProps> = ({ content }) => {
  try {
    const data = JSON.parse(content);
    return (
      <div className="bg-gray-50 dark:bg-gray-900 p-3 rounded border border-gray-200 dark:border-gray-700 overflow-x-auto">
        <JsonTreeViewer data={data} defaultExpanded={true} />
      </div>
    );
  } catch (e) {
    // Not valid JSON, return original content
    return (
      <pre className="bg-gray-50 dark:bg-gray-900 p-3 rounded border border-gray-200 dark:border-gray-700 overflow-x-auto text-sm">
        {content}
      </pre>
    );
  }
};
