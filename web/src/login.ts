import { ApiError, getMe, requestLoginLink } from './api'

// Must match the list in src/lib/redirect-target.ts. The server is the real check.
const ALLOWED_NEXT = ['/admin', '/dashboard', '/settings', '/qr-studio']

const form = document.querySelector<HTMLFormElement>('#login-form')
const emailInput = document.querySelector<HTMLInputElement>('#email')
const submitButton = document.querySelector<HTMLButtonElement>('#submit')
const statusBox = document.querySelector<HTMLElement>('#status')

const params = new URLSearchParams(window.location.search)
const requested = params.get('next')
const next = requested !== null && ALLOWED_NEXT.includes(requested) ? requested : null
const wantsFreshSignIn = params.get('fresh') === '1'

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

    submitButton.disabled = true
    show('Sending...', false)
    try {
      const result = await requestLoginLink(email, next)
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
    }
  })
}