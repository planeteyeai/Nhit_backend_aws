import mysql from 'mysql2/promise'
import dotenv from 'dotenv'

dotenv.config()

const port = Number(process.env.MYSQL_PORT || 3306)
const useSsl = process.env.MYSQL_SSL === '1' || process.env.MYSQL_SSL === 'true'

const poolConfig = {
  host: process.env.MYSQL_HOST,
  port,
  user: process.env.MYSQL_USER,
  password: process.env.MYSQL_PASSWORD,
  database: process.env.MYSQL_DATABASE,
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
  enableKeepAlive: true,
  keepAliveInitialDelay: 0,
}

if (useSsl) {
  poolConfig.ssl = { rejectUnauthorized: true }
}

export const pool = mysql.createPool(poolConfig)

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
