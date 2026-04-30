# Skill — Frontend Deploy Tab

Espelho no frontend da saga de publicação descrita em `server/ai-module/builder/deploy/deploy.skill.md`. Esta tab é o wizard que o usuário vê quando clica "Publicar".

---

## Wizard de 3 steps

```
┌─ Step 1 ─────────┐  ┌─ Step 2 ─────────┐  ┌─ Step 3 ─────────┐
│ Conexão          │→ │ Instância         │→ │ Resumo           │
│                  │  │                   │  │                  │
│ - usar existente │  │ - selecionar      │  │ Confere tudo     │
│ - criar nova     │  │ - criar nova      │  │ Botão Publicar   │
│                  │  │ - status QR       │  │                  │
└──────────────────┘  └───────────────────┘  └──────────────────┘
```

### Step 1 — Connection

- Lista `Connection` existentes da org (via `api.communication.connections.list`)
- Usuário escolhe uma OU cria nova
- Validação: connection precisa ter tipo compatível com `BuilderProject.type` (WHATSAPP_AGENT → WHATSAPP)

### Step 2 — Instance

- Lista `Instance` vinculadas à connection selecionada
- Usuário escolhe OU cria nova
- Se criar nova: mostra QR code + polling de status (`PENDING` → `CONNECTED`)
- Bloqueia avanço até `status === CONNECTED`

### Step 3 — Summary

- Mostra: agente, versão a publicar, connection, instance
- Botão grande "Publicar" → chama `api.builder.publishProject.useMutation`
- Ao clicar: vira step de progresso (ver polling abaixo)

---

## Polling de `BuilderDeployment.status`

Após publicar, a UI **não** bloqueia sincronamente. Em vez disso:

1. Mutation retorna `deploymentId`
2. Frontend inicia polling com `api.builder.getDeploymentStatus.useQuery` (`refetchInterval: 1500ms`)
3. Renderiza progress bar + step atual baseado em `BuilderDeployment.status`:

| Backend status | UI |
|---|---|
| `PENDING` | Spinner + "Iniciando..." |
| `AGENT_PUBLISHED` | ✓ Agente publicado |
| `INSTANCE_READY` | ✓ Agente ✓ Instance |
| `CONNECTION_BOUND` | ✓ Agente ✓ Instance ✓ Conexão |
| `COMPLETED` | ✓ Tudo ok → confete + redirect para overview |
| `ROLLING_BACK` | ⚠ Algo falhou, revertendo... |
| `ROLLED_BACK` | ❌ Falhou — tudo revertido, projeto voltou ao estado anterior |
| `ROLLBACK_FAILED` | 🚨 **Crítico** — CTA para contato com suporte |

Polling para quando status é terminal (`COMPLETED`, `ROLLED_BACK`, `ROLLBACK_FAILED`).

---

## Rollback UI

Quando projeto está `ACTIVE` e tem `publishedVersionId`, a tab Deploy mostra:

- Histórico de deployments (lista, do mais recente ao mais antigo)
- Cada linha com botão "Reverter para esta versão" (exceto a atual)
- Clicar → modal de confirmação → chama rollback endpoint

O rollback é **quase instantâneo** (só flipa `AgentPromptVersion.isActive`) — não é uma nova saga completa.

---

## Estados vazios

- **Sem aiAgentId:** wizard mostra mensagem "Este projeto ainda não tem agente. Continue a conversa no Builder para criá-lo."
- **Sem connections na org:** Step 1 força criação (não mostra lista vazia)
- **Deploy em andamento de outro device:** detectar via polling no mount e entrar direto no modo "aguardando"

---

## Referências

- Backend saga: `src/server/ai-module/builder/deploy/deploy.skill.md` (este skill mas do server)
- Tab component: `src/client/components/projetos/preview/tabs/deploy/deploy-tab.tsx` (registrada em `preview/tab-registry.tsx`)
- Publish endpoint: `src/server/ai-module/builder/builder.controller.ts` (`publishProject`)
- `BuilderDeployment` model: Prisma schema
