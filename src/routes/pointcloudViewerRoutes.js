/**
 * Mounts former pointcloud-viewer Express APIs onto the BMS backend.
 * Handlers remain CommonJS under src/pointcloudViewer/; loaded via createRequire.
 */
import { createRequire } from 'module'
import path from 'path'
import express from 'express'
import multer from 'multer'
import fs from 'fs'

const require = createRequire(import.meta.url)

const health = require('../pointcloudViewer/api/health.js')
const clouds = require('../pointcloudViewer/api/clouds.js')
const createUpload = require('../pointcloudViewer/api/upload/create.js')
const signPart = require('../pointcloudViewer/api/upload/part.js')
const completeUpload = require('../pointcloudViewer/api/upload/complete.js')
const abortUpload = require('../pointcloudViewer/api/upload/abort.js')
const lasCreate = require('../pointcloudViewer/api/las/create.js')
const lasComplete = require('../pointcloudViewer/api/las/complete.js')
const lasJob = require('../pointcloudViewer/api/las/job.js')
const s3 = require('../pointcloudViewer/lib/s3.js')
const localConvert = require('../pointcloudViewer/lib/localConvert.js')
const bulkConvert = require('../pointcloudViewer/lib/bulkConvert.js')
const pointcloudStateHandler = require('../pointcloudViewer/api/pointcloud-state/id.js')

function adapt(handler) {
  return (req, res) => {
    const vercelReq = req
    vercelReq.query = req.query
    return handler(vercelReq, res)
  }
}

/**
 * @returns {import('express').Router}
 */
export function createPointcloudViewerRouter() {
  const router = express.Router()

  fs.mkdirSync(localConvert.TMP_ROOT, { recursive: true })

  const storage = multer.diskStorage({
    destination(req, file, cb) {
      const id = req.localJobId
      const dir = path.join(localConvert.TMP_ROOT, id, 'in')
      fs.mkdirSync(dir, { recursive: true })
      cb(null, dir)
    },
    filename(req, file, cb) {
      const safe = String(file.originalname || 'scan.las').replace(/\\/g, '/').split('/').pop()
      cb(null, safe)
    },
  })

  const upload = multer({
    storage,
    limits: { fileSize: 1024 * 1024 * 1024 * 50 },
    fileFilter(req, file, cb) {
      if (!/\.(las|laz)$/i.test(file.originalname || '')) {
        return cb(new Error('Only .las or .laz files are allowed'))
      }
      cb(null, true)
    },
  })

  // Dedicated readiness endpoint (BMS keeps /api/health for itself).
  router.all('/api/pointcloud/health', adapt(health))
  // Alias used by tnmy manager UI / legacy clients.
  router.all('/api/pointcloud-viewer/health', adapt(health))

  router.all('/api/clouds', adapt(clouds))
  router.all('/api/upload/create', adapt(createUpload))
  router.all('/api/upload/part', adapt(signPart))
  router.all('/api/upload/complete', adapt(completeUpload))
  router.all('/api/upload/abort', adapt(abortUpload))
  router.all('/api/las/create', adapt(lasCreate))
  router.all('/api/las/complete', adapt(lasComplete))
  router.all('/api/las/job', adapt(lasJob))

  router.all('/api/pointcloud-state/:id', express.json({ limit: '25mb' }), (req, res) => {
    req.params = req.params || {}
    return pointcloudStateHandler(req, res)
  })

  router.post('/api/local/convert', (req, res) => {
    const nameHint = String(req.query.name || req.headers['x-cloud-name'] || 'cloud').trim() || 'cloud'
    const id = s3.slugify(nameHint)
    req.localJobId = id
    localConvert.createJob({ id, name: nameHint })

    upload.single('file')(req, res, (err) => {
      const job = localConvert.getJob(id)
      if (err) {
        if (job) {
          job.phase = 'failed'
          job.error = err.message || String(err)
          job.message = job.error
        }
        return res.status(400).json({ error: err.message || 'Upload failed' })
      }
      if (!req.file) {
        return res.status(400).json({ error: 'file is required (field name: file)' })
      }

      const name = String(req.body.name || nameHint).trim() || nameHint
      if (job) {
        job.name = name
        job.phase = 'receiving'
        job.percent = 15
        job.message = 'File received — starting conversion...'
        job.uploadedBytes = req.file.size
        job.totalBytes = req.file.size
        localConvert.notify(job)
      }

      const origin = s3.getOrigin(req) || s3.getViewerOrigin()
      setImmediate(() => {
        localConvert.processLocalJob({
          id,
          name,
          inputPath: req.file.path,
          origin,
        })
      })

      return res.status(200).json({ id, name, status: 'started' })
    })
  })

  router.get('/api/local/convert/status', (req, res) => {
    const id = String(req.query.id || '')
    const job = localConvert.getJob(id)
    if (!job) return res.status(404).json({ error: 'Job not found' })
    return res.status(200).json(localConvert.publicJob(job))
  })

  router.get('/api/local/convert/events', (req, res) => {
    const id = String(req.query.id || '')
    const job = localConvert.getJob(id)
    if (!job) return res.status(404).json({ error: 'Job not found' })

    res.setHeader('Content-Type', 'text/event-stream')
    res.setHeader('Cache-Control', 'no-cache')
    res.setHeader('Connection', 'keep-alive')
    if (typeof res.flushHeaders === 'function') res.flushHeaders()

    const send = (payload) => {
      res.write(`data: ${JSON.stringify(payload)}\n\n`)
    }

    const unsubscribe = localConvert.subscribe(id, send)
    const heartbeat = setInterval(() => {
      res.write(': ping\n\n')
    }, 15000)

    req.on('close', () => {
      clearInterval(heartbeat)
      unsubscribe()
    })
  })

  router.get('/api/bulk/las', async (req, res) => {
    try {
      const prefix = String(req.query.prefix || bulkConvert.getDefaultPrefix())
      const data = await bulkConvert.listLas(prefix)
      return res.status(200).json(data)
    } catch (err) {
      console.error(err)
      return res.status(err.status || 500).json({ error: err.message || 'Failed to list LAS' })
    }
  })

  router.post('/api/bulk/publish', express.json(), async (req, res) => {
    try {
      const keys = req.body?.keys
      const prefix = req.body?.prefix || bulkConvert.getDefaultPrefix()
      const data = bulkConvert.startPublish({ keys, prefix })
      return res.status(200).json(data)
    } catch (err) {
      console.error(err)
      return res.status(err.status || 500).json({ error: err.message || 'Failed to start bulk publish' })
    }
  })

  router.get('/api/bulk/status', (req, res) => {
    const data = bulkConvert.publicBatch()
    if (!data) return res.status(200).json({ status: 'idle' })
    return res.status(200).json(data)
  })

  router.post('/api/bulk/abort', express.json(), (req, res) => {
    try {
      const scope = req.body?.scope === 'overall' ? 'overall' : 'current'
      const data = scope === 'overall' ? bulkConvert.abortOverall() : bulkConvert.abortCurrent()
      return res.status(200).json(data)
    } catch (err) {
      console.error(err)
      return res.status(err.status || 500).json({ error: err.message || 'Abort failed' })
    }
  })

  router.get('/api/bulk/events', (req, res) => {
    res.setHeader('Content-Type', 'text/event-stream')
    res.setHeader('Cache-Control', 'no-cache, no-transform')
    res.setHeader('Connection', 'keep-alive')
    res.setHeader('X-Accel-Buffering', 'no')
    if (typeof res.flushHeaders === 'function') res.flushHeaders()

    const send = (payload) => {
      res.write(`data: ${JSON.stringify(payload)}\n\n`)
      if (typeof res.flush === 'function') res.flush()
    }

    const unsubscribe = bulkConvert.subscribe(send)
    const heartbeat = setInterval(() => {
      res.write(': ping\n\n')
    }, 15000)

    req.on('close', () => {
      clearInterval(heartbeat)
      unsubscribe()
    })
  })

  return router
}

/** Snapshot for merging into BMS /api/health (dev) and potreeConvertBridge. */
export function getPointcloudViewerHealthSnapshot() {
  const cfg = s3.getConfig()
  const converter = localConvert.converterStatus()
  return {
    ok: true,
    configured: s3.isConfigured(),
    bucket: Boolean(cfg.bucket),
    region: cfg.region || null,
    viewerOrigin: s3.getViewerOrigin(),
    localConvert: converter.ok,
    converter,
    mode: 'integrated',
    source: 'bms-backend',
  }
}

export { s3 as pointcloudS3, localConvert, bulkConvert }
