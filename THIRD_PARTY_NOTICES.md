# Third-party notices

Butterfly FX — Universe Loom is original MIT-licensed application code built with the following open-source projects.

## Direct runtime dependency

### p5.js 1.11.13

- Copyright: the Processing Foundation and p5.js contributors
- License: GNU Lesser General Public License 2.1
- Project: <https://github.com/processing/p5.js>
- Exact upstream source: <https://github.com/processing/p5.js/tree/v1.11.13>
- Local license copy: [`LICENSES/p5-LGPL-2.1.txt`](LICENSES/p5-LGPL-2.1.txt)

The build copies the unmodified upstream `p5.min.js` distribution into `src/vendor/` so the desktop and GitHub Pages editions work offline and without a CDN. The corresponding p5.js source remains available from the upstream project above under LGPL-2.1.

## Desktop and build toolchain

### Electron 43.4.0

- Copyright: Electron contributors
- License: MIT
- Project: <https://github.com/electron/electron>
- Local license copy: [`LICENSES/electron-MIT.txt`](LICENSES/electron-MIT.txt)

Electron distributions also carry Chromium and other component notices in their generated `LICENSES.chromium.html` file.

### electron-builder 26.15.3

- Copyright: Loopline Systems and electron-builder contributors
- License: MIT
- Project: <https://github.com/electron-userland/electron-builder>
- Local license copy: [`LICENSES/electron-builder-MIT.txt`](LICENSES/electron-builder-MIT.txt)

## No endorsement

The upstream projects and their contributors do not endorse Butterfly FX — Universe Loom or its scientific/artistic model.

Transitive development dependencies are recorded exactly in `package-lock.json`; their package metadata and license files remain available through npm.
