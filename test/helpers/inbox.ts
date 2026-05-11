/**
 * Inbox helper — reads emails written by MockEmailProvider (see
 * src/lib/email/email.service.ts) from the on-disk inbox.
 *
 * Usage in tests:
 *
 *   import { latestForRecipient, extractOtp, clearInbox } from 'test/helpers/inbox'
 *
 *   beforeEach(() => clearInbox())
 *   ...
 *   const email = await latestForRecipient('user@test.local')
 *   const code = extractOtp(email.html)
 *
 * Default inbox dir is `tmp/test-inbox` (override with EMAIL_INBOX_DIR).
 *
 * IMPORTANT: this helper is for tests only; never import it from `src/`.
 */

import { mkdir, readdir, readFile, rm, stat } from 'node:fs/promises'
import path from 'node:path'

const INBOX_DIR = process.env.EMAIL_INBOX_DIR ?? 'tmp/test-inbox'

export interface InboxEmail {
  sentAt: string
  from: string
  to: string | string[]
  cc: string[] | null
  bcc: string[] | null
  replyTo: string | null
  subject: string
  html: string
  text: string | null
  /** Absolute path of the inbox file, useful for debugging. */
  filePath: string
}

export async function ensureInbox(): Promise<void> {
  await mkdir(INBOX_DIR, { recursive: true })
}

export async function clearInbox(): Promise<void> {
  try {
    await rm(INBOX_DIR, { recursive: true, force: true })
  } catch {
    // ignore — dir may not exist yet
  }
  await ensureInbox()
}

export async function listInbox(): Promise<InboxEmail[]> {
  await ensureInbox()
  const entries = await readdir(INBOX_DIR)
  const jsons = entries.filter((e) => e.endsWith('.json')).sort()
  const emails: InboxEmail[] = []
  for (const file of jsons) {
    const full = path.join(INBOX_DIR, file)
    const raw = await readFile(full, 'utf8')
    try {
      const parsed = JSON.parse(raw) as Omit<InboxEmail, 'filePath'>
      emails.push({ ...parsed, filePath: full })
    } catch {
      // skip malformed
    }
  }
  return emails
}

export async function latestForRecipient(
  recipient: string,
  options: { timeoutMs?: number; pollMs?: number } = {},
): Promise<InboxEmail> {
  const { timeoutMs = 5000, pollMs = 100 } = options
  const deadline = Date.now() + timeoutMs

  while (Date.now() < deadline) {
    const emails = await listInbox()
    const match = emails
      .filter((e) => {
        const to = Array.isArray(e.to) ? e.to : [e.to]
        return to.includes(recipient)
      })
      .pop()
    if (match) return match
    await new Promise((r) => setTimeout(r, pollMs))
  }

  throw new Error(`Inbox: no email for ${recipient} within ${timeoutMs}ms (dir=${INBOX_DIR})`)
}

/**
 * Extracts a 6-digit OTP code from email HTML/text. Looks for any standalone
 * run of 6 digits — works for the current Quayer email templates that show
 * the code in a prominent span.
 */
export function extractOtp(content: string): string {
  const m = content.match(/\b(\d{6})\b/)
  if (!m) throw new Error('Inbox: could not find 6-digit OTP in email content')
  return m[1]!
}

/**
 * Extracts the magic-link URL from email HTML. Looks for href containing
 * `verify-magic` (signup or login).
 */
export function extractMagicLink(html: string): string {
  const m = html.match(/href="([^"]*verify-magic[^"]*)"/i)
  if (!m) throw new Error('Inbox: could not find magic-link href in email HTML')
  return m[1]!
}

export async function inboxExists(): Promise<boolean> {
  try {
    const s = await stat(INBOX_DIR)
    return s.isDirectory()
  } catch {
    return false
  }
}
