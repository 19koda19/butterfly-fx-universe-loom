'use strict';

const fs = require('node:fs');
const path = require('node:path');

const source = require.resolve('p5/lib/p5.min.js');
const destinationDir = path.join(__dirname, '..', 'src', 'vendor');
const destination = path.join(destinationDir, 'p5.min.js');
const licenseDir = path.join(__dirname, '..', 'LICENSES');
const p5Root = path.dirname(require.resolve('p5/package.json'));
const electronRoot = path.dirname(require.resolve('electron/package.json'));
const builderRoot = path.dirname(require.resolve('electron-builder/package.json'));

fs.mkdirSync(destinationDir, { recursive: true });
fs.mkdirSync(licenseDir, { recursive: true });
fs.copyFileSync(source, destination);
fs.copyFileSync(path.join(p5Root, 'license.txt'), path.join(licenseDir, 'p5-LGPL-2.1.txt'));
fs.copyFileSync(path.join(p5Root, 'license.txt'), path.join(destinationDir, 'LICENSE.p5.txt'));
fs.copyFileSync(path.join(electronRoot, 'LICENSE'), path.join(licenseDir, 'electron-MIT.txt'));
fs.copyFileSync(path.join(builderRoot, 'LICENSE'), path.join(licenseDir, 'electron-builder-MIT.txt'));
console.log(`Vendored p5.js -> ${path.relative(process.cwd(), destination)}`);
console.log(`Copied direct-dependency licenses -> ${path.relative(process.cwd(), licenseDir)}`);
