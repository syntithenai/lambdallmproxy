/**
 * Client Tools - Type Definitions
 * 
 * Defines types for browser features that can be executed client-side
 */

export type BrowserFeatureType = 
  | 'javascript'
  | 'storage_read'
  | 'storage_write'
  | 'clipboard_read'
  | 'clipboard_write'
  | 'notification'
  | 'geolocation'
  | 'file_read'
  | 'screenshot'
  | 'dom_query'
  | 'dom_manipulate';

export type RiskLevel = 'low' | 'medium' | 'high';

export type CodeReviewMode = 'always' | 'risky-only' | 'timeout';

export interface BrowserFeaturePermissions {
  javascript: boolean;
  storage_read: boolean;
  storage_write: boolean;
  clipboard_read: boolean;
  clipboard_write: boolean;
  notification: boolean;
  geolocation: boolean;
  file_read: boolean;
  screenshot: boolean;
  dom_query: boolean;
  dom_manipulate: boolean;
}

export interface BrowserFeatureConfig {
  permissions: BrowserFeaturePermissions;
  codeReviewMode: CodeReviewMode;
  autoApproveTimeout: number; // seconds
}

export interface ExecutionHistoryEntry {
  id: string;
  feature: BrowserFeatureType;
  description: string;
  timestamp: number;
  duration: number;
  success: boolean;
  code?: string;
  args: any;
  result: any;
  error?: string;
  edited: boolean;
}

export interface CodeReviewRequest {
  id: string;
  feature: BrowserFeatureType;
  description: string;
  code?: string;
  args: any;
  riskLevel: RiskLevel;
  timestamp: number;
}

export interface ClientTool {
  name: string;
  description: string;
  parameters: any;
  enabled: boolean;
  execute: (args: any) => Promise<any>;
}

export interface BrowserFeatureResult {
  success: boolean;
  result?: any;
  error?: string;
  description?: string;
  metadata?: Record<string, any>;
}
