// utils.js - Utility functions and global state management

// Reset model selector to a fast/cheap default the user likely has access to
// Preference order:
// 1) groq:llama-3.1-8b-instant (fastest, cheap)
// 2) openai:gpt-4o-mini (fast, cheap)
// 3) first enabled option
function resetModelToFastest() {
    try {
        const select = document.getElementById('model');
        if (!select) return;
        const prefer = ['groq:llama-3.1-8b-instant', 'openai:gpt-4o-mini'];
        for (const val of prefer) {
            const opt = select.querySelector(`option[value="${val}"]`);
            if (opt && !opt.disabled) {
                select.value = val;
                return;
            }
        }
        const firstEnabled = Array.from(select.options).find(o => o.value && !o.disabled);
        if (firstEnabled) select.value = firstEnabled.value;
    } catch (e) {
        console.warn('resetModelToFastest failed:', e);
    }
}

// Global auto-continue timer management variables
let autoContinueTimer = null;
let autoContinueCountdown = null;
const AUTO_CONTINUE_DELAY = 60; // 60 seconds delay

// Global retry state management variables (needed by auto-continue functions)
let currentQueryId = null;
let interruptState = null;
let previousSteps = [];

// Auto-continue timer functions
function startAutoContinueTimer() {
    // Clear any existing timer
    stopAutoContinueTimer();
    
    const continueBtn = document.getElementById('continue-btn');
    if (!continueBtn) return;
    
    let secondsRemaining = AUTO_CONTINUE_DELAY;
    
    // Store original button text
    const originalText = 'Continue';
    
    // Update button text immediately
    continueBtn.textContent = `Continue (${secondsRemaining}s)`;
    
    // Start countdown timer
    autoContinueCountdown = setInterval(() => {
        secondsRemaining--;
        continueBtn.textContent = `Continue (${secondsRemaining}s)`;
        
        if (secondsRemaining <= 0) {
            // Time's up - auto-continue
            stopAutoContinueTimer();
            continueBtn.textContent = originalText;
            
            // Trigger continue action if interrupt state still exists
            if (interruptState) {
                console.log('Auto-continuing after timeout');
                resumeFromInterrupt();
            }
        }
    }, 1000);
    
    // Set main timer to auto-continue
    autoContinueTimer = setTimeout(() => {
        if (interruptState) {
            console.log('Auto-continuing after 60 second delay');
            resumeFromInterrupt();
        }
    }, AUTO_CONTINUE_DELAY * 1000);
}

function stopAutoContinueTimer() {
    // Clear countdown timer
    if (autoContinueCountdown) {
        clearInterval(autoContinueCountdown);
        autoContinueCountdown = null;
    }
    
    // Clear main timer
    if (autoContinueTimer) {
        clearTimeout(autoContinueTimer);
        autoContinueTimer = null;
    }
    
    // Reset button text if it exists
    const continueBtn = document.getElementById('continue-btn');
    if (continueBtn && continueBtn.style.display !== 'none') {
        continueBtn.textContent = 'Continue';
    }
}

// Tool execution tracking
let toolExecutions = [];

function toggleToolsDetails() {
    const content = document.getElementById('expandable-tools-content');
    const icon = document.getElementById('tools-toggle-icon');
    
    if (content && icon) {
        if (content.style.display === 'none') {
            content.style.display = 'block';
            icon.textContent = '▲';
        } else {
            content.style.display = 'none';
            icon.textContent = '▼';
        }
    }
}

function toggleCostDetails() {
    const content = document.getElementById('expandable-cost-content');
    const icon = document.getElementById('cost-toggle-icon');
    
    if (content && icon) {
        if (content.style.display === 'none') {
            content.style.display = 'block';
            icon.textContent = '▲';
        } else {
            content.style.display = 'none';
            icon.textContent = '▼';
        }
    }
}

function addToolExecution(call) {
    const execution = {
        id: call.call_id || `tool_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        name: call.name,
        args: call.args,
        timestamp: new Date().toLocaleTimeString(),
        result: null
    };
    
    toolExecutions.push(execution);
    updateToolsDisplay();
    
    return execution.id;
}

function addToolResult(callId, result) {
    const execution = toolExecutions.find(exec => exec.id === callId);
    if (execution) {
        execution.result = result;
        updateToolsDisplay();
    }
}

function updateToolsDisplay() {
    const section = document.getElementById('expandable-tools-section');
    const content = document.getElementById('expandable-tools-content');
    const badge = document.getElementById('tools-count-badge');
    
    // If DOM elements don't exist yet, just return (they'll be updated later)
    if (!section || !content || !badge) {
        return;
    }
    
    if (toolExecutions.length === 0) {
        section.style.display = 'none';
        return;
    }
    
    section.style.display = 'block';
    badge.textContent = toolExecutions.length;
    
    // Get cost data if available
    const costData = window.__currentCostData;
    
    content.innerHTML = toolExecutions.map((execution, index) => {
        // Find matching cost data for this tool execution
        let toolCost = null;
        if (costData && costData.stepCosts) {
            toolCost = costData.stepCosts.find(step => 
                step.stepName.includes('tool') || 
                step.stepName.toLowerCase().includes(execution.name.toLowerCase())
            );
        }
        
        return `
        <div class="tool-execution" style="border-bottom: 1px solid #dee2e6; padding: 15px;">
            <div onclick="toggleToolDetails(${index})" style="cursor: pointer; display: flex; align-items: center; gap: 8px; font-weight: bold; color: #495057;">
                <span class="tool-toggle-icon">▼</span>
                🔧 ${execution.name}
                <span style="margin-left: auto; font-size: 0.9em; color: #6c757d;">${execution.timestamp}</span>
                ${toolCost ? `<span style="background: #fff3cd; color: #856404; padding: 2px 6px; border-radius: 4px; font-size: 0.8em; margin-left: 8px;">$${toolCost.cost.toFixed(6)}</span>` : ''}
                ${execution.result ? '<span style="color: #28a745;">✅</span>' : '<span style="color: #ffc107;">⏳</span>'}
            </div>
            <div class="tool-details" style="display: none; margin-top: 10px;">
                ${toolCost ? `
                    <div style="margin-bottom: 10px; padding: 10px; background: #fff3cd; border-radius: 4px; border-left: 4px solid #ffc107;">
                        <div style="font-weight: bold; color: #856404; margin-bottom: 4px;">💰 Cost Information</div>
                        <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(120px, 1fr)); gap: 8px; font-size: 0.9em; color: #856404;">
                            <div><strong>Cost:</strong> $${toolCost.cost.toFixed(6)}</div>
                            <div><strong>Model:</strong> ${toolCost.model}</div>
                            <div><strong>Input:</strong> ${toolCost.inputTokens.toLocaleString()} tokens</div>
                            <div><strong>Output:</strong> ${toolCost.outputTokens.toLocaleString()} tokens</div>
                        </div>
                    </div>
                ` : ''}
                ${execution.args && Object.keys(execution.args).length > 0 ? `
                    <div style="margin-bottom: 10px;">
                        <strong>Parameters:</strong>
                        <pre style="background: #f8f9fa; padding: 8px; border-radius: 4px; border: 1px solid #dee2e6; margin-top: 5px; overflow-x: auto; font-size: 0.9em;">${JSON.stringify(execution.args, null, 2)}</pre>
                    </div>
                ` : ''}
                ${execution.result ? `
                    <div>
                        <strong>Result:</strong>
                        <pre style="background: #f8f9fa; padding: 8px; border-radius: 4px; border: 1px solid #dee2e6; margin-top: 5px; overflow-x: auto; font-size: 0.9em; max-height: 200px; overflow-y: auto;">${typeof execution.result === 'string' ? execution.result : JSON.stringify(execution.result, null, 2)}</pre>
                    </div>
                ` : '<div style="color: #6c757d; font-style: italic;">Executing...</div>'}
            </div>
        </div>
        `;
    }).join('');
}

function toggleToolDetails(index) {
    const toolElement = document.querySelectorAll('.tool-execution')[index];
    if (!toolElement) return;
    
    const details = toolElement.querySelector('.tool-details');
    const icon = toolElement.querySelector('.tool-toggle-icon');
    
    if (details && icon) {
        if (details.style.display === 'none') {
            details.style.display = 'block';
            icon.textContent = '▲';
        } else {
            details.style.display = 'none';
            icon.textContent = '▼';
        }
    }
}

function clearToolExecutions() {
    toolExecutions = [];
    updateToolsDisplay();
    // Also clear cost data for new queries
    window.__currentCostData = null;
}

// Display structured response (for non-streaming fallback)
function displayStructuredResponse(result, responseContainer) {
    // Extract response text and metadata
    const responseText = result.response || result.finalText || 'No response available';
    const metadata = result.metadata || {};
    const totalCost = metadata.totalCost || 0;
    const totalTokens = metadata.totalTokens || 0;
    
    // Create the structured response HTML
    responseContainer.className = 'response-container response-success';
    responseContainer.innerHTML = `
        <div id="streaming-response" style="margin-bottom: 16px;">
            <div style="padding: 15px; background: linear-gradient(135deg, #11998e 0%, #38ef7d 100%); color: white; border-radius: 8px; margin-bottom: 10px;">
                <h3 style="margin: 0; display: flex; align-items: center; gap: 8px; justify-content: space-between;">
                    <span style="display: flex; align-items: center; gap: 8px;">
                        <span style="font-size: 1.2em;">✨</span> Final Response
                    </span>
                    ${totalCost > 0 ? `<span style="background: rgba(255,255,255,0.3); padding: 4px 12px; border-radius: 16px; font-size: 0.9em;">
                        💰 $${totalCost.toFixed(6)} | 🔤 ${totalTokens.toLocaleString()} tokens
                    </span>` : ''}
                </h3>
            </div>
            <div id="final-answer" style="padding: 16px; background: #f8f9fa; border-radius: 8px; border-left: 4px solid #28a745; line-height: 1.6; color:#212529;">
                ${responseText}
            </div>
        </div>
        
        <!-- Expandable Tools Section -->
        <div id="expandable-tools-section" style="margin-top: 20px; ${metadata.toolExecutions?.length ? '' : 'display: none;'}">
            <div onclick="toggleToolsDetails()" style="background: linear-gradient(135deg, #6c757d 0%, #495057 100%); color: white; padding: 12px; border-radius: 8px 8px 0 0; cursor: pointer; font-weight: bold; display: flex; align-items: center; gap: 8px;">
                <span id="tools-toggle-icon">▼</span> Tool Executions
                <span id="tools-count-badge" style="background: rgba(255,255,255,0.3); padding: 2px 8px; border-radius: 12px; font-size: 0.9em; margin-left: auto;">
                    ${metadata.toolExecutions?.length || 0}
                </span>
            </div>
            <div id="expandable-tools-content" style="background: #f8f9fa; border: 1px solid #dee2e6; border-top: none; border-radius: 0 0 8px 8px; max-height: 400px; overflow-y: auto; display: none;">
                ${metadata.toolExecutions?.map(tool => `
                    <div style="border-bottom: 1px solid #e9ecef; padding: 12px;">
                        <div style="font-weight: bold; color: #495057; margin-bottom: 4px;">${tool.name}</div>
                        <div style="color: #6c757d; font-size: 0.9em;">${tool.description || 'No description'}</div>
                        ${tool.result ? `<div style="margin-top: 8px; padding: 8px; background: #e9ecef; border-radius: 4px; font-size: 0.9em;">
                            <strong>Result:</strong> ${typeof tool.result === 'string' ? tool.result : JSON.stringify(tool.result)}
                        </div>` : ''}
                    </div>
                `).join('') || '<div style="padding: 12px; color: #6c757d;">No tool executions recorded</div>'}
            </div>
        </div>
        
        <!-- Expandable Cost Section -->
        <div id="expandable-cost-section" style="margin-top: 20px; ${totalCost > 0 ? '' : 'display: none;'}">
            <div onclick="toggleCostDetails()" style="background: linear-gradient(135deg, #ff9a9e 0%, #fecfef 100%); color: white; padding: 12px; border-radius: 8px 8px 0 0; cursor: pointer; font-weight: bold; display: flex; align-items: center; gap: 8px;">
                <span id="cost-toggle-icon">▼</span> Cost & Token Usage
                <span id="cost-badge" style="background: rgba(255,255,255,0.3); padding: 2px 8px; border-radius: 12px; font-size: 0.9em; margin-left: auto;">
                    $${totalCost.toFixed(6)}
                </span>
            </div>
            <div id="expandable-cost-content" style="background: #f8f9fa; border: 1px solid #dee2e6; border-top: none; border-radius: 0 0 8px 8px; padding: 12px; display: none;">
                <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-bottom: 12px;">
                    <div style="text-align: center; padding: 8px; background: white; border-radius: 6px; border: 1px solid #e9ecef;">
                        <div style="font-size: 1.2em; font-weight: bold; color: #28a745;">$${totalCost.toFixed(6)}</div>
                        <div style="font-size: 0.9em; color: #6c757d;">Total Cost</div>
                    </div>
                    <div style="text-align: center; padding: 8px; background: white; border-radius: 6px; border: 1px solid #e9ecef;">
                        <div style="font-size: 1.2em; font-weight: bold; color: #007bff;">${totalTokens.toLocaleString()}</div>
                        <div style="font-size: 0.9em; color: #6c757d;">Total Tokens</div>
                    </div>
                </div>
                ${metadata.costBreakdown?.map(step => `
                    <div style="margin-bottom: 8px; padding: 8px; background: white; border-radius: 4px; border: 1px solid #e9ecef;">
                        <div style="font-weight: bold; font-size: 0.9em; color: #495057;">${step.step}</div>
                        <div style="font-size: 0.8em; color: #6c757d; margin-top: 2px;">
                            Cost: $${(step.cost || 0).toFixed(6)} | 
                            Input: ${(step.inputTokens || 0).toLocaleString()} tokens | 
                            Output: ${(step.outputTokens || 0).toLocaleString()} tokens
                        </div>
                    </div>
                `).join('') || '<div style="color: #6c757d; font-size: 0.9em;">No cost breakdown available</div>'}
            </div>
        </div>
    `;
    
    // Store cost data for header updates
    if (totalCost > 0) {
        window.__currentCostData = {
            totalCost: totalCost,
            totalTokens: totalTokens
        };
    }
}

// Real-time Activity Monitoring Functions
window.realtimeMonitoring = {
    eventCounts: {
        llm: 0,
        tool: 0, 
        search: 0,
        system: 0
    },

    clearAll() {
        // Reset all counters and clear logs
        this.eventCounts = { llm: 0, tool: 0, search: 0, system: 0 };
        this.updateCounts();
        
        const logs = ['llm-activity-log', 'tool-activity-log', 'search-activity-log', 'system-activity-log'];
        logs.forEach(logId => {
            const logElement = document.getElementById(logId);
            if (logElement) {
                logElement.innerHTML = '<div style="color: #666; text-align: center; font-style: italic;">No activity yet...</div>';
            }
        });
    },

    updateCounts() {
        const counts = [
            { id: 'llm-activity-count', count: this.eventCounts.llm },
            { id: 'tool-activity-count', count: this.eventCounts.tool },
            { id: 'search-activity-count', count: this.eventCounts.search },
            { id: 'system-activity-count', count: this.eventCounts.system }
        ];
        
        counts.forEach(({ id, count }) => {
            const element = document.getElementById(id);
            if (element) {
                element.textContent = `${count} event${count !== 1 ? 's' : ''}`;
            }
        });
    },

    addLLMEvent(type, data, timestamp = new Date()) {
        this.eventCounts.llm++;
        this.updateCounts();
        
        const logElement = document.getElementById('llm-activity-log');
        if (!logElement) return;
        
        if (this.eventCounts.llm === 1) {
            logElement.innerHTML = ''; // Clear placeholder
        }
        
        const eventDiv = document.createElement('div');
        eventDiv.style.cssText = 'margin-bottom: 10px; padding: 10px; background: white; border-left: 4px solid #667eea; border-radius: 4px; box-shadow: 0 1px 3px rgba(0,0,0,0.1);';
        
        let eventContent = `
            <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 6px;">
                <div style="font-weight: bold; color: #667eea;">${this.getEventIcon(type)} ${type.toUpperCase()}</div>
                <div style="font-size: 0.85em; color: #666;">${timestamp.toLocaleTimeString()}</div>
            </div>
        `;
        
        if (data.model) eventContent += `<div><strong>Model:</strong> ${data.model}</div>`;
        if (data.query) eventContent += `<div><strong>Query:</strong> ${data.query.substring(0, 100)}${data.query.length > 100 ? '...' : ''}</div>`;
        if (data.tokens) eventContent += `<div><strong>Tokens:</strong> ${data.tokens}</div>`;
        if (data.cost) eventContent += `<div><strong>Cost:</strong> $${data.cost.toFixed(6)}</div>`;
        if (data.response) eventContent += `<div><strong>Response:</strong> ${data.response.substring(0, 150)}${data.response.length > 150 ? '...' : ''}</div>`;
        
        eventDiv.innerHTML = eventContent;
        logElement.appendChild(eventDiv);
        logElement.scrollTop = logElement.scrollHeight;
    },

    addToolEvent(type, data, timestamp = new Date()) {
        this.eventCounts.tool++;
        this.updateCounts();
        
        const logElement = document.getElementById('tool-activity-log');
        if (!logElement) return;
        
        if (this.eventCounts.tool === 1) {
            logElement.innerHTML = ''; // Clear placeholder
        }
        
        const eventDiv = document.createElement('div');
        eventDiv.style.cssText = 'margin-bottom: 10px; padding: 10px; background: white; border-left: 4px solid #11998e; border-radius: 4px; box-shadow: 0 1px 3px rgba(0,0,0,0.1);';
        
        let eventContent = `
            <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 6px;">
                <div style="font-weight: bold; color: #11998e;">${this.getEventIcon(type)} ${type.toUpperCase()}</div>
                <div style="font-size: 0.85em; color: #666;">${timestamp.toLocaleTimeString()}</div>
            </div>
        `;
        
        if (data.name) eventContent += `<div><strong>Tool:</strong> ${data.name}</div>`;
        if (data.call_id) eventContent += `<div><strong>Call ID:</strong> ${data.call_id}</div>`;
        if (data.args) eventContent += `<div><strong>Args:</strong> ${JSON.stringify(data.args).substring(0, 100)}...</div>`;
        if (data.output) eventContent += `<div><strong>Output:</strong> ${data.output.substring(0, 150)}${data.output.length > 150 ? '...' : ''}</div>`;
        
        eventDiv.innerHTML = eventContent;
        logElement.appendChild(eventDiv);
        logElement.scrollTop = logElement.scrollHeight;
    },

    addSearchEvent(type, data, timestamp = new Date()) {
        this.eventCounts.search++;
        this.updateCounts();
        
        const logElement = document.getElementById('search-activity-log');
        if (!logElement) return;
        
        if (this.eventCounts.search === 1) {
            logElement.innerHTML = ''; // Clear placeholder
        }
        
        const eventDiv = document.createElement('div');
        eventDiv.style.cssText = 'margin-bottom: 10px; padding: 10px; background: white; border-left: 4px solid #ff6b6b; border-radius: 4px; box-shadow: 0 1px 3px rgba(0,0,0,0.1);';
        
        let eventContent = `
            <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 6px;">
                <div style="font-weight: bold; color: #ff6b6b;">${this.getEventIcon(type)} ${type.toUpperCase()}</div>
                <div style="font-size: 0.85em; color: #666;">${timestamp.toLocaleTimeString()}</div>
            </div>
        `;
        
        if (data.term) eventContent += `<div><strong>Search Term:</strong> ${data.term}</div>`;
        if (data.resultsCount !== undefined) eventContent += `<div><strong>Results:</strong> ${data.resultsCount}</div>`;
        if (data.iteration !== undefined) eventContent += `<div><strong>Iteration:</strong> ${data.iteration}</div>`;
        
        eventDiv.innerHTML = eventContent;
        logElement.appendChild(eventDiv);
        logElement.scrollTop = logElement.scrollHeight;
    },

    addSystemEvent(type, data, timestamp = new Date()) {
        this.eventCounts.system++;
        this.updateCounts();
        
        const logElement = document.getElementById('system-activity-log');
        if (!logElement) return;
        
        if (this.eventCounts.system === 1) {
            logElement.innerHTML = ''; // Clear placeholder
        }
        
        const eventDiv = document.createElement('div');
        eventDiv.style.cssText = 'margin-bottom: 10px; padding: 10px; background: white; border-left: 4px solid #4facfe; border-radius: 4px; box-shadow: 0 1px 3px rgba(0,0,0,0.1);';
        
        let eventContent = `
            <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 6px;">
                <div style="font-weight: bold; color: #4facfe;">${this.getEventIcon(type)} ${type.toUpperCase()}</div>
                <div style="font-size: 0.85em; color: #666;">${timestamp.toLocaleTimeString()}</div>
            </div>
        `;
        
        if (data.message) eventContent += `<div><strong>Message:</strong> ${data.message}</div>`;
        if (data.status) eventContent += `<div><strong>Status:</strong> ${data.status}</div>`;
        
        eventDiv.innerHTML = eventContent;
        logElement.appendChild(eventDiv);
        logElement.scrollTop = logElement.scrollHeight;
    },

    getEventIcon(type) {
        const icons = {
            'query_start': '🚀',
            'query_end': '✅',
            'tool_start': '🔧',
            'tool_result': '✅',
            'search': '🔍',
            'search_results': '📥',
            'log': '📝',
            'init': '🏁',
            'persona': '👤',
            'step': '📋',
            'decision': '🎯',
            'default': '⚡'
        };
        return icons[type] || icons.default;
    }
};

// Expose utility functions globally
window.resetModelToFastest = resetModelToFastest;
window.startAutoContinueTimer = startAutoContinueTimer;
window.stopAutoContinueTimer = stopAutoContinueTimer;
window.toggleToolsDetails = toggleToolsDetails;
window.toggleCostDetails = toggleCostDetails;
window.addToolExecution = addToolExecution;
window.addToolResult = addToolResult;
window.clearToolExecutions = clearToolExecutions;
window.toggleToolDetails = toggleToolDetails;
window.displayStructuredResponse = displayStructuredResponse;