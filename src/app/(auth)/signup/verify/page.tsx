'use client'

// Force dynamic rendering
export const dynamic = 'force-dynamic'

import { Suspense, useEffect, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import Image from "next/image"
import Link from "next/link"
import { SignupOTPForm } from "@/components/auth/signup-otp-form"

function SignupVerifyContent() {
  const searchParams = useSearchParams()
  const [email, setEmail] = useState('')
  const [name, setName] = useState('')

  useEffect(() => {
    // Pegar email e nome da URL primeiro (prioridade)
    const emailParam = searchParams.get('email')
    const nameParam = searchParams.get('name')

    // Pegar nome do sessionStorage como fallback
    const storedName = sessionStorage.getItem('signup-name')
    const storedEmail = sessionStorage.getItem('signup-email')

    if (emailParam) {
      setEmail(emailParam)
    } else if (storedEmail) {
      setEmail(storedEmail)
    }

    if (nameParam) {
      setName(nameParam)
    } else if (storedName) {
      setName(storedName)
    }
  }, [searchParams])

  if (!email || !name) {
    return (
      <div className="flex min-h-svh flex-col items-center justify-center gap-6 p-6 md:p-10">
        <div className="flex w-full max-w-sm flex-col gap-6">
          <Link href="/signup" className="flex items-center gap-2 self-center font-medium">
            <Image
              src="/logo.svg"
              alt="Quayer"
              width={120}
              height={28}
              priority
            />
          </Link>
          <div className="text-center">
            <h1 className="text-2xl font-bold mb-4">Dados incompletos</h1>
            <p className="text-muted-foreground mb-4">
              Não encontramos os dados necessários para verificação.
            </p>
            <a
              href="/signup"
              className="inline-flex items-center justify-center rounded-md text-sm font-medium ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 bg-primary text-primary-foreground hover:bg-primary/90 h-10 px-4 py-2"
            >
              Voltar para cadastro
            </a>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="flex min-h-svh flex-col items-center justify-center gap-6 p-6 md:p-10">
      <div className="flex w-full max-w-sm flex-col gap-6">
        <Link href="/signup" className="flex items-center gap-2 self-center font-medium">
          <Image
            src="/logo.svg"
            alt="Quayer"
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

export default function SignupVerifyPage() {
  return (
    <Suspense fallback={
      <div className="flex items-center justify-center min-h-screen">
        <p className="text-muted-foreground">Carregando...</p>
      </div>
    }>
      <SignupVerifyContent />
    </Suspense>
  )
}
