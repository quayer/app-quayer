"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Fingerprint, Loader2 } from "lucide-react"
import { api } from "@/igniter.client"
import { useToast } from "@/hooks/use-toast"
import { startRegistration, startAuthentication } from "@simplewebauthn/browser"
import Cookies from 'js-cookie'

interface PasskeyButtonProps {
  /**
   * Modo de operação:
   * - "login": Tenta login, se não tiver passkey oferece registro
   * - "register": Apenas registro de nova passkey
   * - "smart": Tenta login, se falhar por falta de passkey, registra automaticamente
   */
  mode?: "login" | "register" | "smart"
  email?: string
  variant?: "default" | "outline" | "ghost"
  className?: string
  onSuccess?: () => void
}

export function PasskeyButton({
  mode = "smart",
  email,
  variant = "outline",
  className,
  onSuccess
}: PasskeyButtonProps) {
  const router = useRouter()
  const { toast } = useToast()
  const [isLoading, setIsLoading] = useState(false)
  const [statusText, setStatusText] = useState("")

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

  /**
   * Tenta fazer login com passkey existente
   * Retorna true se login foi bem sucedido, false se não tem passkey
   */
  const attemptPasskeyLogin = async (): Promise<boolean> => {
    setStatusText("Verificando passkeys...")

    // 1. Obter opções de autenticação do servidor
    const { data: optionsData, error: optionsError } = await api.auth.passkeyLoginOptions.mutate({
      body: { email: email! }
    })

    if (optionsError || !optionsData) {
      const errorMsg = (optionsError as any)?.error?.message ||
                      (optionsError as any)?.message ||
                      'Erro ao obter opções de login'

      // Verificar se é erro de "nenhuma passkey registrada"
      if (errorMsg.includes('Nenhuma passkey')) {
        return false // Sinaliza que não tem passkey
      }

      throw new Error(errorMsg)
    }

    setStatusText("Autenticando...")

    // 2. Iniciar autenticação WebAuthn no navegador
    const credential = await startAuthentication({ optionsJSON: optionsData as any })

    // 3. Verificar credencial no servidor
    const { data: verifyData, error: verifyError } = await api.auth.passkeyLoginVerify.mutate({
      body: {
        email: email!,
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

    return true
  }

  /**
   * Registra uma nova passkey
   */
  const attemptPasskeyRegister = async (): Promise<boolean> => {
    setStatusText("Preparando registro...")

    // 1. Obter opções de registro do servidor
    const { data: optionsData, error: optionsError } = await api.auth.passkeyRegisterOptions.mutate({
      body: { email: email! }
    })

    if (optionsError || !optionsData) {
      const errorMsg = (optionsError as any)?.error?.message ||
                      (optionsError as any)?.message ||
                      'Erro ao obter opções de registro'
      throw new Error(errorMsg)
    }

    setStatusText("Registrando passkey...")

    // 2. Iniciar registro WebAuthn no navegador
    const credential = await startRegistration({ optionsJSON: optionsData as any })

    // 3. Verificar e salvar credencial no servidor
    const { data: verifyData, error: verifyError } = await api.auth.passkeyRegisterVerify.mutate({
      body: {
        email: email!,
        credential: credential
      }
    })

    if (verifyError || !verifyData) {
      throw new Error((verifyError as any)?.error?.message || 'Registro falhou')
    }

    toast({
      title: "Passkey registrada!",
      description: "Agora você pode fazer login usando sua Passkey",
    })

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
      await attemptPasskeyLogin()
    } catch (error: any) {
      console.error('[Passkey Login] Error:', error)

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
      setStatusText("")
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
      await attemptPasskeyRegister()
      if (onSuccess) {
        onSuccess()
      }
    } catch (error: any) {
      console.error('[Passkey Register] Error:', error)

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
      setStatusText("")
    }
  }

  /**
   * Modo Smart: Tenta login, se não tiver passkey, registra automaticamente
   */
  const handlePasskeySmart = async () => {
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
      // Primeiro tenta fazer login
      const loginSuccess = await attemptPasskeyLogin()

      if (!loginSuccess) {
        // Se não tem passkey, informa e oferece registro
        toast({
          title: "Nenhuma Passkey encontrada",
          description: "Vamos registrar sua primeira Passkey agora...",
        })

        // Aguarda um momento para o usuário ver a mensagem
        await new Promise(resolve => setTimeout(resolve, 1000))

        // Registra nova passkey
        const registerSuccess = await attemptPasskeyRegister()

        if (registerSuccess) {
          // Após registrar, faz login automaticamente
          toast({
            title: "Passkey criada!",
            description: "Autenticando com sua nova Passkey...",
          })

          await new Promise(resolve => setTimeout(resolve, 500))
          await attemptPasskeyLogin()
        }
      }
    } catch (error: any) {
      console.error('[Passkey Smart] Error:', error)

      if (error.name === 'NotAllowedError') {
        toast({
          title: "Operação cancelada",
          description: "Você cancelou a operação com Passkey",
          variant: "destructive",
        })
      } else {
        toast({
          title: "Erro",
          description: error.message || "Não foi possível completar a operação",
          variant: "destructive",
        })
      }
    } finally {
      setIsLoading(false)
      setStatusText("")
    }
  }

  // Determinar qual handler usar
  const handleClick = () => {
    switch (mode) {
      case "login":
        return handlePasskeyLogin()
      case "register":
        return handlePasskeyRegister()
      case "smart":
      default:
        return handlePasskeySmart()
    }
  }

  // Texto do botão baseado no status ou modo
  const getButtonText = () => {
    if (isLoading && statusText) {
      return statusText
    }
    if (isLoading) {
      return mode === "register" ? "Registrando..." : "Autenticando..."
    }
    switch (mode) {
      case "register":
        return "Registrar Passkey"
      case "login":
      case "smart":
      default:
        return "Continuar com Passkey"
    }
  }

  return (
    <Button
      type="button"
      variant={variant}
      className={className}
      onClick={handleClick}
      disabled={isLoading}
    >
      {isLoading ? (
        <>
          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          {getButtonText()}
        </>
      ) : (
        <>
          <Fingerprint className="mr-2 h-4 w-4" />
          {getButtonText()}
        </>
      )}
    </Button>
  )
}
