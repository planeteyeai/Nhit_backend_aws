/**
 * Download catalog GLBs from GitHub LFS (for Railway when build has no git lfs pull).
 */
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const GLB_MAGIC = 0x46546c67
const MIN_BYTES = 1_000_000
const rootDir = path.join(path.dirname(fileURLToPath(import.meta.url)), '../..')
const modelDir = path.join(rootDir, 'upload', 'model_3d')

const GITHUB_REPO = (process.env.GITHUB_LFS_REPO || 'planeteyeai/nhit-backend1').trim()
const GITHUB_TOKEN = (process.env.GITHUB_TOKEN || process.env.GH_TOKEN || '').trim()

export const glbEnsureStatus = {
  running: false,
  lastRun: null,
  lastError: null,
  ready: 0,
  total: 0,
  currentFile: null,
}

function authHeaders() {
  const h = { 'User-Agent': 'nhit-bms-backend' }
  if (!GITHUB_TOKEN) return h
  // GitHub LFS works best with Basic x-access-token (PAT); Bearer also sent for APIs.
  const basic = Buffer.from(`x-access-token:${GITHUB_TOKEN}`).toString('base64')
  h.Authorization = `Basic ${basic}`
  h['X-GitHub-Authorization'] = `Bearer ${GITHUB_TOKEN}`
  return h
}

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

function parseLfsPointerText(text) {
  if (!text.startsWith('version https://git-lfs.github.com/spec/v1')) return null
  const oid = text.match(/^oid (.+)$/m)?.[1]?.trim()
  const size = parseInt(text.match(/^size (.+)$/m)?.[1] || '0', 10)
  if (!oid || !size) return null
  return { oid, size }
}

function parseLfsPointer(filePath) {
  try {
    return parseLfsPointerText(fs.readFileSync(filePath, 'utf8'))
  } catch {
    return null
  }
}

function loadManifest() {
  const p = path.join(modelDir, 'lfs-manifest.json')
  if (!fs.existsSync(p)) return null
  try {
    return JSON.parse(fs.readFileSync(p, 'utf8'))
  } catch {
    return null
  }
}

function resolvePointer(fileName) {
  const fullPath = path.join(modelDir, fileName)
  const local = parseLfsPointer(fullPath)
  if (local) return local

  const manifest = loadManifest()
  const entry = manifest?.files?.find((f) => f.file === fileName)
  if (entry?.oid && entry?.size) return { oid: entry.oid, size: entry.size }

  return null
}

async function downloadFromGitHubLfs(oid, size, repo = GITHUB_REPO) {
  const [owner, name] = repo.split('/')
  if (!owner || !name) throw new Error(`Invalid GITHUB_LFS_REPO: ${repo}`)

  const batchUrl = `https://github.com/${owner}/${name}.git/info/lfs/objects/batch`
  const batchRes = await fetch(batchUrl, {
    method: 'POST',
    headers: {
      Accept: 'application/vnd.git-lfs+json',
      'Content-Type': 'application/vnd.git-lfs+json',
      ...authHeaders(),
    },
    body: JSON.stringify({
      operation: 'download',
      transfers: ['basic'],
      objects: [{ oid, size }],
    }),
  })

  if (!batchRes.ok) {
    const t = await batchRes.text()
    const hint = batchRes.status === 401 || batchRes.status === 403
      ? ' Add GITHUB_TOKEN on Railway (repo is private).'
      : ''
    throw new Error(`LFS batch ${batchRes.status}: ${t.slice(0, 120)}${hint}`)
  }

  const batch = await batchRes.json()
  const obj = batch?.objects?.[0]
  const href = obj?.actions?.download?.href
  if (!href) {
    throw new Error(obj?.error?.message || 'No LFS download URL (check GITHUB_TOKEN)')
  }

  const dlHeaders = { ...authHeaders(), ...(obj.actions.download.header || {}) }
  const dlRes = await fetch(href, { headers: dlHeaders })
  if (!dlRes.ok) throw new Error(`LFS file download ${dlRes.status}`)

  const buf = Buffer.from(await dlRes.arrayBuffer())
  if (buf.length < MIN_BYTES || buf.readUInt32LE(0) !== GLB_MAGIC) {
    throw new Error(`Invalid GLB after download (${buf.length} bytes)`)
  }
  return buf
}

/** Download one GLB if missing or still an LFS pointer (used by /model-3d/file on demand). */
export async function ensureSingleModelFile(fileName) {
  const file = normalizeName(fileName)
  if (!file) return { ok: false, error: 'Invalid file name' }
  try {
    const ok = await ensureFile(file)
    return { ok, error: ok ? null : glbEnsureStatus.lastError || 'Download failed' }
  } catch (e) {
    glbEnsureStatus.lastError = e.message
    return { ok: false, error: e.message }
  }
}

async function ensureFile(fileName) {
  const fullPath = path.join(modelDir, fileName)
  if (isValidGlbFile(fullPath)) return true

  const pointer = resolvePointer(fileName)
  if (!pointer) {
    console.warn(`[ensure-glb] no pointer/manifest for ${fileName}`)
    return false
  }

  const repo = loadManifest()?.repo || GITHUB_REPO
  glbEnsureStatus.currentFile = fileName
  console.log(`[ensure-glb] downloading ${fileName} (${(pointer.size / 1e6).toFixed(1)} MB)…`)
  const buf = await downloadFromGitHubLfs(pointer.oid, pointer.size, repo)
  fs.mkdirSync(modelDir, { recursive: true })
  fs.writeFileSync(fullPath, buf)
  console.log(`[ensure-glb] saved ${fileName}`)
  return true
}

export async function runEnsureGlbAssets() {
  if (glbEnsureStatus.running) {
    console.log('[ensure-glb] already running')
    return glbEnsureStatus
  }

  glbEnsureStatus.running = true
  glbEnsureStatus.lastError = null
  glbEnsureStatus.lastRun = new Date().toISOString()

  try {
    const jsonPath = path.join(modelDir, 'models.json')
    if (!fs.existsSync(jsonPath)) {
      throw new Error('models.json missing')
    }

    const catalog = JSON.parse(fs.readFileSync(jsonPath, 'utf8'))
    const entries = Array.isArray(catalog.models) ? catalog.models : []
    glbEnsureStatus.total = entries.length

    if (!GITHUB_TOKEN) {
      console.warn('[ensure-glb] GITHUB_TOKEN not set — required if GitHub repo is private')
    }

    let ok = 0
    for (const entry of entries) {
      const file = normalizeName(entry)
      if (!file) continue
      try {
        if (await ensureFile(file)) ok++
        glbEnsureStatus.ready = ok
      } catch (e) {
        console.error(`[ensure-glb] failed ${file}:`, e.message)
        glbEnsureStatus.lastError = e.message
      }
    }

    glbEnsureStatus.ready = ok
    console.log(`[ensure-glb] ${ok}/${entries.length} ready`)
    return glbEnsureStatus
  } finally {
    glbEnsureStatus.running = false
    glbEnsureStatus.currentFile = null
  }
}

export function countValidGlbs() {
  const jsonPath = path.join(modelDir, 'models.json')
  if (!fs.existsSync(jsonPath)) return { valid: 0, total: 0 }
  const catalog = JSON.parse(fs.readFileSync(jsonPath, 'utf8'))
  const entries = Array.isArray(catalog.models) ? catalog.models : []
  let valid = 0
  for (const entry of entries) {
    const file = normalizeName(entry)
    if (file && isValidGlbFile(path.join(modelDir, file))) valid++
  }
  return { valid, total: entries.length }
}
