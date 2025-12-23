'use client'

import { useState, useCallback } from 'react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { Mic, MicOff, Square, Send, Trash2, Pause, Play, Loader2 } from 'lucide-react'
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
  }, [isRecording, cancelRecording, resetRecording])

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
        {/* Audio preview */}
        <div className="flex items-center gap-2 px-3 py-1.5 bg-primary/10 rounded-full border border-primary/30">
          <Mic className="h-4 w-4 text-primary" />
          <span className="text-sm font-medium text-primary tabular-nums">
            {formatDuration(duration)}
          </span>
        </div>

        {/* Play preview button */}
        <audio src={audioUrl} controls className="hidden" />

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
