# Avaliação Completa de Design e UX - App Quayer

**Data:** 2025-10-09
**Escopo:** Análise exclusiva de Layout, Hierarquia Visual e Experiência do Usuário
**Total de páginas:** 31 arquivos (layouts + pages)
**Foco:** Design System (shadcn/ui + Radix UI + Tailwind CSS 4)

---

## Índice

1. [Páginas Root](#páginas-root)
2. [Grupo Auth](#grupo-auth)
3. [Grupo Public](#grupo-public)
4. [Área Admin](#área-admin)
5. [Área Integrações](#área-integrações)
6. [Área User](#área-user)
7. [Resumo Executivo](#resumo-executivo)
8. [Top 10 Melhorias Prioritárias](#top-10-melhorias-prioritárias)

---

## Páginas Root

### 📄 src/app/page.tsx (Root Redirect Page)

**🎨 Layout & Hierarquia Visual**
- Página sem UI renderizada (apenas lógica de redirecionamento)
- Falta de loading state visual durante verificação de autenticação
- Flash branco inevitável durante redirect
- Não há hierarquia visual pois não há conteúdo exibido

**Pontos de Observação:**
- Ausência total de feedback visual cria experiência abrupta
- Usuário não sabe que está sendo redirecionado

**🧠 UX & Interações**
- Comportamento previsível (autenticado → dashboard, não autenticado → login)
- **Problema crítico:** Flash de tela branca causa confusão
- Falta de indicador de carregamento frustra usuário
- Sem mensagem contextual ("Redirecionando...", "Verificando sessão...")

**Microinterações ausentes:**
- Sem spinner de loading
- Sem animação de transição
- Sem texto de status

**💡 Sugestões de Melhoria Visual**

**PRIORIDADE ALTA:**
1. **Adicionar loading UI mínima:**
   - Spinner centralizado com `Loader2` icon
   - Texto "Carregando..." ou "Verificando sessão..."
   - Fundo com cor de background do tema

2. **Implementar skeleton screen:**
   - Layout vazio com placeholders do destino mais provável
   - Reduz percepção de tempo de espera

**PRIORIDADE MÉDIA:**
3. **Adicionar animação de fade-out:**
   - Transição suave antes do redirect
   - Melhora percepção de fluidez

**⚙️ Componentes UI Sugeridos**
```tsx
import { Loader2 } from 'lucide-react'
import { Skeleton } from '@/components/ui/skeleton'

// Loading fallback component
<div className="flex items-center justify-center min-h-screen bg-background">
  <div className="space-y-4 text-center">
    <Loader2 className="h-8 w-8 animate-spin mx-auto text-primary" />
    <p className="text-sm text-muted-foreground">Carregando...</p>
  </div>
</div>

// Ou skeleton screen:
<div className="min-h-screen p-8">
  <Skeleton className="h-16 w-64 mb-4" /> {/* Header */}
  <div className="grid grid-cols-4 gap-4">
    <Skeleton className="h-32" />
    <Skeleton className="h-32" />
    <Skeleton className="h-32" />
    <Skeleton className="h-32" />
  </div>
</div>
```

---

### 📄 src/app/layout.tsx (Root Layout)

**🎨 Layout & Hierarquia Visual**
- **Pontos Fortes:**
  - Fontes Google (Geist Sans + Geist Mono) bem configuradas
  - CSS variables para tipografia consistente
  - Antialiasing habilitado para melhor legibilidade
  - Estrutura HTML semântica correta

- **Pontos de Atenção:**
  - Dark mode forçado via classe `dark` no body (sem escolha do usuário)
  - Não há fallback de fontes caso Geist falhe
  - Metadata SEO básica, mas incompleta (falta Open Graph)

**Hierarquia tipográfica:**
- ✅ Variáveis CSS bem definidas (`--font-geist-sans`, `--font-geist-mono`)
- ✅ Antialiasing para melhor renderização

**🧠 UX & Interações**
- **Problema:** Dark mode sempre ativo não respeita preferência do usuário
- Usuário sem controle sobre aparência da aplicação
- Não respeita `prefers-color-scheme` do sistema operacional
- Falta de favicon configurado pode afetar identificação em tabs

**Fluxo de interação:**
- Sem opção de toggle de tema visível
- Sem persistência de preferência de tema

**💡 Sugestões de Melhoria Visual**

**PRIORIDADE ALTA:**
1. **Implementar theme switcher real:**
   - Usar `next-themes` para gerenciamento de tema
   - Suportar `light`, `dark` e `system`
   - Persistir escolha em localStorage
   - Remover classe `dark` hardcoded

2. **Adicionar metadata visual completa:**
   - Favicon (multiple sizes: 16x16, 32x32, 180x180)
   - Apple touch icon
   - Open Graph images para compartilhamento social
   - Theme-color meta tag

**PRIORIDADE MÉDIA:**
3. **Melhorar fallback de fontes:**
   - Adicionar fonts de sistema como fallback
   - Garantir legibilidade mesmo se Geist falhar

**⚙️ Componentes UI Sugeridos**
```tsx
import { ThemeProvider } from 'next-themes'

// No layout.tsx
<html lang="pt-BR" suppressHydrationWarning>
  <head>
    <link rel="icon" href="/favicon.ico" sizes="any" />
    <link rel="icon" href="/icon.svg" type="image/svg+xml" />
    <link rel="apple-touch-icon" href="/apple-touch-icon.png" />
    <meta name="theme-color" content="#000000" />
  </head>
  <body className={`${geistSans.variable} ${geistMono.variable} antialiased`}>
    <ThemeProvider
      attribute="class"
      defaultTheme="system"
      enableSystem
      disableTransitionOnChange
    >
      <AppProviders>
        {children}
      </AppProviders>
    </ThemeProvider>
  </body>
</html>

// Metadata completa
export const metadata: Metadata = {
  title: "App Quayer - WhatsApp Multi-Instância",
  description: "Sistema de gerenciamento de múltiplas instâncias WhatsApp",
  keywords: ["whatsapp", "multi-instância", "api", "integrações"],
  authors: [{ name: "Quayer Team" }],
  openGraph: {
    title: "App Quayer",
    description: "Sistema de gerenciamento de múltiplas instâncias WhatsApp",
    type: "website",
    locale: "pt_BR",
    images: [{ url: "/og-image.png", width: 1200, height: 630 }],
  },
  twitter: {
    card: "summary_large_image",
    title: "App Quayer",
    description: "Sistema de gerenciamento de múltiplas instâncias WhatsApp",
    images: ["/og-image.png"],
  },
  icons: {
    icon: [
      { url: "/favicon-16x16.png", sizes: "16x16", type: "image/png" },
      { url: "/favicon-32x32.png", sizes: "32x32", type: "image/png" },
    ],
    apple: "/apple-touch-icon.png",
  },
}
```

---

## Grupo Auth

### 📄 src/app/(auth)/layout.tsx

**🎨 Layout & Hierarquia Visual**
- **Pontos Fortes:**
  - Background animado com estrelas (`StarsBackground`) cria atmosfera premium
  - Z-index bem gerenciado (background z-0, content z-10)
  - Layout fullscreen (`min-h-screen`) aproveita todo viewport
  - Background preto sólido garante contraste adequado
  - Suspense com fallback de loading

- **Pontos de Atenção:**
  - Animação de estrelas pode ser pesada visualmente
  - Não respeita `prefers-reduced-motion` (acessibilidade)
  - Fallback de Suspense muito simples (apenas texto "Loading...")
  - Sem logo ou branding visível no layout

**Hierarquia visual:**
- ✅ Separação clara entre background decorativo e conteúdo funcional
- ⚠️ Falta de logo/branding consistente em todas páginas auth

**🧠 UX & Interações**
- **Pontos Fortes:**
  - Visual premium diferencia área de autenticação do resto da app
  - Consistente em todas páginas auth

- **Problemas de Acessibilidade:**
  - Animação não pode ser desabilitada por usuários sensíveis a movimento
  - Contraste pode ser afetado pela animação de fundo em alguns casos
  - Fallback de loading muito genérico

**Microinterações:**
- ✅ Estrelas com twinkle (piscada)
- ❌ Sem transição suave ao entrar/sair

**💡 Sugestões de Melhoria Visual**

**PRIORIDADE ALTA:**
1. **Respeitar preferências de movimento:**
   - Detectar `prefers-reduced-motion: reduce`
   - Desabilitar animação de estrelas se usuário preferir
   - Manter background estático como fallback

2. **Melhorar fallback de loading:**
   - Adicionar logo animado
   - Spinner profissional
   - Skeleton screen do formulário esperado

**PRIORIDADE MÉDIA:**
3. **Adicionar logo consistente:**
   - Logo centralizada acima de todos formulários
   - Âncora visual para orientação espacial
   - Reforço de branding

4. **Otimizar densidade de estrelas para mobile:**
   - Reduzir `starDensity` em telas pequenas
   - Melhorar performance em dispositivos móveis

**⚙️ Componentes UI Sugeridos**
```tsx
'use client'
import { useEffect, useState } from 'react'
import { StarsBackground } from '@/components/ui/stars-background'
import { Loader2 } from 'lucide-react'
import { Skeleton } from '@/components/ui/skeleton'
import Image from 'next/image'

export default function AuthLayout({ children }) {
  const [prefersReducedMotion, setPrefersReducedMotion] = useState(false)

  useEffect(() => {
    const mediaQuery = window.matchMedia('(prefers-reduced-motion: reduce)')
    setPrefersReducedMotion(mediaQuery.matches)

    const handler = (e: MediaQueryListEvent) => setPrefersReducedMotion(e.matches)
    mediaQuery.addEventListener('change', handler)
    return () => mediaQuery.removeEventListener('change', handler)
  }, [])

  return (
    <div className="relative min-h-screen bg-black">
      {/* Background animado apenas se usuário permitir */}
      {!prefersReducedMotion && (
        <StarsBackground
          starDensity={0.00015}
          allStarsTwinkle={true}
          twinkleProbability={0.7}
          className="z-0"
        />
      )}

      <div className="relative z-10">
        <Suspense fallback={<AuthLoadingSkeleton />}>
          {children}
        </Suspense>
      </div>
    </div>
  )
}

// Skeleton profissional para loading
function AuthLoadingSkeleton() {
  return (
    <div className="flex items-center justify-center min-h-screen p-6">
      <div className="w-full max-w-sm space-y-6">
        {/* Logo */}
        <div className="flex justify-center mb-8">
          <Skeleton className="h-8 w-32" />
        </div>

        {/* Form skeletons */}
        <div className="space-y-4">
          <Skeleton className="h-12 w-full" /> {/* Input 1 */}
          <Skeleton className="h-12 w-full" /> {/* Input 2 */}
          <Skeleton className="h-10 w-full" /> {/* Button */}
          <Skeleton className="h-4 w-48 mx-auto" /> {/* Link */}
        </div>
      </div>
    </div>
  )
}
```

---

### 📄 src/app/(auth)/login/page.tsx

**🎨 Layout & Hierarquia Visual**
- **Pontos Fortes:**
  - Layout centralizado vertical e horizontal perfeito
  - Logo bem posicionada como âncora visual
  - Max-width definido (`max-w-sm`) garante legibilidade
  - Gap spacing consistente (`gap-6`)
  - Logo com `priority` para otimização de LCP

- **Pontos de Atenção:**
  - Muito espaçamento vazio em telas grandes (poderia ter elemento visual adicional)
  - Falta heading textual (h1) para contexto e acessibilidade
  - Logo é link clicável mas leva para "/" (comportamento confuso se já autenticado)
  - Sem descrição/tagline explicativa

**Hierarquia visual:**
- ✅ Logo → Formulário (clara e linear)
- ❌ Falta de contexto textual (título + descrição)

**🧠 UX & Interações**
- **Pontos Fortes:**
  - Call-to-action único focado (login)
  - Formulário é o único elemento interativo (foco claro)

- **Problemas de UX:**
  - **Falta de heading:** Usuário não tem confirmação visual de que está na tela certa
  - **Logo como link ativo:** Pode causar navegação acidental
  - **Sem mensagem de boas-vindas:** Experiência fria e impessoal
  - **Falta de contexto:** Usuário não sabe o que esperar após login

**Fluxo esperado:**
- ✅ Simples e direto (logo → form → login)
- ❌ Falta de orientação contextual

**💡 Sugestões de Melhoria Visual**

**PRIORIDADE ALTA:**
1. **Adicionar heading e contexto:**
   - H1 com "Faça login na sua conta" ou similar
   - Parágrafo descritivo abaixo
   - Melhora acessibilidade e SEO
   - Orienta usuário sobre a ação esperada

2. **Remover link da logo OU torná-lo condicional:**
   - Logo sem link (apenas imagem decorativa)
   - OU verificar se usuário já está autenticado antes de mostrar link

**PRIORIDADE MÉDIA:**
3. **Adicionar elemento visual de apoio:**
   - Ilustração ou ícone temático
   - Screenshot do dashboard (prévia do que esperar)
   - Testemunhos ou badges de confiança

**⚙️ Componentes UI Sugeridos**
```tsx
import Image from 'next/image'
import { LoginFormFinal } from '@/components/auth/login-form-final'

export default function LoginPage() {
  return (
    <div className="flex min-h-svh flex-col items-center justify-center gap-6 p-6 md:p-10">
      <div className="flex w-full max-w-sm flex-col gap-6">
        {/* Logo e heading com contexto */}
        <div className="flex flex-col items-center gap-4 text-center">
          {/* Logo sem link (apenas decorativa) */}
          <div className="flex items-center gap-2">
            <Image
              src="/logo.svg"
              alt="Quayer"
              width={120}
              height={28}
              priority
            />
          </div>

          {/* Heading e descrição */}
          <div className="space-y-2">
            <h1 className="text-2xl font-bold tracking-tight">
              Bem-vindo de volta
            </h1>
            <p className="text-sm text-muted-foreground">
              Faça login para gerenciar suas integrações WhatsApp
            </p>
          </div>
        </div>

        {/* Formulário */}
        <LoginFormFinal />
      </div>
    </div>
  )
}
```

---

### 📄 src/app/(auth)/register/page.tsx

**🎨 Layout & Hierarquia Visual**
- **Pontos Fortes:**
  - Card com `backdrop-blur` cria efeito glassmorphism premium
  - Logo centralizada e proeminente
  - Hierarquia clara: Logo → Título → Formulário → Footer
  - Ícones nos inputs (Mail, Lock, User) melhoram affordance visual
  - Gradiente nos botões (purple → pink) cria destaque visual
  - Spacing consistente com 8pt grid

- **Pontos de Atenção:**
  - Card transparente pode ter problemas de contraste em alguns backgrounds
  - Muitos campos no formulário (4 campos + botão) pode intimidar usuário
  - Campo "Confirmar Senha" é anti-pattern moderno (aumenta fricção)
  - Falta de indicador de força de senha
  - Descrição de requisitos de senha muito simples

**Hierarquia visual:**
- ✅ Logo (topo) → Título → Formulário (middle) → Link login (bottom)
- ✅ Botão "Criar Conta" tem destaque adequado
- ⚠️ Muitos campos criam sensação de formulário longo

**🧠 UX & Interações**
- **Pontos Fortes:**
  - Validação client-side antes de envio
  - Estados de loading bem gerenciados
  - Feedback de erro centralizado no topo (Alert)
  - Link "Já tem conta?" bem posicionado
  - Hint de senha mínima abaixo do campo

- **Problemas de UX:**
  - **Campo "Confirmar Senha":** Pattern ultrapassado, aumenta fricção desnecessária
  - **Sem indicador de força de senha:** Usuário não sabe se senha é adequada
  - **Validação de senha fraca:** Apenas 8 caracteres, sem requisitos visuais
  - **Erro genérico:** "Erro ao criar conta" não ajuda usuário a corrigir
  - **Redirecionamento silencioso:** Vai para verificação sem explicar

**Microinterações:**
- ✅ Loading states com disabled inputs
- ✅ Ícones mudam de cor ao focar
- ❌ Sem feedback visual de validação inline (checkmarks verdes)
- ❌ Sem transição suave entre estados

**💡 Sugestões de Melhoria Visual**

**PRIORIDADE ALTA:**
1. **Remover campo "Confirmar Senha":**
   - Reduz fricção significativamente
   - Pattern moderno: mostrar/ocultar senha com toggle
   - Simplifica formulário de 4 para 3 campos

2. **Adicionar indicador de força de senha:**
   - Barra de progresso colorida (vermelho → laranja → verde)
   - Texto descritivo ("Fraca", "Média", "Forte")
   - Feedback visual instantâneo

3. **Melhorar validação visual inline:**
   - Checkmarks verdes ao lado de campos válidos
   - X vermelho para campos inválidos
   - Mensagens de erro específicas por campo

**PRIORIDADE MÉDIA:**
4. **Simplificar card para melhor contraste:**
   - Reduzir transparência ou remover backdrop-blur
   - Garantir contraste mínimo WCAG AA (4.5:1)

5. **Adicionar preview do próximo passo:**
   - Texto "Você receberá um código de verificação no email" antes do botão
   - Prepara expectativa do usuário

**⚙️ Componentes UI Sugeridos**
```tsx
import { PasswordInput } from '@/components/ui/password-input'
import { PasswordStrength } from '@/components/ui/password-strength'
import { CheckCircle2, XCircle } from 'lucide-react'

export default function RegisterPage() {
  const [password, setPassword] = useState('')
  const [passwordStrength, setPasswordStrength] = useState<'weak' | 'medium' | 'strong'>('weak')

  return (
    <Card className="w-full max-w-md">
      <CardHeader className="text-center">
        <Image src="/logo.svg" alt="Quayer" width={120} height={28} className="mx-auto mb-4" />
        <CardTitle className="text-2xl font-bold">Criar Conta</CardTitle>
        <CardDescription>Comece sua jornada com o Quayer</CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Nome */}
          <Field>
            <Label>Nome completo</Label>
            <div className="relative">
              <User className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="pl-10"
                required
              />
              {name.length >= 3 && (
                <CheckCircle2 className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-green-500" />
              )}
            </div>
          </Field>

          {/* Email */}
          <Field>
            <Label>E-mail</Label>
            <div className="relative">
              <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="pl-10"
                required
              />
              {isValidEmail(email) && (
                <CheckCircle2 className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-green-500" />
              )}
            </div>
          </Field>

          {/* Senha com indicador de força */}
          <Field>
            <Label>Senha</Label>
            <PasswordInput
              value={password}
              onChange={(e) => {
                setPassword(e.target.value)
                setPasswordStrength(calculateStrength(e.target.value))
              }}
              showStrengthIndicator
              strength={passwordStrength}
            />
            <PasswordStrength strength={passwordStrength} />
          </Field>

          {/* Preview do próximo passo */}
          <div className="bg-muted/50 p-3 rounded-md border border-border/50">
            <p className="text-xs text-muted-foreground">
              📧 Após criar sua conta, você receberá um código de verificação no email cadastrado.
            </p>
          </div>

          {/* Botão de submit */}
          <Button type="submit" className="w-full" disabled={isLoading}>
            {isLoading ? 'Criando conta...' : 'Criar Conta'}
          </Button>

          {/* Link para login */}
          <p className="text-center text-sm text-muted-foreground">
            Já tem uma conta?{' '}
            <Link href="/login" className="text-primary hover:underline font-medium">
              Fazer login
            </Link>
          </p>
        </form>
      </CardContent>
    </Card>
  )
}
```

---

### 📄 src/app/(auth)/forgot-password/page.tsx

**🎨 Layout & Hierarquia Visual**
- **Pontos Fortes:**
  - Layout limpo e focado (single-purpose page)
  - Logo como ponto de ancoragem visual
  - Hierarquia clara: Logo → Título → Descrição → Campo → Ação → Link voltar
  - Feedback visual de sucesso com ícone `CheckCircle2` e cor verde
  - Uso correto do `Field` component system (acessível)
  - Spacing consistente (gap-6)

- **Pontos de Atenção:**
  - Muito espaço em branco em telas grandes
  - Alert de sucesso poderia ser mais proeminente
  - Link "Voltar" duplicado (topo e rodapé)
  - Descrição genérica ("Digite seu e-mail...")

**Hierarquia visual:**
- ✅ Logo → Heading → Description → Input → Button → Footer Link
- ✅ Alert de sucesso tem cor verde semântica
- ⚠️ Link duplicado causa confusão

**🧠 UX & Interações**
- **Pontos Fortes:**
  - Fluxo linear e claro (1 campo → 1 ação)
  - Mensagem de sucesso explica próximos passos ("verificar inbox/spam")
  - Estados de botão descritivos ("Enviando..." / "E-mail enviado" / "Enviar instruções")
  - Desabilita campo e botão após sucesso (evita duplo submit)
  - Link voltar com ícone `ArrowLeft` para affordance

- **Problemas de UX:**
  - **Link duplicado:** "Lembrou sua senha?" aparece no topo e no rodapé
  - **Sem auto-redirecionamento:** Após envio, usuário precisa clicar manualmente em "Voltar"
  - **Feedback de erro genérico:** "Erro ao enviar email de recuperação" não ajuda
  - **Sem diferenciação para email não cadastrado:** Deveria ter mensagem específica

**Microinterações:**
- ✅ AutoFocus no campo de email (boa acessibilidade)
- ✅ Loading state visual
- ❌ Sem animação de transição do estado normal → sucesso
- ❌ Sem countdown visual para auto-redirect

**💡 Sugestões de Melhoria Visual**

**PRIORIDADE ALTA:**
1. **Auto-redirecionar após sucesso:**
   - Adicionar countdown de 5 segundos
   - Texto "Redirecionando para login em 5... 4... 3..."
   - Animação circular de progresso
   - Melhora fluxo e reduz cliques

2. **Remover link duplicado do rodapé:**
   - Manter apenas o link do topo (parte do título)
   - Reduz ruído visual e confusão

3. **Melhorar mensagem de sucesso:**
   - Card destacado ao invés de Alert simples
   - Ilustração de envelope
   - Botão "Ir para Login" ao invés de link

**PRIORIDADE MÉDIA:**
4. **Adicionar ilustração visual:**
   - Ícone de cadeado esquecido
   - Envelope com seta
   - Humaniza experiência

5. **Mensagem específica para email não cadastrado:**
   - "Este e-mail não está cadastrado. Deseja criar uma conta?"
   - Link para registro

**⚙️ Componentes UI Sugeridos**
```tsx
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { CheckCircle2, ArrowLeft, Mail } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Progress } from '@/components/ui/progress'

export default function ForgotPasswordPage() {
  const router = useRouter()
  const [countdown, setCountdown] = useState(5)

  // Auto-redirect após sucesso
  useEffect(() => {
    if (success && countdown > 0) {
      const timer = setTimeout(() => {
        setCountdown(countdown - 1)
      }, 1000)
      return () => clearTimeout(timer)
    } else if (success && countdown === 0) {
      router.push('/login')
    }
  }, [success, countdown, router])

  if (success) {
    return (
      <div className="flex min-h-svh items-center justify-center p-6">
        <Card className="w-full max-w-md">
          <CardHeader className="text-center">
            <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-green-500/10">
              <CheckCircle2 className="h-8 w-8 text-green-500" />
            </div>
            <CardTitle className="text-2xl text-green-600">E-mail enviado!</CardTitle>
            <CardDescription>
              Verifique sua caixa de entrada (e spam também) para redefinir sua senha.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Progress bar de countdown */}
            <div className="space-y-2">
              <Progress value={(countdown / 5) * 100} className="h-2" />
              <p className="text-center text-sm text-muted-foreground">
                Redirecionando para login em {countdown} segundo{countdown !== 1 ? 's' : ''}...
              </p>
            </div>

            <Button onClick={() => router.push('/login')} className="w-full">
              Ir para Login Agora
            </Button>
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div className="flex min-h-svh items-center justify-center p-6">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-primary/10">
            <Mail className="h-8 w-8 text-primary" />
          </div>
          <div className="space-y-2">
            <Link href="/login" className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors">
              <ArrowLeft className="h-4 w-4" />
              Voltar para login
            </Link>
            <CardTitle className="text-2xl">Esqueceu sua senha?</CardTitle>
            <CardDescription>
              Digite seu e-mail e enviaremos instruções para redefinir sua senha.
            </CardDescription>
          </div>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            {error && (
              <Alert variant="destructive">
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}

            <Field>
              <Label htmlFor="email">E-mail</Label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  id="email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="pl-10"
                  placeholder="seu@email.com"
                  autoFocus
                  required
                />
              </div>
            </Field>

            <Button type="submit" className="w-full" disabled={isLoading}>
              {isLoading ? 'Enviando...' : 'Enviar Instruções'}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}
```

---

### 📄 src/app/(auth)/login/verify/page.tsx

**🎨 Layout & Hierarquia Visual**
- **Pontos Fortes:**
  - Layout consistente com outras páginas de auth
  - Logo centralizada mantém identidade visual
  - Uso correto de Suspense para progressive loading

- **Pontos de Atenção:**
  - Página muito simples, delega tudo para `LoginOTPForm`
  - Falta de contexto visual (heading, descrição)
  - Fallback de Suspense muito básico ("Loading...")
  - Sem indicação clara de que código foi enviado
  - Falta de visual cues sobre o que esperar

**Hierarquia visual:**
- ⚠️ Apenas Logo → Form (muito minimalista)
- ❌ Falta heading explicativo
- ❌ Falta confirmação de que email foi enviado

**🧠 UX & Interações**
- **Problemas de UX:**
  - **Falta de contexto:** Usuário chega aqui via redirect mas não sabe exatamente o que fazer
  - **Email não visível inicialmente:** Usuário não vê para qual email o código foi enviado até carregar
  - **Sem opção de reenviar código visível desde o início**
  - **Fallback genérico:** "Loading..." não explica o que está carregando
  - **Sem validação de email na URL:** Se email não foi passado, erro silencioso

**Fluxo esperado:**
- ❌ Usuário é redirecionado para cá mas sem contexto adequado
- ❌ Falta de feedback de que processo está correndo bem

**💡 Sugestões de Melhoria Visual**

**PRIORIDADE ALTA:**
1. **Adicionar contexto e confirmação:**
   - Heading "Verifique seu código"
   - Ícone de envelope
   - Texto "Enviamos um código de 6 dígitos para **{email}**"
   - Botão "Não recebeu? Reenviar código" visível desde o início

2. **Validar presença de email:**
   - Se email não existe na URL, mostrar erro amigável
   - Botão para voltar ao login
   - Evita estado quebrado

3. **Melhorar fallback de Suspense:**
   - Skeleton do form OTP
   - Spinner com texto "Preparando verificação..."

**PRIORIDADE MÉDIA:**
4. **Adicionar indicador visual de progresso:**
   - Step indicator: "2 de 3 - Verificação"
   - Ajuda usuário entender onde está no fluxo

**⚙️ Componentes UI Sugeridos**
```tsx
'use client'
import { Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import Image from 'next/image'
import Link from 'next/link'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { Mail, ArrowLeft } from 'lucide-react'
import { LoginOTPForm } from '@/components/auth/login-otp-form'

function LoginVerifyContent() {
  const searchParams = useSearchParams()
  const email = searchParams.get('email')

  // Validação: email deve existir
  if (!email) {
    return (
      <div className="flex min-h-svh items-center justify-center p-6">
        <Card className="w-full max-w-md">
          <CardHeader className="text-center">
            <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-destructive/10">
              <Mail className="h-8 w-8 text-destructive" />
            </div>
            <CardTitle className="text-2xl text-destructive">Link inválido</CardTitle>
            <CardDescription>
              O email não foi fornecido. Por favor, inicie o processo de login novamente.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button asChild className="w-full">
              <Link href="/login">
                <ArrowLeft className="mr-2 h-4 w-4" />
                Voltar para Login
              </Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div className="flex min-h-svh flex-col items-center justify-center gap-6 p-6 md:p-10">
      <div className="flex w-full max-w-md flex-col gap-6">
        {/* Logo */}
        <Link href="/login" className="flex items-center gap-2 self-center font-medium hover:opacity-80 transition-opacity">
          <Image src="/logo.svg" alt="Quayer" width={120} height={28} priority />
        </Link>

        {/* Card com contexto */}
        <Card>
          <CardHeader className="text-center space-y-4">
            <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-primary/10">
              <Mail className="h-8 w-8 text-primary" />
            </div>
            <div className="space-y-2">
              <CardTitle className="text-2xl font-bold">Verifique seu código</CardTitle>
              <CardDescription className="text-base">
                Enviamos um código de <strong>6 dígitos</strong> para
                <br />
                <strong className="text-foreground">{email}</strong>
              </CardDescription>
            </div>
          </CardHeader>
          <CardContent>
            {/* Form OTP */}
            <LoginOTPForm email={email} />
          </CardContent>
        </Card>

        {/* Link voltar */}
        <Link
          href="/login"
          className="text-center text-sm text-muted-foreground hover:text-foreground transition-colors inline-flex items-center justify-center gap-2"
        >
          <ArrowLeft className="h-4 w-4" />
          Voltar para login
        </Link>
      </div>
    </div>
  )
}

export default function LoginVerifyPage() {
  return (
    <Suspense fallback={<LoginVerifySkeleton />}>
      <LoginVerifyContent />
    </Suspense>
  )
}

function LoginVerifySkeleton() {
  return (
    <div className="flex min-h-svh items-center justify-center p-6">
      <div className="w-full max-w-md space-y-6">
        <Skeleton className="h-8 w-32 mx-auto" /> {/* Logo */}
        <Card>
          <CardHeader className="text-center space-y-4">
            <Skeleton className="h-16 w-16 rounded-full mx-auto" />
            <Skeleton className="h-8 w-48 mx-auto" />
            <Skeleton className="h-12 w-full" />
          </CardHeader>
          <CardContent>
            <Skeleton className="h-12 w-full mb-4" />
            <Skeleton className="h-10 w-full" />
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
```

---

### 📄 src/app/(auth)/login/verify-magic/page.tsx

**🎨 Layout & Hierarquia Visual**
- **Pontos Fortes:**
  - Card centralizado com visual clean
  - Ícones grandes para feedback visual (Loader2, CheckCircle2, XCircle)
  - Cores semânticas: verde para sucesso, vermelho para erro
  - Textos descritivos para cada estado
  - Spacing consistente dentro do card

- **Pontos de Atenção:**
  - Layout muito genérico, sem branding (falta logo)
  - Estados visuais poderiam ter mais personalidade
  - Transição entre estados é abrupta (sem animação)
  - Card com fundo padrão (poderia ter glassmorphism como outras páginas auth)

**Hierarquia visual:**
- ✅ Ícone → Título → Descrição → Ação (bem estruturado)
- ⚠️ Falta logo/branding para contexto
- ✅ Estados bem diferenciados visualmente

**🧠 UX & Interações**
- **Pontos Fortes:**
  - Estados bem definidos ('verifying' | 'success' | 'error')
  - Verificação automática (sem ação do usuário)
  - Timeout de 1.5s antes de redirecionar (tempo para ler mensagem)
  - Mensagem de erro específica
  - Botão de fallback para voltar ao login

- **Problemas de UX:**
  - **Estado de verifying genérico:** "Verificando..." poderia ser mais explicativo
  - **Sem opção de obter novo link se expirado:** Usuário fica sem ação clara
  - **Redirecionamento sem aviso:** Timeout de 1.5s pode ser curto para ler
  - **Sem indicador de progresso:** Usuário não sabe quanto tempo falta

**Microinterações:**
- ✅ Ícones animados (Loader2 com spin)
- ❌ Sem transição suave entre estados
- ❌ Sem countdown visual antes do redirect
- ❌ Sem feedback sonoro ou haptic (mobile)

**💡 Sugestões de Melhoria Visual**

**PRIORIDADE ALTA:**
1. **Adicionar logo e branding:**
   - Logo no topo do card
   - Melhora reconhecimento e confiança
   - Consistência com outras páginas auth

2. **Melhorar estado de verificação:**
   - Texto "Verificando seu link mágico..."
   - Progresso circular animado
   - Dica: "Isso levará apenas alguns segundos"

3. **Adicionar countdown visual antes de redirect:**
   - Progress bar ou circular progress
   - Texto "Redirecionando em 3... 2... 1..."
   - Aumentar timeout para 3 segundos

**PRIORIDADE MÉDIA:**
4. **Adicionar opção de solicitar novo link:**
   - No estado de erro, botão "Solicitar novo link mágico"
   - Evita frustração do usuário
   - Melhora recovery de erro

5. **Animações de transição entre estados:**
   - Fade out/in ao mudar de estado
   - Scale animation no ícone de sucesso
   - Shake animation no ícone de erro

**⚙️ Componentes UI Sugeridos**
```tsx
'use client'
import { useState, useEffect } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { Loader2, CheckCircle2, XCircle } from 'lucide-react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Progress } from '@/components/ui/progress'
import Image from 'next/image'
import Link from 'next/link'
import { api } from '@/igniter.client'

export default function VerifyMagicLinkPage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const token = searchParams.get('token')

  const [status, setStatus] = useState<'verifying' | 'success' | 'error'>('verifying')
  const [error, setError] = useState('')
  const [countdown, setCountdown] = useState(3)

  // Auto-verificação
  useEffect(() => {
    if (token) {
      verifyMagicLink()
    } else {
      setStatus('error')
      setError('Token não fornecido')
    }
  }, [token])

  // Countdown após sucesso
  useEffect(() => {
    if (status === 'success' && countdown > 0) {
      const timer = setTimeout(() => {
        setCountdown(countdown - 1)
      }, 1000)
      return () => clearTimeout(timer)
    } else if (status === 'success' && countdown === 0) {
      // Redirecionar
      router.push(redirectPath)
    }
  }, [status, countdown])

  const verifyMagicLink = async () => {
    try {
      const { data, error: apiError } = await api.auth.verifyMagicLink.mutate({
        body: { token }
      })

      if (apiError || !data) {
        throw new Error('Magic link inválido ou expirado')
      }

      setStatus('success')
    } catch (err: any) {
      setStatus('error')
      setError(err.message || 'Link inválido ou expirado')
    }
  }

  return (
    <div className="flex min-h-svh items-center justify-center p-6 bg-gradient-to-br from-background via-background to-primary/5">
      <Card className="w-full max-w-md shadow-lg">
        {/* Logo */}
        <div className="flex justify-center pt-6">
          <Image src="/logo.svg" alt="Quayer" width={120} height={28} />
        </div>

        <CardHeader className="text-center space-y-4 pt-6">
          {status === 'verifying' && (
            <>
              <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-full bg-primary/10 animate-pulse">
                <Loader2 className="h-10 w-10 animate-spin text-primary" />
              </div>
              <div className="space-y-2">
                <CardTitle className="text-2xl">Verificando...</CardTitle>
                <CardDescription>
                  Estamos validando seu link mágico.
                  <br />
                  Isso levará apenas alguns segundos.
                </CardDescription>
              </div>
            </>
          )}

          {status === 'success' && (
            <>
              <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-full bg-green-500/10 animate-in zoom-in duration-300">
                <CheckCircle2 className="h-10 w-10 text-green-500" />
              </div>
              <div className="space-y-2">
                <CardTitle className="text-2xl text-green-600">Login realizado!</CardTitle>
                <CardDescription>
                  Você será redirecionado em breve.
                </CardDescription>
              </div>
            </>
          )}

          {status === 'error' && (
            <>
              <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-full bg-red-500/10 animate-in shake duration-300">
                <XCircle className="h-10 w-10 text-red-500" />
              </div>
              <div className="space-y-2">
                <CardTitle className="text-2xl text-red-600">Erro na verificação</CardTitle>
                <CardDescription className="text-red-500/80">{error}</CardDescription>
              </div>
            </>
          )}
        </CardHeader>

        <CardContent className="space-y-4">
          {status === 'success' && (
            <>
              <Progress value={((3 - countdown) / 3) * 100} className="h-2" />
              <p className="text-center text-sm text-muted-foreground">
                Redirecionando em {countdown}...
              </p>
            </>
          )}

          {status === 'error' && (
            <div className="flex flex-col gap-2">
              <Button onClick={() => router.push('/login')} className="w-full">
                Fazer login novamente
              </Button>
              <Button
                onClick={() => router.push('/forgot-password')}
                variant="outline"
                className="w-full"
              >
                Solicitar novo link
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
```

---

## Grupo Public

### 📄 src/app/(public)/connect/[token]/page.tsx

**🎨 Layout & Hierarquia Visual**
- **Pontos Fortes:**
  - **Card centralizado com shadow-lg:** Destaque visual adequado
  - **Hierarquia clara:** Título → QR Code → Timer → Instruções → Ação
  - **QR Code bem enquadrado:** Border de 4px, padding 6, background branco, border-radius
  - **Timer com ícone Clock:** Affordance visual clara
  - **Instruções numeradas com círculos coloridos:** Excelente UX pedagógico
  - **Estados visuais distintos:** Validating, Loading, QR, Success, Error (cada um com ícone específico)
  - **Cores semânticas:** Verde para conectado, vermelho para erro, azul para info

- **Pontos de Atenção:**
  - Título "App Quayer" centralizado poderia ter logo visual
  - QR Code em imagem `<Image>` com `unoptimized` (não é ideal)
  - Timer muda de cor apenas nos últimos 30s (poderia ter mais granularidade)
  - Card pode ficar apertado em mobile com QR grande (300x300)

**Hierarquia visual:**
- ✅ Título/Logo → QR Code (destaque central) → Timer → Instruções → Botão refresh
- ✅ Círculos numerados com cor primary criam sequência visual clara
- ✅ Icons grandes (h-12 w-12) para estados de validação/loading/sucesso/erro

**🧠 UX & Interações**
- **Pontos Fortes:**
  - **Instruções passo-a-passo detalhadas:** 5 passos com círculos numerados
  - **Timer com countdown:** Usuário sabe quanto tempo tem (2 minutos)
  - **Botão "Atualizar QR Code" aparece apenas quando expira:** Evita ações acidentais
  - **Polling automático a cada 3s:** Detecta conexão automaticamente
  - **Estados de loading e validação:** Feedback visual constante
  - **Mensagem de erro específica:** "Link expirado" ou mensagem de API
  - **Alert de erro com contexto:** Explica que link pode estar inválido

- **Problemas de UX:**
  - **Timer linear:** Não há urgência visual crescente (poderia piscar ou mudar cor gradualmente)
  - **QR Code sem loading skeleton:** Durante geração, não há placeholder
  - **Instruções sempre visíveis:** Ocupam muito espaço, poderiam ser colapsáveis após primeira visualização
  - **Sem opção de copiar link:** Caso usuário queira compartilhar de outra forma
  - **Polling a cada 3s pode ser agressivo:** Poderia aumentar intervalo gradualmente

**Microinterações:**
- ✅ Icons animados (Loader2 com spin)
- ✅ Countdown em tempo real
- ✅ Mudança de cor do timer quando <30s
- ❌ Sem animação ao trocar de estado
- ❌ Sem feedback visual ao expirar (poderia tremer ou pulsar)
- ❌ Sem celebração ao conectar com sucesso (apenas ícone estático)

**💡 Sugestões de Melhoria Visual**

**PRIORIDADE ALTA:**
1. **Adicionar logo visual ao invés de apenas texto:**
   - Substituir "App Quayer" por logo SVG
   - Melhora branding e profissionalismo

2. **Melhorar urgência visual do timer:**
   - <60s: Texto laranja
   - <30s: Texto vermelho + ícone pulsando
   - <10s: Animação de shake + som (opcional)

3. **Adicionar skeleton para QR Code:**
   - Enquanto gera, mostrar placeholder com pulse
   - Evita sensação de página quebrada

**PRIORIDADE MÉDIA:**
4. **Tornar instruções colapsáveis:**
   - Accordeon "Como conectar?" que inicia expandido
   - Após primeira visualização (cookie/localStorage), iniciar colapsado
   - Economiza espaço em tela

5. **Melhorar estado de sucesso:**
   - Animação de confetti ou check animado
   - Som de sucesso (opcional com toggle)
   - Celebra conquista do usuário

6. **Otimizar QR Code para mobile:**
   - Reduzir size para 250x250 em telas <md
   - Melhorar responsividade do card

**⚙️ Componentes UI Sugeridos**
```tsx
import Image from 'next/image'
import { Clock, CheckCircle2, XCircle, Loader2, RefreshCw } from 'lucide-react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Skeleton } from '@/components/ui/skeleton'
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion'
import confetti from 'canvas-confetti'

export default function ConnectPage() {
  const [step, setStep] = useState<'validating' | 'loading' | 'qr' | 'success' | 'error'>('validating')
  const [qrCode, setQrCode] = useState<string | null>(null)
  const [timeLeft, setTimeLeft] = useState(120)

  // Função para celebrar sucesso
  const celebrateSuccess = () => {
    confetti({
      particleCount: 100,
      spread: 70,
      origin: { y: 0.6 }
    })
  }

  // Cor do timer baseada no tempo restante
  const getTimerColor = () => {
    if (timeLeft < 10) return 'text-red-600 animate-pulse'
    if (timeLeft < 30) return 'text-red-500'
    if (timeLeft < 60) return 'text-orange-500'
    return 'text-muted-foreground'
  }

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <Card className="w-full max-w-lg border-border/50 shadow-lg">
        <CardHeader className="text-center space-y-2">
          {/* Logo ao invés de texto */}
          <div className="flex justify-center mb-2">
            <Image src="/logo.svg" alt="Quayer" width={140} height={32} priority />
          </div>
          <CardDescription className="text-lg">
            Conectar WhatsApp - {instanceName}
          </CardDescription>
        </CardHeader>

        <CardContent className="space-y-6">
          {/* QR Code State */}
          {step === 'qr' && (
            <div className="space-y-6">
              {/* QR Code Display com skeleton durante loading */}
              <div className="flex justify-center">
                {qrCode ? (
                  <div className="relative p-6 bg-white rounded-xl shadow-inner border-4 border-primary/20 transition-all hover:border-primary/40">
                    <Image
                      src={qrCode}
                      alt="QR Code"
                      width={300}
                      height={300}
                      className="rounded-lg"
                      unoptimized
                    />
                  </div>
                ) : (
                  <Skeleton className="h-[348px] w-[348px] rounded-xl" />
                )}
              </div>

              {/* Timer com cores dinâmicas */}
              <div className="flex items-center justify-center gap-2 text-lg font-medium">
                <Clock className={`h-5 w-5 ${timeLeft < 10 ? 'animate-bounce' : ''}`} />
                <span className={getTimerColor()}>
                  Expira em: {formatTime(timeLeft)}
                </span>
              </div>

              {/* Instruções colapsáveis */}
              <Accordion type="single" collapsible defaultValue="instructions">
                <AccordionItem value="instructions" className="border rounded-lg">
                  <AccordionTrigger className="px-4 hover:no-underline">
                    <h3 className="font-semibold text-lg flex items-center gap-2">
                      📱 Como conectar
                    </h3>
                  </AccordionTrigger>
                  <AccordionContent className="px-4 pb-4">
                    <ol className="space-y-3 text-sm text-muted-foreground">
                      {[
                        'Abra o WhatsApp no seu celular',
                        'Toque em Menu ou Configurações',
                        'Selecione Dispositivos conectados',
                        'Toque em Conectar um dispositivo',
                        'Aponte a câmera para este QR Code'
                      ].map((instruction, idx) => (
                        <li key={idx} className="flex gap-3">
                          <span className="flex-shrink-0 w-6 h-6 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-xs font-bold">
                            {idx + 1}
                          </span>
                          <span>{instruction}</span>
                        </li>
                      ))}
                    </ol>
                  </AccordionContent>
                </AccordionItem>
              </Accordion>

              {/* Refresh Button apenas quando expirado */}
              {timeLeft === 0 && (
                <Button
                  onClick={handleRefresh}
                  className="w-full bg-primary hover:bg-primary/90"
                  size="lg"
                >
                  <RefreshCw className="mr-2 h-5 w-5" />
                  Atualizar QR Code
                </Button>
              )}
            </div>
          )}

          {/* Success State com celebração */}
          {step === 'success' && (
            <div className="flex flex-col items-center justify-center py-12 space-y-4">
              <div className="rounded-full bg-green-500/10 p-6 animate-in zoom-in duration-500">
                <CheckCircle2 className="h-16 w-16 text-green-500" />
              </div>
              <div className="text-center space-y-2">
                <h3 className="text-2xl font-bold text-green-600">Conectado! 🎉</h3>
                <p className="text-muted-foreground">
                  WhatsApp conectado com sucesso
                </p>
              </div>
            </div>
          )}

          {/* Outros estados... */}
        </CardContent>
      </Card>
    </div>
  )
}
```

---

### 📄 src/app/(public)/conversas/page.tsx

**🎨 Layout & Hierarquia Visual**
- **Pontos Fortes:**
  - **Layout de chat/mensageiro familiar:** Sidebar (lista) + Main (detalhes) = padrão WhatsApp Web
  - **Hierarquia clara na sidebar:** Header → Busca → Tabs → Lista → Footer
  - **Cards de instância bem desenhados:** Avatar colorido (verde/cinza) + Nome + Status + Badge de alerta
  - **Empty states duplos:** Sem instâncias na lista + Sem instância selecionada (ambos bem ilustrados)
  - **Tabs com underline na ativa:** Visual moderno (border-b-2 no state active)
  - **Avatar semântico:** Verde para conectado, cinza para desconectado
  - **Badge de alerta:** "!" vermelho para instâncias desconectadas

- **Pontos de Atenção:**
  - **Layout horizontal não é responsivo:** Sidebar + Main lado a lado quebra em mobile
  - **Sidebar fixa em 320px (w-80):** Não adapta para telas menores
  - **Main ocupa resto do espaço:** Pode ficar muito largo em telas grandes
  - **Footer com "End of list":** Texto genérico e desnecessário
  - **Sem padding lateral na lista:** Items vão até a borda

**Hierarquia visual:**
- ✅ Sidebar: Header (título + ação) → Search → Tabs → Lista → Footer
- ✅ Main: Header (instância selecionada + ações) → Mensagens → Input
- ✅ Empty states bem ilustrados com ícones grandes
- ⚠️ Muito conteúdo em telas pequenas

**🧠 UX & Interações**
- **Pontos Fortes:**
  - **UX de mensageiro familiar:** Similar a WhatsApp Web, fácil de entender
  - **Feedback visual rico:** Cores, ícones, badges, avatares
  - **Tabs com contadores:** "Conectadas (5)" ajuda usuário
  - **Empty states informativos:** Explicam próximos passos
  - **Search com ícone interno:** Affordance clara
  - **Hora de atualização relativa:** "há 5 min" (date-fns)
  - **Dropdown de ações na header do chat:** Ver Detalhes, Conectar, Editar, Compartilhar, Deletar

- **Problemas de UX:**
  - **Layout quebrado em mobile:** Sidebar + Main não colapsam
  - **Sem modo mobile:** Lista e detalhes devem alternar, não coexistir
  - **Footer "End of list" inútil:** Não agrega valor
  - **Muitos cliques para conectar:** Selecionar instância → Dropdown → Clicar conectar → Modal
  - **Ações do dropdown não funcionam:** Todos os items são stubs (TODO)
  - **Área de mensagens vazia:** Sem integração real com mensagens
  - **Input de mensagem desabilitado se desconectado:** Correto, mas poderia ter mensagem mais clara

**Microinterações:**
- ✅ Hover na lista de instâncias muda background (`hover:bg-accent`)
- ✅ Instância selecionada tem background destacado (`bg-accent`)
- ✅ Avatar muda cor baseado em status
- ✅ Badge de alerta pulsa (poderia ter animation)
- ❌ Sem transição suave ao selecionar instância
- ❌ Sem feedback visual ao enviar mensagem
- ❌ Sem indicador de "digitando..."

**💡 Sugestões de Melhoria Visual**

**PRIORIDADE CRÍTICA:**
1. **Tornar layout responsivo:**
   - Em mobile (<md), mostrar apenas lista OU detalhes
   - Tabs para alternar entre "Lista" e "Chat"
   - Botão "Voltar" no header do chat para voltar à lista
   - Usar full width em ambos os modos

2. **Implementar ações do dropdown:**
   - Ver Detalhes → Modal com informações da instância
   - Conectar/Reconectar → Modal de conexão com QR
   - Editar → Modal de edição
   - Compartilhar → Modal de compartilhamento
   - Deletar → AlertDialog de confirmação

**PRIORIDADE ALTA:**
3. **Remover footer "End of list":**
   - Substituir por contador: "{filteredInstances.length} conversação(ões)"
   - Ou remover completamente se não agrega valor

4. **Adicionar atalho rápido para conectar:**
   - Botão "Conectar" direto no card da lista (se desconectado)
   - Reduz cliques: de 4 para 2

5. **Melhorar área de mensagens:**
   - Adicionar skeleton de mensagens
   - Mostrar "Carregando mensagens..." com loader
   - Empty state mais visual (ilustração)

**PRIORIDADE MÉDIA:**
6. **Adicionar microinterações:**
   - Animação de transição ao selecionar instância
   - Pulse animation no badge de alerta
   - Shake animation se tentar enviar com input vazio
   - Toast de sucesso ao enviar mensagem

7. **Melhorar feedback de input desabilitado:**
   - Tooltip ao hover: "Conecte a instância para enviar mensagens"
   - Botão "Conectar agora" dentro do input area

**⚙️ Componentes UI Sugeridos**
```tsx
'use client'
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { Textarea } from '@/components/ui/textarea'
import { cn } from '@/lib/utils'

export default function ConversasPage() {
  const [selectedInstance, setSelectedInstance] = useState<Instance | null>(null)
  const [mobileView, setMobileView] = useState<'list' | 'chat'>('list')

  return (
    <div className="flex flex-col md:flex-row h-screen">
      {/* Mobile: Tabs para alternar */}
      <div className="md:hidden border-b">
        <Tabs value={mobileView} onValueChange={(v) => setMobileView(v as any)}>
          <TabsList className="w-full grid grid-cols-2">
            <TabsTrigger value="list">
              📋 Lista ({filteredInstances.length})
            </TabsTrigger>
            <TabsTrigger value="chat" disabled={!selectedInstance}>
              💬 Chat
            </TabsTrigger>
          </TabsList>
        </Tabs>
      </div>

      {/* Sidebar - Sempre visível em desktop, condicional em mobile */}
      <aside className={cn(
        "w-full md:w-80 border-r flex flex-col bg-background",
        mobileView === 'chat' && 'hidden md:flex'
      )}>
        {/* Header */}
        <div className="p-4 border-b">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-semibold text-lg">Conversações</h2>
            {canCreateInstance && (
              <Button size="icon" variant="ghost">
                <Plus className="h-5 w-5" />
              </Button>
            )}
          </div>

          {/* Busca */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Buscar..."
              className="pl-10"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
        </div>

        {/* Tabs de Filtro */}
        <div className="border-b">
          <Tabs value={filter} onValueChange={(v) => setFilter(v as FilterType)}>
            <TabsList className="w-full justify-start h-auto p-0 bg-transparent rounded-none">
              <TabsTrigger
                value="all"
                className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary"
              >
                Todas
              </TabsTrigger>
              <TabsTrigger value="connected">
                Conectadas ({stats.connected})
              </TabsTrigger>
              <TabsTrigger value="disconnected">
                Desconectadas ({stats.disconnected})
              </TabsTrigger>
            </TabsList>
          </Tabs>
        </div>

        {/* Lista de Conversas */}
        <div className="flex-1 overflow-y-auto">
          {filteredInstances.map((instance) => (
            <div
              key={instance.id}
              className={cn(
                "flex items-center gap-3 p-3 cursor-pointer border-b",
                "hover:bg-accent transition-colors",
                selectedInstance?.id === instance.id && 'bg-accent'
              )}
              onClick={() => {
                setSelectedInstance(instance)
                // Mobile: mudar para view de chat
                if (window.innerWidth < 768) {
                  setMobileView('chat')
                }
              }}
            >
              <Avatar className="h-12 w-12">
                <AvatarFallback className={instance.status === 'connected' ? 'bg-green-500 text-white' : 'bg-gray-500 text-white'}>
                  <Phone className="h-5 w-5" />
                </AvatarFallback>
              </Avatar>

              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between mb-1">
                  <p className="font-semibold truncate">{instance.name}</p>
                  <div className="flex items-center gap-1">
                    <StatusBadge status={instance.status} size="sm" />
                    {instance.status === 'disconnected' && (
                      <>
                        <Badge variant="destructive" className="h-5 w-5 rounded-full p-0 flex items-center justify-center animate-pulse">
                          !
                        </Badge>
                        {/* Atalho rápido para conectar */}
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-6 w-6"
                          onClick={(e) => {
                            e.stopPropagation()
                            handleConnect(instance)
                          }}
                        >
                          <Plug className="h-3 w-3" />
                        </Button>
                      </>
                    )}
                  </div>
                </div>

                <div className="flex items-center justify-between">
                  <p className="text-sm text-muted-foreground truncate">
                    {instance.phoneNumber || 'Não configurado'}
                  </p>
                  <span className="text-xs text-muted-foreground whitespace-nowrap ml-2">
                    {formatDistanceToNow(new Date(instance.updatedAt), {
                      addSuffix: false,
                      locale: ptBR,
                    })}
                  </span>
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* Footer com contador */}
        <div className="p-2 text-center text-xs text-muted-foreground border-t">
          {filteredInstances.length} conversação(ões)
        </div>
      </aside>

      {/* Main - Sempre visível em desktop, condicional em mobile */}
      <main className={cn(
        "flex-1 flex flex-col bg-background",
        mobileView === 'list' && 'hidden md:flex'
      )}>
        {!selectedInstance ? (
          // Empty State
          <div className="flex-1 flex flex-col items-center justify-center p-8 text-center">
            <div className="rounded-full bg-muted p-8 mb-4">
              <Phone className="h-16 w-16 text-muted-foreground" />
            </div>
            <h3 className="font-semibold text-xl mb-2">
              Escolha um contato
            </h3>
            <p className="text-muted-foreground max-w-md">
              Selecione uma conversa na lista para visualizar mensagens
            </p>
          </div>
        ) : (
          // Chat Ativo
          <div className="flex-1 flex flex-col h-full">
            {/* Header do Chat */}
            <div className="border-b p-4 flex items-center justify-between bg-accent/50">
              {/* Botão voltar apenas em mobile */}
              <div className="flex items-center gap-3">
                <Button
                  variant="ghost"
                  size="icon"
                  className="md:hidden"
                  onClick={() => setMobileView('list')}
                >
                  <ArrowLeft className="h-5 w-5" />
                </Button>

                <Avatar className="h-10 w-10">
                  <AvatarFallback className={selectedInstance.status === 'connected' ? 'bg-green-500 text-white' : 'bg-gray-500 text-white'}>
                    <Phone className="h-5 w-5" />
                  </AvatarFallback>
                </Avatar>
                <div>
                  <h3 className="font-semibold">{selectedInstance.name}</h3>
                  <p className="text-sm text-muted-foreground">
                    {selectedInstance.phoneNumber || 'Não configurado'}
                  </p>
                </div>
              </div>

              {/* Dropdown de ações */}
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="icon">
                    <MoreVertical className="h-5 w-5" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem onClick={() => handleDetails(selectedInstance)}>
                    <Phone className="mr-2 h-4 w-4" />
                    Ver Detalhes
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => handleConnect(selectedInstance)}>
                    <Plug className="mr-2 h-4 w-4" />
                    {selectedInstance.status === 'connected' ? 'Reconectar' : 'Conectar'}
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => handleEdit(selectedInstance)}>
                    <Edit className="mr-2 h-4 w-4" />
                    Editar
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => handleShare(selectedInstance)}>
                    <Share2 className="mr-2 h-4 w-4" />
                    Compartilhar
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={() => handleDelete(selectedInstance)} className="text-destructive">
                    <Trash2 className="mr-2 h-4 w-4" />
                    Deletar
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>

            {/* Área de Mensagens */}
            <div className="flex-1 p-6 overflow-y-auto bg-muted/20">
              {selectedInstance.status === 'disconnected' ? (
                <div className="max-w-2xl mx-auto">
                  <Alert variant="destructive">
                    <AlertCircle className="h-4 w-4" />
                    <AlertDescription>
                      Esta instância está desconectada. Reconecte para visualizar e enviar mensagens.
                    </AlertDescription>
                  </Alert>
                </div>
              ) : (
                <div className="max-w-3xl mx-auto">
                  {/* Empty State - Sem mensagens ainda */}
                  <div className="text-center py-12">
                    <div className="rounded-full bg-muted p-6 mx-auto w-fit mb-4">
                      <Send className="h-8 w-8 text-muted-foreground" />
                    </div>
                    <p className="text-muted-foreground">
                      Nenhuma mensagem ainda. Envie a primeira mensagem!
                    </p>
                  </div>
                </div>
              )}
            </div>

            {/* Input de Mensagem */}
            <div className="border-t p-4 bg-background">
              <div className="max-w-3xl mx-auto">
                {selectedInstance.status !== 'connected' ? (
                  <div className="text-center space-y-2">
                    <p className="text-sm text-muted-foreground">
                      Instância desconectada - Conecte para enviar mensagens
                    </p>
                    <Button onClick={() => handleConnect(selectedInstance)} size="sm">
                      <Plug className="mr-2 h-4 w-4" />
                      Conectar Agora
                    </Button>
                  </div>
                ) : (
                  <div className="flex gap-2">
                    <Textarea
                      placeholder="Digite uma mensagem..."
                      className="min-h-[60px] max-h-[200px] resize-none"
                      value={message}
                      onChange={(e) => setMessage(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' && !e.shiftKey) {
                          e.preventDefault()
                          handleSendMessage()
                        }
                      }}
                    />
                    <Button
                      size="icon"
                      className="h-[60px] w-[60px]"
                      onClick={handleSendMessage}
                      disabled={!message.trim()}
                    >
                      <Send className="h-5 w-5" />
                    </Button>
                  </div>
                )}
                <p className="text-xs text-muted-foreground text-center mt-2">
                  Pressione Enter para enviar, Shift+Enter para nova linha
                </p>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  )
}
```

---

*[Continuação em próxima mensagem devido ao limite de caracteres - Total de ~50.000 caracteres até aqui]*

**Status:** 25% completo (8 de 31 páginas avaliadas)

---

## Resumo Executivo

[Será completado ao final da análise]

## Top 10 Melhorias Prioritárias

[Será completado ao final da análise]

---

**Próximas seções a serem analisadas:**
- ✅ Root (2 páginas) - Completo
- ✅ Auth (primeiras 7 de 12 páginas) - Em progresso
- ⏳ Auth (restantes 5 páginas)
- ⏳ Public (2 páginas) - Em progresso (1 de 2 completas)
- ⏳ Admin (9 páginas)
- ⏳ Integrações (4 páginas)
- ⏳ User (1 página)
