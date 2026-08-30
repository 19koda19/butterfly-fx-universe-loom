# Butterfly FX — Universe Loom

Draw a boundary. Disturb a field. Grow a cosmos.

Universe Loom is a GPU-accelerated Electron + p5.js instrument that turns paths across a complex-coordinate source plane into deterministic, replayable universes. A stroke becomes a fractal genome; the genome drives a strange attractor; the attractor phases a dark-matter-like field; model time lets filaments, halo proxies, and galaxies emerge.

The same app runs as a static browser edition for GitHub Pages.

## What is inside

- A source microscope that switches between a live Mandelbrot escape map and a progressively accumulated Buddhabrot orbit-density map. Both expose the same complex plane and the same quadratic iteration.
- `Branch`: one line creates one universe.
- `Weave`: multiple role-aware strands interfere as one genome.
- Deterministic Lorenz, Rössler, and Clifford attractor regimes.
- A GPU density field that grows from perturbations into voids, iso-density “bubble” contours, filaments, halos, gas, and luminous galaxy proxies.
- A persistent, cursor-anchored universe camera with smooth pan and `1×–128×` magnification. The shader reevaluates world-space structure at every scale, progressively resolving sub-filaments, halo knots, galaxy morphology, stellar clusters, and satellites instead of enlarging cached pixels.
- A Butterfly Twin laboratory: offset one path sample by `ε = 10⁻⁸`, preserve a chosen fraction of shared large-scale phases, and watch structure diverge.
- Classical phase correlation as an explicitly labeled “entanglement” analogy.
- A violet → cyan → amber → white order/“negentropy” proxy. It measures organization inside this model, not negative thermodynamic entropy.
- Five annular morphology channels—collisional, polar, resonance, Hoag-like, and deliberately unresolved—whose visible rings remain distinct from the model potential behind them.
- An optional magenta `Formation Tension` diagnostic that calls out galaxy proxies whose mass, birth time, ring support, halo alignment, spiral order, turbulence, spin, or thermal state strain the toy model’s own causal mapping. It is not a real-world impossibility score.
- `Both`, `Source`, and `Universe` compositions plus a fullscreen Autogen screensaver that continually draws, births, evolves, and archives new worlds. Its default dual-pane choreography dives into a contributing source coordinate and an unusual galaxy about every five seconds, then reframes both. Mandelbrot remains the default microscope and its tour favors long-escape, high-contrast boundary points; an explicitly selected Buddhabrot remains selected instead.
- Model-time playback, layer controls, archive cards, PNG capture, and portable JSON genome bottles.
- Live WebGL/Electron diagnostics, context-loss handling, and a usable CPU Safe Preview when WebGL is unavailable.
- An in-app science manual that distinguishes measured mathematics, invented mappings, physics-inspired approximations, emergent output, and the boundary of the claim.

## Two source microscopes, one equation

The `MANDELBROT / BUDDHABROT` switch changes how the source plane is seen, not the underlying dynamical system. Both begin with `z₀ = 0` and iterate

```text
zₙ₊₁ = zₙ² + c
```

- **Mandelbrot** assigns each starting parameter `c` a color from whether and how its orbit escapes. It is immediate, stable, and useful for tracing the familiar boundary.
- **Buddhabrot** keeps only sampled values of `c` whose orbits escape, then counts where their intermediate `z` values travel. It is an escaped-orbit traffic-density image of the same iteration—not a second fractal law.

The Buddhabrot view streams deterministic orbit batches into an additive WebGL2 accumulation target and tone-maps the growing density on the GPU. It therefore begins sparse and noisy, then progressively resolves structure while it remains open. Its finite sample count, iteration ceiling, accumulation texture, and floating-point precision all affect the image. It is an estimator, not an exact probability field. If the required WebGL2 path is unavailable, the app keeps the Mandelbrot source active.

Drawing, panning, zooming, probing, and Autogen use the same complex-coordinate camera in either view. Switching microscopes does not rewrite an existing strand or make the Buddhabrot picture a new causal variable; it changes the evidence visible while choosing the same `c` coordinates.

There is one deliberate coordinate convention to keep visible: a Mandelbrot pixel describes a starting parameter `c`, while a Buddhabrot pixel describes a position visited by escaped `z` orbits. The drawing overlay treats the shared numeric coordinate as `c` for genome compilation in both modes. The backdrop changes; the deterministic input contract does not.

The Buddhabrot rendering method was developed by Melinda Green in 1993. See [Melinda Green’s original Buddhabrot page](https://superliminal.com/fractals/bbrot/) for the technique and its history.

## Ring morphology channels

The generator gives some collapsed galaxy proxies annular structure through five intentionally different channels. These are procedural hypotheses, not classifications inferred from telescope data.

| Channel | Visual history encoded by the toy model | Dark-matter relationship |
| --- | --- | --- |
| `COLLISIONAL RING` | A nearly head-on impact launches an outward density wave; impact offset controls asymmetry, displaced cores, arcs, spokes, and clumpy star formation. | The halo shapes the gravitational response and may remain nearer the displaced nucleus than the bright ring. The ring itself is stars and gas. |
| `POLAR RING` | An accreted or misaligned component orbits in a plane strongly tilted from the host galaxy. | Motion in two near-perpendicular planes can constrain the three-dimensional potential, so this is the channel most directly useful for exploring halo axis ratio, orientation, and radial twist. |
| `RESONANCE RING` | A rotating bar organizes gas and stars around orbit families; outer rings may align parallel or perpendicular to the bar. | The halo contributes to the rotation curve and bar evolution, but the bar-driven orbital response is the immediate ring mechanism. |
| `HOAG-LIKE RING` | An old round core, a detached young annulus, and a large gap preserve several competing ancient accretion or internal histories. | The peculiar appearance is not evidence that dark matter itself formed a luminous hoop; the historical driver remains observationally unsettled. |
| `UNRESOLVED ANNULUS` | A ring is generated without one dominant driver winning the model’s evidence test. | This is explicit ambiguity, not a claim of new physics. |

At galaxy scale, amber, white, and young blue luminous marks represent baryonic proxies—stars, glowing gas, dust lanes, and star-forming knots. Thin **cyan** ellipses behind them represent a stylized total-mass potential, including a dark-matter-like contribution; they are not a direct dark-matter image or a solved halo reconstruction. **Magenta** markers show `Formation Tension`: poor internal agreement between the visible morphology and the toy formation channels. High tension means “this model does not select a clean history,” never “this object violates physics.”

Scientific anchors for these distinctions include the expanding rings of the [Cartwheel](https://science.nasa.gov/missions/webb/webb-captures-stellar-gymnastics-in-the-cartwheel-galaxy/), the nine observed rings and analytic radius ratios of the [Bullseye collisional system](https://doi.org/10.3847/2041-8213/ad9f5c), [barred-galaxy resonance-ring dynamics](https://academic.oup.com/mnras/article/298/1/78/976435), [polar-ring constraints on halo shape](https://arxiv.org/abs/astro-ph/9406015) and their [model-dependent limitations](https://academic.oup.com/mnras/article/441/3/2650/1117417), and competing studies of [Hoag’s Object](https://academic.oup.com/mnras/article/418/3/1834/1063423) and its [extended, regular H I ring](https://academic.oup.com/mnras/article/435/1/475/1126557). An [Einstein ring](https://www.esa.int/ESA_Multimedia/Images/2025/02/Einstein_ring_explained) is excluded from these channels: it is a gravitationally lensed image of a background source, not a material ring formed around the foreground galaxy.

## The causal bridge

```text
drawn path
  → complex coordinates seen through Mandelbrot or Buddhabrot
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
- Mandelbrot and Buddhabrot are two renderings of `zₙ₊₁ = zₙ² + c`; neither is a physical map of the early universe. The progressively sampled Buddhabrot is not unique at finite sample count.
- Parameter sensitivity at the Mandelbrot boundary is not itself the atmospheric butterfly effect. The inserted strange-attractor twin is the app’s sensitive-dependence layer.
- Real dark matter is not known to consist of bubbles. The bubble layer shows equal-density/equal-potential contours.
- A cyan halo contour is a toy total-mass potential. It is not an observation of dark matter, and a luminous ring is made of baryonic proxies rather than dark matter particles.
- The field borrows the visual logic of early gravitational collapse and the Zel’dovich approximation, but it is not a 3D N-body solver.
- Real galaxy and ring formation requires orbital kinematics, gas hydrodynamics, cooling, star formation, feedback, mergers, chemistry, black holes, and environmental history. Galaxies here are stylized summaries of collapsed regions; the five ring channels do not calculate those processes.
- Formation Tension compares internally generated cues. It is neither an observational anomaly statistic nor evidence for exotic dark matter.
- Material ring galaxies and Einstein rings may look similar in an image but are different phenomena: the latter is a lensing projection of a more distant source.
- Phase Link creates ordinary classical correlation. It is not quantum entanglement.
- The order scale is not a thermodynamic entropy ledger.

The useful shared ideas are real: simple nonlinear rules create multiscale structure; nearby initial conditions can diverge; hidden fields can organize visible matter; and large-scale form can emerge without every object being placed by hand.

### Deterministic does not mean cryptographic or reversible

The app is unsuitable as a cipher, password hash, key-derivation function, or secure random generator. Its FNV-1a seed hash and Mulberry32 procedural streams are intentionally fast and repeatable, not collision-resistant or unpredictable.

Several transformations are many-to-one: the input line is arc-length-resampled; hundreds of orbit observations are reduced to summary metrics; values are quantized, clamped, hashed, and mapped into a finite galaxy population; GPU images are tone-mapped into display colors. The exported JSON keeps the stored resampled strand so that the app can replay it, but neither the seed nor the rendered universe uniquely recovers the original pointer motion. Use a standard audited cryptographic library for security work.

Conceptual anchors include [Lorenz’s deterministic nonperiodic flow](https://doi.org/10.1175/1520-0469%281963%29020%3C0130%3ADNF%3E2.0.CO%3B2), [Planck 2018 cosmological parameters](https://www.aanda.org/articles/aa/abs/2020/09/aa33910-18/aa33910-18.html), [ESA’s overview of primordial fluctuations](https://www.esa.int/Science_Exploration/Space_Science/Planck/The_cosmic_microwave_background_and_inflation), and [NASA’s cosmic-web overview](https://science.nasa.gov/mission/hubble/science/science-highlights/mapping-the-cosmic-web/).

## Run the desktop app

Requirements: Node.js 22.12+ and a graphics driver with WebGL support.

```bash
npm install
npm start
```

Electron hardware acceleration is enabled by default. Universe Loom requests WebGL2, executes the Mandelbrot and cosmic-density calculations in fragment shaders, and uses an additive GPU target for progressive Buddhabrot orbit accumulation and display. Click the persistent `GPU · WEBGL2 · FPS` instrument to see the active adapter, renderer, Chromium feature status, texture limits, and shader path.

## Run the browser edition

```bash
npm install
npm run web
```

Open <http://127.0.0.1:4173>. The browser edition keeps creation, comparison, fullscreen Autogen, JSON, and PNG features; it replaces Electron save dialogs with normal downloads.

## Controls

| Input | Action |
| --- | --- |
| `MANDELBROT / BUDDHABROT` | Switch the source microscope without changing stored complex-coordinate strands |
| Drag on either source view | Draw a causal strand |
| Mouse wheel over either source view | Zoom parameter space at the pointer |
| Mouse wheel over universe | Smoothly magnify world-space structure at the pointer |
| Drag on universe | Pan the generated field |
| Double-click universe | Dive four times deeper at the pointer |
| `D` / `H` / `P` | Draw / pan / probe |
| `N` | Start a clean genome |
| `Enter` | Ignite a woven bundle |
| `B` | Fork a Butterfly Twin |
| `F` | Restore the active source frame |
| `+` / `−` / `0` | Dive / retreat / frame the universe camera |
| `Space` | Play or pause model time |
| `Ctrl/Cmd + Z` | Remove the latest unignited strand |
| `Escape` | Leave Autogen/fullscreen or close a dialog |

The top-right `VIEW` control cycles between the relational split view, a full source microscope, and a full universe. `AUTOGEN ⛶` opens the configurable screensaver. `MODEL POTENTIAL` toggles the thin cyan toy-potential contours. `FORMATION TENSION` toggles the magenta diagnostic, while `INSPECT STRANGE RING` targets the selected universe’s highest-tension annular system and opens it at galaxy scale.

## Test and package

```bash
npm run check
npm run smoke      # headless Electron/WebGL integration smoke
npm run build      # unpacked desktop build
npm run dist       # platform installer/image
npm run pages:prepare
```

The deterministic tests cover Mandelbrot and cosmic-camera coordinate transforms, cursor anchoring and camera bounds, arc-length resampling, genome/galaxy reproducibility, five-channel annular morphology, halo-support metadata, formation-tension behavior, epsilon twins, Mandelbrot interior/exterior classification, and portable serialization. The Electron smoke harness additionally checks GPU shader compilation, wheel zoom, pan, reset, per-universe camera memory, dual-pane Autogen choreography, fullscreen behavior, and all three compositions.

## Project layout

```text
electron/              secure main process + narrow preload bridge
src/app.js             p5 interaction, rendering, archive, diagnostics
src/buddhabrot.js      progressive WebGL2 escaped-orbit accumulation
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
