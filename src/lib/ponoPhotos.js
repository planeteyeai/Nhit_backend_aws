import fs from 'fs'
import path from 'path'
import { randomUUID } from 'crypto'

/** Flat location photos (fallback when no 360° panorama). Stored under upload/threed_panoramas/ */
export const PONO_PHOTOS_DIR = 'threed_panoramas'

function bridgePonoFolder(uploadRoot, bridgeId) {
  return path.join(uploadRoot, PONO_PHOTOS_DIR, `bridge_${String(bridgeId)}`)
}

function bridgePonoIndexPath(uploadRoot, bridgeId) {
  return path.join(bridgePonoFolder(uploadRoot, bridgeId), 'index.json')
}

function readBridgePonoIndex(uploadRoot, bridgeId) {
  const indexPath = bridgePonoIndexPath(uploadRoot, bridgeId)
  if (!fs.existsSync(indexPath)) return []
  try {
    const parsed = JSON.parse(fs.readFileSync(indexPath, 'utf8'))
    return Array.isArray(parsed?.photos) ? parsed.photos : Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

function writeBridgePonoIndex(uploadRoot, bridgeId, photos) {
  const folder = bridgePonoFolder(uploadRoot, bridgeId)
  fs.mkdirSync(folder, { recursive: true })
  fs.writeFileSync(
    bridgePonoIndexPath(uploadRoot, bridgeId),
    JSON.stringify({ photos, updatedAt: new Date().toISOString() }, null, 2)
  )
}

function normalizePonoRecord(photo, bridgeId) {
  const id = String(photo?.id || '').trim()
  const url = String(photo?.url || '').trim()
  return {
    id,
    bridgeId: String(bridgeId),
    panorama_type: 'pono',
    displayName: photo?.displayName || photo?.label || photo?.fileName || `Photo ${id}`,
    label: photo?.label || photo?.displayName || photo?.fileName || `Photo ${id}`,
    fileName: photo?.fileName || '',
    url,
    images: { url },
    previewUrl: url,
    markers: Array.isArray(photo?.markers) ? photo.markers : [],
    uploadedAt: photo?.uploadedAt || null,
    chainageKey: photo?.chainageKey || null,
  }
}

/** List panophotos for a bridge (relative /upload URLs). */
export function listBridgePonoPhotos(uploadRoot, bridgeId) {
  const bid = String(bridgeId || '').trim()
  if (!bid) return []
  return readBridgePonoIndex(uploadRoot, bid)
    .map((p) => normalizePonoRecord(p, bid))
    .sort((a, b) => {
      const ta = Date.parse(a.uploadedAt || '') || 0
      const tb = Date.parse(b.uploadedAt || '') || 0
      return ta - tb
    })
}

/** Upload one flat image (JPG/PNG/WEBP) — not a 360° sphere. */
export async function uploadBridgePonoPhoto(req, uploadRoot, bridgeId) {
  const bid = String(bridgeId || '').trim()
  if (!bid) {
    const err = new Error('Invalid bridgeId')
    err.status = 400
    throw err
  }

  const file = req.file
  const hasBuffer = Boolean(file?.buffer?.length)
  const hasPath = Boolean(file?.path)
  if (!hasBuffer && !hasPath) {
    const err = new Error('No file uploaded')
    err.status = 400
    throw err
  }

  const originalName = String(file.originalname || 'photo.jpg')
  const lower = originalName.toLowerCase()
  if (!/\.(jpe?g|png|webp)$/i.test(lower)) {
    const err = new Error('panophoto must be JPG, PNG, or WEBP')
    err.status = 400
    throw err
  }

  const photoId = randomUUID().replace(/-/g, '').slice(0, 12)
  const ext = path.extname(lower) || '.jpg'
  const folder = bridgePonoFolder(uploadRoot, bid)
  fs.mkdirSync(folder, { recursive: true })
  const diskName = `${photoId}${ext}`
  const diskPath = path.join(folder, diskName)
  const data = hasBuffer ? file.buffer : fs.readFileSync(file.path)
  fs.writeFileSync(diskPath, data)

  if (hasPath && fs.existsSync(file.path)) {
    fs.unlinkSync(file.path)
  }

  const url = `/upload/${PONO_PHOTOS_DIR}/bridge_${bid}/${diskName}`
  const baseLabel = path.basename(originalName, ext)
  const existing = readBridgePonoIndex(uploadRoot, bid)
  const record = normalizePonoRecord(
    {
      id: photoId,
      url,
      fileName: originalName,
      displayName: baseLabel || `Photo ${existing.length + 1}`,
      label: baseLabel || `Photo ${existing.length + 1}`,
      markers: [],
      uploadedAt: new Date().toISOString(),
    },
    bid
  )

  writeBridgePonoIndex(uploadRoot, bid, [...existing, record])
  return record
}

export function deleteBridgePonoPhoto(uploadRoot, bridgeId, photoId) {
  const bid = String(bridgeId || '').trim()
  const id = String(photoId || '').trim()
  if (!bid || !id) {
    const err = new Error('Invalid parameters')
    err.status = 400
    throw err
  }

  const existing = readBridgePonoIndex(uploadRoot, bid)
  const target = existing.find((p) => String(p.id) === id)
  if (target?.url) {
    const rel = String(target.url).replace(/^\/upload\//, '')
    const diskPath = path.join(uploadRoot, rel)
    if (fs.existsSync(diskPath)) fs.unlinkSync(diskPath)
  } else {
    const folder = bridgePonoFolder(uploadRoot, bid)
    for (const name of fs.readdirSync(folder)) {
      if (name.startsWith(id)) {
        fs.unlinkSync(path.join(folder, name))
      }
    }
  }

  const next = existing.filter((p) => String(p.id) !== id)
  writeBridgePonoIndex(uploadRoot, bid, next)
  return { deleted: id, remaining: next.length }
}

export function updateBridgePonoPhotoMarkers(uploadRoot, bridgeId, photoId, markers) {
  const bid = String(bridgeId || '').trim()
  const id = String(photoId || '').trim()
  if (!bid || !id) {
    const err = new Error('Invalid parameters')
    err.status = 400
    throw err
  }

  const existing = readBridgePonoIndex(uploadRoot, bid)
  const idx = existing.findIndex((p) => String(p.id) === id)
  if (idx < 0) {
    const err = new Error('panophoto not found')
    err.status = 404
    throw err
  }

  const updated = {
    ...existing[idx],
    markers: Array.isArray(markers) ? markers : [],
  }
  const next = [...existing]
  next[idx] = updated
  writeBridgePonoIndex(uploadRoot, bid, next)
  return normalizePonoRecord(updated, bid)
}
