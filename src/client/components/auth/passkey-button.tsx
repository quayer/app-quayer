"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/client/components/ui/button"
import { Fingerprint, Loader2 } from "lucide-react"
import { startAuthentication } from "@simplewebauthn/browser"
import { useToast } from "@/client/hooks/use-toast"

interface PasskeyButtonProps {
  mode?: "login" | "register"
  email?: string
  variant?: "default" | "outline" | "ghost"
  className?: string
}

export function PasskeyButton({
  mode = "login",
  email,
  variant = "outline",
  className
}: PasskeyButtonProps) {
  const router = useRouter()
  const { toast } = useToast()
  const [isLoading, setIsLoading] = useState(false)

  const checkBrowserSupport = (): boolean => {
    if (typeof window === 'undefined' || !window.PublicKeyCredential) {
      toast({
        title: "Navegador não suportado",
        description: "Use Chrome, Edge, Safari ou Firefox atualizado.",
        variant: "destructive",
      })
      return false
    }
    return true
  }

  const handlePasskeyLogin = async () => {
    if (!checkBrowserSupport()) return
    if (!email) {
      toast({ title: "Email necessário", description: "Digite seu email primeiro.", variant: "destructive" })
      return
    }

    setIsLoading(true)
    try {
      // 1. Get authentication options from server
      const optionsRes = await fetch('/api/v1/auth/passkey/login/options', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ email }),
      })

      if (!optionsRes.ok) {
        const err = await optionsRes.json()
        const msg = err?.error?.message || err?.message || 'Erro ao obter opções de passkey'
        throw new Error(msg)
      }

      const options = await optionsRes.json()
      const optionsData = options.data ?? options

      // 2. Trigger browser passkey prompt
      const authResponse = await startAuthentication({ optionsJSON: optionsData })

      // 3. Verify on server and get JWT
      const verifyRes = await fetch('/api/v1/auth/passkey/login/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ email, response: authResponse }),
      })

      if (!verifyRes.ok) {
        const err = await verifyRes.json()
        const msg = err?.error?.message || err?.message || 'Autenticação com passkey falhou'
        throw new Error(msg)
      }

      const verifyData = await verifyRes.json()
      const result = verifyData.data ?? verifyData

      toast({ title: "Login realizado!", description: "Autenticado com Passkey." })

      if (result.needsOnboarding) {
        router.push('/onboarding')
      } else if (result.user?.role === 'admin') {
        router.push('/admin')
      } else {
        router.push('/')
      }
    } catch (err: unknown) {
      const error = err as { name?: string; message?: string }
      if (error?.name === 'NotAllowedError') {
        toast({ title: "Cancelado", description: "Autenticação com passkey cancelada.", variant: "destructive" })
      } else if (error?.message?.includes('Nenhuma passkey registrada')) {
        toast({
          title: "Sem Passkey cadastrada",
          description: "Faça login com email e cadastre uma Passkey em Configurações > Segurança.",
          variant: "destructive",
        })
      } else {
        toast({ title: "Erro", description: error.message || "Erro na autenticação com Passkey", variant: "destructive" })
      }
    } finally {
      setIsLoading(false)
    }
  }

  const handlePasskeyRegister = async () => {
    // Registration is handled in settings/passkey-manager.tsx
    toast({ title: "Registrar Passkey", description: "Acesse Configurações > Segurança para registrar uma Passkey." })
  }

  return (
    <Button
      type="button"
      variant={variant}
      className={className}
      onClick={mode === "login" ? handlePasskeyLogin : handlePasskeyRegister}
      disabled={isLoading}
    >
      {isLoading ? (
        <>
          <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />
          Autenticando...
        </>
      ) : (
        <>
          <Fingerprint className="mr-2 h-4 w-4" aria-hidden="true" />
          Continuar com Passkey
        </>
      )}
    </Button>
  )
}
