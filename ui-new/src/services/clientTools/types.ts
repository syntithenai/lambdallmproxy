/**
 * Client Tools - Type Definitions
 * 
 * Defines types for client-side tool execution
 */

export interface ClientTool {
  name: string;
  description: string;
  parameters: any;
  enabled: boolean;
  execute: (args: any) => Promise<any>;
}

