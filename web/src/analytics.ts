import {
  CategoryScale,
  Chart,
  Filler,
  LinearScale,
  LineController,
  LineElement,
  PointElement,
  Tooltip,
} from 'chart.js'
import { ApiError, getAnalytics, type Analytics, type Breakdown, type LinkItem } from './api'

Chart.register(
  CategoryScale,
  Filler,
  LinearScale,
  LineController,
  LineElement,
  PointElement,
  Tooltip,
)

const linkSelect = document.querySelector<HTMLSelectElement>('#analytics-link')
const rangeSelect = document.querySelector<HTMLSelectElement>('#analytics-range')
const botsBox = document.querySelector<HTMLInputElement>('#analytics-bots')
const exportLink = document.querySelector<HTMLAnchorElement>('#analytics-export')
const statusBox = document.querySelector<HTMLElement>('#analytics-status')
const canvas = document.querySelector<HTMLCanvasElement>('#analytics-chart')
const daysBody = document.querySelector<HTMLElement>('#analytics-days')
const statClicks = document.querySelector<HTMLElement>('#stat-clicks')
const statVisitors = document.querySelector<HTMLElement>('#stat-visitors')
const statQr = document.querySelector<HTMLElement>('#stat-qr')
const statBots = document.querySelector<HTMLElement>('#stat-bots')

let chart: Chart<'line', number[], string> | null = null
let latestRequest = 0

let regionNames: Intl.DisplayNames | null = null
try {
  regionNames = new Intl.DisplayNames(['en'], { type: 'region' })
} catch {
  regionNames = null
}

function countryName(code: string): string {
  if (code === 'Unknown') return code
  try {
    return regionNames?.of(code) ?? code
  } catch {
    return code
  }
}

function setText(node: HTMLElement | null, text: string): void {
  if (node) node.textContent = text
}

function showStatus(message: string, isError: boolean): void {
  if (!statusBox) return
  statusBox.textContent = message
  statusBox.className = isError
    ? 'text-sm font-semibold text-red-700'
    : 'text-sm text-zinc-700'
}

function renderList(
  selector: string,
  rows: Breakdown[],
  format: (name: string) => string = (name) => name,
): void {
  const list = document.querySelector<HTMLElement>(selector)
  if (!list) return

  if (rows.length === 0) {
    const empty = document.createElement('li')
    empty.className = 'text-sm text-zinc-700'
    empty.textContent = 'No data yet.'
    list.replaceChildren(empty)
    return
  }

  const biggest = Math.max(...rows.map((row) => row.clicks))
  list.replaceChildren(
    ...rows.map((row) => {
      const item = document.createElement('li')

      const line = document.createElement('div')
      line.className = 'flex justify-between gap-3 text-sm'
      const name = document.createElement('span')
      name.className = 'break-all'
      name.textContent = format(row.name)
      const count = document.createElement('span')
      count.className = 'font-semibold'
      count.textContent = row.clicks.toLocaleString()
      line.append(name, count)

      const track = document.createElement('div')
      track.className = 'mt-1 h-1.5 rounded bg-zinc-200'
      const bar = document.createElement('div')
      bar.className = 'h-1.5 rounded bg-zinc-800'
      bar.style.width = `${Math.max(2, Math.round((row.clicks / biggest) * 100))}%`
      track.append(bar)

      item.append(line, track)
      return item
    }),
  )
}

function drawChart(days: string[], values: number[]): void {
  if (!canvas) return

  if (chart) {
    chart.data.labels = days
    chart.data.datasets[0].data = values
    chart.update()
    return
  }

  chart = new Chart<'line', number[], string>(canvas, {
    type: 'line',
    data: {
      labels: days,
      datasets: [
        {
          label: 'Clicks',
          data: values,
          borderColor: '#18181b',
          backgroundColor: 'rgba(24, 24, 27, 0.08)',
          fill: true,
          tension: 0.2,
          pointRadius: values.length > 60 ? 0 : 3,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      animation: false,
      plugins: { legend: { display: false } },
      scales: {
        y: { beginAtZero: true, ticks: { precision: 0 } },
        x: { ticks: { maxTicksLimit: 8 } },
      },
    },
  })
}

function render(data: Analytics): void {
  setText(statClicks, data.totals.clicks.toLocaleString())
  setText(statVisitors, data.totals.visitors.toLocaleString())
  setText(statQr, data.totals.qrScans.toLocaleString())
  setText(statBots, data.totals.botClicks.toLocaleString())

  const labels = data.daily.map((entry) => entry.day)
  const values = data.daily.map((entry) => entry.clicks)
  drawChart(labels, values)
  canvas?.setAttribute(
    'aria-label',
    `Clicks per day from ${data.range.from} to ${data.range.to}. ` +
      `${data.totals.clicks} clicks in total.`,
  )

  if (daysBody) {
    daysBody.replaceChildren(
      ...[...data.daily].reverse().map((entry) => {
        const tr = document.createElement('tr')
        const day = document.createElement('td')
        day.className = 'py-1 pr-4'
        day.textContent = entry.day
        const clicks = document.createElement('td')
        clicks.className = 'py-1'
        clicks.textContent = entry.clicks.toLocaleString()
        tr.append(day, clicks)
        return tr
      }),
    )
  }

  renderList('#top-countries', data.countries, countryName)
  renderList('#top-devices', data.devices)
  renderList('#top-browsers', data.browsers)
  renderList('#top-referrers', data.referrers)
}

function updateExportLink(days: number, link: number | null): void {
  if (!exportLink) return
  const params = new URLSearchParams({ days: String(days) })
  if (link !== null) params.set('link', String(link))
  exportLink.href = `/api/analytics/export.csv?${params.toString()}`
}

async function loadAnalytics(): Promise<void> {
  if (!linkSelect || !rangeSelect || !botsBox) return

  const mine = ++latestRequest
  const days = Number(rangeSelect.value)
  const link = linkSelect.value === '' ? null : Number(linkSelect.value)
  updateExportLink(days, link)

  try {
    const data = await getAnalytics({ days, link, includeBots: botsBox.checked })
    if (mine !== latestRequest) return
    render(data)
    showStatus(
      botsBox.checked
        ? 'Showing all traffic, including bots and link previews.'
        : 'Showing people only. Bots and link previews are not counted.',
      false,
    )
  } catch (error) {
    if (mine !== latestRequest) return
    if (error instanceof ApiError && error.status === 401) {
      window.location.replace('/login')
      return
    }
    showStatus(
      error instanceof ApiError ? error.message : 'Could not load analytics. Please try again.',
      true,
    )
  }
}

export function setAnalyticsLinks(links: LinkItem[]): void {
  if (!linkSelect) return
  const previous = linkSelect.value

  const options = [new Option('All links', '')]
  for (const link of links) {
    options.push(new Option(link.title ?? link.slug, String(link.id)))
  }
  linkSelect.replaceChildren(...options)
  linkSelect.value = links.some((link) => String(link.id) === previous) ? previous : ''

  void loadAnalytics()
}

for (const control of [linkSelect, rangeSelect, botsBox]) {
  control?.addEventListener('change', () => {
    void loadAnalytics()
  })
}