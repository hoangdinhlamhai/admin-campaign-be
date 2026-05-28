import type { AppBindings } from '../types'

export type SendEmailParams = {
  to: string | string[]
  subject: string
  html: string
}

export type SendEmailResult =
  | { ok: true; id: string }
  | { ok: false; error: string }

export async function sendEmail(
  env: AppBindings,
  params: SendEmailParams,
): Promise<SendEmailResult> {
  if (!env.RESEND_API_KEY) {
    console.error('[email] RESEND_API_KEY missing — skip send')
    return { ok: false, error: 'API key missing' }
  }

  const from = env.RESEND_FROM ?? 'onboarding@resend.dev'

  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${env.RESEND_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from,
      to: params.to,
      subject: params.subject,
      html: params.html,
    }),
  })

  const body = (await res.json().catch(() => ({}))) as {
    id?: string
    message?: string
    name?: string
  }

  if (!res.ok) {
    console.error(`[email] Resend ${res.status}:`, body)
    return { ok: false, error: body.message ?? body.name ?? `HTTP ${res.status}` }
  }

  return { ok: true, id: body.id ?? 'unknown' }
}
