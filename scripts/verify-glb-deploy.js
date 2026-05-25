/**
 * Fail deploy/start when catalog GLBs are missing or still Git LFS pointers.
 * Skipped when NODE_ENV is not production (local dev without LFS is OK).
 */
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const GLB_MAGIC = 0x46546c67
const MIN_BYTES = 1_000_000
const rootDir = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')
const modelDir = path.join(rootDir, 'upload', 'model_3d')

function normalizeName(entry) {
  const s = String(entry || '').trim()
  if (!s) return ''
  return /\.glb$/i.test(s) ? s : `${s}.glb`
}

function isValidGlb(filePath) {
  const stat = fs.statSync(filePath)
  if (!stat.isFile() || stat.size < 12) return { ok: false, reason: `size ${stat.size}` }
  if (stat.size < MIN_BYTES) {
    const head = fs.readFileSync(filePath, { encoding: 'utf8', flag: 'r' }).slice(0, 40)
    if (head.startsWith('version https://git-lfs.github.com/spec/v1')) {
      return { ok: false, reason: 'git-lfs-pointer' }
    }
    return { ok: false, reason: `too small (${stat.size} bytes)` }
  }
  const fd = fs.openSync(filePath, 'r')
  const buf = Buffer.alloc(4)
  fs.readSync(fd, buf, 0, 4, 0)
  fs.closeSync(fd)
  if (buf.readUInt32LE(0) !== GLB_MAGIC) return { ok: false, reason: 'bad glb magic' }
  return { ok: true, size: stat.size }
}

function main() {
  if (process.env.SKIP_GLB_VERIFY === '1') {
    console.log('[verify-glb] SKIP_GLB_VERIFY=1 — skipped')
    return
  }
  if (process.env.NODE_ENV !== 'production') {
    console.log('[verify-glb] non-production — skipped')
    return
  }

  const jsonPath = path.join(modelDir, 'models.json')
  if (!fs.existsSync(jsonPath)) {
    console.error('[verify-glb] missing models.json at', jsonPath)
    process.exit(1)
  }

  const catalog = JSON.parse(fs.readFileSync(jsonPath, 'utf8'))
  const entries = Array.isArray(catalog.models) ? catalog.models : []
  if (!entries.length) {
    console.error('[verify-glb] models.json has no entries')
    process.exit(1)
  }

  let valid = 0
  const problems = []

  for (const entry of entries) {
    const file = normalizeName(entry)
    const fullPath = path.join(modelDir, file)
    if (!fs.existsSync(fullPath)) {
      problems.push(`${file}: missing`)
      continue
    }
    const check = isValidGlb(fullPath)
    if (!check.ok) {
      problems.push(`${file}: ${check.reason}`)
      continue
    }
    valid++
    console.log(`[verify-glb] OK ${file} (${(check.size / 1e6).toFixed(1)} MB)`)
  }

  console.log(`[verify-glb] ${valid}/${entries.length} valid GLB files`)
  if (valid === 0) {
    console.error('[verify-glb] FATAL: No valid GLB on disk.')
    console.error('[verify-glb] Railway: use Dockerfile builder; build must run: git lfs pull')
    console.error('[verify-glb] Local: git lfs install && git lfs pull && git lfs push --all origin')
    problems.forEach((p) => console.error('  -', p))
    process.exit(1)
  }
}

main()
