import { COFFEE_URL } from './coffee'

// Floating "Got an idea?" and "Buy us a coffee" buttons, shown on every page except the admin
// area (admin.html does not load this file). Everything is built with createElement and
// textContent, so no inline scripts or styles are needed.

const SVG_NS = 'http://www.w3.org/2000/svg'
const ICON_CHAT = 'M21 15a2 2 0 0 1-2 2H8l-5 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z'
const ICON_CUP =
  'M4 9h12v5a4 4 0 0 1-4 4H8a4 4 0 0 1-4-4V9z M16 11h1.5a2.5 2.5 0 0 1 0 5H16 M7 3v3 M10 3v3 M13 3v3'

const TOPICS: { value: string; label: string }[] = [
  { value: 'idea', label: 'An idea or a feature I would like' },
  { value: 'problem', label: 'Something is broken or confusing' },
  { value: 'praise', label: 'Something I like' },
  { value: 'other', label: 'Something else' },
]

const coffeeHref = /^https:\/\//.test(COFFEE_URL) ? COFFEE_URL : ''

function make<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className = '',
  text = '',
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag)
  if (className) node.className = className
  if (text) node.textContent = text
  return node
}

function icon(path: string): SVGSVGElement {
  const svg = document.createElementNS(SVG_NS, 'svg')
  svg.setAttribute('viewBox', '0 0 24 24')
  svg.setAttribute('width', '18')
  svg.setAttribute('height', '18')
  svg.setAttribute('fill', 'none')
  svg.setAttribute('stroke', 'currentColor')
  svg.setAttribute('stroke-width', '2')
  svg.setAttribute('stroke-linecap', 'round')
  svg.setAttribute('stroke-linejoin', 'round')
  svg.setAttribute('aria-hidden', 'true')
  const shape = document.createElementNS(SVG_NS, 'path')
  shape.setAttribute('d', path)
  svg.append(shape)
  return svg
}

const dialog = make('dialog', 'fab-dialog')
dialog.setAttribute('aria-labelledby', 'fab-title')
const panel = make('div', 'fab-panel')
dialog.append(panel)

// Pressing the dark area outside the box closes it.
dialog.addEventListener('click', (event) => {
  if (event.target === dialog) dialog.close()
})

function openDialog(): void {
  if (!dialog.open) dialog.showModal()
}

function heading(text: string): HTMLHeadingElement {
  const node = make('h2', 'text-2xl font-extrabold', text)
  node.id = 'fab-title'
  return node
}

function closeButton(label: string): HTMLButtonElement {
  const button = make('button', 'btn', label)
  button.type = 'button'
  button.addEventListener('click', () => dialog.close())
  return button
}

function showCoffee(afterFeedback: boolean): void {
  const parts: Node[] = [heading(afterFeedback ? 'Thank you!' : 'Buy us a coffee')]
  if (afterFeedback) {
    parts.push(
      make('p', 'mt-2 text-zinc-700', 'We read every message, and your ideas shape what we build next.'),
    )
  }
  parts.push(
    make(
      'p',
      'mt-3 text-zinc-700',
      'phub.ink is free and run by a small team. If it has saved you time, a coffee helps keep it free for everyone.',
    ),
  )

  const actions = make('div', 'mt-5 flex flex-wrap gap-2')
  if (coffeeHref) {
    const link = make('a', 'btn-primary', 'Buy us a coffee')
    link.href = coffeeHref
    link.target = '_blank'
    link.rel = 'noopener noreferrer'
    link.prepend(icon(ICON_CUP))
    actions.append(link, closeButton('Maybe later'))
  } else {
    parts.push(
      make('p', 'card-flat mt-4 text-sm', 'Coffee payments are coming soon. Thank you for the thought!'),
    )
    actions.append(closeButton('Close'))
  }
  parts.push(actions)

  panel.replaceChildren(...parts)
  openDialog()
}

function field(labelText: string, control: HTMLElement, hintText = ''): HTMLDivElement {
  const row = make('div')
  const label = make('label', 'label', labelText)
  label.htmlFor = control.id
  row.append(label, control)
  if (hintText) row.append(make('p', 'hint', hintText))
  return row
}

function showFeedback(): void {
  const form = make('form', 'mt-4 space-y-4')
  form.noValidate = true

  const topic = make('select', 'field')
  topic.id = 'fb-kind'
  for (const item of TOPICS) topic.append(new Option(item.label, item.value))

  const message = make('textarea', 'field')
  message.id = 'fb-message'
  message.rows = 5
  message.maxLength = 2000
  message.placeholder = 'What do you think? What is missing? What would you add?'

  const email = make('input', 'field')
  email.id = 'fb-email'
  email.type = 'email'
  email.autocomplete = 'email'
  email.placeholder = 'you@example.com'

  // A hidden field that real people never see or fill in. Only form-filling programs do.
  const trapRow = make('div', 'sr-only')
  trapRow.setAttribute('aria-hidden', 'true')
  const trap = make('input')
  trap.type = 'text'
  trap.name = 'hp'
  trap.tabIndex = -1
  trap.autocomplete = 'off'
  trapRow.append(trap)

  const status = make('p', 'text-sm font-semibold')
  status.setAttribute('role', 'status')
  status.setAttribute('aria-live', 'polite')

  const send = make('button', 'btn-primary', 'Send feedback')
  send.type = 'submit'
  const actions = make('div', 'flex flex-wrap gap-2')
  actions.append(send, closeButton('Cancel'))

  form.append(
    field('What is it about?', topic),
    field('Your message', message, 'At least 10 characters. We read every message.'),
    field('Your email (optional)', email, 'Only if you would like a reply. We never share it.'),
    trapRow,
    status,
    actions,
  )

  form.addEventListener('submit', (event) => {
    event.preventDefault()
    if (message.value.trim().length < 10) {
      status.textContent = 'Please write at least 10 characters.'
      status.className = 'text-sm font-semibold text-red-700'
      message.focus()
      return
    }
    status.textContent = ''
    send.disabled = true
    void submit()
  })

  async function submit(): Promise<void> {
    try {
      const response = await fetch('/api/feedback', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          kind: topic.value,
          message: message.value,
          email: email.value,
          page: window.location.pathname,
          hp: trap.value,
        }),
      })
      const data = (await response.json().catch(() => null)) as { error?: string } | null
      if (!response.ok) {
        status.textContent = data?.error ?? 'Could not send your feedback. Please try again.'
        status.className = 'text-sm font-semibold text-red-700'
        return
      }
      showCoffee(true)
    } catch {
      status.textContent = 'Could not reach the server. Please try again.'
      status.className = 'text-sm font-semibold text-red-700'
    } finally {
      send.disabled = false
    }
  }

  panel.replaceChildren(
    heading('What do you think?'),
    make(
      'p',
      'mt-2 text-zinc-700',
      'Ideas, bugs, things you love or hate. Tell us what to add or fix next.',
    ),
    form,
  )
  openDialog()
  message.focus()
}

const wrap = make('div', 'fab-wrap')

const ideaButton = make('button', 'fab fab-hi')
ideaButton.type = 'button'
ideaButton.append(icon(ICON_CHAT), make('span', '', 'Got an idea?'))
ideaButton.addEventListener('click', showFeedback)

const coffeeButton = make('button', 'fab')
coffeeButton.type = 'button'
coffeeButton.append(icon(ICON_CUP), make('span', '', 'Buy us a coffee'))
coffeeButton.addEventListener('click', () => showCoffee(false))

wrap.append(ideaButton, coffeeButton)
document.body.append(wrap, dialog)