"use client"

import { useCallback, useEffect, useRef, useState } from "react"

export interface UseSpeechToTextOptions {
  lang?: string
  onFinalTranscript?: (text: string) => void
  onInterimTranscript?: (text: string) => void
}

export interface UseSpeechToTextResult {
  isSupported: boolean
  isListening: boolean
  isTranscribing: boolean
  error: string | null
  start: () => void
  stop: () => void
}

interface SpeechRecognitionEvent extends Event {
  resultIndex: number
  results: {
    length: number
    [i: number]: { isFinal: boolean; [j: number]: { transcript: string } }
  }
}
interface SpeechRecognitionErrorEvent extends Event { error: string }
interface SpeechRecognition extends EventTarget {
  continuous: boolean; interimResults: boolean; lang: string
  start(): void; stop(): void; abort(): void
  onresult: ((e: SpeechRecognitionEvent) => void) | null
  onerror: ((e: SpeechRecognitionErrorEvent) => void) | null
  onend: (() => void) | null
}
type SpeechRecognitionCtor = new () => SpeechRecognition

const PERIODIC_INTERVAL_MS = 2000 // send chunk to Whisper every 2s when Web Speech unavailable

async function whisperTranscribe(chunks: Blob[], mimeType: string): Promise<string | null> {
  const blob = new Blob(chunks, { type: mimeType })
  if (blob.size < 1000) return null // too short to bother

  const cleanType = mimeType.split(";")[0]!
  const ext = cleanType.split("/")[1]!
  const file = new File([blob], `rec.${ext}`, { type: cleanType })
  const form = new FormData()
  form.append("audio", file)

  const res = await fetch("/api/transcribe", { method: "POST", body: form })
  const json = (await res.json()) as { text?: string; error?: string }
  return res.ok && json.text ? json.text : null
}

/**
 * Hybrid speech-to-text with two streaming paths:
 *
 * Path A — Web Speech API (Chrome/Edge):
 *   Real-time interim text while speaking. If it fails with "network"
 *   error (common on localhost), silently switches to Path B.
 *
 * Path B — Periodic Whisper (all browsers):
 *   Sends all accumulated audio to /api/transcribe every 3 s.
 *   Whisper returns the full transcript so far → text updates progressively.
 *   Final stop also sends to Whisper for the complete result.
 */
export function useSpeechToText({
  lang = "pt-BR",
  onFinalTranscript,
  onInterimTranscript,
}: UseSpeechToTextOptions = {}): UseSpeechToTextResult {
  const [isSupported, setIsSupported] = useState(false)
  const [isListening, setIsListening] = useState(false)
  const [isTranscribing, setIsTranscribing] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => { setIsSupported(!!navigator.mediaDevices?.getUserMedia) }, [])

  const onFinalRef = useRef(onFinalTranscript)
  const onInterimRef = useRef(onInterimTranscript)
  useEffect(() => { onFinalRef.current = onFinalTranscript }, [onFinalTranscript])
  useEffect(() => { onInterimRef.current = onInterimTranscript }, [onInterimTranscript])

  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const chunksRef = useRef<Blob[]>([])
  const streamRef = useRef<MediaStream | null>(null)
  const mimeTypeRef = useRef("audio/webm")

  const recognitionRef = useRef<SpeechRecognition | null>(null)
  const webSpeechActiveRef = useRef(false) // true = Web Speech is delivering results
  const webSpeechFinalRef = useRef("") // accumulated final text from Web Speech this session
  const periodicTimerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const periodicBusyRef = useRef(false)

  const stopPeriodic = useCallback(() => {
    if (periodicTimerRef.current) {
      clearInterval(periodicTimerRef.current)
      periodicTimerRef.current = null
    }
  }, [])

  const startPeriodic = useCallback((mimeType: string) => {
    stopPeriodic()
    periodicTimerRef.current = setInterval(async () => {
      if (periodicBusyRef.current || webSpeechActiveRef.current) return
      if (chunksRef.current.length === 0) return

      periodicBusyRef.current = true
      try {
        const text = await whisperTranscribe([...chunksRef.current], mimeType)
        if (text) onInterimRef.current?.(text)
      } catch { /* ignore */ } finally {
        periodicBusyRef.current = false
      }
    }, PERIODIC_INTERVAL_MS)
  }, [stopPeriodic])

  const start = useCallback(async () => {
    if (isListening || isTranscribing) return
    setError(null)
    webSpeechActiveRef.current = false
    webSpeechFinalRef.current = ""

    // ── MediaRecorder ─────────────────────────────────────────────
    let stream: MediaStream
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true })
    } catch (err) {
      const name = (err as { name?: string })?.name ?? ""
      setError(
        name === "NotAllowedError" || name === "PermissionDeniedError"
          ? "Permissão de microfone negada."
          : name === "NotFoundError"
            ? "Microfone não encontrado."
            : "Erro ao acessar microfone.",
      )
      return
    }

    streamRef.current = stream
    chunksRef.current = []

    const mimeType = MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
      ? "audio/webm;codecs=opus"
      : MediaRecorder.isTypeSupported("audio/ogg;codecs=opus")
        ? "audio/ogg;codecs=opus"
        : "audio/webm"
    mimeTypeRef.current = mimeType

    const recorder = new MediaRecorder(stream, { mimeType })
    mediaRecorderRef.current = recorder

    recorder.ondataavailable = (e) => {
      if (e.data.size > 0) chunksRef.current.push(e.data)
    }

    recorder.onstop = async () => {
      stopPeriodic()
      streamRef.current?.getTracks().forEach((t) => t.stop())
      streamRef.current = null

      // If Web Speech delivered results, emit final and we're done
      if (webSpeechActiveRef.current) {
        const final = webSpeechFinalRef.current.trim()
        if (final) onFinalRef.current?.(final)
        setIsListening(false)
        return
      }

      // Final Whisper transcription
      setIsTranscribing(true)
      try {
        const text = await whisperTranscribe(chunksRef.current, mimeType)
        chunksRef.current = []
        if (text) onFinalRef.current?.(text)
        else setError("Nenhum texto detectado.")
      } catch {
        setError("Erro ao transcrever áudio.")
      } finally {
        setIsListening(false)
        setIsTranscribing(false)
      }
    }

    recorder.start(100)

    // Periodic Whisper runs immediately — always-on fallback.
    // Web Speech (if working) will call stopPeriodic() when it delivers results.
    startPeriodic(mimeType)

    // ── Web Speech API (Path A — real-time, Chrome/Edge) ──────────
    const Ctor = (
      (window as unknown as Record<string, unknown>).SpeechRecognition ??
      (window as unknown as Record<string, unknown>).webkitSpeechRecognition
    ) as SpeechRecognitionCtor | undefined

    if (Ctor) {
      const recognition = new Ctor()
      recognition.continuous = true
      recognition.interimResults = true
      recognition.lang = lang

      recognition.onresult = (event: SpeechRecognitionEvent) => {
        let interim = ""
        for (let i = event.resultIndex; i < event.results.length; i++) {
          const r = event.results[i]!
          const t = r[0]!.transcript
          if (r.isFinal) webSpeechFinalRef.current += t
          else interim += t
        }
        webSpeechActiveRef.current = true
        stopPeriodic() // Web Speech is working — no need for periodic Whisper
        const full = (webSpeechFinalRef.current + interim).trim()
        if (full) onInterimRef.current?.(full)
      }

      recognition.onerror = (event: SpeechRecognitionErrorEvent) => {
        if (event.error === "not-allowed") {
          setError("Permissão de microfone negada.")
        }
        // Any error: Web Speech is dead, periodic Whisper is already running
        recognitionRef.current = null
      }

      recognition.onend = () => {
        const rec = recognitionRef.current
        if (!rec || mediaRecorderRef.current?.state !== "recording") return
        if (webSpeechActiveRef.current) {
          // Web Speech is delivering results — keep it alive
          try { rec.start() } catch { /* ignore */ }
        } else {
          // Ended without results — periodic Whisper already running
          recognitionRef.current = null
        }
      }

      recognitionRef.current = recognition
      try { recognition.start() } catch { /* periodic already running */ }
    }

    setIsListening(true)
  }, [isListening, isTranscribing, lang, startPeriodic, stopPeriodic])

  const stop = useCallback(() => {
    const rec = recognitionRef.current
    if (rec) {
      rec.onend = null
      try { rec.abort() } catch { /* ignore */ }
      recognitionRef.current = null
    }
    stopPeriodic()
    const mr = mediaRecorderRef.current
    if (mr && mr.state !== "inactive") mr.stop()
  }, [stopPeriodic])

  return { isSupported, isListening, isTranscribing, error, start, stop }
}
