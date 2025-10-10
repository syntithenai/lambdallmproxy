import React, { useState, useEffect } from 'react';
import { useSwag } from '../contexts/SwagContext';
import { useToast } from './ToastManager';
import { JsonOrText, isJsonString, parseJsonSafe } from './JsonTree';
import { MarkdownRenderer } from './MarkdownRenderer';
import { StorageStats } from './StorageStats';
import type { ContentSnippet } from '../contexts/SwagContext';
import { 
  createGoogleDoc, 
  listGoogleDocs, 
  appendToGoogleDoc, 
  initGoogleAuth 
} from '../utils/googleDocs';
import type { GoogleDoc } from '../utils/googleDocs';

export const SwagPage: React.FC = () => {
  const { showSuccess, showError, showWarning } = useToast();
  const { 
    snippets, 
    updateSnippet, 
    deleteSnippets, 
    mergeSnippets, 
    toggleSelection, 
    selectAll, 
    selectNone,
    getSelectedSnippets,
    getAllTags,
    addTagsToSnippets,
    removeTagsFromSnippets,
    storageStats
  } = useSwag();

  const [googleDocs, setGoogleDocs] = useState<GoogleDoc[]>([]);
  const [editingSnippet, setEditingSnippet] = useState<ContentSnippet | null>(null);
  const [viewingSnippet, setViewingSnippet] = useState<ContentSnippet | null>(null);
  const [editContent, setEditContent] = useState('');
  const [editTitle, setEditTitle] = useState('');
  const [editTags, setEditTags] = useState<string[]>([]);
  const [newDocName, setNewDocName] = useState('');
  const [showNewDocDialog, setShowNewDocDialog] = useState(false);
  const [showTagDialog, setShowTagDialog] = useState(false);
  const [tagDialogMode, setTagDialogMode] = useState<'add' | 'remove'>('add');
  const [selectedTagsForOperation, setSelectedTagsForOperation] = useState<string[]>([]);
  const [newTagInput, setNewTagInput] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [searchTags, setSearchTags] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    initGoogleAuth().catch(console.error);
  }, []);

  const loadGoogleDocs = async () => {
    try {
      setLoading(true);
      const docs = await listGoogleDocs();
      setGoogleDocs(docs);
    } catch (error) {
      console.error('Failed to load Google Docs:', error);
      showError('Failed to load Google Docs. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleCreateDoc = async () => {
    if (!newDocName.trim()) {
      showWarning('Please enter a document name');
      return;
    }

    try {
      setLoading(true);
      const doc = await createGoogleDoc(newDocName);
      setGoogleDocs(prev => [doc, ...prev]);
      setNewDocName('');
      setShowNewDocDialog(false);
      showSuccess(`Document "${doc.name}" created successfully!`);
    } catch (error) {
      console.error('Failed to create document:', error);
      showError('Failed to create document. Please grant permissions and try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleAppendToDoc = async (docId: string) => {
    const selected = getSelectedSnippets();
    if (selected.length === 0) {
      showWarning('No snippets selected');
      return;
    }

    try {
      setLoading(true);
      const content = selected.map(s => {
        let snippet = '';
        if (s.title) {
          snippet += `# ${s.title}\n\n`;
        }
        
        // Check if content is JSON and format it with proper indentation
        if (isJsonString(s.content)) {
          const parsed = parseJsonSafe(s.content);
          if (parsed !== null) {
            snippet += JSON.stringify(parsed, null, 2); // 2-space indentation for readability
          } else {
            snippet += s.content;
          }
        } else {
          snippet += s.content;
        }
        
        snippet += `\n\n---\nSource: ${s.sourceType} | ${new Date(s.timestamp).toLocaleString()}`;
        return snippet;
      }).join('\n\n');

      await appendToGoogleDoc(docId, content);
      selectNone();
      showSuccess(`${selected.length} snippet(s) appended to document successfully!`);
    } catch (error) {
      console.error('Failed to append to document:', error);
      showError('Failed to append to document. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleBulkOperation = async (operation: string) => {
    console.log('🔧 Bulk operation triggered:', operation);
    const selected = getSelectedSnippets();
    console.log('📋 Selected snippets:', selected.length);
    
    if (selected.length === 0) {
      showWarning('No snippets selected');
      return;
    }

    // Handle append-docId format
    if (operation.startsWith('append-')) {
      const docId = operation.substring(7); // Remove 'append-' prefix
      console.log('📎 Appending to document:', docId);
      await handleAppendToDoc(docId);
      return;
    }

    switch (operation) {
      case 'merge':
        if (selected.length < 2) {
          showWarning('Please select at least 2 snippets to merge');
          return;
        }
        mergeSnippets(selected.map(s => s.id));
        showSuccess('Snippets merged successfully');
        break;
      case 'delete':
        if (confirm(`Delete ${selected.length} snippet(s)?`)) {
          deleteSnippets(selected.map(s => s.id));
          showSuccess(`${selected.length} snippet(s) deleted`);
        }
        break;
      case 'append':
        if (googleDocs.length === 0) {
          console.log('📂 Loading Google Docs...');
          await loadGoogleDocs();
        }
        break;
      case 'tag':
        setTagDialogMode('add');
        setSelectedTagsForOperation([]);
        setShowTagDialog(true);
        break;
      case 'untag':
        setTagDialogMode('remove');
        setSelectedTagsForOperation([]);
        setShowTagDialog(true);
        break;
      default:
        console.warn('⚠️ Unknown operation:', operation);
    }
  };

  const handleTagOperation = () => {
    const selected = getSelectedSnippets();
    if (selected.length === 0 || selectedTagsForOperation.length === 0) {
      showWarning('Please select tags');
      return;
    }

    if (tagDialogMode === 'add') {
      addTagsToSnippets(selected.map(s => s.id), selectedTagsForOperation);
      showSuccess(`Added ${selectedTagsForOperation.length} tag(s) to ${selected.length} snippet(s)`);
    } else {
      removeTagsFromSnippets(selected.map(s => s.id), selectedTagsForOperation);
      showSuccess(`Removed ${selectedTagsForOperation.length} tag(s) from ${selected.length} snippet(s)`);
    }
    
    setShowTagDialog(false);
    setSelectedTagsForOperation([]);
  };

  const handleEditSnippet = (snippet: ContentSnippet) => {
    setEditingSnippet(snippet);
    setEditContent(snippet.content);
    setEditTitle(snippet.title || '');
    setEditTags(snippet.tags || []);
  };

  const handleSaveEdit = () => {
    if (editingSnippet) {
      updateSnippet(editingSnippet.id, {
        content: editContent,
        title: editTitle.trim() || undefined,
        tags: editTags.length > 0 ? editTags : undefined
      });
      setEditingSnippet(null);
    }
  };

  const getSourceBadgeColor = (sourceType: string) => {
    switch (sourceType) {
      case 'user': return 'bg-blue-500';
      case 'assistant': return 'bg-green-500';
      case 'tool': return 'bg-purple-500';
      default: return 'bg-gray-500';
    }
  };

  // Filter snippets based on search query and tags
  const filteredSnippets = snippets.filter(snippet => {
    // Text search filter
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      const matchesContent = snippet.content.toLowerCase().includes(query);
      const matchesTitle = snippet.title?.toLowerCase().includes(query);
      if (!matchesContent && !matchesTitle) {
        return false;
      }
    }

    // Tag filter
    if (searchTags.length > 0) {
      if (!snippet.tags || snippet.tags.length === 0) {
        return false;
      }
      // All selected tags must be present in the snippet
      const hasAllTags = searchTags.every(tag => snippet.tags?.includes(tag));
      if (!hasAllTags) {
        return false;
      }
    }

    return true;
  });

  return (
    <div className="h-screen flex flex-col bg-gray-50 dark:bg-gray-900">
      {/* Header */}
      <div className="bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 px-6 py-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
              Content Swag
            </h1>
            <span className="text-sm text-gray-500 dark:text-gray-400">
              {snippets.length} snippet{snippets.length !== 1 ? 's' : ''}
            </span>
          </div>

          <div className="flex items-center gap-4">
            {/* Storage Stats */}
            {storageStats && (
              <div className="w-64">
                <StorageStats
                  totalSize={storageStats.totalSize}
                  limit={storageStats.limit}
                  percentUsed={storageStats.percentUsed}
                />
              </div>
            )}

            <button
              onClick={() => setShowNewDocDialog(true)}
              className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
              New Google Doc
            </button>
          </div>
        </div>

        {/* Search and Filter Bar */}
        {snippets.length > 0 && (
          <div className="mt-4 flex items-center gap-4 flex-wrap">
            {/* Search Input */}
            <div className="flex-1 min-w-[300px]">
              <div className="relative">
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search snippets by title or content..."
                  className="w-full px-4 py-2 pl-10 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                />
                <svg className="w-5 h-5 absolute left-3 top-2.5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
                {searchQuery && (
                  <button
                    onClick={() => setSearchQuery('')}
                    className="absolute right-3 top-2.5 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200"
                  >
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                )}
              </div>
            </div>

            {/* Tag Filter */}
            {getAllTags().length > 0 && (
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-sm text-gray-600 dark:text-gray-400">Filter by tags:</span>
                {getAllTags().map(tag => (
                  <button
                    key={tag}
                    onClick={() => {
                      if (searchTags.includes(tag)) {
                        setSearchTags(searchTags.filter(t => t !== tag));
                      } else {
                        setSearchTags([...searchTags, tag]);
                      }
                    }}
                    className={`px-3 py-1 text-xs rounded-full transition-colors ${
                      searchTags.includes(tag)
                        ? 'bg-blue-600 text-white'
                        : 'bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-300 dark:hover:bg-gray-600'
                    }`}
                  >
                    {tag}
                  </button>
                ))}
                {searchTags.length > 0 && (
                  <button
                    onClick={() => setSearchTags([])}
                    className="text-xs text-blue-600 dark:text-blue-400 hover:underline"
                  >
                    Clear filters
                  </button>
                )}
              </div>
            )}
          </div>
        )}

        {/* Bulk Actions Bar */}
        {snippets.length > 0 && (
          <div className="mt-4 flex items-center gap-4 flex-wrap">
            <div className="flex gap-2">
              <button
                onClick={selectAll}
                className="px-3 py-1 text-sm bg-gray-100 dark:bg-gray-700 rounded hover:bg-gray-200 dark:hover:bg-gray-600"
              >
                Select All
              </button>
              <button
                onClick={selectNone}
                className="px-3 py-1 text-sm bg-gray-100 dark:bg-gray-700 rounded hover:bg-gray-200 dark:hover:bg-gray-600"
              >
                Select None
              </button>
            </div>

            <div className="flex-1" />

            <select
              className="px-3 py-1 text-sm border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700"
              onChange={(e) => {
                const value = e.target.value;
                console.log('📝 Dropdown changed:', value);
                if (value) {
                  handleBulkOperation(value);
                  e.target.value = '';
                }
              }}
              disabled={getSelectedSnippets().length === 0}
              value=""
            >
              <option value="">Bulk Operations...</option>
              <option value="tag">Add Tags...</option>
              <option value="untag">Remove Tags...</option>
              <option value="merge">Combine Snippets</option>
              <option value="delete">Delete Selected</option>
              <optgroup label="Append to Google Doc">
                {googleDocs.length === 0 ? (
                  <option value="append">Load Documents...</option>
                ) : (
                  googleDocs.map(doc => (
                    <option key={doc.id} value={`append-${doc.id}`}>
                      {doc.name}
                    </option>
                  ))
                )}
              </optgroup>
            </select>

            <span className="text-sm text-gray-600 dark:text-gray-400">
              {getSelectedSnippets().length} selected
            </span>
          </div>
        )}
      </div>

      {/* Content Grid */}
      <div className="flex-1 overflow-y-auto p-6">
        {snippets.length === 0 ? (
          <div className="text-center py-12 text-gray-500 dark:text-gray-400">
            <svg className="w-16 h-16 mx-auto mb-4 opacity-50" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 8h14M5 8a2 2 0 110-4h14a2 2 0 110 4M5 8v10a2 2 0 002 2h10a2 2 0 002-2V8m-9 4h4" />
            </svg>
            <p className="text-lg">No content snippets yet</p>
            <p className="text-sm mt-2">Use the grab button in chat to save content here</p>
          </div>
        ) : filteredSnippets.length === 0 ? (
          <div className="text-center py-12 text-gray-500 dark:text-gray-400">
            <svg className="w-16 h-16 mx-auto mb-4 opacity-50" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            <p className="text-lg">No matching snippets</p>
            <p className="text-sm mt-2">Try adjusting your search or tag filters</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {[...filteredSnippets].sort((a, b) => (b.updateDate || b.timestamp) - (a.updateDate || a.timestamp)).map(snippet => (
              <div
                key={snippet.id}
                className={`relative bg-white dark:bg-gray-800 rounded-lg shadow-sm border-2 transition-all ${
                  snippet.selected 
                    ? 'border-blue-500 ring-2 ring-blue-200 dark:ring-blue-800' 
                    : 'border-gray-200 dark:border-gray-700'
                }`}
              >
                {/* Selection Checkbox */}
                <div className="absolute top-2 left-2">
                  <input
                    type="checkbox"
                    checked={snippet.selected || false}
                    onChange={() => toggleSelection(snippet.id)}
                    className="w-5 h-5 rounded border-gray-300 text-blue-600 focus:ring-blue-500 cursor-pointer"
                  />
                </div>

                {/* Content */}
                <div className="p-4 pt-10">
                  {/* Source Badge */}
                  <div className="flex items-center gap-2 mb-2">
                    <span className={`px-2 py-1 text-xs rounded-full text-white ${getSourceBadgeColor(snippet.sourceType)}`}>
                      {snippet.sourceType}
                    </span>
                    <span className="text-xs text-gray-500 dark:text-gray-400">
                      {new Date(snippet.timestamp).toLocaleString()}
                    </span>
                  </div>

                  {/* Title */}
                  {snippet.title && (
                    <h3 className="font-semibold text-gray-900 dark:text-white mb-2">
                      {snippet.title}
                    </h3>
                  )}

                  {/* Tags */}
                  {snippet.tags && snippet.tags.length > 0 && (
                    <div className="flex flex-wrap gap-1 mb-2">
                      {snippet.tags.map(tag => (
                        <span 
                          key={tag}
                          className="px-2 py-0.5 text-xs bg-blue-100 dark:bg-blue-900 text-blue-800 dark:text-blue-200 rounded cursor-pointer hover:bg-blue-200 dark:hover:bg-blue-800 transition-colors"
                          onClick={(e) => {
                            e.stopPropagation();
                            if (!searchTags.includes(tag)) {
                              setSearchTags([...searchTags, tag]);
                            }
                          }}
                        >
                          {tag}
                        </span>
                      ))}
                    </div>
                  )}

                  {/* Content Preview */}
                  <div 
                    className="text-sm text-gray-700 dark:text-gray-300 mb-3 max-h-48 overflow-hidden cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-700/50 rounded p-2 -m-2 transition-colors"
                    onClick={() => setViewingSnippet(snippet)}
                  >
                    <div className="line-clamp-6">
                      <MarkdownRenderer content={snippet.content} />
                    </div>
                  </div>

                  {/* Edit Button */}
                  <button
                    onClick={() => handleEditSnippet(snippet)}
                    className="w-full px-3 py-2 text-sm bg-gray-100 dark:bg-gray-700 rounded hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors"
                  >
                    Edit
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Edit Dialog - Full Screen */}
      {editingSnippet && (
        <div className="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center p-4 z-50">
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-2xl w-full h-full max-w-6xl max-h-[95vh] overflow-hidden flex flex-col">
            {/* Header */}
            <div className="p-6 border-b border-gray-200 dark:border-gray-700 flex justify-between items-center">
              <h2 className="text-2xl font-bold text-gray-900 dark:text-white">Edit Snippet</h2>
              <button
                onClick={() => setEditingSnippet(null)}
                className="text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 text-3xl leading-none"
                aria-label="Close"
              >
                ×
              </button>
            </div>

            {/* Content - Scrollable */}
            <div className="p-6 flex-1 overflow-y-auto">
              <div className="mb-6">
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Title (optional)
                </label>
                <input
                  type="text"
                  value={editTitle}
                  onChange={(e) => setEditTitle(e.target.value)}
                  className="w-full px-4 py-3 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-lg"
                  placeholder="Enter a title..."
                />
              </div>

              {/* Tags Section */}
              <div className="mb-6">
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Tags
                </label>
                <div className="flex flex-wrap gap-2 mb-2">
                  {editTags.map(tag => (
                    <span 
                      key={tag}
                      className="px-3 py-1 text-sm bg-blue-100 dark:bg-blue-900 text-blue-800 dark:text-blue-200 rounded-full flex items-center gap-2"
                    >
                      {tag}
                      <button
                        onClick={() => setEditTags(editTags.filter(t => t !== tag))}
                        className="hover:text-red-600 dark:hover:text-red-400"
                      >
                        ×
                      </button>
                    </span>
                  ))}
                </div>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={newTagInput}
                    onChange={(e) => setNewTagInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && newTagInput.trim()) {
                        e.preventDefault();
                        const tag = newTagInput.trim();
                        if (!editTags.includes(tag)) {
                          setEditTags([...editTags, tag]);
                        }
                        setNewTagInput('');
                      }
                    }}
                    className="flex-1 px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm"
                    placeholder="Type a tag and press Enter..."
                    list="existing-tags"
                  />
                  <datalist id="existing-tags">
                    {getAllTags().map(tag => (
                      <option key={tag} value={tag} />
                    ))}
                  </datalist>
                  <button
                    onClick={() => {
                      const tag = newTagInput.trim();
                      if (tag && !editTags.includes(tag)) {
                        setEditTags([...editTags, tag]);
                        setNewTagInput('');
                      }
                    }}
                    className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors text-sm"
                  >
                    Add
                  </button>
                </div>
              </div>

              <div className="flex-1">
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Content
                </label>
                <textarea
                  value={editContent}
                  onChange={(e) => setEditContent(e.target.value)}
                  className="w-full h-[calc(100vh-28rem)] min-h-[400px] px-4 py-3 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white font-mono text-sm resize-none"
                  placeholder="Enter content..."
                />
              </div>
            </div>

            {/* Footer */}
            <div className="p-4 border-t border-gray-200 dark:border-gray-700 flex justify-end gap-3">
              <button
                onClick={() => setEditingSnippet(null)}
                className="px-6 py-2 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleSaveEdit}
                className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
              >
                Save Changes
              </button>
            </div>
          </div>
        </div>
      )}

      {/* New Doc Dialog */}
      {showNewDocDialog && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-md w-full">
            <div className="p-6 border-b border-gray-200 dark:border-gray-700">
              <h2 className="text-xl font-bold text-gray-900 dark:text-white">Create New Google Doc</h2>
            </div>

            <div className="p-6">
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Document Name
              </label>
              <input
                type="text"
                value={newDocName}
                onChange={(e) => setNewDocName(e.target.value)}
                onKeyPress={(e) => e.key === 'Enter' && handleCreateDoc()}
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                placeholder="My Swag Document"
                autoFocus
              />
            </div>

            <div className="p-6 border-t border-gray-200 dark:border-gray-700 flex justify-end gap-3">
              <button
                onClick={() => {
                  setShowNewDocDialog(false);
                  setNewDocName('');
                }}
                className="px-4 py-2 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg"
                disabled={loading}
              >
                Cancel
              </button>
              <button
                onClick={handleCreateDoc}
                disabled={loading || !newDocName.trim()}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {loading ? 'Creating...' : 'Create'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* View Dialog - Full Screen */}
      {viewingSnippet && (
        <div className="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center p-4 z-50">
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-2xl w-full h-full max-w-6xl max-h-[95vh] overflow-hidden flex flex-col">
            {/* Header */}
            <div className="p-6 border-b border-gray-200 dark:border-gray-700 flex justify-between items-start">
              <div className="flex-1">
                {viewingSnippet.title && (
                  <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">
                    {viewingSnippet.title}
                  </h2>
                )}
                <div className="flex items-center gap-3">
                  <span className={`px-2 py-1 text-xs rounded-full text-white ${getSourceBadgeColor(viewingSnippet.sourceType)}`}>
                    {viewingSnippet.sourceType}
                  </span>
                  <span className="text-sm text-gray-500 dark:text-gray-400">
                    {new Date(viewingSnippet.timestamp).toLocaleString()}
                  </span>
                </div>
              </div>
              <button
                onClick={() => setViewingSnippet(null)}
                className="ml-4 text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 text-3xl leading-none"
                aria-label="Close"
              >
                ×
              </button>
            </div>

            {/* Content - Scrollable */}
            <div className="flex-1 overflow-y-auto p-6">
              <div className="text-gray-800 dark:text-gray-200">
                <JsonOrText content={viewingSnippet.content} />
              </div>
            </div>

            {/* Footer */}
            <div className="p-4 border-t border-gray-200 dark:border-gray-700 flex justify-end gap-3">
              <button
                onClick={() => {
                  setViewingSnippet(null);
                  handleEditSnippet(viewingSnippet);
                }}
                className="px-4 py-2 bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors"
              >
                Edit
              </button>
              <button
                onClick={() => setViewingSnippet(null)}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Tag Dialog */}
      {showTagDialog && (
        <div className="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center p-4 z-50">
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-2xl w-full max-w-md">
            <div className="p-6 border-b border-gray-200 dark:border-gray-700">
              <h2 className="text-xl font-bold text-gray-900 dark:text-white">
                {tagDialogMode === 'add' ? 'Add Tags' : 'Remove Tags'}
              </h2>
              <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
                {tagDialogMode === 'add' 
                  ? 'Select or create tags to add to selected snippets' 
                  : 'Select tags to remove from selected snippets'}
              </p>
            </div>

            <div className="p-6">
              {/* Selected Tags */}
              {selectedTagsForOperation.length > 0 && (
                <div className="flex flex-wrap gap-2 mb-4">
                  {selectedTagsForOperation.map(tag => (
                    <span 
                      key={tag}
                      className="px-3 py-1 text-sm bg-blue-100 dark:bg-blue-900 text-blue-800 dark:text-blue-200 rounded-full flex items-center gap-2"
                    >
                      {tag}
                      <button
                        onClick={() => setSelectedTagsForOperation(selectedTagsForOperation.filter(t => t !== tag))}
                        className="hover:text-red-600 dark:hover:text-red-400"
                      >
                        ×
                      </button>
                    </span>
                  ))}
                </div>
              )}

              {/* Tag Input */}
              {tagDialogMode === 'add' && (
                <div className="mb-4">
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    Add New Tag
                  </label>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={newTagInput}
                      onChange={(e) => setNewTagInput(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' && newTagInput.trim()) {
                          e.preventDefault();
                          const tag = newTagInput.trim();
                          if (!selectedTagsForOperation.includes(tag)) {
                            setSelectedTagsForOperation([...selectedTagsForOperation, tag]);
                          }
                          setNewTagInput('');
                        }
                      }}
                      className="flex-1 px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm"
                      placeholder="Type a tag and press Enter..."
                      list="all-tags"
                    />
                    <datalist id="all-tags">
                      {getAllTags().map(tag => (
                        <option key={tag} value={tag} />
                      ))}
                    </datalist>
                    <button
                      onClick={() => {
                        const tag = newTagInput.trim();
                        if (tag && !selectedTagsForOperation.includes(tag)) {
                          setSelectedTagsForOperation([...selectedTagsForOperation, tag]);
                          setNewTagInput('');
                        }
                      }}
                      className="px-4 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700 transition-colors text-sm"
                    >
                      Add
                    </button>
                  </div>
                </div>
              )}

              {/* Existing Tags */}
              {getAllTags().length > 0 && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    {tagDialogMode === 'add' ? 'Or Select Existing' : 'Select Tags to Remove'}
                  </label>
                  <div className="flex flex-wrap gap-2 max-h-48 overflow-y-auto">
                    {getAllTags().map(tag => (
                      <button
                        key={tag}
                        onClick={() => {
                          if (selectedTagsForOperation.includes(tag)) {
                            setSelectedTagsForOperation(selectedTagsForOperation.filter(t => t !== tag));
                          } else {
                            setSelectedTagsForOperation([...selectedTagsForOperation, tag]);
                          }
                        }}
                        className={`px-3 py-1 text-sm rounded-full transition-colors ${
                          selectedTagsForOperation.includes(tag)
                            ? 'bg-blue-600 text-white'
                            : 'bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-300 dark:hover:bg-gray-600'
                        }`}
                      >
                        {tag}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>

            <div className="p-4 border-t border-gray-200 dark:border-gray-700 flex justify-end gap-3">
              <button
                onClick={() => {
                  setShowTagDialog(false);
                  setSelectedTagsForOperation([]);
                  setNewTagInput('');
                }}
                className="px-4 py-2 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleTagOperation}
                disabled={selectedTagsForOperation.length === 0}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {tagDialogMode === 'add' ? 'Add Tags' : 'Remove Tags'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Loading Overlay */}
      {loading && (
        <div className="fixed inset-0 bg-black bg-opacity-25 flex items-center justify-center z-40">
          <div className="bg-white dark:bg-gray-800 rounded-lg p-6 shadow-xl">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
            <p className="mt-4 text-gray-700 dark:text-gray-300">Processing...</p>
          </div>
        </div>
      )}
    </div>
  );
};
