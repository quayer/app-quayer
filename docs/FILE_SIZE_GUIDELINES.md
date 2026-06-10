---
Criado: 2026-06-09
Atualizado: 2026-06-09
Revisar em: trimestral ou quando um arquivo de src/ ultrapassar 1500 linhas
Relacionados:
  - CLAUDE.md
  - .claude/skills/doc-freshness.md
---

# Limites de tamanho de arquivo — otimização para desenvolvimento com IA

Arquivos grandes degradam o desenvolvimento assistido por Claude Code: estouram
contexto, encarecem cada edição e aumentam erro de edição. Limites práticos
calibrados pela distribuição real do projeto (auditoria 2026-06-09).

## Limites por categoria

| Categoria | Alvo | Máximo | Ação ao estourar |
|---|---|---|---|
| Componente React | ≤300 | 600 | Extrair sub-componentes/hooks |
| Route file (Igniter) | ≤400 | 600 | Split por verbo/recurso (composer pattern) |
| Service backend | ≤500 | 800 | Extrair stages/helpers puros |
| Hook / util / lib | ≤200 | 400 | Split por responsabilidade |
| Doc .md (exceto handbooks) | ≤500 | 1000 | Split por tópico + índice |

Regra prática: **1 arquivo = 1 responsabilidade**. Se a descrição do arquivo
precisa de "e" ("renderiza o chat E gerencia SSE E faz submit de cards"), split.

## Violações conhecidas (prioridade de refactor)

| Arquivo | Linhas | Plano |
|---|---|---|
| `src/server/ai-module/ai-agents/agent-runtime.service.ts` | ~1888 | Split em ~6: gates (cost cap/activation), model-routing, tool-loop, persistência de decisão, outbound |
| `src/client/components/projetos/chat/chat-panel.tsx` | ~1720 | Split em ~5: stream handler, message list, input, card host, banners |
| `src/app/conta/conta-client.tsx` | ~1707 | 1 arquivo por tab (6 tabs) |
| `src/app/compartilhar/[token]/page.tsx` | ~1165 | Split em 5 seções |

(`create-instance-modal.tsx` ~1102 linhas saiu da lista: stub morto deletado em
2026-06-09 — ver `docs/deprecated/WHATSAPP_LEGACY_UI.md`.)

Precedente: o webhook UAZ foi reduzido de 786 → 208 linhas extraindo stages para
`src/server/communication/webhooks/uazapi/` (verify-request, resolve-connection,
process-inbound, dispatch-ai) — usar como modelo de split.

## Regras para novos arquivos

- Novo componente/serviço já nasce dentro do alvo da categoria.
- Ao editar um arquivo acima do máximo: se a mudança for >30 linhas, extrair a
  parte tocada para um módulo novo em vez de engordar o existente.
- Docs novas seguem `.claude/skills/doc-freshness.md` (frontmatter obrigatório).
