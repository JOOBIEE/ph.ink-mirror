import type { Bindings } from '../types'

export async function sendLoginEmail(
  env: Bindings,
  to: string,
  link: string,
): Promise<void> {
  if (env.APP_ENV === 'development') {
    console.log(`\n[dev email] Sign-in link for ${to}:\n${link}\n`)
    return
  }

  if (!env.RESEND_API_KEY || !env.EMAIL_FROM) {
    throw new Error('Email sending is not configured.')
  }

  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${env.RESEND_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: env.EMAIL_FROM,
      to: [to],
      subject: 'Your ph.ink sign-in link',
      text:
        'Use this link to sign in to ph.ink. It works once and expires in 15 minutes.\n\n' +
        `${link}\n\nIf you did not ask for this, you can ignore this email.`,
    }),
  })

  if (!response.ok) {
    throw new Error(`Email provider rejected the message (status ${response.status}).`)
  }
}