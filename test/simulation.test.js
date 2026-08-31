'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const Cosmo = require('../src/simulation.js');

const ANNULAR_SUBTYPES = new Set([
  'COLLISIONAL_RING',
  'POLAR_RING',
  'RESONANCE_RING',
  'HOAG_LIKE',
  'UNRESOLVED_ANNULUS'
]);

function assertUnitInterval(value, label) {
  assert.ok(Number.isFinite(value), `${label} should be finite`);
  assert.ok(value >= 0 && value <= 1, `${label} should be between zero and one`);
}

function makeStrand(offset = 0) {
  return {
    role: 'AUTO',
    operation: 'ADD',
    points: Array.from({ length: 32 }, (_, index) => {
      const t = index / 31;
      return {
        x: t,
        y: 0.5 + Math.sin(t * Math.PI) * 0.2,
        cx: -1.45 + t * 1.65 + offset,
        cy: -0.22 + Math.sin(t * Math.PI * 2) * 0.32,
        time: index * 16
      };
    })
  };
}

test('screen and complex transforms round-trip at arbitrary zoom', () => {
  const view = { x: -0.743, y: 0.131, scale: 0.082 };
  const aspect = 1.72;
  const complex = Cosmo.screenToComplex(0.27, 0.81, view, aspect);
  const screen = Cosmo.complexToScreen(complex.x, complex.y, view, aspect);
  assert.ok(Math.abs(screen.x - 0.27) < 1e-12);
  assert.ok(Math.abs(screen.y - 0.81) < 1e-12);
});

test('cosmic field transforms round-trip and cursor zoom stays anchored', () => {
  const view = { x: 0.62, y: 0.41, scale: 0.25 };
  [0.55, 1, 2.2].forEach((aspect) => {
    const world = Cosmo.screenToCosmicField(0.21, 0.77, view, aspect);
    const screen = Cosmo.cosmicFieldToScreen(world.x, world.y, view, aspect);
    assert.ok(Math.abs(screen.x - 0.21) < 1e-12);
    assert.ok(Math.abs(screen.y - 0.77) < 1e-12);

    const zoomed = Cosmo.zoomCosmicView(view, 0.21, 0.77, 0.5, aspect);
    const anchored = Cosmo.screenToCosmicField(0.21, 0.77, zoomed, aspect);
    assert.ok(Math.abs(anchored.x - world.x) < 1e-12);
    assert.ok(Math.abs(anchored.y - world.y) < 1e-12);
    assert.equal(zoomed.scale, 0.125);
  });
});

test('cosmic camera remains inside the generated field at extreme zoom', () => {
  [0.55, 1, 2.2].forEach((aspect) => {
    const low = Cosmo.clampCosmicView({ x: -10, y: -12, scale: 1e-9 }, aspect);
    const high = Cosmo.clampCosmicView({ x: 10, y: 12, scale: 1e-9 }, aspect);
    const span = Cosmo.cosmicFitSpan(aspect) / 128;
    const halfX = span * aspect * 0.5;
    const halfY = span * 0.5;
    assert.equal(low.scale, 1 / 128);
    assert.ok(Math.abs(low.x - halfX) < 1e-12);
    assert.ok(Math.abs(low.y - halfY) < 1e-12);
    assert.ok(Math.abs(high.x - (1 - halfX)) < 1e-12);
    assert.ok(Math.abs(high.y - (1 - halfY)) < 1e-12);
  });
});

test('stroke resampling preserves endpoints and requested count', () => {
  const points = makeStrand().points.slice(0, 8);
  const resampled = Cosmo.resampleStroke(points, 64);
  assert.equal(resampled.length, 64);
  assert.equal(resampled[0].cx, points[0].cx);
  assert.equal(resampled.at(-1).cx, points.at(-1).cx);
  assert.equal(resampled.at(-1).cy, points.at(-1).cy);
});

test('reciprocal strands are deterministic, complementary counterfactuals', () => {
  const source = [
    makeStrand(),
    { ...makeStrand(0.07), role: 'DENSITY' }
  ];
  const snapshot = structuredClone(source);
  const first = Cosmo.makeReciprocalStrands(source);
  const second = Cosmo.makeReciprocalStrands(source);

  assert.deepEqual(first, second);
  assert.deepEqual(source, snapshot, 'reciprocal construction must not mutate archived strands');
  assert.equal(first.length, source.length);
  assert.equal(first[0].role, 'AUTO');
  assert.equal(first[1].role, 'VOID');
  first.forEach((strand, strandIndex) => {
    assert.equal(strand.points.length, source[strandIndex].points.length);
    strand.points.forEach((point) => {
      assert.ok(Number.isFinite(point.cx) && Number.isFinite(point.cy));
      assertUnitInterval(point.x, 'reciprocal point.x');
      assertUnitInterval(point.y, 'reciprocal point.y');
    });
  });

  const original = Cosmo.makeUniverse(source, 'U-ORIGINAL', { createdAt: 'fixed' });
  const reciprocal = Cosmo.makeUniverse(first, 'U-RECIPROCAL', { createdAt: 'fixed' });
  assert.notEqual(reciprocal.genome.seedHex, original.genome.seedHex);
  assert.notDeepEqual(reciprocal.genome.metrics, original.genome.metrics,
    'the reciprocal universe should have its own field metrics');
  assert.notDeepEqual(reciprocal.genome.genes, original.genome.genes,
    'the reciprocal universe should have its own cosmological genes');
  assert.notDeepEqual(reciprocal.galaxies, original.galaxies,
    'the reciprocal universe should have its own galaxy population');
  const mutual = Cosmo.makeUniverse([...source, ...first], 'U-MUTUAL', { createdAt: 'fixed' });
  assert.notEqual(mutual.genome.seedHex, original.genome.seedHex);
  assert.notEqual(mutual.genome.seedHex, reciprocal.genome.seedHex);
  assert.notDeepEqual(mutual.genome.metrics, original.genome.metrics,
    'the mutual universe should compile both initial conditions into new field metrics');
  assert.notDeepEqual(mutual.galaxies, original.galaxies,
    'the mutual universe should have its own galaxy population');
});

test('identical paths compile to identical genomes and galaxies', () => {
  const first = Cosmo.makeUniverse([makeStrand()], 'U-A', { createdAt: 'fixed' });
  const second = Cosmo.makeUniverse([makeStrand()], 'U-B', { createdAt: 'fixed' });
  assert.equal(first.genome.seedHex, second.genome.seedHex);
  assert.deepEqual(first.genome.metrics, second.genome.metrics);
  assert.deepEqual(first.genome.genes, second.genome.genes);
  assert.deepEqual(first.galaxies, second.galaxies);
  assert.deepEqual(first.attractor, second.attractor);
});

test('tagged structure streams preserve the legacy base-galaxy PRNG sequence', () => {
  const universe = Cosmo.makeUniverse([makeStrand()], 'U-A', { createdAt: 'fixed' });
  const legacyFields = (id) => {
    const galaxy = universe.galaxies.find((candidate) => candidate.id === id);
    return {
      x: galaxy.x,
      y: galaxy.y,
      mass: galaxy.mass,
      birth: galaxy.birth,
      type: galaxy.type,
      arms: galaxy.arms,
      rotation: galaxy.rotation,
      mergerScars: galaxy.mergerScars,
      satelliteCount: galaxy.satelliteCount
    };
  };
  assert.deepEqual(legacyFields('G-001'), {
    x: 0.8812556156229623,
    y: 0.19852606684679516,
    mass: 0.599052538424718,
    birth: 0.12715301411526167,
    type: 'DWARF',
    arms: 0,
    rotation: 0.5905090492778644,
    mergerScars: 0.12741318927146494,
    satelliteCount: 3
  });
  assert.deepEqual(legacyFields('G-002'), {
    x: 0.418401990184238,
    y: 0.5466973728159011,
    mass: 0.720682361666765,
    birth: 0.3659160889715132,
    type: 'ELLIPTICAL',
    arms: 0,
    rotation: 6.1681411266019746,
    mergerScars: 0.14644554699771106,
    satelliteCount: 4
  });
});

test('galaxies carry deterministic multiscale structure and model-tension diagnostics', () => {
  const universe = Cosmo.makeUniverse([makeStrand()], 'U-A', { createdAt: 'fixed' });
  assert.ok(universe.galaxies.length > 0);
  universe.galaxies.forEach((galaxy) => {
    assert.match(galaxy.id, /^G-\d{3}$/);
    assert.ok(galaxy.formationTension >= 0 && galaxy.formationTension <= 1);
    assert.ok(galaxy.tensionFactors.length === 2);
    assert.equal(typeof galaxy.tensionDominant, 'string');
    assert.ok(galaxy.satelliteCount >= 0);
    assert.ok(galaxy.morphology);
    assert.ok(galaxy.haloProxy);
    [
      'annularity',
      'gapFraction',
      'completeness',
      'coreFraction',
      'axisRatio',
      'secondaryRing',
      'driverStrength'
    ].forEach((field) => assertUnitInterval(galaxy.morphology[field], `morphology.${field}`));
    ['ringRadius', 'ringWidth', 'coreOffsetX', 'coreOffsetY', 'planeAngle'].forEach((field) => {
      assert.ok(Number.isFinite(galaxy.morphology[field]), `morphology.${field} should be finite`);
    });
    assert.ok(galaxy.morphology.planeAngle >= 0 && galaxy.morphology.planeAngle < Cosmo.TAU);
    assert.equal(galaxy.haloProxy.model, 'TOY_HALO_PROXY');
    assert.ok(Number.isFinite(galaxy.haloProxy.radiusScale));
    assert.ok(galaxy.haloProxy.radiusScale > 0);
    ['concentration', 'axisRatio', 'luminousAlignment', 'ringPlaneSupport', 'formationSupport', 'anomalyScore']
      .forEach((field) => assertUnitInterval(galaxy.haloProxy[field], `haloProxy.${field}`));
    ['rotation', 'offsetX', 'offsetY', 'offsetMagnitude'].forEach((field) => {
      assert.ok(Number.isFinite(galaxy.haloProxy[field]), `haloProxy.${field} should be finite`);
    });
    assert.ok(Math.abs(Math.hypot(galaxy.haloProxy.offsetX, galaxy.haloProxy.offsetY)
      - galaxy.haloProxy.offsetMagnitude) < 1e-12);
  });
});

test('canonical universes deterministically devote ten to eighteen percent of galaxies to annular systems', () => {
  const universe = Cosmo.makeUniverse([makeStrand()], 'U-RINGS', { createdAt: 'fixed' });
  const rings = universe.galaxies.filter(Cosmo.isAnnularGalaxy);
  const fraction = rings.length / universe.galaxies.length;
  assert.ok(rings.length > 0);
  assert.ok(fraction >= 0.1 && fraction <= 0.18, `annular fraction was ${fraction}`);
  rings.forEach((galaxy) => {
    assert.ok(ANNULAR_SUBTYPES.has(galaxy.morphology.subtype));
    assert.equal(galaxy.morphology.family, 'ANNULAR');
    assert.ok(galaxy.morphology.ringRadius > 1);
    assert.ok(galaxy.morphology.ringWidth > 0);
    assert.ok(galaxy.morphology.annularity > 0.6);
  });
  universe.galaxies.filter((galaxy) => !Cosmo.isAnnularGalaxy(galaxy)).forEach((galaxy) => {
    assert.equal(galaxy.morphology.family, galaxy.type);
    assert.equal(galaxy.morphology.subtype, galaxy.type);
    assert.equal(galaxy.morphology.annularity, 0);
  });
});

test('annular subtype vocabulary appears across deterministic fractal seeds', () => {
  const observed = new Set();
  for (let index = 0; index < 4; index += 1) {
    const universe = Cosmo.makeUniverse([makeStrand(index * 0.00037)], `U-RING-${index}`, {
      createdAt: 'fixed',
      galaxyLimit: 120
    });
    universe.galaxies.filter(Cosmo.isAnnularGalaxy)
      .forEach((galaxy) => observed.add(galaxy.morphology.subtype));
  }
  assert.deepEqual(observed, ANNULAR_SUBTYPES);
});

test('unsupported annuli accumulate more model tension than otherwise identical supported annuli', () => {
  const universe = Cosmo.makeUniverse([makeStrand()], 'U-RINGS', { createdAt: 'fixed' });
  const ring = universe.galaxies.find(Cosmo.isAnnularGalaxy);
  assert.ok(ring);
  const supported = JSON.parse(JSON.stringify(ring));
  supported.morphology.driverStrength = 1;
  supported.haloProxy.offsetMagnitude = 0;
  supported.haloProxy.ringPlaneSupport = 1;
  supported.haloProxy.concentration = 1;
  supported.mergerScars = 0;
  const unsupported = JSON.parse(JSON.stringify(supported));
  unsupported.morphology.driverStrength = 0;
  unsupported.haloProxy.offsetMagnitude = 0.48;
  unsupported.haloProxy.ringPlaneSupport = 0;
  const supportedTension = Cosmo.galaxyFormationTension(universe.genome, supported);
  const unsupportedTension = Cosmo.galaxyFormationTension(universe.genome, unsupported);
  assert.ok(unsupportedTension.score > supportedTension.score);
  assert.ok(unsupportedTension.factors.some((factor) => factor.key.startsWith('RING') || factor.key === 'HALO_OFFSET'));
});

test('formation tension remains tolerant of legacy galaxies without morphology or halo metadata', () => {
  const universe = Cosmo.makeUniverse([makeStrand()], 'U-LEGACY', { createdAt: 'fixed' });
  const result = Cosmo.galaxyFormationTension(universe.genome, {
    mass: 0.5,
    birth: 0.42,
    temperature: 0.55,
    type: 'SPIRAL',
    arms: 2
  });
  assertUnitInterval(result.score, 'legacy tension score');
  assert.equal(typeof result.dominant, 'string');
  assert.equal(result.factors.length, 2);
});

test('epsilon perturbation creates a deterministic but distinct twin', () => {
  const base = Cosmo.makeUniverse([makeStrand()], 'U-A', { createdAt: 'fixed' });
  const twin = Cosmo.makeUniverse([makeStrand()], 'U-A-prime', {
    createdAt: 'fixed',
    parentId: base.id,
    perturbation: 1e-8
  });
  const twinAgain = Cosmo.makeUniverse([makeStrand()], 'U-A-prime-2', {
    createdAt: 'fixed',
    parentId: base.id,
    perturbation: 1e-8
  });
  assert.notEqual(base.genome.seedHex, twin.genome.seedHex);
  assert.equal(twin.genome.seedHex, twinAgain.genome.seedHex);
  assert.ok(Cosmo.divergenceScore(base, twin, 1) > Cosmo.divergenceScore(base, twin, 0.2));
});

test('Mandelbrot sampler distinguishes stable interior and exterior', () => {
  const interior = Cosmo.mandelbrotSample(0, 0, 120);
  const exterior = Cosmo.mandelbrotSample(1, 1, 120);
  assert.equal(interior.interior, true);
  assert.equal(exterior.interior, false);
  assert.ok(exterior.iteration < 120);
});

test('bottled genomes omit large derived render arrays', () => {
  const universe = Cosmo.makeUniverse([makeStrand()], 'U-A', { createdAt: 'fixed' });
  const bottle = Cosmo.bottleUniverse(universe);
  assert.equal(bottle.seed, universe.genome.seedHex);
  assert.equal(bottle.strands.length, 1);
  assert.equal('galaxies' in bottle, false);
  assert.equal('attractor' in bottle, false);
  assert.match(bottle.modelNotice, /not an N-body/i);
});
