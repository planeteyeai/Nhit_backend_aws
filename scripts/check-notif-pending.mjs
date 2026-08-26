import mysql from 'mysql2/promise'
import dotenv from 'dotenv'
dotenv.config()

const c = await mysql.createConnection({
  host: process.env.MYSQL_HOST,
  port: Number(process.env.MYSQL_PORT || 3306),
  user: process.env.MYSQL_USER,
  password: process.env.MYSQL_PASSWORD,
  ssl: { rejectUnauthorized: false },
  database: process.env.MYSQL_DATABASE,
})
const [r] = await c.query('SELECT status, COUNT(*) c FROM schedule_inspecion_notification GROUP BY status')
const today = new Date().toISOString().slice(0, 10)
const future = new Date(Date.now() + 15 * 86400000).toISOString().slice(0, 10)
const [[p]] = await c.query(
  `SELECT COUNT(*) c FROM schedule_inspecion_notification WHERE LOWER(TRIM(status))='pending' AND reminder_date BETWEEN ? AND ?`,
  [today, future],
)
const [sample] = await c.query(
  'SELECT notification_id, bridge_id, inspecion_type, reminder_date, status FROM schedule_inspecion_notification ORDER BY notification_id DESC LIMIT 5',
)
console.log({ db: process.env.MYSQL_DATABASE, statuses: r, pendingUpcoming: p.c, sample })
await c.end()
