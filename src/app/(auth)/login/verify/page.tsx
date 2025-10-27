'use client'

import { Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import Image from "next/image"
import Link from "next/link"
import { LoginOTPForm } from "@/components/auth/login-otp-form"

function LoginVerifyContent() {
  const searchParams = useSearchParams()
  const email = searchParams.get('email')

  return (
    <div className="flex min-h-svh flex-col items-center justify-center gap-6 p-6 md:p-10">
      <div className="flex w-full max-w-sm flex-col gap-6">
        <Link href="/login" className="flex items-center gap-2 self-center font-medium">
          <Image
            src="/logo.svg"
            alt="Quayer"
            width={120}
            height={28}
            priority
          />
        </Link>
        <LoginOTPForm email={email || undefined} />
      </div>
    </div>
  )
}

export default function LoginVerifyPage() {
  return (
    <Suspense fallback={
      <div className="flex items-center justify-center min-h-screen">
        <p className="text-muted-foreground">Carregando...</p>
      </div>
    }>
      <LoginVerifyContent />
    </Suspense>
  )
}
