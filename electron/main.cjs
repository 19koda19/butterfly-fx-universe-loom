'use strict';

const { app, BrowserWindow, dialog, ipcMain, shell } = require('electron');
const fs = require('node:fs/promises');
const path = require('node:path');

// Chromium normally enables hardware acceleration. These conservative switches
// keep canvas rasterization and buffer transfers on the GPU when supported.
app.commandLine.appendSwitch('enable-gpu-rasterization');
app.commandLine.appendSwitch('enable-zero-copy');

let mainWindow = null;
let gpuCrash = null;

function safeFilename(value, extension) {
  const clean = String(value || 'universe')
    .replace(/[^a-z0-9_-]+/gi, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 72) || 'universe';
  return `${clean}.${extension}`;
}

async function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1540,
    height: 960,
    minWidth: 1080,
    minHeight: 700,
    backgroundColor: '#050711',
    show: false,
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
      allowRunningInsecureContent: false,
      backgroundThrottling: false
    }
  });

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('https://')) shell.openExternal(url);
    return { action: 'deny' };
  });

  mainWindow.webContents.on('will-navigate', (event, url) => {
    if (url !== mainWindow.webContents.getURL()) event.preventDefault();
  });

  mainWindow.webContents.on('render-process-gone', (_event, details) => {
    gpuCrash = { reason: details.reason, exitCode: details.exitCode, at: Date.now() };
  });

  mainWindow.once('ready-to-show', () => mainWindow?.show());
  await mainWindow.loadFile(path.join(__dirname, '..', 'src', 'index.html'));

  if (process.argv.includes('--dev')) {
    mainWindow.webContents.openDevTools({ mode: 'detach' });
  }
}

ipcMain.handle('diagnostics:get', async () => {
  let gpuInfo = {};
  try {
    gpuInfo = await app.getGPUInfo('basic');
  } catch (error) {
    gpuInfo = { error: error.message };
  }

  return {
    electron: process.versions.electron,
    chromium: process.versions.chrome,
    node: process.versions.node,
    platform: process.platform,
    hardwareAcceleration: app.isHardwareAccelerationEnabled(),
    featureStatus: app.getGPUFeatureStatus(),
    gpuInfo,
    gpuCrash
  };
});

ipcMain.handle('file:save-json', async (_event, { suggestedName, json }) => {
  if (!mainWindow || typeof json !== 'string') return { canceled: true };
  const result = await dialog.showSaveDialog(mainWindow, {
    title: 'Bottle this universe genome',
    defaultPath: safeFilename(suggestedName, 'universe.json'),
    filters: [{ name: 'Universe genome', extensions: ['json'] }]
  });
  if (result.canceled || !result.filePath) return { canceled: true };
  await fs.writeFile(result.filePath, json, 'utf8');
  return { canceled: false, filePath: result.filePath };
});

ipcMain.handle('file:save-png', async (_event, { suggestedName, dataUrl }) => {
  if (!mainWindow || typeof dataUrl !== 'string') return { canceled: true };
  const match = /^data:image\/png;base64,(.+)$/.exec(dataUrl);
  if (!match) throw new Error('Invalid PNG payload');
  const result = await dialog.showSaveDialog(mainWindow, {
    title: 'Export universe image',
    defaultPath: safeFilename(suggestedName, 'png'),
    filters: [{ name: 'PNG image', extensions: ['png'] }]
  });
  if (result.canceled || !result.filePath) return { canceled: true };
  await fs.writeFile(result.filePath, Buffer.from(match[1], 'base64'));
  return { canceled: false, filePath: result.filePath };
});

ipcMain.handle('window:set-fullscreen', (event, enabled) => {
  const window = BrowserWindow.fromWebContents(event.sender);
  if (!window) return false;
  window.setFullScreen(Boolean(enabled));
  return window.isFullScreen();
});

app.whenReady().then(createWindow);

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
