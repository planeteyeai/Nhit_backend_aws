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
const [s] = await conn.query(`
  SELECT s.si_id, s.bridge_id FROM database_Bms.schedule_inspecion s
  LEFT JOIN database_Bms.bridge b ON b.bridge_id = s.bridge_id WHERE b.bridge_id IS NULL
`)
const [a] = await conn.query(`
  SELECT s.adhoc_inspecion_id, s.bridge_id FROM database_Bms.schedule_adhoc_inspecion s
  LEFT JOIN database_Bms.bridge b ON b.bridge_id = s.bridge_id WHERE b.bridge_id IS NULL
`)
const [rs] = await conn.query(`
  SELECT s.si_id, s.bridge_id FROM railway.schedule_inspecion s
  LEFT JOIN railway.bridge b ON b.bridge_id = s.bridge_id WHERE b.bridge_id IS NULL
`)
console.log({ bms_sched: s, bms_adhoc: a, railway_sched: rs })
await conn.end()
