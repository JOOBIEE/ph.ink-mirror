import { request } from './api'

export type AdminFeedback = {
  id: number
  kind: string
  message: string
  email: string | null
  page: string | null
  status: string
  createdAt: number
}

export const listAdminFeedback = (options: { status: string; offset: number; limit: number }) =>
  request<{ feedback: AdminFeedback[] }>(
    'GET',
    `/api/admin/feedback?${new URLSearchParams({
      status: options.status,
      offset: String(options.offset),
      limit: String(options.limit),
    }).toString()}`,
  )

export const setFeedbackStatus = (id: number, status: string) =>
  request<{ ok: boolean }>('POST', `/api/admin/feedback/${id}/status`, { status })