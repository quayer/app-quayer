"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Fingerprint, Loader2 } from "lucide-react"
import { api } from "@/igniter.client"
import { useToast } from "@/hooks/use-toast"

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
    if (!window.PublicKeyCredential) {
      toast({
        title: "Navegador não suportado",
        description: "Seu navegador não suporta autenticação com Passkey. Use Chrome, Edge, Safari ou Firefox atualizado.",
        variant: "destructive",
      })
      return false
    }
    return true
  }

  const handlePasskeyLogin = async () => {
    if (!checkBrowserSupport()) return

    // TODO: Implementar login com Passkey
    toast({
      title: "Em breve",
      description: "Login com Passkey será implementado em breve",
    })
  }

  const handlePasskeyRegister = async () => {
    if (!checkBrowserSupport()) return
    if (!email) {
      toast({
        title: "Email necessário",
        description: "Por favor, preencha seu email primeiro",
        variant: "destructive",
      })
      return
    }

    // TODO: Implementar registro de Passkey
    toast({
      title: "Em breve",
      description: "Registro de Passkey será implementado em breve",
    })
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
          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          Autenticando...
        </>
      ) : (
        <>
          <Fingerprint className="mr-2 h-4 w-4" />
          Continuar com Passkey
        </>
      )}
    </Button>
  )
}
