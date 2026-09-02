/**
 * Bridge BMS ↔ pointcloud-viewer bulk LAS→Potree conversion (upload/model_3d → upload/potree).
 * Prefers the local pointcloud-viewer service; falls back to inline lasToPotree when offline.
 */
import fs from 'fs'
import {
  convertPendingLasFiles,
  getLasConvertStatus,
  listPendingLasConversions,
} from './lasToPotree.js'
import { invalidatePotreeCatalogCache } from './potreeModels.js'

const VIEWER_BASE = String(process.env.POINTCLOUD_VIEWER_URL || 'http://127.0.0.1:3000').replace(/\/$/, '')
const MODEL_3D_PREFIX = 'upload/model_3d/'

async function viewerFetch(path, init = {}) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), init.timeoutMs ?? 15_000)
  try {
    const res = await fetch(`${VIEWER_BASE}${path}`, {
      ...init,
      signal: controller.signal,
      headers: { Accept: 'application/json', ...(init.headers || {}) },
    })
    const text = await res.text()
    let json = null
    try {
      json = text ? JSON.parse(text) : null
    } catch {
      json = null
    }
    return { ok: res.ok, status: res.status, json, text }
  } finally {
    clearTimeout(timer)
  }
}

export async function getPointcloudViewerHealth() {
  const r = await viewerFetch('/api/health')
  if (!r.ok || !r.json) {
    return { online: false, localConvert: false, url: VIEWER_BASE }
  }
  return {
    online: true,
    localConvert: Boolean(r.json.localConvert),
    configured: Boolean(r.json.configured),
    url: VIEWER_BASE,
  }
}

export async function listLasSources(prefix = MODEL_3D_PREFIX) {
  const viewer = await viewerFetch(`/api/bulk/las?prefix=${encodeURIComponent(prefix)}`)
  if (viewer.ok && viewer.json?.items) {
    return {
      source: 'pointcloud-viewer',
      prefix: viewer.json.prefix || prefix,
      items: viewer.json.items,
    }
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
  const viewer = await viewerFetch('/api/bulk/status')
  if (viewer.ok && viewer.json) {
    return { source: 'pointcloud-viewer', ...viewer.json }
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

  const viewer = await viewerFetch('/api/bulk/publish', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ keys: validKeys, prefix }),
    timeoutMs: 30_000,
  })

  if (viewer.ok && viewer.json) {
    return { source: 'pointcloud-viewer', ...viewer.json }
  }

  if (viewer.status === 409 && viewer.json) {
    return { source: 'pointcloud-viewer', ...viewer.json }
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

export async function uploadLasToPointcloudViewer({ filePath, originalName, chainageKey }) {
  const nameHint = buildLasUploadNameHint(chainageKey, originalName)
  const buffer = fs.readFileSync(filePath)
  const form = new FormData()
  form.append('file', new Blob([buffer]), originalName || 'scan.las')
  form.append('name', nameHint)

  const r = await viewerFetch(`/api/local/convert?name=${encodeURIComponent(nameHint)}`, {
    method: 'POST',
    body: form,
    timeoutMs: 30 * 60_000,
  })

  if (!r.ok) {
    const msg = r.json?.error || r.text || `Viewer upload HTTP ${r.status}`
    const err = new Error(msg)
    err.status = r.status
    throw err
  }

  return {
    jobId: r.json?.id,
    nameHint,
    expectedFolder: nameHint,
  }
}

export async function getLocalConvertJobStatus(jobId) {
  const id = String(jobId || '').trim()
  if (!id) {
    const err = new Error('jobId is required')
    err.status = 400
    throw err
  }
  const r = await viewerFetch(`/api/local/convert/status?id=${encodeURIComponent(id)}`)
  if (r.status === 404) {
    const err = new Error('Conversion job not found')
    err.status = 404
    throw err
  }
  if (!r.ok) {
    const err = new Error(r.json?.error || r.text || `Viewer status HTTP ${r.status}`)
    err.status = r.status
    throw err
  }
  const job = r.json || {}
  const folder = folderFromPotreeMetadataUrl(job.s3) || (job.phase === 'done' ? id : null)
  return { ...job, folder }
}
