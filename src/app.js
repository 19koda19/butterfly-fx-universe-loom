(function launchUniverseLoom() {
  'use strict';

  const MathX = window.CosmoMath;
  const Shaders = window.CosmosShaders;
  const $ = (selector, scope = document) => scope.querySelector(selector);
  const $$ = (selector, scope = document) => Array.from(scope.querySelectorAll(selector));
  const host = $('#canvas-host');

  const roleColors = {
    AUTO: [85, 214, 232],
    DENSITY: [85, 214, 232],
    TURBULENCE: [235, 99, 180],
    SPIN: [244, 185, 95],
    VOID: [155, 130, 255]
  };

  const COSMOS_MIN_SCALE = 1 / 128;

  function makeCosmosCamera() {
    return {
      x: 0.5,
      y: 0.5,
      scale: 1,
      targetX: 0.5,
      targetY: 0.5,
      targetScale: 1,
      inspectId: null,
      motion: 'manual'
    };
  }

  const state = {
    p: null,
    shaders: null,
    shaderError: null,
    gpuNotice: null,
    webglReady: false,
    webgl2: false,
    gl: null,
    viewMode: 'weave',
    focusView: 'both',
    creationMode: 'branch',
    tool: 'draw',
    view: { x: -0.5, y: 0, scale: 3.0 },
    iterations: 180,
    darkGain: 1,
    emergenceGain: 1,
    phaseLink: 0.68,
    currentStroke: null,
    bundle: [],
    universes: [],
    selected: null,
    comparison: null,
    universeSerial: 1,
    drawing: false,
    panning: false,
    cosmosPanning: false,
    panOrigin: null,
    viewOrigin: null,
    cosmosPanOrigin: null,
    cosmosViewOrigin: null,
    cosmosPanRect: null,
    previewGenome: null,
    previewAt: 0,
    age: 0,
    playing: false,
    layers: { dark: true, bubbles: true, gas: true, stars: true, halos: true, tension: true, attractor: true },
    cosmosViews: new Map(),
    cosmosCamera: makeCosmosCamera(),
    cameraUIAt: 0,
    layout: null,
    fps: 0,
    fpsAccumulator: 0,
    fpsFrames: 0,
    fpsLastUpdate: performance.now(),
    diagnostics: null,
    contextLost: false,
    toastTimer: null,
    pointer: { x: 0, y: 0 },
    reducedMotion: window.matchMedia('(prefers-reduced-motion: reduce)').matches,
    fallbackImage: null,
    fallbackKey: '',
    screensaver: {
      active: false,
      view: 'both',
      interval: 24,
      nextAt: 0,
      nextCameraAt: 0,
      cameraStep: 0,
      tourTargetId: null,
      fractalHome: null,
      fractalTarget: null,
      previousFocus: 'both'
    }
  };

  const ambientStrand = {
    role: 'AUTO',
    operation: 'ADD',
    points: Array.from({ length: 42 }, (_, index) => {
      const t = index / 41;
      return {
        x: t,
        y: 0.5 + Math.sin(t * Math.PI * 2.4) * 0.08,
        cx: -1.35 + t * 1.7,
        cy: Math.sin(t * Math.PI * 2.4) * 0.24,
        time: index * 10
      };
    })
  };
  const ambientUniverse = MathX.makeUniverse([ambientStrand], 'AMBIENT', { createdAt: 'model-origin', galaxyLimit: 90 });

  function announce(message) {
    $('#live-region').textContent = message;
  }

  function showToast(message, duration = 2600) {
    const toast = $('#toast');
    toast.textContent = message;
    toast.classList.add('is-visible');
    clearTimeout(state.toastTimer);
    state.toastTimer = setTimeout(() => toast.classList.remove('is-visible'), duration);
  }

  function setRangeProgress(input) {
    const min = Number(input.min) || 0;
    const max = Number(input.max) || 1;
    const value = Number(input.value);
    const percent = ((value - min) / Math.max(0.000001, max - min)) * 100;
    input.style.setProperty('--range-progress', `${percent}%`);
  }

  function setTool(tool) {
    state.tool = tool;
    $$('.tool-button').forEach((button) => {
      const active = button.dataset.tool === tool;
      button.classList.toggle('is-active', active);
      button.setAttribute('aria-pressed', String(active));
    });
    host.classList.toggle('is-pan', tool === 'pan');
    host.focus({ preventScroll: true });
  }

  function setCreationMode(mode) {
    state.creationMode = mode;
    $$('.creation-mode').forEach((button) => {
      const active = button.dataset.creation === mode;
      button.classList.toggle('is-active', active);
      button.setAttribute('aria-pressed', String(active));
    });
    $('#ignite-button').disabled = mode !== 'bundle' || state.bundle.length === 0;
    showToast(mode === 'bundle'
      ? 'Weave mode: each line becomes a correlated phase voice. Press Enter to ignite.'
      : 'Branch mode: every completed line births one universe.');
  }

  function setViewMode(mode, options = {}) {
    if (mode === 'divergence' && !state.comparison) {
      if (!state.selected) {
        showToast('Create a universe before opening the Butterfly Lab.');
        return;
      }
      if (!options.skipFork) forkTwin();
    }
    state.viewMode = mode;
    $$('.mode-button').forEach((button) => {
      const active = button.dataset.view === mode;
      button.classList.toggle('is-active', active);
      button.setAttribute('aria-pressed', String(active));
    });
    $('.phase-link-control').classList.toggle('is-hidden', mode !== 'divergence' || !state.comparison);
    if (state.p) {
      state.layout = calculateLayout(state.p.width, state.p.height);
      reclampCosmosCamera();
      syncLayoutDOM();
    }
  }

  function setFocusView(view) {
    if (!['both', 'mandelbrot', 'universe'].includes(view)) return;
    state.focusView = view;
    const labels = { both: 'VIEW · BOTH', mandelbrot: 'VIEW · MANDELBROT', universe: 'VIEW · UNIVERSE' };
    $('#focus-view-button').textContent = labels[view];
    $('#screensaver-cycle-view').textContent = view === 'both' ? 'BOTH' : view.toUpperCase();
    if (state.p) {
      state.p.resizeCanvas(Math.max(10, host.clientWidth), Math.max(10, host.clientHeight));
      state.layout = calculateLayout(state.p.width, state.p.height);
      reclampCosmosCamera();
      syncLayoutDOM();
    }
  }

  function cycleFocusView() {
    const order = ['both', 'universe', 'mandelbrot'];
    setFocusView(order[(order.indexOf(state.focusView) + 1) % order.length]);
  }

  function calculateLayout(width, height) {
    if (state.focusView === 'mandelbrot') {
      return {
        source: { x: 0, y: 0, w: width, h: height },
        loom: { x: width, y: 0, w: 0, h: height },
        cosmos: { x: width, y: 0, w: 0, h: height }
      };
    }
    if (state.focusView === 'universe') {
      return {
        source: { x: 0, y: 0, w: 0, h: height },
        loom: { x: 0, y: 0, w: 0, h: height },
        cosmos: { x: 0, y: 0, w: width, h: height }
      };
    }
    const loomWidth = state.viewMode === 'evolve' ? 72 : 86;
    const sourceRatio = state.viewMode === 'evolve' ? 0.27 : (state.viewMode === 'divergence' ? 0.29 : 0.47);
    const usable = width - loomWidth;
    const sourceWidth = Math.max(180, usable * sourceRatio);
    return {
      source: { x: 0, y: 0, w: sourceWidth, h: height },
      loom: { x: sourceWidth, y: 0, w: loomWidth, h: height },
      cosmos: { x: sourceWidth + loomWidth, y: 0, w: width - sourceWidth - loomWidth, h: height }
    };
  }

  function syncLayoutDOM() {
    if (!state.layout) return;
    const { loom, cosmos } = state.layout;
    const loomElement = $('#loom-overlay');
    loomElement.style.left = `${loom.x}px`;
    loomElement.style.width = `${loom.w}px`;
    loomElement.classList.toggle('is-hidden', loom.w < 2);
    $('.source-stage-label').hidden = state.layout.source.w < 2;
    $('.universe-stage-label').hidden = cosmos.w < 2;
    $('.universe-stage-label').style.left = `${cosmos.x + 14}px`;
    const camera = $('#cosmos-camera');
    camera.style.setProperty('--cosmos-width', `${Math.max(0, cosmos.w)}px`);
    camera.hidden = cosmos.w < 150 || !state.selected;
    camera.classList.toggle('is-compact', cosmos.w < 320);
    updateCosmosCameraUI();
  }

  function pointerIn(rect, x, y) {
    return x >= rect.x && x <= rect.x + rect.w && y >= rect.y && y <= rect.y + rect.h;
  }

  function cosmosRects() {
    const cosmos = state.layout?.cosmos;
    if (!cosmos || cosmos.w < 2 || cosmos.h < 2) return [];
    if (state.viewMode === 'divergence' && state.comparison) {
      const gap = 2;
      const half = (cosmos.w - gap) / 2;
      return [
        { ...cosmos, w: half },
        { x: cosmos.x + half + gap, y: cosmos.y, w: half, h: cosmos.h }
      ];
    }
    return [cosmos];
  }

  function cosmosRectAt(x, y) {
    return cosmosRects().find((rect) => pointerIn(rect, x, y)) || null;
  }

  function activeCosmosRect() {
    return cosmosRects()[0] || { x: 0, y: 0, w: 1, h: 1 };
  }

  function reclampCosmosCamera() {
    const rect = cosmosRects()[0];
    if (!rect) return;
    const aspect = rect.w / Math.max(1, rect.h);
    const camera = state.cosmosCamera;
    const current = MathX.clampCosmicView(cameraView(camera), aspect, COSMOS_MIN_SCALE, 1);
    const target = MathX.clampCosmicView(cameraView(camera, true), aspect, COSMOS_MIN_SCALE, 1);
    Object.assign(camera, {
      x: current.x,
      y: current.y,
      scale: current.scale,
      targetX: target.x,
      targetY: target.y,
      targetScale: target.scale
    });
  }

  function cameraView(camera = state.cosmosCamera, target = false) {
    return target
      ? { x: camera.targetX, y: camera.targetY, scale: camera.targetScale }
      : { x: camera.x, y: camera.y, scale: camera.scale };
  }

  function activateCosmosCamera(universe) {
    const key = universe?.id || 'AMBIENT';
    if (!state.cosmosViews.has(key)) state.cosmosViews.set(key, makeCosmosCamera());
    state.cosmosCamera = state.cosmosViews.get(key);
    reclampCosmosCamera();
    updateCosmosCameraUI();
  }

  function setCosmosCameraTarget(view, options = {}) {
    const rect = options.rect || activeCosmosRect();
    const aspect = rect.w / Math.max(1, rect.h);
    const next = MathX.clampCosmicView(view, aspect, COSMOS_MIN_SCALE, 1);
    const camera = state.cosmosCamera;
    camera.targetX = next.x;
    camera.targetY = next.y;
    camera.targetScale = next.scale;
    camera.inspectId = options.inspectId ?? null;
    camera.motion = options.motion || 'manual';
    if (options.immediate || state.reducedMotion) {
      camera.x = next.x;
      camera.y = next.y;
      camera.scale = next.scale;
    }
    updateCosmosCameraUI();
  }

  function resetCosmosCamera(options = {}) {
    setCosmosCameraTarget({ x: 0.5, y: 0.5, scale: 1 }, {
      immediate: Boolean(options.immediate),
      motion: options.motion || 'manual'
    });
    if (!options.quiet) {
      announce('The full generated universe is framed.');
      showToast('Universe camera restored to the full field.');
    }
  }

  function zoomCosmosAt(x, y, scaleFactor, options = {}) {
    const rect = options.rect || cosmosRectAt(x, y) || activeCosmosRect();
    if (rect.w < 2 || rect.h < 2 || !state.selected) return false;
    const nx = MathX.clamp((x - rect.x) / rect.w);
    const ny = MathX.clamp((y - rect.y) / rect.h);
    const aspect = rect.w / Math.max(1, rect.h);
    const currentTarget = cameraView(state.cosmosCamera, true);
    const next = MathX.zoomCosmicView(currentTarget, nx, ny, scaleFactor, aspect, COSMOS_MIN_SCALE, 1);
    setCosmosCameraTarget(next, { rect, motion: options.motion || 'manual' });
    return true;
  }

  function updateCosmosCamera(deltaTime) {
    const camera = state.cosmosCamera;
    const difference = Math.abs(camera.x - camera.targetX)
      + Math.abs(camera.y - camera.targetY)
      + Math.abs(Math.log(camera.scale / camera.targetScale));
    if (difference < 1e-7) return;
    if (state.reducedMotion) {
      camera.x = camera.targetX;
      camera.y = camera.targetY;
      camera.scale = camera.targetScale;
      return;
    }
    const rate = camera.motion === 'tour' ? 0.0026 : 0.011;
    const ease = 1 - Math.exp(-Math.min(50, deltaTime) * rate);
    camera.x = MathX.lerp(camera.x, camera.targetX, ease);
    camera.y = MathX.lerp(camera.y, camera.targetY, ease);
    camera.scale = Math.exp(MathX.lerp(Math.log(camera.scale), Math.log(camera.targetScale), ease));
    if (difference < 0.00002) {
      camera.x = camera.targetX;
      camera.y = camera.targetY;
      camera.scale = camera.targetScale;
    }
  }

  function cosmosDetailLabel(zoom) {
    if (zoom < 2.2) return 'FIELD';
    if (zoom < 6) return 'COSMIC WEB';
    if (zoom < 16) return 'FILAMENTS';
    if (zoom < 40) return 'GALAXY';
    if (zoom < 90) return 'STELLAR CLOUDS';
    return 'RESOLVED KNOTS';
  }

  function galaxyNearCamera(universe = state.selected) {
    if (!universe || state.cosmosCamera.scale > 0.42) return null;
    const view = cameraView();
    let nearest = null;
    let nearestDistance = Infinity;
    universe.galaxies.forEach((galaxy) => {
      if (galaxy.birth > state.age) return;
      const distance = Math.hypot(galaxy.x - view.x, galaxy.y - view.y);
      const weighted = distance / (0.7 + galaxy.mass * 0.3);
      if (weighted < nearestDistance) {
        nearest = galaxy;
        nearestDistance = weighted;
      }
    });
    return nearestDistance <= Math.max(0.035, view.scale * 0.48) ? nearest : null;
  }

  function updateCosmosCameraUI() {
    const cameraElement = $('#cosmos-camera');
    if (!cameraElement) return;
    const camera = state.cosmosCamera;
    const zoom = 1 / Math.max(COSMOS_MIN_SCALE, camera.scale);
    const formatted = zoom < 10 ? zoom.toFixed(2) : zoom.toFixed(1);
    $('#cosmos-zoom-level').textContent = `${formatted}× · ${cosmosDetailLabel(zoom)}`;
    const control = $('#cosmos-zoom-control');
    control.value = String(Math.log2(1 / Math.max(COSMOS_MIN_SCALE, camera.targetScale)));
    control.setAttribute('aria-valuetext', `${formatted} times magnification, ${cosmosDetailLabel(zoom).toLowerCase()} detail`);

    const inspected = state.selected?.galaxies.find((galaxy) => galaxy.id === camera.inspectId)
      || galaxyNearCamera();
    cameraElement.classList.toggle('is-targeting', Boolean(inspected));
    if (inspected) {
      const tension = Math.round(inspected.formationTension * 100);
      $('#cosmos-target-label').textContent = `${inspected.id} · ${inspected.type} · ${inspected.type === 'SPIRAL' ? `${inspected.arms} ARMS · ` : ''}TENSION ${tension}%`;
      $('#cosmos-target-reason').textContent = `MODEL FLAG · ${inspected.tensionDominant}`;
    } else {
      const flagged = state.selected?.galaxies.filter((galaxy) => galaxy.formationTension >= 0.42).length || 0;
      $('#cosmos-target-label').textContent = `FIELD OVERVIEW · ${flagged} TENSION FLAG${flagged === 1 ? '' : 'S'}`;
      $('#cosmos-target-reason').textContent = 'Zoom resolves nested filaments, halos, galaxy arms, satellites, and stellar knots.';
    }
  }

  function eventToComplex(x, y) {
    const source = state.layout.source;
    const nx = (x - source.x) / source.w;
    const ny = (y - source.y) / source.h;
    return MathX.screenToComplex(nx, ny, state.view, source.w / source.h);
  }

  function complexLabel(value) {
    const sign = value.y >= 0 ? '+' : '−';
    return `${value.x.toFixed(7)} ${sign} ${Math.abs(value.y).toFixed(7)}i`;
  }

  function updateCoordinateReadout(x, y) {
    if (!state.layout || !pointerIn(state.layout.source, x, y)) return;
    const c = eventToComplex(x, y);
    $('#complex-coordinate').textContent = complexLabel(c);
    $('#zoom-level').textContent = `${(3 / state.view.scale).toFixed(state.view.scale < 0.01 ? 0 : 2)}×`;
  }

  function makePoint(x, y) {
    const source = state.layout.source;
    const c = eventToComplex(x, y);
    return {
      x: (x - source.x) / source.w,
      y: (y - source.y) / source.h,
      cx: c.x,
      cy: c.y,
      time: performance.now()
    };
  }

  function analyzePreview(strands) {
    if (!strands.length) {
      state.previewGenome = null;
      updateGenomeUI(null);
      return;
    }
    try {
      state.previewGenome = MathX.analyzeStrands(strands, { maxIterations: state.iterations });
      updateGenomeUI(state.previewGenome);
    } catch (error) {
      console.error(error);
    }
  }

  function maybeAnalyzeDrawing() {
    const now = performance.now();
    if (!state.currentStroke || state.currentStroke.length < 5 || now - state.previewAt < 110) return;
    state.previewAt = now;
    const strand = { points: state.currentStroke, role: $('#strand-role').value, operation: 'ADD' };
    const strands = state.creationMode === 'bundle' ? [...state.bundle, strand] : [strand];
    analyzePreview(strands);
    $('#source-state').textContent = `SAMPLING · ${state.currentStroke.length} POINTS`;
  }

  function updateGenomeUI(genome) {
    const metrics = genome?.metrics;
    ['density', 'turbulence', 'peakSeeds', 'spin', 'voidBias'].forEach((key) => {
      const row = $(`.gene-row[data-gene="${key}"]`);
      const value = metrics ? MathX.clamp(metrics[key]) : 0;
      $('b', row.querySelector('div')).style.width = `${value * 100}%`;
      $('output', row).textContent = metrics ? value.toFixed(2) : '—';
    });
    $('#sample-count').textContent = genome ? `${genome.sampleCount} SAMPLES` : '0 SAMPLES';

    const loom = $('#loom-overlay');
    loom.classList.toggle('is-live', Boolean(genome));
    if (genome) {
      const caption = $('#attractor-caption');
      caption.innerHTML = `STRANGE ATTRACTOR<br><b>${genome.genes.attractor} / ${genome.seedHex.slice(0, 4)}</b>`;
      ['density', 'turbulence', 'peakSeeds', 'spin', 'voidBias'].forEach((key) => {
        const channel = $(`.loom-channels i[data-channel="${key}"]`);
        channel.style.opacity = String(0.25 + genome.metrics[key] * 0.75);
        channel.style.setProperty('--packet-speed', `${3.5 - genome.metrics[key] * 2}s`);
      });
    } else {
      $('#attractor-caption').innerHTML = 'STRANGE ATTRACTOR<br><b>AWAITING SIGNAL</b>';
    }
  }

  function universeId() {
    const id = `U-${String(state.universeSerial).padStart(3, '0')}`;
    state.universeSerial += 1;
    return id;
  }

  function createUniverse(strands, options = {}) {
    const id = universeId();
    const universe = MathX.makeUniverse(strands, id, {
      ...options,
      maxIterations: state.iterations,
      name: options.name || `Universe ${id.slice(2)}`
    });
    state.universes.push(universe);
    selectUniverse(universe, { preserveComparison: options.preserveComparison });
    state.age = options.age ?? 0.04;
    state.playing = true;
    $('#play-button').classList.add('is-playing');
    $('#empty-callout').classList.add('is-hidden');
    updateAgeUI();
    renderArchive();
    announce(`${universe.name} created from ${universe.strands.length} ${universe.strands.length === 1 ? 'strand' : 'strands'}.`);
    showToast(`${universe.name} is alive · genome ${universe.genome.seedHex}.`);
    return universe;
  }

  function selectUniverse(universe, options = {}) {
    state.selected = universe;
    activateCosmosCamera(universe);
    state.previewGenome = universe.genome;
    if (!options.preserveComparison) state.comparison = null;
    updateGenomeUI(universe.genome);
    updateSelectedUI();
    renderArchive();
  }

  function completeStroke() {
    const points = state.currentStroke;
    state.currentStroke = null;
    state.drawing = false;
    $('#source-state').textContent = 'C-SPACE · READY';

    if (!points || points.length < 8) {
      showToast('Give the path a little more sky—draw at least 8 samples.');
      analyzePreview(state.bundle);
      return;
    }

    const strand = {
      role: $('#strand-role').value,
      operation: 'ADD',
      points: MathX.resampleStroke(points, 128)
    };

    if (state.creationMode === 'bundle') {
      state.bundle.push(strand);
      analyzePreview(state.bundle);
      $('#undo-strand').disabled = false;
      $('#ignite-button').disabled = false;
      showToast(`Strand ${state.bundle.length} threaded. Draw again or press Enter to ignite.`);
      announce(`Strand ${state.bundle.length} added to the current genome.`);
      return;
    }

    const appendToSelected = state.p?.keyIsDown(state.p.SHIFT) && state.selected;
    const strands = appendToSelected ? [...state.selected.strands, strand] : [strand];
    createUniverse(strands, {
      parentId: appendToSelected ? state.selected.id : null,
      name: appendToSelected ? `${state.selected.name} · mutation` : undefined
    });
  }

  function igniteBundle() {
    if (!state.bundle.length) {
      showToast('Draw at least one strand before ignition.');
      return;
    }
    const strands = state.bundle.map((strand) => ({ ...strand, points: strand.points.map((point) => ({ ...point })) }));
    createUniverse(strands, { name: `Woven Universe ${String(state.universeSerial).padStart(3, '0')}` });
    state.bundle = [];
    $('#undo-strand').disabled = true;
    $('#ignite-button').disabled = true;
  }

  function newGenome() {
    state.currentStroke = null;
    state.bundle = [];
    state.comparison = null;
    state.previewGenome = state.selected?.genome || null;
    $('#undo-strand').disabled = true;
    $('#ignite-button').disabled = true;
    analyzePreview([]);
    if (state.selected) updateGenomeUI(state.selected.genome);
    setViewMode('weave', { skipFork: true });
    showToast('Clean genome ready. The archive remains intact.');
  }

  function autoGenerateUniverse() {
    const random = MathX.mulberry32((Date.now() ^ Math.imul(state.universeSerial, 0x9e3779b9)) >>> 0);
    const presets = [
      { x: -0.5, y: 0, scale: 3 },
      { x: -0.743643887, y: 0.131825904, scale: 0.055 },
      { x: -0.101096, y: 0.956286, scale: 0.19 },
      { x: -1.25066, y: 0.02012, scale: 0.21 },
      { x: -0.16, y: 1.0405, scale: 0.115 },
      { x: 0.28692, y: 0.01429, scale: 0.13 }
    ];
    const preset = presets[Math.floor(random() * presets.length)];
    state.view = {
      x: preset.x + (random() - 0.5) * preset.scale * 0.08,
      y: preset.y + (random() - 0.5) * preset.scale * 0.08,
      scale: preset.scale * (0.82 + random() * 0.38)
    };
    state.screensaver.fractalHome = { ...state.view };
    state.screensaver.fractalTarget = { ...state.view };
    state.fallbackKey = '';

    const imaginedAspect = state.layout?.source.w > 2
      ? state.layout.source.w / state.layout.source.h
      : 1.35;
    const waveA = 1.2 + random() * 3.4;
    const waveB = 2.2 + random() * 4.6;
    const phase = random() * MathX.TAU;
    const slope = (random() - 0.5) * 0.52;
    const points = Array.from({ length: 144 }, (_, index) => {
      const t = index / 143;
      const nx = 0.035 + t * 0.93;
      const ny = MathX.clamp(
        0.5 + slope * (t - 0.5)
          + Math.sin(t * Math.PI * waveA + phase) * (0.08 + random() * 0.015)
          + Math.sin(t * Math.PI * waveB - phase) * 0.035,
        0.04,
        0.96
      );
      const complex = MathX.screenToComplex(nx, ny, state.view, imaginedAspect);
      return { x: nx, y: ny, cx: complex.x, cy: complex.y, time: index * 12 };
    });
    const roles = ['AUTO', 'DENSITY', 'TURBULENCE', 'SPIN', 'VOID'];
    const universe = createUniverse([{ role: roles[Math.floor(random() * roles.length)], operation: 'ADD', points }], {
      name: `Auto Cosmos ${String(state.universeSerial).padStart(3, '0')}`,
      age: 0.02
    });
    if (state.universes.length > 24) {
      const removed = state.universes.shift();
      state.cosmosViews.delete(removed.id);
    }
    const now = performance.now();
    state.screensaver.nextAt = now + state.screensaver.interval * 1000;
    state.screensaver.nextCameraAt = now + 4800;
    state.screensaver.cameraStep = 0;
    state.screensaver.tourTargetId = null;
    renderArchive();
    return universe;
  }

  function pickTourGalaxy(universe, step, excludedId = null) {
    const mature = universe.galaxies.filter((galaxy) => galaxy.birth <= Math.max(0.62, state.age) && galaxy.id !== excludedId);
    const pool = (mature.length ? mature : universe.galaxies)
      .slice()
      .sort((a, b) => {
        const scoreA = a.formationTension * 0.74 + MathX.clamp(a.mass / 2.2) * 0.26;
        const scoreB = b.formationTension * 0.74 + MathX.clamp(b.mass / 2.2) * 0.26;
        return scoreB - scoreA;
      })
      .slice(0, 8);
    if (!pool.length) return null;
    const random = MathX.mulberry32((universe.genome.seed ^ Math.imul(step + 1, 0x9e3779b9)) >>> 0);
    return pool[Math.floor(random() * pool.length)];
  }

  function contributingSourcePoint(universe, galaxy) {
    const points = universe.strands.flatMap((strand) => strand.points || []);
    if (!points.length || !galaxy) return null;
    const galaxyNumber = Number.parseInt(galaxy.id.replace(/\D/g, ''), 10) || 1;
    const index = (Math.imul(galaxyNumber, 37) + (universe.genome.seed >>> 7)) % points.length;
    return points[index];
  }

  function setFractalTourTarget(universe, galaxy, zoom) {
    const home = state.screensaver.fractalHome;
    const point = contributingSourcePoint(universe, galaxy);
    if (!home || !point) return;
    state.screensaver.fractalTarget = {
      x: point.cx,
      y: point.cy,
      scale: Math.max(0.000015, home.scale / zoom)
    };
  }

  function updateFractalTourCamera(deltaTime) {
    const target = state.screensaver.fractalTarget;
    if (!state.screensaver.active || !target) return;
    if (state.reducedMotion) {
      state.view = { ...target };
      state.fallbackKey = '';
      return;
    }
    const ease = 1 - Math.exp(-Math.min(50, deltaTime) * 0.00225);
    state.view.x = MathX.lerp(state.view.x, target.x, ease);
    state.view.y = MathX.lerp(state.view.y, target.y, ease);
    state.view.scale = Math.exp(MathX.lerp(Math.log(state.view.scale), Math.log(target.scale), ease));
    state.fallbackKey = '';
  }

  function tourCosmosCamera(now = performance.now()) {
    const universe = state.selected;
    if (!universe) {
      state.screensaver.nextCameraAt = now + 5000;
      return;
    }
    state.screensaver.cameraStep += 1;
    const phase = (state.screensaver.cameraStep - 1) % 4;
    if (phase === 3) {
      resetCosmosCamera({ quiet: true, motion: 'tour' });
      if (state.screensaver.fractalHome) state.screensaver.fractalTarget = { ...state.screensaver.fractalHome };
      state.screensaver.tourTargetId = null;
      state.screensaver.nextCameraAt = now + 5000;
      return;
    }

    let galaxy = universe.galaxies.find((item) => item.id === state.screensaver.tourTargetId);
    if (!galaxy || phase === 0 || phase === 2) {
      galaxy = pickTourGalaxy(universe, state.screensaver.cameraStep, phase === 2 ? state.screensaver.tourTargetId : null);
      state.screensaver.tourTargetId = galaxy?.id || null;
    }
    if (!galaxy) {
      resetCosmosCamera({ quiet: true, motion: 'tour' });
    } else {
      const zoom = phase === 0 ? 7 : (phase === 1 ? 34 : 16);
      setCosmosCameraTarget({ x: galaxy.x, y: galaxy.y, scale: 1 / zoom }, {
        inspectId: galaxy.id,
        motion: 'tour'
      });
      const sourceZoom = phase === 0 ? 2.4 : (phase === 1 ? 8 : 4.2);
      setFractalTourTarget(universe, galaxy, sourceZoom);
    }
    state.screensaver.nextCameraAt = now + 5000;
  }

  async function setFullscreen(enabled) {
    if (window.cosmosAPI?.setFullscreen) {
      try {
        await window.cosmosAPI.setFullscreen(enabled);
        return;
      } catch (_error) {
        // The static browser path below remains available if the desktop bridge fails.
      }
    }
    if (enabled && !document.fullscreenElement) {
      await document.documentElement.requestFullscreen?.();
    } else if (!enabled && document.fullscreenElement) {
      await document.exitFullscreen?.();
    }
  }

  function resizeInstrument() {
    requestAnimationFrame(() => {
      if (!state.p) return;
      state.p.resizeCanvas(Math.max(10, host.clientWidth), Math.max(10, host.clientHeight));
      state.layout = calculateLayout(state.p.width, state.p.height);
      reclampCosmosCamera();
      syncLayoutDOM();
    });
  }

  async function startScreensaver() {
    state.screensaver.active = true;
    state.screensaver.previousFocus = state.focusView;
    state.screensaver.view = $('.screen-view-option.is-active')?.dataset.screenView || 'both';
    state.screensaver.interval = Number($('#screensaver-interval').value);
    state.screensaver.nextAt = performance.now() + 250;
    state.screensaver.nextCameraAt = performance.now() + 4800;
    state.screensaver.cameraStep = 0;
    state.screensaver.tourTargetId = null;
    setFocusView(state.screensaver.view);
    document.body.classList.add('screensaver-mode');
    $('#screensaver-hud').hidden = false;
    $('#screensaver-dialog').close();
    await setFullscreen(true);
    resizeInstrument();
    setTimeout(() => {
      if (state.screensaver.active) autoGenerateUniverse();
    }, 220);
    announce('Autogenerate screensaver started. Press Escape to return to the laboratory.');
  }

  async function stopScreensaver(exitFullscreen = true) {
    if (!state.screensaver.active) return;
    state.screensaver.active = false;
    document.body.classList.remove('screensaver-mode');
    $('#screensaver-hud').hidden = true;
    setFocusView(state.screensaver.previousFocus);
    if (exitFullscreen) await setFullscreen(false);
    resizeInstrument();
    announce('Autogenerate screensaver stopped.');
    showToast('Autogen stopped. Generated universes remain in the archive.');
  }

  function forkTwin() {
    if (!state.selected) {
      showToast('Create a universe before forking a twin.');
      return null;
    }
    const base = state.selected;
    const sharedCamera = state.cosmosViews.get(base.id) || state.cosmosCamera;
    const epsilon = 1e-8;
    const twin = createUniverse(base.strands, {
      name: `${base.name} A′`,
      parentId: base.id,
      perturbation: epsilon,
      preserveComparison: true,
      age: state.age
    });
    state.comparison = { base, twin, epsilon };
    state.selected = twin;
    state.cosmosViews.set(twin.id, sharedCamera);
    state.cosmosCamera = sharedCamera;
    state.viewMode = 'divergence';
    setViewMode('divergence', { skipFork: true });
    updateSelectedUI();
    renderArchive();
    announce(`Butterfly twin created with an epsilon perturbation of ${epsilon}.`);
    showToast('A change of 10⁻⁸. Same rules; watch structure forget its twin.');
    return twin;
  }

  function orderProxy(universe) {
    if (!universe) return 0;
    const metrics = universe.genome.metrics;
    const structure = metrics.density * 0.38 + metrics.peakSeeds * 0.28
      + (1 - metrics.voidBias) * 0.16 + (1 - metrics.entropy) * 0.18;
    return MathX.clamp(structure * Math.pow(state.age, 0.78) * state.emergenceGain);
  }

  function inspectHighestTension() {
    const universe = state.selected;
    if (!universe?.galaxies.length) return;
    const galaxy = universe.galaxies.reduce((peak, candidate) => (
      !peak || candidate.formationTension > peak.formationTension ? candidate : peak
    ), null);
    if (!galaxy) return;
    if (state.focusView === 'mandelbrot') setFocusView('universe');
    if (state.age < galaxy.birth + 0.06) {
      state.age = Math.min(1, galaxy.birth + 0.06);
      updateAgeUI();
    }
    setCosmosCameraTarget({ x: galaxy.x, y: galaxy.y, scale: 1 / 28 }, {
      inspectId: galaxy.id,
      motion: 'manual'
    });
    announce(`${galaxy.id}, ${galaxy.type.toLowerCase()}, has ${Math.round(galaxy.formationTension * 100)} percent formation tension inside this model.`);
    showToast(`${galaxy.id} · ${galaxy.tensionDominant}. Model inconsistency flag—not a claim of physical impossibility.`, 5200);
  }

  function updateSelectedUI() {
    const universe = state.selected;
    const selectedPanel = $('#selected-universe');
    const hud = $('#universe-hud');
    selectedPanel.hidden = !universe;
    hud.hidden = !universe;
    if (!universe) {
      $('#universe-state').textContent = 'NO COSMOS YET';
      return;
    }

    $('#selected-name').textContent = universe.name;
    $('#selected-seed').textContent = universe.genome.seedHex;
    $('#selected-strands').textContent = String(universe.strands.length).padStart(2, '0');
    $('#selected-ratio').textContent = `${universe.genome.genes.darkMatterRatio.toFixed(1)} : 1`;
    $('#selected-attractor').textContent = universe.genome.genes.attractor;
    const peakTension = universe.galaxies.reduce((peak, galaxy) => (
      !peak || galaxy.formationTension > peak.formationTension ? galaxy : peak
    ), null);
    const flagged = universe.galaxies.filter((galaxy) => galaxy.formationTension >= 0.42).length;
    $('#selected-flags').textContent = `${flagged} / ${universe.galaxies.length}`;
    $('#selected-tension').textContent = peakTension
      ? `${Math.round(peakTension.formationTension * 100)}% · ${peakTension.id}`
      : '—';
    $('#hud-seed').textContent = universe.genome.seedHex;
    $('#hud-attractor').textContent = universe.genome.genes.attractor;
    $('#hud-halos').textContent = String(universe.genome.genes.haloCount);
    $('#hud-age').textContent = state.age.toFixed(2);
    $('#hud-order').textContent = `${Math.round(orderProxy(universe) * 100)}%`;
    $('#universe-state').textContent = `${universe.id} · ${universe.genome.seedHex}`;
    $('#divergence-hud').hidden = !state.comparison || state.viewMode !== 'divergence';
  }

  function renderArchive() {
    const list = $('#universe-list');
    $('#universe-count').textContent = `${String(state.universes.length).padStart(2, '0')} UNIVERSES`;
    if (!state.universes.length) {
      const empty = document.createElement('div');
      empty.className = 'archive-empty';
      const orbit = document.createElement('span');
      orbit.className = 'orbit-icon';
      const title = document.createElement('b');
      title.textContent = 'NO UNIVERSES BOTTLED';
      const copy = document.createElement('p');
      copy.textContent = 'Every completed line will become a replayable branch here.';
      empty.append(orbit, title, copy);
      list.replaceChildren(empty);
      return;
    }

    const fragment = document.createDocumentFragment();
    [...state.universes].reverse().forEach((universe) => {
      const button = document.createElement('button');
      button.className = 'universe-card';
      button.classList.toggle('is-selected', state.selected?.id === universe.id);
      button.classList.toggle('is-twin', Boolean(universe.parentId && universe.perturbation));
      button.dataset.id = universe.id;
      button.setAttribute('aria-pressed', String(state.selected?.id === universe.id));

      const thumb = document.createElement('span');
      thumb.className = 'universe-thumb';
      const hue = Math.round(universe.genome.genes.hue * 360);
      thumb.style.setProperty('--thumb-color', `hsl(${hue} 74% 66%)`);
      thumb.style.setProperty('--gx', `${30 + universe.genome.metrics.spin * 40}%`);
      thumb.style.setProperty('--gy', `${25 + universe.genome.metrics.density * 45}%`);
      thumb.style.setProperty('--thumb-rotation', `${universe.genome.metrics.spin * 130}deg`);

      const copy = document.createElement('span');
      copy.className = 'universe-card-copy';
      const name = document.createElement('b');
      name.textContent = universe.name;
      const meta = document.createElement('span');
      meta.textContent = `${universe.genome.genes.attractor} · ${universe.strands.length} STRAND${universe.strands.length === 1 ? '' : 'S'}`;
      copy.append(name, meta);
      const seed = document.createElement('output');
      seed.textContent = universe.genome.seedHex.slice(0, 4);
      button.append(thumb, copy, seed);
      button.addEventListener('click', () => selectUniverse(universe));
      fragment.append(button);
    });
    list.replaceChildren(fragment);
  }

  function ageStage(age) {
    if (age < 0.18) return 'INITIAL FIELD';
    if (age < 0.36) return 'DARK AGES';
    if (age < 0.58) return 'FIRST COLLAPSE';
    if (age < 0.78) return 'COSMIC DAWN';
    if (age < 0.98) return 'GALAXY ERA';
    return 'PRESENT MODEL';
  }

  function updatePlayButton() {
    const button = $('#play-button');
    button.classList.toggle('is-playing', state.playing);
    button.setAttribute('aria-pressed', String(state.playing));
    button.setAttribute('aria-label', state.playing ? 'Pause cosmic evolution' : 'Play cosmic evolution');
  }

  function updateAgeUI() {
    updatePlayButton();
    const input = $('#age-control');
    input.value = String(state.age);
    setRangeProgress(input);
    $('#age-label').textContent = `${state.age.toFixed(2)} · ${ageStage(state.age)}`;
    $('#hud-age').textContent = state.age.toFixed(2);
    if (state.selected) $('#hud-order').textContent = `${Math.round(orderProxy(state.selected) * 100)}%`;
    if (state.comparison) {
      const divergence = MathX.divergenceScore(state.comparison.base, state.comparison.twin, state.age);
      $('#divergence-bar').style.width = `${divergence * 100}%`;
      $('#divergence-value').textContent = `${Math.round(divergence * 100)}%`;
      $('#correlation-label').textContent = `${Math.round(state.phaseLink * 100)}% phases linked · classical correlation`;
    }
  }

  function drawShaderRect(p, shader, rect, uniforms) {
    if (!shader || rect.w <= 1 || rect.h <= 1) return;
    p.push();
    p.noStroke();
    p.shader(shader);
    Object.entries(uniforms).forEach(([key, value]) => shader.setUniform(key, value));
    p.rect(rect.x - p.width / 2, rect.y - p.height / 2, rect.w, rect.h);
    p.pop();
    p.resetShader();
  }

  function seedVector(seed) {
    return [
      (seed & 255) / 255,
      ((seed >>> 8) & 255) / 255,
      ((seed >>> 16) & 255) / 255,
      ((seed >>> 24) & 255) / 255
    ];
  }

  function cosmosUniforms(universe, sharedUniverse, correlation) {
    const { genome } = universe;
    return {
      uTime: performance.now() * 0.001,
      uAge: state.age,
      uAspect: 1,
      uSeed: seedVector(genome.seed),
      uSharedSeed: seedVector((sharedUniverse || universe).genome.seed),
      uCorrelation: correlation,
      uDensity: genome.metrics.density,
      uTurbulence: genome.metrics.turbulence,
      uSpin: genome.metrics.spin,
      uVoidBias: genome.metrics.voidBias,
      uFilamentGain: genome.genes.filamentGain * state.emergenceGain,
      uDarkMatter: state.layers.dark ? state.darkGain * genome.genes.darkMatterRatio / 5 : 0,
      uBubbleLayer: state.layers.bubbles ? 1 : 0,
      uGasLayer: state.layers.gas ? 1 : 0,
      uHaloLayer: state.layers.halos ? 1 : 0,
      uAttractorLayer: state.layers.attractor ? 1 : 0
    };
  }

  function renderCosmos(p, universe, rect, sharedUniverse = null, correlation = 0) {
    if (rect.w < 2 || rect.h < 2) return;
    const uniforms = cosmosUniforms(universe, sharedUniverse, correlation);
    const aspect = rect.w / Math.max(1, rect.h);
    const span = MathX.cosmicFitSpan(aspect) * state.cosmosCamera.scale;
    uniforms.uAspect = aspect;
    uniforms.uViewCenter = [state.cosmosCamera.x, state.cosmosCamera.y];
    uniforms.uViewScale = span;
    uniforms.uViewZoom = 1 / Math.max(COSMOS_MIN_SCALE, state.cosmosCamera.scale);
    uniforms.uPixelWorld = span / Math.max(1, rect.h);
    drawShaderRect(p, state.shaders?.cosmos, rect, uniforms);
    if ((state.layers.stars || state.layers.tension) && state.selected) drawGalaxies(p, universe, rect);
  }

  function drawGalaxyMorphology(p, universe, galaxy, galaxyIndex, radius, birthFade) {
    const warm = galaxy.temperature;
    const red = 170 + warm * 85;
    const green = 205 - warm * 22;
    const blue = 255 - warm * 85;
    p.noFill();

    if (radius < 2.4) {
      p.stroke(red, green, blue, 115 + birthFade * 130);
      p.strokeWeight(Math.max(0.65, radius * 0.85));
      p.point(0, 0);
      return;
    }

    p.rotate(galaxy.rotation);
    p.stroke(red, green, blue, 75 + birthFade * 135);
    p.strokeWeight(Math.max(0.7, Math.min(2.4, radius * 0.08)));
    p.ellipse(0, 0, radius * 2.1, radius * 2.1 * galaxy.ellipticity);
    p.stroke(255, 218, 166, 130 + birthFade * 90);
    p.strokeWeight(Math.max(1, Math.min(7, radius * galaxy.coreSize)));
    p.point(0, 0);

    if (galaxy.type === 'SPIRAL' && radius > 4) {
      const steps = Math.min(58, Math.max(15, Math.floor(radius * 0.85)));
      p.stroke(244, 185, 95, 42 + birthFade * 62);
      p.strokeWeight(Math.max(0.55, Math.min(1.8, radius * 0.018)));
      for (let arm = 0; arm < galaxy.arms; arm += 1) {
        for (let lane = -1; lane <= 1; lane += 1) {
          p.stroke(
            lane === 0 ? 244 : 111,
            lane === 0 ? 185 : 191,
            lane === 0 ? 95 : 232,
            lane === 0 ? 42 + birthFade * 62 : 18 + birthFade * 26
          );
          p.beginShape();
          for (let step = 0; step < steps; step += 1) {
            const t = step / Math.max(1, steps - 1);
            const angle = t * Math.PI * 2 * galaxy.armPitch + arm * MathX.TAU / galaxy.arms + lane * 0.045;
            const armRadius = Math.pow(t, 0.82) * radius * (1.9 + lane * 0.035);
            p.vertex(Math.cos(angle) * armRadius, Math.sin(angle) * armRadius * galaxy.ellipticity);
          }
          p.endShape();
        }
      }
    } else if (galaxy.type === 'ELLIPTICAL' && radius > 5) {
      for (let shell = 1; shell <= 4; shell += 1) {
        p.stroke(205, 220, 255, 42 - shell * 5);
        p.strokeWeight(0.55);
        p.ellipse(0, 0, radius * shell * 0.92, radius * shell * 0.92 * galaxy.ellipticity);
      }
    }

    if (radius > 8) {
      const random = MathX.mulberry32((universe.genome.seed ^ Math.imul(galaxyIndex + 1, 0x85ebca6b)) >>> 0);
      const clusterCount = Math.min(180, Math.max(18, Math.floor(radius * (0.9 + galaxy.clumpiness))));
      for (let cluster = 0; cluster < clusterCount; cluster += 1) {
        const arm = Math.floor(random() * Math.max(1, galaxy.arms));
        const t = Math.sqrt(random());
        const angle = galaxy.type === 'SPIRAL'
          ? t * Math.PI * 2 * galaxy.armPitch + arm * MathX.TAU / Math.max(1, galaxy.arms) + (random() - 0.5) * 0.23
          : random() * MathX.TAU;
        const spread = galaxy.type === 'SPIRAL' ? t * radius * 1.9 : Math.sqrt(random()) * radius * 1.45;
        const x = Math.cos(angle) * spread + (random() - 0.5) * radius * 0.09;
        const y = Math.sin(angle) * spread * galaxy.ellipticity + (random() - 0.5) * radius * 0.09;
        const hot = random();
        p.stroke(170 + hot * 85, 190 + hot * 55, 255 - hot * 75, 80 + random() * 155);
        p.strokeWeight(0.55 + random() * Math.min(2.1, radius * 0.025));
        p.point(x, y);
      }

      if (radius > 16) {
        for (let satellite = 0; satellite < galaxy.satelliteCount; satellite += 1) {
          const angle = random() * MathX.TAU;
          const orbit = radius * (2.3 + random() * 3.2);
          p.stroke(150, 194, 244, 75 + random() * 95);
          p.strokeWeight(0.65 + random());
          p.point(Math.cos(angle) * orbit, Math.sin(angle) * orbit * 0.72);
        }
      }
    }
  }

  function drawFormationTension(p, marker, rect, zoom) {
    const { galaxy, x, y, radius } = marker;
    const targeted = galaxy.id === state.cosmosCamera.inspectId;
    const flagged = galaxy.tensionRank < 6 || galaxy.formationTension >= 0.48;
    if (!targeted && !flagged && zoom < 7) return;
    const alpha = 42 + galaxy.formationTension * 150 + (targeted ? 55 : 0);
    const ring = Math.min(88, Math.max(6, radius * 2.1) + (targeted ? 5 : 0));
    p.noFill();
    p.stroke(235, 99, 180, Math.min(245, alpha));
    p.strokeWeight(targeted ? 1.25 : 0.7);
    p.circle(x, y, ring * 2);
    const tick = Math.min(8, ring * 0.32);
    p.line(x - ring, y, x - ring + tick, y);
    p.line(x + ring - tick, y, x + ring, y);
    p.line(x, y - ring, x, y - ring + tick);
    p.line(x, y + ring - tick, x, y + ring);

    if (targeted && zoom >= 5 && rect.w > 250) {
      const rightEdge = rect.x + rect.w - p.width / 2 - 126;
      const labelX = Math.min(x + ring + 7, rightEdge);
      const labelY = Math.max(rect.y - p.height / 2 + 52, y - 5);
      p.noStroke();
      p.fill(244, 168, 210, 230);
      p.textFont('monospace');
      p.textSize(7);
      p.text(`${galaxy.id} · FORMATION TENSION ${Math.round(galaxy.formationTension * 100)}%`, labelX, labelY);
      p.fill(142, 113, 150, 210);
      p.textSize(6);
      p.text(galaxy.tensionDominant, labelX, labelY + 11);
    }
  }

  function drawGalaxies(p, universe, rect) {
    if (rect.w < 2 || rect.h < 2) return;
    const aspect = rect.w / Math.max(1, rect.h);
    const view = cameraView();
    const span = MathX.cosmicFitSpan(aspect) * view.scale;
    const zoom = 1 / Math.max(COSMOS_MIN_SCALE, view.scale);
    const budgetStride = state.fps && state.fps < 30 && zoom < 5 ? 2 : 1;
    const markers = [];
    p.push();
    p.blendMode(p.ADD);
    p.noFill();
    for (let index = 0; index < universe.galaxies.length; index += budgetStride) {
      const galaxy = universe.galaxies[index];
      if (state.age < galaxy.birth) continue;
      const screen = MathX.cosmicFieldToScreen(galaxy.x, galaxy.y, view, aspect);
      const birthFade = MathX.clamp((state.age - galaxy.birth) * 12);
      const radiusWorld = 0.00055 + galaxy.size * 0.0007;
      const radius = Math.max(0.55, radiusWorld / span * rect.h * birthFade);
      const marginX = Math.min(0.45, (radius * 6) / rect.w);
      const marginY = Math.min(0.45, (radius * 6) / rect.h);
      if (screen.x < -marginX || screen.x > 1 + marginX || screen.y < -marginY || screen.y > 1 + marginY) continue;
      const x = rect.x + screen.x * rect.w - p.width / 2;
      const y = rect.y + screen.y * rect.h - p.height / 2;
      markers.push({ galaxy, x, y, radius });

      if (!state.layers.stars) continue;
      if (state.layers.halos && galaxy.mass > 0.24) {
        p.stroke(82, 137, 239, 15 + galaxy.mass * 27);
        p.strokeWeight(Math.max(0.6, Math.min(1.4, radius * 0.016)));
        p.circle(x, y, radius * (5.2 + galaxy.mass * 1.4));
      }
      p.push();
      p.translate(x, y);
      drawGalaxyMorphology(p, universe, galaxy, index, radius, birthFade);
      p.pop();
    }
    p.blendMode(p.BLEND);
    if (state.layers.tension) markers.forEach((marker) => drawFormationTension(p, marker, rect, zoom));
    p.pop();
  }

  function drawPathSet(p, strands, alpha = 220) {
    const rect = state.layout.source;
    if (rect.w < 2 || rect.h < 2) return;
    const aspect = rect.w / rect.h;
    strands.forEach((strand, strandIndex) => {
      const points = strand.points || strand;
      const color = roleColors[strand.role] || roleColors.AUTO;
      p.push();
      p.noFill();
      p.stroke(color[0], color[1], color[2], alpha * 0.2);
      p.strokeWeight(5);
      for (let index = 1; index < points.length; index += 1) {
        const a = MathX.complexToScreen(points[index - 1].cx, points[index - 1].cy, state.view, aspect);
        const b = MathX.complexToScreen(points[index].cx, points[index].cy, state.view, aspect);
        if (a.x < -0.03 || a.x > 1.03 || a.y < -0.03 || a.y > 1.03 || b.x < -0.03 || b.x > 1.03 || b.y < -0.03 || b.y > 1.03) continue;
        p.line(
          rect.x + a.x * rect.w - p.width / 2,
          rect.y + a.y * rect.h - p.height / 2,
          rect.x + b.x * rect.w - p.width / 2,
          rect.y + b.y * rect.h - p.height / 2
        );
      }
      p.stroke(color[0], color[1], color[2], alpha);
      p.strokeWeight(1.15 + strandIndex * 0.08);
      for (let index = 1; index < points.length; index += 1) {
        const a = MathX.complexToScreen(points[index - 1].cx, points[index - 1].cy, state.view, aspect);
        const b = MathX.complexToScreen(points[index].cx, points[index].cy, state.view, aspect);
        if (a.x < 0 || a.x > 1 || a.y < 0 || a.y > 1 || b.x < 0 || b.x > 1 || b.y < 0 || b.y > 1) continue;
        p.line(
          rect.x + a.x * rect.w - p.width / 2,
          rect.y + a.y * rect.h - p.height / 2,
          rect.x + b.x * rect.w - p.width / 2,
          rect.y + b.y * rect.h - p.height / 2
        );
      }
      p.pop();
    });
  }

  function drawAttractor(p, universe, color, xOffset = 0) {
    if (!universe || !state.layers.attractor) return;
    const rect = state.layout.loom;
    if (rect.w < 2 || rect.h < 2) return;
    const points = universe.attractor;
    p.push();
    p.noFill();
    p.stroke(color[0], color[1], color[2], 95);
    p.strokeWeight(0.8);
    p.beginShape();
    const phase = state.reducedMotion ? 0 : Math.floor(performance.now() * 0.015) % points.length;
    for (let index = 0; index < Math.min(520, points.length); index += 3) {
      const point = points[(index + phase) % points.length];
      const x = rect.x + 9 + point.x * (rect.w - 18) + xOffset - p.width / 2;
      const y = rect.y + 76 + point.y * Math.max(70, rect.h - 160) - p.height / 2;
      p.vertex(x, y);
    }
    p.endShape();
    p.pop();
  }

  function drawCanvasChrome(p) {
    const { source, loom, cosmos } = state.layout;
    p.push();
    p.noFill();
    p.stroke(42, 57, 86, 150);
    p.strokeWeight(1);
    if (source.w > 1) p.rect(source.x - p.width / 2, source.y - p.height / 2, source.w, source.h);
    if (cosmos.w > 1) p.rect(cosmos.x - p.width / 2, cosmos.y - p.height / 2, cosmos.w, cosmos.h);
    p.stroke(85, 214, 232, 100);
    const corner = 14;
    p.line(source.x - p.width / 2, source.y - p.height / 2 + corner, source.x - p.width / 2, source.y - p.height / 2);
    p.line(source.x - p.width / 2, source.y - p.height / 2, source.x - p.width / 2 + corner, source.y - p.height / 2);
    p.pop();

    if (state.viewMode === 'divergence' && state.comparison) {
      p.push();
      p.textFont('monospace');
      p.textSize(8);
      p.noStroke();
      p.fill(85, 214, 232, 190);
      p.text('A / BASE', cosmos.x + 10 - p.width / 2, 49 - p.height / 2);
      p.fill(235, 99, 180, 190);
      p.text('A′ / ε = 10⁻⁸', cosmos.x + cosmos.w / 2 + 11 - p.width / 2, 49 - p.height / 2);
      p.pop();
    }
  }

  function renderFrame(p) {
    if (state.contextLost) return;
    state.layout = calculateLayout(p.width, p.height);
    if (p.frameCount % 10 === 1) syncLayoutDOM();
    if (!state.webglReady) {
      renderSafePreview(p);
      return;
    }
    p.background(3, 5, 12);

    const selected = state.selected || ambientUniverse;
    const accent = state.selected?.genome.genes.hue || 0.52;
    drawShaderRect(p, state.shaders?.mandelbrot, state.layout.source, {
      uCenter: [state.view.x, state.view.y],
      uScale: state.view.scale,
      uAspect: state.layout.source.w / Math.max(1, state.layout.source.h),
      uTime: performance.now() * 0.001,
      uAccent: accent,
      uContrast: 1.08,
      uIterations: state.iterations
    });

    if (state.viewMode === 'divergence' && state.comparison) {
      const [aRect, bRect] = cosmosRects();
      if (aRect && bRect) {
        renderCosmos(p, state.comparison.base, aRect, state.comparison.base, 0);
        renderCosmos(p, state.comparison.twin, bRect, state.comparison.base, state.phaseLink);
        p.push();
        p.stroke(235, 99, 180, 110);
        p.strokeWeight(1);
        p.line(bRect.x - 1 - p.width / 2, -p.height / 2, bRect.x - 1 - p.width / 2, p.height / 2);
        p.pop();
      }
    } else {
      renderCosmos(p, selected, state.layout.cosmos);
    }

    if (state.selected) drawPathSet(p, state.selected.strands, 210);
    if (state.bundle.length) drawPathSet(p, state.bundle, 190);
    if (state.currentStroke?.length) {
      drawPathSet(p, [{ points: state.currentStroke, role: $('#strand-role').value }], 245);
    }

    if (state.comparison && state.viewMode === 'divergence') {
      drawAttractor(p, state.comparison.base, [85, 214, 232], -2);
      drawAttractor(p, state.comparison.twin, [235, 99, 180], 2);
    } else {
      drawAttractor(p, state.selected || (state.previewGenome ? { attractor: MathX.generateAttractor(state.previewGenome, 520) } : null), [235, 99, 180]);
    }
    drawCanvasChrome(p);
  }

  function makeFallbackFractal(p) {
    const key = `${state.view.x.toFixed(7)}:${state.view.y.toFixed(7)}:${state.view.scale.toFixed(7)}:${state.iterations}`;
    if (state.fallbackImage && state.fallbackKey === key) return state.fallbackImage;
    const width = 180;
    const height = 180;
    const image = p.createImage(width, height);
    image.loadPixels();
    const aspect = state.layout.source.w / Math.max(1, state.layout.source.h);
    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        const c = MathX.screenToComplex(x / (width - 1), y / (height - 1), state.view, aspect);
        const sample = MathX.mandelbrotSample(c.x, c.y, Math.min(80, state.iterations));
        const pixel = (y * width + x) * 4;
        const edge = sample.interior ? 0 : MathX.clamp(sample.normalized * 5 + (1 - sample.orbitTrap) * 0.3);
        image.pixels[pixel] = sample.interior ? 2 : 20 + edge * 35;
        image.pixels[pixel + 1] = sample.interior ? 4 : 52 + edge * 130;
        image.pixels[pixel + 2] = sample.interior ? 13 : 78 + edge * 150;
        image.pixels[pixel + 3] = 255;
      }
    }
    image.updatePixels();
    state.fallbackImage = image;
    state.fallbackKey = key;
    return image;
  }

  function drawSafePaths(p, strands, alpha = 220) {
    const rect = state.layout.source;
    if (rect.w < 2 || rect.h < 2) return;
    const aspect = rect.w / rect.h;
    strands.forEach((strand) => {
      const points = strand.points || strand;
      const color = roleColors[strand.role] || roleColors.AUTO;
      p.noFill();
      p.stroke(color[0], color[1], color[2], alpha);
      p.strokeWeight(1.5);
      p.beginShape();
      points.forEach((point) => {
        const screen = MathX.complexToScreen(point.cx, point.cy, state.view, aspect);
        if (screen.x >= 0 && screen.x <= 1 && screen.y >= 0 && screen.y <= 1) {
          p.vertex(rect.x + screen.x * rect.w, rect.y + screen.y * rect.h);
        }
      });
      p.endShape();
    });
  }

  function renderSafePreview(p) {
    state.layout = calculateLayout(p.width, p.height);
    const { source, loom, cosmos } = state.layout;
    p.background(3, 5, 12);
    if (source.w > 1) {
      const fractal = makeFallbackFractal(p);
      p.image(fractal, source.x, source.y, source.w, source.h);
    }
    p.noStroke();
    p.fill(5, 9, 21);
    if (loom.w > 1) p.rect(loom.x, loom.y, loom.w, loom.h);
    if (cosmos.w > 1) p.rect(cosmos.x, cosmos.y, cosmos.w, cosmos.h);

    const universe = state.selected || ambientUniverse;
    const cosmosAspect = cosmos.w / Math.max(1, cosmos.h);
    const cosmosView = cameraView();
    const cosmosSpan = MathX.cosmicFitSpan(cosmosAspect) * cosmosView.scale;
    p.noFill();
    for (let index = 1; cosmos.w > 1 && index < universe.attractor.length; index += 8) {
      const a = universe.attractor[index - 1];
      const b = universe.attractor[index];
      const aScreen = MathX.cosmicFieldToScreen(a.x, a.y, cosmosView, cosmosAspect);
      const bScreen = MathX.cosmicFieldToScreen(b.x, b.y, cosmosView, cosmosAspect);
      if (aScreen.x < 0 || aScreen.x > 1 || aScreen.y < 0 || aScreen.y > 1
        || bScreen.x < 0 || bScreen.x > 1 || bScreen.y < 0 || bScreen.y > 1) continue;
      p.stroke(52, 107, 165, 32);
      p.line(
        cosmos.x + aScreen.x * cosmos.w,
        cosmos.y + aScreen.y * cosmos.h,
        cosmos.x + bScreen.x * cosmos.w,
        cosmos.y + bScreen.y * cosmos.h
      );
    }
    if (state.selected && (state.layers.stars || state.layers.tension)) {
      state.selected.galaxies.forEach((galaxy, index) => {
        if (index % 2 || galaxy.birth > state.age) return;
        const screen = MathX.cosmicFieldToScreen(galaxy.x, galaxy.y, cosmosView, cosmosAspect);
        if (screen.x < 0 || screen.x > 1 || screen.y < 0 || screen.y > 1) return;
        const x = cosmos.x + screen.x * cosmos.w;
        const y = cosmos.y + screen.y * cosmos.h;
        const radius = Math.max(1, (0.00055 + galaxy.size * 0.0007) / cosmosSpan * cosmos.h);
        if (state.layers.stars) {
          p.stroke(235, 214, 173, 130);
          p.strokeWeight(Math.max(1, Math.min(6, radius * 0.65)));
          p.point(x, y);
        }
        if (state.layers.tension && (galaxy.tensionRank < 6 || galaxy.id === state.cosmosCamera.inspectId)) {
          p.noFill();
          p.stroke(235, 99, 180, 130);
          p.strokeWeight(1);
          p.circle(x, y, Math.max(10, radius * 5));
        }
      });
    }
    if (state.selected) drawSafePaths(p, state.selected.strands, 220);
    if (state.bundle.length) drawSafePaths(p, state.bundle, 190);
    if (state.currentStroke?.length) drawSafePaths(p, [{ points: state.currentStroke, role: $('#strand-role').value }], 245);

    p.noStroke();
    p.fill(255, 180, 84, 210);
    p.textFont('monospace');
    p.textSize(9);
    if (cosmos.w > 1) p.text('SAFE PREVIEW · WEBGL GPU CONTEXT UNAVAILABLE', cosmos.x + 14, cosmos.y + 64);
    p.fill(120, 135, 160, 180);
    p.textSize(7);
    if (cosmos.w > 1) p.text('GENOMES REMAIN DETERMINISTIC · FIELD DETAIL REDUCED', cosmos.x + 14, cosmos.y + 79);
    p.noFill();
    p.stroke(42, 57, 86);
    p.strokeWeight(1);
    if (source.w > 1) p.rect(source.x, source.y, source.w, source.h);
    if (cosmos.w > 1) p.rect(cosmos.x, cosmos.y, cosmos.w, cosmos.h);
  }

  function tickFrameStats(p) {
    state.fpsAccumulator += p.frameRate();
    state.fpsFrames += 1;
    const now = performance.now();
    if (now - state.fpsLastUpdate > 700) {
      state.fps = Math.round(state.fpsAccumulator / Math.max(1, state.fpsFrames));
      $('#fps-label').textContent = `${state.fps} FPS`;
      state.fpsAccumulator = 0;
      state.fpsFrames = 0;
      state.fpsLastUpdate = now;
    }
  }

  function queryWebGLDiagnostics(gl) {
    const extension = gl.getExtension('WEBGL_debug_renderer_info');
    const renderer = extension
      ? gl.getParameter(extension.UNMASKED_RENDERER_WEBGL)
      : gl.getParameter(gl.RENDERER);
    const vendor = extension
      ? gl.getParameter(extension.UNMASKED_VENDOR_WEBGL)
      : gl.getParameter(gl.VENDOR);
    const software = /swiftshader|llvmpipe|software|mesa offscreen/i.test(`${renderer} ${vendor}`);
    return {
      webglVersion: state.webgl2 ? 'WebGL 2' : 'WebGL 1',
      renderer,
      vendor,
      maxTextureSize: gl.getParameter(gl.MAX_TEXTURE_SIZE),
      maxFragmentUniforms: gl.getParameter(gl.MAX_FRAGMENT_UNIFORM_VECTORS),
      precision: gl.getShaderPrecisionFormat(gl.FRAGMENT_SHADER, gl.HIGH_FLOAT)?.precision || 0,
      software
    };
  }

  async function refreshDiagnostics() {
    const webgl = state.gl ? queryWebGLDiagnostics(state.gl) : { software: true, renderer: 'No WebGL context' };
    let electron = null;
    if (window.cosmosAPI) {
      try {
        electron = await window.cosmosAPI.getDiagnostics();
      } catch (error) {
        electron = { error: error.message };
      }
    }
    const hardware = Boolean(!webgl.software && (!electron || electron.hardwareAcceleration !== false));
    state.diagnostics = { webgl, electron, hardware, shaderError: state.shaderError, gpuNotice: state.gpuNotice };

    const badge = $('#gpu-button');
    badge.classList.remove('is-checking', 'is-hardware', 'is-software', 'is-error');
    badge.classList.add(state.shaderError ? 'is-error' : (hardware ? 'is-hardware' : 'is-software'));
    $('#gpu-label').textContent = state.shaderError
      ? 'GPU · SHADER ERROR'
      : (hardware ? `GPU · ${state.webgl2 ? 'WEBGL2' : 'WEBGL1'}` : 'SAFE PREVIEW · SOFTWARE');
    renderDiagnosticDialog();
    if (!hardware) showToast('Safe Preview: a software renderer was detected. Geometry remains deterministic; visual density may be reduced.', 5200);
  }

  function renderDiagnosticDialog() {
    const diagnostics = state.diagnostics;
    if (!diagnostics) return;
    const { webgl, electron, hardware, shaderError, gpuNotice } = diagnostics;
    const summary = $('#gpu-summary');
    summary.classList.toggle('is-hardware', hardware);
    summary.classList.toggle('is-software', !hardware);
    $('b', summary).textContent = shaderError
      ? 'SHADER INITIALIZATION FAILED'
      : (hardware ? 'HARDWARE ACCELERATION ACTIVE' : 'SOFTWARE / SAFE PREVIEW');
    $('p', summary).textContent = shaderError || gpuNotice || (hardware
      ? 'Mandelbrot and dark-field fragments are executing through WebGL on the graphics pipeline.'
      : 'The field is running through a fallback renderer. Performance and density may be limited.');

    const entries = [
      ['WEBGL CONTEXT', webgl.webglVersion || 'Unavailable'],
      ['ACTIVE RENDERER', webgl.renderer || 'Unknown'],
      ['GPU VENDOR', webgl.vendor || 'Unknown'],
      ['MAX TEXTURE', webgl.maxTextureSize ? `${webgl.maxTextureSize} px` : 'Unknown'],
      ['FRAGMENT PRECISION', webgl.precision ? `${webgl.precision}-bit` : 'Unknown'],
      ['ELECTRON', electron?.electron || 'Browser edition'],
      ['CHROMIUM', electron?.chromium || navigator.userAgent.match(/Chrome\/[\d.]+/)?.[0] || 'Browser'],
      ['GPU COMPOSITING', electron?.featureStatus?.gpu_compositing || (hardware ? 'enabled' : 'unknown')],
      ['WEBGL FEATURE', electron?.featureStatus?.webgl || (state.gl ? 'enabled' : 'unavailable')],
      ['SHADER PATH', state.shaders ? 'Mandelbrot + density field active' : 'fallback'],
      ['GALAXY BUDGET', state.selected ? `${state.selected.galaxies.length} proxies` : 'awaiting universe'],
      ['FRAME RATE', state.fps ? `${state.fps} FPS` : 'sampling']
    ];
    const nodes = entries.map(([term, description]) => {
      const wrapper = document.createElement('div');
      const dt = document.createElement('dt');
      const dd = document.createElement('dd');
      dt.textContent = term;
      dd.textContent = String(description);
      wrapper.append(dt, dd);
      return wrapper;
    });
    $('#diagnostic-grid').replaceChildren(...nodes);
  }

  function setupP5() {
    state.p = new window.p5((p) => {
      p.setup = () => {
        const width = Math.max(10, host.clientWidth);
        const height = Math.max(10, host.clientHeight);
        const probe = document.createElement('canvas');
        const candidate = probe.getContext('webgl2', { failIfMajorPerformanceCaveat: false })
          || probe.getContext('webgl', { failIfMajorPerformanceCaveat: false });
        let canvas;
        if (candidate) {
          const candidateIsWebGL2 = typeof window.WebGL2RenderingContext !== 'undefined'
            && candidate instanceof window.WebGL2RenderingContext;
          p.setAttributes({ version: candidateIsWebGL2 ? 2 : 1, antialias: false, alpha: false, depth: false, stencil: false, preserveDrawingBuffer: true });
          try {
            canvas = p.createCanvas(width, height, p.WEBGL);
            state.webglReady = true;
          } catch (error) {
            state.shaderError = `WebGL initialization failed: ${error.message}`;
          }
        } else {
          state.gpuNotice = 'No WebGL context is available. Safe Preview is active.';
        }
        if (!canvas) {
          canvas = p.createCanvas(width, height, p.P2D);
          state.webglReady = false;
        }
        canvas.parent(host);
        p.pixelDensity(1);
        p.rectMode(p.CORNER);
        p.frameRate(60);
        if (state.webglReady) {
          state.gl = p._renderer.GL;
          state.webgl2 = typeof window.WebGL2RenderingContext !== 'undefined' && state.gl instanceof window.WebGL2RenderingContext;
          try {
            state.shaders = {
              mandelbrot: p.createShader(Shaders.vertex(state.webgl2), Shaders.mandelbrot(state.webgl2)),
              cosmos: p.createShader(Shaders.vertex(state.webgl2), Shaders.cosmos(state.webgl2))
            };
          } catch (error) {
            state.shaderError = error.message;
            console.error(error);
          }
        }

        state.layout = calculateLayout(p.width, p.height);
        syncLayoutDOM();
        canvas.elt.addEventListener('webglcontextlost', (event) => {
          event.preventDefault();
          state.contextLost = true;
          state.playing = false;
          showToast('GPU context lost. Your universes are safe; waiting for restoration…', 6000);
          announce('GPU context lost. Simulation paused; universe data is safe.');
        });
        canvas.elt.addEventListener('webglcontextrestored', () => {
          state.contextLost = false;
          showToast('GPU context restored. Recompiling the universe field…');
          window.location.reload();
        });
        refreshDiagnostics();
      };

      p.draw = () => {
        const now = performance.now();
        if (state.screensaver.active) {
          if (now >= state.screensaver.nextAt) autoGenerateUniverse();
          if (now >= state.screensaver.nextCameraAt) tourCosmosCamera(now);
          if (p.frameCount % 12 === 0) {
            const remaining = Math.max(0, Math.ceil((state.screensaver.nextAt - now) / 1000));
            const depth = 1 / Math.max(COSMOS_MIN_SCALE, state.cosmosCamera.scale);
            const depthLabel = state.focusView === 'both' ? 'DUAL DEPTH' : 'DEPTH';
            $('#screensaver-status').textContent = `NEXT GENOME IN ${remaining}s · ${depthLabel} ${depth < 10 ? depth.toFixed(1) : Math.round(depth)}× · ${state.universes.length} BOTTLED`;
          }
        }
        if (state.playing && state.selected && !state.contextLost) {
          state.age = Math.min(1, state.age + Math.min(50, p.deltaTime) * 0.00032);
          if (state.age >= 1) state.playing = false;
          if (p.frameCount % 4 === 0) updateAgeUI();
        }
        updateCosmosCamera(p.deltaTime || 16.67);
        updateFractalTourCamera(p.deltaTime || 16.67);
        if (p.frameCount % 5 === 0) updateCosmosCameraUI();
        renderFrame(p);
        tickFrameStats(p);
      };

      p.windowResized = () => {
        p.resizeCanvas(Math.max(10, host.clientWidth), Math.max(10, host.clientHeight));
        state.layout = calculateLayout(p.width, p.height);
        reclampCosmosCamera();
        syncLayoutDOM();
      };

      p.mousePressed = () => {
        state.pointer = { x: p.mouseX, y: p.mouseY };
        if (!state.layout) return;
        const cosmosRect = cosmosRectAt(p.mouseX, p.mouseY);
        if (cosmosRect && state.selected) {
          const camera = state.cosmosCamera;
          camera.targetX = camera.x;
          camera.targetY = camera.y;
          camera.targetScale = camera.scale;
          camera.inspectId = null;
          camera.motion = 'manual';
          state.cosmosPanning = true;
          state.cosmosPanOrigin = { x: p.mouseX, y: p.mouseY };
          state.cosmosViewOrigin = cameraView();
          state.cosmosPanRect = { ...cosmosRect };
          host.classList.add('is-cosmos-panning');
          return;
        }
        if (!pointerIn(state.layout.source, p.mouseX, p.mouseY)) return;
        if (state.tool === 'draw') {
          state.drawing = true;
          state.currentStroke = [makePoint(p.mouseX, p.mouseY)];
          $('#empty-callout').classList.add('is-hidden');
        } else if (state.tool === 'pan') {
          state.panning = true;
          state.panOrigin = { x: p.mouseX, y: p.mouseY };
          state.viewOrigin = { ...state.view };
          host.classList.add('is-panning');
        } else if (state.tool === 'probe') {
          updateProbe(p.mouseX, p.mouseY, true);
        }
      };

      p.mouseDragged = () => {
        state.pointer = { x: p.mouseX, y: p.mouseY };
        updateCoordinateReadout(p.mouseX, p.mouseY);
        if (state.cosmosPanning && state.cosmosPanRect) {
          const rect = state.cosmosPanRect;
          const aspect = rect.w / Math.max(1, rect.h);
          const span = MathX.cosmicFitSpan(aspect) * state.cosmosViewOrigin.scale;
          const dx = (p.mouseX - state.cosmosPanOrigin.x) / rect.w;
          const dy = (p.mouseY - state.cosmosPanOrigin.y) / rect.h;
          const next = MathX.clampCosmicView({
            x: state.cosmosViewOrigin.x - dx * span * aspect,
            y: state.cosmosViewOrigin.y - dy * span,
            scale: state.cosmosViewOrigin.scale
          }, aspect, COSMOS_MIN_SCALE, 1);
          Object.assign(state.cosmosCamera, {
            x: next.x,
            y: next.y,
            scale: next.scale,
            targetX: next.x,
            targetY: next.y,
            targetScale: next.scale,
            inspectId: null,
            motion: 'manual'
          });
          updateCosmosCameraUI();
        } else if (state.drawing && state.currentStroke && pointerIn(state.layout.source, p.mouseX, p.mouseY)) {
          const next = makePoint(p.mouseX, p.mouseY);
          const previous = state.currentStroke[state.currentStroke.length - 1];
          const pixelDistance = Math.hypot((next.x - previous.x) * state.layout.source.w, (next.y - previous.y) * state.layout.source.h);
          if (pixelDistance >= 2.2) {
            state.currentStroke.push(next);
            maybeAnalyzeDrawing();
          }
        } else if (state.panning) {
          const dx = (p.mouseX - state.panOrigin.x) / state.layout.source.w;
          const dy = (p.mouseY - state.panOrigin.y) / state.layout.source.h;
          state.view.x = state.viewOrigin.x - dx * state.viewOrigin.scale * (state.layout.source.w / state.layout.source.h);
          state.view.y = state.viewOrigin.y - dy * state.viewOrigin.scale;
        }
        if (state.tool === 'probe') updateProbe(p.mouseX, p.mouseY, true);
      };

      p.mouseReleased = () => {
        if (state.drawing) completeStroke();
        state.panning = false;
        state.cosmosPanning = false;
        state.cosmosPanRect = null;
        host.classList.remove('is-panning');
        host.classList.remove('is-cosmos-panning');
      };

      p.mouseMoved = () => {
        state.pointer = { x: p.mouseX, y: p.mouseY };
        updateCoordinateReadout(p.mouseX, p.mouseY);
        updateProbe(p.mouseX, p.mouseY, state.tool === 'probe');
        host.classList.toggle('is-cosmos-hover', Boolean(state.selected && cosmosRectAt(p.mouseX, p.mouseY)));
      };

      p.mouseOut = () => {
        if (!state.cosmosPanning) host.classList.remove('is-cosmos-hover');
      };

      p.mouseWheel = (event) => {
        if (!state.layout) return true;
        let delta = Number(event.delta ?? event.deltaY ?? 0);
        if (event.deltaMode === 1) delta *= 16;
        if (event.deltaMode === 2) delta *= Math.max(1, state.layout.source.h || state.layout.cosmos.h);
        if (pointerIn(state.layout.source, p.mouseX, p.mouseY)) {
          const before = eventToComplex(p.mouseX, p.mouseY);
          const factor = Math.exp(MathX.clamp(delta * 0.0012, -0.35, 0.35));
          state.view.scale = MathX.clamp(state.view.scale * factor, 0.000015, 4.2);
          const after = eventToComplex(p.mouseX, p.mouseY);
          state.view.x += before.x - after.x;
          state.view.y += before.y - after.y;
          updateCoordinateReadout(p.mouseX, p.mouseY);
          return false;
        }
        const cosmosRect = cosmosRectAt(p.mouseX, p.mouseY);
        if (cosmosRect && state.selected) {
          const factor = Math.exp(MathX.clamp(delta * 0.0015, -0.42, 0.42));
          zoomCosmosAt(p.mouseX, p.mouseY, factor, { rect: cosmosRect });
          return false;
        }
        return true;
      };

      p.doubleClicked = () => {
        const rect = cosmosRectAt(p.mouseX, p.mouseY);
        if (!rect || !state.selected) return true;
        zoomCosmosAt(p.mouseX, p.mouseY, 0.25, { rect });
        return false;
      };
    }, host);
  }

  function updateProbe(x, y, visible) {
    const readout = $('#probe-readout');
    const inside = state.layout && pointerIn(state.layout.source, x, y);
    readout.classList.toggle('is-visible', Boolean(visible && inside));
    readout.setAttribute('aria-hidden', String(!(visible && inside)));
    if (!visible || !inside) return;
    const c = eventToComplex(x, y);
    const sample = MathX.mandelbrotSample(c.x, c.y, state.iterations);
    readout.style.left = `${Math.min(x + 14, state.layout.source.w - 145)}px`;
    readout.style.top = `${Math.min(y + 14, state.layout.source.h - 58)}px`;
    $('#probe-coordinate').textContent = `c ${complexLabel(c)}`;
    $('#probe-iteration').textContent = sample.interior
      ? `bounded through ${state.iterations} iterations`
      : `smooth escape ${sample.smooth.toFixed(3)}`;
  }

  function resetFractalView() {
    state.view = { x: -0.5, y: 0, scale: 3 };
    $('#zoom-level').textContent = '1.00×';
    showToast('Mandelbrot frame restored.');
  }

  function togglePlaying() {
    if (!state.selected) {
      showToast('Draw a path before evolving model time.');
      return;
    }
    if (state.age >= 1 && !state.playing) state.age = 0;
    state.playing = !state.playing;
    updatePlayButton();
    announce(state.playing ? 'Model time running.' : 'Model time suspended.');
  }

  async function copyText(text, successMessage = 'Copied.') {
    try {
      await navigator.clipboard.writeText(text);
    } catch (_error) {
      const textarea = document.createElement('textarea');
      textarea.value = text;
      textarea.style.position = 'fixed';
      textarea.style.opacity = '0';
      document.body.append(textarea);
      textarea.select();
      document.execCommand('copy');
      textarea.remove();
    }
    showToast(successMessage);
  }

  function browserDownload(filename, contents, type) {
    const blob = contents instanceof Blob ? contents : new Blob([contents], { type });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = filename;
    anchor.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  async function exportGenome() {
    if (!state.selected) return;
    const json = JSON.stringify(MathX.bottleUniverse(state.selected), null, 2);
    if (window.cosmosAPI) {
      const result = await window.cosmosAPI.saveJSON({ suggestedName: state.selected.name, json });
      if (!result.canceled) showToast(`Genome bottled to ${result.filePath}.`);
    } else {
      browserDownload(`${state.selected.name.replace(/[^a-z0-9_-]+/gi, '-')}.universe.json`, json, 'application/json');
      showToast('Genome downloaded as JSON.');
    }
  }

  async function exportImage() {
    if (!state.p || !state.selected) return;
    const dataUrl = state.p.canvas.toDataURL('image/png');
    if (window.cosmosAPI) {
      const result = await window.cosmosAPI.savePNG({ suggestedName: state.selected.name, dataUrl });
      if (!result.canceled) showToast(`Universe image exported to ${result.filePath}.`);
    } else {
      const anchor = document.createElement('a');
      anchor.href = dataUrl;
      anchor.download = `${state.selected.name.replace(/[^a-z0-9_-]+/gi, '-')}.png`;
      anchor.click();
      showToast('Universe image downloaded.');
    }
  }

  function openDialog(dialog, note) {
    if (!dialog.open) dialog.showModal();
    if (note) {
      requestAnimationFrame(() => {
        $(`#note-${note}`)?.scrollIntoView({ block: 'start' });
        $$('[data-scroll-note]').forEach((button) => button.classList.toggle('is-active', button.dataset.scrollNote === note));
      });
    }
  }

  function wireUI() {
    $$('.tool-button').forEach((button) => button.addEventListener('click', () => setTool(button.dataset.tool)));
    $$('.creation-mode').forEach((button) => button.addEventListener('click', () => setCreationMode(button.dataset.creation)));
    $$('.mode-button').forEach((button) => button.addEventListener('click', () => setViewMode(button.dataset.view)));
    $('#focus-view-button').addEventListener('click', cycleFocusView);
    $$('.layer-button').forEach((button) => button.addEventListener('click', () => {
      const layer = button.dataset.layer;
      state.layers[layer] = !state.layers[layer];
      button.classList.toggle('is-active', state.layers[layer]);
      button.setAttribute('aria-pressed', String(state.layers[layer]));
    }));

    $('#dismiss-callout').addEventListener('click', () => $('#empty-callout').classList.add('is-hidden'));
    $('#new-genome').addEventListener('click', newGenome);
    $('#undo-strand').addEventListener('click', () => {
      state.bundle.pop();
      analyzePreview(state.bundle);
      $('#undo-strand').disabled = state.bundle.length === 0;
      $('#ignite-button').disabled = state.bundle.length === 0;
      showToast('Last strand removed from the loom.');
    });
    $('#ignite-button').addEventListener('click', igniteBundle);
    $('#reset-view').addEventListener('click', resetFractalView);
    $('#cosmos-camera-reset').addEventListener('click', () => resetCosmosCamera());
    $('#cosmos-zoom-in').addEventListener('click', () => {
      const rect = activeCosmosRect();
      zoomCosmosAt(rect.x + rect.w / 2, rect.y + rect.h / 2, 0.5, { rect });
    });
    $('#cosmos-zoom-out').addEventListener('click', () => {
      const rect = activeCosmosRect();
      zoomCosmosAt(rect.x + rect.w / 2, rect.y + rect.h / 2, 2, { rect });
    });
    const cosmosZoomControl = $('#cosmos-zoom-control');
    cosmosZoomControl.addEventListener('input', () => {
      const nextScale = 1 / (2 ** Number(cosmosZoomControl.value));
      setCosmosCameraTarget({
        x: state.cosmosCamera.targetX,
        y: state.cosmosCamera.targetY,
        scale: nextScale
      });
    });
    $('#fork-button').addEventListener('click', forkTwin);
    $('#play-button').addEventListener('click', togglePlaying);

    const ageControl = $('#age-control');
    ageControl.addEventListener('input', () => {
      state.age = Number(ageControl.value);
      state.playing = false;
      $('#play-button').classList.remove('is-playing');
      updateAgeUI();
    });

    const iterationControl = $('#iteration-control');
    iterationControl.addEventListener('input', () => {
      state.iterations = Number(iterationControl.value);
      $('#iteration-value').textContent = String(state.iterations);
      setRangeProgress(iterationControl);
      if (state.bundle.length) analyzePreview(state.bundle);
    });
    const darkControl = $('#dark-control');
    darkControl.addEventListener('input', () => {
      state.darkGain = Number(darkControl.value);
      $('#dark-value').textContent = state.darkGain.toFixed(2);
      setRangeProgress(darkControl);
    });
    const emergenceControl = $('#emergence-control');
    emergenceControl.addEventListener('input', () => {
      state.emergenceGain = Number(emergenceControl.value);
      $('#emergence-value').textContent = state.emergenceGain.toFixed(2);
      setRangeProgress(emergenceControl);
      updateAgeUI();
    });
    const phaseControl = $('#phase-link-control');
    phaseControl.addEventListener('input', () => {
      state.phaseLink = Number(phaseControl.value);
      $('#phase-link-value').textContent = `${Math.round(state.phaseLink * 100)}%`;
      setRangeProgress(phaseControl);
      updateAgeUI();
    });
    $$('input[type="range"]').forEach(setRangeProgress);

    $('#export-genome').addEventListener('click', exportGenome);
    $('#export-image').addEventListener('click', exportImage);
    $('#copy-seed').addEventListener('click', () => state.selected && copyText(state.selected.genome.seedHex, `Seed ${state.selected.genome.seedHex} copied.`));
    $('#inspect-tension').addEventListener('click', inspectHighestTension);
    $('#rename-universe').addEventListener('click', () => {
      if (!state.selected) return;
      const name = window.prompt('Name this universe', state.selected.name)?.trim();
      if (!name) return;
      state.selected.name = name.slice(0, 48);
      updateSelectedUI();
      renderArchive();
    });
    $('#clear-archive').addEventListener('click', () => {
      if (!state.universes.length) return;
      if (!window.confirm(`Remove ${state.universes.length} universes from this session? Exported files are unaffected.`)) return;
      state.universes = [];
      state.selected = null;
      state.comparison = null;
      state.bundle = [];
      state.cosmosViews.clear();
      state.cosmosCamera = makeCosmosCamera();
      state.age = 0;
      renderArchive();
      updateSelectedUI();
      updateGenomeUI(null);
      $('#empty-callout').classList.remove('is-hidden');
      showToast('Session archive cleared. This cannot remove exported genome files.');
    });

    const scienceDialog = $('#science-dialog');
    const gpuDialog = $('#gpu-dialog');
    const helpDialog = $('#help-dialog');
    const licenseDialog = $('#license-dialog');
    const screensaverDialog = $('#screensaver-dialog');
    $('#science-button').addEventListener('click', () => openDialog(scienceDialog));
    $('#license-button').addEventListener('click', () => openDialog(licenseDialog));
    $('#screensaver-button').addEventListener('click', () => openDialog(screensaverDialog));
    $$('.screen-view-option').forEach((button) => button.addEventListener('click', () => {
      $$('.screen-view-option').forEach((option) => {
        const active = option === button;
        option.classList.toggle('is-active', active);
        option.setAttribute('aria-pressed', String(active));
      });
    }));
    const screensaverInterval = $('#screensaver-interval');
    screensaverInterval.addEventListener('input', () => {
      $('#screensaver-interval-value').textContent = `${screensaverInterval.value} seconds`;
      setRangeProgress(screensaverInterval);
    });
    $('#start-screensaver').addEventListener('click', startScreensaver);
    $('#screensaver-exit').addEventListener('click', () => stopScreensaver());
    $('#screensaver-cycle-view').addEventListener('click', () => {
      cycleFocusView();
      state.screensaver.view = state.focusView;
    });
    $('#help-button').addEventListener('click', () => openDialog(helpDialog));
    $('#gpu-button').addEventListener('click', () => {
      renderDiagnosticDialog();
      openDialog(gpuDialog);
    });
    $$('.causal-pipeline button').forEach((button) => button.addEventListener('click', () => openDialog(scienceDialog, button.dataset.note)));
    $$('[data-scroll-note]').forEach((button) => button.addEventListener('click', () => {
      $(`#note-${button.dataset.scrollNote}`)?.scrollIntoView({ block: 'start' });
      $$('[data-scroll-note]').forEach((item) => item.classList.toggle('is-active', item === button));
    }));
    $$('.dialog-close').forEach((button) => button.addEventListener('click', () => button.closest('dialog').close()));
    $$('.modal-dialog').forEach((dialog) => dialog.addEventListener('click', (event) => {
      const rect = dialog.getBoundingClientRect();
      if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) dialog.close();
    }));
    $('#copy-diagnostics').addEventListener('click', () => copyText(JSON.stringify(state.diagnostics, null, 2), 'Render diagnostics copied.'));

    window.addEventListener('keydown', (event) => {
      const activeElement = document.activeElement;
      const typing = /INPUT|SELECT|TEXTAREA/.test(activeElement?.tagName || '') || activeElement?.isContentEditable;
      const activatesControl = activeElement?.matches?.('button, a[href], summary, [role="button"], [role="slider"]');
      if (event.key === 'Escape') {
        if (state.screensaver.active) {
          stopScreensaver();
          return;
        }
        const open = $('dialog[open]');
        if (open) open.close();
        else {
          state.currentStroke = null;
          state.drawing = false;
        }
        return;
      }
      if (typing || activatesControl || $('dialog[open]')) return;
      if (event.key === ' ') {
        event.preventDefault();
        if (!event.repeat) togglePlaying();
      }
      if (event.key.toLowerCase() === 'd') setTool('draw');
      if (event.key.toLowerCase() === 'h') setTool('pan');
      if (event.key.toLowerCase() === 'p') setTool('probe');
      if (event.key.toLowerCase() === 'n') newGenome();
      if (event.key.toLowerCase() === 'f') resetFractalView();
      if (event.key.toLowerCase() === 'b') forkTwin();
      if ((event.key === '+' || event.key === '=') && state.selected) {
        const rect = activeCosmosRect();
        zoomCosmosAt(rect.x + rect.w / 2, rect.y + rect.h / 2, 0.5, { rect });
      }
      if (event.key === '-' && state.selected) {
        const rect = activeCosmosRect();
        zoomCosmosAt(rect.x + rect.w / 2, rect.y + rect.h / 2, 2, { rect });
      }
      if (event.key === '0' && state.selected) resetCosmosCamera();
      if (event.key === 'Enter' && state.creationMode === 'bundle') igniteBundle();
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'z' && state.bundle.length) {
        event.preventDefault();
        state.bundle.pop();
        analyzePreview(state.bundle);
        $('#undo-strand').disabled = state.bundle.length === 0;
        $('#ignite-button').disabled = state.bundle.length === 0;
      }
      if (event.key === '?') openDialog(helpDialog);
    });
    document.addEventListener('fullscreenchange', () => {
      if (state.screensaver.active && !document.fullscreenElement && !window.cosmosAPI) stopScreensaver(false);
    });
  }

  wireUI();
  renderArchive();
  updateAgeUI();
  updateGenomeUI(null);
  setupP5();
  window.ButterflyFXDiagnostics = Object.freeze({
    renderOnce: () => state.p?.redraw(),
    resetUniverseCamera: () => resetCosmosCamera({ quiet: true, immediate: true }),
    setUniverseCamera: (view) => setCosmosCameraTarget(view, { immediate: true }),
    tourUniverseCamera: () => tourCosmosCamera(performance.now()),
    status: () => ({
      webglReady: state.webglReady,
      webgl2: state.webgl2,
      shaderError: state.shaderError,
      gpuNotice: state.gpuNotice,
      renderer: state.diagnostics?.webgl?.renderer || null,
      focusView: state.focusView,
      screensaverActive: state.screensaver.active,
      screensaverView: state.screensaver.view,
      screensaverFractalHome: state.screensaver.fractalHome ? { ...state.screensaver.fractalHome } : null,
      screensaverFractalTarget: state.screensaver.fractalTarget ? { ...state.screensaver.fractalTarget } : null,
      universeCount: state.universes.length,
      selectedUniverseId: state.selected?.id || null,
      archiveIds: state.universes.map((universe) => universe.id),
      selectedPointCount: state.selected?.strands?.[0]?.points?.length || 0,
      selectedPointHead: state.selected?.strands?.[0]?.points?.slice(0, 5).map((point) => [point.x, point.y, point.cx, point.cy]) || [],
      fractalView: { ...state.view },
      universeCamera: {
        x: state.cosmosCamera.x,
        y: state.cosmosCamera.y,
        scale: state.cosmosCamera.scale,
        zoom: 1 / state.cosmosCamera.scale,
        targetX: state.cosmosCamera.targetX,
        targetY: state.cosmosCamera.targetY,
        targetScale: state.cosmosCamera.targetScale,
        inspectId: state.cosmosCamera.inspectId
      },
      layout: state.layout ? {
        source: { ...state.layout.source },
        loom: { ...state.layout.loom },
        cosmos: { ...state.layout.cosmos }
      } : null,
      fps: state.fps
    })
  });
}());
