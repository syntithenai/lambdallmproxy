/**
 * Client Tool Registry
 * 
 * Central registry for all client-side tools
 */

import type { ClientTool } from './types';

export class ClientToolRegistry {
  private tools: Map<string, ClientTool> = new Map();

  register(tool: ClientTool): void {
    this.tools.set(tool.name, tool);
  }

  get(name: string): ClientTool | undefined {
    return this.tools.get(name);
  }

  isClientTool(name: string): boolean {
    return this.tools.has(name);
  }

  getEnabledTools(): ClientTool[] {
    return Array.from(this.tools.values()).filter(tool => tool.enabled);
  }

  getToolDefinitions(): any[] {
    return this.getEnabledTools().map(tool => ({
      type: 'function',
      function: {
        name: tool.name,
        description: tool.description,
        parameters: tool.parameters
      }
    }));
  }

  async execute(name: string, args: any): Promise<any> {
    const tool = this.get(name);
    if (!tool) {
      throw new Error(`Tool not found: ${name}`);
    }
    if (!tool.enabled) {
      throw new Error(`Tool not enabled: ${name}`);
    }
    return tool.execute(args);
  }
}

// Global registry instance
export const clientToolRegistry = new ClientToolRegistry();
