/**
 * useBrowserFeatures Hook
 * 
 * Manages browser feature execution, code review, and history tracking
 */

import { useState, useCallback, useRef } from 'react';
import type { 
  BrowserFeatureType, 
  CodeReviewRequest, 
  ExecutionHistoryEntry,
  BrowserFeatureResult
} from '../services/clientTools';
import { 
  executeBrowserFeature, 
  getFeatureRiskLevel, 
  requiresCodeReview 
} from '../services/clientTools/tools/ExecuteBrowserFeature';
import { loadBrowserFeaturesConfig } from '../components/BrowserFeaturesSettings';
import { addExecutionHistoryEntry } from '../components/ExecutionHistoryPanel';

interface UseBrowserFeaturesReturn {
  // Code review state
  codeReviewRequest: CodeReviewRequest | null;
  showCodeReview: boolean;
  
  // Actions
  handleBrowserFeatureCall: (toolCall: any) => Promise<any>;
  approveCodeReview: (editedCode?: string) => Promise<void>;
  rejectCodeReview: () => void;
  alwaysAllowCodeReview: () => void;
  
  // Session approvals
  sessionApprovals: Set<string>;
}

/**
 * Browser Features Hook
 */
export function useBrowserFeatures(): UseBrowserFeaturesReturn {
  const [codeReviewRequest, setCodeReviewRequest] = useState<CodeReviewRequest | null>(null);
  const [showCodeReview, setShowCodeReview] = useState(false);
  const [sessionApprovals, setSessionApprovals] = useState<Set<string>>(new Set());
  
  // Store pending execution for approval
  const pendingExecutionRef = useRef<{
    resolve: (value: any) => void;
    reject: (error: any) => void;
    args: any;
    feature: BrowserFeatureType;
  } | null>(null);

  /**
   * Generate hash for code to check session approvals
   */
  const hashCode = useCallback((str: string): string => {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32-bit integer
    }
    return hash.toString(36);
  }, []);

  /**
   * Check if code review is needed
   */
  const needsCodeReview = useCallback((feature: BrowserFeatureType, code?: string): boolean => {
    const config = loadBrowserFeaturesConfig();
    
    // Check if always allowed for this session
    if (code) {
      const codeHash = hashCode(code);
      if (sessionApprovals.has(codeHash)) {
        return false;
      }
    }
    
    // Check code review mode
    return requiresCodeReview(feature, config.codeReviewMode);
  }, [hashCode, sessionApprovals]);

  /**
   * Handle browser feature tool call
   */
  const handleBrowserFeatureCall = useCallback(async (toolCall: any): Promise<any> => {
    try {
      const args = typeof toolCall.function?.arguments === 'string'
        ? JSON.parse(toolCall.function.arguments)
        : toolCall.function?.arguments || {};
      
      const feature: BrowserFeatureType = args.feature;
      const config = loadBrowserFeaturesConfig();
      
      // Check if feature is enabled
      if (!config.permissions[feature]) {
        return {
          success: false,
          error: `Feature "${feature}" is not enabled. Enable it in Settings > Browser.`
        };
      }
      
      const code = args.code || args.manipulation_code;
      const description = args.description || `Execute ${feature}`;
      
      // Check if code review is needed
      if (needsCodeReview(feature, code)) {
        // Create code review request
        const request: CodeReviewRequest = {
          id: Math.random().toString(36).substring(7),
          feature,
          description,
          code,
          args,
          riskLevel: getFeatureRiskLevel(feature),
          timestamp: Date.now()
        };
        
        // Show code review dialog and wait for approval
        return new Promise((resolve, reject) => {
          pendingExecutionRef.current = { resolve, reject, args, feature };
          setCodeReviewRequest(request);
          setShowCodeReview(true);
          
          // Auto-approve timeout if enabled
          if (config.codeReviewMode === 'timeout') {
            setTimeout(() => {
              if (pendingExecutionRef.current) {
                console.log('Auto-approving after timeout');
                approveCodeReview();
              }
            }, config.autoApproveTimeout * 1000);
          }
        });
      }
      
      // Execute without review
      const startTime = Date.now();
      const result = await executeBrowserFeature(args);
      const duration = Date.now() - startTime;
      
      // Add to history
      const historyEntry: ExecutionHistoryEntry = {
        id: Math.random().toString(36).substring(7),
        feature,
        description,
        timestamp: startTime,
        duration,
        success: result.success,
        code,
        args,
        result: result.result,
        error: result.error,
        edited: false
      };
      addExecutionHistoryEntry(historyEntry);
      
      return result;
    } catch (error: any) {
      console.error('Browser feature execution error:', error);
      return {
        success: false,
        error: error.message || 'Execution failed'
      };
    }
  }, [needsCodeReview]);

  /**
   * Approve code review and execute
   */
  const approveCodeReview = useCallback(async (editedCode?: string) => {
    if (!pendingExecutionRef.current || !codeReviewRequest) return;
    
    const { resolve, args, feature } = pendingExecutionRef.current;
    const startTime = Date.now();
    
    try {
      // Update args with edited code if provided
      let finalArgs = args;
      if (editedCode) {
        if (args.code) {
          finalArgs = { ...args, code: editedCode };
        } else if (args.manipulation_code) {
          finalArgs = { ...args, manipulation_code: editedCode };
        }
      }
      
      // Execute
      const result: BrowserFeatureResult = await executeBrowserFeature(finalArgs);
      const duration = Date.now() - startTime;
      
      // Add to history
      const historyEntry: ExecutionHistoryEntry = {
        id: Math.random().toString(36).substring(7),
        feature,
        description: codeReviewRequest.description,
        timestamp: startTime,
        duration,
        success: result.success,
        code: editedCode || codeReviewRequest.code,
        args: finalArgs,
        result: result.result,
        error: result.error,
        edited: !!editedCode
      };
      addExecutionHistoryEntry(historyEntry);
      
      // Resolve promise
      resolve(result);
    } catch (error: any) {
      console.error('Execution error:', error);
      resolve({
        success: false,
        error: error.message || 'Execution failed'
      });
    } finally {
      // Clean up
      pendingExecutionRef.current = null;
      setCodeReviewRequest(null);
      setShowCodeReview(false);
    }
  }, [codeReviewRequest]);

  /**
   * Reject code review
   */
  const rejectCodeReview = useCallback(() => {
    if (!pendingExecutionRef.current) return;
    
    const { resolve } = pendingExecutionRef.current;
    
    // Resolve with rejection message
    resolve({
      success: false,
      error: 'Code review rejected by user'
    });
    
    // Clean up
    pendingExecutionRef.current = null;
    setCodeReviewRequest(null);
    setShowCodeReview(false);
  }, []);

  /**
   * Always allow this code for this session
   */
  const alwaysAllowCodeReview = useCallback(() => {
    if (!codeReviewRequest?.code) return;
    
    const codeHash = hashCode(codeReviewRequest.code);
    setSessionApprovals(prev => new Set(prev).add(codeHash));
    
    // Execute
    approveCodeReview();
  }, [codeReviewRequest, hashCode, approveCodeReview]);

  return {
    codeReviewRequest,
    showCodeReview,
    handleBrowserFeatureCall,
    approveCodeReview,
    rejectCodeReview,
    alwaysAllowCodeReview,
    sessionApprovals
  };
}
