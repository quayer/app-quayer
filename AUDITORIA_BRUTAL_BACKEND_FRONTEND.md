# 🔴 AUDITORIA BRUTAL: Backend + Frontend + UX

## ❌ PROBLEMAS CRÍTICOS ENCONTRADOS

---

## 🚨 **BACKEND - ISSUES CRÍTICOS**

### **1. SEGURANÇA - CRÍTICO** ⚠️

#### ❌ **Problema 1.1: Token Admin em Variável de Ambiente Opcional**
**Arquivo:** `src/features/connections/controllers/connections.controller.ts:86`
```typescript
const UAZAPI_ADMIN_TOKEN = process.env.UAZAPI_ADMIN_TOKEN || ''
```

**Problema:**
- Se `UAZAPI_ADMIN_TOKEN` não estiver definido, o sistema continua funcionando com string vazia
- Isso fará todas as chamadas ao uazapi falharem silenciosamente
- Não há validação no startup

**Impacto:** 🔴 **CRÍTICO** - Sistema quebra em produção sem aviso

**Solução:**
```typescript
const UAZAPI_ADMIN_TOKEN = process.env.UAZAPI_ADMIN_TOKEN
if (!UAZAPI_ADMIN_TOKEN) {
  throw new Error('UAZAPI_ADMIN_TOKEN is required but not set')
}
```

---

#### ❌ **Problema 1.2: Autenticação Não Verificada em Todos os Endpoints**
**Arquivo:** `src/features/connections/controllers/connections.controller.ts:189-192`

```typescript
const user = context.user
if (!user || !user.currentOrgId) {
  throw new Error('Unauthorized')
}
```

**Problemas:**
1. Erro genérico `'Unauthorized'` não retorna HTTP 401
2. Não verifica se o usuário tem permissão para criar conexões
3. Não limita número de conexões por organização

**Impacto:** 🟠 **ALTO** - Possível abuso de recursos

**Solução:**
```typescript
if (!user || !user.currentOrgId) {
  return { error: 'Unauthorized', status: 401 }
}

// Verificar limite de conexões
const count = await db.connection.count({
  where: { organizationId: user.currentOrgId, deletedAt: null }
})

const MAX_CONNECTIONS = parseInt(process.env.MAX_CONNECTIONS_PER_ORG || '10')
if (count >= MAX_CONNECTIONS) {
  return {
    error: `Limite de ${MAX_CONNECTIONS} conexões atingido`,
    status: 403
  }
}
```

---

#### ❌ **Problema 1.3: Encryption Key com Fallback Inseguro**
**Arquivo:** `src/lib/crypto.ts`

```typescript
const ENCRYPTION_KEY = process.env.ENCRYPTION_KEY || 'dev-key-not-secure'
```

**Problema:**
- Se `ENCRYPTION_KEY` não estiver definida, usa chave de desenvolvimento
- Tokens ficam "criptografados" com chave conhecida
- Extremamente perigoso em produção

**Impacto:** 🔴 **CRÍTICO** - Dados sensíveis comprometidos

**Solução:**
```typescript
const ENCRYPTION_KEY = process.env.ENCRYPTION_KEY
if (!ENCRYPTION_KEY) {
  throw new Error('ENCRYPTION_KEY must be set in production')
}
if (ENCRYPTION_KEY.length < 32) {
  throw new Error('ENCRYPTION_KEY must be at least 32 characters')
}
```

---

### **2. VALIDAÇÃO - ALTO** ⚠️

#### ❌ **Problema 2.1: Nome da Conexão Não Valida Caracteres**
**Arquivo:** `src/features/connections/controllers/connections.controller.ts:54`

```typescript
name: z.string().min(1).max(100),
```

**Problemas:**
- Aceita qualquer caractere (incluindo SQL injection attempts)
- Aceita emojis que podem quebrar UI
- Aceita espaços duplicados
- Não verifica unicidade por organização

**Impacto:** 🟠 **MÉDIO** - UX ruim + possível SQL injection

**Solução:**
```typescript
name: z.string()
  .min(1, 'Nome é obrigatório')
  .max(100, 'Nome deve ter no máximo 100 caracteres')
  .regex(/^[a-zA-Z0-9\s\-_áéíóúàèìòùâêîôûãõç]+$/i,
    'Nome deve conter apenas letras, números, espaços e hífens')
  .transform(val => val.trim().replace(/\s+/g, ' ')),

// No handler, verificar unicidade:
const existing = await db.connection.findFirst({
  where: {
    name: { equals: name, mode: 'insensitive' },
    organizationId: user.currentOrgId,
    deletedAt: null
  }
})
if (existing) {
  return { error: 'Já existe uma conexão com este nome', status: 409 }
}
```

---

#### ❌ **Problema 2.2: URLs n8n Não Validadas Adequadamente**
**Arquivo:** `src/features/connections/controllers/connections.controller.ts:58-59`

```typescript
n8nWebhookUrl: z.string().url().optional(),
n8nFallbackUrl: z.string().url().optional(),
```

**Problemas:**
- Aceita qualquer URL (incluindo localhost, IPs privados)
- Não verifica se URL é HTTPS
- Não valida se URL do n8n está acessível
- Possível SSRF (Server-Side Request Forgery)

**Impacto:** 🔴 **CRÍTICO** - Vulnerabilidade de segurança

**Solução:**
```typescript
const isProduction = process.env.NODE_ENV === 'production'

n8nWebhookUrl: z.string()
  .url()
  .refine(url => {
    if (isProduction && !url.startsWith('https://')) {
      throw new Error('URL deve ser HTTPS em produção')
    }
    const hostname = new URL(url).hostname
    // Bloquear IPs privados e localhost
    if (hostname === 'localhost' ||
        hostname.startsWith('127.') ||
        hostname.startsWith('192.168.') ||
        hostname.startsWith('10.')) {
      throw new Error('URLs privadas não são permitidas')
    }
    return true
  })
  .optional(),
```

---

### **3. ERROR HANDLING - ALTO** ⚠️

#### ❌ **Problema 3.1: Erros Genéricos Sem Context**
**Arquivo:** `src/features/connections/controllers/connections.controller.ts:110, 130, 167`

```typescript
throw new Error(`Failed to create uazapi instance: ${error.message || response.statusText}`)
```

**Problemas:**
- Erro expõe detalhes internos do uazapi ao usuário
- Não loga contexto (connectionId, organizationId)
- Não diferencia tipos de erro (timeout, auth, validation)
- Usuário não sabe o que fazer

**Impacto:** 🟠 **MÉDIO** - UX ruim + debugging difícil

**Solução:**
```typescript
try {
  const response = await fetch(`${UAZAPI_BASE_URL}/instance/init`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${UAZAPI_ADMIN_TOKEN}`,
    },
    body: JSON.stringify({
      instanceName: connectionId,
      integration: 'WHATSAPP-BAILEYS',
    }),
    signal: AbortSignal.timeout(10000), // 10s timeout
  })

  if (!response.ok) {
    const error = await response.json().catch(() => ({ message: 'Unknown error' }))

    // Log detalhado para debugging
    console.error('[uazapi] Failed to create instance', {
      connectionId,
      status: response.status,
      error: error.message,
    })

    // Mensagem amigável para usuário
    if (response.status === 401) {
      throw new Error('Credenciais do WhatsApp inválidas. Verifique as configurações.')
    } else if (response.status === 429) {
      throw new Error('Muitas tentativas. Aguarde alguns minutos e tente novamente.')
    } else if (response.status >= 500) {
      throw new Error('Serviço temporariamente indisponível. Tente novamente em instantes.')
    } else {
      throw new Error('Não foi possível criar a conexão. Entre em contato com o suporte.')
    }
  }

  return response.json()
} catch (error) {
  if (error instanceof TypeError && error.message.includes('fetch')) {
    throw new Error('Não foi possível conectar ao serviço WhatsApp. Verifique sua internet.')
  }
  throw error
}
```

---

### **4. RACE CONDITIONS - MÉDIO** ⚠️

#### ❌ **Problema 4.1: Criação + Conexão uazapi Não é Transacional**
**Arquivo:** `src/features/connections/controllers/connections.controller.ts:197-227`

**Fluxo atual:**
```typescript
// 1. Criar no banco
const connection = await db.connection.create({...})

// 2. Criar no uazapi (pode falhar)
const uazapiInstance = await createUazapiInstance(connection.id)

// 3. Se falhar, deletar do banco
await db.connection.delete({ where: { id: connection.id } })
```

**Problemas:**
- Se app crashar entre passo 1 e 3, fica conexão órfã no banco
- Se deletar falhar, fica registro inconsistente
- Race condition: 2 requests simultâneos podem criar duplicatas

**Impacto:** 🟠 **MÉDIO** - Dados inconsistentes

**Solução:**
```typescript
// Usar transaction do Prisma
const connection = await db.$transaction(async (tx) => {
  // 1. Verificar se já existe (com lock)
  const existing = await tx.connection.findFirst({
    where: {
      name,
      organizationId: user.currentOrgId,
      deletedAt: null
    },
    // Lock para evitar race condition
    select: { id: true }
  })

  if (existing) {
    throw new Error('Conexão com este nome já existe')
  }

  // 2. Criar conexão
  const conn = await tx.connection.create({
    data: {
      name,
      description,
      channel,
      provider,
      status: 'PENDING',
      organizationId: user.currentOrgId,
      n8nWebhookUrl,
      n8nFallbackUrl,
      n8nWorkflowId,
      agentConfig: agentConfig as Prisma.InputJsonValue,
    },
  })

  // 3. Criar no uazapi (fora da transaction)
  // Se falhar, rollback automático
  return conn
})

// Criar no uazapi DEPOIS da transaction
try {
  if (channel === 'WHATSAPP' && provider === 'WHATSAPP_WEB') {
    const uazapiInstance = await createUazapiInstance(connection.id)
    const encryptedToken = encrypt(uazapiInstance.token)

    await db.connection.update({
      where: { id: connection.id },
      data: {
        uazapiInstanceId: uazapiInstance.instanceId,
        uazapiToken: encryptedToken,
        status: 'CONNECTING',
      },
    })
  }
} catch (error) {
  // Se falhar, marcar como ERROR (não deletar)
  await db.connection.update({
    where: { id: connection.id },
    data: { status: 'ERROR' }
  })
  throw error
}
```

---

### **5. PERFORMANCE - MÉDIO** ⚠️

#### ❌ **Problema 5.1: N+1 Query em List Connections**
**Arquivo:** `src/features/connections/controllers/connections.controller.ts` (não mostrado no código, mas comum)

**Problema:**
- Se houver relacionamentos não incluídos, faz query separada para cada conexão
- Lento com muitas conexões

**Solução:**
```typescript
// Sempre incluir relacionamentos necessários
const connections = await db.connection.findMany({
  where,
  orderBy: { createdAt: 'desc' },
  skip,
  take: limit,
  select: {
    id: true,
    name: true,
    description: true,
    channel: true,
    provider: true,
    status: true,
    n8nWebhookUrl: true,
    n8nWorkflowId: true,
    uazapiInstanceId: true,
    createdAt: true,
    updatedAt: true,
    // Incluir contagem de forma eficiente
    _count: {
      select: {
        chatSessions: true,
        messages: true,
      }
    }
  },
})
```

---

#### ❌ **Problema 5.2: Sem Paginação em Estatísticas**
**Arquivo:** `src/features/webhooks/controllers/uazapi-webhooks.controller.ts`

**Problema:**
- Endpoint `/webhooks/n8n-stats` faz aggregate de TODOS os registros
- Pode ficar lento com milhões de logs

**Solução:**
```typescript
// Sempre limitar período
const where: Prisma.N8nCallLogWhereInput = {
  createdAt: {
    gte: new Date(Date.now() - hours * 60 * 60 * 1000),
  },
  // Adicionar índice composto em (createdAt, connectionId, success)
}
```

---

## 🎨 **FRONTEND - ISSUES CRÍTICOS**

### **1. UX - JORNADA DE INTEGRAÇÃO** ⚠️

#### ❌ **Problema UX 1.1: Sem Onboarding para Primeira Conexão**
**Arquivo:** `src/app/(dashboard)/conexoes/page.tsx:269-282`

**Problema:**
- Página vazia simplesmente mostra botão "Criar Primeira Conexão"
- Usuário não sabe:
  - O que é uma conexão
  - Por que precisa criar
  - Quais os benefícios
  - Como funciona o processo

**Impacto:** 🔴 **CRÍTICO** - Taxa de abandono alta

**Solução:**
```tsx
{/* Empty state melhorado */}
{connections.length === 0 && !search && !filters ? (
  <div className="max-w-2xl mx-auto text-center py-12">
    <div className="mb-6">
      <MessageCircle className="h-16 w-16 mx-auto text-muted-foreground" />
    </div>

    <h2 className="text-2xl font-bold mb-2">
      Conecte seus canais de atendimento
    </h2>

    <p className="text-muted-foreground mb-8">
      Integre WhatsApp, Instagram, Telegram e Email em um só lugar.
      Configure agentes de IA inteligentes para cada canal.
    </p>

    <div className="grid grid-cols-3 gap-4 mb-8 text-left">
      <Card className="p-4">
        <Smartphone className="h-8 w-8 mb-2 text-green-600" />
        <h3 className="font-semibold mb-1">Fácil de conectar</h3>
        <p className="text-sm text-muted-foreground">
          Escaneie QR Code e está pronto
        </p>
      </Card>

      <Card className="p-4">
        <Brain className="h-8 w-8 mb-2 text-blue-600" />
        <h3 className="font-semibold mb-1">IA integrada</h3>
        <p className="text-sm text-muted-foreground">
          Conecte workflows n8n personalizados
        </p>
      </Card>

      <Card className="p-4">
        <Zap className="h-8 w-8 mb-2 text-purple-600" />
        <h3 className="font-semibold mb-1">Tempo real</h3>
        <p className="text-sm text-muted-foreground">
          Mensagens processadas instantaneamente
        </p>
      </Card>
    </div>

    <Button onClick={() => setCreateModalOpen(true)} size="lg">
      <Plus className="mr-2 h-5 w-5" />
      Criar Primeira Conexão
    </Button>

    <p className="text-sm text-muted-foreground mt-4">
      Ou <a href="/docs" className="text-primary underline">veja a documentação</a>
    </p>
  </div>
) : null}
```

---

#### ❌ **Problema UX 1.2: Modal de Criação Sem Steps/Wizard**
**Arquivo:** `src/features/connections/components/CreateConnectionModal.tsx`

**Problema:**
- Formulário mostra todos os campos de uma vez
- Assustador para usuários novos
- Campos avançados (n8n) confundem iniciantes
- Sem validação em tempo real visual

**Impacto:** 🟠 **ALTO** - Confusão e erros

**Solução:**
```tsx
// Transformar em wizard com 3 steps:
// Step 1: Informações Básicas
// Step 2: Canal e Provider
// Step 3: Configurações Avançadas (opcional)

const [step, setStep] = useState(1)

<DialogContent className="max-w-3xl">
  {/* Progress indicator */}
  <div className="flex items-center justify-between mb-6">
    <div className={cn("flex items-center", step >= 1 && "text-primary")}>
      <div className="rounded-full bg-primary text-white w-8 h-8 flex items-center justify-center">1</div>
      <span className="ml-2 text-sm">Informações</span>
    </div>
    <div className="flex-1 h-px bg-border mx-4" />
    <div className={cn("flex items-center", step >= 2 && "text-primary")}>
      <div className="rounded-full bg-primary text-white w-8 h-8 flex items-center justify-center">2</div>
      <span className="ml-2 text-sm">Canal</span>
    </div>
    <div className="flex-1 h-px bg-border mx-4" />
    <div className={cn("flex items-center", step >= 3 && "text-primary")}>
      <div className="rounded-full border-2 w-8 h-8 flex items-center justify-center">3</div>
      <span className="ml-2 text-sm">Avançado</span>
    </div>
  </div>

  {/* Step content */}
  {step === 1 && <Step1BasicInfo />}
  {step === 2 && <Step2ChannelProvider />}
  {step === 3 && <Step3Advanced />}

  {/* Navigation */}
  <DialogFooter>
    {step > 1 && (
      <Button variant="outline" onClick={() => setStep(step - 1)}>
        Voltar
      </Button>
    )}
    {step < 3 ? (
      <Button onClick={() => setStep(step + 1)}>
        Próximo
      </Button>
    ) : (
      <Button type="submit">Criar Conexão</Button>
    )}
  </DialogFooter>
</DialogContent>
```

---

#### ❌ **Problema UX 1.3: QR Code Modal Sem Instruções Visuais**
**Arquivo:** `src/features/connections/components/QRCodeModal.tsx:94-111`

**Problema:**
- Lista de passos em texto
- Sem ilustrações ou GIFs
- Não mostra onde clicar no WhatsApp
- Sem timer/countdown visual

**Impacto:** 🟠 **ALTO** - Usuários não sabem como proceder

**Solução:**
```tsx
<div className="space-y-6">
  {/* Timer de expiração */}
  <div className="flex items-center justify-between p-3 bg-yellow-50 rounded-lg border border-yellow-200">
    <div className="flex items-center gap-2">
      <Clock className="h-4 w-4 text-yellow-600" />
      <span className="text-sm font-medium">QR Code expira em:</span>
    </div>
    <span className="text-lg font-bold text-yellow-600">
      {formatTime(timeRemaining)}
    </span>
  </div>

  {/* QR Code com tamanho maior */}
  <div className="relative">
    <div className="flex justify-center p-8 bg-white rounded-xl border-2 border-dashed">
      <Image
        src={qrCode}
        alt="QR Code"
        width={320}  // ← Maior
        height={320}
        className="rounded-lg"
      />
    </div>

    {/* Indicador de scanning */}
    <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
      <div className="w-full h-1 bg-green-500/20 animate-scan" />
    </div>
  </div>

  {/* Instruções com ícones visuais */}
  <div className="space-y-4">
    <div className="flex items-start gap-3">
      <div className="rounded-full bg-primary/10 p-2 flex-shrink-0">
        <Smartphone className="h-5 w-5 text-primary" />
      </div>
      <div>
        <p className="font-medium">1. Abra o WhatsApp no celular</p>
        <p className="text-sm text-muted-foreground">
          Toque no ícone verde do WhatsApp
        </p>
      </div>
    </div>

    <div className="flex items-start gap-3">
      <div className="rounded-full bg-primary/10 p-2 flex-shrink-0">
        <MoreVertical className="h-5 w-5 text-primary" />
      </div>
      <div>
        <p className="font-medium">2. Toque em "Mais opções" (⋮)</p>
        <p className="text-sm text-muted-foreground">
          Canto superior direito da tela
        </p>
      </div>
    </div>

    <div className="flex items-start gap-3">
      <div className="rounded-full bg-primary/10 p-2 flex-shrink-0">
        <Link className="h-5 w-5 text-primary" />
      </div>
      <div>
        <p className="font-medium">3. Selecione "Aparelhos conectados"</p>
        <p className="text-sm text-muted-foreground">
          Depois toque em "Conectar um aparelho"
        </p>
      </div>
    </div>

    <div className="flex items-start gap-3">
      <div className="rounded-full bg-primary/10 p-2 flex-shrink-0">
        <ScanIcon className="h-5 w-5 text-primary" />
      </div>
      <div>
        <p className="font-medium">4. Escaneie o QR Code</p>
        <p className="text-sm text-muted-foreground">
          Aponte a câmera para o código acima
        </p>
      </div>
    </div>
  </div>

  {/* Ajuda adicional */}
  <Alert>
    <HelpCircle className="h-4 w-4" />
    <AlertTitle>Tendo problemas?</AlertTitle>
    <AlertDescription>
      <a href="/docs/whatsapp-setup" className="text-primary underline">
        Veja o tutorial completo com imagens
      </a>
    </AlertDescription>
  </Alert>
</div>
```

---

### **2. UI - DESIGN & ACESSIBILIDADE** ⚠️

#### ❌ **Problema UI 2.1: ConnectionCard Sem Estados de Loading**
**Arquivo:** `src/features/connections/components/ConnectionCard.tsx`

**Problema:**
- Botões não mostram loading ao clicar
- Usuário não sabe se ação foi registrada
- Pode clicar múltiplas vezes (race condition)

**Solução:**
```tsx
const [isConnecting, setIsConnecting] = useState(false)
const [isDisconnecting, setIsDisconnecting] = useState(false)

<Button
  onClick={async () => {
    setIsConnecting(true)
    try {
      await onConnect?.()
    } finally {
      setIsConnecting(false)
    }
  }}
  disabled={isConnecting}
>
  {isConnecting ? (
    <>
      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
      Conectando...
    </>
  ) : (
    <>
      <QrCode className="mr-2 h-4 w-4" />
      Conectar
    </>
  )}
</Button>
```

---

#### ❌ **Problema UI 2.2: Sem Feedback Visual em Erros**
**Arquivo:** `src/features/connections/components/CreateConnectionModal.tsx:152-157`

**Problema:**
- Erro apenas em Alert no final do formulário
- Usuário pode não ver
- Não destaca campo com erro
- Sem ícone de erro inline

**Solução:**
```tsx
{/* Error inline no campo */}
<FormField
  control={form.control}
  name="name"
  render={({ field, fieldState }) => (
    <FormItem>
      <FormLabel>Nome da Conexão*</FormLabel>
      <FormControl>
        <div className="relative">
          <Input
            placeholder="Ex: WhatsApp Atendimento"
            {...field}
            className={cn(
              fieldState.error && "border-red-500 focus-visible:ring-red-500"
            )}
          />
          {fieldState.error && (
            <AlertCircle className="absolute right-3 top-3 h-4 w-4 text-red-500" />
          )}
        </div>
      </FormControl>
      {fieldState.error && (
        <FormMessage className="flex items-center gap-1">
          <XCircle className="h-3 w-3" />
          {fieldState.error.message}
        </FormMessage>
      )}
      <FormDescription>
        Nome para identificar esta conexão internamente
      </FormDescription>
    </FormItem>
  )}
/>
```

---

### **3. USABILIDADE - JORNADA** ⚠️

#### ❌ **Problema 3.1: Sem Link de Compartilhamento de QR Code**

**Problema Relatado pelo Usuário:**
- Link de compartilhamento do QR Code foi criado mas não há validação de página

**Impacto:** 🔴 **CRÍTICO** - Feature não funcional

**Preciso verificar:**
1. Existe endpoint de compartilhamento?
2. Existe página pública para visualizar QR?
3. Link expira corretamente?

Vou investigar:

