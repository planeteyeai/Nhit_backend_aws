/**
 * S3-compatible storage (Railway Bucket or native AWS S3).
 * Env vars (AWS SDK style):
 *   AWS_S3_BUCKET_NAME, AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY
 *   AWS_DEFAULT_REGION (required for native AWS, e.g. ap-south-1)
 *   AWS_ENDPOINT_URL (optional — set for Railway/MinIO; omit for Amazon S3)
 */
import fs from 'fs'
import path from 'path'
import { pipeline } from 'stream/promises'
import { Readable } from 'stream'
import {
  S3Client,
  PutObjectCommand,
  HeadObjectCommand,
  GetObjectCommand,
  ListObjectsV2Command,
  DeleteObjectCommand,
  DeleteObjectsCommand,
} from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'

const PRESIGN_DEFAULT_SEC = Number(process.env.PRESIGNED_URL_EXPIRY_SEC || 3600)

function bucketName() {
  return String(
    process.env.AWS_S3_BUCKET_NAME ||
      process.env.AWS_STORAGE_BUCKET_NAME ||
      process.env.S3_BUCKET ||
      ''
  ).trim()
}

function endpoint() {
  return String(process.env.AWS_ENDPOINT_URL || process.env.S3_ENDPOINT || '').trim()
}

function region() {
  const configured = String(
    process.env.AWS_DEFAULT_REGION ||
      process.env.AWS_S3_REGION_NAME ||
      process.env.S3_REGION ||
      ''
  ).trim()
  if (configured) return configured
  // Native AWS needs a real region; Railway/custom endpoints often use "auto".
  return endpoint() ? 'auto' : 'us-east-1'
}

function accessKeyId() {
  return String(process.env.AWS_ACCESS_KEY_ID || process.env.S3_ACCESS_KEY_ID || '').trim()
}

function secretAccessKey() {
  return String(process.env.AWS_SECRET_ACCESS_KEY || process.env.S3_SECRET_ACCESS_KEY || '').trim()
}

/** True when S3/Railway bucket credentials are configured. */
export function isStorageEnabled() {
  const backend = String(process.env.STORAGE_BACKEND || 'auto').trim().toLowerCase()
  if (backend === 'local' || backend === 'disk') return false
  // Endpoint is optional: native Amazon S3 uses the regional AWS endpoint automatically.
  return Boolean(bucketName() && accessKeyId() && secretAccessKey())
}

let _client = null

function getClient() {
  if (!isStorageEnabled()) return null
  if (!_client) {
    const cfg = {
      region: region(),
      credentials: {
        accessKeyId: accessKeyId(),
        secretAccessKey: secretAccessKey(),
      },
      forcePathStyle: false,
    }
    const ep = endpoint()
    if (ep) cfg.endpoint = ep
    _client = new S3Client(cfg)
  }
  return _client
}

/** Normalize DB / URL path to S3 object key (no leading slash). */
export function toObjectKey(storedPath) {
  const raw = String(storedPath || '').trim().replace(/\\/g, '/')
  if (!raw) return ''
  if (/^https?:\/\//i.test(raw)) return ''
  return raw.replace(/^\/+/, '')
}

export function isS3ObjectKey(storedPath) {
  const key = toObjectKey(storedPath)
  if (!key) return false
  if (key.startsWith('upload/')) return true
  if (key.startsWith('images/') || key.startsWith('glb/') || key.startsWith('pdf/') || key.startsWith('panoramas/')) {
    return true
  }
  return false
}

export function storageStatus() {
  return {
    enabled: isStorageEnabled(),
    bucket: bucketName() || null,
    endpoint: endpoint() || null,
    region: region(),
  }
}

export async function objectExists(key) {
  const client = getClient()
  const k = toObjectKey(key)
  if (!client || !k) return false
  try {
    await client.send(new HeadObjectCommand({ Bucket: bucketName(), Key: k }))
    return true
  } catch {
    return false
  }
}

export function getS3Client() {
  return getClient()
}

export function getBucketName() {
  return bucketName()
}

/** List object keys under a prefix (paginated). */
export async function listBucketKeysUnderPrefix(prefix) {
  const objects = await listBucketObjectsUnderPrefix(prefix)
  return objects.map((o) => o.key)
}

/** List objects under a prefix with size metadata (paginated). */
export async function listBucketObjectsUnderPrefix(prefix) {
  const client = getClient()
  const p = String(prefix || '').replace(/^\/+/, '')
  if (!client || !p) return []

  const objects = []
  let continuationToken
  do {
    const out = await client.send(
      new ListObjectsV2Command({
        Bucket: bucketName(),
        Prefix: p,
        ContinuationToken: continuationToken,
      })
    )
    for (const item of out.Contents || []) {
      if (item.Key && !item.Key.endsWith('/')) {
        objects.push({
          key: item.Key,
          sizeBytes: Number(item.Size || 0),
        })
      }
    }
    continuationToken = out.IsTruncated ? out.NextContinuationToken : undefined
  } while (continuationToken)

  return objects
}

/** Delete one object from the bucket. */
export async function deleteBucketObject(key) {
  if (!isStorageEnabled()) return false
  const client = getClient()
  const k = toObjectKey(key)
  if (!client || !k) return false
  try {
    await client.send(new DeleteObjectCommand({ Bucket: bucketName(), Key: k }))
    return true
  } catch (e) {
    console.error('[storage] delete object failed:', k, e.message)
    return false
  }
}

/** Delete every object under a prefix (station folder, panophoto, markers). */
export async function deleteBucketPrefix(prefix) {
  if (!isStorageEnabled()) return { ok: 0, failed: 0 }
  const p = String(prefix || '').replace(/^\/+/, '').replace(/\/?$/, '/')
  if (!p || p === 'upload/') return { ok: 0, failed: 0 }

  const keys = await listBucketKeysUnderPrefix(p)
  if (!keys.length) return { ok: 0, failed: 0 }

  const client = getClient()
  if (!client) return { ok: 0, failed: keys.length }

  let ok = 0
  let failed = 0
  for (let i = 0; i < keys.length; i += 1000) {
    const chunk = keys.slice(i, i + 1000)
    try {
      const out = await client.send(
        new DeleteObjectsCommand({
          Bucket: bucketName(),
          Delete: {
            Objects: chunk.map((Key) => ({ Key })),
            Quiet: true,
          },
        }),
      )
      const errCount = Array.isArray(out.Errors) ? out.Errors.length : 0
      ok += chunk.length - errCount
      failed += errCount
      if (errCount) {
        console.error('[storage] delete prefix partial fail:', p, out.Errors)
      }
    } catch (e) {
      failed += chunk.length
      console.error('[storage] delete prefix failed:', p, e.message)
    }
  }
  return { ok, failed }
}

export async function uploadFromFile(localPath, key, contentType) {
  const client = getClient()
  const k = toObjectKey(key)
  if (!client || !k) return false
  await client.send(
    new PutObjectCommand({
      Bucket: bucketName(),
      Key: k,
      Body: fs.createReadStream(localPath),
      ContentType: contentType || guessContentType(k),
    }),
  )
  return true
}

export async function uploadBuffer(buffer, key, contentType) {
  const client = getClient()
  const k = toObjectKey(key)
  if (!client || !k) return false
  await client.send(
    new PutObjectCommand({
      Bucket: bucketName(),
      Key: k,
      Body: buffer,
      ContentType: contentType || guessContentType(k),
    }),
  )
  return true
}

/** Mirror a file already saved under upload/ to the bucket (same key as DB path). */
export async function mirrorUploadRelPath(relPath, uploadRootDir) {
  if (!isStorageEnabled()) return false
  const key = toObjectKey(relPath)
  if (!key) return false
  const safeRoot = path.resolve(uploadRootDir)
  const rel = key.startsWith('upload/') ? key.slice('upload/'.length) : key
  const target = path.normalize(path.join(safeRoot, rel))
  if (!target.startsWith(safeRoot)) return false
  if (!fs.existsSync(target)) return false
  try {
    await uploadFromFile(target, key, guessContentType(key))
    return true
  } catch (e) {
    console.error('[storage] mirror failed:', key, e.message)
    return false
  }
}

/** Mirror many files under upload/ (inspection images, bridge images, etc.). */
export async function mirrorUploadRelPaths(relPaths, uploadRootDir) {
  if (!isStorageEnabled() || !Array.isArray(relPaths)) return { ok: 0, failed: 0 }
  let ok = 0
  let failed = 0
  for (const rel of relPaths) {
    const done = await mirrorUploadRelPath(rel, uploadRootDir)
    if (done) ok += 1
    else failed += 1
  }
  return { ok, failed }
}

/** Recursively mirror a folder under upload/ to the bucket (panorama faces, stations.json). */
export async function mirrorUploadDirectory(relDir, uploadRootDir) {
  if (!isStorageEnabled()) return { ok: 0, failed: 0 }
  const keyPrefix = toObjectKey(relDir)
  if (!keyPrefix) return { ok: 0, failed: 0 }
  const safeRoot = path.resolve(uploadRootDir)
  const rel = keyPrefix.startsWith('upload/') ? keyPrefix.slice('upload/'.length) : keyPrefix
  const dirPath = path.normalize(path.join(safeRoot, rel))
  if (!dirPath.startsWith(safeRoot) || !fs.existsSync(dirPath)) {
    return { ok: 0, failed: 0 }
  }

  let ok = 0
  let failed = 0

  async function walk(currentDir, keyRel) {
    const entries = fs.readdirSync(currentDir, { withFileTypes: true })
    for (const ent of entries) {
      const full = path.join(currentDir, ent.name)
      const objectKey = `upload/${keyRel}/${ent.name}`.replace(/\\/g, '/')
      if (ent.isDirectory()) {
        await walk(full, `${keyRel}/${ent.name}`)
      } else if (ent.isFile() && ent.name !== '.gitkeep') {
        try {
          await uploadFromFile(full, objectKey, guessContentType(objectKey))
          ok += 1
        } catch (e) {
          failed += 1
          console.error('[storage] mirror dir failed:', objectKey, e.message)
        }
      }
    }
  }

  try {
    await walk(dirPath, rel)
  } catch (e) {
    console.error('[storage] mirror directory failed:', keyPrefix, e.message)
  }
  return { ok, failed }
}

/** After panorama upload — mirror station folder(s) and optional stations index. */
export async function mirrorPanoramaUploadResult(uploadRootDir, { bridgeId, payload } = {}) {
  if (!isStorageEnabled() || !payload) return { ok: 0, failed: 0 }
  let ok = 0
  let failed = 0

  const stations = Array.isArray(payload.stations)
    ? payload.stations
    : payload.id
      ? [payload]
      : []

  for (const station of stations) {
    const stationId = String(station?.id || '').trim()
    if (!stationId) continue
    const relDir = `upload/panaroma_3d/${stationId}`
    const r = await mirrorUploadDirectory(relDir, uploadRootDir)
    ok += r.ok
    failed += r.failed
  }

  if (bridgeId) {
    const idx = await mirrorUploadRelPath(`upload/panaroma_3d/stations.${bridgeId}.json`, uploadRootDir)
    if (idx) ok += 1
    else failed += 1
  }

  return { ok, failed }
}

/** Stream bucket object through API (avoids CORS issues with presigned redirect in browser). */
export async function pipeBucketObjectToResponse(res, key, { range } = {}) {
  if (!isStorageEnabled()) return false
  const k = toObjectKey(key)
  if (!k || !(await objectExists(k))) return false
  const client = getClient()
  if (!client) return false
  try {
    const params = { Bucket: bucketName(), Key: k }
    const rangeHeader = String(range || '').trim()
    if (rangeHeader) params.Range = rangeHeader
    const out = await client.send(new GetObjectCommand(params))
    const body = out.Body
    if (!body) return false
    res.setHeader('Content-Type', out.ContentType || guessContentType(k))
    res.setHeader('Accept-Ranges', 'bytes')
    res.setHeader('Cache-Control', 'public, max-age=86400')
    if (out.ContentRange) {
      res.status(206)
      res.setHeader('Content-Range', out.ContentRange)
    }
    if (out.ContentLength != null) {
      res.setHeader('Content-Length', String(out.ContentLength))
    }
    if (typeof body.pipe === 'function') {
      body.pipe(res)
      return true
    }
    const chunks = []
    for await (const chunk of body) {
      chunks.push(chunk)
    }
    res.end(Buffer.concat(chunks))
    return true
  } catch (e) {
    console.error('[storage] pipe failed:', k, e.message)
    return false
  }
}

/** Redirect to presigned bucket URL when the object exists. Returns true if redirected. */
export async function redirectToBucketObject(res, key, statusCode = 302) {
  if (!isStorageEnabled()) return false
  const k = toObjectKey(key)
  if (!k) return false
  if (!(await objectExists(k))) return false
  const url = await getPresignedUrl(k)
  if (!url) return false
  res.redirect(statusCode, url)
  return true
}

export async function getPresignedUrl(key, expiresIn = PRESIGN_DEFAULT_SEC) {
  const client = getClient()
  const k = toObjectKey(key)
  if (!client || !k) return null
  return getSignedUrl(
    client,
    new GetObjectCommand({ Bucket: bucketName(), Key: k }),
    { expiresIn: Math.max(60, Math.min(expiresIn, 86400)) },
  )
}

export async function getObjectStream(key) {
  const client = getClient()
  const k = toObjectKey(key)
  if (!client || !k) return null
  const out = await client.send(new GetObjectCommand({ Bucket: bucketName(), Key: k }))
  return out.Body || null
}

/** Read full object body as Buffer (for JSON indexes / small files). */
export async function readObjectBuffer(key) {
  const body = await getObjectStream(key)
  if (!body) return null
  if (Buffer.isBuffer(body)) return body
  const chunks = []
  for await (const chunk of body) chunks.push(chunk)
  return Buffer.concat(chunks)
}

export async function readObjectText(key, encoding = 'utf8') {
  const buf = await readObjectBuffer(key)
  return buf ? buf.toString(encoding) : null
}

/** Download bucket object onto local disk (streams — safe for multi‑GB LAS files). */
export async function downloadObjectToFile(key, localPath) {
  const body = await getObjectStream(key)
  if (!body) return false
  fs.mkdirSync(path.dirname(localPath), { recursive: true })
  const nodeStream =
    typeof body.pipe === 'function' ? body : Readable.fromWeb(body)
  await pipeline(nodeStream, fs.createWriteStream(localPath))
  return true
}

export function guessContentType(key) {
  const ext = path.extname(String(key || '')).toLowerCase()
  const map = {
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.png': 'image/png',
    '.webp': 'image/webp',
    '.gif': 'image/gif',
    '.glb': 'model/gltf-binary',
    '.pdf': 'application/pdf',
    '.zip': 'application/zip',
  }
  return map[ext] || 'application/octet-stream'
}

/** Attach presigned `url` to rows that have `file_path`. */
export async function enrichRowsWithUrls(rows) {
  if (!isStorageEnabled() || !Array.isArray(rows)) return rows
  const out = []
  for (const row of rows) {
    const fp = row?.file_path
    if (fp && isS3ObjectKey(fp)) {
      const url = await getPresignedUrl(fp)
      out.push(url ? { ...row, url } : row)
    } else {
      out.push(row)
    }
  }
  return out
}
