# Concurrent Agent Manager Plan

## Overview
Design and implement a **multi-agent execution system** that allows users to run multiple chat conversations in parallel while protecting against browser crashes, memory overflow, and computational resource exhaustion. Inspired by the parallel tool execution architecture from `FEATURE_REASONING_CHAIN_TOOL.md`.

**Creation Date**: October 27, 2025

## Problem Statement

### Current Limitation
- Single active chat per tab
- Navigating away from an active chat interrupts agent execution
- No visibility into running agents across tabs
- No recovery mechanism for interrupted agents
- Risk of browser crash with expensive operations

### User Requirements
1. **Tab Navigation Safety**: Protect running agents when switching tabs
2. **Parallel Execution**: Multiple chats operating simultaneously
3. **Agent Manager UI**: View and switch between active agents
4. **Recovery/Continue**: Resume interrupted agents after browser close/crash
5. **Memory Management**: Impose limits based on browser capacity
6. **Risk Mitigation**: Handle computationally expensive operations safely

## Inspiration from Parallel Tool Execution

### Key Lessons from `generate_reasoning_chain`

#### 1. **Promise.all() for Concurrency**
```javascript
// From FEATURE_REASONING_CHAIN_TOOL.md
const toolPromises = toolCalls.map(async (toolCall) => {
  return await callFunction(toolName, toolArgs, context);
});
const toolResults = await Promise.all(toolPromises); // All execute at once
```

**Application to Agents**:
```typescript
// Run multiple agents concurrently
const agentPromises = activeAgents.map(async (agent) => {
  return await executeAgentIteration(agent);
});
const agentResults = await Promise.all(agentPromises);
```

#### 2. **Resource Consumption Warnings**
- **Parallel Tools**: Can cause "MASSIVE token consumption in seconds"
- **Parallel Agents**: Can cause massive browser memory/CPU consumption

**Mitigation Strategy**:
- Limit concurrent agents based on available memory
- Show visual warnings for expensive operations
- Allow user to abort/pause agents

#### 3. **Error Isolation**
```javascript
// Each tool failure doesn't crash the whole reasoning chain
try {
  const toolResult = await callFunction(toolName, toolArgs, context);
  return { success: true, result: toolResult };
} catch (error) {
  return { success: false, error: error.message };
}
```

**Application to Agents**:
- Each agent runs in isolated execution context
- Agent crashes don't affect other agents
- Failed agents can be restarted individually

#### 4. **SSE Progress Events**
- `reasoning_chain_progress` with phases: starting, reasoning, executing_embedded_tools, completed, error

**Application to Agents**:
- `agent_progress` events for each agent
- Show progress indicators in Agent Manager UI
- Real-time status updates (thinking, tool_execution, streaming, waiting)

## Architecture

### 1. Agent State Management

#### Agent State Schema
```typescript
interface AgentState {
  // Identity
  id: string;                    // Unique agent ID (UUID)
  chatId: string;                // Associated chat session ID
  
  // Execution State
  status: 'idle' | 'queued' | 'running' | 'paused' | 'completed' | 'error' | 'aborted';
  phase: 'thinking' | 'tool_execution' | 'streaming' | 'waiting';
  
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
```

#### Storage Strategy
```typescript
// IndexedDB for persistence (survives browser close)
const AGENT_DB_NAME = 'AgentManagerDB';
const AGENT_STORE_NAME = 'agents';

interface AgentDB {
  saveAgent(state: AgentState): Promise<void>;
  getAgent(id: string): Promise<AgentState | null>;
  getAllAgents(): Promise<AgentState[]>;
  getRunningAgents(): Promise<AgentState[]>;
  deleteAgent(id: string): Promise<void>;
  updateAgentStatus(id: string, status: AgentState['status']): Promise<void>;
}

// In-memory queue for active execution
class AgentExecutionQueue {
  private runningAgents: Map<string, AgentState> = new Map();
  private queuedAgents: AgentState[] = [];
  private maxConcurrent: number = 3; // Dynamic based on memory
  
  async enqueue(agent: AgentState): Promise<void> {
    if (this.runningAgents.size < this.maxConcurrent) {
      await this.startAgent(agent);
    } else {
      this.queuedAgents.push(agent);
      agent.status = 'queued';
      await agentDB.saveAgent(agent);
    }
  }
  
  async dequeue(): Promise<void> {
    if (this.queuedAgents.length > 0 && this.runningAgents.size < this.maxConcurrent) {
      const nextAgent = this.queuedAgents.shift()!;
      await this.startAgent(nextAgent);
    }
  }
  
  private async startAgent(agent: AgentState): Promise<void> {
    agent.status = 'running';
    agent.startTime = Date.now();
    this.runningAgents.set(agent.id, agent);
    await agentDB.saveAgent(agent);
    
    // Start background execution
    this.executeAgent(agent).catch(async (error) => {
      agent.status = 'error';
      agent.lastError = error.message;
      await agentDB.saveAgent(agent);
      this.runningAgents.delete(agent.id);
      await this.dequeue(); // Start next queued agent
    });
  }
  
  private async executeAgent(agent: AgentState): Promise<void> {
    // Execute agent iterations until completion
    while (agent.iterationCount < agent.maxIterations && agent.status === 'running') {
      await this.executeAgentIteration(agent);
    }
    
    agent.status = 'completed';
    agent.completedAt = Date.now();
    await agentDB.saveAgent(agent);
    this.runningAgents.delete(agent.id);
    await this.dequeue(); // Start next queued agent
  }
  
  private async executeAgentIteration(agent: AgentState): Promise<void> {
    // Individual iteration logic (call backend /chat endpoint)
    // Update agent state with SSE events
    // Save to IndexedDB after each iteration
  }
}
```

### 2. Browser Memory Management

#### Memory Detection
```typescript
interface BrowserCapacity {
  totalMemory: number;      // In MB
  usedMemory: number;       // In MB
  availableMemory: number;  // In MB
  jsHeapLimit: number;      // In MB
  isLowMemory: boolean;     // < 20% available
}

function detectBrowserCapacity(): BrowserCapacity {
  // Use Performance Memory API (Chrome only, graceful fallback)
  if ('memory' in performance) {
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

function calculateMaxConcurrentAgents(capacity: BrowserCapacity): number {
  const MEMORY_PER_AGENT = 150; // MB (conservative estimate)
  const SAFETY_MARGIN = 0.7;    // Only use 70% of available memory
  
  const maxAgents = Math.floor(
    (capacity.availableMemory * SAFETY_MARGIN) / MEMORY_PER_AGENT
  );
  
  // Clamp between 1-5 agents
  return Math.max(1, Math.min(5, maxAgents));
}

// Periodic memory monitoring
setInterval(() => {
  const capacity = detectBrowserCapacity();
  
  if (capacity.isLowMemory) {
    console.warn('⚠️ Low memory detected:', capacity);
    
    // Pause queued agents
    agentQueue.pauseQueue();
    
    // Show warning to user
    showToast({
      type: 'warning',
      message: 'Low browser memory detected. New agents paused. Consider closing tabs or reloading.'
    });
  }
  
  // Update max concurrent limit dynamically
  const newMaxConcurrent = calculateMaxConcurrentAgents(capacity);
  agentQueue.updateMaxConcurrent(newMaxConcurrent);
}, 10000); // Check every 10 seconds
```

#### Estimated Memory Consumption
```typescript
function estimateAgentMemory(agent: AgentState): number {
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
```

### 3. Agent Manager UI

#### Component Structure
```typescript
// ui-new/src/components/AgentManager.tsx
interface AgentManagerProps {
  onSwitchToAgent: (agentId: string) => void;
  onCreateNewAgent: () => void;
}

export const AgentManager: React.FC<AgentManagerProps> = ({ onSwitchToAgent, onCreateNewAgent }) => {
  const [agents, setAgents] = useState<AgentState[]>([]);
  const [capacity, setCapacity] = useState<BrowserCapacity | null>(null);
  const [selectedAgent, setSelectedAgent] = useState<string | null>(null);
  
  // Load agents on mount
  useEffect(() => {
    loadAgents();
    
    // Update capacity every 5 seconds
    const capacityInterval = setInterval(() => {
      const cap = detectBrowserCapacity();
      setCapacity(cap);
    }, 5000);
    
    return () => clearInterval(capacityInterval);
  }, []);
  
  // Listen for agent updates via SSE or polling
  useEffect(() => {
    const pollInterval = setInterval(loadAgents, 2000); // Poll every 2s
    return () => clearInterval(pollInterval);
  }, []);
  
  const loadAgents = async () => {
    const allAgents = await agentDB.getAllAgents();
    setAgents(allAgents);
  };
  
  const handlePauseAgent = async (agentId: string) => {
    await agentQueue.pauseAgent(agentId);
    await loadAgents();
  };
  
  const handleResumeAgent = async (agentId: string) => {
    await agentQueue.resumeAgent(agentId);
    await loadAgents();
  };
  
  const handleAbortAgent = async (agentId: string) => {
    await agentQueue.abortAgent(agentId);
    await loadAgents();
  };
  
  const handleRetryAgent = async (agentId: string) => {
    const agent = await agentDB.getAgent(agentId);
    if (agent) {
      agent.status = 'queued';
      agent.retryCount += 1;
      agent.lastError = undefined;
      await agentQueue.enqueue(agent);
      await loadAgents();
    }
  };
  
  return (
    <div className="agent-manager">
      {/* Header with capacity indicator */}
      <div className="manager-header">
        <h2>🤖 Agent Manager</h2>
        <button onClick={onCreateNewAgent}>+ New Chat</button>
      </div>
      
      {/* Memory/Capacity Display */}
      {capacity && (
        <div className={`capacity-bar ${capacity.isLowMemory ? 'low-memory' : ''}`}>
          <div className="capacity-label">
            Browser Memory: {capacity.usedMemory.toFixed(0)}MB / {capacity.totalMemory.toFixed(0)}MB
          </div>
          <div className="capacity-visual">
            <div 
              className="capacity-fill" 
              style={{ width: `${(capacity.usedMemory / capacity.totalMemory) * 100}%` }}
            />
          </div>
          {capacity.isLowMemory && (
            <div className="capacity-warning">
              ⚠️ Low memory - New agents paused
            </div>
          )}
        </div>
      )}
      
      {/* Running Agents Section */}
      <div className="agents-section">
        <h3>🏃 Running Agents ({agents.filter(a => a.status === 'running').length})</h3>
        {agents.filter(a => a.status === 'running').map(agent => (
          <AgentCard 
            key={agent.id}
            agent={agent}
            isSelected={selectedAgent === agent.id}
            onSelect={() => {
              setSelectedAgent(agent.id);
              onSwitchToAgent(agent.id);
            }}
            onPause={() => handlePauseAgent(agent.id)}
            onAbort={() => handleAbortAgent(agent.id)}
          />
        ))}
      </div>
      
      {/* Queued Agents Section */}
      <div className="agents-section">
        <h3>⏳ Queued Agents ({agents.filter(a => a.status === 'queued').length})</h3>
        {agents.filter(a => a.status === 'queued').map(agent => (
          <AgentCard 
            key={agent.id}
            agent={agent}
            isSelected={selectedAgent === agent.id}
            onSelect={() => {
              setSelectedAgent(agent.id);
              onSwitchToAgent(agent.id);
            }}
            onAbort={() => handleAbortAgent(agent.id)}
          />
        ))}
      </div>
      
      {/* Completed Agents Section */}
      <div className="agents-section">
        <h3>✅ Completed ({agents.filter(a => a.status === 'completed').length})</h3>
        {agents.filter(a => a.status === 'completed').slice(0, 5).map(agent => (
          <AgentCard 
            key={agent.id}
            agent={agent}
            isSelected={selectedAgent === agent.id}
            onSelect={() => {
              setSelectedAgent(agent.id);
              onSwitchToAgent(agent.id);
            }}
          />
        ))}
      </div>
      
      {/* Error/Aborted Agents Section */}
      {agents.some(a => a.status === 'error' || a.status === 'aborted') && (
        <div className="agents-section">
          <h3>❌ Failed/Aborted ({agents.filter(a => ['error', 'aborted'].includes(a.status)).length})</h3>
          {agents.filter(a => ['error', 'aborted'].includes(a.status)).map(agent => (
            <AgentCard 
              key={agent.id}
              agent={agent}
              isSelected={selectedAgent === agent.id}
              onSelect={() => {
                setSelectedAgent(agent.id);
                onSwitchToAgent(agent.id);
              }}
              onRetry={() => handleRetryAgent(agent.id)}
            />
          ))}
        </div>
      )}
    </div>
  );
};
```

#### Agent Card Component
```typescript
// ui-new/src/components/AgentCard.tsx
interface AgentCardProps {
  agent: AgentState;
  isSelected: boolean;
  onSelect: () => void;
  onPause?: () => void;
  onAbort?: () => void;
  onRetry?: () => void;
}

export const AgentCard: React.FC<AgentCardProps> = ({ agent, isSelected, onSelect, onPause, onAbort, onRetry }) => {
  const elapsedTime = agent.completedAt 
    ? agent.completedAt - agent.startTime 
    : Date.now() - agent.startTime;
  
  const statusIcons = {
    idle: '💤',
    queued: '⏳',
    running: '🏃',
    paused: '⏸️',
    completed: '✅',
    error: '❌',
    aborted: '🛑'
  };
  
  const phaseIcons = {
    thinking: '🤔',
    tool_execution: '🔧',
    streaming: '📝',
    waiting: '⏱️'
  };
  
  return (
    <div 
      className={`agent-card ${agent.status} ${isSelected ? 'selected' : ''}`}
      onClick={onSelect}
    >
      {/* Header */}
      <div className="card-header">
        <span className="status-icon">{statusIcons[agent.status]}</span>
        <span className="title">{agent.title}</span>
        <span className="elapsed-time">{formatDuration(elapsedTime)}</span>
      </div>
      
      {/* Current Phase (for running agents) */}
      {agent.status === 'running' && (
        <div className="card-phase">
          <span className="phase-icon">{phaseIcons[agent.phase]}</span>
          <span className="phase-label">{agent.phase.replace('_', ' ')}</span>
          <span className="iteration">Iteration {agent.iterationCount}/{agent.maxIterations}</span>
        </div>
      )}
      
      {/* Resource Metrics */}
      <div className="card-metrics">
        <div className="metric">
          <span className="label">Memory:</span>
          <span className="value">{agent.estimatedMemoryUsage}MB</span>
        </div>
        <div className="metric">
          <span className="label">Tokens:</span>
          <span className="value">{agent.tokenCount.toLocaleString()}</span>
        </div>
        <div className="metric">
          <span className="label">Tools:</span>
          <span className="value">{agent.toolCallsCount}</span>
        </div>
      </div>
      
      {/* Error Message */}
      {agent.lastError && (
        <div className="card-error">
          ⚠️ {agent.lastError}
        </div>
      )}
      
      {/* Actions */}
      <div className="card-actions">
        {agent.status === 'running' && (
          <>
            {onPause && <button onClick={(e) => { e.stopPropagation(); onPause(); }}>⏸️ Pause</button>}
            {onAbort && <button onClick={(e) => { e.stopPropagation(); onAbort(); }}>🛑 Abort</button>}
          </>
        )}
        {(agent.status === 'error' || agent.status === 'aborted') && (
          <>
            {onRetry && <button onClick={(e) => { e.stopPropagation(); onRetry(); }}>🔄 Retry</button>}
          </>
        )}
      </div>
    </div>
  );
};

function formatDuration(ms: number): string {
  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  
  if (hours > 0) return `${hours}h ${minutes % 60}m`;
  if (minutes > 0) return `${minutes}m ${seconds % 60}s`;
  return `${seconds}s`;
}
```

### 4. Background Execution with Web Workers

#### Why Web Workers?
- **Non-blocking**: Runs in separate thread, won't freeze UI
- **Tab Safety**: Continues execution even when tab is inactive
- **Browser Limits**: Most browsers support 10-20 workers
- **Crash Isolation**: Worker crash doesn't crash main thread

#### Worker Architecture
```typescript
// ui-new/src/workers/agent-worker.ts
// This runs in a separate thread

let currentAgent: AgentState | null = null;
let abortController: AbortController | null = null;

self.addEventListener('message', async (event) => {
  const { type, payload } = event.data;
  
  switch (type) {
    case 'START_AGENT':
      currentAgent = payload.agent;
      await executeAgent(currentAgent);
      break;
      
    case 'PAUSE_AGENT':
      if (abortController) {
        abortController.abort();
      }
      self.postMessage({ type: 'AGENT_PAUSED', agentId: currentAgent?.id });
      break;
      
    case 'ABORT_AGENT':
      if (abortController) {
        abortController.abort();
      }
      if (currentAgent) {
        currentAgent.status = 'aborted';
        self.postMessage({ type: 'AGENT_ABORTED', agentId: currentAgent.id });
      }
      break;
  }
});

async function executeAgent(agent: AgentState) {
  try {
    while (agent.iterationCount < agent.maxIterations && agent.status === 'running') {
      // Create new abort controller for each iteration
      abortController = new AbortController();
      
      // Update phase
      agent.phase = 'thinking';
      self.postMessage({ type: 'AGENT_UPDATE', agent });
      
      // Call backend /chat endpoint
      const response = await fetch('/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: agent.messages,
          stream: true
        }),
        signal: abortController.signal
      });
      
      // Process SSE stream
      const reader = response.body!.getReader();
      const decoder = new TextDecoder();
      
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        
        const chunk = decoder.decode(value);
        const lines = chunk.split('\n');
        
        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const data = JSON.parse(line.slice(6));
            
            // Update agent state based on SSE events
            if (data.event === 'content') {
              agent.phase = 'streaming';
              // Append to last assistant message
            } else if (data.event === 'tool_call') {
              agent.phase = 'tool_execution';
              agent.toolCallsCount++;
            }
            
            // Send updates to main thread
            self.postMessage({ type: 'AGENT_UPDATE', agent });
          }
        }
      }
      
      agent.iterationCount++;
      agent.lastUpdateTime = Date.now();
      self.postMessage({ type: 'AGENT_UPDATE', agent });
    }
    
    // Completion
    agent.status = 'completed';
    agent.completedAt = Date.now();
    self.postMessage({ type: 'AGENT_COMPLETED', agent });
    
  } catch (error: any) {
    if (error.name === 'AbortError') {
      // Paused by user
      agent.status = 'paused';
      self.postMessage({ type: 'AGENT_PAUSED', agent });
    } else {
      // Error
      agent.status = 'error';
      agent.lastError = error.message;
      self.postMessage({ type: 'AGENT_ERROR', agent });
    }
  }
}
```

#### Main Thread Integration
```typescript
// ui-new/src/hooks/useAgentWorker.ts
import AgentWorkerUrl from '../workers/agent-worker.ts?worker&url';

interface AgentWorkerManager {
  workers: Map<string, Worker>;
  maxWorkers: number;
  
  startAgent(agent: AgentState): void;
  pauseAgent(agentId: string): void;
  abortAgent(agentId: string): void;
  cleanup(): void;
}

export function useAgentWorker(): AgentWorkerManager {
  const [workers] = useState(new Map<string, Worker>());
  const maxWorkers = 5; // Max concurrent workers
  
  const startAgent = useCallback((agent: AgentState) => {
    if (workers.size >= maxWorkers) {
      throw new Error('Max concurrent workers reached. Please queue agent.');
    }
    
    // Create worker
    const worker = new Worker(AgentWorkerUrl, { type: 'module' });
    
    // Listen for worker messages
    worker.addEventListener('message', (event) => {
      const { type, agent: updatedAgent, agentId } = event.data;
      
      switch (type) {
        case 'AGENT_UPDATE':
          // Update IndexedDB
          agentDB.saveAgent(updatedAgent);
          // Emit event for UI update
          window.dispatchEvent(new CustomEvent('agent-update', { detail: updatedAgent }));
          break;
          
        case 'AGENT_COMPLETED':
          agentDB.saveAgent(updatedAgent);
          workers.delete(agentId);
          worker.terminate();
          window.dispatchEvent(new CustomEvent('agent-completed', { detail: updatedAgent }));
          break;
          
        case 'AGENT_ERROR':
        case 'AGENT_ABORTED':
        case 'AGENT_PAUSED':
          agentDB.saveAgent(updatedAgent);
          workers.delete(agentId);
          worker.terminate();
          window.dispatchEvent(new CustomEvent(`agent-${type.toLowerCase()}`, { detail: updatedAgent }));
          break;
      }
    });
    
    // Start agent execution
    worker.postMessage({ type: 'START_AGENT', payload: { agent } });
    workers.set(agent.id, worker);
    
  }, [workers, maxWorkers]);
  
  const pauseAgent = useCallback((agentId: string) => {
    const worker = workers.get(agentId);
    if (worker) {
      worker.postMessage({ type: 'PAUSE_AGENT' });
    }
  }, [workers]);
  
  const abortAgent = useCallback((agentId: string) => {
    const worker = workers.get(agentId);
    if (worker) {
      worker.postMessage({ type: 'ABORT_AGENT' });
    }
  }, [workers]);
  
  const cleanup = useCallback(() => {
    workers.forEach(worker => worker.terminate());
    workers.clear();
  }, [workers]);
  
  // Cleanup on unmount
  useEffect(() => {
    return cleanup;
  }, [cleanup]);
  
  return { workers, maxWorkers, startAgent, pauseAgent, abortAgent, cleanup };
}
```

### 5. Recovery and Continuation

#### State Persistence Strategy
```typescript
// Persist agent state after every significant event
async function persistAgentState(agent: AgentState) {
  await agentDB.saveAgent(agent);
  
  // Also save to localStorage as backup (faster access on page load)
  localStorage.setItem(`agent_backup_${agent.id}`, JSON.stringify({
    id: agent.id,
    chatId: agent.chatId,
    status: agent.status,
    lastUpdateTime: agent.lastUpdateTime
  }));
}

// On page load/reload
async function recoverAgents() {
  // Get all agents from IndexedDB
  const allAgents = await agentDB.getAllAgents();
  
  // Find interrupted agents (status was 'running' but page closed)
  const interruptedAgents = allAgents.filter(agent => 
    agent.status === 'running' && 
    (Date.now() - agent.lastUpdateTime > 30000) // No update in 30s = interrupted
  );
  
  if (interruptedAgents.length > 0) {
    // Show recovery dialog
    showRecoveryDialog({
      agents: interruptedAgents,
      onRecover: async (agentIds: string[]) => {
        for (const agentId of agentIds) {
          const agent = await agentDB.getAgent(agentId);
          if (agent) {
            agent.status = 'queued';
            agent.retryCount += 1;
            await agentQueue.enqueue(agent);
          }
        }
      },
      onDiscard: async (agentIds: string[]) => {
        for (const agentId of agentIds) {
          await agentDB.updateAgentStatus(agentId, 'aborted');
        }
      }
    });
  }
}

// Call on app initialization
useEffect(() => {
  recoverAgents();
}, []);
```

#### Recovery Dialog Component
```typescript
// ui-new/src/components/RecoveryDialog.tsx
interface RecoveryDialogProps {
  agents: AgentState[];
  onRecover: (agentIds: string[]) => void;
  onDiscard: (agentIds: string[]) => void;
}

export const RecoveryDialog: React.FC<RecoveryDialogProps> = ({ agents, onRecover, onDiscard }) => {
  const [selectedAgents, setSelectedAgents] = useState<Set<string>>(
    new Set(agents.map(a => a.id)) // Select all by default
  );
  
  return (
    <div className="recovery-dialog-overlay">
      <div className="recovery-dialog">
        <h2>🔄 Recover Interrupted Agents</h2>
        <p>The following agents were interrupted when you closed the browser:</p>
        
        <div className="agent-list">
          {agents.map(agent => (
            <div key={agent.id} className="recovery-agent-card">
              <input 
                type="checkbox"
                checked={selectedAgents.has(agent.id)}
                onChange={(e) => {
                  const newSet = new Set(selectedAgents);
                  if (e.target.checked) {
                    newSet.add(agent.id);
                  } else {
                    newSet.delete(agent.id);
                  }
                  setSelectedAgents(newSet);
                }}
              />
              <div className="agent-info">
                <div className="title">{agent.title}</div>
                <div className="meta">
                  Iteration {agent.iterationCount}/{agent.maxIterations} • 
                  {agent.messages.length} messages • 
                  {formatDuration(Date.now() - agent.startTime)} ago
                </div>
              </div>
            </div>
          ))}
        </div>
        
        <div className="dialog-actions">
          <button 
            onClick={() => onRecover(Array.from(selectedAgents))}
            className="btn-primary"
          >
            🔄 Recover Selected ({selectedAgents.size})
          </button>
          <button 
            onClick={() => onDiscard(Array.from(selectedAgents))}
            className="btn-secondary"
          >
            🗑️ Discard Selected
          </button>
          <button 
            onClick={() => {
              onDiscard(agents.map(a => a.id));
            }}
            className="btn-tertiary"
          >
            Discard All
          </button>
        </div>
      </div>
    </div>
  );
};
```

### 6. Risk Mitigation Strategies

#### 1. **Concurrent Agent Limits**
```typescript
interface AgentLimits {
  maxConcurrentAgents: number;     // Based on available memory
  maxQueuedAgents: number;          // Hard limit to prevent runaway queueing
  maxIterationsPerAgent: number;    // Prevent infinite loops
  maxMemoryPerAgent: number;        // MB limit per agent
  maxTotalMemory: number;           // Total memory budget for all agents
}

const DEFAULT_LIMITS: AgentLimits = {
  maxConcurrentAgents: 3,
  maxQueuedAgents: 10,
  maxIterationsPerAgent: 10,
  maxMemoryPerAgent: 200,  // 200MB per agent
  maxTotalMemory: 600      // 600MB total (3 agents × 200MB)
};

function enforceAgentLimits(agent: AgentState, limits: AgentLimits): boolean {
  // Check iteration limit
  if (agent.iterationCount >= limits.maxIterationsPerAgent) {
    agent.status = 'error';
    agent.lastError = `Exceeded max iterations (${limits.maxIterationsPerAgent})`;
    return false;
  }
  
  // Check memory limit
  if (agent.estimatedMemoryUsage > limits.maxMemoryPerAgent) {
    agent.status = 'error';
    agent.lastError = `Exceeded memory limit (${limits.maxMemoryPerAgent}MB)`;
    return false;
  }
  
  // Check total concurrent agents
  if (agentQueue.runningAgents.size >= limits.maxConcurrentAgents) {
    agent.status = 'queued';
    return false; // Queue instead of run
  }
  
  // Check queue limit
  if (agentQueue.queuedAgents.length >= limits.maxQueuedAgents) {
    agent.status = 'error';
    agent.lastError = `Queue full (${limits.maxQueuedAgents} agents)`;
    return false;
  }
  
  return true;
}
```

#### 2. **Expensive Operation Warnings**
```typescript
// Detect potentially expensive operations before execution
interface ExpensiveOperationCheck {
  isExpensive: boolean;
  reasons: string[];
  estimatedTokens: number;
  estimatedDuration: number; // seconds
  recommendation: 'proceed' | 'warn' | 'block';
}

function checkExpensiveOperation(input: string, messages: ChatMessage[]): ExpensiveOperationCheck {
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

// Show warning dialog before starting expensive agent
async function confirmExpensiveOperation(check: ExpensiveOperationCheck): Promise<boolean> {
  if (check.recommendation === 'proceed') return true;
  
  return new Promise((resolve) => {
    showDialog({
      title: '⚠️ Potentially Expensive Operation',
      content: (
        <div>
          <p>This request may consume significant resources:</p>
          <ul>
            {check.reasons.map((reason, i) => (
              <li key={i}>{reason}</li>
            ))}
          </ul>
          <div className="estimates">
            <div>Estimated tokens: <strong>{check.estimatedTokens.toLocaleString()}</strong></div>
            <div>Estimated duration: <strong>{check.estimatedDuration}s</strong></div>
          </div>
          {check.recommendation === 'block' && (
            <div className="block-warning">
              ⛔ This operation is NOT recommended. Consider simplifying your request.
            </div>
          )}
        </div>
      ),
      actions: [
        { label: 'Cancel', onClick: () => resolve(false) },
        { label: 'Proceed Anyway', onClick: () => resolve(true), danger: true }
      ]
    });
  });
}
```

#### 3. **Graceful Degradation**
```typescript
// Reduce agent capabilities when resources are limited
function getAgentCapabilities(capacity: BrowserCapacity): {
  enabledTools: string[];
  maxIterations: number;
  streamingEnabled: boolean;
  parallelToolsEnabled: boolean;
} {
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
```

#### 4. **Auto-Abort on Critical Errors**
```typescript
// Monitor agent health and auto-abort if critical issues detected
class AgentHealthMonitor {
  private healthCheckInterval: NodeJS.Timeout | null = null;
  
  startMonitoring(agentId: string) {
    this.healthCheckInterval = setInterval(async () => {
      const agent = await agentDB.getAgent(agentId);
      if (!agent || agent.status !== 'running') {
        this.stopMonitoring();
        return;
      }
      
      const capacity = detectBrowserCapacity();
      
      // Critical memory situation
      if (capacity.availableMemory < 200) { // Less than 200MB available
        console.error('⛔ Critical memory situation - aborting agent:', agentId);
        await agentQueue.abortAgent(agentId);
        showToast({
          type: 'error',
          message: 'Agent aborted due to critical memory shortage'
        });
        this.stopMonitoring();
        return;
      }
      
      // Agent stuck (no update in 2 minutes)
      if (Date.now() - agent.lastUpdateTime > 120000) {
        console.error('⛔ Agent appears stuck - aborting:', agentId);
        await agentQueue.abortAgent(agentId);
        showToast({
          type: 'error',
          message: 'Agent aborted - no response for 2 minutes'
        });
        this.stopMonitoring();
        return;
      }
      
    }, 10000); // Check every 10 seconds
  }
  
  stopMonitoring() {
    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
      this.healthCheckInterval = null;
    }
  }
}
```

### 7. Tab Navigation Safety

#### Strategy: Background Execution + State Sync

```typescript
// ui-new/src/App.tsx - Root level agent management
export function App() {
  const agentWorker = useAgentWorker();
  const [currentTab, setCurrentTab] = useState<'chat' | 'planning' | 'swag'>('chat');
  const [activeAgents, setActiveAgents] = useState<AgentState[]>([]);
  
  // Load active agents on mount
  useEffect(() => {
    loadActiveAgents();
    
    // Listen for agent updates from workers
    const handleAgentUpdate = (event: CustomEvent) => {
      loadActiveAgents(); // Refresh agent list
    };
    
    window.addEventListener('agent-update', handleAgentUpdate as EventListener);
    window.addEventListener('agent-completed', handleAgentUpdate as EventListener);
    window.addEventListener('agent-error', handleAgentUpdate as EventListener);
    
    return () => {
      window.removeEventListener('agent-update', handleAgentUpdate as EventListener);
      window.removeEventListener('agent-completed', handleAgentUpdate as EventListener);
      window.removeEventListener('agent-error', handleAgentUpdate as EventListener);
    };
  }, []);
  
  async function loadActiveAgents() {
    const agents = await agentDB.getRunningAgents();
    setActiveAgents(agents);
  }
  
  return (
    <div className="app">
      {/* Global agent status indicator */}
      {activeAgents.length > 0 && (
        <div className="global-agent-indicator">
          <span className="indicator-icon">🤖</span>
          <span className="indicator-text">
            {activeAgents.length} agent{activeAgents.length > 1 ? 's' : ''} running
          </span>
          <button onClick={() => setShowAgentManager(true)}>
            View
          </button>
        </div>
      )}
      
      {/* Tab Navigation */}
      <TabNavigation currentTab={currentTab} onTabChange={setCurrentTab} />
      
      {/* Tab Content */}
      {currentTab === 'chat' && <ChatTab agentWorker={agentWorker} />}
      {currentTab === 'planning' && <PlanningTab />}
      {currentTab === 'swag' && <SwagTab />}
      
      {/* Agent Manager Modal */}
      {showAgentManager && (
        <AgentManager 
          onSwitchToAgent={(agentId) => {
            setCurrentTab('chat');
            // Load chat associated with agent
            loadChatForAgent(agentId);
          }}
          onCreateNewAgent={() => {
            setCurrentTab('chat');
            // Create new chat
          }}
        />
      )}
    </div>
  );
}
```

**Key Protection Mechanisms**:
1. **Web Workers**: Agents run in background threads, unaffected by tab switches
2. **IndexedDB Persistence**: State saved continuously, survives page reloads
3. **Global Indicator**: Always visible agent status regardless of active tab
4. **Event-Driven Updates**: Workers emit events, UI listens and updates
5. **Graceful Shutdown**: Cleanup on tab close, but state persisted for recovery

## Implementation Timeline

### Phase 1: Foundation (Week 1)
**Goal**: Basic agent state management and storage

- [ ] Create `AgentState` interface and types
- [ ] Implement `AgentDB` with IndexedDB
- [ ] Create `AgentExecutionQueue` class
- [ ] Build basic `AgentCard` component
- [ ] Implement memory detection (`detectBrowserCapacity`)
- [ ] Add agent limit calculation (`calculateMaxConcurrentAgents`)

**Deliverables**:
- `ui-new/src/types/agent.ts` - Type definitions
- `ui-new/src/utils/agentDB.ts` - IndexedDB wrapper
- `ui-new/src/utils/agentQueue.ts` - Queue manager
- `ui-new/src/components/AgentCard.tsx` - Card component

### Phase 2: Agent Manager UI (Week 2)
**Goal**: Visual interface for managing agents

- [ ] Build `AgentManager` component with sections (running, queued, completed, failed)
- [ ] Implement capacity/memory visualization
- [ ] Add agent action buttons (pause, abort, retry)
- [ ] Create agent selection and switching
- [ ] Style agent cards with status indicators
- [ ] Add real-time updates (polling or event-driven)

**Deliverables**:
- `ui-new/src/components/AgentManager.tsx` - Main manager component
- `ui-new/src/styles/agent-manager.css` - Styles
- Integration with `App.tsx` for global access

### Phase 3: Web Worker Execution (Week 3)
**Goal**: Background agent execution

- [ ] Create `agent-worker.ts` Web Worker
- [ ] Implement worker message protocol (START, PAUSE, ABORT)
- [ ] Build `useAgentWorker` hook for worker management
- [ ] Add SSE stream processing in worker
- [ ] Implement worker-to-main-thread communication
- [ ] Add error handling and isolation

**Deliverables**:
- `ui-new/src/workers/agent-worker.ts` - Worker implementation
- `ui-new/src/hooks/useAgentWorker.ts` - Worker hook
- Worker integration in `ChatTab.tsx`

### Phase 4: Recovery & Persistence (Week 4)
**Goal**: Survive browser close and crashes

- [ ] Implement `persistAgentState` function
- [ ] Create `recoverAgents` on page load
- [ ] Build `RecoveryDialog` component
- [ ] Add localStorage backup strategy
- [ ] Implement state sync between worker and IndexedDB
- [ ] Test recovery scenarios (crash, close, refresh)

**Deliverables**:
- `ui-new/src/components/RecoveryDialog.tsx` - Recovery UI
- `ui-new/src/utils/agentRecovery.ts` - Recovery logic
- Integration in `App.tsx` initialization

### Phase 5: Risk Mitigation (Week 5)
**Goal**: Prevent browser crashes and resource exhaustion

- [ ] Implement `checkExpensiveOperation` function
- [ ] Create expense warning dialog
- [ ] Add `enforceAgentLimits` validation
- [ ] Build `AgentHealthMonitor` class
- [ ] Implement graceful degradation (`getAgentCapabilities`)
- [ ] Add auto-abort on critical errors
- [ ] Create memory monitoring loop

**Deliverables**:
- `ui-new/src/utils/agentLimits.ts` - Limit enforcement
- `ui-new/src/utils/agentHealthMonitor.ts` - Health monitoring
- `ui-new/src/components/ExpenseWarningDialog.tsx` - Warning UI

### Phase 6: Tab Safety & Integration (Week 6)
**Goal**: Seamless navigation between tabs

- [ ] Add global agent status indicator in `App.tsx`
- [ ] Implement event-driven agent updates
- [ ] Create tab-agnostic agent access
- [ ] Add "switch to agent" navigation
- [ ] Integrate with existing ChatTab
- [ ] Test multi-tab scenarios
- [ ] Add keyboard shortcuts (e.g., Ctrl+Shift+A for Agent Manager)

**Deliverables**:
- Global agent indicator component
- Event system for cross-component updates
- Full integration testing

### Phase 7: Testing & Polish (Week 7)
**Goal**: Production-ready stability

- [ ] Unit tests for `AgentDB`, `AgentQueue`
- [ ] Integration tests for worker communication
- [ ] Stress testing (10+ concurrent agents)
- [ ] Memory leak detection
- [ ] Browser compatibility (Chrome, Firefox, Safari)
- [ ] Performance optimization
- [ ] Documentation and user guide

**Deliverables**:
- Test suite in `ui-new/src/__tests__/agent/`
- Performance benchmarks
- User documentation

## Testing Plan

### Unit Tests
```typescript
// ui-new/src/__tests__/agent/agentDB.test.ts
describe('AgentDB', () => {
  it('should save and retrieve agent state', async () => {
    const agent: AgentState = createMockAgent();
    await agentDB.saveAgent(agent);
    const retrieved = await agentDB.getAgent(agent.id);
    expect(retrieved).toEqual(agent);
  });
  
  it('should get running agents only', async () => {
    await agentDB.saveAgent(createMockAgent({ status: 'running' }));
    await agentDB.saveAgent(createMockAgent({ status: 'completed' }));
    const running = await agentDB.getRunningAgents();
    expect(running.length).toBe(1);
    expect(running[0].status).toBe('running');
  });
});

// ui-new/src/__tests__/agent/agentQueue.test.ts
describe('AgentExecutionQueue', () => {
  it('should respect max concurrent limit', async () => {
    const queue = new AgentExecutionQueue({ maxConcurrent: 2 });
    await queue.enqueue(createMockAgent());
    await queue.enqueue(createMockAgent());
    await queue.enqueue(createMockAgent());
    
    expect(queue.runningAgents.size).toBe(2);
    expect(queue.queuedAgents.length).toBe(1);
  });
  
  it('should dequeue when agent completes', async () => {
    const queue = new AgentExecutionQueue({ maxConcurrent: 1 });
    const agent1 = createMockAgent();
    const agent2 = createMockAgent();
    
    await queue.enqueue(agent1);
    await queue.enqueue(agent2);
    
    expect(queue.queuedAgents.length).toBe(1);
    
    await queue.completeAgent(agent1.id);
    
    expect(queue.runningAgents.size).toBe(1);
    expect(queue.queuedAgents.length).toBe(0);
  });
});

// ui-new/src/__tests__/agent/memoryManagement.test.ts
describe('Memory Management', () => {
  it('should calculate max concurrent agents based on available memory', () => {
    const capacity: BrowserCapacity = {
      totalMemory: 2048,
      usedMemory: 500,
      availableMemory: 1548,
      jsHeapLimit: 2048,
      isLowMemory: false
    };
    
    const maxAgents = calculateMaxConcurrentAgents(capacity);
    expect(maxAgents).toBe(5); // (1548 * 0.7) / 150 ≈ 7.2, clamped to 5
  });
  
  it('should reduce capabilities in low memory mode', () => {
    const capacity: BrowserCapacity = {
      totalMemory: 2048,
      usedMemory: 1900,
      availableMemory: 148,
      jsHeapLimit: 2048,
      isLowMemory: true
    };
    
    const capabilities = getAgentCapabilities(capacity);
    expect(capabilities.enabledTools.length).toBeLessThan(10);
    expect(capabilities.maxIterations).toBeLessThan(10);
    expect(capabilities.parallelToolsEnabled).toBe(false);
  });
});
```

### Integration Tests
```typescript
// ui-new/src/__tests__/agent/workerIntegration.test.ts
describe('Web Worker Integration', () => {
  it('should execute agent in worker and update main thread', async () => {
    const agent = createMockAgent();
    const updates: AgentState[] = [];
    
    window.addEventListener('agent-update', (e: CustomEvent) => {
      updates.push(e.detail);
    });
    
    const { startAgent } = useAgentWorker();
    startAgent(agent);
    
    await waitFor(() => updates.length > 0);
    
    expect(updates[0].status).toBe('running');
  });
  
  it('should handle worker crash gracefully', async () => {
    const agent = createMockAgent();
    const { startAgent } = useAgentWorker();
    
    // Simulate worker crash
    startAgent(agent);
    // ... trigger crash scenario
    
    const retrieved = await agentDB.getAgent(agent.id);
    expect(retrieved?.status).toBe('error');
  });
});
```

### Manual Testing Scenarios

#### Scenario 1: Basic Concurrent Execution
1. Open application
2. Start 3 chat agents with different queries
3. Verify all 3 run concurrently
4. Check Agent Manager shows all 3 as "running"
5. Monitor memory usage (should stay under limits)
6. Wait for completion
7. Verify all 3 completed successfully

#### Scenario 2: Queue Management
1. Set max concurrent agents to 2
2. Start 5 agents
3. Verify only 2 running, 3 queued
4. Wait for 1 agent to complete
5. Verify 1 agent dequeued automatically
6. Abort 1 running agent
7. Verify another agent dequeued

#### Scenario 3: Tab Navigation Safety
1. Start agent in chat tab
2. Switch to planning tab
3. Verify agent continues (check logs/network)
4. Switch back to chat tab
5. Verify agent state preserved
6. Check global indicator shows running agent on all tabs

#### Scenario 4: Browser Close Recovery
1. Start 2 agents
2. Close browser (don't wait for completion)
3. Reopen application
4. Verify recovery dialog appears
5. Select "Recover Selected"
6. Verify agents restart from last state
7. Check iteration count incremented

#### Scenario 5: Memory Exhaustion
1. Reduce available memory (open many tabs)
2. Start agents until queue limit reached
3. Verify new agents rejected with error
4. Close other tabs to free memory
5. Verify queue resumes automatically
6. Check no browser crash occurred

#### Scenario 6: Expensive Operation Warning
1. Enter expensive query (e.g., "Prove Fermat's Last Theorem step-by-step")
2. Click submit
3. Verify warning dialog appears
4. Check estimated tokens/duration shown
5. Click "Cancel" → agent not started
6. Resubmit and click "Proceed Anyway" → agent starts

## Security Considerations

### 1. **Cross-Origin Isolation**
- Web Workers require proper CORS headers
- Backend must serve workers with `Access-Control-Allow-Origin`
- IndexedDB is origin-scoped (no cross-site access)

### 2. **Resource Quotas**
- IndexedDB quota: ~50% of available disk space (varies by browser)
- Monitor quota usage: `navigator.storage.estimate()`
- Implement quota exhaustion handling

### 3. **Sensitive Data in Workers**
- API keys/tokens should NOT be stored in agent state
- Use secure token retrieval (same as current implementation)
- Workers can access `localStorage` but shouldn't store secrets

### 4. **Denial of Service Prevention**
- Hard limits on queue size (prevent runaway agent creation)
- Iteration limits per agent (prevent infinite loops)
- Auto-abort agents stuck for >2 minutes
- Rate limiting on agent creation (max 1 new agent per 5 seconds)

## User Documentation

### Quick Start Guide

**What is the Agent Manager?**
The Agent Manager allows you to run multiple AI chat conversations simultaneously in the background, even when you navigate to other tabs. Think of it as task manager for your AI agents.

**How to Use**:
1. Click the 🤖 icon in the top-right corner to open Agent Manager
2. Start a new chat - it automatically becomes a background agent
3. Switch tabs freely - your agent keeps working
4. Check Agent Manager to see progress
5. Click any agent card to view that conversation

**Agent Status**:
- 🏃 **Running**: Actively processing your request
- ⏳ **Queued**: Waiting for available resources
- ✅ **Completed**: Finished successfully
- ❌ **Error**: Failed (click "Retry" to try again)
- 🛑 **Aborted**: You stopped it manually

**Memory Management**:
The system automatically limits concurrent agents based on available browser memory. If you see "Low memory - New agents paused", try:
- Close other browser tabs
- Wait for running agents to complete
- Reload the page

**Recovery**:
If you close the browser while agents are running, they'll automatically offer to resume when you return.

## Comparison to Current System

| Feature | Current | With Agent Manager |
|---------|---------|-------------------|
| **Concurrent Chats** | 1 active | 3-5 concurrent |
| **Tab Navigation** | Interrupts agent | Continues in background |
| **Browser Close** | Loses progress | Recovers on reopen |
| **Memory Safety** | No limits | Dynamic limits + warnings |
| **Visibility** | Single chat view | Multi-agent dashboard |
| **Resource Warnings** | None | Expense detection + prompts |
| **Error Recovery** | Manual retry | Auto-recovery dialog |
| **Background Execution** | No | Yes (Web Workers) |

## Future Enhancements

### Priority 1: Advanced Scheduling
- Time-based agent execution (schedule for later)
- Recurring agents (daily summaries, weekly reports)
- Conditional triggers (execute when condition met)

### Priority 2: Agent Templates
- Pre-configured agent patterns (researcher, coder, analyst)
- Custom agent profiles with saved settings
- Agent cloning (duplicate successful agents)

### Priority 3: Collaboration Features
- Share running agents with other users
- Multi-user agent monitoring
- Agent result export/import

### Priority 4: Advanced Monitoring
- Token consumption graphs over time
- Memory usage trends
- Performance analytics dashboard
- Cost tracking per agent

### Priority 5: Agent Orchestration
- Parent-child agent relationships
- Agent pipelines (output of A → input of B)
- Parallel agent synchronization
- Agent result aggregation

## Related Documentation
- **Parallel Tool Execution**: `developer_logs/FEATURE_REASONING_CHAIN_TOOL.md` (inspiration for concurrency architecture)
- **Chat History**: `developer_logs/INDEXEDDB_CHAT_HISTORY.md` (IndexedDB persistence patterns)
- **Lambda Concurrency**: `developer_logs/LAMBDA_CONCURRENCY_ISSUE.md` (backend concurrency limits)
- **React StrictMode**: `developer_logs/STRICT_MODE_ISSUE.md` (multiple invocation handling)
- **Background Sync**: `ui-new/src/hooks/useBackgroundSync.ts` (background task patterns)

## Conclusion

The Concurrent Agent Manager transforms the single-chat limitation into a **multi-agent orchestration system** that protects users from:
1. ❌ Lost progress when navigating tabs
2. ❌ Browser crashes from resource exhaustion
3. ❌ Inability to multitask across chats
4. ❌ No visibility into running operations

By leveraging lessons from the **parallel tool execution** architecture (Promise.all concurrency, error isolation, resource warnings), combined with **Web Workers** for background execution and **IndexedDB** for persistence, users can safely run 3-5 concurrent agents with:
- ✅ Tab navigation safety
- ✅ Automatic recovery after browser close
- ✅ Dynamic resource limits based on browser capacity
- ✅ Proactive warnings for expensive operations
- ✅ Visual dashboard for agent monitoring

The 7-week implementation timeline provides a phased approach from foundation to production-ready, with comprehensive testing and polish.
