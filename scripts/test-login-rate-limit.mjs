/**
 * Login rate-limit + quick vulnerability checks against a running BMS backend.
 *
 * Usage:
 *   node scripts/test-login-rate-limit.mjs [baseUrl]
 */
const base = (process.argv[2] || 'http://localhost:8080').replace(/\/$/, '')
const TEST_USER = `rate_limit_probe_${Date.now()}`
const BAD_PASSWORD = 'definitely-wrong-password'

async function postLogin(username, password, extraHeaders = {}) {
  const res = await fetch(`${base}/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...extraHeaders },
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

{
  const health = await get('/health')
  log(health === 200, 'Health endpoint public', `HTTP ${health}`)
}
{
  const users = await get('/users')
  log([401, 403].includes(users), 'Users list blocked without auth', `HTTP ${users}`)
}

{
  const empty = await postLogin('', '')
  log(empty.status === 400, 'Empty credentials rejected', `HTTP ${empty.status}`)
}

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

{
  const sixth = await postLogin(TEST_USER, BAD_PASSWORD)
  const ok = sixth.status === 429 && Boolean(sixth.body?.locked || sixth.body?.retry_after_seconds)
  log(ok, '6th attempt while locked returns 429', `HTTP ${sixth.status}`)
}

{
  // Different username: pair bucket independent, but IP bucket still counting.
  const other = await postLogin(`${TEST_USER}_other`, BAD_PASSWORD)
  log(other.status === 401, 'Different username still allowed (IP spray budget not exhausted)', `HTTP ${other.status}`)
}

{
  // X-Forwarded-For must NOT bypass pair lock for same TEST_USER
  const spoof = await postLogin(TEST_USER, BAD_PASSWORD, { 'X-Forwarded-For': '203.0.113.99' })
  log(spoof.status === 429, 'X-Forwarded-For spoof does not bypass lockout', `HTTP ${spoof.status}`)
}

console.log(failed === 0 ? '\nAll login rate-limit / security checks passed.\n' : `\n${failed} check(s) failed.\n`)
process.exit(failed > 0 ? 1 : 0)
