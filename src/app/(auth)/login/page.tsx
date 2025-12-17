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
      </div>
    </AuthLayout>
  )
}
