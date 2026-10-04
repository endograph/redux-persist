// Packs redux-persist and checks that every import path resolves in Node
// (require and import), a bundler (esbuild) and TypeScript (node10, node16
// from CJS and ESM, bundler). The paths are every importable file published
// 6.0.0 had (v6-paths.txt), with and without .js and as directory imports,
// plus the v7 short paths. Run after `npm run build`: npm run check:package
import { execFileSync } from 'child_process'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'fs'
import { createRequire } from 'module'
import { tmpdir } from 'os'
import { dirname, join } from 'path'
import { fileURLToPath } from 'url'

const root = join(dirname(fileURLToPath(import.meta.url)), '../..')
const bin = name => join(root, 'node_modules/.bin', name)
const work = mkdtempSync(join(tmpdir(), 'redux-persist-package-'))
const project = join(work, 'project')

// install the packed tarball; peer and type dependencies come from this repo
execFileSync('npm', ['pack', '--ignore-scripts', '--silent', '--pack-destination', work], { cwd: root })
const { version } = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'))
const tarball = join(work, `redux-persist-${version}.tgz`)
mkdirSync(project)
writeFileSync(join(project, 'package.json'), JSON.stringify({ name: 'check', private: true }))
execFileSync('npm', ['install', '--ignore-scripts', '--no-audit', '--no-fund', '--legacy-peer-deps', '--silent', tarball], { cwd: project })
for (const dep of ['redux', 'react', '@types/react']) {
  mkdirSync(dirname(join(project, 'node_modules', dep)), { recursive: true })
  symlinkSync(join(root, 'node_modules', dep), join(project, 'node_modules', dep), 'dir')
}

const specs = new Set(['redux-persist'])
for (const file of readFileSync(join(root, 'scripts/check-package/v6-paths.txt'), 'utf8').trim().split('\n')) {
  if (file === 'integration/react/package.json') { specs.add('redux-persist/integration/react'); continue }
  // the UMD bundles in dist/ were removed in v7
  if (file.startsWith('dist/')) continue
  specs.add(`redux-persist/${file}`)
  specs.add(`redux-persist/${file.replace(/\.js$/, '')}`)
  if (file.endsWith('/index.js')) specs.add(`redux-persist/${file.replace(/\/index\.js$/, '')}`)
}
for (const path of ['storage', 'storage/session', 'storage/createWebStorage', 'react', 'stateReconciler/autoMergeLevel1', 'stateReconciler/autoMergeLevel2', 'stateReconciler/hardSet', 'integration/getStoredStateMigrateV4'])
  specs.add(`redux-persist/${path}`)
const all = [...specs].sort()
const typed = all

const failures = []
const requireFromProject = createRequire(join(project, 'index.js'))
for (const spec of all) {
  try { requireFromProject(spec) } catch (e) { failures.push(`${spec} [node require] ${e.message.split('\n')[0]}`) }
}

// one process importing every path, so each is resolved as ESM from the project
writeFileSync(join(project, 'import-all.mjs'), `
const failed = []
for (const spec of ${JSON.stringify(all)}) {
  try { await import(spec) } catch (e) { failed.push(spec + ' [node import] ' + e.message.split('\\n')[0]) }
}
console.log(JSON.stringify(failed))
`)
failures.push(...JSON.parse(execFileSync(process.execPath, ['import-all.mjs'], { cwd: project }).toString().trim().split('\n').pop()))

// one esbuild run bundling one entry per path
const bundleDir = join(project, 'bundle')
mkdirSync(bundleDir)
all.forEach((spec, i) => writeFileSync(join(bundleDir, `e${i}.js`), `import * as m from ${JSON.stringify(spec)}; console.log(m)`))
try {
  execFileSync(bin('esbuild'), [...all.map((_, i) => join(bundleDir, `e${i}.js`)), '--bundle', '--platform=browser', '--log-level=error', '--external:react', `--outdir=${join(bundleDir, 'out')}`], { cwd: project, stdio: 'pipe' })
} catch (e) {
  const out = e.stderr.toString()
  all.forEach((spec, i) => { if (out.includes(`e${i}.js:`)) failures.push(`${spec} [esbuild]`) })
}

const tsModes = [
  { name: 'ts node10', ext: 'ts', options: { module: 'commonjs', moduleResolution: 'node10' } },
  { name: 'ts node16 cjs', ext: 'cts', options: { module: 'node16', moduleResolution: 'node16' } },
  { name: 'ts node16 esm', ext: 'mts', options: { module: 'node16', moduleResolution: 'node16' } },
  { name: 'ts bundler', ext: 'ts', options: { module: 'esnext', moduleResolution: 'bundler' } },
]
for (const mode of tsModes) {
  const dir = join(project, mode.name.replace(/ /g, '-'))
  mkdirSync(dir)
  typed.forEach((spec, i) => writeFileSync(join(dir, `f${i}.${mode.ext}`), `import * as m from ${JSON.stringify(spec)}\nexport const x = m\n`))
  writeFileSync(join(dir, 'tsconfig.json'), JSON.stringify({
    compilerOptions: { ...mode.options, strict: true, noEmit: true, jsx: 'react-jsx', types: [], ignoreDeprecations: '6.0' },
    include: ['*'],
  }))
  try { execFileSync(bin('tsc'), ['-p', dir], { cwd: project, stdio: 'pipe' }) } catch (e) {
    const out = e.stdout.toString()
    typed.forEach((spec, i) => { if (out.includes(`f${i}.${mode.ext}(`)) failures.push(`${spec} [${mode.name}]`) })
    if (!typed.some((_, i) => out.includes(`f${i}.${mode.ext}(`))) failures.push(`[${mode.name}] ${out.split('\n')[0]}`)
  }
}

// React Server Components resolve the "react-server" condition and must get
// the stub that explains PersistGate/useRehydrated need a Client Component.
writeFileSync(join(project, 'import-react-server.mjs'), `
const failed = []
for (const spec of ['redux-persist/react', 'redux-persist/integration/react']) {
  try {
    const { PersistGate } = await import(spec)
    PersistGate({})
    failed.push(spec + ' [react-server] did not throw')
  } catch (e) {
    if (!/can only be used in a Client Component/.test(e.message)) failed.push(spec + ' [react-server] ' + e.message.split('\\n')[0])
  }
}
console.log(JSON.stringify(failed))
`)
failures.push(...JSON.parse(execFileSync(process.execPath, ['--conditions=react-server', 'import-react-server.mjs'], { cwd: project }).toString().trim().split('\n').pop()))

// The oldest supported React line: Node's ESM loader can't see named exports
// of React's CommonJS build before 16.13, so redux-persist/react has to load
// with it too (the checks above use the repo's current React).
const reactLink = join(project, 'node_modules', 'react')
rmSync(reactLink)
symlinkSync(join(root, 'node_modules', 'react-16'), reactLink, 'dir')
const reactPaths = all.filter(spec => /\/react$|integration\/react(\.js)?$/.test(spec))
for (const spec of reactPaths) {
  try { requireFromProject(spec) } catch (e) { failures.push(`${spec} [react 16.8 require] ${e.message.split('\n')[0]}`) }
}
writeFileSync(join(project, 'import-react16.mjs'), `
const failed = []
for (const spec of ${JSON.stringify(reactPaths)}) {
  try {
    const m = await import(spec)
    if (typeof m.PersistGate !== 'function' || typeof m.useRehydrated !== 'function') throw new Error('missing exports')
  } catch (e) { failed.push(spec + ' [react 16.8 import] ' + e.message.split('\\n')[0]) }
}
console.log(JSON.stringify(failed))
`)
failures.push(...JSON.parse(execFileSync(process.execPath, ['import-react16.mjs'], { cwd: project }).toString().trim().split('\n').pop()))

rmSync(work, { recursive: true, force: true })
console.log(`checked ${all.length} import paths with node require, node import, esbuild and 4 TypeScript resolution modes, the React entry points with React 16.8, and the react-server condition`)
if (failures.length) {
  console.error(`${failures.length} failures:\n  ${failures.join('\n  ')}`)
  process.exit(1)
}
console.log('all resolve')
