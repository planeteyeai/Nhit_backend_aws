import dotenv from 'dotenv'
import mysql from 'mysql2/promise'

dotenv.config()

async function main() {
  const conn = await mysql.createConnection({
    host: process.env.MYSQL_HOST,
    port: Number(process.env.MYSQL_PORT || 3306),
    user: process.env.MYSQL_USER,
    password: process.env.MYSQL_PASSWORD,
    database: process.env.MYSQL_DATABASE,
    ssl: process.env.MYSQL_SSL === '1' ? { rejectUnauthorized: true } : undefined,
    multipleStatements: true,
  })

  try {
    const [rows] = await conn.query(
      `SELECT COLUMN_NAME, COLUMN_KEY, EXTRA
       FROM information_schema.COLUMNS
       WHERE TABLE_SCHEMA = DATABASE()
         AND TABLE_NAME = 'bridge_inspection'
         AND COLUMN_NAME = 'bridge_inspection_id'`
    )
    console.log('bridge_inspection.bridge_inspection_id column:', rows)

    const extra = String(rows?.[0]?.EXTRA || '')
    const isAuto = extra.toLowerCase().includes('auto_increment')
    if (isAuto) {
      console.log('[ok] bridge_inspection_id is already AUTO_INCREMENT')
      return
    }

    console.log('[fix] applying PRIMARY KEY + AUTO_INCREMENT for bridge_inspection_id')
    await conn
      .query(`ALTER TABLE bridge_inspection ADD PRIMARY KEY (bridge_inspection_id)`)
      .catch((e) => console.log('[skip] add PK failed (maybe exists):', e.message))
    await conn.query(
      `ALTER TABLE bridge_inspection MODIFY bridge_inspection_id int(11) NOT NULL AUTO_INCREMENT`
    )
    console.log('[ok] bridge_inspection_id updated to AUTO_INCREMENT')
  } finally {
    await conn.end()
  }
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})

