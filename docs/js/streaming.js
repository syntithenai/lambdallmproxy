// streaming.js - Handle streaming Server-Sent Events response

/**
 * Handle streaming Server-Sent Events response
 */
async function handleStreamingResponse(response, responseContainer, controller) {
    
    // Clear and prepare response container for streaming
    responseContainer.className = 'response-container';
    responseContainer.innerHTML = `
        <div id="streaming-response" style="margin-bottom: 16px;">
            <div style="padding: 15px; background: linear-gradient(135deg, #11998e 0%, #38ef7d 100%); color: white; border-radius: 8px; margin-bottom: 10px;">
                <h3 style="margin: 0; display: flex; align-items: center; gap: 8px;">
                    <span style="font-size: 1.2em;">✨</span> Final Response
                </h3>
            </div>
            <div id="final-answer" style="padding: 16px; background: #f8f9fa; border-radius: 8px; border-left: 4px solid #28a745; line-height: 1.6; color:#212529;">
                <em>Working on it… you'll see the final answer here as soon as it's ready.</em>
            </div>
        </div>
        <div id="streaming-metadata" style="margin-top: 8px; padding: 12px; background: #f8f9fa; border-radius: 8px; border: 1px solid #e9ecef;">
            <h4 style="margin: 0 0 10px 0; color: #495057; display: flex; align-items: center; gap: 8px;">
                <span>📊</span> Search Summary
            </h4>
            <div id="metadata-content"></div>
            <ul id="search-summary-list" style="margin: 10px 0 0 0; padding-left: 20px;"></ul>
        </div>
        <div style="margin-top: 16px; padding: 12px; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; border-radius: 8px; box-shadow: 0 4px 15px rgba(0,0,0,0.1);">
            <h3 style="margin: 0 0 8px 0; display: flex; align-items: center; gap: 8px;">
                <span style="font-size: 1.2em;">🔍</span> Real-time Search Progress
            </h3>
            <div id="streaming-status" style="opacity: 0.95;">Connected! Waiting for data...</div>
        </div>
        <div id="active-searches" style="margin:10px 0; padding:10px; background:#f8f9fa; border:1px solid #e9ecef; border-radius:8px; display:none;"></div>
        <div id="streaming-steps" style="margin: 10px 0 16px 0;"></div>
        <div id="tools-panel" class="tools-panel" style="display:none; margin:10px 0; padding:10px; background:#f8f9fa; border:1px solid #e9ecef; border-radius:8px;">
            <h3 style="margin:0 0 8px 0; color:#495057;">Tool calls</h3>
            <div id="tools-log"></div>
        </div>
        <div id="full-results-tree"></div>
        
        <!-- Expandable Tools Section -->
        <div id="expandable-tools-section" style="margin-top: 20px; display: none;">
            <div onclick="toggleToolsDetails()" style="background: linear-gradient(135deg, #6c757d 0%, #495057 100%); color: white; padding: 12px; border-radius: 8px 8px 0 0; cursor: pointer; font-weight: bold; display: flex; align-items: center; gap: 8px;">
                <span id="tools-toggle-icon">▼</span> Tool Executions
                <span id="tools-count-badge" style="background: rgba(255,255,255,0.3); padding: 2px 8px; border-radius: 12px; font-size: 0.9em; margin-left: auto;">0</span>
            </div>
            <div id="expandable-tools-content" style="background: #f8f9fa; border: 1px solid #dee2e6; border-top: none; border-radius: 0 0 8px 8px; max-height: 400px; overflow-y: auto; display: none;">
                <!-- Tool executions will be dynamically added here -->
            </div>
        </div>
        
        <!-- Expandable Cost Section -->
        <div id="expandable-cost-section" style="margin-top: 20px; display: none;">
            <div onclick="toggleCostDetails()" style="background: linear-gradient(135deg, #ff9a9e 0%, #fecfef 100%); color: white; padding: 12px; border-radius: 8px 8px 0 0; cursor: pointer; font-weight: bold; display: flex; align-items: center; gap: 8px;">
                <span id="cost-toggle-icon">▼</span> Cost & Token Usage
                <span id="cost-badge" style="background: rgba(255,255,255,0.3); padding: 2px 8px; border-radius: 12px; font-size: 0.9em; margin-left: auto;">$0.000000</span>
            </div>
            <div id="expandable-cost-content" style="background: #f8f9fa; border: 1px solid #dee2e6; border-top: none; border-radius: 0 0 8px 8px; max-height: 400px; overflow-y: auto; display: none; padding: 15px;">
                <div id="cost-breakdown-content">
                    <!-- Cost breakdown will be dynamically added here -->
                </div>
            </div>
        </div>
    `;
    
    const statusElement = document.getElementById('streaming-status');
    const stepsElement = document.getElementById('streaming-steps');
    const toolsPanel = document.getElementById('tools-panel');
    const toolsLog = document.getElementById('tools-log');
    const responseElement = document.getElementById('streaming-response');
    const answerElement = document.getElementById('final-answer');
    const metadataElement = document.getElementById('streaming-metadata');
    const metadataContent = document.getElementById('metadata-content');
    const searchSummaryList = document.getElementById('search-summary-list');
    const fullResultsTree = document.getElementById('full-results-tree');
    const activeSearchesEl = document.getElementById('active-searches');
    
    // Get the stop button from the form area
    const formStopBtn = document.getElementById('stop-btn');
    
    // Maintain structured state for full results tree
    const resultsState = { byIteration: {} };
    // Map of per-search digests: key `${iteration}|${term}` => { summary, links }
    const digestMap = new Map();
    // Map of per-search metadata: key `${iteration}|${term}` => { subQuestion, keywords }
    const metaMap = new Map();
    // Track active searches and countdowns
    const activeTimers = new Map(); // key -> { start, maxMs, intervalId, barInner, label }
    const SEARCH_MAX_MS = 15000; // UI estimate per-search timeout (ms)

    function ensureActiveHeaderVisible() {
        if (activeTimers.size > 0) {
            activeSearchesEl.style.display = 'block';
            if (!activeSearchesEl.__header) {
                const h = document.createElement('div');
                h.style.cssText = 'font-weight:600; color:#495057; margin-bottom:8px;';
                h.textContent = 'Active searches';
                activeSearchesEl.appendChild(h);
                activeSearchesEl.__header = h;
            }
        } else {
            activeSearchesEl.style.display = 'none';
        }
    }

    function startSearchTimer(iteration, term, index, total) {
        const key = `${iteration}|${term}`;
        if (activeTimers.has(key)) return;
        const wrap = document.createElement('div');
        wrap.style.cssText = 'margin:6px 0;';
        const label = document.createElement('div');
        label.style.cssText = 'font-size:0.9em; color:#495057; margin-bottom:4px; display:flex; justify-content:space-between; gap:8px;';
        label.innerHTML = `<span>(${index}/${total}) "${term}"</span><span class="time">${Math.round(SEARCH_MAX_MS/1000)}s</span>`;
        const bar = document.createElement('div');
        bar.style.cssText = 'height:10px; background:#e9ecef; border-radius:6px; overflow:hidden;';
        const inner = document.createElement('div');
        inner.style.cssText = 'height:100%; width:0%; background:linear-gradient(90deg, #ffda79, #f0932b); transition:width 0.2s linear;';
        bar.appendChild(inner);
        wrap.appendChild(label);
        wrap.appendChild(bar);
        activeSearchesEl.appendChild(wrap);
        ensureActiveHeaderVisible();
        const start = Date.now();
        const intervalId = setInterval(() => {
            const elapsed = Date.now() - start;
            const pct = Math.min(100, (elapsed/SEARCH_MAX_MS)*100);
            inner.style.width = pct + '%';
            const remain = Math.max(0, Math.ceil((SEARCH_MAX_MS - elapsed)/1000));
            const timeEl = label.querySelector('.time');
            if (timeEl) timeEl.textContent = `${remain}s`;
            if (elapsed >= SEARCH_MAX_MS) {
                // Mark as timed out visually but keep it until we get results or completion
                inner.style.background = 'linear-gradient(90deg, #ff6b6b, #c44569)';
                clearInterval(intervalId);
            }
        }, 200);
        activeTimers.set(key, { start, maxMs: SEARCH_MAX_MS, intervalId, barInner: inner, label, wrap });
    }

    function stopSearchTimer(iteration, term, status = 'done') {
        const key = `${iteration}|${term}`;
        const t = activeTimers.get(key);
        if (!t) return;
        if (t.intervalId) clearInterval(t.intervalId);
        // Update color based on status
        if (status === 'done') {
            t.barInner.style.width = '100%';
            t.barInner.style.background = 'linear-gradient(90deg, #2ecc71, #27ae60)';
        } else if (status === 'stopped') {
            t.barInner.style.background = 'linear-gradient(90deg, #6c757d, #495057)';
        } else if (status === 'error') {
            t.barInner.style.background = 'linear-gradient(90deg, #ff6b6b, #c44569)';
        }
        // Remove after short delay to keep feedback visible
        setTimeout(() => {
            if (t.wrap && t.wrap.parentElement) t.wrap.parentElement.removeChild(t.wrap);
            activeTimers.delete(key);
            ensureActiveHeaderVisible();
        }, 800);
    }

    function stopAllTimers(status = 'stopped') {
        for (const key of Array.from(activeTimers.keys())) {
            const [iter, term] = key.split('|');
            stopSearchTimer(iter, term, status);
        }
        
        // Also stop auto-continue timer
        if (window.stopAutoContinueTimer) {
            window.stopAutoContinueTimer();
        }
    }

    // Wire Stop button from form
    if (formStopBtn) {
        formStopBtn.addEventListener('click', () => {
            try { controller && controller.abort(); } catch {}
            formStopBtn.disabled = true;
            formStopBtn.textContent = 'Stopping...';
            statusElement.textContent = '⏹️ Stopping — no further requests will be made.';
            
            // Stop auto-continue timer when stopping
            if (window.stopAutoContinueTimer) {
                window.stopAutoContinueTimer();
            }
            
            stopAllTimers('stopped');
        });
    }
    
    // Wire Continue button from form
    const continueBtn = document.getElementById('continue-btn');
    if (continueBtn) {
        continueBtn.addEventListener('click', () => {
            if (window.interruptState) {
                // Stop auto-continue timer since user manually clicked
                if (window.stopAutoContinueTimer) {
                    window.stopAutoContinueTimer();
                }
                // Resume from interrupted state
                if (window.resumeFromInterrupt) {
                    window.resumeFromInterrupt();
                }
            }
        });
    }
    
    function renderResultsSection(title, results, digest, meta) {
        const details = document.createElement('details');
        details.className = 'search-results-section';
        details.open = false;
        const summary = document.createElement('summary');
        summary.innerHTML = `<strong>${title}</strong> (${results.length} total)`;
        details.appendChild(summary);
        // Sub-question heading and keywords badges
        if (meta && (meta.subQuestion || (Array.isArray(meta.keywords) && meta.keywords.length))) {
            const metaBox = document.createElement('div');
            metaBox.style.cssText = 'margin:10px 12px; padding:10px; background:#f8f9fa; border:1px solid #e9ecef; border-radius:6px;';
            if (meta.subQuestion) {
                const h = document.createElement('div');
                h.style.cssText = 'font-weight:600; color:#343a40; margin-bottom:6px;';
                h.textContent = `Sub-question: ${meta.subQuestion}`;
                metaBox.appendChild(h);
            }
            if (Array.isArray(meta.keywords) && meta.keywords.length) {
                const kwWrap = document.createElement('div');
                kwWrap.style.cssText = 'display:flex; flex-wrap:wrap; gap:6px;';
                meta.keywords.forEach(k => {
                    const badge = document.createElement('span');
                    badge.style.cssText = 'background:#e9f5ff; color:#0b6aa2; border:1px solid #b6e0fe; padding:2px 8px; border-radius:12px; font-size:0.85em;';
                    badge.textContent = k;
                    kwWrap.appendChild(badge);
                });
                metaBox.appendChild(kwWrap);
            }
            details.appendChild(metaBox);
        }
        // If we have a per-search digest summary, render it prominently at the top of this section
        if (digest && (digest.summary || (Array.isArray(digest.links) && digest.links.length))) {
            const digestBox = document.createElement('div');
            digestBox.style.cssText = 'margin:10px 12px; padding:10px; background:#fff; border-left:4px solid #007bff; border:1px solid #e9ecef; border-radius:6px;';
            if (digest.summary) {
                const p = document.createElement('div');
                p.style.cssText = 'color:#212529; line-height:1.5;';
                p.textContent = digest.summary;
                digestBox.appendChild(p);
            }
            if (Array.isArray(digest.links) && digest.links.length) {
                const ul = document.createElement('ul');
                ul.style.cssText = 'margin-top:6px;';
                digest.links.forEach(l => {
                    const li = document.createElement('li');
                    li.innerHTML = `<a href="${l.url}" target="_blank" rel="noopener noreferrer">${l.title || l.url}</a>${l.snippet ? ` — <small>${l.snippet}</small>` : ''}`;
                    ul.appendChild(li);
                });
                digestBox.appendChild(ul);
            }
            details.appendChild(digestBox);
        }
        const wrap = document.createElement('div');
        wrap.className = 'search-results';
        results.slice(0, 20).forEach(r => {
            const item = document.createElement('div');
            item.className = 'result-item';
            item.innerHTML = `
                <h4><a href="${r.url}" target="_blank" rel="noopener noreferrer">${r.title || r.url}</a></h4>
                <p class="result-description">${r.description || 'No description available'}</p>
                <p class="result-url"><small>${r.url}</small></p>
            `;
            wrap.appendChild(item);
        });
        if (results.length > 20) {
            const more = document.createElement('p');
            more.innerHTML = `<em>... and ${results.length - 20} more results</em>`;
            wrap.appendChild(more);
        }
        details.appendChild(wrap);
        return details;
    }
    
    function updateLiveSummary(searches, total) {
        metadataElement.style.display = 'block';
        const iters = [...new Set((searches || []).map(s => s.iteration))];
        metadataContent.innerHTML = `
            <div><strong>Total results so far:</strong> ${total || 0}</div>
            <div><strong>Searches performed:</strong> ${(searches || []).length} across ${iters.length} iteration(s)</div>
        `;
        // Update list of searches with counts; include placeholder for per-search LLM summaries when available
        searchSummaryList.innerHTML = '';
        (searches || []).forEach(s => {
            const li = document.createElement('li');
            li.innerHTML = `<strong>Iteration ${s.iteration}</strong>: \"${s.query}\" — ${s.resultsCount} result(s)`;
            // Sub-question heading inline
            if (s.subQuestion) {
                const sub = document.createElement('div');
                sub.style.cssText = 'margin-top:2px; color:#495057; font-size:0.9em;';
                sub.textContent = `Sub-question: ${s.subQuestion}`;
                li.appendChild(sub);
            }
            if (Array.isArray(s.keywords) && s.keywords.length) {
                const kw = document.createElement('div');
                kw.style.cssText = 'margin-top:4px; display:flex; flex-wrap:wrap; gap:6px;';
                s.keywords.forEach(k => {
                    const badge = document.createElement('span');
                    badge.style.cssText = 'background:#eef7ee; color:#226633; border:1px solid #cde7ce; padding:2px 8px; border-radius:12px; font-size:0.85em;';
                    badge.textContent = k;
                    kw.appendChild(badge);
                });
                li.appendChild(kw);
            }
            // Show per-search digest if available (from digestMap or inline summary)
            const key = `${s.iteration}|${s.query}`;
            const digest = digestMap.get(key) || (s.summary ? { summary: s.summary, links: s.links || [] } : null);
            if (digest && digest.summary) {
                const p = document.createElement('div');
                p.style.cssText = 'margin-top:4px;color:#495057;';
                p.textContent = digest.summary;
                li.appendChild(p);
                if (Array.isArray(digest.links) && digest.links.length) {
                    const ul = document.createElement('ul');
                    ul.style.marginTop = '4px';
                    digest.links.forEach(l => {
                        const li2 = document.createElement('li');
                        li2.innerHTML = `<a href="${l.url}" target="_blank" rel="noopener noreferrer">${l.title || l.url}</a>${l.snippet ? ` — <small>${l.snippet}</small>` : ''}`;
                        ul.appendChild(li2);
                    });
                    li.appendChild(ul);
                }
            }
            searchSummaryList.appendChild(li);
        });
    }

    function updateFullResultsTree() {
        // Build a closed-by-default tree grouped by iteration -> query -> results
        fullResultsTree.innerHTML = '';
        const top = document.createElement('details');
        top.open = false;
        top.className = 'search-results-section';
        const topSummary = document.createElement('summary');
        // Count total results
        let total = 0;
        Object.values(resultsState.byIteration).forEach(iter => {
            Object.values(iter).forEach(arr => total += arr.length);
        });
        topSummary.innerHTML = `<strong>Full search results</strong> (${total} total)`;
        top.appendChild(topSummary);

        const container = document.createElement('div');
        container.style.marginTop = '8px';

        Object.keys(resultsState.byIteration).sort((a,b)=>Number(a)-Number(b)).forEach(iter => {
            const iterDetails = document.createElement('details');
            iterDetails.open = false;
            const iterSummary = document.createElement('summary');
            // Count iteration total
            let iterTotal = 0;
            Object.values(resultsState.byIteration[iter]).forEach(arr => iterTotal += arr.length);
            iterSummary.innerHTML = `<strong>Iteration ${iter}</strong> (${iterTotal} results)`;
            iterDetails.appendChild(iterSummary);

            Object.keys(resultsState.byIteration[iter]).forEach(term => {
                const termResults = resultsState.byIteration[iter][term];
                // Pull digest and metadata for this iteration/term if available
                const key = `${iter}|${term}`;
                const digest = digestMap.get(key) || null;
                const meta = metaMap.get(key) || null;
                const termDetails = renderResultsSection(`\"${term}\"`, termResults, digest, meta);
                iterDetails.appendChild(termDetails);
            });

            container.appendChild(iterDetails);
        });

        top.appendChild(container);
        fullResultsTree.appendChild(top);
    }
    
    // Process streaming events
    try {
        // Handle streaming response
        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';
        
        while (true) {
            const { done, value } = await reader.read();
            
            if (done) {
                statusElement.textContent = 'Stream completed';
                break;
            }
            
            // Decode and process chunk
            buffer += decoder.decode(value, { stream: true });
            
            // Process complete events (separated by double newlines)
            const events = buffer.split('\n\n');
            buffer = events.pop(); // Keep incomplete event in buffer
            
            for (const event of events) {
                if (!event.trim()) continue;
                
                try {
                    // Parse Server-Sent Events format
                    const lines = event.trim().split('\n');
                    let eventType = 'message';
                    let data = '';
                    
                    for (const line of lines) {
                        if (line.startsWith('event: ')) {
                            eventType = line.substring(7);
                        } else if (line.startsWith('data: ')) {
                            data = line.substring(6);
                        }
                    }
                    
                    if (!data) continue;
                    
                    const eventData = JSON.parse(data);
                    
                    // Handle different event types
                    await processStreamingEvent(eventType, eventData, {
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
                    });
                    
                } catch (parseError) {
                    // Silently skip malformed events
                }
            }
        }
        
    } catch (streamError) {
        if (formStopBtn) { formStopBtn.disabled = true; formStopBtn.textContent = 'Stopped'; }
        stopAllTimers('stopped');
        if (streamError.name === 'AbortError') {
            statusElement.textContent = '⏹️ Stopped by user. Partial results are shown above.';
            // Keep existing partial results visible without switching to error theme
            responseContainer.className = 'response-container';
        } else {
            statusElement.textContent = `❌ Streaming Error: ${streamError.message}`;
            responseContainer.className = 'response-container response-error';
        }
    }
}

// Export for use in main.js
window.handleStreamingResponse = handleStreamingResponse;