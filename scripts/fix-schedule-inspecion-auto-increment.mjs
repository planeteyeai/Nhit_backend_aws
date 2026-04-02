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
         AND TABLE_NAME = 'schedule_inspecion'
         AND COLUMN_NAME = 'si_id'`
    )
    console.log('schedule_inspecion.si_id column:', rows)

    const extra = String(rows?.[0]?.EXTRA || '')
    const isAuto = extra.toLowerCase().includes('auto_increment')
    if (isAuto) {
      console.log('[ok] si_id is already AUTO_INCREMENT')
      return
    }

    console.log('[fix] applying PRIMARY KEY + AUTO_INCREMENT for si_id')
    await conn
      .query(`ALTER TABLE schedule_inspecion ADD PRIMARY KEY (si_id)`)
      .catch((e) => console.log('[skip] add PK failed (maybe exists):', e.message))
    await conn.query(`ALTER TABLE schedule_inspecion MODIFY si_id int(11) NOT NULL AUTO_INCREMENT`)
    console.log('[ok] si_id updated to AUTO_INCREMENT')
  } finally {
    await conn.end()
  }
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})

