# Skill — Builder Deploy (Saga cross-module)

Publicação de um `BuilderProject` envolve três módulos distintos. Não é um simples UPDATE — é uma **saga** com compensação em caso de falha parcial.

---

## Derivação determinística de enabledTools (FR-09/FR-10/FR-11)

As capacidades técnicas do agente publicado **derivam** das decisões do usuário — nunca são re-decididas no card de tools (`propose-tool-selection` só oferece o ortogonal `lead_only`). Helpers em `enabled-tools-derivation.ts` (set-merge que **preserva tools custom**, 1 UPDATE por step, idempotente):

| Decisão | Step da saga | Efeito em `AIAgentConfig.enabledTools` |
|---|---|---|
| Pricing com itens ativos + `disclosureStyle !== 'none'` | `materialize_pricing` | garante `get_pricing` |
| `disclosureStyle === 'none'` ou lista vazia | `materialize_pricing` | remove `get_pricing` e `send_pricing` |
| `handoff.mode` solo/roleta/departamentos | `materialize_team` | garante `transfer_to_human` (+ `create_lead` com roteiro de qualificação) |
| `handoff.mode === 'nenhum'` | `materialize_team` | remove `transfer_to_human` (nunca `create_lead`) |
| `handoff.mode` ausente | `materialize_team` | neutro (opt-in FR-08; não clobbera anexos manuais) |
| `alsoSchedule` + conexão de agenda ATIVA (probe espelha `resolveCalendarAccess`) | `materialize_team` | garante `check_availability`/`create_event`/`cancel_event`/`calendar_list_slots`, remove o fallback |
| `alsoSchedule` SEM conexão | `materialize_team` | fallback `schedule_appointment` (log claro), remove as 4 reais |
| sem `alsoSchedule` | `materialize_team` | remove todas as tools de agenda |

---

## O que acontece no deploy

Quando o usuário clica "Publicar" no wizard do frontend, o backend orquestra:

```
1. ai-module/ai-agents         → cria/atualiza AgentPromptVersion (runtime)
2. communication/instances     → cria/valida Instance (WhatsApp UAZ)
3. communication/connections   → cria Connection (liga instance ao agente)
4. ai-module/builder           → atualiza BuilderProject.status = ACTIVE
                                  atualiza BuilderProject.publishedVersionId
```

Cada step tem sua transação. Falha em um step dispara **rollback compensatório** dos anteriores.

---

## BuilderDeployment — máquina de estados

```
PENDING ──▶ AGENT_PUBLISHED ──▶ INSTANCE_READY ──▶ CONNECTION_BOUND ──▶ COMPLETED
   │              │                    │                   │
   └─ failed ─────┴────────────────────┴───────────────────┘
                                  │
                                  ▼
                            ROLLING_BACK ──▶ ROLLED_BACK | ROLLBACK_FAILED
```

Estados:

| Estado | Significado |
|---|---|
| `PENDING` | Registro criado, nada provisionado ainda |
| `AGENT_PUBLISHED` | Step 1 ok — `AgentPromptVersion.isActive = true` |
| `INSTANCE_READY` | Step 2 ok — `Instance.status = CONNECTED` (ou criada) |
| `CONNECTION_BOUND` | Step 3 ok — `Connection` existe e aponta para instance+agent |
| `COMPLETED` | Step 4 ok — projeto ativo |
| `ROLLING_BACK` | Saga revertendo — executando compensações |
| `ROLLED_BACK` | Reversão limpa — sistema no estado anterior |
| `ROLLBACK_FAILED` | **Requer intervenção humana** — estado inconsistente |

---

## Compensações

| Step que falhou | Compensação |
|---|---|
| 2 (instance) | Reverter `AgentPromptVersion.isActive` para versão anterior |
| 3 (connection) | Reverter version + desprovisionar instance (se criada pelo deploy) |
| 4 (status) | Reverter version + connection + (opcional) instance |

**Não** deletamos `Instance` se ela já existia antes — só as criadas por este deploy (`createdByDeploymentId` como discriminator).

---

## BuilderPromptVersion vs AgentPromptVersion

**TABELAS DIFERENTES — não confundir:**

| Tabela | Módulo | Propósito |
|---|---|---|
| `BuilderPromptVersion` | `builder/` | Versão de **design-time** — snapshots do prompt enquanto o usuário itera no Builder |
| `AgentPromptVersion` | `ai-agents/` | Versão de **runtime** — o que o agente usa quando recebe mensagem real |

Fluxo: cada iteração no chat do Builder cria `BuilderPromptVersion`. No deploy, a versão selecionada é **copiada** para `AgentPromptVersion` com `isActive = true` (e a anterior vira `isActive = false`).

Isso permite:

- Rollback instantâneo (flip de `isActive` entre versões já copiadas)
- Auditoria de design vs runtime (quem propôs vs o que foi ativado)
- Sticky versioning (conversas ativas continuam com a version antiga — ver US-029)

---

## Rollback UI

Qualquer `BuilderDeployment` com `status = COMPLETED` pode ser revertido no frontend:

1. Frontend chama endpoint de rollback com `deploymentId`
2. Backend localiza deployment **anterior** bem-sucedido do mesmo projeto
3. Reverte version ativa para a do deployment anterior
4. Mantém instance/connection (não mexe em WhatsApp — só prompt volta)

Se não houver deployment anterior → botão desabilitado.

---

## Referências

- Deploy handler: `src/server/ai-module/builder/services/deploy/*` (quando implementado)
- `AgentPromptVersion`: `src/server/ai-module/ai-agents/`
- `Instance`: `src/server/communication/instances/`
- `Connection`: `src/server/communication/connections/`
- US-007 (publish): `builder.controller.ts` → `publishProject`
- US-029 (sticky): `ai-agents/agent-runtime.service.ts`
