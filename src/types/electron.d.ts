export interface ElectronAPI {
  [x: string]: any;
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
      getSystemInfo(): any;
      minimizeWindow?: () => void;
      maximizeWindow?: () => void;
      closeWindow?: () => void;
      ensureOllamaAvailable?: () => Promise<'running' | 'launched' | 'not_found'>;
      ollamaRequest?: (endpoint: string, method?: string, body?: unknown) => Promise<{
        stream: any; status: number; data: unknown
}>;
      ollamaStream?: (
        endpoint: string,
        body: unknown,
        callbacks: {
          onChunk?: (data: unknown) => void;
          onEnd?: () => void;
          onError?: (err: { message: string; raw?: string }) => void;
        }
      ) => { cancel: () => void; requestId: string };
      secureStore?: {
        get: (key: string) => Promise<{ ok: boolean; value?: any; error?: string }>;
        set: (key: string, value: any) => Promise<{ ok: boolean; error?: string }>;
        delete: (key: string) => Promise<{ ok: boolean; error?: string }>;
      };
    };
    electronAPI?: ElectronAPI;
  }
}