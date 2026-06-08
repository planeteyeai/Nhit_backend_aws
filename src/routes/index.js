import { Router } from 'express'
import { pool, pingDatabase } from '../config/db.js'
import { isProduction } from '../lib/envValidate.js'

const router = Router()

router.get('/health', (_req, res) => {
  res.json({ ok: true, service: 'bms-backend' })
})

router.get('/db', async (_req, res) => {
  try {
    const result = await pingDatabase()
    res.json({ ok: true, database: result.info })
  } catch (err) {
    console.error('DB ping failed:', err.message)
    const body = { ok: false, error: 'Database unavailable' }
    if (!isProduction()) {
      body.detail = err.message
      body.config = {
        host: process.env.MYSQL_HOST || '(not set)',
        port: process.env.MYSQL_PORT || '(not set)',
        user: process.env.MYSQL_USER || '(not set)',
        database: process.env.MYSQL_DATABASE || '(not set)',
        ssl: process.env.MYSQL_SSL || '(not set)',
      }
    }
    res.status(503).json(body)
  }
})

router.get('/tables', async (_req, res) => {
  try {
    const [rows] = await pool.query(
      `SELECT TABLE_NAME AS name, TABLE_ROWS AS approx_rows
       FROM information_schema.TABLES
       WHERE TABLE_SCHEMA = DATABASE()
       ORDER BY TABLE_NAME`
    )
    res.json({ ok: true, tables: rows })
  } catch (err) {
    console.error('List tables failed:', err.message)
    res.status(500).json({
      ok: false,
      error: 'Request failed',
      detail: isProduction() ? undefined : err.message,
    })
  }
})

export default router
