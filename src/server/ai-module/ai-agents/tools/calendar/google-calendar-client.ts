/**
 * Google Calendar REST client (server-side, agent runtime).
 *
 * Thin wrapper over the Calendar v3 REST API used by the calendar builtin
 * tools (check_availability / create_event / cancel_event). It receives an
 * already-fresh access token from
 * `resolveCalendarAccess` (src/lib/calendar/calendar-credential-resolver.ts) —
 * it does NOT touch OAuth, refresh, or credential storage itself.
 *
 * Kept inside the tools folder (ownership: this agent) so the lib client
 * (src/lib/calendar) stays focused on OAuth + credential resolution.
 *
 * No googleapis SDK dependency — plain fetch, matching the project convention
 * in src/lib/calendar/google-calendar-oauth.ts.
 */

const CALENDAR_API = 'https://www.googleapis.com/calendar/v3'

// ---------------------------------------------------------------------------
// Low-level fetch helper
// ---------------------------------------------------------------------------

async function calendarFetch<T>(
  accessToken: string,
  path: string,
  init?: RequestInit,
): Promise<T> {
  const res = await fetch(`${CALENDAR_API}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
      ...(init?.headers ?? {}),
    },
  })

  if (!res.ok) {
    let detail = ''
    try {
      const body = (await res.json()) as { error?: { message?: string } }
      detail = body?.error?.message ? ` — ${body.error.message}` : ''
    } catch {
      // non-JSON error body; ignore
    }
    throw new Error(`[GoogleCalendar] HTTP ${res.status}${detail}`)
  }

  // 204 No Content (e.g. events.delete) — nothing to parse.
  if (res.status === 204) return undefined as T
  return (await res.json()) as T
}

// ---------------------------------------------------------------------------
// freebusy.query — busy intervals for a calendar in a window
// ---------------------------------------------------------------------------

export interface FreeBusyInterval {
  start: string // RFC3339
  end: string // RFC3339
}

interface FreeBusyResponse {
  calendars?: Record<string, { busy?: FreeBusyInterval[]; errors?: unknown[] }>
}

/**
 * Returns the BUSY intervals for `calendarId` between timeMin and timeMax.
 * Free slots are the complement of these intervals within the window.
 */
export async function queryFreeBusy(
  accessToken: string,
  calendarId: string,
  timeMin: string,
  timeMax: string,
  timeZone?: string,
): Promise<FreeBusyInterval[]> {
  const data = await calendarFetch<FreeBusyResponse>(accessToken, '/freeBusy', {
    method: 'POST',
    body: JSON.stringify({
      timeMin,
      timeMax,
      ...(timeZone ? { timeZone } : {}),
      items: [{ id: calendarId }],
    }),
  })

  return data.calendars?.[calendarId]?.busy ?? []
}

// ---------------------------------------------------------------------------
// events.insert — create an event, optionally with a Google Meet link
// ---------------------------------------------------------------------------

export interface CreatedEvent {
  id: string
  htmlLink?: string
  hangoutLink?: string
  status?: string
  start?: { dateTime?: string; date?: string; timeZone?: string }
  end?: { dateTime?: string; date?: string; timeZone?: string }
}

export interface CreateEventArgs {
  summary: string
  description?: string
  startDateTime: string // RFC3339
  endDateTime: string // RFC3339
  timeZone?: string
  attendeeEmails?: string[]
  /** When true, requests a Google Meet conference for the event. */
  withMeet?: boolean
}

/**
 * Inserts an event into `calendarId`. When `withMeet` is true, requests a
 * Hangouts Meet conference (requires conferenceDataVersion=1).
 */
export async function insertEvent(
  accessToken: string,
  calendarId: string,
  args: CreateEventArgs,
): Promise<CreatedEvent> {
  const body: Record<string, unknown> = {
    summary: args.summary,
    ...(args.description ? { description: args.description } : {}),
    start: { dateTime: args.startDateTime, ...(args.timeZone ? { timeZone: args.timeZone } : {}) },
    end: { dateTime: args.endDateTime, ...(args.timeZone ? { timeZone: args.timeZone } : {}) },
    ...(args.attendeeEmails && args.attendeeEmails.length > 0
      ? { attendees: args.attendeeEmails.map((email) => ({ email })) }
      : {}),
  }

  if (args.withMeet) {
    body.conferenceData = {
      createRequest: {
        requestId: `meet_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`,
        conferenceSolutionKey: { type: 'hangoutsMeet' },
      },
    }
  }

  const query = new URLSearchParams()
  if (args.withMeet) query.set('conferenceDataVersion', '1')
  if (args.attendeeEmails && args.attendeeEmails.length > 0) query.set('sendUpdates', 'all')
  const qs = query.toString()

  return calendarFetch<CreatedEvent>(
    accessToken,
    `/calendars/${encodeURIComponent(calendarId)}/events${qs ? `?${qs}` : ''}`,
    { method: 'POST', body: JSON.stringify(body) },
  )
}

// ---------------------------------------------------------------------------
// events.delete — cancel an event by id
// ---------------------------------------------------------------------------

/**
 * Deletes (cancels) an event by id. Returns true on success.
 * Notifies attendees (sendUpdates=all).
 */
export async function deleteEvent(
  accessToken: string,
  calendarId: string,
  eventId: string,
): Promise<void> {
  await calendarFetch<void>(
    accessToken,
    `/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(eventId)}?sendUpdates=all`,
    { method: 'DELETE' },
  )
}
