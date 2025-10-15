import React, { useState, useRef, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useSearchResults } from '../contexts/SearchResultsContext';
import { usePlaylist } from '../contexts/PlaylistContext';
import { useSwag } from '../contexts/SwagContext';
import { useSettings } from '../contexts/SettingsContext';
import { useYouTubeAuth } from '../contexts/YouTubeAuthContext';
import { useUsage } from '../contexts/UsageContext';
import { useCast } from '../contexts/CastContext';
import { useLocation } from '../contexts/LocationContext';
import { useToast } from './ToastManager';
import { useLocalStorage } from '../hooks/useLocalStorage';
import { sendChatMessageStreaming } from '../utils/api';
import type { ChatMessage } from '../utils/api';
import { extractAndSaveSearchResult } from '../utils/searchCache';
import { PlanningDialog } from './PlanningDialog';
import { MarkdownRenderer } from './MarkdownRenderer';
import { TranscriptionProgress, type ProgressEvent } from './TranscriptionProgress';
import { SearchProgress } from './SearchProgress';
import { YouTubeSearchProgress, type YouTubeSearchProgressData } from './YouTubeSearchProgress';
import { LlmInfoDialog } from './LlmInfoDialog';
import { ErrorInfoDialog } from './ErrorInfoDialog';
import { VoiceInputDialog } from './VoiceInputDialog';
import ExtractedContent from './ExtractedContent';
import { GeneratedImageBlock } from './GeneratedImageBlock';
import { JsonTree } from './JsonTree';
import { ImageGallery } from './ImageGallery';
import { MediaSections } from './MediaSections';
import { ToolResultJsonViewer } from './JsonTreeViewer';
import { ReadButton } from './ReadButton';
import { YouTubeVideoResults } from './YouTubeVideoResults';
import { ExamplesModal } from './ExamplesModal';
import { 
  saveChatToHistory, 
  loadChatFromHistory, 
  deleteChatFromHistory, 
  getAllChatHistory,
  clearAllChatHistory,
  type ChatHistoryEntry 
} from '../utils/chatHistory';

interface EnabledTools {
  web_search: boolean;
  execute_js: boolean;
  scrape_url: boolean;
  youtube: boolean;
  transcribe: boolean;
  generate_chart: boolean;
  generate_image: boolean;
}

interface ChatTabProps {
  transferData?: { prompt: string; persona: string } | null;
  enabledTools: EnabledTools;
  setEnabledTools: (tools: EnabledTools) => void;
  showMCPDialog: boolean;
  setShowMCPDialog: (show: boolean) => void;
}

export const ChatTab: React.FC<ChatTabProps> = ({ 
  transferData,
  enabledTools,
  // setEnabledTools, // Not used in ChatTab - only in SettingsModal
  showMCPDialog,
  setShowMCPDialog
}) => {
  const { accessToken } = useAuth();
  const { getAccessToken: getYouTubeToken } = useYouTubeAuth();
  const { addSearchResult, clearSearchResults } = useSearchResults();
  const { addTracksToStart } = usePlaylist();
  const { addSnippet } = useSwag();
  const { showError, showWarning, showSuccess, clearAllToasts } = useToast();
  const { settings } = useSettings();
  const { addCost, usage } = useUsage();
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
  
  const [mcpServers, setMcpServers] = useLocalStorage<Array<{
    id: string;
    name: string;
    url: string;
    enabled: boolean;
  }>>('chat_mcp_servers', []);
  
  const [newMCPServer, setNewMCPServer] = useState({ name: '', url: '' });
  
  // Tool execution status tracking
  const [toolStatus, setToolStatus] = useState<Array<{
    id: string;
    name: string;
    status: 'starting' | 'executing' | 'complete' | 'error';
    result?: string;
  }>>([]);
  
  const [streamingContent, setStreamingContent] = useState<string>('');
  const [expandedToolMessages, setExpandedToolMessages] = useState<Set<number>>(new Set());
  const [systemPromptExpanded, setSystemPromptExpanded] = useState(false);
  const [currentStreamingBlockIndex, setCurrentStreamingBlockIndex] = useState<number | null>(null);
  const [showExamplesModal, setShowExamplesModal] = useState(false);
  
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
  
  // Search result content viewer dialog
  const [viewingSearchResult, setViewingSearchResult] = useState<{
    result: any;
    index: number;
  } | null>(null);
  
  // LLM Info dialog tracking
  const [showLlmInfo, setShowLlmInfo] = useState<number | null>(null);
  
  // Error Info dialog tracking
  const [showErrorInfo, setShowErrorInfo] = useState<number | null>(null);
  
  // Voice input dialog
  const [showVoiceInput, setShowVoiceInput] = useState(false);
  
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

  const handleGrabImage = async (imageUrl: string) => {
    try {
      // Convert image to base64 before storing
      const { imageUrlToBase64 } = await import('../utils/imageUtils');
      const base64Image = await imageUrlToBase64(imageUrl);
      
      // Create HTML with base64 image
      const imageHtml = `<img src="${base64Image}" alt="Grabbed image" style="max-width: 100%; height: auto;" />`;
      addSnippet(imageHtml, 'assistant', 'Image');
      showSuccess('Image added to Swag!');
    } catch (error) {
      console.error('Failed to grab image:', error);
      // Fallback to original URL if conversion fails
      const imageHtml = `<img src="${imageUrl}" alt="Grabbed image" style="max-width: 100%; height: auto;" />`;
      addSnippet(imageHtml, 'assistant', 'Image');
      showSuccess('Image added to Swag (without conversion)!');
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
      
      addSnippet(contentWithBase64Images, sourceType, title);
      showSuccess('Content captured to Swag!');
    } catch (error) {
      console.error('Failed to capture content with base64 conversion:', error);
      // Fallback to original behavior
      const fullContent = formatContentWithMedia(content, extractedContent);
      addSnippet(fullContent, sourceType, title);
      showSuccess('Content captured to Swag (without image conversion)!');
    }
  };

  // Handle voice transcription completion
  const handleVoiceTranscription = (text: string) => {
    setInput(text);
    // Auto-submit
    setTimeout(() => {
      handleSend();
    }, 100);
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

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

  // Auto-resize textarea helper
  const calculateRows = (text: string, minRows = 1, maxRows = 10): number => {
    if (!text || text.trim() === '') return minRows;
    const lines = text.split('\n').length;
    return Math.min(Math.max(lines, minRows), maxRows);
  };

  // Handle transfer data from planning tab
  useEffect(() => {
    if (transferData) {
      setInput(transferData.prompt);
      if (transferData.persona) {
        setSystemPrompt(transferData.persona);
      }
    }
  }, [transferData]);

  // Load last active chat on mount
  useEffect(() => {
    if (!messagesLoaded) {
      (async () => {
        try {
          const lastChatId = localStorage.getItem('last_active_chat_id');
          if (lastChatId) {
            console.log('🔄 Attempting to restore last chat:', lastChatId);
            const loadedMessages = await loadChatFromHistory(lastChatId);
            if (loadedMessages && loadedMessages.length > 0) {
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
              
              console.log('✅ Restored chat session:', lastChatId, 'with', cleanMessages.length, 'messages');
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
          const id = await saveChatToHistory(messages, currentChatId || undefined);
          if (!currentChatId) {
            setCurrentChatId(id);
          }
          // Save as last active chat
          localStorage.setItem('last_active_chat_id', id);
          console.log('💾 Chat auto-saved:', id);
        } catch (error) {
          console.error('❌ Failed to auto-save chat:', error);
          // Don't throw - just log the error so the UI continues to work
        }
      })();
    }
  }, [messages, currentChatId, messagesLoaded]);

  // Load chat history list when dialog opens
  useEffect(() => {
    if (showLoadDialog) {
      (async () => {
        const history = await getAllChatHistory();
        setChatHistory(history);
      })();
    }
  }, [showLoadDialog]);

  // Extract YouTube URLs from messages and add to playlist
  useEffect(() => {
    const lastMessage = messages[messages.length - 1];
    if (!lastMessage || lastMessage.role !== 'assistant') return;

    console.log('🎬 Checking for YouTube results in last message:', lastMessage);

    // Look for YouTube search results in tool_calls
    const youtubeResults: any[] = [];
    if (lastMessage.tool_calls) {
      console.log('🔧 Found tool_calls:', lastMessage.tool_calls);
      lastMessage.tool_calls.forEach((toolCall: any) => {
        console.log('🛠️ Processing tool call:', toolCall.function?.name, toolCall);
        if (toolCall.function?.name === 'search_youtube' && toolCall.result) {
          try {
            const result = typeof toolCall.result === 'string' 
              ? JSON.parse(toolCall.result) 
              : toolCall.result;
            console.log('📦 Parsed YouTube result:', result);
            if (result.videos && Array.isArray(result.videos)) {
              console.log(`✅ Found ${result.videos.length} YouTube videos`);
              youtubeResults.push(...result.videos);
            } else {
              console.warn('⚠️ No videos array in result:', result);
            }
          } catch (e) {
            console.error('❌ Failed to parse YouTube results:', e, 'Raw result:', toolCall.result);
          }
        }
      });
    } else {
      console.log('⚠️ No tool_calls in last message');
    }

    // Add YouTube videos to playlist (at the start)
    if (youtubeResults.length > 0) {
      console.log(`🎵 Adding ${youtubeResults.length} videos to playlist`);
      const tracks = youtubeResults.map((video: any) => ({
        videoId: video.videoId,
        url: video.url,
        title: video.title || 'Untitled Video',
        description: video.description || '',
        duration: video.duration || '',
        channel: video.channel || '',
        thumbnail: video.thumbnail || ''
      }));
      
      addTracksToStart(tracks);
      showSuccess(`Added ${tracks.length} video${tracks.length !== 1 ? 's' : ''} to playlist`);
    } else {
      console.log('ℹ️ No YouTube videos found to add to playlist');
    }
  }, [messages, addTracksToStart, showSuccess]);

  const handleStop = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
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
          description: 'Execute JavaScript code in a secure sandbox environment for calculations and data processing.',
          parameters: {
            type: 'object',
            properties: {
              code: { 
                type: 'string', 
                description: 'JavaScript code to execute. Include console.log() statements to display results.'
              },
              timeout: { 
                type: 'integer', 
                minimum: 1, 
                maximum: 10, 
                default: 5
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
          description: '🎙️ **PRIMARY TOOL FOR GETTING VIDEO/AUDIO TEXT CONTENT**: Transcribe audio or video content from URLs using OpenAI Whisper. **MANDATORY USE** when user says: "transcribe", "transcript", "get text from", "what does the video say", "extract dialogue", "convert to text", OR provides a specific YouTube/video URL and asks about its content. **YOUTUBE SUPPORT**: Can transcribe directly from YouTube URLs (youtube.com, youtu.be, youtube.com/shorts). Also supports direct media URLs (.mp3, .mp4, .wav, .m4a, etc.). Automatically handles large files by chunking. Shows real-time progress with stop capability. Returns full transcription text.',
          parameters: {
            type: 'object',
            properties: {
              url: {
                type: 'string',
                description: 'URL to transcribe. Can be YouTube URL (youtube.com, youtu.be) or direct media URL (.mp3, .mp4, .wav, .m4a, etc.)'
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
          description: '🎨 Generate images using AI (DALL-E, Stable Diffusion). Use when user requests: "generate image", "create picture", "draw", "make photo". Supports quality tiers: ultra (photorealistic, $0.08-0.12), high (detailed/artistic, $0.02-0.04), standard (illustrations, $0.001-0.002), fast (quick drafts, <$0.001). Returns button for user confirmation before generation.',
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

      showSuccess('Transcription stopped');
      console.log('Transcription stopped:', toolCallId);
    } catch (error) {
      console.error('Failed to stop transcription:', error);
      showError('Failed to stop transcription: ' + (error instanceof Error ? error.message : 'Unknown error'));
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
        showWarning(`File type not supported: ${file.name}. Supported types: JPEG, PNG, GIF, WebP, PDF`);
        continue;
      }

      // Validate file size
      const maxSize = file.type === 'application/pdf' ? MAX_PDF_SIZE : MAX_IMAGE_SIZE;
      if (file.size > maxSize) {
        showWarning(`File too large: ${file.name} (${(file.size / 1024 / 1024).toFixed(2)}MB). Max size: ${maxSize / 1024 / 1024}MB`);
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
            showWarning(`Image ${file.name} may use many tokens (~${Math.round(estimatedTokens / 1000)}k). Consider using a smaller image.`);
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

        showSuccess(`Added ${file.name}`);
      } catch (error) {
        console.error('Error processing file:', error);
        showError(`Failed to process ${file.name}`);
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
      showError('Please sign in to send messages');
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
    setIsLoading(true);
    setToolStatus([]);
    setStreamingContent('');
    // Clear expanded tool messages so new tool calls start collapsed
    setExpandedToolMessages(new Set());

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
      
      // Inject current date/time at the beginning
      finalSystemPrompt = `**CURRENT DATE AND TIME:**
${currentDateTime}

You have access to the current date and time above. Use this information when responding to temporal queries about "today", "current date", "what time is it", "this week", "this month", "this year", etc. You do not need to use tools to get the current date/time as it is provided in this system prompt.

${finalSystemPrompt}

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
      
      // Add tool suggestions if tools are enabled
      if (tools.length > 0) {
        const toolNames = tools.map(t => t.function.name).join(', ');
        finalSystemPrompt += `\n\nYou have access to these tools: ${toolNames}.

CRITICAL TOOL USAGE RULES:
- When users ask to TRANSCRIBE or get TRANSCRIPT from video/audio, you MUST call transcribe_url (NOT search_youtube)
- When users say "transcribe this video [URL]", "get transcript", "what does the video say", you MUST call transcribe_url
- When users want to FIND or SEARCH for videos, use search_youtube (e.g., "find videos about X")
- When users ask to "scrape", "get content from", "read", "fetch", "extract", "analyze", or "summarize" a website/URL, you MUST call the scrape_web_content tool
- When users provide ANY URL (http/https) and ask questions about it, you MUST call scrape_web_content with that URL FIRST
- MANDATORY: If a message contains a URL and asks to extract/analyze/summarize/get key points, you MUST call scrape_web_content - DO NOT provide an answer without first fetching the content
- When users ask for current information, news, or web content, you MUST use search_web
- When users ask for calculations, math problems, or code execution, you MUST ALWAYS use execute_javascript - NEVER provide answers directly
- MANDATORY: For "multiplication table", "calculate", "compute", "factorial", "compound interest", mathematical operations, or data processing, you MUST call execute_javascript
- DO NOT provide mathematical answers or tables manually - ALWAYS use execute_javascript tool
- DO NOT output tool parameters as JSON text in your response (e.g., don't write {"url": "...", "timeout": 15})
- DO NOT describe what you would do - ACTUALLY CALL THE TOOL using the function calling mechanism
- DO NOT write code for scraping or analyzing - USE THE TOOL INSTEAD
- The system will automatically execute your tool calls and provide you with results
- After receiving tool results, incorporate them naturally into your response
- IMPORTANT: After execute_javascript returns a result, provide the final answer to the user IMMEDIATELY. Do NOT make additional tool calls unless absolutely necessary or the user asks a follow-up question.

Examples when you MUST use tools:
- "transcribe this video https://youtube.com/watch?v=abc" → Call transcribe_url with url parameter
- "get transcript from this video [URL]" → Call transcribe_url with url parameter
- "find videos about AI" → Call search_youtube with query parameter
- "scrape and summarize https://example.com" → Call scrape_web_content with url parameter
- "get content from https://github.com/user/repo" → Call scrape_web_content with url parameter
- "Extract and analyze the key points from https://example.com/article" → Call scrape_web_content with url parameter
- "What does this page say: https://example.com" → Call scrape_web_content with url parameter
- "Summarize this article https://example.com/news" → Call scrape_web_content with url parameter
- "Read and analyze https://en.wikipedia.org/wiki/Topic" → Call scrape_web_content with url parameter
- "Find current news about X" → Call search_web with query parameter
- "What's the latest on X" → Call search_web with query parameter
- "calculate 5 factorial" → Call execute_javascript with code parameter
- "Generate a multiplication table for numbers 1-12" → Call execute_javascript with code parameter
- "Calculate compound interest" → Call execute_javascript with code parameter
- "Compute" or "Calculate" anything → Call execute_javascript with code parameter

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
      
      const messagesWithSystem = [
        { role: 'system' as const, content: finalSystemPrompt },
        ...filteredMessages,
        userMessage
      ];
      
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
          ...cleanMsg 
        } = msg as any;
        return cleanMsg;
      });
      
      // Phase 2: No model selection - backend decides based on PROVIDER_CATALOG.json
      // Backend will automatically detect images and select vision-capable models
      // Send providers array instead of model field - filter out disabled providers
      // IMPORTANT: Only send providers that are explicitly enabled (enabled === true)
      // Providers without 'enabled' field or with enabled=false are excluded
      const enabledProviders = settings.providers.filter(p => p.enabled === true);
      
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
        optimization: settings.optimization || 'cheap'  // Model selection strategy
      };
      
      console.log(`🎯 Model selection optimization: ${requestPayload.optimization}`);
      
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
              
            case 'tool_call_result':
              // Tool execution complete
              setToolStatus(prev => prev.map(t =>
                t.id === data.id ? {
                  ...t,
                  status: data.error ? 'error' : 'complete',
                  result: data.content
                } : t
              ));
              
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
                for (let i = 0; i < newMessages.length; i++) {
                  if (newMessages[i].role === 'assistant' && newMessages[i].tool_calls) {
                    // Check if this assistant has the tool call that matches
                    const hasMatchingToolCall = newMessages[i].tool_calls?.some((tc: any) => tc.id === data.id);
                    if (hasMatchingToolCall) {
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
                      break;
                    }
                  } else if (newMessages[i].role === 'assistant') {
                    console.log(`  [${i}] is assistant but has no tool_calls`);
                  }
                }
                
                // Check if we found a match
                const foundMatch = newMessages.some((msg) => 
                  msg.role === 'assistant' && msg.toolResults?.some((tr: any) => tr.tool_call_id === data.id)
                );
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
                // Clear search progress now that the tool result is available
                setSearchProgress(new Map());
              }
              
              // Streaming state already reset in tool_call_start
              break;
              
            case 'tool_progress':
              // Transcription progress events (download, chunking, transcription)
              console.log('📊 Tool progress event:', data);
              if (data.tool_call_id) {
                setTranscriptionProgress(prev => {
                  const newMap = new Map(prev);
                  const events = newMap.get(data.tool_call_id) || [];
                  newMap.set(data.tool_call_id, [...events, data]);
                  return newMap;
                });
              }
              break;
              
            case 'search_progress':
              // Web search progress events (searching, results_found, fetching_result, result_loaded)
              console.log('🔍 Search progress event:', data);
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
              // YouTube search progress events (fetching_transcripts, fetching_transcript, transcript_fetched, transcript_failed, complete)
              console.log('🎬 YouTube search progress event:', data);
              
              // If starting a new search, clear old progress
              if (data.phase === 'fetching_transcripts') {
                setYoutubeSearchProgress(new Map());
              }
              
              // Create a unique key for each event based on phase and video
              let youtubeProgressKey: string;
              if (data.phase === 'fetching_transcript' || data.phase === 'transcript_fetched' || data.phase === 'transcript_failed') {
                // For per-video events, use current video number
                youtubeProgressKey = `youtube_video_${data.currentVideo || 0}`;
              } else {
                // For general events, use phase
                youtubeProgressKey = `youtube_${data.phase}`;
              }
              
              setYoutubeSearchProgress(prev => {
                const newMap = new Map(prev);
                newMap.set(youtubeProgressKey, data);
                return newMap;
              });
              
              // Auto-expand the tool section when YouTube search starts
              if (data.phase === 'fetching_transcripts') {
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
              
            case 'message_complete':
              // Assistant message complete (with optional tool_calls)
              if (data.tool_calls && data.tool_calls.length > 0) {
                console.log('📦 message_complete with tool_calls:', data.tool_calls.map((tc: any) => ({ id: tc.id, name: tc.function.name })));
              }
              
              if (currentStreamingBlockIndex !== null) {
                // Finalize the existing streaming block
                setMessages(prev => {
                  const newMessages = [...prev];
                  if (newMessages[currentStreamingBlockIndex]) {
                    newMessages[currentStreamingBlockIndex] = {
                      ...newMessages[currentStreamingBlockIndex],
                      content: data.content || newMessages[currentStreamingBlockIndex].content || '',
                      tool_calls: data.tool_calls || newMessages[currentStreamingBlockIndex].tool_calls,
                      extractedContent: data.extractedContent || newMessages[currentStreamingBlockIndex].extractedContent,
                      imageGenerations: data.imageGenerations || newMessages[currentStreamingBlockIndex].imageGenerations,
                      llmApiCalls: data.llmApiCalls || newMessages[currentStreamingBlockIndex].llmApiCalls,
                      evaluations: data.evaluations || newMessages[currentStreamingBlockIndex].evaluations,
                      isStreaming: false
                    };
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
                      console.log('🟡 Updating existing streaming assistant with message_complete data');
                      const newMessages = [...prev];
                      newMessages[lastMessageIndex] = {
                        ...lastMessage,
                        content: data.content || lastMessage.content || '',
                        tool_calls: data.tool_calls || lastMessage.tool_calls,
                        extractedContent: data.extractedContent || lastMessage.extractedContent,
                        imageGenerations: data.imageGenerations || lastMessage.imageGenerations,
                        llmApiCalls: data.llmApiCalls || lastMessage.llmApiCalls,
                        evaluations: data.evaluations || lastMessage.evaluations,
                        isStreaming: false
                      };
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
                      const newMessages = [...prev];
                      newMessages[lastMessageIndex] = {
                        ...lastMessage,
                        content: data.content || lastMessage.content || '',
                        tool_calls: data.tool_calls || lastMessage.tool_calls,
                        extractedContent: data.extractedContent || lastMessage.extractedContent,
                        imageGenerations: data.imageGenerations || lastMessage.imageGenerations,
                        llmApiCalls: data.llmApiCalls || lastMessage.llmApiCalls,
                        evaluations: data.evaluations || lastMessage.evaluations,
                        isStreaming: false
                      };
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
              
            case 'complete':
              // All processing complete
              console.log('Stream complete:', data);
              
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
                
                // Create error message
                const moderationMsg = `❌ **Content Moderation Alert**\n\n${errorMsg}\n\n**Reason**: ${data.reason}\n\nThis response cannot be displayed due to content policy violations. Please try rephrasing your question.`;
                
                const moderationError: ChatMessage = {
                  role: 'assistant',
                  content: moderationMsg,
                  llmApiCalls: data.llmApiCalls || []
                };
                setMessages(prev => [...prev, moderationError]);
                
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
                showWarning('Your session has expired. Please sign in again.');
                // The AuthContext will handle logout via useAuth
              }
              
              // Check if continue button should be shown
              if (data.showContinueButton && data.continueContext) {
                console.log('🔄 Continue button enabled for error:', errorMsg);
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
        youtubeToken // Pass YouTube OAuth token if available
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
    
    // Restore user input and trigger auto-submit
    const userContent = getMessageText(userPrompt.content);
    setInput(userContent);
    
    // Set trigger to auto-submit when input updates
    retryTriggerRef.current = true;
  };

  const handleLoadChat = async (entry: ChatHistoryEntry) => {
    const loadedMessages = await loadChatFromHistory(entry.id);
    if (loadedMessages) {
      setMessages(loadedMessages);
      setCurrentChatId(entry.id);
      localStorage.setItem('last_active_chat_id', entry.id);
      setShowLoadDialog(false);
      showSuccess('Chat loaded successfully');
    } else {
      showError('Failed to load chat');
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
    showSuccess('All chat history cleared');
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
      optimization: settings.optimization || 'cheap'  // Model selection strategy
    };
    
    console.log(`🎯 Continuation request with optimization: ${requestPayload.optimization}`);
    
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
    setMessages([]);
    setInput('');
    setSystemPrompt('');
    clearSearchResults();
    // Clear expanded tool messages when starting new chat
    setExpandedToolMessages(new Set());
    // Reset chat ID to start a new session
    setCurrentChatId(null);
    localStorage.removeItem('last_active_chat_id');
    // Focus the input field
    setTimeout(() => {
      inputRef.current?.focus();
    }, 0);
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
      {/* Drag and Drop Overlay */}
      {isDragging && (
        <div className="absolute inset-0 z-50 bg-blue-500/20 dark:bg-blue-400/20 backdrop-blur-sm flex items-center justify-center border-4 border-dashed border-blue-500 dark:border-blue-400">
          <div className="bg-white dark:bg-gray-800 rounded-lg p-8 shadow-2xl">
            <div className="text-center">
              <svg className="w-16 h-16 mx-auto mb-4 text-blue-500 dark:text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
              </svg>
              <h3 className="text-2xl font-bold text-gray-900 dark:text-gray-100 mb-2">
                Drop files here
              </h3>
              <p className="text-gray-600 dark:text-gray-400">
                Images (JPEG, PNG, GIF, WebP) and PDFs supported
              </p>
              <p className="text-sm text-gray-500 dark:text-gray-500 mt-2">
                Max: 5MB for images, 10MB for PDFs
              </p>
            </div>
          </div>
        </div>
      )}
      
      {/* System Prompt Display */}
      {systemPrompt && (
        <div className="p-2 border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800">
          <div className="flex items-center gap-2 max-w-screen-2xl mx-auto">
            <div 
              className="flex-1 text-sm text-gray-700 dark:text-gray-300 cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-700 p-1 rounded transition-colors"
              onClick={() => setSystemPromptExpanded(!systemPromptExpanded)}
              title={systemPromptExpanded ? "Click to collapse" : "Click to expand"}
            >
              {systemPromptExpanded ? systemPrompt : (systemPrompt.length > 200 ? systemPrompt.substring(0, 200) + '...' : systemPrompt)}
            </div>
          </div>
        </div>
      )}
      
      {/* Chat Header with Actions */}
      <div className="flex flex-wrap items-center gap-2 p-4 border-b border-gray-200 dark:border-gray-700">
        <div className="flex flex-wrap gap-2 flex-1">
          <button onClick={handleNewChat} className="bg-green-600 hover:bg-green-700 text-white px-3 py-1.5 rounded font-medium text-sm transition-colors">
            ➕ New Chat
          </button>
          <button onClick={() => setShowLoadDialog(true)} className="btn-secondary text-sm">
            🕒 History
          </button>
          <button
            onClick={() => setShowPlanningDialog(true)}
            className="btn-secondary text-sm"
            title={systemPrompt ? "Edit system prompt and planning" : "Add system prompt and planning"}
          >
            {systemPrompt ? '✏️ Edit Plan' : '📋 Make A Plan'}
          </button>
          <button 
            onClick={() => setShowExamplesModal(true)}
            className="btn-secondary text-sm"
          >
            📝 Examples
          </button>
        </div>
      </div>

      {/* Messages Area */}
      <div ref={messagesContainerRef} className="flex-1 overflow-y-auto p-4 space-y-4">
        {messages.length === 0 && (
          <div className="text-center text-gray-500 dark:text-gray-400 mt-8">
            No messages yet. Start a conversation!
          </div>
        )}
        {messages.map((msg, idx) => {
          const isExpanded = expandedToolMessages.has(idx);
          const msgText = msg.content ? getMessageText(msg.content) : '';
          console.log(`Rendering message ${idx}:`, msg.role, msgText.substring(0, 50));
          
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
                                            <div className="font-semibold text-purple-700 dark:text-purple-300 mb-1">Search Provider:</div>
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
                                  <div className="font-semibold text-purple-700 dark:text-purple-300 mb-2">Function Call:</div>
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
                                            <div className="font-semibold text-purple-700 dark:text-purple-300 mb-1">Code:</div>
                                            <div className="bg-gray-900 text-green-400 p-3 rounded font-mono text-xs overflow-x-auto max-h-64 overflow-y-auto">
                                              <pre className="whitespace-pre-wrap leading-relaxed">{parsed.code}</pre>
                                            </div>
                                          </div>
                                        );
                                      }
                                      
                                      // For all other tools (including generate_chart), show JSON tree
                                      return (
                                        <div>
                                          <div className="font-semibold text-purple-700 dark:text-purple-300 mb-1">Arguments:</div>
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
                              <span className="font-semibold text-purple-700 dark:text-purple-300">Call ID:</span>
                              <div className="font-mono text-xs bg-purple-50 dark:bg-purple-950 p-1 rounded mt-1 break-all">
                                {msg.tool_call_id}
                              </div>
                            </div>
                          )}
                          <div>
                            <span className="font-semibold text-purple-700 dark:text-purple-300">Result:</span>
                            <div className="bg-purple-50 dark:bg-purple-950 p-2 rounded mt-1 max-h-96 overflow-y-auto">
                              {searchResults ? (
                                <div className="space-y-3">
                                  {searchResults.map((result: any, ridx: number) => (
                                    <div key={ridx} className="border-b border-purple-200 dark:border-purple-800 pb-2 last:border-b-0">
                                      <div className="font-semibold text-purple-900 dark:text-purple-100 mb-1">
                                        {result.title || 'Result ' + (ridx + 1)}
                                      </div>
                                      {result.url && (
                                        <a 
                                          href={result.url} 
                                          target="_blank" 
                                          rel="noopener noreferrer"
                                          className="text-blue-600 dark:text-blue-400 hover:underline text-xs break-all block mb-1"
                                        >
                                          {result.url}
                                        </a>
                                      )}
                                      {result.description && (
                                        <p className="text-gray-700 dark:text-gray-300 text-xs mb-1 italic">
                                          {result.description}
                                        </p>
                                      )}
                                      {result.snippet && (
                                        <p className="text-gray-700 dark:text-gray-300 text-xs">
                                          {result.snippet}
                                        </p>
                                      )}
                                      {/* Show button to view loaded page content if available */}
                                      {result.content && (
                                        <div className="mt-2">
                                          <button
                                            onClick={() => setViewingSearchResult({ result, index: ridx })}
                                            className="px-3 py-1.5 text-xs bg-purple-600 hover:bg-purple-700 text-white rounded transition-colors font-semibold"
                                          >
                                            📄 View Full Content ({(result.content.length / 1024).toFixed(1)} KB)
                                            {result.images?.length > 0 && ` • ${result.images.length} images`}
                                            {result.links?.length > 0 && ` • ${result.links.length} links`}
                                          </button>
                                        </div>
                                      )}
                                    </div>
                                  ))}
                                </div>
                              ) : scrapeResult ? (
                                <div className="space-y-2">
                                  {/* Show URL */}
                                  {scrapeResult.url && (
                                    <div>
                                      <span className="font-semibold text-purple-800 dark:text-purple-200">URL:</span>
                                      <a 
                                        href={scrapeResult.url} 
                                        target="_blank" 
                                        rel="noopener noreferrer"
                                        className="text-blue-600 dark:text-blue-400 hover:underline text-xs break-all block mt-1"
                                      >
                                        {scrapeResult.url}
                                      </a>
                                    </div>
                                  )}
                                  
                                  {/* Show error if present */}
                                  {scrapeResult.error && (
                                    <div className="bg-red-50 dark:bg-red-900/30 border border-red-300 dark:border-red-700 rounded p-2">
                                      <span className="font-semibold text-red-800 dark:text-red-200">Error:</span>
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
                                      <div className="flex items-center gap-2 mb-2">
                                        <span className="font-semibold text-purple-800 dark:text-purple-200">✅ Output:</span>
                                        {toolCall?.executedAt && (
                                          <span className="text-xs text-gray-600 dark:text-gray-400">
                                            ({toolCall.runtime || 'N/A'})
                                          </span>
                                        )}
                                      </div>
                                      <div className="bg-gray-50 dark:bg-gray-950 p-3 rounded border border-green-300 dark:border-green-700">
                                        <pre className="whitespace-pre-wrap text-sm text-gray-900 dark:text-gray-100 font-mono leading-relaxed">
                                          {String(jsResult.result)}
                                        </pre>
                                      </div>
                                    </div>
                                  )}
                                </div>
                              ) : (
                                <pre className="whitespace-pre-wrap text-xs text-gray-800 dark:text-gray-200">
                                  {getMessageText(msg.content)}
                                </pre>
                              )}
                              
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
                                          <span className="text-[10px]">No summarization</span>
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
                        {/* Show search progress for search_web tool calls */}
                        {msg.tool_calls && msg.tool_calls.some((tc: any) => tc.function.name === 'search_web') && (
                          <div className="mb-3 space-y-2">
                            {Array.from(searchProgress.values()).map((progress, idx) => (
                              <SearchProgress key={idx} data={progress} />
                            ))}
                          </div>
                        )}
                        
                        {/* Show YouTube search progress for search_youtube tool calls */}
                        {msg.tool_calls && msg.tool_calls.some((tc: any) => tc.function.name === 'search_youtube') && (
                          <div className="mb-3 space-y-2">
                            {Array.from(youtubeSearchProgress.values()).map((progress, idx) => (
                              <YouTubeSearchProgress key={idx} data={progress} />
                            ))}
                          </div>
                        )}
                        
                        {/* Show transcription progress for tool calls in progress (NOT complete) */}
                        {msg.tool_calls && msg.tool_calls.map((tc: any, tcIdx: number) => {
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
                          return null;
                        })}
                        
                        {/* Message content - only render if there's actual content */}
                        <div className="flex items-start gap-2">
                          <div className="flex-1">
                            {msg.content && <MarkdownRenderer content={getMessageText(msg.content)} />}
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
                        
                        {/* Extracted content from tool calls (sources, images, videos, media) */}
                        {msg.extractedContent && <ExtractedContent extractedContent={msg.extractedContent} />}
                        
                        {/* Show selected images and media sections ONLY on final assistant message with content */}
                        {(() => {
                          // Check if this is the final assistant message with actual text content
                          const isFinalAssistantMessage = msg.content && !msg.isStreaming && 
                            // Check if there are no subsequent assistant messages with content
                            !messages.slice(idx + 1).some(m => m.role === 'assistant' && m.content);
                          
                          if (!isFinalAssistantMessage) return null;
                          
                          const media = extractMediaFromMessage(msg);
                          const hasAnyMedia = media.images.length > 0 || media.links.length > 0 || 
                                            media.youtubeLinks.length > 0 || media.otherMedia.length > 0;
                          
                          if (!hasAnyMedia) return null;
                          
                          return (
                            <>
                              {/* Show first 3 images immediately after response text */}
                              {media.images.length > 0 && (
                                <ImageGallery 
                                  images={media.images}
                                  maxDisplay={3}
                                  onImageClick={(url) => window.open(url, '_blank')}
                                  onGrabImage={handleGrabImage}
                                />
                              )}
                              
                              {/* Expandable media sections at the end */}
                              <MediaSections {...media} onGrabImage={handleGrabImage} />
                            </>
                          );
                        })()}
                        
                        {/* Tool results embedded in this assistant message - render like tool messages */}
                        {msg.toolResults && msg.toolResults.length > 0 && (
                          <div className="mt-4 space-y-3">
                            {msg.toolResults.map((toolResult: any, trIdx: number) => {
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
                                      {/* Search results with nice formatting */}
                                      {searchResults && searchResults.length > 0 ? (
                                        <div className="space-y-3">
                                          {searchResults.map((result: any, rIdx: number) => {
                                            // result.content contains the actual scraped text
                                            // result.page_content is an object with images, videos, links, etc.
                                            const pageContent = result.content;
                                            const hasContent = pageContent && typeof pageContent === 'string' && pageContent.length > 0;
                                            
                                            return (
                                              <div key={rIdx} className="bg-white dark:bg-gray-900 p-3 rounded border border-purple-200 dark:border-purple-800">
                                                <a 
                                                  href={result.url} 
                                                  target="_blank" 
                                                  rel="noopener noreferrer"
                                                  className="font-semibold text-purple-700 dark:text-purple-300 hover:underline block mb-1"
                                                >
                                                  {result.title}
                                                </a>
                                                {result.snippet && (
                                                  <p className="text-gray-700 dark:text-gray-300 text-xs mb-2">{result.snippet}</p>
                                                )}
                                                <a 
                                                  href={result.url} 
                                                  target="_blank" 
                                                  rel="noopener noreferrer"
                                                  className="text-blue-600 dark:text-blue-400 hover:underline text-[10px] break-all block mb-2"
                                                >
                                                  {result.url}
                                                </a>
                                                
                                                {/* Show loaded page content if available */}
                                                {hasContent && (
                                                  <div className="mt-3 pt-3 border-t border-purple-200 dark:border-purple-700">
                                                    <div className="text-[10px] font-semibold text-purple-700 dark:text-purple-400 mb-1">
                                                      📄 Scraped Page Content ({pageContent.length.toLocaleString()} chars)
                                                    </div>
                                                    <div className="bg-gray-50 dark:bg-gray-950 p-2 rounded max-h-60 overflow-y-auto">
                                                      <pre className="whitespace-pre-wrap text-[10px] text-gray-700 dark:text-gray-300">
                                                        {pageContent.substring(0, 2000)}{pageContent.length > 2000 ? '...' : ''}
                                                      </pre>
                                                    </div>
                                                  </div>
                                                )}
                                              </div>
                                            );
                                          })}
                                        </div>
                                      ) : jsResult ? (
                                        <div className="space-y-3">
                                          {/* Show the code that was executed */}
                                          {jsCode && (
                                            <div>
                                              <div className="font-semibold text-purple-700 dark:text-purple-300 mb-2">💻 Code:</div>
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
                                              <div className="font-semibold text-purple-700 dark:text-purple-300 mb-2">✅ Output:</div>
                                              <div className="bg-gray-50 dark:bg-gray-950 p-3 rounded border border-green-300 dark:border-green-700">
                                                <pre className="whitespace-pre-wrap text-sm text-gray-900 dark:text-gray-100 font-mono leading-relaxed">
                                                  {String(jsResult.result)}
                                                </pre>
                                              </div>
                                            </div>
                                          )}
                                        </div>
                                      ) : (
                                        <ToolResultJsonViewer content={toolResult.content} />
                                      )}
                                    </div>
                                  )}
                                </div>
                              );
                            })}
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
                        
                        {/* Extracted content for non-markdown messages too */}
                        {msg.extractedContent && <ExtractedContent extractedContent={msg.extractedContent} />}
                        
                        {/* Generated Images */}
                        {msg.imageGenerations && msg.imageGenerations.length > 0 && (
                          <div className="mt-3">
                            {msg.imageGenerations.map((imgGen) => (
                              <GeneratedImageBlock
                                key={imgGen.id}
                                data={imgGen}
                                accessToken={accessToken}
                                onCopy={(text) => {
                                  navigator.clipboard.writeText(text).then(() => {
                                    showSuccess('Image URL copied to clipboard!');
                                  }).catch(() => {
                                    showError('Failed to copy');
                                  });
                                }}
                                onGrab={(markdown) => {
                                  navigator.clipboard.writeText(markdown).then(() => {
                                    showSuccess('Markdown copied to clipboard!');
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
                            ))}
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
                              showSuccess('Copied to clipboard!');
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
                        {/* Error Info button for error messages */}
                        {msg.errorData && getMessageText(msg.content).startsWith('❌ Error:') && (
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
      <div className="p-4 border-t border-gray-200 dark:border-gray-700 space-y-3">
        {/* App-level auth gate ensures user is authenticated, no need for inline check */}
        <>
          {/* File Attachments Display */}
          {attachedFiles.length > 0 && (
            <div className="flex flex-wrap gap-2 p-2 bg-gray-50 dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700">
              {attachedFiles.map((file, idx) => (
                <div 
                  key={idx} 
                  className="relative group bg-white dark:bg-gray-700 rounded-lg border border-gray-300 dark:border-gray-600 p-2 flex items-center gap-2"
                >
                  {/* Preview or Icon */}
                  {file.preview ? (
                    <img 
                      src={file.preview} 
                      alt={file.name} 
                      className="w-12 h-12 object-cover rounded"
                    />
                  ) : (
                    <div className="w-12 h-12 flex items-center justify-center bg-red-100 dark:bg-red-900/30 rounded">
                      <svg className="w-6 h-6 text-red-600 dark:text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
                      </svg>
                    </div>
                  )}
                  
                  {/* File Info */}
                  <div className="flex-1 min-w-0">
                    <div className="text-xs font-medium text-gray-900 dark:text-gray-100 truncate max-w-[150px]">
                      {file.name}
                    </div>
                    <div className="text-xs text-gray-500 dark:text-gray-400">
                      {(file.size / 1024).toFixed(1)} KB
                    </div>
                  </div>
                  
                  {/* Remove Button */}
                  <button
                    onClick={() => removeAttachment(idx)}
                    className="opacity-0 group-hover:opacity-100 transition-opacity absolute -top-2 -right-2 bg-red-500 hover:bg-red-600 text-white rounded-full w-5 h-5 flex items-center justify-center text-xs"
                    title="Remove file"
                  >
                    ×
                  </button>
                </div>
              ))}
            </div>
          )}
          
          {/* Continue Button for Error Recovery */}
          {showContinueButton && continueContext && (
            <div className="flex justify-center py-3">
              <button
                onClick={handleContinue}
                disabled={isLoading}
                className="bg-orange-600 hover:bg-orange-700 disabled:opacity-50 disabled:cursor-not-allowed text-white px-6 py-3 rounded-lg font-semibold text-base transition-all transform hover:scale-105 shadow-lg flex items-center gap-2"
                title="Continue from where the error occurred"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 5l7 7-7 7M5 5l7 7-7 7" />
                </svg>
                Continue Processing
              </button>
            </div>
          )}
          
          {/* Message Input */}
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
              className="btn-secondary px-3 disabled:opacity-50 disabled:cursor-not-allowed"
              title="Attach images or PDFs"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13" />
              </svg>
            </button>

            {/* Voice Input Button */}
            <button
              onClick={() => setShowVoiceInput(true)}
              disabled={isLoading || !accessToken}
              className="btn-secondary px-3 disabled:opacity-50 disabled:cursor-not-allowed"
              title={!accessToken ? 'Please sign in to use voice input' : 'Voice input (speech-to-text)'}
            >
              <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                <path d="M12 14c1.66 0 3-1.34 3-3V5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3z"/>
                <path d="M17 11c0 2.76-2.24 5-5 5s-5-2.24-5-5H5c0 3.53 2.61 6.43 6 6.92V21h2v-3.08c3.39-.49 6-3.39 6-6.92h-2z"/>
              </svg>
            </button>
            
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
              placeholder="Type your message... (Shift+Enter for new line, ↑↓ for history)"
              className="input-field flex-1 resize-none"
              rows={calculateRows(input, 1, 10)}
            />
            <button
              onClick={isLoading ? handleStop : () => handleSend()}
              disabled={!isLoading && (!input.trim() || !accessToken)}
              className="btn-primary self-end"
              title={!accessToken ? 'Please sign in to send messages' : (!input.trim() ? 'Type a message first' : 'Send message')}
            >
              {isLoading ? '⏹ Stop' : (!input.trim() ? '✏️ Type a message' : '📤 Send')}
            </button>
          </div>
        </>
      </div>

      {/* Load Chat Dialog */}
      {showLoadDialog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50">
          <div className="card max-w-2xl w-full p-6">
            {/* Header with Select All/None buttons */}
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-xl font-bold text-gray-900 dark:text-gray-100">Chat History</h3>
              {chatHistory.length > 0 && (
                <div className="flex gap-2">
                  <button
                    onClick={handleSelectAllChats}
                    className="btn-secondary text-xs px-3 py-1"
                  >
                    ☑️ Select All
                  </button>
                  <button
                    onClick={handleSelectNoneChats}
                    className="btn-secondary text-xs px-3 py-1"
                  >
                    ☐ Select None
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
                          Load
                        </button>
                        <button
                          onClick={() => handleDeleteChat(entry.id)}
                          className="btn-secondary text-red-500 text-xs px-3 py-1"
                        >
                          Delete
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
              {chatHistory.length === 0 && (
                <p className="text-gray-500 dark:text-gray-400 text-center py-8">
                  No chat history found. Start a conversation to save it automatically.
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
                  🗑️ Delete Selected ({selectedChatIds.size})
                </button>
              )}
              {chatHistory.length > 0 && (
                <button
                  onClick={() => setShowClearHistoryConfirm(true)}
                  className="btn-secondary text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20"
                >
                  🗑️ Clear All History
                </button>
              )}
              <button
                onClick={() => setShowLoadDialog(false)}
                className="btn-primary flex-1"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Clear History Confirmation Dialog */}
      {showClearHistoryConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50">
          <div className="card max-w-md w-full p-6">
            <h3 className="text-xl font-bold mb-4 text-gray-900 dark:text-gray-100">Clear All History?</h3>
            <p className="text-gray-700 dark:text-gray-300 mb-6">
              Are you sure you want to delete all {chatHistory.length} chat{chatHistory.length !== 1 ? 's' : ''} from history? This action cannot be undone.
            </p>
            <div className="flex gap-2">
              <button
                onClick={() => setShowClearHistoryConfirm(false)}
                className="btn-secondary flex-1"
              >
                Cancel
              </button>
              <button
                onClick={handleClearAllHistory}
                className="btn-primary flex-1 bg-red-600 hover:bg-red-700"
              >
                Clear All
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
              <h2 className="text-2xl font-bold text-gray-900 dark:text-gray-100">MCP Server Configuration</h2>
              <button
                onClick={() => setShowMCPDialog(false)}
                className="text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
              >
                ✕
              </button>
            </div>

            {/* Add New MCP Server */}
            <div className="mb-6 p-4 bg-gray-50 dark:bg-gray-800 rounded-lg">
              <h3 className="text-lg font-semibold mb-3 text-gray-900 dark:text-gray-100">Add MCP Server</h3>
              <div className="space-y-3">
                <input
                  type="text"
                  value={newMCPServer.name}
                  onChange={(e) => setNewMCPServer({ ...newMCPServer, name: e.target.value })}
                  placeholder="Server Name (e.g., filesystem, github)"
                  className="input-field w-full"
                />
                <input
                  type="text"
                  value={newMCPServer.url}
                  onChange={(e) => setNewMCPServer({ ...newMCPServer, url: e.target.value })}
                  placeholder="Server URL (e.g., http://localhost:3000)"
                  className="input-field w-full"
                />
                <button
                  onClick={handleAddMCPServer}
                  disabled={!newMCPServer.name.trim() || !newMCPServer.url.trim()}
                  className="btn-primary w-full"
                >
                  ➕ Add Server
                </button>
              </div>
            </div>

            {/* Existing MCP Servers */}
            <div>
              <h3 className="text-lg font-semibold mb-3 text-gray-900 dark:text-gray-100">
                Configured Servers ({mcpServers.length})
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
                    >
                      🗑️
                    </button>
                  </div>
                ))}
                {mcpServers.length === 0 && (
                  <p className="text-gray-500 dark:text-gray-400 text-center py-4">
                    No MCP servers configured
                  </p>
                )}
              </div>
            </div>

            <div className="mt-6 flex gap-2">
              <button onClick={() => setShowMCPDialog(false)} className="btn-primary flex-1">
                Done
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
            setInput(data.prompt);
            if (data.persona) {
              setSystemPrompt(data.persona);
            }
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
                aria-label="Close"
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
      
      {/* LLM Info Dialog */}
      {showLlmInfo !== null && messages[showLlmInfo]?.llmApiCalls && (
        <LlmInfoDialog 
          apiCalls={messages[showLlmInfo].llmApiCalls}
          evaluations={(messages[showLlmInfo] as any).evaluations}
          onClose={() => setShowLlmInfo(null)}
        />
      )}
      
      {/* Error Info Dialog */}
      {showErrorInfo !== null && messages[showErrorInfo]?.errorData && (
        <ErrorInfoDialog 
          errorData={messages[showErrorInfo].errorData}
          onClose={() => setShowErrorInfo(null)}
        />
      )}

      {/* Voice Input Dialog */}
      <VoiceInputDialog
        isOpen={showVoiceInput}
        onClose={() => setShowVoiceInput(false)}
        onTranscriptionComplete={handleVoiceTranscription}
        accessToken={accessToken}
        apiEndpoint={'https://nrw7pperjjdswbmqgmigbwsbyi0rwdqf.lambda-url.us-east-1.on.aws'}
      />

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
    </div>
  );
};
