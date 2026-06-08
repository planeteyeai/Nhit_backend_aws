/**
 * Railway Bucket (S3-compatible) storage.
 * Env vars from Railway "Connect Service to Bucket" → AWS SDK (Generic):
 *   AWS_ENDPOINT_URL, AWS_S3_BUCKET_NAME, AWS_DEFAULT_REGION,
 *   AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY
 */
import fs from 'fs'
import path from 'path'
import {
  S3Client,
  PutObjectCommand,
  HeadObjectCommand,
  GetObjectCommand,
} from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'

const PRESIGN_DEFAULT_SEC = Number(process.env.PRESIGNED_URL_EXPIRY_SEC || 3600)

function bucketName() {
  return String(process.env.AWS_S3_BUCKET_NAME || process.env.S3_BUCKET || '').trim()
}

function endpoint() {
  return String(process.env.AWS_ENDPOINT_URL || process.env.S3_ENDPOINT || '').trim()
}

function region() {
  return String(process.env.AWS_DEFAULT_REGION || process.env.S3_REGION || 'auto').trim()
}

function accessKeyId() {
  return String(process.env.AWS_ACCESS_KEY_ID || process.env.S3_ACCESS_KEY_ID || '').trim()
}

function secretAccessKey() {
  return String(process.env.AWS_SECRET_ACCESS_KEY || process.env.S3_SECRET_ACCESS_KEY || '').trim()
}

/** True when Railway bucket credentials are configured. */
export function isStorageEnabled() {
  const backend = String(process.env.STORAGE_BACKEND || 'auto').trim().toLowerCase()
  if (backend === 'local' || backend === 'disk') return false
  if (backend === 's3') {
    return Boolean(bucketName() && endpoint() && accessKeyId() && secretAccessKey())
  }
  return Boolean(bucketName() && endpoint() && accessKeyId() && secretAccessKey())
}

let _client = null

function getClient() {
  if (!isStorageEnabled()) return null
  if (!_client) {
    _client = new S3Client({
      region: region(),
      endpoint: endpoint(),
      credentials: {
        accessKeyId: accessKeyId(),
        secretAccessKey: secretAccessKey(),
      },
      forcePathStyle: false,
    })
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

export async function uploadFromFile(localPath, key, contentType) {
  const client = getClient()
  const k = toObjectKey(key)
  if (!client || !k) return false
  const body = fs.readFileSync(localPath)
  await client.send(
    new PutObjectCommand({
      Bucket: bucketName(),
      Key: k,
      Body: body,
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
