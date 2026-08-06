const { contextBridge, ipcRenderer } = require('electron');

/**
 * Everything exposed here becomes available in the renderer as `window.obscurum`.
 * Keep this surface as narrow as possible — every method here is a method a
 * compromised renderer could call, so don't expose raw ipcRenderer.
 */
contextBridge.exposeInMainWorld('obscurum', {
  // --- Window controls (frameless titlebar buttons) ---
  minimizeWindow: () => ipcRenderer.send('window:minimize'),
  maximizeWindow: () => ipcRenderer.send('window:maximize'),
  closeWindow: () => ipcRenderer.send('window:close'),

  // --- Ollama lifecycle ---
  ensureOllamaAvailable: () => ipcRenderer.invoke('ollama:ensure-available'),

  // --- Ollama API proxy (non-streaming) ---
  ollamaRequest: async (endpoint, method = 'GET', body = null) => {
    try {
      const result = await ipcRenderer.invoke('ollama:request', { endpoint, method, body });
      // Handle both { status, data } and direct response formats
      if (result && typeof result === 'object') {
        // If it's already in the expected format
        if ('status' in result && 'data' in result) {
          return result;
        }
        // If it's a direct response from Ollama
        if ('models' in result || 'model' in result) {
          return { status: 200, data: result };
        }
        // If it's an error response
        if ('error' in result) {
          return { status: result.status || 500, data: null, error: result.error };
        }
      }
      return { status: 200, data: result };
    } catch (err) {
      console.error('ollamaRequest error:', err);
      return { status: 500, data: null, error: err.message };
    }
  },

  // --- Ollama API proxy (streaming) ---
  ollamaStream: (endpoint, body, { onChunk, onEnd, onError }) => {
    const requestId = `${Date.now()}-${Math.random().toString(36).slice(2)}`;

    const chunkChannel = `ollama:stream-chunk:${requestId}`;
    const endChannel = `ollama:stream-end:${requestId}`;
    const errorChannel = `ollama:stream-error:${requestId}`;

    const chunkListener = (_event, data) => onChunk?.(data);
    const endListener = () => {
      cleanup();
      onEnd?.();
    };
    const errorListener = (_event, err) => {
      cleanup();
      onError?.(err);
    };

    function cleanup() {
      ipcRenderer.removeListener(chunkChannel, chunkListener);
      ipcRenderer.removeListener(endChannel, endListener);
      ipcRenderer.removeListener(errorChannel, errorListener);
    }

    ipcRenderer.on(chunkChannel, chunkListener);
    ipcRenderer.on(endChannel, endListener);
    ipcRenderer.on(errorChannel, errorListener);

    ipcRenderer.send('ollama:stream-start', { requestId, endpoint, method: 'POST', body });

    return { cancel: cleanup, requestId };
  },

  // --- Phase‑1: Encrypted secure storage ---
  secureStore: {
    set: (key, value) => ipcRenderer.invoke('secure-store:set', key, value),
    get: (key) => ipcRenderer.invoke('secure-store:get', key),
    delete: (key) => ipcRenderer.invoke('secure-store:delete', key),
  },

  // ────────────────────────────────────────────────────────────────────────────
  // System Information — actual gathering happens in main.cjs (see system:info
  // handler), since preload runs sandboxed and can't require() systeminformation
  // directly. This just forwards the request over IPC.
  // ────────────────────────────────────────────────────────────────────────────
  getSystemInfo: () => ipcRenderer.invoke('system:info'),
});
