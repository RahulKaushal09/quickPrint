// What the corner pop-up may ask of the app.
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('panel', {
  onJobs: (fn) => ipcRenderer.on('jobs', (_e, jobs) => fn(jobs)),
  flip: (id) => ipcRenderer.invoke('flip', id),
  resize: (height) => ipcRenderer.send('panel-height', height),
  hide: () => ipcRenderer.send('panel-hide'),
  open: () => ipcRenderer.send('panel-open'),
});
