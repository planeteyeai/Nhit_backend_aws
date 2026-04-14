const WEAK_JWT_SECRETS = new Set([
  'bms-dev-secret-change-in-production',
  'change-me-in-production',
  'change-me-in-development-only',
])

export function isProduction() {
  return String(process.env.NODE_ENV || '').toLowerCase() === 'production'
}

/**
 * Exit the process if required production configuration is missing or unsafe.
 * Call once at startup before accepting traffic.
 */
export function assertProductionConfig() {
  if (!isProduction()) return

  const missing = []
  for (const key of ['MYSQL_HOST', 'MYSQL_USER', 'MYSQL_PASSWORD', 'MYSQL_DATABASE']) {
    const v = process.env[key]
    if (v === undefined || String(v).trim() === '') missing.push(key)
  }
  if (missing.length) {
    console.error(`[FATAL] Production requires env: ${missing.join(', ')}`)
    process.exit(1)
  }

  const jwt = String(process.env.JWT_SECRET || '').trim()
  if (!jwt || WEAK_JWT_SECRETS.has(jwt) || jwt.length < 16) {
    console.error(
      '[FATAL] Production requires JWT_SECRET: a random string at least 16 characters (not a default placeholder).'
    )
    process.exit(1)
  }

  const cors = String(process.env.CORS_ORIGIN || '').trim()
  if (!cors) {
    console.error(
      '[FATAL] Production requires CORS_ORIGIN (comma-separated frontend origins), e.g. https://app.example.com'
    )
    process.exit(1)
  }
}
