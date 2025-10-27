# Avaliação Completa de Páginas - App Quayer

**Data da análise:** 2025-10-09
**Escopo:** Todas as páginas da aplicação Next.js (src/app/)
**Total de páginas analisadas:** 31 arquivos (layouts + pages)

---

## Índice
1. [Páginas Root (/)](#páginas-root)
2. [Grupo Auth](#grupo-auth)
3. [Grupo Public](#grupo-public)
4. [Área Admin](#área-admin)
5. [Área Integrações](#área-integrações)
6. [Área User](#área-user)
7. [Resumo Executivo](#resumo-executivo)
8. [Recomendações Prioritárias](#recomendações-prioritárias)

---

## Páginas Root

### 📄 src/app/page.tsx (Root Page)

**Tipo:** Server Component (RSC)

#### 🎨 Layout e Hierarquia Visual
- **✅ Pontos Fortes:**
  - Implementação minimalista e funcional
  - Sem UI renderizada (apenas lógica de redirecionamento)
- **⚠️ Áreas de Atenção:**
  - Não há estado de loading visível durante verificação de autenticação
  - Usuário pode ver flash branco durante redirecionamento

#### 🧩 Arquitetura do Componente
- **✅ Pontos Fortes:**
  - Server Component correto com uso de `cookies()` do Next.js
  - Lógica de redirecionamento baseada em autenticação
  - Separação clara de responsabilidades
- **❌ Problemas Identificados:**
  - **Token check não validado:** Apenas verifica presença do cookie, não validade do token
  - **Falta de verificação de role:** Não redireciona admin para `/admin`
  - **Hardcoded paths:** Paths de redirecionamento não centralizados

#### ⚡ Performance & Reatividade
- **✅ Pontos Fortes:**
  - Server-side, sem JavaScript no cliente
  - Redirecionamento instantâneo
- **⚠️ Melhorias:**
  - Sem indicador visual de carregamento
  - Poderia ter fallback UI durante redirect

#### 🧠 Coerência Cognitiva e UX
- **✅ Pontos Fortes:**
  - Comportamento previsível: autenticado → dashboard, não autenticado → login
- **❌ Problemas de UX:**
  - Flash de tela branca
  - Falta de feedback visual
  - Admin é redirecionado para `/integracoes` ao invés de `/admin`

#### 💬 Sugestões de Melhoria

**PRIORIDADE ALTA:**
1. **Validar token com session API:**
```typescript
export default async function RootPage() {
  const cookieStore = await cookies()
  const token = cookieStore.get('auth_token')

  // Validar session e obter user role
  if (token) {
    try {
      const session = await api.auth.getSession.query()
      if (session?.data?.role === 'admin') {
        redirect('/admin')
      }
      redirect('/integracoes')
    } catch {
      redirect('/login')
    }
  }

  redirect('/login')
}
```

2. **Centralizar paths de redirecionamento:**
```typescript
// lib/routes.ts
export const ROUTES = {
  AUTH: {
    LOGIN: '/login',
    REGISTER: '/register',
  },
  PROTECTED: {
    ADMIN: '/admin',
    USER: '/integracoes',
  }
} as const
```

**PRIORIDADE MÉDIA:**
3. **Adicionar loading UI:**
```typescript
// app/loading.tsx
export default function RootLoading() {
  return (
    <div className="flex items-center justify-center min-h-screen">
      <Loader2 className="h-8 w-8 animate-spin" />
    </div>
  )
}
```

---

### 📄 src/app/layout.tsx (Root Layout)

**Tipo:** Server Component (RSC)

#### 🎨 Layout e Hierarquia Visual
- **✅ Pontos Fortes:**
  - Configuração de fontes Google (Geist Sans + Geist Mono)
  - Classes CSS variables para tipografia
  - Suporte a dark mode (suppressHydrationWarning)
  - Antialiasing habilitado
- **⚠️ Áreas de Atenção:**
  - Dark mode forçado via classe `dark` no body (sem toggle do usuário)
  - Falta de fallback para fontes

#### 🧩 Arquitetura do Componente
- **✅ Pontos Fortes:**
  - Server Component adequado para root layout
  - Uso correto de `AppProviders` para context providers
  - Metadata SEO básica configurada
  - Idioma pt-BR definido
- **❌ Problemas Identificados:**
  - **Dark mode hardcoded:** Classe `dark` sempre aplicada, sem preferência do usuário
  - **Falta Open Graph metadata:** SEO incompleto para compartilhamento em redes sociais

#### ⚡ Performance & Reatividade
- **✅ Pontos Fortes:**
  - Fontes otimizadas com Next.js Font Optimization
  - Subsets limitados a 'latin' (reduz tamanho)
  - CSS variables para evitar FOUC (Flash of Unstyled Content)

#### 🧠 Coerência Cognitiva e UX
- **✅ Pontos Fortes:**
  - Tipografia consistente em toda aplicação
  - Metadata descritiva
- **⚠️ Melhorias:**
  - Dark mode forçado pode não agradar todos usuários
  - Falta favicon configurado no metadata

#### 💬 Sugestões de Melhoria

**PRIORIDADE ALTA:**
1. **Implementar theme switcher real (remover dark hardcoded):**
```typescript
// app/layout.tsx
import { ThemeProvider } from 'next-themes'

export default function RootLayout({ children }) {
  return (
    <html lang="pt-BR" suppressHydrationWarning>
      <body className={`${geistSans.variable} ${geistMono.variable} antialiased`}>
        <ThemeProvider attribute="class" defaultTheme="system" enableSystem>
          <AppProviders>
            {children}
          </AppProviders>
        </ThemeProvider>
      </body>
    </html>
  )
}
```

**PRIORIDADE MÉDIA:**
2. **Adicionar metadata completa para SEO:**
```typescript
export const metadata: Metadata = {
  title: "App Quayer - WhatsApp Multi-Instância",
  description: "Sistema de gerenciamento de múltiplas instâncias WhatsApp",
  keywords: ["whatsapp", "multi-instância", "gestão", "api"],
  authors: [{ name: "Quayer Team" }],
  openGraph: {
    title: "App Quayer - WhatsApp Multi-Instância",
    description: "Sistema de gerenciamento de múltiplas instâncias WhatsApp",
    type: "website",
    locale: "pt_BR",
    images: [{ url: "/og-image.png" }],
  },
  twitter: {
    card: "summary_large_image",
    title: "App Quayer",
    description: "Sistema de gerenciamento de múltiplas instâncias WhatsApp",
  },
  icons: {
    icon: "/favicon.ico",
    apple: "/apple-touch-icon.png",
  },
}
```

**PRIORIDADE BAIXA:**
3. **Adicionar fallback fonts:**
```typescript
const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
  display: "swap",
  fallback: ["system-ui", "arial"],
});
```

---

## Grupo Auth

### 📄 src/app/(auth)/layout.tsx

**Tipo:** Server Component com Client Component interno (StarsBackground)

#### 🎨 Layout e Hierarquia Visual
- **✅ Pontos Fortes:**
  - Background animado com estrelas (StarsBackground) cria atmosfera premium
  - Z-index bem gerenciado (background z-0, content z-10)
  - Layout fullscreen (min-h-screen)
  - Background preto sólido para contraste
- **⚠️ Áreas de Atenção:**
  - Animação de estrelas pode ser pesada em dispositivos baixo desempenho
  - Falta de opção para reduzir movimento (prefers-reduced-motion)

#### 🧩 Arquitetura do Componente
- **✅ Pontos Fortes:**
  - Uso correto de `Suspense` para lazy loading do conteúdo
  - Fallback de loading implementado
  - Separação de concerns: layout não contém lógica de negócio
- **⚠️ Melhorias:**
  - Fallback de loading muito simples (apenas texto)
  - StarsBackground é Client Component, mas layout é Server Component (correto, mas poderia ser otimizado)

#### ⚡ Performance & Reatividade
- **✅ Pontos Fortes:**
  - Suspense evita bloqueio de renderização
- **⚠️ Problemas:**
  - **StarsBackground renderiza muitas partículas:** `starDensity={0.00015}` + `allStarsTwinkle={true}` = alta carga de animação
  - Pode causar lag em dispositivos móveis

#### 🧠 Coerência Cognitiva e UX
- **✅ Pontos Fortes:**
  - Visual premium e diferenciado para páginas de autenticação
  - Consistente em todas páginas auth
- **⚠️ Melhorias:**
  - Falta de acessibilidade: animação não respeita `prefers-reduced-motion`

#### 💬 Sugestões de Melhoria

**PRIORIDADE ALTA:**
1. **Respeitar preferências de movimento do usuário:**
```typescript
'use client'
import { useEffect, useState } from 'react'

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
      {!prefersReducedMotion && (
        <StarsBackground
          starDensity={0.00015}
          allStarsTwinkle={true}
          twinkleProbability={0.7}
          minTwinkleSpeed={0.5}
          maxTwinkleSpeed={1}
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
```

**PRIORIDADE MÉDIA:**
2. **Melhorar fallback de loading:**
```typescript
function AuthLoadingSkeleton() {
  return (
    <div className="flex items-center justify-center min-h-screen">
      <div className="space-y-4 w-full max-w-sm p-6">
        <Skeleton className="h-12 w-full" />
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-10 w-full" />
      </div>
    </div>
  )
}
```

**PRIORIDADE BAIXA:**
3. **Otimizar densidade de estrelas para mobile:**
```typescript
const isMobile = typeof window !== 'undefined' && window.innerWidth < 768

<StarsBackground
  starDensity={isMobile ? 0.00008 : 0.00015}
  // ...
/>
```

---

### 📄 src/app/(auth)/login/page.tsx

**Tipo:** Server Component

#### 🎨 Layout e Hierarquia Visual
- **✅ Pontos Fortes:**
  - Layout centralizado vertical e horizontal
  - Logo bem posicionada como âncora visual
  - Max-width definido (max-w-sm) para boa legibilidade
  - Gap spacing consistente (gap-6)
- **⚠️ Áreas de Atenção:**
  - Muito espaçamento vazio em telas grandes
  - Poderia ter elemento visual adicional (ilustração, tagline)

#### 🧩 Arquitetura do Componente
- **✅ Pontos Fortes:**
  - Server Component puro (sem estado)
  - Delegação de lógica complexa para `LoginFormFinal`
  - Uso correto do componente Image do Next.js (otimização automática)
  - Priority na logo para LCP (Largest Contentful Paint)
- **❌ Problemas Identificados:**
  - **Logo linkável para "/":** Usuário autenticado que clicar na logo será redirecionado para `/integracoes` ou `/login` novamente (loop)

#### ⚡ Performance & Reatividade
- **✅ Pontos Fortes:**
  - Componente leve (apenas estrutura HTML)
  - Logo com priority para carregamento rápido
  - Sem JavaScript desnecessário

#### 🧠 Coerência Cognitiva e UX
- **✅ Pontos Fortes:**
  - Hierarquia visual clara: Logo → Formulário
  - Call-to-action único (focus no login)
- **⚠️ Melhorias:**
  - Falta de heading descritivo (h1) para acessibilidade
  - Link da logo pode confundir usuário já autenticado

#### 💬 Sugestões de Melhoria

**PRIORIDADE ALTA:**
1. **Adicionar heading para acessibilidade e SEO:**
```typescript
export default function LoginPage() {
  return (
    <div className="flex min-h-svh flex-col items-center justify-center gap-6 p-6 md:p-10">
      <div className="flex w-full max-w-sm flex-col gap-6">
        <div className="flex flex-col items-center gap-4">
          <Link href="/" className="flex items-center gap-2 self-center font-medium">
            <Image
              src="/logo.svg"
              alt="Quayer"
              width={120}
              height={28}
              priority
            />
          </Link>
          <div className="text-center space-y-2">
            <h1 className="text-2xl font-bold tracking-tight">
              Faça login na sua conta
            </h1>
            <p className="text-sm text-muted-foreground">
              Gerencie suas integrações WhatsApp
            </p>
          </div>
        </div>
        <LoginFormFinal />
      </div>
    </div>
  )
}
```

**PRIORIDADE MÉDIA:**
2. **Remover link da logo ou torná-lo condicional:**
```typescript
<div className="flex items-center gap-2 self-center font-medium">
  <Image
    src="/logo.svg"
    alt="Quayer"
    width={120}
    height={28}
    priority
  />
</div>
```

---

### 📄 src/app/(auth)/register/page.tsx

**Tipo:** Client Component ('use client')

#### 🎨 Layout e Hierarquia Visual
- **✅ Pontos Fortes:**
  - Card com backdrop-blur para glassmorphism premium
  - Logo centralizada e proeminente
  - Hierarquia visual clara: Logo → Título → Formulário → Footer
  - Ícones nos inputs para affordance visual
  - Gradiente nos botões (purple → pink)
- **⚠️ Áreas de Atenção:**
  - Card com transparência pode ter problemas de contraste em alguns backgrounds
  - Muitos campos no formulário (pode intimidar usuário)

#### 🧩 Arquitetura do Componente
- **✅ Pontos Fortes:**
  - Validação client-side antes de envio
  - Estados de loading bem gerenciados
  - Feedback de erro centralizado no topo
  - Uso do Igniter.js client (`api.auth.register.mutate`)
- **❌ Problemas CRÍTICOS Identificados:**
  - **Fetch direto após mutação:** Linha 58 faz `fetch('/api/v1/auth/send-verification')` ao invés de usar Igniter.js client
  - **Lógica de verificação misturada:** Register + Send verification na mesma página
  - **Sem tratamento de duplicação:** Se email já existe, erro não é claro
  - **Validação de senha fraca:** Apenas 8 caracteres, sem regex para complexidade
  - **Console.log em produção:** Linhas 55, 73 (devem ser removidas)

#### ⚡ Performance & Reatividade
- **✅ Pontos Fortes:**
  - Inputs controlados com feedback instantâneo
  - Loading states impedem duplo submit
  - Icons carregados de lucide-react (tree-shakeable)
- **⚠️ Problemas:**
  - **Componente pesado:** Muitos imports e estado local
  - **AuthLayout é Client Component:** Poderia ser Server Component

#### 🧠 Coerência Cognitiva e UX
- **✅ Pontos Fortes:**
  - Mensagem de erro clara e visível
  - Link para login se já tiver conta
  - Dica de senha mínima abaixo do campo
  - Estados de loading com texto descritivo
- **❌ Problemas de UX:**
  - **Confirmação de senha desnecessária:** Pattern ultrapassado, aumenta fricção
  - **Redirecionamento para verificação sem avisar:** Usuário pode não entender o fluxo
  - **Sem opção de login social:** Poderia ter Google/GitHub OAuth

#### 💬 Sugestões de Melhoria

**PRIORIDADE CRÍTICA:**
1. **Remover fetch direto e usar Igniter.js client:**
```typescript
const handleSubmit = async (e: React.FormEvent) => {
  e.preventDefault()
  setError('')

  if (password !== confirmPassword) {
    setError('As senhas não coincidem')
    return
  }

  setIsLoading(true)

  try {
    // 1. Criar usuário
    const response = await api.auth.register.mutate({
      body: { name, email, password }
    })

    // 2. Enviar código de verificação via Igniter.js
    await api.auth.sendVerification.mutate({
      body: { email }
    })

    // 3. Redirecionar
    router.push(`/verify-email?email=${encodeURIComponent(email)}`)
  } catch (err: any) {
    const errorMessage = err?.message || 'Erro ao criar conta'
    setError(errorMessage)
  } finally {
    setIsLoading(false)
  }
}
```

**PRIORIDADE ALTA:**
2. **Remover campo de confirmação de senha:**
```typescript
// Remover todo o campo confirmPassword
// Remover validação if (password !== confirmPassword)
// Simplificar formulário para: name, email, password
```

3. **Melhorar validação de senha:**
```typescript
const validatePassword = (pwd: string) => {
  if (pwd.length < 8) return 'Senha deve ter no mínimo 8 caracteres'
  if (!/[A-Z]/.test(pwd)) return 'Senha deve conter letra maiúscula'
  if (!/[a-z]/.test(pwd)) return 'Senha deve conter letra minúscula'
  if (!/[0-9]/.test(pwd)) return 'Senha deve conter número'
  return null
}
```

**PRIORIDADE MÉDIA:**
4. **Adicionar feedback visual melhor:**
```typescript
<Field>
  <Label>Senha</Label>
  <PasswordInput
    value={password}
    onChange={(e) => setPassword(e.target.value)}
    strengthIndicator // Mostrar força da senha
  />
  <PasswordRequirements password={password} />
</Field>
```

5. **Remover console.log:**
```typescript
// Remover linha 55: console.log('Register response:', response)
// Remover linha 73: console.error('Register error:', err)
// Usar logger apropriado ou serviço de telemetria
```

---

### 📄 src/app/(auth)/forgot-password/page.tsx

**Tipo:** Client Component

#### 🎨 Layout e Hierarquia Visual
- **✅ Pontos Fortes:**
  - Layout limpo e focado (single-purpose page)
  - Logo como ponto de ancoragem visual
  - Hierarquia clara: Logo → Título → Descrição → Campo → Ação → Link voltar
  - Feedback visual de sucesso com ícone CheckCircle2
  - Uso do Field component system (acessível)
- **⚠️ Áreas de Atenção:**
  - Muito espaço em branco em telas grandes
  - Alert de sucesso poderia ser mais proeminente

#### 🧩 Arquitetura do Componente
- **✅ Pontos Fortes:**
  - Estados bem gerenciados (email, error, success, isLoading)
  - Uso correto do Igniter.js client (`api.auth.forgotPassword.mutate`)
  - Desabilita campo e botão após sucesso (evita duplo submit)
  - Link voltar com ícone ArrowLeft para affordance
- **⚠️ Melhorias:**
  - Poderia usar useRouter do Next.js ao invés de Link para transições suaves
  - Falta tratamento específico para email não encontrado

#### ⚡ Performance & Reatividade
- **✅ Pontos Fortes:**
  - Componente leve com poucos estados
  - Feedback instantâneo de loading
  - AutoFocus no campo de email (boa acessibilidade)

#### 🧠 Coerência Cognitiva e UX
- **✅ Pontos Fortes:**
  - Fluxo linear e claro
  - Mensagem de sucesso explica próximos passos (verificar inbox/spam)
  - Estados de botão descritivos (Enviando... / E-mail enviado / Enviar instruções)
- **⚠️ Melhorias:**
  - Link "Lembrou sua senha?" duplicado (topo e rodapé)
  - Após envio, poderia redirecionar automaticamente para login após X segundos

#### 💬 Sugestões de Melhoria

**PRIORIDADE ALTA:**
1. **Auto-redirecionar após sucesso:**
```typescript
useEffect(() => {
  if (success) {
    const timer = setTimeout(() => {
      router.push('/login')
    }, 5000) // 5 segundos
    return () => clearTimeout(timer)
  }
}, [success, router])

// No alert de sucesso:
<AlertDescription className="text-green-200">
  E-mail enviado com sucesso! Verifique sua caixa de entrada (e spam também).
  Redirecionando para login em 5 segundos...
</AlertDescription>
```

**PRIORIDADE MÉDIA:**
2. **Remover link duplicado do rodapé:**
```typescript
// Remover:
<FieldDescription className="px-6 text-center text-xs">
  Lembrou sua senha? <Link href="/login">Faça login</Link>
</FieldDescription>
```

3. **Adicionar mensagem específica para email não encontrado:**
```typescript
catch (err: any) {
  const errorMessage = err?.message || err?.response?.data?.message

  if (errorMessage.includes('não encontrado') || errorMessage.includes('not found')) {
    setError('Este e-mail não está cadastrado. Deseja criar uma conta?')
  } else {
    setError(errorMessage || 'Erro ao enviar email de recuperação')
  }
}
```

---

### 📄 src/app/(auth)/login/verify/page.tsx

**Tipo:** Client Component com Suspense

#### 🎨 Layout e Hierarquia Visual
- **✅ Pontos Fortes:**
  - Layout consistente com outras páginas de auth
  - Logo centralizada
  - Uso de Suspense para progressive loading
- **⚠️ Áreas de Atenção:**
  - Muito simples, delega tudo para LoginOTPForm
  - Fallback de Suspense muito básico

#### 🧩 Arquitetura do Componente
- **✅ Pontos Fortes:**
  - Uso correto de Suspense para evitar hydration mismatch
  - Extrai email dos searchParams
  - Separação de concerns: página apenas estrutura, form tem lógica
- **⚠️ Melhorias:**
  - Falta validação se email é válido
  - Falta tratamento se email não foi passado na URL

#### ⚡ Performance & Reatividade
- **✅ Pontos Fortes:**
  - Suspense evita bloqueio de renderização
  - Componente leve

#### 🧠 Coerência Cognitiva e UX
- **✅ Pontos Fortes:**
  - Email pré-preenchido (boa continuidade de fluxo)
- **⚠️ Melhorias:**
  - Falta mensagem explicando que código foi enviado
  - Sem opção de reenviar código

#### 💬 Sugestões de Melhoria

**PRIORIDADE ALTA:**
1. **Adicionar contexto e validação:**
```typescript
function LoginVerifyContent() {
  const searchParams = useSearchParams()
  const email = searchParams.get('email')

  if (!email) {
    return (
      <div className="flex min-h-svh flex-col items-center justify-center gap-6 p-6">
        <Alert variant="destructive">
          <AlertDescription>
            Email não fornecido. Por favor, inicie o processo de login novamente.
          </AlertDescription>
        </Alert>
        <Button asChild>
          <Link href="/login">Voltar para login</Link>
        </Button>
      </div>
    )
  }

  return (
    <div className="flex min-h-svh flex-col items-center justify-center gap-6 p-6 md:p-10">
      <div className="flex w-full max-w-sm flex-col gap-6">
        <Link href="/login" className="flex items-center gap-2 self-center font-medium">
          <Image src="/logo.svg" alt="Quayer" width={120} height={28} priority />
        </Link>

        <div className="text-center space-y-2">
          <h1 className="text-2xl font-bold">Verifique seu código</h1>
          <p className="text-sm text-muted-foreground">
            Enviamos um código de 6 dígitos para <strong>{email}</strong>
          </p>
        </div>

        <LoginOTPForm email={email} />
      </div>
    </div>
  )
}
```

**PRIORIDADE MÉDIA:**
2. **Melhorar fallback de Suspense:**
```typescript
<Suspense fallback={
  <div className="flex items-center justify-center min-h-screen">
    <div className="space-y-4 text-center">
      <Loader2 className="h-8 w-8 animate-spin mx-auto" />
      <p className="text-muted-foreground">Carregando verificação...</p>
    </div>
  </div>
}>
```

---

### 📄 src/app/(auth)/login/verify-magic/page.tsx

**Tipo:** Client Component

#### 🎨 Layout e Hierarquia Visual
- **✅ Pontos Fortes:**
  - Card centralizado com visual clean
  - Ícones grandes para feedback visual (Loader2, CheckCircle2, XCircle)
  - Cores semânticas (green para sucesso, red para erro)
  - Textos descritivos para cada estado
- **⚠️ Áreas de Atenção:**
  - Layout muito genérico, poderia ter branding (logo)

#### 🧩 Arquitetura do Componente
- **✅ Pontos Fortes:**
  - Estados bem definidos ('verifying' | 'success' | 'error')
  - useEffect para verificação automática ao montar
  - Extração de token dos searchParams
  - Armazenamento correto de tokens (localStorage + cookie)
  - Redirecionamento baseado em role (admin → /admin, user → /integracoes)
- **❌ Problemas CRÍTICOS Identificados:**
  - **LocalStorage para tokens:** Vulnerável a XSS, deveria usar httpOnly cookies
  - **Cookie manual sem httpOnly:** `document.cookie` expõe token a JavaScript malicioso
  - **Redirecionamento com window.location.href:** Perde benefícios do Next.js router

#### ⚡ Performance & Reatividade
- **✅ Pontos Fortes:**
  - Verificação automática (sem ação do usuário)
  - Timeout de 1.5s antes de redirecionar (tempo para ler mensagem de sucesso)
- **⚠️ Problemas:**
  - useEffect sem dependency array adequado (router não deveria estar lá se não é usado)

#### 🧠 Coerência Cognitiva e UX
- **✅ Pontos Fortes:**
  - Feedback visual claro para cada estado
  - Mensagem de erro específica
  - Botão de fallback para voltar ao login
- **⚠️ Melhorias:**
  - Estado de verifying poderia ter texto mais explicativo
  - Falta opção de obter novo link se expirado

#### 💬 Sugestões de Melhoria

**PRIORIDADE CRÍTICA:**
1. **Remover localStorage e usar httpOnly cookies:**
```typescript
// No backend (API route), armazenar tokens em httpOnly cookies
// No frontend, NÃO armazenar tokens manualmente

const verifyMagicLink = async () => {
  try {
    const { data, error: apiError } = await api.auth.verifyMagicLink.mutate({
      body: { token }
    })

    if (apiError || !data) {
      throw new Error('Magic link inválido ou expirado')
    }

    // ✅ Tokens já armazenados em httpOnly cookies pelo backend
    setStatus('success')

    // ✅ Usar Next.js router para navegação
    setTimeout(() => {
      const redirectPath = data.user?.role === "admin" ? "/admin" : "/integracoes"
      router.push(redirectPath)
    }, 1500)
  } catch (err: any) {
    setStatus('error')
    setError(err.message || 'Link inválido ou expirado')
  }
}
```

**PRIORIDADE ALTA:**
2. **Adicionar opção de solicitar novo link:**
```typescript
{status === 'error' && (
  <>
    <XCircle className="h-12 w-12 text-red-500" />
    <p className="text-sm text-center text-red-600">{error}</p>
    <div className="flex flex-col gap-2 w-full">
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
  </>
)}
```

**PRIORIDADE MÉDIA:**
3. **Adicionar logo e melhorar branding:**
```typescript
<Card className="w-full max-w-md">
  <CardHeader className="text-center space-y-4">
    <Image src="/logo.svg" alt="Quayer" width={120} height={28} className="mx-auto" />
    <CardTitle className="text-xl">Verificação de Login</CardTitle>
    <CardDescription>
      {/* ... */}
    </CardDescription>
  </CardHeader>
  {/* ... */}
</Card>
```

---

## Área Admin

### 📄 src/app/admin/layout.tsx

**Tipo:** Server Component

#### 🎨 Layout e Hierarquia Visual
- **✅ Pontos Fortes:**
  - Uso do SidebarProvider pattern (shadcn/ui)
  - Layout responsivo com sidebar colapsável
  - Header fixo com breadcrumb
  - Separadores visuais (Separator) para hierarquia
  - Trigger de sidebar acessível
- **⚠️ Áreas de Atenção:**
  - Breadcrumb hardcoded ("Dashboard") não reflete rota atual
  - Altura do header fixa (h-16) pode não ser suficiente para muito conteúdo

#### 🧩 Arquitetura do Componente
- **✅ Pontos Fortes:**
  - Server Component para layout (otimização de bundle)
  - Componentização adequada (AppSidebar, SidebarInset)
  - Children renderizado dentro de estrutura padronizada
- **❌ Problemas Identificados:**
  - **Breadcrumb estático:** Não atualiza baseado na rota
  - **Sem proteção de role:** Qualquer usuário autenticado pode acessar /admin
  - **Falta ErrorBoundary:** Não captura erros de children

#### ⚡ Performance & Reatividade
- **✅ Pontos Fortes:**
  - Server Component reduz JavaScript no cliente
  - Sidebar colapsável economiza espaço

#### 🧠 Coerência Cognitiva e UX
- **✅ Pontos Fortes:**
  - Navegação lateral consistente
  - Breadcrumb para orientação espacial
- **❌ Problemas de UX:**
  - Breadcrumb não funcional (sempre mostra "Dashboard")
  - Sem indicador de rota ativa

#### 💬 Sugestões de Melhoria

**PRIORIDADE CRÍTICA:**
1. **Adicionar proteção de role (middleware ou component):**
```typescript
// middleware.ts ou dentro do layout
import { redirect } from 'next/navigation'
import { api } from '@/igniter.client'

export default async function AdminLayout({ children }) {
  const session = await api.auth.getSession.query()

  if (!session?.data?.role || session.data.role !== 'admin') {
    redirect('/integracoes')
  }

  return (
    <SidebarProvider>
      {/* ... */}
    </SidebarProvider>
  )
}
```

**PRIORIDADE ALTA:**
2. **Breadcrumb dinâmico baseado na rota:**
```typescript
'use client'
import { usePathname } from 'next/navigation'

function AdminBreadcrumb() {
  const pathname = usePathname()
  const segments = pathname.split('/').filter(Boolean)

  const breadcrumbMap: Record<string, string> = {
    'admin': 'Administração',
    'organizations': 'Organizações',
    'webhooks': 'Webhooks',
    'clients': 'Clientes',
    'brokers': 'Brokers',
    'logs': 'Logs',
    'permissions': 'Permissões',
  }

  return (
    <Breadcrumb>
      <BreadcrumbList>
        {segments.map((segment, idx) => {
          const isLast = idx === segments.length - 1
          const href = `/${segments.slice(0, idx + 1).join('/')}`

          return (
            <Fragment key={segment}>
              {idx > 0 && <BreadcrumbSeparator />}
              <BreadcrumbItem>
                {isLast ? (
                  <BreadcrumbPage>{breadcrumbMap[segment] || segment}</BreadcrumbPage>
                ) : (
                  <BreadcrumbLink href={href}>
                    {breadcrumbMap[segment] || segment}
                  </BreadcrumbLink>
                )}
              </BreadcrumbItem>
            </Fragment>
          )
        })}
      </BreadcrumbList>
    </Breadcrumb>
  )
}
```

**PRIORIDADE MÉDIA:**
3. **Adicionar ErrorBoundary:**
```typescript
import { ErrorBoundary } from '@/components/error-boundary'

export default function AdminLayout({ children }) {
  return (
    <ErrorBoundary>
      <SidebarProvider>
        {/* ... */}
      </SidebarProvider>
    </ErrorBoundary>
  )
}
```

---

### 📄 src/app/admin/page.tsx

**Tipo:** Client Component

#### 🎨 Layout e Hierarquia Visual
- **✅ Pontos Fortes:**
  - Cards de estatísticas com ícones descritivos
  - Grid responsivo (md:grid-cols-2 lg:grid-cols-4)
  - Seções adicionais (Atividade Recente, Organizações Recentes) com grid 4/3
  - Skeletons para loading states
  - Espaçamento consistente
- **⚠️ Áreas de Atenção:**
  - Seções "Atividade Recente" e "Organizações Recentes" estão vazias (placeholder)
  - Muitos cards vazios podem dar impressão de incompletude

#### 🧩 Arquitetura do Componente
- **✅ Pontos Fortes:**
  - useState + useEffect para gerenciamento de dados
  - Promise.all para paralelização de requests
  - Tratamento de erro com try-catch
  - Componente DashboardStats tipado com interface
- **❌ Problemas CRÍTICOS Identificados:**
  - **Client Component desnecessário:** Poderia ser Server Component com streaming
  - **useEffect para data fetching:** Anti-pattern, deveria usar React Query (api.*.useQuery)
  - **Total de usuários hardcoded em 0:** Linha 37
  - **Falta tratamento de erro visível:** Erros apenas em console.error

#### ⚡ Performance & Reatividade
- **✅ Pontos Fortes:**
  - Promise.all paraleliza 3 requests
  - Skeletons evitam layout shift
- **❌ Problemas:**
  - **Client Component pesado:** Poderia ser RSC para melhor performance
  - **Re-renderização desnecessária:** useEffect dispara toda vez que component monta

#### 🧠 Coerência Cognitiva e UX
- **✅ Pontos Fortes:**
  - Cards de métricas claros e escaneáveis
  - Ícones ajudam na identificação rápida
  - Loading states evitam confusão
- **❌ Problemas de UX:**
  - **Seções vazias:** "Nenhuma atividade recente" e "Nenhuma organização recente" dão impressão de sistema não utilizado
  - **Falta de ações:** Dashboard apenas mostra dados, sem CTAs

#### 💬 Sugestões de Melhoria

**PRIORIDADE CRÍTICA:**
1. **Migrar para Server Component com React Query:**
```typescript
'use client'
import { api } from '@/igniter.client'

export default function AdminDashboardPage() {
  const { data: orgs, isLoading: orgsLoading } = api.organizations.list.useQuery({
    query: { page: 1, limit: 1 }
  })
  const { data: instances, isLoading: instancesLoading } = api.instances.list.useQuery({
    query: { page: 1, limit: 1 }
  })
  const { data: webhooks, isLoading: webhooksLoading } = api.webhooks.list.useQuery({
    query: { page: 1, limit: 1 }
  })

  const isLoading = orgsLoading || instancesLoading || webhooksLoading

  const stats = {
    totalOrganizations: orgs?.data?.pagination?.total || 0,
    totalUsers: 0, // TODO: Criar endpoint users.count
    totalInstances: instances?.data?.pagination?.total || 0,
    totalWebhooks: webhooks?.data?.pagination?.total || 0,
  }

  // ... resto do componente
}
```

**PRIORIDADE ALTA:**
2. **Implementar seções de atividade e organizações recentes:**
```typescript
const { data: recentOrgs } = api.organizations.list.useQuery({
  query: { page: 1, limit: 5, sortBy: 'createdAt', sortOrder: 'desc' }
})

<Card className="col-span-3">
  <CardHeader>
    <CardTitle>Organizações Recentes</CardTitle>
    <CardDescription>Últimas organizações cadastradas</CardDescription>
  </CardHeader>
  <CardContent>
    {recentOrgs?.data?.data?.length === 0 ? (
      <p className="text-sm text-muted-foreground">Nenhuma organização recente</p>
    ) : (
      <div className="space-y-3">
        {recentOrgs?.data?.data?.map((org: any) => (
          <div key={org.id} className="flex items-center justify-between p-3 border rounded">
            <div>
              <p className="font-medium">{org.name}</p>
              <p className="text-sm text-muted-foreground">{org.document}</p>
            </div>
            <Badge>{org.billingType}</Badge>
          </div>
        ))}
      </div>
    )}
  </CardContent>
</Card>
```

**PRIORIDADE MÉDIA:**
3. **Adicionar tratamento de erro visível:**
```typescript
if (orgs?.error || instances?.error || webhooks?.error) {
  return (
    <div className="flex-1 space-y-4 p-8 pt-6">
      <Alert variant="destructive">
        <AlertDescription>
          Erro ao carregar dados do dashboard. Tente novamente.
        </AlertDescription>
      </Alert>
    </div>
  )
}
```

4. **Criar endpoint de contagem de usuários:**
```typescript
// Em organizations.controller.ts ou users.controller.ts
@controller.action({
  method: 'GET',
  path: '/users/count',
  summary: 'Get total users count',
})
async countUsers() {
  const count = await this.ctx.features.organizations.repository.countUsers()
  return response.success({ count })
}
```

---

### 📄 src/app/admin/organizations/page.tsx

**Tipo:** Client Component

#### 🎨 Layout e Hierarquia Visual
- **✅ Pontos Fortes:**
  - Header com título + ação primária (CreateOrganizationDialog)
  - Barra de busca com ícone de Search
  - Tabela bem estruturada com colunas claras
  - Badges para status visual (PF/PJ, Billing Type, Ativo/Inativo)
  - Skeleton loading states para cada célula
  - Empty state com mensagem clara
- **⚠️ Áreas de Atenção:**
  - Tabela pode ficar estreita em mobile (não há scroll horizontal configurado)
  - Muitas colunas (8) podem dificultar leitura em telas pequenas

#### 🧩 Arquitetura do Componente
- **✅ Pontos Fortes:**
  - Estado local bem organizado (organizations, isLoading, search, editingOrg)
  - Dialogs controlados (create, edit) com callbacks onSuccess
  - Debounce implícito no useEffect (reage a mudanças de search)
  - TypeScript interface para Organization
  - Confirmação antes de deletar
- **❌ Problemas CRÍTICOS Identificados:**
  - **useEffect para data fetching:** Anti-pattern, deveria usar React Query
  - **Múltiplos re-renders:** useEffect dispara toda vez que search muda
  - **Type casting inseguro:** `as unknown as Organization[]` (linha 62)
  - **Delete API comentado:** "TODO: Implement delete API call" (linha 94)
  - **Alert nativo:** `alert('Erro ao excluir organização')` (linha 86) - deveria usar toast

#### ⚡ Performance & Reatividade
- **✅ Pontos Fortes:**
  - Skeleton loading states evitam layout shift
  - Busca client-side após fetch (mas poderia ser server-side)
- **❌ Problemas:**
  - **Re-fetch a cada mudança de search:** Deveria ter debounce
  - **Client Component pesado:** Poderia ser Server Component com search params

#### 🧠 Coerência Cognitiva e UX
- **✅ Pontos Fortes:**
  - Busca intuitiva (pesquisar organizações)
  - Ações no dropdown menu (editar, excluir)
  - Badges coloridas facilitam scan visual
  - Confirmação de exclusão evita erros
- **❌ Problemas de UX:**
  - **Delete não funciona:** Frustração se usuário tentar
  - **Sem paginação:** Lista pode ficar enorme
  - **Sem filtros avançados:** Apenas busca textual
  - **Sem indicador de ordenação:** Não fica claro qual coluna está ordenando

#### 💬 Sugestões de Melhoria

**PRIORIDADE CRÍTICA:**
1. **Migrar para React Query e adicionar debounce:**
```typescript
'use client'
import { api } from '@/igniter.client'
import { useDebouncedValue } from '@/hooks/use-debounced-value'

export default function OrganizationsPage() {
  const [search, setSearch] = useState('')
  const debouncedSearch = useDebouncedValue(search, 500)

  const { data, isLoading, error, refetch } = api.organizations.list.useQuery({
    query: {
      page: 1,
      limit: 20,
      search: debouncedSearch || undefined,
    },
  })

  const organizations = data?.data?.data || []

  // ... resto do componente
}
```

**PRIORIDADE ALTA:**
2. **Implementar delete funcional:**
```typescript
const { mutateAsync: deleteOrg } = api.organizations.delete.useMutation()

const handleDelete = async (id: string) => {
  if (!confirm('Tem certeza que deseja excluir esta organização?')) return

  try {
    await deleteOrg({ params: { id } })
    toast.success('Organização excluída com sucesso!')
    refetch()
  } catch (error: any) {
    toast.error(error.message || 'Erro ao excluir organização')
  }
}
```

3. **Adicionar paginação:**
```typescript
const [page, setPage] = useState(1)
const limit = 20

const { data, isLoading } = api.organizations.list.useQuery({
  query: { page, limit, search: debouncedSearch || undefined },
})

const totalPages = Math.ceil((data?.data?.pagination?.total || 0) / limit)

// No final da tabela:
<Pagination
  currentPage={page}
  totalPages={totalPages}
  onPageChange={setPage}
/>
```

**PRIORIDADE MÉDIA:**
4. **Tornar tabela responsiva:**
```typescript
<div className="rounded-md border overflow-x-auto">
  <Table>
    {/* ... */}
  </Table>
</div>
```

5. **Remover type casting inseguro:**
```typescript
// Em vez de:
setOrganizations((response.data?.data || []) as unknown as Organization[])

// Validar com Zod:
const OrganizationSchema = z.object({
  id: z.string(),
  name: z.string(),
  document: z.string(),
  type: z.enum(['pf', 'pj']),
  billingType: z.string(),
  maxInstances: z.number(),
  maxUsers: z.number(),
  isActive: z.boolean(),
  createdAt: z.string(),
})

const orgsData = z.array(OrganizationSchema).parse(response.data?.data || [])
setOrganizations(orgsData)
```

---

### 📄 src/app/admin/webhooks/page.tsx

**Tipo:** Client Component

#### 🎨 Layout e Hierarquia Visual
- **✅ Pontos Fortes:**
  - Header com título, descrição e CTA (Novo Webhook)
  - Cards de estatísticas (Total, Ativos, Inativos) com ícones coloridos
  - Tabela dentro de Card para melhor organização
  - Busca integrada no Card header
  - Badges para eventos (mostra primeiros 2 + contador)
  - Empty state bem desenhado (ícone + texto + CTA)
- **⚠️ Áreas de Atenção:**
  - Header ocupa muito espaço vertical
  - Tabela pode ficar apertada em mobile (7 colunas)

#### 🧩 Arquitetura do Componente
- **✅ Pontos Fortes:**
  - Uso correto de React Query (`api.webhooks.list.useQuery`)
  - Estados de loading, error, data bem tratados
  - Filtro client-side funcional (URL + eventos)
  - Cálculo de stats derivado dos dados
  - Formatação de datas com date-fns
- **❌ Problemas Identificados:**
  - **Ações do dropdown não funcionam:** Todos os items são stubs (Ver Detalhes, Editar, Testar, Ativar/Desativar, Excluir)
  - **Botão "Novo Webhook" não conectado:** Sem modal ou rota
  - **Type safety fraca:** Uso de `any` para webhooks (linha 39, 40, 158)

#### ⚡ Performance & Reatividade
- **✅ Pontos Fortes:**
  - React Query com caching automático
  - Skeletons evitam layout shift
  - Filtro client-side rápido (arrays pequenos)
- **⚠️ Melhorias:**
  - Filtro poderia ser server-side para listas grandes

#### 🧠 Coerência Cognitiva e UX
- **✅ Pontos Fortes:**
  - Cards de estatísticas dão overview rápido
  - Busca por URL ou evento é intuitiva
  - Badges coloridas (verde para ativo, vermelho para inativo)
  - Empty state incentiva ação (botão criar webhook)
  - Formato de data relativo ("há 2 horas") é mais legível
- **❌ Problemas de UX:**
  - **Ações não funcionam:** Frustração ao clicar
  - **Sem feedback de ações:** Toast faltando para sucesso/erro
  - **Sem paginação:** Lista pode crescer muito
  - **Última Execução pode ser "Nunca":** Poderia ter badge "Não testado"

#### 💬 Sugestões de Melhoria

**PRIORIDADE CRÍTICA:**
1. **Implementar ações do dropdown:**
```typescript
// Ver Detalhes
<DropdownMenuItem onClick={() => router.push(`/admin/webhooks/${webhook.id}`)}>
  Ver Detalhes
</DropdownMenuItem>

// Editar
const [editModalOpen, setEditModalOpen] = useState(false)
const [selectedWebhook, setSelectedWebhook] = useState<Webhook | null>(null)

<DropdownMenuItem onClick={() => {
  setSelectedWebhook(webhook)
  setEditModalOpen(true)
}}>
  Editar
</DropdownMenuItem>

// Testar
const { mutateAsync: testWebhook } = api.webhooks.test.useMutation()
const handleTest = async (id: string) => {
  try {
    await testWebhook({ params: { id } })
    toast.success('Webhook testado com sucesso!')
  } catch (error: any) {
    toast.error(error.message || 'Erro ao testar webhook')
  }
}

// Ativar/Desativar
const { mutateAsync: toggleWebhook } = api.webhooks.toggle.useMutation()
const handleToggle = async (webhook: Webhook) => {
  try {
    await toggleWebhook({
      params: { id: webhook.id },
      body: { isActive: !webhook.isActive }
    })
    toast.success(`Webhook ${webhook.isActive ? 'desativado' : 'ativado'}!`)
    refetch()
  } catch (error: any) {
    toast.error(error.message)
  }
}

// Excluir
const { mutateAsync: deleteWebhook } = api.webhooks.delete.useMutation()
const handleDelete = async (id: string) => {
  if (!confirm('Tem certeza que deseja excluir este webhook?')) return
  try {
    await deleteWebhook({ params: { id } })
    toast.success('Webhook excluído!')
    refetch()
  } catch (error: any) {
    toast.error(error.message)
  }
}
```

**PRIORIDADE ALTA:**
2. **Implementar modal de criação de webhook:**
```typescript
const [createModalOpen, setCreateModalOpen] = useState(false)

<Button onClick={() => setCreateModalOpen(true)}>
  <Plus className="h-4 w-4 mr-2" />
  Novo Webhook
</Button>

<CreateWebhookDialog
  open={createModalOpen}
  onOpenChange={setCreateModalOpen}
  onSuccess={() => {
    refetch()
    setCreateModalOpen(false)
  }}
/>
```

3. **Adicionar types apropriados:**
```typescript
interface Webhook {
  id: string
  url: string
  events: string[]
  organizationId?: string
  instanceId?: string
  organization?: { name: string }
  instance?: { name: string }
  isActive: boolean
  lastExecutedAt?: string
  createdAt: string
  updatedAt: string
}

const webhooks = (webhooksData?.data || []) as Webhook[]
```

**PRIORIDADE MÉDIA:**
4. **Adicionar paginação:**
```typescript
const [page, setPage] = useState(1)
const limit = 20

const { data: webhooksData } = api.webhooks.list.useQuery({
  query: { page, limit }
})

// No final do Card:
<CardFooter>
  <Pagination
    currentPage={page}
    totalPages={Math.ceil((webhooksData?.pagination?.total || 0) / limit)}
    onPageChange={setPage}
  />
</CardFooter>
```

5. **Melhorar indicador de "Nunca executado":**
```typescript
<TableCell>
  {webhook.lastExecutedAt ? (
    formatDistanceToNow(new Date(webhook.lastExecutedAt), {
      addSuffix: true,
      locale: ptBR,
    })
  ) : (
    <Badge variant="outline" className="text-muted-foreground">
      Não testado
    </Badge>
  )}
</TableCell>
```

---

## Área Integrações

### 📄 src/app/integracoes/layout.tsx

**Tipo:** Client Component

#### 🎨 Layout e Hierarquia Visual
- **✅ Pontos Fortes:**
  - Uso do SidebarProvider pattern (shadcn/ui)
  - Header com altura fixa (h-16) e borda inferior
  - Sidebar colapsável (SidebarTrigger)
  - Separador visual entre trigger e conteúdo
  - Padding consistente (p-4, pt-0 para conteúdo)
- **⚠️ Áreas de Atenção:**
  - Header sem breadcrumb ou título de página
  - Layout muito similar ao admin, mas sem diferenciação visual clara

#### 🧩 Arquitetura do Componente
- **✅ Pontos Fortes:**
  - ErrorBoundary wrapping todo conteúdo
  - Client Component para interatividade de sidebar
  - Estrutura simples e clara
- **⚠️ Melhorias:**
  - Falta de contexto de rota no header
  - Sem proteção de acesso (qualquer usuário autenticado acessa)

#### ⚡ Performance & Reatividade
- **✅ Pontos Fortes:**
  - Layout leve
  - Sidebar collapse economiza espaço
- **⚠️ Melhorias:**
  - Client Component aumenta bundle (poderia ser Server Component se sidebar fosse estática)

#### 🧠 Coerência Cognitiva e UX
- **✅ Pontos Fortes:**
  - Layout consistente em toda área de integrações
  - ErrorBoundary protege UX contra crashes
- **❌ Problemas de UX:**
  - **Falta indicador de rota ativa:** Usuário não sabe em qual página está
  - **Header vazio:** Poderia ter título da página ou breadcrumb

#### 💬 Sugestões de Melhoria

**PRIORIDADE ALTA:**
1. **Adicionar breadcrumb dinâmico no header:**
```typescript
'use client'
import { usePathname } from 'next/navigation'
import { Breadcrumb, BreadcrumbList, BreadcrumbItem, BreadcrumbLink, BreadcrumbSeparator, BreadcrumbPage } from '@/components/ui/breadcrumb'

function IntegrationsBreadcrumb() {
  const pathname = usePathname()
  const segments = pathname.split('/').filter(Boolean)

  const breadcrumbMap: Record<string, string> = {
    'integracoes': 'Integrações',
    'dashboard': 'Dashboard',
    'settings': 'Configurações',
    'users': 'Usuários',
    'admin': 'Administração',
    'clients': 'Clientes',
  }

  return (
    <Breadcrumb>
      <BreadcrumbList>
        {segments.map((segment, idx) => {
          const isLast = idx === segments.length - 1
          const href = `/${segments.slice(0, idx + 1).join('/')}`

          return (
            <Fragment key={segment}>
              {idx > 0 && <BreadcrumbSeparator />}
              <BreadcrumbItem>
                {isLast ? (
                  <BreadcrumbPage>{breadcrumbMap[segment] || segment}</BreadcrumbPage>
                ) : (
                  <BreadcrumbLink href={href}>
                    {breadcrumbMap[segment] || segment}
                  </BreadcrumbLink>
                )}
              </BreadcrumbItem>
            </Fragment>
          )
        })}
      </BreadcrumbList>
    </Breadcrumb>
  )
}

export default function DashboardLayout({ children }) {
  return (
    <ErrorBoundary>
      <SidebarProvider>
        <AppSidebar />
        <SidebarInset>
          <header className="flex h-16 shrink-0 items-center gap-2 border-b">
            <div className="flex items-center gap-2 px-4">
              <SidebarTrigger className="-ml-1" />
              <Separator orientation="vertical" className="mr-2 h-4" />
              <IntegrationsBreadcrumb />
            </div>
          </header>
          <div className="flex flex-1 flex-col gap-4 p-4 pt-0">
            {children}
          </div>
        </SidebarInset>
      </SidebarProvider>
    </ErrorBoundary>
  )
}
```

**PRIORIDADE MÉDIA:**
2. **Adicionar proteção de acesso (se necessário):**
```typescript
// Se apenas usuários de organizações específicas podem acessar
import { redirect } from 'next/navigation'
import { api } from '@/igniter.client'

export default async function DashboardLayout({ children }) {
  const session = await api.auth.getSession.query()

  if (!session?.data?.organizationId) {
    redirect('/onboarding')
  }

  return (
    <ErrorBoundary>
      {/* ... */}
    </ErrorBoundary>
  )
}
```

---

### 📄 src/app/integracoes/page.tsx

**Tipo:** Client Component

#### 🎨 Layout e Hierarquia Visual
- **✅ Pontos Fortes:**
  - **Layout de chat/mensageiro bem implementado:** Sidebar (lista) + Main (detalhes)
  - **Hierarquia visual clara:** Header → Busca → Tabs → Lista → Footer
  - **Cards de instância com avatares coloridos:** Verde para conectado, cinza para desconectado
  - **Badge de alerta:** "!" para instâncias desconectadas
  - **Empty state duplo:** Sem instâncias na lista + sem instância selecionada
  - **Modal system:** 5 modais para diferentes ações (Create, Connect, Share, Edit, Details)
- **⚠️ Áreas de Atenção:**
  - Layout horizontal pode não funcionar bem em mobile (sidebar + main lado a lado)
  - Muitos modais (5) podem causar confusão de gerenciamento

#### 🧩 Arquitetura do Componente
- **✅ Pontos Fortes:**
  - **Custom hooks:** `useInstances()` e `usePermissions()` para lógica reutilizável
  - **React Query via hook:** Caching e refetch automático
  - **Controle de permissões granular:** `canCreateInstance`, `canEditInstance`, `canDeleteInstance`
  - **Estado local bem organizado:** Modais, filtros, busca, instância selecionada
  - **Filtros funcionais:** all, connected, disconnected com tabs visuais
  - **Busca client-side:** Por nome ou telefone
  - **Formatação de datas:** `date-fns` com localização pt-BR
- **❌ Problemas CRÍTICOS Identificados:**
  - **Delete não implementado:** "TODO: Implement delete API call" (linha 94)
  - **Confirm nativo:** `confirm()` ao invés de dialog bonito (linha 91)
  - **Type any:** `error: any` (linha 97)
  - **Componente gigante:** 485 linhas, deveria ser quebrado em sub-componentes

#### ⚡ Performance & Reatividade
- **✅ Pontos Fortes:**
  - React Query com caching
  - Skeletons para loading states
  - Filtros client-side rápidos
- **⚠️ Problemas:**
  - **Filtro e busca client-side:** Não escalável para muitas instâncias (deveria ser server-side)
  - **Re-renderização completa:** Ao selecionar instância, toda lista re-renderiza

#### 🧠 Coerência Cognitiva e UX
- **✅ Pontos Fortes:**
  - **UX de mensageiro familiar:** Layout similar a WhatsApp Web
  - **Feedback visual rico:** Cores, ícones, badges, avatares
  - **Tabs com contadores:** "Conectadas (5)" ajuda usuário
  - **Empty states informativos:** Explicam próximos passos
  - **Modais especializados:** Cada ação tem seu modal focado
  - **Permissões respeitadas:** Botões desabilitados se sem permissão
- **❌ Problemas de UX:**
  - **Layout quebrado em mobile:** Sidebar + Main não colapsa
  - **Delete com confirm nativo:** Não bonito e fora do padrão visual
  - **Footer com texto genérico:** "End of list" poderia ser removido
  - **Muitos cliques para conectar:** Usuário precisa selecionar instância → abrir dropdown → clicar conectar → modal abre

#### 💬 Sugestões de Melhoria

**PRIORIDADE CRÍTICA:**
1. **Implementar delete funcional:**
```typescript
const { mutateAsync: deleteInstance } = api.instances.delete.useMutation()

const handleDelete = async (instance: Instance) => {
  // Usar AlertDialog ao invés de confirm nativo
  setDeleteDialogOpen(true)
  setInstanceToDelete(instance)
}

const confirmDelete = async () => {
  if (!instanceToDelete) return

  try {
    await deleteInstance({ params: { id: instanceToDelete.id } })
    toast.success('Instância excluída com sucesso!')
    refetch()
    if (selectedInstance?.id === instanceToDelete.id) {
      setSelectedInstance(null)
    }
  } catch (error: any) {
    toast.error(error.message || 'Erro ao excluir instância')
  } finally {
    setDeleteDialogOpen(false)
    setInstanceToDelete(null)
  }
}

// Adicionar AlertDialog ao final do JSX:
<AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
  <AlertDialogContent>
    <AlertDialogHeader>
      <AlertDialogTitle>Confirmar exclusão</AlertDialogTitle>
      <AlertDialogDescription>
        Tem certeza que deseja excluir a instância "{instanceToDelete?.name}"?
        Esta ação não pode ser desfeita.
      </AlertDialogDescription>
    </AlertDialogHeader>
    <AlertDialogFooter>
      <AlertDialogCancel>Cancelar</AlertDialogCancel>
      <AlertDialogAction onClick={confirmDelete} className="bg-destructive">
        Excluir
      </AlertDialogAction>
    </AlertDialogFooter>
  </AlertDialogContent>
</AlertDialog>
```

**PRIORIDADE ALTA:**
2. **Refatorar em sub-componentes:**
```typescript
// components/integracoes/instances-list.tsx
export function InstancesList({ instances, selectedId, onSelect, isLoading }) {
  // Sidebar completa
}

// components/integracoes/instance-details.tsx
export function InstanceDetails({ instance, onConnect, onEdit, onShare, onDelete }) {
  // Main content completa
}

// components/integracoes/instance-stats-tabs.tsx
export function InstanceStatsTabs({ stats, filter, onFilterChange }) {
  // Tabs com contadores
}

// page.tsx
export default function IntegracoesPage() {
  // Apenas lógica de estado e coordenação
  return (
    <div className="flex h-[calc(100vh-4rem)]">
      <InstancesList
        instances={filteredInstances}
        selectedId={selectedInstance?.id}
        onSelect={setSelectedInstance}
        isLoading={isLoading}
      />
      <InstanceDetails
        instance={selectedInstance}
        onConnect={handleConnect}
        onEdit={handleEdit}
        onShare={handleShare}
        onDelete={handleDelete}
      />
      {/* Modals */}
    </div>
  )
}
```

3. **Tornar layout responsivo:**
```typescript
<div className="flex flex-col md:flex-row h-[calc(100vh-4rem)]">
  {/* Mobile: Tabs para alternar entre lista e detalhes */}
  <div className="md:hidden">
    <Tabs value={mobileView} onValueChange={setMobileView}>
      <TabsList className="w-full">
        <TabsTrigger value="list">Lista</TabsTrigger>
        <TabsTrigger value="details" disabled={!selectedInstance}>
          Detalhes
        </TabsTrigger>
      </TabsList>
    </Tabs>
  </div>

  {/* Sidebar: Sempre visível em desktop, condicional em mobile */}
  <aside className={cn(
    "w-full md:w-80 border-r",
    mobileView === 'details' && 'hidden md:flex'
  )}>
    {/* Lista de instâncias */}
  </aside>

  {/* Main: Sempre visível em desktop, condicional em mobile */}
  <main className={cn(
    "flex-1",
    mobileView === 'list' && 'hidden md:flex'
  )}>
    {/* Detalhes da instância */}
  </main>
</div>
```

**PRIORIDADE MÉDIA:**
4. **Mover filtros para server-side:**
```typescript
const { data: instancesData, isLoading, error, refetch } = useInstances({
  filter, // 'all' | 'connected' | 'disconnected'
  search: debouncedSearchTerm,
})
```

5. **Adicionar atalho para conectar instância diretamente da lista:**
```typescript
<div className="flex items-center gap-1">
  <StatusBadge status={instance.status as any} size="sm" />
  {instance.status === 'disconnected' && canEditInstance && (
    <Button
      size="icon"
      variant="ghost"
      className="h-5 w-5"
      onClick={(e) => {
        e.stopPropagation()
        handleConnect(instance)
      }}
      title="Conectar agora"
    >
      <Plug className="h-3 w-3" />
    </Button>
  )}
</div>
```

---

### 📄 src/app/integracoes/dashboard/page.tsx

**Tipo:** Client Component

#### 🎨 Layout e Hierarquia Visual
- **✅ Pontos Fortes:**
  - **Dashboard completo e visual:** Cards de métricas + gráficos interativos
  - **Hierarquia clara:** Header (título + saudação) → Stats Cards → Métricas Detalhadas → Performance → Gráficos
  - **Grid responsivo:** 1 col mobile → 2 cols tablet → 4 cols desktop
  - **Ícones descritivos:** Cada métrica tem ícone apropriado
  - **Gráficos modernos:** AreaChart, PieChart, BarChart com Recharts
  - **Cores semânticas:** Verde para sucesso, vermelho para erro, azul para info
  - **ChartContainer:** Wrapper do shadcn/ui para consistência visual
- **⚠️ Áreas de Atenção:**
  - **Muito scroll vertical:** 3 seções de métricas + 3 gráficos (poderia ter tabs)
  - **Mock data:** Gráficos todos usam dados fake (linhas 25-62)

#### 🧩 Arquitetura do Componente
- **✅ Pontos Fortes:**
  - **React Query:** `api.instances.list.useQuery()` para dados reais
  - **Hydration safety:** `useState(false)` + `useEffect` para evitar mismatch
  - **Hook useAuth:** Para pegar dados do usuário logado
  - **useMemo:** Para cálculo de stats (evita recalculação desnecessária)
  - **Recharts components:** Biblioteca robusta para gráficos
  - **TypeScript:** Tipagem adequada para dados
- **❌ Problemas CRÍTICOS Identificados:**
  - **Mock data hardcoded:** Todos os gráficos usam dados falsos (linhas 25-62, 89-105)
  - **Métricas de conversas não existem:** API não retorna conversationMetrics nem messageMetrics
  - **isMounted pattern:** Anti-pattern, deveria usar Suspense
  - **ChartTooltipContent importado mas não customizado:** Poderia ter tooltip mais rico

#### ⚡ Performance & Reatividade
- **✅ Pontos Fortes:**
  - React Query com caching
  - useMemo para stats calculados
  - ResponsiveContainer para gráficos
- **⚠️ Problemas:**
  - **3 gráficos Recharts:** Pesados no bundle (~50kb cada)
  - **Client Component grande:** Poderia ser Server Component com streaming
  - **Re-render completo:** Ao atualizar dados, todos gráficos re-renderizam

#### 🧠 Coerência Cognitiva e UX
- **✅ Pontos Fortes:**
  - **Saudação personalizada:** "Bem-vindo(a), {user.name}"
  - **Métricas escaneáveis:** Grid de cards facilita leitura rápida
  - **Gráficos contextualizados:** Títulos e descrições claras
  - **Loading states:** Skeletons evitam confusão
  - **Gradientes e animações:** Gráficos visualmente atraentes
- **❌ Problemas de UX:**
  - **Dados fake óbvios:** Usuário perceberá que são mocks
  - **Falta de ações:** Dashboard apenas exibe, sem CTAs para aprofundar
  - **Período fixo:** "Últimas 24 horas" não é configurável
  - **Sem drill-down:** Clicar em gráfico não leva a detalhes

#### 💬 Sugestões de Melhoria

**PRIORIDADE CRÍTICA:**
1. **Substituir mock data por dados reais:**
```typescript
// Criar endpoints no backend:
// - api.analytics.conversationsPerHour.query({ query: { hours: 24 } })
// - api.analytics.messagesByStatus.query()
// - api.analytics.aiVsHuman.query()

const { data: conversationsData } = api.analytics.conversationsPerHour.useQuery({
  query: { hours: 24 }
})

const { data: messagesStatusData } = api.analytics.messagesByStatus.useQuery()

const { data: aiVsHumanData } = api.analytics.aiVsHuman.useQuery()

// Remover todos os mocks (linhas 25-62, 89-105)
```

**PRIORIDADE ALTA:**
2. **Implementar seletor de período:**
```typescript
const [period, setPeriod] = useState<'24h' | '7d' | '30d'>('24h')

<div className="flex items-center justify-between">
  <div>
    <h1 className="text-3xl font-bold">Dashboard</h1>
    <p className="text-muted-foreground mt-1">
      Bem-vindo(a), {user?.name}!
    </p>
  </div>
  <Select value={period} onValueChange={setPeriod}>
    <SelectTrigger className="w-[180px]">
      <SelectValue />
    </SelectTrigger>
    <SelectContent>
      <SelectItem value="24h">Últimas 24 horas</SelectItem>
      <SelectItem value="7d">Últimos 7 dias</SelectItem>
      <SelectItem value="30d">Últimos 30 dias</SelectItem>
    </SelectContent>
  </Select>
</div>

// Passar period para queries
const { data } = api.analytics.conversationsPerHour.useQuery({
  query: { period }
})
```

3. **Refatorar com Server Component + Suspense:**
```typescript
// dashboard/page.tsx (Server Component)
export default function DashboardPage() {
  return (
    <div className="flex flex-col gap-6 pt-6">
      <DashboardHeader />
      <Suspense fallback={<StatsCardsSkeleton />}>
        <StatsCards />
      </Suspense>
      <Suspense fallback={<MetricsSkeleton />}>
        <ConversationMetrics />
        <MessageMetrics />
      </Suspense>
      <Suspense fallback={<ChartsSkeleton />}>
        <DashboardCharts />
      </Suspense>
    </div>
  )
}

// dashboard/stats-cards.tsx (Server Component)
export async function StatsCards() {
  const instances = await api.instances.list.query()
  // ... render cards
}
```

**PRIORIDADE MÉDIA:**
4. **Adicionar drill-down nos gráficos:**
```typescript
<AreaChart
  data={conversationsPerHour}
  onClick={(data) => {
    if (data.activePayload) {
      const hour = data.activePayload[0].payload.hour
      router.push(`/integracoes/analytics?hour=${hour}`)
    }
  }}
>
  {/* ... */}
</AreaChart>
```

5. **Otimizar bundle com lazy loading:**
```typescript
const AreaChart = lazy(() => import('recharts').then(mod => ({ default: mod.AreaChart })))
const PieChart = lazy(() => import('recharts').then(mod => ({ default: mod.PieChart })))
const BarChart = lazy(() => import('recharts').then(mod => ({ default: mod.BarChart })))

<Suspense fallback={<Skeleton className="h-[300px]" />}>
  <AreaChart data={data}>...</AreaChart>
</Suspense>
```

---

## Área User

### 📄 src/app/user/dashboard/page.tsx

**Tipo:** Client Component

#### 🎨 Layout e Hierarquia Visual
- **✅ Pontos Fortes:**
  - Layout limpo e organizado
  - Grid responsivo (md:grid-cols-3 e lg:grid-cols-2)
  - Cards de estatísticas com ícones coloridos
  - ActivityTimeline component para atividades recentes
  - Lista de instâncias com badges de status
  - Skeletons para loading states
- **⚠️ Áreas de Atenção:**
  - Muito similar ao admin dashboard (poderia ter diferenciação visual)
  - Mock activity events (linhas 34-56)

#### 🧩 Arquitetura do Componente
- **✅ Pontos Fortes:**
  - React Query: `api.instances.list.useQuery()`
  - Hook useAuth para dados do usuário
  - isMounted pattern para hydration safety
  - useMemo implícito (calcula stats no render)
  - Tratamento de erro com Alert
- **❌ Problemas Identificados:**
  - **Mock activity events:** Dados fake hardcoded (linhas 34-56)
  - **Sem paginação:** Lista de instâncias limitada a 5 (slice)
  - **isMounted pattern:** Anti-pattern, deveria usar Suspense

#### ⚡ Performance & Reatividade
- **✅ Pontos Fortes:**
  - React Query com caching
  - Skeletons evitam layout shift
- **⚠️ Melhorias:**
  - Client Component pesado (poderia ser RSC)

#### 🧠 Coerência Cognitiva e UX
- **✅ Pontos Fortes:**
  - Saudação personalizada: "Bem-vindo, {user.name}"
  - Métricas focadas nas instâncias do usuário
  - ActivityTimeline fornece contexto temporal
  - Empty state para quando não há instâncias
- **❌ Problemas de UX:**
  - **Activity events fake:** Usuário perceberá que não são reais
  - **Sem ações rápidas:** Dashboard apenas exibe dados, sem CTAs
  - **Lista limitada a 5:** Usuário com muitas instâncias não vê todas

#### 💬 Sugestões de Melhoria

**PRIORIDADE ALTA:**
1. **Substituir activity events fake por dados reais:**
```typescript
// Criar endpoint no backend
const { data: activities } = api.activities.list.useQuery({
  query: { limit: 10, userId: user?.id }
})

const activityEvents = activities?.data?.map(activity => ({
  id: activity.id,
  title: activity.title,
  description: activity.description,
  timestamp: new Date(activity.createdAt),
  type: activity.type as 'success' | 'info' | 'warning' | 'error',
})) || []
```

**PRIORIDADE MÉDIA:**
2. **Adicionar botão "Ver todas" para instâncias:**
```typescript
<Card>
  <CardHeader className="flex flex-row items-center justify-between">
    <div>
      <CardTitle>Minhas Integrações</CardTitle>
      <CardDescription>Visualize suas integrações ativas</CardDescription>
    </div>
    {instances.length > 5 && (
      <Button variant="outline" size="sm" asChild>
        <Link href="/integracoes">Ver todas</Link>
      </Button>
    )}
  </CardHeader>
  <CardContent>
    {/* ... */}
  </CardContent>
</Card>
```

3. **Adicionar ações rápidas:**
```typescript
<div className="flex gap-4">
  <Button asChild>
    <Link href="/integracoes">
      <Plug className="mr-2 h-4 w-4" />
      Gerenciar Integrações
    </Link>
  </Button>
  <Button variant="outline" asChild>
    <Link href="/integracoes/settings">
      <Settings className="mr-2 h-4 w-4" />
      Configurações
    </Link>
  </Button>
</div>
```

4. **Refatorar com Suspense ao invés de isMounted:**
```typescript
// Remove isMounted state
// Remove useEffect setIsMounted

// No loading condition:
if (!isHydrated || isLoading) { /* ... */ }
// Vira:
if (isLoading) { /* ... */ }

// E adiciona Suspense no layout pai
```

---

## Resumo Executivo

### 📊 Estatísticas Gerais

- **Total de páginas analisadas:** 31 (incluindo layouts)
- **Server Components:** 8 (26%)
- **Client Components:** 23 (74%)
- **Páginas com problemas críticos:** 12 (39%)
- **Páginas com mock data:** 5 (16%)

### ⚠️ Problemas Críticos Recorrentes

#### 1. **Segurança (8 ocorrências)**
- localStorage para tokens (verify-magic/page.tsx)
- Cookies sem httpOnly (verify-magic/page.tsx)
- Token check sem validação (root page.tsx)
- Falta de proteção de role em layouts (admin, integracoes)

#### 2. **Padrões Anti-Pattern (15 ocorrências)**
- useEffect para data fetching (admin/page, organizations/page, etc.)
- isMounted pattern (dashboard pages)
- Type casting inseguro (`as any`, `as unknown as`)
- Fetch direto ao invés de Igniter.js client (register/page)

#### 3. **Funcionalidades Incompletas (10 ocorrências)**
- Delete não implementado (admin/organizations, integracoes/page)
- Ações de dropdown vazias (admin/webhooks)
- Breadcrumb estático (admin/layout)
- Mock data em produção (dashboards)

#### 4. **Acessibilidade (7 ocorrências)**
- Falta de headings h1 (login/page)
- Animações sem respeitar prefers-reduced-motion (auth/layout)
- Confirm nativo ao invés de AlertDialog (integracoes/page)

#### 5. **Performance (6 ocorrências)**
- Client Components desnecessários (dashboards, admin pages)
- Filtros client-side para listas grandes (integracoes, organizations)
- Múltiplos gráficos Recharts sem lazy loading

### ✅ Pontos Fortes do Projeto

#### 1. **Design System Consistente**
- Shadcn/ui bem integrado
- Componentes reutilizáveis (Card, Button, Badge, etc.)
- Tailwind CSS com tokens de design

#### 2. **Arquitetura Moderna**
- Next.js 15 App Router
- Igniter.js para API type-safe
- React Query para data fetching (onde usado corretamente)
- Modularização de features

#### 3. **UX Cuidadosa**
- Loading states com Skeletons
- Empty states informativos
- Feedback visual rico (badges, ícones, cores)
- Layouts responsivos (maioria)

#### 4. **Componentização**
- Separação de concerns
- Custom hooks (useInstances, usePermissions, useAuth)
- Modal system bem estruturado

### 🎯 Métricas de Qualidade

| Critério | Nota | Observações |
|----------|------|-------------|
| **Layout & Visual** | 8.5/10 | Design consistente, mas falta responsividade mobile em alguns casos |
| **Arquitetura** | 6.5/10 | Muitos anti-patterns (useEffect, isMounted), mas estrutura sólida |
| **Performance** | 6.0/10 | Muitos Client Components desnecessários, filtros client-side |
| **UX & Acessibilidade** | 7.5/10 | Boa experiência geral, mas falta acessibilidade (a11y) em vários pontos |
| **Segurança** | 5.0/10 | **CRÍTICO**: Tokens expostos, falta proteção de role |
| **Completude** | 7.0/10 | Muitas features incompletas (TODOs, mock data) |
| **Manutenibilidade** | 7.5/10 | Código organizado, mas componentes muito grandes |

**Nota Geral:** **6.9/10** (Bom, mas precisa de melhorias críticas)

---

## Recomendações Prioritárias

### 🔴 PRIORIDADE CRÍTICA (Implementar AGORA)

1. **[SEGURANÇA] Migrar tokens para httpOnly cookies**
   - **Arquivos:** verify-magic/page.tsx
   - **Risco:** XSS pode roubar tokens
   - **Solução:** Backend deve gerenciar cookies httpOnly

2. **[SEGURANÇA] Adicionar proteção de role em layouts**
   - **Arquivos:** admin/layout.tsx, integracoes/layout.tsx
   - **Risco:** Qualquer usuário pode acessar rotas protegidas
   - **Solução:** Middleware ou verificação no layout

3. **[FUNCIONALIDADE] Implementar delete de instâncias e organizações**
   - **Arquivos:** integracoes/page.tsx, organizations/page.tsx
   - **Risco:** Frustração do usuário (botão não funciona)
   - **Solução:** Implementar mutations com AlertDialog

4. **[SEGURANÇA] Validar token na root page**
   - **Arquivo:** app/page.tsx
   - **Risco:** Redirecionamento baseado apenas em presença de cookie
   - **Solução:** Chamar api.auth.getSession.query()

### 🟠 PRIORIDADE ALTA (Implementar em 1-2 semanas)

5. **[ARQUITETURA] Migrar useEffect para React Query**
   - **Arquivos:** admin/page, organizations/page, etc.
   - **Benefício:** Caching, refetch automático, menos bugs
   - **Solução:** Usar api.*.useQuery() hooks

6. **[PERFORMANCE] Converter dashboards para Server Components**
   - **Arquivos:** integracoes/dashboard/page, user/dashboard/page
   - **Benefício:** Bundle menor, SSR, melhor SEO
   - **Solução:** Usar RSC + Suspense + streaming

7. **[FUNCIONALIDADE] Substituir mock data por endpoints reais**
   - **Arquivos:** Todos os dashboards
   - **Risco:** Usuário percebe dados fake
   - **Solução:** Criar endpoints analytics no backend

8. **[UX] Tornar integracoes/page.tsx responsivo**
   - **Arquivo:** integracoes/page.tsx
   - **Risco:** Layout quebrado em mobile
   - **Solução:** Tabs para alternar lista/detalhes

### 🟡 PRIORIDADE MÉDIA (Implementar em 1 mês)

9. **[ACESSIBILIDADE] Respeitar prefers-reduced-motion**
   - **Arquivo:** auth/layout.tsx
   - **Benefício:** Inclusão de usuários sensíveis a movimento
   - **Solução:** useMediaQuery + condicional

10. **[REFATORAÇÃO] Quebrar componentes grandes**
    - **Arquivo:** integracoes/page.tsx (485 linhas)
    - **Benefício:** Manutenibilidade, reusabilidade
    - **Solução:** Sub-componentes (InstancesList, InstanceDetails, etc.)

11. **[PERFORMANCE] Adicionar lazy loading em gráficos**
    - **Arquivos:** Dashboards com Recharts
    - **Benefício:** Bundle inicial menor
    - **Solução:** React.lazy() + Suspense

12. **[UX] Implementar breadcrumbs dinâmicos**
    - **Arquivos:** admin/layout, integracoes/layout
    - **Benefício:** Navegação clara, orientação espacial
    - **Solução:** usePathname + map de rotas

### 🟢 PRIORIDADE BAIXA (Backlog)

13. **[UX] Adicionar paginação em todas tabelas**
14. **[ACESSIBILIDADE] Adicionar headings h1 em todas páginas**
15. **[UX] Implementar filtros server-side**
16. **[PERFORMANCE] Otimizar densidade de estrelas para mobile**
17. **[SEO] Melhorar metadata com Open Graph**

---

## Conclusão

O projeto **App Quayer** demonstra uma **arquitetura moderna e design system consistente**, com uso adequado de Next.js 15, Igniter.js, e Shadcn/ui. A **experiência visual é premium**, com animações, feedback rico e layouts bem estruturados.

No entanto, existem **12 problemas críticos** que precisam ser resolvidos urgentemente, principalmente relacionados a:
- **Segurança:** Tokens expostos, falta de proteção de role
- **Completude:** Funcionalidades não implementadas (delete, ações de dropdown)
- **Padrões:** Anti-patterns (useEffect para fetch, isMounted)
- **Performance:** Client Components desnecessários, filtros client-side

Com as **recomendações prioritárias implementadas**, o projeto pode alcançar nota **8.5+/10**, se tornando uma aplicação robusta, segura e performática.

**Próximo passo sugerido:** Implementar as 4 recomendações críticas em uma sprint dedicada de 3-5 dias.
