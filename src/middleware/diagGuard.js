import { isProduction } from '../lib/envValidate.js'

/** Block /api/diag on live unless DIAG_TOKEN header matches env. */
export function diagGuard(req, res, next) {
  if (!isProduction()) return next()

  const expected = String(process.env.DIAG_TOKEN || '').trim()
  if (!expected) {
    return res.status(404).json({ ok: false, error: 'Not found' })
  }

  const provided = String(req.headers['x-diag-token'] || req.query.token || '').trim()
  if (provided && provided === expected) return next()

  return res.status(404).json({ ok: false, error: 'Not found' })
}
