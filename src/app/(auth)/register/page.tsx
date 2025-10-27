'use client'

import { useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import Image from 'next/image'
import { Loader2, Mail, Lock, User } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardHeader, CardFooter } from '@/components/ui/card'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { AuthLayout } from '@/components/auth/auth-layout'
import { api } from '@/igniter.client'

export default function RegisterPage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const inviteToken = searchParams.get('token')

  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [error, setError] = useState('')
  const [isLoading, setIsLoading] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')

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
      // 1. Criar usuário (sem fazer login automático)
      const response = await api.auth.register.mutate({
        body: {
          name,
          email,
          password
        }
      })

      console.log('Register response:', response)

      // 2. Enviar código de verificação por email
      const verificationResponse = await fetch('/api/v1/auth/send-verification', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      })

      const verificationData = await verificationResponse.json()

      if (verificationData.data?.sent) {
        // 3. Redirecionar para página de verificação
        router.push(`/verify-email?email=${encodeURIComponent(email)}`)
      } else {
        setError('Conta criada, mas erro ao enviar email de verificação')
      }
    } catch (err: any) {
      console.error('Register error:', err)
      const errorMessage = err?.message || err?.response?.data?.message || 'Erro ao criar conta'
      setError(errorMessage)
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <AuthLayout>
      <Card className="border-white/10 bg-black/40 backdrop-blur-xl">
        <CardHeader className="space-y-4 text-center pb-6">
          <div className="flex justify-center mb-6">
            <Image
              src="/logo.svg"
              alt="Quayer Logo"
              width={160}
              height={38}
              priority
              className="dark:invert-0"
            />
          </div>
          <div>
            <p className="text-sm text-gray-400">Crie sua conta para começar</p>
          </div>
        </CardHeader>

        <form onSubmit={handleSubmit}>
          <CardContent className="space-y-5">
            {error && (
              <Alert variant="destructive" className="border-red-500/50 bg-red-500/10">
                <AlertDescription className="text-red-200">{error}</AlertDescription>
              </Alert>
            )}

            <div className="space-y-2">
              <Label htmlFor="name" className="text-gray-200">
                Nome Completo
              </Label>
              <div className="relative">
                <User className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                <Input
                  id="name"
                  type="text"
                  placeholder="Seu nome"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  required
                  disabled={isLoading}
                  className="pl-10 bg-white/5 border-white/10 text-white placeholder:text-gray-500 focus:border-purple-500/50 focus:ring-purple-500/20"
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="email" className="text-gray-200">
                Email
              </Label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                <Input
                  id="email"
                  type="email"
                  placeholder="seu@email.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  disabled={isLoading}
                  className="pl-10 bg-white/5 border-white/10 text-white placeholder:text-gray-500 focus:border-purple-500/50 focus:ring-purple-500/20"
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="password" className="text-gray-200">
                Senha
              </Label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                <Input
                  id="password"
                  type="password"
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  disabled={isLoading}
                  className="pl-10 bg-white/5 border-white/10 text-white placeholder:text-gray-500 focus:border-purple-500/50 focus:ring-purple-500/20"
                />
              </div>
              <p className="text-xs text-gray-400">Mínimo de 8 caracteres</p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="confirmPassword" className="text-gray-200">
                Confirmar Senha
              </Label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                <Input
                  id="confirmPassword"
                  type="password"
                  placeholder="••••••••"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  required
                  disabled={isLoading}
                  className="pl-10 bg-white/5 border-white/10 text-white placeholder:text-gray-500 focus:border-purple-500/50 focus:ring-purple-500/20"
                />
              </div>
            </div>
          </CardContent>

          <CardFooter className="flex flex-col space-y-4 pt-6">
            <Button
              type="submit"
              className="w-full bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-700 hover:to-pink-700"
              disabled={isLoading}
            >
              {isLoading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Criando conta...
                </>
              ) : (
                'Criar Conta'
              )}
            </Button>

            <div className="text-sm text-center text-gray-400 pt-4 border-t border-white/10">
              Já tem uma conta?{' '}
              <Link
                href="/login"
                className="text-purple-400 hover:text-purple-300 transition-colors font-medium"
              >
                Faça login
              </Link>
            </div>
          </CardFooter>
        </form>
      </Card>
    </AuthLayout>
  )
}
