export interface ElectronAPI {
  minimize?: () => void;
  maximize?: () => void;
  close?: () => void;

  // Threat Intelligence API proxies
  fetchCISAKEV?: () => Promise<{ success: boolean; data?: any; error?: string }>;
  fetchNVDRecent?: () => Promise<{ success: boolean; data?: any; error?: string }>;
  fetchCIRCLLatest?: () => Promise<{ success: boolean; data?: any; error?: string }>;
  searchNVD?: (keyword: string) => Promise<{ success: boolean; data?: any; error?: string }>;
}

declare global {
  interface Window {
    ghostshell?: {
      minimizeWindow?: () => void;
      maximizeWindow?: () => void;
      closeWindow?: () => void;
      ensureOllamaAvailable?: () => Promise<'running' | 'launched' | 'not_found'>;
      ollamaRequest?: (endpoint: string, method?: string, body?: unknown) => Promise<{
        stream: any; status: number; data: unknown 
}>;
    };
    electronAPI?: ElectronAPI;
  }
}