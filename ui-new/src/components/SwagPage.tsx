import React, { useState, useEffect, useRef } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useSwag } from '../contexts/SwagContext';
import { useToast } from './ToastManager';
import { useCast } from '../contexts/CastContext';
import { useTTS } from '../contexts/TTSContext';
import { useAuth } from '../contexts/AuthContext';
import { JsonOrText, isJsonString, parseJsonSafe } from './JsonTree';
import { MarkdownRenderer } from './MarkdownRenderer';
import { MarkdownEditor } from './MarkdownEditor';
// import { StorageStats } from './StorageStats';
import { TagAutocomplete } from './TagAutocomplete';
import { TagAutosuggest } from './TagAutosuggest';
import { ConfirmDialog } from './ConfirmDialog';
import { ReadButton } from './ReadButton';
import { FileUploadDialog } from './FileUploadDialog';
import SnippetShareDialog from './SnippetShareDialog';
import type { ContentSnippet } from '../contexts/SwagContext';
import { 
  createGoogleDocInFolder, 
  listGoogleDocs, 
  appendToGoogleDoc, 
  initGoogleAuth 
} from '../utils/googleDocs';
import type { GoogleDoc } from '../utils/googleDocs';
import { ragDB } from '../utils/ragDB';
import type { SearchResult } from '../utils/ragDB';
import { getCachedApiBase } from '../utils/api';
import { extractImagesFromSnippets, snippetHasImages } from './ImageEditor/extractImages';
import '../styles/markdown-editor.css';

export const SwagPage: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { showSuccess, showError, showWarning } = useToast();
  const { getToken } = useAuth();
  
  // Handler for when user clicks edit button on an individual image
  const handleImageEdit = (imageData: {
    id: string;
    url: string;
    name: string;
    tags: string[];
    snippetId?: string;
    width?: number;
    height?: number;
    format?: string;
    size?: number;
  }) => {
    // Navigate to image editor with single image
    // Pass editingSnippet.id if currently editing a snippet
    navigate('/image-editor', { 
      state: { 
        images: [imageData],
        editingSnippetId: editingSnippet?.id // Pass the editing snippet ID if exists
      } 
    });
  };
  
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
  // storageStats,
    getEmbeddingDetails,
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
  
  // Separate search state for text and vector modes
  const [textSearchQuery, setTextSearchQuery] = useState('');
  const [vectorSearchQuery, setVectorSearchQuery] = useState('');
  const [searchTags, setSearchTags] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [docsLoaded, setDocsLoaded] = useState(false);
  
  // Vector search state
  const [searchMode, setSearchMode] = useState<'text' | 'vector'>('text');
  const [vectorSearchResults, setVectorSearchResults] = useState<SearchResult[]>([]);
  const [isVectorSearching, setIsVectorSearching] = useState(false);
  const [hasRunVectorSearch, setHasRunVectorSearch] = useState(false);
  
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
  
  // Drag and drop state
  const [isDragging, setIsDragging] = useState(false);
  const [_dragCounter, setDragCounter] = useState(0);
  
  // Confirmation dialog state for tag deletion
  const [showDeleteTagConfirm, setShowDeleteTagConfirm] = useState(false);
  
  // Share dialog state
  const [sharingSnippet, setSharingSnippet] = useState<ContentSnippet | null>(null);
  
  // Load RAG config for similarity threshold
  const [_ragConfig, setRagConfig] = useState<{ similarityThreshold?: number }>({});
  
  // Recent tags for desktop quick filter
  const [recentTags, setRecentTags] = useState<string[]>(() => {
    try {
      const stored = localStorage.getItem('swag-recent-tags');
      return stored ? JSON.parse(stored) : [];
    } catch { return []; }
  });
  useEffect(() => {
    localStorage.setItem('swag-recent-tags', JSON.stringify(recentTags.slice(0, 10)));
  }, [recentTags]);
  function addRecentTag(tag: string) {
    setRecentTags(prev => [tag, ...prev.filter(t => t !== tag)].slice(0, 10));
  }
  
  useEffect(() => {
    const loadRagConfig = () => {
      const savedConfig = localStorage.getItem('rag_config');
      if (savedConfig) {
        try {
          setRagConfig(JSON.parse(savedConfig));
        } catch (error) {
          console.error('Failed to parse RAG config:', error);
        }
      }
    };

    // Load on mount
    loadRagConfig();

    // Listen for storage changes (from other tabs or components)
    const handleStorageChange = (e: StorageEvent) => {
      if (e.key === 'rag_config') {
        loadRagConfig();
      }
    };

    window.addEventListener('storage', handleStorageChange);
    
    // Also listen for a custom event we can dispatch when settings change
    const handleConfigChange = () => {
      loadRagConfig();
    };
    window.addEventListener('rag_config_updated', handleConfigChange);

    return () => {
      window.removeEventListener('storage', handleStorageChange);
      window.removeEventListener('rag_config_updated', handleConfigChange);
    };
  }, []);
  const [tagToDelete, setTagToDelete] = useState<string | null>(null);
  const [snippetToEdit, setSnippetToEdit] = useState<string | null>(null);

  // Handle returning from image editor - restore editing dialog if needed
  useEffect(() => {
    const state = location.state as { editingSnippetId?: string } | null;
    if (state?.editingSnippetId) {
      // Find and restore the editing snippet
      const snippet = snippets.find(s => s.id === state.editingSnippetId);
      if (snippet) {
        setEditingSnippet(snippet);
        setEditContent(snippet.content);
        setEditTitle(snippet.title || '');
        setEditTags(snippet.tags || []);
      }
      // Clear the state to prevent re-triggering on subsequent renders
      navigate('/swag', { replace: true, state: {} });
    }
  }, [location.state, snippets, navigate]);
  
  // Embedding status tracking
  const [embeddingStatusMap, setEmbeddingStatusMap] = useState<Record<string, boolean>>({});
  const [checkingEmbedding, setCheckingEmbedding] = useState(false);
  
  // View mode and sorting (NEW)
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  const [sortBy, setSortBy] = useState<'date-new' | 'date-old' | 'title-az' | 'title-za' | 'size'>('date-new');
  
  // Undo state for tag deletion (NEW)
  const [undoTagDeletion, setUndoTagDeletion] = useState<{
    snippetId: string;
    tag: string;
    timestamp: number;
  } | null>(null);
  
  // Ref for scroll tracking in viewing dialog
  const viewingScrollRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    initGoogleAuth().catch(console.error);
    // Only load Google Docs from API if we don't have cached data
    if (googleDocs.length === 0 && !docsLoaded) {
      loadGoogleDocs();
    }
  }, []);

  // Populate embedding status map on load by checking IndexedDB
  useEffect(() => {
    const checkAllEmbeddings = async () => {
      if (snippets.length === 0) return;
      
      console.log('🔍 Checking embedding status for', snippets.length, 'snippets');
      const statusMap: Record<string, boolean> = {};
      for (const snippet of snippets) {
        try {
          const details = await getEmbeddingDetails(snippet.id);
          statusMap[snippet.id] = details.hasEmbedding;
          const title = snippet.title || 'Untitled';
          console.log(`  Snippet "${title.substring(0, 30)}": ${details.hasEmbedding ? '✅ indexed' : '❌ not indexed'}`);
        } catch (error) {
          console.error(`Failed to check embedding for snippet ${snippet.id}:`, error);
          // Don't set status if check fails
        }
      }
      console.log('✅ Embedding status loaded:', Object.keys(statusMap).length, 'snippets checked');
      setEmbeddingStatusMap(statusMap);
    };

    checkAllEmbeddings();
  }, [snippets, getEmbeddingDetails]); // Re-check when snippets change

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

  // Auto-run vector search when switching modes (NEW)
  useEffect(() => {
    if (searchMode === 'vector' && vectorSearchQuery.trim() && !hasRunVectorSearch && !isVectorSearching) {
      console.log('Auto-running vector search on mode switch');
      handleVectorSearch();
    }
  }, [searchMode]);

  // Keyboard shortcuts (NEW)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't trigger shortcuts if user is typing in an input/textarea
      const target = e.target as HTMLElement;
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable) {
        // Exception: Esc key should work even in inputs
        if (e.key === 'Escape') {
          target.blur();
          if (searchMode === 'text') {
            setTextSearchQuery('');
          } else {
            setVectorSearchQuery('');
            setVectorSearchResults([]);
            setHasRunVectorSearch(false);
          }
        }
        return;
      }

      // Ctrl/Cmd + K: Focus search
      if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
        e.preventDefault();
        searchInputRef.current?.focus();
      }

      // Ctrl/Cmd + F: Toggle search mode
      if ((e.ctrlKey || e.metaKey) && e.key === 'f') {
        e.preventDefault();
        setSearchMode(prev => prev === 'text' ? 'vector' : 'text');
        showSuccess(`Switched to ${searchMode === 'text' ? 'Vector' : 'Text'} search mode`);
      }

      // Delete: Delete selected snippets
      if (e.key === 'Delete' && getSelectedSnippets().length > 0) {
        e.preventDefault();
        handleBulkOperation('delete');
      }

      // Ctrl/Cmd + T: Add tags to selected
      if ((e.ctrlKey || e.metaKey) && e.key === 't' && getSelectedSnippets().length > 0) {
        e.preventDefault();
        setShowTagDialog(true);
        setTagDialogMode('add');
        setSelectedTagsForOperation([]);
      }

      // Ctrl/Cmd + M: Merge selected
      if ((e.ctrlKey || e.metaKey) && e.key === 'm' && getSelectedSnippets().length > 1) {
        e.preventDefault();
        handleBulkOperation('merge');
      }

      // Ctrl/Cmd + I: Index selected (add to search)
      if ((e.ctrlKey || e.metaKey) && e.key === 'i' && getSelectedSnippets().length > 0) {
        e.preventDefault();
        handleBulkOperation('generate-embeddings');
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [searchMode, textSearchQuery, vectorSearchQuery, getSelectedSnippets]);

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
      case 'force-embeddings':
        console.log('🔄 Force re-embed case triggered');
        await handleGenerateEmbeddings(true); // Pass force=true
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

  const handleGenerateEmbeddings = async (force: boolean = false) => {
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
        },
        force
      );

      selectNone();
      
      // Update embedding status map based on which snippets were embedded
      // The SwagContext already updates snippet.hasEmbedding, so we just need to sync the UI state
      const updatedStatusMap: Record<string, boolean> = {};
      for (const snippet of selected) {
        // Check IndexedDB directly (no Lambda call)
        const details = await getEmbeddingDetails(snippet.id);
        updatedStatusMap[snippet.id] = details.hasEmbedding;
      }
      setEmbeddingStatusMap(prev => ({ ...prev, ...updatedStatusMap }));
      
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
      const apiUrl = import.meta.env.VITE_LAM || 'http://localhost:3000';
      
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

  // Drag and drop handlers
  const handleDragEnter = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    
    setDragCounter(prev => prev + 1);
    if (e.dataTransfer.items && e.dataTransfer.items.length > 0) {
      setIsDragging(true);
    }
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    
    setDragCounter(prev => {
      const newCount = prev - 1;
      if (newCount === 0) {
        setIsDragging(false);
      }
      return newCount;
    });
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  };

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    
    setIsDragging(false);
    setDragCounter(0);
    
    const files = Array.from(e.dataTransfer.files);
    
    if (files.length > 0) {
      console.log(`📦 Dropped ${files.length} file(s)`);
      await handleUploadDocuments(files, []);
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
    // Create a blank snippet - addSnippet returns the new snippet
    const newSnippet = await addSnippet('', 'user', 'New Snippet');
    
    // Immediately edit the newly created snippet
    if (newSnippet) {
      handleEditSnippet(newSnippet);
    }
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

  const handleVectorSearch = async () => {
    if (!vectorSearchQuery.trim() || searchMode !== 'vector') {
      return;
    }
    
    setIsVectorSearching(true);
    try {
      let embedding: number[];
      
      // Check cache first
      const cached = await ragDB.getCachedQueryEmbedding(vectorSearchQuery.trim());
      if (cached) {
        console.log('✅ Using cached query embedding');
        embedding = cached.embedding;
      } else {
        console.log('🔄 Fetching new query embedding from backend');
        // Get query embedding from backend (use auto-detected API base)
        const apiUrl = await getCachedApiBase();
        const token = await getToken();
        console.log('🌐 Using API URL for embed-query:', apiUrl);
        const response = await fetch(`${apiUrl}/rag/embed-query`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(token ? { 'Authorization': `Bearer ${token}` } : {}),
          },
          body: JSON.stringify({ query: vectorSearchQuery })
        });
        
        if (!response.ok) {
          throw new Error(`Backend error: ${response.status}`);
        }
        
        const data = await response.json();
        embedding = data.embedding;
        
        // Cache the embedding
        const ragConfig = JSON.parse(localStorage.getItem('rag_config') || '{}');
        const embeddingModel = ragConfig.embeddingModel || 'text-embedding-3-small';
        await ragDB.cacheQueryEmbedding(vectorSearchQuery.trim(), embedding, embeddingModel);
        console.log('💾 Cached query embedding for future use');
      }
      
      // Get threshold from settings, default to 0.3 (relaxed for better recall)
      const ragConfig = JSON.parse(localStorage.getItem('rag_config') || '{}');
      const threshold = ragConfig.similarityThreshold ?? 0.3;
      console.log(`🔍 Vector search with threshold: ${threshold}, query: "${vectorSearchQuery}"`);
      
      // Check how many embeddings exist in IndexedDB
      const allChunks = await ragDB.getAllChunks();
      console.log(`📊 Total chunks in IndexedDB: ${allChunks.length}`);
      
      if (allChunks.length === 0) {
        showWarning('No embeddings found in database. Generate embeddings first using "Add to Search Index".');
        setVectorSearchResults([]);
        setHasRunVectorSearch(true);
        return;
      }
      
      // Search locally in IndexedDB
      const results = await ragDB.vectorSearch(embedding, 10, threshold);
      console.log(`🎯 Vector search results:`, {
        resultsCount: results.length,
        threshold,
        scores: results.map(r => r.score.toFixed(3)),
        snippetIds: results.map(r => r.snippet_id)
      });
      
      setVectorSearchResults(results);
      setHasRunVectorSearch(true); // Mark that we've run a vector search
      
      if (results.length === 0) {
        showWarning(`No similar content found with threshold ${threshold}. Try lowering the threshold in RAG settings or generate more embeddings.`);
      } else {
        showSuccess(`Found ${results.length} similar chunks (scores: ${results[0].score.toFixed(3)}-${results[results.length-1].score.toFixed(3)})`);
      }
    } catch (error) {
      console.error('Vector search error:', error);
      showError('Failed to perform vector search. Make sure embeddings are generated.');
    } finally {
      setIsVectorSearching(false);
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

  // Filter snippets based on search mode and query
  const displaySnippets = (() => {
    // Vector search mode
    if (searchMode === 'vector') {
      console.log('🔍 Vector search mode active', {
        hasRunVectorSearch,
        vectorSearchResultsCount: vectorSearchResults.length,
        snippetsCount: snippets.length
      });
      
      // If no search has been run yet, show empty results
      if (!hasRunVectorSearch) {
        console.log('⏸️ No vector search run yet, showing empty');
        return [];
      }
      
      // If search has been run, show the results (even if empty)
      if (vectorSearchResults.length === 0) {
        console.log('📭 Vector search returned no results');
        return []; // Search was run but no results found
      }
      
      // Deduplicate by snippet_id (multiple chunks may match from same snippet)
      const snippetMap = new Map<string, { snippet: ContentSnippet; score: number }>();
      
      console.log('🔄 Processing vector search results:', vectorSearchResults.map(r => ({
        snippet_id: r.snippet_id,
        score: r.score,
        chunk_id: r.chunk_id
      })));
      
      for (const result of vectorSearchResults) {
        const snippet = snippets.find(s => s.id === result.snippet_id);
        
        if (!snippet) {
          console.warn('⚠️ Snippet not found for ID:', result.snippet_id, 'Available IDs:', snippets.map(s => s.id).slice(0, 5));
          continue;
        }
        
        // Apply tag filters if any
        if (searchTags.length > 0) {
          if (!snippet.tags || snippet.tags.length === 0) continue;
          const hasAllTags = searchTags.every(tag => snippet.tags?.includes(tag));
          if (!hasAllTags) continue;
        }
        
        // Keep the highest score for each snippet
        const existing = snippetMap.get(result.snippet_id);
        if (!existing || result.score > existing.score) {
          snippetMap.set(result.snippet_id, { snippet, score: result.score });
        }
      }
      
      // Convert map back to array with score attached
      const finalResults = Array.from(snippetMap.values())
        .map(({ snippet, score }) => ({ ...snippet, _searchScore: score }))
        .sort((a, b) => b._searchScore - a._searchScore);
      
      console.log('✅ Returning vector search results:', finalResults.length, 'snippets');
      return finalResults;
    }
    
    // Text search mode - use original filtering
    return snippets.filter(snippet => {
      // Text search filter
      if (textSearchQuery.trim()) {
        const query = textSearchQuery.toLowerCase();
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
  })();

  // Apply sorting (NEW)
  const sortedSnippets = (() => {
    const snippetsToSort = [...displaySnippets];
    
    switch (sortBy) {
      case 'date-new':
        return snippetsToSort.sort((a, b) => (b.updateDate || b.timestamp) - (a.updateDate || a.timestamp));
      case 'date-old':
        return snippetsToSort.sort((a, b) => (a.updateDate || a.timestamp) - (b.updateDate || b.timestamp));
      case 'title-az':
        return snippetsToSort.sort((a, b) => {
          const titleA = (a.title || '').toLowerCase();
          const titleB = (b.title || '').toLowerCase();
          return titleA.localeCompare(titleB);
        });
      case 'title-za':
        return snippetsToSort.sort((a, b) => {
          const titleA = (a.title || '').toLowerCase();
          const titleB = (b.title || '').toLowerCase();
          return titleB.localeCompare(titleA);
        });
      case 'size':
        return snippetsToSort.sort((a, b) => b.content.length - a.content.length);
      default:
        return snippetsToSort;
    }
  })();

  // Count embedded snippets for progress indicator (NEW)
  const embeddedCount = Object.values(embeddingStatusMap).filter(Boolean).length;

  return (
    <div 
      className="h-screen flex flex-col bg-gray-50 dark:bg-gray-900 relative"
      onDragEnter={handleDragEnter}
      onDragLeave={handleDragLeave}
      onDragOver={handleDragOver}
      onDrop={handleDrop}
    >
      {/* Drag and Drop Overlay */}
      {isDragging && (
        <div className="absolute inset-0 bg-blue-500/20 backdrop-blur-sm z-40 flex items-center justify-center pointer-events-none">
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-2xl p-8 border-4 border-dashed border-blue-500 dark:border-blue-400">
            <div className="flex flex-col items-center gap-4">
              <svg className="w-16 h-16 text-blue-500 dark:text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
              </svg>
              <div className="text-center">
                <p className="text-xl font-bold text-gray-900 dark:text-white">Drop Documents Here</p>
                <p className="text-sm text-gray-600 dark:text-gray-400 mt-2">
                  Upload files to add them as snippets
                </p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Header */}
      <div className="bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 px-4 py-2">
        <div className="flex items-center justify-between gap-4 mb-2">
          <div className="flex items-center gap-3">
            <h1 className="text-lg font-bold text-gray-900 dark:text-white">
              Swag
            </h1>
            <span className="text-xs text-gray-500 dark:text-gray-400">
              {snippets.length} snippet{snippets.length !== 1 ? 's' : ''}
            </span>
          </div>

          <div className="flex items-center gap-3">
            {/* New Snippet Button */}
            <button
              onClick={handleCreateNewSnippet}
              className="p-2 md:px-3 md:py-1.5 text-sm bg-green-600 text-white rounded hover:bg-green-700 transition-colors flex items-center gap-2"
              title="Create a new blank snippet"
              aria-label="New Snippet"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
              <span className="hidden md:inline">New Snippet</span>
            </button>

            {/* Upload Documents Button */}
            <button
              onClick={() => setShowUploadDialog(true)}
              className="p-2 md:px-3 md:py-1.5 text-sm bg-blue-600 text-white rounded hover:bg-blue-700 transition-colors flex items-center gap-2"
              title="Upload documents as snippets (auto-embeds if enabled)"
              aria-label="Upload Documents"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
              </svg>
              <span className="hidden md:inline">Upload Documents</span>
            </button>

            {/* Storage Stats removed */}

            {/* View Mode Toggle (NEW) */}
            {snippets.length > 0 && (
              <div className="flex gap-1 bg-gray-100 dark:bg-gray-700 rounded p-1">
                <button
                  onClick={() => setViewMode('grid')}
                  className={`px-3 py-1.5 text-xs rounded transition-colors ${
                    viewMode === 'grid'
                      ? 'bg-white dark:bg-gray-800 text-blue-600 font-medium shadow-sm'
                      : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200'
                  }`}
                  title="Grid view"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zM14 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z" />
                  </svg>
                </button>
                <button
                  onClick={() => setViewMode('list')}
                  className={`px-3 py-1.5 text-xs rounded transition-colors ${
                    viewMode === 'list'
                      ? 'bg-white dark:bg-gray-800 text-blue-600 font-medium shadow-sm'
                      : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200'
                  }`}
                  title="List view"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
                  </svg>
                </button>
              </div>
            )}

            {/* Sort Dropdown (NEW) */}
            {snippets.length > 0 && (
              <select
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value as any)}
                className="px-3 py-1.5 text-xs border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                title="Sort snippets"
              >
                <option value="date-new">📅 Newest First</option>
                <option value="date-old">📅 Oldest First</option>
                <option value="title-az">🔤 Title A-Z</option>
                <option value="title-za">🔤 Title Z-A</option>
                <option value="size">📏 By Size</option>
              </select>
            )}

            {/* Embedding Progress Indicator (NEW) */}
            {snippets.length > 0 && (
              <div className="flex items-center gap-2 text-xs">
                <span className="text-gray-600 dark:text-gray-400">Search Index:</span>
                <div className="w-32 h-2 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
                  <div 
                    className="h-full bg-green-500 transition-all duration-300"
                    style={{width: `${snippets.length > 0 ? (embeddedCount / snippets.length) * 100 : 0}%`}}
                  />
                </div>
                <span className="text-gray-600 dark:text-gray-400 font-medium">
                  {embeddedCount}/{snippets.length}
                </span>
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

            {/* Search Mode Toggle and Search Bar */}
            <div className="flex gap-2 items-start max-w-2xl">
              {/* Search Mode Toggle */}
              <div className="flex gap-1 bg-gray-100 dark:bg-gray-700 rounded p-1 flex-shrink-0">
                <button
                  onClick={() => {
                    setSearchMode('text');
                    // Don't clear vector results - keep them for when user switches back
                  }}
                  className={`px-3 py-1.5 text-sm rounded transition-colors ${
                    searchMode === 'text'
                      ? 'bg-white dark:bg-gray-800 text-blue-600 font-medium shadow-sm'
                      : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200'
                  }`}
                >
                  Text
                </button>
                <button
                  onClick={() => {
                    setSearchMode('vector');
                    // Keep previous vector search results when switching back
                  }}
                  className={`px-3 py-1.5 text-sm rounded transition-colors ${
                    searchMode === 'vector'
                      ? 'bg-white dark:bg-gray-800 text-blue-600 font-medium shadow-sm'
                      : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200'
                  }`}
                  title="Semantic search using embeddings"
                >
                  🔍 Vector
                </button>
              </div>

              {/* Search Input Area */}
              <div className="flex gap-2 items-center flex-1">
                <div className="relative flex-1">
                  <input
                    type="text"
                    value={searchMode === 'text' ? textSearchQuery : vectorSearchQuery}
                    onChange={(e) => {
                      if (searchMode === 'text') {
                        setTextSearchQuery(e.target.value);
                      } else {
                        setVectorSearchQuery(e.target.value);
                      }
                    }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && searchMode === 'vector') {
                        handleVectorSearch();
                      }
                    }}
                    placeholder={searchMode === 'vector' ? 'Semantic search...' : 'Search snippets...'}
                    className="w-full px-3 py-1.5 pl-8 text-sm border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                  />
                  <svg className="w-4 h-4 absolute left-2.5 top-2 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                  </svg>
                  {(searchMode === 'text' ? textSearchQuery : vectorSearchQuery) && (
                    <button
                      onClick={() => {
                        if (searchMode === 'text') {
                          setTextSearchQuery('');
                        } else {
                          setVectorSearchQuery('');
                          setVectorSearchResults([]);
                          setHasRunVectorSearch(false); // Reset the flag when clearing
                        }
                      }}
                      className="absolute right-2.5 top-2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                  )}
                </div>

                {/* Vector Search Button */}
                {searchMode === 'vector' && (
                  <button
                    onClick={handleVectorSearch}
                    disabled={isVectorSearching || !vectorSearchQuery.trim()}
                    className="px-4 py-1.5 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed text-sm font-medium transition-colors flex-shrink-0"
                  >
                    {isVectorSearching ? 'Searching...' : 'Search'}
                  </button>
                )}
              </div>
            </div>

            {/* Tag Filter Pills (NEW - replaces modal button) */}
            {/* Tag Filter Autosuggest and Recent Pills */}
            <div className="mt-3 flex flex-wrap gap-2 items-center">
              {/* On desktop, show up to 5 recent tags as pills */}
              <span className="text-xs font-medium text-gray-600 dark:text-gray-400">Filter by tag:</span>
              <span className="hidden md:flex gap-1">
                {recentTags.filter(tag => getAllTags().includes(tag)).slice(0, 5).map(tag => {
                  const isActive = searchTags.includes(tag);
                  return (
                    <button
                      key={tag}
                      onClick={() => {
                        if (isActive) setSearchTags(searchTags.filter(t => t !== tag));
                        else setSearchTags([...searchTags, tag]);
                        addRecentTag(tag);
                      }}
                      className={`px-3 py-1 rounded-full text-xs font-medium transition-all ${isActive ? 'bg-blue-600 text-white shadow-md hover:bg-blue-700' : 'bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-300 dark:hover:bg-gray-600'}`}
                      title={`${isActive ? 'Remove' : 'Add'} tag filter`}
                    >
                      {tag}
                    </button>
                  );
                })}
              </span>
              {/* Autosuggest input for all devices */}
              <div className="flex-1 min-w-[180px] max-w-xs">
                <TagAutosuggest
                  allTags={getAllTags()}
                  selectedTags={searchTags}
                  onAdd={tag => {
                    setSearchTags([...searchTags, tag]);
                    addRecentTag(tag);
                  }}
                  placeholder="Add tag to filter..."
                />
              </div>
            </div>
          </div>
        )}

        {/* Bulk Actions Bar - Selection count only (Select All/None moved to floating toolbar) */}
        {snippets.length > 0 && getSelectedSnippets().length > 0 && !viewingSnippet && !editingSnippet && (
          <div className="mt-2 flex items-center justify-end">
            <span className="text-xs text-gray-600 dark:text-gray-400 font-medium">
              {getSelectedSnippets().length} selected
            </span>
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
      <div className="flex-1 overflow-y-auto p-6 pb-32 min-h-0">
        {snippets.length === 0 ? (
          <div className="text-center py-16 px-4">
            <svg className="w-20 h-20 mx-auto mb-6 text-gray-300 dark:text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 8h14M5 8a2 2 0 110-4h14a2 2 0 110 4M5 8v10a2 2 0 002 2h10a2 2 0 002-2V8m-9 4h4" />
            </svg>
            <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-3">
              No Content Snippets Yet
            </h2>
            <p className="text-gray-600 dark:text-gray-400 mb-8 max-w-md mx-auto">
              Start building your knowledge base by capturing content from conversations, documents, or creating new snippets.
            </p>
            <div className="flex gap-3 justify-center flex-wrap">
              <button
                onClick={handleCreateNewSnippet}
                className="px-5 py-2.5 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors flex items-center gap-2 shadow-md"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                </svg>
                Create New Snippet
              </button>
              <button
                onClick={() => setShowUploadDialog(true)}
                className="px-5 py-2.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors flex items-center gap-2 shadow-md"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                </svg>
                Upload Documents
              </button>
            </div>
            <div className="mt-8 pt-8 border-t border-gray-200 dark:border-gray-700">
              <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3">
                💡 Quick Tips
              </h3>
              <ul className="text-sm text-gray-600 dark:text-gray-400 space-y-2 max-w-lg mx-auto text-left">
                <li className="flex items-start gap-2">
                  <span className="text-green-600 dark:text-green-400 mt-0.5">✓</span>
                  <span>Use the <strong>grab button</strong> in chat to save messages as snippets</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-green-600 dark:text-green-400 mt-0.5">✓</span>
                  <span>Upload documents to automatically create searchable snippets</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-green-600 dark:text-green-400 mt-0.5">✓</span>
                  <span>Add snippets to the <strong>Search Index</strong> for semantic search</span>
                </li>
              </ul>
            </div>
          </div>
        ) : displaySnippets.length === 0 ? (
          <div className="text-center py-12 text-gray-500 dark:text-gray-400">
            <svg className="w-16 h-16 mx-auto mb-4 opacity-50" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            <p className="text-lg">No matching snippets</p>
            <p className="text-sm mt-2">Try adjusting your search or tag filters</p>
          </div>
        ) : (
          viewMode === 'grid' ? (
            /* Grid View */
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {sortedSnippets.map(snippet => (
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

                {/* Cast Button - Top Right */}
                {isCastAvailable && (
                  <div className="absolute top-2 right-2">
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
                      className="p-2 text-sm bg-purple-600 text-white rounded-full hover:bg-purple-700 transition-colors shadow-md"
                      title="Cast to TV"
                    >
                      <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                        <path d="M1 18v3h3c0-1.66-1.34-3-3-3zm0-4v2c2.76 0 5 2.24 5 5h2c0-3.87-3.13-7-7-7zm0-4v2c4.97 0 9 4.03 9 9h2c0-6.08-4.93-11-11-11zm20-7H3c-1.1 0-2 .9-2 2v3h2V5h18v14h-7v2h7c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2z"/>
                      </svg>
                    </button>
                  </div>
                )}

                {/* Content */}
                <div className="p-4 pt-10">
                  {/* Source Badge and Similarity Score */}
                  <div className="flex items-center gap-2 mb-2 flex-wrap">
                    <span className={`px-2 py-1 text-xs rounded-full text-white ${getSourceBadgeColor(snippet.sourceType)}`}>
                      {snippet.sourceType}
                    </span>
                    <span className="text-xs text-gray-500 dark:text-gray-400">
                      {new Date(snippet.timestamp).toLocaleString()}
                    </span>
                    {('_searchScore' in snippet) && (
                      <span className="px-2 py-1 text-xs rounded-full bg-green-100 dark:bg-green-900 text-green-800 dark:text-green-200 font-medium">
                        🎯 {(snippet as any)._searchScore.toFixed(3)}
                      </span>
                    )}
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
                            onClick={async (e) => {
                              e.stopPropagation();
                              // Instant deletion with undo (NEW) - use snippet directly from map context
                              const updatedTags = (snippet.tags || []).filter((t: string) => t !== tag);
                              await updateSnippet(snippet.id, { tags: updatedTags });
                              
                              // Set undo state with 5-second timeout
                              const snippetId = snippet.id; // capture for closure
                              const tagToRestore = tag; // capture for closure
                              setUndoTagDeletion({
                                snippetId: snippetId,
                                tag: tagToRestore,
                                timestamp: Date.now()
                              });
                              
                              // Show success message with undo hint
                              showSuccess(`Removed tag "${tag}"`);
                              
                              // Auto-clear undo after 5 seconds
                              setTimeout(() => {
                                setUndoTagDeletion(prev => {
                                  if (prev && prev.snippetId === snippetId && prev.tag === tagToRestore) {
                                    return null;
                                  }
                                  return prev;
                                });
                              }, 5000);
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
                      <MarkdownRenderer 
                        content={snippet.content} 
                        snippetId={snippet.id}
                        snippetTags={snippet.tags || []}
                        onImageEdit={handleImageEdit}
                      />
                    </div>
                  </div>

                  {/* Action Buttons */}
                  <div className="flex gap-2 items-center">
                    {/* TTS Play Button */}
                    <ReadButton text={snippet.content} variant="icon" className="p-1" />
                    
                    {/* Share Button */}
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setSharingSnippet(snippet);
                      }}
                      className="p-2 text-sm bg-blue-500 text-white rounded hover:bg-blue-600 transition-colors"
                      title="Share snippet"
                      aria-label="Share"
                    >
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z" />
                      </svg>
                    </button>
                    
                    {/* Embedding Status Button */}
                    <button
                      onClick={async () => {
                        setCheckingEmbedding(true);
                        try {
                          const details = await getEmbeddingDetails(snippet.id);
                          setEmbeddingStatusMap(prev => ({
                            ...prev,
                            [snippet.id]: details.hasEmbedding
                          }));
                          
                          if (details.hasEmbedding) {
                            const message = `✅ Embeddings found: ${details.chunkCount} chunk${details.chunkCount !== 1 ? 's' : ''}`;
                            showSuccess(message);
                          } else {
                            showWarning('No embeddings found. Use "Add to Search Index" to create them.');
                          }
                        } catch (error) {
                          console.error('Failed to check embedding status:', error);
                          showError('Failed to check embedding status');
                        } finally {
                          setCheckingEmbedding(false);
                        }
                      }}
                      className={`p-2 text-sm rounded transition-colors ${
                        embeddingStatusMap[snippet.id] === true
                          ? 'bg-green-600 text-white hover:bg-green-700' 
                          : embeddingStatusMap[snippet.id] === false
                          ? 'bg-gray-400 text-white hover:bg-gray-500'
                          : 'bg-blue-500 text-white hover:bg-blue-600'
                      }`}
                      title={
                        embeddingStatusMap[snippet.id] === true
                          ? 'Has embeddings (click for details)'
                          : embeddingStatusMap[snippet.id] === false
                          ? 'No embeddings (click to check)'
                          : 'Check embedding status'
                      }
                      disabled={checkingEmbedding}
                    >
                      <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                        <path d="M11 17h2v-6h-2v6zm1-15C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.41 0-8-3.59-8-8s3.59-8 8-8 8 3.59 8 8-3.59 8-8 8zM11 9h2V7h-2v2z"/>
                      </svg>
                    </button>
                    <button
                      onClick={() => handleEditSnippet(snippet)}
                      className="flex-1 p-2 md:px-3 md:py-2 text-sm bg-gray-100 dark:bg-gray-700 rounded hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors flex items-center justify-center gap-1.5"
                      title="Edit snippet"
                      aria-label="Edit"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                      </svg>
                      <span className="hidden md:inline">Edit</span>
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : (
          /* List View */
          <div className="space-y-2">
            {sortedSnippets.map(snippet => (
              <div
                key={snippet.id}
                className={`flex items-center gap-4 p-3 bg-white dark:bg-gray-800 rounded-lg border-2 transition-all hover:shadow-md ${
                  snippet.selected
                    ? 'border-blue-500 ring-2 ring-blue-200 dark:ring-blue-800'
                    : 'border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600'
                }`}
              >
                {/* Selection Checkbox */}
                <input
                  type="checkbox"
                  checked={snippet.selected || false}
                  onChange={() => toggleSelection(snippet.id)}
                  className="w-5 h-5 rounded border-gray-300 text-blue-600 focus:ring-blue-500 cursor-pointer flex-shrink-0"
                />

                {/* Content - Flexible Column */}
                <div className="flex-1 min-w-0 cursor-pointer" onClick={() => setViewingSnippet(snippet)}>
                  <div className="flex items-center gap-2 mb-1">
                    <h3 className="font-semibold text-gray-900 dark:text-white truncate">
                      {snippet.title || 'Untitled'}
                    </h3>
                    <span className={`px-2 py-0.5 text-xs rounded-full text-white flex-shrink-0 ${getSourceBadgeColor(snippet.sourceType)}`}>
                      {snippet.sourceType}
                    </span>
                    {('_searchScore' in snippet) && (
                      <span className="px-2 py-0.5 text-xs rounded-full bg-green-100 dark:bg-green-900 text-green-800 dark:text-green-200 font-medium flex-shrink-0">
                        🎯 {(snippet as any)._searchScore.toFixed(3)}
                      </span>
                    )}
                  </div>
                  <p className="text-sm text-gray-600 dark:text-gray-400 truncate">
                    {snippet.content}
                  </p>
                </div>

                {/* Tags - Compact Pills */}
                <div className="flex gap-1 flex-wrap max-w-xs flex-shrink-0">
                  {(snippet.tags || []).slice(0, 3).map((tag, idx) => (
                    <span
                      key={idx}
                      className="px-2 py-0.5 text-xs bg-blue-100 dark:bg-blue-900 text-blue-800 dark:text-blue-200 rounded-full cursor-pointer hover:bg-blue-200 dark:hover:bg-blue-800"
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
                  ))}
                  {(snippet.tags || []).length > 3 && (
                    <span className="px-2 py-0.5 text-xs text-gray-500 dark:text-gray-400">
                      +{(snippet.tags || []).length - 3}
                    </span>
                  )}
                </div>

                {/* Date and Status */}
                <div className="flex items-center gap-3 flex-shrink-0">
                  <span className="text-xs text-gray-500 dark:text-gray-400 whitespace-nowrap">
                    {new Date(snippet.timestamp).toLocaleDateString()}
                  </span>
                  
                  {/* Embedding Status Button */}
                  <button
                    onClick={async (e) => {
                      e.stopPropagation();
                      setCheckingEmbedding(true);
                      try {
                        const details = await getEmbeddingDetails(snippet.id);
                        setEmbeddingStatusMap(prev => ({
                          ...prev,
                          [snippet.id]: details.hasEmbedding
                        }));
                        
                        if (details.hasEmbedding) {
                          const message = `✅ Embeddings found: ${details.chunkCount} chunk${details.chunkCount !== 1 ? 's' : ''}`;
                          showSuccess(message);
                        } else {
                          showWarning('No embeddings found. Use "Add to Search Index" to create them.');
                        }
                      } catch (error) {
                        console.error('Failed to check embedding status:', error);
                        showError('Failed to check embedding status');
                      } finally {
                        setCheckingEmbedding(false);
                      }
                    }}
                    className={`p-1.5 text-sm rounded transition-colors ${
                      embeddingStatusMap[snippet.id] === true
                        ? 'bg-green-500 text-white hover:bg-green-600' 
                        : embeddingStatusMap[snippet.id] === false
                        ? 'bg-gray-400 text-white hover:bg-gray-500'
                        : 'bg-blue-500 text-white hover:bg-blue-600'
                    }`}
                    title={
                      embeddingStatusMap[snippet.id] === true
                        ? 'Has embeddings (click for details)'
                        : embeddingStatusMap[snippet.id] === false
                        ? 'No embeddings (click to check)'
                        : 'Check embedding status'
                    }
                    disabled={checkingEmbedding}
                  >
                    <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                      <path d="M11 17h2v-6h-2v6zm1-15C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.41 0-8-3.59-8-8s3.59-8 8-8 8 3.59 8 8-3.59 8-8 8zM11 9h2V7h-2v2z"/>
                    </svg>
                  </button>

                  {/* Share Button */}
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setSharingSnippet(snippet);
                    }}
                    className="p-1.5 text-blue-500 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-200 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded transition-colors"
                    title="Share snippet"
                  >
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z" />
                    </svg>
                  </button>

                  {/* Actions Menu */}
                  <button
                    onClick={() => handleEditSnippet(snippet)}
                    className="p-1.5 text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700 rounded transition-colors"
                    title="Edit snippet"
                  >
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 5v.01M12 12v.01M12 19v.01M12 6a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2z" />
                    </svg>
                  </button>
                </div>
              </div>
            ))}
          </div>
        )
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
                <MarkdownEditor
                  value={editContent}
                  onChange={setEditContent}
                  height="calc(100vh - 28rem)"
                  placeholder="Enter markdown content..."
                  preview="live"
                  onImageUpload={async (file: File): Promise<string> => {
                    // Convert image to base64 data URL
                    return new Promise((resolve, reject) => {
                      const reader = new FileReader();
                      reader.onload = () => resolve(reader.result as string);
                      reader.onerror = reject;
                      reader.readAsDataURL(file);
                    });
                  }}
                />
              </div>
            </div>

            {/* Footer */}
            <div className="p-4 border-t border-gray-200 dark:border-gray-700 flex justify-end gap-3">
              <button
                onClick={() => setEditingSnippet(null)}
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
                      className="p-2 md:px-3 md:py-1.5 bg-red-600 text-white rounded-lg shadow-md hover:bg-red-700 transition-colors flex items-center gap-2 animate-pulse"
                      title="Stop reading aloud"
                      aria-label="Stop Reading"
                    >
                      <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                        <rect x="6" y="6" width="12" height="12" />
                      </svg>
                      <span className="hidden md:inline">Stop Reading</span>
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
                  return <MarkdownRenderer 
                    content={content} 
                    snippetId={viewingSnippet.id}
                    snippetTags={viewingSnippet.tags || []}
                    onImageEdit={handleImageEdit}
                  />;
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
                  className="p-2 md:px-4 md:py-2"
                />
                <button
                  onClick={() => {
                    setViewingSnippet(null);
                    handleEditSnippet(viewingSnippet);
                  }}
                  className="p-2 md:px-4 md:py-2 bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors flex items-center gap-1.5"
                  title="Edit"
                  aria-label="Edit"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                  </svg>
                  <span className="hidden md:inline">Edit</span>
                </button>
                <button
                  onClick={() => setViewingSnippet(null)}
                  className="p-2 md:px-4 md:py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors flex items-center gap-1.5"
                  title="Close"
                  aria-label="Close"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                  <span className="hidden md:inline">Close</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Floating Action Toolbar (Updated with Select All/None) */}
  {getSelectedSnippets().length > 0 && !viewingSnippet && !editingSnippet && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 bg-white dark:bg-gray-800 shadow-2xl rounded-full px-4 md:px-6 py-3 flex items-center gap-2 md:gap-4 border-2 border-gray-200 dark:border-gray-700 z-50 animate-in slide-in-from-bottom duration-200 max-w-[95vw] overflow-x-auto">
          {/* Select All/None buttons */}
          <button
            onClick={selectAll}
            className="px-2 md:px-3 py-1.5 text-sm rounded-lg bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors flex items-center gap-1.5 whitespace-nowrap"
            title="Select all snippets (Ctrl+A)"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
            </svg>
            <span className="hidden md:inline">All</span>
          </button>
          <button
            onClick={selectNone}
            className="px-2 md:px-3 py-1.5 text-sm rounded-lg bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors flex items-center gap-1.5 whitespace-nowrap"
            title="Deselect all snippets (Ctrl+D)"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
            <span className="hidden md:inline">None</span>
          </button>
          
          <div className="h-6 w-px bg-gray-300 dark:bg-gray-600" />
          
          <span className="text-sm font-medium text-gray-700 dark:text-gray-300 whitespace-nowrap">
            {getSelectedSnippets().length}
          </span>
          
          <div className="h-6 w-px bg-gray-300 dark:bg-gray-600" />
          
          <button
            onClick={() => handleBulkOperation('generate-embeddings')}
            disabled={isEmbedding}
            className="px-2 md:px-3 py-1.5 text-sm rounded-lg bg-green-600 text-white hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center gap-1.5 whitespace-nowrap"
            title="Add to Search Index (Ctrl+I)"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            <span className="hidden md:inline">Index</span>
          </button>
          <button
            onClick={() => {
              setShowTagDialog(true);
              setTagDialogMode('add');
              setSelectedTagsForOperation([]);
            }}
            className="px-2 md:px-3 py-1.5 text-sm rounded-lg bg-blue-600 text-white hover:bg-blue-700 transition-colors flex items-center gap-1.5 whitespace-nowrap"
            title="Add Tags (Ctrl+T)"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z" />
            </svg>
            <span className="hidden md:inline">Tag</span>
          </button>
          <button
            onClick={() => {
              const selected = getSelectedSnippets();
              const images = extractImagesFromSnippets(selected);
              if (images.length === 0) {
                showWarning('No images found in selected snippets');
                return;
              }
              navigate('/image-editor', { state: { images } });
            }}
            disabled={getSelectedSnippets().filter(snippetHasImages).length === 0}
            className="px-2 md:px-3 py-1.5 text-sm rounded-lg bg-orange-600 text-white hover:bg-orange-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center gap-1.5 whitespace-nowrap"
            title="Edit Images"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
            </svg>
            <span className="hidden md:inline">Edit Images</span>
          </button>
          <button
            onClick={() => handleBulkOperation('merge')}
            disabled={getSelectedSnippets().length < 2}
            className="px-2 md:px-3 py-1.5 text-sm rounded-lg bg-purple-600 text-white hover:bg-purple-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center gap-1.5 whitespace-nowrap"
            title="Merge Snippets (Ctrl+M)"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" />
            </svg>
            <span className="hidden md:inline">Merge</span>
          </button>
          <button
            onClick={() => handleBulkOperation('delete')}
            className="px-2 md:px-3 py-1.5 text-sm rounded-lg bg-red-600 text-white hover:bg-red-700 transition-colors flex items-center gap-1.5 whitespace-nowrap"
            title="Delete Selected (Del)"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
            </svg>
            <span className="hidden md:inline">Delete</span>
          </button>
        </div>
      )}

      {/* Undo Tag Deletion Toast (NEW) */}
      {undoTagDeletion && (
        <div className="fixed bottom-6 right-6 bg-gray-900 dark:bg-gray-800 text-white rounded-lg shadow-2xl px-5 py-3 flex items-center gap-4 border border-gray-700 z-50 animate-in slide-in-from-right duration-200">
          <span className="text-sm">
            Removed tag <strong>"{undoTagDeletion.tag}"</strong>
          </span>
          <button
            onClick={async () => {
              // Restore the tag
              const snippet = snippets.find(s => s.id === undoTagDeletion.snippetId);
              if (snippet) {
                await updateSnippet(undoTagDeletion.snippetId, {
                  tags: [...(snippet.tags || []), undoTagDeletion.tag]
                });
                showSuccess(`Restored tag "${undoTagDeletion.tag}"`);
              }
              setUndoTagDeletion(null);
            }}
            className="px-3 py-1 text-sm bg-white text-gray-900 rounded hover:bg-gray-100 transition-colors font-medium"
          >
            Undo
          </button>
          <button
            onClick={() => setUndoTagDeletion(null)}
            className="text-gray-400 hover:text-white transition-colors"
            title="Dismiss"
          >
            ×
          </button>
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

      {/* Snippet Share Dialog */}
      {sharingSnippet && (
        <SnippetShareDialog
          snippetId={sharingSnippet.id}
          content={sharingSnippet.content}
          title={sharingSnippet.title}
          tags={sharingSnippet.tags}
          sourceType={sharingSnippet.sourceType}
          onClose={() => setSharingSnippet(null)}
        />
      )}
    </div>
  );
};
