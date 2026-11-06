// Security headers test. Runs against the LOCAL dev server only.
// Start the server with `npm run dev` in another terminal, then run `npm run test:headers`.
// It only reads pages; it changes nothing.

const BASE = 'http://127.0.0.1:8787'
const CLOUDFLARE_HOST = 'challenges.cloudflare.com'
const WORKER_CSP = "default-src 'none'; form-action 'self'; base-uri 'none'; frame-ancestors 'none'"

const PAGES = [
  ['/', false],
  ['/login', true],
  ['/report', true],
  ['/dashboard', false],
  ['/settings', false],
  ['/qr-studio', false],
  ['/admin', false],
]

const FIXED = {
  'x-content-type-options': 'nosniff',
  'x-frame-options': 'DENY',
  'cross-origin-opener-policy': 'same-origin',
  'cross-origin-resource-policy': 'same-origin',
}

let passed = 0
let failed = 0
function check(name, condition, detail = '') {
  if (condition) {
    passed++
    console.log(`PASS  ${name}`)
  } else {
    failed++
    console.log(`FAIL  ${name}${detail ? '  -> ' + detail : ''}`)
  }
}

async function get(path, init) {
  const response = await fetch(BASE + path, { redirect: 'manual', ...init })
  const text = await response.text()
  return { status: response.status, headers: response.headers, text }
}

function missingHeaders(headers) {
  const problems = []
  for (const [name, value] of Object.entries(FIXED)) {
    if (headers.get(name) !== value) problems.push(`${name}: ${headers.get(name)}`)
  }
  for (const name of ['referrer-policy', 'permissions-policy']) {
    if (!headers.get(name)) problems.push(`${name} missing`)
  }
  return problems.join('; ')
}

function badPolicy(policy, withTurnstile, hasScripts) {
  if (!policy) return 'no policy'
  const problems = []
  if (!policy.includes("default-src 'none'")) problems.push("no default-src 'none'")
  if (!policy.includes("frame-ancestors 'none'")) problems.push("no frame-ancestors 'none'")
  if (policy.includes("'unsafe-inline'") || policy.includes("'unsafe-eval'")) problems.push('unsafe source')
  if (policy.includes('*')) problems.push('wildcard')
  if (hasScripts && !policy.includes("script-src 'self'")) problems.push("no script-src 'self'")
  if (withTurnstile) {
    if (!policy.includes(`script-src 'self' https://${CLOUDFLARE_HOST}`)) problems.push('no Turnstile script')
    if (!policy.includes(`frame-src https://${CLOUDFLARE_HOST}`)) problems.push('no Turnstile frame')
  } else if (policy.includes(CLOUDFLARE_HOST)) {
    problems.push('allows Cloudflare where it should not')
  }
  return problems.join('; ')
}

async function main() {
  try {
    await fetch(BASE + '/')
  } catch {
    console.error('Cannot reach the dev server. Start it with "npm run dev" in another terminal.')
    process.exit(1)
  }

  // --- The website's pages (headers come from web/public/_headers) ---
  let stylesheet = null
  for (const [path, withTurnstile] of PAGES) {
    const page = await get(path)
    check(`${path} is served (200)`, page.status === 200, `got ${page.status}`)
    check(`${path} has the security headers`, missingHeaders(page.headers) === '', missingHeaders(page.headers))
    const policy = page.headers.get('content-security-policy-report-only')
    check(
      `${path} has a strict content policy (report-only for now)`,
      badPolicy(policy, withTurnstile, path !== '/') === '',
      `${badPolicy(policy, withTurnstile, path !== '/')} | ${policy}`,
    )
    if (path === '/login') {
      stylesheet = /href="(\/assets\/[^"]+\.css)"/.exec(page.text)?.[1] ?? null
    }
  }

  // --- A built asset ---
  check('the login page links to a built stylesheet', stylesheet !== null)
  if (stylesheet) {
    const asset = await get(stylesheet)
    check('the stylesheet is served (200)', asset.status === 200, `got ${asset.status}`)
    check(
      'built files are cached for a year and marked immutable',
      (asset.headers.get('cache-control') ?? '').includes('immutable'),
      String(asset.headers.get('cache-control')),
    )
    check('built files are not sniffed', asset.headers.get('x-content-type-options') === 'nosniff')
  }

  // --- Responses made by the Worker ---
  const worker = [
    ['an API answer for a signed-out visitor', '/api/auth/me'],
    ['the public settings', '/api/config'],
    ['an unknown short link', '/zzzzzz-no-such-link'],
    ['the sign-in confirm page', `/api/auth/verify?token=${'0'.repeat(64)}`],
    ['robots.txt', '/robots.txt'],
  ]
  for (const [name, path] of worker) {
    const res = await get(path)
    check(`${name} has the security headers`, missingHeaders(res.headers) === '', missingHeaders(res.headers))
    check(
      `${name} has the strict enforced policy`,
      res.headers.get('content-security-policy') === WORKER_CSP,
      String(res.headers.get('content-security-policy')),
    )
  }

  const confirm = await get(`/api/auth/verify?token=${'0'.repeat(64)}`)
  check(
    'the sign-in confirm page keeps its own referrer policy',
    confirm.headers.get('referrer-policy') === 'same-origin',
    String(confirm.headers.get('referrer-policy')),
  )

  // --- Nothing opens our answers to other sites ---
  const cors = await get('/api/config', { headers: { Origin: 'https://evil.example' } })
  check('no answer allows other sites to read it', cors.headers.get('access-control-allow-origin') === null)

  // --- HSTS is a secure-connection header ---
  const plain = await get('/api/config')
  check('the Worker sends no HSTS header over plain HTTP', plain.headers.get('strict-transport-security') === null)

  console.log(`\n${passed} passed, ${failed} failed`)
  process.exit(failed > 0 ? 1 : 0)
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})