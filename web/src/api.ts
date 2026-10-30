export type LinkItem = {
  id: number
  slug: string
  shortUrl: string
  destination: string
  title: string | null
  status: string
  expiresAt: number | null
  createdAt: number
  updatedAt: number
}

export type Me = { id: number; email: string }

export class ApiError extends Error {
  readonly status: number

  constructor(message: string, status: number) {
    super(message)
    this.status = status
  }
}

function readErrorMessage(data: unknown): string {
  if (typeof data === 'object' && data !== null && 'error' in data) {
    const value = (data as { error: unknown }).error
    if (typeof value === 'string') return value
  }
  return 'Something went wrong. Please try again.'
}

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  const response = await fetch(path, {
    method,
    headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
    credentials: 'same-origin',
  })

  let data: unknown = null
  try {
    data = await response.json()
  } catch {
    // The response had no JSON body.
  }

  if (!response.ok) {
    throw new ApiError(readErrorMessage(data), response.status)
  }
  return data as T
}

export const getMe = () => request<Me>('GET', '/api/auth/me')

export const requestLoginLink = (email: string) =>
  request<{ ok: boolean; message: string }>('POST', '/api/auth/request', { email })

export const logout = () => request<{ ok: boolean }>('POST', '/api/auth/logout')

export const listLinks = () => request<{ links: LinkItem[] }>('GET', '/api/links?limit=100')

export const createLink = (input: { destination: string; slug?: string; title?: string }) =>
  request<LinkItem>('POST', '/api/links', input)

export const updateLink = (
  id: number,
  changes: { destination?: string; title?: string | null; status?: 'active' | 'disabled' },
) => request<LinkItem>('PATCH', `/api/links/${id}`, changes)

export const deleteLink = (id: number) =>
  request<{ ok: boolean }>('DELETE', `/api/links/${id}`)