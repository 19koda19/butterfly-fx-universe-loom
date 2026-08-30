'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const Cosmo = require('../src/simulation.js');

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

test('stroke resampling preserves endpoints and requested count', () => {
  const points = makeStrand().points.slice(0, 8);
  const resampled = Cosmo.resampleStroke(points, 64);
  assert.equal(resampled.length, 64);
  assert.equal(resampled[0].cx, points[0].cx);
  assert.equal(resampled.at(-1).cx, points.at(-1).cx);
  assert.equal(resampled.at(-1).cy, points.at(-1).cy);
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
