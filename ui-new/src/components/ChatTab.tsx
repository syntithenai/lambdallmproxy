import React, { useState, useRef, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../contexts/AuthContext';
import { useSearchResults } from '../contexts/SearchResultsContext';
import { usePlaylist } from '../contexts/PlaylistContext';
import { useSwag } from '../contexts/SwagContext';
import { useSettings } from '../contexts/SettingsContext';
import { useYouTubeAuth } from '../contexts/YouTubeAuthContext';
import { useUsage } from '../contexts/UsageContext';
import { useCast } from '../contexts/CastContext';
import { useLocation } from '../contexts/LocationContext';
import { useTTS } from '../contexts/TTSContext';
import { useToast } from './ToastManager';
import { useLocalStorage } from '../hooks/useLocalStorage';
import { sendChatMessageStreaming, getCachedApiBase } from '../utils/api';
import type { ChatMessage } from '../utils/api';
import { ragDB } from '../utils/ragDB';
import { extractAndSaveSearchResult } from '../utils/searchCache';
import { PlanningDialog } from './PlanningDialog';
import { MarkdownRenderer } from './MarkdownRenderer';
import { TranscriptionProgress, type ProgressEvent } from './TranscriptionProgress';
import { ScrapingProgress } from './ScrapingProgress';
import { SearchProgress } from './SearchProgress';
import { YouTubeSearchProgress, type YouTubeSearchProgressData } from './YouTubeSearchProgress';
import { JavaScriptExecutionProgress } from './JavaScriptExecutionProgress';
import { ImageGenerationProgress } from './ImageGenerationProgress';
import { ChartGenerationProgress } from './ChartGenerationProgress';
import { ExtractionSummary } from './ExtractionSummary';
import { LlmInfoDialogNew } from './LlmInfoDialogNew';
import { ErrorInfoDialog } from './ErrorInfoDialog';
import { FixResponseDialog } from './FixResponseDialog';
import { VoiceInputDialog } from './VoiceInputDialog';
import { ContinuousVoiceMode } from './ContinuousVoiceMode';
import { GeneratedImageBlock } from './GeneratedImageBlock';
import { JsonTree } from './JsonTree';
import { ImageGallery } from './ImageGallery';

import { ToolResultJsonViewer } from './JsonTreeViewer';
import { SnippetSelector } from './SnippetSelector';
import { ReadButton } from './ReadButton';
import ToolTransparency from './ToolTransparency';
import { GenerateChartDisplay } from './GenerateChartDisplay';
import { YouTubeVideoResults } from './YouTubeVideoResults';
import { SearchWebResults } from './SearchWebResults';
import { ExamplesModal } from './ExamplesModal';
import { SystemPromptDisplay } from './chat/SystemPromptDisplay';
import { ChatHeader } from './chat/ChatHeader';
import { FileAttachmentsDisplay } from './chat/FileAttachmentsDisplay';
import { DragDropOverlay } from './chat/DragDropOverlay';
import ShareDialog from './ShareDialog';
import { hasShareData, getShareDataFromUrl, clearShareDataFromUrl } from '../utils/shareUtils';
import { 
  saveChatToHistory, 
  loadChatWithMetadata,
  deleteChatFromHistory, 
  getAllChatHistory,
  clearAllChatHistory,
  type ChatHistoryEntry 
} from '../utils/chatHistory';
import { googleDriveSync } from '../services/googleDriveSync';

interface EnabledTools {
  web_search: boolean;
  execute_js: boolean;
  scrape_url: boolean;
  youtube: boolean;
  transcribe: boolean;
  generate_chart: boolean;
  generate_image: boolean;
  search_knowledge_base: boolean;
  manage_todos: boolean;
  manage_snippets: boolean;
  ask_llm: boolean;
  generate_reasoning_chain: boolean;
}

interface ChatTabProps {
  transferData?: { prompt: string; persona: string } | null;
  enabledTools: EnabledTools;
  setEnabledTools: (tools: EnabledTools) => void;
  showMCPDialog: boolean;
  setShowMCPDialog: (show: boolean) => void;
  onLoadingChange?: (isLoading: boolean) => void;
}

export const ChatTab: React.FC<ChatTabProps> = ({ 
  transferData,
  enabledTools,
  // setEnabledTools, // Not used in ChatTab - only in SettingsModal
  showMCPDialog,
  setShowMCPDialog,
  onLoadingChange
}) => {
  const { t } = useTranslation();
  const { accessToken, user, getToken } = useAuth();
  const { getAccessToken: getYouTubeToken } = useYouTubeAuth();
  const { addSearchResult, clearSearchResults } = useSearchResults();
  const { addTracksToStart } = usePlaylist();
  const { addSnippet, snippets: swagSnippets, syncSnippetFromGoogleSheets } = useSwag();
  const { showError, showWarning, showSuccess, clearAllToasts } = useToast();
  const { settings } = useSettings();
  const { addCost, usage } = useUsage();
  const { state: ttsState, speak: ttsSpeak } = useTTS();
  const { isConnected: isCastConnected, sendMessages: sendCastMessages, sendScrollPosition } = useCast();
  const { location, isLoading: locationLoading, requestLocation, clearLocation } = useLocation();
  
  // Use regular state for messages - async storage causes race conditions
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [messagesLoaded, setMessagesLoaded] = useState(false);
  
  const [input, setInput] = useLocalStorage<string>('chat_input', '');
  const [systemPrompt, setSystemPrompt] = useLocalStorage<string>('chat_system_prompt', '');
  const [isLoading, setIsLoading] = useState(false);
  const [showLoadDialog, setShowLoadDialog] = useState(false);
  const [showClearHistoryConfirm, setShowClearHistoryConfirm] = useState(false);
  const [showPlanningDialog, setShowPlanningDialog] = useState(false);
  const [selectedChatIds, setSelectedChatIds] = useState<Set<string>>(new Set());
  
  // Planning context state (for persistence)
  const [originalPlanningQuery, setOriginalPlanningQuery] = useState<string>('');
  const [generatedSystemPromptFromPlanning, setGeneratedSystemPromptFromPlanning] = useState<string>('');
  const [generatedUserQueryFromPlanning, setGeneratedUserQueryFromPlanning] = useState<string>('');
  
  const [mcpServers, setMcpServers] = useLocalStorage<Array<{
    id: string;
    name: string;
    url: string;
    enabled: boolean;
  }>>('chat_mcp_servers', []);
  
  const [newMCPServer, setNewMCPServer] = useState({ name: '', url: '' });
  const [showExampleServers, setShowExampleServers] = useState(false);
  
  // Example MCP servers for quick setup
  const exampleMCPServers = [
    {
      id: 'joke-server',
      name: 'Joke Server',
      url: 'http://localhost:3100',
      description: 'Get programming, dad, science, animal, and food jokes',
      category: 'Sample',
      instructions: '1. Run: make mcp-install-jokes\n2. Run: make mcp-sample-jokes\n3. Server starts on port 3100',
      tools: ['get_random_joke', 'get_joke_by_id', 'search_jokes', 'get_categories']
    },
    {
      id: 'filesystem',
      name: '@modelcontextprotocol/server-filesystem',
      url: 'https://github.com/modelcontextprotocol/servers/tree/main/src/filesystem',
      description: 'Secure file operations with configurable access controls',
      category: 'Official',
      instructions: 'Install: npx -y @modelcontextprotocol/server-filesystem /path/to/allowed/files',
      tools: ['read_file', 'write_file', 'list_directory', 'search_files']
    },
    {
      id: 'github',
      name: '@modelcontextprotocol/server-github',
      url: 'https://github.com/modelcontextprotocol/servers/tree/main/src/github',
      description: 'Repository management, file operations, commits, issues, PRs',
      category: 'Official',
      instructions: 'Install: npx -y @modelcontextprotocol/server-github\nRequires: GITHUB_PERSONAL_ACCESS_TOKEN',
      tools: ['create_or_update_file', 'search_repositories', 'create_issue', 'create_pull_request']
    },
    {
      id: 'postgres',
      name: '@modelcontextprotocol/server-postgres',
      url: 'https://github.com/modelcontextprotocol/servers/tree/main/src/postgres',
      description: 'Read-only database access for PostgreSQL',
      category: 'Official',
      instructions: 'Install: npx -y @modelcontextprotocol/server-postgres postgresql://user:pass@localhost/db',
      tools: ['query', 'list_tables', 'describe_table', 'append_insight']
    },
    {
      id: 'sqlite',
      name: '@modelcontextprotocol/server-sqlite',
      url: 'https://github.com/modelcontextprotocol/servers/tree/main/src/sqlite',
      description: 'Database interaction, schema inspection, query execution',
      category: 'Official',
      instructions: 'Install: npx -y @modelcontextprotocol/server-sqlite /path/to/database.db',
      tools: ['query', 'list_tables', 'describe_table', 'append_insight']
    },
    {
      id: 'slack',
      name: '@modelcontextprotocol/server-slack',
      url: 'https://github.com/modelcontextprotocol/servers/tree/main/src/slack',
      description: 'Channel management and messaging for Slack',
      category: 'Official',
      instructions: 'Install: npx -y @modelcontextprotocol/server-slack\nRequires: SLACK_BOT_TOKEN',
      tools: ['post_message', 'reply_to_thread', 'add_reaction', 'get_channel_history']
    },
    {
      id: 'brave-search',
      name: '@modelcontextprotocol/server-brave-search',
      url: 'https://github.com/modelcontextprotocol/servers/tree/main/src/brave-search',
      description: 'Web and local search using Brave Search API',
      category: 'Official',
      instructions: 'Install: npx -y @modelcontextprotocol/server-brave-search\nRequires: BRAVE_API_KEY',
      tools: ['brave_web_search', 'brave_local_search']
    },
    {
      id: 'gdrive',
      name: '@modelcontextprotocol/server-gdrive',
      url: 'https://github.com/modelcontextprotocol/servers/tree/main/src/gdrive',
      description: 'File access and search for Google Drive',
      category: 'Official',
      instructions: 'Install: npx -y @modelcontextprotocol/server-gdrive\nRequires: OAuth credentials',
      tools: ['search_files', 'read_file', 'list_files']
    },
    {
      id: 'git',
      name: '@modelcontextprotocol/server-git',
      url: 'https://github.com/modelcontextprotocol/servers/tree/main/src/git',
      description: 'Read, search, and analyze Git repositories',
      category: 'Official',
      instructions: 'Install: npx -y @modelcontextprotocol/server-git',
      tools: ['git_status', 'git_diff', 'git_log', 'git_commit']
    },
    {
      id: 'memory',
      name: '@modelcontextprotocol/server-memory',
      url: 'https://github.com/modelcontextprotocol/servers/tree/main/src/memory',
      description: 'Knowledge graph-based persistent memory system',
      category: 'Official',
      instructions: 'Install: npx -y @modelcontextprotocol/server-memory',
      tools: ['create_entities', 'create_relations', 'search_nodes', 'open_nodes']
    },
    {
      id: 'fetch',
      name: '@modelcontextprotocol/server-fetch',
      url: 'https://github.com/modelcontextprotocol/servers/tree/main/src/fetch',
      description: 'Efficient web content fetching and conversion',
      category: 'Official',
      instructions: 'Install: npx -y @modelcontextprotocol/server-fetch\nOptional: USER_AGENT, IGNORE_ROBOTS_TXT',
      tools: ['fetch']
    }
  ];

  // Notify parent component when loading state changes
  useEffect(() => {
    onLoadingChange?.(isLoading);
  }, [isLoading, onLoadingChange]);
  
  // Tool execution status tracking
  const [toolStatus, setToolStatus] = useState<Array<{
    id: string;
    name: string;
    status: 'starting' | 'executing' | 'complete' | 'error';
    result?: string;
  }>>([]);
  
  const [streamingContent, setStreamingContent] = useState<string>('');
  const [expandedToolMessages, setExpandedToolMessages] = useState<Set<number>>(new Set());
  const [currentStreamingBlockIndex, setCurrentStreamingBlockIndex] = useState<number | null>(null);
  const [showExamplesModal, setShowExamplesModal] = useState(false);
  const [showShareDialog, setShowShareDialog] = useState(false);
  
  // Chat history tracking
  const [currentChatId, setCurrentChatId] = useState<string | null>(null);
  const [chatHistory, setChatHistory] = useState<ChatHistoryEntry[]>([]);
  
  // Transcription progress tracking
  const [transcriptionProgress, setTranscriptionProgress] = useState<Map<string, Array<{
    tool_call_id: string;
    tool_name: string;
    progress_type: string;
    data?: Record<string, unknown>;
    timestamp?: string;
  }>>>(new Map());
  
  // Scraping progress tracking
  const [scrapingProgress, setScrapingProgress] = useState<Map<string, Array<{
    tool_call_id: string;
    tool_name: string;
    progress_type: string;
    data?: Record<string, unknown>;
    timestamp?: string;
  }>>>(new Map());
  
  // Search progress tracking
  const [searchProgress, setSearchProgress] = useState<Map<string, {
    phase: string;
    query?: string;
    queries?: string[];
    service?: string;
    result_count?: number;
    result_index?: number;
    result_total?: number;
    url?: string;
    title?: string;
    content_size?: number;
    fetch_time_ms?: number;
    error?: string;
    timestamp?: string;
  }>>(new Map());
  
  // YouTube search progress tracking
  const [youtubeSearchProgress, setYoutubeSearchProgress] = useState<Map<string, YouTubeSearchProgressData>>(new Map());
  
  // Screen reader live announcements for accessibility
  const [srAnnouncement, setSrAnnouncement] = useState<string>('');
  
  // JavaScript execution progress tracking
  const [javascriptProgress, setJavascriptProgress] = useState<Map<string, {
    tool: string;
    phase: string;
    output?: string;
    code_length?: number;
    timeout_ms?: number;
    output_lines?: number;
    output_number?: number;
    has_result?: boolean;
    error?: string;
    timestamp: string;
  }>>(new Map());
  
  // Image generation progress tracking
  const [imageGenerationProgress, setImageGenerationProgress] = useState<Map<string, {
    tool: string;
    phase: 'analyzing_prompt' | 'quality_selected' | 'selecting_provider' | 'generating' | 'completed' | 'error';
    prompt?: string;
    quality?: string;
    provider?: string;
    model?: string;
    size?: string;
    estimated_cost?: number;
    estimated_seconds?: number;
    remaining_seconds?: number;
    error?: string;
    url?: string;
  }>>(new Map());
  
  // Chart generation progress tracking
  const [chartGenerationProgress, setChartGenerationProgress] = useState<Map<string, {
    tool: string;
    phase: 'preparing' | 'completed';
    chart_type?: string;
    description?: string;
  }>>(new Map());
  
  // Content extraction tracking (for displaying structured data summaries)
  const [extractionData, setExtractionData] = useState<Map<string, {
    phase: string;
    url?: string;
    title?: string;
    format?: string;
    originalLength?: number;
    extractedLength?: number;
    compressionRatio?: number;
    images?: number;
    videos?: number;
    youtube?: number;
    links?: number;
    language?: string;
    duration?: number;
    textLength?: number;
    wordCount?: number;
    warning?: string;
    rawHtml?: string; // Raw HTML from scraping
    timestamp?: string;
  }>>(new Map());
  
  // Search result content viewer dialog
  const [viewingSearchResult, setViewingSearchResult] = useState<{
    result: any;
    index: number;
  } | null>(null);
  
  // Raw HTML viewer dialog for scrape_web_content
  const [viewingRawHtml, setViewingRawHtml] = useState<{
    url: string;
    html: string;
  } | null>(null);
  
  // LLM Info dialog tracking
  const [showLlmInfo, setShowLlmInfo] = useState<number | null>(null);
  
  // Error Info dialog tracking
  const [showErrorInfo, setShowErrorInfo] = useState<number | null>(null);
  
  // Feedback dialog tracking
  const [showFixDialog, setShowFixDialog] = useState<number | null>(null);
  
  // Raw HTML dialog for scrape results
  const [showRawHtml, setShowRawHtml] = useState<{ html: string; url: string } | null>(null);
  
  // Voice input dialog
  const [showVoiceInput, setShowVoiceInput] = useState(false);
  const [continuousVoiceEnabled, setContinuousVoiceEnabled] = useState(false);
  
  // API endpoint for voice input (auto-detected)
  const [apiEndpoint, setApiEndpoint] = useState<string>('');
  
  // Continue button for error recovery
  const [showContinueButton, setShowContinueButton] = useState(false);
  const [continueContext, setContinueContext] = useState<any>(null);
  
  // Request cost tracking
  const [lastRequestCost, setLastRequestCost] = useState<number>(0);
  
  // File attachment state
  const [attachedFiles, setAttachedFiles] = useState<Array<{
    name: string;
    type: string;
    size: number;
    base64: string;
    preview?: string;
  }>>([]);
  const [isDragging, setIsDragging] = useState(false);
  
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  const retryTriggerRef = useRef<boolean>(false);
  const examplesDropdownRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  // Prompt history for up/down arrow navigation
  const [promptHistory, setPromptHistory] = useLocalStorage<string[]>('chat_prompt_history', []);
  const [historyIndex, setHistoryIndex] = useState<number>(-1);
  
  // RAG context integration
  const [useRagContext] = useLocalStorage<boolean>('chat_use_rag', false);
  // TODO: ragSearching state is set but never used - could be used for loading indicator
  // const [ragSearching, setRagSearching] = useState(false);
  const [, setRagSearching] = useState(false); // Keep setter to avoid breaking code that calls it
  const [ragThreshold, setRagThreshold] = useState(0.3); // Default to 0.3 (relaxed for better recall)
  
  // Todos state (backend-managed multi-step workflows)
  const [todosState, setTodosState] = useState<{
    total: number;
    remaining: number;
    current: { id: string | number; description: string; status?: string } | null;
    items: Array<{ id: string | number; description: string; status: string }>;
  } | null>(null);
  const [todosExpanded, setTodosExpanded] = useState(false);
  const [todosResubmitting, setTodosResubmitting] = useState<string | null>(null);
  
  // Snippets panel state
  const [showSnippetsPanel, setShowSnippetsPanel] = useState(false);
  
  // Selected snippets for manual context attachment
  // These snippets will be included in full as context when sending messages
  const [selectedSnippetIds, setSelectedSnippetIds] = useState<Set<string>>(new Set());
  
  // Load RAG threshold from settings
  useEffect(() => {
    const savedConfig = localStorage.getItem('rag_config');
    if (savedConfig) {
      try {
        const config = JSON.parse(savedConfig);
        if (config.similarityThreshold !== undefined) {
          setRagThreshold(config.similarityThreshold);
        }
      } catch (error) {
        console.error('Failed to parse RAG config:', error);
      }
    }
  }, []);
  
  // Countdown timer for image generation
  useEffect(() => {
    // Find the generating phase
    const generatingData = Array.from(imageGenerationProgress.values()).find(
      data => data.phase === 'generating' && data.estimated_seconds
    );
    
    if (!generatingData || generatingData.remaining_seconds === 0) {
      return;
    }
    
    const interval = setInterval(() => {
      setImageGenerationProgress(prev => {
        const newMap = new Map(prev);
        const key = 'img_generating';
        const current = newMap.get(key);
        
        if (current && current.phase === 'generating') {
          const remainingSeconds = current.remaining_seconds ?? current.estimated_seconds ?? 0;
          if (remainingSeconds > 0) {
            newMap.set(key, {
              ...current,
              remaining_seconds: remainingSeconds - 1
            });
          }
        }
        
        return newMap;
      });
    }, 1000);
    
    return () => clearInterval(interval);
  }, [imageGenerationProgress]);

  // Extract provider API keys from settings for image generation
  const providerApiKeys = React.useMemo(() => {
    const keys: {
      openaiApiKey?: string;
      togetherApiKey?: string;
      geminiApiKey?: string;
      replicateApiKey?: string;
    } = {};
    
    settings.providers.forEach(provider => {
      if (provider.enabled && provider.apiKey) {
        switch (provider.type) {
          case 'openai':
            if (!keys.openaiApiKey) keys.openaiApiKey = provider.apiKey;
            break;
          case 'together':
            if (!keys.togetherApiKey) keys.togetherApiKey = provider.apiKey;
            break;
          case 'gemini':
            if (!keys.geminiApiKey) keys.geminiApiKey = provider.apiKey;
            break;
          case 'replicate':
            if (!keys.replicateApiKey) keys.replicateApiKey = provider.apiKey;
            break;
        }
      }
    });
    
    return keys;
  }, [settings.providers]);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  const formatContentWithMedia = (content: string, extractedContent?: ChatMessage['extractedContent']): string => {
    let fullContent = content;

    // Extract inline images and links from markdown content
    const inlineImages: string[] = [];
    const inlineLinks: string[] = [];
    const youtubeLinks: string[] = [];
    
    // Match markdown images: ![alt](url)
    const imageRegex = /!\[([^\]]*)\]\(([^\)]+)\)/g;
    let match;
    while ((match = imageRegex.exec(content)) !== null) {
      if (!inlineImages.includes(match[2])) {
        inlineImages.push(match[2]);
      }
    }
    
    // Match markdown links: [text](url)
    const linkRegex = /\[([^\]]+)\]\(([^\)]+)\)/g;
    while ((match = linkRegex.exec(content)) !== null) {
      const url = match[2];
      // Check if it's a YouTube link
      if (url.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)/)) {
        if (!youtubeLinks.includes(url)) {
          youtubeLinks.push(url);
        }
      } else if (!inlineLinks.includes(url)) {
        inlineLinks.push(url);
      }
    }
    
    // Match HTML images: <img src="url">
    const htmlImageRegex = /<img[^>]+src=["']([^"']+)["'][^>]*>/g;
    while ((match = htmlImageRegex.exec(content)) !== null) {
      if (!inlineImages.includes(match[1])) {
        inlineImages.push(match[1]);
      }
    }
    
    // Match HTML links: <a href="url">
    const htmlLinkRegex = /<a[^>]+href=["']([^"']+)["'][^>]*>([^<]+)<\/a>/g;
    while ((match = htmlLinkRegex.exec(content)) !== null) {
      const url = match[1];
      if (url.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)/)) {
        if (!youtubeLinks.includes(url)) {
          youtubeLinks.push(url);
        }
      } else if (!inlineLinks.includes(url)) {
        inlineLinks.push(url);
      }
    }

    if (!extractedContent) {
      // Even without extractedContent, add sections for inline content
      if (inlineImages.length > 0) {
        fullContent += '\n\n---\n\n## Inline Images\n\n';
        inlineImages.forEach(src => {
          fullContent += `![Image](${src})\n`;
        });
      }
      
      if (youtubeLinks.length > 0) {
        fullContent += '\n\n## Inline YouTube Videos\n\n';
        youtubeLinks.forEach(url => {
          fullContent += `- [YouTube Video](${url})\n`;
          fullContent += `  <iframe width="560" height="315" src="${url.replace('watch?v=', 'embed/')}" frameborder="0" allowfullscreen></iframe>\n\n`;
        });
      }
      
      if (inlineLinks.length > 0) {
        fullContent += '\n\n## Inline Links\n\n';
        inlineLinks.forEach(url => {
          fullContent += `- [${url}](${url})\n`;
        });
      }
      
      return fullContent;
    }

    // Add a separator before extracted content
    fullContent += '\n\n---\n';

    // Add extracted images as markdown with HTML fallback
    if (extractedContent.images && extractedContent.images.length > 0) {
      fullContent += '\n\n## Extracted Images\n\n';
      extractedContent.images.forEach(img => {
        // Add both markdown and HTML for maximum compatibility
        fullContent += `![${img.alt || 'Image'}](${img.src})\n`;
        fullContent += `<img src="${img.src}" alt="${img.alt || 'Image'}" style="max-width:100%;height:auto;" />\n`;
        if (img.source) {
          fullContent += `*Source: [${img.source}](${img.source})*\n\n`;
        }
      });
    }

    // Add YouTube videos with embed codes
    if (extractedContent.youtubeVideos && extractedContent.youtubeVideos.length > 0) {
      fullContent += '\n\n## YouTube Videos\n\n';
      extractedContent.youtubeVideos.forEach(video => {
        fullContent += `### ${video.title || 'YouTube Video'}\n\n`;
        fullContent += `[Watch on YouTube](${video.src})\n\n`;
        // Add embed code
        const embedUrl = video.src.replace('watch?v=', 'embed/').replace('youtu.be/', 'youtube.com/embed/');
        fullContent += `<iframe width="560" height="315" src="${embedUrl}" frameborder="0" allowfullscreen></iframe>\n\n`;
        if (video.source) {
          fullContent += `*Source: [${video.source}](${video.source})*\n\n`;
        }
      });
    }

    // Add other videos with HTML5 video tags
    if (extractedContent.otherVideos && extractedContent.otherVideos.length > 0) {
      fullContent += '\n\n## Videos\n\n';
      extractedContent.otherVideos.forEach(video => {
        fullContent += `### ${video.title || 'Video'}\n\n`;
        fullContent += `[Download Video](${video.src})\n\n`;
        // Add HTML5 video tag
        fullContent += `<video controls style="max-width:100%;height:auto;">\n`;
        fullContent += `  <source src="${video.src}" type="video/mp4">\n`;
        fullContent += `  Your browser does not support the video tag.\n`;
        fullContent += `</video>\n\n`;
        if (video.source) {
          fullContent += `*Source: [${video.source}](${video.source})*\n\n`;
        }
      });
    }

    // Add other media with appropriate HTML tags
    if (extractedContent.media && extractedContent.media.length > 0) {
      fullContent += '\n\n## Media\n\n';
      extractedContent.media.forEach(media => {
        fullContent += `### ${media.type}\n\n`;
        fullContent += `[Download Media](${media.src})\n\n`;
        
        // Add appropriate HTML tag based on media type
        if (media.type.toLowerCase().includes('audio')) {
          fullContent += `<audio controls style="width:100%;">\n`;
          fullContent += `  <source src="${media.src}">\n`;
          fullContent += `  Your browser does not support the audio tag.\n`;
          fullContent += `</audio>\n\n`;
        } else if (media.type.toLowerCase().includes('video')) {
          fullContent += `<video controls style="max-width:100%;height:auto;">\n`;
          fullContent += `  <source src="${media.src}">\n`;
          fullContent += `  Your browser does not support the video tag.\n`;
          fullContent += `</video>\n\n`;
        }
        
        if (media.source) {
          fullContent += `*Source: [${media.source}](${media.source})*\n\n`;
        }
      });
    }

    // Add sources as markdown links with enhanced formatting
    if (extractedContent.sources && extractedContent.sources.length > 0) {
      fullContent += '\n\n## Sources & References\n\n';
      extractedContent.sources.forEach((source, idx) => {
        fullContent += `${idx + 1}. **[${source.title}](${source.url})**\n`;
        if (source.snippet) {
          fullContent += `   > ${source.snippet}\n`;
        }
        fullContent += `   - URL: [${source.url}](${source.url})\n\n`;
      });
    }

    return fullContent;
  };

  const handleGrabImage = async (imageUrl: string, description?: string) => {
    try {
      // Convert image to base64 before storing
      const { imageUrlToBase64 } = await import('../utils/imageUtils');
      const base64Image = await imageUrlToBase64(imageUrl);
      
      // Use description as title if provided, otherwise default to "Image"
      const title = description || 'Image';
      
      // Create HTML with base64 image
      const imageHtml = `<img src="${base64Image}" alt="${title}" style="max-width: 100%; height: auto;" />`;
      await addSnippet(imageHtml, 'assistant', title);
      showSuccess(t('chat.imageAddedToSwag'));
    } catch (error) {
      console.error('Failed to grab image:', error);
      // Fallback to original URL if conversion fails
      const title = description || 'Image';
      const imageHtml = `<img src="${imageUrl}" alt="${title}" style="max-width: 100%; height: auto;" />`;
      await addSnippet(imageHtml, 'assistant', title);
      showSuccess(t('chat.imageAddedWithoutConversion'));
    }
  };

  const handleCaptureContent = async (content: string, sourceType: 'user' | 'assistant' | 'tool', title?: string, extractedContent?: ChatMessage['extractedContent'], toolResults?: any[]) => {
    try {
      // Extract media from tool results if available
      let enhancedExtractedContent = extractedContent;
      
      if (toolResults && toolResults.length > 0) {
        // Extract all media from tool results
        const mediaFromTools = extractMediaFromMessage({ toolResults });
        
        // Merge with existing extractedContent
        if (mediaFromTools.images.length > 0 || mediaFromTools.links.length > 0 || 
            mediaFromTools.youtubeLinks.length > 0 || mediaFromTools.otherMedia.length > 0) {
          
          enhancedExtractedContent = {
            ...extractedContent,
            images: [
              ...(extractedContent?.images || []),
              ...mediaFromTools.images.map(src => ({ src, alt: '', source: '' }))
            ],
            youtubeVideos: [
              ...(extractedContent?.youtubeVideos || []),
              ...mediaFromTools.youtubeLinks.map(yt => ({ src: yt.url, title: yt.title || '', source: yt.url }))
            ],
            otherVideos: [
              ...(extractedContent?.otherVideos || []),
              ...mediaFromTools.otherMedia.filter(m => m.type.includes('video')).map(m => ({ src: m.url, title: '', source: m.url }))
            ],
            media: [
              ...(extractedContent?.media || []),
              ...mediaFromTools.otherMedia.filter(m => m.type.includes('audio')).map(m => ({ src: m.url, type: m.type, source: m.url }))
            ],
            sources: [
              ...(extractedContent?.sources || []),
              ...mediaFromTools.links.map(link => ({ url: link.url, title: link.title || link.url, snippet: '' }))
            ]
          };
        }
      }
      
      // Format content with media
      const formattedContent = formatContentWithMedia(content, enhancedExtractedContent);
      
      // Convert all images in the HTML to base64
      const { convertHtmlImagesToBase64 } = await import('../utils/imageUtils');
      const contentWithBase64Images = await convertHtmlImagesToBase64(formattedContent);
      
      await addSnippet(contentWithBase64Images, sourceType, title);
      showSuccess(t('chat.contentCapturedToSwag'));
    } catch (error) {
      console.error('Failed to capture content with base64 conversion:', error);
      // Fallback to original behavior
      const fullContent = formatContentWithMedia(content, extractedContent);
      await addSnippet(fullContent, sourceType, title);
      showSuccess(t('chat.contentCapturedWithoutConversion'));
    }
  };

  // Store request ID and llmApiCall from voice transcription
  const voiceRequestIdRef = useRef<string | null>(null);
  const voiceLlmApiCallRef = useRef<any | null>(null);

  // Handle voice transcription completion
  const handleVoiceTranscription = (text: string, requestId: string, llmApiCall?: any) => {
    console.log('🎙️ Voice transcription received:', { text, requestId, textLength: text.length, hasLlmApiCall: !!llmApiCall });
    setInput(text); // Update input for display
    voiceRequestIdRef.current = requestId; // Store for use in handleSend
    voiceLlmApiCallRef.current = llmApiCall || null; // Store llmApiCall for transparency
    console.log('🎙️ Voice transcription complete, stored request ID:', requestId);
    // Auto-submit - pass text directly to avoid stale closure
    setTimeout(() => {
      console.log('🎙️ Auto-submitting with transcribed text:', text.substring(0, 50));
      handleSend(text); // Pass text directly instead of relying on state
    }, 150);
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  // Set API endpoint on mount (auto-detect local vs remote)
  useEffect(() => {
    getCachedApiBase().then(url => {
      setApiEndpoint(url);
      console.log('🔗 API endpoint for voice input:', url);
    });
  }, []);

  // Sync messages to Chromecast when connected
  useEffect(() => {
    if (isCastConnected && messages.length > 0) {
      console.log('Syncing messages to Chromecast:', messages.length);
      sendCastMessages(messages);
    }
  }, [messages, isCastConnected, sendCastMessages]);

  // Sync scroll position to Chromecast when connected
  useEffect(() => {
    if (!isCastConnected || !messagesContainerRef.current) return;
    
    const container = messagesContainerRef.current;
    let timeoutId: ReturnType<typeof setTimeout>;
    
    const handleScroll = () => {
      clearTimeout(timeoutId);
      timeoutId = setTimeout(() => {
        if (container && sendScrollPosition) {
          sendScrollPosition(container.scrollTop);
        }
      }, 100); // Debounce scroll events
    };
    
    container.addEventListener('scroll', handleScroll);
    
    return () => {
      container.removeEventListener('scroll', handleScroll);
      clearTimeout(timeoutId);
    };
  }, [isCastConnected, sendScrollPosition]);

  // Close examples dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (examplesDropdownRef.current && !examplesDropdownRef.current.contains(event.target as Node)) {
        setShowExamplesModal(false);
      }
    };

    if (showExamplesModal) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [showExamplesModal]);

  // Auto-submit when retry button is clicked
  useEffect(() => {
    if (retryTriggerRef.current && input.trim() && !isLoading && accessToken) {
      retryTriggerRef.current = false;
      handleSend();
    }
  }, [input]);
  
  // Helper function to handle example selection
  const handleExampleClick = (exampleText: string) => {
    // Abort any ongoing requests first
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    
    // Reset all chat state for a fresh start
    setMessages([]);
    setSystemPrompt(''); // Clear system prompt
    setInput(exampleText);
    setShowExamplesModal(false);
    
    // Clear all tracking states
    setToolStatus([]);
    setStreamingContent('');
    setCurrentStreamingBlockIndex(null);
    setTranscriptionProgress(new Map());
    setScrapingProgress(new Map());
    setSearchProgress(new Map());
    setYoutubeSearchProgress(new Map());
    setViewingSearchResult(null);
    setCurrentChatId(null); // Start a new chat session
    localStorage.removeItem('last_active_chat_id');
    
    // Clear all toast notifications
    clearAllToasts();
    
    // Use setTimeout to ensure React finishes processing state updates
    // before sending the new message (avoids race conditions)
    setTimeout(() => {
      handleSend(exampleText);
    }, 0);
  };

  // Helper to extract text from multimodal content
  const getMessageText = (content: ChatMessage['content']): string => {
    if (typeof content === 'string') return content;
    if (Array.isArray(content)) {
      return content
        .filter(part => part.type === 'text' && part.text)
        .map(part => part.text)
        .join('\n');
    }
    return '';
  };

  // Feedback handlers
  const handlePositiveFeedback = async (messageIndex: number) => {
    try {
      const message = messages[messageIndex];
      const token = await getToken();
      
      if (!token) {
        showError('Please sign in to submit feedback');
        return;
      }
      
      const apiBase = await getCachedApiBase();
      
      const response = await fetch(`${apiBase}/report-error`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          userEmail: user?.email,
          feedbackType: 'positive',
          explanation: '',
          messageData: {
            messageContent: getMessageText(message.content),
            llmApiCalls: message.llmApiCalls || [],
            evaluations: (message as any).evaluations || [],
            conversationThread: messages
          },
          timestamp: new Date().toISOString()
        })
      });

      if (!response.ok) {
        throw new Error('Failed to submit feedback');
      }

      showSuccess('👍 Thank you for the feedback!');
    } catch (error) {
      console.error('Error submitting positive feedback:', error);
      showError('Failed to submit feedback');
    }
  };

  const handleNegativeFeedback = (messageIndex: number) => {
    setShowFixDialog(messageIndex);
  };

  // Helper to extract Mermaid code from message content
  const extractMermaidCode = (content: ChatMessage['content']): string | null => {
    const text = getMessageText(content);
    if (!text) return null;
    
    // Look for code between ```mermaid and ```
    const mermaidMatch = text.match(/```mermaid\s*([\s\S]*?)```/);
    if (mermaidMatch && mermaidMatch[1]) {
      return mermaidMatch[1].trim();
    }
    
    return null;
  };

  // Helper to extract media from tool results in a message
  const extractMediaFromMessage = (message: any) => {
    const media = {
      images: [] as string[],
      links: [] as Array<{ url: string; title?: string }>,
      youtubeLinks: [] as Array<{ url: string; title?: string }>,
      otherMedia: [] as Array<{ url: string; type: string }>
    };
    
    // Extract from tool results if present
    if (message.toolResults) {
      message.toolResults.forEach((result: any) => {
        try {
          const data = typeof result.content === 'string' ? JSON.parse(result.content) : result.content;
          
          // Search web results
          if (data.results && Array.isArray(data.results)) {
            data.results.forEach((r: any) => {
              // Images from search results - handle both string URLs and objects
              if (r.images && Array.isArray(r.images)) {
                r.images.forEach((img: any) => {
                  if (typeof img === 'string') {
                    media.images.push(img);
                  } else if (img && img.src) {
                    media.images.push(img.src);
                  } else if (img && img.url) {
                    media.images.push(img.url);
                  }
                });
              }
              // Links from search results
              if (r.url) {
                media.links.push({ url: r.url, title: r.title });
              }
              // Links from extracted content
              if (r.links && Array.isArray(r.links)) {
                r.links.forEach((link: any) => {
                  if (typeof link === 'string') {
                    media.links.push({ url: link });
                  } else if (link && link.href) {
                    media.links.push({ url: link.href, title: link.text });
                  } else if (link && link.url) {
                    media.links.push({ url: link.url, title: link.text || link.title });
                  }
                });
              }
            });
          }
          
          // YouTube search results
          if (data.videos && Array.isArray(data.videos)) {
            data.videos.forEach((v: any) => {
              if (v.url) {
                media.youtubeLinks.push({ url: v.url, title: v.title });
              }
            });
          }
          
          // Direct images array (from image scraping)
          if (data.images && Array.isArray(data.images)) {
            data.images.forEach((img: any) => {
              if (typeof img === 'string') {
                media.images.push(img);
              } else if (img && img.src) {
                media.images.push(img.src);
              } else if (img && img.url) {
                media.images.push(img.url);
              }
            });
          }
          
          // Images from page_content object (scraped from web pages)
          if (data.page_content?.images && Array.isArray(data.page_content.images)) {
            data.page_content.images.forEach((img: any) => {
              if (typeof img === 'string') {
                media.images.push(img);
              } else if (img && img.src) {
                media.images.push(img.src);
              } else if (img && img.url) {
                media.images.push(img.url);
              }
            });
          }
          
          // Extract images from search results (each result can have page_content.images)
          if (data.results && Array.isArray(data.results)) {
            data.results.forEach((result: any) => {
              if (result.page_content?.images && Array.isArray(result.page_content.images)) {
                result.page_content.images.forEach((img: any) => {
                  if (typeof img === 'string') {
                    media.images.push(img);
                  } else if (img && img.src) {
                    media.images.push(img.src);
                  } else if (img && img.url) {
                    media.images.push(img.url);
                  }
                });
              }
            });
          }
          
        } catch (e) {
          // Skip invalid JSON or non-JSON content
        }
      });
    }
    
    // Deduplicate
    media.images = [...new Set(media.images)].filter(Boolean);
    media.links = Array.from(new Map(media.links.filter(l => l.url).map(l => [l.url, l])).values());
    media.youtubeLinks = Array.from(new Map(media.youtubeLinks.filter(l => l.url).map(l => [l.url, l])).values());
    
    return media;
  };

  // Helper to format cost display
  const formatCost = (cost: number): string => {
    if (cost < 0.0001) return `<$0.0001`;
    if (cost < 0.01) return `$${cost.toFixed(4)}`;
    return `$${cost.toFixed(3)}`;
  };

  // Helper to calculate cost from llmApiCalls using pricing from google-sheets-logger.js
  const calculateCostFromLlmApiCalls = (llmApiCalls: any[]): number => {
    if (!llmApiCalls || llmApiCalls.length === 0) return 0;
    
    // Pricing per 1M tokens (matches src/services/google-sheets-logger.js)
    const pricing: Record<string, { input: number; output: number }> = {
      // Gemini models (free tier)
      'gemini-2.0-flash': { input: 0, output: 0 },
      'gemini-2.5-flash': { input: 0, output: 0 },
      'gemini-2.5-pro': { input: 0, output: 0 },
      'gemini-1.5-flash': { input: 0, output: 0 },
      'gemini-1.5-pro': { input: 0, output: 0 },
      // OpenAI models
      'gpt-4o': { input: 2.50, output: 10.00 },
      'gpt-4o-mini': { input: 0.150, output: 0.600 },
      'gpt-4-turbo': { input: 10.00, output: 30.00 },
      'gpt-4': { input: 30.00, output: 60.00 },
      'gpt-3.5-turbo': { input: 0.50, output: 1.50 },
      'o1-preview': { input: 15.00, output: 60.00 },
      'o1-mini': { input: 3.00, output: 12.00 },
      // Groq models (free tier)
      'llama-3.1-8b-instant': { input: 0, output: 0 },
      'llama-3.3-70b-versatile': { input: 0, output: 0 },
      'llama-3.1-70b-versatile': { input: 0, output: 0 },
      'mixtral-8x7b-32768': { input: 0, output: 0 },
    };

    let totalCost = 0;
    for (const call of llmApiCalls) {
      const model = call.model;
      const usage = call.response?.usage;
      if (!model || !usage) continue;

      const modelPricing = pricing[model] || { input: 0, output: 0 };
      const promptTokens = usage.prompt_tokens || 0;
      const completionTokens = usage.completion_tokens || 0;

      const inputCost = (promptTokens / 1000000) * modelPricing.input;
      const outputCost = (completionTokens / 1000000) * modelPricing.output;
      totalCost += inputCost + outputCost;
    }

    return totalCost;
  };

  // Calculate cost for a single message
  const getMessageCost = (msg: any): number => {
    if (!msg.llmApiCalls || msg.llmApiCalls.length === 0) return 0;
    return calculateCostFromLlmApiCalls(msg.llmApiCalls);
  };

  // Format cost for display
  const formatCostDisplay = (cost: number): string => {
    if (cost === 0) return '$0';
    if (cost < 0.0001) return '<$0.0001';
    if (cost < 0.01) return `$${cost.toFixed(4)}`;
    if (cost < 1) return `$${cost.toFixed(3)}`;
    return `$${cost.toFixed(2)}`;
  };

  // Drag and drop handlers
  const handleDragEnter = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.dataTransfer.types.includes('Files')) {
      setIsDragging(true);
    }
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    // Only hide overlay if leaving the main container
    if (e.currentTarget === e.target) {
      setIsDragging(false);
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
    
    const files = e.dataTransfer.files;
    handleFileSelect(files);
  };

  // Auto-resize textarea to fit content
  const autoResizeTextarea = (textarea: HTMLTextAreaElement | null) => {
    if (textarea) {
      textarea.style.height = 'auto';
      // Set max height to 300px (about 10 lines)
      const maxHeight = 300;
      const newHeight = Math.min(textarea.scrollHeight, maxHeight);
      textarea.style.height = newHeight + 'px';
    }
  };

  // Auto-resize input textarea when content changes
  useEffect(() => {
    autoResizeTextarea(inputRef.current);
  }, [input]);

  // Handle transfer data from planning tab
  useEffect(() => {
    if (transferData) {
      setInput(transferData.prompt);
      if (transferData.persona) {
        setSystemPrompt(transferData.persona);
      }
    }
  }, [transferData]);

  // Handle transfer data from planning page via sessionStorage (more reliable than router state)
  useEffect(() => {
    const planningData = sessionStorage.getItem('planning_transfer_data');
    console.log('🔍 useEffect checking sessionStorage - planningData:', planningData?.substring(0, 100));
    
    if (planningData) {
      console.log('📋 Found planning transfer data in sessionStorage');
      try {
        const transferData = JSON.parse(planningData);
        console.log('📋 Planning transfer data received:', transferData);
        
        // Clear messages and start fresh chat (but preserve prompts we're about to set)
        setMessages([]);
        setCurrentChatId(null);
        localStorage.removeItem('last_active_chat_id');
        clearSearchResults();
        setExpandedToolMessages(new Set());
        setSelectedSnippetIds(new Set());
        
        // Set system prompt if provided
        if (transferData.persona || transferData.generatedSystemPrompt) {
          const systemPromptToUse = transferData.persona || transferData.generatedSystemPrompt;
          setSystemPrompt(systemPromptToUse);
          console.log('📋 Set system prompt from planning:', systemPromptToUse.substring(0, 50) + '...');
        }
        
        // Set user input if provided
        if (transferData.prompt || transferData.generatedUserQuery) {
          const userPromptToUse = transferData.prompt || transferData.generatedUserQuery;
          setInput(userPromptToUse);
          console.log('📋 Set user input from planning:', userPromptToUse.substring(0, 50) + '...');
        }
        
        // Store planning metadata
        if (transferData.planningQuery) {
          setOriginalPlanningQuery(transferData.planningQuery);
        }
        if (transferData.generatedSystemPrompt) {
          setGeneratedSystemPromptFromPlanning(transferData.generatedSystemPrompt);
        }
        if (transferData.generatedUserQuery) {
          setGeneratedUserQueryFromPlanning(transferData.generatedUserQuery);
        }
        
        // Clear the sessionStorage item to prevent re-triggering
        sessionStorage.removeItem('planning_transfer_data');
        
        // Focus input after a short delay
        setTimeout(() => {
          inputRef.current?.focus();
          showSuccess(t('chat.planningTransferred'));
        }, 100);
      } catch (error) {
        console.error('Failed to parse planning transfer data:', error);
        showError(t('chat.failedToTransfer'));
        // Clear bad data
        sessionStorage.removeItem('planning_transfer_data');
      }
    }
  }, []); // Run once on mount

  // Restore shared conversation from URL
  useEffect(() => {
    if (hasShareData()) {
      const shareData = getShareDataFromUrl();
      if (shareData) {
        console.log('🔗 Restoring shared conversation from URL');
        
        // Clear any existing chat
        setMessages([]);
        setCurrentChatId(null);
        localStorage.removeItem('last_active_chat_id');
        clearSearchResults();
        setExpandedToolMessages(new Set());
        setSelectedSnippetIds(new Set());
        
        // Restore messages
        const restoredMessages: ChatMessage[] = shareData.messages.map(msg => ({
          role: msg.role,
          content: msg.content,
          timestamp: msg.timestamp
        }));
        
        setMessages(restoredMessages);
        
        // Restore system prompt if available
        if (shareData.metadata.title) {
          setSystemPrompt(shareData.metadata.title);
        }
        
        // Show truncation warning if applicable
        if (shareData.metadata.truncated) {
          showWarning(
            `This conversation was truncated to fit URL limits. ` +
            `Showing ${shareData.metadata.includedMessageCount} of ${shareData.metadata.originalMessageCount} messages.`
          );
        }
        
        // Clear share data from URL
        clearShareDataFromUrl();
        
        showSuccess('Shared conversation loaded!');
        console.log(`✅ Restored ${restoredMessages.length} messages from share URL`);
      }
    }
  }, []); // Run once on mount

  // Load last active chat on mount
  useEffect(() => {
    if (!messagesLoaded) {
      (async () => {
        try {
          const lastChatId = localStorage.getItem('last_active_chat_id');
          if (lastChatId) {
            console.log('🔄 Attempting to restore last chat:', lastChatId);
            const chatData = await loadChatWithMetadata(lastChatId);
            if (chatData && chatData.messages && chatData.messages.length > 0) {
              // Restore planning metadata
              if (chatData.systemPrompt) {
                setSystemPrompt(chatData.systemPrompt);
              }
              if (chatData.planningQuery) {
                setOriginalPlanningQuery(chatData.planningQuery);
              }
              if (chatData.generatedSystemPrompt) {
                setGeneratedSystemPromptFromPlanning(chatData.generatedSystemPrompt);
              }
              if (chatData.generatedUserQuery) {
                setGeneratedUserQueryFromPlanning(chatData.generatedUserQuery);
              }
              // Restore selected snippet IDs
              if (chatData.selectedSnippetIds && Array.isArray(chatData.selectedSnippetIds)) {
                setSelectedSnippetIds(new Set(chatData.selectedSnippetIds));
                console.log(`📎 Restored ${chatData.selectedSnippetIds.length} attached snippets`);
              }
              
              const loadedMessages = chatData.messages;
              // Filter out any corrupted messages and sanitize _attachments
              const cleanMessages = loadedMessages.map(msg => {
                // Remove _attachments.base64 data to save memory (keep preview only)
                if (msg._attachments && Array.isArray(msg._attachments)) {
                  msg._attachments = msg._attachments.map((att: any) => ({
                    name: att.name || 'file',
                    type: att.type || 'application/octet-stream',
                    size: att.size || 0,
                    preview: att.preview // Keep preview for display
                    // Don't restore base64 data - it's huge and not needed for display
                  }));
                }
                return msg;
              }).filter(msg => msg && msg.role); // Filter out any null/invalid messages
              
              console.log('✅ Restored chat session with planning metadata:', lastChatId, 'with', cleanMessages.length, 'messages');
              setMessages(cleanMessages);
              setCurrentChatId(lastChatId);
            } else {
              console.log('ℹ️ No previous chat to restore');
            }
          }
        } catch (error) {
          console.error('❌ Error loading last chat:', error);
          // Clear the corrupted chat reference
          localStorage.removeItem('last_active_chat_id');
        }
        setMessagesLoaded(true);
      })();
    }
  }, [messagesLoaded]);

  // Auto-save chat history whenever messages change
  useEffect(() => {
    if (messages.length > 0 && messagesLoaded) {
      // If we don't have a chat ID yet, this is a new session
      // Generate ID and save. Otherwise, update existing chat.
      (async () => {
        try {
          const id = await saveChatToHistory(
            messages, 
            currentChatId || undefined,
            {
              systemPrompt: systemPrompt || undefined,
              planningQuery: originalPlanningQuery || undefined,
              generatedSystemPrompt: generatedSystemPromptFromPlanning || undefined,
              generatedUserQuery: generatedUserQueryFromPlanning || undefined,
              selectedSnippetIds: Array.from(selectedSnippetIds) // Convert Set to Array for storage
            }
          );
          if (!currentChatId) {
            setCurrentChatId(id);
          }
          // Save as last active chat
          localStorage.setItem('last_active_chat_id', id);
          console.log('💾 Chat auto-saved with planning metadata:', id);
        } catch (error) {
          console.error('❌ Failed to auto-save chat:', error);
          // Don't throw - just log the error so the UI continues to work
        }
      })();
    }
  }, [messages, currentChatId, messagesLoaded, systemPrompt, originalPlanningQuery, generatedSystemPromptFromPlanning, generatedUserQueryFromPlanning]);

  // Sync chat history to Google Drive (debounced 10 seconds)
  useEffect(() => {
    const isSyncEnabled = () => {
      const token = localStorage.getItem('google_drive_access_token');
      const autoSync = localStorage.getItem('auto_sync_enabled') === 'true';
      return token && token.length > 0 && autoSync;
    };

    if (!isSyncEnabled() || messages.length === 0) return;

    const syncTimeout = setTimeout(async () => {
      try {
        const result = await googleDriveSync.syncChatHistory();
        if (result.success) {
          console.log('✅ Chat history synced to Google Drive');
        }
      } catch (error) {
        console.error('❌ Failed to sync chat history:', error);
      }
    }, 10000); // 10 second debounce

    return () => clearTimeout(syncTimeout);
  }, [messages]);

  // Load chat history list when dialog opens
  useEffect(() => {
    if (showLoadDialog) {
      (async () => {
        const history = await getAllChatHistory();
        setChatHistory(history);
      })();
    }
  }, [showLoadDialog]);

  // Track which tool results we've already processed for YouTube videos
  // Key: tool_call_id or a stable identifier for each tool result
  const processedToolResultsRef = useRef<Set<string>>(new Set());
  
  // Store addTracksToStart in a ref to avoid effect re-running when it changes
  const addTracksToStartRef = useRef(addTracksToStart);
  useEffect(() => {
    addTracksToStartRef.current = addTracksToStart;
  }, [addTracksToStart]);

  // Extract YouTube URLs from messages and add to playlist
  // This runs when messages change - extracts videos from search_youtube tool results
  useEffect(() => {
    // Only process completed assistant messages (not streaming)
    const completedMessages = messages.filter(msg => 
      msg.role === 'assistant' && !msg.isStreaming && msg.toolResults
    );
    
    if (completedMessages.length === 0) return;
    
    const allYoutubeVideos: any[] = [];
    const videoIdsSeen = new Set<string>();
    
    completedMessages.forEach((msg) => {
      // Look for YouTube search results in toolResults
      msg.toolResults?.forEach((toolResult: any) => {
        if (toolResult.name !== 'search_youtube' || !toolResult.content) return;
        
        // Create stable ID for this tool result using tool_call_id
        const toolResultId = toolResult.tool_call_id || `${toolResult.name}-${JSON.stringify(toolResult.content).substring(0, 100)}`;
        
        // Skip if already processed
        if (processedToolResultsRef.current.has(toolResultId)) return;
        
        try {
          const result = typeof toolResult.content === 'string' 
            ? JSON.parse(toolResult.content) 
            : toolResult.content;
          
          if (result.videos && Array.isArray(result.videos)) {
            // Add videos, filtering duplicates within this batch
            result.videos.forEach((video: any) => {
              if (video.videoId && !videoIdsSeen.has(video.videoId)) {
                videoIdsSeen.add(video.videoId);
                allYoutubeVideos.push(video);
              }
            });
            
            // Mark this tool result as processed
            processedToolResultsRef.current.add(toolResultId);
          }
        } catch (e) {
          console.error('[ChatTab] Failed to parse YouTube results:', e);
        }
      });
    });

    // Add YouTube videos to playlist if any found
    if (allYoutubeVideos.length > 0) {
      const tracks = allYoutubeVideos.map((video: any) => ({
        videoId: video.videoId,
        url: video.url,
        title: video.title || 'Untitled Video',
        description: video.description || '',
        duration: video.duration || '',
        channel: video.channel || '',
        thumbnail: video.thumbnail || ''
      }));
      
      console.log(`[ChatTab] Adding ${tracks.length} new YouTube videos to playlist (${processedToolResultsRef.current.size} tool results processed total)`);
      
      // Use ref to avoid dependency on addTracksToStart
      addTracksToStartRef.current(tracks);
      
      // Show success message only for new additions (not bulk history loads)
      // Check if the last message was just added (has YouTube and is not streaming)
      const lastMessage = messages[messages.length - 1];
      if (lastMessage?.role === 'assistant' && !lastMessage.isStreaming) {
        const lastMessageHasNewYouTube = lastMessage.toolResults?.some((tr: any) => 
          tr.name === 'search_youtube' && !processedToolResultsRef.current.has(tr.tool_call_id || '')
        );
        if (lastMessageHasNewYouTube) {
          showSuccess(t('chat.addedToPlaylist', { count: tracks.length, plural: tracks.length !== 1 ? 's' : '' }));
        }
      }
    }
    
    // Limit set size to prevent memory growth (keep last 500 tool result IDs)
    if (processedToolResultsRef.current.size > 500) {
      const arr = Array.from(processedToolResultsRef.current);
      processedToolResultsRef.current = new Set(arr.slice(-500));
    }
  }, [messages, showSuccess]); // Only depend on messages and showSuccess

  const handleStop = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
      
      // Save the partial response with available metadata
      if (currentStreamingBlockIndex !== null && (streamingContent || messages[currentStreamingBlockIndex])) {
        setMessages(prev => {
          const newMessages = [...prev];
          const currentMsg = newMessages[currentStreamingBlockIndex];
          
          if (currentMsg && currentMsg.role === 'assistant') {
            // Finalize the streaming message as "stopped"
            const partialContent = streamingContent || currentMsg.content || '';
            const llmApiCalls = currentMsg.llmApiCalls || [];
            
            // Calculate cost from partial tokens if available
            let partialCost = 0;
            if (llmApiCalls.length > 0) {
              partialCost = calculateCostFromLlmApiCalls(llmApiCalls);
            }
            
            newMessages[currentStreamingBlockIndex] = {
              ...currentMsg,
              content: partialContent + '\n\n_⏹️ Request stopped by user. Partial response shown above._',
              isStreaming: false,
              wasStopped: true, // Flag to indicate this was manually stopped
              llmApiCalls,
              partialCost
            };
            
            // Update total cost
            if (partialCost > 0) {
              addCost(partialCost);
            }
            
            console.log('⏹️ Request stopped. Saved partial response:', {
              contentLength: partialContent.length,
              llmApiCallsCount: llmApiCalls.length,
              partialCost
            });
          }
          
          return newMessages;
        });
        
        setCurrentStreamingBlockIndex(null);
        setStreamingContent('');
      }
      
      setIsLoading(false);
    }
  };

  const buildToolsArray = () => {
    const tools = [];
    
    // Add enabled built-in tools
    if (enabledTools.web_search) {
      tools.push({
        type: 'function',
        function: {
          name: 'search_web',
          description: 'Search the web using DuckDuckGo to find current information, news, articles, and real-time data. USE THIS whenever users ask for current/latest information, news, or anything requiring up-to-date web content. Automatically fetches full page content including images and links from all search results. Returns comprehensive search results with titles, URLs, snippets, full content, images, and links. **CRITICAL: You MUST include relevant URLs from search results in your response using markdown links [Title](URL).**',
          parameters: {
            type: 'object',
            properties: {
              query: { type: 'string', description: 'Search query - be specific and include relevant keywords' },
              limit: { type: 'integer', minimum: 1, maximum: 50, default: 5, description: 'Number of results to return (default: 5)' },
              timeout: { type: 'integer', minimum: 1, maximum: 60, default: 15, description: 'Timeout in seconds for fetching each page' },
              generate_summary: { type: 'boolean', default: true, description: 'Generate an LLM summary of the search results (highly recommended)'}
            },
            required: ['query']
          }
        }
      });
    }
    
    if (enabledTools.execute_js) {
      tools.push({
        type: 'function',
        function: {
          name: 'execute_javascript',
          description: '💻 Execute JavaScript code in a sandbox for: 1) Complex mathematical calculations that require computation (factorial, compound interest, statistics, algorithms), 2) Generating formatted tables/grids (multiplication tables, calendars), 3) Data transformations or array processing, 4) ASCII art or text-based visualizations, 5) Custom algorithms. **DO NOT use for**: simple text output, explanations, or answers you already know. Only use when actual computation adds value.',
          parameters: {
            type: 'object',
            properties: {
              code: { 
                type: 'string', 
                description: 'JavaScript code to execute. Include console.log() to display results.'
              },
              timeout: { 
                type: 'integer', 
                minimum: 1, 
                maximum: 10, 
                default: 5,
                description: 'Execution timeout in seconds (default: 5)'
              }
            },
            required: ['code']
          }
        }
      });
    }
    
    if (enabledTools.scrape_url) {
      tools.push({
        type: 'function',
        function: {
          name: 'scrape_web_content',
          description: 'Fetch and extract readable content from any URL. Excellent for getting detailed information from webpages.',
          parameters: {
            type: 'object',
            properties: {
              url: { type: 'string', description: 'Fully qualified URL to fetch' },
              timeout: { type: 'integer', minimum: 1, maximum: 60, default: 15 }
            },
            required: ['url']
          }
        }
      });
    }
    
    if (enabledTools.youtube) {
      tools.push({
        type: 'function',
        function: {
          name: 'search_youtube',
          description: '🎬 SEARCH/FIND YouTube videos (NOT for transcription). Use when user wants to FIND or SEARCH for videos. **DO NOT USE if user wants to transcribe, get transcript, or extract text from a specific YouTube URL** - use transcribe_url instead. Use search_youtube for: "find YouTube videos about X", "search YouTube for X", "show me videos about X". Returns video titles, descriptions, links, and caption availability. Results are automatically added to a playlist. **CRITICAL: You MUST include ALL video URLs in your response as a formatted markdown list with [Title](URL) format.**',
          parameters: {
            type: 'object',
            properties: {
              query: { 
                type: 'string', 
                description: 'Search query for YouTube videos (e.g., "javascript tutorial", "bach cello suites", "machine learning course")'
              },
              limit: { 
                type: 'integer', 
                minimum: 1, 
                maximum: 50, 
                default: 10, 
                description: 'Maximum number of video results to return (default 10, max 50)'
              },
              order: {
                type: 'string',
                enum: ['relevance', 'date', 'viewCount', 'rating'],
                default: 'relevance',
                description: 'Sort order for results: relevance (default), date (newest first), viewCount (most viewed), rating (highest rated)'
              }
            },
            required: ['query']
          }
        }
      });
    }
    
    if (enabledTools.transcribe) {
      tools.push({
        type: 'function',
        function: {
          name: 'transcribe_url',
          description: '🎙️ **PRIMARY TOOL FOR GETTING VIDEO/AUDIO TEXT CONTENT**: Transcribe audio or video content from URLs using OpenAI Whisper. **MANDATORY USE** when user says: "transcribe", "transcript", "get text from", "what does the video say", "extract dialogue", "convert to text", OR provides a specific YouTube/video URL and asks about its content. **YOUTUBE SUPPORT**: Can transcribe directly from YouTube URLs (youtube.com, youtu.be, youtube.com/shorts). Also supports direct media URLs (.mp3, .mp4, .wav, .m4a, etc.). **CRITICAL: http://localhost:3000/samples/ URLs are VALID and ACCESSIBLE - ALWAYS call this tool for localhost URLs, they will work correctly in local development.** Automatically handles large files by chunking. Shows real-time progress with stop capability. Returns full transcription text.',
          parameters: {
            type: 'object',
            properties: {
              url: {
                type: 'string',
                description: 'URL to transcribe. Can be YouTube URL (youtube.com, youtu.be), direct media URL (.mp3, .mp4, .wav, .m4a, etc.), or localhost URL for local development (http://localhost:3000/samples/...)'
              },
              language: {
                type: 'string',
                pattern: '^[a-z]{2}$',
                description: 'Optional: 2-letter ISO language code (e.g., "en", "es", "fr"). Improves accuracy if known.'
              },
              prompt: {
                type: 'string',
                description: 'Optional: Context or expected words to improve accuracy (e.g., "Technical discussion about AI and machine learning")'
              }
            },
            required: ['url']
          }
        }
      });
    }

    if (enabledTools.generate_chart) {
      tools.push({
        type: 'function',
        function: {
          name: 'generate_chart',
          description: '📊 **PRIMARY TOOL FOR ALL DIAGRAMS, CHARTS, AND VISUALIZATIONS**: Generate professional Mermaid diagrams automatically rendered as interactive SVG in the UI. **MANDATORY USE** when user requests: flowcharts, sequence diagrams, class diagrams, state diagrams, ER diagrams, Gantt charts, pie charts, mindmaps, git graphs, or ANY visual diagram/chart/visualization. **DO NOT use execute_javascript to generate charts - ALWAYS use this tool instead**. Keywords: diagram, chart, flowchart, visualization, graph, workflow, UML, ERD, timeline, mindmap.',
          parameters: {
            type: 'object',
            properties: {
              description: {
                type: 'string',
                description: 'Clear description of what the chart should visualize (e.g., "User login flow", "Database schema for blog platform", "Project timeline")'
              },
              chart_type: {
                type: 'string',
                enum: ['flowchart', 'sequence', 'class', 'state', 'er', 'gantt', 'pie', 'git', 'mindmap'],
                default: 'flowchart',
                description: 'Type of diagram to generate. Choose based on use case: flowchart (processes), sequence (interactions), class (UML), state (FSM), er (database), gantt (timeline), pie (data), git (commits), mindmap (concepts)'
              }
            },
            required: ['description']
          }
        }
      });
    }

    if (enabledTools.generate_image) {
      tools.push({
        type: 'function',
        function: {
          name: 'generate_image',
          description: '🎨 **MANDATORY USE FOR IMAGE REQUESTS**: Generate high-quality AI images immediately using DALL-E 3, Stable Diffusion, or other providers. **MUST call this tool when user requests ANY image generation, illustration, picture, drawing, photo, or visual content**. Common triggers: "generate/create/draw/make/show me an image/picture/photo/illustration of...", "draw a...", "create a cartoon/photo/illustration of...", "visualize...", "show me what... looks like". Supports quality tiers: ultra (photorealistic, $0.08-0.12), high (detailed/artistic, $0.02-0.04), standard (normal illustrations, $0.001-0.002), fast (quick drafts/sketches, <$0.001 - DEFAULT). Images appear automatically in the conversation. DO NOT refuse image generation requests - ALWAYS call this tool.',
          parameters: {
            type: 'object',
            properties: {
              prompt: {
                type: 'string',
                description: 'Detailed description of the image to generate (e.g., "a low resolution image of a cat sitting on a windowsill")'
              },
              quality: {
                type: 'string',
                enum: ['ultra', 'high', 'standard', 'fast'],
                default: 'standard',
                description: 'Quality tier: ultra (photorealistic), high (detailed), standard (illustrations), fast (drafts). Infer from prompt keywords like "low res"=fast, "photorealistic"=ultra, "simple"=standard'
              },
              size: {
                type: 'string',
                enum: ['256x256', '512x512', '1024x1024', '1792x1024', '1024x1792'],
                default: '1024x1024',
                description: 'Image dimensions. Use smaller sizes (256x256, 512x512) for "low res" requests'
              },
              style: {
                type: 'string',
                enum: ['natural', 'vivid'],
                default: 'natural',
                description: 'Style: natural (realistic) or vivid (dramatic). DALL-E 3 only'
              }
            },
            required: ['prompt']
          }
        }
      });
    }
    
    if (enabledTools.search_knowledge_base) {
      tools.push({
        type: 'function',
        function: {
          name: 'search_knowledge_base',
          description: '📚 **SEARCH INTERNAL KNOWLEDGE BASE**: Perform vector similarity search against the ingested documentation and knowledge base. **USE THIS when user asks about**: project documentation, API references, implementation guides, architecture, deployment procedures, RAG system, embedding models, or any topics covered in the knowledge base. **EXCELLENT for**: finding specific code examples, configuration details, API endpoints, best practices, and technical documentation. Returns relevant text chunks with source file names and similarity scores. **Always use this BEFORE search_web when the question might be answered by internal documentation.**',
          parameters: {
            type: 'object',
            properties: {
              query: {
                type: 'string',
                description: 'Natural language search query. Be specific and include key terms. Examples: "How do I configure OpenAI embeddings?", "What is the RAG implementation?", "How to deploy Lambda functions?"'
              },
              top_k: {
                type: 'integer',
                minimum: 1,
                maximum: 20,
                default: 5,
                description: 'Number of most relevant results to return (default: 5, max: 20)'
              },
              threshold: {
                type: 'number',
                minimum: 0,
                maximum: 1,
                default: 0.3,
                description: 'Minimum similarity score threshold (0-1). Higher values = more strict matching. Default: 0.3 (relaxed for better recall)'
              },
              source_type: {
                type: 'string',
                enum: ['file', 'url', 'text'],
                description: 'Optional: Filter results by source type (file, url, or text)'
              }
            },
            required: ['query']
          }
        }
      });
    }
    
    if (enabledTools.manage_todos) {
      tools.push({
        type: 'function',
        function: {
          name: 'manage_todos',
          description: '✅ **MANAGE BACKEND TODO QUEUE**: Add or delete actionable steps for multi-step tasks. The backend maintains a server-side todo queue that tracks progress through complex workflows. When todos exist, they auto-progress after each successful completion (assessor "OK"). **USE THIS when**: user requests a multi-step plan, breaking down complex tasks, tracking implementation progress, or managing sequential workflows. **DO NOT use for simple single-step tasks.** After adding todos, the system will automatically advance through them, appending each next step as it completes. **Keywords**: plan, steps, todo list, break down task, multi-step workflow, implementation phases.',
          parameters: {
            type: 'object',
            properties: {
              add: {
                type: 'array',
                items: { type: 'string' },
                description: 'Array of todo descriptions to add to the queue. Descriptions should be clear, actionable steps in order. Example: ["Install dependencies", "Configure environment", "Run tests", "Deploy application"]'
              },
              delete: {
                type: 'array',
                items: {
                  oneOf: [
                    { type: 'string', description: 'Exact todo description to delete' },
                    { type: 'number', description: 'Todo ID to delete' }
                  ]
                },
                description: 'Array of todo IDs (numbers) or exact descriptions (strings) to remove from the queue'
              }
            },
            additionalProperties: false
          }
        }
      });
    }
    
    if (enabledTools.manage_snippets) {
      tools.push({
        type: 'function',
        function: {
          name: 'manage_snippets',
          description: '📝 **MANAGE KNOWLEDGE SNIPPETS**: Insert, retrieve, search, or delete knowledge snippets stored in your personal Google Sheet ("Research Agent/Research Agent Swag"). Use this to save important information, code examples, procedures, references, or any content you want to preserve and search later. **USE THIS when**: user wants to save/capture content, create a knowledge base, store code snippets, bookmark important info, or search previous saved content. Each snippet can have a title, content, tags for organization, and source tracking (chat/url/file/manual). **Keywords**: save this, remember this, add to knowledge base, store snippet, save for later, search my snippets, find my notes.',
          parameters: {
            type: 'object',
            required: ['action'],
            properties: {
              action: {
                type: 'string',
                enum: ['insert', 'capture', 'get', 'search', 'delete'],
                description: 'Operation to perform: "insert" (add new snippet), "capture" (save from chat/url/file), "get" (retrieve by ID/title), "search" (find by query/tags), "delete" (remove by ID/title)'
              },
              payload: {
                type: 'object',
                description: 'Action-specific parameters',
                properties: {
                  // Insert/Capture fields
                  title: { type: 'string', description: 'Snippet title (required for insert/capture)' },
                  content: { type: 'string', description: 'Snippet content/body (required for insert)' },
                  tags: { 
                    type: 'array', 
                    items: { type: 'string' },
                    description: 'Array of tags for categorization (optional, e.g., ["javascript", "async", "tutorial"])'
                  },
                  source: { 
                    type: 'string',
                    enum: ['chat', 'url', 'file', 'manual'],
                    description: 'Source type (for capture action)'
                  },
                  url: { type: 'string', description: 'Source URL if source="url"' },
                  
                  // Get/Delete fields
                  id: { type: 'number', description: 'Snippet ID (for get/delete)' },
                  
                  // Search fields
                  query: { type: 'string', description: 'Text search query (searches title and content)' }
                }
              }
            },
            additionalProperties: false
          }
        }
      });
    }
    
    // Add enabled MCP servers (placeholder - would need MCP integration)
    mcpServers.filter(server => server.enabled).forEach(server => {
      // MCP servers would be added here when backend supports them
      console.log('MCP Server enabled:', server.name, server.url);
    });
    
    return tools;
  };

  // Stop transcription function
  const handleStopTranscription = async (toolCallId: string) => {
    try {
      const LAMBDA_URL = 'https://nrw7pperjjdswbmqgmigbwsbyi0rwdqf.lambda-url.us-east-1.on.aws';
      const response = await fetch(`${LAMBDA_URL}/stop-transcription`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${accessToken}`
        },
        body: JSON.stringify({ tool_call_id: toolCallId })
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to stop transcription');
      }

      showSuccess(t('chat.transcriptionStopped'));
      console.log('Transcription stopped:', toolCallId);
    } catch (error) {
      console.error('Failed to stop transcription:', error);
      showError(t('chat.failedToStopTranscription'));
    }
  };

  // File upload helper functions
  const resizeImage = (file: File, maxSize: number = 2048): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        const img = new Image();
        img.onload = () => {
          const canvas = document.createElement('canvas');
          let width = img.width;
          let height = img.height;

          // Calculate new dimensions
          if (width > height && width > maxSize) {
            height = (height / width) * maxSize;
            width = maxSize;
          } else if (height > maxSize) {
            width = (width / height) * maxSize;
            height = maxSize;
          }

          canvas.width = width;
          canvas.height = height;
          const ctx = canvas.getContext('2d');
          ctx?.drawImage(img, 0, 0, width, height);

          // Convert to base64 with quality compression
          const base64 = canvas.toDataURL(file.type || 'image/jpeg', 0.85);
          resolve(base64.split(',')[1]); // Remove data:image/...;base64, prefix
        };
        img.onerror = reject;
        img.src = e.target?.result as string;
      };
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  };

  const handleFileSelect = async (files: FileList | null) => {
    if (!files || files.length === 0) return;

    const MAX_IMAGE_SIZE = 5 * 1024 * 1024; // 5MB
    const MAX_PDF_SIZE = 10 * 1024 * 1024; // 10MB
    const SUPPORTED_TYPES = ['image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp', 'application/pdf'];

    for (let i = 0; i < files.length; i++) {
      const file = files[i];

      // Validate file type
      if (!SUPPORTED_TYPES.includes(file.type)) {
        showWarning(t('chat.fileTypeNotSupported', { name: file.name }));
        continue;
      }

      // Validate file size
      const maxSize = file.type === 'application/pdf' ? MAX_PDF_SIZE : MAX_IMAGE_SIZE;
      if (file.size > maxSize) {
        showWarning(t('chat.fileTooLarge', { 
          name: file.name, 
          size: (file.size / 1024 / 1024).toFixed(2), 
          maxSize: maxSize / 1024 / 1024 
        }));
        continue;
      }

      try {
        let base64Data: string;
        let preview: string | undefined;

        if (file.type.startsWith('image/')) {
          // Resize and compress image
          base64Data = await resizeImage(file);
          preview = `data:${file.type};base64,${base64Data}`;
          
          // Check token estimate (rough: 1 image ≈ 765 tokens for low detail, 2000+ for high detail)
          const estimatedTokens = base64Data.length / 1000; // Very rough estimate
          if (estimatedTokens > 20000) {
            showWarning(t('chat.imageTokenWarning', { 
              name: file.name, 
              tokens: Math.round(estimatedTokens / 1000) 
            }));
          }
        } else {
          // PDF - read as base64
          const reader = new FileReader();
          base64Data = await new Promise<string>((resolve, reject) => {
            reader.onload = (e) => {
              const result = e.target?.result as string;
              resolve(result.split(',')[1]);
            };
            reader.onerror = reject;
            reader.readAsDataURL(file);
          });
        }

        setAttachedFiles(prev => [...prev, {
          name: file.name,
          type: file.type,
          size: file.size,
          base64: base64Data,
          preview
        }]);

        showSuccess(t('chat.fileAdded', { name: file.name }));
      } catch (error) {
        console.error('Error processing file:', error);
        showError(t('chat.failedToProcess', { name: file.name }));
      }
    }
  };

  const removeAttachment = (index: number) => {
    setAttachedFiles(prev => prev.filter((_, i) => i !== index));
  };

  const handleSend = async (messageText?: string) => {
    const textToSend = messageText !== undefined ? messageText : input;
    if (!textToSend.trim() && attachedFiles.length === 0) return;
    if (isLoading) return;
    
    // Check authentication before sending
    if (!accessToken) {
      showError(t('chat.signInToSendMessages'));
      return;
    }

    // Create user message with multimodal content if there are attachments
    let userMessage: ChatMessage;
    if (attachedFiles.length > 0) {
      // OpenAI vision format with content array
      const contentParts: any[] = [
        { type: 'text', text: textToSend || 'Please analyze these files.' }
      ];
      
      // Add image/file attachments
      for (const file of attachedFiles) {
        if (file.type && file.type.startsWith('image/')) {
          contentParts.push({
            type: 'image_url',
            image_url: {
              url: `data:${file.type};base64,${file.base64}`,
              detail: 'auto' // Let the API choose optimal detail level
            }
          });
        } else if (file.type === 'application/pdf') {
          // For PDFs, we'll need server-side processing
          // For now, add as text note (backend will need to handle this)
          contentParts.push({
            type: 'text',
            text: `[PDF attachment: ${file.name}]`
          });
        }
      }
      
      userMessage = {
        role: 'user',
        content: contentParts,
        _attachments: attachedFiles // Store for UI display
      };
    } else {
      userMessage = { role: 'user', content: textToSend };
    }
    
    // Add voice transcription llmApiCall if available
    if (voiceLlmApiCallRef.current) {
      userMessage.llmApiCalls = [voiceLlmApiCallRef.current];
      console.log('🎙️ Added voice transcription llmApiCall to user message');
      voiceLlmApiCallRef.current = null; // Clear after use
    }
    
    console.log('🔵 Adding user message:', typeof userMessage.content === 'string' ? userMessage.content.substring(0, 50) : `${attachedFiles.length} attachments`);
    
    // Track the index where the user message will be added (for retry functionality)
    let currentUserMessageIndex: number = messages.length; // Initialize with current length
    setMessages(prev => {
      console.log('🔵 Current messages count before adding user:', prev.length);
      currentUserMessageIndex = prev.length; // User message will be at this index
      const newMessages = [...prev, userMessage];
      console.log('🔵 Messages after adding user:', newMessages.length, 'User message at index:', currentUserMessageIndex);
      return newMessages;
    });
    
    // Save to history (avoid duplicates and limit to last 50)
    const trimmedInput = textToSend.trim();
    if (trimmedInput) {
      setPromptHistory(prev => {
        const filtered = prev.filter(h => h !== trimmedInput);
        const newHistory = [trimmedInput, ...filtered].slice(0, 50);
        return newHistory;
      });
    }
    
    setInput('');
    setHistoryIndex(-1);
    setAttachedFiles([]); // Clear attachments after sending
    setSelectedSnippetIds(new Set()); // Clear attached snippets after sending
    setIsLoading(true);
    setToolStatus([]);
    setStreamingContent('');
    setLastRequestCost(0); // Reset cost for new request
    // Clear expanded tool messages so new tool calls start collapsed
    setExpandedToolMessages(new Set());
    // Clear progress from previous searches
    setSearchProgress(new Map());
    setYoutubeSearchProgress(new Map());
    setTranscriptionProgress(new Map());
    setScrapingProgress(new Map());
    setExtractionData(new Map());

    // RAG Context Integration: Search for relevant context if enabled
    let ragContextMessage: ChatMessage | null = null;
    if (useRagContext && textToSend.trim()) {
      setRagSearching(true);
      try {
        // Check for cached query embedding first
        let embedding: number[];
        const cached = await ragDB.getCachedQueryEmbedding(textToSend.trim());
        if (cached) {
          console.log('✅ Using cached query embedding');
          embedding = cached.embedding;
        } else {
          console.log('🔄 Fetching new query embedding from backend');
          // Get query embedding from backend (use auto-detected API base)
          const apiUrl = await getCachedApiBase();
          const token = await getToken();
          const embedResponse = await fetch(`${apiUrl}/rag/embed-query`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              ...(token ? { 'Authorization': `Bearer ${token}` } : {}),
            },
            body: JSON.stringify({ 
              query: textToSend,
              embeddingModel: settings.embeddingModel,
              providers: settings.providers
            })
          });
          
          if (!embedResponse.ok) {
            throw new Error('Failed to get query embedding');
          }
          
          const embeddingData = await embedResponse.json();
          embedding = embeddingData.embedding;
          
          // Cache the embedding for future use
          const embeddingModel = embeddingData.model || 'unknown';
          await ragDB.cacheQueryEmbedding(textToSend.trim(), embedding, embeddingModel);
          console.log('💾 Cached query embedding for future use');
        }
        
        if (embedding) {
          
          console.log(`🔍 RAG search with threshold: ${ragThreshold}`);
          
          // Search locally in IndexedDB using configured threshold
          const results = await ragDB.vectorSearch(embedding, 5, ragThreshold);
          
          if (results.length > 0) {
            // Format RAG context as a system message
            let contextText = '**KNOWLEDGE BASE CONTEXT:**\n\nThe following information from the user\'s knowledge base may be relevant to this query:\n\n';
            
            for (let idx = 0; idx < results.length; idx++) {
              const result = results[idx];
              contextText += `**[Context ${idx + 1} - Similarity: ${result.score.toFixed(3)}]**\n`;
              contextText += `${result.chunk_text}\n\n`;
              
              // Try to get metadata for this snippet
              try {
                const details = await ragDB.getEmbeddingDetails(result.snippet_id);
                if (details.metadata) {
                  contextText += `*Source: ${details.metadata.source_type || 'Unknown'}`;
                  if (details.metadata.title) {
                    contextText += ` - "${details.metadata.title}"`;
                  }
                  contextText += `*\n\n`;
                }
              } catch (e) {
                // Metadata not available, skip
              }
              
              contextText += '---\n\n';
            }
            
            contextText += `**USER QUESTION:** ${textToSend}\n\n`;
            contextText += `Please answer the user's question using the context provided above. If the context is relevant, reference it in your answer. If the context is not helpful, you may answer based on your general knowledge.`;
            
            ragContextMessage = {
              role: 'system',
              content: contextText
            };
            
            showSuccess(t('chat.foundRelevantChunks', { count: results.length }));
          } else {
            showWarning(t('chat.noRelevantContext'));
          }
        }
      } catch (error) {
        console.error('RAG context error:', error);
        showWarning(t('chat.failedToRetrieveRag'));
      } finally {
        setRagSearching(false);
      }
    }

    // Create new abort controller
    abortControllerRef.current = new AbortController();

    // Build tools array from enabled tools
    const tools = buildToolsArray();

    // Set a client-side timeout (4 minutes) to prevent Lambda timeout
    let timeoutId: ReturnType<typeof setTimeout> | null = null;
    if (tools.length > 0) {
      timeoutId = setTimeout(() => {
        if (abortControllerRef.current) {
          console.warn('Request timeout - aborting after 4 minutes due to tool execution');
          abortControllerRef.current.abort();
        }
      }, 240000); // 4 minutes
    }

    try {
      // Get current date and time
      const now = new Date();
      const dateStr = now.toLocaleDateString('en-US', { 
        weekday: 'long', 
        year: 'numeric', 
        month: 'long', 
        day: 'numeric' 
      });
      const timeStr = now.toLocaleTimeString('en-US', { 
        hour: '2-digit', 
        minute: '2-digit', 
        second: '2-digit',
        timeZoneName: 'short'
      });
      const isoStr = now.toISOString();
      const currentDateTime = `${dateStr}, ${timeStr} (ISO: ${isoStr})`;
      
      // Build system prompt with default and tool suggestions
      let finalSystemPrompt = systemPrompt.trim() || 'You are a helpful assistant';
      
      // CRITICAL: If this is a planning-generated system prompt, use it as-is with minimal modifications
      // Planning prompts already contain specific execution instructions and shouldn't have standard tool usage rules appended
      const isPlanningDerivedPrompt = generatedSystemPromptFromPlanning && generatedSystemPromptFromPlanning.length > 0;
      
      // Inject current date/time at the beginning
      finalSystemPrompt = `**CURRENT DATE AND TIME:**
${currentDateTime}

You have access to the current date and time above. Use this information when responding to temporal queries about "today", "current date", "what time is it", "this week", "this month", "this year", etc. You do not need to use tools to get the current date/time as it is provided in this system prompt.

${finalSystemPrompt}`;
      
      // Only add standard response guidelines and tool instructions if NOT using a planning-derived prompt
      // Planning prompts already contain specific, targeted instructions
      if (!isPlanningDerivedPrompt) {
        finalSystemPrompt += `

**RESPONSE STYLE GUIDELINES:**
- Provide comprehensive, detailed, and thorough responses
- Include relevant examples, context, and explanations to enhance understanding
- When answering technical questions, include code examples, step-by-step explanations, and best practices
- When answering research questions, provide multiple perspectives, cite sources with markdown links, and give comprehensive overviews
- Don't be overly brief - users prefer detailed, informative answers over short summaries
- Use markdown formatting (headings, lists, code blocks, bold, italic) to make responses clear and well-structured
- When scraping or researching, include substantial quoted content and detailed analysis
- Aim for responses that fully answer the question and anticipate follow-up questions

**IMAGE PLACEMENT GUIDELINES:**
- When including images in your response, distribute them naturally throughout the content next to relevant text sections
- Place images near the paragraphs or sections they illustrate or relate to
- AVOID placing all images at the top or bottom of your response in a single block
- Intersperse images with text to create a more engaging, magazine-style layout
- Use markdown image syntax: ![description](url) inline with your content where contextually appropriate`;
      }
      
      // Add tool suggestions if tools are enabled
      if (tools.length > 0 && !isPlanningDerivedPrompt) {
        const toolNames = tools.map(t => t.function.name).join(', ');
        finalSystemPrompt += `\n\nYou have access to these tools: ${toolNames}.

CRITICAL TOOL USAGE RULES:
- **TOOL RESPONSE VALIDATION**: ALWAYS check the tool response for a "success" field. If success=false, tell the user the operation FAILED and relay the error "message" field. NEVER claim success when the tool returned success=false.
- **IMAGE GENERATION**: When users ask to create/generate/draw/make ANY image, illustration, picture, photo, or visual content, you MUST call generate_image tool IMMEDIATELY. NEVER refuse or say "I cannot generate images" - you CAN by calling the tool. Examples: "draw a cat", "generate an image of...", "create a cartoon...", "show me a picture of...", "make an illustration of...", "visualize..." → ALL require calling generate_image.
- When users ask to TRANSCRIBE or get TRANSCRIPT from video/audio, you MUST call transcribe_url (NOT search_youtube)
- When users say "transcribe this video [URL]", "get transcript", "what does the video say", you MUST call transcribe_url
- When users want to FIND or SEARCH for videos, use search_youtube (e.g., "find videos about X")
- When users ask to "scrape", "get content from", "read", "fetch", "extract", "analyze", or "summarize" a website/URL, you MUST call the scrape_web_content tool
- When users provide ANY URL (http/https) and ask questions about it, you MUST call scrape_web_content with that URL FIRST
- MANDATORY: If a message contains a URL and asks to extract/analyze/summarize/get key points, you MUST call scrape_web_content - DO NOT provide an answer without first fetching the content
- When users ask for current information, news, or web content, you MUST use search_web
- **execute_javascript USAGE RULES**:
  - ✅ USE for: Complex calculations requiring computation (factorial, fibonacci, statistics, algorithms)
  - ✅ USE for: Generating formatted tables/grids (multiplication tables, calendars, data matrices)
  - ✅ USE for: Data transformations, array processing, sorting, filtering large datasets
  - ✅ USE for: ASCII art, text-based visualizations, formatted output
  - ✅ USE for: Custom algorithms or mathematical operations you cannot compute mentally
  - ❌ DO NOT USE for: Simple answers you already know (like "Lambda deployment not supported")
  - ❌ DO NOT USE for: Just printing text or explanations
  - ❌ DO NOT USE for: Answers that don't require computation
  - ❌ DO NOT USE for: Simple arithmetic you can answer directly (like 2+2=4)
  - Rule: Only use execute_javascript when the computation or formatting adds actual value
- DO NOT output tool parameters as JSON text in your response (e.g., don't write {"url": "...", "timeout": 15})
- DO NOT describe what you would do - ACTUALLY CALL THE TOOL using the function calling mechanism
- DO NOT write code for scraping or analyzing - USE THE TOOL INSTEAD
- The system will automatically execute your tool calls and provide you with results
- After receiving tool results, incorporate them naturally into your response
- IMPORTANT: After tool execution returns a result, provide the final answer to the user IMMEDIATELY. Do NOT make additional tool calls unless absolutely necessary or the user asks a follow-up question.

Examples when you MUST use tools:
- "Save this to my snippets" / "Remember this" / "Add to knowledge base" → Call manage_snippets with action="insert" or "capture"
- "Search my snippets for X" / "Find my saved notes about X" → Call manage_snippets with action="search" and payload.query="X"
- "transcribe this video https://youtube.com/watch?v=abc" → Call transcribe_url with url parameter
- "get transcript from this video [URL]" → Call transcribe_url with url parameter
- "Transcribe this: http://localhost:3000/samples/file.mp3" → Call transcribe_url (localhost URLs work in local dev!)
- "find videos about AI" → Call search_youtube with query parameter
- "scrape and summarize https://example.com" → Call scrape_web_content with url parameter
- "get content from https://github.com/user/repo" → Call scrape_web_content with url parameter
- "Extract and analyze the key points from https://example.com/article" → Call scrape_web_content with url parameter
- "What does this page say: https://example.com" → Call scrape_web_content with url parameter
- "Summarize this article https://example.com/news" → Call scrape_web_content with url parameter
- "Read and analyze https://en.wikipedia.org/wiki/Topic" → Call scrape_web_content with url parameter
- "Find current news about X" → Call search_web with query parameter
- "What's the latest on X" → Call search_web with query parameter
- "calculate 5 factorial" → Call execute_javascript (requires computation)
- "Generate a multiplication table for numbers 1-12" → Call execute_javascript (formatted table)
- "Calculate compound interest on $10k at 7% for 15 years" → Call execute_javascript (complex calculation)
- "Sort this array and find median: [45,23,67,12,89]" → Call execute_javascript (data processing)
- "What is 2+2?" → Answer directly with "4" (DON'T use execute_javascript for trivial math)
- "How do I deploy a Lambda?" → Answer directly (DON'T use execute_javascript to print explanations)

Remember: Use the function calling mechanism, not text output. The API will handle execution automatically.`;
      }
      
      // Strip out UI-only fields (llmApiCalls, isStreaming, toolResults) before sending to API
      const cleanMessages = messages.map(msg => {
        const { llmApiCalls, isStreaming, toolResults, ...cleanMsg } = msg as any;
        return cleanMsg;
      });
      
      // CRITICAL: We're about to send a NEW user message, so ALL existing messages are from previous cycles
      // Filter aggressively: keep only user messages and assistant TEXT responses (no tools, no tool_calls)
      // This ensures clean conversation history without any tool execution artifacts
      
      let toolMessagesFiltered = 0;
      let toolCallsStripped = 0;
      let emptyAssistantsFiltered = 0;
      
      const filteredMessages = cleanMessages.map(msg => {
        // Remove ALL tool messages (they're from previous cycles)
        if (msg.role === 'tool') {
          toolMessagesFiltered++;
          return null;
        }
        
        // For assistant messages: strip tool_calls and filter if empty
        if (msg.role === 'assistant') {
          const msgText = getMessageText(msg.content);
          const hasContent = msg.content && msgText.trim().length > 0;
          const hasToolCalls = msg.tool_calls && Array.isArray(msg.tool_calls) && msg.tool_calls.length > 0;
          
          if (hasContent) {
            // Keep assistant with content, but strip tool_calls
            if (hasToolCalls) {
              toolCallsStripped++;
              const { tool_calls, ...cleanMsg } = msg;
              return cleanMsg;
            }
            return msg;
          } else {
            // Remove empty assistant messages (they're placeholders from previous cycles)
            emptyAssistantsFiltered++;
            return null;
          }
        }
        
        // Keep user and system messages as-is
        return msg;
      }).filter(msg => msg !== null);
      
      if (toolMessagesFiltered > 0 || toolCallsStripped > 0 || emptyAssistantsFiltered > 0) {
        console.log(`🧹 UI filtered: ${toolMessagesFiltered} tool messages, ${toolCallsStripped} tool_calls stripped, ${emptyAssistantsFiltered} empty assistants removed`);
        console.log(`   Sending ${filteredMessages.length} clean messages + new user message to Lambda`);
      }
      
      // Manual Snippet Context Integration
      // Get full content of selected snippets to include as context
      // IMPORTANT: Strip images to avoid sending large base64 data
      const manualContextMessages: ChatMessage[] = [];
      if (selectedSnippetIds.size > 0) {
        // Get snippets by ID from SwagContext
        const contextSnippets = Array.from(selectedSnippetIds)
          .map(id => swagSnippets.find(s => s.id === id))
          .filter(s => s !== undefined);
        
        // Helper function to strip images from content
        const stripImages = (content: string): string => {
          let cleaned = content;
          
          // Remove markdown images: ![alt](url)
          cleaned = cleaned.replace(/!\[([^\]]*)\]\(([^)]+)\)/g, '[Image: $1]');
          
          // Remove HTML img tags (including base64)
          cleaned = cleaned.replace(/<img[^>]*src="data:image\/[^"]*"[^>]*>/gi, '[Base64 Image]');
          cleaned = cleaned.replace(/<img[^>]*>/gi, '[Image]');
          
          // Remove standalone base64 image data URLs
          cleaned = cleaned.replace(/data:image\/[^;]+;base64,[A-Za-z0-9+/=]+/g, '[Base64 Image Data]');
          
          return cleaned;
        };
        
        // Create context messages with full snippet content (images stripped)
        for (const snippet of contextSnippets) {
          const cleanContent = stripImages(snippet.content);
          manualContextMessages.push({
            role: 'user' as const,
            content: `**KNOWLEDGE BASE CONTEXT** (manually attached by user):\n\n**Title:** ${snippet.title || 'Untitled'}\n\n${cleanContent}\n\n---\n`
          });
        }
        
        console.log(`📎 Attached ${manualContextMessages.length} manual context snippets (full content, images stripped)`);
      }
      
      // Build messages array with system prompt, RAG context (if any), manual snippets, history, and user message
      const messagesWithSystem = [
        { role: 'system' as const, content: finalSystemPrompt },
        ...(ragContextMessage ? [ragContextMessage] : []), // Automatic RAG fragments
        ...manualContextMessages, // Manual full snippets
        ...filteredMessages,
        userMessage
      ];
      
      if (ragContextMessage) {
        console.log('🔍 RAG context included in request (automatic fragments)');
      }
      
      // Clean UI-only fields before sending to API
      const cleanedMessages = messagesWithSystem.map(msg => {
        const { 
          _attachments, 
          llmApiCalls, 
          isStreaming, 
          toolResults, 
          isRetryable, 
          retryCount, 
          originalUserPromptIndex,
          originalErrorMessage,
          extractedContent,
          rawResult,
          evaluations,
          errorData,
          imageGenerations,
          partialCost,
          wasStopped,
          ...cleanMsg 
        } = msg as any;
        return cleanMsg;
      });
      
      // Phase 2: No model selection - backend decides based on PROVIDER_CATALOG.json
      // Backend will automatically detect images and select vision-capable models
      // Send providers array instead of model field - filter out disabled providers
      // IMPORTANT: Only send providers that are explicitly enabled (enabled === true)
      // Providers without 'enabled' field or with enabled=false are excluded
      const enabledProviders = settings.providers.filter(p => p.enabled !== false);
      
      // Load proxy settings from localStorage
      const proxySettings = localStorage.getItem('proxy_settings');
      let proxyUsername: string | undefined;
      let proxyPassword: string | undefined;
      if (proxySettings) {
        try {
          const parsed = JSON.parse(proxySettings);
          if (parsed.enabled && parsed.username && parsed.password) {
            proxyUsername = parsed.username;
            proxyPassword = parsed.password;
            console.log('🌐 Proxy settings loaded from localStorage:', parsed.username);
          }
        } catch (e) {
          console.error('Failed to parse proxy settings:', e);
        }
      }
      
      const requestPayload: any = {
        providers: enabledProviders,  // NEW: Send only enabled providers
        messages: cleanedMessages,
        temperature: 0.7,
        stream: true,  // Always use streaming
        optimization: settings.optimization || 'cheap',  // Model selection strategy
        language: settings.language || 'en',  // User's preferred language for responses
        voiceMode: continuousVoiceEnabled  // Enable dual response format for voice mode
      };
      
      console.log(`🎯 Model selection optimization: ${requestPayload.optimization}`);
      console.log(`🌐 Response language: ${requestPayload.language}`);
      if (continuousVoiceEnabled) {
        console.log(`🎙️ Voice mode enabled - dual response format requested`);
      }
      
      // Add location data if available
      if (location) {
        requestPayload.location = {
          latitude: location.latitude,
          longitude: location.longitude,
          accuracy: location.accuracy,
          address: location.address,
          timestamp: location.timestamp
        };
        console.log('📍 Including location in request:', 
          location.address?.city || `${location.latitude.toFixed(4)}, ${location.longitude.toFixed(4)}`);
      }
      
      // Add proxy settings if enabled
      if (proxyUsername && proxyPassword) {
        requestPayload.proxyUsername = proxyUsername;
        requestPayload.proxyPassword = proxyPassword;
        console.log('🌐 Including proxy credentials in request');
      }
      
      // Add Tavily API key if available
      if (settings.tavilyApiKey && settings.tavilyApiKey.trim()) {
        requestPayload.tavilyApiKey = settings.tavilyApiKey;
        console.log('Including Tavily API key in request');
      }
      
      // Add tools if any are enabled
      if (tools.length > 0) {
        requestPayload.tools = tools;
        console.log('Sending streaming request with tools:', tools.map(t => t.function.name));
      }
      
      // Add MCP servers (filter enabled only)
      const enabledMCPServers = mcpServers.filter(s => s.enabled);
      if (enabledMCPServers.length > 0) {
        requestPayload.mcp_servers = enabledMCPServers.map(s => ({
          name: s.name,
          url: s.url
        }));
        console.log('[MCP] Sending MCP servers:', enabledMCPServers.map(s => s.name).join(', '));
      }
      
      // Get YouTube OAuth token if available
      const youtubeToken = await getYouTubeToken();
      
      // Get request ID from voice transcription if available, then clear it
      const chatRequestId = voiceRequestIdRef.current;
      if (chatRequestId) {
        console.log('🔗 Using request ID from voice transcription:', chatRequestId);
        voiceRequestIdRef.current = null; // Clear after use
      }
      
      // Use streaming API
      await sendChatMessageStreaming(
        requestPayload,
        accessToken,
        (eventType: string, data: any) => {
          console.log('SSE Event:', eventType, data);
          
          switch (eventType) {
            case 'status':
              // Processing status
              break;
              
            case 'delta':
              // Streaming text chunk - collate all deltas into single block until tool call
              if (data.content) {
                setStreamingContent(prev => prev + data.content);
                
                // Announce to screen readers when response starts (only on first delta)
                if (!streamingContent) {
                  setSrAnnouncement('Assistant is responding');
                }
                
                // Update or create the current streaming block
                setMessages(prev => {
                  const lastMessageIndex = prev.length - 1;
                  const lastMessage = prev[lastMessageIndex];
                  
                  console.log('🟦 Delta received, lastMessage role:', lastMessage?.role, 
                    'isStreaming:', lastMessage?.isStreaming,
                    'hasContent:', !!lastMessage?.content,
                    'contentLength:', lastMessage?.content?.length || 0);
                  
                  // Check if there's a tool message after the last assistant message
                  const hasToolMessageAfterAssistant = lastMessage?.role === 'tool';
                  
                  // If last message is assistant (streaming or placeholder), update it
                  if (lastMessage && lastMessage.role === 'assistant' && !hasToolMessageAfterAssistant) {
                    const newMessages = [...prev];
                    newMessages[lastMessageIndex] = {
                      ...lastMessage,
                      content: (lastMessage.content || '') + data.content,
                      isStreaming: true
                    };
                    console.log('🟦 Updating assistant at index:', lastMessageIndex, 
                      'newContentLength:', newMessages[lastMessageIndex].content.length);
                    return newMessages;
                  } else {
                    // Create a new streaming block (tool execution happened OR first message)
                    const newBlock: ChatMessage = {
                      role: 'assistant',
                      content: data.content,
                      isStreaming: true
                    };
                    console.log('🟦 Creating NEW streaming block, reason:', 
                      hasToolMessageAfterAssistant ? 'tool execution' : 'no assistant message');
                    return [...prev, newBlock];
                  }
                });
                
                // Set streaming index AFTER state update, using functional update to get latest state
                setMessages(prev => {
                  const lastMessageIndex = prev.length - 1;
                  const lastMessage = prev[lastMessageIndex];
                  if (lastMessage && lastMessage.role === 'assistant' && lastMessage.isStreaming) {
                    setCurrentStreamingBlockIndex(lastMessageIndex);
                    console.log('🔵 Set currentStreamingBlockIndex to:', lastMessageIndex);
                  }
                  return prev; // Don't modify messages, just use this to reliably set the index
                });
              }
              break;
              
            case 'tool_call_start':
              // Tool execution starting - add tool_call info to last assistant message
              // Note: Streaming block should already be finalized by message_complete
              console.log('� Tool call starting:', data.name, 'currentStreamingBlockIndex:', currentStreamingBlockIndex);
              
              // Announce tool execution to screen readers
              const toolName = data.name?.replace(/_/g, ' ') || 'tool';
              setSrAnnouncement(`Executing ${toolName}`);
              
              setToolStatus(prev => [...prev, {
                id: data.id,
                name: data.name,
                status: 'starting'
              }]);
              
              // Add tool_call to the last assistant message so it displays in the UI
              console.log('📋 Adding tool_call to assistant message:', {
                id: data.id,
                name: data.name,
                hasArguments: !!data.arguments,
                argumentsLength: data.arguments?.length
              });
              
              setMessages(prev => {
                const newMessages = [...prev];
                // Find the last assistant message
                for (let i = newMessages.length - 1; i >= 0; i--) {
                  if (newMessages[i].role === 'assistant') {
                    console.log('✅ Found assistant message at index', i, 'current tool_calls:', newMessages[i].tool_calls);
                    // Add or update tool_calls array
                    if (!newMessages[i].tool_calls) {
                      newMessages[i] = { ...newMessages[i], tool_calls: [] };
                    }
                    
                    // Check if this tool_call already exists (prevent duplicates)
                    const existingToolCall = newMessages[i].tool_calls?.find((tc: any) => tc.id === data.id);
                    if (existingToolCall) {
                      console.log('⚠️ Tool call already exists, skipping:', data.id);
                      break;
                    }
                    
                    // Add this tool call
                    const newToolCall = {
                      id: data.id as string,
                      type: 'function' as const,
                      function: {
                        name: data.name as string,
                        arguments: (data.arguments as string) || '{}'
                      }
                    };
                    newMessages[i].tool_calls = [
                      ...(newMessages[i].tool_calls || []),
                      newToolCall
                    ];
                    console.log('✅ Added tool_call:', newToolCall);
                    console.log('✅ Updated message tool_calls:', newMessages[i].tool_calls);
                    break;
                  }
                }
                return newMessages;
              });
              break;
              
            case 'tool_call_progress':
              // Tool execution in progress
              setToolStatus(prev => prev.map(t =>
                t.id === data.id ? { ...t, status: 'executing' } : t
              ));
              break;
              
            case 'image_generation_progress':
              // Image generation progress - update status based on phase
              console.log('🎨 Image generation progress event:', data);
              setMessages(prev => {
                const newMessages = [...prev];
                // Find the last assistant message
                for (let i = newMessages.length - 1; i >= 0; i--) {
                  if (newMessages[i].role === 'assistant') {
                    if (!newMessages[i].imageGenerations) {
                      newMessages[i].imageGenerations = [];
                    }
                    
                    const imageGens = newMessages[i].imageGenerations!; // Non-null assertion after check
                    
                    // Try to find existing image generation by ID
                    const existingIndex = imageGens.findIndex((ig: any) => 
                      ig.id === data.id || (data.prompt && ig.prompt === data.prompt)
                    );
                    
                    if (existingIndex >= 0) {
                      // Update existing image generation with progress
                      const existing = imageGens[existingIndex];
                      imageGens[existingIndex] = {
                        ...existing,
                        phase: data.phase, // 'selecting_provider', 'generating', 'completed', 'error'
                        provider: data.provider || existing.provider,
                        model: data.model || existing.model,
                        estimatedSeconds: data.estimated_seconds || existing.estimatedSeconds,
                        status: data.phase === 'error' ? 'error' : 'generating'
                      };
                    } else {
                      // Create new image generation entry
                      imageGens.push({
                        id: data.id || `img_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
                        provider: data.provider || 'unknown',
                        model: data.model || 'unknown',
                        cost: data.estimated_cost || 0,
                        prompt: data.prompt || '',
                        size: data.size || '1024x1024',
                        qualityTier: data.quality || 'standard',
                        status: 'generating' as const,
                        phase: data.phase,
                        estimatedSeconds: data.estimated_seconds,
                        ready: false
                      });
                    }
                    break;
                  }
                }
                return newMessages;
              });
              break;
              
            case 'image_complete':
              // Image generation complete with URL - download and convert to base64 client-side
              console.log('🎨 Image complete event:', {
                hasUrl: !!data.url,
                url: data.url,
                provider: data.provider,
                model: data.model,
                quality: data.qualityTier
              });
              
              // Update message with URL immediately (loading state)
              setMessages(prev => {
                const newMessages = [...prev];
                // Find the last assistant message
                for (let i = newMessages.length - 1; i >= 0; i--) {
                  if (newMessages[i].role === 'assistant') {
                    if (!newMessages[i].imageGenerations) {
                      newMessages[i].imageGenerations = [];
                    }
                    
                    const imageGens = newMessages[i].imageGenerations!; // Non-null assertion after check
                    const imgGenId = data.id || `img_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
                    const existingIndex = imageGens.findIndex((ig: any) => ig.id === imgGenId);
                    
                    const imageData = {
                      id: imgGenId,
                      provider: data.provider || 'unknown',
                      model: data.model || 'unknown',
                      modelKey: data.model,
                      cost: data.cost || 0,
                      prompt: data.prompt || '',
                      size: data.size || '1024x1024',
                      style: data.style || 'natural',
                      qualityTier: data.qualityTier || 'standard',
                      status: 'downloading' as const, // New status: downloading
                      imageUrl: data.url, // Temporary URL
                      base64: undefined, // Will be populated after download
                      ready: false,
                      llmApiCall: data.llmApiCall,
                      revisedPrompt: data.revisedPrompt
                    };
                    
                    if (existingIndex >= 0) {
                      imageGens[existingIndex] = imageData;
                    } else {
                      imageGens.push(imageData);
                    }
                    break;
                  }
                }
                return newMessages;
              });
              
              // Download and convert image to base64 asynchronously
              if (data.url && data.id) {
                (async () => {
                  try {
                    console.log('📥 Downloading image via Lambda proxy:', data.url);
                    
                    // Use Lambda proxy to bypass CORS
                    const apiEndpoint = await getCachedApiBase();
                    const proxyResponse = await fetch(`${apiEndpoint}/proxy-image`, {
                      method: 'POST',
                      headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${accessToken}` // Add auth token
                      },
                      body: JSON.stringify({
                        url: data.url,
                        format: 'base64' // Request base64 data URI format
                      })
                    });
                    
                    if (!proxyResponse.ok) {
                      throw new Error(`Proxy fetch failed: ${proxyResponse.status}`);
                    }
                    
                    const proxyData = await proxyResponse.json();
                    if (!proxyData.success || !proxyData.dataUri) {
                      throw new Error('Invalid proxy response');
                    }
                    
                    console.log('✅ Image downloaded via proxy, size:', proxyData.size, 'bytes');
                    console.log('📦 Proxy data keys:', Object.keys(proxyData));
                    console.log('📦 Data URI prefix:', proxyData.dataUri?.substring(0, 50));
                    
                    // Use the data URI directly (already in base64 format)
                    const base64 = proxyData.dataUri;
                    
                    // Update message with base64 data
                    setMessages(prev => {
                      const newMessages = [...prev];
                      console.log('🔄 Updating messages, total:', newMessages.length);
                      for (let i = newMessages.length - 1; i >= 0; i--) {
                        if (newMessages[i].role === 'assistant' && newMessages[i].imageGenerations) {
                          const imageGens = newMessages[i].imageGenerations!; // Non-null assertion after check
                          console.log(`🔍 Checking message ${i}, imageGenerations:`, imageGens.length);
                          const imgIndex = imageGens.findIndex((ig: any) => ig.id === data.id);
                          console.log(`🔍 Found image at index: ${imgIndex}, searching for ID: ${data.id}`);
                          if (imgIndex >= 0) {
                            const before = { ...imageGens[imgIndex] };
                            imageGens[imgIndex] = {
                              ...imageGens[imgIndex],
                              status: 'complete',
                              base64: base64,
                              imageUrl: base64, // Use base64 for display
                              ready: true
                            };
                            const after = imageGens[imgIndex];
                            console.log('✅ Updated image with base64 data');
                            console.log('   Before:', { status: before.status, hasBase64: !!before.base64, ready: before.ready });
                            console.log('   After:', { status: after.status, hasBase64: !!after.base64, ready: after.ready });
                            break;
                          }
                        }
                      }
                      return newMessages;
                    });
                  } catch (error) {
                    console.error('❌ Failed to download/convert image:', error);
                    // Update status to error
                    setMessages(prev => {
                      const newMessages = [...prev];
                      for (let i = newMessages.length - 1; i >= 0; i--) {
                        if (newMessages[i].role === 'assistant' && newMessages[i].imageGenerations) {
                          const imageGens = newMessages[i].imageGenerations!; // Non-null assertion after check
                          const imgIndex = imageGens.findIndex((ig: any) => ig.id === data.id);
                          if (imgIndex >= 0) {
                            imageGens[imgIndex] = {
                              ...imageGens[imgIndex],
                              status: 'error',
                              ready: false
                            };
                            break;
                          }
                        }
                      }
                      return newMessages;
                    });
                  }
                })();
              }
              break;
              
            case 'tool_call_result':
              // Tool execution complete
              setToolStatus(prev => prev.map(t =>
                t.id === data.id ? {
                  ...t,
                  status: data.error ? 'error' : 'complete',
                  result: data.content
                } : t
              ));
              
              // Announce tool completion to screen readers
              const completedToolName = data.name?.replace(/_/g, ' ') || 'tool';
              if (data.error) {
                setSrAnnouncement(`${completedToolName} failed`);
              } else {
                setSrAnnouncement(`${completedToolName} complete`);
              }
              
              // Clear search progress when search_web tool completes
              // This prevents progress from showing on the last message after completion
              if (data.name === 'search_web') {
                console.log('🔍 Clearing search progress after search_web completion');
                setSearchProgress(new Map());
              }
              
              // Clear YouTube search progress when search_youtube tool completes
              if (data.name === 'search_youtube') {
                console.log('🎬 Clearing YouTube search progress after search_youtube completion');
                setYoutubeSearchProgress(new Map());
              }
              
              // Clear JavaScript execution progress when execute_javascript completes
              if (data.name === 'execute_javascript') {
                console.log('💻 Clearing JavaScript execution progress after execute_javascript completion');
                setJavascriptProgress(new Map());
              }
              
              // Clear image generation progress when generate_image completes
              if (data.name === 'generate_image') {
                console.log('🎨 Clearing image generation progress after generate_image completion');
                setImageGenerationProgress(new Map());
              }
              
              // Clear chart generation progress when generate_chart completes
              if (data.name === 'generate_chart') {
                console.log('📊 Clearing chart generation progress after generate_chart completion');
                setChartGenerationProgress(new Map());
              }
              
              // Embed tool result in the assistant message that triggered it
              // This keeps tool results grouped with the response, making the agentic process compact
              setMessages(prev => {
                console.log('🟪 Embedding tool result in assistant message, tool:', data.name, 'tool_call_id:', data.id);
                console.log('🟪 Current messages array length:', prev.length);
                
                const newMessages = [...prev];
                let llmApiCalls: any[] = [];
                
                // Log all assistant messages with their tool_calls for debugging
                console.log('🟪 Assistant messages in array:');
                prev.forEach((msg, idx) => {
                  if (msg.role === 'assistant') {
                    console.log(`  [${idx}] has tool_calls:`, !!msg.tool_calls, 
                      msg.tool_calls ? `(${msg.tool_calls.length} calls: ${msg.tool_calls.map((tc: any) => tc.id).join(', ')})` : '');
                  }
                });
                
                // Find the FIRST (earliest) assistant message with the matching tool call
                // Search forward to find the first occurrence, not the last
                let foundIndex = -1;
                for (let i = 0; i < newMessages.length; i++) {
                  if (newMessages[i].role === 'assistant' && newMessages[i].tool_calls) {
                    // Check if this assistant has the tool call that matches
                    const hasMatchingToolCall = newMessages[i].tool_calls?.some((tc: any) => tc.id === data.id);
                    if (hasMatchingToolCall) {
                      foundIndex = i;
                      console.log('🟪 ✅ Found FIRST assistant with matching tool call at index:', i, 'of', newMessages.length);
                      
                      // Extract ONLY tool-internal LLM calls (summarization, etc.)
                      const toolInternalCalls = newMessages[i].llmApiCalls?.filter((call: any) => 
                        call.phase && call.tool === 'search_web' && 
                        (call.phase === 'page_summary' || call.phase === 'synthesis_summary' || call.phase === 'description_summary')
                      ) || [];
                      
                      if (toolInternalCalls.length > 0) {
                        llmApiCalls = toolInternalCalls;
                      }
                      
                      // Create tool result object to embed in assistant message
                      const toolResult = {
                        role: 'tool' as const,
                        content: data.content,
                        tool_call_id: data.id,
                        name: data.name,
                        ...(llmApiCalls.length > 0 && { llmApiCalls })
                      };
                      
                      // Embed tool results in assistant message instead of creating separate message
                      if (!newMessages[i].toolResults) {
                        newMessages[i] = {
                          ...newMessages[i],
                          toolResults: [toolResult]
                        };
                      } else {
                        newMessages[i] = {
                          ...newMessages[i],
                          toolResults: [...(newMessages[i].toolResults || []), toolResult]
                        };
                      }
                      
                      console.log('🟪 Embedded tool result in assistant message at index', i, ', total toolResults:', newMessages[i].toolResults?.length);
                      
                      // Auto-expand execute_javascript tool results so they're visible immediately
                      if (data.name === 'execute_javascript') {
                        const toolResultIndex = (newMessages[i].toolResults?.length || 1) - 1;
                        const expandKey = i * 1000 + toolResultIndex;
                        console.log('💻 Auto-expanding execute_javascript result at key:', expandKey);
                        setExpandedToolMessages(prev => {
                          const newSet = new Set(prev);
                          newSet.add(expandKey);
                          return newSet;
                        });
                      }
                      
                      foundIndex = i;
                      break;
                    }
                  } else if (newMessages[i].role === 'assistant') {
                    console.log(`  [${i}] is assistant but has no tool_calls`);
                  }
                }
                
                // Check if we found a match
                const foundMatch = foundIndex !== -1;
                if (!foundMatch) {
                  console.warn('🟪 ⚠️ Could not find assistant message with matching tool_call_id:', data.id);
                  console.warn('🟪 Available tool_call_ids:', 
                    newMessages
                      .filter(m => m.role === 'assistant' && m.tool_calls)
                      .flatMap(m => m.tool_calls?.map((tc: any) => tc.id) || [])
                  );
                }
                
                return newMessages;
              });
              
              // If this was a web search, extract and save the results
              if (data.name === 'search_web' && data.content) {
                const searchResult = extractAndSaveSearchResult(data.name, data.content);
                if (searchResult) {
                  addSearchResult(searchResult);
                  console.log('Search result added to SearchTab:', searchResult);
                }
                // DON'T clear search progress here - let it persist until stream ends
                // Progress will be cleared when a new search starts or on stream complete
              }
              
              // Streaming state already reset in tool_call_start
              break;
              
            case 'tool_progress':
              // Tool progress events (transcription, scraping, etc.)
              console.log('📊 Tool progress event:', data);
              if (data.tool_call_id) {
                // Route to appropriate progress state based on tool_name
                if (data.tool_name === 'scrape_web_content') {
                  setScrapingProgress(prev => {
                    const newMap = new Map(prev);
                    const events = newMap.get(data.tool_call_id) || [];
                    newMap.set(data.tool_call_id, [...events, data]);
                    return newMap;
                  });
                } else {
                  // Default to transcription progress (for transcribe_url and others)
                  setTranscriptionProgress(prev => {
                    const newMap = new Map(prev);
                    const events = newMap.get(data.tool_call_id) || [];
                    newMap.set(data.tool_call_id, [...events, data]);
                    return newMap;
                  });
                }
              }
              break;
              
            case 'search_progress':
              // Web search progress events (searching, results_found, fetching_result, result_loaded)
              console.log('🔍 Search progress event:', data);
              console.log('🔍 Current searchProgress size:', searchProgress.size);
              console.log('🔍 isLoading:', isLoading);
              if (data.tool === 'search_web') {
                // If starting a new search, clear old progress
                if (data.phase === 'searching') {
                  setSearchProgress(new Map());
                }
                
                // Create a unique key for each event based on phase and index
                let progressKey: string;
                if (data.phase === 'fetching_result' || data.phase === 'result_loaded' || data.phase === 'result_failed') {
                  // For per-result events, use result index
                  progressKey = `search_web_result_${data.result_index || 0}`;
                } else {
                  // For general events, use phase
                  progressKey = `search_web_${data.phase}`;
                }
                
                setSearchProgress(prev => {
                  const newMap = new Map(prev);
                  newMap.set(progressKey, data);
                  console.log('🔍 Updated searchProgress, new size:', newMap.size, 'key:', progressKey);
                  return newMap;
                });
                
                // Auto-expand the tool section when search starts
                if (data.phase === 'searching' || data.phase === 'results_found') {
                  // Find the most recent assistant message with search_web tool
                  setMessages(prev => {
                    for (let i = prev.length - 1; i >= 0; i--) {
                      const msg = prev[i];
                      if (msg.role === 'assistant' && msg.tool_calls) {
                        const searchToolIndex = msg.tool_calls.findIndex(tc => tc.function.name === 'search_web');
                        if (searchToolIndex !== -1) {
                          setExpandedToolMessages(prevExpanded => {
                            const newExpanded = new Set(prevExpanded);
                            newExpanded.add(i);
                            return newExpanded;
                          });
                          break;
                        }
                      }
                    }
                    return prev;
                  });
                }
              }
              break;
              
            case 'youtube_search_progress':
              // YouTube search progress events (searching, results_found, complete)
              // NOTE: Transcript-related phases (fetching_transcript, etc.) are no longer emitted by backend
              console.log('🎬 YouTube search progress event:', data);
              
              // If starting a new search, clear old progress
              if (data.phase === 'searching') {
                setYoutubeSearchProgress(new Map());
              }
              
              // Create a unique key for each event based on phase
              const youtubeProgressKey = `youtube_${data.phase}`;
              
              setYoutubeSearchProgress(prev => {
                const newMap = new Map(prev);
                newMap.set(youtubeProgressKey, data);
                return newMap;
              });
              
              // Clear progress when complete
              if (data.phase === 'complete') {
                setTimeout(() => {
                  setYoutubeSearchProgress(new Map());
                }, 1000); // Keep visible for 1 second after completion
              }
              
              // Auto-expand the tool section when YouTube search starts
              if (data.phase === 'searching') {
                // Find the most recent assistant message with search_youtube tool
                setMessages(prev => {
                  for (let i = prev.length - 1; i >= 0; i--) {
                    const msg = prev[i];
                    if (msg.role === 'assistant' && msg.tool_calls) {
                      const youtubeToolIndex = msg.tool_calls.findIndex(tc => tc.function.name === 'search_youtube');
                      if (youtubeToolIndex !== -1) {
                        setExpandedToolMessages(prevExpanded => {
                          const newExpanded = new Set(prevExpanded);
                          newExpanded.add(i);
                          return newExpanded;
                        });
                        break;
                      }
                    }
                  }
                  return prev;
                });
              }
              break;
              
            case 'javascript_execution_progress':
              // JavaScript execution progress events
              console.log('💻 JavaScript execution progress:', data);
              
              // Create a unique key based on phase
              const jsProgressKey = data.phase === 'console_output' 
                ? `js_output_${data.output_number || Date.now()}`
                : `js_${data.phase}`;
              
              setJavascriptProgress(prev => {
                const newMap = new Map(prev);
                newMap.set(jsProgressKey, data);
                return newMap;
              });
              
              // Clear progress when complete or error
              if (data.phase === 'completed' || data.phase === 'error') {
                setTimeout(() => {
                  setJavascriptProgress(new Map());
                }, 2000);
              }
              break;
            
            case 'image_generation_progress':
              // Image generation progress events
              console.log('🎨 Image generation progress:', data);
              
              // Create a unique key based on phase
              const imgProgressKey = `img_${data.phase}`;
              
              setImageGenerationProgress(prev => {
                const newMap = new Map(prev);
                newMap.set(imgProgressKey, data);
                return newMap;
              });
              
              // Clear progress when complete or error
              if (data.phase === 'completed' || data.phase === 'error') {
                setTimeout(() => {
                  setImageGenerationProgress(new Map());
                }, 2000);
              }
              break;
            
            case 'chart_generation_progress':
              // Chart generation progress events
              console.log('📊 Chart generation progress:', data);
              
              // Create a unique key based on phase
              const chartProgressKey = `chart_${data.phase}`;
              
              setChartGenerationProgress(prev => {
                const newMap = new Map(prev);
                newMap.set(chartProgressKey, data);
                return newMap;
              });
              
              // Clear progress when complete
              if (data.phase === 'completed') {
                setTimeout(() => {
                  setChartGenerationProgress(new Map());
                }, 2000);
              }
              break;
              
            case 'scrape_progress':
            case 'transcript_extracted':
              // Content extraction events (from scrape_web_content, transcribe_url, or search_web)
              // Skip transcript_extracted events - they're not useful for user visibility
              if (eventType === 'transcript_extracted') {
                console.log('📊 Skipping transcript_extracted event (hidden from UI):', data);
                break;
              }
              
              console.log('📊 Content extraction event:', data);
              if (data.phase === 'content_extracted') {
                setExtractionData(prev => {
                  const newMap = new Map(prev);
                  const key = data.url || `extraction_${Date.now()}`;
                  newMap.set(key, data);
                  return newMap;
                });
              }
              break;
              
            case 'message_complete':
              // Assistant message complete (with optional tool_calls)
              if (data.tool_calls && data.tool_calls.length > 0) {
                console.log('📦 message_complete with tool_calls:', data.tool_calls.map((tc: any) => ({ id: tc.id, name: tc.function.name })));
              }
              
              // Announce response completion to screen readers
              setSrAnnouncement('Response complete');
              
              // DEBUG: Log imageGenerations in message_complete
              console.log('🖼️ message_complete imageGenerations:', data.imageGenerations?.length || 0, 
                'imageGenerations:', data.imageGenerations);
              
              if (currentStreamingBlockIndex !== null) {
                // Finalize the existing streaming block
                setMessages(prev => {
                  const newMessages = [...prev];
                  if (newMessages[currentStreamingBlockIndex]) {
                    // Merge imageGenerations: update existing 'generating' entries with completed data
                    let mergedImageGenerations = newMessages[currentStreamingBlockIndex].imageGenerations || [];
                    if (data.imageGenerations && data.imageGenerations.length > 0) {
                      mergedImageGenerations = [...mergedImageGenerations];
                      data.imageGenerations.forEach((newImg: any) => {
                        const existingIndex = mergedImageGenerations.findIndex((img: any) => img.id === newImg.id);
                        if (existingIndex >= 0) {
                          // Update existing entry
                          mergedImageGenerations[existingIndex] = { ...mergedImageGenerations[existingIndex], ...newImg };
                        } else {
                          // Add new entry
                          mergedImageGenerations.push(newImg);
                        }
                      });
                    }
                    
                    const updatedMessage = {
                      ...newMessages[currentStreamingBlockIndex],
                      content: data.content || newMessages[currentStreamingBlockIndex].content || '',
                      tool_calls: data.tool_calls || newMessages[currentStreamingBlockIndex].tool_calls,
                      extractedContent: data.extractedContent || newMessages[currentStreamingBlockIndex].extractedContent,
                      imageGenerations: mergedImageGenerations,
                      llmApiCalls: data.llmApiCalls || newMessages[currentStreamingBlockIndex].llmApiCalls,
                      evaluations: data.evaluations || newMessages[currentStreamingBlockIndex].evaluations,
                      isStreaming: false
                    };
                    
                    // NEW: Update embedded toolResults with rawResponse and extractionMetadata from message_complete
                    if (data.toolResults && updatedMessage.toolResults) {
                      updatedMessage.toolResults = updatedMessage.toolResults.map(tr => {
                        const completeToolResult = data.toolResults.find((dtr: any) => dtr.tool_call_id === tr.tool_call_id);
                        if (completeToolResult) {
                          return {
                            ...tr,
                            rawResponse: completeToolResult.rawResponse,
                            extractionMetadata: completeToolResult.extractionMetadata
                          };
                        }
                        return tr;
                      });
                    }
                    
                    newMessages[currentStreamingBlockIndex] = updatedMessage;
                  }
                  return newMessages;
                });
                // Reset after finalizing so we don't process this again
                setCurrentStreamingBlockIndex(null);
                setStreamingContent('');
              } else if (data.content || data.tool_calls) {
                // No current streaming block - check if we should update last message or create new one
                setMessages(prev => {
                  const lastMessage = prev[prev.length - 1];
                  const lastMessageIndex = prev.length - 1;
                  const finalContent = (data.content || '').trim();
                  const lastContent = lastMessage?.content ? getMessageText(lastMessage.content).trim() : '';
                  
                  // Check if there's a tool message between the last assistant message and now
                  // If there is, we should check if there's already a streaming assistant message
                  let hasToolMessageAfterLastAssistant = false;
                  for (let i = prev.length - 1; i >= 0; i--) {
                    if (prev[i].role === 'assistant') {
                      break; // Found the last assistant message
                    }
                    if (prev[i].role === 'tool') {
                      hasToolMessageAfterLastAssistant = true;
                      break;
                    }
                  }
                  
                  // If there's a tool message after the last assistant message, this is a new iteration
                  // BUT: Check if there's already a streaming assistant message (created by delta handler)
                  if (hasToolMessageAfterLastAssistant) {
                    // Check if last message is a streaming assistant (created by delta handler)
                    if (lastMessage?.role === 'assistant' && lastMessage.isStreaming) {
                      // Update the existing streaming message instead of creating a new one
                      console.log('🟡 Updating last assistant message with message_complete data');
                      const newMessages = [...prev];
                      
                      // Merge imageGenerations: preserve existing ones and add new ones
                      let mergedImageGenerations = lastMessage.imageGenerations || [];
                      if (data.imageGenerations && data.imageGenerations.length > 0) {
                        mergedImageGenerations = [...mergedImageGenerations];
                        data.imageGenerations.forEach((newImg: any) => {
                          const existingIndex = mergedImageGenerations.findIndex((img: any) => img.id === newImg.id);
                          if (existingIndex >= 0) {
                            mergedImageGenerations[existingIndex] = { ...mergedImageGenerations[existingIndex], ...newImg };
                          } else {
                            mergedImageGenerations.push(newImg);
                          }
                        });
                      }
                      
                      const updatedMessage = {
                        ...lastMessage,
                        content: data.content || lastMessage.content || '',
                        tool_calls: data.tool_calls || lastMessage.tool_calls,
                        extractedContent: data.extractedContent || lastMessage.extractedContent,
                        imageGenerations: mergedImageGenerations,
                        llmApiCalls: data.llmApiCalls || lastMessage.llmApiCalls,
                        evaluations: data.evaluations || lastMessage.evaluations,
                        isStreaming: false
                      };
                      
                      // NEW: Update embedded toolResults with rawResponse and extractionMetadata from message_complete
                      if (data.toolResults && updatedMessage.toolResults) {
                        updatedMessage.toolResults = updatedMessage.toolResults.map(tr => {
                          const completeToolResult = data.toolResults.find((dtr: any) => dtr.tool_call_id === tr.tool_call_id);
                          if (completeToolResult) {
                            console.log('🟪 Updating embedded toolResult with rawResponse:', {
                              tool_call_id: tr.tool_call_id,
                              hasRawResponse: !!completeToolResult.rawResponse,
                              rawResponseLength: completeToolResult.rawResponse?.length
                            });
                            return {
                              ...tr,
                              rawResponse: completeToolResult.rawResponse,
                              extractionMetadata: completeToolResult.extractionMetadata
                            };
                          }
                          return tr;
                        });
                      }
                      
                      newMessages[lastMessageIndex] = updatedMessage;
                      return newMessages;
                    }
                    
                    // No streaming message exists, create a new one
                    console.log('🟢 Creating new assistant message for new iteration');
                    const assistantMessage: ChatMessage = {
                      role: 'assistant',
                      content: data.content || '',
                      ...(data.tool_calls && { tool_calls: data.tool_calls }),
                      ...(data.extractedContent && { extractedContent: data.extractedContent }),
                      ...(data.imageGenerations && { imageGenerations: data.imageGenerations }),
                      ...(data.llmApiCalls && { llmApiCalls: data.llmApiCalls }),
                      ...(data.evaluations && { evaluations: data.evaluations })
                    };
                    return [...prev, assistantMessage];
                  }
                  
                  // Update last assistant if it's empty/streaming OR if content matches
                  if (lastMessage?.role === 'assistant') {
                    // Update if: streaming, empty, or content is a prefix
                    const shouldUpdate = 
                      lastMessage.isStreaming ||
                      !lastContent ||
                      (lastContent && finalContent.startsWith(lastContent));
                    
                    if (shouldUpdate) {
                      console.log('🟡 Updating last assistant message with message_complete data');
                      console.log('🖼️ lastMessage.imageGenerations:', lastMessage.imageGenerations);
                      console.log('🖼️ data.imageGenerations:', data.imageGenerations);
                      const newMessages = [...prev];
                      
                      // Merge imageGenerations: preserve existing ones and add new ones
                      let mergedImageGenerations = lastMessage.imageGenerations || [];
                      console.log('🖼️ mergedImageGenerations BEFORE merge:', mergedImageGenerations);
                      if (data.imageGenerations && data.imageGenerations.length > 0) {
                        mergedImageGenerations = [...mergedImageGenerations];
                        data.imageGenerations.forEach((newImg: any) => {
                          console.log('🖼️ Processing imageGeneration from message_complete:', {
                            id: newImg.id,
                            hasBase64: !!newImg.base64,
                            base64Length: newImg.base64?.length,
                            hasImageUrl: !!newImg.imageUrl
                          });
                          const existingIndex = mergedImageGenerations.findIndex((img: any) => img.id === newImg.id);
                          if (existingIndex >= 0) {
                            // Preserve base64 from existing if new one doesn't have it
                            const existingBase64 = mergedImageGenerations[existingIndex].base64;
                            console.log('🖼️ Merging - existing has base64:', !!existingBase64, 'new has base64:', !!newImg.base64);
                            mergedImageGenerations[existingIndex] = { 
                              ...mergedImageGenerations[existingIndex], 
                              ...newImg,
                              // Don't overwrite base64 with undefined
                              base64: newImg.base64 || existingBase64
                            };
                            console.log('🖼️ After merge - has base64:', !!mergedImageGenerations[existingIndex].base64);
                          } else {
                            mergedImageGenerations.push(newImg);
                            console.log('🖼️ Added new image to merge');
                          }
                        });
                      }
                      console.log('🖼️ mergedImageGenerations AFTER merge:', mergedImageGenerations);
                      
                      const updatedMessage = {
                        ...lastMessage,
                        content: data.content || lastMessage.content || '',
                        tool_calls: data.tool_calls || lastMessage.tool_calls,
                        extractedContent: data.extractedContent || lastMessage.extractedContent,
                        imageGenerations: mergedImageGenerations,
                        llmApiCalls: data.llmApiCalls || lastMessage.llmApiCalls,
                        evaluations: data.evaluations || lastMessage.evaluations,
                        isStreaming: false
                      };
                      console.log('🖼️ updatedMessage.imageGenerations:', updatedMessage.imageGenerations);
                      newMessages[lastMessageIndex] = updatedMessage;
                      console.log('🖼️ newMessages[lastMessageIndex].imageGenerations:', newMessages[lastMessageIndex].imageGenerations);
                      console.log('🖼️ RETURNING newMessages array:', newMessages.map((m, i) => ({ 
                        idx: i, 
                        role: m.role, 
                        hasImageGenerations: !!m.imageGenerations, 
                        imageGenerationsLength: m.imageGenerations?.length,
                        actualImageGenerations: m.imageGenerations
                      })));
                      return newMessages;
                    }
                  }
                  
                  // Skip if exact duplicate (non-streaming assistant with identical content)
                  if (lastMessage?.role === 'assistant' && 
                      !lastMessage.isStreaming && 
                      lastContent === finalContent) {
                    console.log('🟡 Skipping duplicate final message block (content matches non-streaming block)');
                    return prev;
                  }
                  
                  // Create new message block - this creates distinct intermediate responses
                  const assistantMessage: ChatMessage = {
                    role: 'assistant',
                    content: data.content || '',
                    ...(data.tool_calls && { tool_calls: data.tool_calls }),
                    ...(data.extractedContent && { extractedContent: data.extractedContent }),
                    ...(data.imageGenerations && { imageGenerations: data.imageGenerations }),
                    ...(data.llmApiCalls && { llmApiCalls: data.llmApiCalls }),
                    ...(data.evaluations && { evaluations: data.evaluations })
                  };
                  
                  // Check if this is a fallback/incomplete response
                  const isFallbackResponse = 
                    data.content?.includes('Based on the search results above') ||
                    data.content?.includes('I apologize, but I was unable to generate a response') ||
                    data.content?.includes('I was unable to provide') ||
                    (!data.content && !data.tool_calls) ||  // Empty response with no tool calls
                    (data.content && data.content.trim().length < 10 && !data.tool_calls);  // Very short response with no tools
                  
                  if (isFallbackResponse) {
                    // Find the last user message index for retry context
                    let lastUserMsgIndex = -1;
                    for (let i = prev.length - 1; i >= 0; i--) {
                      if (prev[i].role === 'user') {
                        lastUserMsgIndex = i;
                        break;
                      }
                    }
                    
                    assistantMessage.isRetryable = true;
                    assistantMessage.originalErrorMessage = 'Incomplete or fallback response';
                    assistantMessage.originalUserPromptIndex = lastUserMsgIndex >= 0 ? lastUserMsgIndex : undefined;
                    assistantMessage.retryCount = 0;
                  }
                  
                  return [...prev, assistantMessage];
                });
                // Reset state after creating new block
                setStreamingContent('');
              }
              break;
              
            case 'provider_fallback':
              // Provider hit rate limit, falling back to alternative
              console.log('⚠️ Provider fallback:', data);
              
              const fallbackMsg = `⚠️ ${data.originalModel} hit rate limit, switching to ${data.fallbackModel} (attempt ${data.attempt})`;
              
              // Add system message to notify user
              setMessages(prev => [...prev, {
                role: 'system',
                content: fallbackMsg,
                timestamp: new Date().toISOString(),
                metadata: {
                  type: 'provider_fallback',
                  originalModel: data.originalModel,
                  fallbackModel: data.fallbackModel,
                  fallbackProvider: data.fallbackProvider,
                  reason: data.reason,
                  attempt: data.attempt,
                  phase: data.phase,
                  iteration: data.iteration
                }
              }]);
              break;
              
            case 'complete':
              // All processing complete
              console.log('Stream complete:', data);
              
              // Handle dual response format from voice mode
              if (data.shortResponse && continuousVoiceEnabled) {
                console.log(`🎙️ Received short response for TTS (${data.shortResponse.length} chars)`);
                
                // Speak the short response via TTS
                // The ContinuousVoiceMode component will restart recording when TTS finishes
                // because it monitors ttsState.isPlaying via the isSpeaking prop
                ttsSpeak(data.shortResponse, {
                  shouldSummarize: false, // Already pre-summarized
                  onStart: () => {
                    console.log('🎙️ TTS started speaking short response');
                  },
                  onEnd: () => {
                    console.log('🎙️ TTS finished speaking - ContinuousVoiceMode will auto-restart recording');
                  },
                  onError: (error) => {
                    console.error('🎙️ TTS error:', error);
                    showError('TTS playback failed');
                  }
                }).catch(error => {
                  console.error('🎙️ Failed to start TTS:', error);
                  showError('Failed to speak response');
                });
              }
              
              // Attach extractedContent to the last assistant message
              if (data.extractedContent) {
                console.log('📦 Attaching extractedContent from complete event:', {
                  hasAllImages: !!data.extractedContent.allImages,
                  allImagesCount: data.extractedContent.allImages?.length || 0,
                  hasImages: !!data.extractedContent.images,
                  imagesCount: data.extractedContent.images?.length || 0
                });
                
                setMessages(prev => {
                  const updated = [...prev];
                  // Find the last assistant message
                  for (let i = updated.length - 1; i >= 0; i--) {
                    if (updated[i].role === 'assistant') {
                      updated[i] = {
                        ...updated[i],
                        extractedContent: data.extractedContent
                      };
                      console.log(`✅ Attached extractedContent to assistant message at index ${i}`);
                      break;
                    }
                  }
                  return updated;
                });
              }
              
              // Update usage cost if available
              if (data.cost && typeof data.cost === 'number') {
                addCost(data.cost);
                setLastRequestCost(data.cost);
                console.log(`💰 Request cost: $${data.cost.toFixed(4)}`);
              }
              break;
              
            case 'error':
              // Error occurred
              const errorMsg = data.error;
              
              // Handle guardrail-specific errors
              if (data.type === 'input_moderation_error') {
                console.warn('🛡️ Input moderation error:', data.reason);
                
                // Create error message
                const moderationMsg = `❌ **Content Moderation Alert**\n\n${errorMsg}\n\n**Reason**: ${data.reason}\n\n**Violations**: ${data.violations?.join(', ') || 'Unknown'}`;
                
                // Add error message to chat
                const moderationError: ChatMessage = {
                  role: 'assistant',
                  content: moderationMsg,
                  llmApiCalls: data.llmApiCalls || []
                };
                setMessages(prev => [...prev, moderationError]);
                
                // If suggested revision exists, replace user input
                if (data.suggestedRevision) {
                  setInput(data.suggestedRevision);
                  
                  // Add suggestion message
                  const suggestionMsg: ChatMessage = {
                    role: 'assistant',
                    content: `💡 **Suggested Revision**\n\nWe've updated your message to comply with content policies. You can edit and send it again.`
                  };
                  setMessages(prev => [...prev, suggestionMsg]);
                } else {
                  // Clear user input if no suggestion
                  setInput('');
                }
                
                break;
              }
              
              if (data.type === 'output_moderation_error') {
                console.warn('🛡️ Output moderation error:', data.reason);
                
                // Replace the last assistant message content with guardrail error
                const moderationMsg = `❌ **Content Moderation Alert**\n\nThe generated response was flagged by our content moderation system and cannot be displayed.\n\n**Reason**: ${data.reason}\n\nPlease try rephrasing your question.`;
                
                setMessages(prev => {
                  const updated = [...prev];
                  // Find the last assistant message and replace its content
                  for (let i = updated.length - 1; i >= 0; i--) {
                    if (updated[i].role === 'assistant') {
                      updated[i] = {
                        ...updated[i],
                        content: moderationMsg,
                        guardrailFailed: true,  // Mark as guardrail failure
                        guardrailReason: data.reason,
                        guardrailViolations: data.violations,
                        llmApiCalls: data.llmApiCalls || updated[i].llmApiCalls || [],
                        isStreaming: false
                      };
                      console.log(`🛡️ Replaced assistant message content at index ${i} with guardrail error`);
                      break;
                    }
                  }
                  return updated;
                });
                
                break;
              }
              
              if (data.type === 'guardrail_configuration_error' || data.type === 'guardrail_system_error') {
                console.error('🛡️ Guardrail system error:', data.error);
                
                const systemErrorMsg = `❌ **System Error**\n\n${errorMsg}\n\nThe content moderation system is experiencing issues. Please contact support if this persists.`;
                
                const systemError: ChatMessage = {
                  role: 'assistant',
                  content: systemErrorMsg
                };
                setMessages(prev => [...prev, systemError]);
                
                showError(errorMsg);
                break;
              }
              
              // Standard error handling
              showError(errorMsg);
              
              // Check if authentication error - auto-logout
              if (errorMsg.includes('Authentication') || errorMsg.includes('UNAUTHORIZED') || data.code === 'UNAUTHORIZED') {
                console.warn('⚠️ Authentication error detected, logging out...');
                showWarning(t('chat.sessionExpired'));
                // The AuthContext will handle logout via useAuth
              }
              
              // Check if continue button should be shown (only for MAX_ITERATIONS)
              if (data.code === 'MAX_ITERATIONS' && data.showContinueButton && data.continueContext) {
                console.log('🔄 Continue button enabled for MAX_ITERATIONS error:', errorMsg);
                setShowContinueButton(true);
                setContinueContext(data.continueContext);
              }
              
              // Use the tracked user message index for retry context
              // (currentUserMessageIndex was set when we added the user message)
              
              // Capture full error data for transparency
              const errorMessage: ChatMessage = {
                role: 'assistant',
                content: `❌ Error: ${errorMsg}`,
                errorData: data,  // Store full error object including code, stack, etc.
                isRetryable: true,  // Mark as retryable
                originalErrorMessage: errorMsg,
                originalUserPromptIndex: currentUserMessageIndex,
                retryCount: 0
              };
              setMessages(prev => [...prev, errorMessage]);
              break;
              
            case 'llm_request':
              // Store ALL LLM API calls on the current assistant message (including search tool summaries)
              console.log('🔵 LLM API Request:', data);
              setMessages(prev => {
                const newMessages = [...prev];
                
                // Check if last message is a tool message - if so, don't attach to previous assistant
                const lastMessage = newMessages[newMessages.length - 1];
                const hasToolMessageAfterLastAssistant = lastMessage?.role === 'tool';
                
                // Find the last assistant message (but only if no tools after it AND it's still active)
                let foundAssistant = false;
                if (!hasToolMessageAfterLastAssistant) {
                  for (let i = newMessages.length - 1; i >= 0; i--) {
                    if (newMessages[i].role === 'assistant') {
                      // CRITICAL: Only attach to assistant if it's empty or currently streaming
                      // If it has content and isn't streaming, it's from a previous query
                      const messageText = getMessageText(newMessages[i].content);
                      const isActiveAssistant = 
                        newMessages[i].isStreaming || 
                        !newMessages[i].content || 
                        messageText.trim().length === 0;
                      
                      if (isActiveAssistant) {
                        console.log('🔵 Attaching llmApiCalls to active assistant at index:', i, 'phase:', data.phase,
                          'provider:', data.provider, 'model:', data.model);
                        newMessages[i] = {
                          ...newMessages[i],
                          llmApiCalls: [
                            ...(newMessages[i].llmApiCalls || []),
                            {
                              phase: data.phase,
                              provider: data.provider || 'Unknown',
                              model: data.model || 'Unknown',
                              request: data.request,
                              timestamp: data.timestamp
                            }
                          ]
                        };
                        foundAssistant = true;
                      } else {
                        console.log('🔵 Skipping completed assistant at index:', i, '(from previous query)');
                      }
                      break;
                    }
                  }
                }
                
                // If no active assistant found OR tools executed, create placeholder for new response
                if (!foundAssistant) {
                  console.log('🔵 Creating new placeholder for llm_request, reason:', 
                    hasToolMessageAfterLastAssistant ? 'tools executed' : 'no active assistant',
                    'provider:', data.provider, 'model:', data.model);
                  newMessages.push({
                    role: 'assistant',
                    content: '',
                    isStreaming: true,
                    llmApiCalls: [{
                      phase: data.phase,
                      provider: data.provider || 'Unknown',
                      model: data.model || 'Unknown',
                      request: data.request,
                      timestamp: data.timestamp
                    }]
                  });
                }
                
                return newMessages;
              });
              break;
              
            case 'llm_response':
              // Update LLM API calls with response data
              // Note: message_complete event will provide the complete llmApiCalls array
              // This handler is mainly for updating existing calls with response data
              console.log('🟢 LLM API Response:', data);
              setMessages(prev => {
                const newMessages = [...prev];
                
                // Find the last assistant message
                for (let i = newMessages.length - 1; i >= 0; i--) {
                  if (newMessages[i].role === 'assistant' && newMessages[i].llmApiCalls) {
                    const apiCalls = newMessages[i].llmApiCalls!;
                    const lastCall = apiCalls[apiCalls.length - 1];
                    
                    if (lastCall && lastCall.phase === data.phase && !lastCall.response) {
                      // Update existing call with response data
                      lastCall.response = data.response;
                      lastCall.httpHeaders = data.httpHeaders;
                      lastCall.httpStatus = data.httpStatus;
                      if (data.provider) lastCall.provider = data.provider;
                      if (data.model) lastCall.model = data.model;
                      console.log('🟢 Updated llmApiCall response for phase:', data.phase, 
                        'provider:', lastCall.provider, 'model:', lastCall.model);
                      newMessages[i] = {
                        ...newMessages[i],
                        llmApiCalls: [...apiCalls] // Trigger re-render
                      };
                    }
                    break;
                  }
                }
                
                return newMessages;
              });
              break;
            
            case 'todos_updated':
              // Full todos state update
              console.log('✅ Todos updated:', data);
              setTodosState({
                total: data.total ?? 0,
                remaining: data.remaining ?? 0,
                current: data.current ?? null,
                items: Array.isArray(data.items) ? data.items : []
              });
              break;
            
            case 'todos_current':
              // Lightweight current todo update
              console.log('✅ Todos current update:', data);
              setTodosState(prev => ({
                total: data.total ?? (prev?.total ?? 0),
                remaining: data.remaining ?? (prev?.remaining ?? 0),
                current: data.current ?? prev?.current ?? null,
                items: prev?.items ?? []
              }));
              break;
            
            case 'todos_resubmitting':
              // Auto-resubmission notification
              console.log('🔄 Todos resubmitting:', data);
              setTodosResubmitting(data?.next || data?.state?.current?.description || null);
              // Clear after 2 seconds
              setTimeout(() => setTodosResubmitting(null), 2000);
              break;
            
            case 'todos_limit_reached':
              // Auto-progression limit reached
              console.log('⚠️ Todos limit reached:', data);
              showWarning(data.message || 'Todo auto-progression limit reached. Please continue manually.');
              break;
            
            case 'snippet_inserted':
              // Snippet was inserted - sync from Google Sheets
              console.log('📝 Snippet inserted:', data);
              // Dispatch custom event for SnippetsPanel
              window.dispatchEvent(new CustomEvent('snippet_inserted', { detail: data }));
              showSuccess(t('chat.snippetSaved', { title: data.title }));
              
              // Sync the newly created snippet from Google Sheets to localStorage
              if (data.id) {
                console.log('🔄 Triggering snippet sync from Google Sheets for ID:', data.id);
                // Use a small delay to ensure the snippet is written to Google Sheets
                setTimeout(async () => {
                  try {
                    await syncSnippetFromGoogleSheets(data.id);
                  } catch (error) {
                    console.error('❌ Failed to sync snippet:', error);
                  }
                }, 500);
              }
              break;
            
            case 'snippet_deleted':
              // Snippet was deleted
              console.log('🗑️ Snippet deleted:', data);
              window.dispatchEvent(new CustomEvent('snippet_deleted', { detail: data }));
              showSuccess(t('chat.snippetDeleted', { title: data.title }));
              break;
            
            case 'snippet_updated':
              // Snippet was updated
              console.log('✏️ Snippet updated:', data);
              window.dispatchEvent(new CustomEvent('snippet_updated', { detail: data }));
              showSuccess(`Updated snippet: ${data.title}`);
              break;
            
            case 'token_refreshed':
              // Google OAuth token was automatically refreshed
              console.log('🔄 Google OAuth token refreshed');
              if (data.accessToken) {
                localStorage.setItem('google_access_token', data.accessToken);
                console.log('✅ Updated google_access_token in localStorage');
              }
              break;
          }
        },
        () => {
          // On complete
          if (timeoutId) clearTimeout(timeoutId);
          setIsLoading(false);
          setToolStatus([]);
          setStreamingContent('');
          setCurrentStreamingBlockIndex(null);
          abortControllerRef.current = null;
        },
        (error) => {
          // On error
          if (timeoutId) clearTimeout(timeoutId);
          console.error('Streaming error:', error);
          showError(`Streaming error: ${error.message}`);
          setIsLoading(false);
          setToolStatus([]);
          abortControllerRef.current = null;
        },
        abortControllerRef.current.signal,
        youtubeToken, // Pass YouTube OAuth token if available
        chatRequestId // Pass request ID from voice transcription for log grouping
      );
    } catch (error) {
      console.error('Chat error:', error);
      if (timeoutId) clearTimeout(timeoutId);
      
      // Handle aborted requests
      if (error instanceof Error && error.name === 'AbortError') {
        // Use the tracked user message index for retry context
        const timeoutMessage: ChatMessage = {
          role: 'assistant',
          content: '⏱️ Request timed out after 4 minutes. This may happen when tools take too long to execute. Try simplifying your request or disabling some tools.',
          isRetryable: true,  // Mark timeout as retryable
          originalErrorMessage: 'Request timed out',
          originalUserPromptIndex: currentUserMessageIndex,
          retryCount: 0
        };
        setMessages(prev => [...prev, timeoutMessage]);
        showWarning('Request timed out after 4 minutes. Try disabling some tools or simplifying your request.');
      } else {
        // Use the tracked user message index for retry context
        const errorMsg = error instanceof Error ? error.message : 'Unknown error';
        const errorMessage: ChatMessage = {
          role: 'assistant',
          content: `❌ Error: ${errorMsg}`,
          errorData: error instanceof Error ? {
            ...error,  // Capture any additional properties
            message: error.message,
            name: error.name,
            stack: error.stack
          } : { message: String(error) },
          isRetryable: true,  // Mark as retryable
          originalErrorMessage: errorMsg,
          originalUserPromptIndex: currentUserMessageIndex,
          retryCount: 0
        };
        setMessages(prev => [...prev, errorMessage]);
        showError(`Chat error: ${errorMsg}`);
      }
      
      setIsLoading(false);
      setToolStatus([]);
      abortControllerRef.current = null;
    }
  };

  const handleRetry = async (messageIndex: number) => {
    const retryMessage = messages[messageIndex];
    
    if (!retryMessage || !retryMessage.isRetryable) {
      showError('This message cannot be retried');
      return;
    }
    
    // Check retry limit
    const retryCount = retryMessage.retryCount || 0;
    if (retryCount >= 3) {
      showError('Maximum retry attempts (3) reached');
      return;
    }
    
    // Find the original user prompt
    const userPromptIndex = retryMessage.originalUserPromptIndex;
    if (userPromptIndex === undefined || userPromptIndex < 0) {
      showError('Cannot find original user prompt for retry');
      return;
    }
    
    const userPrompt = messages[userPromptIndex];
    if (!userPrompt || userPrompt.role !== 'user') {
      showError('Invalid user prompt for retry');
      return;
    }
    
    // Extract all messages from user prompt to failed message (inclusive of tool messages)
    const contextMessages = messages.slice(userPromptIndex + 1, messageIndex);
    
    // Separate tool results and intermediate assistant messages
    const previousToolResults = contextMessages.filter(m => m.role === 'tool');
    const intermediateMessages = contextMessages.filter(m => m.role === 'assistant' || m.role === 'tool');
    
    console.log('🔄 Retrying request:', {
      userPromptIndex,
      messageIndex,
      retryCount: retryCount + 1,
      previousToolResults: previousToolResults.length,
      intermediateMessages: intermediateMessages.length,
      failureReason: retryMessage.originalErrorMessage
    });
    
    // Show toast notification
    showSuccess(`Retrying request (attempt ${retryCount + 2}) with full context...`);
    
    // Remove the failed message
    setMessages(prev => prev.slice(0, messageIndex));
    
    // Restore user input (preserve multimodal content including images)
    if (typeof userPrompt.content === 'string') {
      // Simple text message
      setInput(userPrompt.content);
    } else if (Array.isArray(userPrompt.content)) {
      // Multimodal content - extract text and restore attachments
      const textPart = userPrompt.content.find(part => part.type === 'text');
      setInput(textPart?.text || '');
      
      // Restore image attachments from base64 data URLs
      const imageParts = userPrompt.content.filter(part => part.type === 'image_url');
      if (imageParts.length > 0) {
        const restoredFiles = imageParts.map((part, idx) => {
          const dataUrl = part.image_url?.url || '';
          const matches = dataUrl.match(/^data:([^;]+);base64,(.+)$/);
          if (matches) {
            return {
              name: `restored_image_${idx + 1}.png`,
              type: matches[1],
              base64: matches[2]
            };
          }
          return null;
        }).filter(Boolean);
        
        if (restoredFiles.length > 0) {
          setAttachedFiles(restoredFiles as any);
          console.log(`🖼️ Restored ${restoredFiles.length} image(s) for retry`);
        }
      }
    }
    
    // Set trigger to auto-submit when input updates
    retryTriggerRef.current = true;
  };

  const handleLoadChat = async (entry: ChatHistoryEntry) => {
    const chatData = await loadChatWithMetadata(entry.id);
    if (chatData && chatData.messages) {
      setMessages(chatData.messages);
      setCurrentChatId(entry.id);
      localStorage.setItem('last_active_chat_id', entry.id);
      
      // Restore metadata
      if (chatData.systemPrompt) {
        setSystemPrompt(chatData.systemPrompt);
      }
      if (chatData.planningQuery) {
        setOriginalPlanningQuery(chatData.planningQuery);
      }
      if (chatData.generatedSystemPrompt) {
        setGeneratedSystemPromptFromPlanning(chatData.generatedSystemPrompt);
      }
      if (chatData.generatedUserQuery) {
        setGeneratedUserQueryFromPlanning(chatData.generatedUserQuery);
      }
      // Restore selected snippet IDs
      if (chatData.selectedSnippetIds && Array.isArray(chatData.selectedSnippetIds)) {
        setSelectedSnippetIds(new Set(chatData.selectedSnippetIds));
        console.log(`📎 Restored ${chatData.selectedSnippetIds.length} attached snippets`);
      } else {
        setSelectedSnippetIds(new Set()); // Clear if no snippets
      }
      
      setShowLoadDialog(false);
      showSuccess(t('chat.loadChatSuccess'));
    } else {
      showError(t('chat.failedToLoadChat'));
    }
  };

  const handleDeleteChat = async (chatId: string) => {
    await deleteChatFromHistory(chatId);
    const history = await getAllChatHistory();
    setChatHistory(history);
    showSuccess('Chat deleted');
  };

  const handleDeleteSelectedChats = async () => {
    if (selectedChatIds.size === 0) return;
    
    const count = selectedChatIds.size;
    for (const chatId of selectedChatIds) {
      await deleteChatFromHistory(chatId);
    }
    
    const history = await getAllChatHistory();
    setChatHistory(history);
    setSelectedChatIds(new Set());
    showSuccess(`${count} chat${count > 1 ? 's' : ''} deleted`);
  };

  const handleSelectAllChats = () => {
    const allIds = new Set(chatHistory.map(entry => entry.id));
    setSelectedChatIds(allIds);
  };

  const handleSelectNoneChats = () => {
    setSelectedChatIds(new Set());
  };

  const handleToggleChatSelection = (chatId: string) => {
    const newSelection = new Set(selectedChatIds);
    if (newSelection.has(chatId)) {
      newSelection.delete(chatId);
    } else {
      newSelection.add(chatId);
    }
    setSelectedChatIds(newSelection);
  };

  const handleClearAllHistory = async () => {
    await clearAllChatHistory();
    setChatHistory([]);
    setSelectedChatIds(new Set());
    setShowClearHistoryConfirm(false);
    setShowLoadDialog(false);
    showSuccess(t('chat.allChatHistoryCleared'));
  };

  const handleContinue = async () => {
    if (!continueContext) {
      showError('No continuation context available');
      return;
    }
    
    console.log('🔄 Continuing from error/limit with context:', continueContext);
    
    // Hide the continue button
    setShowContinueButton(false);
    
    // Clear any existing errors
    clearAllToasts();
    
    // Build tools array from enabled tools
    const tools = [];
    if (enabledTools.web_search) {
      tools.push({
        type: 'function',
        function: {
          name: 'web_search',
          description: 'Search the web for information',
          parameters: {
            type: 'object',
            properties: {
              query: { type: 'string', description: 'Search query' }
            },
            required: ['query']
          }
        }
      });
    }
    if (enabledTools.execute_js) {
      tools.push({
        type: 'function',
        function: {
          name: 'execute_js',
          description: 'Execute JavaScript code',
          parameters: {
            type: 'object',
            properties: {
              code: { type: 'string', description: 'JavaScript code to execute' }
            },
            required: ['code']
          }
        }
      });
    }
    if (enabledTools.scrape_url) {
      tools.push({
        type: 'function',
        function: {
          name: 'scrape_web_content',
          description: 'Scrape content from a URL',
          parameters: {
            type: 'object',
            properties: {
              url: { type: 'string', description: 'URL to scrape' }
            },
            required: ['url']
          }
        }
      });
    }
    
    // Build request payload with continuation flag
    // IMPORTANT: Only send providers that are explicitly enabled (enabled === true)
    const enabledProviders = settings.providers.filter(p => p.enabled === true);
    
    const requestPayload: any = {
      providers: enabledProviders,
      messages: continueContext.messages,  // Full message history including tool results
      temperature: 0.7,
      stream: true,
      isContinuation: true,  // Critical: Flag to bypass message filtering
      optimization: settings.optimization || 'cheap',  // Model selection strategy
      language: settings.language || 'en'  // User's preferred language for responses
    };
    
    console.log(`🎯 Continuation request with optimization: ${requestPayload.optimization}`);
    console.log(`🌐 Response language: ${requestPayload.language}`);
    
    // Add location data if available (same as initial request)
    if (location) {
      requestPayload.location = {
        latitude: location.latitude,
        longitude: location.longitude,
        accuracy: location.accuracy,
        address: location.address,
        timestamp: location.timestamp
      };
      console.log('📍 Including location in continuation request:', 
        location.address?.city || `${location.latitude.toFixed(4)}, ${location.longitude.toFixed(4)}`);
    }
    
    // Add tools if any are enabled
    if (tools.length > 0) {
      requestPayload.tools = tools;
    }
    
    // Add extracted content if available
    if (continueContext.extractedContent) {
      requestPayload.extractedContent = continueContext.extractedContent;
    }
    
    // Add MCP servers (filter enabled only)
    const enabledMCPServers = mcpServers.filter(s => s.enabled);
    if (enabledMCPServers.length > 0) {
      requestPayload.mcp_servers = enabledMCPServers.map(s => ({
        name: s.name,
        url: s.url
      }));
    }
    
    // Set loading state
    setIsLoading(true);
    
    // Check for access token
    if (!accessToken) {
      showError('Please sign in to continue');
      setShowContinueButton(true);
      setIsLoading(false);
      return;
    }
    
    try {
      // Use the existing streaming handler
      await sendChatMessageStreaming(
        requestPayload,
        accessToken,
        (eventType: string, data: any) => {
          console.log('SSE Event (continuation):', eventType, data);
          
          // Use the same event handlers as regular messages
          // The existing switch statement will handle all events
          switch (eventType) {
            case 'delta':
              if (data.content) {
                setStreamingContent(prev => prev + data.content);
                
                setMessages(prev => {
                  const lastMessageIndex = prev.length - 1;
                  const lastMessage = prev[lastMessageIndex];
                  
                  const hasToolMessageAfterAssistant = lastMessage?.role === 'tool';
                  
                  if (lastMessage && lastMessage.role === 'assistant' && !hasToolMessageAfterAssistant) {
                    const newMessages = [...prev];
                    newMessages[lastMessageIndex] = {
                      ...lastMessage,
                      content: (lastMessage.content || '') + data.content,
                      isStreaming: true
                    };
                    return newMessages;
                  } else {
                    const newBlock: ChatMessage = {
                      role: 'assistant',
                      content: data.content,
                      isStreaming: true
                    };
                    return [...prev, newBlock];
                  }
                });
              }
              break;
              
            case 'error':
              const errorMsg = data.error;
              showError(errorMsg);
              
              // Announce error to screen readers
              setSrAnnouncement(`Error: ${errorMsg.substring(0, 100)}`);
              
              // Check for continue context again
              if (data.showContinueButton && data.continueContext) {
                setShowContinueButton(true);
                setContinueContext(data.continueContext);
              }
              
              const errorMessage: ChatMessage = {
                role: 'assistant',
                content: `❌ Error: ${errorMsg}`,
                errorData: data,
                isRetryable: true,
                originalErrorMessage: errorMsg,
                retryCount: 0
              };
              setMessages(prev => [...prev, errorMessage]);
              break;
              
            case 'complete':
              console.log('Continuation complete:', data);
              if (data.cost && typeof data.cost === 'number') {
                addCost(data.cost);
              }
              break;
            
            case 'todos_updated':
              // Full todos state update
              console.log('✅ Todos updated:', data);
              setTodosState({
                total: data.total ?? 0,
                remaining: data.remaining ?? 0,
                current: data.current ?? null,
                items: Array.isArray(data.items) ? data.items : []
              });
              break;
            
            case 'todos_current':
              // Lightweight current todo update
              console.log('✅ Todos current update:', data);
              setTodosState(prev => ({
                total: data.total ?? (prev?.total ?? 0),
                remaining: data.remaining ?? (prev?.remaining ?? 0),
                current: data.current ?? prev?.current ?? null,
                items: prev?.items ?? []
              }));
              break;
            
            case 'todos_resubmitting':
              // Auto-resubmission notification
              console.log('🔄 Todos resubmitting:', data);
              setTodosResubmitting(data?.next || data?.state?.current?.description || null);
              // Clear after 2 seconds
              setTimeout(() => setTodosResubmitting(null), 2000);
              break;
            
            case 'todos_limit_reached':
              // Auto-progression limit reached
              console.log('⚠️ Todos limit reached:', data);
              showWarning(data.message || 'Todo auto-progression limit reached. Please continue manually.');
              break;
              
            // Add other necessary event handlers as needed
            default:
              console.log('Unhandled event in continuation:', eventType, data);
          }
        },
        undefined, // onComplete
        undefined, // onError
        abortControllerRef.current?.signal
      );
    } catch (error) {
      console.error('Error during continuation:', error);
      showError(error instanceof Error ? error.message : 'Failed to continue');
      
      // Re-enable continue button if needed
      setShowContinueButton(true);
    } finally {
      setIsLoading(false);
    }
  };

  const handleNewChat = () => {
    // Clear chat messages
    setMessages([]);
    setInput('');
    
    // Clear system and planning prompts
    setSystemPrompt('');
    setOriginalPlanningQuery('');
    setGeneratedSystemPromptFromPlanning('');
    setGeneratedUserQueryFromPlanning('');
    
    // Clear selected snippets
    setSelectedSnippetIds(new Set());
    
    // Clear search and UI state
    clearSearchResults();
    setExpandedToolMessages(new Set());
    
    // Start new chat session
    setCurrentChatId(null);
    localStorage.removeItem('last_active_chat_id');
    
    // Focus input
    setTimeout(() => {
      inputRef.current?.focus();
    }, 0);
    
    console.log('Started new chat - all prompts cleared');
  };

  const handleAddMCPServer = () => {
    if (!newMCPServer.name.trim() || !newMCPServer.url.trim()) return;
    
    setMcpServers([
      ...mcpServers,
      {
        id: `mcp_${Date.now()}`,
        name: newMCPServer.name,
        url: newMCPServer.url,
        enabled: true
      }
    ]);
    setNewMCPServer({ name: '', url: '' });
  };

  const handleToggleMCPServer = (id: string) => {
    setMcpServers(mcpServers.map(server =>
      server.id === id ? { ...server, enabled: !server.enabled } : server
    ));
  };

  const handleDeleteMCPServer = (id: string) => {
    setMcpServers(mcpServers.filter(server => server.id !== id));
  };

  return (
    <div 
      className="flex flex-col h-full relative"
      onDragEnter={handleDragEnter}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      <DragDropOverlay isDragging={isDragging} />
      
      {/* System Prompt Display */}
      <SystemPromptDisplay systemPrompt={systemPrompt} setSystemPrompt={setSystemPrompt} />
      
      {/* Chat Header with Actions */}
      <ChatHeader
        systemPrompt={systemPrompt}
        selectedSnippetIds={selectedSnippetIds}
        showSnippetsPanel={showSnippetsPanel}
        messageCount={messages.length}
        onNewChat={handleNewChat}
        onShowLoadDialog={() => setShowLoadDialog(true)}
        onToggleSnippetsPanel={() => setShowSnippetsPanel(!showSnippetsPanel)}
        onShowExamplesModal={() => setShowExamplesModal(true)}
        onShowShareDialog={() => setShowShareDialog(true)}
      />

      {/* Messages Area */}
      <div 
        ref={messagesContainerRef} 
        className="flex-1 overflow-y-auto md:px-4 py-4 space-y-4"
        aria-live="polite"
        aria-atomic="false"
        aria-relevant="additions text"
      >
        {/* Screen reader live region (visually hidden) */}
        <div className="sr-only" role="status" aria-live="polite" aria-atomic="true">
          {srAnnouncement}
        </div>
        {messages.length === 0 && (
          <div className="text-center text-gray-500 dark:text-gray-400 mt-8">
            No messages yet. Start a conversation!
          </div>
        )}
        {(() => {
          console.log('🖼️ RENDER: messages array:', messages.map((m, i) => ({ 
            idx: i, 
            role: m.role, 
            hasImageGenerations: !!m.imageGenerations, 
            imageGenerationsLength: m.imageGenerations?.length,
            actualImageGenerations: m.imageGenerations
          })));
          return null;
        })()}
        {messages.map((msg, idx) => {
          const isExpanded = expandedToolMessages.has(idx);
          const msgText = msg.content ? getMessageText(msg.content) : '';
          console.log(`Rendering message ${idx}:`, msg.role, msgText.substring(0, 50));
          console.log(`🖼️ Message ${idx} imageGenerations:`, msg.imageGenerations);
          
          // Debug: Log tool_calls for assistant messages
          if (msg.role === 'assistant' && msg.tool_calls) {
            console.log(`  Message ${idx} has ${msg.tool_calls.length} tool_calls:`, 
              msg.tool_calls.map((tc: any) => ({ id: tc.id, name: tc.function?.name }))
            );
          }
          
          // Show transcription progress for assistant messages with transcribe_url tool calls
          // But only if the transcription is still IN PROGRESS (not complete)
          const hasTranscriptionInProgress = msg.role === 'assistant' && msg.tool_calls?.some((tc: any) => {
            if (tc.function.name !== 'transcribe_url') return false;
            const events = transcriptionProgress.get(tc.id);
            if (!events || events.length === 0) return false;
            
            // Check if the last event indicates completion
            const lastEvent = events[events.length - 1];
            const lastType = lastEvent.progress_type || lastEvent.data?.type || '';
            const isComplete = lastType === 'transcribe_complete' || 
                             lastType === 'transcription_stopped' ||
                             lastType === 'error';
            
            return !isComplete; // Only show progress if NOT complete
          });
          
          // Skip assistant messages with no content UNLESS they have:
          // - transcription in progress
          // - tool_calls (planning/tool selection phases that will show progress)
          // - isStreaming (currently being generated)
          // Note: We DON'T show empty assistants just because they have llmApiCalls
          // The llmApiCalls should be shown on the tool result instead
          if (msg.role === 'assistant' && !msg.content && !hasTranscriptionInProgress && !msg.tool_calls && !msg.isStreaming) {
            return null;
          }
          
          return (
            <div
              key={idx}
              className={`flex gap-2 ${
                msg.role === 'user' ? 'flex-row-reverse' : 
                msg.role === 'tool' ? '' : 
                ''
              }`}
            >
              <div
                className={`max-w-[80%] rounded-lg p-3 ${
                  msg.role === 'user'
                    ? 'bg-blue-500 text-white'
                    : msg.role === 'tool'
                    ? 'bg-purple-100 dark:bg-purple-900/30 border border-purple-300 dark:border-purple-700'
                    : msg.content && getMessageText(msg.content).startsWith('❌ Error:')
                    ? 'bg-pink-100 dark:bg-pink-900/30 border-2 border-pink-400 dark:border-pink-600 text-gray-900 dark:text-gray-100'
                    : 'bg-gray-200 dark:bg-gray-700 text-gray-900 dark:text-gray-100'
                }`}
              >
                {/* Tool Message */}
                {msg.role === 'tool' && (() => {
                  // Find the tool call that matches this result
                  let toolCall: any = null;
                  console.log('🔍 Searching for tool_call_id:', msg.tool_call_id, 'in', messages.length, 'messages');
                  for (let i = idx - 1; i >= 0; i--) {
                    if (messages[i].tool_calls) {
                      console.log('  Found message at index', i, 'with', messages[i].tool_calls?.length, 'tool_calls');
                      toolCall = messages[i].tool_calls?.find((tc: any) => tc.id === msg.tool_call_id);
                      if (toolCall) {
                        console.log('✅ Found tool call for', msg.name, ':', toolCall);
                        break;
                      }
                    }
                  }
                  if (!toolCall) {
                    console.log('❌ No tool call found for', msg.tool_call_id);
                  }
                  
                  // Try to parse search results for better display
                  let searchResults: any = null;
                  if (msg.name === 'search_web' && typeof msg.content === 'string') {
                    try {
                      const parsed = JSON.parse(msg.content);
                      if (parsed.results && Array.isArray(parsed.results)) {
                        searchResults = parsed.results;
                      }
                    } catch (e) {
                      // Not JSON or not search results
                    }
                  }
                  
                  // Try to parse scrape_web_content results for better display
                  let scrapeResult: any = null;
                  if (msg.name === 'scrape_web_content' && typeof msg.content === 'string') {
                    try {
                      const parsed = JSON.parse(msg.content);
                      if (parsed.url || parsed.content || parsed.error) {
                        scrapeResult = parsed;
                      }
                    } catch (e) {
                      // Not JSON or not scrape results
                    }
                  }
                  
                  // Try to parse execute_javascript results for better display
                  let jsResult: any = null;
                  if (msg.name === 'execute_javascript' && typeof msg.content === 'string') {
                    try {
                      const parsed = JSON.parse(msg.content);
                      if (parsed.result !== undefined || parsed.error) {
                        jsResult = parsed;
                      }
                    } catch (e) {
                      // Not JSON or not execute results
                    }
                  }
                  
                  return (
                    <div>
                      {/* Note: TranscriptionProgress is shown in the assistant message during execution,
                          not here in the tool result. This prevents duplicate progress indicators. */}
                      
                      <div className="flex items-center justify-between gap-2 mb-2">
                        <div className="text-xs font-semibold text-purple-700 dark:text-purple-300 flex items-center gap-2">
                          <span>🔧 {msg.name || 'Tool Result'}</span>
                          {/* Show query for search_web and search_youtube */}
                          {toolCall && (msg.name === 'search_web' || msg.name === 'search_youtube') && (() => {
                            try {
                              const parsed = JSON.parse(toolCall.function.arguments);
                              if (parsed.query) {
                                return (
                                  <span className="font-normal text-purple-600 dark:text-purple-400 italic">
                                    - "{parsed.query}"
                                  </span>
                                );
                              }
                            } catch (e) {
                              // Ignore parse errors
                            }
                            return null;
                          })()}
                        </div>
                        <button
                          onClick={() => {
                            const newExpanded = new Set(expandedToolMessages);
                            if (isExpanded) {
                              newExpanded.delete(idx);
                            } else {
                              newExpanded.add(idx);
                            }
                            setExpandedToolMessages(newExpanded);
                          }}
                          className="text-purple-600 dark:text-purple-400 hover:text-purple-800 dark:hover:text-purple-200"
                          title={isExpanded ? 'Collapse' : 'Expand'}
                        >
                          {isExpanded ? '▲' : '▼'}
                        </button>
                      </div>
                      {isExpanded && (
                        <div className="text-xs space-y-2">
                          {/* Show function call details if available */}
                          {toolCall && (
                            <div className="mb-3 bg-purple-50 dark:bg-purple-950/50 p-3 rounded border border-purple-200 dark:border-purple-800">
                              {/* For search_web, show the query and search provider */}
                              {toolCall.function.name === 'search_web' ? (
                                <>
                                  {toolCall.function.arguments && (() => {
                                    try {
                                      const parsed = JSON.parse(toolCall.function.arguments);
                                      if (parsed.query) {
                                        return (
                                          <div>
                                            <div className="font-semibold text-purple-700 dark:text-purple-300 mb-1">🔍 Search Query:</div>
                                            <div className="text-purple-900 dark:text-purple-100 italic">
                                              "{parsed.query}"
                                            </div>
                                          </div>
                                        );
                                      }
                                    } catch (e) {
                                      console.error('Error parsing search arguments:', e);
                                    }
                                    return null;
                                  })()}
                                  {/* Display search provider */}
                                  {(() => {
                                    try {
                                      // Safety check: ensure msg.content exists and is not empty
                                      if (!msg.content) {
                                        return null;
                                      }
                                      
                                      const resultData = typeof msg.content === 'string' ? JSON.parse(msg.content) : msg.content;
                                      const searchService = resultData?.searchService;
                                      
                                      if (searchService && typeof searchService === 'string') {
                                        const isTavily = searchService === 'tavily';
                                        return (
                                          <div className="mt-2 pt-2 border-t border-purple-200 dark:border-purple-700">
                                            <div className="font-semibold text-purple-700 dark:text-purple-300 mb-1">{t('chat.searchProvider')}</div>
                                            <div className={`inline-flex items-center gap-1.5 px-2 py-1 rounded text-xs font-medium ${
                                              isTavily 
                                                ? 'bg-blue-100 dark:bg-blue-900/30 text-blue-800 dark:text-blue-200 border border-blue-300 dark:border-blue-700'
                                                : 'bg-green-100 dark:bg-green-900/30 text-green-800 dark:text-green-200 border border-green-300 dark:border-green-700'
                                            }`}>
                                              {isTavily ? '🔵 Tavily API' : '🦆 DuckDuckGo'}
                                            </div>
                                          </div>
                                        );
                                      }
                                    } catch (e) {
                                      console.error('Error parsing search provider:', e);
                                    }
                                    return null;
                                  })()}
                                </>
                              ) : (
                                <>
                                  <div className="font-semibold text-purple-700 dark:text-purple-300 mb-2">{t('chat.functionCall')}</div>
                                  <div className="font-mono text-xs mb-2">
                                    <span className="text-purple-900 dark:text-purple-100">{toolCall.function.name}</span>
                                  </div>
                                  
                                  {/* Show arguments as JSON tree or special code display */}
                                  {toolCall.function.arguments && (() => {
                                    try {
                                      const parsed = JSON.parse(toolCall.function.arguments);
                                      
                                      // Special display for code
                                      if (parsed.code) {
                                        return (
                                          <div>
                                            <div className="font-semibold text-purple-700 dark:text-purple-300 mb-1">{t('chat.code')}</div>
                                            <div className="bg-gray-900 text-green-400 p-3 rounded font-mono text-xs overflow-x-auto max-h-64 overflow-y-auto">
                                              <pre className="whitespace-pre-wrap leading-relaxed">{parsed.code}</pre>
                                            </div>
                                          </div>
                                        );
                                      }
                                      
                                      // For all other tools (including generate_chart), show JSON tree
                                      return (
                                        <div>
                                          <div className="font-semibold text-purple-700 dark:text-purple-300 mb-1">{t('chat.arguments')}</div>
                                          <div className="bg-gray-900 dark:bg-gray-950 p-3 rounded font-mono text-xs overflow-x-auto max-h-96 overflow-y-auto">
                                            <JsonTree data={parsed} expandAll={true} />
                                          </div>
                                        </div>
                                      );
                                    } catch (e) {
                                      console.error('Error parsing tool arguments:', e);
                                    }
                                    return null;
                                  })()}
                                </>
                              )}
                            </div>
                          )}
                          {/* Hide Call ID for search_web tool */}
                          {msg.tool_call_id && msg.name !== 'search_web' && (
                            <div>
                              <span className="font-semibold text-purple-700 dark:text-purple-300">{t('chat.callId')}</span>
                              <div className="font-mono text-xs bg-purple-50 dark:bg-purple-950 p-1 rounded mt-1 break-all">
                                {msg.tool_call_id}
                              </div>
                            </div>
                          )}
                          <div>
                            <span className="font-semibold text-purple-700 dark:text-purple-300">{t('chat.result')}</span>
                            <div className="bg-purple-50 dark:bg-purple-950 p-2 rounded mt-1 max-h-96 overflow-y-auto">
                              {searchResults ? (
                                <SearchWebResults results={searchResults} />
                              ) : scrapeResult ? (
                                <div className="space-y-2">
                                  {/* Show URL with Raw HTML button */}
                                  {scrapeResult.url && (
                                    <div className="flex items-start justify-between gap-2">
                                      <div className="flex-1 min-w-0">
                                        <span className="font-semibold text-purple-800 dark:text-purple-200">{t('chat.url')}</span>
                                        <a 
                                          href={scrapeResult.url} 
                                          target="_blank" 
                                          rel="noopener noreferrer"
                                          className="text-blue-600 dark:text-blue-400 hover:underline text-xs break-all block mt-1"
                                        >
                                          {scrapeResult.url}
                                        </a>
                                      </div>
                                      {scrapeResult.rawHtml && (
                                        <button
                                          onClick={() => setViewingRawHtml({ url: scrapeResult.url, html: scrapeResult.rawHtml })}
                                          className="flex-shrink-0 px-3 py-1.5 text-xs bg-gray-600 hover:bg-gray-700 text-white rounded transition-colors font-medium"
                                          title={t('chat.viewRawHtml')}
                                        >
                                          📄 Raw HTML
                                        </button>
                                      )}
                                    </div>
                                  )}
                                  
                                  {/* Show error if present */}
                                  {scrapeResult.error && (
                                    <div className="bg-red-50 dark:bg-red-900/30 border border-red-300 dark:border-red-700 rounded p-2">
                                      <span className="font-semibold text-red-800 dark:text-red-200">{t('chat.error')}</span>
                                      <p className="text-red-700 dark:text-red-300 text-xs mt-1">{scrapeResult.error}</p>
                                    </div>
                                  )}
                                  
                                  {/* Show content if present */}
                                  {scrapeResult.content && (
                                    <div>
                                      <span className="font-semibold text-purple-800 dark:text-purple-200">
                                        📄 Page Content ({scrapeResult.content.length.toLocaleString()} characters)
                                        {scrapeResult.format && (
                                          <span className="ml-2 text-xs text-purple-600 dark:text-purple-400">
                                            [{scrapeResult.format}]
                                          </span>
                                        )}
                                      </span>
                                      <div className="mt-2 p-3 bg-white dark:bg-gray-900 rounded border border-purple-200 dark:border-purple-800 max-h-80 overflow-y-auto">
                                        {scrapeResult.format === 'markdown' ? (
                                          <div className="text-xs">
                                            <MarkdownRenderer content={scrapeResult.content} />
                                          </div>
                                        ) : (
                                          <pre className="whitespace-pre-wrap text-xs text-gray-700 dark:text-gray-300 leading-relaxed">{scrapeResult.content}</pre>
                                        )}
                                      </div>
                                    </div>
                                  )}
                                  
                                  {/* Extracted Content: Images, Links, Media */}
                                  {(scrapeResult.images || scrapeResult.allImages || scrapeResult.youtube || scrapeResult.media || scrapeResult.links) && (
                                    <div className="mt-4 pt-4 border-t border-purple-200 dark:border-purple-700">
                                      <div className="text-sm font-semibold text-purple-800 dark:text-purple-200 mb-3">
                                        📎 Extracted Content
                                      </div>
                                      
                                      <div className="space-y-3">
                                        {/* Prioritized Images (sent to LLM) */}
                                        {scrapeResult.images && scrapeResult.images.length > 0 && (
                                          <div>
                                            <div className="text-xs font-semibold text-gray-700 dark:text-gray-300 mb-2">
                                              🖼️ Prioritized Images (sent to LLM): {scrapeResult.images.length}
                                            </div>
                                            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                                              {scrapeResult.images.map((img: any, idx: number) => (
                                                <div key={idx} className="border border-gray-200 dark:border-gray-700 rounded p-2">
                                                  <img 
                                                    src={img.src} 
                                                    alt={img.alt || `Image ${idx + 1}`}
                                                    className="w-full h-24 object-cover rounded mb-1"
                                                    loading="lazy"
                                                  />
                                                  {img.alt && (
                                                    <p className="text-[10px] text-gray-600 dark:text-gray-400 truncate">
                                                      {img.alt}
                                                    </p>
                                                  )}
                                                </div>
                                              ))}
                                            </div>
                                          </div>
                                        )}
                                        
                                        {/* All Images (for UI) */}
                                        {scrapeResult.allImages && scrapeResult.allImages.length > 0 && (
                                          <div>
                                            <div className="text-xs font-semibold text-gray-700 dark:text-gray-300 mb-2">
                                              🖼️ All Images: {scrapeResult.allImages.length}
                                            </div>
                                            <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 gap-2">
                                              {scrapeResult.allImages.slice(0, 24).map((img: any, idx: number) => (
                                                <div key={idx} className="border border-gray-200 dark:border-gray-700 rounded p-1">
                                                  <img 
                                                    src={img.src} 
                                                    alt={img.alt || `Image ${idx + 1}`}
                                                    className="w-full h-16 object-cover rounded"
                                                    loading="lazy"
                                                  />
                                                </div>
                                              ))}
                                            </div>
                                            {scrapeResult.allImages.length > 24 && (
                                              <p className="text-[10px] text-gray-500 dark:text-gray-400 mt-1">
                                                ...and {scrapeResult.allImages.length - 24} more
                                              </p>
                                            )}
                                          </div>
                                        )}
                                        
                                        {/* YouTube Videos */}
                                        {scrapeResult.youtube && scrapeResult.youtube.length > 0 && (
                                          <div>
                                            <div className="text-xs font-semibold text-gray-700 dark:text-gray-300 mb-2">
                                              🎬 YouTube Videos: {scrapeResult.youtube.length}
                                            </div>
                                            <div className="space-y-1">
                                              {scrapeResult.youtube.map((link: any, idx: number) => (
                                                <a
                                                  key={idx}
                                                  href={link.url}
                                                  target="_blank"
                                                  rel="noopener noreferrer"
                                                  className="block text-xs text-blue-600 dark:text-blue-400 hover:underline truncate"
                                                >
                                                  {link.text || link.url}
                                                </a>
                                              ))}
                                            </div>
                                          </div>
                                        )}
                                        
                                        {/* Other Media */}
                                        {scrapeResult.media && scrapeResult.media.length > 0 && (
                                          <div>
                                            <div className="text-xs font-semibold text-gray-700 dark:text-gray-300 mb-2">
                                              🎵 Media (Audio/Video): {scrapeResult.media.length}
                                            </div>
                                            <div className="space-y-1">
                                              {scrapeResult.media.map((link: any, idx: number) => (
                                                <a
                                                  key={idx}
                                                  href={link.url}
                                                  target="_blank"
                                                  rel="noopener noreferrer"
                                                  className="block text-xs text-blue-600 dark:text-blue-400 hover:underline truncate"
                                                >
                                                  {link.text || link.url}
                                                </a>
                                              ))}
                                            </div>
                                          </div>
                                        )}
                                        
                                        {/* Regular Links */}
                                        {scrapeResult.links && scrapeResult.links.length > 0 && (
                                          <div>
                                            <div className="text-xs font-semibold text-gray-700 dark:text-gray-300 mb-2">
                                              🔗 Links: {scrapeResult.links.length}
                                            </div>
                                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-1">
                                              {scrapeResult.links.slice(0, 20).map((link: any, idx: number) => (
                                                <a
                                                  key={idx}
                                                  href={link.url}
                                                  target="_blank"
                                                  rel="noopener noreferrer"
                                                  className="block text-xs text-blue-600 dark:text-blue-400 hover:underline truncate"
                                                >
                                                  {link.text || link.url}
                                                </a>
                                              ))}
                                            </div>
                                            {scrapeResult.links.length > 20 && (
                                              <p className="text-[10px] text-gray-500 dark:text-gray-400 mt-1">
                                                ...and {scrapeResult.links.length - 20} more links
                                              </p>
                                            )}
                                          </div>
                                        )}
                                      </div>
                                    </div>
                                  )}
                                </div>
                              ) : jsResult ? (
                                <div className="space-y-3">
                                  {/* Show error if present */}
                                  {jsResult.error && (
                                    <div className="bg-red-50 dark:bg-red-900/30 border border-red-300 dark:border-red-700 rounded p-2">
                                      <span className="font-semibold text-red-800 dark:text-red-200">❌ Error:</span>
                                      <p className="text-red-700 dark:text-red-300 text-xs mt-1 font-mono">{jsResult.error}</p>
                                    </div>
                                  )}
                                  
                                  {/* Show result if present */}
                                  {jsResult.result !== undefined && (
                                    <div>
                                      <div className="flex items-center justify-between gap-2 mb-2">
                                        <span className="font-semibold text-purple-800 dark:text-purple-200">✅ Output:</span>
                                        <div className="flex gap-2">
                                          <button
                                            onClick={() => {
                                              navigator.clipboard.writeText(String(jsResult.result));
                                              showSuccess(t('chat.outputCopied'));
                                            }}
                                            className="text-xs px-2 py-1 bg-purple-600 hover:bg-purple-700 text-white rounded transition-colors"
                                            title={t('chat.copyOutputToClipboard')}
                                          >
                                            Copy
                                          </button>
                                          <button
                                            onClick={() => {
                                              handleCaptureContent(String(jsResult.result), 'tool', 'JavaScript Output');
                                            }}
                                            className="text-xs px-2 py-1 bg-indigo-600 hover:bg-indigo-700 text-white rounded transition-colors"
                                            title={t('chat.captureOutputToSwag')}
                                          >
                                            Grab
                                          </button>
                                        </div>
                                      </div>
                                      {toolCall?.executedAt && (
                                        <span className="text-xs text-gray-600 dark:text-gray-400 block mb-2">
                                          ({toolCall.runtime || 'N/A'})
                                        </span>
                                      )}
                                      <div className="bg-gray-50 dark:bg-gray-950 p-3 rounded border border-green-300 dark:border-green-700">
                                        <pre className="whitespace-pre-wrap text-sm text-gray-900 dark:text-gray-100 font-mono leading-relaxed">
                                          {String(jsResult.result)}
                                        </pre>
                                      </div>
                                    </div>
                                  )}
                                </div>
                              ) : msg.name === 'generate_chart' ? (
                                (() => {
                                  // Find the previous assistant message to extract chart code
                                  let chartCode: string | null = null;
                                  for (let i = idx - 1; i >= 0; i--) {
                                    if (messages[i].role === 'assistant' && messages[i].content) {
                                      chartCode = extractMermaidCode(messages[i].content);
                                      if (chartCode) break;
                                    }
                                  }
                                  return <GenerateChartDisplay content={msg.content} chartCode={chartCode || undefined} />;
                                })()
                              ) : (
                                <pre className="whitespace-pre-wrap text-xs text-gray-800 dark:text-gray-200">
                                  {getMessageText(msg.content)}
                                </pre>
                              )}
                              
                              {/* NEW: Extraction Transparency & Debug Info */}
                              <ToolTransparency
                                rawResponse={msg.rawResponse}
                                extractionMetadata={msg.extractionMetadata}
                              />
                              
                              {/* Capture and Info buttons for tool results */}
                              {msg.content && (
                                <div className="flex gap-2 mt-2 pt-2 border-t border-purple-200 dark:border-purple-700">
                                  <button
                                    onClick={() => handleCaptureContent(getMessageText(msg.content), 'tool', msg.name)}
                                    className="text-xs text-blue-600 dark:text-blue-400 hover:text-blue-900 dark:hover:text-blue-100 flex items-center gap-1"
                                    title="Capture to Swag"
                                  >
                                    <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 11.5V14m0-2.5v-6a1.5 1.5 0 113 0m-3 6a1.5 1.5 0 00-3 0v2a7.5 7.5 0 0015 0v-5a1.5 1.5 0 00-3 0m-6-3V11m0-5.5v-1a1.5 1.5 0 013 0v1m0 0V11m0-5.5a1.5 1.5 0 013 0v3m0 0V11" />
                                    </svg>
                                    Grab
                                  </button>
                                  
                                  {/* Info button - always show for search_web to indicate summarization status */}
                                  {msg.name === 'search_web' && (
                                    <button
                                      onClick={() => msg.llmApiCalls && msg.llmApiCalls.length > 0 ? setShowLlmInfo(idx) : null}
                                      className={`text-xs px-1.5 py-0.5 rounded flex items-center gap-1 transition-colors ${
                                        msg.llmApiCalls && msg.llmApiCalls.length > 0
                                          ? 'bg-purple-50 dark:bg-purple-900/30 hover:bg-purple-100 dark:hover:bg-purple-900/50 cursor-pointer'
                                          : 'text-gray-500 dark:text-gray-500 cursor-default'
                                      }`}
                                      title={msg.llmApiCalls && msg.llmApiCalls.length > 0 ? `View LLM summarization info • ${formatCostDisplay(getMessageCost(msg))}` : "No LLM summarization used"}
                                    >
                                      {msg.llmApiCalls && msg.llmApiCalls.length > 0 ? (
                                        <>
                                          <span className="font-semibold text-green-600 dark:text-green-400">
                                            💰 {formatCostDisplay(getMessageCost(msg))}
                                          </span>
                                          <span className="ml-0.5">ℹ️</span>
                                        </>
                                      ) : (
                                        <>
                                          <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                                          </svg>
                                          <span className="text-[10px]">{t('chat.noSummarization')}</span>
                                        </>
                                      )}
                                    </button>
                                  )}
                                  
                                  {/* Info button for other tools - only show if llmApiCalls present */}
                                  {msg.name !== 'search_web' && msg.llmApiCalls && msg.llmApiCalls.length > 0 && (
                                    <button
                                      onClick={() => setShowLlmInfo(idx)}
                                      className="text-xs px-1.5 py-0.5 rounded bg-purple-50 dark:bg-purple-900/30 hover:bg-purple-100 dark:hover:bg-purple-900/50 flex items-center gap-1 transition-colors"
                                      title={`View LLM transparency info • ${formatCostDisplay(getMessageCost(msg))}`}
                                    >
                                      <span className="font-semibold text-green-600 dark:text-green-400">
                                        💰 {formatCostDisplay(getMessageCost(msg))}
                                      </span>
                                      <span className="ml-0.5">ℹ️</span>
                                    </button>
                                  )}
                                </div>
                              )}
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })()}
                
                {/* User or Assistant Message */}
                {msg.role !== 'tool' && (
                  <>
                    {msg.role === 'assistant' ? (
                      <div>
                        {/* Show search progress ONLY on the last message while it's streaming */}
                        {idx === messages.length - 1 && searchProgress.size > 0 && (
                          <div className="mb-3 space-y-2">
                            {Array.from(searchProgress.values()).map((progress, idx) => (
                              <SearchProgress key={idx} data={progress} />
                            ))}
                          </div>
                        )}
                        
                        {/* Show YouTube search progress ONLY on the last message while it's streaming */}
                        {idx === messages.length - 1 && youtubeSearchProgress.size > 0 && (
                          <div className="mb-3 space-y-2">
                            {Array.from(youtubeSearchProgress.values()).map((progress, idx) => (
                              <YouTubeSearchProgress key={idx} data={progress} />
                            ))}
                          </div>
                        )}
                        
                        {/* Show JavaScript execution progress ONLY on the last message while it's streaming */}
                        {idx === messages.length - 1 && javascriptProgress.size > 0 && (
                          <div className="mb-3 space-y-2">
                            {Array.from(javascriptProgress.values()).map((progress, idx) => (
                              <JavaScriptExecutionProgress key={idx} data={progress} />
                            ))}
                          </div>
                        )}
                        
                        {/* Show image generation progress ONLY on the last message while it's streaming */}
                        {idx === messages.length - 1 && imageGenerationProgress.size > 0 && (
                          <div className="mb-3 space-y-2">
                            {Array.from(imageGenerationProgress.values()).map((progress, idx) => (
                              <ImageGenerationProgress key={idx} data={progress} />
                            ))}
                          </div>
                        )}
                        
                        {/* Show chart generation progress ONLY on the last message while it's streaming */}
                        {idx === messages.length - 1 && chartGenerationProgress.size > 0 && (
                          <div className="mb-3 space-y-2">
                            {Array.from(chartGenerationProgress.values()).map((progress, idx) => (
                              <ChartGenerationProgress key={idx} data={progress} />
                            ))}
                          </div>
                        )}
                        
                        {/* Show transcription progress for tool calls in progress (NOT complete) */}
                        {msg.tool_calls && msg.tool_calls.map((tc: any, tcIdx: number) => {
                          // Transcription progress
                          if (tc.function.name === 'transcribe_url' && transcriptionProgress.has(tc.id)) {
                            console.log(`    Rendering TranscriptionProgress for tool_call ${tcIdx}: ${tc.id}`);
                            const events = transcriptionProgress.get(tc.id);
                            if (!events || events.length === 0) {
                              console.log(`      No events for ${tc.id}, skipping`);
                              return null;
                            }
                            
                            // Check if transcription is complete
                            const lastEvent = events[events.length - 1];
                            const lastType = lastEvent.progress_type || lastEvent.data?.type || '';
                            const isComplete = lastType === 'transcribe_complete' || 
                                             lastType === 'transcription_stopped' ||
                                             lastType === 'error';
                            
                            console.log(`      Last event type: ${lastType}, isComplete: ${isComplete}`);
                            
                            // Only show progress if NOT complete
                            if (isComplete) {
                              console.log(`      Transcription complete, skipping progress render`);
                              return null;
                            }
                            
                            console.log(`      ✅ Rendering progress component for ${tc.id}`);
                            const args = JSON.parse(tc.function.arguments || '{}');
                            return (
                              <div key={tc.id} className="mb-3">
                                <TranscriptionProgress
                                  toolCallId={tc.id}
                                  url={args.url || ''}
                                  events={events as ProgressEvent[] || []}
                                  onStop={handleStopTranscription}
                                />
                              </div>
                            );
                          }
                          
                          // Scraping progress
                          if (tc.function.name === 'scrape_web_content' && scrapingProgress.has(tc.id)) {
                            console.log(`    Rendering ScrapingProgress for tool_call ${tcIdx}: ${tc.id}`);
                            const events = scrapingProgress.get(tc.id);
                            if (!events || events.length === 0) {
                              console.log(`      No events for ${tc.id}, skipping`);
                              return null;
                            }
                            
                            // Check if scraping is complete
                            const lastEvent = events[events.length - 1];
                            const lastType = lastEvent.progress_type || lastEvent.data?.type || '';
                            const isComplete = lastType === 'scrape_complete' || lastType === 'scrape_error';
                            
                            console.log(`      Last event type: ${lastType}, isComplete: ${isComplete}`);
                            
                            // Only show progress if NOT complete
                            if (isComplete) {
                              console.log(`      Scraping complete, skipping progress render`);
                              return null;
                            }
                            
                            console.log(`      ✅ Rendering scraping progress component for ${tc.id}`);
                            const args = JSON.parse(tc.function.arguments || '{}');
                            return (
                              <div key={tc.id} className="mb-3">
                                <ScrapingProgress
                                  toolCallId={tc.id}
                                  url={args.url || ''}
                                  events={events as ProgressEvent[] || []}
                                />
                              </div>
                            );
                          }
                          
                          return null;
                        })}
                        
                        {/* Display tool calls (for debugging and visibility) */}
                        {msg.tool_calls && msg.tool_calls.length > 0 && !msg.toolResults && (
                          <div className="mb-3 space-y-2">
                            {msg.tool_calls.map((tc: any, tcIdx: number) => {
                              let args: any = {};
                              let parseError: string | null = null;
                              try {
                                args = JSON.parse(tc.function.arguments || '{}');
                              } catch (e) {
                                parseError = `Invalid JSON: ${tc.function.arguments}`;
                                console.error(`Failed to parse tool call arguments for ${tc.id}:`, e);
                              }
                              
                              return (
                                <div key={tcIdx} className="bg-blue-50 dark:bg-blue-900/20 border border-blue-300 dark:border-blue-700 rounded-lg p-3">
                                  <div className="text-xs font-semibold text-blue-700 dark:text-blue-300 flex items-center gap-2 mb-2">
                                    <span>🔧 {tc.function.name}</span>
                                    {parseError && (
                                      <span className="text-red-600 dark:text-red-400 font-normal">⚠️ Malformed arguments</span>
                                    )}
                                  </div>
                                  <div className="text-xs text-gray-700 dark:text-gray-300 space-y-1">
                                    {parseError ? (
                                      <div className="bg-red-50 dark:bg-red-900/20 border border-red-300 dark:border-red-700 rounded p-2 font-mono text-[10px]">
                                        {parseError}
                                      </div>
                                    ) : (
                                      Object.entries(args).map(([key, value]) => (
                                        <div key={key}>
                                          <span className="font-semibold">{key}:</span>{' '}
                                          <span className="font-mono">{typeof value === 'string' ? value : JSON.stringify(value)}</span>
                                        </div>
                                      ))
                                    )}
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        )}
                        
                        {/* Waiting indicator for tool execution */}
                        {msg.tool_calls && !msg.toolResults && !msg.isStreaming && (
                          <div className="mb-3 flex items-center gap-2 p-3 bg-blue-50 dark:bg-blue-900/20 rounded-lg">
                            <div className="flex gap-1">
                              <div className="w-2 h-2 bg-blue-500 rounded-full animate-pulse" style={{ animationDelay: '0ms' }}></div>
                              <div className="w-2 h-2 bg-blue-500 rounded-full animate-pulse" style={{ animationDelay: '150ms' }}></div>
                              <div className="w-2 h-2 bg-blue-500 rounded-full animate-pulse" style={{ animationDelay: '300ms' }}></div>
                            </div>
                            <span className="text-sm text-gray-700 dark:text-gray-300">
                              ⚙️ Executing {msg.tool_calls.length} tool{msg.tool_calls.length > 1 ? 's' : ''}...
                            </span>
                          </div>
                        )}
                        
                        {/* Message content - only render if there's actual content */}
                        <div className="flex items-start gap-2">
                          <div className="flex-1">
                            {msg.content && (() => {
                              // Try to extract chart description from toolResults
                              let chartDescription: string | undefined;
                              if (msg.toolResults) {
                                const generateChartResult = msg.toolResults.find((tr: any) => tr.name === 'generate_chart');
                                if (generateChartResult) {
                                  try {
                                    const chartData = typeof generateChartResult.content === 'string' 
                                      ? JSON.parse(generateChartResult.content) 
                                      : generateChartResult.content;
                                    chartDescription = chartData.description || chartData.chart_type;
                                  } catch (e) {
                                    // Ignore parse errors
                                  }
                                }
                              }
                              return <MarkdownRenderer content={getMessageText(msg.content)} chartDescription={chartDescription} />;
                            })()}
                          </div>
                          {/* Read button for completed assistant messages */}
                          {msg.content && !msg.isStreaming && (
                            <ReadButton 
                              text={getMessageText(msg.content)}
                              variant="icon"
                              shouldSummarize={getMessageText(msg.content).length > 500}
                            />
                          )}
                        </div>
                        {msg.isStreaming && (
                          <span className="inline-block w-2 h-4 bg-gray-500 animate-pulse ml-1"></span>
                        )}
                        
                        {/* YouTube Video Results with Play Buttons */}
                        {(() => {
                          // Extract YouTube videos from tool results in the next message
                          const nextMsg = messages[idx + 1];
                          if (nextMsg && nextMsg.role === 'tool') {
                            const youtubeVideos: any[] = [];
                            // Find tool results that match YouTube search tool calls
                            if (msg.tool_calls) {
                              msg.tool_calls.forEach((toolCall: any) => {
                                if (toolCall.function?.name === 'search_youtube') {
                                  // Find corresponding tool result in next message
                                  const toolResult = messages.find((m, i) => 
                                    i > idx && 
                                    m.role === 'tool' && 
                                    m.tool_call_id === toolCall.id
                                  );
                                  if (toolResult && toolResult.content) {
                                    try {
                                      const result = typeof toolResult.content === 'string' 
                                        ? JSON.parse(toolResult.content) 
                                        : toolResult.content;
                                      if (result.videos && Array.isArray(result.videos)) {
                                        youtubeVideos.push(...result.videos);
                                      }
                                    } catch (e) {
                                      console.error('Failed to parse YouTube results:', e);
                                    }
                                  }
                                }
                              });
                            }
                            
                            if (youtubeVideos.length > 0) {
                              return (
                                <YouTubeVideoResults
                                  videos={youtubeVideos}
                                />
                              );
                            }
                          }
                          return null;
                        })()}
                        
                        {/* Extracted content from tool calls - ORGANIZED IN SPECIFIED ORDER */}
                        {(() => {
                          // Show extracted content whenever it exists (not just for final message)
                          if (!msg.extractedContent) return null;
                          
                          const ec = msg.extractedContent;
                          const hasAnyContent = (ec.prioritizedImages && ec.prioritizedImages.length > 0) ||
                                               (ec.allLinks && ec.allLinks.length > 0) ||
                                               (ec.allImages && ec.allImages.length > 0) ||
                                               (ec.youtubeVideos && ec.youtubeVideos.length > 0) ||
                                               (ec.otherVideos && ec.otherVideos.length > 0) ||
                                               (ec.media && ec.media.length > 0);
                          
                          if (!hasAnyContent) return null;
                          
                          return (
                            <div className="mt-4 space-y-4">
                              {/* 1. Selected Images (first 3, displayed immediately) */}
                              {ec.prioritizedImages && ec.prioritizedImages.length > 0 && (
                                <ImageGallery 
                                  images={ec.prioritizedImages.map(img => img.src)}
                                  maxDisplay={3}
                                  onImageClick={(url) => window.open(url, '_blank')}
                                  onGrabImage={handleGrabImage}
                                />
                              )}
                              
                              {/* 2. All Links (collapsible) */}
                              {ec.allLinks && ec.allLinks.length > 0 && (
                                <details className="border border-gray-300 dark:border-gray-700 rounded-lg">
                                  <summary className="cursor-pointer font-semibold p-3 bg-gray-50 dark:bg-gray-800 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-750">
                                    🔗 All Links ({ec.allLinks.length})
                                  </summary>
                                  <div className="p-4 space-y-2">
                                    {ec.allLinks.map((link: any, idx: number) => (
                                      <div key={idx} className="border-b border-gray-200 dark:border-gray-700 pb-2 last:border-b-0">
                                        <div className="flex items-start gap-2">
                                          <span className="text-gray-500 dark:text-gray-400 text-xs mt-0.5">{idx + 1}.</span>
                                          <div className="flex-1 min-w-0">
                                            <a 
                                              href={link.url} 
                                              target="_blank" 
                                              rel="noopener noreferrer"
                                              className="text-blue-600 dark:text-blue-400 hover:underline font-medium break-words"
                                            >
                                              {link.title}
                                            </a>
                                            {link.snippet && (
                                              <p className="text-xs text-gray-600 dark:text-gray-400 mt-1 italic">{link.snippet}</p>
                                            )}
                                          </div>
                                        </div>
                                      </div>
                                    ))}
                                  </div>
                                </details>
                              )}
                              
                              {/* 3. All Images (collapsible) */}
                              {ec.allImages && ec.allImages.length > 0 && (
                                <details className="border border-gray-300 dark:border-gray-700 rounded-lg">
                                  <summary className="cursor-pointer font-semibold p-3 bg-gray-50 dark:bg-gray-800 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-750">
                                    🖼️ All Images ({ec.allImages.length})
                                  </summary>
                                  <div className="p-4 grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                                    {ec.allImages.map((img: any, idx: number) => (
                                      <div key={idx} className="relative group">
                                        <img 
                                          src={img.src} 
                                          alt={img.alt || `Image ${idx + 1}`}
                                          className="w-full h-32 object-cover rounded border border-gray-300 dark:border-gray-700 cursor-pointer hover:opacity-80"
                                          onClick={() => window.open(img.src, '_blank')}
                                          loading="lazy"
                                        />
                                        <button
                                          onClick={() => handleGrabImage(img.src, img.alt || `Image ${idx + 1}`)}
                                          className="absolute top-2 right-2 p-1.5 bg-white dark:bg-gray-800 rounded shadow-lg opacity-0 group-hover:opacity-100 transition-opacity"
                                          title={t('chat.grabImage')}
                                        >
                                          <svg className="w-4 h-4 text-gray-700 dark:text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                                          </svg>
                                        </button>
                                      </div>
                                    ))}
                                  </div>
                                </details>
                              )}
                              
                              {/* 4. All YouTube Videos (collapsible) */}
                              {ec.youtubeVideos && ec.youtubeVideos.length > 0 && (
                                <details className="border border-gray-300 dark:border-gray-700 rounded-lg">
                                  <summary className="cursor-pointer font-semibold p-3 bg-gray-50 dark:bg-gray-800 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-750">
                                    📺 YouTube Videos ({ec.youtubeVideos.length})
                                  </summary>
                                  <div className="p-4 space-y-2">
                                    {ec.youtubeVideos.map((video: any, idx: number) => (
                                      <div key={idx} className="flex items-start gap-2">
                                        <span className="text-gray-500 dark:text-gray-400 text-xs mt-0.5">{idx + 1}.</span>
                                        <a 
                                          href={video.src} 
                                          target="_blank" 
                                          rel="noopener noreferrer"
                                          className="text-blue-600 dark:text-blue-400 hover:underline"
                                        >
                                          {video.title}
                                        </a>
                                      </div>
                                    ))}
                                  </div>
                                </details>
                              )}
                              
                              {/* 5. Other Videos (collapsible) */}
                              {ec.otherVideos && ec.otherVideos.length > 0 && (
                                <details className="border border-gray-300 dark:border-gray-700 rounded-lg">
                                  <summary className="cursor-pointer font-semibold p-3 bg-gray-50 dark:bg-gray-800 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-750">
                                    🎬 Other Videos ({ec.otherVideos.length})
                                  </summary>
                                  <div className="p-4 space-y-2">
                                    {ec.otherVideos.map((video: any, idx: number) => (
                                      <div key={idx} className="flex items-start gap-2">
                                        <span className="text-gray-500 dark:text-gray-400 text-xs mt-0.5">{idx + 1}.</span>
                                        <a 
                                          href={video.src} 
                                          target="_blank" 
                                          rel="noopener noreferrer"
                                          className="text-blue-600 dark:text-blue-400 hover:underline"
                                        >
                                          {video.title}
                                        </a>
                                      </div>
                                    ))}
                                  </div>
                                </details>
                              )}
                              
                              {/* 6. Other Media (collapsible) */}
                              {ec.media && ec.media.length > 0 && (
                                <details className="border border-gray-300 dark:border-gray-700 rounded-lg">
                                  <summary className="cursor-pointer font-semibold p-3 bg-gray-50 dark:bg-gray-800 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-750">
                                    🎵 Audio & Other Media ({ec.media.length})
                                  </summary>
                                  <div className="p-4 space-y-2">
                                    {ec.media.map((item: any, idx: number) => (
                                      <div key={idx} className="flex items-start gap-2">
                                        <span className="text-gray-500 dark:text-gray-400 text-xs mt-0.5">{idx + 1}.</span>
                                        <a 
                                          href={item.src} 
                                          target="_blank" 
                                          rel="noopener noreferrer"
                                          className="text-blue-600 dark:text-blue-400 hover:underline"
                                        >
                                          {item.type || 'Media'}
                                        </a>
                                      </div>
                                    ))}
                                  </div>
                                </details>
                              )}
                            </div>
                          );
                        })()}
                        
                        {/* 7. Tool results embedded in this assistant message - render like tool messages */}
                        {msg.toolResults && msg.toolResults.length > 0 && (
                          <div className="mt-4 space-y-3">
                            {msg.toolResults
                              .filter((toolResult: any) => {
                                // Hide failed image generation attempts (keep only successful ones)
                                if (toolResult.name === 'generate_image') {
                                  try {
                                    const parsed = JSON.parse(toolResult.content);
                                    // Hide if error exists (failed attempt)
                                    if (parsed.error) {
                                      return false;
                                    }
                                  } catch (e) {
                                    // Keep if can't parse
                                  }
                                }
                                return true;
                              })
                              .map((toolResult: any, trIdx: number) => {
                              const isToolExpanded = expandedToolMessages.has(idx * 1000 + trIdx);
                              
                              // Try to parse search results for better display
                              let searchResults: any = null;
                              if (toolResult.name === 'search_web' && typeof toolResult.content === 'string') {
                                try {
                                  const parsed = JSON.parse(toolResult.content);
                                  if (parsed.results && Array.isArray(parsed.results)) {
                                    searchResults = parsed.results;
                                  }
                                } catch (e) {
                                  // Not JSON or not search results
                                }
                              }
                              
                              // Try to parse scrape_web_content results for better display
                              let scrapeResult: any = null;
                              if (toolResult.name === 'scrape_web_content' && typeof toolResult.content === 'string') {
                                try {
                                  const parsed = JSON.parse(toolResult.content);
                                  if (parsed.content || parsed.url) {
                                    scrapeResult = parsed;
                                  }
                                } catch (e) {
                                  // Not JSON
                                }
                              }
                              
                              // Try to parse execute_javascript results for better display
                              let jsResult: any = null;
                              let jsCode: string = '';
                              if (toolResult.name === 'execute_javascript' && typeof toolResult.content === 'string') {
                                try {
                                  const parsed = JSON.parse(toolResult.content);
                                  if (parsed.result !== undefined || parsed.error) {
                                    jsResult = parsed;
                                    // Find the tool call to get the code
                                    const toolCall = msg.tool_calls?.find((tc: any) => tc.id === toolResult.tool_call_id);
                                    if (toolCall) {
                                      try {
                                        const args = JSON.parse(toolCall.function.arguments);
                                        jsCode = args.code || '';
                                      } catch (e) {
                                        // Ignore parse errors
                                      }
                                    }
                                  }
                                } catch (e) {
                                  // Not JSON or not execute results
                                }
                              }
                              
                              return (
                                <div key={trIdx} className="bg-purple-100 dark:bg-purple-900/30 border border-purple-300 dark:border-purple-700 rounded-lg p-3">
                                  <div className="flex items-center justify-between gap-2 mb-2">
                                    <div className="text-xs font-semibold text-purple-700 dark:text-purple-300 flex items-center gap-2">
                                      <span>🔧 {toolResult.name || 'Tool Result'}</span>
                                      {/* Show query for search tools */}
                                      {msg.tool_calls && (toolResult.name === 'search_web' || toolResult.name === 'search_youtube') && (() => {
                                        const toolCall = msg.tool_calls.find((tc: any) => tc.id === toolResult.tool_call_id);
                                        if (toolCall) {
                                          try {
                                            const parsed = JSON.parse(toolCall.function.arguments);
                                            if (parsed.query) {
                                              return (
                                                <span className="font-normal text-purple-600 dark:text-purple-400 italic">
                                                  - "{parsed.query}"
                                                </span>
                                              );
                                            }
                                          } catch (e) {
                                            // Ignore parse errors
                                          }
                                        }
                                        return null;
                                      })()}
                                      {/* Show URL and service for scrape_web_content */}
                                      {toolResult.name === 'scrape_web_content' && (() => {
                                        try {
                                          const parsed = typeof toolResult.content === 'string' ? JSON.parse(toolResult.content) : toolResult.content;
                                          if (parsed.url || parsed.scrapeService || parsed.proxyUsed !== undefined) {
                                            return (
                                              <span className="font-normal text-purple-600 dark:text-purple-400 flex items-center gap-1">
                                                {parsed.url && <a href={parsed.url} target="_blank" rel="noopener noreferrer" className="hover:underline">- {new URL(parsed.url).hostname}</a>}
                                                {parsed.scrapeService && (
                                                  <span className="text-[10px] bg-purple-200 dark:bg-purple-800 px-1.5 py-0.5 rounded">
                                                    {parsed.scrapeService}
                                                  </span>
                                                )}
                                                {parsed.proxyUsed && (
                                                  <span className="text-[10px] bg-green-200 dark:bg-green-800 text-green-700 dark:text-green-300 px-1.5 py-0.5 rounded" title={t('chat.usingProxy')}>
                                                    🔒 proxy
                                                  </span>
                                                )}
                                              </span>
                                            );
                                          }
                                        } catch (e) {
                                          // Ignore parse errors
                                        }
                                        return null;
                                      })()}
                                    </div>
                                    <button
                                      onClick={() => {
                                        const newExpanded = new Set(expandedToolMessages);
                                        const key = idx * 1000 + trIdx;
                                        if (isToolExpanded) {
                                          newExpanded.delete(key);
                                        } else {
                                          newExpanded.add(key);
                                        }
                                        setExpandedToolMessages(newExpanded);
                                      }}
                                      className="text-purple-600 dark:text-purple-400 hover:text-purple-800 dark:hover:text-purple-200"
                                      title={isToolExpanded ? 'Collapse' : 'Expand'}
                                    >
                                      {isToolExpanded ? '▲' : '▼'}
                                    </button>
                                  </div>
                                  
                                  {isToolExpanded && (
                                    <div className="text-xs space-y-2">
                                      {/* Show extraction summaries for this tool */}
                                      {extractionData.size > 0 && Array.from(extractionData.values())
                                        .filter(() => {
                                          // Show extraction data relevant to this tool
                                          if (toolResult.name === 'search_web' || 
                                              toolResult.name === 'scrape_web_content' || 
                                              toolResult.name === 'transcribe_url') {
                                            return true;
                                          }
                                          return false;
                                        })
                                        .map((extraction, exIdx) => (
                                          <ExtractionSummary key={exIdx} data={extraction} />
                                        ))
                                      }
                                      
                                      {/* Search results with nice formatting */}
                                      {searchResults && searchResults.length > 0 ? (
                                        <div className="space-y-3">
                                          {searchResults.map((result: any, rIdx: number) => {
                                            // Use expandedToolMessages Set with a unique key
                                            const searchResultKey = idx * 1000000 + trIdx * 1000 + rIdx;
                                            const isExpanded = expandedToolMessages.has(searchResultKey);
                                            const hasScrapedContent = result.content || result.page_content;
                                            const actualContent = typeof result.content === 'string' ? result.content : 
                                                                typeof result.page_content === 'string' ? result.page_content : 
                                                                JSON.stringify(result.page_content || result.content, null, 2);
                                            
                                            return (
                                              <div key={rIdx} className="bg-white dark:bg-gray-900 rounded border border-purple-200 dark:border-purple-800 overflow-hidden">
                                                {/* Header with title and link */}
                                                <div className="p-3">
                                                  <div className="flex items-start justify-between gap-2">
                                                    <div className="flex-1 min-w-0">
                                                      <a 
                                                        href={result.url} 
                                                        target="_blank" 
                                                        rel="noopener noreferrer"
                                                        className="font-semibold text-purple-700 dark:text-purple-300 hover:underline block mb-1"
                                                      >
                                                        {result.title}
                                                      </a>
                                                      {(result.snippet || result.description) && (
                                                        <p className="text-gray-700 dark:text-gray-300 text-xs mb-2">
                                                          {result.snippet || result.description}
                                                        </p>
                                                      )}
                                                      <a 
                                                        href={result.url} 
                                                        target="_blank" 
                                                        rel="noopener noreferrer"
                                                        className="text-blue-600 dark:text-blue-400 hover:underline text-[10px] break-all block"
                                                      >
                                                        {result.url}
                                                      </a>
                                                    </div>
                                                    
                                                    {/* Expand button for scraped content */}
                                                    {hasScrapedContent && (
                                                      <button
                                                        onClick={() => {
                                                          const newExpanded = new Set(expandedToolMessages);
                                                          if (isExpanded) {
                                                            newExpanded.delete(searchResultKey);
                                                          } else {
                                                            newExpanded.add(searchResultKey);
                                                          }
                                                          setExpandedToolMessages(newExpanded);
                                                        }}
                                                        className="flex-shrink-0 text-purple-600 dark:text-purple-400 hover:text-purple-800 dark:hover:text-purple-200 text-xs"
                                                        title={isExpanded ? 'Hide details' : 'Show details'}
                                                      >
                                                        {isExpanded ? '▲' : '▼'}
                                                      </button>
                                                    )}
                                                  </div>
                                                  
                                                  {/* Metadata badges */}
                                                  <div className="flex flex-wrap gap-1.5 mt-2">
                                                    {result.state && (
                                                      <span className={`text-[10px] px-1.5 py-0.5 rounded ${
                                                        result.state === 'success' 
                                                          ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300' 
                                                          : 'bg-yellow-100 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-300'
                                                      }`}>
                                                        {result.state}
                                                      </span>
                                                    )}
                                                    {result.fetchTimeMs !== undefined && (
                                                      <span className="text-[10px] bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 px-1.5 py-0.5 rounded">
                                                        ⏱️ {result.fetchTimeMs}ms
                                                      </span>
                                                    )}
                                                    {result.contentFormat && (
                                                      <span className="text-[10px] bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 px-1.5 py-0.5 rounded">
                                                        {result.contentFormat}
                                                      </span>
                                                    )}
                                                    {result.intelligentlyExtracted && (
                                                      <span className="text-[10px] bg-indigo-100 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-300 px-1.5 py-0.5 rounded" title={t('chat.contentExtracted')}>
                                                        🧠 smart
                                                      </span>
                                                    )}
                                                    {result.truncated && (
                                                      <span className="text-[10px] bg-orange-100 dark:bg-orange-900/30 text-orange-700 dark:text-orange-300 px-1.5 py-0.5 rounded" title={t('chat.truncatedToFit')}>
                                                        ✂️ truncated
                                                      </span>
                                                    )}
                                                  </div>
                                                </div>
                                                
                                                {/* Expandable details section */}
                                                {isExpanded && hasScrapedContent && (
                                                  <div className="border-t border-purple-200 dark:border-purple-800 bg-purple-50/50 dark:bg-purple-900/10">
                                                    {/* Scraping & Compression metadata */}
                                                    <div className="px-3 py-2 border-b border-purple-200 dark:border-purple-800">
                                                      <div className="text-xs font-semibold text-purple-700 dark:text-purple-300 mb-2">
                                                        📊 Scraping & Compression Details:
                                                      </div>
                                                      <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-[10px]">
                                                        {/* Scrape Strategy */}
                                                        <div className="col-span-2">
                                                          <span className="text-gray-500 dark:text-gray-400">{t('chat.scrapeMethod')}</span>{' '}
                                                          <span className="font-semibold text-purple-600 dark:text-purple-400">
                                                            {result.tier !== undefined ? (
                                                              <>{t('chat.tier')} {result.tier} - {result.scrapeMethod || result.scrapeService}</>
                                                            ) : (
                                                              'Direct HTTP Fetch'
                                                            )}
                                                          </span>
                                                          {result.tier !== undefined && (
                                                            <span className="text-gray-500 dark:text-gray-400 text-[9px] block mt-0.5">
                                                              {result.tier === 0 && '(Simple HTTP GET - fast, no browser)'}
                                                              {result.tier === 1 && '(Puppeteer - browser automation with stealth)'}
                                                              {result.tier === 2 && '(Playwright - advanced browser automation)'}
                                                              {result.tier === 3 && '(Selenium - complex interactions)'}
                                                              {result.tier === 4 && '(Interactive - manual CAPTCHA/login)'}
                                                            </span>
                                                          )}
                                                        </div>
                                                        
                                                        {/* Scrape Time (from tier orchestrator) */}
                                                        {result.responseTime !== undefined && (
                                                          <div>
                                                            <span className="text-gray-500 dark:text-gray-400">{t('chat.scrapeTime')}</span>{' '}
                                                            <span className="font-mono text-gray-700 dark:text-gray-300">
                                                              {result.responseTime}ms
                                                            </span>
                                                          </div>
                                                        )}
                                                        
                                                        {/* Total Processing Time */}
                                                        {result.fetchTimeMs !== undefined && (
                                                          <div>
                                                            <span className="text-gray-500 dark:text-gray-400">{t('chat.totalTime')}</span>{' '}
                                                            <span className="font-mono text-gray-700 dark:text-gray-300">
                                                              {result.fetchTimeMs}ms
                                                            </span>
                                                          </div>
                                                        )}
                                                        
                                                        {/* Content Format */}
                                                        {result.contentFormat && (
                                                          <div>
                                                            <span className="text-gray-500 dark:text-gray-400">{t('chat.format')}</span>{' '}
                                                            <span className="font-mono text-gray-700 dark:text-gray-300">
                                                              {result.contentFormat}
                                                            </span>
                                                          </div>
                                                        )}
                                                        
                                                        {/* Original Size */}
                                                        {(result.originalLength || result.originalContentLength) && (
                                                          <div>
                                                            <span className="text-gray-500 dark:text-gray-400">{t('chat.originalSize')}</span>{' '}
                                                            <span className="font-mono text-gray-700 dark:text-gray-300">
                                                              {((result.originalLength || result.originalContentLength) / 1024).toFixed(1)}KB
                                                            </span>
                                                          </div>
                                                        )}
                                                        
                                                        {/* Compressed Size */}
                                                        {actualContent && (
                                                          <div>
                                                            <span className="text-gray-500 dark:text-gray-400">{t('chat.compressedSize')}</span>{' '}
                                                            <span className="font-mono text-gray-700 dark:text-gray-300">
                                                              {(actualContent.length / 1024).toFixed(1)}KB
                                                            </span>
                                                          </div>
                                                        )}
                                                        
                                                        {/* Compression Ratio */}
                                                        {result.compressionRatio && (
                                                          <div>
                                                            <span className="text-gray-500 dark:text-gray-400">{t('chat.compression')}</span>{' '}
                                                            <span className="font-mono text-green-600 dark:text-green-400">
                                                              {result.compressionRatio.toFixed(2)}x
                                                            </span>
                                                          </div>
                                                        )}
                                                        
                                                        {/* Compression Method */}
                                                        <div className="col-span-2">
                                                          <span className="text-gray-500 dark:text-gray-400">{t('chat.compressionStrategy')}</span>{' '}
                                                          <span className="text-gray-700 dark:text-gray-300">
                                                            {result.intelligentlyExtracted ? (
                                                              <span>
                                                                Smart extraction 
                                                                {result.contentFormat === 'markdown' ? ' → Markdown' : ' → Plain text'}
                                                                {result.truncated && ' → Truncated to model limits'}
                                                              </span>
                                                            ) : (
                                                              <span>{t('chat.basicExtraction')}</span>
                                                            )}
                                                          </span>
                                                        </div>
                                                        
                                                        {/* Note about LLM calls */}
                                                        <div className="col-span-2 mt-1 text-gray-500 dark:text-gray-400 italic">
                                                          Note: No LLM calls used for compression (rule-based extraction only)
                                                        </div>
                                                      </div>
                                                    </div>
                                                    
                                                    {/* Content at different processing stages */}
                                                    <div className="p-3 space-y-3">
                                                      {/* Stage 1: Raw HTML (massive - show in dialog) */}
                                                      {result.rawHtml && (
                                                        <div>
                                                          <div className="text-xs font-semibold text-purple-700 dark:text-purple-300 mb-1 flex items-center justify-between">
                                                            <span>🌐 Stage 1: Raw HTML from Scraper</span>
                                                            <span className="text-[10px] font-normal text-gray-500 dark:text-gray-400">
                                                              {result.rawHtml.length.toLocaleString()} chars
                                                            </span>
                                                          </div>
                                                          <button
                                                            onClick={() => {
                                                              // Create modal with safe DOM manipulation (XSS-protected)
                                                              const modal = document.createElement('div');
                                                              modal.className = 'fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50';
                                                              
                                                              const modalContent = document.createElement('div');
                                                              modalContent.className = 'bg-white dark:bg-gray-800 w-11/12 h-5/6 rounded-lg shadow-xl flex flex-col';
                                                              
                                                              const header = document.createElement('div');
                                                              header.className = 'flex items-center justify-between p-4 border-b border-gray-200 dark:border-gray-700';
                                                              
                                                              const title = document.createElement('h3');
                                                              title.className = 'text-lg font-semibold text-gray-900 dark:text-gray-100';
                                                              title.textContent = t('chat.rawHtml', { count: result.rawHtml.length.toLocaleString() });
                                                              
                                                              const closeBtn = document.createElement('button');
                                                              closeBtn.className = 'text-gray-500 hover:text-gray-700 dark:hover:text-gray-300';
                                                              closeBtn.innerHTML = '<svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" /></svg>';
                                                              closeBtn.onclick = () => modal.remove();
                                                              
                                                              const body = document.createElement('div');
                                                              body.className = 'flex-1 overflow-auto p-4';
                                                              
                                                              const pre = document.createElement('pre');
                                                              pre.className = 'text-xs text-gray-900 dark:text-gray-100 font-mono whitespace-pre-wrap';
                                                              pre.textContent = result.rawHtml; // textContent auto-escapes
                                                              
                                                              body.appendChild(pre);
                                                              header.appendChild(title);
                                                              header.appendChild(closeBtn);
                                                              modalContent.appendChild(header);
                                                              modalContent.appendChild(body);
                                                              modal.appendChild(modalContent);
                                                              document.body.appendChild(modal);
                                                            }}
                                                            className="px-3 py-1 text-xs bg-purple-100 dark:bg-purple-900 text-purple-700 dark:text-purple-300 rounded hover:bg-purple-200 dark:hover:bg-purple-800"
                                                          >
                                                            Show Full HTML
                                                          </button>
                                                        </div>
                                                      )}
                                                      
                                                      {/* Stage 2: Raw Text (innerText - large) */}
                                                      {result.rawText && (
                                                        <div>
                                                          <div className="text-xs font-semibold text-purple-700 dark:text-purple-300 mb-1 flex items-center justify-between">
                                                            <span>📄 Stage 2: Raw Text (innerText)</span>
                                                            <span className="text-[10px] font-normal text-gray-500 dark:text-gray-400">
                                                              {result.rawText.length.toLocaleString()} chars
                                                            </span>
                                                          </div>
                                                          <button
                                                            onClick={() => {
                                                              // Create modal with safe DOM manipulation (XSS-protected)
                                                              const modal = document.createElement('div');
                                                              modal.className = 'fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50';
                                                              
                                                              const modalContent = document.createElement('div');
                                                              modalContent.className = 'bg-white dark:bg-gray-800 w-11/12 h-5/6 rounded-lg shadow-xl flex flex-col';
                                                              
                                                              const header = document.createElement('div');
                                                              header.className = 'flex items-center justify-between p-4 border-b border-gray-200 dark:border-gray-700';
                                                              
                                                              const title = document.createElement('h3');
                                                              title.className = 'text-lg font-semibold text-gray-900 dark:text-gray-100';
                                                              title.textContent = t('chat.rawText', { count: result.rawText.length.toLocaleString() });
                                                              
                                                              const closeBtn = document.createElement('button');
                                                              closeBtn.className = 'text-gray-500 hover:text-gray-700 dark:hover:text-gray-300';
                                                              closeBtn.innerHTML = '<svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" /></svg>';
                                                              closeBtn.onclick = () => modal.remove();
                                                              
                                                              const body = document.createElement('div');
                                                              body.className = 'flex-1 overflow-auto p-4';
                                                              
                                                              const pre = document.createElement('pre');
                                                              pre.className = 'text-xs text-gray-900 dark:text-gray-100 font-mono whitespace-pre-wrap';
                                                              pre.textContent = result.rawText; // textContent auto-escapes
                                                              
                                                              body.appendChild(pre);
                                                              header.appendChild(title);
                                                              header.appendChild(closeBtn);
                                                              modalContent.appendChild(header);
                                                              modalContent.appendChild(body);
                                                              modal.appendChild(modalContent);
                                                              document.body.appendChild(modal);
                                                            }}
                                                            className="px-3 py-1 text-xs bg-purple-100 dark:bg-purple-900 text-purple-700 dark:text-purple-300 rounded hover:bg-purple-200 dark:hover:bg-purple-800"
                                                          >
                                                            Show Full Text
                                                          </button>
                                                        </div>
                                                      )}
                                                      
                                                      {/* Stage 3: After Smart Extraction */}
                                                      {result.afterSmartExtraction && (
                                                        <div>
                                                          <div className="text-xs font-semibold text-purple-700 dark:text-purple-300 mb-2 flex items-center justify-between">
                                                            <span>✨ Stage 3: After Smart Extraction (Headers/Nav/Footers Removed)</span>
                                                            <span className="text-[10px] font-normal text-gray-500 dark:text-gray-400">
                                                              {result.afterSmartExtraction.length.toLocaleString()} chars
                                                            </span>
                                                          </div>
                                                          <div className="bg-white dark:bg-gray-900 p-3 rounded border border-purple-200 dark:border-purple-700 max-h-48 overflow-y-auto">
                                                            <pre className="whitespace-pre-wrap text-[11px] text-gray-900 dark:text-gray-100 font-mono leading-relaxed">
                                                              {result.afterSmartExtraction}
                                                            </pre>
                                                          </div>
                                                        </div>
                                                      )}
                                                      
                                                      {/* Stage 4: After Summarization (if applied) */}
                                                      {result.afterSummarization && result.beforeSummarization && result.afterSummarization !== result.beforeSummarization && (
                                                        <div>
                                                          <div className="text-xs font-semibold text-purple-700 dark:text-purple-300 mb-2 flex items-center justify-between">
                                                            <span>🔍 Stage 4: After AI Summarization</span>
                                                            <span className="text-[10px] font-normal text-gray-500 dark:text-gray-400">
                                                              {result.afterSummarization.length.toLocaleString()} chars
                                                            </span>
                                                          </div>
                                                          <div className="bg-white dark:bg-gray-900 p-3 rounded border border-amber-200 dark:border-amber-700 max-h-48 overflow-y-auto">
                                                            <pre className="whitespace-pre-wrap text-[11px] text-gray-900 dark:text-gray-100 font-mono leading-relaxed">
                                                              {result.afterSummarization}
                                                            </pre>
                                                          </div>
                                                        </div>
                                                      )}
                                                      
                                                      {/* Stage 5: Sent to LLM (FINAL) */}
                                                      {result.sentToLLM && (
                                                        <div>
                                                          <div className="text-xs font-semibold text-green-700 dark:text-green-300 mb-2 flex items-center justify-between">
                                                            <span>🎯 Stage 5: SENT TO LLM (Tool Result)</span>
                                                            <span className="text-[10px] font-normal text-gray-500 dark:text-gray-400">
                                                              {result.sentToLLM.length.toLocaleString()} chars
                                                            </span>
                                                          </div>
                                                          <div className="bg-green-50 dark:bg-green-900/20 p-3 rounded border-2 border-green-500 dark:border-green-600 max-h-64 overflow-y-auto">
                                                            <pre className="whitespace-pre-wrap text-[11px] text-gray-900 dark:text-gray-100 font-mono leading-relaxed">
                                                              {result.sentToLLM}
                                                            </pre>
                                                          </div>
                                                        </div>
                                                      )}
                                                      
                                                      {/* Processing Summary */}
                                                      <div className="pt-2 border-t border-purple-200 dark:border-purple-800">
                                                        <div className="text-[10px] text-gray-600 dark:text-gray-400 space-y-1">
                                                          <div className="font-semibold text-gray-700 dark:text-gray-300 mb-1">{t('chat.contentProcessingPipeline')}</div>
                                                          {result.rawHtml && <div>• Raw HTML: {result.rawHtml.length.toLocaleString()} chars</div>}
                                                          {result.rawText && <div>• Raw Text: {result.rawText.length.toLocaleString()} chars</div>}
                                                          {result.afterSmartExtraction && <div>• Smart Extraction: {result.afterSmartExtraction.length.toLocaleString()} chars</div>}
                                                          {result.afterSummarization && result.beforeSummarization && result.afterSummarization !== result.beforeSummarization && (
                                                            <div>• After Summarization: {result.afterSummarization.length.toLocaleString()} chars</div>
                                                          )}
                                                          {result.sentToLLM && <div className="font-semibold text-green-600 dark:text-green-400">→ Sent to LLM: {result.sentToLLM.length.toLocaleString()} chars</div>}
                                                        </div>
                                                      </div>
                                                    </div>
                                                  </div>
                                                )}
                                              </div>
                                            );
                                          })}
                                        </div>
                                      ) : scrapeResult ? (
                                        <div className="space-y-3">
                                          {/* Error if present */}
                                          {scrapeResult.error && (
                                            <div className="bg-red-50 dark:bg-red-900/30 border border-red-300 dark:border-red-700 rounded p-3">
                                              <span className="font-semibold text-red-800 dark:text-red-200">❌ Scraping Error:</span>
                                              <p className="text-red-700 dark:text-red-300 text-xs mt-1 font-mono whitespace-pre-wrap">{scrapeResult.error}</p>
                                            </div>
                                          )}
                                          
                                          {/* Warning if present */}
                                          {scrapeResult.warning && (
                                            <div className="bg-yellow-50 dark:bg-yellow-900/30 border border-yellow-300 dark:border-yellow-700 rounded p-2">
                                              <span className="font-semibold text-yellow-800 dark:text-yellow-200">⚠️ Warning:</span>
                                              <p className="text-yellow-700 dark:text-yellow-300 text-xs mt-1">{scrapeResult.warning}</p>
                                            </div>
                                          )}
                                          
                                          {/* Metadata table with Raw HTML button */}
                                          {(scrapeResult.format || scrapeResult.compressionRatio || scrapeResult.originalLength || scrapeResult.extractedLength) && (
                                            <div>
                                              <div className="flex items-center justify-between mb-2">
                                                <div className="font-semibold text-purple-700 dark:text-purple-300">📊 Metadata:</div>
                                                {(() => {
                                                  // Find raw HTML from extractionData
                                                  const extractionEntry = Array.from(extractionData.values()).find(
                                                    e => e.url === scrapeResult.url
                                                  );
                                                  const rawHtml = extractionEntry?.rawHtml;
                                                  
                                                  return rawHtml ? (
                                                    <button
                                                      onClick={() => setShowRawHtml({ html: rawHtml, url: scrapeResult.url })}
                                                      className="text-xs px-2 py-1 bg-purple-200 dark:bg-purple-800 text-purple-700 dark:text-purple-300 rounded hover:bg-purple-300 dark:hover:bg-purple-700"
                                                    >
                                                      View Raw HTML
                                                    </button>
                                                  ) : null;
                                                })()}
                                              </div>
                                              <table className="w-full text-xs border-collapse">
                                                <tbody>
                                                  {scrapeResult.format && (
                                                    <tr className="border-b border-purple-200 dark:border-purple-800">
                                                      <td className="py-1 pr-3 text-gray-600 dark:text-gray-400">{t('chat.format')}</td>
                                                      <td className="py-1 font-medium text-gray-900 dark:text-gray-100">
                                                        {scrapeResult.format === 'markdown' ? '📝 Markdown' : '📄 Plain Text'}
                                                      </td>
                                                    </tr>
                                                  )}
                                                  {typeof scrapeResult.originalLength === 'number' && typeof scrapeResult.extractedLength === 'number' && (
                                                    <tr className="border-b border-purple-200 dark:border-purple-800">
                                                      <td className="py-1 pr-3 text-gray-600 dark:text-gray-400">{t('chat.size')}</td>
                                                      <td className="py-1 font-medium text-gray-900 dark:text-gray-100">
                                                        {(scrapeResult.originalLength / 1024).toFixed(1)}KB → {(scrapeResult.extractedLength / 1024).toFixed(1)}KB
                                                      </td>
                                                    </tr>
                                                  )}
                                                  {scrapeResult.compressionRatio && typeof scrapeResult.compressionRatio === 'number' && (
                                                    <tr className="border-b border-purple-200 dark:border-purple-800">
                                                      <td className="py-1 pr-3 text-gray-600 dark:text-gray-400">{t('chat.compression')}</td>
                                                      <td className="py-1 font-medium text-gray-900 dark:text-gray-100">
                                                        {scrapeResult.compressionRatio.toFixed(1)}x
                                                      </td>
                                                    </tr>
                                                  )}
                                                </tbody>
                                              </table>
                                            </div>
                                          )}
                                          
                                          {/* Content with markdown rendering */}
                                          {scrapeResult.content && (
                                            <div>
                                              <div className="font-semibold text-purple-700 dark:text-purple-300 mb-2">📄 Content:</div>
                                              <div className="bg-white dark:bg-gray-900 p-3 rounded border border-purple-200 dark:border-purple-800 max-h-96 overflow-y-auto">
                                                {scrapeResult.format === 'markdown' ? (
                                                  <MarkdownRenderer content={scrapeResult.content} />
                                                ) : (
                                                  <pre className="whitespace-pre-wrap text-sm text-gray-900 dark:text-gray-100 leading-relaxed">
                                                    {scrapeResult.content}
                                                  </pre>
                                                )}
                                              </div>
                                            </div>
                                          )}
                                        </div>
                                      ) : jsResult ? (
                                        <div className="space-y-3">
                                          {/* Show the code that was executed */}
                                          {jsCode && (
                                            <div>
                                              <div className="flex items-center justify-between gap-2 mb-2">
                                                <span className="font-semibold text-purple-700 dark:text-purple-300">💻 Code:</span>
                                                <div className="flex gap-2">
                                                  <button
                                                    onClick={() => {
                                                      navigator.clipboard.writeText(jsCode);
                                                      showSuccess(t('chat.codeCopied'));
                                                    }}
                                                    className="text-xs px-2 py-1 bg-purple-600 hover:bg-purple-700 text-white rounded transition-colors"
                                                    title={t('chat.copyCodeToClipboard')}
                                                  >
                                                    Copy
                                                  </button>
                                                  <button
                                                    onClick={() => {
                                                      handleCaptureContent(jsCode, 'tool', 'JavaScript Code');
                                                    }}
                                                    className="text-xs px-2 py-1 bg-indigo-600 hover:bg-indigo-700 text-white rounded transition-colors"
                                                    title={t('chat.captureCodeToSwag')}
                                                  >
                                                    Grab
                                                  </button>
                                                </div>
                                              </div>
                                              <div className="bg-gray-900 text-green-400 p-3 rounded font-mono text-xs overflow-x-auto max-h-64 overflow-y-auto">
                                                <pre className="whitespace-pre-wrap leading-relaxed">{jsCode}</pre>
                                              </div>
                                            </div>
                                          )}
                                          
                                          {/* Show error if present */}
                                          {jsResult.error && (
                                            <div className="bg-red-50 dark:bg-red-900/30 border border-red-300 dark:border-red-700 rounded p-2">
                                              <span className="font-semibold text-red-800 dark:text-red-200">❌ Error:</span>
                                              <p className="text-red-700 dark:text-red-300 text-xs mt-1 font-mono">{jsResult.error}</p>
                                            </div>
                                          )}
                                          
                                          {/* Show result if present */}
                                          {jsResult.result !== undefined && (
                                            <div>
                                              <div className="flex items-center justify-between gap-2 mb-2">
                                                <span className="font-semibold text-purple-700 dark:text-purple-300">✅ Output:</span>
                                                <div className="flex gap-2">
                                                  <button
                                                    onClick={() => {
                                                      navigator.clipboard.writeText(String(jsResult.result));
                                                      showSuccess(t('chat.outputCopied'));
                                                    }}
                                                    className="text-xs px-2 py-1 bg-purple-600 hover:bg-purple-700 text-white rounded transition-colors"
                                                    title="Copy output to clipboard"
                                                  >
                                                    Copy
                                                  </button>
                                                  <button
                                                    onClick={() => {
                                                      handleCaptureContent(String(jsResult.result), 'tool', 'JavaScript Output');
                                                    }}
                                                    className="text-xs px-2 py-1 bg-indigo-600 hover:bg-indigo-700 text-white rounded transition-colors"
                                                    title="Capture output to Swag"
                                                  >
                                                    Grab
                                                  </button>
                                                </div>
                                              </div>
                                              <div className="bg-gray-50 dark:bg-gray-950 p-3 rounded border border-green-300 dark:border-green-700">
                                                <pre className="whitespace-pre-wrap text-sm text-gray-900 dark:text-gray-100 font-mono leading-relaxed">
                                                  {String(jsResult.result)}
                                                </pre>
                                              </div>
                                            </div>
                                          )}
                                        </div>
                                      ) : toolResult.name === 'generate_chart' ? (
                                        <GenerateChartDisplay 
                                          content={toolResult.content} 
                                          chartCode={extractMermaidCode(msg.content) || undefined} 
                                        />
                                      ) : toolResult.name === 'generate_image' ? (
                                        (() => {
                                          // Image is shown ABOVE (always visible), here we show metadata when expanded
                                          // IMPORTANT: Find by tool_call_id, not by array index!
                                          const toolCallId = toolResult.tool_call_id || toolResult.id;
                                          const imageGeneration = msg.imageGenerations?.find((ig: any) => 
                                            ig.id === toolCallId
                                          );
                                          
                                          if (imageGeneration) {
                                            return (
                                              <div className="space-y-3 mt-3">
                                                {/* Metadata table */}
                                                <div className="overflow-x-auto">
                                                  <table className="w-full text-sm border-collapse border border-purple-200 dark:border-purple-800 rounded">
                                                    <tbody>
                                                      {imageGeneration.prompt && (
                                                        <tr className="border-b border-purple-200 dark:border-purple-800">
                                                          <td className="py-2 px-3 font-semibold bg-purple-50 dark:bg-purple-900/20 w-1/3">{t('chat.titlePrompt')}</td>
                                                          <td className="py-2 px-3">{imageGeneration.prompt}</td>
                                                        </tr>
                                                      )}
                                                      {imageGeneration.revisedPrompt && imageGeneration.revisedPrompt !== imageGeneration.prompt && (
                                                        <tr className="border-b border-purple-200 dark:border-purple-800">
                                                          <td className="py-2 px-3 font-semibold bg-purple-50 dark:bg-purple-900/20">{t('chat.finalPrompt')}</td>
                                                          <td className="py-2 px-3">{imageGeneration.revisedPrompt}</td>
                                                        </tr>
                                                      )}
                                                      {imageGeneration.size && (
                                                        <tr className="border-b border-purple-200 dark:border-purple-800">
                                                          <td className="py-2 px-3 font-semibold bg-purple-50 dark:bg-purple-900/20">Size</td>
                                                          <td className="py-2 px-3">{imageGeneration.size}</td>
                                                        </tr>
                                                      )}
                                                      {imageGeneration.model && (
                                                        <tr className="border-b border-purple-200 dark:border-purple-800">
                                                          <td className="py-2 px-3 font-semibold bg-purple-50 dark:bg-purple-900/20">Model</td>
                                                          <td className="py-2 px-3">{imageGeneration.provider}/{imageGeneration.model}</td>
                                                        </tr>
                                                      )}
                                                      {imageGeneration.qualityTier && (
                                                        <tr className="border-b border-purple-200 dark:border-purple-800">
                                                          <td className="py-2 px-3 font-semibold bg-purple-50 dark:bg-purple-900/20">Quality</td>
                                                          <td className="py-2 px-3 capitalize">{imageGeneration.qualityTier}</td>
                                                        </tr>
                                                      )}
                                                      {imageGeneration.cost !== undefined && (
                                                        <tr className="border-b border-purple-200 dark:border-purple-800">
                                                          <td className="py-2 px-3 font-semibold bg-purple-50 dark:bg-purple-900/20">Cost</td>
                                                          <td className="py-2 px-3">${imageGeneration.cost.toFixed(4)}</td>
                                                        </tr>
                                                      )}
                                                      <tr>
                                                        <td className="py-2 px-3 font-semibold bg-purple-50 dark:bg-purple-900/20">Status</td>
                                                        <td className="py-2 px-3">
                                                          {imageGeneration.status === 'complete' ? (
                                                            <span className="text-green-600 dark:text-green-400 font-semibold">✅ Success</span>
                                                          ) : imageGeneration.status === 'error' ? (
                                                            <span className="text-red-600 dark:text-red-400 font-semibold">❌ Failed</span>
                                                          ) : (
                                                            <span className="text-yellow-600 dark:text-yellow-400">{imageGeneration.status}</span>
                                                          )}
                                                        </td>
                                                      </tr>
                                                    </tbody>
                                                  </table>
                                                </div>
                                                
                                                {/* JSON expandable trees */}
                                                {imageGeneration.llmApiCall?.request && (
                                                  <div className="border border-gray-200 dark:border-gray-700 rounded overflow-hidden">
                                                    <button
                                                      onClick={() => {
                                                        const id = `img-req-${imageGeneration.id}`;
                                                        const el = document.getElementById(id);
                                                        if (el) el.classList.toggle('hidden');
                                                      }}
                                                      className="w-full px-3 py-2 flex items-center justify-between bg-gray-50 dark:bg-gray-800 hover:bg-gray-100 dark:hover:bg-gray-750 transition-colors"
                                                    >
                                                      <span className="font-mono text-sm text-gray-700 dark:text-gray-300">📤 Request Data</span>
                                                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                                                      </svg>
                                                    </button>
                                                    <pre id={`img-req-${imageGeneration.id}`} className="hidden p-3 text-xs overflow-auto max-h-96 bg-white dark:bg-gray-900 font-mono text-gray-800 dark:text-gray-200">
                                                      {JSON.stringify(imageGeneration.llmApiCall.request, null, 2)}
                                                    </pre>
                                                  </div>
                                                )}
                                                
                                                {imageGeneration.llmApiCall?.response && (
                                                  <div className="border border-gray-200 dark:border-gray-700 rounded overflow-hidden">
                                                    <button
                                                      onClick={() => {
                                                        const id = `img-res-${imageGeneration.id}`;
                                                        const el = document.getElementById(id);
                                                        if (el) el.classList.toggle('hidden');
                                                      }}
                                                      className="w-full px-3 py-2 flex items-center justify-between bg-gray-50 dark:bg-gray-800 hover:bg-gray-100 dark:hover:bg-gray-750 transition-colors"
                                                    >
                                                      <span className="font-mono text-sm text-gray-700 dark:text-gray-300">📥 Response Data</span>
                                                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                                                      </svg>
                                                    </button>
                                                    <pre id={`img-res-${imageGeneration.id}`} className="hidden p-3 text-xs overflow-auto max-h-96 bg-white dark:bg-gray-900 font-mono text-gray-800 dark:text-gray-200">
                                                      {JSON.stringify(imageGeneration.llmApiCall.response, null, 2)}
                                                    </pre>
                                                  </div>
                                                )}
                                              </div>
                                            );
                                          }

                                          // Fallback: try to parse from tool result content
                                          try {
                                            // Parse image result but don't use it directly - just validate
                                            typeof toolResult.content === 'string' 
                                              ? JSON.parse(toolResult.content) 
                                              : toolResult.content;
                                            return <ToolResultJsonViewer content={toolResult.content} />;
                                          } catch (e) {
                                            return <ToolResultJsonViewer content={toolResult.content} />;
                                          }
                                        })()
                                      ) : (
                                        <ToolResultJsonViewer content={toolResult.content} />
                                      )}
                                    </div>
                                  )}
                                  
                                  {/* Special handling for generate_image: show image AFTER metadata */}
                                  {toolResult.name === 'generate_image' && (() => {
                                    // IMPORTANT: toolResult uses tool_call_id, not id!
                                    const toolCallId = toolResult.tool_call_id || toolResult.id;
                                    
                                    // Find the imageGeneration that matches this tool call's ID
                                    const imageGeneration = msg.imageGenerations?.find((ig: any) => 
                                      ig.id === toolCallId
                                    );
                                    
                                    // Show loading/progress indicator during generation or download
                                    if (imageGeneration && (imageGeneration.status === 'generating' || imageGeneration.status === 'downloading')) {
                                      const phase = imageGeneration.phase || 'generating';
                                      const estimatedSec = imageGeneration.estimatedSeconds || 15;
                                      
                                      let phaseText = '🎨 Generating image...';
                                      let phaseDetail = 'This may take 10-30 seconds for high-quality images';
                                      
                                      if (phase === 'selecting_provider') {
                                        phaseText = '🔍 Selecting image provider...';
                                        phaseDetail = 'Finding best available model';
                                      } else if (phase === 'generating') {
                                        phaseText = `🎨 Generating image... (~${estimatedSec}s)`;
                                        phaseDetail = `Using ${imageGeneration.provider || 'selected'} ${imageGeneration.model || 'model'}`;
                                      } else if (imageGeneration.status === 'downloading') {
                                        phaseText = '📥 Downloading image...';
                                        phaseDetail = 'Converting to base64 for offline storage';
                                      }
                                      
                                      return (
                                        <div className="mt-3 relative">
                                          <div className="w-full rounded border border-purple-300 dark:border-purple-700 bg-purple-50 dark:bg-purple-900/20 flex flex-col items-center justify-center p-8">
                                            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-purple-600 dark:border-purple-400 mb-4"></div>
                                            <div className="text-sm text-purple-600 dark:text-purple-400 font-semibold mb-2">
                                              {phaseText}
                                            </div>
                                            <div className="text-xs text-gray-500 dark:text-gray-400 text-center max-w-md">
                                              {phaseDetail}
                                            </div>
                                            {imageGeneration.prompt && (
                                              <div className="text-xs text-gray-400 dark:text-gray-500 text-center max-w-md mt-3 italic">
                                                "{imageGeneration.prompt.substring(0, 100)}{imageGeneration.prompt.length > 100 ? '...' : ''}"
                                              </div>
                                            )}
                                          </div>
                                        </div>
                                      );
                                    }
                                    
                                    // Show image once downloaded
                                    if (imageGeneration && (imageGeneration.imageUrl || imageGeneration.base64)) {
                                      let imgSrc: string;
                                      if (imageGeneration.base64) {
                                        imgSrc = imageGeneration.base64.startsWith('data:image/') 
                                          ? imageGeneration.base64 
                                          : `data:image/png;base64,${imageGeneration.base64}`;
                                      } else if (imageGeneration.imageUrl?.startsWith('data:image/')) {
                                        imgSrc = imageGeneration.imageUrl;
                                      } else {
                                        imgSrc = imageGeneration.imageUrl || '';
                                      }
                                      
                                      const imageHtml = `<img src="${imgSrc}" alt="${imageGeneration.prompt || 'Generated image'}" />`;
                                      
                                      return (
                                        <div className="mt-3 relative group">
                                          <img 
                                            src={imgSrc}
                                            alt={imageGeneration.prompt || 'Generated image'}
                                            className="w-full rounded border border-purple-300 dark:border-purple-700"
                                            style={{ maxHeight: '512px', objectFit: 'contain' }}
                                          />
                                          
                                          {/* Hover buttons */}
                                          <div className="absolute top-2 right-2 flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                                            <button
                                              onClick={() => {
                                                navigator.clipboard.writeText(imgSrc || '');
                                                showSuccess(t('chat.copiedToClipboard'));
                                              }}
                                              className="p-1.5 bg-white/90 dark:bg-gray-800/90 border border-gray-300 dark:border-gray-600 rounded hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
                                              title="Copy image data URL"
                                            >
                                              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                                              </svg>
                                            </button>
                                            <button
                                              onClick={async () => {
                                                await addSnippet(imageHtml, 'assistant', imageGeneration.prompt || 'Generated image');
                                                showSuccess('Image grabbed to swag');
                                              }}
                                              className="p-1.5 bg-white/90 dark:bg-gray-800/90 border border-gray-300 dark:border-gray-600 rounded hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
                                              title="Grab to swag"
                                            >
                                              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 11.5V14m0-2.5v-6a1.5 1.5 0 113 0m-3 6a1.5 1.5 0 00-3 0v2a7.5 7.5 0 0015 0v-5a1.5 1.5 0 00-3 0m-6-3V11m0-5.5v-1a1.5 1.5 0 013 0v1m0 0V11m0-5.5a1.5 1.5 0 013 0v3m0 0V11" />
                                              </svg>
                                            </button>
                                          </div>
                                        </div>
                                      );
                                    }
                                    return null;
                                  })()}
                                  
                                  {/* NEW: Extraction Transparency & Debug Info for embedded tool results */}
                                  <ToolTransparency
                                    rawResponse={toolResult.rawResponse}
                                    extractionMetadata={toolResult.extractionMetadata}
                                  />
                                </div>
                              );
                            })}
                          </div>
                        )}
                        
                        {/* Streaming indicator - shown as separate block after tool results and LLM response */}
                        {msg.isStreaming && msg.toolResults && msg.toolResults.length > 0 && (
                          <div className="mt-4 p-4 bg-blue-50 dark:bg-blue-900/20 border-2 border-blue-300 dark:border-blue-700 rounded-lg">
                            <div className="flex items-center gap-3 text-blue-700 dark:text-blue-300">
                              <svg className="animate-spin h-6 w-6" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                              </svg>
                              <div>
                                <div className="font-semibold text-base">Generating LLM Response...</div>
                                <div className="text-sm opacity-80">The AI is analyzing the tool results and composing a response</div>
                              </div>
                            </div>
                          </div>
                        )}
                      </div>
                    ) : (
                      <div className="whitespace-pre-wrap">
                        {getMessageText(msg.content)}
                        
                        {/* Display attached files for user messages */}
                        {msg._attachments && msg._attachments.length > 0 && (
                          <div className="flex flex-wrap gap-2 mt-3">
                            {msg._attachments.filter((f: any) => f && f.name).map((file: any, fileIdx: number) => (
                              <div key={fileIdx} className="bg-white/20 dark:bg-gray-700/30 rounded-lg overflow-hidden border border-white/30 dark:border-gray-600">
                                {file.preview ? (
                                  <img 
                                    src={file.preview} 
                                    alt={file.name} 
                                    className="w-32 h-32 object-cover cursor-pointer hover:opacity-80 transition-opacity"
                                    title={`${file.name} (${(file.size / 1024).toFixed(1)} KB)`}
                                    onClick={() => window.open(file.preview, '_blank')}
                                  />
                                ) : (
                                  <div className="w-32 h-32 flex flex-col items-center justify-center p-2 bg-red-50 dark:bg-red-900/20">
                                    <svg className="w-8 h-8 text-red-600 dark:text-red-400 mb-2" fill="currentColor" viewBox="0 0 24 24">
                                      <path d="M14 2H6c-1.1 0-2 .9-2 2v16c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V8l-6-6zM6 20V4h7v5h5v11H6z"/>
                                      <text x="8" y="16" fontSize="8" fill="currentColor" fontWeight="bold">PDF</text>
                                    </svg>
                                    <span className="text-xs text-center text-gray-700 dark:text-gray-300 font-medium truncate max-w-full px-1">
                                      {file.name}
                                    </span>
                                  </div>
                                )}
                              </div>
                            ))}
                          </div>
                        )}
                        
                        {/* Generated Images */}
                        {(() => {
                          console.log('🖼️ Checking imageGenerations:', { 
                            hasImageGenerations: !!msg.imageGenerations, 
                            length: msg.imageGenerations?.length,
                            imageGenerations: msg.imageGenerations 
                          });
                          return null;
                        })()}
                        {msg.imageGenerations && msg.imageGenerations.length > 0 && (
                          <div className="mt-3">
                            {(() => {
                              console.log('🖼️ About to render imageGenerations:', msg.imageGenerations);
                              return msg.imageGenerations.map((imgGen) => {
                                console.log('🖼️ Mapping imageGen:', imgGen);
                                return (
                              <GeneratedImageBlock
                                key={imgGen.id}
                                data={imgGen}
                                accessToken={accessToken}
                                providerApiKeys={providerApiKeys}
                                onCopy={(text) => {
                                  navigator.clipboard.writeText(text).then(() => {
                                    showSuccess(t('chat.copiedToClipboard'));
                                  }).catch(() => {
                                    showError('Failed to copy');
                                  });
                                }}
                                onGrab={(markdown) => {
                                  navigator.clipboard.writeText(markdown).then(() => {
                                    showSuccess(t('chat.copiedToClipboard'));
                                  }).catch(() => {
                                    showError('Failed to copy');
                                  });
                                }}
                                onLlmInfo={() => {
                                  // Show the LLM info dialog for this message
                                  setShowLlmInfo(idx);
                                }}
                                onStatusChange={(id, status, imageUrl, llmApiCall) => {
                                  setMessages(prev => prev.map((m, mIdx) => {
                                    if (m.imageGenerations) {
                                      const updated = m.imageGenerations.map(ig =>
                                        ig.id === id 
                                          ? { ...ig, status, imageUrl, llmApiCall } 
                                          : ig
                                      );
                                      // If llmApiCall provided, add to message's llmApiCalls array
                                      const updatedMessage = { ...m, imageGenerations: updated };
                                      if (llmApiCall && mIdx === idx) {
                                        updatedMessage.llmApiCalls = [...(m.llmApiCalls || []), llmApiCall];
                                      }
                                      return updatedMessage;
                                    }
                                    return m;
                                  }));
                                }}
                              />
                                );
                              });
                            })()}
                          </div>
                        )}
                      </div>
                    )}
                    
                    {/* Request cost badge for the last assistant message */}
                    {msg.role === 'assistant' && !isLoading && lastRequestCost > 0 && idx === messages.length - 1 && (
                      <div className="mt-2 flex items-center justify-end">
                        <div className="inline-flex items-center gap-1 bg-green-50 dark:bg-green-900/20 border border-green-300 dark:border-green-700 text-green-700 dark:text-green-300 px-2 py-1 rounded text-xs">
                          <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
                            <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm1-11a1 1 0 10-2 0v2H7a1 1 0 100 2h2v2a1 1 0 102 0v-2h2a1 1 0 100-2h-2V7z" clipRule="evenodd" />
                          </svg>
                          Request cost: {formatCost(lastRequestCost)}
                          {usage && (
                            <span className="ml-1 opacity-75">
                              (Total: {formatCost(usage.totalCost)})
                            </span>
                          )}
                        </div>
                      </div>
                    )}
                    
                    {/* Copy/Share/Capture/Info buttons for assistant messages */}
                    {msg.role === 'assistant' && (msg.content || msg.llmApiCalls) && (
                      <div className="flex gap-2 mt-2 pt-2 border-t border-gray-200 dark:border-gray-600">
                        <button
                          onClick={() => {
                            const textContent = getMessageText(msg.content);
                            navigator.clipboard.writeText(textContent).then(() => {
                              showSuccess(t('chat.copiedToClipboard'));
                            }).catch(() => {
                              showError('Failed to copy');
                            });
                          }}
                          className="text-xs text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100 flex items-center gap-1"
                          title="Copy to clipboard"
                        >
                          <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                          </svg>
                          Copy
                        </button>
                        <button
                          onClick={() => {
                            const textContent = getMessageText(msg.content);
                            const subject = 'Shared from LLM Proxy';
                            const body = encodeURIComponent(textContent);
                            window.open(`https://mail.google.com/mail/?view=cm&fs=1&su=${encodeURIComponent(subject)}&body=${body}`, '_blank');
                          }}
                          className="text-xs text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100 flex items-center gap-1"
                          title="Share via Gmail"
                        >
                          <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                          </svg>
                          Gmail
                        </button>
                        <button
                          onClick={() => handleCaptureContent(getMessageText(msg.content), 'assistant', undefined, msg.extractedContent, msg.toolResults)}
                          className="text-xs text-blue-600 dark:text-blue-400 hover:text-blue-900 dark:hover:text-blue-100 flex items-center gap-1"
                          title="Capture to Swag"
                        >
                          <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 11.5V14m0-2.5v-6a1.5 1.5 0 113 0m-3 6a1.5 1.5 0 00-3 0v2a7.5 7.5 0 0015 0v-5a1.5 1.5 0 00-3 0m-6-3V11m0-5.5v-1a1.5 1.5 0 013 0v1m0 0V11m0-5.5a1.5 1.5 0 013 0v3m0 0V11" />
                          </svg>
                          Grab
                        </button>
                        {/* Info button with cost prominently displayed */}
                        {msg.llmApiCalls && msg.llmApiCalls.length > 0 && (() => {
                          // Calculate total tokens in and out
                          let totalIn = 0;
                          let totalOut = 0;
                          msg.llmApiCalls.forEach((call: any) => {
                            totalIn += call.response?.usage?.prompt_tokens || 0;
                            totalOut += call.response?.usage?.completion_tokens || 0;
                          });
                          const totalTokens = totalIn + totalOut;
                          
                          return (
                            <button
                              onClick={() => setShowLlmInfo(idx)}
                              className="text-xs px-2 py-1 rounded bg-blue-50 dark:bg-blue-900/30 hover:bg-blue-100 dark:hover:bg-blue-900/50 flex items-center gap-1.5 transition-colors"
                              title={`View LLM transparency info • ${totalTokens.toLocaleString()} tokens (${totalIn.toLocaleString()} in, ${totalOut.toLocaleString()} out) • ${msg.llmApiCalls.length} call${msg.llmApiCalls.length !== 1 ? 's' : ''} • ${formatCostDisplay(getMessageCost(msg))}`}
                            >
                              <span className="font-semibold text-green-600 dark:text-green-400">
                                💰 {formatCostDisplay(getMessageCost(msg))}
                              </span>
                              <span className="text-gray-600 dark:text-gray-400 hidden sm:inline">
                                • {totalTokens.toLocaleString()} token{totalTokens !== 1 ? 's' : ''} ({totalIn.toLocaleString()} in, {totalOut.toLocaleString()} out)
                              </span>
                              <span className="text-gray-600 dark:text-gray-400 hidden lg:inline">
                                • {msg.llmApiCalls.length} call{msg.llmApiCalls.length !== 1 ? 's' : ''}
                              </span>
                              <span className="ml-0.5">ℹ️</span>
                            </button>
                          );
                        })()}
                        
                        {/* Feedback buttons (thumbs up/down) */}
                        {!msg.isStreaming && (
                          <>
                            <button
                              onClick={() => handlePositiveFeedback(idx)}
                              className="text-xs px-2 py-1 rounded bg-green-50 dark:bg-green-900/30 hover:bg-green-100 dark:hover:bg-green-900/50 flex items-center gap-1 transition-colors"
                              title="Good response"
                            >
                              👍
                            </button>
                            <button
                              onClick={() => handleNegativeFeedback(idx)}
                              className="text-xs px-2 py-1 rounded bg-red-50 dark:bg-red-900/30 hover:bg-red-100 dark:hover:bg-red-900/50 flex items-center gap-1 transition-colors"
                              title="Bad response - report issue"
                            >
                              👎
                            </button>
                          </>
                        )}
                        
                        {/* Error Info button for error messages (but NOT for guardrail failures) */}
                        {msg.errorData && getMessageText(msg.content).startsWith('❌ Error:') && !msg.guardrailFailed && (
                          <button
                            onClick={() => setShowErrorInfo(idx)}
                            className="text-xs text-red-600 dark:text-red-400 hover:text-red-900 dark:hover:text-red-100 flex items-center gap-1"
                            title="View full error details"
                          >
                            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                            </svg>
                            Error Info
                          </button>
                        )}
                        {/* Try Again button for retryable messages */}
                        {msg.isRetryable && (!msg.retryCount || msg.retryCount < 3) && (
                          <button
                            onClick={() => handleRetry(idx)}
                            disabled={isLoading}
                            className="text-xs text-orange-600 dark:text-orange-400 hover:text-orange-900 dark:hover:text-orange-100 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1"
                            title="Retry this request with full context"
                          >
                            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                            </svg>
                            Try Again
                            {(msg.retryCount ?? 0) > 0 && (
                              <span className="text-[10px] opacity-75">({(msg.retryCount ?? 0) + 1})</span>
                            )}
                          </button>
                        )}
                      </div>
                    )}
                    
                    {/* Reset/Retry/Capture buttons - only for user messages */}
                    {msg.role === 'user' && (
                      <div className="flex gap-2 mt-2 pt-2 border-t border-gray-200 dark:border-gray-600">
                        <button
                          onClick={() => {
                            // Restore message content to input
                            setInput(getMessageText(msg.content));
                            // Clear all messages from this point onward
                            setMessages(messages.slice(0, idx));
                            // Clear tool status and streaming
                            setToolStatus([]);
                            setStreamingContent('');
                          }}
                          disabled={isLoading}
                          className="text-xs text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100 flex items-center gap-1 disabled:opacity-50 disabled:cursor-not-allowed"
                          title="Reset chat to this message"
                        >
                          <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M9 9l3-3m0 0l3 3m-3-3v12" />
                            <path strokeLinecap="round" strokeLinejoin="round" d="M15 15l-3 3m0 0l-3-3" opacity="0.3" />
                          </svg>
                          Reset
                        </button>
                        <button
                          onClick={() => {
                            // Set retry trigger flag
                            retryTriggerRef.current = true;
                            // Clear all messages from this point onward
                            setMessages(messages.slice(0, idx));
                            // Clear tool status and streaming
                            setToolStatus([]);
                            setStreamingContent('');
                            // Restore message content to input (triggers useEffect)
                            setInput(getMessageText(msg.content));
                          }}
                          disabled={isLoading}
                          className="text-xs text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100 flex items-center gap-1 disabled:opacity-50 disabled:cursor-not-allowed"
                          title="Retry this message (clears subsequent messages and resubmits)"
                        >
                          <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9" />
                          </svg>
                          Retry
                        </button>
                        <button
                          onClick={() => handleCaptureContent(getMessageText(msg.content), 'user')}
                          className="text-xs text-blue-600 dark:text-blue-400 hover:text-blue-900 dark:hover:text-blue-100 flex items-center gap-1"
                          title="Capture to Swag"
                        >
                          <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 11.5V14m0-2.5v-6a1.5 1.5 0 113 0m-3 6a1.5 1.5 0 00-3 0v2a7.5 7.5 0 0015 0v-5a1.5 1.5 0 00-3 0m-6-3V11m0-5.5v-1a1.5 1.5 0 013 0v1m0 0V11m0-5.5a1.5 1.5 0 013 0v3m0 0V11" />
                          </svg>
                          Grab
                        </button>
                      </div>
                    )}
                  </>
                )}
              </div>
            </div>
          );
        })}
        
        {/* Streaming indicator for current block */}
        {isLoading && currentStreamingBlockIndex !== null && (
          <div className="flex justify-start">
            <div className="text-xs text-gray-500 dark:text-gray-400 ml-2">
              <span className="inline-block w-2 h-2 bg-blue-500 rounded-full animate-pulse mr-1"></span>
              streaming...
            </div>
          </div>
        )}
        
        {/* Search progress is now shown inline with messages (removed duplicate) */}
        
        {isLoading && !streamingContent && toolStatus.length === 0 && (
          <div className="flex justify-start">
            <div className="bg-gray-200 dark:bg-gray-700 rounded-lg p-3">
              <div className="flex gap-2">
                <div className="w-2 h-2 bg-gray-500 rounded-full animate-bounce"></div>
                <div className="w-2 h-2 bg-gray-500 rounded-full animate-bounce" style={{ animationDelay: '0.1s' }}></div>
                <div className="w-2 h-2 bg-gray-500 rounded-full animate-bounce" style={{ animationDelay: '0.2s' }}></div>
              </div>
            </div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Input Area */}
      <div className="md:px-4 py-4 border-t border-gray-200 dark:border-gray-700 space-y-3">
        {/* App-level auth gate ensures user is authenticated, no need for inline check */}
        <>
          {/* File Attachments Display */}
          <FileAttachmentsDisplay attachedFiles={attachedFiles} onRemoveAttachment={removeAttachment} />
          
          {/* Todos Panel - Backend-managed multi-step workflows */}
          {todosState && todosState.total > 0 && (
            <div className="mb-3 p-3 border border-yellow-200 dark:border-yellow-800 rounded bg-yellow-50 dark:bg-yellow-900/20">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-yellow-900 dark:text-yellow-200 font-semibold text-sm">
                  <span>✅ Todos</span>
                  <span className="text-xs font-normal text-yellow-700 dark:text-yellow-300">
                    {todosState.total} total • {todosState.remaining} remaining
                  </span>
                  {todosResubmitting && (
                    <span className="ml-2 text-xs italic text-yellow-800 dark:text-yellow-300 animate-pulse">
                      🔄 Continuing: {todosResubmitting}
                    </span>
                  )}
                </div>
                <button 
                  className="text-xs text-yellow-800 dark:text-yellow-300 hover:underline focus:outline-none"
                  onClick={() => setTodosExpanded(v => !v)}
                >
                  {todosExpanded ? '▾ Collapse' : '▸ Expand'}
                </button>
              </div>
              <div className="mt-1 text-sm text-gray-900 dark:text-gray-100">
                <span className="font-medium">Current:</span> {todosState.current?.description || '—'}
              </div>
              {todosExpanded && (
                <ul className="mt-2 max-h-48 overflow-y-auto text-sm divide-y divide-yellow-200 dark:divide-yellow-800 bg-white dark:bg-gray-800 rounded p-2">
                  {todosState.items.map((item, idx) => (
                    <li 
                      key={String(item.id) || idx} 
                      className="py-1.5 flex items-start gap-2 text-gray-900 dark:text-gray-100"
                    >
                      <span className="mt-0.5 text-xs flex-shrink-0">
                        {item.status === 'done' ? '✔️' : item.status === 'current' ? '🟡' : '⏳'}
                      </span>
                      <span className={`flex-1 ${item.status === 'done' ? 'line-through opacity-60' : ''}`}>
                        {item.description}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
          
          {/* Continue Button for MAX_ITERATIONS Error */}
          {showContinueButton && continueContext && (
            <div className="flex flex-col items-center gap-3 py-3 px-4">
              {/* Warning Message */}
              <div className="bg-orange-50 dark:bg-orange-900/20 border-2 border-orange-400 dark:border-orange-600 rounded-lg p-4 max-w-2xl w-full">
                <div className="flex items-start gap-3">
                  <svg className="w-6 h-6 text-orange-600 dark:text-orange-400 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                  </svg>
                  <div className="flex-1">
                    <h3 className="font-semibold text-orange-900 dark:text-orange-100 mb-1">
                      ⚠️ Maximum Iteration Limit Reached
                    </h3>
                    <p className="text-sm text-orange-800 dark:text-orange-200 mb-2">
                      The conversation has reached the maximum number of tool execution iterations ({continueContext?.maxIterations || '?'} iterations). 
                      This limit prevents infinite loops and excessive API usage.
                    </p>
                    <p className="text-sm text-orange-800 dark:text-orange-200 font-medium">
                      Would you like to continue processing from where it stopped?
                    </p>
                  </div>
                </div>
              </div>
              
              {/* Continue Button */}
              <button
                onClick={() => {
                  if (confirm('⚠️ Continue processing?\n\nThis will resume tool execution and may incur additional API costs. The iteration limit helps prevent runaway processes.\n\nClick OK to continue or Cancel to stop here.')) {
                    handleContinue();
                  }
                }}
                disabled={isLoading}
                className="bg-orange-600 hover:bg-orange-700 disabled:opacity-50 disabled:cursor-not-allowed text-white p-2 md:px-6 md:py-3 rounded-lg font-semibold text-base transition-all transform hover:scale-105 shadow-lg flex items-center gap-2"
                title="Continue from where the iteration limit was reached"
                aria-label={t('chat.continueProcessing')}
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 5l7 7-7 7M5 5l7 7-7 7" />
                </svg>
                <span className="hidden md:inline">{t('chat.continueProcessing')}</span>
              </button>
            </div>
          )}
          
          {/* RAG Context Toggle */}
          {/* Message Input */}
          <div className="flex flex-col gap-2">
            {/* Attached Snippets Indicator */}
            {selectedSnippetIds.size > 0 && (
              <div className="bg-blue-50 dark:bg-blue-900/30 border border-blue-200 dark:border-blue-800 rounded-lg p-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 flex-1 min-w-0">
                    <span className="text-sm font-medium text-blue-800 dark:text-blue-200">
                      {t('chat.snippetsAttached', { count: selectedSnippetIds.size, plural: selectedSnippetIds.size === 1 ? '' : 's' })}
                    </span>
                    <div className="flex flex-wrap gap-1 flex-1 min-w-0">
                      {Array.from(selectedSnippetIds).slice(0, 3).map(id => {
                        const snippet = swagSnippets.find(s => s.id === id);
                        return snippet ? (
                          <span 
                            key={id}
                            className="text-xs bg-blue-100 dark:bg-blue-800 text-blue-700 dark:text-blue-200 px-2 py-0.5 rounded truncate max-w-[200px]"
                            title={snippet.title || 'Untitled'}
                          >
                            {snippet.title || 'Untitled'}
                          </span>
                        ) : null;
                      })}
                      {selectedSnippetIds.size > 3 && (
                        <span className="text-xs text-blue-600 dark:text-blue-300">
                          +{selectedSnippetIds.size - 3} more
                        </span>
                      )}
                    </div>
                  </div>
                  <button
                    onClick={() => setSelectedSnippetIds(new Set())}
                    className="ml-2 p-1 text-blue-600 dark:text-blue-300 hover:bg-blue-100 dark:hover:bg-blue-800 rounded transition-colors"
                    title={t('chat.clearAttachedSnippets')}
                    aria-label={t('chat.clearAttachedSnippets')}
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>
              </div>
            )}
            
            {/* Textarea */}
            <textarea
              ref={inputRef}
              value={input}
              onChange={(e) => {
                setInput(e.target.value);
                setHistoryIndex(-1); // Reset history navigation when typing
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  handleSend();
                } else if (e.key === 'ArrowUp' && !e.shiftKey) {
                  e.preventDefault();
                  // Navigate to older prompts
                  if (promptHistory.length > 0) {
                    const newIndex = Math.min(historyIndex + 1, promptHistory.length - 1);
                    setHistoryIndex(newIndex);
                    setInput(promptHistory[newIndex]);
                  }
                } else if (e.key === 'ArrowDown' && !e.shiftKey) {
                  e.preventDefault();
                  // Navigate to newer prompts
                  if (historyIndex > 0) {
                    const newIndex = historyIndex - 1;
                    setHistoryIndex(newIndex);
                    setInput(promptHistory[newIndex]);
                  } else if (historyIndex === 0) {
                    // At newest prompt, go back to empty
                    setHistoryIndex(-1);
                    setInput('');
                  }
                }
              }}
              placeholder={t('chat.inputPlaceholder')}
              className="input-field flex-1 resize-none overflow-y-auto"
              style={{ minHeight: '2.5rem', maxHeight: '300px' }}
              aria-label={t('chat.chatMessageInput')}
              aria-describedby="chat-input-help"
            />
            {/* Screen reader help text */}
            <span id="chat-input-help" className="sr-only">
              Type your message and press Enter to send. Use Shift+Enter for new line. Use up and down arrows to navigate message history.
            </span>
            
            {/* Buttons Row - Below textarea */}
            <div className="flex gap-2 justify-between items-center">
              {/* Left side buttons */}
              <div className="flex gap-2">
                {/* Hidden File Input */}
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/jpeg,image/jpg,image/png,image/gif,image/webp,application/pdf"
                  multiple
                  onChange={(e) => handleFileSelect(e.target.files)}
                  className="hidden"
                />
                
                {/* File Upload Button */}
                <button
                  onClick={() => fileInputRef.current?.click()}
                  disabled={isLoading}
                  className="btn-secondary px-3 h-10 flex-shrink-0 disabled:opacity-50 disabled:cursor-not-allowed"
                  title="Attach images or PDFs"
                  aria-label="Attach images or PDFs"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13" />
                  </svg>
                </button>

                {/* Voice Input Button - Activates Continuous Voice Mode */}
                <button
                  onClick={() => setContinuousVoiceEnabled(!continuousVoiceEnabled)}
                  disabled={isLoading || !accessToken}
                  className={`btn-secondary px-3 h-10 flex-shrink-0 disabled:opacity-50 disabled:cursor-not-allowed ${
                    continuousVoiceEnabled ? 'bg-blue-100 dark:bg-blue-900 border-blue-500' : ''
                  }`}
                  title={!accessToken ? 'Please sign in to use voice input' : continuousVoiceEnabled ? 'Stop continuous voice mode' : 'Start continuous voice mode (hands-free)'}
                  aria-label={!accessToken ? 'Sign in to use voice input' : continuousVoiceEnabled ? 'Stop continuous voice mode' : 'Start continuous voice mode'}
                >
                  <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                    <path d="M12 14c1.66 0 3-1.34 3-3V5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3z"/>
                    <path d="M17 11c0 2.76-2.24 5-5 5s-5-2.24-5-5H5c0 3.53 2.61 6.43 6 6.92V21h2v-3.08c3.39-.49 6-3.39 6-6.92h-2z"/>
                  </svg>
                </button>
              </div>
              
              {/* Right side - Send Button */}
              <button
                onClick={() => {
                  if (isLoading) {
                    handleStop();
                  } else if (!input.trim()) {
                    // Focus textarea when empty submit is clicked
                    inputRef.current?.focus();
                  } else {
                    handleSend();
                  }
                }}
                disabled={!isLoading && !accessToken}
                className="btn-primary p-2 md:px-4 md:py-2 h-10 flex-shrink-0 flex items-center gap-1.5"
                title={!accessToken ? t('chat.signInToSend') : (!input.trim() ? t('chat.typeMessageFirst') : t('chat.sendMessage'))}
                aria-label={isLoading ? t('chat.stopGenerating') : t('chat.sendMessage')}
              >
                {isLoading ? (
                  <>
                    <span>⏹</span>
                    <span className="hidden md:inline">{t('chat.stop')}</span>
                  </>
                ) : !input.trim() ? (
                  <>
                    <span>✏️</span>
                    <span className="hidden md:inline">{t('chat.typeMessage')}</span>
                  </>
                ) : (
                  <>
                    <span>📤</span>
                    <span className="hidden md:inline">{t('chat.send')}</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </>
      </div>

      {/* Load Chat Dialog */}
      {showLoadDialog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50">
          <div className="card max-w-2xl w-full p-6">
            {/* Header with Select All/None buttons */}
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-xl font-bold text-gray-900 dark:text-gray-100">{t('chat.chatHistoryTitle')}</h3>
              {chatHistory.length > 0 && (
                <div className="flex gap-2">
                  <button
                    onClick={handleSelectAllChats}
                    className="btn-secondary text-xs px-3 py-1"
                  >
                    ☑️ {t('chat.selectAll')}
                  </button>
                  <button
                    onClick={handleSelectNoneChats}
                    className="btn-secondary text-xs px-3 py-1"
                  >
                    ☐ {t('chat.selectNone')}
                  </button>
                </div>
              )}
            </div>
            
            <div className="space-y-3 max-h-[70vh] overflow-y-auto">
              {chatHistory.map((entry) => {
                const date = new Date(entry.timestamp).toLocaleString();
                const isSelected = selectedChatIds.has(entry.id);
                return (
                  <div key={entry.id} className={`border ${isSelected ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20' : 'border-gray-300 dark:border-gray-600'} rounded-lg p-3`}>
                    <div className="flex items-start gap-3">
                      {/* Checkbox */}
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => handleToggleChatSelection(entry.id)}
                        className="mt-1 w-4 h-4 text-blue-600 rounded focus:ring-2 focus:ring-blue-500"
                      />
                      
                      <div className="flex-1 min-w-0">
                        <div className="text-sm text-gray-900 dark:text-gray-100 font-medium mb-1 truncate">
                          {entry.firstUserPrompt}
                        </div>
                        <div className="text-xs text-gray-500 dark:text-gray-400">
                          {date}
                        </div>
                      </div>
                      
                      <div className="flex gap-2 flex-shrink-0">
                        <button
                          onClick={() => handleLoadChat(entry)}
                          className="btn-primary text-xs px-3 py-1"
                        >
                          {t('chat.load')}
                        </button>
                        <button
                          onClick={() => handleDeleteChat(entry.id)}
                          className="btn-secondary text-red-500 text-xs px-3 py-1"
                        >
                          {t('chat.delete')}
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
              {chatHistory.length === 0 && (
                <p className="text-gray-500 dark:text-gray-400 text-center py-8">
                  {t('chat.noChatHistory')}
                </p>
              )}
            </div>
            
            {/* Footer with Delete Selected button */}
            <div className="flex gap-2 mt-4">
              {selectedChatIds.size > 0 && (
                <button
                  onClick={handleDeleteSelectedChats}
                  className="btn-secondary text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20"
                >
                  🗑️ {t('chat.deleteSelected')} ({selectedChatIds.size})
                </button>
              )}
              {chatHistory.length > 0 && (
                <button
                  onClick={() => setShowClearHistoryConfirm(true)}
                  className="btn-secondary text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20"
                >
                  🗑️ {t('chat.clearHistory')}
                </button>
              )}
              <button
                onClick={() => setShowLoadDialog(false)}
                className="btn-primary flex-1"
              >
                {t('chat.close')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Clear History Confirmation Dialog */}
      {showClearHistoryConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50">
          <div className="card max-w-md w-full p-6">
            <h3 className="text-xl font-bold mb-4 text-gray-900 dark:text-gray-100">{t('chat.clearHistory')}?</h3>
            <p className="text-gray-700 dark:text-gray-300 mb-6">
              {t('chat.confirmClearHistory')}
            </p>
            <div className="flex gap-2">
              <button
                onClick={() => setShowClearHistoryConfirm(false)}
                className="btn-secondary flex-1"
              >
                {t('chat.cancel')}
              </button>
              <button
                onClick={handleClearAllHistory}
                className="btn-primary flex-1 bg-red-600 hover:bg-red-700"
              >
                {t('chat.clearHistory')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MCP Server Configuration Dialog */}
      {showMCPDialog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50 p-4">
          <div className="card max-w-2xl w-full max-h-[90vh] overflow-y-auto p-6">
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-2xl font-bold text-gray-900 dark:text-gray-100">{t('chat.mcpServerConfiguration')}</h2>
              <button
                onClick={() => setShowMCPDialog(false)}
                className="text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
              >
                ✕
              </button>
            </div>

            {/* Add New MCP Server */}
            <div className="mb-6 p-4 bg-gray-50 dark:bg-gray-800 rounded-lg">
              <div className="flex justify-between items-center mb-3">
                <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">{t('chat.addMCPServer')}</h3>
                <button
                  onClick={() => setShowExampleServers(!showExampleServers)}
                  className="text-sm text-blue-600 dark:text-blue-400 hover:underline"
                >
                  {showExampleServers ? '🔽 Hide Examples' : '📚 Show Examples'}
                </button>
              </div>
              
              {/* Example Servers Dropdown */}
              {showExampleServers && (
                <div className="mb-4 p-3 bg-white dark:bg-gray-900 rounded border border-gray-300 dark:border-gray-600">
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    Quick Start Examples:
                  </label>
                  <select
                    onChange={(e) => {
                      const example = exampleMCPServers.find(s => s.id === e.target.value);
                      if (example) {
                        setNewMCPServer({ name: example.name, url: example.url });
                      }
                    }}
                    className="input-field w-full mb-2"
                    defaultValue=""
                  >
                    <option value="" disabled>Select an example server...</option>
                    <optgroup label="🏠 Sample Servers">
                      {exampleMCPServers.filter(s => s.category === 'Sample').map(server => (
                        <option key={server.id} value={server.id}>
                          {server.name} - {server.description}
                        </option>
                      ))}
                    </optgroup>
                    <optgroup label="✅ Official @modelcontextprotocol Servers">
                      {exampleMCPServers.filter(s => s.category === 'Official').map(server => (
                        <option key={server.id} value={server.id}>
                          {server.name.replace('@modelcontextprotocol/server-', '')} - {server.description}
                        </option>
                      ))}
                    </optgroup>
                  </select>
                  
                  {/* Show details when a server is selected */}
                  {newMCPServer.name && exampleMCPServers.find(s => s.name === newMCPServer.name) && (
                    <div className="mt-2 p-2 bg-blue-50 dark:bg-blue-900/20 rounded text-sm">
                      <p className="font-semibold text-gray-900 dark:text-gray-100 mb-1">
                        {exampleMCPServers.find(s => s.name === newMCPServer.name)?.name}
                      </p>
                      <p className="text-gray-700 dark:text-gray-300 mb-2">
                        {exampleMCPServers.find(s => s.name === newMCPServer.name)?.description}
                      </p>
                      <div className="mb-2">
                        <span className="font-medium text-gray-900 dark:text-gray-100">Tools:</span>{' '}
                        <span className="text-gray-600 dark:text-gray-400">
                          {exampleMCPServers.find(s => s.name === newMCPServer.name)?.tools.join(', ')}
                        </span>
                      </div>
                      <div className="bg-gray-800 dark:bg-gray-950 text-gray-100 p-2 rounded font-mono text-xs whitespace-pre-wrap">
                        {exampleMCPServers.find(s => s.name === newMCPServer.name)?.instructions}
                      </div>
                    </div>
                  )}
                </div>
              )}
              
              <div className="space-y-3">
                <input
                  type="text"
                  value={newMCPServer.name}
                  onChange={(e) => setNewMCPServer({ ...newMCPServer, name: e.target.value })}
                  placeholder={t('chat.mcpServerNamePlaceholder')}
                  className="input-field w-full"
                />
                <input
                  type="text"
                  value={newMCPServer.url}
                  onChange={(e) => setNewMCPServer({ ...newMCPServer, url: e.target.value })}
                  placeholder={t('chat.mcpServerUrlPlaceholder')}
                  className="input-field w-full"
                />
                <button
                  onClick={handleAddMCPServer}
                  disabled={!newMCPServer.name.trim() || !newMCPServer.url.trim()}
                  className="btn-primary w-full"
                >
                  ➕ {t('chat.addServer')}
                </button>
              </div>
            </div>

            {/* Existing MCP Servers */}
            <div>
              <h3 className="text-lg font-semibold mb-3 text-gray-900 dark:text-gray-100">
                {t('chat.mcpServers')} ({mcpServers.length})
              </h3>
              <div className="space-y-2">
                {mcpServers.map((server) => (
                  <div
                    key={server.id}
                    className="flex items-center gap-3 p-3 bg-gray-50 dark:bg-gray-800 rounded-lg"
                  >
                    <input
                      type="checkbox"
                      checked={server.enabled}
                      onChange={() => handleToggleMCPServer(server.id)}
                      className="w-5 h-5 text-blue-600 rounded focus:ring-2 focus:ring-blue-500"
                    />
                    <div className="flex-1">
                      <div className="font-medium text-gray-900 dark:text-gray-100">{server.name}</div>
                      <div className="text-sm text-gray-500 dark:text-gray-400">{server.url}</div>
                    </div>
                    <button
                      onClick={() => handleDeleteMCPServer(server.id)}
                      className="text-red-500 hover:text-red-700 px-3 py-1"
                      title={t('chat.remove')}
                    >
                      🗑️
                    </button>
                  </div>
                ))}
                {mcpServers.length === 0 && (
                  <p className="text-gray-500 dark:text-gray-400 text-center py-4">
                    {t('chat.noMcpServers')}
                  </p>
                )}
              </div>
            </div>

            <div className="mt-6 flex gap-2">
              <button onClick={() => setShowMCPDialog(false)} className="btn-primary flex-1">
                {t('common.done')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Planning Dialog */}
      <PlanningDialog
        isOpen={showPlanningDialog}
        onClose={() => setShowPlanningDialog(false)}
        onTransferToChat={(transferDataJson: string) => {
          // Start a new chat when transferring a plan
          handleNewChat();
          
          try {
            const data = JSON.parse(transferDataJson);
            
            // Apply prompts
            setInput(data.prompt);
            if (data.persona) {
              setSystemPrompt(data.persona);
            }
            
            // Store planning context
            if (data.planningQuery) {
              setOriginalPlanningQuery(data.planningQuery);
            }
            if (data.generatedSystemPrompt) {
              setGeneratedSystemPromptFromPlanning(data.generatedSystemPrompt);
            }
            if (data.generatedUserQuery) {
              setGeneratedUserQueryFromPlanning(data.generatedUserQuery);
            }
            
            console.log('✅ Transferred planning context to chat');
          } catch (e) {
            setInput(transferDataJson);
          }
          
          // Close the planning dialog after transfer
          setShowPlanningDialog(false);
        }}
      />

      {/* Search Result Content Viewer Dialog */}
      {viewingSearchResult && (
        <div className="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center p-4 z-50">
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-2xl w-full h-full max-w-6xl max-h-[95vh] overflow-hidden flex flex-col">
            {/* Header */}
            <div className="p-6 border-b border-gray-200 dark:border-gray-700 flex justify-between items-start">
              <div className="flex-1 pr-4">
                <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">
                  {viewingSearchResult.result.title}
                </h2>
                <a
                  href={viewingSearchResult.result.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-blue-600 dark:text-blue-400 hover:underline text-sm break-all"
                >
                  {viewingSearchResult.result.url}
                </a>
                <div className="mt-2 flex gap-3 text-xs text-gray-500 dark:text-gray-400">
                  <span>📄 {(viewingSearchResult.result.content?.length / 1024).toFixed(1)} KB</span>
                  {viewingSearchResult.result.contentFormat && (
                    <span>📝 {viewingSearchResult.result.contentFormat}</span>
                  )}
                  {viewingSearchResult.result.images?.length > 0 && (
                    <span>🖼️ {viewingSearchResult.result.images.length} images</span>
                  )}
                  {viewingSearchResult.result.links?.length > 0 && (
                    <span>🔗 {viewingSearchResult.result.links.length} links</span>
                  )}
                </div>
              </div>
              <button
                onClick={() => setViewingSearchResult(null)}
                className="text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 text-3xl leading-none"
                aria-label={t('chat.close')}
              >
                ×
              </button>
            </div>

            {/* Content - Scrollable */}
            <div className="flex-1 overflow-y-auto p-6">
              <div className="space-y-6">
                {/* Main Content */}
                <div>
                  <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-3">Page Content</h3>
                  <div className="bg-gray-50 dark:bg-gray-900 rounded-lg p-4 border border-gray-200 dark:border-gray-700">
                    {viewingSearchResult.result.contentFormat === 'markdown' ? (
                      <MarkdownRenderer content={viewingSearchResult.result.content} />
                    ) : (
                      <pre className="whitespace-pre-wrap text-sm text-gray-700 dark:text-gray-300">
                        {viewingSearchResult.result.content}
                      </pre>
                    )}
                  </div>
                </div>

                {/* Images Section */}
                {viewingSearchResult.result.images && viewingSearchResult.result.images.length > 0 && (
                  <div>
                    <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-3">
                      Images ({viewingSearchResult.result.images.length})
                    </h3>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                      {viewingSearchResult.result.images.map((img: any, idx: number) => (
                        <div key={idx} className="border border-gray-200 dark:border-gray-700 rounded overflow-hidden">
                          <img
                            src={img.src}
                            alt={img.alt || `Image ${idx + 1}`}
                            className="w-full h-32 object-cover"
                            loading="lazy"
                          />
                          {img.alt && (
                            <div className="p-2 text-xs text-gray-600 dark:text-gray-400 bg-gray-50 dark:bg-gray-800">
                              {img.alt}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Links Section */}
                {viewingSearchResult.result.links && viewingSearchResult.result.links.length > 0 && (
                  <div>
                    <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-3">
                      Links ({viewingSearchResult.result.links.length})
                    </h3>
                    <div className="bg-gray-50 dark:bg-gray-900 rounded-lg p-4 border border-gray-200 dark:border-gray-700">
                      <ul className="space-y-2">
                        {viewingSearchResult.result.links.slice(0, 50).map((link: any, idx: number) => (
                          <li key={idx} className="flex items-start gap-2">
                            <span className="text-gray-500 dark:text-gray-400 text-xs mt-1">•</span>
                            <div className="flex-1 min-w-0">
                              <a
                                href={link.href}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-blue-600 dark:text-blue-400 hover:underline text-sm break-all"
                              >
                                {link.text || link.href}
                              </a>
                              {link.context && (
                                <p className="text-xs text-gray-600 dark:text-gray-400 mt-1 line-clamp-2">
                                  {link.context}
                                </p>
                              )}
                            </div>
                          </li>
                        ))}
                        {viewingSearchResult.result.links.length > 50 && (
                          <li className="text-xs text-gray-500 dark:text-gray-400 italic">
                            ... and {viewingSearchResult.result.links.length - 50} more links
                          </li>
                        )}
                      </ul>
                    </div>
                  </div>
                )}

                {/* Full Scraped Data - JSON Tree View */}
                <div>
                  <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-3">
                    🔍 Full Scraped Data (JSON)
                  </h3>
                  <div className="bg-gray-50 dark:bg-gray-900 rounded-lg p-4 border border-gray-200 dark:border-gray-700">
                    <JsonTree
                      data={{
                        url: viewingSearchResult.result.url,
                        title: viewingSearchResult.result.title,
                        description: viewingSearchResult.result.description,
                        snippet: viewingSearchResult.result.snippet,
                        fullScrapedContent: viewingSearchResult.result.content,
                        contentFormat: viewingSearchResult.result.contentFormat,
                        summarizedContent: viewingSearchResult.result.summary || viewingSearchResult.result.description,
                        links: viewingSearchResult.result.links || [],
                        images: viewingSearchResult.result.images || [],
                        youtubeLinks: viewingSearchResult.result.youtube || viewingSearchResult.result.videos || [],
                        otherMedia: viewingSearchResult.result.media || viewingSearchResult.result.audio || [],
                        metadata: {
                          contentLength: viewingSearchResult.result.content?.length || 0,
                          linkCount: viewingSearchResult.result.links?.length || 0,
                          imageCount: viewingSearchResult.result.images?.length || 0,
                          youtubeCount: (viewingSearchResult.result.youtube || viewingSearchResult.result.videos || []).length,
                          mediaCount: (viewingSearchResult.result.media || viewingSearchResult.result.audio || []).length
                        }
                      }}
                      expanded={false}
                    />
                  </div>
                </div>
              </div>
            </div>

            {/* Footer */}
            <div className="p-4 border-t border-gray-200 dark:border-gray-700 flex justify-end">
              <button
                onClick={() => setViewingSearchResult(null)}
                className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
      
      {/* Raw HTML Viewer Dialog */}
      {viewingRawHtml && (
        <div className="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center p-4 z-50">
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-2xl w-full h-full max-w-6xl max-h-[95vh] overflow-hidden flex flex-col">
            {/* Header */}
            <div className="p-6 border-b border-gray-200 dark:border-gray-700 flex justify-between items-start">
              <div className="flex-1 pr-4">
                <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">
                  Raw HTML Content
                </h2>
                <a
                  href={viewingRawHtml.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-blue-600 dark:text-blue-400 hover:underline text-sm break-all"
                >
                  {viewingRawHtml.url}
                </a>
                <div className="mt-2 flex gap-3 text-xs text-gray-500 dark:text-gray-400">
                  <span>📄 {(viewingRawHtml.html.length / 1024).toFixed(1)} KB uncompressed</span>
                  <span>📝 Raw HTML</span>
                </div>
              </div>
              <button
                onClick={() => setViewingRawHtml(null)}
                className="text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 text-3xl leading-none"
                aria-label={t('chat.close')}
              >
                ×
              </button>
            </div>

            {/* Content - Scrollable */}
            <div className="flex-1 overflow-y-auto p-6">
              <div className="bg-gray-50 dark:bg-gray-900 rounded-lg p-4 border border-gray-200 dark:border-gray-700">
                <pre className="whitespace-pre-wrap text-xs text-gray-700 dark:text-gray-300 font-mono">
                  {viewingRawHtml.html}
                </pre>
              </div>
            </div>

            {/* Footer */}
            <div className="p-4 border-t border-gray-200 dark:border-gray-700 flex justify-end gap-3">
              <button
                onClick={() => {
                  navigator.clipboard.writeText(viewingRawHtml.html);
                }}
                className="px-6 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700 transition-colors"
              >
                📋 Copy to Clipboard
              </button>
              <button
                onClick={() => setViewingRawHtml(null)}
                className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
      
      {/* LLM Info Dialog */}
      {showLlmInfo !== null && messages[showLlmInfo]?.llmApiCalls && (
        <LlmInfoDialogNew 
          apiCalls={messages[showLlmInfo].llmApiCalls}
          onClose={() => setShowLlmInfo(null)}
        />
      )}
      
      {/* Error Info Dialog */}
      {showErrorInfo !== null && messages[showErrorInfo]?.errorData && (
        <ErrorInfoDialog 
          errorData={messages[showErrorInfo].errorData}
          llmApiCalls={messages[showErrorInfo].llmApiCalls}
          onClose={() => setShowErrorInfo(null)}
        />
      )}

      {/* Fix Response Dialog */}
      {showFixDialog !== null && (
        <FixResponseDialog
          isOpen={true}
          onClose={() => setShowFixDialog(null)}
          messageData={{
            messageId: `message-${showFixDialog}`,
            messageContent: getMessageText(messages[showFixDialog].content),
            llmApiCalls: messages[showFixDialog].llmApiCalls || [],
            evaluations: (messages[showFixDialog] as any).evaluations || [],
            conversationThread: messages
          }}
        />
      )}

      {/* Voice Input Dialog */}
      <VoiceInputDialog
        isOpen={showVoiceInput}
        onClose={() => setShowVoiceInput(false)}
        onTranscriptionComplete={handleVoiceTranscription}
        accessToken={accessToken}
        apiEndpoint={apiEndpoint}
      />

      {/* Continuous Voice Mode (Hotword Detection) - Controlled by mic button */}
      {accessToken && (
        <div className="fixed bottom-20 right-4 z-30 max-w-sm">
          <ContinuousVoiceMode
            onVoiceRequest={(text) => {
              // Set the input text and trigger submission
              setInput(text);
              // Simulate sending after a brief delay to allow state update
              setTimeout(() => {
                handleSend();
              }, 100);
            }}
            onTranscriptionStart={() => {
              console.log('🎙️ Continuous mode: transcription started');
            }}
            accessToken={accessToken}
            apiEndpoint={apiEndpoint}
            isProcessing={isLoading}
            isSpeaking={ttsState.isPlaying} // Track TTS speaking state for auto-restart
            enabled={continuousVoiceEnabled}
            onEnabledChange={setContinuousVoiceEnabled}
          />
        </div>
      )}

      {/* Examples Modal - Full Screen 3-Column Layout */}
      <ExamplesModal
        isOpen={showExamplesModal}
        onClose={() => setShowExamplesModal(false)}
        onExampleClick={handleExampleClick}
        location={location}
        locationLoading={locationLoading}
        requestLocation={requestLocation}
        clearLocation={clearLocation}
      />

      {/* Share Dialog */}
      {showShareDialog && (
        <ShareDialog
          messages={messages.map(msg => ({
            role: msg.role as 'user' | 'assistant' | 'system',
            content: typeof msg.content === 'string' ? msg.content : JSON.stringify(msg.content),
            timestamp: Date.now()
          }))}
          onClose={() => setShowShareDialog(false)}
          title={systemPrompt || undefined}
        />
      )}

      {/* Snippets Panel - Collapsible */}
      {showSnippetsPanel && (
        <div className="fixed bottom-0 left-0 right-0 h-2/3 z-40 bg-white dark:bg-gray-800 shadow-2xl border-t border-gray-300 dark:border-gray-600 overflow-hidden">
          <div className="h-full flex flex-col">
            <div className="flex items-center justify-between px-4 py-2 bg-gray-100 dark:bg-gray-700 border-b border-gray-200 dark:border-gray-600">
              <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                {t('chat.attachContextTitle')}
              </h2>
              <button
                onClick={() => setShowSnippetsPanel(false)}
                className="p-2 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-600 rounded transition-colors"
                title="Close Snippet Selector"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <div className="flex-1 overflow-hidden">
              <SnippetSelector 
                selectedSnippetIds={selectedSnippetIds}
                onSelectionChange={setSelectedSnippetIds}
                userEmail={user?.email}
              />
            </div>
          </div>
        </div>
      )}

      {/* Raw HTML Dialog */}
      {showRawHtml && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-4xl w-full max-h-[90vh] flex flex-col">
            {/* Header */}
            <div className="flex items-center justify-between p-4 border-b border-gray-200 dark:border-gray-700">
              <div className="flex-1 min-w-0">
                <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 truncate">
                  Raw HTML
                </h3>
                {showRawHtml.url && (
                  <p className="text-xs text-gray-600 dark:text-gray-400 truncate mt-1">
                    {showRawHtml.url}
                  </p>
                )}
              </div>
              <button
                onClick={() => setShowRawHtml(null)}
                className="ml-4 text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
                aria-label="Close raw HTML dialog"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            
            {/* Content */}
            <div className="flex-1 overflow-y-auto p-4">
              <div className="relative">
                <button
                  onClick={() => {
                    navigator.clipboard.writeText(showRawHtml.html);
                  }}
                  className="absolute top-2 right-2 px-3 py-1 bg-purple-600 hover:bg-purple-700 text-white text-xs rounded"
                >
                  Copy
                </button>
                <pre className="bg-gray-50 dark:bg-gray-900 p-4 rounded border border-gray-200 dark:border-gray-700 overflow-x-auto">
                  <code className="text-xs text-gray-800 dark:text-gray-200 font-mono whitespace-pre">
                    {showRawHtml.html}
                  </code>
                </pre>
              </div>
            </div>
            
            {/* Footer */}
            <div className="p-4 border-t border-gray-200 dark:border-gray-700 flex justify-end">
              <button
                onClick={() => setShowRawHtml(null)}
                className="px-4 py-2 bg-gray-200 dark:bg-gray-700 text-gray-900 dark:text-gray-100 rounded hover:bg-gray-300 dark:hover:bg-gray-600"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
