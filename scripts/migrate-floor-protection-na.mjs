/**
 * Apply 012: general_bridge.floor_protection + general.floor_protection ENUM add 'NA'.
 */
import mysql from 'mysql2/promise'
import dotenv from 'dotenv'

dotenv.config()

function parseEnum(typeStr) {
  const m = String(typeStr || '').match(/^enum\((.*)\)$/i)
  if (!m) return []
  return m[1].split(',').map((p) => p.trim().replace(/^'|'$/g, '').replace(/''/g, "'"))
}

async function ensureNa(conn, table) {
  const [cols] = await conn.query(`SHOW COLUMNS FROM \`${table}\` LIKE 'floor_protection'`)
  const col = cols[0]
  if (!col) throw new Error(`${table}.floor_protection column not found`)
  const values = parseEnum(col.Type)
  console.log(`${table}.floor_protection current:`, values.join(', ') || col.Type)
  if (values.includes('NA')) {
    console.log(`${table}: already has NA`)
    return
  }
  await conn.query(
    `ALTER TABLE \`${table}\` MODIFY COLUMN \`floor_protection\` ENUM('Yes','No','NA') NOT NULL`
  )
  console.log(`${table}: added NA to ENUM`)
}

async function main() {
  const useSsl = process.env.MYSQL_SSL === '1' || process.env.MYSQL_SSL === 'true'
  const rejectUnauthorized = !['0', 'false'].includes(
    String(process.env.MYSQL_SSL_REJECT_UNAUTHORIZED || '').toLowerCase()
  )
  const conn = await mysql.createConnection({
    host: process.env.MYSQL_HOST,
    port: Number(process.env.MYSQL_PORT || 3306),
    user: process.env.MYSQL_USER,
    password: process.env.MYSQL_PASSWORD,
    database: process.env.MYSQL_DATABASE,
    ssl: useSsl ? { rejectUnauthorized } : undefined,
  })

  try {
    await ensureNa(conn, 'general_bridge')
    await ensureNa(conn, 'general')
    console.log('done')
  } finally {
    await conn.end()
  }
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
