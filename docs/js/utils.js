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