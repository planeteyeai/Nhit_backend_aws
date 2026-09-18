import fs from 'fs'
import path from 'path'
import { randomUUID } from 'crypto'
import {
  deleteBucketObject,
  isStorageEnabled,
  listBucketKeysUnderPrefix,
  mirrorUploadRelPaths,
  readObjectText,
} from './storage.js'

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

async function hydrateBridgePonoIndexFromBucket(uploadRoot, bridgeId) {
  if (!isStorageEnabled()) return false
  const bid = String(bridgeId || '').trim()
  if (!bid) return false
  const indexPath = bridgePonoIndexPath(uploadRoot, bid)
  if (fs.existsSync(indexPath)) return false

  const key = `upload/${PONO_PHOTOS_DIR}/bridge_${bid}/index.json`
  try {
    const text = await readObjectText(key)
    if (!text) return false
    const parsed = JSON.parse(text)
    const photos = Array.isArray(parsed?.photos) ? parsed.photos : Array.isArray(parsed) ? parsed : []
    if (!photos.length) return false
    writeBridgePonoIndex(uploadRoot, bid, photos)
    return true
  } catch (e) {
    const msg = String(e?.message || e || '')
    if (!/NoSuchKey|not found|does not exist|404/i.test(msg)) {
      console.warn('[pono] hydrate index from bucket failed:', bid, msg)
    }
    return false
  }
}

/** If index JSON is missing, rebuild from image files present in the bridge folder (disk or S3). */
async function rebuildBridgePonoIndexFromMedia(uploadRoot, bridgeId) {
  const bid = String(bridgeId || '').trim()
  if (!bid) return []

  const folder = bridgePonoFolder(uploadRoot, bid)
  const photos = []

  if (fs.existsSync(folder)) {
    for (const name of fs.readdirSync(folder)) {
      if (!/\.(jpe?g|png|webp)$/i.test(name)) continue
      const id = path.basename(name, path.extname(name))
      photos.push(
        normalizePonoRecord(
          {
            id,
            url: `/upload/${PONO_PHOTOS_DIR}/bridge_${bid}/${name}`,
            fileName: name,
            displayName: id,
            label: id,
            uploadedAt: null,
          },
          bid
        )
      )
    }
  }

  if (!photos.length && isStorageEnabled()) {
    const prefix = `upload/${PONO_PHOTOS_DIR}/bridge_${bid}/`
    try {
      const keys = await listBucketKeysUnderPrefix(prefix)
      for (const key of keys) {
        const name = path.basename(key)
        if (!/\.(jpe?g|png|webp)$/i.test(name) || name === 'index.json') continue
        const id = path.basename(name, path.extname(name))
        photos.push(
          normalizePonoRecord(
            {
              id,
              url: `/upload/${PONO_PHOTOS_DIR}/bridge_${bid}/${name}`,
              fileName: name,
              displayName: id,
              label: id,
              uploadedAt: null,
            },
            bid
          )
        )
      }
    } catch {
      /* ignore */
    }
  }

  if (photos.length) {
    writeBridgePonoIndex(uploadRoot, bid, photos)
    await mirrorPonoBridgeFiles(uploadRoot, bid)
  }
  return photos
}

export async function ensureBridgePonoIndex(uploadRoot, bridgeId) {
  const bid = String(bridgeId || '').trim()
  if (!bid) return []
  const indexPath = bridgePonoIndexPath(uploadRoot, bid)
  let photos = readBridgePonoIndex(uploadRoot, bid)
  if (fs.existsSync(indexPath)) return photos
  await hydrateBridgePonoIndexFromBucket(uploadRoot, bid)
  photos = readBridgePonoIndex(uploadRoot, bid)
  if (photos.length) return photos
  return rebuildBridgePonoIndexFromMedia(uploadRoot, bid)
}

function writeBridgePonoIndex(uploadRoot, bridgeId, photos) {
  const folder = bridgePonoFolder(uploadRoot, bridgeId)
  fs.mkdirSync(folder, { recursive: true })
  fs.writeFileSync(
    bridgePonoIndexPath(uploadRoot, bridgeId),
    JSON.stringify({ photos, updatedAt: new Date().toISOString() }, null, 2)
  )
}

async function mirrorPonoBridgeFiles(uploadRoot, bridgeId, diskName = '') {
  const bid = String(bridgeId || '').trim()
  if (!bid) return { ok: 0, failed: 0 }
  const base = `upload/${PONO_PHOTOS_DIR}/bridge_${bid}`
  const paths = [`${base}/index.json`]
  if (diskName) paths.unshift(`${base}/${diskName}`)
  return mirrorUploadRelPaths(paths, uploadRoot)
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
export async function listBridgePonoPhotos(uploadRoot, bridgeId) {
  const bid = String(bridgeId || '').trim()
  if (!bid) return []
  const photos = await ensureBridgePonoIndex(uploadRoot, bid)
  return photos
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
  await mirrorPonoBridgeFiles(uploadRoot, bid, diskName)
  return record
}

export async function deleteBridgePonoPhoto(uploadRoot, bridgeId, photoId) {
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
    if (isStorageEnabled() && rel) {
      await deleteBucketObject(`upload/${rel}`)
    }
  } else {
    const folder = bridgePonoFolder(uploadRoot, bid)
    if (fs.existsSync(folder)) {
      for (const name of fs.readdirSync(folder)) {
        if (name.startsWith(id)) {
          fs.unlinkSync(path.join(folder, name))
          if (isStorageEnabled()) {
            await deleteBucketObject(`upload/${PONO_PHOTOS_DIR}/bridge_${bid}/${name}`)
          }
        }
      }
    }
  }

  const next = existing.filter((p) => String(p.id) !== id)
  writeBridgePonoIndex(uploadRoot, bid, next)
  await mirrorPonoBridgeFiles(uploadRoot, bid)
  return { deleted: id, remaining: next.length }
}

export async function updateBridgePonoPhotoMarkers(uploadRoot, bridgeId, photoId, markers) {
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
  await mirrorPonoBridgeFiles(uploadRoot, bid)
  return normalizePonoRecord(updated, bid)
}
