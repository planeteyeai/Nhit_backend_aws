import mysql from 'mysql2/promise'
import dotenv from 'dotenv'

dotenv.config()

const port = Number(process.env.MYSQL_PORT || 3306)
const useSsl = process.env.MYSQL_SSL === '1' || process.env.MYSQL_SSL === 'true'
const rejectUnauthorized = !['0', 'false'].includes(
  String(process.env.MYSQL_SSL_REJECT_UNAUTHORIZED || '').toLowerCase()
)

const poolConfig = {
  host: process.env.MYSQL_HOST,
  port,
  user: process.env.MYSQL_USER,
  password: process.env.MYSQL_PASSWORD,
  database: process.env.MYSQL_DATABASE,
  waitForConnections: true,
  connectionLimit: 8,
  queueLimit: 0,
  enableKeepAlive: true,
  // Railway / proxy idle sockets drop; delay before TCP keepalive probes.
  keepAliveInitialDelay: 10_000,
  // Recycle idle connections before the proxy kills them.
  idleTimeout: 60_000,
  maxIdle: 4,
  connectTimeout: 20_000,
}

if (useSsl) {
  poolConfig.ssl = { rejectUnauthorized }
}

export const pool = mysql.createPool(poolConfig)

const TRANSIENT = new Set(['ECONNRESET', 'PROTOCOL_CONNECTION_LOST', 'EPIPE', 'ETIMEDOUT', 'ECONNREFUSED'])

function isTransientDbError(err) {
  const code = String(err?.code || err?.errno || '')
  return TRANSIENT.has(code) || /ECONNRESET|connection lost|server closed/i.test(String(err?.message || ''))
}

/** Run a pool query with one reconnect retry on Railway proxy resets. */
export async function queryWithRetry(sql, params = [], { retries = 1 } = {}) {
  let lastErr
  for (let attempt = 0; attempt <= retries; attempt += 1) {
    try {
      return await pool.query(sql, params)
    } catch (err) {
      lastErr = err
      if (attempt >= retries || !isTransientDbError(err)) throw err
      console.warn(`[db] transient ${err.code || err.message} — retry ${attempt + 1}`)
      await new Promise((r) => setTimeout(r, 250 * (attempt + 1)))
    }
  }
  throw lastErr
}

export async function pingDatabase() {
  const conn = await pool.getConnection()
  try {
    await conn.ping()
    const [rows] = await conn.query('SELECT DATABASE() AS db, VERSION() AS version')
    return { ok: true, info: rows[0] }
  } finally {
    conn.release()
  }
}
