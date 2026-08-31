(function launchUniverseLoom() {
  'use strict';

  const MathX = window.CosmoMath;
  const Shaders = window.CosmosShaders;
  const Buddhabrot = window.BuddhabrotRenderer;
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
  const GOLDEN_SECRET = 'goldenrule';
  const PHI = MathX.PHI || ((1 + Math.sqrt(5)) / 2);
  const GOLDEN_ANGLE = MathX.GOLDEN_ANGLE || (MathX.TAU / (PHI * PHI));
  const GOLDEN_CINEMATIC = Object.freeze({
    originalEnd: 1400,
    comparisonRevealEnd: 2400,
    comparisonEnd: 4700,
    fusionEnd: 7300,
    cameraDelay: 8200
  });
  // Keep the inferred luminous scaffolds subordinate to the stellar particles.
  const GALAXY_STRUCTURE_OPACITY = 0.68;

  function makeCosmosCamera() {
    return {
      x: 0.5,
      y: 0.5,
      scale: 1,
      targetX: 0.5,
      targetY: 0.5,
      targetScale: 1,
      inspectId: null,
      inspectUniverseId: null,
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
    sourceVisual: 'mandelbrot',
    buddhabrot: null,
    buddhabrotImage: null,
    buddhabrotError: null,
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
    renderRevision: 0,
    clearBeforeFrame: false,
    cosmosFramePasses: [],
    screensaver: {
      active: false,
      view: 'both',
      interval: 24,
      nextAt: 0,
      nextCameraAt: 0,
      cameraStep: 0,
      tourTargetId: null,
      tourTargetUniverseId: null,
      fractalHome: null,
      fractalTarget: null,
      previousFocus: 'both',
      generationCount: 0,
      secretBuffer: '',
      secretKeyAt: 0,
      goldenRule: {
        active: false,
        activatedAt: 0,
        previousFocus: null,
        sourceUniverseId: null,
        reciprocal: null,
        mutual: null,
        transitionStartedAt: 0,
        transitionUniverseId: null,
        transitionPhase: 'idle'
      }
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

  function sourceVisualName() {
    return state.sourceVisual === 'buddhabrot' ? 'BUDDHABROT' : 'MANDELBROT';
  }

  function updateFocusViewLabels() {
    const labels = {
      both: 'VIEW · BOTH',
      mandelbrot: `VIEW · ${sourceVisualName()}`,
      universe: 'VIEW · UNIVERSE'
    };
    $('#focus-view-button').textContent = labels[state.focusView];
    $('#screensaver-cycle-view').textContent = state.focusView === 'both'
      ? 'BOTH'
      : (state.focusView === 'mandelbrot' ? sourceVisualName() : 'UNIVERSE');
  }

  function ensureBuddhabrot() {
    if (state.buddhabrot) return state.buddhabrot;
    if (state.buddhabrotError || !Buddhabrot) return null;
    try {
      const renderer = new Buddhabrot();
      if (!renderer.supported) throw new Error(renderer.error || 'WebGL2 orbit accumulation is unavailable');
      state.buddhabrot = renderer;
      return renderer;
    } catch (error) {
      state.buddhabrotError = error.message;
      return null;
    }
  }

  function setSourceVisual(mode, options = {}) {
    if (!['mandelbrot', 'buddhabrot'].includes(mode)) return false;
    if (mode === 'buddhabrot' && !ensureBuddhabrot()) {
      state.sourceVisual = 'mandelbrot';
      showToast(`Buddhabrot needs WebGL2 orbit accumulation. ${state.buddhabrotError || 'The renderer is unavailable.'}`, 5200);
      announce('Buddhabrot is unavailable on this graphics context. Mandelbrot remains active.');
      return false;
    }
    state.sourceVisual = mode;
    $$('.source-visual-option').forEach((button) => {
      const active = button.dataset.sourceVisual === mode;
      button.classList.toggle('is-active', active);
      button.setAttribute('aria-pressed', String(active));
    });
    $('#source-stage-title').textContent = mode === 'buddhabrot'
      ? 'BUDDHABROT / ORBIT DENSITY'
      : 'MANDELBROT / SOURCE';
    $('#source-instruction').textContent = mode === 'buddhabrot'
      ? 'Drag through escaped-orbit traffic. The same complex coordinates become a deterministic cosmic genome.'
      : 'Drag through the luminous boundary. The path becomes a deterministic cosmic genome.';
    if (!state.drawing) $('#source-state').textContent = idleSourceState();
    updateFocusViewLabels();
    if (!options.quiet) {
      const copy = mode === 'buddhabrot'
        ? 'Buddhabrot active · escaped orbits are accumulating progressively on the GPU.'
        : 'Mandelbrot active · pixels show complex escape behavior.';
      showToast(copy);
      announce(copy);
    }
    return true;
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
    updateFocusViewLabels();
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
    if (state.cosmosCamera.inspectUniverseId
      && !cosmosUniverseById(state.cosmosCamera.inspectUniverseId)) {
      Object.assign(state.cosmosCamera, makeCosmosCamera());
    }
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
    camera.inspectUniverseId = camera.inspectId
      ? options.inspectUniverseId || renderedCosmosUniverse()?.id || null
      : null;
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

  function galaxyNearCamera(universe = renderedCosmosUniverse()) {
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

  function readableModelLabel(value) {
    return String(value || 'UNRESOLVED')
      .replaceAll('_', ' ')
      .replace(/\bAND\b/g, '+');
  }

  function galaxyMorphologyLabel(galaxy) {
    return galaxy?.morphology?.label || galaxy?.type || 'GALAXY';
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

    const overviewUniverse = renderedCosmosUniverse();
    const inspectionUniverse = cameraInspectionUniverse();
    const inspected = camera.inspectId
      ? inspectionUniverse?.galaxies.find((galaxy) => galaxy.id === camera.inspectId) || null
      : galaxyNearCamera(overviewUniverse);
    const evidence = $('#cosmos-target-evidence');
    const annular = Boolean(inspected && MathX.isAnnularGalaxy?.(inspected));
    cameraElement.classList.toggle('is-targeting', Boolean(inspected));
    cameraElement.classList.toggle('is-annular', annular);
    if (inspected) {
      const tension = Math.round(inspected.formationTension * 100);
      const morphology = galaxyMorphologyLabel(inspected);
      $('#cosmos-target-label').textContent = `${inspected.id} · ${morphology} · ${!annular && inspected.type === 'SPIRAL' ? `${inspected.arms} ARMS · ` : ''}TENSION ${tension}%`;
      $('#cosmos-target-reason').textContent = `MODEL FLAG · ${inspected.tensionDominant}`;
      if (annular && evidence) {
        const support = Math.round((inspected.haloProxy?.formationSupport || 0) * 100);
        const offset = Math.round((inspected.haloProxy?.offsetMagnitude || 0) * 100);
        evidence.textContent = `CHANNEL · ${readableModelLabel(inspected.morphology.formationChannel)} · CYAN POTENTIAL SUPPORT ${support}% · OFFSET ${offset}%`;
        evidence.hidden = false;
      } else if (evidence) {
        evidence.hidden = true;
      }
    } else {
      const flagged = overviewUniverse?.galaxies.filter((galaxy) => galaxy.formationTension >= 0.42).length || 0;
      const rings = overviewUniverse?.galaxies.filter((galaxy) => MathX.isAnnularGalaxy?.(galaxy)).length || 0;
      $('#cosmos-target-label').textContent = `FIELD OVERVIEW · ${rings} RING SYSTEM${rings === 1 ? '' : 'S'} · ${flagged} TENSION FLAG${flagged === 1 ? '' : 'S'}`;
      $('#cosmos-target-reason').textContent = 'Zoom resolves filaments, cyan model-potential contours, ring histories, satellites, and stellar knots.';
      if (evidence) evidence.hidden = true;
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

  function idleSourceState() {
    if (state.sourceVisual !== 'buddhabrot') return 'C-SPACE · READY';
    const samples = state.buddhabrot?.samples || 0;
    const sampleLabel = samples >= 1e6
      ? `${(samples / 1e6).toFixed(1)}M`
      : `${Math.floor(samples / 1000)}K`;
    return `Z-ORBIT · ${sampleLabel} SEEDS`;
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
        channel.style.opacity = String(0.12 + genome.metrics[key] * 0.38);
        channel.style.setProperty('--packet-speed', `${4.8 - genome.metrics[key] * 2}s`);
      });
    } else {
      $('#attractor-caption').innerHTML = 'STRANGE ATTRACTOR<br><b>AWAITING SIGNAL</b>';
      $$('.loom-channels i').forEach((channel) => {
        channel.style.removeProperty('opacity');
        channel.style.removeProperty('--packet-speed');
      });
    }
  }

  function universeId() {
    const id = `U-${String(state.universeSerial).padStart(3, '0')}`;
    state.universeSerial += 1;
    return id;
  }

  function cinematicEase(value) {
    const t = MathX.clamp(value);
    return t * t * (3 - 2 * t);
  }

  function goldenRuleCinematic(now = performance.now()) {
    const goldenRule = state.screensaver.goldenRule;
    const idle = {
      phase: 'idle',
      elapsed: 0,
      compare: 0,
      fusion: 0,
      lattice: 0,
      divider: 1.04,
      progress: 0
    };
    if (!goldenRule.active || !goldenRule.reciprocal) return idle;

    const startedAt = goldenRule.transitionStartedAt || goldenRule.activatedAt || now;
    const elapsed = Math.max(0, now - startedAt);
    const progress = MathX.clamp(elapsed / GOLDEN_CINEMATIC.fusionEnd);

    if (elapsed < GOLDEN_CINEMATIC.originalEnd) {
      return { ...idle, phase: 'original', elapsed, progress };
    }
    if (elapsed < GOLDEN_CINEMATIC.comparisonEnd) {
      const reveal = cinematicEase(
        (elapsed - GOLDEN_CINEMATIC.originalEnd)
          / (GOLDEN_CINEMATIC.comparisonRevealEnd - GOLDEN_CINEMATIC.originalEnd)
      );
      return {
        phase: 'comparison',
        elapsed,
        compare: reveal,
        fusion: 0,
        lattice: 0,
        divider: MathX.lerp(1.04, 0.5, reveal),
        progress
      };
    }
    if (elapsed < GOLDEN_CINEMATIC.fusionEnd) {
      const fusion = cinematicEase(
        (elapsed - GOLDEN_CINEMATIC.comparisonEnd)
          / (GOLDEN_CINEMATIC.fusionEnd - GOLDEN_CINEMATIC.comparisonEnd)
      );
      return {
        phase: 'fusion',
        elapsed,
        compare: 1 - fusion,
        fusion,
        lattice: fusion,
        divider: 0.5,
        progress
      };
    }
    return {
      phase: 'reciprocity',
      elapsed,
      compare: 0,
      fusion: 1,
      lattice: 1,
      divider: 0.5,
      progress: 1
    };
  }

  function renderedCosmosUniverse(now = performance.now()) {
    const goldenRule = state.screensaver.goldenRule;
    const settledMutualField = goldenRule.active
      && goldenRule.sourceUniverseId === state.selected?.id
      && goldenRule.mutual
      && goldenRuleCinematic(now).phase === 'reciprocity';
    return settledMutualField ? goldenRule.mutual : state.selected;
  }

  function cosmosUniverseById(universeId) {
    if (!universeId) return null;
    const goldenRule = state.screensaver.goldenRule;
    const candidates = [
      state.selected,
      goldenRule.reciprocal,
      goldenRule.mutual,
      state.comparison?.base,
      state.comparison?.twin,
      ...state.universes
    ];
    return candidates.find((universe) => universe?.id === universeId) || null;
  }

  function cameraInspectionUniverse(now = performance.now()) {
    return state.cosmosCamera.inspectUniverseId
      ? cosmosUniverseById(state.cosmosCamera.inspectUniverseId)
      : renderedCosmosUniverse(now);
  }

  function cameraTargetsGalaxy(universeId, galaxyId) {
    return state.cosmosCamera.inspectUniverseId === universeId
      && state.cosmosCamera.inspectId === galaxyId;
  }

  function goldenRuleStrength(now = performance.now()) {
    return goldenRuleCinematic(now).fusion;
  }

  function goldenRuleStatusText(cinematic) {
    const reciprocal = state.screensaver.goldenRule.reciprocal;
    const mutual = state.screensaver.goldenRule.mutual;
    const depth = 1 / Math.max(COSMOS_MIN_SCALE, state.cosmosCamera.scale);
    const depthLabel = state.focusView === 'both' ? 'DUAL DEPTH' : 'DEPTH';
    const phaseLabel = {
      original: 'I ORIGINAL FIELD',
      comparison: 'II RECIPROCAL REVEAL',
      fusion: 'III CONVERGENCE',
      reciprocity: 'MUTUAL FIELD'
    }[cinematic.phase] || 'INITIALIZING';
    const sourcePair = `${state.selected?.genome.seedHex || 'AWAITING'} ↔ ${reciprocal?.genome.seedHex || 'AWAITING'}`;
    const fieldSequence = cinematic.fusion > 0 && mutual
      ? `${sourcePair} → ${mutual.genome.seedHex}`
      : sourcePair;
    return `φ RECIPROCITY · ${phaseLabel} · ${fieldSequence} · ${depthLabel} ${depth < 10 ? depth.toFixed(1) : Math.round(depth)}×`;
  }

  function universeMetricSignature(universe) {
    const metrics = universe?.genome?.metrics;
    if (!metrics) return 'D -- · T -- · S --';
    return `D ${Math.round(metrics.density * 100)} · T ${Math.round(metrics.turbulence * 100)} · S ${Math.round(metrics.spin * 100)}`;
  }

  function beginGoldenRuleTransition(universe, reciprocal, now = performance.now()) {
    const goldenRule = state.screensaver.goldenRule;
    goldenRule.transitionStartedAt = now;
    goldenRule.transitionUniverseId = universe?.id || null;
    goldenRule.transitionPhase = 'original';
    resetCosmosCamera({ quiet: true, immediate: true, motion: 'tour' });
    state.screensaver.cameraStep = 0;
    state.screensaver.tourTargetId = null;
    state.screensaver.tourTargetUniverseId = null;
    state.screensaver.nextCameraAt = now + GOLDEN_CINEMATIC.cameraDelay;
    if (state.screensaver.fractalHome) {
      state.screensaver.fractalTarget = { ...state.screensaver.fractalHome };
    }
    state.clearBeforeFrame = true;

    const originalSeed = universe?.genome.seedHex || 'AWAITING';
    const reciprocalSeed = reciprocal?.genome.seedHex || 'AWAITING';
    const originalLabel = $('#reciprocity-original-seed');
    const reciprocalLabel = $('#reciprocity-counterpart-seed');
    if (originalLabel) originalLabel.textContent = originalSeed;
    if (reciprocalLabel) reciprocalLabel.textContent = reciprocalSeed;
    const originalMetrics = $('#reciprocity-original-metrics');
    const reciprocalMetrics = $('#reciprocity-counterpart-metrics');
    if (originalMetrics) originalMetrics.textContent = universeMetricSignature(universe);
    if (reciprocalMetrics) reciprocalMetrics.textContent = universeMetricSignature(reciprocal);

    // DOM phase cues should keep time even if a browser throttles the p5 draw
    // loop while entering fullscreen. The timestamp guard retires an older
    // ticker as soon as Autogen selects the next universe.
    syncGoldenRuleCinematic(now);
    const transitionToken = now;
    const tickCinematic = () => {
      if (!goldenRule.active || goldenRule.transitionStartedAt !== transitionToken) return;
      const cinematic = syncGoldenRuleCinematic();
      if (cinematic.elapsed < GOLDEN_CINEMATIC.fusionEnd) setTimeout(tickCinematic, 80);
    };
    setTimeout(tickCinematic, 80);
  }

  function syncGoldenRuleCinematic(now = performance.now()) {
    const overlay = $('#reciprocity-cinematic');
    if (!overlay) return goldenRuleCinematic(now);
    const goldenRule = state.screensaver.goldenRule;
    const cosmos = state.layout?.cosmos;
    const cinematic = goldenRuleCinematic(now);
    const visible = goldenRule.active && goldenRule.reciprocal && cosmos?.w > 1;
    overlay.hidden = !visible;
    if (!visible) return cinematic;

    overlay.style.left = `${cosmos.x}px`;
    overlay.style.width = `${cosmos.w}px`;
    const signal = $('#reciprocity-signal');
    if (signal) signal.style.left = `${cosmos.x + 18}px`;
    overlay.style.setProperty('--reciprocity-compare', cinematic.compare.toFixed(4));
    overlay.style.setProperty('--reciprocity-fusion', cinematic.fusion.toFixed(4));
    overlay.style.setProperty('--reciprocity-flare-scale', (1 + cinematic.fusion * 22).toFixed(3));
    overlay.style.setProperty('--reciprocity-divider', `${(cinematic.divider * 100).toFixed(2)}%`);
    overlay.style.setProperty('--reciprocity-progress', cinematic.progress.toFixed(4));

    const phaseChanged = overlay.dataset.phase !== cinematic.phase;
    overlay.dataset.phase = cinematic.phase;
    goldenRule.transitionPhase = cinematic.phase;
    if (phaseChanged) {
      overlay.classList.remove('is-phase-entering');
      if (!state.reducedMotion) {
        void overlay.offsetWidth;
        overlay.classList.add('is-phase-entering');
      }
      const mutualDescriptor = goldenRule.mutual
        ? `${goldenRule.mutual.genome.seedHex} · ${universeMetricSignature(goldenRule.mutual)}`
        : 'AWAITING MUTUAL FIELD';
      const copy = {
        original: ['I · ORIGINAL FIELD', 'OBSERVE THE INITIAL CONDITION'],
        comparison: ['II · RECIPROCAL REVEAL', 'COMPARE VOIDS · FILAMENTS · GALAXY SYSTEMS'],
        fusion: ['III · CONVERGENCE', `MUTUAL FIELD ${mutualDescriptor}`],
        reciprocity: ['φ · RECIPROCITY', `MUTUAL FIELD ${mutualDescriptor}`]
      }[cinematic.phase];
      if (copy) {
        $('#reciprocity-phase').textContent = copy[0];
        $('#reciprocity-phase-detail').textContent = copy[1];
      }
      if (state.screensaver.active) $('#screensaver-status').textContent = goldenRuleStatusText(cinematic);
    }
    return cinematic;
  }

  function refreshReciprocalUniverse(universe = state.selected) {
    const goldenRule = state.screensaver.goldenRule;
    if (!goldenRule.active || !universe) {
      goldenRule.sourceUniverseId = null;
      goldenRule.reciprocal = null;
      goldenRule.mutual = null;
      return null;
    }
    if (goldenRule.sourceUniverseId === universe.id && goldenRule.reciprocal && goldenRule.mutual) {
      return goldenRule.reciprocal;
    }

    const strands = MathX.makeReciprocalStrands(universe.strands);
    let reciprocal = MathX.makeUniverse(strands, `${universe.id}-PHI`, {
      createdAt: 'reciprocity-field',
      name: `Reciprocal ${universe.genome.seedHex}`,
      maxIterations: state.iterations,
      attractorCount: 610,
      galaxyLimit: 89
    });
    // A collision is extraordinarily unlikely, but a secret counterfactual should
    // never silently collapse back into the universe that originated it.
    if (reciprocal.genome.seed === universe.genome.seed) {
      reciprocal = MathX.makeUniverse(strands, `${universe.id}-PHI`, {
        createdAt: 'reciprocity-field',
        name: `Reciprocal ${universe.genome.seedHex}`,
        maxIterations: state.iterations,
        perturbation: 1e-9 / PHI,
        attractorCount: 610,
        galaxyLimit: 89
      });
    }
    const mutualStrands = [...universe.strands, ...reciprocal.strands];
    let mutual = MathX.makeUniverse(mutualStrands, `${universe.id}-PHI-MUTUAL`, {
      createdAt: 'reciprocity-mutual-field',
      parentId: universe.id,
      name: `Mutual ${universe.genome.seedHex} ${reciprocal.genome.seedHex}`,
      maxIterations: state.iterations,
      attractorCount: 720,
      galaxyLimit: 144
    });
    if (mutual.genome.seed === universe.genome.seed || mutual.genome.seed === reciprocal.genome.seed) {
      mutual = MathX.makeUniverse(mutualStrands, `${universe.id}-PHI-MUTUAL`, {
        createdAt: 'reciprocity-mutual-field',
        parentId: universe.id,
        name: `Mutual ${universe.genome.seedHex} ${reciprocal.genome.seedHex}`,
        maxIterations: state.iterations,
        perturbation: -1e-9 / PHI,
        attractorCount: 720,
        galaxyLimit: 144
      });
    }
    goldenRule.sourceUniverseId = universe.id;
    goldenRule.reciprocal = reciprocal;
    goldenRule.mutual = mutual;
    const pair = $('#reciprocity-pair');
    if (pair) pair.textContent = `${universe.genome.seedHex} ↔ ${reciprocal.genome.seedHex}`;
    beginGoldenRuleTransition(universe, reciprocal);
    return reciprocal;
  }

  function setGoldenRuleActive(active) {
    const goldenRule = state.screensaver.goldenRule;
    if (goldenRule.active === active) return;
    goldenRule.active = active;
    goldenRule.activatedAt = active ? performance.now() : 0;
    document.body.classList.toggle('golden-rule-mode', active);
    $('#screensaver-hud').classList.toggle('is-golden', active);
    const signal = $('#reciprocity-signal');
    if (signal) signal.hidden = !active;

    if (active) {
      goldenRule.previousFocus = state.focusView === 'mandelbrot' ? state.focusView : null;
      if (state.focusView === 'mandelbrot') setFocusView('both');
      const reciprocal = refreshReciprocalUniverse();
      state.clearBeforeFrame = true;
      const pairLabel = reciprocal && state.selected
        ? `${state.selected.genome.seedHex} and ${reciprocal.genome.seedHex}`
        : 'the next generated pair';
      $('#screensaver-status').textContent = `φ RECIPROCITY · ${state.selected?.genome.seedHex || 'AWAITING'} ↔ ${reciprocal?.genome.seedHex || 'AWAITING'}`;
      announce(`Reciprocity field engaged between ${pairLabel}.`);
    } else {
      const restoreFocus = goldenRule.previousFocus;
      goldenRule.previousFocus = null;
      goldenRule.sourceUniverseId = null;
      goldenRule.reciprocal = null;
      goldenRule.mutual = null;
      goldenRule.transitionStartedAt = 0;
      goldenRule.transitionUniverseId = null;
      goldenRule.transitionPhase = 'idle';
      state.screensaver.cameraStep = 0;
      state.screensaver.tourTargetId = null;
      state.screensaver.tourTargetUniverseId = null;
      if (state.screensaver.fractalHome) {
        state.screensaver.fractalTarget = { ...state.screensaver.fractalHome };
      }
      const cinematic = $('#reciprocity-cinematic');
      if (cinematic) {
        cinematic.hidden = true;
        cinematic.dataset.phase = 'idle';
      }
      if (restoreFocus && state.screensaver.active) setFocusView(restoreFocus);
      resetCosmosCamera({ quiet: true, immediate: true, motion: 'tour' });
      if (state.screensaver.active) state.screensaver.nextCameraAt = performance.now() + 4800;
      state.clearBeforeFrame = true;
      if (state.screensaver.active) $('#screensaver-status').textContent = 'RECIPROCITY RELEASED · AUTOGEN CONTINUES';
      announce('Reciprocity field released. Autogen continues.');
    }
  }

  function captureScreensaverSecret(event) {
    if (!state.screensaver.active || event.repeat) return;
    if (event.ctrlKey || event.metaKey || event.altKey || event.key.length !== 1) return;
    const character = event.key.toLowerCase();
    if (!/[a-z]/.test(character)) {
      state.screensaver.secretBuffer = '';
      return;
    }
    event.preventDefault();
    const now = performance.now();
    if (now - state.screensaver.secretKeyAt > 2600) state.screensaver.secretBuffer = '';
    state.screensaver.secretKeyAt = now;
    state.screensaver.secretBuffer = `${state.screensaver.secretBuffer}${character}`.slice(-GOLDEN_SECRET.length);
    if (state.screensaver.secretBuffer === GOLDEN_SECRET) {
      state.screensaver.secretBuffer = '';
      setGoldenRuleActive(!state.screensaver.goldenRule.active);
    }
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
    state.renderRevision += 1;
    state.clearBeforeFrame = true;
    activateCosmosCamera(universe);
    if (state.screensaver.goldenRule.active) refreshReciprocalUniverse(universe);
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
    $('#source-state').textContent = idleSourceState();

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
    const mandelbrotPresets = [
      { x: -0.5, y: 0, scale: 3 },
      { x: -0.743643887, y: 0.131825904, scale: 0.055 },
      { x: -0.101096, y: 0.956286, scale: 0.19 },
      { x: -1.25066, y: 0.02012, scale: 0.21 },
      { x: -0.16, y: 1.0405, scale: 0.115 },
      { x: 0.28692, y: 0.01429, scale: 0.13 }
    ];
    const buddhabrotPresets = [
      { x: -0.5, y: 0, scale: 3 },
      { x: -0.62, y: 0, scale: 2.15 },
      { x: -0.18, y: 0.58, scale: 1.72 },
      { x: -0.18, y: -0.58, scale: 1.72 },
      { x: 0.08, y: 0, scale: 1.55 }
    ];
    const presets = state.sourceVisual === 'buddhabrot' ? buddhabrotPresets : mandelbrotPresets;
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
    state.screensaver.generationCount += 1;
    if (state.universes.length > 24) {
      const removed = state.universes.shift();
      state.cosmosViews.delete(removed.id);
    }
    const now = performance.now();
    state.screensaver.nextAt = now + state.screensaver.interval * 1000;
    if (!state.screensaver.goldenRule.active) {
      state.screensaver.nextCameraAt = now + 4800;
      state.screensaver.cameraStep = 0;
      state.screensaver.tourTargetId = null;
      state.screensaver.tourTargetUniverseId = null;
    }
    renderArchive();
    return universe;
  }

  function pickTourGalaxy(universe, step, excludedId = null) {
    const mature = universe.galaxies.filter((galaxy) => galaxy.birth <= Math.max(0.62, state.age) && galaxy.id !== excludedId);
    const ranked = (mature.length ? mature : universe.galaxies)
      .slice()
      .sort((a, b) => {
        const scoreA = a.formationTension * 0.62 + MathX.clamp(a.mass / 2.2) * 0.2
          + (a.haloProxy?.anomalyScore || 0) * 0.18;
        const scoreB = b.formationTension * 0.62 + MathX.clamp(b.mass / 2.2) * 0.2
          + (b.haloProxy?.anomalyScore || 0) * 0.18;
        return scoreB - scoreA;
      });
    const preferAnnular = step % 3 !== 0;
    const preferred = ranked.filter((galaxy) => MathX.isAnnularGalaxy?.(galaxy) === preferAnnular);
    const pool = (preferred.length ? preferred : ranked).slice(0, 8);
    if (!pool.length) return null;
    const random = MathX.mulberry32((universe.genome.seed ^ Math.imul(step + 1, 0x9e3779b9)) >>> 0);
    return pool[Math.floor(random() * pool.length)];
  }

  function contributingSourcePoint(universe, galaxy) {
    const points = universe.strands.flatMap((strand) => strand.points || []);
    if (!points.length || !galaxy) return null;
    const galaxyNumber = Number.parseInt(galaxy.id.replace(/\D/g, ''), 10) || 1;
    const index = (Math.imul(galaxyNumber, 37) + (universe.genome.seed >>> 7)) % points.length;
    if (state.sourceVisual === 'buddhabrot') return points[index];

    // Keep a soft galaxy-to-strand provenance bias, then search the complete
    // drawn strand for escaped points with long, high-contrast orbits: the
    // cinematic Mandelbrot boundary rather than broad interior or empty exterior.
    let best = points[index];
    let bestScore = -Infinity;
    for (let candidateIndex = 0; candidateIndex < points.length; candidateIndex += 1) {
      const candidate = points[candidateIndex];
      const sample = MathX.mandelbrotSample(candidate.cx, candidate.cy, state.iterations);
      const previous = points[(candidateIndex - 1 + points.length) % points.length];
      const next = points[(candidateIndex + 1) % points.length];
      const previousSample = MathX.mandelbrotSample(previous.cx, previous.cy, Math.min(state.iterations, 120));
      const nextSample = MathX.mandelbrotSample(next.cx, next.cy, Math.min(state.iterations, 120));
      const localContrast = Math.abs(previousSample.normalized - nextSample.normalized);
      const escapeDetail = sample.interior ? 0.16 : 0.46 + sample.normalized * 0.42;
      const trapDetail = (1 - sample.orbitTrap) * 0.12;
      const directDistance = Math.abs(candidateIndex - index);
      const cyclicDistance = Math.min(directDistance, points.length - directDistance);
      const provenance = 1 - cyclicDistance / Math.max(1, points.length / 2) * 0.08;
      const score = escapeDetail + trapDetail + localContrast * 0.24 + provenance;
      if (score > bestScore) {
        bestScore = score;
        best = candidate;
      }
    }
    return best;
  }

  function setFractalTourTarget(universe, galaxy, zoom) {
    const home = state.screensaver.fractalHome;
    const point = contributingSourcePoint(universe, galaxy);
    if (!home || !point) return;
    state.screensaver.fractalTarget = {
      x: point.cx,
      y: point.cy,
      scale: Math.max(state.sourceVisual === 'buddhabrot' ? 0.42 : 0.000015, home.scale / zoom)
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
    const goldenRule = state.screensaver.goldenRule;
    const cinematic = goldenRuleCinematic(now);
    const hasCurrentMutualField = goldenRule.active
      && goldenRule.sourceUniverseId === state.selected?.id
      && goldenRule.mutual;
    if (hasCurrentMutualField && cinematic.phase !== 'reciprocity') {
      state.screensaver.nextCameraAt = Math.max(
        now + 250,
        goldenRule.transitionStartedAt + GOLDEN_CINEMATIC.cameraDelay
      );
      return null;
    }

    const universe = renderedCosmosUniverse(now);
    if (!universe) {
      state.screensaver.nextCameraAt = now + 5000;
      return null;
    }
    if (state.screensaver.tourTargetUniverseId !== universe.id) {
      state.screensaver.tourTargetId = null;
      state.screensaver.tourTargetUniverseId = universe.id;
    }
    state.screensaver.cameraStep += 1;
    const phase = (state.screensaver.cameraStep - 1) % 4;
    if (phase === 3) {
      resetCosmosCamera({ quiet: true, motion: 'tour' });
      if (state.screensaver.fractalHome) state.screensaver.fractalTarget = { ...state.screensaver.fractalHome };
      state.screensaver.tourTargetId = null;
      state.screensaver.tourTargetUniverseId = null;
      state.screensaver.nextCameraAt = now + 5000;
      return null;
    }

    let galaxy = universe.galaxies.find((item) => item.id === state.screensaver.tourTargetId);
    if (!galaxy || phase === 0 || phase === 2) {
      galaxy = pickTourGalaxy(universe, state.screensaver.cameraStep, phase === 2 ? state.screensaver.tourTargetId : null);
      state.screensaver.tourTargetId = galaxy?.id || null;
    }
    if (!galaxy) {
      resetCosmosCamera({ quiet: true, motion: 'tour' });
    } else {
      const goldenTour = hasCurrentMutualField && universe.id === goldenRule.mutual.id;
      const zoom = goldenTour
        ? (phase === 0 ? PHI ** 4 : (phase === 1 ? PHI ** 8 : PHI ** 6))
        : (phase === 0 ? 7 : (phase === 1 ? 34 : 16));
      setCosmosCameraTarget({ x: galaxy.x, y: galaxy.y, scale: 1 / zoom }, {
        inspectId: galaxy.id,
        inspectUniverseId: universe.id,
        motion: 'tour'
      });
      const sourceZoom = state.sourceVisual === 'mandelbrot'
        ? (goldenTour
          ? (phase === 0 ? PHI ** 3 : (phase === 1 ? PHI ** 6 : PHI ** 4))
          : (phase === 0 ? 3.2 : (phase === 1 ? 18 : 6.5)))
        : (phase === 0 ? 1.18 : (phase === 1 ? 1.8 : 1.42));
      setFractalTourTarget(universe, galaxy, sourceZoom);
    }
    state.screensaver.nextCameraAt = now + 5000;
    return galaxy ? {
      universeId: universe.id,
      galaxyId: galaxy.id,
      x: galaxy.x,
      y: galaxy.y
    } : null;
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
    if (state.screensaver.active) return;
    state.screensaver.active = true;
    state.screensaver.previousFocus = state.focusView;
    state.screensaver.view = $('.screen-view-option.is-active')?.dataset.screenView || 'both';
    state.screensaver.interval = Number($('#screensaver-interval').value);
    // Fullscreen entry is asynchronous. Keep the draw loop disarmed until it
    // settles so the first universe cannot be born once here and again by a
    // delayed startup callback.
    state.screensaver.nextAt = Infinity;
    state.screensaver.nextCameraAt = performance.now() + 4800;
    state.screensaver.cameraStep = 0;
    state.screensaver.tourTargetId = null;
    state.screensaver.tourTargetUniverseId = null;
    state.screensaver.secretBuffer = '';
    state.screensaver.secretKeyAt = 0;
    setFocusView(state.screensaver.view);
    document.body.classList.add('screensaver-mode');
    $('#screensaver-hud').hidden = false;
    $('#screensaver-dialog').close();
    try {
      await setFullscreen(true);
    } catch (error) {
      console.warn(`Fullscreen entry was unavailable; Autogen will continue in-window. ${error.message}`);
    }
    resizeInstrument();
    if (state.screensaver.active) autoGenerateUniverse();
    announce('Autogenerate screensaver started. Press Escape to return to the laboratory.');
  }

  async function stopScreensaver(exitFullscreen = true) {
    if (!state.screensaver.active) return;
    if (state.screensaver.goldenRule.active) setGoldenRuleActive(false);
    state.screensaver.active = false;
    state.screensaver.nextAt = Infinity;
    state.screensaver.nextCameraAt = Infinity;
    state.screensaver.secretBuffer = '';
    document.body.classList.remove('screensaver-mode');
    $('#screensaver-hud').hidden = true;
    setFocusView(state.screensaver.previousFocus);
    if (exitFullscreen) {
      try {
        await setFullscreen(false);
      } catch (error) {
        console.warn(`Fullscreen exit was unavailable. ${error.message}`);
      }
    }
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
    const universe = renderedCosmosUniverse();
    if (!universe?.galaxies.length) return;
    const annular = universe.galaxies.filter((candidate) => MathX.isAnnularGalaxy?.(candidate));
    const candidates = annular.length ? annular : universe.galaxies;
    const galaxy = candidates.reduce((peak, candidate) => (
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
      inspectUniverseId: universe.id,
      motion: 'manual'
    });
    announce(`${galaxy.id}, ${galaxyMorphologyLabel(galaxy).toLowerCase()}, has ${Math.round(galaxy.formationTension * 100)} percent formation tension inside this model.`);
    showToast(`${galaxy.id} · ${galaxyMorphologyLabel(galaxy)} · ${galaxy.tensionDominant}. Model ambiguity—not physical impossibility.`, 5200);
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
    const annular = universe.galaxies.filter((galaxy) => MathX.isAnnularGalaxy?.(galaxy));
    const channels = annular.reduce((counts, galaxy) => {
      const channel = galaxy.morphology.label;
      counts[channel] = (counts[channel] || 0) + 1;
      return counts;
    }, {});
    const dominantRing = Object.entries(channels).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0];
    $('#selected-rings').textContent = `${annular.length} / ${universe.galaxies.length}`;
    $('#selected-ring-channel').textContent = dominantRing ? `${dominantRing[0]} · ${dominantRing[1]}` : 'NONE';
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

  function cosmosUniforms(universe, sharedUniverse, correlation, renderOptions = {}) {
    const { genome } = universe;
    const reciprocal = renderOptions.effect === 'mutual' ? renderOptions.reciprocal : null;
    const mutualStrength = reciprocal ? MathX.clamp(renderOptions.strength ?? 1) : 0;
    const goldenPhase = reciprocal ? (renderOptions.elapsed || 0) * 0.001 : 0;
    return {
      uTime: performance.now() * 0.001,
      uAge: state.age,
      uAspect: 1,
      uSeed: seedVector(genome.seed),
      uSharedSeed: seedVector((sharedUniverse || universe).genome.seed),
      uReciprocalSeed: seedVector((reciprocal || universe).genome.seed),
      uCorrelation: correlation,
      uGoldenRule: mutualStrength,
      uGoldenCompare: 0,
      uGoldenDivider: 1.04,
      uGoldenPhase: goldenPhase,
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

  function withCosmosClip(p, rect, draw) {
    const gl = state.gl;
    if (!gl || !state.webglReady) {
      draw();
      return;
    }
    const hadScissor = gl.isEnabled(gl.SCISSOR_TEST);
    const previous = hadScissor ? gl.getParameter(gl.SCISSOR_BOX) : null;
    const left = Math.max(0, Math.floor(rect.x));
    const right = Math.min(p.width, Math.ceil(rect.x + rect.w));
    const top = Math.max(0, Math.floor(rect.y));
    const bottom = Math.min(p.height, Math.ceil(rect.y + rect.h));
    let clipLeft = left;
    let clipBottom = p.height - bottom;
    let clipRight = right;
    let clipTop = p.height - top;
    if (hadScissor && previous) {
      clipLeft = Math.max(clipLeft, previous[0]);
      clipBottom = Math.max(clipBottom, previous[1]);
      clipRight = Math.min(clipRight, previous[0] + previous[2]);
      clipTop = Math.min(clipTop, previous[1] + previous[3]);
    }
    const width = clipRight - clipLeft;
    const height = clipTop - clipBottom;
    if (width <= 0 || height <= 0) return;
    gl.enable(gl.SCISSOR_TEST);
    gl.scissor(clipLeft, clipBottom, width, height);
    try {
      draw();
    } finally {
      if (hadScissor && previous) {
        gl.enable(gl.SCISSOR_TEST);
        gl.scissor(previous[0], previous[1], previous[2], previous[3]);
      } else {
        gl.disable(gl.SCISSOR_TEST);
      }
    }
  }

  function drawReciprocityLattice(p, rect) {
    const goldenRule = state.screensaver.goldenRule;
    if (!goldenRule.active || !goldenRule.reciprocal || rect.w < 2 || rect.h < 2) return;
    const strength = goldenRuleStrength();
    if (strength <= 0.001) return;
    const count = state.reducedMotion ? 34 : 55;
    const radiusLimit = Math.min(rect.w, rect.h) * 0.39;
    const coordinateOffsetX = state.webglReady ? p.width / 2 : 0;
    const coordinateOffsetY = state.webglReady ? p.height / 2 : 0;
    const centerX = rect.x + rect.w * 0.5 - coordinateOffsetX;
    const centerY = rect.y + rect.h * 0.5 - coordinateOffsetY;
    const elapsed = performance.now() - (goldenRule.transitionStartedAt || goldenRule.activatedAt);
    const rotation = state.reducedMotion ? 0 : elapsed * 0.000075;
    const points = Array.from({ length: count }, (_, index) => {
      const fraction = (index + 0.5) / count;
      const angle = index * GOLDEN_ANGLE + rotation;
      const radius = Math.sqrt(fraction) * radiusLimit;
      return {
        x: centerX + Math.cos(angle) * radius,
        y: centerY + Math.sin(angle) * radius,
        fraction
      };
    });

    p.push();
    p.noFill();
    p.blendMode(p.ADD);
    points.forEach((point, index) => {
      if (index >= 13) {
        const previous = points[index - 13];
        p.stroke(244, 185, 95, (10 + (1 - point.fraction) * 22) * strength);
        p.strokeWeight(0.45);
        p.line(previous.x, previous.y, point.x, point.y);
      }
      const pulse = 0.55 + 0.45 * Math.sin(elapsed * 0.001 / PHI + index * GOLDEN_ANGLE);
      p.stroke(255, 224, 126, (48 + pulse * 108) * strength);
      p.strokeWeight(0.75 + pulse * 1.3);
      p.point(point.x, point.y);
    });
    const breath = 1 + Math.sin(elapsed * 0.001 / PHI) * 0.12;
    p.stroke(255, 211, 92, 92 * strength);
    p.strokeWeight(0.8);
    p.circle(centerX, centerY, Math.min(rect.w, rect.h) * 0.38 * breath);
    p.stroke(255, 246, 194, 138 * strength);
    p.circle(centerX, centerY, Math.min(rect.w, rect.h) * 0.055);
    p.blendMode(p.BLEND);
    p.pop();
  }

  function renderCosmos(p, universe, rect, sharedUniverse = null, correlation = 0, renderOptions = {}) {
    const clipRect = renderOptions.clipRect || rect;
    if (rect.w < 2 || rect.h < 2 || clipRect.w <= 0 || clipRect.h <= 0) return;
    const uniforms = cosmosUniforms(universe, sharedUniverse, correlation, renderOptions);
    const aspect = rect.w / Math.max(1, rect.h);
    const span = MathX.cosmicFitSpan(aspect) * state.cosmosCamera.scale;
    uniforms.uAspect = aspect;
    uniforms.uViewCenter = [state.cosmosCamera.x, state.cosmosCamera.y];
    uniforms.uViewScale = span;
    uniforms.uViewZoom = 1 / Math.max(COSMOS_MIN_SCALE, state.cosmosCamera.scale);
    uniforms.uPixelWorld = span / Math.max(1, rect.h);
    state.cosmosFramePasses.push({
      universeId: universe.id,
      proxyUniverseId: universe.id,
      role: renderOptions.role || 'standard',
      effect: renderOptions.effect || 'plain',
      clip: { x: clipRect.x, y: clipRect.y, w: clipRect.w, h: clipRect.h }
    });
    withCosmosClip(p, clipRect, () => {
      drawShaderRect(p, state.shaders?.cosmos, rect, uniforms);
      if ((state.layers.stars || state.layers.halos || state.layers.tension) && universe.id !== 'AMBIENT') {
        drawGalaxies(p, universe, rect);
      }
    });
  }

  function renderGoldenRuleCosmos(p, universe, rect) {
    const goldenRule = state.screensaver.goldenRule;
    const reciprocal = goldenRule.reciprocal;
    const mutual = goldenRule.mutual;
    const isCurrentPair = goldenRule.active
      && reciprocal
      && mutual
      && goldenRule.sourceUniverseId === universe.id;
    if (!isCurrentPair) {
      renderCosmos(p, universe, rect);
      return;
    }

    const cinematic = goldenRuleCinematic();
    const renderOriginal = () => renderCosmos(p, universe, rect, null, 0, {
      role: 'original',
      effect: 'plain'
    });
    const renderReciprocal = (clipRect) => renderCosmos(p, reciprocal, rect, null, 0, {
      role: 'reciprocal',
      effect: 'plain',
      clipRect
    });

    if (cinematic.phase === 'original') {
      renderOriginal();
      return;
    }

    if (cinematic.phase === 'comparison') {
      renderOriginal();
      const splitX = rect.x + rect.w * cinematic.divider;
      renderReciprocal({ x: splitX, y: rect.y, w: rect.x + rect.w - splitX, h: rect.h });
      return;
    }

    if (cinematic.phase === 'fusion') {
      renderOriginal();
      const splitX = rect.x + rect.w * 0.5;
      renderReciprocal({ x: splitX, y: rect.y, w: rect.w * 0.5, h: rect.h });
      const mutualWidth = rect.w * cinematic.fusion;
      renderCosmos(p, mutual, rect, null, 0, {
        role: 'mutual',
        effect: 'mutual',
        reciprocal,
        strength: cinematic.fusion,
        elapsed: cinematic.elapsed,
        clipRect: {
          x: rect.x + (rect.w - mutualWidth) * 0.5,
          y: rect.y,
          w: mutualWidth,
          h: rect.h
        }
      });
    } else {
      renderCosmos(p, mutual, rect, null, 0, {
        role: 'mutual',
        effect: 'mutual',
        reciprocal,
        strength: 1,
        elapsed: cinematic.elapsed
      });
    }

    withCosmosClip(p, rect, () => drawReciprocityLattice(p, rect));
  }

  function drawEllipseArc(p, radius, axisRatio, completeness = 1, startAngle = 0, wobble = 0) {
    const sweep = MathX.TAU * MathX.clamp(completeness, 0.04, 1);
    const steps = Math.min(160, Math.max(18, Math.ceil(radius * 1.35)));
    p.beginShape();
    for (let step = 0; step <= steps; step += 1) {
      const phase = step / steps;
      const angle = startAngle + phase * sweep;
      const localRadius = radius * (1 + Math.sin(angle * 5 + startAngle) * wobble);
      p.vertex(Math.cos(angle) * localRadius, Math.sin(angle) * localRadius * axisRatio);
    }
    p.endShape();
  }

  function drawHaloProxy(p, marker, zoom) {
    const { galaxy, universeId, x, y, radius } = marker;
    const halo = galaxy.haloProxy;
    if (!halo || radius < 0.7) return;
    const targeted = cameraTargetsGalaxy(universeId, galaxy.id);
    const annular = MathX.isAnnularGalaxy?.(galaxy);
    const haloRadius = radius * halo.radiusScale;
    const offsetX = halo.offsetX * radius * 2.4;
    const offsetY = halo.offsetY * radius * 2.4;
    const baseAlpha = 9 + halo.concentration * 23 + (targeted ? 14 : 0);

    p.push();
    p.translate(x, y);
    if ((targeted || annular) && zoom >= 5 && halo.offsetMagnitude > 0.035) {
      p.stroke(85, 214, 232, baseAlpha + 22);
      p.strokeWeight(0.65);
      p.line(0, 0, offsetX, offsetY);
      p.strokeWeight(2.2);
      p.point(offsetX, offsetY);
    }
    p.translate(offsetX, offsetY);
    p.rotate(halo.rotation);
    p.noFill();
    for (let shell = 1; shell <= 4; shell += 1) {
      const shellScale = 0.38 + shell * 0.155;
      p.stroke(
        shell % 2 ? 85 : 111,
        shell % 2 ? 214 : 191,
        shell % 2 ? 232 : 255,
        baseAlpha * (1.08 - shell * 0.13)
      );
      p.strokeWeight(targeted ? 0.9 : 0.55);
      p.ellipse(0, 0, haloRadius * 2 * shellScale, haloRadius * 2 * shellScale * halo.axisRatio);
    }
    if (targeted && zoom >= 7) {
      p.stroke(85, 214, 232, baseAlpha + 28);
      p.strokeWeight(0.7);
      p.line(-haloRadius * 0.28, 0, haloRadius * 0.28, 0);
      p.line(0, -haloRadius * halo.axisRatio * 0.28, 0, haloRadius * halo.axisRatio * 0.28);
    }
    p.pop();
  }

  function drawAnnularMorphology(p, universe, galaxy, galaxyIndex, radius, birthFade) {
    const morphology = galaxy.morphology;
    const subtype = morphology.subtype;
    const random = MathX.mulberry32((universe.genome.seed ^ Math.imul(galaxyIndex + 1, 0x6c8e9cf5)) >>> 0);
    const red = 170 + galaxy.temperature * 85;
    const green = 205 - galaxy.temperature * 22;
    const blue = 255 - galaxy.temperature * 85;
    if (radius < 2.4) {
      p.stroke(120, 225, 246, 125 + birthFade * 125);
      p.strokeWeight(Math.max(0.8, radius));
      p.point(0, 0);
      return;
    }

    const ringRadius = radius * morphology.ringRadius;
    const ringWidth = Math.max(0.75, Math.min(8, radius * morphology.ringWidth));
    const startAngle = random() * MathX.TAU;
    const completeness = morphology.completeness;
    const ringAxis = morphology.axisRatio;

    // Host structures establish which luminous plane the annulus is crossing.
    if (subtype === 'POLAR_RING') {
      p.push();
      p.rotate(galaxy.rotation);
      p.noFill();
      p.stroke(244, 185, 95, (68 + birthFade * 78) * GALAXY_STRUCTURE_OPACITY);
      p.strokeWeight(Math.max(0.7, Math.min(2.2, radius * 0.055)));
      p.ellipse(0, 0, radius * 2.15, radius * 0.62);
      p.stroke(255, 218, 166, 175);
      p.strokeWeight(Math.max(1.2, Math.min(6, radius * 0.16)));
      p.point(0, 0);
      p.pop();
    } else if (subtype === 'RESONANCE_RING') {
      p.push();
      p.rotate(galaxy.rotation);
      p.stroke(244, 185, 95, (82 + birthFade * 92) * GALAXY_STRUCTURE_OPACITY);
      p.strokeWeight(Math.max(0.8, Math.min(3, radius * 0.09)));
      p.line(-radius * 1.08, 0, radius * 1.08, 0);
      p.pop();
    }

    p.push();
    p.rotate(morphology.planeAngle);
    p.noFill();
    const ringColor = subtype === 'HOAG_LIKE' || subtype === 'POLAR_RING'
      ? [154, 184, 255]
      : [red, green, blue];
    p.stroke(ringColor[0], ringColor[1], ringColor[2], (25 + birthFade * 40) * GALAXY_STRUCTURE_OPACITY);
    p.strokeWeight(ringWidth * 2.8);
    drawEllipseArc(p, ringRadius, ringAxis, completeness, startAngle, subtype === 'UNRESOLVED_ANNULUS' ? 0.055 : 0.012);
    p.stroke(ringColor[0], ringColor[1], ringColor[2], (105 + birthFade * 125) * GALAXY_STRUCTURE_OPACITY);
    p.strokeWeight(ringWidth * 0.5);
    drawEllipseArc(p, ringRadius, ringAxis, completeness, startAngle, subtype === 'UNRESOLVED_ANNULUS' ? 0.055 : 0.012);

    if (subtype === 'COLLISIONAL_RING') {
      p.stroke(111, 191, 232, (42 + birthFade * 52) * GALAXY_STRUCTURE_OPACITY);
      p.strokeWeight(Math.max(0.55, ringWidth * 0.28));
      drawEllipseArc(p, ringRadius * 0.56, ringAxis * 0.94, Math.min(1, completeness + 0.08), startAngle + 0.4, 0.02);
      const spokeCount = 5 + Math.floor(random() * 4);
      for (let spoke = 0; spoke < spokeCount; spoke += 1) {
        const angle = startAngle + (spoke + 0.45) / spokeCount * MathX.TAU * completeness;
        p.stroke(170, 210, 242, (22 + birthFade * 38) * GALAXY_STRUCTURE_OPACITY);
        p.line(
          Math.cos(angle) * ringRadius * 0.32,
          Math.sin(angle) * ringRadius * ringAxis * 0.32,
          Math.cos(angle) * ringRadius * 0.93,
          Math.sin(angle) * ringRadius * ringAxis * 0.93
        );
      }
      const intruderAngle = startAngle + Math.PI * 0.72;
      p.stroke(220, 230, 255, 155);
      p.strokeWeight(Math.max(1, Math.min(4, radius * 0.1)));
      p.point(Math.cos(intruderAngle) * ringRadius * 1.42, Math.sin(intruderAngle) * ringRadius * ringAxis * 1.42);
    } else if (subtype === 'RESONANCE_RING') {
      p.stroke(244, 185, 95, (68 + birthFade * 72) * GALAXY_STRUCTURE_OPACITY);
      p.strokeWeight(Math.max(0.6, ringWidth * 0.38));
      drawEllipseArc(p, ringRadius * morphology.secondaryRing, Math.min(0.95, ringAxis + 0.1), 1, startAngle + Math.PI * 0.5);
      drawEllipseArc(p, ringRadius * 0.28, Math.min(0.92, ringAxis + 0.16), 1, startAngle);
    } else if (subtype === 'POLAR_RING') {
      p.stroke(85, 214, 232, (118 + birthFade * 72) * GALAXY_STRUCTURE_OPACITY);
      p.strokeWeight(Math.max(0.6, ringWidth * 0.35));
      for (let tick = 0; tick < 10; tick += 1) {
        const angle = tick / 10 * MathX.TAU;
        const inner = ringRadius * 0.92;
        const outer = ringRadius * 1.08;
        p.line(
          Math.cos(angle) * inner,
          Math.sin(angle) * inner * ringAxis,
          Math.cos(angle) * outer,
          Math.sin(angle) * outer * ringAxis
        );
      }
    } else if (subtype === 'UNRESOLVED_ANNULUS') {
      p.stroke(235, 99, 180, (38 + birthFade * 42) * GALAXY_STRUCTURE_OPACITY);
      p.strokeWeight(Math.max(0.55, ringWidth * 0.34));
      drawEllipseArc(p, ringRadius * 0.78, Math.min(0.98, ringAxis + 0.08), completeness * 0.68, startAngle + Math.PI * 0.83, 0.08);
    }

    if (radius > 5) {
      const clusterCount = Math.min(210, Math.max(28, Math.floor(ringRadius * (1.15 + galaxy.clumpiness))));
      for (let cluster = 0; cluster < clusterCount; cluster += 1) {
        const angle = startAngle + random() * MathX.TAU * completeness;
        const spread = (random() + random() - 1) * ringWidth * 1.45;
        const knotRadius = ringRadius + spread;
        const hot = random();
        const youngRing = subtype === 'HOAG_LIKE' || subtype === 'POLAR_RING';
        p.stroke(
          youngRing ? 120 + hot * 90 : 174 + hot * 81,
          youngRing ? 190 + hot * 60 : 186 + hot * 60,
          youngRing ? 246 : 255 - hot * 76,
          72 + random() * 175
        );
        p.strokeWeight(0.55 + random() * Math.min(2.2, radius * 0.028));
        p.point(Math.cos(angle) * knotRadius, Math.sin(angle) * knotRadius * ringAxis);
      }
    }

    const coreX = morphology.coreOffsetX * radius;
    const coreY = morphology.coreOffsetY * radius * ringAxis;
    const coreRadius = radius * morphology.coreFraction;
    p.stroke(255, 218, 166, 155 + birthFade * 82);
    p.strokeWeight(Math.max(1.2, Math.min(9, coreRadius * (subtype === 'HOAG_LIKE' ? 1.5 : 0.72))));
    p.point(coreX, coreY);
    if (subtype === 'HOAG_LIKE') {
      p.stroke(255, 210, 150, 82 * GALAXY_STRUCTURE_OPACITY);
      p.strokeWeight(Math.max(0.6, ringWidth * 0.26));
      p.ellipse(coreX, coreY, coreRadius * 2.3, coreRadius * 2.1);
    }
    p.pop();

    if (radius > 16) {
      for (let satellite = 0; satellite < galaxy.satelliteCount; satellite += 1) {
        const angle = random() * MathX.TAU;
        const orbit = radius * (2.4 + random() * 3.4);
        p.stroke(150, 194, 244, 72 + random() * 100);
        p.strokeWeight(0.65 + random());
        p.point(Math.cos(angle) * orbit, Math.sin(angle) * orbit * 0.72);
      }
    }
  }

  function drawGalaxyMorphology(p, universe, galaxy, galaxyIndex, radius, birthFade) {
    const warm = galaxy.temperature;
    const red = 170 + warm * 85;
    const green = 205 - warm * 22;
    const blue = 255 - warm * 85;
    p.noFill();

    if (MathX.isAnnularGalaxy?.(galaxy)) {
      drawAnnularMorphology(p, universe, galaxy, galaxyIndex, radius, birthFade);
      return;
    }

    if (radius < 2.4) {
      p.stroke(red, green, blue, 115 + birthFade * 130);
      p.strokeWeight(Math.max(0.65, radius * 0.85));
      p.point(0, 0);
      return;
    }

    p.rotate(galaxy.rotation);
    p.stroke(red, green, blue, (75 + birthFade * 135) * GALAXY_STRUCTURE_OPACITY);
    p.strokeWeight(Math.max(0.7, Math.min(2.4, radius * 0.08)));
    p.ellipse(0, 0, radius * 2.1, radius * 2.1 * galaxy.ellipticity);
    p.stroke(255, 218, 166, 130 + birthFade * 90);
    p.strokeWeight(Math.max(1, Math.min(7, radius * galaxy.coreSize)));
    p.point(0, 0);

    if (galaxy.type === 'SPIRAL' && radius > 4) {
      const steps = Math.min(58, Math.max(15, Math.floor(radius * 0.85)));
      p.stroke(244, 185, 95, (42 + birthFade * 62) * GALAXY_STRUCTURE_OPACITY);
      p.strokeWeight(Math.max(0.55, Math.min(1.8, radius * 0.018)));
      for (let arm = 0; arm < galaxy.arms; arm += 1) {
        for (let lane = -1; lane <= 1; lane += 1) {
          p.stroke(
            lane === 0 ? 244 : 111,
            lane === 0 ? 185 : 191,
            lane === 0 ? 95 : 232,
            (lane === 0 ? 42 + birthFade * 62 : 18 + birthFade * 26) * GALAXY_STRUCTURE_OPACITY
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
        p.stroke(205, 220, 255, (42 - shell * 5) * GALAXY_STRUCTURE_OPACITY);
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
    const { galaxy, universeId, x, y, radius } = marker;
    const targeted = cameraTargetsGalaxy(universeId, galaxy.id);
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
    const markers = [];
    // Keep galaxy membership stable from frame to frame. A frame-rate-dependent
    // stride created a feedback loop around 30 FPS: half the galaxies vanished,
    // FPS recovered, then they returned and pushed FPS back down again.
    for (let index = 0; index < universe.galaxies.length; index += 1) {
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
      markers.push({ galaxy, universeId: universe.id, x, y, radius, birthFade, index });
    }

    p.push();
    p.noFill();
    p.blendMode(p.BLEND);
    if (state.layers.halos) markers.forEach((marker) => drawHaloProxy(p, marker, zoom));
    if (state.layers.stars) {
      p.blendMode(p.ADD);
      markers.forEach((marker) => {
        p.push();
        p.translate(marker.x, marker.y);
        drawGalaxyMorphology(p, universe, marker.galaxy, marker.index, marker.radius, marker.birthFade);
        p.pop();
      });
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
    if (!points?.length) return;
    const comparison = state.viewMode === 'divergence' && state.comparison;
    const segmentCount = comparison ? 16 : 26;
    const stride = 2;
    const phase = state.reducedMotion ? 0 : Math.floor(performance.now() * 0.008) % points.length;
    const trailWidth = Math.max(18, rect.w - 30);
    const trailHeight = Math.min(220, Math.max(92, rect.h * 0.27));
    const trailX = rect.x + (rect.w - trailWidth) / 2 + xOffset;
    const trailY = rect.y + (rect.h - trailHeight) / 2;
    p.push();
    p.noFill();
    p.strokeWeight(comparison ? 0.5 : 0.65);
    let previous = points[phase];
    for (let index = 1; index <= segmentCount; index += 1) {
      const point = points[(phase + index * stride) % points.length];
      const jump = Math.hypot(point.x - previous.x, point.y - previous.y);
      if (jump < 0.34) {
        const alpha = 10 + index / segmentCount * (comparison ? 38 : 58);
        p.stroke(color[0], color[1], color[2], alpha);
        p.line(
          trailX + previous.x * trailWidth - p.width / 2,
          trailY + previous.y * trailHeight - p.height / 2,
          trailX + point.x * trailWidth - p.width / 2,
          trailY + point.y * trailHeight - p.height / 2
        );
      }
      previous = point;
    }
    p.stroke(color[0], color[1], color[2], comparison ? 92 : 128);
    p.strokeWeight(comparison ? 1.1 : 1.5);
    p.point(
      trailX + previous.x * trailWidth - p.width / 2,
      trailY + previous.y * trailHeight - p.height / 2
    );
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

  function renderSourceField(p, rect, accent) {
    if (rect.w < 2 || rect.h < 2) return;
    if (state.sourceVisual === 'buddhabrot') {
      const renderer = ensureBuddhabrot();
      if (renderer) {
        try {
          const aspect = rect.w / Math.max(1, rect.h);
          const accumulationInterval = state.reducedMotion ? 4 : (state.fps && state.fps < 42 ? 3 : 2);
          const accumulate = p.frameCount % accumulationInterval === 0;
          renderer.render(state.view, aspect, Math.ceil(rect.w), Math.ceil(rect.h), state.iterations, { accumulate });
          if (!renderer.supported) throw new Error(renderer.error || 'Orbit-density context became unavailable');
          if (!state.buddhabrotImage) {
            state.buddhabrotImage = new window.p5.Image(renderer.canvas.width, renderer.canvas.height);
            state.buddhabrotImage.canvas = renderer.canvas;
          }
          state.buddhabrotImage.width = renderer.canvas.width;
          state.buddhabrotImage.height = renderer.canvas.height;
          state.buddhabrotImage.setModified(true);
          p.push();
          p.resetShader();
          p.imageMode(p.CORNER);
          p.noStroke();
          p.image(state.buddhabrotImage, rect.x - p.width / 2, rect.y - p.height / 2, rect.w, rect.h);
          p.pop();
          if (!state.drawing && p.frameCount % 24 === 0) $('#source-state').textContent = idleSourceState();
          return;
        } catch (error) {
          state.buddhabrotError = error.message;
          state.sourceVisual = 'mandelbrot';
          showToast(`Buddhabrot renderer paused: ${error.message}`, 5200);
          setSourceVisual('mandelbrot', { quiet: true });
        }
      }
    }
    drawShaderRect(p, state.shaders?.mandelbrot, rect, {
      uCenter: [state.view.x, state.view.y],
      uScale: state.view.scale,
      uAspect: rect.w / Math.max(1, rect.h),
      uTime: performance.now() * 0.001,
      uAccent: accent,
      uContrast: 1.08,
      uIterations: state.iterations
    });
  }

  function beginIsolatedFrame(p) {
    // CPU overlays use scissoring and additive blending. Reassert the baseline
    // before clearing so no state from the prior universe can constrain or tint
    // the replacement frame, even if a driver defers a WebGL state change.
    if (state.gl) state.gl.disable(state.gl.SCISSOR_TEST);
    p.resetShader();
    p.blendMode(p.BLEND);
    if (state.clearBeforeFrame) p.clear();
    p.background(3, 5, 12);
    state.clearBeforeFrame = false;
  }

  function renderFrame(p) {
    if (state.contextLost) return;
    state.layout = calculateLayout(p.width, p.height);
    if (p.frameCount % 10 === 1) syncLayoutDOM();
    if (!state.webglReady) {
      renderSafePreview(p);
      return;
    }
    beginIsolatedFrame(p);
    state.cosmosFramePasses = [];

    const selected = state.selected || ambientUniverse;
    const accent = state.selected?.genome.genes.hue || 0.52;
    renderSourceField(p, state.layout.source, accent);

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
      renderGoldenRuleCosmos(p, selected, state.layout.cosmos);
    }

    if (state.selected) drawPathSet(p, state.selected.strands, 210);
    const goldenCinematic = goldenRuleCinematic();
    const reciprocal = state.screensaver.goldenRule.reciprocal;
    if (state.screensaver.goldenRule.active && reciprocal && goldenCinematic.compare > 0.001) {
      drawPathSet(p, reciprocal.strands, 175 * goldenCinematic.compare);
    }
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

  function drawSafeCosmosUniverse(p, universe, cosmos, renderOptions = {}) {
    const clipRect = renderOptions.clipRect || cosmos;
    if (!universe || cosmos.w < 2 || cosmos.h < 2 || clipRect.w <= 0 || clipRect.h <= 0) return;
    const role = renderOptions.role || 'standard';
    const cosmosAspect = cosmos.w / Math.max(1, cosmos.h);
    const cosmosView = cameraView();
    const cosmosSpan = MathX.cosmicFitSpan(cosmosAspect) * cosmosView.scale;
    const fieldColor = role === 'reciprocal'
      ? [244, 185, 95, 46]
      : (role === 'mutual' ? [255, 218, 130, 52] : [52, 107, 165, 32]);
    const starColor = role === 'reciprocal'
      ? [255, 210, 124]
      : (role === 'mutual' ? [255, 232, 166] : [235, 214, 173]);
    const haloColor = role === 'original' || role === 'standard' ? [85, 214, 232] : [244, 185, 95];

    state.cosmosFramePasses.push({
      universeId: universe.id,
      proxyUniverseId: universe.id,
      role,
      effect: renderOptions.effect || 'plain',
      clip: { x: clipRect.x, y: clipRect.y, w: clipRect.w, h: clipRect.h }
    });

    p.push();
    const context = p.drawingContext;
    context.beginPath();
    context.rect(clipRect.x, clipRect.y, clipRect.w, clipRect.h);
    context.clip();
    p.noFill();
    for (let index = 1; index < universe.attractor.length; index += 8) {
      const a = universe.attractor[index - 1];
      const b = universe.attractor[index];
      const aScreen = MathX.cosmicFieldToScreen(a.x, a.y, cosmosView, cosmosAspect);
      const bScreen = MathX.cosmicFieldToScreen(b.x, b.y, cosmosView, cosmosAspect);
      if (aScreen.x < 0 || aScreen.x > 1 || aScreen.y < 0 || aScreen.y > 1
        || bScreen.x < 0 || bScreen.x > 1 || bScreen.y < 0 || bScreen.y > 1) continue;
      p.stroke(...fieldColor);
      p.line(
        cosmos.x + aScreen.x * cosmos.w,
        cosmos.y + aScreen.y * cosmos.h,
        cosmos.x + bScreen.x * cosmos.w,
        cosmos.y + bScreen.y * cosmos.h
      );
    }
    if (universe.id !== 'AMBIENT' && (state.layers.stars || state.layers.halos || state.layers.tension)) {
      universe.galaxies.forEach((galaxy, index) => {
        const targeted = cameraTargetsGalaxy(universe.id, galaxy.id);
        if ((index % 2 && !targeted) || galaxy.birth > state.age) return;
        const screen = MathX.cosmicFieldToScreen(galaxy.x, galaxy.y, cosmosView, cosmosAspect);
        if (screen.x < 0 || screen.x > 1 || screen.y < 0 || screen.y > 1) return;
        const x = cosmos.x + screen.x * cosmos.w;
        const y = cosmos.y + screen.y * cosmos.h;
        const radius = Math.max(1, (0.00055 + galaxy.size * 0.0007) / cosmosSpan * cosmos.h);
        if (state.layers.halos && galaxy.haloProxy) {
          const halo = galaxy.haloProxy;
          p.push();
          p.translate(x + halo.offsetX * radius * 2.4, y + halo.offsetY * radius * 2.4);
          p.rotate(halo.rotation);
          p.noFill();
          p.stroke(haloColor[0], haloColor[1], haloColor[2], 42);
          p.strokeWeight(0.7);
          p.ellipse(0, 0, radius * halo.radiusScale * 2, radius * halo.radiusScale * 2 * halo.axisRatio);
          p.pop();
        }
        if (state.layers.stars) {
          if (MathX.isAnnularGalaxy?.(galaxy)) {
            p.push();
            p.translate(x, y);
            p.rotate(galaxy.morphology.planeAngle);
            p.noFill();
            p.stroke(starColor[0], starColor[1], starColor[2], 175);
            p.strokeWeight(Math.max(1, Math.min(4, radius * galaxy.morphology.ringWidth)));
            p.ellipse(
              0,
              0,
              radius * galaxy.morphology.ringRadius * 2,
              radius * galaxy.morphology.ringRadius * 2 * galaxy.morphology.axisRatio
            );
            p.pop();
          } else {
            p.stroke(starColor[0], starColor[1], starColor[2], 130);
            p.strokeWeight(Math.max(1, Math.min(6, radius * 0.65)));
            p.point(x, y);
          }
        }
        if (state.layers.tension && (galaxy.tensionRank < 6 || targeted)) {
          p.noFill();
          p.stroke(235, 99, 180, 130);
          p.strokeWeight(1);
          p.circle(x, y, Math.max(10, radius * 5));
        }
      });
    }
    p.pop();
  }

  function renderSafePreview(p) {
    state.layout = calculateLayout(p.width, p.height);
    state.cosmosFramePasses = [];
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
    const goldenRule = state.screensaver.goldenRule;
    const reciprocal = goldenRule.reciprocal;
    const mutual = goldenRule.mutual;
    const goldenCinematic = goldenRuleCinematic();
    const isCurrentPair = goldenRule.active
      && reciprocal
      && mutual
      && goldenRule.sourceUniverseId === universe.id;
    if (!isCurrentPair || goldenCinematic.phase === 'original') {
      drawSafeCosmosUniverse(p, universe, cosmos, { role: isCurrentPair ? 'original' : 'standard' });
    } else if (goldenCinematic.phase === 'comparison') {
      drawSafeCosmosUniverse(p, universe, cosmos, { role: 'original' });
      const splitX = cosmos.x + cosmos.w * goldenCinematic.divider;
      drawSafeCosmosUniverse(p, reciprocal, cosmos, {
        role: 'reciprocal',
        clipRect: { x: splitX, y: cosmos.y, w: cosmos.x + cosmos.w - splitX, h: cosmos.h }
      });
    } else if (goldenCinematic.phase === 'fusion') {
      drawSafeCosmosUniverse(p, universe, cosmos, { role: 'original' });
      drawSafeCosmosUniverse(p, reciprocal, cosmos, {
        role: 'reciprocal',
        clipRect: { x: cosmos.x + cosmos.w * 0.5, y: cosmos.y, w: cosmos.w * 0.5, h: cosmos.h }
      });
      const mutualWidth = cosmos.w * goldenCinematic.fusion;
      drawSafeCosmosUniverse(p, mutual, cosmos, {
        role: 'mutual',
        effect: 'mutual',
        clipRect: {
          x: cosmos.x + (cosmos.w - mutualWidth) * 0.5,
          y: cosmos.y,
          w: mutualWidth,
          h: cosmos.h
        }
      });
      drawReciprocityLattice(p, cosmos);
    } else {
      drawSafeCosmosUniverse(p, mutual, cosmos, { role: 'mutual', effect: 'mutual' });
      drawReciprocityLattice(p, cosmos);
    }
    if (state.selected) drawSafePaths(p, state.selected.strands, 220);
    if (state.screensaver.goldenRule.active && reciprocal && goldenCinematic.compare > 0.001) {
      drawSafePaths(p, reciprocal.strands, 180 * goldenCinematic.compare);
    }
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
    const buddhabrot = state.buddhabrot?.status() || {
      supported: Boolean(Buddhabrot && !state.buddhabrotError),
      active: false,
      error: state.buddhabrotError,
      samples: 0,
      escapedSamples: 0,
      orbitPoints: 0,
      batches: 0
    };
    let electron = null;
    if (window.cosmosAPI) {
      try {
        electron = await window.cosmosAPI.getDiagnostics();
      } catch (error) {
        electron = { error: error.message };
      }
    }
    const hardware = Boolean(!webgl.software && (!electron || electron.hardwareAcceleration !== false));
    state.diagnostics = {
      webgl,
      electron,
      hardware,
      shaderError: state.shaderError,
      gpuNotice: state.gpuNotice,
      sourceVisual: state.sourceVisual,
      buddhabrot
    };

    const badge = $('#gpu-button');
    badge.classList.remove('is-checking', 'is-hardware', 'is-software', 'is-error');
    badge.classList.add(state.shaderError ? 'is-error' : (hardware ? 'is-hardware' : 'is-software'));
    $('#gpu-label').textContent = state.shaderError
      ? 'OPTICS · INTERRUPTED'
      : (hardware ? `OPTICS · ${state.webgl2 ? 'WEBGL2' : 'WEBGL1'}` : 'OPTICS · SOFTWARE');
    renderDiagnosticDialog();
    if (!hardware) showToast('Safe Preview: a software renderer was detected. Geometry remains deterministic; visual density may be reduced.', 5200);
  }

  function renderDiagnosticDialog() {
    const diagnostics = state.diagnostics;
    if (!diagnostics) return;
    const { webgl, electron, hardware, shaderError, gpuNotice, sourceVisual, buddhabrot } = diagnostics;
    const summary = $('#gpu-summary');
    summary.classList.toggle('is-hardware', hardware);
    summary.classList.toggle('is-software', !hardware);
    $('b', summary).textContent = shaderError
      ? 'THE FIELD OPTICS DID NOT IGNITE'
      : (hardware ? 'GPU LIGHT PATH' : 'SOFTWARE LIGHT PATH');
    $('p', summary).textContent = shaderError || gpuNotice || (hardware
      ? `${sourceVisual === 'buddhabrot' ? 'Buddhabrot accumulation and display' : 'The Mandelbrot field'} is being resolved directly through WebGL.`
      : 'The instrument is drawing through its quieter software fallback. Geometry remains deterministic; visual density may be reduced.');

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
      ['SOURCE VISUAL', String(sourceVisual || state.sourceVisual).toUpperCase()],
      ['SHADER PATH', state.shaders ? 'Source + density field active' : 'fallback'],
      ['BUDDHABROT GPU', buddhabrot?.supported ? `${buddhabrot.accumulationFormat || 'READY'} · ${buddhabrot.batches || 0} BATCHES` : (buddhabrot?.error || 'not initialized')],
      ['ORBIT DENSITY', buddhabrot?.samples ? `${buddhabrot.samples.toLocaleString()} SEEDS · ${buddhabrot.orbitPoints.toLocaleString()} POINTS` : 'awaiting samples'],
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
        const goldenCinematic = syncGoldenRuleCinematic(now);
        if (state.screensaver.active) {
          if (now >= state.screensaver.nextAt) autoGenerateUniverse();
          if (now >= state.screensaver.nextCameraAt) tourCosmosCamera(now);
          if (p.frameCount % 12 === 0) {
            const remaining = Number.isFinite(state.screensaver.nextAt)
              ? Math.max(0, Math.ceil((state.screensaver.nextAt - now) / 1000))
              : null;
            const depth = 1 / Math.max(COSMOS_MIN_SCALE, state.cosmosCamera.scale);
            const depthLabel = state.focusView === 'both' ? 'DUAL DEPTH' : 'DEPTH';
            $('#screensaver-status').textContent = state.screensaver.goldenRule.active
              ? goldenRuleStatusText(goldenCinematic)
              : (remaining === null
                ? 'INITIALIZING FIRST GENOME…'
                : `NEXT GENOME IN ${remaining}s · ${depthLabel} ${depth < 10 ? depth.toFixed(1) : Math.round(depth)}× · ${state.universes.length} BOTTLED`);
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
          camera.inspectUniverseId = null;
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
            inspectUniverseId: null,
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
    showToast(`${sourceVisualName()} frame restored.`);
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
    $$('.source-visual-option').forEach((button) => button.addEventListener('click', () => setSourceVisual(button.dataset.sourceVisual)));
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
    $('#gpu-button').addEventListener('click', async () => {
      await refreshDiagnostics();
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
      if (state.screensaver.active) {
        captureScreensaverSecret(event);
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
    generateScreensaverUniverse: () => (state.screensaver.active ? autoGenerateUniverse()?.id || null : null),
    status: () => {
      const now = performance.now();
      const goldenCinematic = goldenRuleCinematic(now);
      const activeCosmosUniverse = renderedCosmosUniverse(now);
      const inspectedUniverse = cameraInspectionUniverse(now);
      const inspected = inspectedUniverse?.galaxies.find((galaxy) => galaxy.id === state.cosmosCamera.inspectId) || null;
      return ({
      webglReady: state.webglReady,
      webgl2: state.webgl2,
      shaderError: state.shaderError,
      gpuNotice: state.gpuNotice,
      renderer: state.diagnostics?.webgl?.renderer || null,
      sourceVisual: state.sourceVisual,
      buddhabrot: state.buddhabrot?.status() || {
        supported: false,
        error: state.buddhabrotError,
        samples: 0,
        escapedSamples: 0,
        orbitPoints: 0,
        batches: 0
      },
      buddhabrotError: state.buddhabrotError,
      focusView: state.focusView,
      screensaverActive: state.screensaver.active,
      screensaverView: state.screensaver.view,
      screensaverGenerationCount: state.screensaver.generationCount,
      screensaverCameraStep: state.screensaver.cameraStep,
      goldenRuleActive: state.screensaver.goldenRule.active,
      goldenRulePhase: goldenCinematic.phase,
      goldenRuleCompare: goldenCinematic.compare,
      goldenRuleFusion: goldenCinematic.fusion,
      goldenRuleTransitionUniverseId: state.screensaver.goldenRule.transitionUniverseId,
      reciprocalUniverseId: state.screensaver.goldenRule.reciprocal?.id || null,
      reciprocalSeed: state.screensaver.goldenRule.reciprocal?.genome.seedHex || null,
      reciprocalGalaxyCount: state.screensaver.goldenRule.reciprocal?.galaxies.length || 0,
      mutualUniverseId: state.screensaver.goldenRule.mutual?.id || null,
      mutualSeed: state.screensaver.goldenRule.mutual?.genome.seedHex || null,
      mutualGalaxyCount: state.screensaver.goldenRule.mutual?.galaxies.length || 0,
      cosmosFramePasses: state.cosmosFramePasses.map((pass) => ({
        ...pass,
        clip: { ...pass.clip }
      })),
      screensaverFractalHome: state.screensaver.fractalHome ? { ...state.screensaver.fractalHome } : null,
      screensaverFractalTarget: state.screensaver.fractalTarget ? { ...state.screensaver.fractalTarget } : null,
      screensaverTourUniverseId: state.screensaver.tourTargetUniverseId,
      universeCount: state.universes.length,
      selectedUniverseId: state.selected?.id || null,
      activeCosmosUniverseId: activeCosmosUniverse?.id || null,
      renderRevision: state.renderRevision,
      archiveIds: state.universes.map((universe) => universe.id),
      selectedPointCount: state.selected?.strands?.[0]?.points?.length || 0,
      selectedPointHead: state.selected?.strands?.[0]?.points?.slice(0, 5).map((point) => [point.x, point.y, point.cx, point.cy]) || [],
      pointer: { ...state.pointer },
      cosmosPanning: state.cosmosPanning,
      selectedRingCount: state.selected?.galaxies.filter((galaxy) => MathX.isAnnularGalaxy?.(galaxy)).length || 0,
      inspectedGalaxy: inspected ? {
        id: inspected.id,
        universeId: inspectedUniverse.id,
        x: inspected.x,
        y: inspected.y,
        type: inspected.type,
        morphology: inspected.morphology,
        haloProxy: inspected.haloProxy,
        formationTension: inspected.formationTension,
        tensionDominant: inspected.tensionDominant
      } : null,
      fractalView: { ...state.view },
      universeCamera: {
        x: state.cosmosCamera.x,
        y: state.cosmosCamera.y,
        scale: state.cosmosCamera.scale,
        zoom: 1 / state.cosmosCamera.scale,
        targetX: state.cosmosCamera.targetX,
        targetY: state.cosmosCamera.targetY,
        targetScale: state.cosmosCamera.targetScale,
        inspectId: state.cosmosCamera.inspectId,
        inspectUniverseId: state.cosmosCamera.inspectUniverseId
      },
      layout: state.layout ? {
        source: { ...state.layout.source },
        loom: { ...state.layout.loom },
        cosmos: { ...state.layout.cosmos }
      } : null,
      fps: state.fps
      });
    }
  });
}());
