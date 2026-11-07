import { getMe } from './api'

getMe()
  .then(() => {
    for (const link of document.querySelectorAll<HTMLAnchorElement>('[data-home-action]')) {
      link.href = '/dashboard'
      link.textContent = link.dataset.signedIn ?? 'Dashboard'
    }
  })
  .catch(() => {
    // Not signed in: the buttons already point at the sign-in page.
  })