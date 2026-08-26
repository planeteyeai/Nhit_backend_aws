import mysql from 'mysql2/promise'
import dotenv from 'dotenv'
dotenv.config()

const conn = await mysql.createConnection({
  host: process.env.MYSQL_HOST,
  port: Number(process.env.MYSQL_PORT || 3306),
  user: process.env.MYSQL_USER,
  password: process.env.MYSQL_PASSWORD,
  ssl: { rejectUnauthorized: false },
  database: process.env.MYSQL_DATABASE,
})

const today = new Date().toISOString().slice(0, 10)
const future = new Date(Date.now() + 15 * 86400000).toISOString().slice(0, 10)
const where = `LOWER(TRIM(sin.status)) = 'pending'`
const fromSql = `
  FROM schedule_inspecion_notification sin
  INNER JOIN bridge b ON b.bridge_id = sin.bridge_id
  WHERE ${where}`

const [[upcoming]] = await conn.query(`SELECT COUNT(*) c ${fromSql} AND sin.reminder_date BETWEEN ? AND ?`, [today, future])
const [[overdue]] = await conn.query(`SELECT COUNT(*) c ${fromSql} AND sin.reminder_date < ?`, [today])
const [[activeSched]] = await conn.query(
  `SELECT COUNT(*) c FROM (
     SELECT si.si_id FROM schedule_inspecion si
     INNER JOIN (SELECT bridge_id, MAX(si_id) mx FROM schedule_inspecion WHERE LOWER(TRIM(status))='active' GROUP BY bridge_id) x ON x.mx=si.si_id
     UNION ALL
     SELECT sa.adhoc_inspecion_id FROM schedule_adhoc_inspecion sa
     INNER JOIN (SELECT bridge_id, MAX(adhoc_inspecion_id) mx FROM schedule_adhoc_inspecion WHERE LOWER(TRIM(status))='active' GROUP BY bridge_id) x ON x.mx=sa.adhoc_inspecion_id
   ) t`,
)

const selectSql = `
  SELECT sin.notification_id, sin.bridge_id, sin.inspecion_type, sin.reminder_date, b.popular_name_of_bridge, b.bridge_no`

const [rows] = await conn.query(
  `SELECT * FROM (
    ${selectSql}, 0 AS is_overdue ${fromSql} AND sin.reminder_date BETWEEN ? AND ?
    UNION ALL
    ${selectSql}, 1 AS is_overdue ${fromSql} AND sin.reminder_date < ?
  ) schedule_rows ORDER BY is_overdue ASC, reminder_date ASC LIMIT 5`,
  [today, future, today],
)

console.log(JSON.stringify({
  db: process.env.MYSQL_DATABASE,
  today,
  future,
  oldNodeListCount: activeSched.c,
  phpUpcoming: upcoming.c,
  phpOverdue: overdue.c,
  phpTotal: Number(upcoming.c) + Number(overdue.c),
  sampleRows: rows.length,
}, null, 2))

await conn.end()
