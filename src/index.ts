import { Hono } from 'hono'
import type { Bindings } from './types'
import links from './routes/links'
import redirect from './routes/redirect'

const app = new Hono<{ Bindings: Bindings }>()

app.get('/', (c) => c.text('ph.ink is alive'))
app.get('/robots.txt', (c) => c.text('User-agent: *\nDisallow: /api/\n'))
app.get('/favicon.ico', (c) => c.body(null, 404))

app.route('/api/links', links)
app.route('/', redirect)

export default app