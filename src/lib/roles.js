/** Map DB user_role to frontend roles siteengg | bmcuser */
export function normalizeAppRole(raw) {
  const r = String(raw || '')
    .trim()
    .toLowerCase()
  if (r.includes('bmc') || r === 'bmcuser') return 'bmcuser'
  return 'siteengg'
}
