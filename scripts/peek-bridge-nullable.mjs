import 'dotenv/config'
import mysql from 'mysql2/promise'

const p = mysql.createPool({
  host: process.env.MYSQL_HOST,
  port: +process.env.MYSQL_PORT,
  user: process.env.MYSQL_USER,
  password: process.env.MYSQL_PASSWORD,
  database: process.env.MYSQL_DATABASE,
})

const [rows] = await p.query(
  `SELECT COLUMN_NAME, IS_NULLABLE, COLUMN_DEFAULT, DATA_TYPE
   FROM information_schema.COLUMNS
   WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'bridge'
   ORDER BY ORDINAL_POSITION`
)
console.log(rows)
await p.end()

