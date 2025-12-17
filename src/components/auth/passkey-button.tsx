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

    // DEBUG: Log completo para entender a estrutura
    console.log('[Passkey Login] Full API response:', {
      optionsData: JSON.stringify(optionsData),
      optionsError: JSON.stringify(optionsError),
      optionsDataType: typeof optionsData
    })

    // Verificar erro - pode vir em múltiplos formatos:
    // 1. optionsError (erro do client)
    // 2. optionsData.error (erro da API em data.error)
    // 3. optionsData pode ser {error: "msg"} diretamente
    const dataError = (optionsData as any)?.error
    const hasError = optionsError || dataError || !optionsData

    // Se há erro, extrair a mensagem
    if (hasError) {
      // Priorizar dataError pois é o formato que a API usa
      const errorMsg = dataError ||
                      (optionsError as any)?.error?.message ||
                      (optionsError as any)?.error ||
                      (optionsError as any)?.message ||
                      (optionsError as any)?.data?.error ||
                      'Erro ao obter opções de login'

      console.log('[Passkey Login] Detected error:', {
        dataError,
        optionsError,
        extractedMsg: errorMsg
      })

      // Verificar se é erro de "nenhuma passkey registrada" ou "usuário não encontrado"
      const noPasskeyPatterns = [
        'Nenhuma passkey',
        'nenhuma passkey',
        'not registered',
        'Usuário não encontrado',
        'Registre uma passkey'
      ]

      const errorString = String(errorMsg)
      if (noPasskeyPatterns.some(pattern => errorString.includes(pattern))) {
        console.log('[Passkey Login] No passkey detected, returning false to trigger registration')
        return false // Sinaliza que não tem passkey -> dispara registro
      }

      throw new Error(errorString)
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

    // Verificar erro na verificação
    const verifyDataError = (verifyData as any)?.error
    if (verifyError || verifyDataError || !verifyData) {
      throw new Error(verifyDataError || (verifyError as any)?.error?.message || 'Verificação falhou')
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

    // Verificar erro - pode vir em optionsError OU em optionsData.error
    const dataError = (optionsData as any)?.error
    const hasError = optionsError || dataError || !optionsData

    if (hasError) {
      // Extrair mensagem de erro de diferentes formatos possíveis
      const errorData = optionsError as any
      const errorMsg = dataError ||  // Erro vem em data.error
                      errorData?.error?.message ||
                      errorData?.error ||
                      errorData?.message ||
                      errorData?.data?.error ||
                      (typeof errorData === 'string' ? errorData : 'Erro ao obter opções de registro')

      console.log('[Passkey Register] Error response:', {
        optionsError,
        optionsData,
        dataError,
        extractedMsg: errorMsg
      })

      throw new Error(String(errorMsg))
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

    // Verificar erro no registro
    const verifyDataError = (verifyData as any)?.error
    if (verifyError || verifyDataError || !verifyData) {
      throw new Error(verifyDataError || (verifyError as any)?.error?.message || 'Registro falhou')
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
   * Modo Smart: Fluxo inteligente de Passkey
   * 1. Se usuário tem passkey → Login direto
   * 2. Se usuário existe mas não tem passkey → Registra e faz login
   * 3. Se usuário não existe → Orienta a criar conta
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
    console.log('[Passkey Smart] Starting smart passkey flow for:', email)

    try {
      // Primeiro tenta fazer login (verifica se tem passkey)
      console.log('[Passkey Smart] Step 1: Attempting login...')
      const loginSuccess = await attemptPasskeyLogin()
      console.log('[Passkey Smart] Login result:', loginSuccess)

      if (!loginSuccess) {
        // Usuário existe mas não tem passkey - tentar registrar
        console.log('[Passkey Smart] Step 2: No passkey found, starting registration flow...')
        toast({
          title: "Registrando Passkey",
          description: "Vamos criar sua primeira Passkey...",
        })

        setStatusText("Preparando registro...")

        try {
          // Tentar registrar passkey
          const registerSuccess = await attemptPasskeyRegister()

          if (registerSuccess) {
            // Sucesso no registro - agora fazer login
            toast({
              title: "Passkey criada!",
              description: "Autenticando...",
            })

            setStatusText("Autenticando...")
            await new Promise(resolve => setTimeout(resolve, 500))

            // Fazer login com a passkey recém-criada
            await attemptPasskeyLogin()
          }
        } catch (registerError: any) {
          console.error('[Passkey Smart] Register error completo:', registerError)
          console.error('[Passkey Smart] Register error name:', registerError?.name)
          console.error('[Passkey Smart] Register error message:', registerError?.message)

          // Extrair mensagem de erro de forma robusta
          const errorMsg = registerError?.message ||
                          registerError?.error?.message ||
                          registerError?.error ||
                          (typeof registerError === 'string' ? registerError : '')

          console.log('[Passkey Smart] Register extracted error:', errorMsg)

          if (String(errorMsg).includes('não encontrado') || String(errorMsg).toLowerCase().includes('not found')) {
            toast({
              title: "Conta não encontrada",
              description: "Crie uma conta primeiro usando o botão 'Continuar com Email'",
              variant: "destructive",
            })
          } else if (registerError.name === 'NotAllowedError') {
            toast({
              title: "Registro cancelado",
              description: "Você cancelou o registro da Passkey",
              variant: "destructive",
            })
          } else {
            const displayError = String(errorMsg) || JSON.stringify(registerError) || "Erro desconhecido"
            toast({
              title: "Erro no registro",
              description: displayError.substring(0, 200),
              variant: "destructive",
            })
          }
        }
      }
    } catch (error: any) {
      console.error('[Passkey Smart] Error completo:', error)
      console.error('[Passkey Smart] Error name:', error?.name)
      console.error('[Passkey Smart] Error message:', error?.message)
      console.error('[Passkey Smart] Error stack:', error?.stack)

      // Extrair mensagem de erro de forma robusta
      const errorMsg = error?.message ||
                      error?.error?.message ||
                      error?.error ||
                      (typeof error === 'string' ? error : '')

      console.log('[Passkey Smart] Extracted error message:', errorMsg)

      if (error.name === 'NotAllowedError') {
        toast({
          title: "Operação cancelada",
          description: "Você cancelou a operação com Passkey",
          variant: "destructive",
        })
      } else if (String(errorMsg).includes('não encontrado') || String(errorMsg).toLowerCase().includes('not found')) {
        toast({
          title: "Conta não encontrada",
          description: "Crie uma conta primeiro usando o botão 'Continuar com Email'",
          variant: "destructive",
        })
      } else {
        // Mostrar erro específico se disponível, senão mostrar o erro completo
        const displayError = String(errorMsg) || JSON.stringify(error) || "Erro desconhecido"
        toast({
          title: "Erro na Passkey",
          description: displayError.substring(0, 200), // Limitar tamanho
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
