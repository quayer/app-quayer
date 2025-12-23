'use client'

import { useState, useRef, useCallback, useEffect } from 'react'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import {
  Popover,
  PopoverContent,
  PopoverAnchor,
} from '@/components/ui/popover'
import { Loader2, Sparkles, Send } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useDebounce } from '@/hooks/useDebounce'
import { useMutation } from '@tanstack/react-query'
import { api } from '@/igniter.client'

interface AISuggestion {
  id: string
  text: string
  completion: string
}

interface AIMessageInputProps {
  value: string
  onChange: (value: string) => void
  onSend: () => void
  disabled?: boolean
  placeholder?: string
  conversationContext?: string[]
  aiEnabled?: boolean
  className?: string
}

const MIN_CHARS = 3
const DEBOUNCE_MS = 500

export function AIMessageInput({
  value,
  onChange,
  onSend,
  disabled,
  placeholder = 'Digite uma mensagem...',
  conversationContext = [],
  aiEnabled = true,
  className,
}: AIMessageInputProps) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [suggestions, setSuggestions] = useState<AISuggestion[]>([])
  const [selectedIndex, setSelectedIndex] = useState(-1)
  const [isOpen, setIsOpen] = useState(false)

  const debouncedValue = useDebounce(value, DEBOUNCE_MS)

  // Mutation para buscar sugestoes
  const suggestionsMutation = useMutation({
    mutationFn: async (input: string) => {
      // Check if AI endpoint exists
      if (!(api as any).ai?.suggestions?.query) {
        return []
      }
      const response = await (api as any).ai.suggestions.query({
        query: {
          input,
          context: conversationContext.slice(-5).join('\n'),
        }
      })
      return (response.data || []) as AISuggestion[]
    },
    onSuccess: (data) => {
      setSuggestions(data)
      setSelectedIndex(-1)
      setIsOpen(data.length > 0)
    },
    onError: () => {
      // Silencioso - nao mostra erro ao usuario
      setSuggestions([])
      setIsOpen(false)
    },
  })

  // Buscar sugestoes quando texto muda
  useEffect(() => {
    if (!aiEnabled || debouncedValue.length < MIN_CHARS) {
      setSuggestions([])
      setIsOpen(false)
      return
    }

    suggestionsMutation.mutate(debouncedValue)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debouncedValue, aiEnabled])

  // Handler de teclado
  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (!isOpen || suggestions.length === 0) {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault()
        onSend()
      }
      return
    }

    switch (e.key) {
      case 'ArrowUp':
        e.preventDefault()
        setSelectedIndex(prev =>
          prev <= 0 ? suggestions.length - 1 : prev - 1
        )
        break

      case 'ArrowDown':
        e.preventDefault()
        setSelectedIndex(prev =>
          prev >= suggestions.length - 1 ? 0 : prev + 1
        )
        break

      case 'Tab':
        e.preventDefault()
        if (selectedIndex >= 0) {
          acceptSuggestion(suggestions[selectedIndex])
        } else if (suggestions.length > 0) {
          acceptSuggestion(suggestions[0])
        }
        break

      case 'Enter':
        if (selectedIndex >= 0) {
          e.preventDefault()
          acceptSuggestion(suggestions[selectedIndex])
        } else {
          e.preventDefault()
          onSend()
        }
        break

      case 'Escape':
        e.preventDefault()
        setIsOpen(false)
        setSelectedIndex(-1)
        break
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, suggestions, selectedIndex, onSend])

  const acceptSuggestion = (suggestion: AISuggestion) => {
    onChange(suggestion.text)
    setIsOpen(false)
    setSuggestions([])
    setSelectedIndex(-1)
    inputRef.current?.focus()
  }

  return (
    <div className={cn("relative flex-1", className)}>
      <Popover open={isOpen} onOpenChange={setIsOpen}>
        <PopoverAnchor asChild>
          <div className="relative">
            <Input
              ref={inputRef}
              value={value}
              onChange={(e) => onChange(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={placeholder}
              disabled={disabled}
              className="pr-10"
            />
            {suggestionsMutation.isPending && (
              <div className="absolute right-3 top-1/2 -translate-y-1/2">
                <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
              </div>
            )}
            {aiEnabled && !suggestionsMutation.isPending && value.length >= MIN_CHARS && (
              <div className="absolute right-3 top-1/2 -translate-y-1/2">
                <Sparkles className="h-4 w-4 text-muted-foreground/50" />
              </div>
            )}
          </div>
        </PopoverAnchor>

        <PopoverContent
          className="w-80 p-0"
          align="start"
          side="top"
          sideOffset={8}
          onOpenAutoFocus={(e) => e.preventDefault()}
        >
          <div className="py-1" role="listbox" aria-label="Sugestoes de mensagem">
            {suggestions.map((suggestion, index) => (
              <button
                key={suggestion.id}
                role="option"
                aria-selected={index === selectedIndex}
                className={cn(
                  "w-full px-3 py-2 text-left text-sm transition-colors",
                  "hover:bg-accent focus:bg-accent focus:outline-none",
                  index === selectedIndex && "bg-accent ring-2 ring-inset ring-primary"
                )}
                onClick={() => acceptSuggestion(suggestion)}
                onMouseEnter={() => setSelectedIndex(index)}
              >
                <span className="text-muted-foreground">{value}</span>
                <span className="text-foreground font-medium">{suggestion.completion}</span>
              </button>
            ))}
          </div>
          <div className="px-3 py-2 border-t bg-muted/50 text-xs text-muted-foreground">
            <kbd className="px-1 py-0.5 bg-background rounded text-[10px]">Tab</kbd>
            {' '}para aceitar · {' '}
            <kbd className="px-1 py-0.5 bg-background rounded text-[10px]">Esc</kbd>
            {' '}para fechar
          </div>
        </PopoverContent>
      </Popover>
    </div>
  )
}
