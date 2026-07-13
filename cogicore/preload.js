/**
 * CogiCore — Electron Preload Script
 * Expose une API sécurisée (contextBridge) au renderer.
 * Le renderer n'a JAMAIS accès direct à Node/Electron.
 */
'use strict';

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  saveFile: (opts) => ipcRenderer.invoke('dialog:saveFile', opts),
  platform: process.platform,
  version:  process.env.npm_package_version || '1.0.0',
});
