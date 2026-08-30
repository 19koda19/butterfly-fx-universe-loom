'use strict';

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('cosmosAPI', Object.freeze({
  getDiagnostics: () => ipcRenderer.invoke('diagnostics:get'),
  saveJSON: (payload) => ipcRenderer.invoke('file:save-json', payload),
  savePNG: (payload) => ipcRenderer.invoke('file:save-png', payload),
  setFullscreen: (enabled) => ipcRenderer.invoke('window:set-fullscreen', Boolean(enabled))
}));
