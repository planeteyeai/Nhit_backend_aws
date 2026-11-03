import jwt from 'jsonwebtoken'
import { pool } from '../config/db.js'
import { isAdminOrBmcRole, normalizeAppRole } from '../lib/roles.js'

const WEAK_JWT_SECRETS = new Set([
  'bms-dev-secret-change-in-production',
  'change-me-in-production',
  'change-me-in-development-only',
])

const JWT_VERIFY_OPTS = { algorithms: ['HS256'] }

function isWeakJwtSecret(value) {
  const s = String(value || '').trim()
  if (!s || s.length < 16) return true
  if (WEAK_JWT_SECRETS.has(s)) return true
  if (/change.?me|your.?jwt|placeholder|secret.?from.?production/i.test(s)) return true
  return false
}

/** Resolve JWT secret — never falls back to a hardcoded value. */
export function getJwtSecret() {
  const s = String(process.env.JWT_SECRET || '').trim()
  if (!s) {
    throw new Error('JWT_SECRET is not configured')
  }
  if (String(process.env.NODE_ENV || '').toLowerCase() === 'production' && isWeakJwtSecret(s)) {
    throw new Error('JWT_SECRET is missing or too weak for production')
  }
  return s
}

export function signToken(payload) {
  return jwt.sign(payload, getJwtSecret(), { algorithm: 'HS256', expiresIn: '7d' })
}

function extractBearer(req) {
  const h = req.headers.authorization
  if (h && h.startsWith('Bearer ')) return h.slice(7).trim()
  return ''
}

function verifyAccessToken(token) {
  return jwt.verify(token, getJwtSecret(), JWT_VERIFY_OPTS)
}

export function optionalAuth(req, res, next) {
  const token = extractBearer(req)
  if (!token) {
    req.user = null
    return next()
  }
  try {
    req.user = verifyAccessToken(token)
  } catch {
    req.user = null
  }
  next()
}

export function requireAuth(req, res, next) {
  const token = extractBearer(req)
  if (!token) {
    return res.status(401).json({ message: 'Unauthorized' })
  }
  try {
    req.user = verifyAccessToken(token)
    next()
  } catch (e) {
    if (String(e?.message || '').includes('JWT_SECRET')) {
      return res.status(503).json({ message: 'Authentication is misconfigured' })
    }
    return res.status(401).json({ message: 'Invalid or expired token' })
  }
}

/**
 * Load authoritative role/status from MySQL — JWT claims alone must not grant admin.
 * Returns null if user missing / inactive.
 */
export async function loadActiveDbUser(uid) {
  const id = Number(uid || 0)
  if (!id) return null
  const [rows] = await pool.query(
    `SELECT uid, username, user_role, user_status FROM users WHERE uid = ? LIMIT 1`,
    [id]
  )
  const row = rows[0]
  if (!row) return null
  if (String(row.user_status || '').trim() !== 'Active') return null
  return row
}

/** Attach DB role onto req.user (overwrites forged JWT role claims). */
export async function attachDbUserRole(req) {
  const row = await loadActiveDbUser(req.user?.uid)
  if (!row) return null
  req.user = {
    ...req.user,
    uid: row.uid,
    username: row.username,
    user_role: row.user_role,
    role: normalizeAppRole(row.user_role),
  }
  return row
}

/** Admin / BMC may manage users — role checked from DB, not JWT claims. */
export function requireUserAdmin(req, res, next) {
  return requireAuth(req, res, () => {
    Promise.resolve()
      .then(async () => {
        const row = await attachDbUserRole(req)
        if (!row || !isAdminOrBmcRole(row.user_role)) {
          return res.status(403).json({ message: 'Forbidden' })
        }
        return next()
      })
      .catch((e) => {
        console.error('[auth] requireUserAdmin:', e.message)
        return res.status(500).json({ message: 'Authorization failed' })
      })
  })
}

export function isUserManager(user) {
  if (!user) return false
  const raw = String(user.user_role || user.role || user.userrole || '')
    .trim()
    .toLowerCase()
  return raw.includes('admin') || raw.includes('bmc')
}
