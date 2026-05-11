# Massa de Teste — Convenções e Disciplina

> Resposta direta à pergunta "precisa massa para testes?": **sim**, mas a forma muda por camada. Este doc é o contrato.

Última atualização: 2026-05-10.

---

## 1. Três níveis de massa, três estratégias

| Nível | Quem usa | Persistência | Onde fica | Quem cria |
|---|---|---|---|---|
| **Inline (mocks)** | C2/C3 Vitest | nenhuma — vive no escopo do `it()` | dentro do próprio teste | autor do teste |
| **Seed compartilhada** | C4 Integration (Postgres test container) | sobrevive entre suites, idempotente | [prisma/seeds/test/auth-seed.ts](../../prisma/seeds/test/auth-seed.ts) | `npm run test:db:up` (executa o seed) |
| **Ephemeral via factory** | C4 + qualquer teste que precisa de variação | rollback ao final do teste | [test/factories/](../../test/factories/) | autor do teste no `withTransaction` |
| **Canary persistente** | Synthetic monitor (homol/prod) | sobrevive sempre | conta real `canary@quayer.com` | provisionado manualmente UMA vez |

Regra: **prefira factory + withTransaction**. Seed compartilhada é só para identidades que múltiplos testes precisam ler (login do user "confirmed", por exemplo). Massa explícita dentro do teste é sempre mais legível que partilhar referências em arquivos externos.

---

## 2. Inline (C2/C3)

Já cobre 100% do que precisa. Padrão:

```typescript
const mockUser = {
  id: 'user-123',
  email: 'test@quayer.com',
  role: 'user',
  currentOrgId: 'org-456',
  onboardingCompleted: true,
  isActive: true,
}
```

Nunca importe de outro lugar. Cada teste reescreve. Acoplamento é o inimigo.

---

## 3. Seed compartilhada (C4)

Arquivo: [prisma/seeds/test/auth-seed.ts](../../prisma/seeds/test/auth-seed.ts). Roster atual:

| Email | Senha | Papel | Estado | Quando usar |
|---|---|---|---|---|
| `confirmed@test.local` | bcrypt placeholder | master @ test-org | emailVerified, onboarding done | Login flows que assumem usuário "feliz" |
| `pending@test.local` | nenhuma | nenhum org ainda | emailVerified=null | Signup flows mid-stream |
| `twofa@test.local` | nenhuma | manager @ test-org | twoFactorEnabled=true | 2FA challenge tests (criar TotpDevice via factory) |
| `admin@test.local` | bcrypt placeholder | role='admin' system-wide | confirmed | Admin endpoints, security tests |
| `multiorg@test.local` | nenhuma | user @ test-org + master @ test-org-secondary | confirmed | Switch-organization tests |

Orgs:
- `test-org` — slug `test-org`, type pj
- `test-org-secondary` — slug `test-org-secondary`, type pj

Convenções:
- **Sempre** email `@test.local` — filtro de produção: `email NOT LIKE '%@test.local'`
- Idempotente via `upsert` — `npm run test:db:up` pode rodar 100×
- Nunca mude um row aqui sem atualizar a tabela acima

---

## 4. Ephemeral via factory (preferida para C4)

Arquivo: [test/factories/index.ts](../../test/factories/index.ts). Padrão completo:

```typescript
import {
  makeUser,
  makeUserWith2FA,
  makeAdminUser,
  makeOrganization,
  addUserToOrg,
  makeUserInOrg,
  withTransaction,
} from 'test/factories'

it('switch-organization rotates refresh token', async () => {
  await withTransaction(async (tx) => {
    const { user, org } = await makeUserInOrg(tx, makeUser)
    const otherOrg = await makeOrganization(tx)
    await addUserToOrg(tx, user, otherOrg, { role: 'manager' })

    // ... exercite o endpoint ...

    // Ao retornar, tudo é rolled back. Próximo teste vê DB limpo.
  })
})
```

Variantes:

| Factory | O que retorna |
|---|---|
| `makeUser()` | User verificado, sem org, sem senha (passwordless padrão) |
| `makePendingUser()` | emailVerified=null, onboarding=false |
| `makeUserWith2FA()` | twoFactorEnabled=true (caller cria TotpDevice se precisar) |
| `makeUserWithPassword()` | Com hash bcrypt placeholder |
| `makeAdminUser()` | role='admin' |
| `makeUserWithPhone()` | phone+phoneVerified setados |
| `makeOrganization()` | Org pj/free com defaults |
| `addUserToOrg(tx, user, org)` | Cria UserOrganization; se user.currentOrgId vazio, seta |
| `makeUserInOrg(tx, makeFn)` | Atalho: cria user + org + membership de uma vez |

Por que NÃO usar `faker`?
- Determinismo. Bug que aparece com `name="Antônio Üzbék"` deve aparecer todo run.
- Zero dep extra. Factories produzem dados previsíveis com sequencer `nextSeq()`.

---

## 5. Canary persistente (homol/prod)

Para o synthetic monitor (ver [SYNTHETIC_MONITORING.md](SYNTHETIC_MONITORING.md)) você precisa de:

| Identidade | Quem cria | Onde |
|---|---|---|
| User `canary@quayer.com` | provisionado manual 1 vez | DB de prod (após migração de `isCanary`) |
| Org `canary-org` | igual | DB de prod |
| Phone `+5511CANARY` | número WhatsApp dedicado | chip pré-pago ou virtual (Twilio) |
| Instância uazapi canary | uma vez via dashboard uazapi | dedicada ao monitor |

### Risco: poluir analytics e billing

Sem marcação, o canary entra em:
- AuditLog (cada login fica registrado)
- Dashboards de analytics (NPS, retenção, MAU)
- Billing aggregations (se cobrar por sessão/mensagem)
- Funil de signup

### Solução proposta: flag `isCanary` (PENDENTE DE APROVAÇÃO)

Adicionar campo no schema (requer migração — **não execute sem aprovação**):

```prisma
model User {
  // ... campos existentes ...
  isCanary  Boolean  @default(false)
}
```

Todos os queries de analytics/billing/audit passam a filtrar `WHERE isCanary = false`. O canary user/org são marcados `isCanary = true` no provisionamento.

**Alternativa sem migração:** filtrar por email regex `^canary@quayer\.com$` em todos os agregadores. Mais frágil — alguém esquece o filtro em um relatório novo.

Recomendação: criar a migração quando houver janela.

---

## 6. Comandos

```bash
# Subir DB de teste (Postgres container porta 5433) + rodar migrations + seed
npm run test:db:up

# Rodar só o seed (sem subir DB)
TEST_DATABASE_URL=postgresql://... npx tsx prisma/seeds/test/auth-seed.ts

# Derrubar DB de teste
npm run test:db:down
```

---

## 7. Anti-padrões (não fazer)

| ❌ Anti-padrão | ✅ Padrão |
|---|---|
| Compartilhar User entre tests via `beforeAll` global | Cada teste cria seu user via factory |
| `truncate users` entre testes | `withTransaction` + rollback |
| Hard-coded UUIDs em testes (`'user-123'` reusado) | UUID gerado pela factory ou `crypto.randomUUID()` |
| Email igual entre runs (`test@test.com` em todos) | `user-${seq}-${Date.now()}@test.local` |
| Seed com 100 usuários "por garantia" | Seed com identidades nomeadas, factory para o resto |
| Faker com `seed` global | Sequencer local + valores explícitos |
| `mock the prisma client` em C4 | C4 usa Postgres real (porta 5433) |
| Canary user sem flag isCanary | Sempre marcar para excluir de analytics |

---

## 8. Próximos passos sugeridos

1. Migração `isCanary` (½ dia + aprovação) — requisito para canary em prod
2. Factory `makeMessageTemplate`, `makeCampaign`, `makeWhatsAppInstance` quando começar testes de communication/ (réplica do padrão deste doc)
3. Helper `createTotpDevice(tx, user, options)` em [test/factories/2fa.factory.ts] para fechar gap J7
4. Helper `createPasskeyCredential(tx, user)` para fechar gap J15/J16
