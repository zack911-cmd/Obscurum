const { contextBridge, ipcRenderer } = require('electron');

// Exposes the Start button bridge used by splash.html
contextBridge.exposeInMainWorld('obscurum', {
  startApp: () => ipcRenderer.send('splash-start'),
});
