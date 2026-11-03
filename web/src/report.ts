import { ApiError, submitReport } from './api'

const form = document.querySelector<HTMLFormElement>('#report-form')
const linkInput = document.querySelector<HTMLInputElement>('#link')
const reasonSelect = document.querySelector<HTMLSelectElement>('#reason')
const detailsInput = document.querySelector<HTMLTextAreaElement>('#details')
const submitButton = document.querySelector<HTMLButtonElement>('#submit')
const statusBox = document.querySelector<HTMLElement>('#status')

function show(message: string, isError: boolean): void {
  if (!statusBox) return
  statusBox.textContent = message
  statusBox.className = isError
    ? 'mt-4 text-sm font-semibold text-red-700'
    : 'mt-4 text-sm font-semibold text-green-800'
}

const prefill = new URLSearchParams(window.location.search).get('link')
if (prefill && linkInput) {
  linkInput.value = prefill.slice(0, 300)
}

if (form) {
  form.addEventListener('submit', async (event) => {
    event.preventDefault()
    if (!linkInput || !reasonSelect || !detailsInput || !submitButton) return

    const link = linkInput.value.trim()
    if (!link) {
      show('Enter the short link you want to report.', true)
      linkInput.focus()
      return
    }
    if (!reasonSelect.value) {
      show('Choose a reason.', true)
      reasonSelect.focus()
      return
    }

    submitButton.disabled = true
    show('Sending...', false)
    try {
      const result = await submitReport({
        link,
        reason: reasonSelect.value,
        details: detailsInput.value.trim(),
      })
      show(result.message, false)
      form.reset()
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