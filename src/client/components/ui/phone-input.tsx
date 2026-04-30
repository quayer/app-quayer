"use client"

import React, { useRef } from "react"
import {
  usePhoneInput,
  CountrySelector,
  defaultCountries,
  parseCountry,
} from "react-international-phone"
import "react-international-phone/style.css"
import { cn } from "@/lib/utils"

export interface CountryInfo {
  flag: string
  name: string
}

const DEFAULT_COUNTRY: CountryInfo = { flag: '🇧🇷', name: 'Brasil' }

/**
 * detectCountry — kept for backward compatibility with login-otp-form.tsx and others.
 * Uses react-international-phone's parseCountry to look up by dial code.
 */
export function detectCountry(value: string): CountryInfo {
  if (!value) return DEFAULT_COUNTRY

  const clean = value.replace(/^\+/, '').replace(/\D/g, '')
  if (!clean) return DEFAULT_COUNTRY

  // Try to find a matching country by dial code (try 3, 2, 1 digit prefixes)
  for (const len of [3, 2, 1]) {
    const dialCode = clean.slice(0, len)
    const match = defaultCountries.find((c) => {
      const parsed = parseCountry(c)
      return parsed.dialCode === dialCode
    })
    if (match) {
      const parsed = parseCountry(match)
      return {
        flag: parsed.name ? '' : '',  // emoji flag not easily available from library
        name: parsed.name,
      }
    }
  }

  return DEFAULT_COUNTRY
}

export interface PhoneInputProps {
  value: string
  onChange: (value: string) => void
  disabled?: boolean
  autoFocus?: boolean
  placeholder?: string
  className?: string
  id?: string
  name?: string
  autoComplete?: string
}

export const PhoneInput = React.forwardRef<HTMLInputElement, PhoneInputProps>(
  function PhoneInput(
    {
      value,
      onChange,
      disabled,
      autoFocus,
      placeholder,
      className,
      id,
      name,
      autoComplete,
    },
    ref
  ) {
    const inputRef = useRef<HTMLInputElement | null>(null)

    const { inputValue, country, setCountry, handlePhoneValueChange } =
      usePhoneInput({
        defaultCountry: "br",
        value,
        countries: defaultCountries,
        forceDialCode: true,
        onChange: ({ phone: newPhone }) => {
          onChange(newPhone)
        },
        inputRef,
      })

    // Merge the forwarded ref with our local ref
    const setRefs = (el: HTMLInputElement | null) => {
      // Update local ref
      ;(inputRef as React.MutableRefObject<HTMLInputElement | null>).current = el
      // Update forwarded ref
      if (typeof ref === "function") {
        ref(el)
      } else if (ref) {
        ;(ref as React.MutableRefObject<HTMLInputElement | null>).current = el
      }
    }

    return (
      <div className={cn("relative flex", className)}>
        {/* Country selector dropdown */}
        <CountrySelector
          selectedCountry={country.iso2}
          onSelect={(c) => setCountry(c.iso2)}
          disabled={disabled}
          buttonClassName={cn(
            "h-9 rounded-l-md border border-input bg-transparent px-2 flex items-center gap-1 shrink-0",
            "hover:bg-accent hover:text-accent-foreground",
            "focus:outline-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px]",
            "disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50",
            "border-r-0 rounded-r-none"
          )}
        />
        {/* Phone input */}
        <input
          ref={setRefs}
          id={id}
          name={name}
          type="tel"
          inputMode="tel"
          placeholder={placeholder ?? "(11) 99999-9999"}
          value={inputValue}
          onChange={handlePhoneValueChange}
          disabled={disabled}
          autoFocus={autoFocus}
          autoComplete={autoComplete}
          className={cn(
            "file:text-foreground placeholder:text-muted-foreground selection:bg-primary selection:text-primary-foreground dark:bg-input/30 border-input h-9 w-full min-w-0 rounded-r-md border border-l-0 bg-transparent px-3 py-1 text-base shadow-xs transition-[color,box-shadow] outline-none file:inline-flex file:h-7 file:border-0 file:bg-transparent file:text-sm file:font-medium disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50 md:text-sm",
            "focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px]",
            "aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive"
          )}
        />
      </div>
    )
  }
)

PhoneInput.displayName = "PhoneInput"

