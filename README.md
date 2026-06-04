# Quayer App

> Plataforma SaaS Builder IA para criar agentes WhatsApp — produto principal Orayon.

## Status
🟢 **Ativo** — em produção em `app.quayer.com`. Último commit 2026-05-13.

## Propósito
Builder IA visual onde clientes criam, treinam e fazem deploy de agentes WhatsApp.
Operações via Claude Code + SQL/MCP (sem admin UI separada).

## Stack
- Next.js 15 + TypeScript + Igniter.js
- Prisma + PostgreSQL
- AI SDK (Anthropic + OpenAI)
- Fumadocs MDX (docs)
- Vitest + Playwright (tests)
- Docker + Husky

## Como rodar
```bash
cp .env.example .env  # configurar DB, API keys
pnpm install
pnpm db:migrate && pnpm db:seed
pnpm dev  # porta 3000
```

Docker dev: `docker compose -f compose.yml up`
Docker homol: `compose.homol.yml`

## Estrutura
- `src/app/` — Next.js App Router
- `src/server/` — controllers Igniter (core/, ai-module/, communication/, features-module/)
- `src/igniter.router.ts` — registro de controllers
- `prisma/schema.prisma` — schema completo
- `.claude/skills/` — skills por módulo (auth, design, infra, quayer-builder, testing-pipeline)
- `CLAUDE.md` (13KB) — **LER PRIMEIRO** — guia detalhado pra sessões Claude Code

## Git
✅ Ativo. Último commit: `fix(voice): pass credentials to /api/transcribe + blue recording button`

## Relacionado
- `quayer-n8n/` — workflows N8N do runtime de execução de agentes
- `quayer-draw/` — app standalone de quadros visuais
- Vault: `Obsidian Vault/🚀 Quayer/`
