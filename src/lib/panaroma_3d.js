import fs from 'fs'
import path from 'path'
import { randomUUID } from 'crypto'
import AdmZip from 'adm-zip'

const FACE_MAP = {
  px: ['right', 'px'],
  nx: ['left', 'nx'],
  py: ['top', 'up', 'py'],
  ny: ['bottom', 'down', 'ny'],
  pz: ['front', 'pz'],
  nz: ['back', 'nz'],
}

const PANORAMA_3D_DIR = 'panaroma_3d'

const INDIA_BASE_LAT = 11.1271
const INDIA_BASE_LNG = 78.6569

function publicBaseUrl(req) {
  const proto = (req.get('x-forwarded-proto') || req.protocol || 'http').split(',')[0].trim()
  const host = req.get('x-forwarded-host') || req.get('host')
  return `${proto}://${host}`
}

function zipEntriesWithoutNoise(zip) {
  return zip
    .getEntries()
    .filter((e) => !e.isDirectory && !e.entryName.includes('__MACOSX') && !/\/\._/i.test(e.entryName))
}

function groupedFolderEntries(entries) {
  const byDepth = (depth) => {
    const groups = new Map()
    for (const entry of entries) {
      const parts = String(entry.entryName || '').split('/').filter(Boolean)
      if (parts.length <= depth) continue
      const key = parts.slice(0, depth + 1).join('/')
      if (!groups.has(key)) groups.set(key, [])
      groups.get(key).push(entry)
    }
    return Array.from(groups.entries())
      .filter(([, bucket]) => bucket.some((e) => /\.(jpe?g|png|webp|zip)$/i.test(e.entryName)))
      .sort((a, b) => a[0].localeCompare(b[0], undefined, { numeric: true, sensitivity: 'base' }))
  }

  const candidates = []
  for (let depth = 0; depth <= 4; depth += 1) {
    const groups = byDepth(depth)
    if (groups.length > 1) candidates.push(groups)
  }

  if (candidates.length > 0) {
    return candidates.sort((a, b) => b.length - a.length)[0]
  }

  return byDepth(0)
}

/** Group image/zip files by parent folder path (best for MP1/, MP2/, … in one ZIP). */
function groupByParentFolder(entries) {
  const groups = new Map()
  for (const entry of entries) {
    const name = String(entry.entryName || '')
    if (!/\.(jpe?g|png|webp|zip)$/i.test(name)) continue
    const parts = name.split('/').filter(Boolean)
    const key = parts.length > 1 ? parts.slice(0, -1).join('/') : '__root__'
    if (!groups.has(key)) groups.set(key, [])
    groups.get(key).push(entry)
  }
  const list = Array.from(groups.entries()).filter(([, bucket]) => bucket.length > 0)
  const withoutRoot = list.filter(([k]) => k !== '__root__')
  return withoutRoot.length > 1 ? withoutRoot : list
}

/** Group by folder depth when one root contains MP1/, MP2/, … each with images. */
function groupByImmediateChildFolder(entries) {
  const mediaEntries = entries.filter((e) => /\.(jpe?g|png|webp|zip)$/i.test(e.entryName))
  if (mediaEntries.length < 2) return []

  const partsList = mediaEntries.map((e) => String(e.entryName || '').split('/').filter(Boolean))
  const maxDepth = Math.max(...partsList.map((p) => p.length))
  if (maxDepth < 2) return []

  for (let depth = 1; depth < maxDepth; depth += 1) {
    const groups = new Map()
    for (const entry of mediaEntries) {
      const parts = String(entry.entryName || '').split('/').filter(Boolean)
      if (parts.length <= depth) continue
      const key = parts.slice(0, depth).join('/')
      if (!groups.has(key)) groups.set(key, [])
      groups.get(key).push(entry)
    }
    const list = Array.from(groups.entries()).filter(([, bucket]) => bucket.length > 0)
    if (list.length > 1) {
      return list.map(([, groupEntries]) => groupEntries)
    }
  }
  return []
}

function resolvePanoramaStationGroups(entries) {
  const nestedZipEntries = entries.filter((e) => /\.zip$/i.test(e.entryName))
  if (nestedZipEntries.length > 1) {
    return nestedZipEntries.map((entry) => ({ entries: zipEntriesWithoutNoise(new AdmZip(entry.getData())) }))
  }
  if (nestedZipEntries.length === 1) {
    const inner = zipEntriesWithoutNoise(new AdmZip(nestedZipEntries[0].getData()))
    return resolvePanoramaStationGroups(inner)
  }

  const byChild = groupByImmediateChildFolder(entries)
  if (byChild.length > 1) {
    return byChild.map((groupEntries) => ({ entries: groupEntries }))
  }

  const byParent = groupByParentFolder(entries)
  if (byParent.length > 1) {
    return byParent.map(([, groupEntries]) => ({ entries: groupEntries }))
  }

  const byDepth = groupedFolderEntries(entries)
  if (byDepth.length > 1) {
    return byDepth.map(([, groupEntries]) => ({ entries: groupEntries }))
  }

  return [{ entries }]
}

const CUBE_FACE_ORDER = ['px', 'nx', 'py', 'ny', 'pz', 'nz']

function entryStem(entryName) {
  return path.basename(String(entryName || '')).replace(/\.[^.]+$/i, '').toLowerCase()
}

function entryMatchesFace(entryName, keywords) {
  const stem = entryStem(entryName)
  return keywords.some((k) => {
    const key = String(k).toLowerCase()
    if (stem === key) return true
    return new RegExp(`(^|[._\\-])${key}([._\\-]|$)`, 'i').test(stem)
  })
}

function imageEntriesOnly(entries) {
  return entries.filter((e) => /\.(jpe?g|png|webp)$/i.test(e.entryName))
}

function writePanoramaFromEntries(entries, savePath, baseUrl) {
  let results = {}
  let pType = 'sphere'
  const used = new Set()

  for (const [faceKey, keywords] of Object.entries(FACE_MAP)) {
    const match = entries.find(
      (e) => !used.has(e.entryName) && entryMatchesFace(e.entryName, keywords)
    )
    if (match) {
      used.add(match.entryName)
      const ext = path.extname(match.entryName) || '.jpg'
      const targetName = `${faceKey}${ext}`
      fs.writeFileSync(path.join(savePath, targetName), match.getData())
      results[faceKey] = `${baseUrl}/${targetName}`
    }
  }

  const remainingImages = imageEntriesOnly(entries).filter((e) => !used.has(e.entryName))
  if (Object.keys(results).length < 6 && remainingImages.length > 0) {
    const sorted = [...remainingImages].sort((a, b) =>
      a.entryName.localeCompare(b.entryName, undefined, { numeric: true, sensitivity: 'base' })
    )
    for (const faceKey of CUBE_FACE_ORDER) {
      if (results[faceKey]) continue
      const next = sorted.shift()
      if (!next) break
      const ext = path.extname(next.entryName) || '.jpg'
      const targetName = `${faceKey}${ext}`
      fs.writeFileSync(path.join(savePath, targetName), next.getData())
      results[faceKey] = `${baseUrl}/${targetName}`
      used.add(next.entryName)
    }
  }

  const faceCount = Object.keys(results).length
  if (faceCount >= 4) {
    pType = 'cube'
    return { panorama_type: pType, images: results, markers: [] }
  }

  const imgEntry = imageEntriesOnly(entries).find((e) => !used.has(e.entryName)) || imageEntriesOnly(entries)[0]
  if (!imgEntry) {
    const err = new Error('ZIP has no recognizable panorama images')
    err.status = 400
    throw err
  }
  const ext = path.extname(imgEntry.entryName) || '.jpg'
  const targetName = `sphere${ext}`
  fs.writeFileSync(path.join(savePath, targetName), imgEntry.getData())
  results = { url: `${baseUrl}/${targetName}` }
  pType = 'sphere'
  return { panorama_type: pType, images: results, markers: [] }
}

/** All panorama assets live under upload/panaroma_3d/{stationId}/ */
function stationDir(uploadRoot, stationId) {
  return path.join(uploadRoot, PANORAMA_3D_DIR, String(stationId))
}

function bridgePanoramaIndexPath(uploadRoot, bridgeId) {
  return path.join(uploadRoot, PANORAMA_3D_DIR, `stations.${String(bridgeId)}.json`)
}

function legacyBridgePanoramaRoot(uploadRoot, bridgeId) {
  return path.join(uploadRoot, 'bridge_panoramas', String(bridgeId))
}

function legacyBridgePanoramaIndexPath(uploadRoot, bridgeId) {
  return path.join(legacyBridgePanoramaRoot(uploadRoot, bridgeId), 'stations.json')
}

function parseIndexFile(indexPath) {
  try {
    const parsed = JSON.parse(fs.readFileSync(indexPath, 'utf8'))
    return Array.isArray(parsed?.stations) ? parsed.stations : Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

/** Rewrite old bridge_panoramas URLs to panaroma_3d (relative paths for Vite proxy). */
export function normalizePanoramaMediaUrl(url, stationId) {
  if (!url || typeof url !== 'string') return url
  let s = url.trim()
  if (!s) return s
  s = s.replace(/\/upload\/bridge_panoramas\/[^/]+\/([^/]+)(\/[^?#]*)?/g, '/upload/panaroma_3d/$1$2')
  try {
    const parsed = new URL(s, 'http://local')
    if (parsed.pathname.startsWith('/upload/bridge_panoramas/')) {
      const parts = parsed.pathname.split('/').filter(Boolean)
      const id = parts[2] || stationId
      const file = parts[3] || ''
      s = file ? `/upload/panaroma_3d/${id}/${file}` : `/upload/panaroma_3d/${id}`
    } else if (parsed.pathname.startsWith('/upload/')) {
      s = `${parsed.pathname}${parsed.search}${parsed.hash}`
    }
  } catch {
    if (s.startsWith('upload/')) s = `/${s}`
  }
  return s
}

function normalizeStationRecord(station) {
  if (!station) return station
  const stationId = String(station.id || '').trim()
  const images = station.images
  let nextImages = images
  if (images && typeof images === 'object') {
    if (typeof images.url === 'string') {
      nextImages = { ...images, url: normalizePanoramaMediaUrl(images.url, stationId) }
    } else {
      nextImages = {}
      for (const [key, val] of Object.entries(images)) {
        nextImages[key] = typeof val === 'string' ? normalizePanoramaMediaUrl(val, stationId) : val
      }
    }
  }
  return {
    ...station,
    images: nextImages,
    previewUrl: normalizePanoramaMediaUrl(station.previewUrl, stationId),
  }
}

function migrateLegacyStationFolder(uploadRoot, bridgeId, stationId) {
  const target = stationDir(uploadRoot, stationId)
  if (fs.existsSync(target)) return target
  const legacy = path.join(legacyBridgePanoramaRoot(uploadRoot, bridgeId), stationId)
  if (!fs.existsSync(legacy)) return target
  fs.mkdirSync(path.dirname(target), { recursive: true })
  fs.renameSync(legacy, target)
  return target
}

function migrateLegacyBridgeIndex(uploadRoot, bridgeId) {
  const legacyPath = legacyBridgePanoramaIndexPath(uploadRoot, bridgeId)
  if (!fs.existsSync(legacyPath)) return
  const stations = parseIndexFile(legacyPath).map(normalizeStationRecord)
  for (const station of stations) {
    if (station?.id) migrateLegacyStationFolder(uploadRoot, bridgeId, String(station.id))
  }
  writeBridgePanoramaIndex(uploadRoot, bridgeId, stations)
}

function readBridgePanoramaIndex(uploadRoot, bridgeId) {
  const id = String(bridgeId)
  migrateLegacyBridgeIndex(uploadRoot, id)
  const indexPath = bridgePanoramaIndexPath(uploadRoot, id)
  if (!fs.existsSync(indexPath)) {
    const legacyPath = legacyBridgePanoramaIndexPath(uploadRoot, id)
    if (fs.existsSync(legacyPath)) {
      migrateLegacyBridgeIndex(uploadRoot, id)
    }
  }
  if (!fs.existsSync(indexPath)) return []
  return parseIndexFile(indexPath).map(normalizeStationRecord)
}

function writeBridgePanoramaIndex(uploadRoot, bridgeId, stations) {
  const indexPath = bridgePanoramaIndexPath(uploadRoot, bridgeId)
  fs.mkdirSync(path.dirname(indexPath), { recursive: true })
  fs.writeFileSync(
    indexPath,
    JSON.stringify(
      { stations: stations.map(normalizeStationRecord), updatedAt: new Date().toISOString() },
      null,
      2
    )
  )
}

function panoramaPreviewUrl(station) {
  const images = station?.images
  if (!images || typeof images !== 'object') return ''
  if (typeof images.url === 'string' && images.url) return images.url
  for (const key of ['px', 'py', 'pz', 'nx', 'ny', 'nz']) {
    if (typeof images[key] === 'string' && images[key]) return images[key]
  }
  return ''
}

function buildStationResponse(req, uploadRoot, entries, idx = 0, total = 1, options = {}) {
  const bridgeId = options?.bridgeId != null ? String(options.bridgeId).trim() : ''
  const uploadedName = String(options?.uploadedName || '').trim()
  const stationId = randomUUID().replace(/-/g, '').slice(0, 8)
  const savePath = stationDir(uploadRoot, stationId)
  fs.mkdirSync(savePath, { recursive: true })
  // Relative URL — works with Vite /upload proxy (port 5173 → 3001)
  const baseUrl = `/upload/${PANORAMA_3D_DIR}/${stationId}`
  const payload = writePanoramaFromEntries(entries, savePath, baseUrl)
  const spread = total > 1
  const angle = total > 1 ? (idx / total) * Math.PI * 2 : 0
  const radius = total > 12 ? 0.028 : total > 6 ? 0.02 : 0.012
  const lat = spread ? INDIA_BASE_LAT + radius * Math.cos(angle) : INDIA_BASE_LAT + Math.random() * 0.05
  const lng = spread ? INDIA_BASE_LNG + radius * Math.sin(angle) : INDIA_BASE_LNG + Math.random() * 0.05
  return {
    id: stationId,
    bridgeId: bridgeId || undefined,
    ...payload,
    uploadedName: uploadedName || undefined,
    lat,
    lng,
    previewUrl: panoramaPreviewUrl({ images: payload.images }),
    uploadedAt: new Date().toISOString(),
  }
}

function persistBridgePanoramaStations(uploadRoot, bridgeId, stations) {
  if (!bridgeId || !Array.isArray(stations) || stations.length === 0) return
  const existing = readBridgePanoramaIndex(uploadRoot, bridgeId)
  const byId = new Map(existing.map((s) => [String(s.id), s]))
  for (const station of stations) {
    if (station?.id) byId.set(String(station.id), normalizeStationRecord(station))
  }
  writeBridgePanoramaIndex(uploadRoot, bridgeId, Array.from(byId.values()))
}

export function listBridgePanoramas(uploadRoot, bridgeId, req) {
  const stations = readBridgePanoramaIndex(uploadRoot, bridgeId)
  return stations.map((station, index) => ({
    ...station,
    displayName: station.displayName || station.label || `Panorama ${index + 1}`,
    previewUrl: station.previewUrl || panoramaPreviewUrl(station),
  }))
}

export function deleteBridgePanorama(uploadRoot, bridgeId, stationId) {
  const id = String(stationId || '').trim()
  if (!id) {
    const err = new Error('Invalid station id')
    err.status = 400
    throw err
  }
  const dir = stationDir(uploadRoot, id)
  if (fs.existsSync(dir)) {
    fs.rmSync(dir, { recursive: true, force: true })
  }
  const legacyDir = path.join(legacyBridgePanoramaRoot(uploadRoot, bridgeId), id)
  if (fs.existsSync(legacyDir)) {
    fs.rmSync(legacyDir, { recursive: true, force: true })
  }
  const next = readBridgePanoramaIndex(uploadRoot, bridgeId).filter((s) => String(s.id) !== id)
  writeBridgePanoramaIndex(uploadRoot, bridgeId, next)
  return { deleted: id, remaining: next.length }
}

/**
 * POST /upload-panorama — same contract as legacy Python threed/main.py
 */
export async function processPanoramaUpload(req, uploadRoot, options = {}) {
  const file = req.file
  const hasBuffer = Boolean(file?.buffer?.length)
  const hasPath = Boolean(file?.path)
  if (!hasBuffer && !hasPath) {
    const err = new Error('No file uploaded')
    err.status = 400
    throw err
  }

  const bridgeId = String(options?.bridgeId || req.body?.bridgeId || req.query?.bridgeId || '').trim()
  const uploadOpts = bridgeId ? { bridgeId } : {}
  const filename = String(file.originalname || 'upload').toLowerCase()
  const originalName = String(file.originalname || 'upload')

  try {
    if (filename.endsWith('.zip')) {
      const zip = hasBuffer ? new AdmZip(file.buffer) : new AdmZip(file.path)
      const entries = zipEntriesWithoutNoise(zip)
      const zipMeta = { ...uploadOpts, uploadedName: originalName }

      // Bridge ZIP upload: one archive = one panorama station (cube or sphere), never split folders
      if (bridgeId) {
        const existing = readBridgePanoramaIndex(uploadRoot, bridgeId)
        const sameZip = existing.filter(
          (s) => String(s.uploadedName || '').toLowerCase() === originalName.toLowerCase()
        )
        for (const old of sameZip) {
          const oldDir = stationDir(uploadRoot, old.id)
          if (fs.existsSync(oldDir)) fs.rmSync(oldDir, { recursive: true, force: true })
        }
        const withoutDupZip = existing.filter(
          (s) => String(s.uploadedName || '').toLowerCase() !== originalName.toLowerCase()
        )
        const station = buildStationResponse(req, uploadRoot, entries, 0, 1, zipMeta)
        writeBridgePanoramaIndex(uploadRoot, bridgeId, [...withoutDupZip, station])
        return station
      }

      const groups = resolvePanoramaStationGroups(entries)

      if (groups.length > 1) {
        const stations = []
        const failures = []
        for (let idx = 0; idx < groups.length; idx += 1) {
          try {
            stations.push(
              buildStationResponse(req, uploadRoot, groups[idx].entries, idx, groups.length, uploadOpts)
            )
          } catch (err) {
            failures.push(`point ${idx + 1}: ${err.message || 'invalid'}`)
          }
        }
        if (stations.length === 0) {
          const err = new Error(
            failures.length > 0
              ? `No valid panoramas in ZIP (${failures.join('; ')})`
              : 'ZIP has no valid panorama folders'
          )
          err.status = 400
          throw err
        }
        if (bridgeId) persistBridgePanoramaStations(uploadRoot, bridgeId, stations)
        return {
          ...stations[stations.length - 1],
          stations,
          stationCount: stations.length,
        }
      }

      const station = buildStationResponse(req, uploadRoot, groups[0]?.entries || entries, 0, 1, uploadOpts)
      if (bridgeId) persistBridgePanoramaStations(uploadRoot, bridgeId, [station])
      return station
    }

    const station = buildStationResponse(
      req,
      uploadRoot,
      [
        {
          entryName: `sphere${path.extname(filename) || '.jpg'}`,
          getData: () => (hasBuffer ? file.buffer : fs.readFileSync(file.path)),
        },
      ],
      0,
      1,
      { ...uploadOpts, uploadedName: originalName }
    )
    if (bridgeId) persistBridgePanoramaStations(uploadRoot, bridgeId, [station])
    return station
  } finally {
    if (hasPath && fs.existsSync(file.path)) {
      fs.unlinkSync(file.path)
    }
  }
}
