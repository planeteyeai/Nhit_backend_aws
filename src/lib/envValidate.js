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

/** True when production JWT_SECRET is missing/weak — auth must refuse, but process stays up for health checks. */
let authConfigBlocked = false

export function isAuthConfigBlocked() {
  return authConfigBlocked
}

export function isJwtSecretConfigured() {
  const jwt = String(process.env.JWT_SECRET || '').trim()
  if (!jwt) return false
  if (isProduction() && isWeakJwtSecret(jwt)) return false
  return true
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
 * Validate production configuration.
 * Never process.exit — ECS circuit breaker needs /health to stay up.
 * Weak/missing JWT_SECRET blocks auth (503) until operators set a strong secret.
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
    authConfigBlocked = true
    console.error(
      '[FATAL] JWT_SECRET is missing or weak — login/API auth disabled (503). ' +
        'Set a strong JWT_SECRET (≥16 chars, not a placeholder) in the ECS task env/secrets, then redeploy.'
    )
  }

  const cors = String(process.env.CORS_ORIGIN || '').trim()
  if (!cors) {
    console.warn('[WARN] CORS_ORIGIN not set — browser requests from production frontend will be blocked')
  }
}
