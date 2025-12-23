import Image from "next/image"
import Link from "next/link"
import { OnboardingWizard } from "@/components/onboarding/onboarding-wizard"

export const metadata = {
  title: 'Configuração Inicial | Quayer',
  description: 'Configure sua conta Quayer',
}

export default function OnboardingPage() {
  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-gradient-to-br from-background via-background to-muted/20">
      <div className="w-full max-w-2xl">
        <div className="flex flex-col items-center gap-6 mb-8">
          <Link
            href="/"
            className="flex items-center justify-center gap-2 font-medium group"
            aria-label="Ir para a página inicial"
          >
            <div className="relative">
              <Image
                src="/logo.svg"
                alt="Quayer"
                width={160}
                height={40}
                priority
                className="relative z-10 transition-transform duration-300 group-hover:scale-105 dark:brightness-100 dark:invert-0 brightness-0"
              />
              <div className="absolute inset-0 blur-xl bg-gradient-to-r from-purple-500/30 to-pink-500/30 opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
            </div>
          </Link>
        </div>
        <OnboardingWizard />
      </div>
    </div>
  )
}
