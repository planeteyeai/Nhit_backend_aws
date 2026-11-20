/**
 * SAR raw-data archives:
 *   s3://nhitbucket/upload/download/SAR Rowdata/{project}/{file}.zip
 */
import path from 'path'
import {
  isStorageEnabled,
  listBucketObjectsUnderPrefix,
  listBucketCommonPrefixes,
  objectExists,
  getPresignedUrl,
  pipeBucketObjectToResponse,
} from './storage.js'

export const SAR_ROWDATA_PREFIX = 'upload/download/SAR Rowdata/'
const PREFIX_CANDIDATES = [
  'upload/download/SAR Rowdata/',
  'upload/download/SAR RowData/',
  'upload/download/SAR rawdata/',
  'upload/download/SAR Raw Data/',
]
const ARCHIVE_EXT = /\.(zip|7z|rar|tar|gz|tgz)$/i

const PROJECT_ALIASES = [
  [/palanpur|swaroopganj|abu/i, 'Abu Road-Swaroopganj'],
  [/shivapuri|shivpuri|jhansi/i, 'Shivpuri-Jhansi'],
  [/borkhedi|bhorkhedi|wadner|bkrp/i, 'Bhorkhedi-Wadner-Deodhari-Kelapur'],
  [/chittorgarh|chithorgarh|kota/i, 'Chittorgarh Bypass to Kota'],
  [/agra/i, 'Agra Bypass'],
  [/kochugaon|kalijhar|kaljhar/i, 'Kochugaon to Kalijhar'],
  [/patacharkuchi|pattacharkuchi|khaljhar/i, 'Kalijhar to Patacharkuchi'],
  [/chichra|kharagpur/i, 'Chichra-Kharagpur'],
]

let catalogCache = { at: 0, files: [], projects: [], prefix: SAR_ROWDATA_PREFIX }
let catalogInflight = null
const CATALOG_TTL_MS = 30 * 1000

function normalizeProjectLabel(name) {
  const raw = String(name || '').trim()
  if (!raw) return ''
  for (const [re, label] of PROJECT_ALIASES) {
    if (re.test(raw)) return label
  }
  return raw.replace(/\+/g, ' ').replace(/\s+/g, ' ').trim()
}

function folderNameFromPrefix(fullPrefix, rootPrefix) {
  const rel = String(fullPrefix || '').slice(String(rootPrefix || '').length)
  return rel.replace(/\/+$/, '').trim()
}

function parseObjectEntry(objectEntry, rootPrefix) {
  const fullKey = String(objectEntry?.key || '').replace(/\\/g, '/')
  if (!fullKey || fullKey.endsWith('/')) return null
  const rel = fullKey.startsWith(rootPrefix) ? fullKey.slice(rootPrefix.length) : fullKey
  const parts = rel.split('/').filter(Boolean)
  if (!parts.length) return null
  const name = parts[parts.length - 1]
  const folder = parts.length >= 2 ? parts.slice(0, -1).join('/') : ''
  const project = normalizeProjectLabel(folder || name) || 'Unassigned'
  return {
    file: name,
    relativePath: rel,
    key: fullKey,
    project,
    sizeBytes: Number(objectEntry?.sizeBytes || 0),
    isArchive: ARCHIVE_EXT.test(name),
  }
}

export function invalidateSarRowdataCache() {
  catalogCache = { at: 0, files: [], projects: [], prefix: SAR_ROWDATA_PREFIX }
}

async function resolveRootPrefix() {
  for (const prefix of PREFIX_CANDIDATES) {
    const [folders, objects] = await Promise.all([
      listBucketCommonPrefixes(prefix),
      listBucketObjectsUnderPrefix(prefix),
    ])
    if (folders.length || objects.length) return { prefix, folders, objects }
  }

  const parentFolders = await listBucketCommonPrefixes('upload/download/')
  const hit = parentFolders.find((p) => /sar.*row/i.test(p))
  if (hit) {
    const prefix = hit.endsWith('/') ? hit : `${hit}/`
    const [folders, objects] = await Promise.all([
      listBucketCommonPrefixes(prefix),
      listBucketObjectsUnderPrefix(prefix),
    ])
    return { prefix, folders, objects }
  }

  return { prefix: SAR_ROWDATA_PREFIX, folders: [], objects: [] }
}

export async function listSarRowdataCatalog() {
  if (!isStorageEnabled()) return { files: [], projects: [], prefix: SAR_ROWDATA_PREFIX }
  if (
    catalogCache.at &&
    Date.now() - catalogCache.at < CATALOG_TTL_MS
  ) {
    return catalogCache
  }
  if (catalogInflight) return catalogInflight
  catalogInflight = (async () => {
    const { prefix, folders, objects } = await resolveRootPrefix()
    const files = objects.map((o) => parseObjectEntry(o, prefix)).filter(Boolean)
    const projectSet = new Set()
    for (const folder of folders) {
      const name = folderNameFromPrefix(folder, prefix)
      if (name) projectSet.add(normalizeProjectLabel(name) || name)
    }
    for (const file of files) {
      if (file.project) projectSet.add(file.project)
    }
    const projects = [...projectSet].sort((a, b) => a.localeCompare(b))
    files.sort((a, b) => {
      const p = String(a.project || '').localeCompare(String(b.project || ''))
      if (p !== 0) return p
      return String(a.file || '').localeCompare(String(b.file || ''), undefined, { numeric: true })
    })
    catalogCache = { at: Date.now(), files, projects, prefix }
    return catalogCache
  })().finally(() => {
    catalogInflight = null
  })
  return catalogInflight
}

export async function listSarRowdataFiles() {
  const catalog = await listSarRowdataCatalog()
  return catalog.files
}

function findFile(rawName) {
  const raw = String(rawName || '')
    .trim()
    .replace(/\\/g, '/')
    .replace(/^\/+/, '')
  if (!raw || raw.includes('..')) return null
  return raw
}

export async function resolveSarRowdataKey(fileName) {
  const raw = findFile(fileName)
  if (!raw) return null
  const catalog = await listSarRowdataCatalog()
  const files = catalog.files
  const prefix = catalog.prefix || SAR_ROWDATA_PREFIX
  const hit =
    files.find((f) => f.relativePath === raw) ||
    files.find((f) => f.key === `${prefix}${raw}`) ||
    files.find((f) => f.file === path.basename(raw))
  const key = hit?.key || `${prefix}${raw}`
  if (!(await objectExists(key))) return null
  return { key, file: hit?.file || path.basename(raw) }
}

export async function getSarRowdataDownloadUrl(fileName) {
  const resolved = await resolveSarRowdataKey(fileName)
  if (!resolved) return null
  const url = await getPresignedUrl(resolved.key)
  if (!url) return null
  return { url, file: resolved.file }
}

export async function streamSarRowdataFile(res, fileName) {
  const resolved = await resolveSarRowdataKey(fileName)
  if (!resolved) return false
  return pipeBucketObjectToResponse(res, resolved.key)
}
