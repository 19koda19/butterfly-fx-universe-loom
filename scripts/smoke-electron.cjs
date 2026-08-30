'use strict';

const { app, BrowserWindow, ipcMain } = require('electron');
const fs = require('node:fs/promises');
const path = require('node:path');

const gpuSmoke = process.env.BUTTERFLY_FX_GPU_SMOKE === '1';

if (!gpuSmoke) {
  app.commandLine.appendSwitch('headless');
  app.commandLine.appendSwitch('no-sandbox');
  app.commandLine.appendSwitch('ozone-platform', 'headless');
  app.commandLine.appendSwitch('use-gl', 'angle');
  app.commandLine.appendSwitch('use-angle', 'swiftshader');
  app.commandLine.appendSwitch('enable-unsafe-swiftshader');
  app.commandLine.appendSwitch('disable-dev-shm-usage');
}
app.commandLine.appendSwitch('enable-webgl');
app.commandLine.appendSwitch('disable-logging');

const errors = new Set();

ipcMain.handle('diagnostics:get', async () => ({
  electron: process.versions.electron,
  chromium: process.versions.chrome,
  platform: process.platform,
  hardwareAcceleration: app.isHardwareAccelerationEnabled(),
  featureStatus: app.getGPUFeatureStatus(),
  gpuInfo: await app.getGPUInfo('basic')
}));

ipcMain.handle('window:set-fullscreen', (event, enabled) => {
  const target = BrowserWindow.fromWebContents(event.sender);
  if (!target) return false;
  target.setFullScreen(Boolean(enabled));
  return target.isFullScreen();
});

app.whenReady().then(async () => {
  const window = new BrowserWindow({
    width: 1440,
    height: 900,
    show: gpuSmoke,
    backgroundColor: '#050711',
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
      backgroundThrottling: false,
      preload: path.join(__dirname, '..', 'electron', 'preload.cjs')
    }
  });

  window.webContents.on('console-message', (details) => {
    const level = details.level || 'info';
    const message = details.message || '';
    if (level === 'error' || /error|failed/i.test(message)) errors.add(`${level}: ${message}`);
  });
  window.webContents.on('did-fail-load', (_event, code, description) => {
    errors.add(`load ${code}: ${description}`);
  });

  await window.loadFile(path.join(__dirname, '..', 'src', 'index.html'));
  if (gpuSmoke) window.focus();
  await new Promise((resolve) => setTimeout(resolve, 4500));
  await window.webContents.executeJavaScript(`window.ButterflyFXDiagnostics?.renderOnce()`);
  await new Promise((resolve) => setTimeout(resolve, 250));

  const canvasBounds = await window.webContents.executeJavaScript(`(() => {
    const rect = document.querySelector('canvas').getBoundingClientRect();
    return { x: rect.x, y: rect.y, width: rect.width, height: rect.height };
  })()`);
  const start = { x: Math.round(canvasBounds.x + 24), y: Math.round(canvasBounds.y + canvasBounds.height * 0.54) };
  window.webContents.sendInputEvent({ type: 'mouseMove', ...start });
  window.webContents.sendInputEvent({ type: 'mouseDown', ...start, button: 'left', clickCount: 1 });
  await new Promise((resolve) => setTimeout(resolve, 30));
  for (let index = 1; index <= 32; index += 1) {
    const t = index / 32;
    window.webContents.sendInputEvent({
      type: 'mouseMove',
      x: Math.round(start.x + t * 320),
      y: Math.round(start.y + Math.sin(t * Math.PI * 2) * 62 - t * 35),
      movementX: 10,
      movementY: 0,
      button: 'left'
    });
    await new Promise((resolve) => setTimeout(resolve, 9));
  }
  window.webContents.sendInputEvent({
    type: 'mouseUp',
    x: start.x + 320,
    y: start.y - 35,
    button: 'left',
    clickCount: 1
  });
  await new Promise((resolve) => setTimeout(resolve, 500));
  await window.webContents.executeJavaScript(`window.ButterflyFXDiagnostics?.renderOnce()`);

  const report = await window.webContents.executeJavaScript(`({
    title: document.title,
    canvasCount: document.querySelectorAll('canvas').length,
    canvasSize: (() => { const c = document.querySelector('canvas'); return c ? [c.width, c.height] : null; })(),
    gpuLabel: document.querySelector('#gpu-label')?.textContent,
    fps: document.querySelector('#fps-label')?.textContent,
    shaderCopy: document.querySelector('#gpu-summary p')?.textContent,
    appHeight: document.querySelector('.app-shell')?.getBoundingClientRect().height,
    archiveText: document.querySelector('#universe-count')?.textContent,
    selectedUniverse: document.querySelector('#selected-name')?.textContent,
    bodyOverflow: getComputedStyle(document.body).overflow,
    dialogs: document.querySelectorAll('dialog').length
    ,engine: window.ButterflyFXDiagnostics?.status()
  })`);

  const screenshotPath = path.join('/tmp', 'butterfly-fx-smoke.png');
  const fullScreenshotPath = path.join('/tmp', 'butterfly-fx-full.png');
  const screensaverScreenshotPath = path.join('/tmp', 'butterfly-fx-screensaver.png');
  let screensaverReport = null;
  let compositionReport = null;
  const canvasDataUrl = await window.webContents.executeJavaScript(`document.querySelector('canvas')?.toDataURL('image/png') || null`);
  if (canvasDataUrl) {
    await fs.writeFile(screenshotPath, Buffer.from(canvasDataUrl.split(',')[1], 'base64'));
  } else {
    errors.add('Canvas screenshot unavailable');
  }
  if (gpuSmoke) {
    try {
      const fullImage = await window.webContents.capturePage();
      await fs.writeFile(fullScreenshotPath, fullImage.toPNG());

      await window.webContents.executeJavaScript(`document.querySelector('#screensaver-button').click(); document.querySelector('#start-screensaver').click();`);
      await new Promise((resolve) => setTimeout(resolve, 1400));
      await window.webContents.executeJavaScript(`window.ButterflyFXDiagnostics?.renderOnce()`);
      screensaverReport = await window.webContents.executeJavaScript(`({
        active: document.body.classList.contains('screensaver-mode'),
        canvasSize: (() => { const c = document.querySelector('canvas'); return [c.width, c.height]; })(),
        universeCount: window.ButterflyFXDiagnostics?.status().universeCount,
        status: document.querySelector('#screensaver-status')?.textContent
      })`);
      const screensaverImage = await window.webContents.capturePage();
      await fs.writeFile(screensaverScreenshotPath, screensaverImage.toPNG());
      await window.webContents.executeJavaScript(`document.querySelector('#screensaver-exit').click()`);
      await new Promise((resolve) => setTimeout(resolve, 350));
      compositionReport = await window.webContents.executeJavaScript(`(async () => {
        const button = document.querySelector('#focus-view-button');
        button.click();
        await new Promise(resolve => setTimeout(resolve, 80));
        window.ButterflyFXDiagnostics.renderOnce();
        const universeOnly = { label: button.textContent, state: window.ButterflyFXDiagnostics.status().focusView, sourceHidden: document.querySelector('.source-stage-label').hidden };
        button.click();
        await new Promise(resolve => setTimeout(resolve, 80));
        window.ButterflyFXDiagnostics.renderOnce();
        const mandelbrotOnly = { label: button.textContent, state: window.ButterflyFXDiagnostics.status().focusView, universeHidden: document.querySelector('.universe-stage-label').hidden };
        button.click();
        return { universeOnly, mandelbrotOnly, restored: window.ButterflyFXDiagnostics.status().focusView };
      })()`);
    } catch (error) {
      errors.add(`Full-window capture failed: ${error.message}`);
    }
  }
  const reportPath = path.join('/tmp', 'butterfly-fx-smoke-report.json');
  const payload = { report, screensaverReport, compositionReport, errors: [...errors], screenshotPath, fullScreenshotPath, screensaverScreenshotPath, reportPath };
  await fs.writeFile(reportPath, JSON.stringify(payload, null, 2));
  process.stdout.write(`Smoke report: ${reportPath}\n`);
  await window.close();
  app.quit();
  process.exitCode = errors.size ? 1 : 0;
}).catch((error) => {
  console.error(error);
  app.quit();
  process.exitCode = 1;
});
