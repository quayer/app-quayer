---
Criado: 2026-05-10
Atualizado: 2026-05-11
Revisar em: 2026-08-11
Relacionados:
  - prisma/schema.prisma
  - prisma/migrations/20260511000000_drop_orphan_models/migration.sql
  - docs/ERD.md
  - docs/deprecated/ADMIN_SURFACE_REMOVED.md
  - CLAUDE.md
---

# Schema — Modelos Dormentes (Mai/2026)

Inventário dos modelos definidos em `prisma/schema.prisma` que **não têm uso ativo
em `src/`** após o pivot Builder IA WhatsApp (Abr/2026). Mantidos por dois motivos:

1. **Integridade FK** — removê-los quebraria modelos vivos que ainda os referenciam.
2. **Preservação intencional** — features dormentes que podem voltar (ver `CLAUDE.md`).

Levantamento feito por:
- `grep -rIw "ModelName" src/` (refs totais — case-sensitive)
- `grep -rIn "database\.<camelCase>\." src/` (uso real do client Prisma)
- `grep -E "^\s+\w+\s+ModelName(\?|\[\])?" prisma/schema.prisma` (FK relations)

**Lição aprendida (2026-05-11):** o código acessa o Prisma via alias `database`
(não `prisma`). A busca `prisma.X.*` deu falso negativo para `LogAnalysis` que
estava vivo via `database.logAnalysis.*`. Sempre validar com `tsc --noEmit` após
remover modelos.

---

## Categoria 1 — Dormente com FK (manter por enquanto)

Estes têm 0 uso em `src/` mas são alvos de relação no schema. Remover requer
limpar a cadeia inteira em uma migration coordenada.

| Modelo | Refs schema | Cadeia FK | Motivo de existir |
|---|---|---|---|
| `Project` | 2 | `Department` aponta para `Project` | Pré-pivot CRM, mantido na espera |
| `Department` | 1 | `User.departmentId` (talvez) | Idem |
| `File` | 1 | `Message.fileId` (anexos) | Suporte a anexos de WhatsApp |
| `Webhook` | 3 | `WebhookDelivery` aponta | Integrações outbound |
| `WebhookDelivery` | 1 | Pertence a `Webhook` | Histórico de entregas |
| `N8nCallLog` | 1 | `Connection` aponta | Log de calls n8n |
| `ConnectionEvent` | 1 | `Connection` aponta | Telemetria de conexão WhatsApp |
| `ConnectionSettings` | 1 | `Connection` aponta | Settings por conexão |
| `Campaign` | 1 | `CampaignRecipient` aponta | Communication module (dormente) |
| `CampaignRecipient` | 1 | Pertence a `Campaign` | Idem |
| `ShortLink` | 1 | `ShortLinkClick` aponta | Encurtador (dormente) |
| `ShortLinkClick` | 1 | Pertence a `ShortLink` | Idem |
| `PermissionResource` | 1 | `RolePermission` aponta | RBAC granular (não usado) |
| `RolePermission` | 1 | Pertence a `PermissionResource` | Idem |
| `Notification` | 1 | `NotificationRead` aponta | Sem controller (`CLAUDE.md` documenta) |
| `NotificationRead` | 1 | Pertence a `Notification` | Idem |
| `NotificationPreferences` | 1 | Pertence a `User` | Idem |
| `Plan` | 1 | `Subscription` aponta | Billing (dormente) |
| `Subscription` | 3 | `Invoice`, `UsageRecord` apontam | Billing (dormente) |
| `Invoice` | 2 | Pertence a `Subscription`/`Organization` | Billing (dormente) |
| `UsageRecord` | 1 | Pertence a `Subscription` | Billing (dormente) |

---

## Categoria 2 — Órfãos totais (REMOVIDOS em 2026-05-11)

Migration: [`20260511000000_drop_orphan_models`](../../prisma/migrations/20260511000000_drop_orphan_models/migration.sql)

| Modelo | Tabela | Por que removido |
|---|---|---|
| `WebhookEvent` | `webhook_events` | Idempotência de payment-gateway nunca foi cabeada |
| `MessageTemplate` | `message_templates` | Communication dormente, sem relação no schema |
| `IntegrationConfig` | `IntegrationConfig` | Superseded por `OrganizationProvider` |
| `EmailTemplate` | `EmailTemplate` | Templates vivem em `lib/email/` (React Email) |
| `DeviceAuthRequest` | `device_auth_requests` | OAuth device flow não implementado |
| `AIPrompt` | `AIPrompt` | Superseded por `BuilderPromptVersion` |

Enums removidos junto (eram exclusivos das tabelas acima):
- `WebhookEventStatus`
- `IntegrationType`
- `DeviceAuthStatus`

**Restaurar via git:** `git show <commit-before-drop>:prisma/schema.prisma`
e copiar o bloco do modelo + criar nova migration `CREATE TABLE`.

### Falso positivo encontrado no levantamento

- `LogAnalysis` foi inicialmente listado como órfão mas **está vivo** —
  `src/lib/logs/ai-analyzer.service.ts` usa via `database.logAnalysis.create/findMany`.
  Cabeado em `analysis.routes.ts` → `logsController` → registrado no
  `igniter.router.ts`. **Mantido no schema.**

---

## Categoria 3 — Em uso (registro de auditoria)

Não dormentes, listados aqui por completude do inventário:

- `CustomRole` — 2 refs em `src/` (auth)
- `VerifiedDomain` — 1 ref (verificação DNS)
- `ApiKey` — 2 refs (api-keys)
- `AuditLog` — 2 refs (segurança)
- `LogAnalysis` — usado via `database.logAnalysis` em `lib/logs/ai-analyzer.service.ts`

---

## Como atualizar este doc

Quando promover ou remover um modelo:

1. Rodar `grep -rIw "ModelName" src/ | wc -l` (refs totais)
2. Rodar `grep -rIn "database\.<camelCase>\." src/` (uso real do client)
3. Rodar `grep -E "^\s+\w+\s+ModelName(\?|\[\])?" prisma/schema.prisma` (FKs)
4. Após remover, rodar `npx prisma generate && npx tsc --noEmit` antes do commit
5. Reclassificar na categoria certa.
6. Atualizar frontmatter (`Atualizado:`).
7. Refletir mudança em `docs/ERD.md` se afeta o diagrama.
