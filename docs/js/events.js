// events.js - Process different streaming event types

async function processStreamingEvent(eventType, eventData, context) {
    console.log('🎯 processStreamingEvent called:', eventType, eventData);
    
    const {
        statusElement,
        stepsElement,
        toolsPanel,
        toolsLog,
        responseElement,
        answerElement,
        metadataElement,
        metadataContent,
        searchSummaryList,
        fullResultsTree,
        activeSearchesEl,
        formStopBtn,
        digestMap,
        metaMap,
        resultsState,
        startSearchTimer,
        stopSearchTimer,
        stopAllTimers,
        updateLiveSummary,
        updateFullResultsTree
    } = context;
    
    // Debug UI elements
    console.log('🎯 UI Elements Check:', {
        statusElement: !!statusElement,
        responseElement: !!responseElement,
        toolsPanel: !!toolsPanel
    });

    switch (eventType) {
        case 'search_digest':
            {
                const { term, iteration, summary, links, subQuestion, keywords } = eventData;
                const key = `${iteration}|${term}`;
                digestMap.set(key, { summary, links: Array.isArray(links) ? links : [] });
                if (subQuestion || (Array.isArray(keywords) && keywords.length)) {
                    metaMap.set(key, { subQuestion: subQuestion || null, keywords: Array.isArray(keywords) ? keywords : [] });
                }
                // Trigger a refresh of the Search Summary list (uses last known searches from metadata or previous event)
                if (typeof window.__lastSearches !== 'undefined') {
                    updateLiveSummary(window.__lastSearches, undefined);
                }
                // Also refresh the full results tree so digest appears in the expandable section
                updateFullResultsTree();
            }
            break;

        case 'tools':
            try {
                toolsPanel.style.display = 'block';
                const { iteration, pending, calls } = eventData;
                const box = document.createElement('div');
                box.style.cssText = 'padding:8px; border-left:3px solid #6c757d; background:#fff; margin:6px 0; border-radius:4px;';
                const header = document.createElement('div');
                header.innerHTML = `<strong>Iteration ${iteration}</strong> • ${pending} pending call(s)`;
                box.appendChild(header);
                if (Array.isArray(calls)) {
                    // Add each tool call to the expandable tools section
                    calls.forEach(call => {
                        if (window.addToolExecution) {
                            window.addToolExecution(call);
                        }
                    });
                    
                    const list = document.createElement('ul');
                    list.style.margin = '6px 0 0 16px';
                    calls.forEach(c => {
                        const li = document.createElement('li');
                        li.textContent = `${c.name} ${c.call_id ? '(' + c.call_id + ')' : ''}`;
                        list.appendChild(li);
                    });
                    box.appendChild(list);
                }
                toolsLog.appendChild(box);
                
                // Add to real-time monitoring
                if (window.realtimeMonitoring && Array.isArray(calls)) {
                    // Add LLM completion event (LLM analyzed and decided to use tools)
                    window.realtimeMonitoring.addLLMEvent('query_end', {
                        model: 'Tool Planning Model',
                        response: `Decided to use ${calls.length} tool${calls.length !== 1 ? 's' : ''}: ${calls.map(c => c.name).join(', ')}`,
                        tokens: calls.length * 50 // Estimated tokens for planning
                    });
                    
                    calls.forEach(call => {
                        window.realtimeMonitoring.addToolEvent('tool_start', {
                            name: call.name,
                            call_id: call.call_id,
                            iteration: iteration,
                            args: call.args
                        });
                    });
                }
            } catch {}
            break;

        case 'tool_result':
            try {
                toolsPanel.style.display = 'block';
                const { iteration, call_id, name, args, output } = eventData;
                
                // Add result to the expandable tools section
                if (call_id && window.addToolResult) {
                    window.addToolResult(call_id, output);
                }
                
                const item = document.createElement('div');
                item.style.cssText = 'padding:8px; border-left:3px solid #28a745; background:#fff; margin:6px 0; border-radius:4px;';
                const title = document.createElement('div');
                title.innerHTML = `<strong>${name}</strong> ${call_id ? '(' + call_id + ')' : ''} • iteration ${iteration}`;
                const argsPre = document.createElement('pre');
                argsPre.textContent = `args: ${JSON.stringify(args)}`;
                const outPre = document.createElement('pre');
                outPre.textContent = `output: ${output}`;
                item.appendChild(title);
                item.appendChild(argsPre);
                item.appendChild(outPre);
                toolsLog.appendChild(item);
                
                // Add to real-time monitoring
                if (window.realtimeMonitoring) {
                    const displayOutput = typeof output === 'string' ? output : JSON.stringify(output);
                    window.realtimeMonitoring.addToolEvent('tool_result', {
                        name: name,
                        call_id: call_id,
                        iteration: iteration,
                        args: args,
                        output: displayOutput
                    });
                }
            } catch {}
            break;

        case 'log':
            console.log('🔍 Processing log event:', eventData.message);
            console.log('🔍 statusElement:', statusElement);
            console.log('🔍 statusElement exists:', !!statusElement);
            
            if (statusElement) {
                statusElement.textContent = eventData.message || 'Processing...';
                console.log('✅ Updated statusElement text to:', statusElement.textContent);
            } else {
                console.error('❌ statusElement not found!');
            }
            
            // Add to real-time monitoring
            if (window.realtimeMonitoring) {
                window.realtimeMonitoring.addSystemEvent('log', {
                    message: eventData.message || 'Processing...',
                    status: 'logging'
                });
            }
            break;
            
        case 'init':
            console.log('🚀 Processing init event:', eventData.query);
            console.log('🚀 statusElement:', statusElement);
            
            if (statusElement) {
                statusElement.textContent = `🔍 Starting search for: "${eventData.query}"`;
                console.log('✅ Updated statusElement text to:', statusElement.textContent);
            } else {
                console.error('❌ statusElement not found in init!');
            }
            
            if (eventData.allowEnvFallback) {
                const note = document.createElement('div');
                note.style.cssText = 'margin-top:6px;color:#155724;font-size:0.9em;';
                note.textContent = 'Note: Using server-managed API keys (authorized user).';
                if (statusElement && statusElement.parentElement) {
                    statusElement.parentElement.appendChild(note);
                }
            }
            
            // Add to real-time monitoring
            if (window.realtimeMonitoring) {
                window.realtimeMonitoring.addSystemEvent('init', {
                    message: `Starting search for: "${eventData.query}"`,
                    query: eventData.query,
                    status: 'initialized'
                });
                
                // Add initial LLM query start event
                window.realtimeMonitoring.addLLMEvent('query_start', {
                    model: 'Research Planning Model',
                    query: eventData.query
                });
            }
            break;
            
        case 'persona':
            {
                const personaContainer = document.getElementById('persona-container');
                const personaText = document.getElementById('persona-text');
                if (personaContainer && personaText && eventData.persona) {
                    personaText.textContent = eventData.persona;
                    personaContainer.style.display = 'block';
                }
            }
            break;
            
        case 'research_questions':
            {
                const researchContainer = document.getElementById('research-questions-container');
                const researchText = document.getElementById('research-questions-text');
                if (researchContainer && researchText && eventData.questions) {
                    let questionsHtml = `<div style="margin-bottom: 8px;"><strong>Questions to research (${eventData.questions_needed || eventData.questions.length}):</strong></div>`;
                    questionsHtml += '<ul style="margin: 0; padding-left: 20px;">';
                    eventData.questions.forEach((q, i) => {
                        questionsHtml += `<li style="margin-bottom: 4px;">${q}</li>`;
                    });
                    questionsHtml += '</ul>';
                    if (eventData.reasoning) {
                        questionsHtml += `<div style="margin-top: 8px; font-size: 0.85rem; opacity: 0.9;"><em>${eventData.reasoning}</em></div>`;
                    }
                    researchText.innerHTML = questionsHtml;
                    researchContainer.style.display = 'block';
                }
            }
            break;
            
        case 'decision':
            {
                const needsSearch = (eventData.decision && (eventData.decision.needsSearch ?? eventData.decision.requiresSearch)) || false;
                const searchStrategy = needsSearch ? 'Multi-search required' : 'Direct response';
                stepsElement.innerHTML += `
                    <div style="margin: 10px 0; padding: 15px; background: linear-gradient(135deg, #4facfe 0%, #00f2fe 100%); color: white; border-radius: 8px; box-shadow: 0 2px 10px rgba(0,0,0,0.1);">
                        <div style="font-weight: bold; margin-bottom: 8px; display: flex; align-items: center; gap: 8px;\">
                            <span>🎯</span> Search Strategy: ${searchStrategy}
                        </div>
                        ${eventData.decision && eventData.decision.searchTerms ? `<div style=\"opacity: 0.9;\"><strong>Search Terms:</strong> ${eventData.decision.searchTerms.join(', ')}</div>` : ''}
                    </div>
                `;
            }
            break;
            
        case 'step':
            if (eventData.type === 'search_iteration') {
                stepsElement.innerHTML += `
                    <div style="margin: 10px 0; padding: 15px; background: linear-gradient(135deg, #fa709a 0%, #fee140 100%); color: white; border-radius: 8px; box-shadow: 0 2px 10px rgba(0,0,0,0.1);">
                        <div style="font-weight: bold; display: flex; align-items: center; gap: 8px;">
                            <span>🔄</span> Iteration ${eventData.iteration}: ${eventData.message}
                        </div>
                    </div>
                `;
            } else {
                statusElement.textContent = eventData.message;
            }
            break;
            
        case 'search':
            statusElement.textContent = `🔍 Searching (${eventData.searchIndex}/${eventData.totalSearches}): "${eventData.term}"`;
            // Start a countdown bar for this active search
            startSearchTimer(eventData.iteration, eventData.term, eventData.searchIndex, eventData.totalSearches);
            
            // Add to real-time monitoring
            if (window.realtimeMonitoring) {
                window.realtimeMonitoring.addSearchEvent('search', {
                    term: eventData.term,
                    iteration: eventData.iteration,
                    searchIndex: eventData.searchIndex,
                    totalSearches: eventData.totalSearches
                });
            }
            break;
            
        case 'search_results':
            {
                const { term, iteration, resultsCount, results, cumulativeResultsCount, allResults, searches, subQuestion, keywords } = eventData;
                // Ignore initial empty placeholder snapshot to avoid a "null" entry
                if (term === null || (resultsCount === 0 && iteration === 0)) {
                    updateLiveSummary(searches || [], cumulativeResultsCount || 0);
                    break;
                }

                stepsElement.innerHTML += `
                    <div style=\"margin: 5px 0; padding: 12px; background: linear-gradient(135deg, #a8edea 0%, #fed6e3 100%); border-radius: 6px; box-shadow: 0 1px 5px rgba(0,0,0,0.1);\">
                        <div style=\"display: flex; align-items: center; gap: 8px; font-weight: 500;\">
                            <span style=\"color: #28a745;\">✅</span>
                            <span>\"${term}\"</span>
                            <span style=\"background: rgba(255,255,255,0.8); padding: 2px 8px; border-radius: 12px; font-size: 0.9em; color: #333;\">
                                ${resultsCount} results (total ${cumulativeResultsCount || 0})
                            </span>
                        </div>
                    </div>
                `;
                statusElement.textContent = `📥 Received ${resultsCount} result(s) for "${term}" (iteration ${iteration}) — total ${cumulativeResultsCount || 0}`;

                // Update structured state for the full results tree
                if (!resultsState.byIteration[iteration]) resultsState.byIteration[iteration] = {};
                resultsState.byIteration[iteration][term] = Array.isArray(results) ? results : [];
                // Store metadata for this term
                const metaKey = `${iteration}|${term}`;
                metaMap.set(metaKey, { subQuestion: subQuestion || null, keywords: Array.isArray(keywords) ? keywords : [] });

                // Mark this search timer as done
                stopSearchTimer(iteration, term, 'done');

                // Update summary and full tree
                // Keep last searches for digest refresh convenience
                window.__lastSearches = searches || [];
                updateLiveSummary(window.__lastSearches, cumulativeResultsCount || 0);
                updateFullResultsTree();
                
                // Add to real-time monitoring
                if (window.realtimeMonitoring) {
                    window.realtimeMonitoring.addSearchEvent('search_results', {
                        term: term,
                        iteration: iteration,
                        resultsCount: resultsCount,
                        cumulativeResultsCount: cumulativeResultsCount
                    });
                }
            }
            break;
            
        case 'continuation':
            const continueGradient = eventData.shouldContinue ? 
                'linear-gradient(135deg, #ffecd2 0%, #fcb69f 100%)' : 
                'linear-gradient(135deg, #a8e6cf 0%, #dcedc1 100%)';
            stepsElement.innerHTML += `
                <div style="margin: 10px 0; padding: 15px; background: ${continueGradient}; border-radius: 8px; box-shadow: 0 2px 10px rgba(0,0,0,0.1);">
                    <div style="font-weight: bold; margin-bottom: 8px; display: flex; align-items: center; gap: 8px;">
                        <span>${eventData.shouldContinue ? '🔄' : '✋'}</span>
                        ${eventData.shouldContinue ? 'Continuing:' : 'Stopping:'}
                    </div>
                    <div style="opacity: 0.8;">${eventData.reasoning}</div>
                </div>
            `;
            break;
            
        case 'final_response':
            statusElement.textContent = '✅ Search completed! Displaying final response...';
            if (formStopBtn) { formStopBtn.disabled = true; formStopBtn.textContent = 'Done'; }
            stopAllTimers('done');
            answerElement.innerHTML = `<div style="white-space: pre-wrap; line-height: 1.7;">${eventData.response}</div>`;
            
            // Update the "Final Response" header to include cost if available
            const responseHeaderElement = responseElement.querySelector('h3');
            if (responseHeaderElement && window.__currentCostData) {
                const totalCost = window.__currentCostData.totalCost;
                responseHeaderElement.innerHTML = `
                    <span style="font-size: 1.2em;">✨</span> Final Response
                    <span style="margin-left: auto; font-size: 0.9em; color: rgba(255,255,255,0.9); background: rgba(255,255,255,0.2); padding: 4px 8px; border-radius: 12px;">
                        Total Cost: $${totalCost.toFixed(6)}
                    </span>
                `;
                responseHeaderElement.style.display = 'flex';
                responseHeaderElement.style.alignItems = 'center';
                responseHeaderElement.style.justifyContent = 'space-between';
            }
            
            // Keep metadata visible and updated
            metadataContent.innerHTML = `
                <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 15px;">
                    <div style="background: white; padding: 12px; border-radius: 6px; border-left: 4px solid #007bff;">
                        <div style="font-weight: bold; color: #007bff; margin-bottom: 4px;">Total Results</div>
                        <div style="font-size: 1.2em; color: #333;">${eventData.totalResults}</div>
                    </div>
                    <div style="background: white; padding: 12px; border-radius: 6px; border-left: 4px solid #28a745;">
                        <div style="font-weight: bold; color: #28a745; margin-bottom: 4px;">Search Iterations</div>
                        <div style="font-size: 1.2em; color: #333;">${eventData.searchIterations}</div>
                    </div>
                    <div style="background: white; padding: 12px; border-radius: 6px; border-left: 4px solid #ffc107;">
                        <div style="font-weight: bold; color: #ffc107; margin-bottom: 4px;">Completed</div>
                        <div style="font-size: 1.1em; color: #333;">${new Date(eventData.timestamp).toLocaleTimeString()}</div>
                    </div>
                </div>
            `;
            metadataElement.style.display = 'block';
            break;
            
        case 'final_answer':
            statusElement.textContent = '✅ Search completed! Displaying final answer...';
            if (formStopBtn) { formStopBtn.disabled = true; formStopBtn.textContent = 'Done'; }
            stopAllTimers('done');
            answerElement.innerHTML = `<div style="white-space: pre-wrap; line-height: 1.7;">${eventData.content}</div>`;
            
            // Update header with cost if available
            const finalAnswerHeaderElement = responseElement?.querySelector('h3');
            if (finalAnswerHeaderElement && window.__currentCostData) {
                const costData = window.__currentCostData;
                finalAnswerHeaderElement.innerHTML = `
                    <span style="font-size: 1.2em;">✨</span> Final Response
                    <span style="margin-left: auto; font-size: 0.9em; color: rgba(255,255,255,0.9); background: rgba(255,255,255,0.2); padding: 4px 8px; border-radius: 12px;">
                        💰 $${costData.totalCost.toFixed(6)} • 📊 ${costData.tokenCounts ? (costData.tokenCounts.input + costData.tokenCounts.output).toLocaleString() : 0} tokens
                    </span>
                `;
                finalAnswerHeaderElement.style.display = 'flex';
                finalAnswerHeaderElement.style.alignItems = 'center';
                finalAnswerHeaderElement.style.justifyContent = 'space-between';
            }
            
            // Add final LLM completion event
            if (window.realtimeMonitoring) {
                window.realtimeMonitoring.addLLMEvent('query_end', {
                    model: 'Final Answer Model',
                    response: eventData.content ? `Generated final answer (${eventData.content.length} characters)` : 'Generated final answer',
                    tokens: Math.ceil((eventData.content ? eventData.content.length : 0) / 4) // Rough token estimate
                });
            }
            break;
            
        case 'cost_summary':
            {
                const { totalCost, stepCosts, tokenCounts } = eventData;
                
                // Store cost data globally
                window.__currentCostData = { totalCost, stepCosts, tokenCounts };
                
                // Update the expandable cost section
                const costSection = document.getElementById('expandable-cost-section');
                const costBadge = document.getElementById('cost-badge');
                const costContent = document.getElementById('cost-breakdown-content');
                
                if (costSection && totalCost > 0) {
                    costSection.style.display = 'block';
                    if (costBadge) {
                        costBadge.textContent = `$${totalCost.toFixed(6)}`;
                    }
                    
                    if (costContent) {
                        let detailedCostHtml = `
                            <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 15px; margin-bottom: 20px;">
                                <div style="background: white; padding: 15px; border-radius: 8px; border-left: 4px solid #dc3545; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">
                                    <div style="font-weight: bold; color: #dc3545; margin-bottom: 8px; font-size: 1.1em;">💰 Total Cost</div>
                                    <div style="font-size: 1.4em; color: #333; font-weight: bold;">$${totalCost.toFixed(6)}</div>
                                </div>
                        `;
                        
                        if (tokenCounts) {
                            detailedCostHtml += `
                                <div style="background: white; padding: 15px; border-radius: 8px; border-left: 4px solid #007bff; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">
                                    <div style="font-weight: bold; color: #007bff; margin-bottom: 8px; font-size: 1.1em;">📊 Total Tokens</div>
                                    <div style="font-size: 1.3em; color: #333; font-weight: bold;">${(tokenCounts.input + tokenCounts.output).toLocaleString()}</div>
                                    <div style="font-size: 0.9em; color: #6c757d; margin-top: 4px;">
                                        Input: ${tokenCounts.input.toLocaleString()} • Output: ${tokenCounts.output.toLocaleString()}
                                    </div>
                                </div>
                            `;
                        }
                        
                        detailedCostHtml += `</div>`;
                        
                        // Add detailed step breakdown
                        if (stepCosts && stepCosts.length > 0) {
                            detailedCostHtml += `
                                <h4 style="margin: 0 0 15px 0; color: #495057; font-size: 1.2em;">📋 Step-by-Step Breakdown</h4>
                                <div style="space-y: 8px;">
                            `;
                            
                            stepCosts.forEach((step, index) => {
                                detailedCostHtml += `
                                    <div style="background: white; padding: 12px; margin-bottom: 8px; border-radius: 6px; border-left: 4px solid #28a745; box-shadow: 0 1px 3px rgba(0,0,0,0.1); display: flex; justify-content: space-between; align-items: center;">
                                        <div style="flex: 1;">
                                            <div style="font-weight: bold; color: #333; margin-bottom: 4px;">${step.stepName}</div>
                                            <div style="color: #6c757d; font-size: 0.9em;">
                                                Model: ${step.model} • 
                                                ${step.inputTokens.toLocaleString()} input + ${step.outputTokens.toLocaleString()} output tokens
                                            </div>
                                        </div>
                                        <div style="text-align: right; margin-left: 15px;">
                                            <div style="font-weight: bold; color: #dc3545; font-size: 1.1em;">$${step.cost.toFixed(6)}</div>
                                            <div style="font-size: 0.8em; color: #6c757d;">${(step.inputTokens + step.outputTokens).toLocaleString()} total</div>
                                        </div>
                                    </div>
                                `;
                            });
                            
                            detailedCostHtml += `</div>`;
                        }
                        
                        costContent.innerHTML = detailedCostHtml;
                    }
                }
                
                // Also update the final response header if it exists
                const costSummaryHeaderElement = responseElement?.querySelector('h3');
                if (costSummaryHeaderElement) {
                    costSummaryHeaderElement.innerHTML = `
                        <span style="font-size: 1.2em;">✨</span> Final Response
                        <span style="margin-left: auto; font-size: 0.9em; color: rgba(255,255,255,0.9); background: rgba(255,255,255,0.2); padding: 4px 8px; border-radius: 12px;">
                            💰 $${totalCost.toFixed(6)} • 📊 ${tokenCounts ? (tokenCounts.input + tokenCounts.output).toLocaleString() : 0} tokens
                        </span>
                    `;
                    costSummaryHeaderElement.style.display = 'flex';
                    costSummaryHeaderElement.style.alignItems = 'center';
                    costSummaryHeaderElement.style.justifyContent = 'space-between';
                }
            }
            break;
            
        case 'complete':
            statusElement.textContent = `✅ Complete! Total time: ${Math.round(eventData.executionTime)}ms`;
            if (formStopBtn) { formStopBtn.disabled = true; formStopBtn.textContent = 'Done'; }
            stopAllTimers('done');
            // Ensure the full results tree reflects the final snapshot
            if (Array.isArray(eventData.allResults) && eventData.allResults.length) {
                // If we never received structured iterations, fall back to a flat section
                const hasStructure = Object.keys(resultsState.byIteration).length > 0;
                if (!hasStructure) {
                    resultsState.byIteration[1] = { 'All results': eventData.allResults };
                }
                updateFullResultsTree();
            }
            // Reset model to fastest/cheapest option for next request
            if (window.resetModelToFastest) {
                window.resetModelToFastest();
            }
            break;
            
        case 'error':
            statusElement.textContent = `❌ Error: ${eventData.error}`;
            if (formStopBtn) { formStopBtn.disabled = true; formStopBtn.textContent = 'Error'; }
            stopAllTimers('error');
            stepsElement.innerHTML += `
                <div style="margin: 10px 0; padding: 15px; background: linear-gradient(135deg, #ff9a9e 0%, #fecfef 100%); border-radius: 8px; color: #721c24;">
                    <div style="font-weight: bold; margin-bottom: 8px; display: flex; align-items: center; gap: 8px;">
                        <span>❌</span> Error Occurred
                    </div>
                    <div>${eventData.error}</div>
                </div>
            `;
            break;
            
        case 'interrupt_state':
            {
                // Handle interrupted state - save state for resumption
                window.interruptState = eventData;
                window.currentQueryId = eventData.queryId;
                window.previousSteps = eventData.costSteps || [];
                
                // Hide stop button, show continue button
                if (formStopBtn) {
                    formStopBtn.style.display = 'none';
                }
                const continueBtn = document.getElementById('continue-btn');
                if (continueBtn) {
                    continueBtn.style.display = 'inline-block';
                }
                
                // Start auto-continue timer with countdown
                if (window.startAutoContinueTimer) {
                    window.startAutoContinueTimer();
                }
                
                // Update status
                const interruptReason = eventData.reason === 'timeout' ? 'timeout' : 'rate limit';
                statusElement.textContent = `⏸️ Paused due to ${interruptReason}. Click Continue to resume or wait for auto-continue.`;
                stopAllTimers('paused');
                
                // Display interrupt message in the answer area
                answerElement.innerHTML = `
                    <div style="padding: 20px; background: linear-gradient(135deg, #ffd700 0%, #ffb347 100%); border-radius: 8px; color: #333; margin: 10px 0;">
                        <div style="font-weight: bold; font-size: 1.1em; margin-bottom: 10px;">
                            ⏸️ Query Paused
                        </div>
                        <div style="margin-bottom: 10px;">
                            ${eventData.message || 'Processing was paused to prevent timeouts or rate limits.'}
                        </div>
                        <div style="font-size: 0.9em; color: #666;">
                            Progress has been saved. Click the Continue button to resume immediately, or wait 60 seconds for automatic continuation.
                        </div>
                    </div>
                `;
            }
            break;
    }
}

// Export for use in streaming.js
window.processStreamingEvent = processStreamingEvent;