/**
 * Scan upload/model_3d/*.glb and sync models.json in backend + frontend.
 * Run after adding or replacing GLB files so chainage links stay correct.
 *
 * Usage: npm run sync:models
 */
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const scriptDir = path.dirname(fileURLToPath(import.meta.url))
const backendRoot = path.resolve(scriptDir, '..')
const modelDir = path.join(backendRoot, 'upload', 'model_3d')
const frontendCatalog = path.resolve(
  backendRoot,
  '..',
  '..',
  'Frontend',
  'nhit-frontend',
  'src',
  'components',
  'model',
  'models.json'
)

function extractChainageKey(text) {
  const m = String(text || '').match(/(\d+)\s*\+\s*(\d+)/)
  if (!m) return null
  return `${Number(m[1])}+${Number(m[2])}`
}

function chainageSort(a, b) {
  const parse = (name) => {
    const key = extractChainageKey(name)
    if (!key) return [Number.MAX_SAFE_INTEGER, Number.MAX_SAFE_INTEGER, name.toLowerCase()]
    const [km, m] = key.split('+').map(Number)
    return [km, m, name.toLowerCase()]
  }
  const [ak, am, an] = parse(a)
  const [bk, bm, bn] = parse(b)
  if (ak !== bk) return ak - bk
  if (am !== bm) return am - bm
  return an.localeCompare(bn)
}

function listGlbFiles() {
  if (!fs.existsSync(modelDir)) {
    throw new Error(`Model folder not found: ${modelDir}`)
  }
  return fs
    .readdirSync(modelDir, { withFileTypes: true })
    .filter((d) => d.isFile() && /\.glb(\.glb)?$/i.test(d.name))
    .map((d) => d.name)
    .sort(chainageSort)
}

function writeCatalog(targetPath, models) {
  const payload = { models }
  fs.writeFileSync(targetPath, `${JSON.stringify(payload, null, 2)}\n`, 'utf8')
}

const models = listGlbFiles()
if (models.length === 0) {
  console.warn('[sync:models] No .glb files found in', modelDir)
  process.exit(1)
}

const backendCatalog = path.join(modelDir, 'models.json')
writeCatalog(backendCatalog, models)
writeCatalog(frontendCatalog, models)

console.log(`[sync:models] Synced ${models.length} models:`)
for (const name of models) {
  const key = extractChainageKey(name) || '(no chainage in filename)'
  console.log(`  · ${name} → ${key}`)
}
console.log(`[sync:models] Wrote ${backendCatalog}`)
console.log(`[sync:models] Wrote ${frontendCatalog}`)
