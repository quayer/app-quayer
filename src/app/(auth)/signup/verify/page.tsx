'use client'

import { Suspense, useEffect, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import Image from "next/image"
import Link from "next/link"
import { SignupOTPForm } from "@/client/components/auth/signup-otp-form"
import { Button } from "@/client/components/ui/button"
import { Loader2 } from "lucide-react"

function SignupVerifyContent() {
  const searchParams = useSearchParams()
  const [email, setEmail] = useState('')
  const [name, setName] = useState('')
  const [isLoading, setIsLoading] = useState(true)

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

    setIsLoading(false)
  }, [searchParams])

  if (isLoading) {
    return (
      <div className="flex min-h-svh flex-col items-center justify-center gap-6 p-6 md:p-10">
        <Loader2 className="h-8 w-8 animate-spin text-gray-500 dark:text-gray-400" />
        <p className="text-sm text-gray-500 dark:text-gray-400">Carregando...</p>
      </div>
    )
  }

  if (!email || !name) {
    return (
      <div className="flex min-h-svh flex-col items-center justify-center gap-6 p-6 md:p-10">
        <div className="flex w-full max-w-sm flex-col gap-6">
          <Link href="/signup" className="flex items-center gap-2 self-start font-medium">
            <Image
              src="/logo.svg"
              alt="Quayer"
              width={120}
              height={28}
              priority
            />
          </Link>
          <div className="text-center">
            <h1 className="text-2xl font-bold mb-4 text-gray-900 dark:text-white">Dados incompletos</h1>
            <p className="text-gray-500 dark:text-gray-400 mb-4">
              Não encontramos os dados necessários para verificação.
            </p>
            <Button asChild>
              <a href="/signup">Voltar para cadastro</a>
            </Button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="flex min-h-svh flex-col items-center justify-center gap-6 p-6 md:p-10">
      <div className="flex w-full max-w-sm flex-col gap-6">
        <Link href="/signup" className="flex items-center gap-2 self-start font-medium">
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
        <p className="text-gray-500 dark:text-gray-400">Carregando...</p>
      </div>
    }>
      <SignupVerifyContent />
    </Suspense>
  )
}
