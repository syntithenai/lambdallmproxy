/**
 * Persistence Type Definitions
 * 
 * This file contains all TypeScript interfaces for data stored in IndexedDB
 * and synced to Google Drive/Sheets.
 */

// ============================================================================
// Base Interfaces
// ============================================================================

/**
 * Base interface for all user-scoped records
 * All data types MUST extend this interface
 */
export interface BaseUserRecord {
  id: string;           // Unique record ID (UUID)
  userId: string;       // User's email from Google OAuth
  createdAt: number;    // Unix timestamp (milliseconds)
  updatedAt: number;    // Unix timestamp (milliseconds)
}

// ============================================================================
// Settings
// ============================================================================

export interface Settings {
  userId: string;           // PRIMARY KEY - user's email
  version: string;          // Settings schema version (e.g., "2.0.0")
  
  // App settings
  language: string;         // "en", "es", "fr", etc.
  theme: 'light' | 'dark' | 'auto';
  
  // Provider settings
  providers: ProviderConfig[];
  defaultProvider?: string;
  
  // Legacy/additional settings
  tavilyApiKey?: string;        // Tavily search API key
  syncToGoogleDrive?: boolean;  // Auto-sync to Google Drive
  optimization?: 'cheap' | 'balanced' | 'powerful' | 'fastest';  // Model selection strategy
  embeddingSource?: 'api' | 'local';  // Embedding source
  embeddingModel?: string;      // Selected embedding model
  imageQuality?: 'low' | 'medium' | 'high';  // Image generation quality
  
  // Voice settings
  voice: VoiceSettings;
  
  // Proxy settings
  proxy: ProxySettings;
  
  // RAG settings
  rag: RAGSettings;
  
  // TTS settings
  tts: TTSSettings;
  
  // Timestamps
  createdAt: number;
  updatedAt: number;
}

export interface ProviderConfig {
  id: string;               // Unique ID for this provider instance (UUID)
  type: 'openai' | 'anthropic' | 'groq' | 'google' | 'cohere' | 'deepseek' | 'gemini' | 'together' | 'replicate' | 'atlascloud' | 'speaches' | 'openai-compatible';
  apiEndpoint?: string;     // Auto-filled for known providers, required for openai-compatible
  apiKey: string;           // Provider API key
  modelName?: string;       // Model name (mainly for openai-compatible)
  model?: string;           // Alias for modelName (backward compatibility)
  rateLimitTPM?: number;    // Rate limit in tokens per minute
  priority?: number;        // Provider selection priority (1 = highest)
  enabled?: boolean;        // Is provider active? (default: true)
  maxTokens?: number;       // Max tokens for requests
  temperature?: number;     // Default temperature (0.0 - 1.0)
  allowedModels?: string[] | null;  // Model restrictions
  maxImageQuality?: 'fast' | 'standard' | 'high' | 'ultra';  // Image quality cap
  capabilities?: {          // Service capabilities
    chat?: boolean;
    image?: boolean;
    embedding?: boolean;
    voice?: boolean;
    tts?: boolean;
  };
}

export interface VoiceSettings {
  // Continuous voice mode
  hotword: string;              // Wake word (e.g., "Hey Google", "Alexa")
  sensitivity: number;          // Hotword sensitivity (0.0 - 1.0)
  speechTimeout: number;        // Silence duration to stop recording (seconds, float)
  conversationTimeout: number;  // Max conversation duration (milliseconds, int)
  silenceThreshold: number;     // Audio level threshold for silence detection (0-255, default: 25)
  
  // Whisper transcription
  useLocalWhisper: boolean;     // Try local Whisper service first?
  localWhisperUrl: string;      // Local Whisper endpoint (default: "http://localhost:8000")
  whisperProvider?: 'groq' | 'openai' | 'speaches';  // Cloud fallback provider
  whisperApiKey?: string;       // Cloud Whisper API key
}

export interface ProxySettings {
  enabled: boolean;         // Is proxy enabled?
  username: string;         // Proxy username
  password: string;         // Proxy password
  useServerProxy: boolean;  // Use server's proxy credentials instead of user's
}

export interface RAGSettings {
  enabled: boolean;             // Is RAG enabled globally?
  topK: number;                 // Number of results to retrieve
  scoreThreshold: number;       // Minimum similarity score (0.0 - 1.0)
  embeddingProvider?: string;   // 'openai' | 'cohere' | 'local'
  embeddingModel?: string;      // Model name for embeddings
  chunkSize?: number;           // Text chunk size for embedding
  chunkOverlap?: number;        // Overlap between chunks
}

export interface TTSSettings {
  enabled: boolean;             // Auto-read responses?
  provider: 'browser' | 'elevenlabs' | 'openai' | 'google';
  voice?: string;               // Voice ID or name
  rate?: number;                // Speech rate (0.5 - 2.0)
  pitch?: number;               // Speech pitch (0.5 - 2.0)
  volume?: number;              // Speech volume (0.0 - 1.0)
  apiKey?: string;              // API key for cloud TTS providers
}

// ============================================================================
// Snippets
// ============================================================================

export interface Snippet extends BaseUserRecord {
  content: string;
  tags: string[];
  type: 'text' | 'code' | 'markdown' | 'html';
  title?: string;
  projectId?: string;
  source?: string;      // URL or source identifier
  language?: string;    // For code snippets
  metadata?: Record<string, any>;
}

// ============================================================================
// Feed Items
// ============================================================================

export interface FeedItem extends BaseUserRecord {
  title: string;
  content: string;
  url?: string;
  image?: string;           // Image URL or data URI
  imageSource?: string;     // 'generated' | 'scraped' | 'manual'
  projectId?: string;
  tags?: string[];
  score?: number;           // Relevance score
  source: string;           // 'search' | 'manual' | 'rss'
}

// ============================================================================
// RAG Data
// ============================================================================

export interface RAGData extends BaseUserRecord {
  content: string;
  embedding: number[];      // Vector embedding
  metadata: {
    source?: string;        // URL or source identifier
    title?: string;
    tags?: string[];
    snippetId?: string;     // Link to original snippet
  };
}

// ============================================================================
// Quizzes
// ============================================================================

export interface Quiz extends BaseUserRecord {
  title: string;
  description?: string;
  snippetIds: string[];     // Snippets this quiz covers
  questions: QuizQuestion[];
  projectId?: string;
  status: 'draft' | 'active' | 'archived';
  difficulty?: 'easy' | 'medium' | 'hard';
}

export interface QuizQuestion {
  id: string;
  question: string;
  options: string[];
  correctAnswer: number;    // Index of correct option
  explanation?: string;
  tags?: string[];
}

// ============================================================================
// Quiz Progress
// ============================================================================

export interface QuizProgress extends BaseUserRecord {
  quizId: string;           // Quiz being taken
  currentQuestionIndex: number;
  answers: QuizAnswer[];
  score: number;
  status: 'in-progress' | 'completed';
  startedAt: number;
  completedAt?: number;
}

export interface QuizAnswer {
  questionId: string;
  selectedAnswer: number;
  isCorrect: boolean;
  timeSpent: number;        // milliseconds
}

// ============================================================================
// Quiz Analytics
// ============================================================================

export interface QuizAnalytics extends BaseUserRecord {
  quizId: string;
  totalAttempts: number;
  averageScore: number;
  questionStats: QuestionStats[];
  lastAttempt: number;      // timestamp
}

export interface QuestionStats {
  questionId: string;
  timesAsked: number;
  timesCorrect: number;
  averageTimeSpent: number;
}

// ============================================================================
// Plans
// ============================================================================

export interface Plan extends BaseUserRecord {
  title: string;
  description: string;
  steps: PlanStep[];
  projectId?: string;
  status: 'active' | 'completed' | 'archived';
  tags?: string[];
  priority?: 'low' | 'medium' | 'high';
}

export interface PlanStep {
  id: string;
  title: string;
  description?: string;
  status: 'pending' | 'in-progress' | 'completed';
  dueDate?: number;
  completedAt?: number;
  subtasks?: string[];
}

// ============================================================================
// Playlists
// ============================================================================

export interface Playlist extends BaseUserRecord {
  title: string;
  description?: string;
  items: PlaylistItem[];
  projectId?: string;
  tags?: string[];
  isPublic?: boolean;
}

export interface PlaylistItem {
  id: string;
  type: 'video' | 'audio' | 'document' | 'link';
  url: string;
  title: string;
  duration?: number;        // seconds
  completed?: boolean;
  notes?: string;
}

// ============================================================================
// Projects
// ============================================================================

export interface Project extends BaseUserRecord {
  title: string;
  description?: string;
  color?: string;           // Hex color code
  icon?: string;            // Emoji or icon name
  tags?: string[];
  archived?: boolean;
}

// ============================================================================
// Chat History
// ============================================================================

export interface ChatMessage extends BaseUserRecord {
  role: 'user' | 'assistant' | 'system';
  content: string;
  projectId?: string;
  conversationId?: string;  // Group messages into conversations
  metadata?: {
    model?: string;
    tokens?: number;
    duration?: number;
  };
}

// ============================================================================
// Images
// ============================================================================

export interface ImageRecord extends BaseUserRecord {
  blob: Blob;               // Image data
  mimeType: string;         // 'image/jpeg', 'image/png', etc.
  size: number;             // bytes
  source: 'generated' | 'uploaded' | 'scraped';
  sourceUrl?: string;       // If scraped or downloaded
  width?: number;
  height?: number;
  metadata?: Record<string, any>;
}

// ============================================================================
// UI State
// ============================================================================

export interface UIStateRecentTags {
  userId: string;           // PRIMARY KEY
  tags: string[];
  updatedAt: number;
}

export interface UIStateLastActiveChat {
  userId: string;           // PRIMARY KEY
  conversationId: string;
  messageId?: string;
  scrollPosition?: number;
  updatedAt: number;
}

export interface UIStateImageEditor {
  userId: string;           // PRIMARY KEY
  imageId?: string;
  tool?: string;
  history?: any[];          // Undo/redo stack
  updatedAt: number;
}

export interface UIStateScrollPosition {
  userId: string;           // PRIMARY KEY
  positions: Record<string, number>;  // { 'page-key': scrollY }
  updatedAt: number;
}

// ============================================================================
// Sharding Support
// ============================================================================

/**
 * Interface for sharded rows in Google Sheets
 * Used when content exceeds cell limit (~50k chars)
 */
export interface ShardedRow {
  id: string;
  content: string;
  _shardCount?: number;  // Total number of shards (only in first row)
  _shardIndex?: number;  // Current shard index (1-based)
  [key: string]: any;    // Other fields only in first row
}
