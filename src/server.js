import express from 'express'
import cors from 'cors'
import dotenv from 'dotenv'
import helmet from 'helmet'
import path from 'path'
import { fileURLToPath } from 'url'
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

if (isProduction()) {
  app.set('trust proxy', 1)
}

const corsOrigin = (process.env.CORS_ORIGIN || '').trim()
const allowedOrigins = corsOrigin ? corsOrigin.split(',').map((s) => s.trim()).filter(Boolean) : []

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
      if (allowedOrigins.length === 0) return cb(null, true)
      if (allowedOrigins.includes(origin)) return cb(null, true)
      return cb(null, false)
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    exposedHeaders: ['Content-Disposition'],
    optionsSuccessStatus: 204,
  })
)
app.options('*', cors())
app.use(express.json({ limit: '10mb' }))
app.use(express.urlencoded({ extended: true }))
app.use('/upload', express.static(path.resolve(__dirname, '../upload')))

app.get(['/health', '/api/health'], (_req, res) => {
  res.json({ ok: true, service: 'bms-backend' })
})

app.use('/api', bmsRoutes)

const enableDiag =
  !isProduction() || String(process.env.ENABLE_DIAG_API || '').toLowerCase() === 'true'
if (enableDiag) {
  app.use('/api/diag', diagnosticsRoutes)
}

app.use('/', bmsRoutes)

app.use((_req, res) => {
  res.status(404).json({ ok: false, error: 'Not found' })
})

app.use((err, _req, res, _next) => {
  console.error(err)
  const status = err.status && Number.isInteger(err.status) ? err.status : 500
  const body = { ok: false, error: 'Internal server error' }
  if (!isProduction() && err.message) {
    body.detail = err.message
  }
  res.status(status).json(body)
})

app.listen(PORT, HOST, () => {
  console.log(`BMS backend listening on http://${HOST}:${PORT} (${isProduction() ? 'production' : 'development'})`)
})
