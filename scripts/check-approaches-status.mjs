import 'dotenv/config'
import mysql from 'mysql2/promise'

const p = mysql.createPool({
  host: process.env.MYSQL_HOST,
  port: +process.env.MYSQL_PORT,
  user: process.env.MYSQL_USER,
  password: process.env.MYSQL_PASSWORD,
  database: process.env.MYSQL_DATABASE,
})

const [distinct] = await p.query('SELECT DISTINCT status FROM approaches_bridge')
console.log('distinct status:', distinct)
const [ctype] = await p.query(
  "SELECT COLUMN_TYPE FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'approaches_bridge' AND COLUMN_NAME = 'status'"
)
console.log('column type:', ctype)
await p.end()

