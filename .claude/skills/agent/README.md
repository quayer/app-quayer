---
Criado: 2026-05-12
Atualizado: 2026-05-12
Revisar em: a cada vertical nova adicionada
Relacionados:
  - src/server/ai-module/ai-agents/services/skill-registry.service.ts
  - src/server/ai-module/ai-agents/services/skill-activator.service.ts
---

# Skills do Agente Publicado

Skills dormentes carregadas via `skill-registry.service.ts` no boot do runtime e ativadas em cada turno via `skill-activator.service.ts`. Quando triggers batem, o content do skill eh anexado ao system prompt como `## Skills ativas`.

## Como funciona

1. **Boot**: `loadSkillsFromDirectory('.claude/skills/agent')` le todos os `.md` deste diretorio
2. **Cache**: skills ficam em memoria do processo (cache invalidado em restart)
3. **Por turno**: `activateSkills(allSkills, { messageContent, session })` filtra os aplicaveis
4. **Injecao**: `renderActiveSkills(active)` produz markdown que vai no fim do system prompt

## Formato do arquivo

```yaml
---
name: nome-do-skill          # obrigatorio, slug unico
description: O que faz       # obrigatorio
triggers:                    # opcional - se ausente, skill eh "default loaded"
  keywords: [a, b, c]        # case-insensitive substring match no messageContent
  journeyStages: [qualified] # exact match com session.journeyStage
  customerJourney: [vip]     # exact match com session.customerJourney
alwaysActive: false          # se true, sempre injetado (ignora triggers)
---

## Conteudo markdown

Texto que vira o addendum do system prompt quando ativado.
```

## Skills inclusos

| Skill | Triggers | Quando ativa |
|---|---|---|
| `preco.md` | preco, valor, parcelamento, desconto | Cliente pergunta sobre custo |
| `agendamento.md` | agendar, horario, marcar, remarcar | Coleta estruturada de agendamento |
| `reclamacao.md` | reclamar, problema, ruim, decepcionado, procon | Caso sensivel — empatia + escalar |
| `horario-comercial.md` | horario, aberto, fecha, funciona | Duvida operacional simples |

## Adicionando nova skill

1. Criar `.claude/skills/agent/nome-vertical.md` com frontmatter
2. Restart do runtime (ou implementar hot-reload futuro)
3. Skill aparece automaticamente apos restart — sem deploy de codigo

## Regra: keep prompts surgicos

- Cada skill ~150 palavras max
- Foco em UMA situacao (nao tente cobrir 5 verticais num skill)
- Limites duros sempre em secao final
- Prefira escalar via `transfer_to_human` em vez de inventar respostas

## Roadmap

- Hot-reload sem restart (file watcher)
- Skills por organization (multi-tenant)
- Skills com prioridade (qual injeta primeiro se 3 ativos)
- A/B test de skills (ver qual converte mais)
