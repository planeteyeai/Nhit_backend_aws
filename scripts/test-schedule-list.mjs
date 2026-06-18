import 'dotenv/config'
import mysql from 'mysql2/promise'

const c = await mysql.createConnection({
  host: process.env.MYSQL_HOST,
  port: process.env.MYSQL_PORT,
  user: process.env.MYSQL_USER,
  password: process.env.MYSQL_PASSWORD,
  database: process.env.MYSQL_DATABASE,
})

const [active] = await c.query(
  "SELECT COUNT(*) AS c FROM schedule_inspecion WHERE LOWER(TRIM(status)) = 'active'"
)
const [adhoc] = await c.query(
  "SELECT adhoc_inspecion_id, bridge_id, status FROM schedule_adhoc_inspecion ORDER BY adhoc_inspecion_id DESC LIMIT 5"
)
console.log('active regular schedules:', active[0].c)
console.log('adhoc sample:', adhoc)

await c.end()
