/**
 * Login rate-limit + quick vulnerability checks against a running BMS backend.
 *
 * Usage:
 *   node scripts/test-login-rate-limit.mjs [baseUrl]
 * Example:
 *   node scripts/test-login-rate-limit.mjs http://localhost:8080
 */
const base = (process.argv[2] || 'http://localhost:8080').replace(/\/$/, '')
const TEST_USER = `rate_limit_probe_${Date.now()}`
const BAD_PASSWORD = 'definitely-wrong-password'

async function postLogin(username, password) {
  const res = await fetch(`${base}/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password }),
  })
  let body = null
  try {
    body = await res.json()
  } catch {
    body = null
  }
  return {
    status: res.status,
    body,
    retryAfter: res.headers.get('retry-after'),
  }
}

async function get(path) {
  const res = await fetch(`${base}${path}`)
  return res.status
}

let failed = 0
const log = (ok, name, detail) => {
  if (!ok) failed += 1
  console.log(`[${ok ? 'OK' : 'FAIL'}] ${name}${detail ? ` — ${detail}` : ''}`)
}

console.log(`\nBMS security / rate-limit test → ${base}\n`)

// ── Public / protected route smoke checks ──────────────────────────────────
{
  const health = await get('/health')
  log(health === 200, 'Health endpoint public', `HTTP ${health}`)
}
{
  const users = await get('/users')
  log([401, 403].includes(users), 'Users list blocked without auth', `HTTP ${users}`)
}
{
  const bridges = await get('/bridge-list')
  log([401, 403].includes(bridges), 'Bridge list blocked without auth', `HTTP ${bridges}`)
}

// ── Empty login validation ─────────────────────────────────────────────────
{
  const empty = await postLogin('', '')
  log(empty.status === 400, 'Empty credentials rejected', `HTTP ${empty.status}`)
}

// ── Failed attempts 1–5 then lockout ───────────────────────────────────────
console.log(`\nSimulating 5 failed logins for user "${TEST_USER}"...\n`)
const attemptResults = []
for (let i = 1; i <= 5; i++) {
  const r = await postLogin(TEST_USER, BAD_PASSWORD)
  attemptResults.push(r)
  console.log(
    `  Attempt ${i}: HTTP ${r.status}` +
      (r.body?.attempts_remaining != null ? ` (remaining ${r.body.attempts_remaining})` : '') +
      (r.body?.message ? ` — ${r.body.message}` : ''),
  )
}

const firstFourOk = attemptResults.slice(0, 4).every((r) => r.status === 401)
log(firstFourOk, 'First 4 failed attempts return 401')

const fifth = attemptResults[4]
const lockedOnFifth = fifth.status === 429 || fifth.body?.locked === true
log(lockedOnFifth, '5th failure triggers lockout (429)', `HTTP ${fifth.status}`)

// ── Immediate 6th attempt must stay locked ─────────────────────────────────
{
  const sixth = await postLogin(TEST_USER, BAD_PASSWORD)
  const ok = sixth.status === 429 && Boolean(sixth.body?.locked || sixth.body?.retry_after_seconds)
  log(ok, '6th attempt while locked returns 429', `HTTP ${sixth.status}`)
  if (sixth.retryAfter || sixth.body?.retry_after_seconds) {
    console.log(
      `         Retry-After ≈ ${sixth.retryAfter || sixth.body.retry_after_seconds}s (expect ~300s / 5 min)`,
    )
  }
}

// ── Cross-username still independent (optional soft check) ─────────────────
{
  const other = await postLogin(`${TEST_USER}_other`, BAD_PASSWORD)
  log(other.status === 401, 'Different username not locked by previous failures', `HTTP ${other.status}`)
}

console.log(failed === 0 ? '\nAll login rate-limit / security checks passed.\n' : `\n${failed} check(s) failed.\n`)
process.exit(failed > 0 ? 1 : 0)
