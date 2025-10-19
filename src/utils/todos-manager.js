/**
 * TodosManager - Backend-managed todo queue for multi-step tasks
 * 
 * Maintains an in-memory ordered queue of todos for a single chat session.
 * Tracks status (pending/current/done), emits SSE events on changes,
 * and integrates with assessor for auto-progression.
 */

class TodosManager {
    /**
     * @param {Function} writeEvent - SSE event writer function (type, data) => void
     */
    constructor(writeEvent) {
        this.writeEvent = writeEvent;
        this.items = []; // [{ id, description, status }]
        this.nextId = 1;
    }

    /**
     * Emit SSE event (safely handles errors)
     * @private
     */
    _emit(type, data) {
        try {
            if (this.writeEvent && typeof this.writeEvent === 'function') {
                this.writeEvent(type, data);
            }
        } catch (err) {
            console.error(`TodosManager: Failed to emit event ${type}:`, err.message);
        }
    }

    /**
     * Get current todos state
     * @returns {TodosState} { total, remaining, current, items }
     */
    getState() {
        const total = this.items.length;
        const current = this.items.find(i => i.status === 'current') || null;
        const remaining = this.items.filter(i => i.status !== 'done').length;
        return {
            total,
            remaining,
            current,
            items: this.items.map(i => ({ ...i })) // Return copies to prevent mutation
        };
    }

    /**
     * Add new todos to the queue
     * @param {string[]} descriptions - Array of todo descriptions
     * @returns {TodosState} Updated state
     */
    add(descriptions = []) {
        if (!Array.isArray(descriptions)) {
            console.error('TodosManager.add: descriptions must be an array');
            return this.getState();
        }

        // Add new items as pending
        descriptions.forEach(desc => {
            if (desc && String(desc).trim()) {
                this.items.push({
                    id: this.nextId++,
                    description: String(desc).trim(),
                    status: 'pending'
                });
            }
        });

        // Activate first item as current if none exists
        if (!this.items.some(i => i.status === 'current') && this.items.some(i => i.status === 'pending')) {
            const firstPending = this.items.find(i => i.status === 'pending');
            if (firstPending) {
                firstPending.status = 'current';
            }
        }

        const state = this.getState();
        
        // Emit events
        this._emit('todos_updated', state);
        this._emit('todos_current', {
            current: state.current,
            remaining: state.remaining,
            total: state.total
        });

        console.log(`✅ TodosManager: Added ${descriptions.length} todos (total: ${state.total}, remaining: ${state.remaining})`);
        return state;
    }

    /**
     * Delete todos by id or description
     * @param {(string|number)[]} matchers - Array of ids or exact descriptions to remove
     * @returns {TodosState} Updated state
     */
    delete(matchers = []) {
        if (!Array.isArray(matchers)) {
            console.error('TodosManager.delete: matchers must be an array');
            return this.getState();
        }

        const toDelete = new Set(matchers.map(String));
        const beforeCount = this.items.length;
        
        // Filter out matching items
        this.items = this.items.filter(i => 
            !toDelete.has(String(i.id)) && !toDelete.has(i.description)
        );

        const deletedCount = beforeCount - this.items.length;

        // Ensure there is a current item if items remain
        if (this.items.length > 0 && !this.items.some(i => i.status === 'current')) {
            const firstPending = this.items.find(i => i.status === 'pending');
            if (firstPending) {
                firstPending.status = 'current';
            }
        }

        const state = this.getState();
        
        // Emit events
        this._emit('todos_updated', state);
        this._emit('todos_current', {
            current: state.current,
            remaining: state.remaining,
            total: state.total
        });

        console.log(`✅ TodosManager: Deleted ${deletedCount} todos (remaining: ${state.remaining})`);
        return state;
    }

    /**
     * Mark current todo as done and advance to next pending
     * Called after assessor "OK" result
     * @returns {TodosState} Updated state
     */
    completeCurrent() {
        const current = this.items.find(i => i.status === 'current');
        
        if (current) {
            current.status = 'done';
            console.log(`✅ TodosManager: Completed todo #${current.id}: "${current.description}"`);
        }

        // Advance next pending to current
        const nextPending = this.items.find(i => i.status === 'pending');
        if (nextPending) {
            nextPending.status = 'current';
            console.log(`▶️  TodosManager: Advanced to todo #${nextPending.id}: "${nextPending.description}"`);
        }

        const state = this.getState();
        
        // Emit events
        this._emit('todos_updated', state);
        this._emit('todos_current', {
            current: state.current,
            remaining: state.remaining,
            total: state.total
        });

        return state;
    }

    /**
     * Check if there are pending or current todos
     * @returns {boolean} True if work remains
     */
    hasPending() {
        return this.items.some(i => i.status === 'pending' || i.status === 'current');
    }

    /**
     * Get current todo (if any)
     * @returns {Todo|null} Current todo or null
     */
    getCurrent() {
        return this.items.find(i => i.status === 'current') || null;
    }

    /**
     * Clear all todos (used for testing or reset)
     */
    clear() {
        this.items = [];
        this.nextId = 1;
        const state = this.getState();
        this._emit('todos_updated', state);
        console.log('🧹 TodosManager: Cleared all todos');
        return state;
    }
}

module.exports = { TodosManager };
