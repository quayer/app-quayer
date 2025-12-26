# Plano de Integração: Grupos na Tela de Conversas

## 1. Análise do Estado Atual

### 1.1 Sistema Legado (Atual)
```
ChatSession → Contact (phoneNumber ends with @g.us)
     ↓
  Message
```
- Grupos tratados como chats normais
- Sem rastreamento de participantes
- Sem configuração por grupo
- IA comporta-se igual para grupos e individuais

### 1.2 Novo Modelo Híbrido (Não Integrado)
```
GroupChat → GroupParticipant[] → Contact (opcional)
     ↓              ↓
GroupMessage    ChatSession (sessão privada)
```
**Capabilities novas:**
- `GroupMode`: DISABLED | MONITOR_ONLY | ACTIVE
- `GroupAIResponseMode`: IN_GROUP | PRIVATE | HYBRID
- Rastreamento de participantes e roles (admin, superadmin, participant)
- Métricas por grupo (totalMessages, totalParticipants)
- Vínculo participante → sessão privada (para responder no privado)

---

## 2. Proposta de Arquitetura UI

### Opção Recomendada: **Tabs Separadas com Filtros Unificados**

```
┌────────────────────────────────────────────────────────────────┐
│  CONVERSAS                                                     │
├────────────────────────────────────────────────────────────────┤
│  [Todas as integrações ▼]                                      │
│  [🔍 Buscar conversas...]                                      │
│                                                                │
│  ┌─────────┐ ┌─────────┐ ┌─────────┐                          │
│  │ Diretas │ │ Grupos  │ │ Arquiv. │  ← TABS PRINCIPAIS       │
│  └─────────┘ └─────────┘ └─────────┘                          │
│                                                                │
│  Subtabs (quando em "Diretas" ou "Grupos"):                   │
│  [ Todas (42) ] [ IA (15) ] [ Humano (20) ] [ Fila (7) ]      │
│                                                                │
│  ───────────────────────────────────────────────────────────  │
│                                                                │
│  📱 João Silva                    14:32                        │
│  +55 11 99999-9999              "Olá, preciso de ajuda"       │
│  🤖 IA ativa                                                   │
│                                                                │
│  📱 Maria Santos                  13:45                        │
│  +55 11 88888-8888              "Obrigada pelo atendimento"   │
│  👤 Humano                                                     │
│                                                                │
└────────────────────────────────────────────────────────────────┘
```

### Tab "Grupos" - Layout Específico:
```
┌────────────────────────────────────────────────────────────────┐
│  CONVERSAS > GRUPOS                                            │
├────────────────────────────────────────────────────────────────┤
│  [Todas as integrações ▼]                                      │
│  [🔍 Buscar grupos...]                                         │
│                                                                │
│  Filtros de Modo:                                              │
│  [ Todos ] [ 🟢 Ativos ] [ 👁️ Monitor ] [ ⏸️ Desativados ]    │
│                                                                │
│  ───────────────────────────────────────────────────────────  │
│                                                                │
│  👥 Vendas Equipe SP            14:32        🟢 Ativo          │
│     12 participantes            "Pedro: Fechamos a venda!"    │
│     🤖 IA: Responde no privado                                 │
│                                                                │
│  👥 Suporte Técnico             13:45        👁️ Monitor        │
│     8 participantes             "Cliente: Sistema caiu"       │
│     📊 Apenas analytics                                        │
│                                                                │
│  👥 Clientes VIP                12:30        ⏸️ Desativado     │
│     25 participantes            "Admin: Bom dia a todos"      │
│     🚫 Bot não processa                                        │
│                                                                │
└────────────────────────────────────────────────────────────────┘
```

---

## 3. Jornada do Usuário Refinada

### 3.1 Fluxo: Conversa Individual (Chat Direto)

```
[Usuário seleciona conversa individual]
        ↓
┌─────────────────────────────────────┐
│  HEADER                             │
│  📱 João Silva                      │
│  +55 11 99999-9999 • WhatsApp Main │
│  🤖 IA ativa                        │
│  [Resolver ✓] [⋮]                   │
├─────────────────────────────────────┤
│  MENSAGENS                          │
│  (fluxo normal de chat)             │
├─────────────────────────────────────┤
│  INPUT                              │
│  [😊] [📎] [Digite...] [🎤] [➤]     │
└─────────────────────────────────────┘
```

**Ações disponíveis:**
- Enviar mensagem (pausa IA automaticamente)
- Resolver (fechar sessão)
- Arquivar
- Bloquear contato
- Ver histórico
- Transferir para departamento

### 3.2 Fluxo: Grupo WhatsApp

```
[Usuário seleciona grupo]
        ↓
┌─────────────────────────────────────┐
│  HEADER                             │
│  👥 Vendas Equipe SP               │
│  12 participantes • WhatsApp Main  │
│  🟢 Ativo • 🤖 Responde no privado │
│  [⚙️ Config] [👤 Participantes] [⋮]│
├─────────────────────────────────────┤
│  MENSAGENS DO GRUPO                 │
│                                     │
│  [Avatar] Pedro Silva      14:32   │
│  Admin                              │
│  "Fechamos a venda do cliente X"   │
│  [💬 Responder privado]             │
│                                     │
│  [Avatar] Maria Santos     14:30   │
│  "Qual o status da proposta?"      │
│  [💬 Responder privado]             │
│                                     │
│  [Bot] Quayer IA           14:28   │
│  "Olá! Registrei o lead..."        │
│                                     │
├─────────────────────────────────────┤
│  INPUT (quando modo = ACTIVE)       │
│  [😊] [📎] [Digite...] [🎤] [➤]     │
│                                     │
│  ⚠️ Mensagens serão enviadas no     │
│  grupo. Para responder em privado,  │
│  clique no participante.            │
└─────────────────────────────────────┘
```

**Ações específicas de grupo:**
- Ver/gerenciar participantes
- Configurar modo do grupo (DISABLED/MONITOR/ACTIVE)
- Configurar modo de resposta IA (IN_GROUP/PRIVATE/HYBRID)
- Ver analytics do grupo
- Responder participante no privado (abre sessão ChatSession)

### 3.3 Fluxo: Responder Participante no Privado

```
[Usuário clica "Responder privado" em participante]
        ↓
┌─────────────────────────────────────────────────┐
│  SHEET/MODAL: Conversa Privada                  │
│                                                 │
│  ← Voltar para grupo                           │
│                                                 │
│  📱 Pedro Silva                                │
│  +55 11 99999-9999                             │
│  📍 Membro de: Vendas Equipe SP                │
│                                                 │
│  ───────────────────────────────────────────── │
│                                                 │
│  [Histórico da conversa privada]               │
│                                                 │
│  ───────────────────────────────────────────── │
│                                                 │
│  [😊] [📎] [Digite...] [🎤] [➤]                 │
└─────────────────────────────────────────────────┘
```

---

## 4. Sistema de Filtros Proposto

### 4.1 Filtros Principais (Tabs)

| Tab | Descrição | Fonte de Dados |
|-----|-----------|----------------|
| **Diretas** | Conversas 1:1 | `ChatSession` onde `contact.phoneNumber` NOT ends with `@g.us` |
| **Grupos** | Grupos WhatsApp | `GroupChat` (novo modelo) |
| **Arquivadas** | Todas encerradas | `ChatSession` + `GroupChat` com status CLOSED/PAUSED |

### 4.2 Subfiltros para "Diretas"

| Filtro | Lógica |
|--------|--------|
| Todas | Todos os status exceto CLOSED |
| IA | `aiEnabled=true` AND `aiBlockedUntil` expired AND `connectionHasWebhook=true` |
| Humano | `aiEnabled=false` OR `aiBlockedUntil` valid OR `!connectionHasWebhook` |
| Fila | `status='QUEUED'` |

### 4.3 Subfiltros para "Grupos"

| Filtro | Lógica |
|--------|--------|
| Todos | Todos os grupos |
| Ativos | `mode='ACTIVE'` |
| Monitor | `mode='MONITOR_ONLY'` |
| Desativados | `mode='DISABLED'` |

### 4.4 Subfiltros para "Arquivadas"

| Filtro | Lógica |
|--------|--------|
| Todas | Todas arquivadas |
| Diretas | `ChatSession` com status CLOSED/PAUSED |
| Grupos | `GroupChat` com status CLOSED |

---

## 5. Componentes Necessários

### 5.1 Novos Componentes

```
src/components/conversations/
├── ConversationTabs.tsx       # Tabs: Diretas | Grupos | Arquivadas
├── DirectChatsList.tsx        # Lista de chats 1:1
├── GroupChatsList.tsx         # Lista de grupos
├── ArchivedList.tsx           # Lista unificada de arquivados
├── GroupChatView.tsx          # Visualização de grupo
├── GroupParticipantsList.tsx  # Lista de participantes
├── GroupSettingsSheet.tsx     # Configurações do grupo
├── GroupMessageBubble.tsx     # Mensagem com info do participante
├── PrivateChatSheet.tsx       # Sheet para chat privado
└── GroupModeIndicator.tsx     # Indicador visual do modo
```

### 5.2 Componentes Existentes a Modificar

```
src/app/integracoes/conversations/page.tsx
├── Adicionar sistema de tabs
├── Separar lógica de diretas vs grupos
├── Adicionar loading states por tab
└── Preservar estado entre tabs

src/features/messages/controllers/chats.controller.ts
├── Adicionar endpoint para grupos
├── Separar queries de diretas vs grupos
└── Adicionar filtros de GroupMode
```

---

## 6. API Endpoints Necessários

### 6.1 Grupos

```typescript
// GET /api/v1/groups/list
// Lista grupos da organização
{
  query: {
    instanceId?: string
    mode?: 'ACTIVE' | 'MONITOR_ONLY' | 'DISABLED'
    search?: string
    limit?: number
    offset?: number
  }
}

// GET /api/v1/groups/:groupId
// Detalhes do grupo
{
  includes: ['participants', 'messages', 'analytics']
}

// PATCH /api/v1/groups/:groupId
// Atualizar configurações do grupo
{
  body: {
    mode?: GroupMode
    aiEnabled?: boolean
    aiResponseMode?: GroupAIResponseMode
    aiAgentConfigId?: string
  }
}

// GET /api/v1/groups/:groupId/participants
// Lista participantes do grupo
{
  query: {
    role?: 'admin' | 'superadmin' | 'participant'
    isActive?: boolean
  }
}

// GET /api/v1/groups/:groupId/messages
// Mensagens do grupo
{
  query: {
    limit?: number
    cursor?: string
    participantJid?: string  // Filtrar por participante
  }
}

// POST /api/v1/groups/:groupId/messages
// Enviar mensagem no grupo
{
  body: {
    content: string
    type: MessageType
  }
}

// POST /api/v1/groups/:groupId/participants/:participantJid/private
// Iniciar/continuar conversa privada com participante
{
  body: {
    content: string
  }
}
```

---

## 7. Migração de Dados

### 7.1 Estratégia de Migração

```sql
-- 1. Identificar grupos no modelo legado
SELECT cs.* FROM chat_sessions cs
JOIN contacts c ON cs.contact_id = c.id
WHERE c.phone_number LIKE '%@g.us';

-- 2. Criar registros em GroupChat
INSERT INTO group_chats (group_jid, connection_id, organization_id, name, ...)
SELECT
  c.phone_number as group_jid,
  cs.connection_id,
  cs.organization_id,
  c.name,
  ...
FROM chat_sessions cs
JOIN contacts c ON cs.contact_id = c.id
WHERE c.phone_number LIKE '%@g.us';

-- 3. Migrar mensagens para GroupMessage
-- (Requer processamento para extrair participantJid)
```

### 7.2 Plano de Rollout

1. **Fase 1**: Criar novo modelo paralelo (já feito)
2. **Fase 2**: Implementar sync de grupos via webhook
3. **Fase 3**: Implementar UI com flag de feature
4. **Fase 4**: Migrar dados existentes
5. **Fase 5**: Depreciar modelo legado

---

## 8. Considerações de UX

### 8.1 Indicadores Visuais

| Estado | Ícone | Cor | Descrição |
|--------|-------|-----|-----------|
| Grupo Ativo | 🟢 | `green-500` | Bot processa e responde |
| Grupo Monitor | 👁️ | `yellow-500` | Bot apenas monitora |
| Grupo Desativado | ⏸️ | `gray-400` | Bot ignora |
| IA no Grupo | 🤖→👥 | `purple-500` | Responde no grupo |
| IA no Privado | 🤖→📱 | `blue-500` | Responde no privado |
| IA Híbrida | 🤖↔️ | `indigo-500` | Decide por contexto |

### 8.2 Empty States

**Nenhum grupo:**
```
👥
Nenhum grupo encontrado

Grupos aparecem automaticamente quando você
é adicionado em um grupo no WhatsApp.

[Saiba mais sobre grupos]
```

**Grupo desativado:**
```
⏸️
Este grupo está desativado

O bot não está processando mensagens deste grupo.
Ative o modo do grupo para começar a usar.

[Ativar grupo]
```

### 8.3 Onboarding de Grupos

```
┌─────────────────────────────────────────────┐
│  👥 Novo Grupo Detectado!                   │
│                                             │
│  "Vendas Equipe SP" foi adicionado          │
│                                             │
│  Como você quer que o bot funcione?         │
│                                             │
│  ┌─────────────────────────────────────────┐│
│  │ 🟢 Ativo                                ││
│  │ Bot escuta e responde mensagens         ││
│  └─────────────────────────────────────────┘│
│                                             │
│  ┌─────────────────────────────────────────┐│
│  │ 👁️ Apenas Monitorar                     ││
│  │ Bot coleta dados mas não responde       ││
│  └─────────────────────────────────────────┘│
│                                             │
│  ┌─────────────────────────────────────────┐│
│  │ ⏸️ Desativado                           ││
│  │ Bot ignora este grupo                   ││
│  └─────────────────────────────────────────┘│
│                                             │
│  [Configurar depois]                        │
└─────────────────────────────────────────────┘
```

---

## 9. Priorização de Implementação

### Sprint 1: Foundation
- [ ] Criar endpoints de grupos (list, get, update)
- [ ] Implementar sync de grupos no webhook
- [ ] Criar tab de grupos básica (read-only)

### Sprint 2: Core Features
- [ ] Implementar visualização de mensagens de grupo
- [ ] Adicionar lista de participantes
- [ ] Implementar configurações de modo

### Sprint 3: Interação
- [ ] Envio de mensagens no grupo
- [ ] Responder no privado
- [ ] Vincular sessões privadas

### Sprint 4: Polish
- [ ] Migração de dados legados
- [ ] Empty states e onboarding
- [ ] Analytics e métricas

---

## 10. Decisões Pendentes

1. **Migração automática ou manual?**
   - Auto: Migrar todos grupos existentes automaticamente
   - Manual: Usuário escolhe quais grupos migrar

2. **Comportamento padrão para novos grupos?**
   - Opção A: DISABLED (mais seguro)
   - Opção B: Usar `organization.groupDefaultMode`
   - Opção C: Prompt de configuração (onboarding)

3. **Limite de participantes para sync?**
   - Grupos muito grandes podem impactar performance
   - Sugestão: Sync completo até 100 participantes, depois lazy load

4. **Retenção de mensagens de grupo?**
   - Grupos podem ter muito mais volume que 1:1
   - Sugestão: Política de retenção diferenciada (30 dias default)

---

## Próximos Passos

1. **Validar arquitetura** com stakeholders
2. **Definir decisões pendentes**
3. **Criar issues no GitHub** para tracking
4. **Iniciar Sprint 1**

---

*Documento criado em: 25/12/2024*
*Última atualização: 25/12/2024*
