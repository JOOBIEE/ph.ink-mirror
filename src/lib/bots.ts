const BOT_MARKERS = [
  'bot', 'crawl', 'spider', 'slurp',
  'facebookexternalhit', 'whatsapp/', 'skypeuripreview', 'embedly', 'preview',
  'curl', 'wget', 'python-requests', 'go-http-client', 'httpclient', 'libwww',
  'axios', 'node-fetch',
  'headless', 'phantomjs', 'lighthouse',
  'pingdom', 'uptimerobot', 'monitor', 'scanner',
]

export function isBot(userAgent: string | null | undefined): boolean {
  if (!userAgent || userAgent.trim() === '') return true
  const ua = userAgent.toLowerCase()
  return BOT_MARKERS.some((marker) => ua.includes(marker))
}