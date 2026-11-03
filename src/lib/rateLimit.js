/**
 * Lightweight fixed-window rate limiter (in-memory).
 * Suitable for single-instance Node; resets on process restart.
 */

/**
 * Prefer Express `req.ip` (honours `trust proxy`).
 * Never trust raw X-Forwarded-For from the client.
 */
export function clientIp(req) {
  const ip = String(req.ip || req.socket?.remoteAddress || '').trim()
  return ip || 'unknown'
}

/**
 * @param {object} opts
 * @param {string} opts.name
 * @param {number} opts.max - max hits per window
 * @param {number} opts.windowMs
 * @param {(req: import('express').Request) => string} opts.keyFn
 * @param {string} [opts.message]
 */
export function createFixedWindowRateLimit({
  name,
  max,
  windowMs,
  keyFn,
  message = 'Too many requests. Please try again later.',
}) {
  /** @type {Map<string, { count: number, resetAt: number }>} */
  const buckets = new Map()

  function purge(key, now) {
    const b = buckets.get(key)
    if (b && b.resetAt <= now) buckets.delete(key)
  }

  function middleware(req, res, next) {
    const now = Date.now()
    let key
    try {
      key = `${name}:${keyFn(req)}`
    } catch {
      key = `${name}:unknown`
    }
    purge(key, now)
    let b = buckets.get(key)
    if (!b) {
      b = { count: 0, resetAt: now + windowMs }
      buckets.set(key, b)
    }
    b.count += 1
    const retryAfterSec = Math.max(1, Math.ceil((b.resetAt - now) / 1000))
    res.setHeader('X-RateLimit-Limit', String(max))
    res.setHeader('X-RateLimit-Remaining', String(Math.max(0, max - b.count)))
    res.setHeader('X-RateLimit-Reset', String(Math.ceil(b.resetAt / 1000)))
    if (b.count > max) {
      res.setHeader('Retry-After', String(retryAfterSec))
      return res.status(429).json({
        message,
        retry_after_seconds: retryAfterSec,
        locked: true,
      })
    }
    return next()
  }

  middleware.reset = () => buckets.clear()
  return middleware
}
