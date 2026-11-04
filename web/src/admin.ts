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
import { ApiError, logout, type Breakdown } from './api'
import {
  banAccount,
  blockAdminLink,
  blockReportLink,
  dismissReport,
  getAccountAnalytics,
  getAdminAccount,
  getAdminLink,
  getOverview,
  listAdminAccounts,
  listAdminLinks,
  listAdminReports,
  listAudit,
  restoreAdminLink,
  setKillSwitch,
  unbanAccount,
  type AccountAnalytics,
  type AdminAccount,
  type AdminLink,
  type AdminReport,
  type AuditEntry,
  type Overview,
} from './admin-api'

Chart.register(
  CategoryScale,
  Filler,
  LinearScale,
  LineController,
  LineElement,
  PointElement,
  Tooltip,
)

const PAGE_SIZE = 50
const BTN = 'btn'
const DANGER =
  'rounded-lg border border-red-700 px-3 py-2 text-sm font-semibold text-red-800 hover:bg-red-50 focus:outline-none focus:ring-2 focus:ring-red-700/30 disabled:opacity-60'
const DANGER_SOLID =
  'rounded-lg bg-red-700 px-4 py-2.5 font-semibold text-white hover:bg-red-800 focus:outline-none focus:ring-2 focus:ring-red-700/40'

const BADGES: Record<string, string> = {
  active: 'bg-green-100 text-green-900',
  disabled: 'bg-zinc-200 text-zinc-800',
  deleted: 'bg-zinc-200 text-zinc-800',
  blocked: 'bg-red-100 text-red-900',
  banned: 'bg-red-100 text-red-900',
  open: 'bg-amber-100 text-amber-900',
  actioned: 'bg-green-100 text-green-900',
  dismissed: 'bg-zinc-200 text-zinc-800',
}

const REASON_LABELS: Record<string, string> = {
  phishing: 'Phishing or scam',
  malware: 'Malware',
  spam: 'Spam',
  illegal: 'Illegal content',
  other: 'Other',
}

const ACTION_LABELS: Record<string, string> = {
  block_link: 'Blocked a link',
  restore_link: 'Restored a link',
  dismiss_report: 'Dismissed a report',
  ban_account: 'Banned an account',
  unban_account: 'Unbanned an account',
  pause_links: 'Paused link creation',
  resume_links: 'Resumed link creation',
  view_account: 'Opened an account page',
}

function byId<T extends HTMLElement>(id: string): T {
  const node = document.getElementById(id)
  if (!node) throw new Error(`Missing element #${id}`)
  return node as T
}

function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className = '',
  text = '',
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag)
  if (className) node.className = className
  if (text) node.textContent = text
  return node
}

const gate = byId<HTMLElement>('gate')
const gateTitle = byId<HTMLElement>('gate-title')
const gateText = byId<HTMLElement>('gate-text')
const app = byId<HTMLElement>('app')
const adminEmailLabel = byId<HTMLElement>('admin-email')
const signOutButton = byId<HTMLButtonElement>('sign-out')
const statusBox = byId<HTMLElement>('status')
const reportsBadge = byId<HTMLElement>('reports-badge')

type Tab = 'overview' | 'reports' | 'links' | 'accounts' | 'audit'
const TABS: Tab[] = ['overview', 'reports', 'links', 'accounts', 'audit']
const tabButtons: Record<Tab, HTMLButtonElement> = {
  overview: byId('tab-btn-overview'),
  reports: byId('tab-btn-reports'),
  links: byId('tab-btn-links'),
  accounts: byId('tab-btn-accounts'),
  audit: byId('tab-btn-audit'),
}
const tabPanels: Record<Tab, HTMLElement> = {
  overview: byId('tab-overview'),
  reports: byId('tab-reports'),
  links: byId('tab-links'),
  accounts: byId('tab-accounts'),
  audit: byId('tab-audit'),
}
const TAB_ACTIVE = ['bg-zinc-900', 'text-white', 'hover:bg-zinc-800']
const TAB_IDLE = ['hover:bg-zinc-100']

const overviewStats = byId<HTMLElement>('overview-stats')
const killState = byId<HTMLElement>('kill-state')
const killToggle = byId<HTMLButtonElement>('kill-toggle')
const signinBudget = byId<HTMLElement>('signin-budget')

const reportsFilter = byId<HTMLSelectElement>('reports-filter')
const reportsList = byId<HTMLElement>('reports-list')
const reportsEmpty = byId<HTMLElement>('reports-empty')
const reportsMore = byId<HTMLButtonElement>('reports-more')

const linksFilters = byId<HTMLFormElement>('links-filters')
const linksQuery = byId<HTMLInputElement>('links-q')
const linksStatus = byId<HTMLSelectElement>('links-status')
const linksList = byId<HTMLElement>('links-list')
const linksEmpty = byId<HTMLElement>('links-empty')
const linksMore = byId<HTMLButtonElement>('links-more')

const accountsListView = byId<HTMLElement>('accounts-list-view')
const accountsFilters = byId<HTMLFormElement>('accounts-filters')
const accountsQuery = byId<HTMLInputElement>('accounts-q')
const accountsStatus = byId<HTMLSelectElement>('accounts-status')
const accountsReported = byId<HTMLInputElement>('accounts-reported')
const accountsList = byId<HTMLElement>('accounts-list')
const accountsEmpty = byId<HTMLElement>('accounts-empty')
const accountsMore = byId<HTMLButtonElement>('accounts-more')

const accountDetail = byId<HTMLElement>('account-detail')
const accountBack = byId<HTMLButtonElement>('account-back')
const acctEmail = byId<HTMLElement>('acct-email')
const acctMeta = byId<HTMLElement>('acct-meta')
const acctActions = byId<HTMLElement>('acct-actions')
const acctLink = byId<HTMLSelectElement>('acct-link')
const acctDays = byId<HTMLSelectElement>('acct-days')
const acctBots = byId<HTMLInputElement>('acct-bots')
const acctStatClicks = byId<HTMLElement>('acct-stat-clicks')
const acctStatVisitors = byId<HTMLElement>('acct-stat-visitors')
const acctStatQr = byId<HTMLElement>('acct-stat-qr')
const acctStatBots = byId<HTMLElement>('acct-stat-bots')
const acctChart = byId<HTMLCanvasElement>('acct-chart')
const acctLinks = byId<HTMLElement>('acct-links')
const acctReports = byId<HTMLElement>('acct-reports')
const acctAudit = byId<HTMLElement>('acct-audit')

const auditFilter = byId<HTMLSelectElement>('audit-filter')
const auditList = byId<HTMLElement>('audit-list')
const auditEmpty = byId<HTMLElement>('audit-empty')
const auditMore = byId<HTMLButtonElement>('audit-more')

const dialog = byId<HTMLDialogElement>('action-dialog')
const dialogForm = byId<HTMLFormElement>('action-form')
const dialogTitle = byId<HTMLElement>('action-title')
const dialogMessage = byId<HTMLElement>('action-message')
const dialogReasonWrap = byId<HTMLElement>('action-reason-wrap')
const dialogReason = byId<HTMLTextAreaElement>('action-reason')
const dialogDomainWrap = byId<HTMLElement>('action-domain-wrap')
const dialogDomain = byId<HTMLInputElement>('action-domain')
const dialogCancel = byId<HTMLButtonElement>('action-cancel')
const dialogConfirm = byId<HTMLButtonElement>('action-confirm')

let activeTab: Tab = 'overview'
let overview: Overview | null = null
let currentAccountId: number | null = null
let analyticsToken = 0
let chart: Chart<'line', number[], string> | null = null

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

function fmtTime(seconds: number): string {
  return new Date(seconds * 1000).toLocaleString()
}

function fmtDate(seconds: number): string {
  return new Date(seconds * 1000).toLocaleDateString()
}

function capitalise(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1)
}

function showStatus(message: string, isError: boolean): void {
  statusBox.textContent = message
  statusBox.className = isError
    ? 'text-sm font-semibold text-red-700'
    : 'text-sm font-semibold text-green-800'
}

async function run(action: () => Promise<void>): Promise<void> {
  try {
    await action()
  } catch (error) {
    if (error instanceof ApiError) {
      if (error.status === 401) {
        window.location.replace('/login')
        return
      }
      showStatus(error.message, true)
    } else {
      showStatus('Could not reach the server. Please try again.', true)
    }
  }
}

function actionButton(
  label: string,
  handler: () => Promise<void>,
  className: string = BTN,
): HTMLButtonElement {
  const button = el('button', className, label)
  button.type = 'button'
  button.addEventListener('click', () => {
    button.disabled = true
    void run(handler).finally(() => {
      button.disabled = false
    })
  })
  return button
}

function badge(label: string, tone: string = label): HTMLSpanElement {
  return el(
    'span',
    `rounded-full px-2.5 py-0.5 text-xs font-semibold ${BADGES[tone] ?? BADGES.disabled}`,
    capitalise(label),
  )
}

function fillList(list: HTMLElement, items: HTMLElement[], emptyText: string): void {
  if (items.length === 0) {
    list.replaceChildren(el('li', 'text-sm text-zinc-700', emptyText))
    return
  }
  list.replaceChildren(...items)
}

// ---------- Confirmation dialog ----------

type AskOptions = {
  title: string
  message: string
  confirmLabel: string
  danger: boolean
  showReason: boolean
  showDomain: boolean
}
type AskResult = { reason: string; blockDomain: boolean }

function ask(options: AskOptions): Promise<AskResult | null> {
  return new Promise((resolve) => {
    dialogTitle.textContent = options.title
    dialogMessage.textContent = options.message
    dialogReasonWrap.hidden = !options.showReason
    dialogDomainWrap.hidden = !options.showDomain
    dialogReason.value = ''
    dialogDomain.checked = false
    dialogConfirm.textContent = options.confirmLabel
    dialogConfirm.className = options.danger ? DANGER_SOLID : 'btn-primary'

    let confirmed = false
    const onSubmit = (event: Event): void => {
      event.preventDefault()
      confirmed = true
      dialog.close()
    }
    const onCancel = (): void => dialog.close()
    const onClose = (): void => {
      dialogForm.removeEventListener('submit', onSubmit)
      dialogCancel.removeEventListener('click', onCancel)
      dialog.removeEventListener('close', onClose)
      resolve(
        confirmed
          ? { reason: dialogReason.value.trim(), blockDomain: dialogDomain.checked }
          : null,
      )
    }

    dialogForm.addEventListener('submit', onSubmit)
    dialogCancel.addEventListener('click', onCancel)
    dialog.addEventListener('close', onClose)
    dialog.showModal()
  })
}

// ---------- Paged lists ----------

function makeLoader<T>(config: {
  fetchPage: (offset: number) => Promise<T[]>
  render: (item: T) => HTMLElement
  list: HTMLElement
  moreButton: HTMLButtonElement
  emptyNote: HTMLElement
}): (reset: boolean) => Promise<void> {
  let offset = 0
  let token = 0

  return async (reset) => {
    if (reset) {
      offset = 0
      config.list.replaceChildren()
    }
    const mine = ++token
    config.moreButton.disabled = true
    try {
      const items = await config.fetchPage(offset)
      if (mine !== token) return
      offset += items.length
      config.list.append(...items.map(config.render))
      config.emptyNote.hidden = offset > 0
      config.moreButton.hidden = items.length < PAGE_SIZE
    } finally {
      if (mine === token) config.moreButton.disabled = false
    }
  }
}

// ---------- Rendering: links, reports, accounts, audit ----------

function ownerButton(ownerId: number, email: string, status = 'active'): HTMLButtonElement {
  const label = status === 'active' ? email : `${email} (${status})`
  const button = el('button', 'break-all text-left font-semibold underline', `Owner: ${label}`)
  button.type = 'button'
  button.addEventListener('click', () => {
    void run(() => openAccountFromAnywhere(ownerId))
  })
  return button
}

function destinationText(destination: string): string {
  return destination === '' ? 'Destination removed.' : `Goes to: ${destination}`
}

function renderReport(
  report: AdminReport,
  options: { actions: boolean; showOwner: boolean },
): HTMLLIElement {
  const item = el('li', 'rounded-xl border border-zinc-300 p-4')

  const top = el('div', 'flex flex-wrap items-center justify-between gap-2')
  const heading = el('div', 'flex flex-wrap items-center gap-2')
  heading.append(el('h3', 'font-bold', REASON_LABELS[report.reason] ?? report.reason), badge(report.status))
  top.append(heading, el('span', 'text-xs text-zinc-700', fmtTime(report.createdAt)))
  item.append(top)

  const message = el('div', 'mt-3 rounded-lg bg-zinc-100 p-3')
  message.append(
    el('p', 'text-xs font-semibold text-zinc-700', "Reporter's message (not verified)"),
    el('p', 'mt-1 whitespace-pre-wrap break-words text-sm', report.details ?? 'No details given.'),
  )
  item.append(message)

  item.append(el('p', 'mt-3 break-all font-mono text-sm', `${window.location.origin}/${report.slug}`))
  item.append(el('p', 'mt-1 break-all font-mono text-sm text-zinc-800', destinationText(report.destination)))

  const meta = el('p', 'mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-zinc-700')
  if (options.showOwner) meta.append(ownerButton(report.ownerId, report.ownerEmail))
  meta.append(el('span', '', `Link status: ${report.linkStatus}`))
  if (report.openForLink > 1) {
    meta.append(el('span', '', `${report.openForLink} open reports for this link`))
  }
  if (report.handledAt !== null) {
    meta.append(el('span', '', `Handled ${fmtTime(report.handledAt)}`))
  }
  item.append(meta)

  if (options.actions && report.status === 'open') {
    const actions = el('div', 'mt-3 flex flex-wrap gap-2')

    if (report.linkStatus === 'active' || report.linkStatus === 'disabled') {
      actions.append(
        actionButton(
          'Block link',
          async () => {
            const answer = await ask({
              title: 'Block this link?',
              message:
                'Visitors will see a "blocked" page, and every open report on this link is resolved.',
              confirmLabel: 'Block link',
              danger: true,
              showReason: true,
              showDomain: true,
            })
            if (!answer) return
            await blockReportLink(report.id, answer.reason, answer.blockDomain)
            showStatus('Link blocked and report resolved.', false)
            await afterAction()
          },
          DANGER,
        ),
      )
    }

    actions.append(
      actionButton('Dismiss report', async () => {
        const answer = await ask({
          title: 'Dismiss this report?',
          message: 'The link stays exactly as it is.',
          confirmLabel: 'Dismiss',
          danger: false,
          showReason: false,
          showDomain: false,
        })
        if (!answer) return
        await dismissReport(report.id)
        showStatus('Report dismissed.', false)
        await afterAction()
      }),
    )
    item.append(actions)
  }

  return item
}

function renderLink(link: AdminLink, showOwner: boolean): HTMLLIElement {
  const item = el('li', 'rounded-xl border border-zinc-300 p-4')

  const top = el('div', 'flex flex-wrap items-center justify-between gap-2')
  top.append(el('h3', 'break-all font-bold', link.title ?? link.slug))
  const badges = el('div', 'flex flex-wrap items-center gap-2')
  badges.append(badge(link.status))
  if (link.status === 'blocked' && link.blockReason) {
    badges.append(
      el(
        'span',
        'text-xs text-zinc-700',
        link.blockReason === 'account_banned' ? 'blocked with the account' : 'blocked by an admin',
      ),
    )
  }
  if (link.openReports > 0) {
    badges.append(badge(`${link.openReports} open report${link.openReports === 1 ? '' : 's'}`, 'open'))
  }
  top.append(badges)
  item.append(top)

  item.append(el('p', 'mt-1 break-all font-mono text-sm', `${window.location.origin}/${link.slug}`))
  item.append(el('p', 'mt-1 break-all font-mono text-sm text-zinc-800', destinationText(link.destination)))

  const meta = el('p', 'mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-zinc-700')
  if (showOwner) meta.append(ownerButton(link.ownerId, link.ownerEmail, link.ownerStatus))
  meta.append(
    el('span', '', `Created ${fmtDate(link.createdAt)}`),
    el('span', '', `${link.clicks30d.toLocaleString()} human clicks in 30 days`),
  )
  item.append(meta)

  const actions = el('div', 'mt-3 flex flex-wrap gap-2')

  if (link.status === 'active' || link.status === 'disabled') {
    actions.append(
      actionButton(
        'Block link',
        async () => {
          const answer = await ask({
            title: 'Block this link?',
            message:
              'Visitors will see a "blocked" page, and every open report on this link is resolved.',
            confirmLabel: 'Block link',
            danger: true,
            showReason: true,
            showDomain: true,
          })
          if (!answer) return
          await blockAdminLink(link.id, answer.reason, answer.blockDomain)
          showStatus('Link blocked.', false)
          await afterAction()
        },
        DANGER,
      ),
    )
  }

  if (link.status === 'blocked') {
    actions.append(
      actionButton('Restore link', async () => {
        const answer = await ask({
          title: 'Restore this link?',
          message: 'The link will redirect visitors again.',
          confirmLabel: 'Restore',
          danger: false,
          showReason: false,
          showDomain: false,
        })
        if (!answer) return
        await restoreAdminLink(link.id)
        showStatus('Link restored.', false)
        await afterAction()
      }),
    )
  }

  const details = el('ul', 'mt-3 hidden space-y-3')
  let loaded = false
  actions.append(
    actionButton('Reports', async () => {
      details.classList.toggle('hidden')
      if (details.classList.contains('hidden') || loaded) return
      const data = await getAdminLink(link.id)
      fillList(
        details,
        data.reports.map((report) => renderReport(report, { actions: false, showOwner: false })),
        'No reports for this link.',
      )
      loaded = true
    }),
  )

  item.append(actions, details)
  return item
}

function renderAccountRow(account: AdminAccount): HTMLLIElement {
  const item = el('li', 'rounded-xl border border-zinc-300 p-4')

  const top = el('div', 'flex flex-wrap items-center justify-between gap-2')
  top.append(el('h3', 'break-all font-bold', account.email))
  const badges = el('div', 'flex flex-wrap items-center gap-2')
  badges.append(badge(account.status))
  if (account.openReports > 0) {
    badges.append(
      badge(`${account.openReports} open report${account.openReports === 1 ? '' : 's'}`, 'open'),
    )
  }
  top.append(badges)
  item.append(top)

  item.append(
    el(
      'p',
      'mt-1 text-xs text-zinc-700',
      `Joined ${fmtDate(account.createdAt)} · ${account.linkCount} links · ${account.blockedLinks} blocked`,
    ),
  )

  const actions = el('div', 'mt-3')
  actions.append(actionButton('Open account', () => openAccount(account.id)))
  item.append(actions)
  return item
}

function renderAudit(entry: AuditEntry): HTMLLIElement {
  const item = el('li', 'rounded-lg border border-zinc-300 p-3 text-sm')
  const line = el('p', 'flex flex-wrap items-center gap-x-3 gap-y-1')
  line.append(
    el('span', 'font-semibold', ACTION_LABELS[entry.action] ?? entry.action),
    el(
      'span',
      'text-zinc-700',
      entry.targetId === null ? entry.targetType : `${entry.targetType} #${entry.targetId}`,
    ),
    el('span', 'text-xs text-zinc-700', `${entry.adminEmail} · ${fmtTime(entry.createdAt)}`),
  )
  item.append(line)
  if (entry.detail) {
    item.append(el('p', 'mt-1 whitespace-pre-wrap break-words text-xs text-zinc-700', entry.detail))
  }
  return item
}

// ---------- Loaders ----------

const loadReports = makeLoader<AdminReport>({
  fetchPage: async (offset) =>
    (await listAdminReports({ status: reportsFilter.value, offset, limit: PAGE_SIZE })).reports,
  render: (report) => renderReport(report, { actions: true, showOwner: true }),
  list: reportsList,
  moreButton: reportsMore,
  emptyNote: reportsEmpty,
})

const loadLinks = makeLoader<AdminLink>({
  fetchPage: async (offset) =>
    (
      await listAdminLinks({
        status: linksStatus.value,
        q: linksQuery.value.trim(),
        offset,
        limit: PAGE_SIZE,
      })
    ).links,
  render: (link) => renderLink(link, true),
  list: linksList,
  moreButton: linksMore,
  emptyNote: linksEmpty,
})

const loadAccounts = makeLoader<AdminAccount>({
  fetchPage: async (offset) =>
    (
      await listAdminAccounts({
        status: accountsStatus.value,
        q: accountsQuery.value.trim(),
        reported: accountsReported.checked,
        offset,
        limit: PAGE_SIZE,
      })
    ).accounts,
  render: renderAccountRow,
  list: accountsList,
  moreButton: accountsMore,
  emptyNote: accountsEmpty,
})

const loadAudit = makeLoader<AuditEntry>({
  fetchPage: async (offset) =>
    (await listAudit({ targetType: auditFilter.value, targetId: null, offset, limit: PAGE_SIZE }))
      .entries,
  render: renderAudit,
  list: auditList,
  moreButton: auditMore,
  emptyNote: auditEmpty,
})

// ---------- Overview ----------

function statCard(label: string, value: number): HTMLElement {
  const card = el('div', 'rounded-xl border border-zinc-300 p-4')
  card.append(
    el('p', 'text-xs font-semibold text-zinc-700', label),
    el('p', 'mt-1 text-2xl font-extrabold', value.toLocaleString()),
  )
  return card
}

function applyOverview(data: Overview): void {
  overview = data
  adminEmailLabel.textContent = data.adminEmail

  reportsBadge.textContent = `${data.openReports} open`
  reportsBadge.hidden = data.openReports === 0

  overviewStats.replaceChildren(
    statCard('Active accounts', data.users),
    statCard('Banned accounts', data.bannedUsers),
    statCard('New accounts (24 hours)', data.newUsers24h),
    statCard('Links (active or paused)', data.links),
    statCard('Blocked links', data.blockedLinks),
    statCard('New links (24 hours)', data.newLinks24h),
    statCard('Open reports', data.openReports),
    statCard('Human clicks (24 hours)', data.clicks24h),
  )

  killState.textContent = data.linksPaused
    ? 'Link creation is PAUSED. Nobody can create links or change destinations.'
    : 'Link creation is on.'
  killState.className = data.linksPaused ? 'mt-2 text-sm font-semibold text-red-700' : 'mt-2 text-sm'
  killToggle.textContent = data.linksPaused ? 'Resume link creation' : 'Pause link creation'
  killToggle.className = data.linksPaused ? BTN : DANGER

  signinBudget.textContent = `${data.signInEmailsToday} of ${data.signInEmailsLimit} sent so far today.`
}

async function refreshOverview(): Promise<void> {
  applyOverview(await getOverview())
}

killToggle.addEventListener('click', () => {
  if (!overview) return
  const paused = !overview.linksPaused
  killToggle.disabled = true
  void run(async () => {
    const answer = await ask({
      title: paused ? 'Pause link creation?' : 'Resume link creation?',
      message: paused
        ? 'Nobody will be able to create links or change destinations until you resume. Existing links keep working.'
        : 'People will be able to create links and change destinations again.',
      confirmLabel: paused ? 'Pause' : 'Resume',
      danger: paused,
      showReason: false,
      showDomain: false,
    })
    if (!answer) return
    await setKillSwitch(paused)
    showStatus(paused ? 'Link creation paused.' : 'Link creation resumed.', false)
    await refreshOverview()
  }).finally(() => {
    killToggle.disabled = false
  })
})

// ---------- Account detail ----------

function renderBreakdown(
  list: HTMLElement,
  rows: Breakdown[],
  format: (name: string) => string = (name) => name,
): void {
  if (rows.length === 0) {
    list.replaceChildren(el('li', 'text-sm text-zinc-700', 'No data yet.'))
    return
  }
  const biggest = Math.max(...rows.map((row) => row.clicks))
  list.replaceChildren(
    ...rows.map((row) => {
      const item = el('li')
      const line = el('div', 'flex justify-between gap-3 text-sm')
      line.append(
        el('span', 'break-all', format(row.name)),
        el('span', 'font-semibold', row.clicks.toLocaleString()),
      )
      const track = el('div', 'mt-1 h-1.5 rounded bg-zinc-200')
      const bar = el('div', 'h-1.5 rounded bg-zinc-800')
      bar.style.width = `${Math.max(2, Math.round((row.clicks / biggest) * 100))}%`
      track.append(bar)
      item.append(line, track)
      return item
    }),
  )
}

function drawChart(days: string[], values: number[]): void {
  if (chart) {
    chart.data.labels = days
    chart.data.datasets[0].data = values
    chart.update()
    return
  }
  chart = new Chart<'line', number[], string>(acctChart, {
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

function renderAnalytics(data: AccountAnalytics): void {
  acctStatClicks.textContent = data.totals.clicks.toLocaleString()
  acctStatVisitors.textContent = data.totals.visitors.toLocaleString()
  acctStatQr.textContent = data.totals.qrScans.toLocaleString()
  acctStatBots.textContent = data.totals.botClicks.toLocaleString()

  drawChart(
    data.daily.map((entry) => entry.day),
    data.daily.map((entry) => entry.clicks),
  )
  acctChart.setAttribute(
    'aria-label',
    `Clicks per day from ${data.range.from} to ${data.range.to}. ${data.totals.clicks} clicks in total.`,
  )

  renderBreakdown(byId('acct-countries'), data.countries, countryName)
  renderBreakdown(byId('acct-devices'), data.devices)
  renderBreakdown(byId('acct-browsers'), data.browsers)
  renderBreakdown(byId('acct-referrers'), data.referrers)
}

async function loadAccountAnalytics(): Promise<void> {
  if (currentAccountId === null) return
  const mine = ++analyticsToken
  const data = await getAccountAnalytics({
    id: currentAccountId,
    days: Number(acctDays.value),
    link: acctLink.value === '' ? null : Number(acctLink.value),
    bots: acctBots.checked,
  })
  if (mine !== analyticsToken) return
  renderAnalytics(data)
}

async function openAccount(id: number): Promise<void> {
  const [detail, history] = await Promise.all([
    getAdminAccount(id),
    listAudit({ targetType: 'user', targetId: id, offset: 0, limit: PAGE_SIZE }),
  ])
  const account = detail.account

  currentAccountId = id
  accountsListView.hidden = true
  accountDetail.hidden = false
  if (chart) {
    chart.destroy()
    chart = null
  }

  acctEmail.textContent = account.email
  acctMeta.textContent =
    `${capitalise(account.status)} · joined ${fmtDate(account.createdAt)} · ` +
    `${account.linkCount} links · ${account.blockedLinks} blocked · ${account.openReports} open reports`

  acctActions.replaceChildren()
  if (account.status === 'active') {
    acctActions.append(
      actionButton(
        'Ban account',
        async () => {
          const answer = await ask({
            title: `Ban ${account.email}?`,
            message:
              'They are signed out immediately and all their active links are blocked. You can undo this later.',
            confirmLabel: 'Ban account',
            danger: true,
            showReason: true,
            showDomain: false,
          })
          if (!answer) return
          await banAccount(id, answer.reason)
          showStatus('Account banned.', false)
          await afterAction()
        },
        DANGER,
      ),
    )
  }
  if (account.status === 'banned') {
    acctActions.append(
      actionButton('Unban account', async () => {
        const answer = await ask({
          title: `Unban ${account.email}?`,
          message:
            'Links that were blocked because of the ban are restored. Links you blocked by hand stay blocked. They will need to sign in again.',
          confirmLabel: 'Unban',
          danger: false,
          showReason: false,
          showDomain: false,
        })
        if (!answer) return
        await unbanAccount(id)
        showStatus('Account unbanned.', false)
        await afterAction()
      }),
    )
  }

  const choices = [new Option('All links', '')]
  for (const link of detail.links.filter((item) => item.status !== 'deleted')) {
    choices.push(new Option(link.title ?? link.slug, String(link.id)))
  }
  acctLink.replaceChildren(...choices)

  fillList(
    acctLinks,
    detail.links.map((link) => renderLink(link, false)),
    'This account has no links.',
  )
  fillList(
    acctReports,
    detail.reports.map((report) => renderReport(report, { actions: true, showOwner: false })),
    'No reports about this account.',
  )
  fillList(acctAudit, history.entries.map(renderAudit), 'No admin actions yet.')

  await loadAccountAnalytics()
}

function closeAccount(): void {
  currentAccountId = null
  analyticsToken++
  accountDetail.hidden = true
  accountsListView.hidden = false
  if (chart) {
    chart.destroy()
    chart = null
  }
}

async function openAccountFromAnywhere(id: number): Promise<void> {
  await openTab('accounts', false)
  await openAccount(id)
}

// ---------- Tabs ----------

async function openTab(tab: Tab, load = true): Promise<void> {
  activeTab = tab
  for (const name of TABS) {
    const current = name === tab
    tabPanels[name].hidden = !current
    const button = tabButtons[name]
    button.classList.remove(...TAB_ACTIVE, ...TAB_IDLE)
    button.classList.add(...(current ? TAB_ACTIVE : TAB_IDLE))
    if (current) button.setAttribute('aria-current', 'page')
    else button.removeAttribute('aria-current')
  }
  statusBox.textContent = ''

  if (!load) return
  switch (tab) {
    case 'overview':
      await refreshOverview()
      break
    case 'reports':
      await loadReports(true)
      break
    case 'links':
      await loadLinks(true)
      break
    case 'accounts':
      if (currentAccountId === null) await loadAccounts(true)
      break
    case 'audit':
      await loadAudit(true)
      break
  }
}

async function afterAction(): Promise<void> {
  await refreshOverview()
  switch (activeTab) {
    case 'reports':
      await loadReports(true)
      break
    case 'links':
      await loadLinks(true)
      break
    case 'accounts':
      if (currentAccountId === null) await loadAccounts(true)
      else await openAccount(currentAccountId)
      break
    case 'audit':
      await loadAudit(true)
      break
    case 'overview':
      break
  }
}

// ---------- Events ----------

for (const tab of TABS) {
  tabButtons[tab].addEventListener('click', () => {
    void run(() => openTab(tab))
  })
}

reportsFilter.addEventListener('change', () => void run(() => loadReports(true)))
auditFilter.addEventListener('change', () => void run(() => loadAudit(true)))
accountsStatus.addEventListener('change', () => void run(() => loadAccounts(true)))
accountsReported.addEventListener('change', () => void run(() => loadAccounts(true)))
linksStatus.addEventListener('change', () => void run(() => loadLinks(true)))

linksFilters.addEventListener('submit', (event) => {
  event.preventDefault()
  void run(() => loadLinks(true))
})
accountsFilters.addEventListener('submit', (event) => {
  event.preventDefault()
  void run(() => loadAccounts(true))
})

reportsMore.addEventListener('click', () => void run(() => loadReports(false)))
linksMore.addEventListener('click', () => void run(() => loadLinks(false)))
accountsMore.addEventListener('click', () => void run(() => loadAccounts(false)))
auditMore.addEventListener('click', () => void run(() => loadAudit(false)))

accountBack.addEventListener('click', () => {
  closeAccount()
  void run(() => loadAccounts(true))
})

for (const control of [acctLink, acctDays, acctBots]) {
  control.addEventListener('change', () => void run(loadAccountAnalytics))
}

signOutButton.addEventListener('click', () => {
  void run(async () => {
    await logout()
    window.location.replace('/login')
  })
})

// ---------- Start ----------

async function init(): Promise<void> {
  try {
    const data = await getOverview()
    gate.hidden = true
    app.hidden = false
    document.title = 'Admin · ph.ink'
    applyOverview(data)
    await openTab('overview', false)
  } catch (error) {
    if (error instanceof ApiError && error.status === 401) {
      gateTitle.textContent = 'Please sign in again'
      gateText.textContent =
        'Admin sessions last 12 hours. Sign in with a new email link, then open this page again.'
      const link = el('a', 'btn mt-4 inline-block', 'Go to sign in')
            link.href = '/login?next=/admin&fresh=1'
      gateText.append(el('br'), link)
    } else {
      gateTitle.textContent = 'Page not found'
      gateText.textContent = ''
    }
  }
}

void init()