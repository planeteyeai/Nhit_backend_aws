/**
 * Potree 2.x point clouds in S3: upload/potree/{folder}/metadata.json + hierarchy.bin + octree.bin
 */
import path from 'path'
import {
  isStorageEnabled,
  listBucketObjectsUnderPrefix,
  objectExists,
  pipeBucketObjectToResponse,
  readObjectText,
} from './storage.js'

export const POTREE_BUCKET_PREFIX = 'upload/potree/'

const ALLOWED_FILES = new Set(['metadata.json', 'hierarchy.bin', 'octree.bin', 'log.txt'])

let catalogCache = { at: 0, models: [] }
const CATALOG_TTL_MS = 5 * 60 * 1000

export function extractChainageKey(text) {
  const m = String(text || '').match(/(\d+)\s*\+\s*(\d+)/)
  if (!m) return null
  return `${Number(m[1])}+${Number(m[2])}`
}

function chainageFromFolder(folder) {
  const mnb = String(folder || '').match(/(?:^|-)mnb-(\d+)-(\d+)/i)
  if (mnb) return `${Number(mnb[1])}+${Number(mnb[2])}`
  const undersc = String(folder || '').match(/(\d+)[_-](\d+)/)
  if (undersc) return `${Number(undersc[1])}+${Number(undersc[2])}`
  return extractChainageKey(folder)
}

function sanitizeFolder(folder) {
  const raw = String(folder || '').trim().replace(/\\/g, '/').replace(/^\/+|\/+$/g, '')
  if (!raw || raw.includes('..') || raw.includes('/')) return null
  return raw
}

export function sanitizePotreeFile(file) {
  const base = path.basename(String(file || '').trim())
  if (!ALLOWED_FILES.has(base)) return null
  return base
}

export function potreeObjectKey(folder, file) {
  const dir = sanitizeFolder(folder)
  const name = sanitizePotreeFile(file)
  if (!dir || !name) return null
  return `${POTREE_BUCKET_PREFIX}${dir}/${name}`
}

export async function listPotreeModels() {
  if (!isStorageEnabled()) return []
  if (catalogCache.models.length && Date.now() - catalogCache.at < CATALOG_TTL_MS) {
    return catalogCache.models
  }

  const objects = await listBucketObjectsUnderPrefix(POTREE_BUCKET_PREFIX)
  const byFolder = new Map()

  for (const obj of objects) {
    const rel = String(obj.key || '').slice(POTREE_BUCKET_PREFIX.length)
    const parts = rel.split('/')
    const folder = parts[0]
    const file = parts.slice(1).join('/')
    if (!folder || !file) continue
    if (!byFolder.has(folder)) {
      byFolder.set(folder, {
        folder,
        chainageKey: chainageFromFolder(folder),
        name: folder,
        files: {},
      })
    }
    byFolder.get(folder).files[file] = Number(obj.sizeBytes || 0)
  }

  const models = []
  const entries = [...byFolder.values()].filter((entry) => {
    return (
      Boolean(entry.files['metadata.json']) &&
      Boolean(entry.files['hierarchy.bin']) &&
      Boolean(entry.files['octree.bin'])
    )
  })

  await Promise.all(
    entries.map(async (entry) => {
      try {
        const metaText = await readObjectText(`${POTREE_BUCKET_PREFIX}${entry.folder}/metadata.json`)
        if (metaText) {
          const meta = JSON.parse(metaText)
          entry.name = String(meta.name || entry.folder).trim()
          entry.points = Number(meta.points) || null
          const metaChainage = extractChainageKey(meta.name)
          if (metaChainage) entry.chainageKey = metaChainage
        }
      } catch {
        /* keep folder-derived chainage */
      }
      models.push({
        folder: entry.folder,
        name: entry.name,
        chainageKey: entry.chainageKey,
        points: entry.points ?? null,
        sizeBytes: Object.values(entry.files).reduce((a, b) => a + b, 0),
      })
    })
  )

  models.sort((a, b) => {
    const parse = (k) => {
      const m = String(k || '').match(/(\d+)\+(\d+)/)
      return m ? [Number(m[1]), Number(m[2])] : [0, 0]
    }
    const [ak, am] = parse(a.chainageKey)
    const [bk, bm] = parse(b.chainageKey)
    if (ak !== bk) return ak - bk
    return am - bm
  })

  catalogCache = { at: Date.now(), models }
  return models
}

export function invalidatePotreeCatalogCache() {
  catalogCache = { at: 0, models: [] }
}

export async function findPotreeModelByChainage(chainage) {
  const key = extractChainageKey(chainage)
  if (!key) return null
  const models = await listPotreeModels()
  return models.find((m) => m.chainageKey === key) || null
}

export async function streamPotreeFile(res, folder, file, rangeHeader) {
  const key = potreeObjectKey(folder, file)
  if (!key) return false
  if (!(await objectExists(key))) return false
  return pipeBucketObjectToResponse(res, key, { range: rangeHeader })
}
