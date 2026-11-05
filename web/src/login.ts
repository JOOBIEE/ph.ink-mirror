import { ApiError, getMe, requestLoginLink } from './api'
import { setupTurnstile, type TurnstileHandle } from './turnstile'

// Must match the list in src/lib/redirect-target.ts. The server is the real check.
const ALLOWED_NEXT = ['/admin', '/dashboard', '/settings', '/qr-studio']

const form = document.querySelector<HTMLFormElement>('#login-form')
const emailInput = document.querySelector<HTMLInputElement>('#email')
const submitButton = document.querySelector<HTMLButtonElement>('#submit')
const statusBox = document.querySelector<HTMLElement>('#status')
const turnstileBox = document.querySelector<HTMLElement>('#turnstile-box')

const params = new URLSearchParams(window.location.search)
const requested = params.get('next')
const next = requested !== null && ALLOWED_NEXT.includes(requested) ? requested : null
const wantsFreshSignIn = params.get('fresh') === '1'

let check: TurnstileHandle | null = null

function show(message: string, isError: boolean): void {
  if (!statusBox) return
  statusBox.textContent = message
  statusBox.className = isError
    ? 'mt-4 text-sm font-semibold text-red-700'
    : 'mt-4 text-sm font-semibold text-green-800'
}

if (wantsFreshSignIn) {
  show('This page needs a fresh sign-in. Enter your email address to get a new link.', false)
} else {
  getMe()
    .then(() => window.location.replace(next ?? '/dashboard'))
    .catch(() => {
      // Not signed in, which is expected on this page.
    })
}

if (turnstileBox && submitButton) {
  submitButton.disabled = true
  void setupTurnstile(turnstileBox, (message) => show(message, true)).then((handle) => {
    check = handle
    submitButton.disabled = false
  })
}

if (form) {
  form.addEventListener('submit', async (event) => {
    event.preventDefault()
    if (!emailInput || !submitButton) return

    const email = emailInput.value.trim()
    if (!email) {
      show('Enter your email address.', true)
      emailInput.focus()
      return
    }

    const token = check?.getToken() ?? null
    if (check?.enabled && !token) {
      show('Please wait for the security check to finish, then try again.', true)
      return
    }

    submitButton.disabled = true
    show('Sending...', false)
    try {
      const result = await requestLoginLink(email, next, token)
      show(result.message, false)
    } catch (error) {
      show(
        error instanceof ApiError
          ? error.message
          : 'Could not reach the server. Please try again.',
        true,
      )
    } finally {
      submitButton.disabled = false
      check?.reset()
    }
  })
}