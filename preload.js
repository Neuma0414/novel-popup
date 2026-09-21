const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  hide: () => ipcRenderer.send('hide'),
  show: () => ipcRenderer.send('show'),
  toggle: () => ipcRenderer.send('toggle'),
  openFile: () => ipcRenderer.invoke('open-file'),
  getSample: () => ipcRenderer.invoke('get-sample'),
  getConfig: () => ipcRenderer.invoke('get-config'),
  saveConfig: (cfg) => ipcRenderer.invoke('save-config', cfg),
  loadFile: (p) => ipcRenderer.invoke('load-file', p),
  saveProgress: (prog) => ipcRenderer.invoke('save-progress', prog),
  saveProgressSync: (prog) => ipcRenderer.sendSync('save-progress-sync', prog),
  onSettings: (cb) => ipcRenderer.on('open-settings', () => cb()),
});
