import React, { useState, useEffect } from 'react';

export interface Snippet {
  id: number;
  created_at: string;
  updated_at: string;
  title: string;
  content: string;
  tags: string[];
  source: 'chat' | 'url' | 'file' | 'manual';
  url?: string;
}

interface SnippetsPanelProps {
  userEmail?: string;
}

export const SnippetsPanel: React.FC<SnippetsPanelProps> = ({ userEmail }) => {
  const [snippets, setSnippets] = useState<Snippet[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [showCaptureModal, setShowCaptureModal] = useState(false);
  const [expandedSnippetId, setExpandedSnippetId] = useState<number | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [toastMessage, setToastMessage] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  
  // Capture modal form state
  const [captureForm, setCaptureForm] = useState({
    title: '',
    content: '',
    tags: '',
    source: 'manual' as Snippet['source'],
    url: ''
  });

  // Handle SSE snippet events
  useEffect(() => {
    const handleSnippetInserted = (event: CustomEvent) => {
      const { id, title, tags } = event.detail;
      console.log('📝 Snippet inserted:', { id, title, tags });
      showToast('success', `Snippet "${title}" saved successfully`);
      // Refresh snippets list
      loadSnippets();
    };

    const handleSnippetDeleted = (event: CustomEvent) => {
      const { id, title } = event.detail;
      console.log('🗑️ Snippet deleted:', { id, title });
      setSnippets(prev => prev.filter(s => s.id !== id));
      showToast('success', `Snippet "${title}" deleted`);
    };

    const handleSnippetUpdated = (event: CustomEvent) => {
      const { id, title } = event.detail;
      console.log('✏️ Snippet updated:', { id, title });
      showToast('success', `Snippet "${title}" updated`);
      // Refresh snippets list
      loadSnippets();
    };

    window.addEventListener('snippet_inserted', handleSnippetInserted as EventListener);
    window.addEventListener('snippet_deleted', handleSnippetDeleted as EventListener);
    window.addEventListener('snippet_updated', handleSnippetUpdated as EventListener);

    return () => {
      window.removeEventListener('snippet_inserted', handleSnippetInserted as EventListener);
      window.removeEventListener('snippet_deleted', handleSnippetDeleted as EventListener);
      window.removeEventListener('snippet_updated', handleSnippetUpdated as EventListener);
    };
  }, []);

  // Load snippets on mount
  useEffect(() => {
    if (userEmail) {
      loadSnippets();
    }
  }, [userEmail]);

  const showToast = (type: 'success' | 'error', message: string) => {
    setToastMessage({ type, message });
    setTimeout(() => setToastMessage(null), 3000);
  };

  const loadSnippets = async () => {
    if (!userEmail) return;
    
    setIsLoading(true);
    try {
      // This would call the backend endpoint that uses manage_snippets tool
      // For now, we'll rely on SSE events to update the list
      // In a full implementation, add a dedicated GET /api/snippets endpoint
      setIsLoading(false);
    } catch (error) {
      console.error('Failed to load snippets:', error);
      showToast('error', 'Failed to load snippets');
      setIsLoading(false);
    }
  };

  const handleCaptureSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!captureForm.title.trim()) {
      showToast('error', 'Title is required');
      return;
    }

    setIsLoading(true);
    try {
      // This would trigger a chat message to call manage_snippets tool
      // Or call a dedicated backend endpoint
      // For now, we'll emit a custom event that the parent can handle
      const event = new CustomEvent('snippet_capture', {
        detail: {
          title: captureForm.title,
          content: captureForm.content,
          tags: captureForm.tags.split(',').map(t => t.trim()).filter(Boolean),
          source: captureForm.source,
          url: captureForm.url
        }
      });
      window.dispatchEvent(event);

      // Reset form
      setCaptureForm({
        title: '',
        content: '',
        tags: '',
        source: 'manual',
        url: ''
      });
      setShowCaptureModal(false);
      setIsLoading(false);
    } catch (error) {
      console.error('Failed to capture snippet:', error);
      showToast('error', 'Failed to capture snippet');
      setIsLoading(false);
    }
  };

  const handleDelete = async (snippet: Snippet) => {
    if (!confirm(`Delete snippet "${snippet.title}"?`)) return;

    // Emit delete event that parent can handle
    const event = new CustomEvent('snippet_delete', {
      detail: { id: snippet.id, title: snippet.title }
    });
    window.dispatchEvent(event);
  };

  const filteredSnippets = snippets.filter(snippet => {
    const matchesSearch = !searchQuery || 
      snippet.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      snippet.content.toLowerCase().includes(searchQuery.toLowerCase());
    
    const matchesTags = selectedTags.length === 0 ||
      selectedTags.every(tag => snippet.tags.includes(tag));
    
    return matchesSearch && matchesTags;
  });

  const allTags = Array.from(new Set(snippets.flatMap(s => s.tags))).sort();

  return (
    <div className="snippets-panel border-t border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800">
      {/* Toast Notification */}
      {toastMessage && (
        <div className={`fixed top-4 right-4 px-4 py-2 rounded shadow-lg z-50 ${
          toastMessage.type === 'success' 
            ? 'bg-green-500 text-white' 
            : 'bg-red-500 text-white'
        }`}>
          {toastMessage.message}
        </div>
      )}

      {/* Header */}
      <div className="flex items-center justify-between p-3 border-b border-gray-200 dark:border-gray-700">
        <div className="flex items-center gap-2">
          <span className="text-lg font-semibold text-gray-900 dark:text-gray-100">📝 Snippets</span>
          <span className="text-xs text-gray-500 dark:text-gray-400">
            {filteredSnippets.length} {filteredSnippets.length !== snippets.length ? `of ${snippets.length}` : ''}
          </span>
        </div>
        <button
          onClick={() => setShowCaptureModal(true)}
          className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-sm rounded transition-colors"
        >
          + Capture
        </button>
      </div>

      {/* Search and Filters */}
      <div className="p-3 space-y-2">
        <input
          type="text"
          placeholder="Search snippets..."
          value={searchQuery}
          onChange={e => setSearchQuery(e.target.value)}
          className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 placeholder-gray-500 dark:placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
        
        {allTags.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {allTags.map(tag => (
              <button
                key={tag}
                onClick={() => setSelectedTags(prev => 
                  prev.includes(tag) ? prev.filter(t => t !== tag) : [...prev, tag]
                )}
                className={`px-2 py-1 text-xs rounded transition-colors ${
                  selectedTags.includes(tag)
                    ? 'bg-blue-600 text-white'
                    : 'bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-300 dark:hover:bg-gray-600'
                }`}
              >
                {tag}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Snippets List */}
      <div className="p-3 space-y-2 max-h-96 overflow-y-auto">
        {isLoading ? (
          <div className="text-center py-8 text-gray-500 dark:text-gray-400">
            <div className="animate-spin w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full mx-auto"></div>
            <p className="mt-2 text-sm">Loading snippets...</p>
          </div>
        ) : filteredSnippets.length === 0 ? (
          <div className="text-center py-8 text-gray-500 dark:text-gray-400">
            {snippets.length === 0 ? (
              <p className="text-sm">No snippets yet. Click "Capture" to save your first snippet!</p>
            ) : (
              <p className="text-sm">No snippets match your search.</p>
            )}
          </div>
        ) : (
          filteredSnippets.map(snippet => (
            <div
              key={snippet.id}
              className="border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 p-3 hover:shadow-md transition-shadow"
            >
              <div className="flex items-start justify-between">
                <div className="flex-1 min-w-0">
                  <h3 className="font-semibold text-gray-900 dark:text-gray-100 truncate">
                    {snippet.title}
                  </h3>
                  <div className="flex items-center gap-2 mt-1 text-xs text-gray-500 dark:text-gray-400">
                    <span className="capitalize">{snippet.source}</span>
                    <span>•</span>
                    <span>{new Date(snippet.created_at).toLocaleDateString()}</span>
                  </div>
                </div>
                <div className="flex items-center gap-1 ml-2">
                  <button
                    onClick={() => setExpandedSnippetId(
                      expandedSnippetId === snippet.id ? null : snippet.id
                    )}
                    className="p-1.5 text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-600 rounded transition-colors"
                    title={expandedSnippetId === snippet.id ? 'Collapse' : 'Expand'}
                  >
                    {expandedSnippetId === snippet.id ? '▾' : '▸'}
                  </button>
                  <button
                    onClick={() => handleDelete(snippet)}
                    className="p-1.5 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 rounded transition-colors"
                    title="Delete"
                  >
                    🗑️
                  </button>
                </div>
              </div>

              {snippet.tags.length > 0 && (
                <div className="flex flex-wrap gap-1 mt-2">
                  {snippet.tags.map(tag => (
                    <span
                      key={tag}
                      className="px-1.5 py-0.5 text-xs bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 rounded"
                    >
                      {tag}
                    </span>
                  ))}
                </div>
              )}

              {expandedSnippetId === snippet.id && (
                <div className="mt-3 pt-3 border-t border-gray-200 dark:border-gray-600">
                  <p className="text-sm text-gray-700 dark:text-gray-300 whitespace-pre-wrap">
                    {snippet.content || <em className="text-gray-500">No content</em>}
                  </p>
                  {snippet.url && (
                    <a
                      href={snippet.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="mt-2 text-xs text-blue-600 dark:text-blue-400 hover:underline block truncate"
                    >
                      {snippet.url}
                    </a>
                  )}
                </div>
              )}
            </div>
          ))
        )}
      </div>

      {/* Capture Modal */}
      {showCaptureModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
            <form onSubmit={handleCaptureSubmit}>
              <div className="p-4 border-b border-gray-200 dark:border-gray-700">
                <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100">
                  Capture Snippet
                </h2>
              </div>
              
              <div className="p-4 space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    Title *
                  </label>
                  <input
                    type="text"
                    value={captureForm.title}
                    onChange={e => setCaptureForm(prev => ({ ...prev, title: e.target.value }))}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    required
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    Content
                  </label>
                  <textarea
                    value={captureForm.content}
                    onChange={e => setCaptureForm(prev => ({ ...prev, content: e.target.value }))}
                    rows={6}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    Tags (comma-separated)
                  </label>
                  <input
                    type="text"
                    value={captureForm.tags}
                    onChange={e => setCaptureForm(prev => ({ ...prev, tags: e.target.value }))}
                    placeholder="research, important, code-snippet"
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                      Source
                    </label>
                    <select
                      value={captureForm.source}
                      onChange={e => setCaptureForm(prev => ({ ...prev, source: e.target.value as Snippet['source'] }))}
                      className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    >
                      <option value="manual">Manual</option>
                      <option value="chat">Chat</option>
                      <option value="url">URL</option>
                      <option value="file">File</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                      URL (optional)
                    </label>
                    <input
                      type="url"
                      value={captureForm.url}
                      onChange={e => setCaptureForm(prev => ({ ...prev, url: e.target.value }))}
                      placeholder="https://..."
                      className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                </div>
              </div>

              <div className="p-4 border-t border-gray-200 dark:border-gray-700 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setShowCaptureModal(false)}
                  className="px-4 py-2 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded transition-colors"
                  disabled={isLoading}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded transition-colors disabled:opacity-50"
                  disabled={isLoading}
                >
                  {isLoading ? 'Saving...' : 'Save Snippet'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
