'use client'

import { useState, useCallback, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import {
  X,
  ChevronLeft,
  ChevronRight,
  Download,
  ZoomIn,
  ZoomOut,
  RotateCw,
} from 'lucide-react'
import { cn } from '@/lib/utils'

interface MediaItem {
  id: string
  url: string
  type: 'image' | 'video' | 'document'
  fileName?: string
  timestamp?: Date
}

interface MediaLightboxProps {
  isOpen: boolean
  onClose: () => void
  media: MediaItem[]
  initialIndex?: number
}

export function MediaLightbox({
  isOpen,
  onClose,
  media,
  initialIndex = 0,
}: MediaLightboxProps) {
  const [currentIndex, setCurrentIndex] = useState(initialIndex)
  const [zoom, setZoom] = useState(1)
  const [rotation, setRotation] = useState(0)

  // Reset state when opening
  useEffect(() => {
    if (isOpen) {
      setCurrentIndex(initialIndex)
      setZoom(1)
      setRotation(0)
    }
  }, [isOpen, initialIndex])

  // Keyboard navigation
  useEffect(() => {
    if (!isOpen) return

    const handleKeyDown = (e: KeyboardEvent) => {
      switch (e.key) {
        case 'Escape':
          onClose()
          break
        case 'ArrowLeft':
          goToPrevious()
          break
        case 'ArrowRight':
          goToNext()
          break
        case '+':
        case '=':
          handleZoomIn()
          break
        case '-':
          handleZoomOut()
          break
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [isOpen, currentIndex])

  const currentMedia = media[currentIndex]

  const goToNext = useCallback(() => {
    setCurrentIndex((prev) => (prev + 1) % media.length)
    setZoom(1)
    setRotation(0)
  }, [media.length])

  const goToPrevious = useCallback(() => {
    setCurrentIndex((prev) => (prev - 1 + media.length) % media.length)
    setZoom(1)
    setRotation(0)
  }, [media.length])

  const handleZoomIn = useCallback(() => {
    setZoom((prev) => Math.min(prev + 0.5, 3))
  }, [])

  const handleZoomOut = useCallback(() => {
    setZoom((prev) => Math.max(prev - 0.5, 0.5))
  }, [])

  const handleRotate = useCallback(() => {
    setRotation((prev) => (prev + 90) % 360)
  }, [])

  const handleDownload = useCallback(async () => {
    if (!currentMedia) return

    try {
      const response = await fetch(currentMedia.url)
      const blob = await response.blob()
      const url = window.URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = currentMedia.fileName || `media-${currentMedia.id}`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      window.URL.revokeObjectURL(url)
    } catch (error) {
      console.error('Error downloading media:', error)
    }
  }, [currentMedia])

  if (!isOpen || !currentMedia) return null

  return (
    <div
      className="fixed inset-0 z-50 bg-black/95 flex flex-col"
      onClick={onClose}
    >
      {/* Header */}
      <div
        className="flex items-center justify-between p-4 text-white"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-4">
          <span className="text-sm text-white/70">
            {currentIndex + 1} de {media.length}
          </span>
          {currentMedia.fileName && (
            <span className="text-sm truncate max-w-[200px]">
              {currentMedia.fileName}
            </span>
          )}
        </div>

        <div className="flex items-center gap-2">
          {/* Zoom controls */}
          <Button
            variant="ghost"
            size="icon"
            className="text-white hover:bg-white/10"
            onClick={handleZoomOut}
            disabled={zoom <= 0.5}
          >
            <ZoomOut className="h-5 w-5" />
          </Button>
          <span className="text-sm w-12 text-center">{Math.round(zoom * 100)}%</span>
          <Button
            variant="ghost"
            size="icon"
            className="text-white hover:bg-white/10"
            onClick={handleZoomIn}
            disabled={zoom >= 3}
          >
            <ZoomIn className="h-5 w-5" />
          </Button>

          {/* Rotate */}
          <Button
            variant="ghost"
            size="icon"
            className="text-white hover:bg-white/10"
            onClick={handleRotate}
          >
            <RotateCw className="h-5 w-5" />
          </Button>

          {/* Download */}
          <Button
            variant="ghost"
            size="icon"
            className="text-white hover:bg-white/10"
            onClick={handleDownload}
          >
            <Download className="h-5 w-5" />
          </Button>

          {/* Close */}
          <Button
            variant="ghost"
            size="icon"
            className="text-white hover:bg-white/10"
            onClick={onClose}
          >
            <X className="h-5 w-5" />
          </Button>
        </div>
      </div>

      {/* Main content */}
      <div
        className="flex-1 flex items-center justify-center relative overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Previous button */}
        {media.length > 1 && (
          <Button
            variant="ghost"
            size="icon"
            className="absolute left-4 text-white hover:bg-white/10 h-12 w-12 z-10"
            onClick={goToPrevious}
          >
            <ChevronLeft className="h-8 w-8" />
          </Button>
        )}

        {/* Media display */}
        <div
          className="max-w-full max-h-full flex items-center justify-center p-8"
          style={{
            transform: `scale(${zoom}) rotate(${rotation}deg)`,
            transition: 'transform 0.2s ease-out',
          }}
        >
          {currentMedia.type === 'image' && (
            <img
              src={currentMedia.url}
              alt={currentMedia.fileName || 'Media'}
              className="max-w-full max-h-[calc(100vh-200px)] object-contain select-none"
              draggable={false}
            />
          )}
          {currentMedia.type === 'video' && (
            <video
              src={currentMedia.url}
              controls
              className="max-w-full max-h-[calc(100vh-200px)]"
            />
          )}
        </div>

        {/* Next button */}
        {media.length > 1 && (
          <Button
            variant="ghost"
            size="icon"
            className="absolute right-4 text-white hover:bg-white/10 h-12 w-12 z-10"
            onClick={goToNext}
          >
            <ChevronRight className="h-8 w-8" />
          </Button>
        )}
      </div>

      {/* Thumbnails */}
      {media.length > 1 && (
        <div
          className="p-4 flex items-center justify-center gap-2 overflow-x-auto"
          onClick={(e) => e.stopPropagation()}
        >
          {media.map((item, index) => (
            <button
              key={item.id}
              onClick={() => {
                setCurrentIndex(index)
                setZoom(1)
                setRotation(0)
              }}
              className={cn(
                'w-16 h-16 rounded-lg overflow-hidden border-2 transition-all flex-shrink-0',
                index === currentIndex
                  ? 'border-white opacity-100'
                  : 'border-transparent opacity-50 hover:opacity-75'
              )}
            >
              {item.type === 'image' && (
                <img
                  src={item.url}
                  alt=""
                  className="w-full h-full object-cover"
                />
              )}
              {item.type === 'video' && (
                <div className="w-full h-full bg-muted flex items-center justify-center">
                  <span className="text-xs">Video</span>
                </div>
              )}
            </button>
          ))}
        </div>
      )}

      {/* Keyboard hint */}
      <div className="absolute bottom-4 left-4 text-white/50 text-xs hidden md:block">
        ← → navegar • + - zoom • Esc fechar
      </div>
    </div>
  )
}

export default MediaLightbox
