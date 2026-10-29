import { Hono } from 'hono'
import type { Bindings } from './types'
import links from './routes/links'
import redirect from './routes/redirect'
import { runRollup } from './jobs/rollup'
import auth from './routes/auth'

const app = new Hono<{ Bindings: Bindings }>()

app.get('/', (c) => c.text('ph.ink is alive'))
app.get('/robots.txt', (c) => c.text('User-agent: *\nDisallow: /api/\n'))
app.get('/favicon.ico', (c) => c.body(null, 404))

app.route('/api/links', links)
app.route('/api/auth', auth)
app.route('/', redirect)

export default {
  fetch: app.fetch,
  scheduled: async (_controller, env, ctx) => {
    ctx.waitUntil(runRollup(env.DB))
  },
} satisfies ExportedHandler<Bindings>