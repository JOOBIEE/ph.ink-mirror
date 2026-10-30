import {
  ApiError,
  createLink,
  deleteLink,
  getMe,
  listLinks,
  logout,
  updateLink,
  type LinkItem,
} from './api'

const userEmail = document.querySelector<HTMLElement>('#user-email')
const signOutButton = document.querySelector<HTMLButtonElement>('#sign-out')
const createForm = document.querySelector<HTMLFormElement>('#create-form')
const destinationInput = document.querySelector<HTMLInputElement>('#destination')
const slugInput = document.querySelector<HTMLInputElement>('#slug')
const titleInput = document.querySelector<HTMLInputElement>('#title')
const createButton = document.querySelector<HTMLButtonElement>('#create-button')
const statusBox = document.querySelector<HTMLElement>('#status')
const linkList = document.querySelector<HTMLUListElement>('#links')
const emptyNote = document.querySelector<HTMLElement>('#empty')

const BUTTON =
  'rounded-lg border border-zinc-400 px-3 py-1.5 text-sm font-semibold text-zinc-900 hover:bg-zinc-100 focus:outline-none focus:ring-2 focus:ring-zinc-900/30'
const DANGER =
  'rounded-lg border border-red-700 px-3 py-1.5 text-sm font-semibold text-red-800 hover:bg-red-50 focus:outline-none focus:ring-2 focus:ring-red-700/30'
const FIELD =
  'w-full rounded-lg border border-zinc-400 px-3 py-2 focus:border-zinc-900 focus:outline-none focus:ring-2 focus:ring-zinc-900/30'

function showMessage(message: string, isError = false): void {
  if (!statusBox) return
  statusBox.textContent = message
  statusBox.className = isError
    ? 'text-sm font-semibold text-red-700'
    : 'text-sm font-semibold text-green-800'
}

function goToLogin(): void {
  window.location.replace('/login')
}

async function run(action: () => Promise<void>): Promise<void> {
  try {
    await action()
  } catch (error) {
    if (error instanceof ApiError) {
      if (error.status === 401) {
        goToLogin()
        return
      }
      showMessage(error.message, true)
    } else {
      showMessage('Could not reach the server. Please try again.', true)
    }
  }
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

function actionButton(
  label: string,
  handler: () => Promise<void>,
  className: string = BUTTON,
): HTMLButtonElement {
  const button = el('button', className, label)
  button.type = 'button'
  button.addEventListener('click', () => {
    void run(handler)
  })
  return button
}

function statusBadge(status: string): HTMLSpanElement {
  const styles: Record<string, string> = {
    active: 'bg-green-100 text-green-900',
    disabled: 'bg-zinc-200 text-zinc-800',
    blocked: 'bg-red-100 text-red-900',
  }
  const label = status.charAt(0).toUpperCase() + status.slice(1)
  return el(
    'span',
    `rounded-full px-2.5 py-0.5 text-xs font-semibold ${styles[status] ?? styles.disabled}`,
    label,
  )
}

async function copyText(text: string): Promise<void> {
  try {
    await navigator.clipboard.writeText(text)
    showMessage('Copied to the clipboard.')
  } catch {
    showMessage('Could not copy. Select the address and copy it by hand.', true)
  }
}

function renderLink(link: LinkItem): HTMLLIElement {
  const item = el('li', 'rounded-xl border border-zinc-300 p-4')

  const top = el('div', 'flex flex-wrap items-center justify-between gap-2')
  top.append(el('h3', 'break-all font-bold', link.title ?? link.slug), statusBadge(link.status))
  item.append(top)

  item.append(el('p', 'mt-1 break-all font-mono text-sm', link.shortUrl))
  item.append(el('p', 'mt-1 break-all text-sm text-zinc-700', `Goes to: ${link.destination}`))
  item.append(
    el(
      'p',
      'mt-1 text-xs text-zinc-600',
      `Created ${new Date(link.createdAt * 1000).toLocaleDateString()}`,
    ),
  )

  if (link.status === 'blocked') {
    item.append(
      el(
        'p',
        'mt-3 text-sm font-semibold text-red-800',
        'This link was blocked for breaking our rules.',
      ),
    )
    return item
  }

  const editForm = el('form', 'mt-3 hidden space-y-2')
  const editId = `edit-${link.id}`
  const editLabel = el('label', 'block text-sm font-semibold', 'New destination')
  editLabel.htmlFor = editId
  const editInput = el('input', FIELD)
  editInput.id = editId
  editInput.type = 'url'
  editInput.required = true
  editInput.value = link.destination
  const saveButton = el('button', BUTTON, 'Save')
  saveButton.type = 'submit'
  editForm.append(editLabel, editInput, saveButton)
  editForm.addEventListener('submit', (event) => {
    event.preventDefault()
    void run(async () => {
      await updateLink(link.id, { destination: editInput.value.trim() })
      showMessage('Destination updated.')
      await refresh()
    })
  })

  const toggleTo = link.status === 'active' ? 'disabled' : 'active'

  const actions = el('div', 'mt-3 flex flex-wrap gap-2')
  actions.append(
    actionButton('Copy', () => copyText(link.shortUrl)),
    actionButton('Edit', async () => {
      editForm.classList.toggle('hidden')
    }),
    actionButton(link.status === 'active' ? 'Pause' : 'Turn on', async () => {
      await updateLink(link.id, { status: toggleTo })
      showMessage(toggleTo === 'active' ? 'Link turned on.' : 'Link paused.')
      await refresh()
    }),
    actionButton(
      'Delete',
      async () => {
        const sure = window.confirm(
          'Delete this link? Its short address can never be used again.',
        )
        if (!sure) return
        await deleteLink(link.id)
        showMessage('Link deleted.')
        await refresh()
      },
      DANGER,
    ),
  )

  item.append(actions, editForm)
  return item
}

async function refresh(): Promise<void> {
  const { links } = await listLinks()
  if (!linkList || !emptyNote) return
  linkList.replaceChildren(...links.map(renderLink))
  emptyNote.hidden = links.length > 0
}

if (createForm) {
  createForm.addEventListener('submit', (event) => {
    event.preventDefault()
    void run(async () => {
      if (!destinationInput || !slugInput || !titleInput || !createButton) return
      createButton.disabled = true
      try {
        const created = await createLink({
          destination: destinationInput.value.trim(),
          slug: slugInput.value.trim(),
          title: titleInput.value.trim(),
        })
        createForm.reset()
        showMessage(`Created ${created.shortUrl}`)
        await refresh()
      } finally {
        createButton.disabled = false
      }
    })
  })
}

if (signOutButton) {
  signOutButton.addEventListener('click', () => {
    void run(async () => {
      await logout()
      goToLogin()
    })
  })
}

void run(async () => {
  const me = await getMe()
  if (userEmail) userEmail.textContent = me.email
  await refresh()
})