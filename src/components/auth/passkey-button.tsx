"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Fingerprint, Loader2, CheckCircle2, AlertCircle } from "lucide-react"
import { api } from "@/igniter.client"
import { useToast } from "@/hooks/use-toast"
import { startRegistration, startAuthentication } from "@simplewebauthn/browser"
import Cookies from 'js-cookie'

interface PasskeyButtonProps {
  mode?: "login" | "register"
  email?: string
  variant?: "default" | "outline" | "ghost"
  className?: string
  onSuccess?: () => void
}

export function PasskeyButton({
  mode = "login",
  email,
  variant = "outline",
  className,
  onSuccess
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
    
    if (!email) {
      toast({
        title: "Email necessário",
        description: "Por favor, preencha seu email primeiro",
        variant: "destructive",
      })
      return
    }

    setIsLoading(true)

    try {
      // 1. Obter opções de autenticação do servidor
      const { data: optionsData, error: optionsError } = await api.auth.passkeyLoginOptions.mutate({
        body: { email }
      })

      if (optionsError || !optionsData) {
        const errorMsg = (optionsError as any)?.error?.message || 
                        (optionsError as any)?.message || 
                        'Erro ao obter opções de login'
        
        // Verificar se é erro de "nenhuma passkey registrada"
        if (errorMsg.includes('Nenhuma passkey')) {
          toast({
            title: "Passkey não encontrada",
            description: "Você ainda não tem uma passkey registrada. Faça login normalmente e registre uma passkey nas configurações.",
            variant: "destructive",
          })
        } else {
          toast({
            title: "Erro",
            description: errorMsg,
            variant: "destructive",
          })
        }
        return
      }

      // 2. Iniciar autenticação WebAuthn no navegador
      const credential = await startAuthentication({ optionsJSON: optionsData })

      // 3. Verificar credencial no servidor
      const { data: verifyData, error: verifyError } = await api.auth.passkeyLoginVerify.mutate({
        body: { 
          email, 
          credential: credential 
        }
      })

      if (verifyError || !verifyData) {
        throw new Error((verifyError as any)?.error?.message || 'Verificação falhou')
      }

      // 4. Salvar tokens
      const { accessToken, refreshToken, needsOnboarding } = verifyData as any

      Cookies.set('accessToken', accessToken, {
        expires: 1,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax'
      })

      Cookies.set('refreshToken', refreshToken, {
        expires: 7,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax'
      })

      toast({
        title: "Login realizado!",
        description: "Autenticado com sucesso usando Passkey",
      })

      // 5. Redirecionar
      if (onSuccess) {
        onSuccess()
      } else if (needsOnboarding) {
        router.push('/onboarding')
      } else {
        router.push('/integracoes')
      }

    } catch (error: any) {
      console.error('[Passkey Login] Error:', error)
      
      // Tratar erro de cancelamento pelo usuário
      if (error.name === 'NotAllowedError') {
        toast({
          title: "Autenticação cancelada",
          description: "Você cancelou a autenticação com Passkey",
          variant: "destructive",
        })
      } else {
        toast({
          title: "Erro na autenticação",
          description: error.message || "Não foi possível autenticar com Passkey",
          variant: "destructive",
        })
      }
    } finally {
      setIsLoading(false)
    }
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

    setIsLoading(true)

    try {
      // 1. Obter opções de registro do servidor
      const { data: optionsData, error: optionsError } = await api.auth.passkeyRegisterOptions.mutate({
        body: { email }
      })

      if (optionsError || !optionsData) {
        const errorMsg = (optionsError as any)?.error?.message || 
                        (optionsError as any)?.message || 
                        'Erro ao obter opções de registro'
        toast({
          title: "Erro",
          description: errorMsg,
          variant: "destructive",
        })
        return
      }

      // 2. Iniciar registro WebAuthn no navegador
      const credential = await startRegistration({ optionsJSON: optionsData })

      // 3. Verificar e salvar credencial no servidor
      const { data: verifyData, error: verifyError } = await api.auth.passkeyRegisterVerify.mutate({
        body: { 
          email, 
          credential: credential 
        }
      })

      if (verifyError || !verifyData) {
        throw new Error((verifyError as any)?.error?.message || 'Registro falhou')
      }

      toast({
        title: "Passkey registrada!",
        description: "Você agora pode fazer login usando sua Passkey",
      })

      if (onSuccess) {
        onSuccess()
      }

    } catch (error: any) {
      console.error('[Passkey Register] Error:', error)
      
      // Tratar erro de cancelamento pelo usuário
      if (error.name === 'NotAllowedError') {
        toast({
          title: "Registro cancelado",
          description: "Você cancelou o registro da Passkey",
          variant: "destructive",
        })
      } else {
        toast({
          title: "Erro no registro",
          description: error.message || "Não foi possível registrar a Passkey",
          variant: "destructive",
        })
      }
    } finally {
      setIsLoading(false)
    }
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
          {mode === "login" ? "Autenticando..." : "Registrando..."}
        </>
      ) : (
        <>
          <Fingerprint className="mr-2 h-4 w-4" />
          {mode === "login" ? "Continuar com Passkey" : "Registrar Passkey"}
        </>
      )}
    </Button>
  )
}
