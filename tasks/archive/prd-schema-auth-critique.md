# PRD: Schema Auth — Autocrítica Brutal + Reorganização Visual

> Data: 2026-03-14 | Branch: `ralph/auth-platform-hardening`
> Pré-requisito para: `prd-auth-test-pipeline.md`

---

## Introduction

Análise completa do `prisma/schema.prisma` revelou **16 problemas** distribuídos em 4 severidades:

- 🔴 **CRÍTICO** (6) — schema dessincronizado com DB real (colunas/tabelas existem no banco mas não no schema.prisma)
- 🟠 **INTEGRIDADE** (4) — FK faltando, constraints erradas, dados potencialmente corrompidos
- 🟡 **DESIGN** (4) — anti-patterns, duplicações, nomenclatura inconsistente
- 🟢 **VISUAL** (2) — organização do arquivo, ERD

Implementação em **fases ordenadas por risco**, do mais seguro para o mais delicado.

---

## Goals

- Schema.prisma 100% sincronizado com o banco PostgreSQL real
- Zero tabelas operadas por `$queryRaw` que poderiam usar Prisma ORM nativo
- Todas as FKs explícitas — sem orphan records
- `@@map()` consistente em todos os modelos (snake_case)
- Seções visuais claras no schema.prisma por domínio
- ERD atualizado em `docs/ERD.md`
- Nenhuma regressão nas queries existentes

---

## Resumo dos 16 Problemas Encontrados

### 🔴 CRÍTICOS — Schema ≠ Banco Real

| # | Problema | Impacto |
|---|----------|---------|
| C1 | `User.phone` e `User.phoneVerified` não estão no schema.prisma | Auth WhatsApp usa `$queryRaw` desnecessariamente |
| C2 | `Organization.geoAlertMode` não está no schema.prisma | Campo usado em produção, sem type safety |
| C3 | Tabela `DeviceSession` não tem model Prisma | 6 endpoints usam `$queryRaw` quando poderiam usar ORM |
| C4 | Tabela `IpRule` não tem model Prisma | 5 endpoints usam `$queryRaw` |
| C5 | `DeviceSession.countryCode` não está no schema | Adicionado via migration mas invisível ao Prisma |
| C6 | `Organization.document` deveria ser `String?` mas está como `String` | Migration `make_document_optional` desincronizou schema vs DB |

### 🟠 INTEGRIDADE — Dados em Risco

| # | Problema | Impacto |
|---|----------|---------|
| I1 | `Invitation.organizationId String` — sem FK relation para `Organization` | Registros órfãos se org for deletada |
| I2 | `Contact.phoneNumber @unique` é global, não por organização | Em multi-tenant, duas orgs não podem ter o mesmo número |
| I3 | `VerificationCode.email` guarda telefone para OTP WhatsApp | Semântica errada, confunde queries e logs |
| I4 | `TempUser` e `VerificationCode` vinculados apenas por email (sem FK) | Race condition possível no signup |

### 🟡 DESIGN — Anti-patterns e Duplicações

| # | Problema | Impacto |
|---|----------|---------|
| D1 | `Contact.contactField01..contactField20` — 20 colunas numeradas | Anti-pattern; `Attribute`/`ContactAttribute` já existe para isso |
| D2 | `AccessLevel` model orphaned — sem relação com User ou UserOrganization | Tabela morta, duplica `CustomRole` |
| D3 | `SystemConfig` e `SystemSettings` — dois modelos idênticos (key-value config) | Duplicação; queries espalhadas entre os dois |
| D4 | `MessageType` e `MessageStatus` usam `lowercase` enquanto todos os outros enums usam `SCREAMING_CASE` | Inconsistência de nomenclatura |

### 🟢 VISUAL — Organização

| # | Problema | Impacto |
|---|----------|---------|
| V1 | ~30 modelos sem `@@map()` (PascalCase no banco) enquanto ~20 têm snake_case | Inconsistência; tabelas misturadas no banco |
| V2 | Schema ~2100 linhas sem separação clara por domínio | Difícil navegar, fácil adicionar no lugar errado |

---

## User Stories

---

### FASE 1 — Sync schema ↔ banco (sem migration, sem risco)

### US-001: Adicionar `User.phone` e `User.phoneVerified` ao schema.prisma
**Description:** As a developer, I want `User.phone` and `User.phoneVerified` in the Prisma schema so that auth controllers can use ORM instead of raw SQL for phone-based operations.

**Context:** Columns already exist in PostgreSQL (added by migration `add_user_phone`). Adding to schema does NOT generate a new migration — just syncs Prisma's understanding.

**Acceptance Criteria:**
- [ ] `phone String?` adicionado ao model `User` após `twoFactorEnabled`
- [ ] `phoneVerified Boolean @default(false)` adicionado ao model `User`
- [ ] `@@index([phone])` adicionado ao `User`
- [ ] Verificar com `prisma validate` — zero erros
- [ ] `npx prisma generate` roda sem erros
- [ ] Typecheck passes

### US-002: Adicionar `Organization.geoAlertMode` ao schema.prisma
**Description:** As a developer, I want `Organization.geoAlertMode` in the Prisma schema so geo-alert features have type safety.

**Context:** Column exists in DB via migration `add_geo_alert_and_country_code`. Enum `GeoAlertMode` needs to be created.

**Acceptance Criteria:**
- [ ] Enum `GeoAlertMode { off notify block }` criado (valores lowercase pois existem assim no DB)
- [ ] `geoAlertMode GeoAlertMode @default(off)` adicionado ao model `Organization`
- [ ] `prisma validate` — zero erros
- [ ] `npx prisma generate` roda sem erros
- [ ] Typecheck passes

### US-003: Adicionar models `DeviceSession` e `IpRule` ao schema.prisma
**Description:** As a developer, I want full Prisma models for DeviceSession and IpRule so their 11 combined endpoints can use ORM instead of `$queryRaw`.

**Context:** Both tables exist in PostgreSQL (migration `add_device_sessions_and_ip_rules`). Adding models to schema does NOT generate a migration.

**DeviceSession fields (from migration SQL):**
```
id, userId, deviceName, ipAddress, userAgent, location?, countryCode?, lastActiveAt, isRevoked, revokedAt?, createdAt
```

**IpRule fields (from migration SQL):**
```
id, type (ALLOW/BLOCK), ipAddress, description?, organizationId?, createdById, isActive, expiresAt?, createdAt, updatedAt
```

**Acceptance Criteria:**
- [ ] Model `DeviceSession` adicionado com todos os campos acima + `@@map("device_sessions")`
- [ ] `User @relation` para `DeviceSession` (via userId, onDelete: Cascade)
- [ ] `deviceSessions DeviceSession[]` adicionado ao model `User`
- [ ] Model `IpRule` adicionado com todos os campos acima + `@@map("ip_rules")`
- [ ] Enums `IpRuleType { ALLOW BLOCK }` criados
- [ ] `Organization @relation?` para `IpRule` (via organizationId, nullable, onDelete: SetNull)
- [ ] `User @relation` para `IpRule` (via createdById)
- [ ] Indexes: `[userId]`, `[ipAddress]`, `[type]`, `[isActive]`, `[expiresAt]` no IpRule; `[userId]`, `[isRevoked]`, `[lastActiveAt]` no DeviceSession
- [ ] `prisma validate` — zero erros
- [ ] `npx prisma generate` roda sem erros
- [ ] Typecheck passes

### US-004: Corrigir `Organization.document` para nullable no schema
**Description:** As a developer, I want `Organization.document` to be `String?` in the schema matching what the DB actually has.

**Context:** Migration `make_document_optional` made this column nullable in PostgreSQL, but schema.prisma still shows `document String @unique` (non-nullable). This is a schema drift.

**Acceptance Criteria:**
- [ ] `document String @unique` → `document String? @unique` no model `Organization`
- [ ] Verificar que nenhum código assume `organization.document` non-null sem verificação
- [ ] `prisma validate` — zero erros
- [ ] Typecheck passes

---

### FASE 2 — Integridade de dados (migrations simples, baixo risco)

### US-005: Adicionar FK explícita em `Invitation.organizationId`
**Description:** As a developer, I want a real FK relation between Invitation and Organization so that cascade deletes work correctly.

**⚠️ Requer migration. Aprovar antes de executar.**

**Acceptance Criteria:**
- [ ] `organizationId String` no model `Invitation` tem relation explícita: `organization Organization @relation(fields: [organizationId], references: [id], onDelete: Cascade)`
- [ ] `invitations Invitation[]` adicionado ao model `Organization`
- [ ] Migration gerada com `prisma migrate dev --name add_invitation_org_fk`
- [ ] Migration testada em dev, sem erros
- [ ] Typecheck passes

### US-006: Renomear `VerificationCode.email` para `identifier`
**Description:** As a developer, I want the field that stores email OR phone in VerificationCode to be called `identifier` so queries and logs are semantically correct.

**⚠️ Requer migration de renomeação. Aprovar antes de executar.**

**Acceptance Criteria:**
- [ ] `email String` → `identifier String` no model `VerificationCode`
- [ ] `@@index([email, type])` → `@@index([identifier, type])`
- [ ] Migration com `@map("email")` para manter retrocompatibilidade com dado existente, ou migration com `RENAME COLUMN`
- [ ] Todos os usos de `.email` em `VerificationCode` queries atualizados (buscar em `auth.controller.ts`)
- [ ] Endpoint `/api/dev/last-token` atualizado para usar `identifier`
- [ ] Typecheck passes

---

### FASE 3 — Design (migrations de impacto médio, aprovar cada uma)

### US-007: Corrigir `Contact.phoneNumber` para unicidade por organização
**Description:** As a developer, I want Contact.phoneNumber to be unique per organization (not globally) so multi-tenant contacts work correctly.

**⚠️ Requer migration com potencial de conflito de dados. Verificar duplicatas primeiro.**

**Pre-check query:**
```sql
SELECT "phoneNumber", "organizationId", COUNT(*)
FROM "Contact"
GROUP BY "phoneNumber", "organizationId"
HAVING COUNT(*) > 1;
```

**Acceptance Criteria:**
- [ ] Pre-check executado — zero duplicatas (ou tratadas)
- [ ] `phoneNumber String @unique` → `phoneNumber String` (remove global unique)
- [ ] `@@unique([organizationId, phoneNumber])` adicionado (requer `organizationId` non-nullable)
- [ ] `organizationId String?` → `organizationId String` (tornar obrigatório)
- [ ] Migration gerada + testada em dev
- [ ] Typecheck passes

### US-008: Deprecar `AccessLevel` (modelo órfão)
**Description:** As a developer, I want the orphaned AccessLevel model removed so we don't maintain dead code.

**⚠️ Verificar antes: confirmar zero uso em código. Deletar tabela somente se vazia.**

**Pre-check:**
```bash
grep -r "AccessLevel" src/ --include="*.ts"
```

**Acceptance Criteria:**
- [ ] Busca de uso no código retorna zero resultados (somente schema.prisma)
- [ ] Tabela vazia no banco: `SELECT COUNT(*) FROM "AccessLevel";`
- [ ] Model `AccessLevel` removido do schema.prisma
- [ ] Migration de `DROP TABLE "AccessLevel"` gerada e executada
- [ ] `SystemConfig` e `SystemSettings` — decidir qual manter (ver US-009)
- [ ] Typecheck passes

### US-009: Consolidar `SystemConfig` e `SystemSettings` em um único model
**Description:** As a developer, I want a single system config model to avoid split queries and maintain consistency.

**⚠️ Requer migração de dados + DROP TABLE. Alta atenção.**

**Análise:**
- `SystemConfig`: tem `type`, `isEncrypted`, `isEditable` — mais rico
- `SystemSettings`: tem `encrypted`, `updatedBy` — tem auditing
- Manter: `SystemSettings` com campos de `SystemConfig` merged

**Acceptance Criteria:**
- [ ] `SystemConfig` mergeado para `SystemSettings` (adicionar: `type`, `isEditable`, `updatedBy`)
- [ ] Script de migração de dados: `INSERT INTO "SystemSettings" SELECT ... FROM "SystemConfig"`
- [ ] Todos os usos de `prisma.systemConfig` atualizados para `prisma.systemSettings`
- [ ] DROP TABLE `SystemConfig` após migração confirmada
- [ ] Typecheck passes

### US-010: Remover `contactField01..contactField20`
**Description:** As a developer, I want the 20 numbered contact fields removed since the Attribute/ContactAttribute system already handles custom fields properly.

**⚠️ Perda de dados. Verificar se campos têm dados antes de deletar.**

**Pre-check:**
```sql
SELECT COUNT(*) FROM "Contact"
WHERE "contactField01" IS NOT NULL
   OR "contactField02" IS NOT NULL
   -- ... etc
```

**Acceptance Criteria:**
- [ ] Pre-check: campos estão todos NULL (se não, migrar para `ContactAttribute` primeiro)
- [ ] 20 `contactField` colunas removidas do model `Contact`
- [ ] Migration gerada com DROP COLUMN para cada uma
- [ ] Typecheck passes

---

### FASE 4 — Visual e Consistência (sem migration)

### US-011: Padronizar `@@map()` em todos os modelos
**Description:** As a developer, I want all Prisma models to use `@@map()` with snake_case table names for consistency.

**Models sem `@@map()` (prioridade por domínio Auth):**

| Model | @@map a adicionar |
|-------|-------------------|
| `User` | `@@map("users")` |
| `Organization` | `@@map("organizations")` |
| `UserOrganization` | `@@map("user_organizations")` |
| `PasskeyCredential` | `@@map("passkey_credentials")` |
| `PasskeyChallenge` | `@@map("passkey_challenges")` |
| `TempUser` | `@@map("temp_users")` |
| `VerificationCode` | `@@map("verification_codes")` |
| `Session` | `@@map("sessions")` |
| `RefreshToken` | `@@map("refresh_tokens")` |
| `Invitation` | `@@map("invitations")` |
| `Department` | `@@map("departments")` |
| `Project` | `@@map("projects")` |
| `Webhook` | `@@map("webhooks")` |
| `WebhookDelivery` | `@@map("webhook_deliveries")` |
| `AuditLog` | `@@map("audit_logs")` |
| `Contact` | `@@map("contacts")` |
| `ChatSession` | `@@map("chat_sessions")` |
| `Message` | `@@map("messages")` |
| `Tabulation` | `@@map("tabulations")` |
| `ContactTabulation` | `@@map("contact_tabulations")` |
| `SessionTabulation` | `@@map("session_tabulations")` |
| `TabulationIntegration` | `@@map("tabulation_integrations")` |
| `TabulationSetting` | `@@map("tabulation_settings")` |
| `Attribute` | `@@map("attributes")` |
| `ContactAttribute` | `@@map("contact_attributes")` |
| `KanbanBoard` | `@@map("kanban_boards")` |
| `KanbanColumn` | `@@map("kanban_columns")` |
| `Label` | `@@map("labels")` |
| `ContactObservation` | `@@map("contact_observations")` |
| `File` | `@@map("files")` |
| `Call` | `@@map("calls")` |
| `IntegrationConfig` | `@@map("integration_configs")` |
| `SystemConfig` | deletar (US-009) |
| `SystemSettings` | `@@map("system_settings")` |
| `AIAgentConfig` | `@@map("ai_agent_configs")` |
| `EmailTemplate` | `@@map("email_templates")` |
| `AIPrompt` | `@@map("ai_prompts")` |
| `AccessLevel` | deletar (US-008) |

**⚠️ IMPORTANTE:** `@@map()` altera como o Prisma gera SQL, mas como as tabelas já existem com nome PascalCase no banco (para aquelas sem @@map), adicionar `@@map` vai fazer o Prisma buscar o nome novo. **Isso requer migration `RENAME TABLE` para cada model.**

**Strategy:** Fazer por domínio, começando por Auth (menor risco), migration por migration.

**Acceptance Criteria:**
- [ ] Todos os 35 models acima têm `@@map()` correto
- [ ] Migrations `RENAME TABLE` geradas (uma por domínio, não tudo de uma vez)
- [ ] `prisma validate` sem erros
- [ ] `npx prisma generate` sem erros
- [ ] Suite de testes de auth passa (`npm run test:auth`)
- [ ] Typecheck passes

### US-012: Reorganizar schema.prisma em seções visuais por domínio
**Description:** As a developer, I want schema.prisma organized into clear domain sections so I can navigate 2100+ lines without losing context.

**Target structure:**
```
// ════════════════════════════════════════════════
// DOMAIN: AUTH & IDENTITY
// Models: User, Organization, UserOrganization
//         Session, RefreshToken, TempUser
//         VerificationCode, Invitation
//         PasskeyCredential, PasskeyChallenge
//         TotpDevice, RecoveryCode, ScimToken
//         CustomRole, VerifiedDomain
// ════════════════════════════════════════════════

// ════════════════════════════════════════════════
// DOMAIN: CONNECTIONS & MESSAGING
// Models: Connection, ConnectionSettings
//         ConnectionEvent, ChatSession, Message
//         Contact, GroupChat, GroupParticipant
//         GroupMessage
// ════════════════════════════════════════════════

// ════════════════════════════════════════════════
// DOMAIN: ORGANIZATIONS & TEAMS
// Models: Department, Project, UserOrganization
//         Invitation, ApiKey
// ════════════════════════════════════════════════

// ════════════════════════════════════════════════
// DOMAIN: AI & AGENTS
// Models: AIAgentConfig, AIPrompt
//         OrganizationProvider, IntegrationConfig
// ════════════════════════════════════════════════

// ════════════════════════════════════════════════
// DOMAIN: PLATFORM & INFRA
// Models: Webhook, WebhookDelivery, AuditLog
//         Notification, NotificationRead
//         LogEntry, LogAnalysis, File
//         SystemSettings, EmailTemplate
// ════════════════════════════════════════════════

// ════════════════════════════════════════════════
// DOMAIN: SALES & CONTACTS
// Models: Contact, ContactAttribute, Attribute
//         Tabulation, ContactTabulation
//         SessionTabulation, KanbanBoard
//         KanbanColumn, Label, ContactObservation
// ════════════════════════════════════════════════

// enums agrupados por domínio no final de cada seção
```

**Acceptance Criteria:**
- [ ] Schema reorganizado nas 6 seções acima
- [ ] Enums movidos para junto do domínio ao qual pertencem
- [ ] `MessageType` e `MessageStatus` convertidos para SCREAMING_CASE (alinhar com outros enums)
- [ ] `prisma validate` sem erros após reorganização
- [ ] `npx prisma generate` sem erros
- [ ] Typecheck passes

### US-013: Gerar ERD atualizado em `docs/ERD.md`
**Description:** As a developer, I want an up-to-date Entity-Relationship Diagram so the data model is visually comprehensible.

**Acceptance Criteria:**
- [ ] `docs/ERD.md` criado com diagrama Mermaid (`erDiagram`)
- [ ] Cobre domínio Auth completo: User, Organization, UserOrganization, Session, RefreshToken, TempUser, VerificationCode, PasskeyCredential, TotpDevice, RecoveryCode, DeviceSession, IpRule, CustomRole
- [ ] Mostra cardinalidade (1..n, 0..1, etc.)
- [ ] Seção separada para domínio Messaging
- [ ] Arquivo legível no GitHub (Mermaid renderiza automaticamente)

---

## Functional Requirements

- **FR-1:** Fases executadas em ordem — Fase 1 antes de Fase 2, etc.
- **FR-2:** Cada US que requer migration tem uma migration isolada (não batching de múltiplas mudanças).
- **FR-3:** Antes de qualquer DROP TABLE: `SELECT COUNT(*)` confirma que tabela está vazia.
- **FR-4:** Renomeação de `VerificationCode.email` → `identifier` preserva dados existentes via `RENAME COLUMN`.
- **FR-5:** `@@map()` adicionados com migrations `RENAME TABLE` correspondentes — não apenas alterar schema.prisma.
- **FR-6:** Auth controllers atualizados para usar Prisma ORM nas queries de `DeviceSession` e `IpRule` após US-003.
- **FR-7:** `prisma validate` e `prisma generate` passam após cada US.

---

## Non-Goals

- Não migrar dados de `contactField01..20` para `ContactAttribute` (se campos tiverem dados, adiar US-010)
- Não redesenhar o sistema de permissões (RBAC) neste PRD
- Não mover schema para múltiplos arquivos (Prisma não suporta nativamente)
- Não adicionar `Passkey` support via novas migrations
- Não alterar lógica de negócio de nenhum controller — apenas schema + sync

---

## Execution Order

```
US-001 → US-002 → US-003 → US-004   (Fase 1: sem migration, ~30min)
    ↓
US-005 → US-006                      (Fase 2: migrations simples, ~1h)
    ↓
US-007 (requer pre-check)            (Fase 3a: migração de unicidade)
US-008 → US-009 → US-010             (Fase 3b: limpeza, aprovar cada)
    ↓
US-011 (por domínio, Auth primeiro)  (Fase 4a: @@map + RENAME TABLE)
US-012 → US-013                      (Fase 4b: visual, sem risco)
    ↓
Executar prd-auth-test-pipeline.md   (schema limpo → testes)
```

---

## Technical Considerations

### Como adicionar campo que já existe no banco (sem migration)

```bash
# 1. Editar schema.prisma (adicionar o campo)
# 2. Verificar que não há drift:
npx prisma migrate diff \
  --from-schema-datasource prisma/schema.prisma \
  --to-schema-datamodel prisma/schema.prisma \
  --exit-code
# 3. Se zero diff: apenas rodar
npx prisma generate
```

Se o Prisma detectar drift mesmo assim, usar:
```bash
npx prisma migrate dev --name sync_missing_fields --create-only
# Editar a migration gerada para ser um NO-OP se campos já existem
```

### Rename Column (US-006)

```sql
-- Migration SQL manual
ALTER TABLE "VerificationCode" RENAME COLUMN "email" TO "identifier";
```

Ou via Prisma:
```prisma
// Temporariamente adicionar @map para manter compatibilidade
identifier String @map("email")
```

### DeviceSession e IpRule — model schema

```prisma
model DeviceSession {
  id           String    @id @default(uuid())
  userId       String
  deviceName   String?
  ipAddress    String?
  userAgent    String?
  location     String?
  countryCode  String?
  lastActiveAt DateTime  @default(now())
  isRevoked    Boolean   @default(false)
  revokedAt    DateTime?
  createdAt    DateTime  @default(now())

  user User @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@index([userId])
  @@index([isRevoked])
  @@index([lastActiveAt])
  @@map("device_sessions")
}

enum IpRuleType { ALLOW BLOCK }

model IpRule {
  id             String      @id @default(uuid())
  type           IpRuleType
  ipAddress      String
  description    String?
  organizationId String?
  createdById    String
  isActive       Boolean     @default(true)
  expiresAt      DateTime?
  createdAt      DateTime    @default(now())
  updatedAt      DateTime    @updatedAt

  organization Organization? @relation(fields: [organizationId], references: [id], onDelete: SetNull)
  createdBy    User           @relation(fields: [createdById], references: [id])

  @@index([ipAddress])
  @@index([type, isActive])
  @@index([organizationId])
  @@index([expiresAt])
  @@map("ip_rules")
}
```

---

## Success Metrics

- `npx prisma validate` retorna zero erros
- `npx prisma generate` completa sem warnings
- Zero `$queryRaw` nos controllers de `device-sessions` e `ip-rules` (após Fase 1)
- `npm run test:auth` passa (após implementar prd-auth-test-pipeline.md)
- `docs/ERD.md` renderiza corretamente no GitHub

---

## Open Questions

- **Session model:** `User.sessions Session[]` existe, mas o auth controller usa JWT + RefreshToken. A tabela `Session` está sendo usada? Verificar: `SELECT COUNT(*), MAX(createdAt) FROM sessions`. Se vazia há muito tempo, adicionar à lista de deprecated (Fase 3).
- **`@@map` e RENAME TABLE:** Se tabelas sem `@@map` já têm dados em produção com nome PascalCase (ex: `User`, não `users`), a migration de rename é segura mas precisa de `ALTER TABLE "User" RENAME TO "users"`. Confirmar que nenhum código externo depende do nome antigo da tabela.
- **contactField01..20 com dados:** Se campos têm dados reais, criar US adicional para migrar dados para `ContactAttribute` antes de remover.
