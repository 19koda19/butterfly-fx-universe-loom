# Butterfly FX — Universe Loom

Draw a boundary. Disturb a field. Grow a cosmos.

Universe Loom is a GPU-accelerated Electron + p5.js instrument that turns paths across the Mandelbrot set into deterministic, replayable universes. A stroke becomes a fractal genome; the genome drives a strange attractor; the attractor phases a dark-matter-like field; model time lets filaments, halo proxies, and galaxies emerge.

The same app runs as a static browser edition for GitHub Pages.

## What is inside

- A live Mandelbrot fragment shader with pointer-anchored zoom, pan, orbit probing, adjustable iteration depth, and paths stored in complex coordinates.
- `Branch`: one line creates one universe.
- `Weave`: multiple role-aware strands interfere as one genome.
- Deterministic Lorenz, Rössler, and Clifford attractor regimes.
- A GPU density field that grows from perturbations into voids, iso-density “bubble” contours, filaments, halos, gas, and luminous galaxy proxies.
- A persistent, cursor-anchored universe camera with smooth pan and `1×–128×` magnification. The shader reevaluates world-space structure at every scale, progressively resolving sub-filaments, halo knots, galaxy morphology, stellar clusters, and satellites instead of enlarging cached pixels.
- A Butterfly Twin laboratory: offset one path sample by `ε = 10⁻⁸`, preserve a chosen fraction of shared large-scale phases, and watch structure diverge.
- Classical phase correlation as an explicitly labeled “entanglement” analogy.
- A violet → cyan → amber → white order/“negentropy” proxy. It measures organization inside this model, not negative thermodynamic entropy.
- An optional magenta `Formation Tension` diagnostic that calls out galaxy proxies whose mass, birth time, spiral order, turbulence, spin, or thermal state strain the toy model’s own causal mapping. It is not a real-world impossibility score.
- `Both`, `Mandelbrot`, and `Universe` compositions plus a fullscreen Autogen screensaver that continually draws, births, evolves, and archives new worlds. Its default dual-pane choreography dives into a contributing Mandelbrot sample and an unusual galaxy about every five seconds, then reframes both.
- Model-time playback, layer controls, archive cards, PNG capture, and portable JSON genome bottles.
- Live WebGL/Electron diagnostics, context-loss handling, and a usable CPU Safe Preview when WebGL is unavailable.
- An in-app science manual that distinguishes measured mathematics, invented mappings, physics-inspired approximations, emergent output, and the boundary of the claim.

## The causal bridge

```text
drawn path
  → Mandelbrot escape-time spectrum
  → strange-attractor trajectory
  → correlated procedural phases
  → dark-field density + potential contours
  → sheets / filaments / halo proxies
  → luminous galaxy proxies
```

| Sampled path signal | Loom channel | Model consequence |
| --- | --- | --- |
| Smooth escape time + interior occupancy | Density | Matter concentration and halo abundance |
| Escape-signal variance + roughness | Turbulence | Filament wrinkling and feedback |
| Boundary crossing rate + entropy | Peak seeds | Number and spacing of collapsed knots |
| Curvature + winding | Spin | Angular flow and spiral tendency |
| Exterior occupancy + orbit-trap distance | Void bias | Basin width and effective expansion |

Explicit strand roles add a small, visible bias to the corresponding measured channel; `AUTO` remains entirely path-derived.

## Scientific reality check

This is a deterministic generative analogy, not a cosmological theory or precision simulation.

- A Mandelbrot pixel is a complex parameter `c`, not a point in spacetime.
- Parameter sensitivity at the Mandelbrot boundary is not itself the atmospheric butterfly effect. The inserted strange-attractor twin is the app’s sensitive-dependence layer.
- Real dark matter is not known to consist of bubbles. The bubble layer shows equal-density/equal-potential contours.
- The field borrows the visual logic of early gravitational collapse and the Zel’dovich approximation, but it is not a 3D N-body solver.
- Real galaxy formation requires gas hydrodynamics, cooling, star formation, feedback, mergers, chemistry, and black holes. Galaxies here are stylized summaries of collapsed regions.
- Phase Link creates ordinary classical correlation. It is not quantum entanglement.
- The order scale is not a thermodynamic entropy ledger.

The useful shared ideas are real: simple nonlinear rules create multiscale structure; nearby initial conditions can diverge; hidden fields can organize visible matter; and large-scale form can emerge without every object being placed by hand.

Conceptual anchors include [Lorenz’s deterministic nonperiodic flow](https://doi.org/10.1175/1520-0469%281963%29020%3C0130%3ADNF%3E2.0.CO%3B2), [Planck 2018 cosmological parameters](https://www.aanda.org/articles/aa/abs/2020/09/aa33910-18/aa33910-18.html), [ESA’s overview of primordial fluctuations](https://www.esa.int/Science_Exploration/Space_Science/Planck/The_cosmic_microwave_background_and_inflation), and [NASA’s cosmic-web overview](https://science.nasa.gov/mission/hubble/science/science-highlights/mapping-the-cosmic-web/).

## Run the desktop app

Requirements: Node.js 22.12+ and a graphics driver with WebGL support.

```bash
npm install
npm start
```

Electron hardware acceleration is enabled by default. Universe Loom requests WebGL2 and executes the Mandelbrot and density calculations in fragment shaders. Click the persistent `GPU · WEBGL2 · FPS` instrument to see the active adapter, renderer, Chromium feature status, texture limits, and shader path.

## Run the browser edition

```bash
npm install
npm run web
```

Open <http://127.0.0.1:4173>. The browser edition keeps creation, comparison, fullscreen Autogen, JSON, and PNG features; it replaces Electron save dialogs with normal downloads.

## Controls

| Input | Action |
| --- | --- |
| Drag on Mandelbrot | Draw a causal strand |
| Mouse wheel over Mandelbrot | Zoom parameter space at the pointer |
| Mouse wheel over universe | Smoothly magnify world-space structure at the pointer |
| Drag on universe | Pan the generated field |
| Double-click universe | Dive four times deeper at the pointer |
| `D` / `H` / `P` | Draw / pan / probe |
| `N` | Start a clean genome |
| `Enter` | Ignite a woven bundle |
| `B` | Fork a Butterfly Twin |
| `F` | Restore the Mandelbrot frame |
| `+` / `−` / `0` | Dive / retreat / frame the universe camera |
| `Space` | Play or pause model time |
| `Ctrl/Cmd + Z` | Remove the latest unignited strand |
| `Escape` | Leave Autogen/fullscreen or close a dialog |

The top-right `VIEW` control cycles between the relational split view, a full Mandelbrot source, and a full universe. `AUTOGEN ⛶` opens the configurable screensaver. `INSPECT ODD GALAXY` targets the selected universe’s highest internal Formation Tension score and opens it at galaxy scale.

## Test and package

```bash
npm run check
npm run smoke      # headless Electron/WebGL integration smoke
npm run build      # unpacked desktop build
npm run dist       # platform installer/image
npm run pages:prepare
```

The deterministic tests cover Mandelbrot and cosmic-camera coordinate transforms, cursor anchoring and camera bounds, arc-length resampling, genome/galaxy reproducibility, formation-tension metadata, epsilon twins, Mandelbrot interior/exterior classification, and portable serialization. The Electron smoke harness additionally checks GPU shader compilation, wheel zoom, pan, reset, per-universe camera memory, dual-pane Autogen choreography, fullscreen behavior, and all three compositions.

## Project layout

```text
electron/              secure main process + narrow preload bridge
src/app.js             p5 interaction, rendering, archive, diagnostics
src/shaders.js         WebGL Mandelbrot and cosmic-field shaders
src/simulation.js      deterministic genome, attractor, galaxy math
src/index.html         accessible instrument UI + science manual
src/styles.css         observatory-style interface system
scripts/               vendor sync, web server, Pages build, smoke test
test/                  deterministic node:test suite
```

## Open source and licenses

Universe Loom is released under the [MIT License](LICENSE).

It uses p5.js under LGPL-2.1 and Electron/electron-builder under MIT. Full acknowledgments and local license copies are in [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md) and [`LICENSES/`](LICENSES/). The p5 browser build is copied unmodified and its license ships beside it.

Contributions, experiments, new attractor voices, and more rigorous physics modes are welcome—provided the interface keeps stating clearly where measurement ends and metaphor begins.
