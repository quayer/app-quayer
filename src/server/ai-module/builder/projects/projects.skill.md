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

Se precisar deletar projeto, cascatear a conversa antes (ou usar `onDelete: Cascade` no Prisma — verificar).

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
DRAFT ──(publishProject)──▶ ACTIVE ──(manual)──▶ ARCHIVED
  │                             │
  │                             └─ publishedVersionId setado
  └─ aiAgentId pode ser null   └─ aiAgentId obrigatório
```

- **DRAFT:** conversa em andamento, tool `create_agent` pode ou não ter rodado
- **ACTIVE:** já foi publicado ao menos uma vez — consumindo mensagens reais via `ai-agents`
- **ARCHIVED:** congelado, não recebe mensagens, mantido para auditoria

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

| Action | Método | Path | Uso |
|---|---|---|---|
| `listProjects` | GET | `/builder/projects` | Paginação + filtro por `type`/`status` |
| `createProject` | POST | `/builder/projects/create` | Cria DRAFT + conversa + 1ª mensagem |
| `publishProject` | POST | `/builder/projects/publish` | DRAFT → ACTIVE (exige `aiAgentId`) |
| `sendChatMessage` | POST | `/builder/projects/:id/chat/message` | SSE streaming (ver chat.skill.md) |

---

## Validações de publicação

`publishProject` **exige**:

1. Projeto pertence à org do usuário
2. `project.aiAgentId != null` (tool `create_agent` já rodou)
3. `promptVersionId` pertence ao `aiAgentId` do projeto (cross-check de tenant via agent)

Falha → `400 badRequest` com mensagem em português.

---

## Referências

- Repo: `src/server/ai-module/builder/repositories/builder-project.repository.ts`
- Schemas: `src/server/ai-module/builder/builder.schemas.ts`
- Constants: `src/server/ai-module/builder/builder.constants.ts`
