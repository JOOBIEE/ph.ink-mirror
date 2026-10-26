import { Hono } from 'hono'

const app = new Hono()

app.get('/', (c) => c.text('ph.ink is alive'))

export default app