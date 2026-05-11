# tasks/

Pasta de planejamento de produto/engenharia do Quayer.

## Estrutura

| Arquivo | Função |
|---|---|
| [BACKLOG.md](BACKLOG.md) | **Lista viva de pendências reais.** Itens curtos, sem narrativa. Granularidade "resolvido sim/não" |
| `prd-*.md` (raiz) | PRD ativo — criado **só** quando trabalho exige design upfront >1 dia útil. **Hoje: nenhum.** |
| `archive/*-DONE.md` | PRD entregue em prod (referência histórica) |
| `archive/*-SUPERSEDED.md` | PRD substituído por trabalho posterior (plano original não executado) |
| `archive/*-LEGACY.md` | PRD bloated que virou inútil como tracker (referência histórica; source-of-truth migrou para skill + código) |
| `archive/*.md` sem sufixo | Legados pré-convenção. Não mexer |

## Estado atual (10/Mai/2026)

**Zero PRDs ativos.** Pendências vivem em `BACKLOG.md`. Para o Builder (produto principal), source-of-truth é:

- Backend: `src/server/ai-module/builder/**` + skill `.claude/skills/quayer-builder.md`
- Frontend: `src/client/components/projetos/**`
- Tokens DS v3: `src/app/globals.css`
- Logo: `src/client/components/ds/logo.tsx`

## Arquivados

**Done (entregue em prod):**
- [prd-01-testing-pipeline-DONE.md](archive/prd-01-testing-pipeline-DONE.md) — pipeline 5 camadas
- [prd-03-auth-rebrand-v3-DONE.md](archive/prd-03-auth-rebrand-v3-DONE.md) — DS v3 em `(auth)/*`
- [prd-auth-releases-index-DONE.md](archive/prd-auth-releases-index-DONE.md) — índice das 3 releases de auth
- [prd-schema-auth-critique-DONE.md](archive/prd-schema-auth-critique-DONE.md) — 16 problemas de schema corrigidos

**Superseded:**
- [prd-02-auth-cleanup-SUPERSEDED.md](archive/prd-02-auth-cleanup-SUPERSEDED.md) — substituído pelo deep cleanup multi-agent (`9a633e1`)

**Legacy (bloated, source-of-truth migrou):**
- [prd-quayer-builder-LEGACY.md](archive/prd-quayer-builder-LEGACY.md) — 1425 linhas, 485 ACs órfãos. Source-of-truth do Builder hoje vive em skill + código + BACKLOG

**Pré-convenção (não mexer):**
- `archive/prd-auth-test-pipeline-OLD.md`
- `archive/prd-master-architecture.md`
- `archive/prd-quayer-stack-evolution.md`
- `archive/prd-repo-cleanup-test-automation.md`

## Como adicionar trabalho

1. **Item simples** (resolvido em <1 dia útil) → adicionar em `BACKLOG.md` na prioridade certa.
2. **Trabalho grande** (design upfront, multi-fase) → criar `prd-XX-nome.md` curto na raiz com:
   ```markdown
   # PRD: Título
   > Versão 1.0 | Data YYYY-MM-DD | Status: Draft|In progress|Done
   > Fontes vivas: paths reais em src/ ou docs/ (não HTML estático, não pasta paralela)
   ```
   E linkar de `BACKLOG.md`.
3. Ao encerrar, mover para `archive/` com sufixo correto e atualizar este README.

## Anti-padrões aprendidos (Abr/Mai 2026)

1. **Não criar pasta `specs/`** paralela a `tasks/` — refs quebram quando a pasta é deletada.
2. **Não apontar para HTML estático** (`quayer-ds-v3.html`) — tokens devem viver em código.
3. **PRD que descreve "estado a alcançar"** com >500 linhas envelhece em semanas. Preferir PRDs curtos por entregável.
4. **Plano de medição longa janela (14d+)** raramente sobrevive ao multi-agent audit. Para cleanup, audit direto + revisão humana é mais barato.
5. **Não usar PRD como tracker de ACs** — granularidade `[ ]`/`[x]` em centenas de itens vira ruído. Tracker fica em BACKLOG ou TodoWrite por sessão.
