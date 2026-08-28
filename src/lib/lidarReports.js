/**
 * LIDAR reports in Amazon S3: upload/download/LIDAR/{chainage}_Lidar.pdf
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
const CATALOG_TTL_MS = 5 * 60 * 1000

export function extractChainageKey(text) {
  const m = String(text || '').match(/(\d+)\s*\+\s*(\d+)/)
  if (!m) return null
  return `${Number(m[1])}+${Number(m[2])}`
}

function parseFileName(fileName) {
  const name = String(fileName || '').trim()
  const chainageKey = extractChainageKey(name)
  const typeMatch = name.match(/(?:Lidar|LIDAR)(?:_\d+)?_([A-Za-z]+)\.pdf$/i)
  return {
    file: name,
    key: `${LIDAR_BUCKET_PREFIX}${name}`,
    chainageKey,
    structureType: typeMatch ? typeMatch[1].toUpperCase() : '',
    sizeBytes: 0,
  }
}

function parseObjectEntry(objectEntry) {
  const name = path.basename(String(objectEntry?.key || ''))
  if (!/\.pdf$/i.test(name)) return null
  const parsed = parseFileName(name)
  if (!parsed.chainageKey) return null
  return { ...parsed, sizeBytes: Number(objectEntry?.sizeBytes || 0) }
}

export async function listLidarReportFiles() {
  if (!isStorageEnabled()) return []
  if (catalogCache.files.length && Date.now() - catalogCache.at < CATALOG_TTL_MS) {
    return catalogCache.files
  }
  const objects = await listBucketObjectsUnderPrefix(LIDAR_BUCKET_PREFIX)
  const files = objects
    .map(parseObjectEntry)
    .filter(Boolean)
  catalogCache = { at: Date.now(), files }
  return files
}

export async function findLidarReportByChainage(chainage) {
  const key = extractChainageKey(chainage)
  if (!key) return null
  const files = await listLidarReportFiles()
  return files.find((f) => f.chainageKey === key) || null
}

export async function streamLidarPdf(res, fileName) {
  const safe = path.basename(String(fileName || ''))
  if (!/\.pdf$/i.test(safe)) return false
  const key = `${LIDAR_BUCKET_PREFIX}${safe}`
  if (!(await objectExists(key))) return false
  return pipeBucketObjectToResponse(res, key)
}
