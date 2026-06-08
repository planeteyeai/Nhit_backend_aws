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

function writePanoramaFromEntries(entries, savePath, baseUrl) {
  let results = {}
  let pType = 'sphere'

  for (const [faceKey, keywords] of Object.entries(FACE_MAP)) {
    const match = entries.find((e) => {
      const n = e.entryName.toLowerCase()
      return keywords.some((k) => n.includes(k))
    })
    if (match) {
      const ext = path.extname(match.entryName) || '.jpg'
      const targetName = `${faceKey}${ext}`
      fs.writeFileSync(path.join(savePath, targetName), match.getData())
      results[faceKey] = `${baseUrl}/${targetName}`
    }
  }

  if (Object.keys(results).length === 6) {
    pType = 'cube'
    return { panorama_type: pType, images: results, markers: [] }
  }

  const imgEntry = entries.find((e) => /\.(jpe?g|png|webp)$/i.test(e.entryName))
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

function bridgePanoramaRoot(uploadRoot, bridgeId) {
  return path.join(uploadRoot, 'bridge_panoramas', String(bridgeId))
}

function bridgePanoramaIndexPath(uploadRoot, bridgeId) {
  return path.join(bridgePanoramaRoot(uploadRoot, bridgeId), 'stations.json')
}

function readBridgePanoramaIndex(uploadRoot, bridgeId) {
  const indexPath = bridgePanoramaIndexPath(uploadRoot, bridgeId)
  if (!fs.existsSync(indexPath)) return []
  try {
    const parsed = JSON.parse(fs.readFileSync(indexPath, 'utf8'))
    return Array.isArray(parsed?.stations) ? parsed.stations : Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

function writeBridgePanoramaIndex(uploadRoot, bridgeId, stations) {
  const root = bridgePanoramaRoot(uploadRoot, bridgeId)
  fs.mkdirSync(root, { recursive: true })
  fs.writeFileSync(
    bridgePanoramaIndexPath(uploadRoot, bridgeId),
    JSON.stringify({ stations, updatedAt: new Date().toISOString() }, null, 2)
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
  const stationId = randomUUID().replace(/-/g, '').slice(0, 8)
  const savePath = bridgeId
    ? path.join(bridgePanoramaRoot(uploadRoot, bridgeId), stationId)
    : path.join(uploadRoot, 'panaroma_3d', stationId)
  fs.mkdirSync(savePath, { recursive: true })
  const baseUrl = bridgeId
    ? `${publicBaseUrl(req)}/upload/bridge_panoramas/${bridgeId}/${stationId}`
    : `${publicBaseUrl(req)}/upload/panaroma_3d/${stationId}`
  const payload = writePanoramaFromEntries(entries, savePath, baseUrl)
  const spread = total > 1
  const angle = total > 1 ? (idx / total) * Math.PI * 2 : 0
  const radius = 0.012
  const lat = spread ? INDIA_BASE_LAT + radius * Math.cos(angle) : INDIA_BASE_LAT + Math.random() * 0.05
  const lng = spread ? INDIA_BASE_LNG + radius * Math.sin(angle) : INDIA_BASE_LNG + Math.random() * 0.05
  return {
    id: stationId,
    bridgeId: bridgeId || undefined,
    ...payload,
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
    if (station?.id) byId.set(String(station.id), station)
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
  const stationDir = path.join(bridgePanoramaRoot(uploadRoot, bridgeId), id)
  if (fs.existsSync(stationDir)) {
    fs.rmSync(stationDir, { recursive: true, force: true })
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

  try {
    if (filename.endsWith('.zip')) {
      const zip = hasBuffer ? new AdmZip(file.buffer) : new AdmZip(file.path)
      const entries = zipEntriesWithoutNoise(zip)
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
      uploadOpts
    )
    if (bridgeId) persistBridgePanoramaStations(uploadRoot, bridgeId, [station])
    return station
  } finally {
    if (hasPath && fs.existsSync(file.path)) {
      fs.unlinkSync(file.path)
    }
  }
}
