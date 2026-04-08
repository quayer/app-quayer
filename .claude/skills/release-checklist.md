# Skill: Release Checklist & Rollback Gate

## Propósito
Carregar esta skill SEMPRE antes de qualquer release, deploy em produção, merge para `main` com efeito em prod, ou quando for necessário acionar rollback.

---

## Checklist pré-release (obrigatório)

Nenhum item abaixo é pulável. Cada checkbox DEVE ser marcado com evidência concreta antes do deploy. Se algum item falhar, o deploy é ABORTADO — sem exceções.

### Código e testes
- [ ] `npm run test:all` verde localmente
- [ ] CI verde no PR (jobs `static`, `test:api`, `test:e2e`)
- [ ] `tsc --noEmit` / typecheck com zero warnings
- [ ] Zero tipos `any` introduzidos no diff (buscar `: any` e `as any` no PR)
- [ ] Nenhum `console.log`, `console.debug` ou `debugger` esquecido em código de produção
- [ ] Migrations Prisma revisadas e idempotentes (sem `--accept-data-loss`)

### Baselines
- [ ] Métricas comparadas contra `docs/auth/BASELINES.md` — p95 não degradou mais de **20%**
- [ ] Error rate não aumentou vs snapshot anterior (comparar mesma janela de 24h)
- [ ] Conversion metrics (login success, signup completion) inalteradas ou melhores, quando houver dados estatisticamente significativos
- [ ] Snapshot do estado atual salvo ANTES do deploy para possibilitar comparação pós-deploy

### Rollback
- [ ] `docs/infra/ROLLBACK_RUNBOOK.md` lido integralmente antes do deploy (não apenas o índice)
- [ ] Cenário de rollback aplicável identificado entre **3A–3J** e anotado no PR
- [ ] Comando exato de rollback copiado para um arquivo local `ROLLBACK_NOW.sh` (este arquivo DEVE estar em `.gitignore` e nunca ser commitado)
- [ ] Responsável de plantão identificado por nome antes do deploy — sem nome, sem deploy
- [ ] Último commit estável (`hash-anterior`) anotado explicitamente no PR para uso imediato

### Revisão humana
- [ ] PR revisado por pelo menos **1 humano** — revisão exclusivamente por LLM NÃO conta
- [ ] Checklist de segurança revisado obrigatoriamente se o diff tocar em:
  - `src/middleware.ts`
  - Qualquer arquivo em `src/server/core/auth/`
  - Endpoints de admin (`src/app/admin/**`, `src/server/**/*admin*`)
  - Schemas Prisma de `User`, `Session`, `Organization`, `Permission`

### Comunicação
- [ ] Changelog atualizado em `CHANGELOG.md` ou `docs/CHANGELOG.md` com entry da release
- [ ] Aviso no canal de deploy (Discord/Slack) publicado ANTES do merge
- [ ] Horário de deploy dentro de janela acordada — proibido deploy após sexta 16h ou em véspera de feriado
- [ ] Janela de monitoramento ativo de pelo menos 30min após deploy garantida na agenda do responsável

---

## Gate de rollback

Os critérios abaixo são **objetivos**. Qualquer um deles, isoladamente, dispara rollback IMEDIATO — sem discussão, sem "vamos esperar mais 5 minutos".

| # | Critério | Limite |
|---|---|---|
| 1 | Taxa de erro HTTP 5xx | > **2%** por 5 minutos consecutivos |
| 2 | p95 de TTFB em `/login` ou `/signup` | degradação > **50%** vs baseline |
| 3 | Synthetic monitor `/api/v1/health` | falhando **3 runs consecutivos** |
| 4 | Qualquer report de perda de dados de usuário | **1 ocorrência confirmada** |
| 5 | Travamento de sessão em massa (usuários não conseguem logar) | > **5 reports em 10 min** |

**Responsável pelo trigger:** **Gabriel (solo founder)** enquanto não houver time on-call formal. Não delegar para LLM.

**Comando de execução:**
```bash
./scripts/deploy.sh prod <hash-anterior>
```
Ver `docs/infra/ROLLBACK_RUNBOOK.md` cenário **3A** (Code Deploy Quebrado). Para falhas específicas, usar cenário correspondente:
- Container quebrado → **3B**
- Env var errada → **3C**
- Banco corrompido → **3D**
- Migration Prisma quebrou schema → **3J**

Após disparar rollback, o post-mortem abaixo é **obrigatório** dentro de 24h.

---

## Template de post-mortem

Copiar integralmente o bloco abaixo para `docs/incidents/YYYY-MM-DD-titulo.md` e preencher todos os `[fill]`.

```markdown
# Post-mortem: [data] — [título curto]

## Timeline
- [HH:MM UTC] Deploy iniciado (commit `[hash]`)
- [HH:MM UTC] Primeira anomalia detectada (qual métrica, qual valor)
- [HH:MM UTC] Decisão de rollback
- [HH:MM UTC] Rollback concluído (commit `[hash-anterior]`)
- [HH:MM UTC] Métricas normalizadas

## O que deu errado
[fill: causa raiz, 1-2 parágrafos]

## Impacto
- Duração: [X minutos]
- Usuários afetados: [número estimado ou "indeterminado"]
- Dados perdidos: [sim/não]

## O que funcionou
[fill]

## O que não funcionou
[fill]

## Ações corretivas
- [ ] [ação 1 com responsável e prazo]
- [ ] [ação 2]

## Links
- PR: [url]
- Rollback commit: [url]
- Alertas: [urls]
```

---

## Referências cruzadas

- `docs/infra/ROLLBACK_RUNBOOK.md` — runbooks detalhados dos cenários 3A–3J, comandos exatos, SLA 15min
- `docs/auth/BASELINES.md` — baselines de produção v1 (p95, error rate, conversion)
- `docs/infra/SYNTHETIC_MONITORING.md` — configuração dos monitors externos e alertas
- `.claude/skills/testing-pipeline.md` — skill complementar de estratégia de testes
- `tasks/prd-01-testing-pipeline.md` — PRD do pipeline de testes (Story US-114 origina esta skill)

---

## Regra final

Se você (Claude Code ou humano) está lendo esta skill e considerando pular um item "porque é rápido" ou "porque é só um hotfix": **PARE**. Hotfixes são exatamente onde rollbacks nascem. O checklist existe porque a memória falha sob pressão. Cumpra o checklist inteiro ou não faça o deploy.
