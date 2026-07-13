/**
 * CogiCore — Electron Main Process
 * Point d'entrée Electron. Charge l'app via BrowserWindow.loadFile()
 * (pas d'URL file: directe — évite les avertissements de sécurité CORS).
 */
'use strict';

const { app, BrowserWindow, ipcMain, dialog, shell } = require('electron');
const path = require('path');

// ── Sécurité : désactive la navigation vers des URLs externes ──
app.on('web-contents-created', (_, contents) => {
  contents.on('will-navigate', (e, url) => {
    if (!url.startsWith('file://')) { e.preventDefault(); }
  });
  contents.setWindowOpenHandler(() => ({ action: 'deny' }));
});

function createWindow() {
  const win = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 900,
    minHeight: 600,
    title: 'CogiCore ERP',
    icon: path.join(__dirname, 'assets', 'icon.png'),
    webPreferences: {
      nodeIntegration: false,          // sécurité : pas d'accès Node depuis le renderer
      contextIsolation: true,          // isolation du contexte
      preload: path.join(__dirname, 'preload.js'),
      devTools: !app.isPackaged,       // DevTools en développement uniquement
    },
  });

  win.loadFile(path.join(__dirname, 'renderer', 'index.html'));

  // Ouvre les liens <a target="_blank"> dans le navigateur système
  win.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });
}

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});

// ── IPC : dialogue de sauvegarde fichier (PDF, CSV) ──
ipcMain.handle('dialog:saveFile', async (_, { defaultPath, filters }) => {
  const { canceled, filePath } = await dialog.showSaveDialog({ defaultPath, filters });
  return canceled ? null : filePath;
});
