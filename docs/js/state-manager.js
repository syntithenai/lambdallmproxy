// state-manager.js - Global state management

/**
 * Centralized state management for the AI Search application
 * Handles all global state including request state, tracking data, and continuation state
 */
class StateManager {
    constructor() {
        // Global request state
        this.currentRequest = null;

        // Comprehensive tool call and LLM tracking
        this.toolCallCycles = []; // Nested array: [cycle1[], cycle2[], ...]
        this.llmCalls = [];
        this.totalCost = 0;
        this.totalTokens = 0;
        this.currentPersona = '';
        this.currentQuestions = [];
        this.currentSetupData = {};
        this.currentFormData = {};

        // Quota/limits error handling state
        this.continuationState = {
            isActive: false,
            savedFormData: null,
            savedContext: null,
            countdownTimer: null,
            remainingSeconds: 0,
            retryCount: 0,
            maxAutoRetries: 3,
            autoRetryEnabled: true,
            // State tracking for true continuation
            workState: {
                researchPlan: null,
                toolCallCycles: [],
                llmCalls: [],
                searchResults: [],
                currentIteration: 0,
                totalCost: 0,
                totalTokens: 0,
                persona: '',
                questions: [],
                setupData: {}
            }
        };
    }

    /**
     * Reset work state for new requests
     */
    resetWorkState() {
        this.continuationState.workState = {
            researchPlan: null,
            completedToolCalls: [],
            searchResults: [],
            currentIteration: 0,
            allInformation: null
        };
    }

    /**
     * Update tool calls state
     */
    updateToolCallsState(newCycles) {
        this.toolCallCycles = newCycles;
        // Also update continuation state
        this.continuationState.workState.toolCallCycles = newCycles;
    }

    /**
     * Update LLM calls state
     */
    updateLLMCallsState(newCalls) {
        this.llmCalls = newCalls;
        // Also update continuation state
        this.continuationState.workState.llmCalls = newCalls;
    }

    /**
     * Update cost and token tracking
     */
    updateCostAndTokens(cost, tokens) {
        this.totalCost = cost;
        this.totalTokens = tokens;
        // Also update continuation state
        this.continuationState.workState.totalCost = cost;
        this.continuationState.workState.totalTokens = tokens;
    }

    /**
     * Update persona and questions
     */
    updatePersonaAndQuestions(persona, questions) {
        this.currentPersona = persona;
        this.currentQuestions = questions;
        // Also update continuation state
        this.continuationState.workState.persona = persona;
        this.continuationState.workState.questions = questions;
    }

    /**
     * Update current form data
     */
    updateFormData(formData) {
        this.currentFormData = formData;
    }

    /**
     * Update setup data
     */
    updateSetupData(setupData) {
        this.currentSetupData = setupData;
        // Also update continuation state
        this.continuationState.workState.setupData = setupData;
    }

    /**
     * Get current state snapshot for debugging
     */
    getStateSnapshot() {
        return {
            hasCurrentRequest: !!this.currentRequest,
            toolCallCyclesCount: this.toolCallCycles.length,
            llmCallsCount: this.llmCalls.length,
            totalCost: this.totalCost,
            totalTokens: this.totalTokens,
            continuationActive: this.continuationState.isActive,
            retryCount: this.continuationState.retryCount
        };
    }
}

// Create singleton instance
const stateManager = new StateManager();

// Export for module use
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { StateManager, stateManager };
}

// Global access for existing code
window.stateManager = stateManager;

// Export legacy global variables for backward compatibility
window.currentRequest = null;
window.toolCallCycles = stateManager.toolCallCycles;
window.llmCalls = stateManager.llmCalls;
window.totalCost = stateManager.totalCost;
window.totalTokens = stateManager.totalTokens;
window.currentPersona = stateManager.currentPersona;
window.currentQuestions = stateManager.currentQuestions;
window.currentSetupData = stateManager.currentSetupData;
window.currentFormData = stateManager.currentFormData;
window.continuationState = stateManager.continuationState;