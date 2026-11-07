import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'

function parseHeadersFile(text) {
  const rules = []
  let current = null
  for (const raw of text.split(/\r?\n/)) {
    if (raw.trim() === '' || raw.trimStart().startsWith('#')) continue
    if (!/^\s/.test(raw)) {
      current = { path: raw.trim(), headers: {} }
      rules.push(current)
      continue
    }
    if (!current) throw new Error(`Header line before any path: ${raw}`)
    const colon = raw.indexOf(':')
    if (colon === -1) throw new Error(`Not a header line: ${raw}`)
    const name = raw.slice(0, colon).trim().toLowerCase()
    const value = raw.slice(colon + 1).trim()
    ;(current.headers[name] ??= []).push(value)
  }
  return rules
}

function matches(pattern, path) {
  if (pattern.endsWith('/*')) return path.startsWith(pattern.slice(0, -1))
  return pattern === path
}

function directives(policy) {
  const map = new Map()
  for (const part of policy.split(';')) {
    const tokens = part.trim().split(/\s+/).filter(Boolean)
    const name = tokens.shift()
    if (name) map.set(name, tokens)
  }
  return map
}

const rules = parseHeadersFile(
  readFileSync(new URL('../web/public/_headers', import.meta.url), 'utf8'),
)
const viteConfig = readFileSync(new URL('../web/vite.config.ts', import.meta.url), 'utf8')

const PAGES = [...viteConfig.matchAll(/here\('\.\/([a-z-]+)\.html'\)/g)].map((match) =>
  match[1] === 'index' ? '/' : `/${match[1]}`,
)

const CSP_NAMES = ['content-security-policy', 'content-security-policy-report-only']
const WITH_TURNSTILE = ['/login', '/report']

function policyFor(path) {
  const rule = rules.find((item) => item.path === path)
  const values = CSP_NAMES.flatMap((name) => (rule ? (rule.headers[name] ?? []) : []))
  expect(values, `${path} needs exactly one Content-Security-Policy`).toHaveLength(1)
  return directives(values[0])
}

describe('the headers file', () => {
  it('found the pages in the build configuration', () => {
    expect(PAGES.length).toBeGreaterThanOrEqual(7)
    expect(PAGES).toContain('/')
    expect(PAGES).toContain('/admin')
    expect(PAGES).toContain('/qr-studio')
  })

  it('has one policy for every page that is built', () => {
    for (const path of PAGES) {
      policyFor(path)
    }
  })

  it('has no rule for a page that does not exist', () => {
    const policyRules = rules.filter((rule) =>
      CSP_NAMES.some((name) => rule.headers[name] !== undefined),
    )
    expect(policyRules.map((rule) => rule.path).sort()).toEqual([...PAGES].sort())
  })

    it('enforces the policies instead of only reporting', () => {
    for (const rule of rules) {
      expect(rule.headers['content-security-policy-report-only'], rule.path).toBeUndefined()
    }
    for (const path of PAGES) {
      const rule = rules.find((item) => item.path === path)
      expect(rule.headers['content-security-policy'], path).toHaveLength(1)
    }
  })

  it('never sets the same header twice for one address', () => {
    for (const path of [...PAGES, '/assets/app.js', '/assets/app.css']) {
      const seen = new Set()
      for (const rule of rules.filter((item) => matches(item.path, path))) {
        for (const [name, values] of Object.entries(rule.headers)) {
          expect(values, `${name} twice in one rule for ${path}`).toHaveLength(1)
          expect(seen.has(name), `${name} set by two rules for ${path}`).toBe(false)
          seen.add(name)
        }
      }
    }
  })

  it('sets the fixed security headers for everything', () => {
    const all = rules.find((rule) => rule.path === '/*')
    expect(all.headers['x-content-type-options']).toEqual(['nosniff'])
    expect(all.headers['x-frame-options']).toEqual(['DENY'])
    expect(all.headers['cross-origin-opener-policy']).toEqual(['same-origin'])
    expect(all.headers['cross-origin-resource-policy']).toEqual(['same-origin'])
    expect(all.headers['referrer-policy']).toBeDefined()
    expect(all.headers['permissions-policy']).toBeDefined()
    expect(all.headers['strict-transport-security']).toEqual(['max-age=31536000'])
  })

  it('caches hashed files for a year', () => {
    const assets = rules.find((rule) => rule.path === '/assets/*')
    expect(assets.headers['cache-control'][0]).toContain('immutable')
    expect(assets.headers['cache-control'][0]).toContain('max-age=31536000')
  })

  it('never lets other sites read our files', () => {
    for (const rule of rules) {
      expect(rule.headers['access-control-allow-origin']).toBeUndefined()
    }
  })
})

describe('the page policies', () => {
  it.each(PAGES)('%s blocks everything by default', (path) => {
    const policy = policyFor(path)
    expect(policy.get('default-src')).toEqual(["'none'"])
    expect(policy.get('frame-ancestors')).toEqual(["'none'"])
    expect(policy.get('base-uri')).toEqual(["'none'"])
  })

  it.each(PAGES)('%s allows no inline code, eval or wildcards', (path) => {
    for (const [name, tokens] of policyFor(path)) {
      for (const token of tokens) {
        expect(token, `${path} ${name}`).not.toBe("'unsafe-inline'")
        expect(token, `${path} ${name}`).not.toBe("'unsafe-eval'")
        expect(token, `${path} ${name}`).not.toBe('http:')
        expect(token, `${path} ${name}`).not.toBe('https:')
        expect(token, `${path} ${name}`).not.toContain('*')
      }
    }
  })

    it('lets every page run our own scripts', () => {
    for (const path of PAGES) {
      expect(policyFor(path).get('script-src')).toContain("'self'")
    }
  })
  
  it('lets only the sign-in and report pages use Cloudflare Turnstile', () => {
    for (const path of PAGES) {
      const policy = policyFor(path)
      const text = [...policy.values()].flat().join(' ')
      if (WITH_TURNSTILE.includes(path)) {
        expect(policy.get('script-src')).toContain('https://challenges.cloudflare.com')
        expect(policy.get('frame-src')).toEqual(['https://challenges.cloudflare.com'])
      } else {
        expect(text, path).not.toContain('challenges.cloudflare.com')
        expect(policy.has('frame-src'), path).toBe(false)
      }
    }
  })

  it('allows data and blob images only in the QR studio', () => {
    for (const path of PAGES) {
      const images = policyFor(path).get('img-src') ?? []
      if (path === '/qr-studio') {
        expect(images).toEqual(expect.arrayContaining(["'self'", 'data:', 'blob:']))
      } else {
        expect(images, path).not.toContain('data:')
        expect(images, path).not.toContain('blob:')
      }
    }
  })
  it('lets every page connect only to our own site', () => {
    for (const path of PAGES) {
      expect(policyFor(path).get('connect-src')).toEqual(["'self'"])
    }
  })
  })