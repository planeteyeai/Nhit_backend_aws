import fs from 'fs'
import path from 'path'
import { randomUUID } from 'crypto'
import AdmZip from 'adm-zip'
import {
  deleteBucketPrefix,
  isStorageEnabled,
  mirrorUploadRelPath,
  objectExists,
  readObjectText,
} from './storage.js'

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

/** Multiple loose images at ZIP root (no folders) → one station per image. */
function groupStandaloneRootImages(entries) {
  const images = imageEntriesOnly(entries)
  if (images.length < 2) return null
  const hasSubfolder = images.some((e) => String(e.entryName || '').includes('/'))
  if (hasSubfolder) return null
  return images.map((img) => ({
    entries: [img],
    label: path.basename(String(img.entryName || ''), path.extname(img.entryName || '')),
  }))
}

function planPositionForIndex(index, total) {
  if (total <= 1) return { planX: 50, planY: 50 }
  const startX = 8
  const endX = 92
  const y = 50
  const t = index / (total - 1)
  return { planX: startX + (endX - startX) * t, planY: y }
}

const DEFAULT_BRIDGE_BEARING_DEG = 55

function sortPanoramaStations(stations) {
  if (!Array.isArray(stations) || stations.length < 2) return stations || []
  return [...stations].sort((a, b) => {
    const ta = Date.parse(a?.uploadedAt || '') || 0
    const tb = Date.parse(b?.uploadedAt || '') || 0
    if (ta !== tb) return ta - tb
    const na = String(a?.uploadedName || a?.displayName || a?.label || '')
    const nb = String(b?.uploadedName || b?.displayName || b?.label || '')
    const nameCmp = na.localeCompare(nb, undefined, { numeric: true, sensitivity: 'base' })
    if (nameCmp !== 0) return nameCmp
    return String(a?.id || '').localeCompare(String(b?.id || ''), undefined, { numeric: true })
  })
}

/** Spread stations along bridge axis (~35–80 m apart) for satellite map markers. */
function linearSpreadCoords(index, total, baseLat = INDIA_BASE_LAT, baseLng = INDIA_BASE_LNG) {
  if (total <= 1) {
    return { lat: baseLat, lng: baseLng, latitude: baseLat, longitude: baseLng }
  }
  const stepMeters = Math.max(35, Math.min(80, 520 / total))
  const metersPerDegLat = 111320
  const metersPerDegLng = 111320 * Math.cos((baseLat * Math.PI) / 180)
  const offset = index - (total - 1) / 2
  const bearing = (DEFAULT_BRIDGE_BEARING_DEG * Math.PI) / 180
  const distM = offset * stepMeters
  const lat = baseLat + (distM * Math.cos(bearing)) / metersPerDegLat
  const lng = baseLng + (distM * Math.sin(bearing)) / metersPerDegLng
  return { lat, lng, latitude: lat, longitude: lng }
}

function stationDisplayLabel(idx, options = {}) {
  const mpIndex = idx + 1
  const uploadedName = String(options?.uploadedName || '').trim()
  const folderLabel = String(options?.label || '').trim()
  const zipBase = uploadedName ? path.basename(uploadedName, path.extname(uploadedName)) : ''
  if (folderLabel && folderLabel !== zipBase) {
    return `MP ${mpIndex} · ${folderLabel}`
  }
  if (/\.zip$/i.test(uploadedName)) {
    return `MP ${mpIndex} · ${zipBase}`
  }
  if (uploadedName) {
    return `MP ${mpIndex} · ${zipBase}`
  }
  return `MP ${mpIndex}`
}

function realignBridgeStationPositions(stations) {
  const ordered = sortPanoramaStations(stations)
  const total = ordered.length
  return ordered.map((station, index) => {
    const plan = planPositionForIndex(index, total)
    const coords = linearSpreadCoords(index, total)
    const geotagged = Boolean(station?.geotagged)
    const label = stationDisplayLabel(index, {
      uploadedName: station?.uploadedName,
      label: station?.label,
    })
    return {
      ...station,
      displayName: label,
      label,
      planX: plan.planX,
      planY: plan.planY,
      lat: geotagged && station.lat != null ? station.lat : coords.lat,
      lng: geotagged && station.lng != null ? station.lng : coords.lng,
      latitude: geotagged && station.latitude != null ? station.latitude : coords.latitude,
      longitude: geotagged && station.longitude != null ? station.longitude : coords.longitude,
    }
  })
}

function resolvePanoramaStationGroups(entries) {
  const standalone = groupStandaloneRootImages(entries)
  if (standalone?.length > 1) return standalone

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
  pType = 'flat'
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

/** Pull stations.{bridgeId}.json from S3 when local disk is empty (Railway redeploy). */
async function hydrateBridgePanoramaIndexFromBucket(uploadRoot, bridgeId) {
  if (!isStorageEnabled()) return false
  const id = String(bridgeId || '').trim()
  if (!id) return false
  const indexPath = bridgePanoramaIndexPath(uploadRoot, id)
  if (fs.existsSync(indexPath) && parseIndexFile(indexPath).length > 0) return false

  const key = `upload/${PANORAMA_3D_DIR}/stations.${id}.json`
  try {
    const text = await readObjectText(key)
    if (!text) return false
    const parsed = JSON.parse(text)
    const stations = Array.isArray(parsed?.stations)
      ? parsed.stations
      : Array.isArray(parsed)
        ? parsed
        : []
    if (!stations.length) return false
    writeBridgePanoramaIndex(uploadRoot, id, stations.map(normalizeStationRecord))
    if (isStorageEnabled()) {
      await mirrorUploadRelPath(`upload/${PANORAMA_3D_DIR}/stations.${id}.json`, uploadRoot).catch(() => false)
    }
    return true
  } catch (e) {
    const msg = String(e?.message || e || '')
    // Missing index for a bridge is normal — don't spam Railway logs.
    if (!/NoSuchKey|not found|does not exist|404/i.test(msg)) {
      console.warn('[panorama] hydrate index from bucket failed:', id, msg)
    }
    return false
  }
}

async function stationImagesFromBucketOrDisk(uploadRoot, stationId, panoramaType = 'sphere') {
  const id = String(stationId || '').trim()
  if (!id) return null
  const baseUrl = `/upload/${PANORAMA_3D_DIR}/${id}`
  const localDir = stationDir(uploadRoot, id)

  const localSphere = ['sphere.jpg', 'sphere.jpeg', 'sphere.png', 'sphere.webp']
    .map((name) => path.join(localDir, name))
    .find((p) => fs.existsSync(p))
  if (localSphere) {
    return {
      panorama_type: 'flat',
      images: { url: `${baseUrl}/${path.basename(localSphere)}` },
      previewUrl: `${baseUrl}/${path.basename(localSphere)}`,
    }
  }

  const faceNames = ['px', 'nx', 'py', 'ny', 'pz', 'nz']
  const localFaces = {}
  for (const face of faceNames) {
    const hit = ['.jpg', '.jpeg', '.png', '.webp']
      .map((ext) => path.join(localDir, `${face}${ext}`))
      .find((p) => fs.existsSync(p))
    if (hit) localFaces[face] = `${baseUrl}/${path.basename(hit)}`
  }
  if (Object.keys(localFaces).length >= 4) {
    return {
      panorama_type: 'cube',
      images: localFaces,
      previewUrl: localFaces.px || localFaces.pz || Object.values(localFaces)[0],
    }
  }

  if (!isStorageEnabled()) return null

  const sphereCandidates = ['sphere.jpg', 'sphere.jpeg', 'sphere.png', 'sphere.webp']
  const sphereHits = await Promise.all(
    sphereCandidates.map(async (name) => ({
      name,
      ok: await objectExists(`upload/${PANORAMA_3D_DIR}/${id}/${name}`),
    }))
  )
  const sphereHit = sphereHits.find((h) => h.ok)
  if (sphereHit) {
    return {
      panorama_type: 'flat',
      images: { url: `${baseUrl}/${sphereHit.name}` },
      previewUrl: `${baseUrl}/${sphereHit.name}`,
    }
  }

  const faceChecks = await Promise.all(
    faceNames.flatMap((face) =>
      ['.jpg', '.jpeg', '.png', '.webp'].map(async (ext) => {
        const name = `${face}${ext}`
        const ok = await objectExists(`upload/${PANORAMA_3D_DIR}/${id}/${name}`)
        return ok ? { face, name } : null
      })
    )
  )
  const faces = {}
  for (const hit of faceChecks) {
    if (!hit || faces[hit.face]) continue
    faces[hit.face] = `${baseUrl}/${hit.name}`
  }
  if (Object.keys(faces).length >= 4 || (panoramaType === 'cube' && Object.keys(faces).length > 0)) {
    return {
      panorama_type: 'cube',
      images: faces,
      previewUrl: faces.px || faces.pz || Object.values(faces)[0],
    }
  }
  return null
}

/** Rebuild index from DB station rows + S3/disk media when JSON index is missing. */
export async function rebuildBridgePanoramaIndexFromDb(uploadRoot, bridgeId, dbStations = []) {
  const id = String(bridgeId || '').trim()
  if (!id || !Array.isArray(dbStations) || dbStations.length === 0) return []

  const rebuilt = []
  for (const row of dbStations) {
    const stationId = String(row.id || row.station_id || '').trim()
    if (!stationId) continue
    const media = await stationImagesFromBucketOrDisk(
      uploadRoot,
      stationId,
      row.panorama_type || row.panoramaType || 'sphere'
    )
    if (!media) continue
    rebuilt.push(
      normalizeStationRecord({
        id: stationId,
        bridgeId: id,
        panorama_type: media.panorama_type,
        images: media.images,
        previewUrl: media.previewUrl,
        uploadedName: row.uploaded_name || row.uploadedName || undefined,
        displayName: row.display_name || row.displayName || row.label || `Panorama ${stationId}`,
        label: row.display_name || row.displayName || row.label || `Panorama ${stationId}`,
        lat: row.lat != null ? Number(row.lat) : undefined,
        lng: row.lng != null ? Number(row.lng) : undefined,
        latitude: row.lat != null ? Number(row.lat) : undefined,
        longitude: row.lng != null ? Number(row.lng) : undefined,
        planX: row.plan_x != null ? Number(row.plan_x) : undefined,
        planY: row.plan_y != null ? Number(row.plan_y) : undefined,
        uploadedAt: row.uploaded_at || row.uploadedAt || undefined,
      })
    )
  }

  if (rebuilt.length) {
    writeBridgePanoramaIndex(uploadRoot, id, realignBridgeStationPositions(rebuilt))
    if (isStorageEnabled()) {
      await mirrorUploadRelPath(`upload/${PANORAMA_3D_DIR}/stations.${id}.json`, uploadRoot).catch(() => false)
    }
  }
  return rebuilt
}

export async function ensureBridgePanoramaIndex(uploadRoot, bridgeId, dbStations = []) {
  const id = String(bridgeId || '').trim()
  if (!id) return []

  let stations = readBridgePanoramaIndex(uploadRoot, id)
  const indexPath = bridgePanoramaIndexPath(uploadRoot, id)
  // Local index file is source of truth, including empty (user removed every station).
  if (fs.existsSync(indexPath)) {
    if (Array.isArray(dbStations) && dbStations.length > stations.length) {
      const rebuilt = await rebuildBridgePanoramaIndexFromDb(uploadRoot, id, dbStations)
      if (rebuilt.length > stations.length) return rebuilt
    }
    return stations
  }

  await hydrateBridgePanoramaIndexFromBucket(uploadRoot, id)
  stations = readBridgePanoramaIndex(uploadRoot, id)
  if (stations.length > 0) return stations

  return rebuildBridgePanoramaIndexFromDb(uploadRoot, id, dbStations)
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
  // Relative URL — works with Vite /upload proxy (port 5173 → 8080)
  const baseUrl = `/upload/${PANORAMA_3D_DIR}/${stationId}`
  const payload = writePanoramaFromEntries(entries, savePath, baseUrl)
  const plan = planPositionForIndex(idx, total)
  const coords = linearSpreadCoords(idx, total)
  const displayName = stationDisplayLabel(idx, options)
  return {
    id: stationId,
    bridgeId: bridgeId || undefined,
    ...payload,
    uploadedName: uploadedName || undefined,
    displayName,
    label: displayName,
    planX: plan.planX,
    planY: plan.planY,
    lat: coords.lat,
    lng: coords.lng,
    latitude: coords.latitude,
    longitude: coords.longitude,
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
  writeBridgePanoramaIndex(uploadRoot, bridgeId, realignBridgeStationPositions(Array.from(byId.values())))
}

export async function listBridgePanoramas(uploadRoot, bridgeId, _req, dbStations = []) {
  const stations = await ensureBridgePanoramaIndex(uploadRoot, bridgeId, dbStations)
  return realignBridgeStationPositions(stations).map((station) => ({
    ...station,
    previewUrl: station.previewUrl || panoramaPreviewUrl(station),
  }))
}

export async function deleteBridgePanorama(uploadRoot, bridgeId, stationId) {
  const id = String(stationId || '').trim()
  const bid = String(bridgeId || '').trim()
  if (!id) {
    const err = new Error('Invalid station id')
    err.status = 400
    throw err
  }
  const dir = stationDir(uploadRoot, id)
  if (fs.existsSync(dir)) {
    fs.rmSync(dir, { recursive: true, force: true })
  }
  const legacyDir = path.join(legacyBridgePanoramaRoot(uploadRoot, bid), id)
  if (fs.existsSync(legacyDir)) {
    fs.rmSync(legacyDir, { recursive: true, force: true })
  }
  const next = realignBridgeStationPositions(
    readBridgePanoramaIndex(uploadRoot, bid).filter((s) => String(s.id) !== id)
  )
  writeBridgePanoramaIndex(uploadRoot, bid, next)

  if (isStorageEnabled()) {
    await deleteBucketPrefix(`upload/${PANORAMA_3D_DIR}/${id}/`)
    if (bid) {
      await deleteBucketPrefix(`upload/bridge_panoramas/${bid}/${id}/`)
      await mirrorUploadRelPath(`upload/${PANORAMA_3D_DIR}/stations.${bid}.json`, uploadRoot)
    }
  }

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
      const zipMeta = {
        ...uploadOpts,
        uploadedName: originalName,
        label: path.basename(originalName, path.extname(originalName)),
      }

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

        const idx = withoutDupZip.length
        const total = idx + 1
        const station = buildStationResponse(req, uploadRoot, entries, idx, total, zipMeta)
        const aligned = realignBridgeStationPositions([...withoutDupZip, station])
        writeBridgePanoramaIndex(uploadRoot, bridgeId, aligned)
        const saved = aligned[aligned.length - 1]
        return { ...saved, stations: [saved], stationCount: 1 }
      }

      const station = buildStationResponse(req, uploadRoot, entries, 0, 1, zipMeta)
      if (bridgeId) persistBridgePanoramaStations(uploadRoot, bridgeId, [station])
      return { ...station, stations: [station], stationCount: 1 }
    }

    if (bridgeId) {
      const existing = readBridgePanoramaIndex(uploadRoot, bridgeId)
      const idx = existing.length
      const total = idx + 1
      const station = buildStationResponse(
        req,
        uploadRoot,
        [
          {
            entryName: `sphere${path.extname(filename) || '.jpg'}`,
            getData: () => (hasBuffer ? file.buffer : fs.readFileSync(file.path)),
          },
        ],
        idx,
        total,
        { ...uploadOpts, uploadedName: originalName, label: path.basename(originalName, path.extname(originalName)) }
      )
      const aligned = realignBridgeStationPositions([...existing, station])
      writeBridgePanoramaIndex(uploadRoot, bridgeId, aligned)
      return aligned[aligned.length - 1]
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
      { ...uploadOpts, uploadedName: originalName, label: path.basename(originalName, path.extname(originalName)) }
    )
    return station
  } finally {
    if (hasPath && fs.existsSync(file.path)) {
      fs.unlinkSync(file.path)
    }
  }
}
