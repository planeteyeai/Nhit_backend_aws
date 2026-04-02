import 'dotenv/config'
import mysql from 'mysql2/promise'

const p = mysql.createPool({
  host: process.env.MYSQL_HOST,
  port: +process.env.MYSQL_PORT,
  user: process.env.MYSQL_USER,
  password: process.env.MYSQL_PASSWORD,
  database: process.env.MYSQL_DATABASE,
})

const [c] = await p.query(
  "SELECT COLUMN_NAME FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'schedule_adhoc_inspecion' ORDER BY ORDINAL_POSITION"
)
console.log('schedule_adhoc_inspecion:', c.map((x) => x.COLUMN_NAME).join(', '))
const [r] = await p.query('SELECT * FROM schedule_adhoc_inspecion LIMIT 3')
console.log(JSON.stringify(r, null, 2))
await p.end()

