import React, { useState, useEffect, useRef } from 'react';
import { useSwag } from '../contexts/SwagContext';
import { useToast } from './ToastManager';
import { useCast } from '../contexts/CastContext';
import { useTTS } from '../contexts/TTSContext';
import { JsonOrText, isJsonString, parseJsonSafe } from './JsonTree';
import { MarkdownRenderer } from './MarkdownRenderer';
import { StorageStats } from './StorageStats';
import { TagAutocomplete } from './TagAutocomplete';
import { ConfirmDialog } from './ConfirmDialog';
import { ReadButton } from './ReadButton';
import { FileUploadDialog } from './FileUploadDialog';
import type { ContentSnippet } from '../contexts/SwagContext';
import { 
  createGoogleDocInFolder, 
  listGoogleDocs, 
  appendToGoogleDoc, 
  initGoogleAuth 
} from '../utils/googleDocs';
import type { GoogleDoc } from '../utils/googleDocs';

export const SwagPage: React.FC = () => {
  const { showSuccess, showError, showWarning } = useToast();
  const { 
    snippets,
    addSnippet,
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
    storageStats,
    generateEmbeddings
  } = useSwag();
  const { 
    isAvailable: isCastAvailable, 
    isConnected: isCastConnected, 
    castSnippet, 
    sendSnippetScrollPosition,
    isCastingSnippet
  } = useCast();
  const { state: ttsState, stop: stopTTS } = useTTS();

  const [googleDocs, setGoogleDocs] = useState<GoogleDoc[]>(() => {
    // Initialize from localStorage cache
    try {
      const cached = localStorage.getItem('swag-google-docs-cache');
      if (cached) {
        return JSON.parse(cached);
      }
    } catch (error) {
      console.error('Failed to load Google Docs cache:', error);
    }
    return [];
  });
  const [editingSnippet, setEditingSnippet] = useState<ContentSnippet | null>(null);
  const [viewingSnippet, setViewingSnippet] = useState<ContentSnippet | null>(null);
  const [editContent, setEditContent] = useState('');
  const [editTitle, setEditTitle] = useState('');
  const [editTags, setEditTags] = useState<string[]>([]);
  const [newDocName, setNewDocName] = useState('');
  const [showNewDocDialog, setShowNewDocDialog] = useState(false);
  const [showTagDialog, setShowTagDialog] = useState(false);
  const [tagDialogMode, setTagDialogMode] = useState<'add' | 'remove' | 'filter'>('add');
  const [selectedTagsForOperation, setSelectedTagsForOperation] = useState<string[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchTags, setSearchTags] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [docsLoaded, setDocsLoaded] = useState(false);
  
  // Embedding state
  const [isEmbedding, setIsEmbedding] = useState(false);
  const [embeddingProgress, setEmbeddingProgress] = useState<{
    current: number;
    total: number;
  } | null>(null);
  
  // Document upload state
  const [showUploadDialog, setShowUploadDialog] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<{
    current: number;
    total: number;
    status: string;
  } | null>(null);
  
  // Confirmation dialog state for tag deletion
  const [showDeleteTagConfirm, setShowDeleteTagConfirm] = useState(false);
  const [tagToDelete, setTagToDelete] = useState<string | null>(null);
  const [snippetToEdit, setSnippetToEdit] = useState<string | null>(null);
  
  // Ref for scroll tracking in viewing dialog
  const viewingScrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    initGoogleAuth().catch(console.error);
    // Only load Google Docs from API if we don't have cached data
    if (googleDocs.length === 0 && !docsLoaded) {
      loadGoogleDocs();
    }
  }, []);

  // Auto-cast snippet to Chromecast when viewing if already connected
  useEffect(() => {
    if (viewingSnippet && isCastConnected && !isCastingSnippet) {
      console.log('Auto-casting snippet to Chromecast:', viewingSnippet.title);
      castSnippet({
        id: viewingSnippet.id,
        content: viewingSnippet.content,
        title: viewingSnippet.title,
        tags: viewingSnippet.tags,
        created: new Date(viewingSnippet.timestamp),
        modified: viewingSnippet.updateDate ? new Date(viewingSnippet.updateDate) : new Date(viewingSnippet.timestamp)
      });
    }
  }, [viewingSnippet, isCastConnected, isCastingSnippet, castSnippet]);

  const loadGoogleDocs = async (force = false) => {
    // Skip if already loaded and not forcing refresh
    if (docsLoaded && !force) {
      return;
    }
    
    try {
      setLoading(true);
      const docs = await listGoogleDocs();
      setGoogleDocs(docs);
      setDocsLoaded(true);
      
      // Cache the results in localStorage
      try {
        localStorage.setItem('swag-google-docs-cache', JSON.stringify(docs));
      } catch (error) {
        console.error('Failed to cache Google Docs:', error);
      }
    } catch (error) {
      console.error('Failed to load Google Docs:', error);
      showError('Failed to load Google Docs. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleOpenDoc = (docId: string) => {
    // Open Google Doc in new tab
    window.open(`https://docs.google.com/document/d/${docId}/edit`, '_blank');
  };

  const handleCreateDoc = async () => {
    if (!newDocName.trim()) {
      showWarning('Please enter a document name');
      return;
    }

    try {
      setLoading(true);
      const doc = await createGoogleDocInFolder(newDocName);
      const updatedDocs = [doc, ...googleDocs];
      setGoogleDocs(updatedDocs);
      
      // Update cache immediately when creating a document
      try {
        localStorage.setItem('swag-google-docs-cache', JSON.stringify(updatedDocs));
      } catch (error) {
        console.error('Failed to update Google Docs cache:', error);
      }
      
      setNewDocName('');
      setShowNewDocDialog(false);
      showSuccess(`Document "${doc.name}" created successfully in Research Agent folder!`);
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
    console.log('� handleBulkOperation called with:', operation);
    const selected = getSelectedSnippets();
    
    // Handle Google Docs append operations (formatted as "append-{docId}")
    if (operation.startsWith('append-')) {
      const docId = operation.substring(7); // Remove "append-" prefix
      await handleAppendToDoc(docId);
      return;
    }
    
    switch (operation) {
      case 'new-doc':
        setShowNewDocDialog(true);
        break;
      case 'append':
        // Load Google Docs if not already loaded
        if (googleDocs.length === 0) {
          await loadGoogleDocs(true);
        }
        break;
      case 'merge':
        if (selected.length === 0) {
          showWarning('No snippets selected');
          return;
        }
        if (selected.length < 2) {
          showWarning('Select at least 2 snippets to combine');
          return;
        }
        mergeSnippets(selected.map(s => s.id));
        selectNone();
        showSuccess(`${selected.length} snippets combined`);
        break;
      case 'delete':
        if (selected.length === 0) {
          showWarning('No snippets selected');
          return;
        }
        if (confirm(`Delete ${selected.length} snippet(s)?`)) {
          deleteSnippets(selected.map(s => s.id));
          showSuccess(`${selected.length} snippet(s) deleted`);
        }
        break;
      case 'generate-embeddings':
        console.log('🔍 Generate embeddings case triggered');
        await handleGenerateEmbeddings();
        break;
      case 'tag':
        if (selected.length === 0) {
          showWarning('No snippets selected');
          return;
        }
        setTagDialogMode('add');
        setSelectedTagsForOperation([]);
        setShowTagDialog(true);
        break;
      case 'untag':
        if (selected.length === 0) {
          showWarning('No snippets selected');
          return;
        }
        setTagDialogMode('remove');
        setSelectedTagsForOperation([]);
        setShowTagDialog(true);
        break;
      case 'tag-all':
        // Tag all snippets (don't require selection)
        selectAll();
        setTimeout(() => {
          setTagDialogMode('add');
          setSelectedTagsForOperation([]);
          setShowTagDialog(true);
        }, 100);
        break;
      case 'untag-all':
        // Untag all snippets (don't require selection)
        selectAll();
        setTimeout(() => {
          setTagDialogMode('remove');
          setSelectedTagsForOperation([]);
          setShowTagDialog(true);
        }, 100);
        break;
      default:
        console.warn('⚠️ Unknown operation:', operation);
    }
  };

  const handleGenerateEmbeddings = async () => {
    const selected = getSelectedSnippets();
    if (selected.length === 0) {
      showWarning('No snippets selected');
      return;
    }

    try {
      setIsEmbedding(true);
      setEmbeddingProgress({ current: 0, total: selected.length });

      const result = await generateEmbeddings(
        selected.map(s => s.id),
        (current, total) => {
          setEmbeddingProgress({ current, total });
        }
      );

      selectNone();
      
      if (result.embedded > 0 || result.skipped > 0) {
        showSuccess(
          `✅ Added to index: ${result.embedded} • ⏭️ Skipped: ${result.skipped}${result.failed > 0 ? ` • ❌ Failed: ${result.failed}` : ''}`
        );
      } else {
        showWarning('No items were added to search index');
      }
      
    } catch (error) {
      console.error('Embedding error:', error);
      showError(error instanceof Error ? error.message : 'Failed to add to search index');
    } finally {
      setIsEmbedding(false);
      setEmbeddingProgress(null);
    }
  };

  const handleUploadDocuments = async (files: File[], urls: string[]) => {
    try {
      setLoading(true);
      const totalItems = files.length + urls.length;
      let completed = 0;
      
      setUploadProgress({ current: 0, total: totalItems, status: 'Starting...' });
      
      // Define size limits
      const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50MB hard limit
      const WARN_FILE_SIZE = 10 * 1024 * 1024; // 10MB warning threshold
      
      // Get API URL safely
      const apiUrl = typeof process !== 'undefined' && process.env?.REACT_APP_LAMBDA_URL 
        ? process.env.REACT_APP_LAMBDA_URL 
        : 'http://localhost:3000';
      
      // Check for oversized files
      const oversizedFiles = files.filter(f => f.size > MAX_FILE_SIZE);
      if (oversizedFiles.length > 0) {
        const fileList = oversizedFiles.map(f => `${f.name} (${(f.size / 1024 / 1024).toFixed(1)}MB)`).join(', ');
        showError(`Files too large (max 50MB): ${fileList}`);
        setLoading(false);
        setUploadProgress(null);
        return;
      }
      
      // Warn about large files
      const largeFiles = files.filter(f => f.size > WARN_FILE_SIZE && f.size <= MAX_FILE_SIZE);
      if (largeFiles.length > 0) {
        const fileList = largeFiles.map(f => `${f.name} (${(f.size / 1024 / 1024).toFixed(1)}MB)`).join(', ');
        showWarning(`Large files detected - processing may be slow: ${fileList}`);
      }
      
      // Process files - convert to markdown then to snippets
      for (const file of files) {
        setUploadProgress({ current: completed, total: totalItems, status: `Converting ${file.name}...` });
        
        try {
          let markdownContent: string;
          const fileExtension = file.name.split('.').pop()?.toLowerCase();
          
          // Check if file needs backend conversion (PDF, DOCX, images)
          if (['pdf', 'docx', 'doc', 'png', 'jpg', 'jpeg', 'gif', 'webp', 'html', 'htm'].includes(fileExtension || '')) {
            // Send to backend for conversion
            const formData = new FormData();
            formData.append('file', file);
            
            const response = await fetch(`${apiUrl}/convert-to-markdown`, {
              method: 'POST',
              body: formData,
            });
            
            if (!response.ok) {
              const errorText = await response.text();
              console.error(`Conversion failed for ${file.name}:`, errorText);
              throw new Error(`Server error (${response.status}): ${errorText.substring(0, 100)}`);
            }
            
            let result = await response.json();
            console.log(`📥 Received response for ${file.name}:`, {
              hasBody: !!result.body,
              bodyType: typeof result.body,
              hasMarkdown: !!result.markdown,
              hasContent: !!result.content,
              resultKeys: Object.keys(result),
              bodyPreview: typeof result.body === 'string' ? result.body.substring(0, 200) : result.body
            });
            
            // Handle Lambda response format (body is a JSON string)
            if (result.body && typeof result.body === 'string') {
              try {
                console.log(`🔄 Parsing nested body JSON for ${file.name}...`);
                result = JSON.parse(result.body);
                console.log(`✅ Parsed body, keys:`, Object.keys(result));
                console.log(`✅ Parsed body content:`, {
                  hasMarkdown: !!result.markdown,
                  hasContent: !!result.content,
                  markdownType: typeof result.markdown,
                  contentType: typeof result.content,
                  markdownValue: result.markdown,
                  contentValue: result.content
                });
              } catch (e) {
                console.error('Failed to parse response body:', e);
              }
            }
            
            console.log(`📄 Final result for ${file.name}:`, {
              hasMarkdown: !!result.markdown,
              hasContent: !!result.content,
              markdownLength: result.markdown?.length || 0,
              contentLength: result.content?.length || 0,
              markdownPreview: result.markdown ? result.markdown.substring(0, 100) : '(none)',
              contentPreview: result.content ? result.content.substring(0, 100) : '(none)'
            });
            
            if (!result.markdown && !result.content) {
              console.error(`❌ No markdown or content in result:`, JSON.stringify(result, null, 2));
              throw new Error('No content returned from conversion - PDF may be empty or image-based');
            }
            
            markdownContent = result.markdown || result.content;
            
            if (!markdownContent || markdownContent.trim().length === 0) {
              console.error(`❌ Markdown content is empty:`, {
                markdownContent,
                type: typeof markdownContent,
                length: markdownContent?.length
              });
              throw new Error('Converted content is empty - PDF may contain only images');
            }
          } else {
            // Plain text files - read directly
            markdownContent = await file.text();
          }
          
          // Add as snippet (which will auto-embed if enabled)
          await addSnippet(markdownContent, 'user', file.name);
          
        } catch (error) {
          console.error(`Failed to process ${file.name}:`, error);
          const errorMessage = error instanceof Error ? error.message : 'Unknown error';
          showWarning(`Could not process ${file.name}: ${errorMessage}`);
        }
        
        completed++;
      }
      
      // Process URLs - fetch and convert to snippets
      for (const url of urls) {
        setUploadProgress({ current: completed, total: totalItems, status: `Fetching ${url}...` });
        
        try {
          // Send URL to backend for conversion
          const response = await fetch(`${apiUrl}/convert-to-markdown`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({ url }),
          });
          
          if (!response.ok) {
            throw new Error(`Failed to fetch ${url}`);
          }
          
          let result = await response.json();
          
          // Handle Lambda response format (body is a JSON string)
          if (result.body && typeof result.body === 'string') {
            try {
              result = JSON.parse(result.body);
            } catch (e) {
              console.error('Failed to parse response body:', e);
            }
          }
          
          const markdownContent = result.markdown || result.content;
          
          if (!markdownContent || markdownContent.trim().length === 0) {
            throw new Error('No content extracted from URL');
          }
          
          // Add as snippet (which will auto-embed if enabled)
          await addSnippet(markdownContent, 'user', url);
        } catch (error) {
          console.error(`Failed to fetch ${url}:`, error);
          showWarning(`Could not fetch ${url}`);
        }
        
        completed++;
      }
      
      setUploadProgress({ current: totalItems, total: totalItems, status: 'Complete!' });
      showSuccess(`Successfully added ${files.length} file(s) and ${urls.length} URL(s) as snippets`);
      setShowUploadDialog(false);
      
    } catch (error) {
      console.error('Upload error:', error);
      showError(error instanceof Error ? error.message : 'Upload failed');
    } finally {
      setLoading(false);
      setUploadProgress(null);
    }
  };

  const handleSingleUpload = async (fileOrUrl: File | string) => {
    if (typeof fileOrUrl === 'string') {
      await handleUploadDocuments([], [fileOrUrl]);
    } else {
      await handleUploadDocuments([fileOrUrl], []);
    }
  };

  const handleTagOperation = () => {
    if (tagDialogMode === 'filter') {
      // Apply tag filters
      setSearchTags(selectedTagsForOperation);
      setShowTagDialog(false);
      setSelectedTagsForOperation([]);
      return;
    }

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

  const handleCreateNewSnippet = async () => {
    // Create a blank snippet - addSnippet will handle creation
    await addSnippet('', 'user', 'New Snippet');
    
    // After creation, find and edit the new snippet
    // It will be the first one since it has the newest timestamp
    setTimeout(() => {
      if (snippets.length > 0) {
        const newestSnippet = snippets[0];
        handleEditSnippet(newestSnippet);
      }
    }, 50); // Small delay to let state update
  };

  const handleSaveEdit = async () => {
    if (editingSnippet) {
      await updateSnippet(editingSnippet.id, {
        content: editContent,
        title: editTitle.trim() || undefined,
        tags: editTags.length > 0 ? editTags : undefined
      });
      
      // Check if snippet still matches current filters
      if (searchTags.length > 0) {
        const stillMatches = searchTags.every(tag => editTags.includes(tag));
        if (!stillMatches) {
          showWarning('This snippet is now hidden by current filters.');
        }
      }
      
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
      <div className="bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 px-4 py-2">
        <div className="flex items-center justify-between gap-4 mb-2">
          <div className="flex items-center gap-3">
            <h1 className="text-lg font-bold text-gray-900 dark:text-white">
              Content Swag
            </h1>
            <span className="text-xs text-gray-500 dark:text-gray-400">
              {snippets.length} snippet{snippets.length !== 1 ? 's' : ''}
            </span>
          </div>

          <div className="flex items-center gap-3">
            {/* New Snippet Button */}
            <button
              onClick={handleCreateNewSnippet}
              className="px-3 py-1.5 text-sm bg-green-600 text-white rounded hover:bg-green-700 transition-colors flex items-center gap-2"
              title="Create a new blank snippet"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
              New Snippet
            </button>

            {/* Upload Documents Button */}
            <button
              onClick={() => setShowUploadDialog(true)}
              className="px-3 py-1.5 text-sm bg-blue-600 text-white rounded hover:bg-blue-700 transition-colors flex items-center gap-2"
              title="Upload documents as snippets (auto-embeds if enabled)"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
              </svg>
              Upload Documents
            </button>

            {/* Storage Stats */}
            {storageStats && (
              <div className="w-48">
                <StorageStats
                  totalSize={storageStats.totalSize}
                  limit={storageStats.limit}
                  percentUsed={storageStats.percentUsed}
                />
              </div>
            )}
          </div>
        </div>

        {/* Tag Filter Section - Show active filters above search */}
        {snippets.length > 0 && (
          <div>
            {/* Active Tag Filters */}
            {searchTags.length > 0 && (
              <div className="flex items-center gap-2 flex-wrap mb-2">
                <span className="text-xs font-medium text-gray-600 dark:text-gray-400">Filtering:</span>
                {searchTags.map(tag => (
                  <button
                    key={tag}
                    onClick={() => setSearchTags(searchTags.filter(t => t !== tag))}
                    className="px-2 py-0.5 text-xs rounded-full bg-blue-600 text-white hover:bg-blue-700 transition-colors flex items-center gap-1"
                  >
                    {tag}
                    <span>×</span>
                  </button>
                ))}
                <button
                  onClick={() => setSearchTags([])}
                  className="text-xs text-blue-600 dark:text-blue-400 hover:underline"
                >
                  Clear
                </button>
              </div>
            )}

            {/* Search Bar with Tag Filter Button */}
            <div className="flex gap-2 items-center max-w-2xl">
              <div className="relative flex-1">
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search snippets..."
                  className="w-full px-3 py-1.5 pl-8 text-sm border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                />
                <svg className="w-4 h-4 absolute left-2.5 top-2 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
                {searchQuery && (
                  <button
                    onClick={() => setSearchQuery('')}
                    className="absolute right-2.5 top-2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                )}
              </div>

              {/* Plus Button for Tag Filter */}
              {getAllTags().length > 0 && (
                <button
                  onClick={() => {
                    // Show tag picker dialog
                    setShowTagDialog(true);
                    setTagDialogMode('filter');
                    setSelectedTagsForOperation([...searchTags]);
                  }}
                  className="w-8 h-8 flex items-center justify-center rounded bg-blue-600 text-white hover:bg-blue-700 transition-colors flex-shrink-0"
                  title="Filter by tags"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z" />
                  </svg>
                </button>
              )}
            </div>
          </div>
        )}

        {/* Bulk Actions Bar */}
        {snippets.length > 0 && (
          <div className="mt-2 flex items-center gap-2 flex-wrap">
            <div className="flex gap-1">
              <button
                onClick={selectAll}
                className="px-2 py-1 text-xs bg-gray-100 dark:bg-gray-700 rounded hover:bg-gray-200 dark:hover:bg-gray-600"
              >
                Select All
              </button>
              <button
                onClick={selectNone}
                className="px-2 py-1 text-xs bg-gray-100 dark:bg-gray-700 rounded hover:bg-gray-200 dark:hover:bg-gray-600"
              >
                Select None
              </button>
            </div>

            <div className="flex-1" />

            <span className="text-xs text-gray-600 dark:text-gray-400">
              {getSelectedSnippets().length} selected
            </span>

            <select
              className="px-2 py-1 text-xs border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed"
              onChange={(e) => {
                const value = e.target.value;
                console.log('📝 Dropdown changed:', value);
                if (value) {
                  handleBulkOperation(value);
                  e.target.value = '';
                }
              }}
              value=""
              disabled={getSelectedSnippets().length === 0 || isEmbedding}
            >
              <option value="">Bulk Operations...</option>
              <optgroup label="With Selected Snippets">
                <option value="generate-embeddings">🔍 Add To Search Index</option>
                <option value="tag">Add Tags...</option>
                <option value="untag">Remove Tags...</option>
                <option value="tag-all">Tag All Snippets...</option>
                <option value="untag-all">Untag All Snippets...</option>
                <option value="merge">Combine Snippets</option>
                <option value="delete">Delete Selected</option>
              </optgroup>
              <optgroup label="Add to Google Doc">
                {googleDocs.length === 0 ? (
                  <option value="append">Load Existing...</option>
                ) : (
                  googleDocs.map(doc => (
                    <option key={doc.id} value={`append-${doc.id}`}>
                      {doc.name}
                    </option>
                  ))
                )}
                <option value="new-doc">📄 New Google Doc</option>
              </optgroup>
            </select>

            {/* Google Docs Dropdown */}
            <select
              className="px-2 py-1 text-xs border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
              onChange={(e) => {
                const docId = e.target.value;
                if (docId) {
                  handleOpenDoc(docId);
                  e.target.value = ''; // Reset selection
                }
              }}
              value=""
            >
              <option value="">Documents</option>
              {googleDocs.length === 0 ? (
                <option value="" disabled>
                  {loading ? 'Loading...' : 'No documents'}
                </option>
              ) : (
                googleDocs.map(doc => (
                  <option key={doc.id} value={doc.id}>
                    {doc.name}
                  </option>
                ))
              )}
            </select>
          </div>
        )}
      </div>

      {/* Embedding Progress Indicator */}
      {embeddingProgress && (
        <div className="mx-6 mb-4 p-4 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-700 rounded-lg">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-medium text-gray-900 dark:text-gray-100">
              🔍 Adding to Search Index...
            </span>
            <span className="text-sm text-gray-600 dark:text-gray-400">
              {embeddingProgress.current} / {embeddingProgress.total}
            </span>
          </div>
          <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2.5">
            <div
              className="bg-blue-600 h-2.5 rounded-full transition-all duration-300"
              style={{ width: `${(embeddingProgress.current / embeddingProgress.total) * 100}%` }}
            />
          </div>
          <p className="text-xs text-gray-600 dark:text-gray-400 mt-2">
            This may take a moment. Embeddings enable semantic search over your snippets.
          </p>
        </div>
      )}

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

                  {/* Tags Section with Inline Management */}
                  <div className="mb-2">
                    {/* Tags and Add Tag Input - All Inline */}
                    <div className="flex flex-wrap items-center gap-1.5">
                      {/* Existing Tags (compact chips with delete and filter) */}
                      {(snippet.tags || []).map((tag, idx) => (
                        <span 
                          key={idx}
                          className="group px-2 py-0.5 text-xs bg-blue-100 dark:bg-blue-900 text-blue-800 dark:text-blue-200 rounded-full flex items-center gap-1"
                        >
                          <span
                            className="cursor-pointer hover:underline"
                            onClick={(e) => {
                              e.stopPropagation();
                              if (!searchTags.includes(tag)) {
                                setSearchTags([...searchTags, tag]);
                              }
                            }}
                            title="Filter by this tag"
                          >
                            {tag}
                          </span>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              setTagToDelete(tag);
                              setSnippetToEdit(snippet.id);
                              setShowDeleteTagConfirm(true);
                            }}
                            className="opacity-60 hover:opacity-100 hover:text-red-600 dark:hover:text-red-400 transition-opacity"
                            title="Remove tag"
                          >
                            ×
                          </button>
                        </span>
                      ))}
                      
                      {/* Inline Tag Autocomplete - Small, 1/3 width */}
                      <div className="inline-block" onClick={(e) => e.stopPropagation()}>
                        <TagAutocomplete
                          existingTags={getAllTags()}
                          currentTags={snippet.tags || []}
                          onAddTag={async (tag) => {
                            await updateSnippet(snippet.id, {
                              tags: [...(snippet.tags || []), tag]
                            });
                            showSuccess(`Added tag "${tag}"`);
                          }}
                          placeholder="+ tag"
                          className="text-xs w-20"
                        />
                      </div>
                    </div>
                  </div>

                  {/* Content Preview */}
                  <div 
                    className="text-sm text-gray-700 dark:text-gray-300 mb-3 max-h-48 overflow-hidden cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-700/50 rounded p-2 -m-2 transition-colors"
                    onClick={() => setViewingSnippet(snippet)}
                  >
                    <div className="line-clamp-6">
                      <MarkdownRenderer content={snippet.content} />
                    </div>
                  </div>

                  {/* Action Buttons */}
                  <div className="flex gap-2">
                    <button
                      onClick={() => handleEditSnippet(snippet)}
                      className="flex-1 px-3 py-2 text-sm bg-gray-100 dark:bg-gray-700 rounded hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors"
                    >
                      Edit
                    </button>
                    {isCastAvailable && (
                      <button
                        onClick={() => {
                          castSnippet({
                            id: snippet.id,
                            content: snippet.content,
                            title: snippet.title,
                            tags: snippet.tags,
                            created: new Date(snippet.timestamp),
                            modified: snippet.updateDate ? new Date(snippet.updateDate) : new Date(snippet.timestamp)
                          });
                          showSuccess(`Casting snippet to ${isCastConnected ? 'TV' : 'Chromecast'}`);
                        }}
                        className="p-2 text-sm bg-purple-600 text-white rounded hover:bg-purple-700 transition-colors"
                        title="Cast to TV"
                      >
                        <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                          <path d="M1 18v3h3c0-1.66-1.34-3-3-3zm0-4v2c2.76 0 5 2.24 5 5h2c0-3.87-3.13-7-7-7zm0-4v2c4.97 0 9 4.03 9 9h2c0-6.08-4.93-11-11-11zm20-7H3c-1.1 0-2 .9-2 2v3h2V5h18v14h-7v2h7c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2z"/>
                        </svg>
                      </button>
                    )}
                  </div>
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
                <div className="flex flex-wrap gap-2 mb-3">
                  {editTags.map(tag => (
                    <span 
                      key={tag}
                      className="px-3 py-1 text-sm bg-blue-100 dark:bg-blue-900 text-blue-800 dark:text-blue-200 rounded-full flex items-center gap-2 group"
                    >
                      {tag}
                      <button
                        onClick={() => {
                          setTagToDelete(tag);
                          setShowDeleteTagConfirm(true);
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

      {/* Tag Delete Confirmation Dialog */}
      <ConfirmDialog
        isOpen={showDeleteTagConfirm}
        title="Remove Tag?"
        message={`Remove tag "${tagToDelete}"?`}
        confirmLabel="Remove Tag"
        cancelLabel="Cancel"
        variant="danger"
        onConfirm={async () => {
          if (tagToDelete) {
            // Check if we're editing a snippet (from edit dialog) or a snippet display
            if (snippetToEdit) {
              // From snippet display - update the snippet
              const snippet = snippets.find(s => s.id === snippetToEdit);
              if (snippet) {
                await updateSnippet(snippetToEdit, {
                  tags: (snippet.tags || []).filter(t => t !== tagToDelete)
                });
                showSuccess(`Removed tag "${tagToDelete}"`);
              }
              setSnippetToEdit(null);
            } else {
              // From edit dialog - update editTags state
              setEditTags(editTags.filter(t => t !== tagToDelete));
            }
            setShowDeleteTagConfirm(false);
            setTagToDelete(null);
          }
        }}
        onCancel={() => {
          setShowDeleteTagConfirm(false);
          setTagToDelete(null);
          setSnippetToEdit(null);
        }}
      />

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
                  {/* TTS Stop Button - Flashing when playing */}
                  {ttsState.isPlaying && (
                    <button
                      onClick={stopTTS}
                      className="px-3 py-1.5 bg-red-600 text-white rounded-lg shadow-md hover:bg-red-700 transition-colors flex items-center gap-2 animate-pulse"
                      title="Stop reading aloud"
                    >
                      <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                        <rect x="6" y="6" width="12" height="12" />
                      </svg>
                      Stop Reading
                    </button>
                  )}
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

            {/* Content - Scrollable with scroll sync */}
            <div 
              ref={viewingScrollRef}
              className="flex-1 overflow-y-auto p-6"
              onScroll={(e) => {
                // Send scroll position to Chromecast if casting this snippet
                if (isCastingSnippet && isCastConnected) {
                  const target = e.currentTarget;
                  const scrollPercentage = (target.scrollTop / (target.scrollHeight - target.clientHeight)) * 100;
                  sendSnippetScrollPosition(scrollPercentage);
                }
              }}
            >
              <div className="text-gray-800 dark:text-gray-200">
                {/* Render as JSON tree if valid JSON, otherwise always use markdown */}
                {(() => {
                  const content = viewingSnippet.content;
                  
                  // First check if it's valid JSON
                  if (isJsonString(content)) {
                    return <JsonOrText content={content} />;
                  }
                  
                  // Otherwise, always render as markdown
                  // Markdown handles plain text gracefully, so this is safe
                  return <MarkdownRenderer content={content} />;
                })()}
              </div>
            </div>

            {/* Footer */}
            <div className="p-4 border-t border-gray-200 dark:border-gray-700 flex justify-between items-center">
              {/* Cast Status */}
              {isCastConnected && isCastingSnippet && (
                <div className="text-sm text-purple-600 dark:text-purple-400 flex items-center gap-2">
                  <svg className="w-4 h-4 animate-pulse" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M1 18v3h3c0-1.66-1.34-3-3-3zm0-4v2c2.76 0 5 2.24 5 5h2c0-3.87-3.13-7-7-7zm0-4v2c4.97 0 9 4.03 9 9h2c0-6.08-4.93-11-11-11zm20-7H3c-1.1 0-2 .9-2 2v3h2V5h18v14h-7v2h7c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2z"/>
                  </svg>
                  Casting to TV
                </div>
              )}
              
              <div className="flex gap-3 ml-auto">
                {isCastAvailable && (
                  <button
                    onClick={() => {
                      castSnippet({
                        id: viewingSnippet.id,
                        content: viewingSnippet.content,
                        title: viewingSnippet.title,
                        tags: viewingSnippet.tags,
                        created: new Date(viewingSnippet.timestamp),
                        modified: viewingSnippet.updateDate ? new Date(viewingSnippet.updateDate) : new Date(viewingSnippet.timestamp)
                      });
                      showSuccess(`Casting snippet to ${isCastConnected ? 'TV' : 'Chromecast'}`);
                    }}
                    className="p-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors"
                    title="Cast to TV"
                  >
                    <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                      <path d="M1 18v3h3c0-1.66-1.34-3-3-3zm0-4v2c2.76 0 5 2.24 5 5h2c0-3.87-3.13-7-7-7zm0-4v2c4.97 0 9 4.03 9 9h2c0-6.08-4.93-11-11-11zm20-7H3c-1.1 0-2 .9-2 2v3h2V5h18v14h-7v2h7c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2z"/>
                    </svg>
                  </button>
                )}
                <ReadButton
                  text={viewingSnippet.content}
                  variant="button"
                  className="px-4 py-2"
                />
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
        </div>
      )}

      {/* Tag Dialog */}
      {showTagDialog && (
        <div className="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center p-4 z-50">
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-2xl w-full max-w-md">
            <div className="p-6 border-b border-gray-200 dark:border-gray-700">
              <h2 className="text-xl font-bold text-gray-900 dark:text-white">
                {tagDialogMode === 'add' ? 'Add Tags' : tagDialogMode === 'remove' ? 'Remove Tags' : 'Filter by Tags'}
              </h2>
              <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
                {tagDialogMode === 'add' 
                  ? 'Select or create tags to add to selected snippets' 
                  : tagDialogMode === 'remove'
                  ? 'Select tags to remove from selected snippets'
                  : 'Select tags to filter snippets'}
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

              {/* Tag Input - Only for Add mode */}
              {tagDialogMode === 'add' && (
                <div className="mb-4">
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    Add New Tag
                  </label>
                  <TagAutocomplete
                    existingTags={getAllTags()}
                    currentTags={selectedTagsForOperation}
                    onAddTag={(tag) => {
                      if (!selectedTagsForOperation.includes(tag)) {
                        setSelectedTagsForOperation([...selectedTagsForOperation, tag]);
                      }
                    }}
                    placeholder="Type to search or create tags..."
                    className="w-full"
                  />
                </div>
              )}

              {/* Existing Tags */}
              {getAllTags().length > 0 && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    {tagDialogMode === 'add' ? 'Or Select Existing' : tagDialogMode === 'remove' ? 'Select Tags to Remove' : 'Select Tags'}
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
                }}
                className="px-4 py-2 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleTagOperation}
                disabled={tagDialogMode !== 'filter' && selectedTagsForOperation.length === 0}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {tagDialogMode === 'add' ? 'Add Tags' : tagDialogMode === 'remove' ? 'Remove Tags' : 'Apply Filter'}
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

      {/* Upload Progress Overlay */}
      {uploadProgress && (
        <div className="fixed inset-0 bg-black bg-opacity-25 flex items-center justify-center z-40">
          <div className="bg-white dark:bg-gray-800 rounded-lg p-6 shadow-xl min-w-[300px]">
            <div className="mb-4">
              <div className="flex justify-between text-sm text-gray-700 dark:text-gray-300 mb-2">
                <span>{uploadProgress.status}</span>
                <span>{uploadProgress.current} / {uploadProgress.total}</span>
              </div>
              <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2">
                <div 
                  className="bg-blue-600 h-2 rounded-full transition-all duration-300"
                  style={{ width: `${(uploadProgress.current / uploadProgress.total) * 100}%` }}
                />
              </div>
            </div>
          </div>
        </div>
      )}

      {/* File Upload Dialog */}
      {showUploadDialog && (
        <FileUploadDialog
          isOpen={showUploadDialog}
          onClose={() => setShowUploadDialog(false)}
          onUpload={handleSingleUpload}
        />
      )}
    </div>
  );
};
