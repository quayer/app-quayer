"use client"

import React, { useEffect, useRef } from "react"

export interface AudioWaveformProps {
  analyser: AnalyserNode | null
  bars?: number
  color?: string
  className?: string
}

export function AudioWaveform({
  analyser,
  bars = 3,
  color = "currentColor",
  className,
}: AudioWaveformProps): React.JSX.Element | null {
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!analyser) return
    const container = containerRef.current
    if (!container) return

    const barEls = Array.from(container.children) as HTMLElement[]
    const data = new Uint8Array(analyser.frequencyBinCount)
    const step = Math.floor(data.length / bars) || 1
    let raf = 0

    const tick = () => {
      analyser.getByteFrequencyData(data)
      for (let i = 0; i < bars; i++) {
        const slice = data.subarray(i * step, (i + 1) * step)
        let sum = 0
        for (let j = 0; j < slice.length; j++) sum += slice[j]!
        const avg = sum / slice.length / 255
        const height = Math.max(20, Math.min(100, avg * 130))
        const el = barEls[i]
        if (el) el.style.height = `${height}%`
      }
      raf = requestAnimationFrame(tick)
    }

    tick()

    return () => cancelAnimationFrame(raf)
  }, [analyser, bars])

  if (!analyser) return null

  return (
    <div
      ref={containerRef}
      className={`flex items-center gap-0.5 h-4 ${className ?? ""}`}
      aria-hidden
    >
      {Array.from({ length: bars }).map((_, i) => (
        <span
          key={i}
          className="w-0.5 rounded-full transition-[height] duration-75"
          style={{ height: "20%", backgroundColor: color }}
        />
      ))}
    </div>
  )
}
