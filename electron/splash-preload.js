const { contextBridge, ipcRenderer } = require('electron');

// Bridge used by splash.html
contextBridge.exposeInMainWorld('obscurum', {
  startApp: () => ipcRenderer.send('splash-start'),
  closeApp: () => ipcRenderer.send('splash-close'),
});
