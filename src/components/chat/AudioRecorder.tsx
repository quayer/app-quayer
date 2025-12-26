'use client'

import { useState, useCallback, useRef } from 'react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { Mic, MicOff, Square, Send, Trash2, Pause, Play, Loader2, Volume2 } from 'lucide-react'
import { useAudioRecorder, formatDuration, audioToBase64 } from '@/hooks/useAudioRecorder'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'

interface AudioRecorderProps {
  onSend: (audioBase64: string, mimeType: string, duration: number) => Promise<void>
  disabled?: boolean
  className?: string
}

/**
 * Audio recording component for chat messages
 *
 * Features:
 * - Start/stop recording
 * - Visual feedback with duration
 * - Send or cancel recording
 * - WhatsApp-compatible audio format
 */
export function AudioRecorder({ onSend, disabled, className }: AudioRecorderProps) {
  const [isSending, setIsSending] = useState(false)
  const [isPlaying, setIsPlaying] = useState(false)
  const audioRef = useRef<HTMLAudioElement>(null)

  const {
    isRecording,
    isPaused,
    duration,
    audioBlob,
    audioUrl,
    error,
    startRecording,
    stopRecording,
    pauseRecording,
    resumeRecording,
    cancelRecording,
    resetRecording,
  } = useAudioRecorder()

  const handleStartRecording = useCallback(async () => {
    await startRecording()
  }, [startRecording])

  const handleStopRecording = useCallback(async () => {
    await stopRecording()
  }, [stopRecording])

  const handleSendAudio = useCallback(async () => {
    if (!audioBlob) return

    setIsSending(true)
    try {
      const base64 = await audioToBase64(audioBlob)
      const mimeType = audioBlob.type || 'audio/webm;codecs=opus'
      await onSend(base64, mimeType, duration)
      resetRecording()
    } catch (error) {
      console.error('[AudioRecorder] Error sending audio:', error)
    } finally {
      setIsSending(false)
    }
  }, [audioBlob, duration, onSend, resetRecording])

  const handleCancel = useCallback(() => {
    if (isRecording) {
      cancelRecording()
    } else {
      resetRecording()
    }
    setIsPlaying(false)
  }, [isRecording, cancelRecording, resetRecording])

  // Toggle audio preview playback
  const handleTogglePlay = useCallback(() => {
    if (!audioRef.current) return

    if (isPlaying) {
      audioRef.current.pause()
      setIsPlaying(false)
    } else {
      audioRef.current.play()
      setIsPlaying(true)
    }
  }, [isPlaying])

  // Handle audio ended
  const handleAudioEnded = useCallback(() => {
    setIsPlaying(false)
  }, [])

  // Error state
  if (error) {
    return (
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              disabled
              className={cn('text-destructive', className)}
            >
              <MicOff className="h-5 w-5" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>
            <p>{error}</p>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    )
  }

  // Recording state
  if (isRecording) {
    return (
      <div className={cn('flex items-center gap-2', className)}>
        {/* Recording indicator */}
        <div className="flex items-center gap-2 px-3 py-1.5 bg-red-500/10 rounded-full border border-red-500/30">
          <span className="animate-pulse">
            <span className="inline-block w-2 h-2 rounded-full bg-red-500" />
          </span>
          <span className="text-sm font-medium text-red-600 tabular-nums">
            {formatDuration(duration)}
          </span>
        </div>

        {/* Pause/Resume button */}
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                onClick={isPaused ? resumeRecording : pauseRecording}
                className="h-8 w-8"
              >
                {isPaused ? (
                  <Play className="h-4 w-4" />
                ) : (
                  <Pause className="h-4 w-4" />
                )}
              </Button>
            </TooltipTrigger>
            <TooltipContent>
              <p>{isPaused ? 'Continuar' : 'Pausar'}</p>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>

        {/* Stop/Send button */}
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="default"
                size="icon"
                onClick={handleStopRecording}
                className="h-8 w-8 bg-red-500 hover:bg-red-600"
              >
                <Square className="h-4 w-4 fill-current" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>
              <p>Parar gravacao</p>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>

        {/* Cancel button */}
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                onClick={handleCancel}
                className="h-8 w-8 text-muted-foreground hover:text-destructive"
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>
              <p>Cancelar</p>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      </div>
    )
  }

  // Preview/Ready to send state
  if (audioBlob && audioUrl) {
    return (
      <div className={cn('flex items-center gap-2', className)}>
        {/* Hidden audio element for playback */}
        <audio
          ref={audioRef}
          src={audioUrl}
          onEnded={handleAudioEnded}
          className="hidden"
        />

        {/* Audio preview with play button */}
        <div className="flex items-center gap-2 px-3 py-1.5 bg-primary/10 rounded-full border border-primary/30">
          {/* Play/Pause preview button */}
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={handleTogglePlay}
                  disabled={isSending}
                  className="h-6 w-6 p-0 hover:bg-primary/20"
                >
                  {isPlaying ? (
                    <Pause className="h-4 w-4 text-primary" />
                  ) : (
                    <Play className="h-4 w-4 text-primary" />
                  )}
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                <p>{isPlaying ? 'Pausar' : 'Ouvir'}</p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>

          <Volume2 className="h-3.5 w-3.5 text-primary/70" />
          <span className="text-sm font-medium text-primary tabular-nums">
            {formatDuration(duration)}
          </span>
        </div>

        {/* Send button */}
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="default"
                size="icon"
                onClick={handleSendAudio}
                disabled={isSending}
                className="h-8 w-8"
              >
                {isSending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Send className="h-4 w-4" />
                )}
              </Button>
            </TooltipTrigger>
            <TooltipContent>
              <p>Enviar audio</p>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>

        {/* Cancel button */}
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                onClick={handleCancel}
                disabled={isSending}
                className="h-8 w-8 text-muted-foreground hover:text-destructive"
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>
              <p>Descartar</p>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      </div>
    )
  }

  // Default state - microphone button
  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            onClick={handleStartRecording}
            disabled={disabled}
            className={cn('h-9 w-9', className)}
          >
            <Mic className="h-5 w-5" />
          </Button>
        </TooltipTrigger>
        <TooltipContent>
          <p>Gravar audio</p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  )
}

export default AudioRecorder
