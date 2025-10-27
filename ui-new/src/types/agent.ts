/**
 * Agent State Management Types
 * 
 * Defines the core types for the concurrent agent manager system
 * that allows multiple chat conversations to run in parallel.
 */

import type { ChatMessage } from '../utils/api';

/**
 * Agent execution status
 */
export type AgentStatus = 'idle' | 'queued' | 'running' | 'paused' | 'completed' | 'error' | 'aborted';

/**
 * Agent execution phase (for running agents)
 */
export type AgentPhase = 'thinking' | 'tool_execution' | 'streaming' | 'waiting';

/**
 * Complete agent state
 */
export interface AgentState {
  // Identity
  id: string;                    // Unique agent ID (UUID)
  chatId: string;                // Associated chat session ID
  
  // Execution State
  status: AgentStatus;
  phase: AgentPhase;
  
  // Messages
  messages: ChatMessage[];       // Full conversation history
  currentInput: string;          // User query being processed
  
  // Progress Tracking
  iterationCount: number;        // Current iteration (for multi-step workflows)
  maxIterations: number;         // Safety limit (default: 10)
  startTime: number;             // Unix timestamp
  lastUpdateTime: number;        // Unix timestamp
  
  // Resource Tracking
  estimatedMemoryUsage: number;  // In MB
  tokenCount: number;            // Total tokens consumed
  toolCallsCount: number;        // Number of tools executed
  
  // Error Recovery
  lastError?: string;            // Error message if failed
  retryCount: number;            // Number of retries attempted
  continueContext?: any;         // Context for recovery/continue
  
  // Metadata
  title: string;                 // Chat title (first user message)
  createdAt: number;             // Unix timestamp
  completedAt?: number;          // Unix timestamp when finished
}

/**
 * Browser memory capacity information
 */
export interface BrowserCapacity {
  totalMemory: number;      // In MB
  usedMemory: number;       // In MB
  availableMemory: number;  // In MB
  jsHeapLimit: number;      // In MB
  isLowMemory: boolean;     // < 20% available
}

/**
 * Agent resource limits
 */
export interface AgentLimits {
  maxConcurrentAgents: number;     // Based on available memory
  maxQueuedAgents: number;          // Hard limit to prevent runaway queueing
  maxIterationsPerAgent: number;    // Prevent infinite loops
  maxMemoryPerAgent: number;        // MB limit per agent
  maxTotalMemory: number;           // Total memory budget for all agents
}

/**
 * Expensive operation check result
 */
export interface ExpensiveOperationCheck {
  isExpensive: boolean;
  reasons: string[];
  estimatedTokens: number;
  estimatedDuration: number; // seconds
  recommendation: 'proceed' | 'warn' | 'block';
}

/**
 * Agent capabilities (can be reduced in low memory situations)
 */
export interface AgentCapabilities {
  enabledTools: string[];
  maxIterations: number;
  streamingEnabled: boolean;
  parallelToolsEnabled: boolean;
}

/**
 * Default agent limits
 */
export const DEFAULT_AGENT_LIMITS: AgentLimits = {
  maxConcurrentAgents: 3,
  maxQueuedAgents: 10,
  maxIterationsPerAgent: 10,
  maxMemoryPerAgent: 200,  // 200MB per agent
  maxTotalMemory: 600      // 600MB total (3 agents × 200MB)
};

/**
 * Memory estimation constants
 */
export const MEMORY_PER_AGENT = 150; // MB (conservative estimate)
export const SAFETY_MARGIN = 0.7;    // Only use 70% of available memory

/**
 * Agent worker message types
 */
export type AgentWorkerMessageType = 
  | 'START_AGENT' 
  | 'PAUSE_AGENT' 
  | 'ABORT_AGENT'
  | 'AGENT_UPDATE'
  | 'AGENT_COMPLETED'
  | 'AGENT_ERROR'
  | 'AGENT_ABORTED'
  | 'AGENT_PAUSED';

/**
 * Agent worker message
 */
export interface AgentWorkerMessage {
  type: AgentWorkerMessageType;
  payload?: {
    agent?: AgentState;
    agentId?: string;
  };
}

/**
 * Helper: Create a new agent state
 */
export function createAgentState(
  chatId: string,
  messages: ChatMessage[],
  currentInput: string,
  title?: string
): AgentState {
  const firstMessage = messages.length > 0 
    ? (typeof messages[0].content === 'string' ? messages[0].content : JSON.stringify(messages[0].content))
    : currentInput;
  
  return {
    id: crypto.randomUUID(),
    chatId,
    status: 'idle',
    phase: 'waiting',
    messages,
    currentInput,
    iterationCount: 0,
    maxIterations: 10,
    startTime: Date.now(),
    lastUpdateTime: Date.now(),
    estimatedMemoryUsage: 0,
    tokenCount: 0,
    toolCallsCount: 0,
    retryCount: 0,
    title: title || firstMessage.slice(0, 50),
    createdAt: Date.now()
  };
}

/**
 * Helper: Estimate agent memory usage
 */
export function estimateAgentMemory(agent: AgentState): number {
  // Base memory overhead
  let memoryMB = 50; // Base: React state, IndexedDB, DOM
  
  // Messages (each message ~5KB on average)
  memoryMB += (agent.messages.length * 5) / 1024;
  
  // Streaming buffer (temporary allocation)
  if (agent.phase === 'streaming') {
    memoryMB += 20; // 20MB buffer for SSE streams
  }
  
  // Tool execution overhead
  memoryMB += agent.toolCallsCount * 10; // 10MB per tool call
  
  return Math.round(memoryMB);
}

/**
 * Helper: Format duration in human-readable format
 */
export function formatDuration(ms: number): string {
  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  
  if (hours > 0) return `${hours}h ${minutes % 60}m`;
  if (minutes > 0) return `${minutes}m ${seconds % 60}s`;
  return `${seconds}s`;
}
