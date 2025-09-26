// utils.js - Utility functions for tool execution tracking and UI management

// Tool execution tracking
let toolExecutions = [];

function toggleToolsDetails() {
    const content = document.getElementById('expandable-tools-content');
    const icon = document.getElementById('tools-toggle-icon');
    
    if (content.style.display === 'none') {
        content.style.display = 'block';
        icon.textContent = '▲';
    } else {
        content.style.display = 'none';
        icon.textContent = '▼';
    }
}

function toggleCostDetails() {
    const content = document.getElementById('expandable-cost-content');
    const icon = document.getElementById('cost-toggle-icon');
    
    if (content.style.display === 'none') {
        content.style.display = 'block';
        icon.textContent = '▲';
    } else {
        content.style.display = 'none';
        icon.textContent = '▼';
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
        let stepCost = null;
        if (costData && costData.stepCosts) {
            stepCost = costData.stepCosts.find(step => 
                step.stepName && step.stepName.toLowerCase().includes(execution.name.toLowerCase())
            );
        }
        
        const resultText = execution.result ? 
            (typeof execution.result === 'string' ? execution.result : JSON.stringify(execution.result, null, 2)) 
            : 'Executing...';
        
        const statusColor = execution.result ? '#28a745' : '#6c757d';
        const statusIcon = execution.result ? '✓' : '⏳';
        
        return `
            <div style="border-bottom: 1px solid #dee2e6; padding: 12px;">
                <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 8px;">
                    <span style="color: ${statusColor}; font-weight: bold;">${statusIcon}</span>
                    <span style="font-weight: bold; color: #495057;">${execution.name}</span>
                    <span style="color: #6c757d; font-size: 0.8em; margin-left: auto;">${execution.timestamp}</span>
                    ${stepCost ? `<span style="background: #fff3cd; color: #856404; padding: 2px 6px; border-radius: 4px; font-size: 0.8em;">$${stepCost.cost.toFixed(6)}</span>` : ''}
                </div>
                
                ${execution.args ? `
                    <div style="margin-bottom: 8px;">
                        <div style="font-size: 0.85em; color: #6c757d; margin-bottom: 4px;">Arguments:</div>
                        <pre style="background: #f8f9fa; padding: 8px; border-radius: 4px; font-size: 0.8em; margin: 0; overflow-x: auto;">${JSON.stringify(execution.args, null, 2)}</pre>
                    </div>
                ` : ''}
                
                <div>
                    <div style="font-size: 0.85em; color: #6c757d; margin-bottom: 4px;">Result:</div>
                    <pre style="background: ${execution.result ? '#d4edda' : '#f8f9fa'}; padding: 8px; border-radius: 4px; font-size: 0.8em; margin: 0; overflow-x: auto; white-space: pre-wrap;">${resultText}</pre>
                </div>
            </div>
        `;
    }).join('');
}

// Reset tool executions for new requests
function resetToolExecutions() {
    toolExecutions = [];
    const section = document.getElementById('expandable-tools-section');
    if (section) {
        section.style.display = 'none';
    }
}

// Make functions available globally
window.toggleToolsDetails = toggleToolsDetails;
window.toggleCostDetails = toggleCostDetails;
window.addToolExecution = addToolExecution;
window.addToolResult = addToolResult;
window.updateToolsDisplay = updateToolsDisplay;
window.resetToolExecutions = resetToolExecutions;