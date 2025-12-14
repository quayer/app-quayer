import Image from "next/image"
import Link from "next/link"
import { LoginFormFinal } from "@/components/auth/login-form-final"
import { AuthLayout } from "@/components/auth/auth-layout"

export const metadata = {
  title: 'Entrar | Quayer',
  description: 'Entre na sua conta Quayer para gerenciar suas comunicacoes',
}

export default function LoginPage() {
  return (
    <AuthLayout>
      <div className="flex w-full flex-col gap-6">
        <h1 className="sr-only">Entrar na sua conta Quayer</h1>

        {/* Logo com efeito de glow */}
        <Link
          href="/"
          className="flex items-center justify-center gap-2 font-medium group"
          aria-label="Ir para a pagina inicial"
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
            {/* Glow effect */}
            <div className="absolute inset-0 blur-xl bg-gradient-to-r from-purple-500/30 to-pink-500/30 opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
          </div>
        </Link>

        <LoginFormFinal />

        {/* Trust indicators */}
        <div className="flex items-center justify-center gap-4 text-xs text-muted-foreground/70">
          <div className="flex items-center gap-1.5">
            <svg className="h-3.5 w-3.5 text-green-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
            </svg>
            <span>Seguro</span>
          </div>
          <div className="w-px h-3 bg-muted-foreground/30" />
          <div className="flex items-center gap-1.5">
            <svg className="h-3.5 w-3.5 text-blue-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
            </svg>
            <span>Rapido</span>
          </div>
          <div className="w-px h-3 bg-muted-foreground/30" />
          <div className="flex items-center gap-1.5">
            <svg className="h-3.5 w-3.5 text-purple-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
            </svg>
            <span>Multi-equipe</span>
          </div>
        </div>
      </div>
    </AuthLayout>
  )
}
