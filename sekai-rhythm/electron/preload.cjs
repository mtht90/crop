const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('sekaiNative', {
  isElectron: true,
  readStore: (name) => ipcRenderer.invoke('store:read', name),
  writeStore: (name, data) => ipcRenderer.invoke('store:write', name, data),
  toggleFullscreen: () => ipcRenderer.send('win:fullscreen'),
});
