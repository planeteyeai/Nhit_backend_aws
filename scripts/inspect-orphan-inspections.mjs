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
const [rows] = await conn.query(`
  SELECT i.bridge_inspection_id, i.bridge_id, i.status, i.bmc_inspection_status
  FROM database_Bms.bridge_inspection i
  LEFT JOIN database_Bms.bridge b ON b.bridge_id = i.bridge_id
  WHERE b.bridge_id IS NULL
  ORDER BY i.bridge_inspection_id
`)
console.log(JSON.stringify(rows, null, 2))

const [maybe] = await conn.query(`
  SELECT i.bridge_inspection_id, i.bridge_id,
    EXISTS(SELECT 1 FROM database_Bms.bridge b WHERE b.bridge_id = i.bridge_id + 10000) AS plus_exists,
    EXISTS(SELECT 1 FROM database_Bms.bridge b WHERE b.bridge_id = i.bridge_id - 10000) AS minus_exists
  FROM database_Bms.bridge_inspection i
  LEFT JOIN database_Bms.bridge b ON b.bridge_id = i.bridge_id
  WHERE b.bridge_id IS NULL
`)
console.log('repair hints', maybe)

await conn.end()
