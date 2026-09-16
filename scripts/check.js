const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const vm = require('node:vm');
const root = path.resolve(__dirname, '..');
function files(dir) {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap(e => e.isDirectory() ? files(path.join(dir, e.name)) : [path.join(dir, e.name)]);
}
let errors = 0;
function check(ok, message) { if (!ok) { console.error(message); errors++; } }
const sourceFiles = ['api', 'lib', 'scripts', 'public'].flatMap(d => files(path.join(root, d)));
for (const file of sourceFiles.filter(f => f.endsWith('.js'))) {
  const result = spawnSync(process.execPath, ['--check', file], { encoding: 'utf8' });
  check(result.status === 0, `${path.relative(root, file)}: ${result.stderr}`);
}
const html = fs.readFileSync(path.join(root, 'public/index.html'), 'utf8');
const scripts = [...html.matchAll(/<script\b[^>]*src="([^"]+)"[^>]*>/g)].map(m => m[1]);
try {
  new vm.Script(scripts.map(src => fs.readFileSync(path.join(root, 'public', src.split('?')[0]), 'utf8')).join('\n;\n'));
} catch (error) { check(false, `Script integration: ${error.message}`); }
check(!/<script\b(?![^>]*\bsrc=)[^>]*>\s*\S/i.test(html), 'Inline script violates CSP');
check(!/\son[a-z]+\s*=/i.test(html), 'Inline HTML event handler violates CSP');
for (const match of html.matchAll(/(?:src|href)="([^"#]+)"/g)) {
  const url = match[1];
  if (/^(?:https?:|data:)/.test(url)) continue;
  check(fs.existsSync(path.join(root, 'public', url.split('?')[0])), `Missing asset: ${url}`);
}
const manifest = JSON.parse(fs.readFileSync(path.join(root, 'public/manifest.json')));
for (const icon of manifest.icons) {
  const buffer = fs.readFileSync(path.join(root, 'public', icon.src));
  const actual = `${buffer.readUInt32BE(16)}x${buffer.readUInt32BE(20)}`;
  check(icon.sizes === actual, `Icon ${icon.src}: declared ${icon.sizes}, actual ${actual}`);
  check(buffer.length < 300 * 1024, `Icon too large: ${icon.src}`);
}
const secretPattern = new RegExp('futstats_cron_' + 'secure_secret_token|-----BEGIN (?:RSA |EC )?PRIVATE KEY-----');
for (const file of [...sourceFiles, ...files(path.join(root, 'supabase')), ...files(path.join(root, '.github'))].filter(f => /\.(?:js|ts|html|yml|sql)$/.test(f))) {
  if (file !== __filename) check(!secretPattern.test(fs.readFileSync(file, 'utf8')), `Credential literal found in ${path.relative(root, file)}`);
}
const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json')));
const lock = JSON.parse(fs.readFileSync(path.join(root, 'package-lock.json')));
for (const [name, version] of Object.entries(pkg.dependencies)) {
  check(/^\d+\.\d+\.\d+$/.test(version), `Dependency is not pinned: ${name}`);
  check(lock.packages[''].dependencies[name] === version, `Lock root mismatch: ${name}`);
  check(lock.packages[`node_modules/${name}`].version === version, `Lock version mismatch: ${name}`);
}
if (errors) process.exitCode = 1;
else console.log('Sintaxe, assets, ícones, dependências e verificação de segredos: OK.');
