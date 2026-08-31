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

function expect(condition, message) {
  if (!condition) errors.add(`assertion: ${message}`);
}

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
    const location = details.sourceId
      ? ` (${details.sourceId}${details.lineNumber ? `:${details.lineNumber}` : ''})`
      : '';
    if (level === 'error' || /error|failed/i.test(message)) errors.add(`${level}: ${message}${location}`);
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
  const mandelbrotCinematicScreenshotPath = path.join('/tmp', 'butterfly-fx-mandelbrot-cinematic.png');
  const buddhabrotScreenshotPath = path.join('/tmp', 'butterfly-fx-buddhabrot.png');
  const zoomScreenshotPath = path.join('/tmp', 'butterfly-fx-universe-zoom.png');
  const screensaverScreenshotPath = path.join('/tmp', 'butterfly-fx-screensaver.png');
  const reciprocityScreenshotPath = path.join('/tmp', 'butterfly-fx-reciprocity.png');
  let buddhabrotReport = null;
  let mandelbrotCinematicReport = null;
  let annularReport = null;
  let screensaverReport = null;
  let compositionReport = null;
  let zoomReport = null;
  let wheelReport = null;
  let panReport = null;
  let cameraPersistenceReport = null;
  let reciprocityReport = null;
  expect(report.canvasCount === 1, 'exactly one p5 canvas should exist');
  expect(report.engine?.sourceVisual === 'mandelbrot', 'Mandelbrot should be the default source microscope');
  expect(report.engine?.universeCount >= 1 || !gpuSmoke, 'draw gesture should create a universe in GPU mode');
  expect(!report.engine?.shaderError, 'shader initialization should complete without an error');
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
      await new Promise((resolve) => setTimeout(resolve, 6100));
      mandelbrotCinematicReport = await window.webContents.executeJavaScript(`(() => {
        const engine = window.ButterflyFXDiagnostics.status();
        const target = engine.screensaverFractalTarget;
        return {
          active: engine.screensaverActive,
          sourceVisual: engine.sourceVisual,
          sourceTitle: document.querySelector('#source-stage-title')?.textContent,
          home: engine.screensaverFractalHome,
          target,
          view: engine.fractalView,
          camera: engine.universeCamera,
          targetSample: target ? window.CosmoMath.mandelbrotSample(target.x, target.y, 180) : null
        };
      })()`);
      expect(mandelbrotCinematicReport.active, 'default Mandelbrot cinematic should enter Autogen');
      expect(mandelbrotCinematicReport.sourceVisual === 'mandelbrot' && /MANDELBROT/i.test(mandelbrotCinematicReport.sourceTitle || ''), 'Autogen should keep Mandelbrot as the default source microscope');
      expect(mandelbrotCinematicReport.target?.scale < mandelbrotCinematicReport.home?.scale / 3, 'default Mandelbrot cinematic should make a deep boundary dive');
      expect(mandelbrotCinematicReport.targetSample && !mandelbrotCinematicReport.targetSample.interior, 'default Mandelbrot cinematic should favor an escaped boundary-detail point');
      expect(Boolean(mandelbrotCinematicReport.camera?.inspectId), 'default Mandelbrot cinematic should pair its source dive with a galaxy target');
      const mandelbrotCinematicImage = await window.webContents.capturePage();
      await fs.writeFile(mandelbrotCinematicScreenshotPath, mandelbrotCinematicImage.toPNG());
      await window.webContents.executeJavaScript(`document.querySelector('#screensaver-exit').click()`);
      // Electron can report the click before the native fullscreen transition and
      // follow-up canvas resize have settled. Pointer tests need stable bounds.
      await new Promise((resolve) => setTimeout(resolve, 1200));

      await window.webContents.executeJavaScript(`document.querySelector('[data-source-visual="buddhabrot"]').click()`);
      await new Promise((resolve) => setTimeout(resolve, 450));
      const initialBuddhabrot = await window.webContents.executeJavaScript(`(() => {
        const engine = window.ButterflyFXDiagnostics.status();
        const button = document.querySelector('[data-source-visual="buddhabrot"]');
        return {
          sourceVisual: engine.sourceVisual,
          renderer: engine.buddhabrot,
          active: button?.classList.contains('is-active'),
          pressed: button?.getAttribute('aria-pressed'),
          title: document.querySelector('#source-stage-title')?.textContent,
          sourceState: document.querySelector('#source-state')?.textContent,
          toast: document.querySelector('#toast')?.textContent
        };
      })()`);
      await new Promise((resolve) => setTimeout(resolve, 1350));
      await window.webContents.executeJavaScript(`window.ButterflyFXDiagnostics?.renderOnce()`);
      await new Promise((resolve) => setTimeout(resolve, 180));
      const sustainedBuddhabrot = await window.webContents.executeJavaScript(`(() => {
        const engine = window.ButterflyFXDiagnostics.status();
        const button = document.querySelector('[data-source-visual="buddhabrot"]');
        return {
          sourceVisual: engine.sourceVisual,
          renderer: engine.buddhabrot,
          active: button?.classList.contains('is-active'),
          pressed: button?.getAttribute('aria-pressed'),
          title: document.querySelector('#source-stage-title')?.textContent,
          sourceState: document.querySelector('#source-state')?.textContent,
          toast: document.querySelector('#toast')?.textContent
        };
      })()`);
      buddhabrotReport = { initial: initialBuddhabrot, sustained: sustainedBuddhabrot, final: null };
      expect(initialBuddhabrot.sourceVisual === 'buddhabrot' && initialBuddhabrot.active && initialBuddhabrot.pressed === 'true', 'BUDDHABROT control should activate the orbit-density source');
      expect(sustainedBuddhabrot.sourceVisual === 'buddhabrot' && sustainedBuddhabrot.active && sustainedBuddhabrot.pressed === 'true', 'Buddhabrot should stay active while its GPU accumulator advances');
      expect(sustainedBuddhabrot.renderer?.supported === true, 'Buddhabrot renderer should report WebGL2 support');
      expect(!sustainedBuddhabrot.renderer?.error, 'Buddhabrot renderer should remain error-free');
      expect(sustainedBuddhabrot.renderer?.samples > 0, 'Buddhabrot should accumulate nonzero parameter samples');
      expect(sustainedBuddhabrot.renderer?.escapedSamples > 0, 'Buddhabrot should accumulate escaped parameter samples');
      expect(sustainedBuddhabrot.renderer?.orbitPoints > 0, 'Buddhabrot should draw nonzero escaped-orbit points');
      expect(sustainedBuddhabrot.renderer?.batches > 0, 'Buddhabrot should complete at least one accumulation batch');
      expect(sustainedBuddhabrot.renderer?.samples > (initialBuddhabrot.renderer?.samples || 0), 'Buddhabrot sample count should advance while the source remains active');
      expect(Boolean(sustainedBuddhabrot.renderer?.accumulationFormat), 'Buddhabrot should expose its GPU accumulation format');
      expect(/BUDDHABROT/i.test(sustainedBuddhabrot.title || '') && /Z-ORBIT/i.test(sustainedBuddhabrot.sourceState || ''), 'Buddhabrot stage UI should expose orbit-density status');
      const buddhabrotImage = await window.webContents.capturePage();
      await fs.writeFile(buddhabrotScreenshotPath, buddhabrotImage.toPNG());

      await window.webContents.executeJavaScript(`document.querySelector('#focus-view-button').click()`);
      await new Promise((resolve) => setTimeout(resolve, 220));
      const zoomGeometry = await window.webContents.executeJavaScript(`(() => {
        const canvas = document.querySelector('canvas').getBoundingClientRect();
        const status = window.ButterflyFXDiagnostics.status();
        return {
          x: Math.round(canvas.x + status.layout.cosmos.x + status.layout.cosmos.w * 0.68),
          y: Math.round(canvas.y + status.layout.cosmos.y + status.layout.cosmos.h * 0.46),
          width: status.layout.cosmos.w,
          height: status.layout.cosmos.h,
          before: status.universeCamera,
          originalId: status.selectedUniverseId,
          fractalView: status.fractalView
        };
      })()`);
      window.webContents.sendInputEvent({ type: 'mouseMove', x: zoomGeometry.x, y: zoomGeometry.y });
      await window.webContents.executeJavaScript(`window.dispatchEvent(new MouseEvent('mousemove', {
        clientX: ${zoomGeometry.x},
        clientY: ${zoomGeometry.y},
        bubbles: true,
        cancelable: true
      }))`);
      await new Promise((resolve) => setTimeout(resolve, 80));
      const pointerBeforeWheel = await window.webContents.executeJavaScript(`window.ButterflyFXDiagnostics.status().pointer`);
      await window.webContents.executeJavaScript(`window.dispatchEvent(new WheelEvent('wheel', {
        deltaX: 0,
        deltaY: -420,
        deltaMode: 0,
        clientX: ${zoomGeometry.x},
        clientY: ${zoomGeometry.y},
        bubbles: true,
        cancelable: true
      }))`);
      await new Promise((resolve) => setTimeout(resolve, 950));
      const afterWheel = await window.webContents.executeJavaScript(`window.ButterflyFXDiagnostics.status()`);
      wheelReport = { pointer: pointerBeforeWheel, target: { x: zoomGeometry.x, y: zoomGeometry.y }, before: zoomGeometry.before, after: afterWheel.universeCamera };
      expect(afterWheel.universeCamera.targetScale < zoomGeometry.before.targetScale * 0.8, 'wheel over the universe should increase universe magnification');
      expect(JSON.stringify(afterWheel.fractalView) === JSON.stringify(zoomGeometry.fractalView), 'universe zoom must not alter the Mandelbrot camera');

      window.webContents.sendInputEvent({ type: 'mouseDown', x: zoomGeometry.x, y: zoomGeometry.y, button: 'left', clickCount: 1 });
      await new Promise((resolve) => setTimeout(resolve, 45));
      const panStart = await window.webContents.executeJavaScript(`({ pointer: window.ButterflyFXDiagnostics.status().pointer, active: window.ButterflyFXDiagnostics.status().cosmosPanning })`);
      for (let step = 1; step <= 5; step += 1) {
        window.webContents.sendInputEvent({
          type: 'mouseMove',
          x: zoomGeometry.x + Math.round(76 * step / 5),
          y: zoomGeometry.y + Math.round(38 * step / 5),
          movementX: Math.round(76 / 5),
          movementY: Math.round(38 / 5),
          button: 'left'
        });
        await new Promise((resolve) => setTimeout(resolve, 28));
      }
      window.webContents.sendInputEvent({ type: 'mouseUp', x: zoomGeometry.x + 76, y: zoomGeometry.y + 38, button: 'left', clickCount: 1 });
      await window.webContents.executeJavaScript(`window.dispatchEvent(new MouseEvent('mouseup', {
        button: 0,
        buttons: 0,
        clientX: ${zoomGeometry.x + 76},
        clientY: ${zoomGeometry.y + 38},
        bubbles: true,
        cancelable: true
      }))`);
      await new Promise((resolve) => setTimeout(resolve, 180));
      const afterPan = await window.webContents.executeJavaScript(`window.ButterflyFXDiagnostics.status()`);
      panReport = { start: panStart, released: !afterPan.cosmosPanning, before: afterWheel.universeCamera, after: afterPan.universeCamera };
      expect(Math.abs(afterPan.universeCamera.x - afterWheel.universeCamera.x) > 0.001
        || Math.abs(afterPan.universeCamera.y - afterWheel.universeCamera.y) > 0.001, 'dragging inside the universe should pan its camera');
      expect(!afterPan.cosmosPanning, 'universe pan should finish on mouse release');

      await window.webContents.executeJavaScript(`document.querySelector('#cosmos-camera-reset').click()`);
      await new Promise((resolve) => setTimeout(resolve, 1200));
      const afterReset = await window.webContents.executeJavaScript(`window.ButterflyFXDiagnostics.status()`);
      expect(Math.abs(afterReset.universeCamera.targetScale - 1) < 1e-12, 'FRAME should target the complete universe');

      await window.webContents.executeJavaScript(`document.querySelector('#inspect-tension').click()`);
      await new Promise((resolve) => setTimeout(resolve, 1900));
      zoomReport = await window.webContents.executeJavaScript(`({
        camera: window.ButterflyFXDiagnostics.status().universeCamera,
        focusView: window.ButterflyFXDiagnostics.status().focusView,
        inspectedGalaxy: window.ButterflyFXDiagnostics.status().inspectedGalaxy,
        label: document.querySelector('#cosmos-zoom-level')?.textContent,
        target: document.querySelector('#cosmos-target-label')?.textContent,
        reason: document.querySelector('#cosmos-target-reason')?.textContent,
        evidence: document.querySelector('#cosmos-target-evidence')?.textContent,
        evidenceVisible: !document.querySelector('#cosmos-target-evidence')?.hidden,
        inspectButton: document.querySelector('#inspect-tension')?.textContent,
        selectedRings: document.querySelector('#selected-rings')?.textContent,
        selectedRingChannel: document.querySelector('#selected-ring-channel')?.textContent,
        cameraVisible: !document.querySelector('#cosmos-camera')?.hidden
      })`);
      annularReport = zoomReport;
      expect(zoomReport.camera.zoom > 20, 'odd-galaxy inspector should dive beyond 20x');
      expect(Boolean(zoomReport.camera.inspectId), 'odd-galaxy inspector should identify a galaxy');
      expect(/TENSION/i.test(zoomReport.target || ''), 'zoom panel should expose formation tension explicitly');
      expect(zoomReport.inspectedGalaxy?.id === zoomReport.camera.inspectId, 'annular inspector diagnostics should match the camera target');
      expect(zoomReport.inspectedGalaxy?.morphology?.family === 'ANNULAR', 'INSPECT STRANGE RING should target a generated annular galaxy');
      expect(zoomReport.inspectedGalaxy?.haloProxy?.model === 'TOY_HALO_PROXY', 'inspected annular galaxy should carry its toy halo proxy');
      expect(/RING|ANNULUS|ANNULAR/i.test(`${zoomReport.target || ''} ${zoomReport.inspectButton || ''}`), 'annular inspection UI should identify the ring morphology');
      expect(Number.parseInt(zoomReport.selectedRings, 10) > 0, 'selected universe UI should report generated ring systems');
      expect(Boolean(zoomReport.selectedRingChannel) && zoomReport.selectedRingChannel !== '—', 'selected universe UI should expose an annular formation channel');
      expect(zoomReport.evidenceVisible && /HALO|OFFSET|SUPPORT|CHANNEL|DARK/i.test(`${zoomReport.reason || ''} ${zoomReport.evidence || ''}`), 'annular camera UI should expose halo or formation-channel evidence');
      const zoomImage = await window.webContents.capturePage();
      await fs.writeFile(zoomScreenshotPath, zoomImage.toPNG());

      await window.webContents.executeJavaScript(`document.querySelector('#focus-view-button').click(); document.querySelector('#focus-view-button').click();`);
      await new Promise((resolve) => setTimeout(resolve, 220));
      await window.webContents.executeJavaScript(`document.querySelector('#screensaver-button').click(); document.querySelector('#start-screensaver').click();`);
      await new Promise((resolve) => setTimeout(resolve, 6100));
      await window.webContents.executeJavaScript(`window.ButterflyFXDiagnostics?.renderOnce()`);
      screensaverReport = await window.webContents.executeJavaScript(`({
        active: document.body.classList.contains('screensaver-mode'),
        canvasSize: (() => { const c = document.querySelector('canvas'); return [c.width, c.height]; })(),
        universeCount: window.ButterflyFXDiagnostics?.status().universeCount,
        status: document.querySelector('#screensaver-status')?.textContent,
        camera: window.ButterflyFXDiagnostics?.status().universeCamera,
        fractalView: window.ButterflyFXDiagnostics?.status().fractalView,
        fractalHome: window.ButterflyFXDiagnostics?.status().screensaverFractalHome,
        fractalTarget: window.ButterflyFXDiagnostics?.status().screensaverFractalTarget,
        target: document.querySelector('#cosmos-target-label')?.textContent
      })`);
      expect(screensaverReport.active, 'Autogen should enter fullscreen display mode');
      expect(screensaverReport.camera.zoom > 3, 'Autogen should begin a galaxy dive after roughly five seconds');
      expect(Boolean(screensaverReport.camera.inspectId), 'Autogen camera should target a generated galaxy');
      expect(screensaverReport.fractalTarget.scale < screensaverReport.fractalHome.scale, 'Both-mode choreography should dive into the contributing Mandelbrot region');
      expect(screensaverReport.fractalView.scale < screensaverReport.fractalHome.scale, 'the Mandelbrot camera should visibly join the five-second dive');
      const screensaverImage = await window.webContents.capturePage();
      await fs.writeFile(screensaverScreenshotPath, screensaverImage.toPNG());
      await window.webContents.executeJavaScript(`document.querySelector('#screensaver-exit').click()`);
      await new Promise((resolve) => setTimeout(resolve, 350));
      cameraPersistenceReport = await window.webContents.executeJavaScript(`(async () => {
        const original = document.querySelector('[data-id="${zoomGeometry.originalId}"]');
        original?.click();
        await new Promise(resolve => setTimeout(resolve, 120));
        const status = window.ButterflyFXDiagnostics.status();
        return { selectedUniverseId: status.selectedUniverseId, camera: status.universeCamera };
      })()`);
      expect(cameraPersistenceReport.selectedUniverseId === zoomGeometry.originalId, 'the original drawn universe should remain archived after Autogen');
      expect(cameraPersistenceReport.camera.zoom > 20, 'archive selection should restore that universe\'s inspection camera');
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
      expect(compositionReport.universeOnly.state === 'universe' && compositionReport.universeOnly.sourceHidden, 'universe-only composition should fill the instrument');
      expect(compositionReport.mandelbrotOnly.state === 'mandelbrot' && compositionReport.mandelbrotOnly.universeHidden, 'Mandelbrot-only composition should hide the universe');
      expect(compositionReport.restored === 'both', 'composition cycle should restore the relational view');
      buddhabrotReport.final = await window.webContents.executeJavaScript(`(() => {
        const engine = window.ButterflyFXDiagnostics.status();
        const button = document.querySelector('[data-source-visual="buddhabrot"]');
        return {
          sourceVisual: engine.sourceVisual,
          renderer: engine.buddhabrot,
          active: button?.classList.contains('is-active'),
          pressed: button?.getAttribute('aria-pressed')
        };
      })()`);
      expect(buddhabrotReport.final.sourceVisual === 'buddhabrot' && buddhabrotReport.final.active, 'Buddhabrot should remain selected through zoom, Autogen, archive, and composition checks');
      expect(buddhabrotReport.final.renderer?.samples >= sustainedBuddhabrot.renderer?.samples, 'Buddhabrot accumulation should persist across the full interaction flow');
      expect(!buddhabrotReport.final.renderer?.error, 'Buddhabrot should finish the smoke flow without a renderer error');
    } catch (error) {
      errors.add(`Full-window capture failed: ${error.message}`);
    }
  }

  try {
    const beforeReciprocity = await window.webContents.executeJavaScript(`window.ButterflyFXDiagnostics.status()`);
    await window.webContents.executeJavaScript(`(() => {
      document.querySelector('#screensaver-button').click();
      document.querySelector('[data-screen-view="universe"]').click();
      document.querySelector('#start-screensaver').click();
    })()`);
    await new Promise((resolve) => setTimeout(resolve, 1400));
    const afterSingleBirth = await window.webContents.executeJavaScript(`window.ButterflyFXDiagnostics.status()`);
    await window.webContents.executeJavaScript(`(async () => {
      for (const key of 'goldenrule') {
        window.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true }));
        await new Promise(resolve => setTimeout(resolve, 32));
      }
    })()`);
    await new Promise((resolve) => setTimeout(resolve, 1650));
    reciprocityReport = await window.webContents.executeJavaScript(`(() => {
      const engine = window.ButterflyFXDiagnostics.status();
      const signal = document.querySelector('#reciprocity-signal');
      return {
        ...engine,
        selectedSeed: document.querySelector('#hud-seed')?.textContent,
        signalVisible: Boolean(signal && !signal.hidden),
        signalPair: document.querySelector('#reciprocity-pair')?.textContent,
        hudGolden: document.querySelector('#screensaver-hud')?.classList.contains('is-golden'),
        bodyGolden: document.body.classList.contains('golden-rule-mode'),
        statusText: document.querySelector('#screensaver-status')?.textContent
      };
    })()`);
    expect(afterSingleBirth.screensaverGenerationCount - beforeReciprocity.screensaverGenerationCount === 1,
      'Autogen startup should perform exactly one initial generation');
    expect(reciprocityReport.goldenRuleActive, 'typing goldenrule during Autogen should engage the reciprocity field');
    expect(reciprocityReport.reciprocalSeed && reciprocityReport.reciprocalSeed !== reciprocityReport.selectedSeed,
      'the reciprocity field should expose a deterministic counterfactual');
    expect(reciprocityReport.signalVisible && reciprocityReport.hudGolden && reciprocityReport.bodyGolden,
      'the reciprocity field should expose its secret visual state');
    expect(/RECIPROCITY/i.test(reciprocityReport.statusText || ''), 'the Autogen HUD should identify reciprocity while it is active');
    if (gpuSmoke) {
      const reciprocityImage = await window.webContents.capturePage();
      await fs.writeFile(reciprocityScreenshotPath, reciprocityImage.toPNG());
    }
    await window.webContents.executeJavaScript(`(async () => {
      for (const key of 'goldenrule') {
        window.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true }));
        await new Promise(resolve => setTimeout(resolve, 18));
      }
    })()`);
    await new Promise((resolve) => setTimeout(resolve, 120));
    const toggledOff = await window.webContents.executeJavaScript(`window.ButterflyFXDiagnostics.status().goldenRuleActive`);
    expect(!toggledOff, 'typing goldenrule again should release the reciprocity field');
    await window.webContents.executeJavaScript(`document.querySelector('#screensaver-exit').click()`);
    await new Promise((resolve) => setTimeout(resolve, 350));
  } catch (error) {
    errors.add(`Reciprocity smoke failed: ${error.message}`);
  }
  const reportPath = path.join('/tmp', 'butterfly-fx-smoke-report.json');
  const payload = {
    report,
    mandelbrotCinematicReport,
    buddhabrotReport,
    annularReport,
    zoomReport,
    wheelReport,
    panReport,
    screensaverReport,
    reciprocityReport,
    cameraPersistenceReport,
    compositionReport,
    errors: [...errors],
    screenshotPath,
    fullScreenshotPath,
    mandelbrotCinematicScreenshotPath,
    buddhabrotScreenshotPath,
    zoomScreenshotPath,
    screensaverScreenshotPath,
    reciprocityScreenshotPath,
    reportPath
  };
  await fs.writeFile(reportPath, JSON.stringify(payload, null, 2));
  process.stdout.write(`Smoke report: ${reportPath}\n`);
  const exitCode = errors.size ? 1 : 0;
  await window.close();
  app.exit(exitCode);
}).catch((error) => {
  console.error(error);
  app.quit();
  process.exitCode = 1;
});
