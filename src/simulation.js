(function bootstrapCosmoMath(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.CosmoMath = api;
}(typeof window !== 'undefined' ? window : globalThis, function createCosmoMath() {
  'use strict';

  const TAU = Math.PI * 2;

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
      galaxies.push({
        x,
        y,
        mass,
        size: 0.45 + mass * 4.8,
        rotation: random() * TAU,
        birth: clamp(0.22 + random() * 0.55 - metrics.density * 0.12),
        temperature: random(),
        type: spiral ? 'SPIRAL' : (mass > 0.72 ? 'ELLIPTICAL' : 'DWARF'),
        arms: spiral ? 2 + Math.floor(random() * 3) : 0
      });
    }
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
    clamp,
    lerp,
    fnv1a,
    mulberry32,
    screenToComplex,
    complexToScreen,
    mandelbrotSample,
    resampleStroke,
    analyzeStrands,
    generateAttractor,
    generateGalaxies,
    makeUniverse,
    bottleUniverse,
    divergenceScore
  });
}));
