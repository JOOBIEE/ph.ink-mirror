import { ApiError, getMe, requestLoginLink } from './api'

const form = document.querySelector<HTMLFormElement>('#login-form')
const emailInput = document.querySelector<HTMLInputElement>('#email')
const submitButton = document.querySelector<HTMLButtonElement>('#submit')
const statusBox = document.querySelector<HTMLElement>('#status')

function show(message: string, isError: boolean): void {
  if (!statusBox) return
  statusBox.textContent = message
  statusBox.className = isError
    ? 'mt-4 text-sm font-semibold text-red-700'
    : 'mt-4 text-sm font-semibold text-green-800'
}

getMe()
  .then(() => window.location.replace('/dashboard'))
  .catch(() => {
    // Not signed in, which is expected on this page.
  })

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
      const result = await requestLoginLink(email)
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