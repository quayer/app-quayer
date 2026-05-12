/**
 * POST /api/transcribe
 *
 * Receives an audio blob (multipart/form-data, field "audio") and returns
 * { text: string } after transcribing via OpenAI Whisper.
 *
 * Consumed by src/client/hooks/use-speech-to-text.ts for browsers without
 * native Web Speech API (Safari, Firefox). The hook posts ~2s chunks for
 * live interim updates and a final full recording on stop.
 */

import { NextRequest, NextResponse } from 'next/server'

export const runtime = 'nodejs'

const WHISPER_API_URL = 'https://api.openai.com/v1/audio/transcriptions'
const MAX_BYTES = 25 * 1024 * 1024 // 25 MB — Whisper hard limit

/** Maps BCP-47 / ISO-639-1 tags to the lowercase ISO-639-1 Whisper expects. */
function normaliseLanguage(lang: string): string {
  // Take only the primary subtag (e.g. "pt-BR" → "pt", "en-US" → "en")
  return lang.split('-')[0]!.toLowerCase()
}

/** Derives a safe file extension from a MIME type for the Whisper payload. */
function pickExtension(mimeType: string): string {
  if (mimeType.includes('mp3') || mimeType.includes('mpeg')) return 'mp3'
  if (mimeType.includes('wav')) return 'wav'
  if (mimeType.includes('m4a') || mimeType.includes('mp4')) return 'm4a'
  if (mimeType.includes('ogg')) return 'ogg'
  return 'webm' // default — browsers prefer audio/webm;codecs=opus
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  // ── Auth ──────────────────────────────────────────────────────────────────
  const userId = request.headers.get('x-user-id')
  if (!userId) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }

  // ── Config ────────────────────────────────────────────────────────────────
  const apiKey = process.env.OPENAI_API_KEY
  if (!apiKey) {
    return NextResponse.json(
      { error: 'transcription_not_configured' },
      { status: 503 },
    )
  }

  // ── Parse multipart body ──────────────────────────────────────────────────
  let formData: FormData
  try {
    formData = await request.formData()
  } catch {
    return NextResponse.json({ error: 'invalid_multipart_body' }, { status: 400 })
  }

  const audioField = formData.get('audio')
  if (!(audioField instanceof File)) {
    return NextResponse.json({ error: 'missing_audio_field' }, { status: 400 })
  }

  // ── Size guard ────────────────────────────────────────────────────────────
  if (audioField.size > MAX_BYTES) {
    return NextResponse.json({ error: 'audio_too_large' }, { status: 413 })
  }

  // ── Language ──────────────────────────────────────────────────────────────
  const rawLang = formData.get('lang')
  const language =
    typeof rawLang === 'string' && rawLang.trim()
      ? normaliseLanguage(rawLang.trim())
      : 'pt'

  // ── Build Whisper payload ─────────────────────────────────────────────────
  const mimeType = audioField.type.split(';')[0]!
  const extension = pickExtension(mimeType)
  const fileName = audioField.name || `recording.${extension}`

  const whisperForm = new FormData()
  whisperForm.append('file', audioField, fileName)
  whisperForm.append('model', 'whisper-1')
  whisperForm.append('response_format', 'json')
  whisperForm.append('language', language)

  // ── Call Whisper ──────────────────────────────────────────────────────────
  let whisperRes: Response
  try {
    whisperRes = await fetch(WHISPER_API_URL, {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}` },
      body: whisperForm,
    })
  } catch {
    return NextResponse.json({ error: 'transcription_network_error' }, { status: 502 })
  }

  if (!whisperRes.ok) {
    console.warn(`[transcribe] Whisper API error: ${whisperRes.status}`)
    return NextResponse.json({ error: 'transcription_failed' }, { status: 502 })
  }

  const result = (await whisperRes.json()) as { text?: string }
  const text = (result.text ?? '').trim()

  return NextResponse.json({ text })
}
