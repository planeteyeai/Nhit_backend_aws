/**
 * Login / password-change lockouts (in-memory).
 *
 * Buckets:
 *  1) IP + username  — classic brute-force on one account from one client
 *  2) IP only        — credential stuffing / username spray from one client
 *  3) username only  — distributed brute-force against one account
 *  4) uid (password change) — wrong old-password spam
 *
 * Uses Express `req.ip` only (no client-controlled X-Forwarded-For).
 */
import { clientIp } from './rateLimit.js'

// Same IP + username: 5 wrong passwords → 15 min lock
const PAIR_MAX = 5
const PAIR_LOCK_MS = 15 * 60 * 1000
const PAIR_WINDOW_MS = 15 * 60 * 1000

const IP_MAX = 25
const IP_LOCK_MS = 15 * 60 * 1000
const IP_WINDOW_MS = 15 * 60 * 1000

// Same username (any IP): 5 wrong passwords → 15 min lock
const USER_MAX = 5
const USER_LOCK_MS = 15 * 60 * 1000
const USER_WINDOW_MS = 15 * 60 * 1000

const PWD_MAX = 5
const PWD_LOCK_MS = 15 * 60 * 1000
const PWD_WINDOW_MS = 15 * 60 * 1000

/** @type {Map<string, { failures: number, firstFailureAt: number, lockedUntil: number }>} */
const attempts = new Map()

function normalizeUsername(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
}

function pairKey(req, username) {
  return `pair:${clientIp(req)}::${normalizeUsername(username) || '_'}`
}

function ipKey(req) {
  return `ip:${clientIp(req)}`
}

function userKey(username) {
  return `user:${normalizeUsername(username) || '_'}`
}

function pwdKey(uid) {
  return `pwd:${Number(uid) || 0}`
}

function purgeExpired(key, now = Date.now()) {
  const entry = attempts.get(key)
  if (!entry) return
  if (entry.lockedUntil && entry.lockedUntil <= now) {
    attempts.delete(key)
    return
  }
  if (!entry.lockedUntil && entry.firstFailureAt && now - entry.firstFailureAt > Math.max(PAIR_WINDOW_MS, IP_WINDOW_MS, USER_WINDOW_MS, PWD_WINDOW_MS)) {
    attempts.delete(key)
  }
}

function readStatus(key, maxFailures, now = Date.now()) {
  purgeExpired(key, now)
  const entry = attempts.get(key)
  if (!entry?.lockedUntil || entry.lockedUntil <= now) {
    const failures = entry?.failures || 0
    return {
      locked: false,
      retryAfterSec: 0,
      failures,
      remaining: Math.max(0, maxFailures - failures),
    }
  }
  return {
    locked: true,
    retryAfterSec: Math.max(1, Math.ceil((entry.lockedUntil - now) / 1000)),
    failures: entry.failures,
    remaining: 0,
  }
}

function bump(key, maxFailures, windowMs, lockMs, now = Date.now()) {
  purgeExpired(key, now)
  let entry = attempts.get(key)
  if (!entry) {
    entry = { failures: 0, firstFailureAt: now, lockedUntil: 0 }
  }
  if (!entry.firstFailureAt || now - entry.firstFailureAt > windowMs) {
    entry.failures = 0
    entry.firstFailureAt = now
    entry.lockedUntil = 0
  }
  entry.failures += 1
  if (entry.failures >= maxFailures) {
    entry.lockedUntil = now + lockMs
  }
  attempts.set(key, entry)
  return readStatus(key, maxFailures, now)
}

function mergeLockStatus(...statuses) {
  const locked = statuses.filter((s) => s.locked)
  if (!locked.length) {
    const remaining = Math.min(...statuses.map((s) => s.remaining))
    const failures = Math.max(...statuses.map((s) => s.failures))
    return { locked: false, retryAfterSec: 0, failures, remaining }
  }
  const retryAfterSec = Math.max(...locked.map((s) => s.retryAfterSec))
  return { locked: true, retryAfterSec, failures: Math.max(...statuses.map((s) => s.failures)), remaining: 0 }
}

export function loginAttemptKey(req, username) {
  return pairKey(req, username)
}

export function getLoginLockStatus(req, username) {
  const now = Date.now()
  return mergeLockStatus(
    readStatus(pairKey(req, username), PAIR_MAX, now),
    readStatus(ipKey(req), IP_MAX, now),
    readStatus(userKey(username), USER_MAX, now),
  )
}

export function recordLoginFailure(req, username) {
  const now = Date.now()
  const pair = bump(pairKey(req, username), PAIR_MAX, PAIR_WINDOW_MS, PAIR_LOCK_MS, now)
  const ip = bump(ipKey(req), IP_MAX, IP_WINDOW_MS, IP_LOCK_MS, now)
  const user = bump(userKey(username), USER_MAX, USER_WINDOW_MS, USER_LOCK_MS, now)
  return mergeLockStatus(pair, ip, user)
}

export function clearLoginFailures(req, username) {
  attempts.delete(pairKey(req, username))
  attempts.delete(userKey(username))
  // Keep IP bucket — successful login for one user must not erase spray history.
}

export function getPasswordChangeLockStatus(req, uid) {
  return readStatus(pwdKey(uid), PWD_MAX)
}

export function recordPasswordChangeFailure(req, uid) {
  return bump(pwdKey(uid), PWD_MAX, PWD_WINDOW_MS, PWD_LOCK_MS)
}

export function clearPasswordChangeFailures(uid) {
  attempts.delete(pwdKey(uid))
}

export function loginLockMessage(retryAfterSec) {
  const mins = Math.max(1, Math.ceil(Number(retryAfterSec || 0) / 60))
  return `Too many failed login attempts for this username. Please wait ${mins} minute${mins === 1 ? '' : 's'} before trying again.`
}

export function passwordChangeLockMessage(retryAfterSec) {
  const mins = Math.max(1, Math.ceil(Number(retryAfterSec || 0) / 60))
  return `Too many failed password-change attempts. Please wait ${mins} minute${mins === 1 ? '' : 's'} before trying again.`
}

export const LOGIN_RATE_LIMIT = {
  pairMaxFailures: PAIR_MAX,
  pairLockoutMs: PAIR_LOCK_MS,
  pairWindowMs: PAIR_WINDOW_MS,
  ipMaxFailures: IP_MAX,
  ipLockoutMs: IP_LOCK_MS,
  userMaxFailures: USER_MAX,
  userLockoutMs: USER_LOCK_MS,
  passwordChangeMaxFailures: PWD_MAX,
  passwordChangeLockoutMs: PWD_LOCK_MS,
}

/** Test helper — clear all tracked attempts. */
export function __resetLoginRateLimitForTests() {
  attempts.clear()
}
