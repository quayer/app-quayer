# Skill: Features / Logs

## Responsabilidade
Listagem, estatisticas, analise por IA e ingestao manual de log entries.
Acesso restrito a usuarios com `role === 'admin'`.
Nao confundir com `logs-sse.controller.ts` — streaming SSE e separado.

## Actions (endpoints)

| Action | Method | Path | File |
|---|---|---|---|
| `list` | GET | `/api/v1/logs/` | `query.routes.ts` |
| `stats` | GET | `/api/v1/logs/stats` | `query.routes.ts` |
| `sources` | GET | `/api/v1/logs/sources` | `query.routes.ts` |
| `analyze` | POST | `/api/v1/logs/analyze` | `analysis.routes.ts` |
| `analyzeError` | POST | `/api/v1/logs/analyze/:id` | `analysis.routes.ts` |
| `recentAnalyses` | GET | `/api/v1/logs/analyses` | `analysis.routes.ts` |
| `create` | POST | `/api/v1/logs/` | `ingest.routes.ts` |

## Arquivos do subdominio

- `logs.controller.ts` — composer (~25 LoC, so agrega as routes)
- `query.routes.ts` — `list`, `stats`, `sources` (queries GET)
- `analysis.routes.ts` — `analyze`, `analyzeError`, `recentAnalyses` (mutations POST + query GET)
- `ingest.routes.ts` — `create` (mutation POST)
- `logs-sse.controller.ts` — NAO MEXER — streaming SSE independente
- `logs.skill.md` — este arquivo

## Servicos consumidos

| Servico | Usado em |
|---|---|
| `loggerService` (`@/lib/logs/logger.service`) | `query.routes.ts` (list, stats), `ingest.routes.ts` (create) |
| `aiLogAnalyzer` (`@/lib/logs/ai-analyzer.service`) | `analysis.routes.ts` (analyze, analyzeError, recentAnalyses) |

## Procedures aplicadas

| Procedure | Onde |
|---|---|
| `authProcedure({ required: true })` | todas as actions |

Alem da procedure, todas as actions verificam `user.role !== 'admin'` e retornam `response.forbidden` se nao for admin.

## Contrato de resposta (envelope Igniter)

```ts
// GET /logs/
{ data: LogEntry[] }

// GET /logs/stats
{ data: LogStats }

// GET /logs/sources
{ data: string[] }

// POST /logs/analyze
{ data: AnalysisResult }

// POST /logs/analyze/:id
{ data: ErrorAnalysis }

// GET /logs/analyses
{ data: Analysis[] }

// POST /logs/
{ data: LogEntry }

// Erros
{ error: string }  // 401 (sem auth) | 403 (nao admin) | 404 (analyzeError: id nao encontrado)
```

## Como mexer

1. Ler este arquivo + o route file do endpoint alvo.
2. Adicionar endpoint: criar novo `*.routes.ts` ou expandir existente, depois adicionar `...newRoutes` no composer.
3. NAO alterar `name: 'logs'` ou `path: '/logs'` do controller (contrato com frontend).
4. NAO tocar em `logs-sse.controller.ts` ou no `index.ts` da pasta `logs/`.
5. Rodar `npx tsc --noEmit` apos qualquer mudanca.
