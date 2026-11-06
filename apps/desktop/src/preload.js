// The only desktop features the dashboard can reach.
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('seedhaPrintDesktop', {
  pair: (code, server) => ipcRenderer.invoke('pair', code, server),
  deviceId: () => ipcRenderer.invoke('device-id'),
});
