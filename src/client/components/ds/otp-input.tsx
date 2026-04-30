'use client'

import * as React from 'react'

export interface OtpInputProps {
  length?: number
  value: string
  onChange: (value: string) => void
  onComplete?: (value: string) => void
  disabled?: boolean
  className?: string
  ariaLabel?: string
}

const DIGIT_RE = /^\d$/

export function OtpInput({
  length = 6,
  value,
  onChange,
  onComplete,
  disabled = false,
  className = '',
}: OtpInputProps): React.ReactElement {
  const inputsRef = React.useRef<Array<HTMLInputElement | null>>([])

  const slots = React.useMemo<string[]>(() => {
    const arr = new Array<string>(length).fill('')
    for (let i = 0; i < length && i < value.length; i += 1) {
      arr[i] = value[i] ?? ''
    }
    return arr
  }, [length, value])

  const setSlotRef = React.useCallback(
    (index: number) => (el: HTMLInputElement | null) => {
      inputsRef.current[index] = el
    },
    [],
  )

  const focusSlot = (index: number): void => {
    const el = inputsRef.current[index]
    if (el) {
      el.focus()
      el.select()
    }
  }

  const emit = (next: string): void => {
    onChange(next)
    if (next.length === length && next.split('').every((c) => DIGIT_RE.test(c))) {
      onComplete?.(next)
    }
  }

  const handleChange = (
    index: number,
    e: React.ChangeEvent<HTMLInputElement>,
  ): void => {
    const raw = e.target.value
    const digit = raw.slice(-1)
    if (digit && !DIGIT_RE.test(digit)) {
      return
    }
    const arr = slots.slice()
    arr[index] = digit
    const next = arr.join('').slice(0, length)
    emit(next)
    if (digit && index < length - 1) {
      focusSlot(index + 1)
    }
  }

  const handleKeyDown = (
    index: number,
    e: React.KeyboardEvent<HTMLInputElement>,
  ): void => {
    if (e.key === 'Backspace') {
      if (slots[index]) {
        const arr = slots.slice()
        arr[index] = ''
        emit(arr.join(''))
        return
      }
      if (index > 0) {
        const arr = slots.slice()
        arr[index - 1] = ''
        emit(arr.join(''))
        focusSlot(index - 1)
      }
    } else if (e.key === 'ArrowLeft' && index > 0) {
      e.preventDefault()
      focusSlot(index - 1)
    } else if (e.key === 'ArrowRight' && index < length - 1) {
      e.preventDefault()
      focusSlot(index + 1)
    }
  }

  const handlePaste = (e: React.ClipboardEvent<HTMLInputElement>): void => {
    const pasted = e.clipboardData.getData('text').replace(/\s+/g, '')
    if (pasted.length === length && pasted.split('').every((c) => DIGIT_RE.test(c))) {
      e.preventDefault()
      emit(pasted)
      focusSlot(length - 1)
    }
  }

  return (
    <div
      role="group"
      aria-label={`One-time code, ${length} digits`}
      className={['flex gap-2', className].filter(Boolean).join(' ')}
    >
      {slots.map((digit, i) => (
        <input
          key={i}
          ref={setSlotRef(i)}
          type="text"
          inputMode="numeric"
          pattern="[0-9]*"
          maxLength={1}
          value={digit}
          disabled={disabled}
          autoComplete={i === 0 ? 'one-time-code' : 'off'}
          aria-label={`Digit ${i + 1} of ${length}`}
          onChange={(e) => handleChange(i, e)}
          onKeyDown={(e) => handleKeyDown(i, e)}
          onPaste={handlePaste}
          onFocus={(e) => e.currentTarget.select()}
          className="h-12 w-10 text-center text-ds-lg bg-ds-surface text-ds-fg border border-ds-border rounded-ds-md focus:outline-none focus-visible:ring-2 focus-visible:ring-ds-p-500"
        />
      ))}
    </div>
  )
}
