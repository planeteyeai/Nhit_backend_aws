/**
 * ECS-safe entrypoint: bind /health on 0.0.0.0 BEFORE loading the heavy app graph.
 * If attach fails, health still returns 200 with bootError so the circuit breaker
 * does not flap while CloudWatch shows the real stack.
 */
import express from 'express'
import dotenv from 'dotenv'
import { bootState } from './bootState.js'

dotenv.config()

const PORT = Number(process.env.PORT || 8080)
/** Always bind all interfaces in containers — HOST=127.0.0.1 breaks ALB health checks. */
const HOST = '0.0.0.0'

const app = express()

app.get(['/health', '/api/health'], (_req, res) => {
  const body = {
    ok: true,
    ready: bootState.ready,
    imageSha: String(process.env.IMAGE_SHA || '').slice(0, 12) || undefined,
  }
  if (bootState.bootError) {
    body.bootError = String(bootState.bootError).slice(0, 300)
  }
  if (typeof bootState.enrich === 'function') {
    try {
      Object.assign(body, bootState.enrich() || {})
    } catch (e) {
      body.enrichError = e.message || String(e)
    }
  }
  res.status(200).json(body)
})

const server = app.listen(PORT, HOST, () => {
  const mode = String(process.env.NODE_ENV || 'development')
  console.log(`BMS boot bind http://${HOST}:${PORT} (${mode}) — loading app…`)

  import('./attachApp.js')
    .then(({ attachBmsApp }) => attachBmsApp(app))
    .then(() => {
      bootState.ready = true
      bootState.bootError = null
      console.log('BMS app attached — ready')
    })
    .catch((err) => {
      bootState.bootError = err?.stack || err?.message || String(err)
      console.error('[FATAL] BMS app attach failed — /health stays up for ECS:', bootState.bootError)
    })
})

server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    console.error(`Port ${PORT} is already in use.`)
    process.exit(1)
  }
  throw err
})
