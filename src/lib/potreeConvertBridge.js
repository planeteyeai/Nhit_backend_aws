/**
 * LAS→Potree conversion facade (formerly bridged to a separate pointcloud-viewer process).
 * Uses in-process pointcloudViewer modules, with lasToPotree as S3 fallback.
 */
import path from 'path'
import { statSync } from 'fs'
import { createRequire } from 'module'
import {
  convertLasFileFromS3,
  convertPendingLasFiles,
  getLasConvertStatus,
  listPendingLasConversions,
} from './lasToPotree.js'
import { invalidatePotreeCatalogCache } from './potreeModels.js'
import { guessContentType, uploadFromFile } from './storage.js'
import {
  bulkConvert,
  getPointcloudViewerHealthSnapshot,
  localConvert,
} from '../routes/pointcloudViewerRoutes.js'

const require = createRequire(import.meta.url)
const s3 = require('../pointcloudViewer/lib/s3.js')

const MODEL_3D_PREFIX = 'upload/model_3d/'

/** In-memory jobs when converting via S3 + backend PotreeConverter. */
const backendConvertJobs = new Map()

export async function getPointcloudViewerHealth() {
  try {
    const snap = getPointcloudViewerHealthSnapshot()
    return {
      online: true,
      localConvert: Boolean(snap.localConvert),
      configured: Boolean(snap.configured),
      url: 'integrated',
      ...snap,
    }
  } catch {
    return { online: false, localConvert: false, url: 'integrated' }
  }
}

export async function listLasSources(prefix = MODEL_3D_PREFIX) {
  try {
    const data = await bulkConvert.listLas(prefix)
    if (data?.items) {
      return {
        source: 'backend',
        prefix: data.prefix || prefix,
        items: data.items,
      }
    }
  } catch (e) {
    console.warn('[potree] bulk listLas failed, using pending scan:', e.message)
  }

  const pending = await listPendingLasConversions()
  const items = pending.map((p) => ({
    key: p.key,
    name: p.fileName.replace(/\.(las|laz)$/i, ''),
    size: p.sizeBytes || 0,
    chainageKey: p.chainageKey,
    published: false,
  }))
  return { source: 'backend', prefix, items }
}

export async function getBulkConvertStatus() {
  const data = bulkConvert.publicBatch()
  if (data) {
    return { source: 'backend', ...data }
  }
  const inline = getLasConvertStatus()
  return {
    source: 'backend',
    status: inline.running ? 'running' : 'idle',
    running: inline.running,
    lastRun: inline.lastRun,
    lastError: inline.lastError,
    results: inline.results || [],
  }
}

export async function startLasConversion({ keys = [], prefix = MODEL_3D_PREFIX, maxFiles = 1 } = {}) {
  const validKeys = (Array.isArray(keys) ? keys : []).filter((k) => /\.(las|laz)$/i.test(String(k || '')))
  if (!validKeys.length) {
    const err = new Error('No valid .las or .laz keys provided')
    err.status = 400
    throw err
  }

  try {
    const data = bulkConvert.startPublish({ keys: validKeys, prefix })
    return { source: 'backend', ...data }
  } catch (e) {
    if (e.status === 409) throw e
    if (e.status && e.status >= 400 && e.status < 500) throw e
    console.warn('[potree] bulk publish failed, using inline convert:', e.message)
  }

  const result = await convertPendingLasFiles({
    maxFiles: Math.max(1, Number(maxFiles) || validKeys.length),
  })
  invalidatePotreeCatalogCache()
  return { source: 'backend', status: 'done', ...result }
}

export async function startLasConversionForChainage(chainageKey, options = {}) {
  const key = String(chainageKey || '').trim()
  if (!key) {
    const err = new Error('chainage is required')
    err.status = 400
    throw err
  }

  const { items } = await listLasSources(options.prefix)
  const digits = key.replace(/\D/g, '')
  const matches = items.filter((item) => {
    if (item.published) return false
    const ck = item.chainageKey || extractChainageFromText(item.name) || extractChainageFromText(item.key)
    if (ck && ck.replace(/\+/g, '') === key.replace(/\+/g, '')) return true
    if (digits.length >= 5) {
      const id = String(item.name || item.key || '').replace(/\D/g, '')
      return id.includes(digits) || digits.includes(id.slice(0, digits.length))
    }
    return false
  })

  if (!matches.length) {
    const err = new Error(`No unpublished LAS/LAZ found for chainage ${key}`)
    err.status = 404
    throw err
  }

  return startLasConversion({
    keys: matches.map((m) => m.key),
    prefix: options.prefix,
    maxFiles: options.maxFiles ?? matches.length,
  })
}

function extractChainageFromText(text) {
  const m = String(text || '').match(/(\d+)\s*\+\s*(\d+)/)
  if (!m) return null
  return `${Number(m[1])}+${Number(m[2])}`
}

function folderFromPotreeMetadataUrl(s3Url) {
  const m = String(s3Url || '').match(/upload\/potree\/([^/]+)\/metadata\.json/i)
  return m ? decodeURIComponent(m[1]) : null
}

function buildLasUploadNameHint(chainageKey, originalName = '') {
  const safeChainage = String(chainageKey || '')
    .trim()
    .replace(/\+/g, '-')
    .replace(/[^0-9a-z-]/gi, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
  if (safeChainage) return `${Date.now()}-mnb-${safeChainage}-upload`
  const base = String(originalName || 'scan')
    .replace(/\.(las|laz)$/i, '')
    .replace(/[^0-9a-z+-]/gi, '-')
  return `${Date.now()}-${base || 'pointcloud'}`
}

function createBackendConvertJob(id) {
  const job = {
    id,
    phase: 'uploading',
    percent: 5,
    message: 'Uploading to S3…',
    folder: null,
    error: null,
  }
  backendConvertJobs.set(id, job)
  return job
}

async function runBackendConvertJob(jobId, s3Key) {
  const job = backendConvertJobs.get(jobId)
  if (!job) return
  try {
    job.phase = 'converting'
    job.percent = 35
    job.message = 'Converting to Potree…'
    const result = await convertLasFileFromS3(s3Key)
    job.phase = 'done'
    job.percent = 100
    job.message = 'Complete'
    job.folder = result.folder
    invalidatePotreeCatalogCache()
  } catch (e) {
    job.phase = 'failed'
    job.error = e.message || String(e)
    job.message = job.error
  }
}

async function uploadLasViaS3AndConvert({ filePath, originalName, nameHint }) {
  const ext = path.extname(originalName || '') || '.las'
  const fileName = `${nameHint}${ext}`
  const s3Key = `${MODEL_3D_PREFIX}${fileName}`

  const uploaded = await uploadFromFile(filePath, s3Key, guessContentType(ext))
  if (!uploaded) {
    const err = new Error('Failed to upload LAS to S3')
    err.status = 500
    throw err
  }

  const job = createBackendConvertJob(nameHint)
  job.phase = 'converting'
  job.percent = 20
  job.message = 'File on S3 — starting Potree conversion…'
  setImmediate(() => {
    runBackendConvertJob(job.id, s3Key).catch((e) => {
      console.error('[potree] backend convert job failed:', e.message)
    })
  })

  return {
    jobId: job.id,
    nameHint,
    expectedFolder: nameHint,
    source: 'backend',
  }
}

async function runLocalConvertUpload({ filePath, originalName, nameHint }) {
  const id = s3.slugify(nameHint)
  localConvert.createJob({ id, name: nameHint })
  const job = localConvert.getJob(id)
  if (job) {
    job.name = nameHint
    job.phase = 'receiving'
    job.percent = 15
    job.message = 'File received — starting conversion...'
    try {
      const { size } = statSync(filePath)
      job.uploadedBytes = size
      job.totalBytes = size
    } catch {
      /* ignore */
    }
    localConvert.notify(job)
  }

  const origin = s3.getViewerOrigin()
  setImmediate(() => {
    localConvert
      .processLocalJob({
        id,
        name: nameHint,
        inputPath: filePath,
        origin,
      })
      .catch((e) => console.error('[potree] local convert failed:', e.message))
  })

  return {
    jobId: id,
    nameHint,
    expectedFolder: id,
    source: 'backend',
  }
}

export async function uploadLasToPointcloudViewer({ filePath, originalName, chainageKey }) {
  const nameHint = buildLasUploadNameHint(chainageKey, originalName)
  const health = await getPointcloudViewerHealth()

  if (health.localConvert) {
    try {
      return await runLocalConvertUpload({ filePath, originalName, nameHint })
    } catch (e) {
      console.warn('[potree] local convert upload failed, using S3 path:', e.message)
    }
  }

  return uploadLasViaS3AndConvert({ filePath, originalName, nameHint })
}

export async function getLocalConvertJobStatus(jobId) {
  const id = String(jobId || '').trim()
  if (!id) {
    const err = new Error('jobId is required')
    err.status = 400
    throw err
  }

  const backendJob = backendConvertJobs.get(id)
  if (backendJob) {
    return {
      ...backendJob,
      folder: backendJob.folder || (backendJob.phase === 'done' ? id : null),
    }
  }

  const job = localConvert.getJob(id)
  if (!job) {
    const err = new Error('Conversion job not found')
    err.status = 404
    throw err
  }
  const pub = localConvert.publicJob(job)
  const folder = folderFromPotreeMetadataUrl(pub.s3) || (pub.phase === 'done' ? id : null)
  return { ...pub, folder }
}
