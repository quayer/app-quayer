# Feature: Sugestoes IA + Assinaturas WhatsApp

> **Status:** Proposta de Implementacao
> **Prioridade:** P1
> **Estimativa:** Media complexidade
> **Data:** 2025-12-23

---

## Indice

1. [Visao Geral](#1-visao-geral)
2. [Assinatura de Atendimento](#2-assinatura-de-atendimento)
3. [Sugestoes de IA](#3-sugestoes-de-ia)
4. [Modelo de Dados](#4-modelo-de-dados)
5. [Componentes](#5-componentes)
6. [API Endpoints](#6-api-endpoints)
7. [Fluxos de Usuario](#7-fluxos-de-usuario)
8. [Estados e Transicoes](#8-estados-e-transicoes)
9. [Acessibilidade](#9-acessibilidade)
10. [Performance](#10-performance)
11. [Testes](#11-testes)
12. [Checklist de Implementacao](#12-checklist-de-implementacao)

---

## 1. Visao Geral

### 1.1 Objetivo

Implementar duas funcionalidades complementares na pagina de conversas:

1. **Assinatura de Atendimento**: Identificacao automatica do atendente nas mensagens WhatsApp
2. **Sugestoes de IA**: Autocomplete inteligente baseado em contexto da conversa

### 1.2 Referencia

- **Chatwoot**: Padrao de assinatura "Atendimento com [Nome]:"
- **Gmail Smart Compose**: Padrao de sugestoes inline
- **GitHub Copilot**: Padrao de Tab para aceitar

### 1.3 Arquivos Afetados

```
src/
├── app/
│   └── integracoes/
│       ├── conversations/
│       │   └── page.tsx                    # Integrar componentes
│       └── settings/
│           └── page.tsx                    # Adicionar secao assinatura
├── components/
│   └── chat/
│       ├── AIMessageInput.tsx              # CRIAR - Input com sugestoes
│       ├── SignatureBanner.tsx             # CRIAR - Banner de alerta
│       └── SignatureSettings.tsx           # CRIAR - Config de assinatura
├── features/
│   └── users/
│       └── controllers/users.controller.ts # Adicionar endpoints
├── lib/
│   └── ai/
│       └── suggestions.service.ts          # CRIAR - Servico de sugestoes
└── prisma/
    └── schema.prisma                       # Adicionar campos User
```

---

## 2. Assinatura de Atendimento

### 2.1 Conceito

No WhatsApp, diferente de email, a assinatura e uma **linha de identificacao** no inicio da mensagem:

```
*Atendimento com Gabriel Rizzato:*

Ola! Como posso ajudar voce hoje?
```

### 2.2 Formatos Suportados

| ID | Nome | Template | Exemplo |
|----|------|----------|---------|
| `first_name` | Primeiro nome | `*Atendimento com {{firstName}}:*` | *Atendimento com Gabriel:* |
| `full_name` | Nome completo | `*Atendimento com {{fullName}}:*` | *Atendimento com Gabriel Rizzato:* |
| `name_department` | Nome + Setor | `*Atendimento com {{firstName}} - {{department}}:*` | *Atendimento com Gabriel - Suporte:* |
| `custom` | Personalizado | `{{customText}}` | *Equipe Quayer - Gabriel aqui:* |

### 2.3 Regras de Aplicacao

```typescript
interface SignatureRules {
  // Quando adicionar assinatura
  addWhen: {
    firstMessageInSession: true,      // Sempre na primeira msg
    afterAgentChange: true,           // Quando troca atendente
    afterInactivity: '30min',         // Apos 30min sem resposta
    manualToggle: true,               // Usuario pode forcar
  },

  // Quando NAO adicionar
  skipWhen: {
    consecutiveMessages: true,        // Msgs seguidas do mesmo
    signatureDisabled: true,          // Toggle OFF
    quickReplies: true,               // Respostas rapidas/templates
  }
}
```

### 2.4 Logica de Decisao

```
┌─────────────────────────────────────────────────────────────────┐
│                    DEVE ADICIONAR ASSINATURA?                   │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
                    ┌─────────────────┐
                    │ Assinatura      │
                    │ habilitada?     │
                    └────────┬────────┘
                             │
              ┌──────────────┴──────────────┐
              │                             │
              ▼                             ▼
           [ NAO ]                        [ SIM ]
              │                             │
              ▼                             ▼
         Nao adiciona           ┌─────────────────┐
                                │ E a primeira    │
                                │ msg da sessao?  │
                                └────────┬────────┘
                                         │
                          ┌──────────────┴──────────────┐
                          │                             │
                          ▼                             ▼
                       [ SIM ]                        [ NAO ]
                          │                             │
                          ▼                             ▼
                    ADICIONA            ┌─────────────────┐
                                        │ Ultimo autor    │
                                        │ foi EU?         │
                                        └────────┬────────┘
                                                 │
                                  ┌──────────────┴──────────────┐
                                  │                             │
                                  ▼                             ▼
                               [ SIM ]                        [ NAO ]
                                  │                             │
                                  ▼                             ▼
                            Nao adiciona           ┌─────────────────┐
                            (consecutiva)          │ Inatividade     │
                                                   │ > 30min?        │
                                                   └────────┬────────┘
                                                            │
                                             ┌──────────────┴──────────────┐
                                             │                             │
                                             ▼                             ▼
                                          [ SIM ]                        [ NAO ]
                                             │                             │
                                             ▼                             ▼
                                       ADICIONA                      Nao adiciona
```

### 2.5 Preview em Tempo Real

```
┌─────────────────────────────────────────────────────────────────┐
│ AREA DE MENSAGENS                                               │
│                                                                 │
│ [mensagens anteriores...]                                       │
│                                                                 │
├─────────────────────────────────────────────────────────────────┤
│ PREVIEW (aparece ao digitar)                          [Ocultar] │
│ ┌─────────────────────────────────────────────────────────────┐ │
│ │ *Atendimento com Gabriel Rizzato:*                          │ │
│ │                                                             │ │
│ │ Ola! Como posso ajudar voce hoje?|                          │ │
│ └─────────────────────────────────────────────────────────────┘ │
├─────────────────────────────────────────────────────────────────┤
│ 😀 📎 [Ola! Como posso ajudar voce hoje?|    ] [Enviar]         │
└─────────────────────────────────────────────────────────────────┘
```

### 2.6 Banner de Configuracao

Quando assinatura NAO esta configurada:

```
┌─────────────────────────────────────────────────────────────────┐
│ ⚠️ A assinatura de atendimento nao esta configurada.            │
│    Os clientes nao saberao com quem estao falando.              │
│                                                                 │
│    [Configurar agora →]                              [Ignorar]  │
└─────────────────────────────────────────────────────────────────┘
```

**Comportamento:**
- Aparece acima da area de input
- Background: `bg-amber-50 dark:bg-amber-950/20`
- Border: `border-amber-200 dark:border-amber-800`
- Dismissivel: Salva em localStorage por 7 dias
- Link vai para: `/integracoes/settings#assinatura`

---

## 3. Sugestoes de IA

### 3.1 Conceito

Autocomplete inteligente que sugere completar a mensagem baseado em:
- Texto digitado pelo usuario
- Contexto da conversa atual
- Historico de mensagens similares
- Tom de voz da organizacao

### 3.2 Triggers

| Condicao | Valor | Justificativa |
|----------|-------|---------------|
| Min caracteres | 3 | Evita sugestoes para "oi" |
| Debounce | 500ms | Equilibra UX vs custo API |
| Max sugestoes | 3 | Hick's Law - evita paralisia |
| Contexto msgs | 5 ultimas | Suficiente para contexto |

### 3.3 Prompt Engineering

```typescript
const SUGGESTION_PROMPT = `
Voce e um assistente de atendimento ao cliente via WhatsApp.

CONTEXTO DA CONVERSA:
{{conversationHistory}}

MENSAGEM ATUAL (incompleta):
{{currentInput}}

INSTRUCOES:
1. Complete a mensagem do atendente de forma natural
2. Mantenha tom profissional mas amigavel
3. Seja conciso (WhatsApp = mensagens curtas)
4. Use linguagem brasileira informal quando apropriado
5. NAO use emojis excessivos
6. NAO repita informacoes ja ditas

Retorne EXATAMENTE 3 sugestoes de completacao, uma por linha.
Cada sugestao deve completar a frase, nao comecar do zero.

Formato:
SUGESTAO1: [completacao]
SUGESTAO2: [completacao]
SUGESTAO3: [completacao]
`;
```

### 3.4 Parsing de Resposta

```typescript
interface AISuggestion {
  id: string;
  text: string;           // Texto completo (input + sugestao)
  completion: string;     // Apenas a parte sugerida
  confidence: number;     // 0-1 (se disponivel)
}

function parseSuggestions(response: string, currentInput: string): AISuggestion[] {
  const lines = response.split('\n').filter(l => l.startsWith('SUGESTAO'));

  return lines.map((line, index) => {
    const completion = line.replace(/^SUGESTAO\d+:\s*/, '').trim();
    return {
      id: `suggestion-${index}`,
      text: currentInput + completion,
      completion,
      confidence: 1 - (index * 0.1), // Primeira = 1.0, segunda = 0.9, etc
    };
  });
}
```

### 3.5 UI do Popover

```
                              ┌──────────────────────────────────────┐
                              │ 💡 ajudar voce hoje?                 │ ← Hover
                              │    auxiliar com sua duvida?          │
                              │    resolver isso para voce?          │
                              ├──────────────────────────────────────┤
                              │ Tab para aceitar · Esc para fechar   │
                              └──────────────────────────────────────┘
┌─────────────────────────────────────────────────────────────────────────┐
│ 😀 📎 [Ola, como posso |                                    ] [Enviar]  │
└─────────────────────────────────────────────────────────────────────────┘
```

**Especificacoes visuais:**
- Popover: `w-80` (320px)
- Posicao: Acima do input, alinhado a esquerda
- Offset: 8px do input
- Background: `bg-popover`
- Border: `border rounded-lg shadow-lg`
- Item hover: `bg-accent`
- Item selecionado: `bg-accent ring-2 ring-primary`

### 3.6 Interacoes

| Acao | Tecla | Resultado |
|------|-------|-----------|
| Navegar | `↑` `↓` | Move selecao entre sugestoes |
| Aceitar | `Tab` ou `Enter` | Insere sugestao no input |
| Fechar | `Esc` | Fecha popover, mantem texto |
| Continuar digitando | Qualquer | Atualiza sugestoes (com debounce) |
| Click fora | Mouse | Fecha popover |
| Click na sugestao | Mouse | Aceita e foca no input |

### 3.7 Estados do Componente

```typescript
type SuggestionState =
  | 'idle'           // Nada digitado ou < 3 chars
  | 'debouncing'     // Esperando 500ms
  | 'loading'        // Chamando API
  | 'showing'        // Exibindo sugestoes
  | 'error'          // Erro na API (silencioso)
  | 'empty'          // API retornou vazio

interface AIInputState {
  state: SuggestionState;
  suggestions: AISuggestion[];
  selectedIndex: number;      // -1 = nenhum selecionado
  error?: string;
}
```

### 3.8 Tratamento de Erros

```typescript
const ERROR_HANDLING = {
  // Erros silenciosos (nao mostrar ao usuario)
  silent: [
    'RATE_LIMIT',        // Muitas requisicoes
    'TIMEOUT',           // API demorou
    'NETWORK_ERROR',     // Sem conexao
    'EMPTY_RESPONSE',    // IA nao sugeriu nada
  ],

  // Erros que mostram feedback sutil
  subtle: [
    'API_KEY_INVALID',   // Toast discreto
    'QUOTA_EXCEEDED',    // Toast discreto
  ],

  // Fallback
  onError: () => {
    // Simplesmente nao mostra sugestoes
    // Usuario continua digitando normalmente
  }
};
```

---

## 4. Modelo de Dados

### 4.1 Prisma Schema

```prisma
// prisma/schema.prisma

model User {
  id                    String    @id @default(uuid())
  email                 String    @unique
  name                  String?
  // ... campos existentes ...

  // NOVO: Configuracoes de mensagem
  messageSignature      Json?     @db.JsonB
  // Estrutura:
  // {
  //   enabled: boolean,
  //   format: 'first_name' | 'full_name' | 'name_department' | 'custom',
  //   department?: string,
  //   customText?: string,
  //   showPreview: boolean,
  //   lastDismissedBanner?: string (ISO date)
  // }

  aiSuggestionsEnabled  Boolean   @default(true)

  // ... resto do modelo ...
}

model ChatSession {
  id                    String    @id @default(uuid())
  // ... campos existentes ...

  // NOVO: Rastrear ultimo autor para logica de assinatura
  lastMessageAuthorId   String?
  lastMessageAt         DateTime?

  // ... resto do modelo ...
}
```

### 4.2 TypeScript Types

```typescript
// src/features/users/users.types.ts

export interface MessageSignatureConfig {
  enabled: boolean;
  format: 'first_name' | 'full_name' | 'name_department' | 'custom';
  department?: string;
  customText?: string;
  showPreview: boolean;
  lastDismissedBanner?: string;
}

export interface UserPreferences {
  messageSignature: MessageSignatureConfig;
  aiSuggestionsEnabled: boolean;
}

// src/features/messages/messages.types.ts

export interface MessageWithSignature {
  content: string;
  signature?: string;
  finalContent: string;  // content com signature aplicada
}
```

### 4.3 Zod Schemas

```typescript
// src/features/users/users.schemas.ts

import { z } from 'zod';

export const messageSignatureSchema = z.object({
  enabled: z.boolean().default(false),
  format: z.enum(['first_name', 'full_name', 'name_department', 'custom']).default('full_name'),
  department: z.string().max(50).optional(),
  customText: z.string().max(200).optional(),
  showPreview: z.boolean().default(true),
  lastDismissedBanner: z.string().datetime().optional(),
});

export const updateUserPreferencesSchema = z.object({
  messageSignature: messageSignatureSchema.optional(),
  aiSuggestionsEnabled: z.boolean().optional(),
});

export type MessageSignatureSchema = z.infer<typeof messageSignatureSchema>;
export type UpdateUserPreferencesSchema = z.infer<typeof updateUserPreferencesSchema>;
```

---

## 5. Componentes

### 5.1 SignatureBanner

```typescript
// src/components/chat/SignatureBanner.tsx

'use client';

import { useState, useEffect } from 'react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { AlertTriangle, X, ArrowRight } from 'lucide-react';
import Link from 'next/link';

interface SignatureBannerProps {
  isConfigured: boolean;
  onDismiss?: () => void;
}

const DISMISS_KEY = 'signature_banner_dismissed';
const DISMISS_DAYS = 7;

export function SignatureBanner({ isConfigured, onDismiss }: SignatureBannerProps) {
  const [isDismissed, setIsDismissed] = useState(true); // Start hidden to avoid flash

  useEffect(() => {
    if (isConfigured) {
      setIsDismissed(true);
      return;
    }

    const dismissedAt = localStorage.getItem(DISMISS_KEY);
    if (dismissedAt) {
      const dismissDate = new Date(dismissedAt);
      const now = new Date();
      const daysDiff = (now.getTime() - dismissDate.getTime()) / (1000 * 60 * 60 * 24);
      setIsDismissed(daysDiff < DISMISS_DAYS);
    } else {
      setIsDismissed(false);
    }
  }, [isConfigured]);

  const handleDismiss = () => {
    localStorage.setItem(DISMISS_KEY, new Date().toISOString());
    setIsDismissed(true);
    onDismiss?.();
  };

  if (isDismissed || isConfigured) return null;

  return (
    <Alert
      variant="warning"
      className="mb-2 bg-amber-50 dark:bg-amber-950/20 border-amber-200 dark:border-amber-800"
    >
      <AlertTriangle className="h-4 w-4 text-amber-600" />
      <AlertDescription className="flex items-center justify-between flex-1 ml-2">
        <span className="text-sm">
          A assinatura de atendimento nao esta configurada.
          Os clientes nao saberao com quem estao falando.
        </span>
        <div className="flex items-center gap-2 ml-4">
          <Button variant="link" size="sm" asChild className="text-amber-700 p-0 h-auto">
            <Link href="/integracoes/settings#assinatura">
              Configurar agora
              <ArrowRight className="h-3 w-3 ml-1" />
            </Link>
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6"
            onClick={handleDismiss}
          >
            <X className="h-4 w-4" />
          </Button>
        </div>
      </AlertDescription>
    </Alert>
  );
}
```

### 5.2 AIMessageInput

```typescript
// src/components/chat/AIMessageInput.tsx

'use client';

import { useState, useRef, useCallback, useEffect } from 'react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import {
  Popover,
  PopoverContent,
  PopoverAnchor,
} from '@/components/ui/popover';
import { Loader2, Sparkles, Send } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useDebounce } from '@/hooks/useDebounce';
import { useMutation } from '@tanstack/react-query';
import { api } from '@/igniter.client';

interface AISuggestion {
  id: string;
  text: string;
  completion: string;
}

interface AIMessageInputProps {
  value: string;
  onChange: (value: string) => void;
  onSend: () => void;
  disabled?: boolean;
  placeholder?: string;
  conversationContext?: string[];
  aiEnabled?: boolean;
}

const MIN_CHARS = 3;
const DEBOUNCE_MS = 500;

export function AIMessageInput({
  value,
  onChange,
  onSend,
  disabled,
  placeholder = 'Digite uma mensagem...',
  conversationContext = [],
  aiEnabled = true,
}: AIMessageInputProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [suggestions, setSuggestions] = useState<AISuggestion[]>([]);
  const [selectedIndex, setSelectedIndex] = useState(-1);
  const [isOpen, setIsOpen] = useState(false);

  const debouncedValue = useDebounce(value, DEBOUNCE_MS);

  // Mutation para buscar sugestoes
  const suggestionsMutation = useMutation({
    mutationFn: async (input: string) => {
      const response = await api.ai.suggestions.query({
        query: {
          input,
          context: conversationContext.slice(-5).join('\n'),
        }
      });
      return response.data as AISuggestion[];
    },
    onSuccess: (data) => {
      setSuggestions(data);
      setSelectedIndex(-1);
      setIsOpen(data.length > 0);
    },
    onError: () => {
      // Silencioso - nao mostra erro ao usuario
      setSuggestions([]);
      setIsOpen(false);
    },
  });

  // Buscar sugestoes quando texto muda
  useEffect(() => {
    if (!aiEnabled || debouncedValue.length < MIN_CHARS) {
      setSuggestions([]);
      setIsOpen(false);
      return;
    }

    suggestionsMutation.mutate(debouncedValue);
  }, [debouncedValue, aiEnabled]);

  // Handler de teclado
  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (!isOpen || suggestions.length === 0) {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        onSend();
      }
      return;
    }

    switch (e.key) {
      case 'ArrowUp':
        e.preventDefault();
        setSelectedIndex(prev =>
          prev <= 0 ? suggestions.length - 1 : prev - 1
        );
        break;

      case 'ArrowDown':
        e.preventDefault();
        setSelectedIndex(prev =>
          prev >= suggestions.length - 1 ? 0 : prev + 1
        );
        break;

      case 'Tab':
      case 'Enter':
        e.preventDefault();
        if (selectedIndex >= 0) {
          acceptSuggestion(suggestions[selectedIndex]);
        } else if (suggestions.length > 0) {
          acceptSuggestion(suggestions[0]);
        }
        break;

      case 'Escape':
        e.preventDefault();
        setIsOpen(false);
        setSelectedIndex(-1);
        break;
    }
  }, [isOpen, suggestions, selectedIndex, onSend]);

  const acceptSuggestion = (suggestion: AISuggestion) => {
    onChange(suggestion.text);
    setIsOpen(false);
    setSuggestions([]);
    setSelectedIndex(-1);
    inputRef.current?.focus();
  };

  return (
    <div className="relative flex-1">
      <Popover open={isOpen} onOpenChange={setIsOpen}>
        <PopoverAnchor asChild>
          <div className="relative">
            <Input
              ref={inputRef}
              value={value}
              onChange={(e) => onChange(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={placeholder}
              disabled={disabled}
              className="pr-10"
            />
            {suggestionsMutation.isPending && (
              <div className="absolute right-3 top-1/2 -translate-y-1/2">
                <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
              </div>
            )}
            {aiEnabled && !suggestionsMutation.isPending && value.length >= MIN_CHARS && (
              <div className="absolute right-3 top-1/2 -translate-y-1/2">
                <Sparkles className="h-4 w-4 text-muted-foreground/50" />
              </div>
            )}
          </div>
        </PopoverAnchor>

        <PopoverContent
          className="w-80 p-0"
          align="start"
          side="top"
          sideOffset={8}
          onOpenAutoFocus={(e) => e.preventDefault()}
        >
          <div className="py-1">
            {suggestions.map((suggestion, index) => (
              <button
                key={suggestion.id}
                className={cn(
                  "w-full px-3 py-2 text-left text-sm transition-colors",
                  "hover:bg-accent focus:bg-accent focus:outline-none",
                  index === selectedIndex && "bg-accent ring-2 ring-inset ring-primary"
                )}
                onClick={() => acceptSuggestion(suggestion)}
                onMouseEnter={() => setSelectedIndex(index)}
              >
                <span className="text-muted-foreground">{value}</span>
                <span className="text-foreground font-medium">{suggestion.completion}</span>
              </button>
            ))}
          </div>
          <div className="px-3 py-2 border-t bg-muted/50 text-xs text-muted-foreground">
            <kbd className="px-1 py-0.5 bg-background rounded text-[10px]">Tab</kbd>
            {' '}para aceitar · {' '}
            <kbd className="px-1 py-0.5 bg-background rounded text-[10px]">Esc</kbd>
            {' '}para fechar
          </div>
        </PopoverContent>
      </Popover>
    </div>
  );
}
```

### 5.3 SignatureSettings

```typescript
// src/components/chat/SignatureSettings.tsx

'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Loader2, Save, User, MessageSquare } from 'lucide-react';
import { useMutation } from '@tanstack/react-query';
import { api } from '@/igniter.client';
import { toast } from 'sonner';
import { useAuth } from '@/lib/auth/auth-provider';

interface SignatureConfig {
  enabled: boolean;
  format: 'first_name' | 'full_name' | 'name_department' | 'custom';
  department?: string;
  customText?: string;
  showPreview: boolean;
}

const DEFAULT_CONFIG: SignatureConfig = {
  enabled: false,
  format: 'full_name',
  showPreview: true,
};

export function SignatureSettings() {
  const { user, refreshUser } = useAuth();
  const [config, setConfig] = useState<SignatureConfig>(DEFAULT_CONFIG);

  // Carregar config do usuario
  useEffect(() => {
    if (user?.messageSignature) {
      setConfig(user.messageSignature as SignatureConfig);
    }
  }, [user]);

  // Mutation para salvar
  const saveMutation = useMutation({
    mutationFn: async (data: SignatureConfig) => {
      return api.users.updatePreferences.mutate({
        body: { messageSignature: data }
      });
    },
    onSuccess: () => {
      toast.success('Assinatura salva com sucesso!');
      refreshUser?.();
    },
    onError: (error: any) => {
      toast.error(error.message || 'Erro ao salvar assinatura');
    },
  });

  // Gerar preview
  const getPreview = (): string => {
    if (!config.enabled) return '';

    const firstName = user?.name?.split(' ')[0] || 'Nome';
    const fullName = user?.name || 'Nome Completo';

    switch (config.format) {
      case 'first_name':
        return `*Atendimento com ${firstName}:*`;
      case 'full_name':
        return `*Atendimento com ${fullName}:*`;
      case 'name_department':
        return `*Atendimento com ${firstName} - ${config.department || 'Setor'}:*`;
      case 'custom':
        return config.customText || '*Sua assinatura personalizada*';
      default:
        return '';
    }
  };

  const handleSave = () => {
    saveMutation.mutate(config);
  };

  return (
    <Card id="assinatura">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <MessageSquare className="h-5 w-5" />
          Assinatura de Atendimento
        </CardTitle>
        <CardDescription>
          Identifique-se automaticamente nas mensagens enviadas aos clientes
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Toggle principal */}
        <div className="flex items-center justify-between">
          <div className="space-y-0.5">
            <Label>Adicionar assinatura automaticamente</Label>
            <p className="text-sm text-muted-foreground">
              Sua identificacao sera adicionada no inicio das mensagens
            </p>
          </div>
          <Switch
            checked={config.enabled}
            onCheckedChange={(enabled) => setConfig(prev => ({ ...prev, enabled }))}
          />
        </div>

        {config.enabled && (
          <>
            {/* Formato */}
            <div className="space-y-3">
              <Label>Formato da assinatura</Label>
              <RadioGroup
                value={config.format}
                onValueChange={(format: any) => setConfig(prev => ({ ...prev, format }))}
                className="space-y-2"
              >
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="first_name" id="first_name" />
                  <Label htmlFor="first_name" className="font-normal cursor-pointer">
                    Primeiro nome
                    <span className="text-muted-foreground ml-2">
                      → "Atendimento com {user?.name?.split(' ')[0]}:"
                    </span>
                  </Label>
                </div>

                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="full_name" id="full_name" />
                  <Label htmlFor="full_name" className="font-normal cursor-pointer">
                    Nome completo
                    <span className="text-muted-foreground ml-2">
                      → "Atendimento com {user?.name}:"
                    </span>
                  </Label>
                </div>

                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="name_department" id="name_department" />
                  <Label htmlFor="name_department" className="font-normal cursor-pointer">
                    Nome + Setor
                  </Label>
                </div>

                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="custom" id="custom" />
                  <Label htmlFor="custom" className="font-normal cursor-pointer">
                    Personalizado
                  </Label>
                </div>
              </RadioGroup>
            </div>

            {/* Campo de departamento */}
            {config.format === 'name_department' && (
              <div className="space-y-2 ml-6">
                <Label htmlFor="department">Nome do setor</Label>
                <Input
                  id="department"
                  value={config.department || ''}
                  onChange={(e) => setConfig(prev => ({ ...prev, department: e.target.value }))}
                  placeholder="Ex: Suporte, Vendas, Financeiro"
                  maxLength={50}
                />
              </div>
            )}

            {/* Campo customizado */}
            {config.format === 'custom' && (
              <div className="space-y-2 ml-6">
                <Label htmlFor="customText">Texto personalizado</Label>
                <Input
                  id="customText"
                  value={config.customText || ''}
                  onChange={(e) => setConfig(prev => ({ ...prev, customText: e.target.value }))}
                  placeholder="Ex: *Equipe Quayer - Gabriel aqui:*"
                  maxLength={200}
                />
                <p className="text-xs text-muted-foreground">
                  Use *texto* para negrito no WhatsApp
                </p>
              </div>
            )}

            {/* Toggle de preview */}
            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label>Mostrar preview ao digitar</Label>
                <p className="text-sm text-muted-foreground">
                  Visualize como a mensagem ficara antes de enviar
                </p>
              </div>
              <Switch
                checked={config.showPreview}
                onCheckedChange={(showPreview) => setConfig(prev => ({ ...prev, showPreview }))}
              />
            </div>

            {/* Preview */}
            <div className="space-y-2">
              <Label>Preview</Label>
              <Alert className="bg-muted/50">
                <AlertDescription className="font-mono text-sm whitespace-pre-wrap">
                  {getPreview()}
                  {'\n\n'}
                  Sua mensagem aparecera aqui...
                </AlertDescription>
              </Alert>
            </div>
          </>
        )}

        {/* Botao salvar */}
        <div className="flex justify-end">
          <Button onClick={handleSave} disabled={saveMutation.isPending}>
            {saveMutation.isPending ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <Save className="h-4 w-4 mr-2" />
            )}
            Salvar assinatura
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
```

---

## 6. API Endpoints

### 6.1 Sugestoes IA

```typescript
// src/features/ai/controllers/ai.controller.ts

import { igniter } from '@/igniter.server';
import { z } from 'zod';
import { OpenAI } from 'openai';

const suggestionsQuerySchema = z.object({
  input: z.string().min(3).max(500),
  context: z.string().max(5000).optional(),
});

export const aiController = igniter.controller({
  path: '/ai',

  actions: {
    suggestions: igniter.query({
      input: suggestionsQuerySchema,

      async handler({ input, ctx }) {
        const openai = new OpenAI({
          apiKey: process.env.OPENAI_API_KEY,
        });

        const prompt = `
Voce e um assistente de atendimento ao cliente via WhatsApp.

CONTEXTO DA CONVERSA:
${input.context || 'Sem contexto anterior'}

MENSAGEM ATUAL (incompleta):
${input.input}

Complete a mensagem do atendente. Retorne EXATAMENTE 3 sugestoes.
Formato:
SUGESTAO1: [completacao]
SUGESTAO2: [completacao]
SUGESTAO3: [completacao]
`;

        try {
          const response = await openai.chat.completions.create({
            model: 'gpt-4o-mini', // Mais rapido e barato
            messages: [{ role: 'user', content: prompt }],
            max_tokens: 200,
            temperature: 0.7,
          });

          const text = response.choices[0]?.message?.content || '';
          const suggestions = parseSuggestions(text, input.input);

          return { data: suggestions };
        } catch (error) {
          // Retorna vazio em caso de erro (silencioso)
          return { data: [] };
        }
      },
    }),
  },
});

function parseSuggestions(response: string, currentInput: string) {
  const lines = response.split('\n').filter(l => l.includes('SUGESTAO'));

  return lines.slice(0, 3).map((line, index) => {
    const completion = line.replace(/^SUGESTAO\d+:\s*/, '').trim();
    return {
      id: `suggestion-${index}`,
      text: currentInput + completion,
      completion,
    };
  });
}
```

### 6.2 Preferencias do Usuario

```typescript
// src/features/users/controllers/users.controller.ts

// Adicionar ao controller existente:

updatePreferences: igniter.mutation({
  input: z.object({
    messageSignature: messageSignatureSchema.optional(),
    aiSuggestionsEnabled: z.boolean().optional(),
  }),

  async handler({ input, ctx }) {
    const userId = ctx.session?.userId;
    if (!userId) throw new Error('Unauthorized');

    const updateData: any = {};

    if (input.messageSignature !== undefined) {
      updateData.messageSignature = input.messageSignature;
    }

    if (input.aiSuggestionsEnabled !== undefined) {
      updateData.aiSuggestionsEnabled = input.aiSuggestionsEnabled;
    }

    const user = await ctx.db.user.update({
      where: { id: userId },
      data: updateData,
    });

    return { data: user };
  },
}),
```

---

## 7. Fluxos de Usuario

### 7.1 Configuracao Inicial

```
┌─────────────────────────────────────────────────────────────────────┐
│ FLUXO: Usuario configura assinatura pela primeira vez              │
└─────────────────────────────────────────────────────────────────────┘

1. Usuario acessa /conversas
   │
   ▼
2. Sistema detecta: user.messageSignature.enabled = false
   │
   ▼
3. Exibe SignatureBanner amarelo acima do input
   │
   ├─► Usuario clica "Ignorar"
   │   │
   │   ▼
   │   Banner desaparece (localStorage: 7 dias)
   │
   └─► Usuario clica "Configurar agora"
       │
       ▼
4. Redireciona para /integracoes/settings#assinatura
   │
   ▼
5. ScrollTo automatico para secao de assinatura
   │
   ▼
6. Usuario:
   - Ativa toggle "Adicionar assinatura automaticamente"
   - Seleciona formato (primeiro nome, completo, etc)
   - Ve preview em tempo real
   - Clica "Salvar assinatura"
   │
   ▼
7. Toast: "Assinatura salva com sucesso!"
   │
   ▼
8. Usuario volta para /conversas
   │
   ▼
9. Banner nao aparece mais (assinatura configurada)
```

### 7.2 Envio de Mensagem com Assinatura

```
┌─────────────────────────────────────────────────────────────────────┐
│ FLUXO: Usuario envia mensagem com assinatura                       │
└─────────────────────────────────────────────────────────────────────┘

1. Usuario seleciona conversa
   │
   ▼
2. Sistema carrega:
   - Mensagens anteriores
   - user.messageSignature config
   - Ultimo autor da sessao
   │
   ▼
3. Usuario digita mensagem
   │
   ▼
4. Se showPreview = true:
   │
   ├─► Preview aparece acima do input:
   │   ┌────────────────────────────────────┐
   │   │ *Atendimento com Gabriel Rizzato:* │
   │   │                                    │
   │   │ Ola! Como posso ajudar?            │
   │   └────────────────────────────────────┘
   │
   └─► Se showPreview = false: nada muda
   │
   ▼
5. Usuario clica Enviar
   │
   ▼
6. Sistema verifica shouldAddSignature():
   │
   ├─► true: content = signature + '\n\n' + message
   │
   └─► false: content = message (sem assinatura)
   │
   ▼
7. API envia mensagem para WhatsApp
   │
   ▼
8. Atualiza lastMessageAuthorId = userId
```

### 7.3 Uso de Sugestoes IA

```
┌─────────────────────────────────────────────────────────────────────┐
│ FLUXO: Usuario usa sugestao de IA                                  │
└─────────────────────────────────────────────────────────────────────┘

1. Usuario comeca a digitar: "Ola, como"
   │
   ▼
2. Apos 500ms (debounce):
   │
   ├─► Se < 3 caracteres: nada acontece
   │
   └─► Se >= 3 caracteres:
       │
       ▼
3. API call: GET /api/ai/suggestions?input=Ola, como&context=...
   │
   ├─► Loading: Spinner no input
   │
   ▼
4. Resposta:
   │
   ├─► Sucesso com sugestoes:
   │   │
   │   ▼
   │   Popover abre com 3 opcoes:
   │   ┌──────────────────────────────────┐
   │   │ 💡 posso ajudar voce hoje?       │
   │   │    posso auxiliar?               │
   │   │    esta?                         │
   │   └──────────────────────────────────┘
   │
   ├─► Sucesso sem sugestoes: nada acontece
   │
   └─► Erro: nada acontece (silencioso)
   │
   ▼
5. Usuario interage:
   │
   ├─► Pressiona ↑↓: navega entre opcoes
   │
   ├─► Pressiona Tab/Enter: aceita sugestao selecionada
   │   │
   │   ▼
   │   Input atualiza: "Ola, como posso ajudar voce hoje?"
   │   Popover fecha
   │   Focus volta pro input
   │
   ├─► Pressiona Esc: fecha popover, mantem texto
   │
   ├─► Clica em sugestao: igual Tab
   │
   └─► Continua digitando: atualiza sugestoes (novo debounce)
```

---

## 8. Estados e Transicoes

### 8.1 Estado do AIMessageInput

```typescript
type InputState = {
  // Texto atual
  value: string;

  // Estado das sugestoes
  suggestions: {
    status: 'idle' | 'loading' | 'success' | 'error';
    items: AISuggestion[];
    selectedIndex: number; // -1 = nenhum
  };

  // UI
  isPopoverOpen: boolean;
};

// Transicoes
const transitions = {
  // Usuario digita
  'INPUT_CHANGE': (state, value) => ({
    ...state,
    value,
    suggestions: {
      ...state.suggestions,
      status: value.length >= 3 ? 'loading' : 'idle',
    },
  }),

  // API retorna
  'SUGGESTIONS_SUCCESS': (state, items) => ({
    ...state,
    suggestions: { status: 'success', items, selectedIndex: -1 },
    isPopoverOpen: items.length > 0,
  }),

  // Navega com seta
  'SELECT_NEXT': (state) => ({
    ...state,
    suggestions: {
      ...state.suggestions,
      selectedIndex: (state.suggestions.selectedIndex + 1) % state.suggestions.items.length,
    },
  }),

  // Aceita sugestao
  'ACCEPT_SUGGESTION': (state, suggestion) => ({
    ...state,
    value: suggestion.text,
    suggestions: { status: 'idle', items: [], selectedIndex: -1 },
    isPopoverOpen: false,
  }),

  // Fecha
  'CLOSE_POPOVER': (state) => ({
    ...state,
    isPopoverOpen: false,
    suggestions: { ...state.suggestions, selectedIndex: -1 },
  }),
};
```

### 8.2 Estado do SignatureBanner

```typescript
type BannerState = 'visible' | 'dismissed' | 'hidden';

const getBannerState = (
  isConfigured: boolean,
  dismissedAt: string | null
): BannerState => {
  if (isConfigured) return 'hidden';

  if (dismissedAt) {
    const daysSince = daysDifference(new Date(dismissedAt), new Date());
    if (daysSince < 7) return 'dismissed';
  }

  return 'visible';
};
```

---

## 9. Acessibilidade

### 9.1 ARIA Labels

```tsx
// SignatureBanner
<Alert role="alert" aria-live="polite">
  <AlertDescription>
    A assinatura de atendimento nao esta configurada.
    <Button aria-label="Configurar assinatura de atendimento">
      Configurar agora
    </Button>
    <Button aria-label="Fechar alerta de assinatura">
      <X />
    </Button>
  </AlertDescription>
</Alert>

// AIMessageInput
<div role="combobox" aria-expanded={isPopoverOpen} aria-haspopup="listbox">
  <Input
    aria-label="Campo de mensagem"
    aria-autocomplete="list"
    aria-controls="suggestions-list"
    aria-activedescendant={selectedIndex >= 0 ? `suggestion-${selectedIndex}` : undefined}
  />
  <Popover>
    <ul id="suggestions-list" role="listbox" aria-label="Sugestoes de mensagem">
      {suggestions.map((s, i) => (
        <li
          key={s.id}
          id={`suggestion-${i}`}
          role="option"
          aria-selected={i === selectedIndex}
        >
          {s.text}
        </li>
      ))}
    </ul>
  </Popover>
</div>
```

### 9.2 Keyboard Navigation

| Tecla | Funcao |
|-------|--------|
| `Tab` | Aceita sugestao / Move para proximo elemento |
| `Shift+Tab` | Move para elemento anterior |
| `Enter` | Aceita sugestao / Envia mensagem |
| `Escape` | Fecha popover de sugestoes |
| `↑` `↓` | Navega entre sugestoes |
| `Home` | Seleciona primeira sugestao |
| `End` | Seleciona ultima sugestao |

### 9.3 Screen Reader Announcements

```tsx
// Anunciar quando sugestoes aparecem
<div aria-live="polite" className="sr-only">
  {suggestions.length > 0 && (
    `${suggestions.length} sugestoes disponiveis. Use setas para navegar.`
  )}
</div>

// Anunciar quando sugestao e aceita
<div aria-live="assertive" className="sr-only">
  {acceptedSuggestion && `Sugestao aceita: ${acceptedSuggestion}`}
</div>
```

---

## 10. Performance

### 10.1 Otimizacoes

| Area | Otimizacao | Impacto |
|------|------------|---------|
| **Debounce** | 500ms antes de chamar API | -80% chamadas |
| **Min chars** | 3 caracteres minimos | -50% chamadas |
| **Cache** | React Query cache 30s | -30% chamadas |
| **Model** | gpt-4o-mini vs gpt-4 | 10x mais rapido |
| **Max tokens** | 200 tokens max | Resposta mais rapida |
| **Abort** | Cancelar request anterior | Evita race conditions |

### 10.2 Metricas Alvo

| Metrica | Alvo | Critico |
|---------|------|---------|
| **Tempo resposta IA** | < 500ms | < 1000ms |
| **Render popover** | < 16ms | < 50ms |
| **Input lag** | < 50ms | < 100ms |
| **Bundle size** | < 10KB | < 20KB |

### 10.3 Implementacao de Abort

```typescript
// Cancelar request anterior quando usuario continua digitando
const abortControllerRef = useRef<AbortController | null>(null);

useEffect(() => {
  // Cancelar request anterior
  if (abortControllerRef.current) {
    abortControllerRef.current.abort();
  }

  if (debouncedValue.length < MIN_CHARS) return;

  // Criar novo controller
  abortControllerRef.current = new AbortController();

  fetchSuggestions(debouncedValue, {
    signal: abortControllerRef.current.signal,
  }).catch(err => {
    if (err.name !== 'AbortError') {
      console.error(err);
    }
  });

  return () => {
    abortControllerRef.current?.abort();
  };
}, [debouncedValue]);
```

---

## 11. Testes

### 11.1 Unit Tests

```typescript
// src/components/chat/__tests__/AIMessageInput.test.tsx

describe('AIMessageInput', () => {
  it('should not fetch suggestions with less than 3 chars', async () => {
    const { getByRole } = render(<AIMessageInput value="" onChange={jest.fn()} onSend={jest.fn()} />);

    const input = getByRole('textbox');
    await userEvent.type(input, 'Ol');

    await waitFor(() => {
      expect(fetchMock).not.toHaveBeenCalled();
    });
  });

  it('should fetch suggestions after debounce with 3+ chars', async () => {
    const { getByRole } = render(<AIMessageInput value="" onChange={jest.fn()} onSend={jest.fn()} />);

    const input = getByRole('textbox');
    await userEvent.type(input, 'Ola como');

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        expect.stringContaining('/api/ai/suggestions')
      );
    }, { timeout: 600 }); // debounce + margem
  });

  it('should accept suggestion with Tab key', async () => {
    const onChange = jest.fn();
    const { getByRole } = render(
      <AIMessageInput value="Ola" onChange={onChange} onSend={jest.fn()} />
    );

    // Simular sugestoes carregadas
    await waitFor(() => {
      expect(screen.getByRole('listbox')).toBeVisible();
    });

    await userEvent.keyboard('{Tab}');

    expect(onChange).toHaveBeenCalledWith('Ola, como posso ajudar?');
  });

  it('should close popover with Escape', async () => {
    // ...
  });

  it('should navigate suggestions with arrow keys', async () => {
    // ...
  });
});
```

### 11.2 Integration Tests

```typescript
// src/components/chat/__tests__/SignatureSettings.integration.test.tsx

describe('SignatureSettings Integration', () => {
  it('should save signature config to database', async () => {
    const { getByRole, getByText } = render(<SignatureSettings />);

    // Ativar assinatura
    const toggle = getByRole('switch');
    await userEvent.click(toggle);

    // Selecionar formato
    const fullNameOption = getByText('Nome completo');
    await userEvent.click(fullNameOption);

    // Salvar
    const saveButton = getByRole('button', { name: /salvar/i });
    await userEvent.click(saveButton);

    await waitFor(() => {
      expect(screen.getByText('Assinatura salva com sucesso!')).toBeVisible();
    });

    // Verificar que API foi chamada
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/users/preferences',
      expect.objectContaining({
        method: 'PATCH',
        body: expect.stringContaining('"enabled":true'),
      })
    );
  });
});
```

### 11.3 E2E Tests

```typescript
// e2e/chat-features.spec.ts

import { test, expect } from '@playwright/test';

test.describe('Chat AI Suggestions', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/conversas');
    // Selecionar uma conversa
    await page.click('[data-testid="chat-item"]:first-child');
  });

  test('should show AI suggestions when typing', async ({ page }) => {
    const input = page.locator('[data-testid="message-input"]');
    await input.fill('Ola, como posso');

    // Esperar debounce + API
    await expect(page.locator('[role="listbox"]')).toBeVisible({ timeout: 2000 });

    // Verificar que tem sugestoes
    const suggestions = page.locator('[role="option"]');
    await expect(suggestions).toHaveCount(3);
  });

  test('should accept suggestion with Tab', async ({ page }) => {
    const input = page.locator('[data-testid="message-input"]');
    await input.fill('Ola, como posso');

    await expect(page.locator('[role="listbox"]')).toBeVisible();

    await page.keyboard.press('Tab');

    // Input deve ter texto da sugestao
    await expect(input).toHaveValue(/Ola, como posso.+/);

    // Popover deve fechar
    await expect(page.locator('[role="listbox"]')).not.toBeVisible();
  });
});

test.describe('Signature Banner', () => {
  test('should show banner when signature not configured', async ({ page }) => {
    // Usuario sem assinatura configurada
    await page.goto('/conversas');

    await expect(page.locator('[role="alert"]')).toBeVisible();
    await expect(page.getByText('assinatura de atendimento')).toBeVisible();
  });

  test('should navigate to settings on click', async ({ page }) => {
    await page.goto('/conversas');

    await page.click('text=Configurar agora');

    await expect(page).toHaveURL('/integracoes/settings#assinatura');
  });

  test('should hide banner for 7 days after dismiss', async ({ page }) => {
    await page.goto('/conversas');

    // Fechar banner
    await page.click('[aria-label="Fechar alerta de assinatura"]');

    // Recarregar
    await page.reload();

    // Banner nao deve aparecer
    await expect(page.locator('[role="alert"]')).not.toBeVisible();
  });
});
```

---

## 12. Checklist de Implementacao

### Fase 1: Modelo de Dados
- [ ] Adicionar campo `messageSignature` no User (Prisma)
- [ ] Adicionar campo `aiSuggestionsEnabled` no User
- [ ] Adicionar campos `lastMessageAuthorId`, `lastMessageAt` no ChatSession
- [ ] Criar migration
- [ ] Criar Zod schemas
- [ ] Criar TypeScript types

### Fase 2: API Endpoints
- [ ] Criar `/api/ai/suggestions` endpoint
- [ ] Adicionar `updatePreferences` no users controller
- [ ] Configurar rate limiting para sugestoes
- [ ] Testar endpoints com Postman/Insomnia

### Fase 3: Componentes
- [ ] Criar `SignatureBanner.tsx`
- [ ] Criar `AIMessageInput.tsx`
- [ ] Criar `SignatureSettings.tsx`
- [ ] Criar hook `useDebounce`
- [ ] Testar componentes isoladamente

### Fase 4: Integracao
- [ ] Integrar `SignatureBanner` na pagina de conversas
- [ ] Substituir Input por `AIMessageInput`
- [ ] Adicionar `SignatureSettings` na pagina de settings
- [ ] Implementar logica `shouldAddSignature()`
- [ ] Testar fluxo completo

### Fase 5: Polish
- [ ] Adicionar ARIA labels
- [ ] Testar com screen reader
- [ ] Otimizar performance (abort, cache)
- [ ] Escrever testes unitarios
- [ ] Escrever testes E2E
- [ ] Code review
- [ ] QA manual

### Fase 6: Deploy
- [ ] Feature flag para rollout gradual
- [ ] Monitorar erros no Sentry
- [ ] Monitorar custos OpenAI
- [ ] Coletar feedback dos usuarios
- [ ] Ajustar prompts baseado em feedback

---

## Referencias

- [Chatwoot Message Signatures](https://www.chatwoot.com/hc/user-guide/articles/1695209306-how-to-use-the-omnichannel-message-signature)
- [Gmail Smart Compose](https://support.google.com/mail/answer/9116836)
- [OpenAI Chat Completions](https://platform.openai.com/docs/guides/chat-completions)
- [Radix UI Popover](https://www.radix-ui.com/primitives/docs/components/popover)
- [ARIA Combobox Pattern](https://www.w3.org/WAI/ARIA/apg/patterns/combobox/)
