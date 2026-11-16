/** DB `users.user_role` ENUM values (MySQL). */
export const DB_USER_ROLES = [
  'Site Engineer',
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

/** Safe default for new accounts. */
export const DEFAULT_DB_USER_ROLE = 'BMC'

function isSiteEngineerKey(key) {
  return (
    key === 'admin' ||
    key === 'site engineer' ||
    key === 'siteengineer' ||
    key === 'siteengg' ||
    key === 'site_engineer'
  )
}

/** Map DB user_role to frontend roles: superadmin | bmcuser | siteengg */
export function normalizeAppRole(raw) {
  const r = String(raw || '')
    .trim()
    .toLowerCase()
  if (r === 'superadmin' || r === 'super admin' || (r.includes('super') && r.includes('admin'))) {
    return 'superadmin'
  }
  if (r.includes('bmc') || r === 'bmcuser') return 'bmcuser'
  return 'siteengg'
}

export function isSuperAdminRole(raw) {
  return normalizeAppRole(raw) === 'superadmin'
}

/** True when DB role can manage user accounts / BMC-level actions. */
export function isAdminOrBmcRole(raw) {
  const r = String(raw || '')
    .trim()
    .toLowerCase()
  if (r.includes('bmc')) return true
  if (r === 'superadmin' || r === 'super admin' || (r.includes('super') && r.includes('admin'))) {
    return true
  }
  return isSiteEngineerKey(r)
}

/**
 * Coerce arbitrary input to a valid DB ENUM role.
 * Unknown / empty → defaultRole (BMC).
 * Legacy "Admin" is stored as Site Engineer.
 */
export function coerceDbUserRole(raw, defaultRole = DEFAULT_DB_USER_ROLE) {
  const key = String(raw || '')
    .trim()
    .toLowerCase()
  if (!key) return defaultRole
  if (isSiteEngineerKey(key)) return 'Site Engineer'
  return DB_USER_ROLE_LOOKUP.get(key) || defaultRole
}
