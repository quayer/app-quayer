import Image from "next/image"
import Link from "next/link"
import { OnboardingForm } from "@/components/auth/onboarding-form"
import { AuthLayout } from "@/components/auth/auth-layout"

export const metadata = {
  title: 'Configuração Inicial | Quayer',
  description: 'Configure sua conta Quayer',
}

export default function OnboardingPage() {
  return (
    <AuthLayout>
      <div className="flex w-full flex-col gap-6">
        <Link
          href="/"
          className="flex items-center justify-center gap-2 font-medium group"
          aria-label="Ir para a página inicial"
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
        <OnboardingForm />
      </div>
    </AuthLayout>
  )
}
