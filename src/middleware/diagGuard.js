import { isProduction } from '../lib/envValidate.js'

/**
 * Protect /api/diag endpoints.
 * - Production: always require DIAG_TOKEN (404 if missing/wrong).
 * - Development: require DIAG_TOKEN when set; otherwise require auth-equivalent
 *   block for unauthenticated probes (still allow local ops with token).
 */
export function diagGuard(req, res, next) {
  const expected = String(process.env.DIAG_TOKEN || '').trim()
  const provided = String(req.headers['x-diag-token'] || req.query.token || '').trim()

  if (isProduction()) {
    if (!expected) {
      return res.status(404).json({ ok: false, error: 'Not found' })
    }
    if (provided && provided === expected) return next()
    return res.status(404).json({ ok: false, error: 'Not found' })
  }

  // Development: if a token is configured, enforce it.
  if (expected) {
    if (provided && provided === expected) return next()
    return res.status(401).json({ ok: false, error: 'Unauthorized' })
  }

  // Development without DIAG_TOKEN: allow localhost tooling only.
  const ip = String(req.ip || req.socket?.remoteAddress || '')
  if (ip === '127.0.0.1' || ip === '::1' || ip === '::ffff:127.0.0.1') return next()
  return res.status(401).json({ ok: false, error: 'Unauthorized' })
}
