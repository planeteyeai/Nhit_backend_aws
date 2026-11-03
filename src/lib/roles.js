/** DB `users.user_role` ENUM values (MySQL). */
export const DB_USER_ROLES = [
  'Admin',
  'BMC',
  'Sales',
  'Purchase',
  'QC',
  'Logistics',
  'Accounts',
  'Stores',
  'Super Admin',
]

const DB_USER_ROLE_LOOKUP = new Map(DB_USER_ROLES.map((r) => [r.toLowerCase(), r]))

/** Safe default for new accounts — never Admin. */
export const DEFAULT_DB_USER_ROLE = 'BMC'

/** Map DB user_role to frontend roles siteengg | bmcuser */
export function normalizeAppRole(raw) {
  const r = String(raw || '')
    .trim()
    .toLowerCase()
  if (r.includes('bmc') || r === 'bmcuser') return 'bmcuser'
  return 'siteengg'
}

/** True when DB role can manage user accounts. */
export function isAdminOrBmcRole(raw) {
  const r = String(raw || '')
    .trim()
    .toLowerCase()
  return r.includes('admin') || r.includes('bmc')
}

/**
 * Coerce arbitrary input to a valid DB ENUM role.
 * Unknown / empty → defaultRole (BMC).
 */
export function coerceDbUserRole(raw, defaultRole = DEFAULT_DB_USER_ROLE) {
  const key = String(raw || '')
    .trim()
    .toLowerCase()
  if (!key) return defaultRole
  return DB_USER_ROLE_LOOKUP.get(key) || defaultRole
}
