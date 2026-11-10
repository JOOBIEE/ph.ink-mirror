// scripts/smoke-test.mjs
// Usage: node scripts/smoke-test.mjs https://phub.ink
// Read-only checks against a DEPLOYED site. Creates nothing.

const base = (process.argv[2] || '').replace(/\/+$/, '')
if (!/^https?:\/\//.test(base)) {
  console.error('Usage: node scripts/smoke-test.mjs https://your-address')
  process.exit(2)
}

let passed = 0
let failed = 0
function check(name, ok, detail = '') {
  if (ok) {
    passed++
    console.log(`  ok    ${name}`)
  } else {
    failed++
    console.log(`  FAIL  ${name}${detail ? '  -> ' + detail : ''}`)
  }
}
const get = (path, init) => fetch(base + path, { redirect: 'manual', ...init })

console.log(`Smoke test against ${base}\n`)

console.log('Pages and headers')
for (const page of ['/', '/login', '/dashboard', '/settings', '/qr-studio', '/report', '/admin', '/privacy', '/terms']) {
  const res = await get(page)
  check(`${page} answers 200`, res.status === 200, `status ${res.status}`)
  const csp = res.headers.get('content-security-policy') || ''
  check(`${page} has an enforced CSP without unsafe-inline`, csp.length > 0 && !csp.includes('unsafe-inline'), csp || 'missing')
  check(`${page} sends nosniff`, res.headers.get('x-content-type-options') === 'nosniff')
  if (base.startsWith('https://')) {
    check(`${page} sends HSTS`, !!res.headers.get('strict-transport-security'))
  }
}

console.log('\nConfig')
{
  const res = await get('/api/config')
  const body = await res.json().catch(() => null)
  const key = body && body.turnstileSiteKey
  check('/api/config answers 200', res.status === 200, `status ${res.status}`)
  check(
    'Turnstile site key is real (not a dummy test key)',
    typeof key === 'string' && key.length > 10 && !/^[123]x/.test(key),
    String(key),
  )
}

console.log('\nAccess rules')
{
  const unknown = await get('/zzSmoke9')
  check('unknown short link answers 404', unknown.status === 404, `status ${unknown.status}`)
  const me = await get('/api/auth/me')
  check('signed-out /api/auth/me answers 401', me.status === 401, `status ${me.status}`)
  const admin = await get('/api/admin/overview')
  check('admin API is hidden (404) when signed out', admin.status === 404, `status ${admin.status}`)
}

console.log('\nSign-in is protected by Turnstile')
{
  const res = await get('/api/auth/request', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email: 'smoke-test@example.invalid' }),
  })
  const text = await res.text().catch(() => '')
  check('sign-in request with no Turnstile token is refused (400)', res.status === 400, `status ${res.status} ${text.slice(0, 120)}`)
}

console.log(`\n${passed} passed, ${failed} failed`)
process.exit(failed === 0 ? 0 : 1)