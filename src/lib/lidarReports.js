/**
 * LIDAR reports in Amazon S3:
 *   upload/download/LIDAR/{chainage}_Lidar.pdf              (legacy flat)
 *   upload/download/LIDAR/{project}/{chainage}_Lidar.pdf    (project-wise)
 */
import path from 'path'
import {
  isStorageEnabled,
  listBucketObjectsUnderPrefix,
  objectExists,
  pipeBucketObjectToResponse,
} from './storage.js'

export const LIDAR_BUCKET_PREFIX = 'upload/download/LIDAR/'

let catalogCache = { at: 0, files: [] }
let catalogInflight = null
const CATALOG_TTL_MS = 5 * 60 * 1000

export function extractChainageKey(text) {
  const m = String(text || '').match(/(\d+)\s*\+\s*(\d+)/)
  if (!m) return null
  return `${Number(m[1])}+${Number(m[2])}`
}

function parseObjectEntry(objectEntry) {
  const fullKey = String(objectEntry?.key || '').replace(/\\/g, '/')
  if (!/\.pdf$/i.test(fullKey)) return null
  const rel = fullKey.startsWith(LIDAR_BUCKET_PREFIX)
    ? fullKey.slice(LIDAR_BUCKET_PREFIX.length)
    : fullKey
  const parts = rel.split('/').filter(Boolean)
  if (!parts.length) return null
  const name = parts[parts.length - 1]
  if (!/\.pdf$/i.test(name)) return null
  const project = parts.length >= 2 ? parts.slice(0, -1).join('/') : ''
  const chainageKey = extractChainageKey(name)
  if (!chainageKey) return null
  const typeMatch = name.match(/(?:Lidar|LIDAR)(?:_\d+)?_([A-Za-z]+)\.pdf$/i)
  return {
    file: name,
    relativePath: rel,
    key: fullKey,
    project,
    chainageKey,
    structureType: typeMatch ? typeMatch[1].toUpperCase() : '',
    sizeBytes: Number(objectEntry?.sizeBytes || 0),
  }
}

export function invalidateLidarCatalogCache() {
  catalogCache = { at: 0, files: [] }
}

export async function listLidarReportFiles() {
  if (!isStorageEnabled()) return []
  if (catalogCache.files.length && Date.now() - catalogCache.at < CATALOG_TTL_MS) {
    return catalogCache.files
  }
  if (catalogInflight) return catalogInflight
  catalogInflight = (async () => {
    const objects = await listBucketObjectsUnderPrefix(LIDAR_BUCKET_PREFIX)
    const files = objects.map(parseObjectEntry).filter(Boolean)
    files.sort((a, b) => {
      const p = String(a.project || '').localeCompare(String(b.project || ''))
      if (p !== 0) return p
      return String(a.chainageKey || '').localeCompare(String(b.chainageKey || ''), undefined, {
        numeric: true,
      })
    })
    catalogCache = { at: Date.now(), files }
    return files
  })().finally(() => {
    catalogInflight = null
  })
  return catalogInflight
}

export async function findLidarReportByChainage(chainage) {
  const key = extractChainageKey(chainage)
  if (!key) return null
  const files = await listLidarReportFiles()
  return files.find((f) => f.chainageKey === key) || null
}

export async function streamLidarPdf(res, fileName) {
  const raw = String(fileName || '')
    .trim()
    .replace(/\\/g, '/')
    .replace(/^\/+/, '')
  if (!raw || raw.includes('..') || !/\.pdf$/i.test(raw)) return false

  const files = await listLidarReportFiles()
  const hit =
    files.find((f) => f.relativePath === raw) ||
    files.find((f) => f.key === `${LIDAR_BUCKET_PREFIX}${raw}`) ||
    files.find((f) => f.file === path.basename(raw))

  const key = hit?.key || `${LIDAR_BUCKET_PREFIX}${path.basename(raw)}`
  if (!(await objectExists(key))) return false
  return pipeBucketObjectToResponse(res, key)
}
