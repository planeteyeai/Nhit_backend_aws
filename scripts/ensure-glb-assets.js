/**
 * On Railway/production: download real GLB binaries from GitHub LFS when only
 * pointer stubs exist on disk (build without git lfs pull).
 */
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const GLB_MAGIC = 0x46546c67
const MIN_BYTES = 1_000_000
const rootDir = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')
const modelDir = path.join(rootDir, 'upload', 'model_3d')

const GITHUB_REPO = (process.env.GITHUB_LFS_REPO || 'vishalbhor-45/nhit-backend').trim()
const GITHUB_TOKEN = (process.env.GITHUB_TOKEN || process.env.GH_TOKEN || '').trim()

function normalizeName(entry) {
  const s = String(entry || '').trim()
  if (!s) return ''
  return /\.glb$/i.test(s) ? s : `${s}.glb`
}

function isValidGlbFile(filePath) {
  try {
    const stat = fs.statSync(filePath)
    if (!stat.isFile() || stat.size < MIN_BYTES) return false
    const fd = fs.openSync(filePath, 'r')
    const buf = Buffer.alloc(4)
    fs.readSync(fd, buf, 0, 4, 0)
    fs.closeSync(fd)
    return buf.readUInt32LE(0) === GLB_MAGIC
  } catch {
    return false
  }
}

function parseLfsPointer(filePath) {
  try {
    const text = fs.readFileSync(filePath, 'utf8')
    if (!text.startsWith('version https://git-lfs.github.com/spec/v1')) return null
    const oidLine = text.split('\n').find((l) => l.startsWith('oid '))
    const sizeLine = text.split('\n').find((l) => l.startsWith('size '))
    if (!oidLine || !sizeLine) return null
    return {
      oid: oidLine.replace(/^oid\s+/, '').trim(),
      size: parseInt(sizeLine.replace(/^size\s+/, '').trim(), 10),
    }
  } catch {
    return null
  }
}

async function downloadFromGitHubLfs(oid, size) {
  const [owner, repo] = GITHUB_REPO.split('/')
  if (!owner || !repo) throw new Error(`Invalid GITHUB_LFS_REPO: ${GITHUB_REPO}`)

  const batchUrl = `https://github.com/${owner}/${repo}.git/info/lfs/objects/batch`
  const headers = {
    Accept: 'application/vnd.git-lfs+json',
    'Content-Type': 'application/vnd.git-lfs+json',
  }
  if (GITHUB_TOKEN) headers.Authorization = `Bearer ${GITHUB_TOKEN}`

  const batchRes = await fetch(batchUrl, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      operation: 'download',
      transfers: ['basic'],
      objects: [{ oid, size }],
    }),
  })

  if (!batchRes.ok) {
    const t = await batchRes.text()
    throw new Error(`LFS batch failed (${batchRes.status}): ${t.slice(0, 200)}`)
  }

  const batch = await batchRes.json()
  const obj = batch?.objects?.[0]
  const href = obj?.actions?.download?.href
  if (!href) {
    const err = obj?.error?.message || 'no download URL'
    throw new Error(`LFS download unavailable: ${err}`)
  }

  const dlHeaders = { ...(obj.actions.download.header || {}) }
  if (GITHUB_TOKEN && !dlHeaders.Authorization) {
    dlHeaders.Authorization = `Bearer ${GITHUB_TOKEN}`
  }

  const dlRes = await fetch(href, { headers: dlHeaders })
  if (!dlRes.ok) {
    throw new Error(`LFS file download failed (${dlRes.status})`)
  }

  const buf = Buffer.from(await dlRes.arrayBuffer())
  if (buf.length < MIN_BYTES) {
    throw new Error(`Downloaded file too small (${buf.length} bytes)`)
  }
  if (buf.readUInt32LE(0) !== GLB_MAGIC) {
    throw new Error('Downloaded file is not a valid GLB')
  }
  return buf
}

async function ensureFile(fileName) {
  const fullPath = path.join(modelDir, fileName)
  if (isValidGlbFile(fullPath)) {
    console.log(`[ensure-glb] OK ${fileName}`)
    return true
  }

  const pointer = parseLfsPointer(fullPath)
  if (!pointer) {
    console.warn(`[ensure-glb] skip ${fileName} (missing and not an LFS pointer)`)
    return false
  }

  console.log(`[ensure-glb] downloading ${fileName} (${(pointer.size / 1e6).toFixed(1)} MB) from GitHub LFS…`)
  const buf = await downloadFromGitHubLfs(pointer.oid, pointer.size)
  fs.writeFileSync(fullPath, buf)
  console.log(`[ensure-glb] saved ${fileName} (${(buf.length / 1e6).toFixed(1)} MB)`)
  return true
}

async function main() {
  if (process.env.SKIP_GLB_ENSURE === '1') {
    console.log('[ensure-glb] SKIP_GLB_ENSURE=1')
    return
  }
  if (process.env.NODE_ENV !== 'production') {
    console.log('[ensure-glb] non-production — skipped')
    return
  }

  const jsonPath = path.join(modelDir, 'models.json')
  if (!fs.existsSync(jsonPath)) {
    console.warn('[ensure-glb] no models.json')
    return
  }

  const catalog = JSON.parse(fs.readFileSync(jsonPath, 'utf8'))
  const entries = Array.isArray(catalog.models) ? catalog.models : []
  if (!entries.length) return

  let ok = 0
  for (const entry of entries) {
    const file = normalizeName(entry)
    if (!file) continue
    try {
      if (await ensureFile(file)) ok++
    } catch (e) {
      console.error(`[ensure-glb] failed ${file}:`, e.message)
    }
  }

  console.log(`[ensure-glb] ${ok}/${entries.length} models ready`)
  if (ok === 0) {
    console.error(
      '[ensure-glb] No GLB files available. Set GITHUB_LFS_REPO and GITHUB_TOKEN (if private repo), or run git lfs pull on build.'
    )
  }
}

main().catch((e) => {
  console.error('[ensure-glb] fatal:', e)
  process.exitCode = 1
})
