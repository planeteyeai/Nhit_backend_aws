/**
 * Quick security audit — unauthenticated access to sensitive endpoints.
 * Usage: node scripts/security-audit.mjs [baseUrl]
 * Example: node scripts/security-audit.mjs https://nhit-backend.up.railway.app
 */
const base = (process.argv[2] || 'http://localhost:3001').replace(/\/$/, '')

const checks = [
  { name: 'Users list (must be 401)', path: '/users', expect: 401 },
  { name: 'Bridge list (must be 401)', path: '/bridge-list', expect: 401 },
  { name: 'Storage status (must be 401)', path: '/api/storage/status', expect: 401 },
  { name: 'Presign (must be 401)', path: '/api/files/presign?key=upload/test', expect: 401 },
  { name: 'Diag DB (must be 404)', path: '/api/diag/db', expect: 404 },
  { name: 'Health (public 200)', path: '/health', expect: 200 },
  { name: 'Login route exists', path: '/login', method: 'POST', body: {}, expect: [400, 401, 422] },
]

let failed = 0

for (const c of checks) {
  try {
    const res = await fetch(`${base}${c.path}`, {
      method: c.method || 'GET',
      headers: c.body ? { 'Content-Type': 'application/json' } : undefined,
      body: c.body ? JSON.stringify(c.body) : undefined,
    })
    const ok = Array.isArray(c.expect) ? c.expect.includes(res.status) : res.status === c.expect
    const icon = ok ? 'OK' : 'FAIL'
    if (!ok) failed += 1
    console.log(`[${icon}] ${c.name} — HTTP ${res.status} (want ${c.expect})`)
  } catch (e) {
    failed += 1
    console.log(`[FAIL] ${c.name} — ${e.message}`)
  }
}

console.log(failed === 0 ? '\nAll security checks passed.' : `\n${failed} check(s) failed.`)
process.exit(failed > 0 ? 1 : 0)
