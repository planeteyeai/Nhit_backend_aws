const WEAK_JWT_SECRETS = new Set([
  'bms-dev-secret-change-in-production',
  'change-me-in-production',
  'change-me-in-development-only',
])

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
  if (!jwt || WEAK_JWT_SECRETS.has(jwt) || jwt.length < 16) {
    console.warn('[WARN] JWT_SECRET is missing or weak — authentication will fail')
  }

  const cors = String(process.env.CORS_ORIGIN || '').trim()
  if (!cors) {
    console.warn('[WARN] CORS_ORIGIN not set — browser requests from production frontend will be blocked')
  }
}
