'use client'

import { useEffect, useState } from 'react'
import Image from "next/image"
import Link from "next/link"
import { SignupOTPForm } from "@/client/components/auth/signup-otp-form"
import { Button } from "@/client/components/ui/button"
import { Loader2 } from "lucide-react"

export default function SignupVerifyV2Client() {
  const [email, setEmail] = useState('')
  const [name, setName] = useState('')
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    let isCancelled = false

    queueMicrotask(() => {
      if (isCancelled) return

      // Ler exclusivamente do sessionStorage — nunca de query params para evitar PII na URL
      const storedEmail = sessionStorage.getItem('signup-email')
      const storedName = sessionStorage.getItem('signup-name')

      if (storedEmail) setEmail(storedEmail)
      if (storedName) setName(storedName)

      setIsLoading(false)
    })

    return () => {
      isCancelled = true
    }
  }, [])

  if (isLoading) {
    return (
      <div className="flex min-h-svh flex-col items-center gap-4 px-6 pb-6 pt-[15vh] md:px-10 md:pb-10" role="status" aria-live="polite" aria-busy="true">
        <Loader2 className="h-8 w-8 animate-spin text-foreground/70" aria-hidden="true" />
        <p className="text-sm text-foreground/70">Carregando...</p>
      </div>
    )
  }

  if (!email || !name) {
    return (
      <div className="flex min-h-svh flex-col items-center gap-6 px-6 pb-6 pt-[15vh] md:px-10 md:pb-10">
        <div className="flex w-full max-w-sm flex-col gap-8">
          <Link
            href="/signup"
            className="inline-flex min-h-[44px] items-center gap-2 self-start font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40 focus-visible:ring-offset-2 rounded-sm transition-opacity hover:opacity-80"
            aria-label="Quayer — voltar ao cadastro"
          >
            <Image
              src="/logo.svg"
              alt=""
              width={120}
              height={28}
              priority
            />
          </Link>
          <div className="text-center space-y-3" role="alert">
            <h1 className="text-2xl font-bold text-foreground leading-tight">Dados incompletos</h1>
            <p className="text-[0.9375rem] text-foreground/70 leading-relaxed">
              Não encontramos os dados necessários para verificação.
            </p>
            <div className="pt-3">
              <Button asChild className="min-h-[44px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40 focus-visible:ring-offset-2">
                <a href="/signup">Voltar para cadastro</a>
              </Button>
            </div>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="flex min-h-svh flex-col items-center gap-6 px-6 pb-6 pt-[15vh] md:px-10 md:pb-10">
      <div className="flex w-full max-w-sm flex-col gap-8">
        <Link
          href="/signup"
          className="inline-flex min-h-[44px] items-center gap-2 self-start font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40 focus-visible:ring-offset-2 rounded-sm transition-opacity hover:opacity-80"
          aria-label="Quayer — voltar ao cadastro"
        >
          <Image
            src="/logo.svg"
            alt=""
            width={120}
            height={28}
            priority
          />
        </Link>
        <SignupOTPForm email={email} name={name} />
      </div>
    </div>
  )
}
