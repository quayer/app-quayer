'use client'

// Force dynamic rendering
export const dynamic = 'force-dynamic'

import { Suspense, useEffect, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import Image from "next/image"
import Link from "next/link"
import { SignupOTPForm } from "@/components/auth/signup-otp-form"
import { AuthLayout } from "@/components/auth/auth-layout"

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
      <AuthLayout>
        <div className="flex w-full flex-col gap-6">
          <Link
            href="/signup"
            className="flex items-center justify-center gap-2 font-medium group"
          >
            <div className="relative">
              <Image
                src="/logo.svg"
                alt="Quayer"
                width={140}
                height={32}
                priority
                className="relative z-10 transition-transform duration-300 group-hover:scale-105"
              />
              <div className="absolute inset-0 blur-xl bg-gradient-to-r from-purple-500/30 to-pink-500/30 opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
            </div>
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
      </AuthLayout>
    )
  }

  return (
    <AuthLayout>
      <div className="flex w-full flex-col gap-6">
        <Link
          href="/signup"
          className="flex items-center justify-center gap-2 font-medium group"
        >
          <div className="relative">
            <Image
              src="/logo.svg"
              alt="Quayer"
              width={140}
              height={32}
              priority
              className="relative z-10 transition-transform duration-300 group-hover:scale-105"
            />
            <div className="absolute inset-0 blur-xl bg-gradient-to-r from-purple-500/30 to-pink-500/30 opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
          </div>
        </Link>
        <SignupOTPForm email={email} name={name} />
      </div>
    </AuthLayout>
  )
}

export default function SignupVerifyPage() {
  return (
    <Suspense fallback={
      <AuthLayout>
        <div className="flex items-center justify-center">
          <p className="text-muted-foreground">Carregando...</p>
        </div>
      </AuthLayout>
    }>
      <SignupVerifyContent />
    </Suspense>
  )
}
