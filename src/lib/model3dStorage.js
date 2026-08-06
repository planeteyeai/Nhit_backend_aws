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

export async function refreshModel3dBucketIndex() {
  bucketIndex = new Map()
  if (!isStorageEnabled()) return bucketIndex
  const keys = await listBucketKeysUnderPrefix(BUCKET_PREFIX)
  for (const key of keys) {
    if (!/\.glb$/i.test(key)) continue
    bucketIndex.set(path.basename(key).toLowerCase(), key)
  }
  return bucketIndex
}

export async function resolveModel3dBucketKey(diskFile) {
  const name = String(diskFile || '').trim()
  if (!name || !isStorageEnabled()) return null

  const exact = `${BUCKET_PREFIX}${name}`
  if (await objectExists(exact)) return exact

  if (!bucketIndex) await refreshModel3dBucketIndex()
  return bucketIndex.get(name.toLowerCase()) || null
}

export async function model3dExistsInBucket(diskFile) {
  return Boolean(await resolveModel3dBucketKey(diskFile))
}

/** Basename list of .glb objects under upload/model_3d/ in the Railway bucket. */
export async function listModel3dBucketFileNames() {
  if (!isStorageEnabled()) return []
  if (!bucketIndex) await refreshModel3dBucketIndex()
  const names = []
  for (const key of bucketIndex.values()) {
    const base = path.basename(key)
    if (/\.glb$/i.test(base) && !/\.glb\.glb$/i.test(base)) names.push(base)
  }
  return names
}

/** Upload valid local GLB binaries to Railway bucket (skips LFS pointers). */
export async function mirrorModel3dGlbsToBucket(model3dRoot) {
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
      if (bucketIndex) bucketIndex.set(name.toLowerCase(), key)
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
