import { ApiError, deleteAccount, getMe } from './api'

const emailLabel = document.querySelector<HTMLElement>('#account-email')
const content = document.querySelector<HTMLElement>('#settings-content')
const goneNote = document.querySelector<HTMLElement>('#gone')
const form = document.querySelector<HTMLFormElement>('#delete-form')
const confirmInput = document.querySelector<HTMLInputElement>('#confirm-email')
const deleteButton = document.querySelector<HTMLButtonElement>('#delete-button')
const statusBox = document.querySelector<HTMLElement>('#status')

function show(message: string, isError: boolean): void {
  if (!statusBox) return
  statusBox.textContent = message
  statusBox.className = isError
    ? 'text-sm font-semibold text-red-700'
    : 'text-sm font-semibold text-green-800'
}

function goToLogin(): void {
  window.location.replace('/login')
}

getMe()
  .then((me) => {
    if (emailLabel) emailLabel.textContent = me.email
  })
  .catch((error) => {
    if (error instanceof ApiError && error.status === 401) {
      goToLogin()
      return
    }
    show('Could not load your account. Please try again.', true)
  })

if (form) {
  form.addEventListener('submit', async (event) => {
    event.preventDefault()
    if (!confirmInput || !deleteButton) return

    const typed = confirmInput.value.trim()
    if (!typed) {
      show('Type your email address to confirm.', true)
      confirmInput.focus()
      return
    }

    const sure = window.confirm(
      'Delete your account for good? Your links will stop working and your data will be erased.',
    )
    if (!sure) return

    deleteButton.disabled = true
    show('Deleting...', false)
    try {
      await deleteAccount(typed)
      if (content) content.hidden = true
      if (goneNote) goneNote.hidden = false
      show('', false)
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) {
        goToLogin()
        return
      }
      show(
        error instanceof ApiError
          ? error.message
          : 'Could not reach the server. Please try again.',
        true,
      )
      deleteButton.disabled = false
    }
  })
}