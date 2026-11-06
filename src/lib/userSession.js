import crypto from 'crypto'
import { pool } from '../config/db.js'

let columnsReady = false

function parseExpiresInToMs(raw) {
  const s = String(raw || '30m').trim().toLowerCase()
  const m = /^(\d+)\s*([smhd])?$/.exec(s)
  if (!m) return 30 * 60 * 1000
  const n = Number(m[1])
  const unit = m[2] || 'm'
  if (unit === 's') return n * 1000
  if (unit === 'm') return n * 60 * 1000
  if (unit === 'd') return n * 24 * 60 * 60 * 1000
  return n * 60 * 60 * 1000
}

function jwtExpiresInRaw() {
  return String(process.env.JWT_EXPIRES_IN || '30m').trim() || '30m'
}

export async function ensureUserSessionColumns(db = pool) {
  if (columnsReady) return
  const [cols] = await db.query(
    `SELECT COLUMN_NAME
     FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'users'`
  )
  const colSet = new Set((cols || []).map((r) => String(r.COLUMN_NAME || '').toLowerCase()))
  const addIfMissing = async (name, ddl) => {
    if (colSet.has(name.toLowerCase())) return
    await db.query(`ALTER TABLE users ADD COLUMN ${ddl}`)
    colSet.add(name.toLowerCase())
  }
  await addIfMissing('session_id', 'session_id VARCHAR(64) NULL')
  await addIfMissing('session_expires_at', 'session_expires_at DATETIME NULL')
  columnsReady = true
}

export function newSessionId() {
  return crypto.randomBytes(24).toString('hex')
}

export function sessionExpiryDate(from = new Date()) {
  return new Date(from.getTime() + parseExpiresInToMs(jwtExpiresInRaw()))
}

export async function getUserSessionRow(uid) {
  await ensureUserSessionColumns()
  const id = Number(uid || 0)
  if (!id) return null
  const [rows] = await pool.query(
    `SELECT uid, session_id, session_expires_at
     FROM users WHERE uid = ? LIMIT 1`,
    [id]
  )
  return rows[0] || null
}

export function isSessionActive(row, now = new Date()) {
  const sid = String(row?.session_id || '').trim()
  if (!sid) return false
  const exp = row?.session_expires_at ? new Date(row.session_expires_at) : null
  if (!exp || Number.isNaN(exp.getTime())) return false
  return exp.getTime() > now.getTime()
}

export async function startUserSession(uid, { sessionId } = {}) {
  await ensureUserSessionColumns()
  const sid = String(sessionId || newSessionId()).trim()
  const expires = sessionExpiryDate()
  await pool.query(
    `UPDATE users
     SET session_id = ?, session_expires_at = ?
     WHERE uid = ?`,
    [sid, expires, Number(uid)]
  )
  return { sessionId: sid, expiresAt: expires }
}

export async function touchUserSession(uid, sessionId) {
  await ensureUserSessionColumns()
  const sid = String(sessionId || '').trim()
  const id = Number(uid || 0)
  if (!id || !sid) return false
  const expires = sessionExpiryDate()
  const [r] = await pool.query(
    `UPDATE users
     SET session_expires_at = ?
     WHERE uid = ? AND session_id = ?`,
    [expires, id, sid]
  )
  return Number(r?.affectedRows || 0) > 0
}

export async function clearUserSession(uid, sessionId = null) {
  await ensureUserSessionColumns()
  const id = Number(uid || 0)
  if (!id) return
  if (sessionId) {
    await pool.query(
      `UPDATE users
       SET session_id = NULL, session_expires_at = NULL
       WHERE uid = ? AND session_id = ?`,
      [id, String(sessionId)]
    )
    return
  }
  await pool.query(
    `UPDATE users
     SET session_id = NULL, session_expires_at = NULL
     WHERE uid = ?`,
    [id]
  )
}

/** Returns true when JWT sid matches the active DB session. */
export async function assertJwtSessionMatchesDb(user) {
  const uid = Number(user?.uid || 0)
  const sid = String(user?.sid || '').trim()
  if (!uid || !sid) return false
  const row = await getUserSessionRow(uid)
  if (!isSessionActive(row)) return false
  return String(row.session_id || '').trim() === sid
}
