import express from 'express'
import cors from 'cors'
import dotenv from 'dotenv'
import fs from 'fs'
import helmet from 'helmet'
import path from 'path'
import { fileURLToPath } from 'url'
import { warmModel3dStorage } from './lib/model3dStorage.js'
import { getPresignedUrl, isStorageEnabled, objectExists, storageStatus } from './lib/storage.js'
import { pool } from './config/db.js'
import { ensureNonStructuralDistressTable } from './lib/nonStructuralDistressDb.js'
import diagnosticsRoutes from './routes/index.js'
import bmsRoutes from './routes/bmsRoutes.js'
import { diagGuard } from './middleware/diagGuard.js'
import { requireAuth } from './middleware/auth.js'
import { assertProductionConfig, isProduction } from './lib/envValidate.js'

dotenv.config()
assertProductionConfig()

const app = express()
const PORT = Number(process.env.PORT || 3001)
const HOST = (process.env.HOST || '0.0.0.0').trim()
const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const uploadDir = path.resolve(__dirname, '../upload')

/** Resolve a safe path under upload/ (blocks path traversal). */
function resolveUploadFile(urlPath) {
  const rel = decodeURIComponent(String(urlPath || '').replace(/^\/+/, ''))
  const target = path.normalize(path.join(uploadDir, rel))
  if (!target.startsWith(uploadDir)) return null
  return target
}

/**
 * express.static + Range on 0-byte files (e.g. .gitkeep) throws RangeNotSatisfiableError.
 * GLB loaders also probe with Range — skip empty placeholder files before send().
 */
/** If file is not on local disk, redirect to Railway bucket presigned URL. */
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
  const rel = String(req.path || '').replace(/^\/+/, '')
  if (!rel) return next()
  const key = `upload/${rel}`
  try {
    if (await objectExists(key)) {
      const url = await getPresignedUrl(key)
      if (url) return res.redirect(302, url)
    }
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

/** Development only: allow Vite when opened via LAN IP (e.g. http://192.168.x.x:5173 from another device). */
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

app.use(
  helmet({
    crossOriginResourcePolicy: { policy: 'cross-origin' },
    contentSecurityPolicy: false,
  })
)

app.use(
  cors({
    origin: (origin, cb) => {
      if (!origin) return cb(null, true)
      if (isProduction()) {
        if (allowedOrigins.includes(origin)) return cb(null, true)
        return cb(null, false)
      }
      if (isAllowedDevOrigin(origin)) return cb(null, true)
      if (allowedOrigins.length === 0) return cb(null, true)
      if (allowedOrigins.includes(origin)) return cb(null, true)
      return cb(null, false)
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'Range'],
    exposedHeaders: ['Content-Disposition'],
    optionsSuccessStatus: 204,
  })
)
app.options('*', cors())
app.use(express.json({ limit: '10mb' }))
app.use(express.urlencoded({ extended: true }))
/** Block direct static access to signatures and PDFs without login (production). */
function uploadSensitiveGuard(req, res, next) {
  if (!isProduction()) return next()
  if (req.method !== 'GET' && req.method !== 'HEAD') return next()
  const rel = String(req.path || '').replace(/^\/+/, '')
  if (!rel.startsWith('download/')) return next()
  return requireAuth(req, res, next)
}

app.use('/upload', uploadSensitiveGuard, uploadS3Fallback, uploadStaticGuard, express.static(uploadDir))

app.get(['/health', '/api/health'], (_req, res) => {
  if (isProduction()) {
    return res.json({ ok: true })
  }
  res.json({ ok: true, service: 'bms-backend', storage: storageStatus() })
})

app.get('/', (_req, res) => {
  if (isProduction()) {
    return res.json({ ok: true })
  }
  res.json({
    ok: true,
    service: 'bms-backend',
    message: 'API is running. Use the paths below (not this page alone for 3D models).',
    health: '/health',
    model3dCatalog: '/model-3d/catalog',
    model3dStatus: '/model-3d/status',
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
  console.error(err)
  const status = err.status && Number.isInteger(err.status) ? err.status : 500
  const body = { ok: false, error: 'Internal server error' }
  if (!isProduction() && err.message) {
    body.detail = err.message
  }
  res.status(status).json(body)
})

function startModel3dWarmup() {
  const model3dRoot = path.join(uploadDir, 'model_3d')
  warmModel3dStorage(model3dRoot).catch((e) => console.error('[server] model-3d warmup:', e.message))
}

const server = app.listen(PORT, HOST, () => {
  console.log(`BMS backend listening on http://${HOST}:${PORT} (${isProduction() ? 'production' : 'development'})`)
  const st = storageStatus()
  console.log(`[storage] bucket ${st.enabled ? 'enabled' : 'disabled'}${st.bucket ? ` (${st.bucket})` : ''}`)
  ensureNonStructuralDistressTable(pool).catch((e) =>
    console.error('[db] non_structural_distress ensure:', e.message)
  )
  startModel3dWarmup()
})

server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    console.error(
      `Port ${PORT} is already in use. Stop the other BMS backend process, or use only one of:\n` +
        `  - npm run dev (frontend folder, starts API if needed)\n` +
        `  - npm run dev (backend folder)\n`
    )
    process.exit(1)
  }
  throw err
})
