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
  analyser: AnalyserNode | null
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

const PERIODIC_INTERVAL_MS = 2000

async function whisperTranscribe(chunks: Blob[], mimeType: string, lang: string): Promise<string | null> {
  const blob = new Blob(chunks, { type: mimeType })
  if (blob.size < 500) return null

  const cleanType = mimeType.split(";")[0]!
  const ext = cleanType.split("/")[1]!
  const file = new File([blob], `rec.${ext}`, { type: cleanType })
  const form = new FormData()
  form.append("audio", file)
  form.append("lang", lang)

  const res = await fetch("/api/transcribe", { method: "POST", body: form, credentials: "include" })
  const json = (await res.json()) as { text?: string; error?: string }
  return res.ok && json.text ? json.text : null
}

/**
 * Hybrid speech-to-text — Web Speech + Whisper working together:
 *
 * Path A — Web Speech API (Chrome/Edge):
 *   Real-time interim text while speaking.
 *
 * Path B — Periodic Whisper (all browsers):
 *   Active when Web Speech is unavailable (Brave/Firefox/Safari).
 *   Sends accumulated audio every 2s for progressive updates.
 *
 * Final — Whisper always runs on stop:
 *   Regardless of which path provided interim text, Whisper always
 *   produces the definitive final result for best accuracy.
 *   Falls back to Web Speech text if Whisper returns nothing.
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
  const [analyser, setAnalyser] = useState<AnalyserNode | null>(null)

  useEffect(() => { setIsSupported(!!navigator.mediaDevices?.getUserMedia) }, [])

  const onFinalRef = useRef(onFinalTranscript)
  const onInterimRef = useRef(onInterimTranscript)
  const langRef = useRef(lang)
  useEffect(() => { onFinalRef.current = onFinalTranscript }, [onFinalTranscript])
  useEffect(() => { onInterimRef.current = onInterimTranscript }, [onInterimTranscript])
  useEffect(() => { langRef.current = lang }, [lang])

  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const chunksRef = useRef<Blob[]>([])
  const streamRef = useRef<MediaStream | null>(null)
  const mimeTypeRef = useRef("audio/webm")
  const audioContextRef = useRef<AudioContext | null>(null)

  const recognitionRef = useRef<SpeechRecognition | null>(null)
  const webSpeechActiveRef = useRef(false)
  const webSpeechFinalRef = useRef("")
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
        const text = await whisperTranscribe([...chunksRef.current], mimeType, langRef.current)
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

    try {
      const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
      const audioContext = new AudioCtx()
      if (audioContext.state === "suspended") await audioContext.resume()
      const source = audioContext.createMediaStreamSource(stream)
      const node = audioContext.createAnalyser()
      node.fftSize = 64
      node.smoothingTimeConstant = 0.7
      source.connect(node)
      audioContextRef.current = audioContext
      setAnalyser(node)
    } catch {
      setAnalyser(null)
    }

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

      if (audioContextRef.current) {
        try { await audioContextRef.current.close() } catch { /* ignore */ }
        audioContextRef.current = null
      }
      setAnalyser(null)

      // Whisper always runs for the definitive final result.
      // Web Speech interim text is already visible in the textarea.
      // If Whisper returns nothing, fall back to what Web Speech accumulated.
      setIsTranscribing(true)
      try {
        const text = await whisperTranscribe(chunksRef.current, mimeType, langRef.current)
        chunksRef.current = []
        if (text) {
          onFinalRef.current?.(text)
        } else {
          const webFinal = webSpeechFinalRef.current.trim()
          if (webFinal) onFinalRef.current?.(webFinal)
          else setError("Nenhum texto detectado.")
        }
      } catch {
        const webFinal = webSpeechFinalRef.current.trim()
        if (webFinal) onFinalRef.current?.(webFinal)
        else setError("Erro ao transcrever áudio.")
      } finally {
        setIsListening(false)
        setIsTranscribing(false)
      }
    }

    recorder.start(100)
    startPeriodic(mimeType)

    // ── Web Speech API (Path A — real-time interim, Chrome/Edge) ──
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
        stopPeriodic() // Web Speech handling interim — pause periodic Whisper
        const full = (webSpeechFinalRef.current + interim).trim()
        if (full) onInterimRef.current?.(full)
      }

      recognition.onerror = (event: SpeechRecognitionErrorEvent) => {
        if (event.error === "not-allowed") setError("Permissão de microfone negada.")
        // Web Speech dead — re-enable periodic Whisper for interim
        if (!webSpeechActiveRef.current) startPeriodic(mimeTypeRef.current)
        recognitionRef.current = null
      }

      recognition.onend = () => {
        const rec = recognitionRef.current
        if (!rec || mediaRecorderRef.current?.state !== "recording") return
        if (webSpeechActiveRef.current) {
          try { rec.start() } catch { /* ignore */ }
        } else {
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

  return { isSupported, isListening, isTranscribing, error, analyser, start, stop }
}
