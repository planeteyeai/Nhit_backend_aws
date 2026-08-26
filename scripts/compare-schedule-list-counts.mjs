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

const db = process.env.MYSQL_DATABASE || 'bms1'
const today = new Date().toISOString().slice(0, 10)
const future = new Date(Date.now() + 15 * 86400000).toISOString().slice(0, 10)

const [[activeSched]] = await conn.query(
  `SELECT COUNT(*) c FROM (
     SELECT si.si_id FROM \`${db}\`.schedule_inspecion si
     INNER JOIN (SELECT bridge_id, MAX(si_id) mx FROM \`${db}\`.schedule_inspecion WHERE LOWER(TRIM(status))='active' GROUP BY bridge_id) x ON x.mx=si.si_id
     UNION ALL
     SELECT sa.adhoc_inspecion_id FROM \`${db}\`.schedule_adhoc_inspecion sa
     INNER JOIN (SELECT bridge_id, MAX(adhoc_inspecion_id) mx FROM \`${db}\`.schedule_adhoc_inspecion WHERE LOWER(TRIM(status))='active' GROUP BY bridge_id) x ON x.mx=sa.adhoc_inspecion_id
   ) t`,
)
const [[phpUpcoming]] = await conn.query(
  `SELECT COUNT(*) c FROM \`${db}\`.schedule_inspecion_notification sin
   INNER JOIN \`${db}\`.bridge b ON b.bridge_id=sin.bridge_id
   WHERE LOWER(TRIM(sin.status))='pending' AND sin.reminder_date BETWEEN ? AND ?`,
  [today, future],
)
const [[phpOverdue]] = await conn.query(
  `SELECT COUNT(*) c FROM \`${db}\`.schedule_inspecion_notification sin
   INNER JOIN \`${db}\`.bridge b ON b.bridge_id=sin.bridge_id
   WHERE LOWER(TRIM(sin.status))='pending' AND sin.reminder_date < ?`,
  [today],
)
const [[phpTotal]] = await conn.query(
  `SELECT COUNT(*) c FROM \`${db}\`.schedule_inspecion_notification sin
   INNER JOIN \`${db}\`.bridge b ON b.bridge_id=sin.bridge_id
   WHERE LOWER(TRIM(sin.status))='pending'`,
)
const [notifStatus] = await conn.query(
  `SELECT status, COUNT(*) c FROM \`${db}\`.schedule_inspecion_notification GROUP BY status`,
)
console.log(JSON.stringify({ db, today, future, nodeActiveSched: activeSched.c, phpUpcoming: phpUpcoming.c, phpOverdue: phpOverdue.c, phpTotalPending: phpTotal.c, notifStatus }, null, 2))
await conn.end()
