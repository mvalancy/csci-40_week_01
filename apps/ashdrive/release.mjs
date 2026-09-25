// Export only this game. The ownership manifest removes obsolete exported files
// while preserving the standalone checkout's .git, dependencies, and local files.
import { mkdir, readFile, readdir, writeFile, realpath, lstat, unlink } from 'node:fs/promises';
import { resolve, dirname, relative, isAbsolute } from 'node:path';
import { fileURLToPath } from 'node:url';
const source = await realpath(dirname(fileURLToPath(import.meta.url)));
const workspace = resolve(source, '../..');
const requestedOutput = resolve(process.argv[2] || '/tmp/ashdrive-release');
if (requestedOutput === workspace || requestedOutput.startsWith(workspace + '/') || source.startsWith(requestedOutput + '/')) throw new Error('Export outside the lab workspace.');
await mkdir(requestedOutput, { recursive: true });
const output = await realpath(requestedOutput);
if (output === workspace || output.startsWith(workspace + '/') || source.startsWith(output + '/') || output === '/') throw new Error('Export to a separate directory outside the lab workspace.');
const marker = '.ashdrive-release';
let previous = [];
const contents = await readdir(output);
if (contents.length && !contents.includes(marker)) throw new Error('Refusing to overwrite an unrelated directory.');
if (contents.includes(marker)) {
  if ((await lstat(resolve(output, marker))).isSymbolicLink()) throw new Error('Release ownership marker cannot be a symlink.');
  const old = await readFile(resolve(output, marker), 'utf8');
  if (old.startsWith('{')) {
    const manifest = JSON.parse(old);
    if (manifest.kind !== 'ashdrive-release' || !Array.isArray(manifest.files)) throw new Error('Invalid release ownership manifest.');
    previous = manifest.files;
  } else if (!old.startsWith('Generated from apps/ashdrive by release.mjs')) throw new Error('Unrecognized release marker.');
}
const excluded = new Set(['release.mjs', 'standalone.vite.config.js', 'dist', 'node_modules', 'test-results', 'playwright-report', 'qa']);
const files = new Map();
async function collect(directory, prefix = '') {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    if (excluded.has(entry.name) || entry.name.endsWith('.spec.js') || entry.name.startsWith('.')) continue;
    const path = prefix + entry.name;
    if (entry.isDirectory()) await collect(resolve(directory, entry.name), path + '/');
    else if (entry.isFile()) files.set(path, await readFile(resolve(directory, entry.name)));
    else throw new Error(`Unsupported source entry: ${path}`);
  }
}
await collect(source);
const html = files.get('index.html').toString().replace('<a href="/">↖ APP LAB</a>', '<a href="https://github.com/mvalancy/csci-40_week_01_ashdrive">↗ SOURCE / MIT</a>');
files.set('index.html', html);
const three = JSON.parse(await readFile(resolve(workspace, 'node_modules/three/package.json'), 'utf8'));
const vite = JSON.parse(await readFile(resolve(workspace, 'node_modules/vite/package.json'), 'utf8'));
files.set('package.json', JSON.stringify({
  name: 'ashdrive', version: '1.0.0', private: true, type: 'module',
  description: 'Shadow Sector: armored motorcycle combat and data retrieval in a hostile industrial city.',
  license: 'MIT', author: 'mvalancy',
  repository: { type: 'git', url: 'https://github.com/mvalancy/csci-40_week_01_ashdrive.git' },
  scripts: { dev: 'vite --host 0.0.0.0', build: 'vite build', preview: 'vite preview --host 0.0.0.0', 'test:unit': 'node --test tests/*.test.js', test: 'npm run test:unit' },
  engines: { node: '>=22.12.0' }, dependencies: { three: three.version }, devDependencies: { vite: vite.version },
}, null, 2) + '\n');
files.set('vite.config.js', "import { defineConfig } from 'vite';\nexport default defineConfig({ base: './' });\n");
files.set('wrangler.toml', 'name = "csci-40-week-01-ashdrive"\npages_build_output_dir = "./dist"\n');
files.set('.gitignore', 'node_modules/\ndist/\n.wrangler/\n.env*\n*.log\n.ashdrive-release\n');
files.set('.node-version', '22\n');
files.set('.github/workflows/build.yml', `name: Test and build static game
on: [push, pull_request]
jobs:
  build:
    runs-on: ubuntu-latest
    permissions:
      contents: read
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '22'
          cache: npm
      - run: npm ci
      - run: npm run test:unit
      - run: npm run build
`);
function safePath(name) {
  if (typeof name !== 'string' || isAbsolute(name) || name.split('/').some(part => part === '..' || !part) || ['.git', 'node_modules', '.env'].includes(name.split('/')[0])) throw new Error('Unsafe path in ownership manifest.');
  const destination = resolve(output, name);
  if (relative(output, destination).startsWith('..')) throw new Error('Invalid output path.');
  return destination;
}
async function assertNoSymlink(destination) {
  let current = destination;
  while (current !== output) {
    try { if ((await lstat(current)).isSymbolicLink()) throw new Error(`Refusing release symlink: ${current}`); }
    catch (error) { if (error.code !== 'ENOENT') throw error; }
    current = dirname(current);
  }
}
// Validate every destination before changing source files in the release tree.
for (const name of new Set([...previous, ...files.keys()])) await assertNoSymlink(safePath(name));
let removed = 0;
for (const name of previous) if (!files.has(name)) {
  try { await unlink(safePath(name)); removed++; } catch (error) { if (error.code !== 'ENOENT') throw error; }
}
for (const [name, content] of files) { const destination = safePath(name); await mkdir(dirname(destination), { recursive: true }); await writeFile(destination, content); }
await writeFile(resolve(output, marker), JSON.stringify({ kind: 'ashdrive-release', files: [...files.keys()].sort() }, null, 2) + '\n');
console.log(`Exported ${files.size} files to ${output}; removed ${removed} obsolete exported files. Run npm install, npm run test:unit, and npm run build there.`);
