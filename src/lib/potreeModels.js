/**
 * Potree 2.x point clouds in S3:
 *   upload/potree/{model}/metadata.json                    (legacy flat)
 *   upload/potree/{project}/{model}/metadata.json          (project-wise)
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

/** Leaf folder name (model id), ignoring project prefix. */
export function potreeModelLeaf(folder) {
  const parts = String(folder || '')
    .replace(/\\/g, '/')
    .split('/')
    .map((p) => p.trim())
    .filter(Boolean)
  return parts[parts.length - 1] || ''
}

export function potreeProjectName(folder) {
  const parts = String(folder || '')
    .replace(/\\/g, '/')
    .split('/')
    .map((p) => p.trim())
    .filter(Boolean)
  if (parts.length >= 2) return parts[0]
  return ''
}

function chainageFromFolder(folder) {
  const leaf = potreeModelLeaf(folder)
  const typed = String(leaf || '').match(
    /(?:mnb|mjb|vup|pup|rob|bxc|fo|flyover|box-?culvert|slab-?culvert|chainage|re-wall-ch)[_-]?(\d+)[_-](\d+)/i,
  )
  if (typed) return `${Number(typed[1])}+${Number(typed[2])}`
  const mnbStuck = String(leaf || '').match(/mnb(\d+)[_-](\d+)/i)
  if (mnbStuck) return `${Number(mnbStuck[1])}+${Number(mnbStuck[2])}`
  const undersc = String(leaf || '').match(/(\d+)[_-](\d+)/)
  if (undersc) return `${Number(undersc[1])}+${Number(undersc[2])}`
  return extractChainageKey(leaf) || extractChainageKey(folder)
}

/** Allow nested project/model paths; block traversal. */
export function sanitizeFolder(folder) {
  const raw = String(folder || '')
    .trim()
    .replace(/\\/g, '/')
    .replace(/^\/+|\/+$/g, '')
  if (!raw || raw.includes('..')) return null
  const parts = raw.split('/').filter(Boolean)
  if (!parts.length || parts.some((p) => p === '.' || p === '..')) return null
  return parts.join('/')
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
    const parts = rel.split('/').filter(Boolean)
    if (parts.length < 2) continue
    const file = parts[parts.length - 1]
    if (!ALLOWED_FILES.has(file)) continue
    const folder = parts.slice(0, -1).join('/')
    if (!folder) continue
    if (!byFolder.has(folder)) {
      byFolder.set(folder, {
        folder,
        project: potreeProjectName(folder),
        chainageKey: chainageFromFolder(folder),
        name: potreeModelLeaf(folder) || folder,
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
          entry.name = String(meta.name || entry.name || entry.folder).trim()
          entry.points = Number(meta.points) || null
          const metaChainage = extractChainageKey(meta.name)
          if (metaChainage) entry.chainageKey = metaChainage
        }
      } catch {
        /* keep folder-derived chainage */
      }
      models.push({
        folder: entry.folder,
        project: entry.project || potreeProjectName(entry.folder),
        name: entry.name,
        chainageKey: entry.chainageKey,
        points: entry.points ?? null,
        sizeBytes: Object.values(entry.files).reduce((a, b) => a + b, 0),
      })
    }),
  )

  models.sort((a, b) => {
    const proj = String(a.project || '').localeCompare(String(b.project || ''))
    if (proj !== 0) return proj
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
