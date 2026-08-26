import mysql from 'mysql2/promise'
import dotenv from 'dotenv'
dotenv.config()
const conn = await mysql.createConnection({
  host: process.env.MYSQL_HOST,
  port: Number(process.env.MYSQL_PORT || 3306),
  user: process.env.MYSQL_USER,
  password: process.env.MYSQL_PASSWORD,
  ssl: { rejectUnauthorized: false },
})
const [cols] = await conn.query(
  `SHOW COLUMNS FROM database_Bms.schedule_inspecion_notification`,
)
console.log(cols.map((c) => c.Field).join(', '))
const [[c]] = await conn.query(`SELECT COUNT(*) n FROM database_Bms.schedule_inspecion_notification`)
const [[p]] = await conn.query(
  `SELECT COUNT(*) n FROM database_Bms.schedule_inspecion_notification WHERE LOWER(TRIM(status))='pending'`,
)
console.log({ total: c.n, pending: p.n })
await conn.end()
