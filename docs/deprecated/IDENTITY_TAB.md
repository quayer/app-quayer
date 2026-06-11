---
Criado: 2026-06-11
Atualizado: 2026-06-11
Revisar em: quando a Jornada Builder v2 sair de rollout (flag BUILDER_JOURNEY_V2 = on em prod)
Relacionados:
  - specs/jornada-builder-v2/tasks.md
  - specs/jornada-builder-v2/plan.md
  - docs/deprecated/ADMIN_SURFACE_REMOVED.md
  - CLAUDE.md
---

# IdentityTab — superfície duplicada removida (Jornada Builder v2, Jun/2026)

## O que era

`src/client/components/projetos/preview/tabs/identity/identity-tab.tsx` — um
componente React que editava o **Card de Identidade & Comportamento** do agente:
objetivo, nome (`displayName`), persona, tom, uso de emojis e o **disclosure**
(como o agente se apresenta: 🤖 assume que é IA / 👤 se passa por humano — com
disclaimer legal LGPD/CDC/WhatsApp ToS e aceite obrigatório / ✎ personalizado).
Tinha autosave próprio com debounce de 800ms via `PATCH /builder/identity/:id` e
flush no unmount com `keepalive`.

Não era uma tab própria do tab-registry: estava **embedada no topo da aba
Prompt** (`preview/tabs/prompt/prompt-tab.tsx`) como "Section 0", separada do
editor de prompt por um divisor. Salvar ali reescrevia automaticamente o bloco
`# Identidade` das instruções do agente.

## Por que saiu (FR-21)

A Jornada Builder v2 ("Configure por exceção") consolidou a captura de
identidade em UMA superfície conversacional, eliminando a duplicação de onde o
usuário edita persona/disclosure:

- **persona, serviços e horários** passaram a viver no card composto
  `agent_review` (T24) — a UI em
  `src/client/components/projetos/chat/cards/agent-review-card.tsx` + seções
  extraídas em `chat/cards/review/{persona,services,hours}-section.tsx`.
- **o disclosure** (o único campo não-duplicado da antiga IdentityTab) foi
  migrado VERBATIM para a seção avançada do `agent_review`:
  `chat/cards/review/disclosure-section.tsx`. Ele é submetido no MESMO POST do
  card `agent_review` (handler em
  `src/server/ai-module/builder/cards/handlers/apply/journey-v2.ts`), que aplica
  o disclosure sobre `BuilderProject.metadata.identityCard` via
  `normalizeIdentityCard` + `mergeIdentityCardIntoMetadata` de
  `@/lib/agent-identity-card` — sem um segundo request ao PATCH identity.
- **a injeção no prompt** passou a acontecer mais cedo: `create_agent` (T25)
  aplica `injectDisclosureIntoPrompt(metadata.identityCard)` ao materializar o
  systemPrompt. No v2 o disclosure é decidido ANTES de o agente existir, então a
  injeção não depende mais do `if (project.aiAgentId)` que vivia só em
  `identity.routes.ts`.

Manter a IdentityTab embedada no Prompt significaria DUAS superfícies paralelas
editando o mesmo `identityCard` — exatamente o que a v2 quer unificar (FR-19:
reduzir abas; FR-09: nenhuma re-decisão paralela).

## O endpoint PATCH PERMANECE

`PATCH /api/v1/builder/identity/:projectId`
(`src/server/ai-module/builder/identity/`) **NÃO foi removido** — segue ativo
para edição pós-criação do `identityCard`. Apenas o componente cliente que o
consumia (`identity-tab.tsx`) deixou de existir. Restaurar a IdentityTab no
futuro não exige tocar no backend.

## Arquivos alterados nesta remoção (T56)

- **DELETADO**: `src/client/components/projetos/preview/tabs/identity/identity-tab.tsx`.
- **EDITADO**: `src/client/components/projetos/preview/tabs/prompt/prompt-tab.tsx`
  — removido o `import { IdentityTab }` e o bloco `<IdentityTab project={project} />`
  (a "Section 0") com o divisor que o separava do header do Prompt.

## Como ressuscitar (via git)

```bash
# recuperar o componente da última revisão que o tinha
git log --oneline -- src/client/components/projetos/preview/tabs/identity/identity-tab.tsx
git checkout <hash>^ -- src/client/components/projetos/preview/tabs/identity/identity-tab.tsx
```

Para re-embedar no Prompt, reinserir o `import` + `<IdentityTab project={project} />`
(com o divisor) no topo do `return` de `prompt-tab.tsx`. O PATCH backend já está
disponível, então o componente volta a funcionar sem nenhuma mudança de servidor.
