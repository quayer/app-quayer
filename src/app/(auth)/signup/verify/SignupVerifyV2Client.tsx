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
      <div className="flex min-h-svh flex-col items-center gap-6 px-6 pb-6 pt-[15vh] md:px-10 md:pb-10" role="status" aria-live="polite">
        <Loader2 className="h-8 w-8 animate-spin text-foreground/60" aria-hidden="true" />
        <p className="text-sm text-foreground/70">Carregando...</p>
      </div>
    )
  }

  if (!email || !name) {
    return (
      <div className="flex min-h-svh flex-col items-center gap-6 px-6 pb-6 pt-[15vh] md:px-10 md:pb-10">
        <div className="flex w-full max-w-sm flex-col gap-6">
          <Link
            href="/signup"
            className="flex items-center gap-2 self-start font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/30 rounded-sm"
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
          <div className="text-center" role="alert">
            <h1 className="text-2xl font-bold mb-4 text-foreground">Dados incompletos</h1>
            <p className="text-foreground/70 mb-4">
              Não encontramos os dados necessários para verificação.
            </p>
            <Button asChild className="min-h-[44px]">
              <a href="/signup">Voltar para cadastro</a>
            </Button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="flex min-h-svh flex-col items-center gap-6 px-6 pb-6 pt-[15vh] md:px-10 md:pb-10">
      <div className="flex w-full max-w-sm flex-col gap-6">
        <Link
          href="/signup"
          className="flex items-center gap-2 self-start font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/30 rounded-sm"
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
