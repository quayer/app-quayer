# Skill — Builder Projects (CRUD)

CRUD do modelo `BuilderProject` — o agregado-raiz do Builder IA. Cada projeto representa um "agente em construção" para uma organização.

---

## Modelo

```prisma
model BuilderProject {
  id             String    @id @default(uuid())
  organizationId String                              // FK obrigatória
  createdByUserId String
  name           String                              // derivado da 1ª linha do prompt
  type           BuilderProjectType                  // WHATSAPP_AGENT (único hoje)
  status         BuilderProjectStatus                // DRAFT | ACTIVE | ARCHIVED
  aiAgentId      String?                             // setado quando tool `create_agent` roda
  publishedVersionId String?                         // BuilderPromptVersion ativa
  conversation   BuilderProjectConversation?         // 1:1
  ...
}
```

---

## Relação 1:1 com BuilderProjectConversation

Criados **na mesma transação** via `builderProjectRepository.createWithInitialMessage`. Não existe projeto sem conversa. A conversa armazena:

- Histórico de mensagens (`BuilderProjectMessage`)
- `stateSummary` (resumo do estado do projeto, injetado no prompt)

O hard delete (`deleteProject` → `repository.hardDelete`) confia no `onDelete: Cascade` do Prisma: conversa, mensagens, deployments da saga e providers/calendar com `builderProjectId` somem juntos. O `AIAgentConfig` (FK `SetNull`) sobrevive — preserva ChatSession/Message de runtime — mas é desativado na mesma transação.

---

## Campo `type`

Enum `BuilderProjectType`:

| Valor | Significado | Toolset |
|---|---|---|
| `WHATSAPP_AGENT` | Agente WhatsApp (Phase 1) | `buildBuilderToolset` |

Phase 2 adicionará `EMAIL_AGENT`, `VOICE_AGENT`, etc. O campo é **não-nullable** — qualquer projeto legado sem type precisa migration de backfill.

---

## Lifecycle

```
DRAFT ──(publishProject)──▶ ACTIVE ──(archiveProject)──▶ ARCHIVED
  ▲                            │                            │
  │                            └─ publishedVersionId setado │
  └─ aiAgentId pode ser null   └─ aiAgentId obrigatório     │
  └──────────────(unarchiveProject)───────────────────────┘
```

- **DRAFT:** conversa em andamento, tool `create_agent` pode ou não ter rodado
- **ACTIVE:** já foi publicado ao menos uma vez — consumindo mensagens reais via `ai-agents`
- **ARCHIVED:** congelado, não recebe mensagens, mantido para auditoria. `unarchiveProject` traz de volta para DRAFT
- **(excluído):** `deleteProject` é hard delete — sai do banco, não é um status

---

## Ownership check

**Toda** query passa por `organizationId`. O método canônico é:

```typescript
builderProjectRepository.findProjectForOrg(projectId, user.currentOrgId)
```

Retorna `null` se o projeto não pertence à org — controller traduz em `404 notFound` (não vazamos existência).

Nunca consultar `database.builderProject.findUnique({ where: { id } })` diretamente no controller — sempre passar pelo repo.

---

## Actions no controller

| Action | Método | Path | File | Uso |
|---|---|---|---|---|
| `listProjects` | GET | `/builder/projects` | `routes/crud.routes.ts` | Paginação + filtro por `type`/`status` |
| `getProject` | GET | `/builder/projects/:id` | `routes/crud.routes.ts` | Retorna projeto + conversa + agente vinculado |
| `createProject` | POST | `/builder/projects/create` | `routes/crud.routes.ts` | Cria DRAFT + conversa + 1ª mensagem |
| `deleteProject` | DELETE | `/builder/projects/:id` | `routes/crud.routes.ts` | **Hard delete PERMANENTE** (cascata: conversa, mensagens, deployments, providers/calendar do projeto). Agente de runtime preservado mas desativado. Irreversível |
| `renameProject` | PATCH | `/builder/projects/:id/rename` | `routes/crud.routes.ts` | Renomeia projeto |
| `archiveProject` | PATCH | `/builder/projects/:id/archive` | `routes/crud.routes.ts` | Arquiva projeto (status → archived) |
| `unarchiveProject` | PATCH | `/builder/projects/:id/unarchive` | `routes/crud.routes.ts` | Restaura projeto arquivado (status → draft, limpa archivedAt) |
| `duplicateProject` | POST | `/builder/projects/:id/duplicate` | `routes/crud.routes.ts` | Clona projeto + agente + última versão de prompt |
| `updatePrompt` | PATCH | `/builder/projects/:id/prompt` | `routes/prompt.routes.ts` | Auto-save do system prompt |
| `listVersions` | GET | `/builder/projects/:id/versions` | `routes/prompt.routes.ts` | Histórico de versões do prompt |
| `rollbackPrompt` | POST | `/builder/projects/:id/prompt/rollback` | `routes/prompt.routes.ts` | Cria nova versão copiando versão alvo |
| `getSidebar` | GET | `/builder/sidebar` | `routes/metrics.routes.ts` | Projetos recentes p/ BuilderSidebar |
| `getMetrics` | GET | `/builder/projects/:id/metrics` | `routes/metrics.routes.ts` | Métricas 24h (ChatSessions + Messages) |
| `getProjectChannel` | GET | `/builder/projects/:id/channel` | `routes/channel.routes.ts` | Canal (Connection) ativo do agente |
| `attachChannel` | POST | `/builder/projects/:id/channel` | `routes/channel.routes.ts` | Vincula canal WhatsApp via AgentDeployment |
| `detachChannel` | DELETE | `/builder/projects/:id/channel` | `routes/channel.routes.ts` | Remove vínculo do canal ativo |
| `playgroundStream` | POST | `/builder/projects/:id/playground/stream` | `routes/playground.routes.ts` | SSE stateless para testar agente |

---

## Arquivos do subdomínio

```
src/server/ai-module/builder/projects/
├── projects.routes.ts          # Composer (~25 linhas) — agrega os 5 route files
├── projects.repository.ts      # Queries Prisma do subdomínio
├── projects.skill.md           # Este arquivo
└── routes/
    ├── crud.routes.ts          # listProjects, getProject, createProject, deleteProject, renameProject, archiveProject, unarchiveProject, duplicateProject, updateAgentSettings
    ├── prompt.routes.ts        # updatePrompt, listVersions, rollbackPrompt
    ├── metrics.routes.ts       # getSidebar, getMetrics
    ├── channel.routes.ts       # getProjectChannel, attachChannel, detachChannel
    └── playground.routes.ts    # playgroundStream
```

---

## Validações de publicação

`publishProject` **exige**:

1. Projeto pertence à org do usuário
2. `project.aiAgentId != null` (tool `create_agent` já rodou)
3. `promptVersionId` pertence ao `aiAgentId` do projeto (cross-check de tenant via agent)

Falha → `400 badRequest` com mensagem em português.

---

## Referências

- Repo: `src/server/ai-module/builder/projects/projects.repository.ts`
- Schemas: `src/server/ai-module/builder/builder.schemas.ts`
- Constants: `src/server/ai-module/builder/builder.constants.ts`
