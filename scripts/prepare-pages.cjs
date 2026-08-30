'use strict';

const fs = require('node:fs');
const path = require('node:path');

const projectRoot = path.join(__dirname, '..');
const source = path.join(projectRoot, 'src');
const output = path.join(projectRoot, 'dist-pages');

fs.rmSync(output, { recursive: true, force: true });
fs.mkdirSync(output, { recursive: true });
fs.cpSync(source, output, { recursive: true });
fs.copyFileSync(path.join(projectRoot, 'LICENSE'), path.join(output, 'LICENSE.txt'));
fs.copyFileSync(path.join(projectRoot, 'THIRD_PARTY_NOTICES.md'), path.join(output, 'THIRD_PARTY_NOTICES.md'));
fs.writeFileSync(path.join(output, '.nojekyll'), '');

console.log(`Prepared static edition -> ${path.relative(process.cwd(), output)}`);
