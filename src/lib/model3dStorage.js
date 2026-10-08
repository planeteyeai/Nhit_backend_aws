/**
 * Model 3D library: Railway bucket sync + case-insensitive key lookup.
 * GLBs are served from local disk or bucket — no runtime GitHub LFS download required.
 */
import fs from 'fs'
import path from 'path'
import { isValidGlbFile } from './glbValidate.js'
import {
  isStorageEnabled,
  listBucketKeysUnderPrefix,
  objectExists,
  uploadFromFile,
  guessContentType,
} from './storage.js'

const BUCKET_PREFIX = 'upload/model_3d/'

let bucketIndex = null

/** Collapse "glb .glb" / extra spaces so catalog names match bucket objects. */
export function normalizeGlbLookupKey(name) {
  return String(name || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .replace(/\s+\.glb$/i, '.glb')
}

function extractChainageLookupKey(name) {
  const m = String(name || '').match(/(\d+)\s*\+\s*(\d+)/)
  return m ? `${Number(m[1])}+${Number(m[2])}` : ''
}

function indexBucketKey(map, key) {
  const base = path.basename(key)
  if (!/\.glb$/i.test(base)) return
  map.set(base.toLowerCase(), key)
  map.set(normalizeGlbLookupKey(base), key)
  const chainage = extractChainageLookupKey(base)
  if (chainage) map.set(`chainage:${chainage}`, key)
}

export async function refreshModel3dBucketIndex() {
  bucketIndex = new Map()
  if (!isStorageEnabled()) return bucketIndex
  const keys = await listBucketKeysUnderPrefix(BUCKET_PREFIX)
  for (const key of keys) {
    indexBucketKey(bucketIndex, key)
  }
  return bucketIndex
}

export async function resolveModel3dBucketKey(diskFile) {
  const name = String(diskFile || '').trim()
  if (!name || !isStorageEnabled()) return null

  const exact = `${BUCKET_PREFIX}${name}`
  if (await objectExists(exact)) return exact

  const spaced = name.replace(/(\S)\.glb$/i, '$1 .glb')
  if (spaced !== name) {
    const spacedKey = `${BUCKET_PREFIX}${spaced}`
    if (await objectExists(spacedKey)) return spacedKey
  }

  if (!bucketIndex) await refreshModel3dBucketIndex()
  const hit =
    bucketIndex.get(name.toLowerCase()) ||
    bucketIndex.get(normalizeGlbLookupKey(name)) ||
    bucketIndex.get(`chainage:${extractChainageLookupKey(name)}`)
  if (hit) return hit

  await refreshModel3dBucketIndex()
  return (
    bucketIndex.get(name.toLowerCase()) ||
    bucketIndex.get(normalizeGlbLookupKey(name)) ||
    bucketIndex.get(`chainage:${extractChainageLookupKey(name)}`) ||
    null
  )
}

export async function model3dExistsInBucket(diskFile) {
  return Boolean(await resolveModel3dBucketKey(diskFile))
}

/** Basename list of .glb objects under upload/model_3d/ in the Railway bucket. */
export async function listModel3dBucketFileNames() {
  if (!isStorageEnabled()) return []
  if (!bucketIndex) await refreshModel3dBucketIndex()
  const names = new Set()
  for (const key of bucketIndex.values()) {
    const base = path.basename(key)
    if (/\.glb$/i.test(base)) names.add(base)
  }
  return [...names]
}

/**
 * Upload valid local GLB binaries to the bucket (skips LFS pointers).
 * Opt-in only — auto-mirror on boot was re-creating deleted root GLBs on S3.
 * Set MODEL3D_MIRROR_TO_BUCKET=1 to enable.
 */
export async function mirrorModel3dGlbsToBucket(model3dRoot) {
  const flag = String(process.env.MODEL3D_MIRROR_TO_BUCKET || '').trim().toLowerCase()
  const enabled = flag === '1' || flag === 'true' || flag === 'yes' || flag === 'on'
  if (!enabled) {
    return { ok: 0, skipped: 0, failed: 0, disabled: true }
  }
  if (!isStorageEnabled() || !model3dRoot || !fs.existsSync(model3dRoot)) {
    return { ok: 0, skipped: 0, failed: 0 }
  }

  let ok = 0
  let skipped = 0
  let failed = 0

  const names = fs
    .readdirSync(model3dRoot, { withFileTypes: true })
    .filter((d) => d.isFile() && /\.glb(\.glb)?$/i.test(d.name))
    .map((d) => d.name)

  for (const name of names) {
    const fullPath = path.join(model3dRoot, name)
    if (!isValidGlbFile(fullPath)) {
      skipped += 1
      continue
    }
    const key = `${BUCKET_PREFIX}${name}`
    try {
      if (await objectExists(key)) {
        skipped += 1
        continue
      }
      await uploadFromFile(fullPath, key, guessContentType(key))
      ok += 1
      if (bucketIndex) indexBucketKey(bucketIndex, key)
    } catch (e) {
      failed += 1
      console.error('[model-3d] bucket upload failed:', name, e.message)
    }
  }

  return { ok, skipped, failed }
}

export async function warmModel3dStorage(model3dRoot) {
  if (!model3dRoot) return { bucketIndex: 0, mirror: { ok: 0, skipped: 0, failed: 0 } }

  await refreshModel3dBucketIndex()
  const mirror = await mirrorModel3dGlbsToBucket(model3dRoot)

  if (isStorageEnabled()) {
    console.log(
      `[model-3d] bucket ready: ${bucketIndex?.size ?? 0} keys indexed, ${mirror.ok} uploaded, ${mirror.skipped} skipped`
    )
  }

  return { bucketIndex: bucketIndex?.size ?? 0, mirror }
}
