# Skill: Doc Freshness & Cascade Updates

## Propósito
Carregar esta skill SEMPRE que for criar, editar ou deletar qualquer arquivo `.md` no projeto, e ao final de cada sessão. Garante que documentação não fique desatualizada e que mudanças em código propaguem para docs relacionadas.

Regra de ouro: **se você conversou sobre algo, atualize o que se conecta**. Contexto desatualizado é pior que ausência de contexto.

---

## 1. Frontmatter obrigatório em TODO `.md` novo

Sem exceção. Todo `.md` criado a partir de hoje (2026-05-10) DEVE começar com:

```yaml
---
Criado: 2026-05-10
Atualizado: 2026-05-10
Revisar em: 2026-08-10   # ou: "quando <trigger explícito>"
Relacionados:
  - docs/AUTH_MAP.md
  - src/middleware.ts
---
```

| Campo | Formato | Regra |
|---|---|---|
| `Criado` | `YYYY-MM-DD` | Data de criação. Nunca muda. |
| `Atualizado` | `YYYY-MM-DD` | Data da última mudança de conteúdo significativa (não typo). |
| `Revisar em` | `YYYY-MM-DD` ou `quando <trigger>` | Ver tabela seção 3. |
| `Relacionados` | Lista de paths relativos da raiz | Arquivos que devem ser revisados quando este mudar. Mínimo 1. |

---

## 2. Quando atualizar `Atualizado:`

| Mudança | Atualiza? |
|---|---|
| Typo, formatação, link quebrado | NÃO |
| Adicionou seção, mudou exemplo, removeu conteúdo | SIM |
| Mudou conclusão/recomendação/comando | SIM (e considere bump em `Revisar em`) |
| Renomeou arquivo/path referenciado | SIM |

---

## 3. Como definir `Revisar em:`

| Tipo de doc | Padrão | Exemplos |
|---|---|---|
| Produto / estratégia / business model | **+6 meses** | `QUAYER_BUSINESS_STRATEGY.md`, `MEMORY.md`, posicionamento |
| Arquitetura / decisão técnica / ADR | **+3 meses** | `AUTH_MAP.md`, `ERD.md`, decisões de stack |
| Processo / runbook / how-to | **+1 mês** | `ROLLBACK_RUNBOOK.md`, `HOMOL_SETUP.md`, deploy guides |
| Baseline / métrica / SLA | **+2 semanas** | `BASELINES.md`, snapshots de performance |
| Esperando evento externo | `quando <trigger>` | "quando subir Igniter 1.0", "quando admin UI voltar", "após primeira venda", "quando >100 users em prod" |

Quando usar trigger explícito, escreva o evento de forma testável. Ruim: `quando precisar`. Bom: `quando criarmos rota /admin/dashboard`.

---

## 4. Cascade Rules (CRÍTICO)

Quando mudar o arquivo da coluna esquerda, OBRIGATORIAMENTE abra e considere revisar os da direita no MESMO commit (ou commit imediatamente seguinte com referência explícita).

| Mudou | Revisar |
|---|---|
| `src/middleware.ts` | `docs/AUTH_MAP.md` + `docs/auth/AUTH_FLOW.md` + `docs/auth/USER_JOURNEY.md` |
| `prisma/schema.prisma` | `docs/ERD.md` + tabela "Modelos Prisma Relevantes" no `CLAUDE.md` |
| `src/igniter.router.ts` | `CLAUDE.md` (estrutura) + `docs/AUTH_MAP.md` |
| `infra/prod/Caddyfile` ou `infra/homol/Caddyfile` | `infra/README.md` + `docs/infra/HOMOL_SETUP.md` + `docs/infra/PROD_SETUP.md` |
| Lógica de redirect em login/signup/OTP | `docs/AUTH_MAP.md` + `docs/auth/USER_JOURNEY.md` + `docs/auth/BASELINES.md` |
| `src/server/core/auth/**` | `docs/AUTH_MAP.md` + `.claude/skills/auth.md` + `docs/auth/AUTH_FLOW.md` |
| Deletou feature/rota/módulo | Criar/atualizar `docs/deprecated/<FEATURE>.md` + remover refs em `CLAUDE.md` |
| `.github/workflows/*.yml` | `docs/testing/CI.md` + `.claude/skills/testing-pipeline.md` |
| `package.json` (scripts) | `CLAUDE.md` tabela de comandos + `.claude/skills/testing-pipeline.md` |
| Skills em `.claude/skills/*.md` | Tabela de roteamento em `CLAUDE.md` |

Se a mudança disparar cascade e você NÃO atualizar o doc relacionado: comentar no PR explicando por que pode esperar, com `Revisar em:` ajustado para próximo ciclo curto (≤ 2 semanas).

---

## 5. Verificação automática (fim de cada sessão)

Antes de encerrar a sessão, Claude Code DEVE executar:

```powershell
# Buscar docs com Revisar em: vencida
Get-ChildItem -Recurse -Filter *.md | Select-String -Pattern "Revisar em:\s*(\d{4}-\d{2}-\d{2})"
```

Comparar cada data com `2026-05-10` (ou data corrente). Para cada doc com data ≤ hoje:

1. Listar para o user: `<path> — venceu em <data> (<N> dias atrás)`
2. Perguntar: "Quer revisar agora, adiar (informe nova data) ou deprecar?"
3. NÃO atualizar `Atualizado:` sem mudança real de conteúdo (não é refresh cosmético).

---

## 6. Docs antigos SEM frontmatter

Política: **não fazer mutirão**. Quando tocar em um doc antigo pela próxima vez:

1. Adicionar frontmatter completo na mesma edição
2. `Criado:` = data do primeiro commit do arquivo (`git log --diff-filter=A --follow --format=%ad --date=short -- <path> | tail -1`)
3. `Atualizado:` = hoje
4. `Revisar em:` = aplicar tabela seção 3
5. `Relacionados:` = mínimo 1 path por inferência do conteúdo

---

## 7. Aprovação obrigatória antes do commit

Alterações nestes arquivos exigem cascade docs ATUALIZADAS no mesmo commit (ou justificativa explícita):

- `CLAUDE.md`
- `src/middleware.ts`
- `prisma/schema.prisma` (qualquer migration)
- `src/igniter.router.ts`
- `.claude/skills/*.md` (quando muda comportamento de roteamento)

Workflow: editar → rodar cascade da seção 4 → atualizar `Atualizado:` nos docs afetados → commitar tudo junto.

---

## 8. Anti-padrões

| NÃO faça | Faça |
|---|---|
| Criar `.md` sem frontmatter "pra agilizar" | Sempre frontmatter, mesmo em rascunho |
| `Revisar em: quando precisar` | Trigger testável ou data concreta |
| Atualizar `Atualizado:` sem mudar conteúdo | Só bump em mudança real |
| Mudar `middleware.ts` e adiar docs "pro próximo PR" | Cascade no mesmo commit |
| Deletar feature sem `docs/deprecated/` | Sempre deixar rastro do que foi removido e por quê |
