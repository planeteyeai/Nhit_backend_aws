import express from 'express'
import cors from 'cors'
import fs from 'fs'
import helmet from 'helmet'
import path from 'path'
import { fileURLToPath } from 'url'
import { getPresignedUrl, isStorageEnabled, objectExists, pipeBucketObjectToResponse, storageStatus } from './lib/storage.js'
import { pool } from './config/db.js'
import { ensureBridgeInspectionDistressColumns, ensureNonStructuralDistressTable } from './lib/nonStructuralDistressDb.js'
import diagnosticsRoutes from './routes/index.js'
import bmsRoutes from './routes/bmsRoutes.js'
import { diagGuard } from './middleware/diagGuard.js'
import { requireAuth } from './middleware/auth.js'
import {
  assertProductionConfig,
  isAuthConfigBlocked,
  isProduction,
  resolvePublicApiBase,
} from './lib/envValidate.js'
import {
  createPointcloudViewerRouter,
  getPointcloudViewerHealthSnapshot,
} from './routes/pointcloudViewerRoutes.js'
import { createPointcloudInspectionRouter } from './routes/pointcloudInspectionRoutes.js'
import { bootState } from './bootState.js'

/**
 * Mount the full BMS API onto an already-listening Express app (see boot.js).
 * @param {import('express').Express} app
 */
export async function attachBmsApp(app) {
  assertProductionConfig()

  const __filename = fileURLToPath(import.meta.url)
  const __dirname = path.dirname(__filename)
  const uploadDir = path.resolve(__dirname, '../upload')

  /** Enrich the early /health handler registered in boot.js (first match wins). */
  bootState.enrich = () => {
    let pointcloud = null
    try {
      pointcloud = getPointcloudViewerHealthSnapshot()
    } catch (e) {
      pointcloud = { ok: false, error: e.message || String(e) }
    }
    if (isProduction()) {
      return {
        configured: Boolean(pointcloud?.configured),
        localConvert: Boolean(pointcloud?.localConvert),
        mysqlConfigured: Boolean(
          process.env.MYSQL_HOST && process.env.MYSQL_USER && process.env.MYSQL_DATABASE
        ),
        jwtOk: !isAuthConfigBlocked(),
        pointcloud,
      }
    }
    return {
      service: 'bms-backend',
      storage: storageStatus(),
      configured: Boolean(pointcloud?.configured),
      localConvert: Boolean(pointcloud?.localConvert),
      converter: pointcloud?.converter || null,
      viewerOrigin: pointcloud?.viewerOrigin || null,
      mode: pointcloud?.mode || 'integrated',
      pointcloud,
    }
  }

  function resolveUploadFile(urlPath) {
    const rel = decodeURIComponent(String(urlPath || '').replace(/^\/+/, ''))
    const target = path.normalize(path.join(uploadDir, rel))
    if (!target.startsWith(uploadDir)) return null
    return target
  }

  async function uploadS3Fallback(req, res, next) {
    if (!isStorageEnabled() || (req.method !== 'GET' && req.method !== 'HEAD')) return next()
    const target = resolveUploadFile(req.path)
    if (target) {
      try {
        const stat = fs.statSync(target)
        if (stat.isFile() && stat.size > 0 && path.basename(target) !== '.gitkeep') {
          return next()
        }
      } catch {
        /* try bucket */
      }
    }
    const rel = decodeURIComponent(String(req.path || '').replace(/^\/+/, ''))
    if (!rel) return next()
    const key = `upload/${rel}`
    try {
      if (!(await objectExists(key))) return next()
      if (req.method === 'GET' && (await pipeBucketObjectToResponse(res, key))) {
        return
      }
      const url = await getPresignedUrl(key)
      if (url) return res.redirect(302, url)
    } catch (e) {
      console.error('[upload] bucket fallback:', e.message)
    }
    return next()
  }

  function uploadStaticGuard(req, res, next) {
    if (req.method !== 'GET' && req.method !== 'HEAD') return next()
    const target = resolveUploadFile(req.path)
    if (!target) return next()
    fs.stat(target, (err, stat) => {
      if (err || !stat.isFile()) return next()
      if (stat.size === 0 || path.basename(target) === '.gitkeep') {
        return res.status(404).end()
      }
      if (req.headers.range && stat.size < 1024) {
        delete req.headers.range
      }
      next()
    })
  }

  if (isProduction()) {
    app.set('trust proxy', 1)
  }

  const corsOrigin = (process.env.CORS_ORIGIN || '').trim()
  const allowedOrigins = corsOrigin ? corsOrigin.split(',').map((s) => s.trim()).filter(Boolean) : []

  const POTREE_VIEWER_ORIGINS = [
    ...String(process.env.POINTCLOUD_VIEWER_ORIGINS || '')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean),
  ]

  function isAllowedDevOrigin(origin) {
    try {
      const { hostname } = new URL(origin)
      if (hostname === 'localhost' || hostname === '127.0.0.1') return true
      const m = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(hostname)
      if (!m) return false
      const octets = m.slice(1, 5).map((x) => parseInt(x, 10))
      if (octets.some((n) => n > 255)) return false
      const [a, b] = octets
      if (a === 10) return true
      if (a === 172 && b >= 16 && b <= 31) return true
      if (a === 192 && b === 168) return true
      return false
    } catch {
      return false
    }
  }

  function isAllowedCorsOrigin(origin) {
    if (!origin) return true
    if (allowedOrigins.includes(origin)) return true
    if (POTREE_VIEWER_ORIGINS.includes(origin)) return true
    try {
      const { protocol, hostname, port } = new URL(origin)
      if (
        protocol === 'https:' &&
        (hostname === 'localhost' || hostname === '127.0.0.1') &&
        (port === '5173' || port === '4173' || port === '')
      ) {
        return true
      }
    } catch {
      /* ignore */
    }
    return false
  }

  app.use(
    helmet({
      crossOriginResourcePolicy: { policy: 'cross-origin' },
      contentSecurityPolicy: false,
    })
  )

  app.set('etag', false)

  app.use(
    cors({
      origin: (origin, cb) => {
        if (!origin) return cb(null, true)
        if (isProduction()) {
          return cb(null, isAllowedCorsOrigin(origin))
        }
        if (isAllowedDevOrigin(origin)) return cb(null, true)
        if (allowedOrigins.length === 0) return cb(null, true)
        return cb(null, isAllowedCorsOrigin(origin))
      },
      credentials: true,
      methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'Authorization', 'Range', 'Cache-Control', 'Pragma'],
      exposedHeaders: ['Content-Disposition', 'Content-Range', 'Accept-Ranges', 'Content-Length'],
      optionsSuccessStatus: 204,
    })
  )
  app.use(express.json({ limit: '64mb' }))
  app.use(express.urlencoded({ extended: true, limit: '64mb' }))

  app.use((req, res, next) => {
    if (req.path.startsWith('/upload') || req.path.startsWith('/potree-models')) return next()
    res.setHeader('Cache-Control', 'no-store')
    next()
  })

  function uploadSensitiveGuard(req, res, next) {
    if (req.method !== 'GET' && req.method !== 'HEAD') return next()
    const rel = String(req.path || '').replace(/^\/+/, '')
    if (!rel.startsWith('download/')) return next()
    return requireAuth(req, res, next)
  }

  app.use('/upload', uploadSensitiveGuard, uploadS3Fallback, uploadStaticGuard, express.static(uploadDir))

  app.use(createPointcloudViewerRouter())
  app.use('/api/pointcloud-inspection', createPointcloudInspectionRouter())

  app.get('/', (_req, res) => {
    if (isProduction()) {
      return res.json({ ok: true })
    }
    res.json({
      ok: true,
      service: 'bms-backend',
      message: 'API is running.',
      health: '/health',
      potreeModels: '/potree-models',
      apiPrefix: '/api',
    })
  })

  app.get('/api', (_req, res) => {
    if (isProduction()) {
      return res.json({ ok: true })
    }
    res.json({
      ok: true,
      service: 'bms-backend',
      health: '/api/health',
      hint: 'REST routes live under this host with paths like /api/inspection/... or /inspection/... (see server mounts).',
    })
  })

  app.use('/api', bmsRoutes)
  app.use('/api/diag', diagGuard, diagnosticsRoutes)
  app.use('/', bmsRoutes)

  app.use((req, res) => {
    const body = { ok: false, error: 'Not found' }
    if (!isProduction()) {
      body.path = req.originalUrl
      body.method = req.method
    }
    res.status(404).json(body)
  })

  app.use((err, _req, res, _next) => {
    if (err?.status === 416 || err?.name === 'RangeNotSatisfiableError') {
      return res.status(404).json({ ok: false, error: 'File not found or empty' })
    }

    const aborted =
      err?.type === 'request.aborted' ||
      err?.code === 'ECONNABORTED' ||
      err?.message === 'request aborted'
    if (aborted) {
      if (!res.headersSent) {
        res.status(400).json({ ok: false, error: 'Request aborted', code: 'REQUEST_ABORTED' })
      }
      return
    }

    if (err?.type === 'entity.too.large' || err?.status === 413 || err?.statusCode === 413) {
      if (!res.headersSent) {
        res.status(413).json({
          ok: false,
          error: 'Save too large. Reload the viewer and save again.',
          code: 'PAYLOAD_TOO_LARGE',
        })
      }
      return
    }

    if (err?.type === 'entity.parse.failed' || err instanceof SyntaxError) {
      if (!isProduction()) {
        console.warn('[body] JSON parse failed:', String(err.message || err).slice(0, 120))
      }
      if (!res.headersSent) {
        res.status(400).json({
          ok: false,
          error: 'Invalid JSON body',
          code: 'INVALID_JSON',
        })
      }
      return
    }

    console.error(err)
    const status = err.status && Number.isInteger(err.status) ? err.status : 500
    const body = { ok: false, error: 'Internal server error' }
    if (!isProduction() && err.message) {
      body.detail = err.message
    }
    if (!res.headersSent) {
      res.status(status).json(body)
    }
  })

  const publicBase = resolvePublicApiBase()
  if (publicBase) {
    console.log(`BMS backend live API ${publicBase}`)
    console.log(`BMS backend health ${publicBase}/health`)
  } else if (!isProduction()) {
    console.log(`BMS backend health http://127.0.0.1:${Number(process.env.PORT || 8080)}/health`)
  }
  const st = storageStatus()
  console.log(`[storage] bucket ${st.enabled ? 'enabled' : 'disabled'}${st.bucket ? ` (${st.bucket})` : ''}`)
  ensureNonStructuralDistressTable(pool).catch((e) =>
    console.error('[db] non_structural_distress ensure:', e.message)
  )
  ensureBridgeInspectionDistressColumns(pool).catch((e) =>
    console.error('[db] bridge_inspection_distress columns ensure:', e.message)
  )
}
