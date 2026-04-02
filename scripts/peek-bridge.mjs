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
  })
  try {
    const [db] = await conn.query('SELECT DATABASE() AS db')
    console.log('DATABASE() =', db?.[0]?.db)

    const [cnt] = await conn.query('SELECT COUNT(*) AS c FROM bridge')
    console.log('bridge count =', cnt?.[0]?.c)

    const [rows] = await conn.query(
      `SELECT bridge_id, project_name, bridge_identity_no, status, bmc_status, created_on, created_by, updated_on, updated_by
       FROM bridge
       ORDER BY bridge_id DESC
       LIMIT 10`
    )
    console.table(rows)
  } finally {
    await conn.end()
  }
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})

