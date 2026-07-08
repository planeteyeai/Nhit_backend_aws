/**
 * In-memory login rate limiter.
 * After MAX_FAILURES failed attempts for the same IP+username, lock for LOCKOUT_MS.
 */
const MAX_FAILURES = 5
const LOCKOUT_MS = 5 * 60 * 1000
const WINDOW_MS = 5 * 60 * 1000

/** @type {Map<string, { failures: number, firstFailureAt: number, lockedUntil: number }>} */
const attempts = new Map()

function clientIp(req) {
  const xf = String(req.headers['x-forwarded-for'] || '')
    .split(',')[0]
    .trim()
  return xf || req.ip || req.socket?.remoteAddress || 'unknown'
}

function normalizeUsername(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
}

export function loginAttemptKey(req, username) {
  return `${clientIp(req)}::${normalizeUsername(username) || '_'}`
}

function purgeExpired(key, now = Date.now()) {
  const entry = attempts.get(key)
  if (!entry) return
  if (entry.lockedUntil && entry.lockedUntil <= now) {
    attempts.delete(key)
    return
  }
  if (!entry.lockedUntil && entry.firstFailureAt && now - entry.firstFailureAt > WINDOW_MS) {
    attempts.delete(key)
  }
}

export function getLoginLockStatus(req, username) {
  const key = loginAttemptKey(req, username)
  const now = Date.now()
  purgeExpired(key, now)
  const entry = attempts.get(key)
  if (!entry?.lockedUntil || entry.lockedUntil <= now) {
    return { locked: false, retryAfterSec: 0, failures: entry?.failures || 0, remaining: MAX_FAILURES - (entry?.failures || 0) }
  }
  return {
    locked: true,
    retryAfterSec: Math.max(1, Math.ceil((entry.lockedUntil - now) / 1000)),
    failures: entry.failures,
    remaining: 0,
  }
}

export function recordLoginFailure(req, username) {
  const key = loginAttemptKey(req, username)
  const now = Date.now()
  purgeExpired(key, now)
  let entry = attempts.get(key)
  if (!entry) {
    entry = { failures: 0, firstFailureAt: now, lockedUntil: 0 }
  }
  if (!entry.firstFailureAt || now - entry.firstFailureAt > WINDOW_MS) {
    entry.failures = 0
    entry.firstFailureAt = now
    entry.lockedUntil = 0
  }
  entry.failures += 1
  if (entry.failures >= MAX_FAILURES) {
    entry.lockedUntil = now + LOCKOUT_MS
  }
  attempts.set(key, entry)
  return getLoginLockStatus(req, username)
}

export function clearLoginFailures(req, username) {
  attempts.delete(loginAttemptKey(req, username))
}

export function loginLockMessage(retryAfterSec) {
  const mins = Math.max(1, Math.ceil(Number(retryAfterSec || 0) / 60))
  return `Too many failed login attempts. Please wait ${mins} minute${mins === 1 ? '' : 's'} before trying again.`
}

export const LOGIN_RATE_LIMIT = {
  maxFailures: MAX_FAILURES,
  lockoutMs: LOCKOUT_MS,
  windowMs: WINDOW_MS,
}

/** Test helper — clear all tracked attempts. */
export function __resetLoginRateLimitForTests() {
  attempts.clear()
}
