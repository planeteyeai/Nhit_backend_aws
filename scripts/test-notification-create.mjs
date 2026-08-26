import mysql from 'mysql2/promise'
import dotenv from 'dotenv'
dotenv.config()

function formatReminderDate(value) {
  if (value == null || value === '') return ''
  if (value instanceof Date) {
    const y = value.getFullYear()
    const m = String(value.getMonth() + 1).padStart(2, '0')
    const day = String(value.getDate()).padStart(2, '0')
    return `${y}-${m}-${day}`
  }
  const s = String(value)
  return s.length >= 10 ? s.slice(0, 10) : s
}

function reminderDateFromScheduleMonth(monthStr) {
  const month = String(monthStr || '').trim()
  if (!month) return null
  const mm = Number(month)
  if (!Number.isFinite(mm) || mm < 1 || mm > 12) return null
  const currentYear = new Date().getFullYear()
  const d = new Date(currentYear, mm - 1, 1)
  d.setMonth(d.getMonth() - 1)
  d.setDate(15)
  return formatReminderDate(d)
}

function reminderDateFromAdhocDate(adhocDate) {
  const raw = String(adhocDate || '').trim()
  if (!raw) return null
  const d = new Date(raw.length <= 10 ? `${raw}T12:00:00` : raw)
  if (Number.isNaN(d.getTime())) return null
  d.setDate(d.getDate() - 15)
  return formatReminderDate(d)
}

console.log('pre month 06 ->', reminderDateFromScheduleMonth('06'))
console.log('pre month 01 ->', reminderDateFromScheduleMonth('01'))
console.log('adhoc 2026-04-01 ->', reminderDateFromAdhocDate('2026-04-01'))

const conn = await mysql.createConnection({
  host: process.env.MYSQL_HOST,
  port: Number(process.env.MYSQL_PORT || 3306),
  user: process.env.MYSQL_USER,
  password: process.env.MYSQL_PASSWORD,
  ssl: { rejectUnauthorized: false },
  database: process.env.MYSQL_DATABASE,
})

const bridgeId = 414
const adhocDate = '2026-09-15'
const reminderDate = reminderDateFromAdhocDate(adhocDate)
const [ins] = await conn.query(
  `INSERT INTO schedule_adhoc_inspecion (bridge_id, adhoc_inspecion_date, comment, status, updated_by, updated_on)
   VALUES (?, ?, 'test notification flow', 'Active', 0, NOW())`,
  [bridgeId, adhocDate],
)
const adhocId = ins.insertId
const [notif] = await conn.query(
  `INSERT INTO schedule_inspecion_notification
   (bridge_id, si_id, adhoc_inspecion_id, inspecion_type, reminder_date, status)
   VALUES (?, 0, ?, 'Adhoc Inspecion Date', ?, 'Pending')`,
  [bridgeId, adhocId, reminderDate],
)

const today = new Date().toISOString().slice(0, 10)
const future = new Date(Date.now() + 15 * 86400000).toISOString().slice(0, 10)
const [[pending]] = await conn.query(
  `SELECT COUNT(*) c FROM schedule_inspecion_notification WHERE LOWER(TRIM(status))='pending'`,
)
const [[inWindow]] = await conn.query(
  `SELECT COUNT(*) c FROM schedule_inspecion_notification
   WHERE notification_id = ? AND reminder_date BETWEEN ? AND ?`,
  [notif.insertId, today, future],
)

console.log({
  db: process.env.MYSQL_DATABASE,
  testAdhocId: adhocId,
  testNotificationId: notif.insertId,
  reminderDate,
  totalPending: pending.c,
  testInSiteListWindow: inWindow.c,
})

await conn.end()
