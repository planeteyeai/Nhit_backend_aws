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

const today = new Date().toISOString().slice(0, 10)
const future = new Date(Date.now() + 15 * 86400000).toISOString().slice(0, 10)

for (const db of ['bms1', 'ramsneyv_bms_staging', 'database_Bms', 'railway']) {
  try {
    const [[a]] = await conn.query(
      `SELECT COUNT(*) c FROM \`${db}\`.schedule_inspecion si
       INNER JOIN (SELECT bridge_id, MAX(si_id) mx FROM \`${db}\`.schedule_inspecion WHERE LOWER(TRIM(status))='active' GROUP BY bridge_id) x ON x.mx=si.si_id`,
    )
    const [[u]] = await conn.query(
      `SELECT COUNT(*) c FROM \`${db}\`.schedule_inspecion_notification sin
       INNER JOIN \`${db}\`.bridge b ON b.bridge_id=sin.bridge_id
       WHERE LOWER(TRIM(sin.status))='pending' AND sin.reminder_date BETWEEN ? AND ?`,
      [today, future],
    )
    const [[o]] = await conn.query(
      `SELECT COUNT(*) c FROM \`${db}\`.schedule_inspecion_notification sin
       INNER JOIN \`${db}\`.bridge b ON b.bridge_id=sin.bridge_id
       WHERE LOWER(TRIM(sin.status))='pending' AND sin.reminder_date < ?`,
      [today],
    )
    const [st] = await conn.query(
      `SELECT status, COUNT(*) c FROM \`${db}\`.schedule_inspecion_notification GROUP BY status`,
    )
    console.log(db, { nodeActiveSched: a.c, phpUpcoming: u.c, phpOverdue: o.c, phpTotal: Number(u.c) + Number(o.c), notifStatus: st })
  } catch (e) {
    console.log(db, 'ERR', e.message)
  }
}
await conn.end()
