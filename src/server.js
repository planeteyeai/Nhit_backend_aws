import express from 'express'
import cors from 'cors'
import dotenv from 'dotenv'
import fs from 'fs'
import helmet from 'helmet'
import path from 'path'
import { fileURLToPath } from 'url'
import { runEnsureGlbAssets } from './lib/glbEnsure.js'
import diagnosticsRoutes from './routes/index.js'
import bmsRoutes from './routes/bmsRoutes.js'
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
app.use('/upload', uploadStaticGuard, express.static(uploadDir))

app.get(['/health', '/api/health'], (_req, res) => {
  res.json({ ok: true, service: 'bms-backend' })
})

app.get('/', (_req, res) => {
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

// Exact GET /api (no further path) — otherwise this hits no bmsRoutes handler and returns 404.
app.get('/api', (_req, res) => {
  res.json({
    ok: true,
    service: 'bms-backend',
    health: '/api/health',
    hint: 'REST routes live under this host with paths like /api/inspection/... or /inspection/... (see server mounts).',
  })
})

app.use('/api', bmsRoutes)

// Always enable diag so we can check DB connectivity in production
app.use('/api/diag', diagnosticsRoutes)

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

function startBackgroundGlbDownload() {
  if (process.env.SKIP_GLB_ENSURE === '1') return
  if (!isProduction()) return
  console.log('[server] Background GLB sync from GitHub LFS (needs GITHUB_TOKEN if repo is private)…')
  runEnsureGlbAssets().catch((e) => console.error('[server] GLB sync error:', e.message))
}

const server = app.listen(PORT, HOST, () => {
  console.log(`BMS backend listening on http://${HOST}:${PORT} (${isProduction() ? 'production' : 'development'})`)
  startBackgroundGlbDownload()
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
