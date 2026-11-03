import { Hono } from 'hono'
import type { Bindings } from './types'
import links from './routes/links'
import redirect from './routes/redirect'
import auth from './routes/auth'
import analytics from './routes/analytics'
import account from './routes/account'
import qr from './routes/qr'
import report from './routes/report'
import admin from './routes/admin'
import { originCheck } from './middleware/origin-check'
import { runRollup } from './jobs/rollup'

const app = new Hono<{ Bindings: Bindings }>()

app.get('/', (c) => c.text('ph.ink is alive'))
app.get('/robots.txt', (c) => c.text('User-agent: *\nDisallow: /api/\n'))
app.get('/favicon.ico', (c) => c.body(null, 404))

app.use('/api/*', originCheck)
app.route('/api/auth', auth)
app.route('/api/links', links)
app.route('/api/analytics', analytics)
app.route('/api/account', account)
app.route('/api/qr', qr)
app.route('/api/report', report)
app.route('/api/admin', admin)
app.route('/', redirect)

export default {
  fetch: app.fetch,
  scheduled: async (_controller, env, ctx) => {
    ctx.waitUntil(runRollup(env.DB))
  },
} satisfies ExportedHandler<Bindings>