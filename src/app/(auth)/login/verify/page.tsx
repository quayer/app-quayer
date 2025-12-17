'use client'

import { Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import Image from "next/image"
import Link from "next/link"
import { LoginOTPForm } from "@/components/auth/login-otp-form"
import { AuthLayout } from "@/components/auth/auth-layout"

function LoginVerifyContent() {
  const searchParams = useSearchParams()
  const email = searchParams.get('email')

  return (
    <AuthLayout>
      <div className="flex w-full flex-col gap-6">
        <Link
          href="/login"
          className="flex items-center justify-center gap-2 font-medium group"
          aria-label="Voltar para login"
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
        <LoginOTPForm email={email || undefined} />
      </div>
    </AuthLayout>
  )
}

export default function LoginVerifyPage() {
  return (
    <Suspense fallback={
      <AuthLayout>
        <div className="flex items-center justify-center">
          <p className="text-muted-foreground">Carregando...</p>
        </div>
      </AuthLayout>
    }>
      <LoginVerifyContent />
    </Suspense>
  )
}
