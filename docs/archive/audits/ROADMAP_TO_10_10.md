# 🎯 ROADMAP EXECUTIVO PARA 10/10

**Status Atual:** 8.3/10
**Objetivo:** 10.0/10
**Gap:** 1.7 pontos
**Tempo Estimado:** 30-40 horas

---

## 📊 RESUMO EXECUTIVO

### O que JÁ TEMOS ✅
- ✅ Autenticação completa (JWT + refresh token)
- ✅ Multi-org + convites + RBAC
- ✅ Dashboard com dados reais da UAZapi
- ✅ Conversas funcionando (listar + enviar texto)
- ✅ Animações profissionais (framer-motion + count-up)
- ✅ Auto-scroll em mensagens
- ✅ 138/200 testes unitários passando (69%)
- ✅ Hover effects e transições

### O que FALTA para 10/10 ❌
1. **Funcionalidades críticas UAZapi** (60+ rotas não implementadas)
2. **Compartilhamento fácil de QR Code** (NÃO existe!)
3. **Envio de mídia** (imagem, vídeo, documento)
4. **Gestão de grupos** (criar, adicionar, remover)
5. **Tooltips** (ZERO explicações nos ícones)
6. **Acessibilidade** (WCAG reprovado - sem ARIA)
7. **Mobile responsivo** (conversas 3 colunas quebra)
8. **Performance** (sem paginação, sem virtual scroll)
9. **Empty states ilustrados**
10. **Nomenclatura consistente**

---

## 🔴 SPRINT 1: COMPARTILHAMENTO QR CODE (CRÍTICO!)
**Tempo:** 3-4h | **Impacto:** +0.5 pontos

### O Problema
❌ Usuário não consegue compartilhar QR Code facilmente
❌ Sem countdown de expiração (120s)
❌ Sem botão "Gerar novo QR"
❌ Sem opção de copiar/compartilhar

### A Solução
```tsx
// src/components/whatsapp/qr-code-share.tsx
import { useState, useEffect } from 'react'
import { QrCode, Copy, Share2, RefreshCw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { toast } from 'sonner'
import CountUp from 'react-countup'

export function QRCodeShare({ qrcode, onRefresh }: Props) {
  const [timeLeft, setTimeLeft] = useState(120) // 2 minutos

  useEffect(() => {
    const timer = setInterval(() => {
      setTimeLeft(prev => prev > 0 ? prev - 1 : 0)
    }, 1000)
    return () => clearInterval(timer)
  }, [qrcode])

  const handleCopy = async () => {
    // Converter base64 para blob e copiar
    const response = await fetch(qrcode)
    const blob = await response.blob()
    await navigator.clipboard.write([
      new ClipboardItem({ 'image/png': blob })
    ])
    toast.success('QR Code copiado!')
  }

  const handleShare = async () => {
    // Web Share API
    const blob = await fetch(qrcode).then(r => r.blob())
    const file = new File([blob], 'qrcode.png', { type: 'image/png' })
    await navigator.share({
      title: 'Conectar WhatsApp',
      text: 'Escaneie este QR Code para conectar',
      files: [file]
    })
  }

  return (
    <div className="space-y-4">
      {/* QR Code com countdown */}
      <div className="relative">
        <img src={qrcode} alt="QR Code" className="mx-auto" />

        {/* Countdown circular */}
        <div className="absolute top-2 right-2 bg-background/80 rounded-full p-2">
          <div className="text-sm font-bold">
            <CountUp end={timeLeft} duration={1} />s
          </div>
        </div>

        {/* Overlay quando expirado */}
        {timeLeft === 0 && (
          <div className="absolute inset-0 bg-background/90 flex items-center justify-center">
            <Button onClick={onRefresh} size="lg">
              <RefreshCw className="mr-2" />
              Gerar Novo QR Code
            </Button>
          </div>
        )}
      </div>

      {/* Botões de ação */}
      <div className="flex gap-2">
        <Button onClick={handleCopy} variant="outline" className="flex-1">
          <Copy className="mr-2 h-4 w-4" />
          Copiar Imagem
        </Button>
        <Button onClick={handleShare} className="flex-1">
          <Share2 className="mr-2 h-4 w-4" />
          Compartilhar
        </Button>
      </div>

      {/* Instruções */}
      <div className="text-sm text-muted-foreground text-center">
        <p>1. Abra o WhatsApp no celular</p>
        <p>2. Toque em Mais opções > Aparelhos conectados</p>
        <p>3. Escaneie o QR Code acima</p>
      </div>
    </div>
  )
}
```

**Resultado:** ✅ Compartilhamento fácil + Countdown + Auto-refresh

---

## 🟠 SPRINT 2: ENVIO DE MÍDIA
**Tempo:** 5-6h | **Impacto:** +0.8 pontos

### Implementar
1. **Controller de Mídia**
```typescript
// src/features/messages/controllers/media.controller.ts
export const mediaController = igniter.controller({
  name: 'media',
  path: '/messages/media',
  actions: {
    sendImage: igniter.mutation({
      schema: z.object({
        instanceId: z.string(),
        chatId: z.string(),
        file: z.instanceof(File),
        caption: z.string().optional(),
      }),
      handler: async ({ request, context }) => {
        const formData = new FormData()
        formData.append('file', file)
        formData.append('caption', caption || '')

        const response = await fetch(
          `${UAZAPI_URL}/send/media`,
          {
            method: 'POST',
            headers: { token: instance.uazToken },
            body: formData
          }
        )
        return response.success({ data: await response.json() })
      }
    }),

    sendVideo: igniter.mutation({ /* similar */ }),
    sendDocument: igniter.mutation({ /* similar */ }),
  }
})
```

2. **UI com Upload**
```tsx
// src/app/integracoes/conversations/page.tsx
<div className="flex items-center gap-2">
  <input
    type="file"
    accept="image/*,video/*,.pdf,.doc,.docx"
    onChange={handleFileSelect}
    className="hidden"
    ref={fileInputRef}
  />

  <Button
    size="icon"
    variant="ghost"
    onClick={() => fileInputRef.current?.click()}
  >
    <Paperclip className="h-4 w-4" />
  </Button>

  {selectedFile && (
    <div className="flex items-center gap-2 p-2 border rounded">
      <img src={preview} className="h-10 w-10 object-cover rounded" />
      <span className="text-sm">{selectedFile.name}</span>
      <Button size="sm" variant="ghost" onClick={clearFile}>
        <X className="h-4 w-4" />
      </Button>
    </div>
  )}
</div>
```

**Resultado:** ✅ Envio completo de mídia com preview

---

## 🟡 SPRINT 3: TOOLTIPS & NOMENCLATURA
**Tempo:** 3-4h | **Impacto:** +0.7 pontos

### Tooltips em TUDO
```tsx
// Usar shadcn/ui Tooltip
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip"

// Exemplo: Dashboard
<TooltipProvider>
  <Tooltip>
    <TooltipTrigger asChild>
      <Plug className="h-4 w-4 text-muted-foreground" />
    </TooltipTrigger>
    <TooltipContent>
      <p>Número de WhatsApp conectados à plataforma</p>
    </TooltipContent>
  </Tooltip>
</TooltipProvider>
```

### Nomenclatura Consistente
**ANTES ❌:**
- "Instâncias" (técnico)
- "Token UAZ" (jargão)
- "wa_chatid" (código na UI)
- "Connected" (inglês)

**DEPOIS ✅:**
```tsx
// Constantes de i18n
const TERMS = {
  instance: 'Número WhatsApp',
  token: 'Token de Acesso',
  chatId: 'ID da Conversa',
  connected: 'Conectado',
  disconnected: 'Desconectado',
  conversations: 'Conversas Ativas', // sempre "Ativas", nunca "Abertas" ou "Em Andamento"
}
```

**Resultado:** ✅ Plataforma compreensível para qualquer usuário

---

## 🟢 SPRINT 4: ACESSIBILIDADE WCAG
**Tempo:** 6-8h | **Impacto:** +3.0 pontos (MAIOR IMPACTO!)

### ARIA Labels Completos
```tsx
// Dashboard - Gráficos
<ChartContainer
  aria-label="Gráfico de conversas por hora nas últimas 24 horas"
  role="img"
>
  <AreaChart data={data}>
    <Area
      dataKey="count"
      aria-label="Quantidade de conversas"
    />
  </AreaChart>
</ChartContainer>

// Forms
<Input
  aria-label="Digite sua mensagem"
  aria-describedby="message-hint"
  aria-required="true"
/>
<span id="message-hint" className="sr-only">
  Pressione Enter para enviar ou Shift+Enter para nova linha
</span>

// Buttons
<Button
  aria-label="Enviar mensagem"
  aria-keyshortcuts="Enter"
>
  <Send className="h-4 w-4" aria-hidden="true" />
</Button>
```

### Navegação por Teclado
```tsx
// Command Palette (Ctrl+K)
import { CommandDialog } from "@/components/ui/command"

export function useKeyboardShortcuts() {
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Ctrl+K: Buscar
      if (e.ctrlKey && e.key === 'k') {
        e.preventDefault()
        setCommandOpen(true)
      }

      // Ctrl+N: Nova conversa
      if (e.ctrlKey && e.key === 'n') {
        e.preventDefault()
        router.push('/integracoes/conversations')
      }

      // Escape: Fechar modals
      if (e.key === 'Escape') {
        closeAllModals()
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [])
}
```

**Resultado:** ✅ Plataforma 100% navegável por teclado e acessível

---

## 🔵 SPRINT 5: MOBILE RESPONSIVO
**Tempo:** 4-6h | **Impacto:** +2.5 pontos

### Conversas com Drawer
```tsx
// Mobile: Drawer para instâncias + chats
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"

export function ConversationsPageMobile() {
  return (
    <div className="md:hidden">
      {/* Drawer Instâncias */}
      <Sheet>
        <SheetTrigger asChild>
          <Button variant="outline">
            <Menu className="h-4 w-4" />
            WhatsApp
          </Button>
        </SheetTrigger>
        <SheetContent side="left">
          <InstancesList />
        </SheetContent>
      </Sheet>

      {/* Tabs Chats/Mensagens */}
      <Tabs defaultValue="chats">
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="chats">Conversas</TabsTrigger>
          <TabsTrigger value="messages">Mensagens</TabsTrigger>
        </TabsList>

        <TabsContent value="chats">
          <ChatsList />
        </TabsContent>

        <TabsContent value="messages">
          <MessagesList />
        </TabsContent>
      </Tabs>
    </div>
  )
}
```

### Dashboard Responsivo
```tsx
// Empilhar cards em mobile
<div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
  {/* Cards se adaptam automaticamente */}
</div>

// Gráficos adaptáveis
<ResponsiveContainer width="100%" height={300}>
  {/* Recharts se adapta */}
</ResponsiveContainer>
```

**Resultado:** ✅ Experiência mobile perfeita

---

## 🟣 SPRINT 6: PERFORMANCE CRÍTICA
**Tempo:** 3-5h | **Impacto:** +1.5 pontos

### Virtual Scrolling
```tsx
import { FixedSizeList } from 'react-window'

// Conversas com virtual scroll
<FixedSizeList
  height={600}
  itemCount={chats.length}
  itemSize={80}
  width="100%"
>
  {({ index, style }) => (
    <div style={style}>
      <ChatItem chat={chats[index]} />
    </div>
  )}
</FixedSizeList>
```

### Paginação & Infinite Scroll
```tsx
// Dashboard com limit
const { data } = api.instances.list.useQuery({
  limit: 20,
  offset: page * 20
})

// Mensagens com infinite scroll
const {
  data,
  fetchNextPage,
  hasNextPage,
} = api.messages.list.useInfiniteQuery({
  instanceId,
  chatId,
  limit: 50,
})
```

### Lazy Loading
```tsx
// Lazy load de rotas
const ConversationsPage = lazy(() => import('./conversations/page'))
const DashboardPage = lazy(() => import('./dashboard/page'))

// Com Suspense
<Suspense fallback={<LoadingSkeleton />}>
  <ConversationsPage />
</Suspense>
```

**Resultado:** ✅ 100 instâncias em < 2s

---

## 🎨 QUICK WINS (2-3h total)

### 1. Empty States Ilustrados
```tsx
import { FileQuestion } from 'lucide-react'

export function EmptyState({ title, description, action }: Props) {
  return (
    <div className="flex flex-col items-center justify-center py-12 text-center">
      <div className="mb-4 rounded-full bg-muted p-4">
        <FileQuestion className="h-12 w-12 text-muted-foreground" />
      </div>
      <h3 className="text-lg font-semibold">{title}</h3>
      <p className="text-sm text-muted-foreground mb-4">{description}</p>
      {action}
    </div>
  )
}

// Uso
<EmptyState
  title="Nenhum WhatsApp conectado"
  description="Conecte seu primeiro número para começar a enviar mensagens"
  action={
    <Button onClick={() => router.push('/integracoes/connect')}>
      <Plus className="mr-2" />
      Conectar WhatsApp
    </Button>
  }
/>
```

### 2. Toasts Melhorados
```tsx
toast.success('Mensagem enviada!', {
  icon: '✅',
  description: 'A mensagem foi entregue com sucesso',
  action: {
    label: 'Ver conversa',
    onClick: () => router.push(`/chat/${chatId}`)
  }
})

toast.error('Falha ao enviar', {
  icon: '❌',
  description: 'Tente novamente ou contate o suporte',
  action: {
    label: 'Tentar novamente',
    onClick: () => sendMessage()
  }
})
```

### 3. Loading Shimmer
```tsx
<div className="animate-pulse space-y-3">
  <div className="h-4 bg-muted rounded w-3/4"></div>
  <div className="h-4 bg-muted rounded w-1/2"></div>
</div>

// Ou usar Skeleton do shadcn
<Skeleton className="h-12 w-full animate-pulse" />
```

---

## 📊 CRONOGRAMA & PRIORIZAÇÃO

### Semana 1 (20h)
- ✅ Sprint 1: QR Code Share (3-4h)
- ✅ Sprint 2: Envio de Mídia (5-6h)
- ✅ Sprint 3: Tooltips (3-4h)
- ✅ Quick Wins (2-3h)
- ✅ Sprint 4 (início): ARIA Labels (6h)

### Semana 2 (20h)
- ✅ Sprint 4 (fim): Navegação Teclado (2h)
- ✅ Sprint 5: Mobile Responsivo (4-6h)
- ✅ Sprint 6: Performance (3-5h)
- ✅ Testes E2E (4h)
- ✅ Documentação (2h)

---

## ✅ CHECKLIST FINAL 10/10

### Funcionalidade: 10/10
- [ ] Envio de mídia (imagem, vídeo, doc)
- [ ] Gestão de grupos completa
- [ ] Reações e interações
- [ ] Perfil e presença
- [ ] 80% das rotas UAZapi

### Usabilidade: 10/10
- [ ] QR Code compartilhável
- [ ] Tooltips em tudo
- [ ] Empty states motivadores
- [ ] Nomenclatura consistente

### Performance: 10/10
- [ ] Virtual scrolling
- [ ] Paginação
- [ ] Lazy loading
- [ ] < 2s para 100 instâncias

### Visual/UI: 10/10
- [ ] Toasts com ícones
- [ ] Loading shimmer
- [ ] Micro-interações

### Animações: 10/10
- [x] Entrada de cards ✅
- [x] Count-up ✅
- [x] Hover effects ✅
- [ ] Pulse, shake

### Acessibilidade: 10/10
- [ ] ARIA labels completos
- [ ] Navegação teclado
- [ ] Contraste WCAG AA
- [ ] Screen reader OK

### Responsividade: 10/10
- [ ] Mobile perfeito < 768px
- [ ] Drawer para conversas
- [ ] Touch gestures

### Consistência: 10/10
- [ ] Nomenclatura padronizada
- [ ] Spacing consistente
- [ ] Ícones Lucide only

---

**PRÓXIMA AÇÃO IMEDIATA:**
Começar Sprint 1 - Implementar QRCodeShare component 🚀

**Tempo total:** 40 horas
**ROI:** +1.7 pontos (8.3 → 10.0)
**Prazo:** 2 semanas
