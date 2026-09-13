// Stub type declarations for Pi extension API
// These types mirror the @oh-my-pi/pi-coding-agent package interface

declare module '@oh-my-pi/pi-coding-agent' {
  export interface ToolSpec {
    name: string;
    label: string;
    description: string;
    parameters?: Record<string, { type: string; description: string; default?: any }>;
    execute: (id: string, params: any) => Promise<any>;
  }

  export interface ExtensionAPI {
    registerTool(tool: ToolSpec): void;
    setInterval(fn: () => Promise<void>, ms: number): NodeJS.Timeout;
    sendMessage(message: { role: string; content: string }): Promise<void>;
    callTool(name: string, params?: any): Promise<any>;
    log(message: string): void;
  }
}
