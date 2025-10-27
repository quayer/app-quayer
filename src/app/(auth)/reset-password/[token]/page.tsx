'use client'

import { useState, use } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import Image from 'next/image'
import { ArrowLeft, CheckCircle2, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { PasswordInput } from '@/components/ui/password-input'
import { Alert, AlertDescription } from '@/components/ui/alert'
import {
  Field,
  FieldLabel,
  FieldDescription,
  FieldGroup,
} from '@/components/ui/field'
import { api } from '@/igniter.client'
import { cn } from '@/lib/utils'

export default function ResetPasswordPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = use(params)
  const router = useRouter()
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [error, setError] = useState('')
  const [success, setSuccess] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [passwordStrength, setPasswordStrength] = useState<'weak' | 'medium' | 'strong'>('weak')

  // Calcular força da senha em tempo real
  const calculatePasswordStrength = (pwd: string): 'weak' | 'medium' | 'strong' => {
    if (pwd.length < 8) return 'weak'

    let strength = 0
    if (pwd.length >= 12) strength++
    if (/[a-z]/.test(pwd) && /[A-Z]/.test(pwd)) strength++
    if (/\d/.test(pwd)) strength++
    if (/[^a-zA-Z\d]/.test(pwd)) strength++

    if (strength >= 3) return 'strong'
    if (strength >= 2) return 'medium'
    return 'weak'
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setSuccess(false)

    // Validações
    if (password !== confirmPassword) {
      setError('As senhas não coincidem')
      return
    }

    if (password.length < 8) {
      setError('A senha deve ter no mínimo 8 caracteres')
      return
    }

    setIsLoading(true)

    try {
      const resetResult = await api.auth.resetPassword.mutate({
        body: {
          token,
          password
        }
      })

      setSuccess(true)

      // Auto-login após reset bem-sucedido
      if ((resetResult as any)?.data?.email) {
        try {
          const loginResult = await api.auth.login.mutate({
            body: {
              email: (resetResult as any).data.email,
              password
            }
          })

          if ((loginResult as any)?.data?.accessToken && (loginResult as any)?.data?.refreshToken) {
            // Salvar tokens
            localStorage.setItem('accessToken', (loginResult as any).data.accessToken)
            localStorage.setItem('refreshToken', (loginResult as any).data.refreshToken)

            const cookieValue = encodeURIComponent((loginResult as any).data.accessToken)
            document.cookie = 'accessToken=' + cookieValue + '; path=/; max-age=86400; SameSite=Lax'

            // Redirecionar baseado no role
            const redirectPath = (loginResult as any).data.user?.role === 'admin' ? '/admin' : '/integracoes'

            setTimeout(() => {
              window.location.href = redirectPath
            }, 2000)
            return
          }
        } catch (loginError) {
          console.error('[RESET PASSWORD] Auto-login failed:', loginError)
          // Continuar para login manual se auto-login falhar
        }
      }

      // Fallback: redirecionar para login se auto-login falhar
      setTimeout(() => {
        router.push('/login')
      }, 3000)
    } catch (err: any) {
      const errorMessage = err?.message || err?.response?.data?.message || 'Erro ao redefinir senha. Token pode estar expirado.'
      setError(errorMessage)
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="flex min-h-svh flex-col items-center justify-center gap-6 p-6 md:p-10">
      <div className="w-full max-w-sm">
        <div className={cn("flex flex-col gap-6")}>
          {success ? (
            <div className="space-y-6 text-center">
              <Link href="/login" className="flex flex-col items-center gap-2 font-medium">
                <div className="flex items-center justify-center">
                  <Image
                    src="/logo.svg"
                    alt="Quayer Logo"
                    width={160}
                    height={38}
                  />
                </div>
                <span className="sr-only">Quayer</span>
              </Link>
              <div className="flex justify-center">
                <CheckCircle2 className="h-16 w-16 text-green-400" />
              </div>
              <div className="space-y-2">
                <h3 className="text-lg font-semibold">Senha redefinida com sucesso!</h3>
                <FieldDescription>
                  Você será redirecionado automaticamente...
                </FieldDescription>
              </div>
            </div>
          ) : (
            <form onSubmit={handleSubmit}>
              <FieldGroup>
                <div className="flex flex-col items-center gap-2 text-center">
                  <Link
                    href="/login"
                    className="flex flex-col items-center gap-2 font-medium"
                  >
                    <div className="flex items-center justify-center">
                      <Image
                        src="/logo.svg"
                        alt="Quayer Logo"
                        width={160}
                        height={38}
                      />
                    </div>
                    <span className="sr-only">Quayer</span>
                  </Link>
                  <h1 className="text-xl font-bold mt-4">Redefinir Senha</h1>
                  <FieldDescription>
                    Digite sua nova senha
                  </FieldDescription>
                </div>

                {error && (
                  <Alert variant="destructive" className="border-red-500/50 bg-red-500/10">
                    <AlertDescription className="text-red-200">{error}</AlertDescription>
                  </Alert>
                )}

                <Field>
                  <FieldLabel htmlFor="password">Nova Senha</FieldLabel>
                  <PasswordInput
                    id="password"
                    placeholder="••••••••"
                    value={password}
                    onChange={(e) => {
                      setPassword(e.target.value)
                      setPasswordStrength(calculatePasswordStrength(e.target.value))
                    }}
                    required
                    disabled={isLoading}
                    autoFocus
                  />
                  {password && (
                    <div className="mt-2 space-y-1">
                      <div className="flex gap-1">
                        <div className={`h-1 flex-1 rounded-full transition-colors ${
                          passwordStrength === 'weak' ? 'bg-red-500' :
                          passwordStrength === 'medium' ? 'bg-yellow-500' : 'bg-green-500'
                        }`} />
                        <div className={`h-1 flex-1 rounded-full transition-colors ${
                          passwordStrength === 'medium' || passwordStrength === 'strong' ?
                          (passwordStrength === 'medium' ? 'bg-yellow-500' : 'bg-green-500') : 'bg-gray-700'
                        }`} />
                        <div className={`h-1 flex-1 rounded-full transition-colors ${
                          passwordStrength === 'strong' ? 'bg-green-500' : 'bg-gray-700'
                        }`} />
                      </div>
                      <p className={`text-xs ${
                        passwordStrength === 'weak' ? 'text-red-400' :
                        passwordStrength === 'medium' ? 'text-yellow-400' : 'text-green-400'
                      }`}>
                        {passwordStrength === 'weak' && 'Senha fraca - adicione letras maiúsculas, números e símbolos'}
                        {passwordStrength === 'medium' && 'Senha média - adicione mais caracteres ou símbolos'}
                        {passwordStrength === 'strong' && 'Senha forte ✓'}
                      </p>
                    </div>
                  )}
                  {!password && (
                    <FieldDescription>Mínimo de 8 caracteres</FieldDescription>
                  )}
                </Field>

                <Field>
                  <FieldLabel htmlFor="confirmPassword">Confirmar Nova Senha</FieldLabel>
                  <PasswordInput
                    id="confirmPassword"
                    placeholder="••••••••"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    required
                    disabled={isLoading}
                  />
                </Field>

                <Field>
                  <Button
                    type="submit"
                    className="w-full"
                    disabled={isLoading}
                  >
                    {isLoading ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Redefinindo...
                      </>
                    ) : (
                      'Redefinir Senha'
                    )}
                  </Button>
                </Field>

                <div className="text-center">
                  <Link
                    href="/login"
                    className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
                  >
                    <ArrowLeft className="h-4 w-4" />
                    Voltar para login
                  </Link>
                </div>
              </FieldGroup>
            </form>
          )}
          <FieldDescription className="px-6 text-center text-xs">
            Ao redefinir sua senha, você concorda com nossos <a href="/termos" className="underline underline-offset-4 hover:text-primary">Termos de Serviço</a>.
          </FieldDescription>
        </div>
      </div>
    </div>
  )
}
