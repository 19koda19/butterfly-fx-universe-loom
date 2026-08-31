(function bootstrapCosmoMath(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.CosmoMath = api;
}(typeof window !== 'undefined' ? window : globalThis, function createCosmoMath() {
  'use strict';

  const TAU = Math.PI * 2;
  const PHI = (1 + Math.sqrt(5)) / 2;
  const GOLDEN_ANGLE = TAU / (PHI * PHI);

  function clamp(value, min = 0, max = 1) {
    return Math.min(max, Math.max(min, value));
  }

  function lerp(a, b, t) {
    return a + (b - a) * t;
  }

  function fnv1a(text) {
    let hash = 0x811c9dc5;
    for (let i = 0; i < text.length; i += 1) {
      hash ^= text.charCodeAt(i);
      hash = Math.imul(hash, 0x01000193);
    }
    return hash >>> 0;
  }

  function mulberry32(seed) {
    let value = seed >>> 0;
    return function random() {
      value += 0x6d2b79f5;
      let t = value;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function screenToComplex(nx, ny, view, aspect = 1) {
    return {
      x: view.x + (nx - 0.5) * view.scale * aspect,
      y: view.y + (ny - 0.5) * view.scale
    };
  }

  function complexToScreen(cx, cy, view, aspect = 1) {
    return {
      x: ((cx - view.x) / (view.scale * aspect)) + 0.5,
      y: ((cy - view.y) / view.scale) + 0.5
    };
  }

  function cosmicFitSpan(aspect = 1) {
    return Math.max(1, 1 / Math.max(0.000001, aspect));
  }

  function screenToCosmicField(nx, ny, view, aspect = 1) {
    const span = cosmicFitSpan(aspect) * view.scale;
    return {
      x: view.x + (nx - 0.5) * span * aspect,
      y: view.y + (ny - 0.5) * span
    };
  }

  function cosmicFieldToScreen(x, y, view, aspect = 1) {
    const span = cosmicFitSpan(aspect) * view.scale;
    return {
      x: ((x - view.x) / (span * aspect)) + 0.5,
      y: ((y - view.y) / span) + 0.5
    };
  }

  function clampCosmicView(view, aspect = 1, minScale = 1 / 128, maxScale = 1) {
    const scale = clamp(Number.isFinite(view.scale) ? view.scale : 1, minScale, maxScale);
    const span = cosmicFitSpan(aspect) * scale;
    const halfX = span * aspect * 0.5;
    const halfY = span * 0.5;
    return {
      x: halfX >= 0.5 ? 0.5 : clamp(Number.isFinite(view.x) ? view.x : 0.5, halfX, 1 - halfX),
      y: halfY >= 0.5 ? 0.5 : clamp(Number.isFinite(view.y) ? view.y : 0.5, halfY, 1 - halfY),
      scale
    };
  }

  function zoomCosmicView(view, nx, ny, scaleFactor, aspect = 1, minScale = 1 / 128, maxScale = 1) {
    const current = clampCosmicView(view, aspect, minScale, maxScale);
    const anchor = screenToCosmicField(nx, ny, current, aspect);
    const scale = clamp(current.scale * scaleFactor, minScale, maxScale);
    const span = cosmicFitSpan(aspect) * scale;
    return clampCosmicView({
      x: anchor.x - (nx - 0.5) * span * aspect,
      y: anchor.y - (ny - 0.5) * span,
      scale
    }, aspect, minScale, maxScale);
  }

  function mandelbrotSample(cx, cy, maxIterations = 180) {
    let zx = 0;
    let zy = 0;
    let zx2 = 0;
    let zy2 = 0;
    let orbitTrap = 10;
    let iteration = 0;

    for (; iteration < maxIterations && zx2 + zy2 <= 256; iteration += 1) {
      zy = 2 * zx * zy + cy;
      zx = zx2 - zy2 + cx;
      zx2 = zx * zx;
      zy2 = zy * zy;
      orbitTrap = Math.min(orbitTrap, Math.abs(Math.hypot(zx, zy) - 0.5), Math.abs(zx), Math.abs(zy));
    }

    const interior = iteration >= maxIterations;
    const magnitude = Math.max(2, Math.sqrt(zx2 + zy2));
    const smooth = interior
      ? maxIterations
      : iteration + 1 - Math.log2(Math.max(1e-8, Math.log2(magnitude)));

    return {
      iteration,
      smooth,
      normalized: clamp(smooth / maxIterations),
      interior,
      orbitTrap: clamp(orbitTrap * 2),
      angle: Math.atan2(zy, zx)
    };
  }

  function distance(a, b) {
    return Math.hypot((a.x ?? a.cx) - (b.x ?? b.cx), (a.y ?? a.cy) - (b.y ?? b.cy));
  }

  function resampleStroke(points, targetCount = 96) {
    if (!Array.isArray(points) || points.length === 0) return [];
    if (points.length === 1 || targetCount <= 1) return [{ ...points[0] }];

    const cumulative = [0];
    for (let i = 1; i < points.length; i += 1) {
      cumulative.push(cumulative[i - 1] + distance(points[i - 1], points[i]));
    }
    const total = cumulative[cumulative.length - 1];
    if (total < 1e-12) return Array.from({ length: targetCount }, () => ({ ...points[0] }));

    const output = [];
    let segment = 1;
    for (let i = 0; i < targetCount; i += 1) {
      const target = total * (i / (targetCount - 1));
      while (segment < cumulative.length - 1 && cumulative[segment] < target) segment += 1;
      const from = points[segment - 1];
      const to = points[segment];
      const span = cumulative[segment] - cumulative[segment - 1] || 1;
      const t = (target - cumulative[segment - 1]) / span;
      const sample = {};
      for (const key of ['x', 'y', 'cx', 'cy', 'time']) {
        if (Number.isFinite(from[key]) && Number.isFinite(to[key])) sample[key] = lerp(from[key], to[key], t);
      }
      output.push(sample);
    }
    return output;
  }

  function makeReciprocalStrands(strands) {
    const source = Array.isArray(strands) ? strands : [];
    const allPoints = source.flatMap((strand) => strand.points || strand || [])
      .filter((point) => Number.isFinite(point?.cx) && Number.isFinite(point?.cy));
    if (!allPoints.length) return [];

    const center = allPoints.reduce((sum, point) => ({
      x: sum.x + point.cx / allPoints.length,
      y: sum.y + point.cy / allPoints.length
    }), { x: 0, y: 0 });
    const roleComplements = {
      DENSITY: 'VOID',
      VOID: 'DENSITY',
      TURBULENCE: 'SPIN',
      SPIN: 'TURBULENCE',
      AUTO: 'AUTO'
    };

    return source.map((strand, strandIndex) => {
      const sourcePoints = (strand.points || strand || []).slice().reverse();
      const angle = GOLDEN_ANGLE * (strandIndex + 1);
      const cosine = Math.cos(angle);
      const sine = Math.sin(angle);
      const timeValues = sourcePoints.map((point) => point.time).filter(Number.isFinite);
      const timeStart = timeValues.length ? Math.min(...timeValues) : 0;
      const timeSpan = timeValues.length ? Math.max(...timeValues) - timeStart : Math.max(1, sourcePoints.length - 1);
      return {
        role: roleComplements[strand.role || 'AUTO'] || 'AUTO',
        operation: strand.operation || 'ADD',
        points: sourcePoints.map((point, pointIndex) => {
          const dx = point.cx - center.x;
          const dy = point.cy - center.y;
          const reciprocalX = (cosine * dx - sine * dy) / PHI;
          const reciprocalY = (sine * dx + cosine * dy) / PHI;
          const normalizedX = Number.isFinite(point.x) ? point.x - 0.5 : 0;
          const normalizedY = Number.isFinite(point.y) ? point.y - 0.5 : 0;
          return {
            x: clamp(0.5 + (cosine * normalizedX - sine * normalizedY) / PHI),
            y: clamp(0.5 + (sine * normalizedX + cosine * normalizedY) / PHI),
            cx: center.x + reciprocalX,
            cy: center.y + reciprocalY,
            time: timeStart + timeSpan * (pointIndex / Math.max(1, sourcePoints.length - 1))
          };
        })
      };
    });
  }

  function normalizedEntropy(values, bins = 8) {
    const counts = Array.from({ length: bins }, () => 0);
    values.forEach((value) => {
      counts[Math.min(bins - 1, Math.floor(clamp(value) * bins))] += 1;
    });
    const total = Math.max(1, values.length);
    return -counts.reduce((sum, count) => {
      if (!count) return sum;
      const p = count / total;
      return sum + p * Math.log(p);
    }, 0) / Math.log(bins);
  }

  function analyzeStrands(strands, options = {}) {
    const maxIterations = options.maxIterations || 180;
    const perturbation = options.perturbation || 0;
    const sampledStrands = strands.map((strand) => resampleStroke(strand.points || strand, 72));
    const samples = [];
    let length = 0;
    let curvature = 0;
    let boundaryCrossings = 0;

    sampledStrands.forEach((points, strandIndex) => {
      let previous = null;
      let previousAngle = null;
      points.forEach((point, pointIndex) => {
        const cx = point.cx + (strandIndex === 0 && pointIndex === Math.floor(points.length / 2) ? perturbation : 0);
        const sample = mandelbrotSample(cx, point.cy, maxIterations);
        samples.push({ ...sample, cx, cy: point.cy, strandIndex, pointIndex });
        if (previous) {
          const dx = cx - previous.cx;
          const dy = point.cy - previous.cy;
          length += Math.hypot(dx, dy);
          const angle = Math.atan2(dy, dx);
          if (previousAngle !== null) {
            let turn = angle - previousAngle;
            while (turn > Math.PI) turn -= TAU;
            while (turn < -Math.PI) turn += TAU;
            curvature += turn;
          }
          previousAngle = angle;
          if (sample.interior !== previous.interior) boundaryCrossings += 1;
          if ((sample.normalized > 0.72) !== (previous.normalized > 0.72)) boundaryCrossings += 0.35;
        }
        previous = { ...sample, cx, cy: point.cy };
      });
    });

    const values = samples.map((sample) => sample.normalized);
    const meanEscape = values.reduce((sum, value) => sum + value, 0) / Math.max(1, values.length);
    const variance = values.reduce((sum, value) => sum + (value - meanEscape) ** 2, 0) / Math.max(1, values.length);
    const roughness = values.slice(1).reduce((sum, value, index) => sum + Math.abs(value - values[index]), 0) / Math.max(1, values.length - 1);
    const interiorRatio = samples.filter((sample) => sample.interior).length / Math.max(1, samples.length);
    const trapMean = samples.reduce((sum, sample) => sum + sample.orbitTrap, 0) / Math.max(1, samples.length);
    const entropy = normalizedEntropy(values);
    const crossingRate = clamp(boundaryCrossings / Math.max(2, samples.length * 0.12));
    const winding = clamp(Math.abs(curvature) / (TAU * Math.max(1, sampledStrands.length) * 2));
    const geometricEnergy = clamp(length / Math.max(0.25, sampledStrands.length * 2.6));

    const signature = sampledStrands.map((points) => points.map((point) =>
      `${point.cx.toFixed(11)},${point.cy.toFixed(11)}`).join(';')).join('|');
    const seed = fnv1a(`${signature}|${perturbation.toExponential(12)}|${maxIterations}`);
    const random = mulberry32(seed);

    const metrics = {
      density: clamp(0.12 + meanEscape * 0.48 + interiorRatio * 0.28 + (1 - trapMean) * 0.12),
      turbulence: clamp(roughness * 3.8 + Math.sqrt(variance) * 1.4 + entropy * 0.18),
      peakSeeds: clamp(0.08 + crossingRate * 0.62 + entropy * 0.3),
      spin: clamp(0.08 + winding * 0.68 + geometricEnergy * 0.24),
      voidBias: clamp(0.1 + (1 - interiorRatio) * 0.43 + (1 - meanEscape) * 0.28 + trapMean * 0.19),
      meanEscape,
      variance,
      roughness,
      interiorRatio,
      boundaryCrossings: Math.round(boundaryCrossings),
      entropy,
      winding,
      pathLength: length
    };

    // Explicit strand roles are small, legible biases layered over the measured
    // geometry. AUTO remains purely derived from the sampled path.
    const roleCounts = strands.reduce((counts, strand) => {
      const role = strand.role || 'AUTO';
      counts[role] = (counts[role] || 0) + 1;
      return counts;
    }, {});
    const roleScale = 0.16 / Math.max(1, strands.length);
    metrics.density = clamp(metrics.density + (roleCounts.DENSITY || 0) * roleScale);
    metrics.turbulence = clamp(metrics.turbulence + (roleCounts.TURBULENCE || 0) * roleScale);
    metrics.spin = clamp(metrics.spin + (roleCounts.SPIN || 0) * roleScale);
    metrics.voidBias = clamp(metrics.voidBias + (roleCounts.VOID || 0) * roleScale);

    const attractorKinds = ['LORENZ', 'RÖSSLER', 'CLIFFORD'];
    const attractorIndex = seed % attractorKinds.length;
    const genes = {
      darkMatterRatio: 4.1 + metrics.density * 2.3,
      expansion: 0.38 + metrics.voidBias * 0.86,
      collapse: 0.42 + metrics.density * 0.92 - metrics.voidBias * 0.16,
      cooling: 0.28 + metrics.peakSeeds * 0.7,
      feedback: 0.22 + metrics.turbulence * 0.74,
      filamentGain: 0.35 + metrics.turbulence * 0.36 + metrics.density * 0.56,
      haloCount: Math.round(72 + metrics.peakSeeds * 210 + metrics.density * 90),
      spiralBias: clamp(0.18 + metrics.spin * 0.68 - metrics.turbulence * 0.16),
      hue: (seed % 360) / 360,
      phaseA: random() * 100,
      phaseB: random() * 100,
      phaseC: random() * 100,
      attractor: attractorKinds[attractorIndex],
      attractorIndex
    };

    if (attractorIndex === 0) {
      genes.attractorParams = {
        sigma: 8.4 + metrics.density * 5.2,
        rho: 24.2 + metrics.turbulence * 10.8,
        beta: 2.15 + metrics.voidBias * 1.05
      };
    } else if (attractorIndex === 1) {
      genes.attractorParams = {
        a: 0.12 + metrics.spin * 0.22,
        b: 0.12 + metrics.density * 0.2,
        c: 4.8 + metrics.turbulence * 2.6
      };
    } else {
      genes.attractorParams = {
        a: -1.7 + metrics.spin * 0.55,
        b: 1.65 + metrics.turbulence * 0.5,
        c: 0.65 + metrics.density * 0.55,
        d: 1.15 + metrics.voidBias * 0.85
      };
    }

    return {
      seed,
      seedHex: seed.toString(16).padStart(8, '0').toUpperCase(),
      metrics,
      genes,
      sampleCount: samples.length,
      strandCount: strands.length,
      samples
    };
  }

  function normalizeAttractor(points) {
    const xs = points.map((point) => point.x);
    const ys = points.map((point) => point.y);
    const minX = Math.min(...xs);
    const maxX = Math.max(...xs);
    const minY = Math.min(...ys);
    const maxY = Math.max(...ys);
    const spanX = maxX - minX || 1;
    const spanY = maxY - minY || 1;
    return points.map((point, index) => ({
      x: (point.x - minX) / spanX,
      y: (point.y - minY) / spanY,
      z: point.z || 0,
      t: index / Math.max(1, points.length - 1)
    }));
  }

  function generateAttractor(genome, count = 900) {
    const { genes, seed } = genome;
    const random = mulberry32(seed ^ 0xa5a5a5a5);
    const points = [];
    const warmup = 420;

    if (genes.attractor === 'LORENZ') {
      let x = 0.1 + random() * 0.04;
      let y = 0;
      let z = 0;
      const { sigma, rho, beta } = genes.attractorParams;
      const dt = 0.0054;
      for (let i = 0; i < count + warmup; i += 1) {
        x += sigma * (y - x) * dt;
        y += (x * (rho - z) - y) * dt;
        z += (x * y - beta * z) * dt;
        if (i >= warmup) points.push({ x, y: z, z: y });
      }
    } else if (genes.attractor === 'RÖSSLER') {
      let x = 0.1;
      let y = 0;
      let z = 0;
      const { a, b, c } = genes.attractorParams;
      const dt = 0.012;
      for (let i = 0; i < count + warmup; i += 1) {
        x += (-y - z) * dt;
        y += (x + a * y) * dt;
        z += (b + z * (x - c)) * dt;
        if (i >= warmup) points.push({ x, y, z });
      }
    } else {
      let x = 0.1;
      let y = 0.1;
      const { a, b, c, d } = genes.attractorParams;
      for (let i = 0; i < count + warmup; i += 1) {
        const nx = Math.sin(a * y) + c * Math.cos(a * x);
        const ny = Math.sin(b * x) + d * Math.cos(b * y);
        x = nx;
        y = ny;
        if (i >= warmup) points.push({ x, y, z: 0 });
      }
    }

    return normalizeAttractor(points);
  }

  const ANNULAR_SUBTYPES = Object.freeze([
    'COLLISIONAL_RING',
    'POLAR_RING',
    'RESONANCE_RING',
    'HOAG_LIKE',
    'UNRESOLVED_ANNULUS'
  ]);

  const ANNULAR_LABELS = Object.freeze({
    COLLISIONAL_RING: 'COLLISIONAL RING',
    POLAR_RING: 'POLAR RING',
    RESONANCE_RING: 'RESONANCE RING',
    HOAG_LIKE: 'HOAG-LIKE RING',
    UNRESOLVED_ANNULUS: 'UNRESOLVED ANNULUS'
  });

  function isAnnularGalaxy(galaxy) {
    return galaxy?.morphology?.family === 'ANNULAR';
  }

  function taggedGalaxyRandom(genome, galaxy, tag) {
    const seedHex = genome.seedHex || (genome.seed >>> 0).toString(16).padStart(8, '0');
    return mulberry32(fnv1a(`${seedHex}|${galaxy.id}|${tag}`));
  }

  function weightedChoice(random, choices) {
    const total = choices.reduce((sum, choice) => sum + Math.max(0, choice.weight), 0);
    let cursor = random() * Math.max(1e-9, total);
    for (const choice of choices) {
      cursor -= Math.max(0, choice.weight);
      if (cursor <= 0) return choice.value;
    }
    return choices[choices.length - 1].value;
  }

  function axialAlignment(a, b) {
    return Math.abs(Math.cos(a - b));
  }

  function normalizeAngle(angle) {
    return ((angle % TAU) + TAU) % TAU;
  }

  function annularTargetCount(genome, count) {
    if (count < 6) return 0;
    const { metrics } = genome;
    const ringSignal = clamp(
      metrics.peakSeeds * 0.3
      + metrics.turbulence * 0.26
      + metrics.spin * 0.24
      + metrics.density * 0.2
    );
    const fraction = 0.1 + ringSignal * 0.08;
    return Math.max(1, Math.min(count, Math.round(count * fraction)));
  }

  function ringCandidateScore(genome, galaxy) {
    const random = taggedGalaxyRandom(genome, galaxy, 'annular-candidate@1');
    const { metrics } = genome;
    const massCeiling = 0.6 + metrics.density * 1.7;
    const massLoad = clamp(galaxy.mass / Math.max(0.001, massCeiling));
    const satelliteSignal = clamp(galaxy.satelliteCount / 7);
    return random() * 0.58
      + galaxy.mergerScars * 0.13
      + massLoad * 0.08
      + satelliteSignal * 0.07
      + metrics.peakSeeds * 0.06
      + metrics.turbulence * 0.05
      + metrics.spin * 0.03;
  }

  function deriveHaloProxy(genome, galaxy) {
    const random = taggedGalaxyRandom(genome, galaxy, 'halo-proxy@1');
    const { genes, metrics } = genome;
    const massCeiling = 0.6 + metrics.density * 1.7;
    const massLoad = clamp(galaxy.mass / Math.max(0.001, massCeiling));
    const darkMatterLoad = clamp((genes.darkMatterRatio - 4.1) / 2.3);
    const concentration = clamp(
      0.26 + metrics.density * 0.38 + massLoad * 0.18
      + darkMatterLoad * 0.08 - metrics.voidBias * 0.1 + (random() - 0.5) * 0.16
    );
    const axisRatio = clamp(
      0.57 + (1 - metrics.turbulence) * 0.16 + random() * 0.24,
      0.52,
      0.98
    );
    const rotation = random() * TAU;
    const offsetMagnitude = clamp(
      0.018 + metrics.turbulence * 0.1 + galaxy.mergerScars * 0.22
      + metrics.voidBias * 0.06 + (random() - 0.5) * 0.07,
      0,
      0.48
    );
    const offsetAngle = random() * TAU;
    return {
      model: 'TOY_HALO_PROXY',
      radiusScale: 2.75 + massLoad * 1.25 + metrics.density * 0.65
        + darkMatterLoad * 0.35 + random() * 0.45,
      concentration,
      axisRatio,
      rotation,
      offsetX: Math.cos(offsetAngle) * offsetMagnitude,
      offsetY: Math.sin(offsetAngle) * offsetMagnitude,
      offsetMagnitude,
      luminousAlignment: axialAlignment(rotation, galaxy.rotation),
      ringPlaneSupport: 1,
      formationSupport: 1,
      anomalyScore: 0
    };
  }

  function deriveLegacyMorphology(galaxy) {
    return {
      family: galaxy.type,
      subtype: galaxy.type,
      label: galaxy.type,
      formationChannel: 'LEGACY_MORPHOLOGY',
      annularity: 0,
      ringRadius: 0,
      ringWidth: 0,
      gapFraction: 0,
      completeness: 0,
      coreFraction: galaxy.coreSize,
      coreOffsetX: 0,
      coreOffsetY: 0,
      axisRatio: galaxy.ellipticity,
      planeAngle: galaxy.rotation,
      secondaryRing: 0,
      driverStrength: 1
    };
  }

  function deriveAnnularMorphology(genome, galaxy, haloProxy) {
    const random = taggedGalaxyRandom(genome, galaxy, 'annular-morphology@1');
    const { metrics } = genome;
    const satelliteSignal = clamp(galaxy.satelliteCount / 7);
    const haloOffset = clamp(haloProxy.offsetMagnitude / 0.48);
    const diskHaloMisalignment = 1 - haloProxy.luminousAlignment;
    const driverSignals = {
      COLLISIONAL_RING: clamp(
        galaxy.mergerScars * 0.5 + metrics.turbulence * 0.2
        + satelliteSignal * 0.18 + haloOffset * 0.12
      ),
      POLAR_RING: clamp(
        diskHaloMisalignment * 0.42 + metrics.spin * 0.24
        + satelliteSignal * 0.16 + haloProxy.concentration * 0.18
      ),
      RESONANCE_RING: clamp(
        metrics.spin * 0.4 + (1 - metrics.turbulence) * 0.28
        + (1 - galaxy.mergerScars) * 0.2 + haloProxy.concentration * 0.12
      ),
      HOAG_LIKE: clamp(
        (1 - galaxy.mergerScars) * 0.32 + (1 - galaxy.dustBias) * 0.24
        + (1 - satelliteSignal) * 0.18 + haloProxy.concentration * 0.26
      ),
      UNRESOLVED_ANNULUS: clamp(
        0.12 + haloOffset * 0.34 + metrics.voidBias * 0.22
        + metrics.turbulence * 0.18 + diskHaloMisalignment * 0.14
      )
    };
    const subtype = weightedChoice(random, ANNULAR_SUBTYPES.map((value) => ({
      value,
      weight: 0.12 + driverSignals[value]
    })));
    const formationChannels = {
      COLLISIONAL_RING: 'IMPACT_DENSITY_WAVE',
      POLAR_RING: 'ACCRETED_POLAR_ORBIT',
      RESONANCE_RING: 'ORBITAL_RESONANCE',
      HOAG_LIKE: 'DETACHED_CORE_AND_RING',
      UNRESOLVED_ANNULUS: 'NO_DOMINANT_CHANNEL'
    };
    let completeness = 0.56 + random() * 0.39;
    let axisRatio = 0.55 + random() * 0.41;
    let gapFraction = 0.36 + random() * 0.38;
    let coreFraction = 0.12 + random() * 0.42;
    let planeAngle = galaxy.rotation + (random() - 0.5) * 0.62;
    let secondaryRing = 0;
    let coreOffsetMagnitude = random() * 0.07;

    if (subtype === 'POLAR_RING') {
      axisRatio = 0.25 + random() * 0.42;
      planeAngle = galaxy.rotation + Math.PI * 0.5 + (random() - 0.5) * 0.34;
      completeness = 0.74 + random() * 0.24;
    } else if (subtype === 'RESONANCE_RING') {
      completeness = 0.86 + random() * 0.13;
      secondaryRing = 0.48 + random() * 0.27;
      gapFraction = 0.32 + random() * 0.24;
    } else if (subtype === 'HOAG_LIKE') {
      completeness = 0.93 + random() * 0.07;
      axisRatio = 0.82 + random() * 0.17;
      gapFraction = 0.58 + random() * 0.22;
      coreFraction = 0.18 + random() * 0.2;
      coreOffsetMagnitude *= 0.22;
    } else if (subtype === 'COLLISIONAL_RING') {
      completeness = 0.58 + random() * 0.34;
      coreOffsetMagnitude = 0.1 + random() * 0.28;
    } else {
      completeness = 0.42 + random() * 0.4;
      axisRatio = 0.4 + random() * 0.54;
      coreOffsetMagnitude = 0.08 + random() * 0.34;
      planeAngle = random() * TAU;
    }

    const coreOffsetAngle = random() * TAU;
    return {
      family: 'ANNULAR',
      subtype,
      label: ANNULAR_LABELS[subtype],
      formationChannel: formationChannels[subtype],
      annularity: 0.64 + random() * 0.35,
      ringRadius: 1.18 + random() * 0.68,
      ringWidth: 0.065 + random() * 0.19,
      gapFraction,
      completeness,
      coreFraction,
      coreOffsetX: Math.cos(coreOffsetAngle) * coreOffsetMagnitude,
      coreOffsetY: Math.sin(coreOffsetAngle) * coreOffsetMagnitude,
      axisRatio,
      planeAngle: normalizeAngle(planeAngle),
      secondaryRing,
      driverStrength: driverSignals[subtype]
    };
  }

  function finalizeHaloProxy(galaxy, morphology, haloProxy) {
    const annular = morphology.family === 'ANNULAR';
    const ordinaryAlignment = axialAlignment(haloProxy.rotation, morphology.planeAngle);
    const ringPlaneSupport = annular && morphology.subtype === 'POLAR_RING'
      ? 1 - ordinaryAlignment
      : ordinaryAlignment;
    const offsetLoad = clamp(haloProxy.offsetMagnitude / 0.48);
    const formationSupport = annular
      ? clamp(morphology.driverStrength * 0.44 + haloProxy.concentration * 0.31 + ringPlaneSupport * 0.25)
      : clamp(haloProxy.concentration * 0.44 + (1 - offsetLoad) * 0.34 + haloProxy.luminousAlignment * 0.22);
    const relaxedness = clamp(
      haloProxy.concentration * 0.55 + (1 - galaxy.mergerScars) * 0.45
    );
    const anomalyScore = clamp(
      (1 - formationSupport) * 0.48
      + offsetLoad * relaxedness * 0.32
      + (annular ? (1 - ringPlaneSupport) * 0.2 : 0)
    );
    return {
      ...haloProxy,
      ringPlaneSupport,
      formationSupport,
      anomalyScore
    };
  }

  function galaxyFormationTension(genome, galaxy) {
    const { genes, metrics } = genome;
    const massCeiling = 0.6 + metrics.density * 1.7;
    const massLoad = clamp(galaxy.mass / Math.max(0.001, massCeiling));
    const earlyMass = massLoad * clamp((0.54 - galaxy.birth) / 0.42);
    const voidMass = massLoad * metrics.voidBias * (1 - metrics.peakSeeds * 0.35);
    const plainSpiral = galaxy.type === 'SPIRAL' && !isAnnularGalaxy(galaxy);
    const orderedTurbulence = plainSpiral
      ? clamp((metrics.turbulence - 0.38) / 0.62) * (0.45 + (galaxy.arms || 0) / 8)
      : 0;
    const expectedArmOrder = clamp(((galaxy.arms || 0) - 2) / 2);
    const spinArmMismatch = plainSpiral
      ? Math.abs(expectedArmOrder - metrics.spin) * (0.55 + genes.spiralBias * 0.45)
      : 0;
    const expectedTemperature = 0.28 + (1 - galaxy.birth) * 0.46;
    const thermalOutlier = massLoad * Math.abs(galaxy.temperature - expectedTemperature);
    const mergerScars = clamp(Number.isFinite(galaxy.mergerScars) ? galaxy.mergerScars : 0);
    const morphology = galaxy.morphology;
    const haloProxy = galaxy.haloProxy;
    const annularity = isAnnularGalaxy(galaxy) ? morphology.annularity : 0;
    const unsupportedRing = annularity * (1 - (morphology?.driverStrength || 0));
    const haloPlaneMismatch = annularity * (1 - (haloProxy?.ringPlaneSupport ?? 1));
    const relaxedHaloOffset = haloProxy
      ? clamp((haloProxy.offsetMagnitude - 0.08) / 0.4)
        * (0.35 + (1 - mergerScars) * 0.65)
        * (0.4 + haloProxy.concentration * 0.6)
      : 0;
    const ringDriverLabels = {
      COLLISIONAL_RING: 'RING WITHOUT A MATCHED COLLISION SIGNAL',
      POLAR_RING: 'POLAR RING LACKS HALO-PLANE SUPPORT',
      RESONANCE_RING: 'ORDERED RING LACKS A RESONANCE SIGNAL',
      HOAG_LIKE: 'CLEAN DETACHED RING HAS NO DOMINANT CHANNEL',
      UNRESOLVED_ANNULUS: 'NO DOMINANT RING-FORMATION CHANNEL'
    };
    const weighted = [
      { key: 'EARLY_MASS', label: 'MASS BEFORE SUPPORTED COLLAPSE', value: earlyMass * 0.34 },
      { key: 'VOID_MASS', label: 'LUMINOUS MASS IN A VOID-BIASED FIELD', value: voidMass * 0.31 },
      { key: 'ORDER_TURBULENCE', label: 'ORDERED SPIRAL UNDER HIGH TURBULENCE', value: orderedTurbulence * 0.24 },
      { key: 'SPIN_ARMS', label: 'ARM ORDER EXCEEDS THE SPIN SIGNAL', value: spinArmMismatch * 0.18 },
      { key: 'THERMAL', label: 'THERMAL STATE IS AN OUTLIER', value: thermalOutlier * 0.12 },
      {
        key: 'RING_DRIVER',
        label: ringDriverLabels[morphology?.subtype] || 'NO STRONG RING-FORMING DRIVER IN THIS MODEL',
        value: unsupportedRing * 0.28
      },
      {
        key: 'HALO_OFFSET',
        label: 'LIGHT IS OFFSET FROM A RELAXED HALO PROXY',
        value: relaxedHaloOffset * 0.2
      },
      {
        key: 'RING_HALO_PLANE',
        label: 'ANNULUS LACKS SUPPORT FROM THE TOY HALO PLANE',
        value: haloPlaneMismatch * 0.16
      }
    ].sort((a, b) => b.value - a.value);
    const score = clamp(0.05 + weighted.reduce((sum, factor) => sum + factor.value, 0));
    return {
      score,
      dominant: weighted[0].label,
      factors: weighted.slice(0, 2).map((factor) => ({
        key: factor.key,
        label: factor.label,
        strength: clamp(factor.value * 3.2)
      }))
    };
  }

  function generateGalaxies(genome, attractor, limit) {
    const { genes, metrics, seed } = genome;
    const random = mulberry32(seed ^ 0x7f4a7c15);
    const count = Math.min(limit || genes.haloCount, genes.haloCount);
    const galaxies = [];
    for (let i = 0; i < count; i += 1) {
      const attractorPoint = attractor[Math.floor(random() * attractor.length)];
      const fieldMix = 0.56 + metrics.density * 0.32;
      const scatter = 0.03 + metrics.voidBias * 0.12;
      const x = clamp(lerp(random(), attractorPoint.x, fieldMix) + (random() - 0.5) * scatter, 0.015, 0.985);
      const y = clamp(lerp(random(), attractorPoint.y, fieldMix) + (random() - 0.5) * scatter, 0.02, 0.98);
      const mass = Math.pow(random(), 2.4) * (0.6 + metrics.density * 1.7);
      const spiral = random() < genes.spiralBias;
      const galaxy = {
        id: `G-${String(i + 1).padStart(3, '0')}`,
        x,
        y,
        mass,
        size: 0.45 + mass * 4.8,
        rotation: random() * TAU,
        birth: clamp(0.22 + random() * 0.55 - metrics.density * 0.12),
        temperature: random(),
        type: spiral ? 'SPIRAL' : (mass > 0.72 ? 'ELLIPTICAL' : 'DWARF'),
        arms: spiral ? 2 + Math.floor(random() * 3) : 0,
        coreSize: 0.12 + random() * 0.3,
        armPitch: 0.62 + random() * 1.15,
        ellipticity: 0.48 + random() * 0.46,
        clumpiness: random(),
        dustBias: random(),
        mergerScars: random(),
        satelliteCount: Math.floor(Math.pow(random(), 1.7) * (3 + mass * 6))
      };
      galaxies.push(galaxy);
    }
    const ringCount = annularTargetCount(genome, galaxies.length);
    const annularIds = new Set(galaxies
      .map((galaxy) => ({ id: galaxy.id, score: ringCandidateScore(genome, galaxy) }))
      .sort((a, b) => b.score - a.score || a.id.localeCompare(b.id))
      .slice(0, ringCount)
      .map((candidate) => candidate.id));
    galaxies.forEach((galaxy) => {
      const initialHalo = deriveHaloProxy(genome, galaxy);
      galaxy.morphology = annularIds.has(galaxy.id)
        ? deriveAnnularMorphology(genome, galaxy, initialHalo)
        : deriveLegacyMorphology(galaxy);
      galaxy.haloProxy = finalizeHaloProxy(galaxy, galaxy.morphology, initialHalo);
      const tension = galaxyFormationTension(genome, galaxy);
      galaxy.formationTension = tension.score;
      galaxy.tensionDominant = tension.dominant;
      galaxy.tensionFactors = tension.factors;
    });
    const ranked = galaxies.slice().sort((a, b) => b.formationTension - a.formationTension);
    ranked.forEach((galaxy, rank) => {
      galaxy.tensionRank = rank;
    });
    return galaxies.sort((a, b) => a.birth - b.birth);
  }

  function makeUniverse(strands, id, options = {}) {
    const genome = analyzeStrands(strands, options);
    const attractor = generateAttractor(genome, options.attractorCount || 960);
    const galaxies = generateGalaxies(genome, attractor, options.galaxyLimit);
    return {
      schema: 'butterfly-fx/universe@1',
      id,
      name: options.name || `Universe ${genome.seedHex.slice(0, 4)}`,
      createdAt: options.createdAt || new Date().toISOString(),
      parentId: options.parentId || null,
      perturbation: options.perturbation || 0,
      strands: strands.map((strand) => ({
        role: strand.role || 'AUTO',
        operation: strand.operation || 'ADD',
        points: (strand.points || strand).map((point) => ({
          x: point.x,
          y: point.y,
          cx: point.cx,
          cy: point.cy,
          time: point.time
        }))
      })),
      genome,
      attractor,
      galaxies
    };
  }

  function bottleUniverse(universe) {
    return {
      schema: universe.schema,
      id: universe.id,
      name: universe.name,
      createdAt: universe.createdAt,
      parentId: universe.parentId,
      perturbation: universe.perturbation,
      seed: universe.genome.seedHex,
      metrics: universe.genome.metrics,
      genes: universe.genome.genes,
      strands: universe.strands,
      modelNotice: 'Physics-inspired generative analogy. This is not an N-body or hydrodynamic cosmology simulation.'
    };
  }

  function divergenceScore(base, twin, age) {
    const seedDistance = ((base.genome.seed ^ twin.genome.seed) >>> 0) / 0xffffffff;
    const geneDistance = Math.abs(base.genome.genes.filamentGain - twin.genome.genes.filamentGain)
      + Math.abs(base.genome.metrics.turbulence - twin.genome.metrics.turbulence);
    return clamp((0.04 + seedDistance * 0.34 + geneDistance) * (Math.exp(clamp(age) * 3.6) - 1) / 5.8);
  }

  return Object.freeze({
    TAU,
    PHI,
    GOLDEN_ANGLE,
    clamp,
    lerp,
    fnv1a,
    mulberry32,
    screenToComplex,
    complexToScreen,
    screenToCosmicField,
    cosmicFieldToScreen,
    cosmicFitSpan,
    clampCosmicView,
    zoomCosmicView,
    mandelbrotSample,
    resampleStroke,
    makeReciprocalStrands,
    analyzeStrands,
    generateAttractor,
    generateGalaxies,
    galaxyFormationTension,
    isAnnularGalaxy,
    makeUniverse,
    bottleUniverse,
    divergenceScore
  });
}));
