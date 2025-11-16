/**
 * SnippetViewPage Component
 * 
 * Full-page view for displaying a single snippet.
 * Accessed via /snippet/:id route.
 */

import { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Edit2, Trash2, Tag, Share2 } from 'lucide-react';
import { MarkdownRenderer } from './MarkdownRenderer';
import { useSwag, type ContentSnippet } from '../contexts/SwagContext';
import { useToast } from './ToastManager';
import SnippetShareDialog from './SnippetShareDialog';
import { TipTapEditor } from './TipTapEditor';
import { TagAutocomplete } from './TagAutocomplete';

export default function SnippetViewPage() {
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();
  const { snippets, deleteSnippets, updateSnippet } = useSwag();
  const { showSuccess, showError } = useToast();
  
  const [snippet, setSnippet] = useState<ContentSnippet | null>(null);
  const [showShareDialog, setShowShareDialog] = useState(false);
  const [showEditDialog, setShowEditDialog] = useState(false);
  const [editTitle, setEditTitle] = useState('');
  const [editContent, setEditContent] = useState('');
  const [editTags, setEditTags] = useState<string[]>([]);

  useEffect(() => {
    if (!id) {
      navigate('/swag');
      return;
    }

    // Find the snippet by ID
    const found = snippets.find(s => s.id === id);
    if (found) {
      setSnippet(found);
    } else {
      showError('Snippet not found');
      navigate('/swag');
    }
  }, [id, snippets, navigate, showError]);

  const handleEdit = () => {
    if (!snippet) return;
    // Initialize edit dialog with current snippet data
    setEditTitle(snippet.title || '');
    setEditContent(snippet.content);
    setEditTags(snippet.tags || []);
    setShowEditDialog(true);
  };

  const handleSaveEdit = async () => {
    if (!snippet) return;
    
    try {
      await updateSnippet(snippet.id, {
        title: editTitle,
        content: editContent,
        tags: editTags,
      });
      showSuccess('Snippet updated');
      setShowEditDialog(false);
      // Refresh snippet data
      const updated = snippets.find(s => s.id === snippet.id);
      if (updated) {
        setSnippet(updated);
      }
    } catch (error) {
      console.error('Failed to update snippet:', error);
      showError('Failed to update snippet');
    }
  };

  const getAllTags = (): string[] => {
    const tagSet = new Set<string>();
    snippets.forEach(snippet => {
      snippet.tags?.forEach(tag => tagSet.add(tag));
    });
    return Array.from(tagSet).sort();
  };

  const handleDelete = async () => {
    if (!snippet) return;
    
    if (confirm('Are you sure you want to delete this snippet?')) {
      try {
        await deleteSnippets([snippet.id]);
        showSuccess('Snippet deleted');
        navigate('/swag');
      } catch (error) {
        console.error('Failed to delete snippet:', error);
        showError('Failed to delete snippet');
      }
    }
  };

  const handleShare = () => {
    setShowShareDialog(true);
  };

  if (!snippet) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900 flex items-center justify-center">
        <div className="text-gray-500 dark:text-gray-400">Loading...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      {/* Header */}
      <div className="bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700">
        <div className="max-w-4xl mx-auto px-4 py-4">
          <div className="flex items-center justify-end mb-4">
            <div className="flex items-center gap-2">
              <button
                onClick={handleShare}
                className="p-2 text-gray-600 dark:text-gray-400 hover:text-blue-600 dark:hover:text-blue-400 transition-colors rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700"
                title="Share snippet"
              >
                <Share2 className="w-5 h-5" />
              </button>
              
              <button
                onClick={handleEdit}
                className="p-2 text-gray-600 dark:text-gray-400 hover:text-blue-600 dark:hover:text-blue-400 transition-colors rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700"
                title="Edit snippet"
              >
                <Edit2 className="w-5 h-5" />
              </button>
              
              <button
                onClick={handleDelete}
                className="p-2 text-gray-600 dark:text-gray-400 hover:text-red-600 dark:hover:text-red-400 transition-colors rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700"
                title="Delete snippet"
              >
                <Trash2 className="w-5 h-5" />
              </button>
            </div>
          </div>
          
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">
            {snippet.title || 'Untitled Snippet'}
          </h1>
          
          {snippet.tags && snippet.tags.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {snippet.tags.map((tag: string, index: number) => (
                <span
                  key={index}
                  className="inline-flex items-center gap-1 px-2 py-1 bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 text-xs rounded-full"
                >
                  <Tag className="w-3 h-3" />
                  {tag}
                </span>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Content */}
      <div className="max-w-4xl mx-auto px-4 py-8">
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 p-6">
          <MarkdownRenderer content={snippet.content} />
        </div>
        
        {/* Metadata */}
        <div className="mt-4 text-sm text-gray-500 dark:text-gray-400">
          {snippet.sourceType && (
            <div>Source: {snippet.sourceType}</div>
          )}
          {snippet.timestamp && (
            <div>
              Added: {new Date(snippet.timestamp).toLocaleDateString()} at{' '}
              {new Date(snippet.timestamp).toLocaleTimeString()}
            </div>
          )}
        </div>
      </div>

      {/* Edit Dialog - Full Screen */}
      {showEditDialog && snippet && (
        <div className="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center p-4 z-50">
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-2xl w-full h-full max-w-6xl max-h-[95vh] overflow-hidden flex flex-col">
            {/* Header */}
            <div className="p-6 border-b border-gray-200 dark:border-gray-700 flex justify-between items-center">
              <h2 className="text-2xl font-bold text-gray-900 dark:text-white">Edit Snippet</h2>
              <button
                onClick={() => setShowEditDialog(false)}
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
                <div className="flex flex-wrap gap-2 mb-3">
                  {editTags.map(tag => (
                    <span 
                      key={tag}
                      className="px-3 py-1 text-sm bg-blue-100 dark:bg-blue-900 text-blue-800 dark:text-blue-200 rounded-full flex items-center gap-2 group"
                    >
                      {tag}
                      <button
                        onClick={() => {
                          setEditTags(editTags.filter(t => t !== tag));
                        }}
                        className="hover:text-red-600 dark:hover:text-red-400 opacity-60 group-hover:opacity-100 transition-opacity"
                        title="Remove tag"
                      >
                        ×
                      </button>
                    </span>
                  ))}
                </div>
                
                {/* Enhanced Autocomplete Input */}
                <TagAutocomplete
                  existingTags={getAllTags()}
                  currentTags={editTags}
                  onAddTag={(tag) => {
                    if (!editTags.includes(tag)) {
                      setEditTags([...editTags, tag]);
                    }
                  }}
                  placeholder="Type to add tag..."
                />
              </div>

              <div className="flex-1">
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Content
                </label>
                <div style={{ height: 'calc(100vh - 28rem)', overflowY: 'auto' }}>
                  <TipTapEditor
                    value={editContent}
                    onChange={setEditContent}
                    placeholder="Start typing your content..."
                    editable={true}
                    snippetId={snippet.id}
                    snippetTags={editTags}
                  />
                </div>
              </div>
            </div>

            {/* Footer */}
            <div className="p-4 border-t border-gray-200 dark:border-gray-700 flex justify-end gap-3">
              <button
                onClick={() => setShowEditDialog(false)}
                className="p-2 md:px-6 md:py-2 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors flex items-center gap-1.5"
                title="Cancel"
                aria-label="Cancel"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
                <span className="hidden md:inline">Cancel</span>
              </button>
              <button
                onClick={handleSaveEdit}
                className="p-2 md:px-6 md:py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors flex items-center gap-1.5"
                title="Save Changes"
                aria-label="Save Changes"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
                <span className="hidden md:inline">Save Changes</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Share Dialog */}
      {showShareDialog && snippet && (
        <SnippetShareDialog
          snippetId={snippet.id}
          content={snippet.content}
          title={snippet.title}
          tags={snippet.tags}
          sourceType={snippet.sourceType}
          onClose={() => setShowShareDialog(false)}
        />
      )}
    </div>
  );
}
