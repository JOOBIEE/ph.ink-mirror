import { getPublicConfig } from './api'

type TurnstileApi = {
  render: (container: HTMLElement, options: Record<string, unknown>) => string
  reset: (widgetId: string) => void
}

declare global {
  interface Window {
    turnstile?: TurnstileApi
  }
}

const SCRIPT_URL = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit'
const LOAD_TIMEOUT_MS = 10000
const LOAD_PROBLEM =
  'The security check could not be loaded. Check your connection and reload the page.'

export type TurnstileHandle = {
  enabled: boolean
  getToken: () => string | null
  reset: () => void
}

const DISABLED: TurnstileHandle = { enabled: false, getToken: () => null, reset: () => {} }

function loadScript(): Promise<TurnstileApi> {
  return new Promise((resolve, reject) => {
    if (window.turnstile) {
      resolve(window.turnstile)
      return
    }

    const script = document.createElement('script')
    script.src = SCRIPT_URL
    script.async = true
    script.defer = true

    const timer = window.setTimeout(() => reject(new Error('timeout')), LOAD_TIMEOUT_MS)
    script.onload = () => {
      window.clearTimeout(timer)
      if (window.turnstile) resolve(window.turnstile)
      else reject(new Error('missing'))
    }
    script.onerror = () => {
      window.clearTimeout(timer)
      reject(new Error('blocked'))
    }
    document.head.append(script)
  })
}

export async function setupTurnstile(
  container: HTMLElement,
  onProblem: (message: string) => void,
): Promise<TurnstileHandle> {
  let siteKey: string | null = null
  try {
    siteKey = (await getPublicConfig()).turnstileSiteKey
  } catch {
    return DISABLED
  }
  if (!siteKey) return DISABLED

  let api: TurnstileApi
  try {
    api = await loadScript()
  } catch {
    onProblem(LOAD_PROBLEM)
    return DISABLED
  }

  let token: string | null = null
  const widgetId = api.render(container, {
    sitekey: siteKey,
    callback: (value: string) => {
      token = value
    },
    'expired-callback': () => {
      token = null
    },
    'error-callback': () => {
      token = null
      onProblem('The security check had a problem. Please reload the page.')
    },
  })

  return {
    enabled: true,
    getToken: () => token,
    reset: () => {
      token = null
      api.reset(widgetId)
    },
  }
}