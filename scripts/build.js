// Publish only the PWA. Historical backups and prototypes never enter dist.
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const output = path.join(root, 'dist');
if (fs.existsSync(output) && fs.lstatSync(output).isSymbolicLink()) throw Error('dist cannot be a symlink');
// This directory is generated exclusively by this script.
fs.rmSync(output, { recursive: true, force: true });
fs.cpSync(path.join(root, 'public'), output, {
  recursive: true,
  filter: file => !/^demo-.*\.html$/.test(path.basename(file)) && !fs.lstatSync(file).isSymbolicLink()
});
console.log('PWA verificada e copiada para dist/.');
