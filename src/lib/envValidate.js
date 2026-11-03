const WEAK_JWT_SECRETS = new Set([
  'bms-dev-secret-change-in-production',
  'change-me-in-production',
  'change-me-in-development-only',
])

function isWeakJwtSecret(value) {
  const s = String(value || '').trim()
  if (!s || s.length < 16) return true
  if (WEAK_JWT_SECRETS.has(s)) return true
  if (/change.?me|your.?jwt|placeholder|secret.?from.?production/i.test(s)) return true
  return false
}

export function isProduction() {
  return String(process.env.NODE_ENV || '').toLowerCase() === 'production'
}

/** Public HTTPS URL for logs / docs (Railway sets RAILWAY_PUBLIC_DOMAIN). */
export function resolvePublicApiBase() {
  const explicit = String(
    process.env.PUBLIC_API_URL ||
      process.env.API_PUBLIC_URL ||
      process.env.BMS_PUBLIC_URL ||
      ''
  ).trim()
  if (explicit) return explicit.replace(/\/+$/, '')

  const railwayDomain = String(process.env.RAILWAY_PUBLIC_DOMAIN || '').trim()
  if (railwayDomain) {
    const host = railwayDomain.replace(/^https?:\/\//i, '').replace(/\/+$/, '')
    return `https://${host}`
  }

  const staticUrl = String(process.env.RAILWAY_STATIC_URL || '').trim()
  if (staticUrl) return staticUrl.replace(/\/+$/, '')

  return ''
}

/**
 * Warn about missing production configuration. Does NOT exit — lets the
 * server start so /api/diag/db can be used to debug connectivity issues.
 */
export function assertProductionConfig() {
  if (!isProduction()) return

  const missing = []
  for (const key of ['MYSQL_HOST', 'MYSQL_USER', 'MYSQL_PASSWORD', 'MYSQL_DATABASE']) {
    const v = process.env[key]
    if (v === undefined || String(v).trim() === '') missing.push(key)
  }
  if (missing.length) {
    console.warn(`[WARN] Missing env vars: ${missing.join(', ')} — DB queries will fail`)
  }

  const jwt = String(process.env.JWT_SECRET || '').trim()
  if (isWeakJwtSecret(jwt)) {
    console.error('[FATAL] JWT_SECRET is missing or weak — refusing insecure auth config')
    process.exit(1)
  }

  const cors = String(process.env.CORS_ORIGIN || '').trim()
  if (!cors) {
    console.warn('[WARN] CORS_ORIGIN not set — browser requests from production frontend will be blocked')
  }
}
