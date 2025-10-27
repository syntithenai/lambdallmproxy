/**
 * Memory Management Utilities
 * 
 * Detects browser memory capacity and calculates safe concurrency limits
 * to prevent browser crashes and memory exhaustion.
 */

import type { 
  BrowserCapacity, 
  AgentLimits, 
  AgentCapabilities,
  AgentState 
} from '../types/agent';
import { 
  DEFAULT_AGENT_LIMITS,
  MEMORY_PER_AGENT,
  SAFETY_MARGIN 
} from '../types/agent';

/**
 * Detect browser memory capacity
 * Uses Performance Memory API (Chrome only, graceful fallback for other browsers)
 */
export function detectBrowserCapacity(): BrowserCapacity {
  // Use Performance Memory API (Chrome only)
  if ('memory' in performance && (performance as any).memory) {
    const mem = (performance as any).memory;
    const totalMemory = mem.jsHeapSizeLimit / (1024 * 1024); // Convert to MB
    const usedMemory = mem.usedJSHeapSize / (1024 * 1024);
    const availableMemory = totalMemory - usedMemory;
    
    return {
      totalMemory,
      usedMemory,
      availableMemory,
      jsHeapLimit: totalMemory,
      isLowMemory: (availableMemory / totalMemory) < 0.2
    };
  }
  
  // Fallback: Conservative estimates for non-Chrome browsers
  return {
    totalMemory: 2048,      // Assume 2GB heap limit
    usedMemory: 512,        // Assume 512MB used
    availableMemory: 1536,  // 1.5GB available
    jsHeapLimit: 2048,
    isLowMemory: false
  };
}

/**
 * Calculate maximum concurrent agents based on available memory
 */
export function calculateMaxConcurrentAgents(capacity: BrowserCapacity): number {
  const maxAgents = Math.floor(
    (capacity.availableMemory * SAFETY_MARGIN) / MEMORY_PER_AGENT
  );
  
  // Clamp between 1-5 agents
  return Math.max(1, Math.min(5, maxAgents));
}

/**
 * Get agent capabilities based on current memory situation
 * Reduces capabilities in low memory mode to prevent crashes
 */
export function getAgentCapabilities(capacity: BrowserCapacity): AgentCapabilities {
  if (capacity.isLowMemory) {
    // Low memory mode - minimal capabilities
    return {
      enabledTools: ['search_web', 'execute_javascript'], // Only essential tools
      maxIterations: 3,
      streamingEnabled: false, // Disable streaming to reduce memory
      parallelToolsEnabled: false // Force sequential execution
    };
  }
  
  if (capacity.availableMemory < 1000) {
    // Medium memory mode
    return {
      enabledTools: ['search_web', 'execute_javascript', 'scrape_web_content'],
      maxIterations: 5,
      streamingEnabled: true,
      parallelToolsEnabled: false // Still sequential
    };
  }
  
  // Full capabilities
  return {
    enabledTools: ['all'], // All tools enabled
    maxIterations: 10,
    streamingEnabled: true,
    parallelToolsEnabled: true
  };
}

/**
 * Enforce agent limits to prevent resource exhaustion
 * Returns true if agent can proceed, false if it should be rejected/queued
 */
export function enforceAgentLimits(
  agent: AgentState,
  limits: AgentLimits,
  runningCount: number,
  queuedCount: number
): { canProceed: boolean; reason?: string } {
  // Check iteration limit
  if (agent.iterationCount >= limits.maxIterationsPerAgent) {
    agent.status = 'error';
    agent.lastError = `Exceeded max iterations (${limits.maxIterationsPerAgent})`;
    return { canProceed: false, reason: agent.lastError };
  }
  
  // Check memory limit
  if (agent.estimatedMemoryUsage > limits.maxMemoryPerAgent) {
    agent.status = 'error';
    agent.lastError = `Exceeded memory limit (${limits.maxMemoryPerAgent}MB)`;
    return { canProceed: false, reason: agent.lastError };
  }
  
  // Check total concurrent agents
  if (runningCount >= limits.maxConcurrentAgents) {
    // Queue instead of run
    return { canProceed: false, reason: 'Max concurrent agents reached - queueing' };
  }
  
  // Check queue limit
  if (queuedCount >= limits.maxQueuedAgents) {
    agent.status = 'error';
    agent.lastError = `Queue full (${limits.maxQueuedAgents} agents)`;
    return { canProceed: false, reason: agent.lastError };
  }
  
  return { canProceed: true };
}

/**
 * Check if operation is potentially expensive and may consume excessive resources
 */
export function checkExpensiveOperation(
  input: string, 
  messages: any[]
): {
  isExpensive: boolean;
  reasons: string[];
  estimatedTokens: number;
  estimatedDuration: number; // seconds
  recommendation: 'proceed' | 'warn' | 'block';
} {
  const reasons: string[] = [];
  let estimatedTokens = 1000; // Base estimate
  let estimatedDuration = 10; // Base 10s
  
  // Check for reasoning chain requests
  if (input.match(/\b(prove|reason|analyze deeply|step-by-step proof)\b/i)) {
    reasons.push('Deep reasoning requested (10-50x tokens)');
    estimatedTokens *= 20;
    estimatedDuration += 30;
  }
  
  // Check for ask_llm tool usage
  if (input.match(/\b(research|investigate|gather information|multi-step)\b/i)) {
    reasons.push('Multi-step research detected (5-10x tokens)');
    estimatedTokens *= 7;
    estimatedDuration += 20;
  }
  
  // Check for web scraping
  if (input.match(/\b(scrape|extract|download|fetch all)\b/i)) {
    reasons.push('Web scraping may consume high memory');
    estimatedTokens += 5000;
    estimatedDuration += 15;
  }
  
  // Check conversation length
  if (messages.length > 20) {
    reasons.push(`Long conversation (${messages.length} messages) increases processing time`);
    estimatedTokens += messages.length * 100;
    estimatedDuration += Math.floor(messages.length / 10);
  }
  
  // Determine recommendation
  let recommendation: 'proceed' | 'warn' | 'block' = 'proceed';
  if (estimatedTokens > 10000 || estimatedDuration > 30) {
    recommendation = 'warn';
  }
  if (estimatedTokens > 50000 || estimatedDuration > 120) {
    recommendation = 'block';
  }
  
  return {
    isExpensive: reasons.length > 0,
    reasons,
    estimatedTokens,
    estimatedDuration,
    recommendation
  };
}

/**
 * Get current agent limits based on browser capacity
 * Dynamically adjusts based on available memory
 */
export function getCurrentAgentLimits(): AgentLimits {
  const capacity = detectBrowserCapacity();
  const maxConcurrent = calculateMaxConcurrentAgents(capacity);
  
  return {
    ...DEFAULT_AGENT_LIMITS,
    maxConcurrentAgents: maxConcurrent
  };
}

/**
 * Monitor memory and return warnings if thresholds exceeded
 */
export function checkMemoryWarnings(capacity: BrowserCapacity): {
  level: 'ok' | 'warning' | 'critical';
  message?: string;
} {
  if (capacity.availableMemory < 200) {
    return {
      level: 'critical',
      message: `Critical: Only ${Math.round(capacity.availableMemory)}MB available. Consider closing tabs or reloading.`
    };
  }
  
  if (capacity.isLowMemory) {
    return {
      level: 'warning',
      message: `Warning: Low memory detected (${Math.round(capacity.availableMemory)}MB available). New agents may be paused.`
    };
  }
  
  return { level: 'ok' };
}
