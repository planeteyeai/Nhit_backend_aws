import crypto from 'crypto'
import bcrypt from 'bcryptjs'

const BCRYPT_ROUNDS = 10
const MIN_PASSWORD_LENGTH = 6
const MAX_PASSWORD_LENGTH = 128

export function md5Hex(str) {
  return crypto.createHash('md5').update(String(str), 'utf8').digest('hex')
}

/**
 * Reject empty / too-short / absurdly long passwords before hashing.
 * @returns {{ ok: true } | { ok: false, message: string }}
 */
export function assertPasswordPolicy(plain) {
  const p = String(plain ?? '')
  if (!p.trim()) return { ok: false, message: 'Password is required' }
  if (p.length < MIN_PASSWORD_LENGTH) {
    return { ok: false, message: `Password must be at least ${MIN_PASSWORD_LENGTH} characters` }
  }
  if (p.length > MAX_PASSWORD_LENGTH) {
    return { ok: false, message: `Password must be at most ${MAX_PASSWORD_LENGTH} characters` }
  }
  return { ok: true }
}

function isBcryptHash(stored) {
  const s = String(stored || '')
  return s.startsWith('$2a$') || s.startsWith('$2b$') || s.startsWith('$2y$')
}

/** Hash a new password with bcrypt (preferred). */
export async function hashPassword(plain) {
  return bcrypt.hash(String(plain), BCRYPT_ROUNDS)
}

/**
 * Verify password. Supports bcrypt (new) and legacy MD5 hex.
 * Plaintext stored passwords are rejected.
 */
export async function verifyPassword(stored, plain) {
  if (!stored || !plain) return false
  const s = String(stored).trim()
  const p = String(plain).trim()
  if (isBcryptHash(s)) {
    try {
      return await bcrypt.compare(p, s)
    } catch {
      return false
    }
  }
  if (/^[a-f0-9]{32}$/i.test(s)) {
    return s.toLowerCase() === md5Hex(p).toLowerCase()
  }
  return false
}

/** After successful legacy MD5 login, upgrade stored hash to bcrypt. */
export async function needsPasswordUpgrade(stored) {
  const s = String(stored || '').trim()
  if (!s) return false
  if (isBcryptHash(s)) return false
  return /^[a-f0-9]{32}$/i.test(s)
}
