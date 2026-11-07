export {}

const KEY = 'ph-theme'
type Theme = 'light' | 'dark'

function saved(): Theme | null {
  try {
    const value = localStorage.getItem(KEY)
    return value === 'light' || value === 'dark' ? value : null
  } catch {
    return null
  }
}

function current(): Theme {
  return document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light'
}

function syncButtons(): void {
  const pressed = current() === 'dark' ? 'true' : 'false'
  for (const button of document.querySelectorAll<HTMLButtonElement>('[data-theme-toggle]')) {
    button.setAttribute('aria-pressed', pressed)
  }
}

function apply(theme: Theme, remember: boolean): void {
  document.documentElement.dataset.theme = theme
  if (remember) {
    try {
      localStorage.setItem(KEY, theme)
    } catch {
      // Storage is blocked. The choice lasts for this page view only.
    }
  }
  syncButtons()
  window.dispatchEvent(new Event('themechange'))
}

for (const button of document.querySelectorAll<HTMLButtonElement>('[data-theme-toggle]')) {
  button.addEventListener('click', () => apply(current() === 'dark' ? 'light' : 'dark', true))
}

window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', (event) => {
  if (saved() === null) apply(event.matches ? 'dark' : 'light', false)
})

syncButtons()