import { request, type Analytics } from './api'

export type Overview = {
  users: number
  bannedUsers: number
  newUsers24h: number
  links: number
  blockedLinks: number
  newLinks24h: number
  openReports: number
  clicks24h: number
  linksPaused: boolean
  signInEmailsToday: number
  signInEmailsLimit: number
  adminEmail: string
}

export type AdminLink = {
  id: number
  slug: string
  destination: string
  title: string | null
  status: string
  blockReason: string | null
  createdAt: number
  ownerId: number
  ownerEmail: string
  ownerStatus: string
  openReports: number
  clicks30d: number
}

export type AdminReport = {
  id: number
  reason: string
  details: string | null
  status: string
  createdAt: number
  handledAt: number | null
  linkId: number
  slug: string
  destination: string
  linkStatus: string
  ownerId: number
  ownerEmail: string
  openForLink: number
}

export type AdminAccount = {
  id: number
  email: string
  status: string
  createdAt: number
  linkCount: number
  blockedLinks: number
  openReports: number
}

export type AuditEntry = {
  id: number
  action: string
  targetType: string
  targetId: number | null
  detail: string | null
  createdAt: number
  adminEmail: string
}

export type AccountAnalytics = Analytics & { account: { id: number; email: string } }

function query(params: Record<string, string | number | null | undefined>): string {
  const search = new URLSearchParams()
  for (const [key, value] of Object.entries(params)) {
    if (value !== null && value !== undefined) search.set(key, String(value))
  }
  const text = search.toString()
  return text === '' ? '' : `?${text}`
}

export const getOverview = () => request<Overview>('GET', '/api/admin/overview')

export const listAdminLinks = (options: {
  status: string
  q: string
  offset: number
  limit: number
}) =>
  request<{ links: AdminLink[] }>('GET', `/api/admin/links${query(options)}`)

export const getAdminLink = (id: number) =>
  request<{ link: AdminLink; reports: AdminReport[] }>('GET', `/api/admin/links/${id}`)

export const blockAdminLink = (id: number, reason: string, blockDomain: boolean) =>
  request<{ ok: boolean }>('POST', `/api/admin/links/${id}/block`, { reason, blockDomain })

export const restoreAdminLink = (id: number) =>
  request<{ ok: boolean }>('POST', `/api/admin/links/${id}/restore`)

export const listAdminReports = (options: { status: string; offset: number; limit: number }) =>
  request<{ reports: AdminReport[] }>('GET', `/api/admin/reports${query(options)}`)

export const dismissReport = (id: number) =>
  request<{ ok: boolean }>('POST', `/api/admin/reports/${id}/dismiss`)

export const blockReportLink = (id: number, reason: string, blockDomain: boolean) =>
  request<{ ok: boolean }>('POST', `/api/admin/reports/${id}/block`, { reason, blockDomain })

export const listAdminAccounts = (options: {
  status: string
  q: string
  reported: boolean
  offset: number
  limit: number
}) =>
  request<{ accounts: AdminAccount[] }>(
    'GET',
    `/api/admin/accounts${query({
      status: options.status,
      q: options.q,
      reported: options.reported ? '1' : null,
      offset: options.offset,
      limit: options.limit,
    })}`,
  )

export const getAdminAccount = (id: number) =>
  request<{ account: AdminAccount; links: AdminLink[]; reports: AdminReport[] }>(
    'GET',
    `/api/admin/accounts/${id}`,
  )

export const getAccountAnalytics = (options: {
  id: number
  days: number
  link: number | null
  bots: boolean
}) =>
  request<AccountAnalytics>(
    'GET',
    `/api/admin/accounts/${options.id}/analytics${query({
      days: options.days,
      link: options.link,
      bots: options.bots ? '1' : null,
    })}`,
  )

export const banAccount = (id: number, reason: string) =>
  request<{ ok: boolean }>('POST', `/api/admin/accounts/${id}/ban`, { reason })

export const unbanAccount = (id: number) =>
  request<{ ok: boolean }>('POST', `/api/admin/accounts/${id}/unban`)

export const setKillSwitch = (paused: boolean) =>
  request<{ ok: boolean; paused: boolean }>('POST', '/api/admin/kill-switch', { paused })

export const listAudit = (options: {
  targetType: string
  targetId: number | null
  offset: number
  limit: number
}) => request<{ entries: AuditEntry[] }>('GET', `/api/admin/audit${query(options)}`)