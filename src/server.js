import express from 'express'
import cors from 'cors'
import dotenv from 'dotenv'
import path from 'path'
import { fileURLToPath } from 'url'
import diagnosticsRoutes from './routes/index.js'
import bmsRoutes from './routes/bmsRoutes.js'

dotenv.config()

const app = express()
const PORT = Number(process.env.PORT || 3001)
const HOST = (process.env.HOST || '0.0.0.0').trim()
const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const corsOrigin = (process.env.CORS_ORIGIN || '').trim()
const allowedOrigins = corsOrigin ? corsOrigin.split(',').map((s) => s.trim()).filter(Boolean) : null
const isProd = String(process.env.NODE_ENV || '').toLowerCase() === 'production'

app.use(
  cors({
    origin: (origin, cb) => {
      // Allow non-browser requests (curl, server-to-server) with no Origin header
      if (!origin) return cb(null, true)
      // Dev/LAN usage: allow all origins unless explicitly restricted
      if (!isProd && !allowedOrigins) return cb(null, true)
      // If restricted list is not provided in prod, still allow (avoid accidental lockout)
      if (!allowedOrigins) return cb(null, true)
      if (allowedOrigins.includes(origin)) return cb(null, true)
      return cb(new Error(`CORS blocked origin: ${origin}`))
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
app.use('/api/diag', diagnosticsRoutes)
app.use('/', bmsRoutes)

app.use((_req, res) => {
  res.status(404).json({ ok: false, error: 'Not found' })
})

app.use((err, _req, res, _next) => {
  console.error(err)
  res.status(500).json({ ok: false, error: 'Internal server error' })
})

app.listen(PORT, HOST, () => {
  console.log(`BMS backend listening on http://${HOST}:${PORT}`)
})
