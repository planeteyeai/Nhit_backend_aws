import { Router } from 'express'
import { pool, pingDatabase } from '../config/db.js'

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
    res.status(503).json({
      ok: false,
      error: 'Database unavailable',
      detail: process.env.NODE_ENV === 'development' ? err.message : undefined,
    })
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
      error: err.message,
    })
  }
})

export default router
