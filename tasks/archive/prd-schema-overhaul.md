# PRD: Schema Overhaul — Auth Cleanup + Multi-Schema Separation

> **Prioridade:** Imediata
> **Risco:** Alto — envolve renomear tabelas, mover schemas, refatorar código de auth
> **Branch sugerida:** `ralph/schema-overhaul`
> **Criado em:** 2026-03-14

---

## Introdução

O schema atual do Quayer foi construído de forma incremental e acumulou problemas críticos:

1. **Auth sujo:** `User` carrega campos de negócio (messaging preferences, AI settings), dois sistemas de reset de senha em paralelo, duas tabelas de sessão com responsabilidades sobrepostas.
2. **Schema único:** Todas as 58 tabelas vivem no schema `public`. Sem separação de domínio, qualquer JOIN pode tocar qualquer tabela — sem isolamento, sem controle de acesso por domínio.
3. **Naming inconsistente:** Metade das tabelas usa PascalCase no DB (legacy), metade usa snake_case via `@@map()`. Não existe padrão.
4. **Campos duplicados:** `resetToken` no `User` + `VerificationCode` tipo `RESET_PASSWORD`. `currentOrgId` + `lastOrganizationId`. `Session` + `DeviceSession`.

Este PRD cobre a limpeza completa do domínio Auth e a separação do schema `public` em schemas PostgreSQL distintos por domínio.

---

## Goals

- Remover todos os campos duplicados e redundantes do model `User`
- Unificar os dois sistemas de sessão em um único model
- Separar o Prisma em 5 schemas PostgreSQL: `auth`, `messaging`, `sales`, `platform`, `ai`
- Padronizar todos os nomes de tabela para snake_case via `@@map()`
- Zero breaking changes na API pública — todas as mudanças são internas ao DB/ORM
- `prisma validate` e `tsc --noEmit` passando ao final de cada US

---

## User Stories

### US-001: Remover resetToken duplicado do User

**Descrição:** Como desenvolvedor, quero remover `resetToken` e `resetTokenExpiry` do model `User` porque o sistema de reset de senha já usa `VerificationCode` com `type = RESET_PASSWORD`, criando dois sistemas paralelos e inconsistentes.

**Acceptance Criteria:**
- [ ] Remover campos `resetToken String?` e `resetTokenExpiry DateTime?` do model `User` no schema.prisma
- [ ] Remover `@@index([resetToken])` do model `User`
- [ ] Buscar todos os usos de `user.resetToken` e `user.resetTokenExpiry` no codebase e migrar para `VerificationCode`
- [ ] Criar migration SQL: `ALTER TABLE "User" DROP COLUMN "resetToken"; ALTER TABLE "User" DROP COLUMN "resetTokenExpiry";`
- [ ] `prisma validate` passa
- [ ] `tsc --noEmit` passa

---

### US-002: Extrair preferências de usuário do model User

**Descrição:** Como desenvolvedor, quero mover `messageSignature` e `aiSuggestionsEnabled` para um model `UserPreferences` separado, pois campos de preferências de negócio não pertencem ao model de autenticação.

**Acceptance Criteria:**
- [ ] Criar model `UserPreferences` no schema.prisma com: `id`, `userId` (FK único), `messageSignature Json?`, `aiSuggestionsEnabled Boolean @default(true)`, `createdAt`, `updatedAt`
- [ ] Adicionar `@@map("user_preferences")` e `@@schema("auth")` ao novo model
- [ ] Remover `messageSignature` e `aiSuggestionsEnabled` do model `User`
- [ ] Criar migration SQL para criar tabela e migrar dados existentes
- [ ] Atualizar todos os lugares que leem/escrevem `user.messageSignature` para usar `user.preferences.messageSignature`
- [ ] `prisma validate` passa
- [ ] `tsc --noEmit` passa

---

### US-003: Remover lastOrganizationId redundante do User

**Descrição:** Como desenvolvedor, quero remover `lastOrganizationId` do model `User` pois é redundante com `currentOrgId` sem propósito documentado.

**Acceptance Criteria:**
- [ ] Verificar no codebase se `lastOrganizationId` é usado em algum lugar além do schema
- [ ] Remover campo `lastOrganizationId String?` do model `User`
- [ ] Criar migration SQL: `ALTER TABLE "User" DROP COLUMN "lastOrganizationId";`
- [ ] `prisma validate` passa
- [ ] `tsc --noEmit` passa

---

### US-004: Renomear VerificationCode.email para identifier

**Descrição:** Como desenvolvedor, quero renomear o campo `email` da tabela `VerificationCode` para `identifier` porque esse campo armazena email OU telefone, e o nome atual é enganoso e gera bugs.

**Acceptance Criteria:**
- [ ] Renomear campo `email String` para `identifier String` no model `VerificationCode`
- [ ] Atualizar índice: `@@index([identifier, type])` (era `@@index([email, type])`)
- [ ] Criar migration SQL: `ALTER TABLE "VerificationCode" RENAME COLUMN "email" TO "identifier";`
- [ ] Buscar todos os usos de `verificationCode.email` e `{ email: ... }` em queries de VerificationCode no codebase e renomear para `identifier`
- [ ] `prisma validate` passa
- [ ] `tsc --noEmit` passa

---

### US-005: Unificar Session e DeviceSession em um único model

**Descrição:** Como desenvolvedor, quero unificar `Session` e `DeviceSession` em um único model `Session` enriquecido, pois ambos representam a mesma entidade (sessão autenticada de um usuário) com campos complementares que estão desnecessariamente separados.

**Acceptance Criteria:**
- [ ] Novo model `Session` deve conter: todos os campos atuais de `Session` + `deviceName`, `ipAddress`, `userAgent`, `countryCode`, `lastActiveAt`, `isRevoked`, `revokedAt` (de `DeviceSession`)
- [ ] Adicionar campo `aal String @default("aal1")` — Authentication Assurance Level (`aal1` = só senha, `aal2` = senha + MFA verificado nesta sessão)
- [ ] Adicionar `@@map("sessions")` ao model
- [ ] Criar migration SQL para: adicionar colunas a `Session`, migrar dados de `DeviceSession`, dropar tabela `device_sessions`
- [ ] Remover model `DeviceSession` do schema.prisma
- [ ] Atualizar todas as referências a `DeviceSession` no codebase para usar `Session`
- [ ] `prisma validate` passa
- [ ] `tsc --noEmit` passa

---

### US-006: Adicionar tabela identities para OAuth social login

**Descrição:** Como desenvolvedor, quero criar a tabela `identities` para vincular provedores OAuth (Google, GitHub, etc.) a usuários existentes, permitindo que um usuário tenha múltiplos métodos de login associados ao mesmo `User`.

**Acceptance Criteria:**
- [ ] Criar model `Identity` no schema.prisma com: `id`, `userId FK`, `provider String` (ex: `google`, `github`), `providerId String` (ID do usuário no provedor), `email String?`, `name String?`, `avatarUrl String?`, `accessToken String?`, `refreshToken String?`, `expiresAt DateTime?`, `createdAt`, `updatedAt`
- [ ] Constraint unique: `@@unique([provider, providerId])`
- [ ] Adicionar `@@map("identities")` e `@@schema("auth")`
- [ ] Criar migration SQL para a nova tabela
- [ ] `prisma validate` passa
- [ ] `tsc --noEmit` passa
- [ ] **Nota:** A implementação do fluxo OAuth em si é fora do escopo deste PRD

---

### US-007: Padronizar naming — adicionar @@map() a todas as tabelas legadas

**Descrição:** Como desenvolvedor, quero que todos os 58 models Prisma usem snake_case no banco de dados via `@@map()`, eliminando a inconsistência atual onde metade usa PascalCase (legacy) e metade usa snake_case.

**Acceptance Criteria:**
- [ ] Todos os models sem `@@map()` recebem `@@map("snake_case_name")` correspondente
- [ ] Lista completa de tabelas a mapear: `User→users`, `Organization→organizations`, `UserOrganization→user_organizations`, `Session→sessions` (se ainda não mapeado), `RefreshToken→refresh_tokens`, `VerificationCode→verification_codes`, `TempUser→temp_users`, `Invitation→invitations`, `PasskeyCredential→passkey_credentials`, `PasskeyChallenge→passkey_challenges`, `Department→departments`, `Project→projects`, `Connection→connections` (se não mapeado), `ChatSession→chat_sessions`, `Message→messages`, `Contact→contacts`, `File→files`, `Call→calls`, `Webhook→webhooks`, `WebhookDelivery→webhook_deliveries`, `AuditLog→audit_logs`, `Tabulation→tabulations`, `ContactTabulation→contact_tabulations`, `Attribute→attributes`, `ContactAttribute→contact_attributes`, `KanbanBoard→kanban_boards`, `KanbanColumn→kanban_columns`, `Label→labels`, `ContactObservation→contact_observations`, `SystemSettings→system_settings`, `EmailTemplate→email_templates`, `AIAgentConfig→ai_agent_configs`, `AIPrompt→ai_prompts`, `IntegrationConfig→integration_configs`
- [ ] Criar migrations SQL com `ALTER TABLE "OldName" RENAME TO "new_name";` para cada tabela
- [ ] `prisma validate` passa
- [ ] `tsc --noEmit` passa

---

### US-008: Habilitar multiSchema no Prisma e criar schema auth

**Descrição:** Como desenvolvedor, quero habilitar o preview feature `multiSchema` do Prisma e mover todas as tabelas de Auth & Identidade para o schema PostgreSQL `auth`, isolando o domínio de autenticação do resto da aplicação.

**Acceptance Criteria:**
- [ ] Adicionar `previewFeatures = ["multiSchema"]` ao datasource no schema.prisma
- [ ] Criar schema `auth` no PostgreSQL via migration: `CREATE SCHEMA IF NOT EXISTS auth;`
- [ ] Adicionar `@@schema("auth")` aos seguintes models: `User`, `UserPreferences`, `Organization`, `UserOrganization`, `CustomRole`, `VerifiedDomain`, `Session` (unificado), `RefreshToken`, `VerificationCode`, `TempUser`, `Invitation`, `PasskeyCredential`, `PasskeyChallenge`, `Identity`, `TotpDevice`, `RecoveryCode`, `IpRule`, `ScimToken`
- [ ] Criar migrations SQL com `ALTER TABLE "public"."x" SET SCHEMA "auth";` para cada tabela
- [ ] Atualizar connection strings se necessário (schema search_path)
- [ ] `prisma validate` passa
- [ ] `tsc --noEmit` passa

---

### US-009: Criar schema messaging e mover tabelas de conexões

**Descrição:** Como desenvolvedor, quero mover todas as tabelas de mensagens/conexões para o schema `messaging`, isolando o domínio de comunicação.

**Acceptance Criteria:**
- [ ] Criar schema `messaging` no PostgreSQL via migration
- [ ] Adicionar `@@schema("messaging")` aos models: `Connection`, `ConnectionSettings`, `ConnectionEvent`, `ChatSession`, `Message`, `GroupChat`, `GroupParticipant`, `GroupMessage`, `SessionNote`, `QuickReply`
- [ ] Criar migrations SQL com `ALTER TABLE ... SET SCHEMA "messaging";`
- [ ] Verificar que FKs cross-schema funcionam (ex: `ChatSession.assignedAgentId → auth.users`)
- [ ] `prisma validate` passa
- [ ] `tsc --noEmit` passa

---

### US-010: Criar schema sales e mover tabelas de contatos/CRM

**Descrição:** Como desenvolvedor, quero mover todas as tabelas de contatos, kanban e tabulação para o schema `sales`.

**Acceptance Criteria:**
- [ ] Criar schema `sales` no PostgreSQL via migration
- [ ] Adicionar `@@schema("sales")` aos models: `Contact`, `ContactAttribute`, `Attribute`, `Tabulation`, `ContactTabulation`, `SessionTabulation`, `TabulationIntegration`, `TabulationSetting`, `KanbanBoard`, `KanbanColumn`, `Label`, `ContactObservation`, `Call`
- [ ] Criar migrations SQL com `ALTER TABLE ... SET SCHEMA "sales";`
- [ ] `prisma validate` passa
- [ ] `tsc --noEmit` passa

---

### US-011: Criar schema platform e schema ai

**Descrição:** Como desenvolvedor, quero mover tabelas de infraestrutura para o schema `platform` e tabelas de IA para o schema `ai`.

**Acceptance Criteria:**
- [ ] Criar schemas `platform` e `ai` no PostgreSQL via migration
- [ ] `platform`: `Webhook`, `WebhookDelivery`, `AuditLog`, `PermissionResource`, `RolePermission`, `LogEntry`, `LogAnalysis`, `Notification`, `NotificationRead`, `File`, `SystemSettings`, `EmailTemplate`, `ApiKey`
- [ ] `ai`: `AIAgentConfig`, `AIPrompt`, `OrganizationProvider`, `IntegrationConfig`, `N8nCallLog`
- [ ] Criar migrations SQL com `ALTER TABLE ... SET SCHEMA "x";`
- [ ] `prisma validate` passa
- [ ] `tsc --noEmit` passa

---

### US-012: Remover tabelas deprecated (AccessLevel, SystemConfig)

**Descrição:** Como desenvolvedor, quero dropar as tabelas `AccessLevel` e `SystemConfig` que estão marcadas como deprecated há meses e não têm usuários no codebase atual.

**Acceptance Criteria:**
- [ ] Confirmar via grep que `AccessLevel` não é importada ou usada em nenhum arquivo TypeScript
- [ ] Confirmar via grep que `SystemConfig` não é importada ou usada em nenhum arquivo TypeScript
- [ ] Remover models `AccessLevel` e `SystemConfig` do schema.prisma
- [ ] Criar migration SQL: `DROP TABLE IF EXISTS "AccessLevel"; DROP TABLE IF EXISTS "SystemConfig";`
- [ ] `prisma validate` passa
- [ ] `tsc --noEmit` passa

---

### US-013: Atualizar ERD e documentação

**Descrição:** Como desenvolvedor, quero atualizar `docs/ERD.md` e `docs/AUTH_MAP.md` para refletir a nova arquitetura multi-schema após todas as mudanças.

**Acceptance Criteria:**
- [ ] `docs/ERD.md` atualizado com os 5 schemas separados (auth, messaging, sales, platform, ai)
- [ ] Diagramas Mermaid mostram FKs cross-schema com notação correta
- [ ] `docs/AUTH_MAP.md` atualizado: reflete Session unificada, UserPreferences separado, Identity adicionado
- [ ] Timeline de migrations atualizada no ERD
- [ ] Deprecated section removida (AccessLevel e SystemConfig dropados)

---

## Functional Requirements

- **FR-1:** `User` deve conter apenas campos de autenticação e identidade — sem campos de negócio ou preferências
- **FR-2:** Um único model `Session` deve representar sessões autenticadas, com metadados de dispositivo e AAL
- **FR-3:** `VerificationCode` deve usar `identifier` (não `email`) para suportar email e telefone
- **FR-4:** Todas as 58 tabelas devem usar snake_case no banco via `@@map()`
- **FR-5:** O schema PostgreSQL `auth` deve conter exclusivamente tabelas de autenticação e identidade
- **FR-6:** FKs cross-schema devem funcionar corretamente no PostgreSQL e Prisma
- **FR-7:** Nenhuma API pública deve quebrar — todas as mudanças são transparentes ao frontend
- **FR-8:** `prisma validate` deve passar em 100% das stories
- **FR-9:** `tsc --noEmit` deve passar em 100% das stories

---

## Non-Goals

- **Não implementar** o fluxo completo de OAuth social login (Google/GitHub) — apenas criar a tabela `identities`
- **Não migrar** para Supabase Auth (GoTrue) — Quayer mantém seu auth custom
- **Não alterar** nenhuma API pública, endpoints, ou contratos de resposta
- **Não mudar** lógica de negócio — só estrutura de dados e organização
- **Não criar** interfaces de usuário novas
- **Não tocar** no `auth.*` schema do Supabase (GoTrue) — ele é gerenciado pelo Supabase

---

## Technical Considerations

### Ordem de execução obrigatória
As stories devem ser executadas nesta ordem para evitar conflitos de migração:

```
Fase 1 — Limpeza (sem mover schemas):
  US-001 → US-002 → US-003 → US-004 → US-005 → US-006 → US-007 → US-012

Fase 2 — Separação de schemas:
  US-008 → US-009 → US-010 → US-011

Fase 3 — Documentação:
  US-013
```

### Migrations manuais (sem prisma migrate dev)
Supabase não suporta `prisma migrate dev` com shadow DB. Usar o padrão atual do projeto:
1. Criar arquivo em `prisma/migrations/YYYYMMDDHHMMSS_nome/migration.sql`
2. Escrever SQL manualmente
3. Executar via Supabase MCP ou `psql`

### multiSchema no Prisma
- Requer Prisma `previewFeatures = ["multiSchema"]`
- Cada model precisa de `@@schema("nome")`
- Prisma valida FKs cross-schema em tempo de geração
- Supabase suporta múltiplos schemas no mesmo projeto

### Risco de FKs cross-schema
PostgreSQL permite FKs entre schemas. Exemplo: `messaging.chat_sessions.assigned_agent_id → auth.users.id`. Validar que Supabase não restringe isso por RLS ou configuração.

### Busca de código afetado
Antes de cada US, rodar:
```bash
grep -r "resetToken\|resetTokenExpiry" src/
grep -r "lastOrganizationId" src/
grep -r "DeviceSession\|deviceSessions" src/
grep -r "\.email" src/server/features/auth/ # para VerificationCode.email
```

---

## Success Metrics

- `User` model reduzido de ~30 campos para ~15 campos de auth puro
- Zero tabelas no schema `public` após Fase 2 (todas migradas para schemas por domínio)
- 100% das tabelas com snake_case no banco
- `tsc --noEmit` passa sem erros
- Nenhum endpoint de API quebra (verificar via smoke tests)
- `prisma validate` passa

---

## Open Questions

1. Supabase tem alguma restrição em criar schemas customizados além de `public` e `auth`? (verificar no dashboard)
2. O RLS (Row Level Security) do Supabase afeta schemas customizados da mesma forma que o `public`?
3. `Session.token` atual é um JWT completo ou só um ID? — impacta como salvar na tabela unificada
4. Existe alguma integração externa (webhook, N8n) que acessa diretamente o DB e pode quebrar com rename de tabelas?
