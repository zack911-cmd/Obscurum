const { contextBridge, ipcRenderer } = require('electron');

/**
 * Everything exposed here becomes available in the renderer as `window.ghostshell`.
 * Keep this surface as narrow as possible — every method here is a method a
 * compromised renderer could call, so don't expose raw ipcRenderer.
 */
contextBridge.exposeInMainWorld('ghostshell', {
  // --- Window controls (frameless titlebar buttons) ---
  minimizeWindow: () => ipcRenderer.send('window:minimize'),
  maximizeWindow: () => ipcRenderer.send('window:maximize'),
  closeWindow: () => ipcRenderer.send('window:close'),

  // --- Ollama lifecycle ---
  ensureOllamaAvailable: () => ipcRenderer.invoke('ollama:ensure-available'),

  // --- Ollama API proxy (non-streaming) ---
  // Usage from React: await window.ghostshell.ollamaRequest('/api/tags', 'GET')
  ollamaRequest: (endpoint, method = 'GET', body = null) =>
    ipcRenderer.invoke('ollama:request', { endpoint, method, body }),

  // --- Ollama API proxy (streaming) ---
  // Usage from React:
  //   window.ghostshell.ollamaStream('/api/chat', { model, messages, stream: true }, {
  //     onChunk: (parsedJson) => { /* append parsedJson.message.content to UI */ },
  //     onEnd: () => { /* re-enable input, etc */ },
  //     onError: (err) => { /* show error toast */ },
  //   });
  // Returns a `cancel()` function you can call to stop listening early
  // (does NOT abort the underlying HTTP request to Ollama — see note below).
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
});